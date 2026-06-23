import crypto from 'node:crypto';
import {
  applyBenchmarkPackEdits,
  cloneJson,
  diffBenchmarkPacks,
  nextBenchmarkVersionNumber,
  normalizeGoldenCaseVisibility,
  normalizeReviewDecision,
  statusForReviewDecision,
  validateBenchmarkPackCandidate,
} from '../src/core/benchmark-lifecycle.js';
import { analyzeBundle } from '../src/core/engine.js';
import {
  aggregateUsageEvents,
  evaluateRunEntitlements,
  estimateRunUsage,
  monthPeriod,
  normalizePlan,
  planDefinition,
} from '../src/core/plans.js';
import { canRole, normalizeOrgRole, rolePermissions } from '../src/core/rbac.js';
import { buildReportSnapshot } from '../src/shared/report-snapshot.js';
import { normalizeTraceBatch, orderTraceEvents } from '../src/core/trace-provenance.js';
import {
  executeVercelAiSdkAdapterBenchmark,
  validateVercelAiSdkAdapterConfig,
} from '../src/adapters/vercel-ai-sdk.js';
import {
  AdapterExecutionError,
  adapterFailureRetryable,
  classifyAdapterError,
  normalizeAdapterDiagnostics,
  sanitizeDebugPayload,
} from '../src/adapters/contract.js';
import {
  adapterConfigForExecutionTarget,
  executionTargetRunnerId,
  executionTargetSafeMetadata,
  normalizeExecutionTarget,
} from '../src/adapters/execution-targets.js';
import { dispatchHostedProvider, executeHostedProviderBenchmark } from '../src/adapters/hosted-provider.js';
import { dispatchLocalHttpTunnelJob, localTunnelRunTokenForNonce } from '../src/adapters/local-http-tunnel.js';
import {
  assertHostedByokEnabled,
  decryptSecretValue,
  encryptSecretValue,
  maskSecretValue,
} from '../src/adapters/secrets.js';
import { ensureSchema, hasPostgresConfig, query } from './_db.js';

const memory = globalThis.__harnessAmpStore ?? {
  users: new Map(),
  organizations: new Map(),
  organizationMembers: new Map(),
  workspaces: new Map(),
  projects: new Map(),
  memberships: new Map(),
  runners: new Map(),
  projectSecrets: new Map(),
  reports: new Map(),
  jobs: new Map(),
  failureWorkflows: new Map(),
  failureRegressionSuites: new Map(),
  benchmarkPacks: new Map(),
  benchmarkVersions: new Map(),
  benchmarkReviews: new Map(),
  benchmarkReviewAssignments: new Map(),
  promotionCandidates: new Map(),
  goldenCases: new Map(),
  events: [],
  traceEvents: new Map(),
  usageEvents: new Map(),
};

const RUNNER_JOB_TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled', 'cancelled']);
const RUNNER_JOB_CLAIMABLE_STATUSES = new Set(['queued', 'retrying']);
const RUNNER_JOB_RECOVERABLE_STATUSES = new Set(['claimed', 'running']);

globalThis.__harnessAmpStore = memory;
memory.benchmarkPacks ??= new Map();
memory.benchmarkVersions ??= new Map();
memory.benchmarkReviews ??= new Map();
memory.benchmarkReviewAssignments ??= new Map();
memory.promotionCandidates ??= new Map();
memory.goldenCases ??= new Map();
memory.projectSecrets ??= new Map();
memory.organizations ??= new Map();
memory.organizationMembers ??= new Map();
memory.usageEvents ??= new Map();
memory.failureWorkflows ??= new Map();
memory.failureRegressionSuites ??= new Map();
memory.traceEvents ??= new Map();

export async function getOrCreateGitHubUser(profile) {
  if (useMemory()) {
    const existing = Array.from(memory.users.values()).find((item) => item.githubId === profile.githubId);
    if (existing) {
      const next = { ...existing, ...profile };
      memory.users.set(next.id, next);
      return next;
    }
    const user = {
      id: createId('user'),
      ...profile,
      createdAt: new Date().toISOString(),
    };
    memory.users.set(user.id, user);
    return user;
  }

  await ensureSchema();
  const existing = await query('select * from users where github_id = $1 limit 1', [profile.githubId]);
  if (existing.rows[0]) {
    const updated = await query(
      `update users
       set login = $2, name = $3, email = $4, avatar_url = $5
       where github_id = $1
       returning *`,
      [profile.githubId, profile.login, profile.name, profile.email, profile.avatarUrl],
    );
    return normalizeUserRow(updated.rows[0]);
  }

  const inserted = await query(
    `insert into users (id, github_id, login, name, email, avatar_url)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [createId('user'), profile.githubId, profile.login, profile.name, profile.email, profile.avatarUrl],
  );
  return normalizeUserRow(inserted.rows[0]);
}

export async function seedDevSession() {
  const user = await getOrCreateGitHubUser({
    githubId: 'dev-user',
    login: 'dev-user',
    name: 'HarnessAmp Dev',
    email: 'dev@harnessamp.local',
    avatarUrl: null,
  });
  const { workspace, project } = await ensureDefaultWorkspaceProject(user);
  return {
    user,
    workspaces: await listWorkspacesForUser(user.id),
    organizations: await listOrganizationsForUser(user.id),
    currentWorkspaceId: workspace.id,
    currentOrganizationId: workspace.organizationId,
    defaultProjectId: project.id,
  };
}

export async function getSessionContext(userId) {
  const user = await getUserById(userId);
  if (!user) return null;

  const workspaces = await listWorkspacesForUser(userId);
  const organizations = await listOrganizationsForUser(userId);
  const currentWorkspaceId = workspaces[0]?.id ?? null;
  const projects = currentWorkspaceId ? await listProjectsForWorkspace(userId, currentWorkspaceId) : [];
  return {
    user,
    workspaces,
    organizations,
    currentWorkspaceId,
    currentOrganizationId: workspaces[0]?.organizationId ?? organizations[0]?.id ?? null,
    defaultProjectId: projects[0]?.id ?? null,
  };
}

export async function getUserById(userId) {
  if (!userId) return null;
  if (useMemory()) {
    return memory.users.get(userId) ?? null;
  }

  await ensureSchema();
  const result = await query('select * from users where id = $1 limit 1', [userId]);
  return result.rows[0] ? normalizeUserRow(result.rows[0]) : null;
}

export async function ensureDefaultWorkspaceProject(user) {
  const existing = await listWorkspacesForUser(user.id);
  if (existing.length) {
    const projects = await listProjectsForWorkspace(user.id, existing[0].id);
    if (projects.length) {
      return { workspace: existing[0], project: projects[0] };
    }
    const project = await createProject(user.id, existing[0].id, 'Primary Project');
    return { workspace: existing[0], project };
  }

  const workspace = await createWorkspace(user.id, `${user.login} Lab`, { plan: 'team' });
  const project = await createProject(user.id, workspace.id, 'Primary Project');
  return { workspace, project };
}

export async function createOrganization(userId, name, options = {}) {
  const workspace = await createWorkspace(userId, name, options);
  return getOrganization({ organizationId: workspace.organizationId, userId });
}

export async function listOrganizationsForUser(userId) {
  if (useMemory()) {
    return Array.from(memory.organizationMembers.values())
      .filter((member) => member.userId === userId && member.status === 'active')
      .map((member) => memory.organizations.get(member.organizationId))
      .filter(Boolean)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((organization) => organizationSummary(organization, organizationMemberForUser(organization.id, userId)));
  }

  await ensureSchema();
  const result = await query(
    `select o.*, om.id as member_id, om.role as member_role, om.status as member_status
     from organizations o
     join organization_members om on om.organization_id = o.id
     where om.user_id = $1 and om.status = 'active'
     order by o.created_at asc`,
    [userId],
  );
  return result.rows.map((row) => organizationSummary(normalizeOrganizationRow(row), {
    id: row.member_id,
    role: row.member_role,
    status: row.member_status,
  }));
}

export async function getOrganization({ organizationId, userId }) {
  const member = await getOrganizationMemberForUser({ organizationId, userId });
  if (!member) return null;
  const organization = await readOrganization(organizationId);
  return organization ? organizationSummary(organization, member) : null;
}

export async function listWorkspacesForUser(userId) {
  if (useMemory()) {
    return Array.from(memory.workspaces.values())
      .filter((workspace) => workspace.ownerUserId === userId || organizationMemberForUser(workspace.organizationId, userId) || workspaceHasMember(workspace.id, userId))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  await ensureSchema();
  const result = await query(
    `select distinct w.*
     from workspaces w
     left join projects p on p.workspace_id = w.id
     left join project_memberships pm on pm.project_id = p.id and pm.user_id = $1
     left join organization_members om on om.organization_id = w.organization_id and om.user_id = $1 and om.status = 'active'
     where w.owner_user_id = $1 or pm.user_id = $1 or om.user_id = $1
     order by w.created_at asc`,
    [userId],
  );
  return result.rows.map(normalizeWorkspaceRow);
}

export async function createWorkspace(userId, name, options = {}) {
  const now = new Date().toISOString();
  if (useMemory()) {
    const organization = createOrganizationRecord({
      name,
      plan: options.plan ?? 'free',
      status: options.status ?? 'active',
      now,
    });
    memory.organizations.set(organization.id, organization);
    memory.organizationMembers.set(`${organization.id}:${userId}`, {
      id: createId('om'),
      organizationId: organization.id,
      userId,
      email: userEmailFor(userId),
      role: 'owner',
      status: 'active',
      invitedAt: null,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const workspace = {
      id: createId('ws'),
      organizationId: organization.id,
      name,
      ownerUserId: userId,
      createdAt: now,
    };
    memory.workspaces.set(workspace.id, workspace);
    return workspace;
  }

  await ensureSchema();
  const orgId = createId('org');
  const orgSlug = await uniqueOrganizationSlug(slugify(name));
  await query(
    `insert into organizations (id, name, slug, plan, status, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $6)`,
    [orgId, name, orgSlug, normalizePlan(options.plan ?? 'free'), options.status ?? 'active', now],
  );
  const user = await getUserById(userId);
  await query(
    `insert into organization_members
       (id, organization_id, user_id, email, role, status, joined_at, created_at, updated_at)
     values ($1, $2, $3, $4, 'owner', 'active', $5, $5, $5)`,
    [createId('om'), orgId, userId, user?.email ?? `${userId}@harnessamp.local`, now],
  );
  const result = await query(
    `insert into workspaces (id, organization_id, name, owner_user_id)
     values ($1, $2, $3, $4)
     returning *`,
    [createId('ws'), orgId, name, userId],
  );
  return normalizeWorkspaceRow(result.rows[0]);
}

export async function listProjectsForWorkspace(userId, workspaceId) {
  if (useMemory()) {
    return Array.from(memory.projects.values())
      .filter((project) => project.workspaceId === workspaceId)
      .map((project) => ({
        ...project,
        role: projectRoleFor(project.id, userId),
        permissions: rolePermissions(projectRoleFor(project.id, userId)),
      }))
      .filter((project) => Boolean(project.role))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  await ensureSchema();
  const result = await query(
    `select p.*, 
            coalesce(om.role, pm.role, case when w.owner_user_id = $1 then 'owner' else null end) as role
     from projects p
     join workspaces w on w.id = p.workspace_id
     left join organization_members om on om.organization_id = coalesce(p.organization_id, w.organization_id) and om.user_id = $1 and om.status = 'active'
     left join project_memberships pm on pm.project_id = p.id and pm.user_id = $1
     where p.workspace_id = $2 and (w.owner_user_id = $1 or pm.user_id = $1 or om.user_id = $1)
     order by p.created_at asc`,
    [userId, workspaceId],
  );
  return result.rows.map(normalizeProjectRow);
}

export async function createProject(userId, workspaceId, name) {
  if (useMemory()) {
    const workspace = memory.workspaces.get(workspaceId);
    if (!workspace) throw new Error('Workspace not found');
    requireOrgPermissionSync({
      organizationId: workspace.organizationId,
      userId,
      permission: 'createProject',
    });
    const project = {
      id: createId('proj'),
      organizationId: workspace.organizationId,
      workspaceId,
      name,
      slug: slugify(name),
      createdBy: userId,
      createdAt: new Date().toISOString(),
      role: 'owner',
    };
    memory.projects.set(project.id, project);
    memory.memberships.set(`${project.id}:${userId}`, {
      id: createId('pm'),
      projectId: project.id,
      userId,
      role: 'owner',
      createdAt: project.createdAt,
    });
    return project;
  }

  await ensureSchema();
  const workspace = await query('select * from workspaces where id = $1 limit 1', [workspaceId]);
  if (!workspace.rows[0]) throw new Error('Workspace not found');
  await requireOrgPermission({
    organizationId: workspace.rows[0].organization_id,
    userId,
    permission: 'createProject',
  });

  const projectId = createId('proj');
  const createdAt = new Date().toISOString();
  const result = await query(
    `insert into projects (id, organization_id, workspace_id, name, slug, created_by, created_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [projectId, workspace.rows[0].organization_id, workspaceId, name, slugify(name), userId, createdAt],
  );

  await query(
    `insert into project_memberships (id, project_id, user_id, role, created_at)
     values ($1, $2, $3, 'owner', $4)
     on conflict (project_id, user_id) do nothing`,
    [createId('pm'), projectId, userId, createdAt],
  );

  return {
    ...normalizeProjectRow(result.rows[0]),
    role: 'owner',
  };
}

export async function listProjectReports({ projectId, userId }) {
  await requireProjectPermission({ userId, projectId, permission: 'viewReports' });

  if (useMemory()) {
    return Array.from(memory.reports.values())
      .filter((report) => report.projectId === projectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((report) => reportSummary(report));
  }

  await ensureSchema();
  const result = await query(
    `select * from reports where project_id = $1 order by created_at desc limit 50`,
    [projectId],
  );
  return result.rows.map((row) => reportSummary(normalizeReportRow(row)));
}

export async function saveReport({ snapshot, projectId, userId }) {
  const membership = await requireProjectPermission({ userId, projectId, permission: 'exportReports' });
  return persistReport({ snapshot, projectId, workspaceId: membership.workspaceId, organizationId: membership.organizationId, userId });
}

export async function getReport({ id, userId }) {
  if (useMemory()) {
    const report = memory.reports.get(id) ?? null;
    if (!report) return null;
    const membership = await requireProjectPermission({ userId, projectId: report.projectId, permission: 'viewReports' }).catch(() => null);
    return membership ? report : null;
  }

  await ensureSchema();
  const result = await query(
    `select r.*
     from reports r
     join projects p on p.id = r.project_id
     join workspaces w on w.id = p.workspace_id
     left join organization_members om on om.organization_id = coalesce(r.organization_id, p.organization_id, w.organization_id) and om.user_id = $2 and om.status = 'active'
     left join project_memberships pm on pm.project_id = p.id and pm.user_id = $2
     where r.id = $1 and (w.owner_user_id = $2 or pm.user_id = $2 or om.user_id = $2)
     limit 1`,
    [id, userId],
  );
  return result.rows[0] ? normalizeReportRow(result.rows[0]) : null;
}

export async function getFailureWorkflow({ projectId, failureId, userId }) {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership) throw new Error('Project membership not found');

  if (useMemory()) {
    return memory.failureWorkflows.get(failureWorkflowKey(projectId, failureId)) ?? null;
  }

  await ensureSchema();
  const result = await query(
    `select * from failure_workflows
     where project_id = $1 and failure_id = $2
     limit 1`,
    [projectId, failureId],
  );
  return result.rows[0] ? normalizeFailureWorkflowRow(result.rows[0]) : null;
}

export async function listFailureRegressionSuites({ projectId, userId }) {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership) throw new Error('Project membership not found');

  if (useMemory()) {
    return Array.from(memory.failureRegressionSuites.values())
      .filter((suite) => suite.projectId === projectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  await ensureSchema();
  const result = await query(
    `select * from failure_regression_suites
     where project_id = $1
     order by updated_at desc`,
    [projectId],
  );
  return result.rows.map(normalizeFailureRegressionSuiteRow);
}

export async function upsertFailureRegressionSuite({
  projectId,
  userId,
  suiteId,
  name,
  description = null,
  failureId = null,
}) {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership || !canMutateProject(membership.role)) {
    throw new Error('Only owners and maintainers can update regression suites');
  }

  const normalizedSuiteId = normalizeOptionalText(suiteId);
  const normalizedName = normalizeOptionalText(name);
  if (!normalizedSuiteId || !normalizedName) {
    throw new Error('suiteId and name are required');
  }

  const normalizedFailureId = normalizeOptionalText(failureId);
  const now = new Date().toISOString();

  if (useMemory()) {
    const key = failureRegressionSuiteKey(projectId, normalizedSuiteId);
    const existing = memory.failureRegressionSuites.get(key);
    const suite = {
      id: normalizedSuiteId,
      projectId,
      workspaceId: membership.workspaceId,
      name: normalizedName,
      description: normalizeOptionalText(description) ?? existing?.description ?? 'Pinned regression cases.',
      failureIds: mergeFailureIds(normalizedFailureId, existing?.failureIds),
      createdBy: existing?.createdBy ?? userId,
      updatedBy: userId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    memory.failureRegressionSuites.set(key, suite);
    return suite;
  }

  await ensureSchema();
  const existing = await query(
    `select * from failure_regression_suites
     where project_id = $1 and suite_id = $2
     limit 1`,
    [projectId, normalizedSuiteId],
  );
  const failureIds = mergeFailureIds(normalizedFailureId, existing.rows[0]?.failure_ids);
  const inserted = await query(
    `insert into failure_regression_suites
       (id, suite_id, project_id, workspace_id, name, description, failure_ids, created_by, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8)
     on conflict (project_id, suite_id) do update set
       name = excluded.name,
       description = coalesce(excluded.description, failure_regression_suites.description),
       failure_ids = excluded.failure_ids,
       updated_by = excluded.updated_by,
       updated_at = now()
     returning *`,
    [
      existing.rows[0]?.id ?? createId('frs'),
      normalizedSuiteId,
      projectId,
      membership.workspaceId,
      normalizedName,
      normalizeOptionalText(description),
      JSON.stringify(failureIds),
      userId,
    ],
  );
  return normalizeFailureRegressionSuiteRow(inserted.rows[0]);
}

export async function recordFailureWorkflowAction({
  projectId,
  failureId,
  userId,
  action,
  status,
  owner = null,
  severity = null,
  message = null,
  comment = null,
  evidence = {},
}) {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership || !canMutateProject(membership.role)) {
    throw new Error('Only owners and maintainers can update failure workflows');
  }

  const now = new Date().toISOString();
  const actionEntry = {
    id: createId('fwact'),
    action: normalizeOptionalText(action) ?? 'unknown',
    status: normalizeOptionalText(status) ?? 'Updated',
    owner: normalizeOptionalText(owner),
    severity: normalizeOptionalText(severity),
    message: normalizeOptionalText(message),
    comment: normalizeOptionalText(comment),
    createdBy: userId,
    createdAt: now,
  };

  if (useMemory()) {
    const key = failureWorkflowKey(projectId, failureId);
    const existing = memory.failureWorkflows.get(key);
    const workflow = {
      id: existing?.id ?? createId('fw'),
      projectId,
      workspaceId: membership.workspaceId,
      failureId,
      status: actionEntry.status,
      owner: actionEntry.owner ?? existing?.owner ?? null,
      severity: actionEntry.severity ?? existing?.severity ?? null,
      latestAction: actionEntry.action,
      evidence: {
        ...(existing?.evidence ?? {}),
        ...(evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? cloneJson(evidence) : {}),
      },
      actions: [actionEntry, ...(existing?.actions ?? [])].slice(0, 100),
      createdBy: existing?.createdBy ?? userId,
      updatedBy: userId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    memory.failureWorkflows.set(key, workflow);
    return workflow;
  }

  await ensureSchema();
  const inserted = await query(
    `insert into failure_workflows
       (id, project_id, workspace_id, failure_id, status, owner, severity, latest_action, evidence, actions, created_by, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, jsonb_build_array($10::jsonb), $11, $11)
     on conflict (project_id, failure_id) do update set
       status = excluded.status,
       owner = coalesce(excluded.owner, failure_workflows.owner),
       severity = coalesce(excluded.severity, failure_workflows.severity),
       latest_action = excluded.latest_action,
       evidence = failure_workflows.evidence || excluded.evidence,
       actions = jsonb_insert(failure_workflows.actions, '{0}', $10::jsonb),
       updated_by = excluded.updated_by,
       updated_at = now()
     returning *`,
    [
      createId('fw'),
      projectId,
      membership.workspaceId,
      failureId,
      actionEntry.status,
      actionEntry.owner,
      actionEntry.severity,
      actionEntry.action,
      evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? evidence : {},
      actionEntry,
      userId,
    ],
  );
  return normalizeFailureWorkflowRow(inserted.rows[0]);
}

export async function createRunnerRegistration({ projectId, userId, name, endpointUrl, sharedSecret, status = 'active' }) {
  await requireProjectPermission({ userId, projectId, permission: 'createTarget' });

  if (useMemory()) {
    const runner = {
      id: createId('runner'),
      projectId,
      name,
      endpointUrl,
      sharedSecret,
      status,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };
    memory.runners.set(runner.id, runner);
    return runner;
  }

  await ensureSchema();
  const result = await query(
    `insert into runner_registrations (id, project_id, name, endpoint_url, shared_secret, status, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [createId('runner'), projectId, name, endpointUrl, sharedSecret, status, userId],
  );
  return normalizeRunnerRow(result.rows[0]);
}

export async function listRunners({ projectId, userId }) {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership) throw new Error('Project membership not found');

  if (useMemory()) {
    return Array.from(memory.runners.values())
      .filter((runner) => runner.projectId === projectId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  await ensureSchema();
  const result = await query(
    `select * from runner_registrations where project_id = $1 order by created_at asc`,
    [projectId],
  );
  return result.rows.map(normalizeRunnerRow);
}

export async function createProjectSecret({
  projectId,
  userId,
  provider,
  environment = 'production',
  name,
  secretValue,
  validationStatus = 'pending',
}) {
  assertHostedByokEnabled();
  const membership = await requireProjectPermission({ userId, projectId, permission: 'manageSecrets' });
  const normalizedProvider = normalizeProvider(provider);
  const normalizedEnvironment = normalizeSecretEnvironment(environment);
  if (!normalizedProvider) throw new Error('Provider is required');
  if (!secretValue) throw new Error('Provider API key is required');
  const now = new Date().toISOString();
  const secret = {
    id: createId('sec'),
    projectId,
    workspaceId: membership.workspaceId,
    organizationId: membership.organizationId,
    environment: normalizedEnvironment,
    provider: normalizedProvider,
    displayName: normalizeOptionalText(name) ?? `${normalizedProvider} key`,
    maskedPreview: maskSecretValue(secretValue),
    status: 'active',
    validationStatus,
    lastValidationErrorClass: null,
    lastValidationError: null,
    encryptedSecret: encryptSecretValue(secretValue),
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
  };

  if (useMemory()) {
    memory.projectSecrets.set(secret.id, secret);
    return projectSecretSummary(secret);
  }

  await ensureSchema();
  const inserted = await query(
    `insert into project_secrets
     (id, project_id, workspace_id, organization_id, environment, provider, display_name, masked_preview, status, validation_status, last_validation_error_class, last_validation_error, encrypted_secret, created_by, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, null, null, $11, $12, $13, $13)
     returning *`,
    [secret.id, projectId, membership.workspaceId, membership.organizationId, secret.environment, secret.provider, secret.displayName, secret.maskedPreview, secret.status, validationStatus, secret.encryptedSecret, userId, now],
  );
  return projectSecretSummary(normalizeProjectSecretRow(inserted.rows[0]));
}

export async function rotateProjectSecret({
  projectId,
  secretId,
  userId,
  provider = null,
  environment = null,
  name = null,
  secretValue = null,
}) {
  assertHostedByokEnabled();
  await requireProjectPermission({ userId, projectId, permission: 'manageSecrets' });
  const existing = await readProjectSecret(secretId);
  if (!existing || existing.projectId !== projectId || existing.status === 'deleted') return null;
  const nextValue = secretValue ? String(secretValue) : null;
  const next = {
    ...existing,
    provider: provider ? normalizeProvider(provider) : existing.provider,
    environment: environment ? normalizeSecretEnvironment(environment) : existing.environment,
    displayName: normalizeOptionalText(name) ?? existing.displayName,
    maskedPreview: nextValue ? maskSecretValue(nextValue) : existing.maskedPreview,
    encryptedSecret: nextValue ? encryptSecretValue(nextValue) : existing.encryptedSecret,
    validationStatus: nextValue ? 'pending' : existing.validationStatus,
    lastValidationErrorClass: nextValue ? null : existing.lastValidationErrorClass,
    lastValidationError: nextValue ? null : existing.lastValidationError,
    status: 'active',
    updatedAt: new Date().toISOString(),
  };
  if (!next.provider) throw new Error('Provider is required');
  if (useMemory()) {
    memory.projectSecrets.set(secretId, next);
    return projectSecretSummary(next);
  }
  await ensureSchema();
  const result = await query(
    `update project_secrets
     set provider = $3, environment = $4, display_name = $5, masked_preview = $6,
         encrypted_secret = $7, validation_status = $8, last_validation_error_class = $9,
         last_validation_error = $10, status = $11, updated_at = $12
     where id = $1 and project_id = $2
     returning *`,
    [
      secretId,
      projectId,
      next.provider,
      next.environment,
      next.displayName,
      next.maskedPreview,
      next.encryptedSecret,
      next.validationStatus,
      next.lastValidationErrorClass,
      next.lastValidationError,
      next.status,
      next.updatedAt,
    ],
  );
  return result.rows[0] ? projectSecretSummary(normalizeProjectSecretRow(result.rows[0])) : null;
}

export async function validateProjectSecret({ projectId, secretId, userId, model = null, fetchImpl = globalThis.fetch }) {
  assertHostedByokEnabled();
  await requireProjectPermission({ userId, projectId, permission: 'manageSecrets' });
  const secret = await readProjectSecret(secretId);
  if (!secret || secret.projectId !== projectId || secret.status === 'deleted') return null;
  if (!EXECUTABLE_HOSTED_PROVIDERS.has(secret.provider)) {
    return updateProjectSecretValidation({
      projectId,
      secretId,
      validationStatus: 'unsupported',
      lastValidationErrorClass: 'hosted_provider_invalid_request',
      lastValidationError: 'Validation is not implemented for this provider.',
    });
  }
  try {
    await dispatchHostedProvider({
      provider: secret.provider,
      model: model ?? defaultValidationModel(secret.provider),
      input: 'Respond with ok.',
      timeoutMs: 10000,
      fetchImpl,
      secretResolver: async () => decryptSecretValue(secret.encryptedSecret),
      metadata: {
        adapterType: 'hosted_provider',
        target: `${secret.provider}:${defaultValidationModel(secret.provider)}`,
        phase: 'validation',
      },
    });
    return updateProjectSecretValidation({
      projectId,
      secretId,
      validationStatus: 'valid',
      lastValidationErrorClass: null,
      lastValidationError: null,
    });
  } catch (error) {
    const diagnostics = normalizeAdapterDiagnostics(error?.diagnostics, {
      failureClass: error?.failureClass ?? classifyAdapterError(error),
      rawErrorMessage: error instanceof Error ? error.message : String(error),
      phase: 'validation',
    });
    return updateProjectSecretValidation({
      projectId,
      secretId,
      validationStatus: 'invalid',
      lastValidationErrorClass: diagnostics.failureClass,
      lastValidationError: diagnostics.rawErrorMessage,
    });
  }
}

export async function listProjectSecrets({ projectId, userId }) {
  await requireProjectPermission({ userId, projectId, permission: 'manageSecrets' });
  if (useMemory()) {
    return Array.from(memory.projectSecrets.values())
      .filter((secret) => secret.projectId === projectId && secret.status !== 'deleted')
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(projectSecretSummary);
  }
  await ensureSchema();
  const result = await query(
    `select * from project_secrets
     where project_id = $1 and status <> 'deleted'
     order by updated_at desc`,
    [projectId],
  );
  return result.rows.map(normalizeProjectSecretRow).map(projectSecretSummary);
}

export async function getProjectSecretMetadata({ projectId, secretId, userId }) {
  await requireProjectPermission({ userId, projectId, permission: 'manageSecrets' });
  const secret = await readProjectSecret(secretId);
  if (!secret || secret.projectId !== projectId || secret.status === 'deleted') return null;
  return projectSecretSummary(secret);
}

export async function disableProjectSecret({ projectId, secretId, userId }) {
  return updateProjectSecretStatus({ projectId, secretId, userId, status: 'disabled' });
}

export async function deleteProjectSecret({ projectId, secretId, userId }) {
  return updateProjectSecretStatus({ projectId, secretId, userId, status: 'deleted' });
}

export async function resolveHostedProviderSecret({ projectId, secretRef, provider, environment = 'production' }) {
  const secret = await readProjectSecret(secretRef);
  if (!secret || secret.projectId !== projectId || secret.status === 'deleted') {
    throw new AdapterExecutionError('Hosted provider secret not found.', {
      failureClass: 'hosted_provider_missing_secret',
      rawErrorMessage: 'Hosted provider secret not found.',
      phase: 'before_dispatch',
    });
  }
  if (secret.status !== 'active') {
    throw new AdapterExecutionError('Hosted provider secret is disabled.', {
      failureClass: 'hosted_provider_invalid_secret',
      rawErrorMessage: 'Hosted provider secret is disabled.',
      phase: 'before_dispatch',
    });
  }
  if (secret.provider !== provider) {
    throw new AdapterExecutionError('Hosted provider secret provider mismatch.', {
      failureClass: 'hosted_provider_invalid_secret',
      rawErrorMessage: 'Hosted provider secret provider mismatch.',
      phase: 'before_dispatch',
    });
  }
  if ((secret.environment ?? 'production') !== environment) {
    throw new AdapterExecutionError('Hosted provider secret environment mismatch.', {
      failureClass: 'hosted_provider_invalid_secret',
      rawErrorMessage: 'Hosted provider secret environment mismatch.',
      phase: 'before_dispatch',
    });
  }
  await markProjectSecretUsed(secret.id);
  return {
    metadata: projectSecretSummary(secret),
    secretValue: decryptSecretValue(secret.encryptedSecret),
  };
}

export async function createRunnerJob({
  projectId,
  runnerId,
  userId,
  pack,
  thresholds,
  profileId,
  presetId,
  idempotencyKey = null,
  maxAttempts = 1,
  timeoutMs = 0,
  retryBackoffMs = 0,
  adapter = null,
  executionTarget = null,
  localTunnelTokenNonce = null,
  localTunnelMaxResponseBytes = null,
  runMode = 'sample',
  ciGate = false,
}) {
  const membership = await requireProjectPermission({ userId, projectId, permission: 'createRun' });

  const target = normalizeExecutionTarget(executionTarget, { runnerId, adapter });
  if (target.type === 'hosted_provider') {
    await requireProjectPermission({ userId, projectId, permission: 'useSecretBackedTargets' });
  }
  const entitlement = await checkRunEntitlement({
    organizationId: membership.organizationId,
    executionTarget: target,
    pack,
    runMode,
    ciGate,
  });
  if (!entitlement.allowed) {
    const error = new Error('Plan entitlement check failed');
    error.statusCode = 402;
    error.entitlement = entitlement;
    throw error;
  }
  if (target.type === 'hosted_provider') {
    await validateHostedProviderTargetForProject({ projectId, target });
  }
  const adapterConfig = adapterConfigForExecutionTarget(target);
  const resolvedRunnerId = executionTargetRunnerId(target);
  const runner = resolvedRunnerId ? await getRunnerById(resolvedRunnerId) : null;
  if (!adapterConfig && target.type === 'registered_runner' && (!runner || runner.projectId !== projectId)) {
    throw new Error('Runner not found');
  }
  if (runner && runner.projectId !== projectId) throw new Error('Runner not found');

  const payload = {
    pack,
    thresholds,
    profileId,
    presetId,
    adapter: adapterConfig,
    executionTarget: {
      ...target,
      ...(target.type === 'local_http_tunnel' ? { tokenNonce: localTunnelTokenNonce } : {}),
      ...(target.type === 'local_http_tunnel' && localTunnelMaxResponseBytes ? { maxResponseBytes: localTunnelMaxResponseBytes } : {}),
      adapter: adapterConfig,
      safeMetadata: executionTargetSafeMetadata(target),
    },
  };
  const normalizedIdempotencyKey = normalizeOptionalText(idempotencyKey);
  if (normalizedIdempotencyKey) {
    const existing = await findRunnerJobByIdempotencyKey({
      projectId,
      runnerId: resolvedRunnerId ?? null,
      idempotencyKey: normalizedIdempotencyKey,
    });
    if (existing) return existing;
  }

  const job = await persistJob({
    id: createId('job'),
    projectId,
    organizationId: membership.organizationId,
    runnerId: resolvedRunnerId,
    userId,
    workspaceId: membership.workspaceId,
    status: 'queued',
    idempotencyKey: normalizedIdempotencyKey,
    payload,
    attempts: 0,
    maxAttempts: normalizePositiveInteger(maxAttempts, 1),
    timeoutMs: normalizeNonNegativeInteger(timeoutMs, 0),
    retryBackoffMs: normalizeNonNegativeInteger(retryBackoffMs, 0),
  });
  await recordUsageEvent({
    organizationId: membership.organizationId,
    projectId,
    runId: job.id,
    eventType: 'run_created',
    quantity: 1,
    metadata: {
      targetType: target.type,
      runMode,
      estimate: entitlement.estimate,
    },
    idempotencyKey: `${job.id}:run_created`,
  });

  return job;
}

export async function getRunnerJob({ jobId, userId }) {
  const job = await readJob(jobId);
  if (!job) return null;
  const membership = await getProjectMembership(userId, job.projectId);
  return membership ? job : null;
}

export async function listRunnerJobs({ projectId, userId, statuses = [] }) {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership) throw new Error('Project membership not found');
  return listRunnerJobsForProject({ projectId, statuses });
}

export async function listRunnerJobsForWorker({ projectId, statuses = [], staleAfterMs = null }) {
  await recoverStaleRunnerJobs({ projectId, staleAfterMs });
  return listRunnerJobsForProject({ projectId, statuses });
}

async function listRunnerJobsForProject({ projectId, statuses = [] }) {
  const normalizedStatuses = normalizeStatusFilter(statuses);

  if (useMemory()) {
    return Array.from(memory.jobs.values())
      .filter((job) => job.projectId === projectId)
      .filter((job) => !normalizedStatuses.length || normalizedStatuses.includes(job.status))
      .sort((left, right) => {
        const leftNext = left.nextRunAt ?? left.createdAt;
        const rightNext = right.nextRunAt ?? right.createdAt;
        return leftNext.localeCompare(rightNext);
      });
  }

  await ensureSchema();
  const params = [projectId];
  const statusClause = normalizedStatuses.length
    ? `and status = any($2)`
    : '';
  if (normalizedStatuses.length) params.push(normalizedStatuses);
  const result = await query(
    `select * from runner_jobs
     where project_id = $1
       ${statusClause}
     order by coalesce(next_run_at, created_at) asc`,
    params,
  );
  return result.rows.map(normalizeJobRow);
}

export async function cancelRunnerJob({ jobId, userId }) {
  const job = await readJob(jobId);
  if (!job) return null;
  const membership = await getProjectMembership(userId, job.projectId);
  if (!membership || !canMutateProject(membership.role)) {
    throw new Error('Only owners and maintainers can cancel jobs');
  }
  if (RUNNER_JOB_TERMINAL_STATUSES.has(job.status)) return job;
  const now = new Date().toISOString();
  if (job.organizationId) {
    await recordUsageEvent({
      organizationId: job.organizationId,
      projectId: job.projectId,
      runId: job.id,
      eventType: 'run_completed',
      quantity: 1,
      metadata: { status: 'canceled' },
      idempotencyKey: `${job.id}:run_completed`,
      createdAt: now,
    });
  }
  return updateJobStatus(jobId, {
    status: 'canceled',
    error: null,
    lastError: null,
    retryReason: null,
    claimedBy: null,
    workerId: null,
    lockedAt: null,
    claimedAt: null,
    nextRunAt: null,
    nextRetryAt: null,
    finishedAt: now,
    canceledAt: now,
    cancelledAt: now,
  });
}

export async function retryRunnerJob({ jobId, userId }) {
  const job = await readJob(jobId);
  if (!job) return null;
  const membership = await getProjectMembership(userId, job.projectId);
  if (!membership || !canMutateProject(membership.role)) {
    throw new Error('Only owners and maintainers can retry jobs');
  }
  if (job.status === 'completed' || job.status === 'canceled') {
    throw new Error(`Cannot retry a ${job.status} job`);
  }
  return updateJobStatus(jobId, {
    status: 'retrying',
    error: null,
    lastError: null,
    retryReason: 'Manual retry requested.',
    claimedBy: null,
    workerId: null,
    lockedAt: null,
    claimedAt: null,
    nextRunAt: new Date().toISOString(),
    nextRetryAt: new Date().toISOString(),
    finishedAt: null,
    failedAt: null,
    canceledAt: null,
    cancelledAt: null,
  });
}

export async function claimRunnerJob({ jobId, userId, workerId = 'api-worker' }) {
  const job = await readJob(jobId);
  if (!job) return null;
  const membership = await getProjectMembership(userId, job.projectId);
  if (!membership || !canMutateProject(membership.role)) {
    throw new Error('Only owners and maintainers can claim jobs');
  }
  return claimJobForWorker(job, workerId);
}

export async function runRunnerJobWorker({ jobId, userId, workerId = 'api-worker' }) {
  const claimed = await claimRunnerJob({ jobId, userId, workerId });
  if (!claimed) return null;

  try {
    return await dispatchRunnerJob(claimed);
  } catch (error) {
    return markRunnerJobFailure(claimed.id, error);
  }
}

export async function getRunnerJobForWorker({ jobId, projectId = null }) {
  if (!projectId) return null;
  const job = await readJob(jobId);
  if (!job) return null;
  if (job.projectId !== projectId) return null;
  return job;
}

export async function claimRunnerJobForWorker({ jobId, projectId, workerId = 'api-worker' }) {
  const job = await getRunnerJobForWorker({ jobId, projectId });
  if (!job) return null;
  return claimJobForWorker(job, workerId);
}

export async function runRunnerJobForWorkerService({ jobId, projectId, workerId = 'api-worker' }) {
  const claimed = await claimRunnerJobForWorker({ jobId, projectId, workerId });
  if (!claimed) return null;

  try {
    return await dispatchRunnerJob(claimed);
  } catch (error) {
    return markRunnerJobFailure(claimed.id, error);
  }
}

export async function listBenchmarkPacks({ projectId, userId }) {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership) throw new Error('Project membership not found');

  if (useMemory()) {
    return Array.from(memory.benchmarkPacks.values())
      .filter((pack) => pack.projectId === projectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((pack) => benchmarkPackSummary(pack));
  }

  await ensureSchema();
  const result = await query(
    `select * from benchmark_packs where project_id = $1 order by updated_at desc`,
    [projectId],
  );
  return result.rows.map((row) => benchmarkPackSummary(normalizeBenchmarkPackRow(row)));
}

export async function getBenchmarkPack({ benchmarkId, userId }) {
  const benchmark = await readBenchmarkPack(benchmarkId);
  if (!benchmark) return null;
  const membership = await getProjectMembership(userId, benchmark.projectId);
  if (!membership) return null;
  return buildBenchmarkDetail(benchmark);
}

export async function createBenchmarkVersion({ projectId, userId, pack, benchmarkId = null, source = 'manual' }) {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership || !canMutateProject(membership.role)) {
    throw new Error('Only owners and maintainers can create benchmark versions');
  }

  const validation = validateBenchmarkPackCandidate(pack);
  if (!validation.ok) {
    throw new Error(`Invalid benchmark pack: ${validation.errors.join('; ')}`);
  }

  if (useMemory()) {
    let benchmark = benchmarkId ? memory.benchmarkPacks.get(benchmarkId) : null;
    if (benchmarkId && (!benchmark || benchmark.projectId !== projectId)) {
      throw new Error('Benchmark pack not found');
    }
    if (!benchmark) {
      benchmark = {
        id: createId('bench'),
        projectId,
        workspaceId: membership.workspaceId,
        name: validation.summary.project,
        slug: slugify(validation.summary.project),
        description: validation.summary.description,
        latestVersionId: null,
        approvedVersionId: null,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memory.benchmarkPacks.set(benchmark.id, benchmark);
    }

    const versions = benchmarkVersionsFor(benchmark.id);
    const version = {
      id: createId('benchver'),
      benchmarkId: benchmark.id,
      projectId,
      workspaceId: membership.workspaceId,
      versionNumber: nextBenchmarkVersionNumber(versions),
      status: 'draft',
      source,
      pack: cloneJson(pack),
      validation,
      readiness: validation.summary,
      createdBy: userId,
      approvedBy: null,
      approvedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memory.benchmarkVersions.set(version.id, version);
    benchmark.latestVersionId = version.id;
    benchmark.name = validation.summary.project;
    benchmark.description = validation.summary.description;
    benchmark.updatedAt = version.updatedAt;
    memory.benchmarkPacks.set(benchmark.id, benchmark);
    return {
      benchmark: benchmarkPackSummary(benchmark),
      version: benchmarkVersionSummary(version),
    };
  }

  await ensureSchema();
  let benchmark = benchmarkId ? await readBenchmarkPack(benchmarkId) : null;
  if (benchmarkId && (!benchmark || benchmark.projectId !== projectId)) {
    throw new Error('Benchmark pack not found');
  }

  if (!benchmark) {
    const inserted = await query(
      `insert into benchmark_packs (id, project_id, workspace_id, name, slug, description, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning *`,
      [
        createId('bench'),
        projectId,
        membership.workspaceId,
        validation.summary.project,
        slugify(validation.summary.project),
        validation.summary.description,
        userId,
      ],
    );
    benchmark = normalizeBenchmarkPackRow(inserted.rows[0]);
  }

  const existing = await query(
    `select * from benchmark_versions where benchmark_pack_id = $1`,
    [benchmark.id],
  );
  const versionId = createId('benchver');
  const versionNumber = nextBenchmarkVersionNumber(existing.rows);
  const insertedVersion = await query(
    `insert into benchmark_versions
       (id, benchmark_pack_id, project_id, workspace_id, version_number, status, source, pack, validation, readiness, created_by)
     values ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10)
     returning *`,
    [
      versionId,
      benchmark.id,
      projectId,
      membership.workspaceId,
      versionNumber,
      source,
      pack,
      validation,
      validation.summary,
      userId,
    ],
  );
  await query(
    `update benchmark_packs
     set latest_version_id = $2,
         name = $3,
         description = $4,
         updated_at = now()
     where id = $1`,
    [benchmark.id, versionId, validation.summary.project, validation.summary.description],
  );

  const version = normalizeBenchmarkVersionRow(insertedVersion.rows[0]);
  benchmark = await readBenchmarkPack(benchmark.id);
  return {
    benchmark: benchmarkPackSummary(benchmark),
    version: benchmarkVersionSummary(version),
  };
}

export async function editBenchmarkVersion({ versionId, userId, edits = {} }) {
  const baseVersion = await readBenchmarkVersion(versionId);
  if (!baseVersion) throw new Error('Benchmark version not found');
  if (baseVersion.status === 'archived' || baseVersion.status === 'rejected') {
    throw new Error('Cannot edit an archived or rejected benchmark version');
  }
  const membership = await getProjectMembership(userId, baseVersion.projectId);
  if (!membership || !canMutateProject(membership.role)) {
    throw new Error('Only owners and maintainers can edit benchmark versions');
  }

  const editedPack = applyBenchmarkPackEdits(baseVersion.pack, edits);
  const diff = diffBenchmarkPacks(baseVersion.pack, editedPack);
  if (diff.summary.changeCount === 0) {
    return {
      benchmark: benchmarkPackSummary(await readBenchmarkPack(baseVersion.benchmarkId)),
      baseVersion: benchmarkVersionSummary(baseVersion),
      version: benchmarkVersionSummary(baseVersion),
      diff,
      unchanged: true,
    };
  }

  const result = await createBenchmarkVersion({
    projectId: baseVersion.projectId,
    userId,
    benchmarkId: baseVersion.benchmarkId,
    pack: editedPack,
    source: `edit:v${baseVersion.versionNumber}`,
  });

  return {
    ...result,
    baseVersion: benchmarkVersionSummary(baseVersion),
    diff,
    unchanged: false,
  };
}

export async function reviewBenchmarkVersion({ versionId, userId, decision, comments = '' }) {
  const version = await readBenchmarkVersion(versionId);
  if (!version) throw new Error('Benchmark version not found');
  const membership = await getProjectMembership(userId, version.projectId);
  if (!membership || !canMutateProject(membership.role)) {
    throw new Error('Only owners and maintainers can review benchmark versions');
  }

  const normalizedDecision = normalizeReviewDecision(decision);
  const nextStatus = statusForReviewDecision(normalizedDecision, version.status);
  const now = new Date().toISOString();

  if (useMemory()) {
    const review = {
      id: createId('benchrev'),
      versionId: version.id,
      benchmarkId: version.benchmarkId,
      projectId: version.projectId,
      workspaceId: version.workspaceId,
      reviewerId: userId,
      decision: normalizedDecision,
      comments,
      readinessSnapshot: cloneJson(version.readiness),
      createdAt: now,
    };
    memory.benchmarkReviews.set(review.id, review);
    const nextVersion = {
      ...version,
      status: nextStatus,
      approvedBy: nextStatus === 'approved' ? userId : version.approvedBy,
      approvedAt: nextStatus === 'approved' ? now : version.approvedAt,
      updatedAt: now,
    };
    memory.benchmarkVersions.set(version.id, nextVersion);
    const benchmark = memory.benchmarkPacks.get(version.benchmarkId);
    if (benchmark) {
      benchmark.latestVersionId = version.id;
      if (nextStatus === 'approved') benchmark.approvedVersionId = version.id;
      benchmark.updatedAt = now;
      memory.benchmarkPacks.set(benchmark.id, benchmark);
    }
    return {
      review,
      version: benchmarkVersionSummary(nextVersion),
      benchmark: benchmark ? benchmarkPackSummary(benchmark) : null,
    };
  }

  await ensureSchema();
  const reviewId = createId('benchrev');
  const insertedReview = await query(
    `insert into benchmark_reviews
       (id, benchmark_version_id, benchmark_pack_id, project_id, workspace_id, reviewer_id, decision, comments, readiness_snapshot)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning *`,
    [
      reviewId,
      version.id,
      version.benchmarkId,
      version.projectId,
      version.workspaceId,
      userId,
      normalizedDecision,
      comments,
      version.readiness,
    ],
  );
  const updatedVersion = await query(
    `update benchmark_versions
     set status = $2,
         approved_by = case when $2 = 'approved' then $3 else approved_by end,
         approved_at = case when $2 = 'approved' then now() else approved_at end,
         updated_at = now()
     where id = $1
     returning *`,
    [version.id, nextStatus, userId],
  );
  await query(
    `update benchmark_packs
     set latest_version_id = $2,
         approved_version_id = case when $3 = 'approved' then $2 else approved_version_id end,
         updated_at = now()
     where id = $1`,
    [version.benchmarkId, version.id, nextStatus],
  );

  const benchmark = await readBenchmarkPack(version.benchmarkId);
  return {
    review: normalizeBenchmarkReviewRow(insertedReview.rows[0]),
    version: benchmarkVersionSummary(normalizeBenchmarkVersionRow(updatedVersion.rows[0])),
    benchmark: benchmarkPackSummary(benchmark),
  };
}

export async function assignBenchmarkReviewer({ versionId, userId, reviewer, notes = '' }) {
  const version = await readBenchmarkVersion(versionId);
  if (!version) throw new Error('Benchmark version not found');
  const membership = await getProjectMembership(userId, version.projectId);
  if (!membership || !canMutateProject(membership.role)) {
    throw new Error('Only owners and maintainers can assign benchmark reviewers');
  }
  const reviewerLabel = typeof reviewer === 'string' ? reviewer.trim() : '';
  if (!reviewerLabel) throw new Error('Reviewer is required');
  const now = new Date().toISOString();

  if (useMemory()) {
    const assignment = {
      id: createId('benchassign'),
      versionId: version.id,
      benchmarkId: version.benchmarkId,
      projectId: version.projectId,
      workspaceId: version.workspaceId,
      reviewer: reviewerLabel,
      status: 'assigned',
      notes,
      assignedBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    memory.benchmarkReviewAssignments.set(assignment.id, assignment);
    return assignment;
  }

  await ensureSchema();
  const inserted = await query(
    `insert into benchmark_review_assignments
       (id, benchmark_version_id, benchmark_pack_id, project_id, workspace_id, reviewer, status, notes, assigned_by, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, 'assigned', $7, $8, $9, $9)
     returning *`,
    [
      createId('benchassign'),
      version.id,
      version.benchmarkId,
      version.projectId,
      version.workspaceId,
      reviewerLabel,
      notes,
      userId,
      now,
    ],
  );
  return normalizeBenchmarkReviewAssignmentRow(inserted.rows[0]);
}

export async function createPromotionCandidate({
  versionId,
  userId,
  sourceType = 'report',
  sourceId = null,
  caseData,
  visibility = 'visible',
  notes = '',
}) {
  const version = await readBenchmarkVersion(versionId);
  if (!version) throw new Error('Benchmark version not found');
  if (version.status === 'rejected' || version.status === 'archived') {
    throw new Error('Cannot promote cases into a rejected or archived benchmark version');
  }
  const membership = await getProjectMembership(userId, version.projectId);
  if (!membership || !canMutateProject(membership.role)) {
    throw new Error('Only owners and maintainers can propose golden cases');
  }
  if (!caseData || typeof caseData !== 'object' || Array.isArray(caseData)) {
    throw new Error('Promotion candidate case data is required');
  }
  const normalizedVisibility = normalizeGoldenCaseVisibility(visibility);

  if (useMemory()) {
    const candidate = {
      id: createId('promote'),
      versionId: version.id,
      benchmarkId: version.benchmarkId,
      projectId: version.projectId,
      workspaceId: version.workspaceId,
      sourceType,
      sourceId,
      status: 'proposed',
      visibility: normalizedVisibility,
      caseData: cloneJson(caseData),
      notes,
      createdBy: userId,
      promotedBy: null,
      promotedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memory.promotionCandidates.set(candidate.id, candidate);
    return candidate;
  }

  await ensureSchema();
  const inserted = await query(
    `insert into promotion_candidates
       (id, benchmark_version_id, benchmark_pack_id, project_id, workspace_id, source_type, source_id, status, visibility, case_data, notes, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, 'proposed', $8, $9, $10, $11)
     returning *`,
    [
      createId('promote'),
      version.id,
      version.benchmarkId,
      version.projectId,
      version.workspaceId,
      sourceType,
      sourceId,
      normalizedVisibility,
      caseData,
      notes,
      userId,
    ],
  );
  return normalizePromotionCandidateRow(inserted.rows[0]);
}

export async function promoteBenchmarkCandidate({ candidateId, userId }) {
  const candidate = await readPromotionCandidate(candidateId);
  if (!candidate) throw new Error('Promotion candidate not found');
  const membership = await getProjectMembership(userId, candidate.projectId);
  if (!membership || !canMutateProject(membership.role)) {
    throw new Error('Only owners and maintainers can promote golden cases');
  }
  if (candidate.status === 'promoted') {
    const existing = goldenCasesForCandidate(candidate.id)[0] ?? null;
    return { candidate, goldenCase: existing };
  }
  if (candidate.status !== 'proposed') {
    throw new Error(`Cannot promote candidate with status ${candidate.status}`);
  }

  if (useMemory()) {
    const now = new Date().toISOString();
    const goldenCase = {
      id: createId('golden'),
      versionId: candidate.versionId,
      benchmarkId: candidate.benchmarkId,
      projectId: candidate.projectId,
      workspaceId: candidate.workspaceId,
      promotionCandidateId: candidate.id,
      visibility: candidate.visibility,
      caseData: cloneJson(candidate.caseData),
      createdBy: userId,
      createdAt: now,
    };
    memory.goldenCases.set(goldenCase.id, goldenCase);
    const nextCandidate = {
      ...candidate,
      status: 'promoted',
      promotedBy: userId,
      promotedAt: now,
      updatedAt: now,
    };
    memory.promotionCandidates.set(candidate.id, nextCandidate);
    return { candidate: nextCandidate, goldenCase };
  }

  await ensureSchema();
  const insertedGolden = await query(
    `insert into golden_cases
       (id, benchmark_version_id, benchmark_pack_id, project_id, workspace_id, promotion_candidate_id, visibility, case_data, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning *`,
    [
      createId('golden'),
      candidate.versionId,
      candidate.benchmarkId,
      candidate.projectId,
      candidate.workspaceId,
      candidate.id,
      candidate.visibility,
      candidate.caseData,
      userId,
    ],
  );
  const updatedCandidate = await query(
    `update promotion_candidates
     set status = 'promoted',
         promoted_by = $2,
         promoted_at = now(),
         updated_at = now()
     where id = $1
     returning *`,
    [candidate.id, userId],
  );
  return {
    candidate: normalizePromotionCandidateRow(updatedCandidate.rows[0]),
    goldenCase: normalizeGoldenCaseRow(insertedGolden.rows[0]),
  };
}

export async function saveEvent(event, session = {}) {
  if (useMemory()) {
    memory.events.push({
      id: createId('evt'),
      ...event,
      userId: session.userId ?? null,
      workspaceId: session.workspaceId ?? null,
      projectId: session.projectId ?? null,
      createdAt: new Date().toISOString(),
    });
    memory.events.splice(0, Math.max(0, memory.events.length - 500));
    return { storage: 'memory' };
  }

  await ensureSchema();
  await query(
    `insert into events (id, name, user_id, workspace_id, project_id, payload)
     values ($1, $2, $3, $4, $5, $6)`,
    [createId('evt'), event.name, session.userId ?? null, session.workspaceId ?? null, session.projectId ?? null, event],
  );
  return { storage: 'postgres' };
}

export async function saveTraceEvents({ events, projectId = null, userId = null }) {
  const normalizedEvents = orderTraceEvents(events);
  if (projectId && userId) {
    await requireProjectPermission({ userId, projectId, permission: 'exportReports' });
  }

  if (useMemory()) {
    const saved = normalizedEvents.map((event) => ({
      id: createId('trace_evt'),
      projectId,
      userId,
      ...event,
      createdAt: new Date().toISOString(),
    }));
    saved.forEach((event) => memory.traceEvents.set(event.id, event));
    return {
      storage: 'memory',
      accepted: saved.length,
      traceIds: Array.from(new Set(saved.map((event) => event.trace_id).filter(Boolean))),
      events: saved,
    };
  }

  await Promise.all(normalizedEvents.map((event) => saveEvent({
    name: 'trace.event.ingested',
    projectId,
    traceEvent: event,
  }, { userId, projectId })));
  return {
    storage: 'events',
    accepted: normalizedEvents.length,
    traceIds: Array.from(new Set(normalizedEvents.map((event) => event.trace_id).filter(Boolean))),
    events: normalizedEvents,
  };
}

export async function listTraceEvents({ projectId = null, userId = null, runId = null, traceId = null } = {}) {
  if (projectId && userId) {
    await requireProjectPermission({ userId, projectId, permission: 'viewReports' });
  }

  if (useMemory()) {
    return orderTraceEvents(Array.from(memory.traceEvents.values())
      .filter((event) => !projectId || event.projectId === projectId)
      .filter((event) => !runId || event.run_id === runId)
      .filter((event) => !traceId || event.trace_id === traceId));
  }

  if (!projectId || !userId) return [];
  const stored = await listEventsForProject({ projectId, userId, name: 'trace.event.ingested' });
  return orderTraceEvents(stored
    .map((event) => event.payload?.traceEvent)
    .filter((event) => event && (!runId || event.run_id === runId) && (!traceId || event.trace_id === traceId)));
}

export function normalizeTraceEventsPayload(payload, defaults = {}) {
  return normalizeTraceBatch(payload, defaults);
}

export async function listEventsForProject({ projectId, userId, name = null }) {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership) throw new Error('Project membership not found');
  if (useMemory()) {
    return memory.events
      .filter((event) => event.projectId === projectId)
      .filter((event) => !name || event.name === name)
      .slice()
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  }

  await ensureSchema();
  const params = [projectId];
  const nameClause = name ? 'and name = $2' : '';
  if (name) params.push(name);
  const result = await query(
    `select id, name, user_id, workspace_id, project_id, payload, created_at
     from events
     where project_id = $1 ${nameClause}
     order by created_at desc`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    userId: row.user_id ?? null,
    workspaceId: row.workspace_id ?? null,
    projectId: row.project_id ?? null,
    payload: row.payload ?? {},
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  }));
}

async function dispatchRunnerJob(job) {
  const current = await readJob(job.id);
  if (!current || RUNNER_JOB_TERMINAL_STATUSES.has(current.status)) return current;
  if (current.reportId) return current;
  if (await isJobCanceled(job.id)) return readJob(job.id);

  const runningAt = new Date().toISOString();
  const running = await updateJobStatus(job.id, {
    status: 'running',
    startedAt: current.startedAt ?? runningAt,
    finishedAt: null,
    result: {
      ...(current.result ?? {}),
      execution: executionDescriptor(current),
      diagnostics: normalizeAdapterDiagnostics({}, {
        adapterType: current.payload?.executionTarget?.type ?? current.payload?.adapter?.type ?? 'registered-http-runner',
        target: current.payload?.executionTarget?.endpointUrl ?? current.payload?.executionTarget?.routeUrl ?? current.payload?.adapter?.target ?? '',
        runnerId: current.runnerId ?? '',
        requestTimestamp: runningAt,
        workerId: current.workerId ?? current.claimedBy ?? '',
        jobId: current.id,
        retryAttempt: current.attempts,
        benchmarkId: current.payload?.pack?.id ?? current.payload?.pack?.project ?? '',
        benchmarkVersion: current.payload?.pack?.version ?? null,
        phase: 'before_dispatch',
      }),
    },
  });
  if (!running || await isJobCanceled(job.id)) return readJob(job.id);
  await recordUsageEvent({
    organizationId: running.organizationId,
    projectId: running.projectId,
    runId: running.id,
    eventType: 'run_started',
    quantity: 1,
    metadata: { attempt: running.attempts },
    idempotencyKey: `${running.id}:run_started`,
  });
  const workerStartedAt = Date.now();

  const executionTarget = normalizeExecutionTarget(running.payload?.executionTarget, {
    runnerId: running.runnerId,
    adapter: running.payload?.adapter,
  });
  const adapterConfig = adapterConfigForExecutionTarget(executionTarget);
  const observations = adapterConfig
    ? await runAdapterBackedJob(running, adapterConfig)
    : executionTarget.type === 'registered_runner'
      ? await runHttpRunnerBackedJob(running)
      : executionTarget.type === 'local_http_tunnel'
        ? await runLocalHttpTunnelBackedJob(running, executionTarget)
        : executionTarget.type === 'hosted_provider'
          ? await runHostedProviderBackedJob(running, executionTarget)
          : failUnsupportedExecutionTarget(running, executionTarget);
  const usageEstimate = estimateRunUsage({
    pack: running.payload.pack,
    runMode: running.payload?.executionTarget?.mode ?? 'sample',
  });
  await recordUsageEvent({
    organizationId: running.organizationId,
    projectId: running.projectId,
    runId: running.id,
    eventType: 'scenario_executed',
    quantity: observations.length || usageEstimate.scenarioCount,
    metadata: { observed: observations.length },
    idempotencyKey: `${running.id}:scenario_executed`,
  });
  await recordUsageEvent({
    organizationId: running.organizationId,
    projectId: running.projectId,
    runId: running.id,
    eventType: 'mutation_executed',
    quantity: usageEstimate.mutationCount,
    metadata: { benchmarkId: usageEstimate.benchmarkId },
    idempotencyKey: `${running.id}:mutation_executed`,
  });
  if (executionTarget.type === 'hosted_provider') {
    await recordUsageEvent({
      organizationId: running.organizationId,
      projectId: running.projectId,
      runId: running.id,
      eventType: 'provider_call',
      quantity: observations.length || usageEstimate.providerCallCount,
      metadata: { provider: executionTarget.provider, targetType: executionTarget.type },
      idempotencyKey: `${running.id}:provider_call`,
    });
  }
  await recordUsageEvent({
    organizationId: running.organizationId,
    projectId: running.projectId,
    runId: running.id,
    eventType: 'execution_ms',
    quantity: Date.now() - workerStartedAt,
    metadata: { workerId: running.workerId ?? running.claimedBy ?? '' },
    idempotencyKey: `${running.id}:execution_ms`,
  });

  if (await isJobCanceled(job.id)) return readJob(job.id);
  const analysis = analyzeBundle(running.payload.pack, observations, {
    intensity: running.payload.pack?.mutationPolicy?.intensity ?? 2,
  });
  const snapshot = buildReportSnapshot({
    analysis,
    reportId: createId('report'),
    workspace: {
      workspaceId: running.workspaceId,
    },
    projectId: running.projectId,
    profileId: running.payload.profileId,
    presetId: running.payload.presetId,
    thresholds: running.payload.thresholds,
    sourceBundle: running.payload.pack,
  });

  if (await isJobCanceled(job.id)) return readJob(job.id);
  const saved = await persistReport({
    snapshot,
    projectId: running.projectId,
    workspaceId: running.workspaceId,
    organizationId: running.organizationId,
    userId: running.userId,
  });

  if (await isJobCanceled(job.id)) return readJob(job.id);
  const beforeComplete = await readJob(job.id);
  if (!beforeComplete || beforeComplete.reportId || RUNNER_JOB_TERMINAL_STATUSES.has(beforeComplete.status)) {
    return beforeComplete;
  }
  const completedAt = new Date().toISOString();
  await updateJobStatus(job.id, {
    status: 'completed',
    reportId: saved.id,
    result: {
      reportId: saved.id,
      gate: snapshot.summary.verdict,
      overallScore: snapshot.summary.overallScore,
      execution: executionDescriptor(running),
      diagnostics: collectObservationDiagnostics(observations)[0] ?? running.result?.diagnostics ?? null,
    },
    error: null,
    lastError: null,
    retryReason: null,
    claimedBy: null,
    workerId: null,
    lockedAt: null,
    claimedAt: null,
    nextRunAt: null,
    nextRetryAt: null,
    finishedAt: completedAt,
    completedAt,
  });
  await recordUsageEvent({
    organizationId: running.organizationId,
    projectId: running.projectId,
    runId: running.id,
    reportId: saved.id,
    eventType: 'run_completed',
    quantity: 1,
    metadata: { gate: snapshot.summary.verdict },
    idempotencyKey: `${running.id}:run_completed`,
  });
  return readJob(job.id);
}

async function runHttpRunnerBackedJob(job) {
  const runner = await getRunnerById(job.runnerId);
  if (!runner) {
    throw new AdapterExecutionError('Registered runner not found.', {
      adapterType: 'registered_runner',
      runnerId: job.runnerId ?? '',
      workerId: job.workerId ?? job.claimedBy ?? '',
      jobId: job.id,
      retryAttempt: job.attempts,
      benchmarkId: job.payload?.pack?.id ?? job.payload?.pack?.project ?? '',
      benchmarkVersion: job.payload?.pack?.version ?? null,
      failureClass: 'registered_runner_missing',
      rawErrorMessage: 'Registered runner not found.',
      phase: 'before_dispatch',
    });
  }
  const requestTimestamp = new Date().toISOString();

  const response = await runFetchWithTimeout(
    () => fetch(runner.endpointUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(runner.sharedSecret ? { authorization: `Bearer ${runner.sharedSecret}` } : {}),
      },
      body: JSON.stringify({
        jobId: job.id,
        profile: job.payload.profileId,
        preset: job.payload.presetId,
        thresholds: job.payload.thresholds,
        pack: job.payload.pack,
      }),
    }),
    job.timeoutMs,
    `Runner job ${job.id} timed out after ${job.timeoutMs}ms`,
  );

  if (!response.ok) {
    throw new AdapterExecutionError(`Runner returned HTTP ${response.status}`, {
      adapterType: 'registered-http-runner',
      runnerId: runner.id,
      target: runner.endpointUrl,
      requestTimestamp,
      responseTimestamp: new Date().toISOString(),
      httpStatus: response.status,
      workerId: job.workerId ?? job.claimedBy ?? '',
      jobId: job.id,
      retryAttempt: job.attempts,
      benchmarkId: job.payload?.pack?.id ?? job.payload?.pack?.project ?? '',
      benchmarkVersion: job.payload?.pack?.version ?? null,
      failureClass: classifyAdapterError(new Error(`Runner returned HTTP ${response.status}`), { httpStatus: response.status }),
      rawErrorMessage: `Runner returned HTTP ${response.status}`,
      phase: 'during_adapter_call',
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new AdapterExecutionError('Runner response must be JSON.', {
      adapterType: 'registered-http-runner',
      runnerId: runner.id,
      target: runner.endpointUrl,
      requestTimestamp,
      responseTimestamp: new Date().toISOString(),
      workerId: job.workerId ?? job.claimedBy ?? '',
      jobId: job.id,
      retryAttempt: job.attempts,
      benchmarkId: job.payload?.pack?.id ?? job.payload?.pack?.project ?? '',
      benchmarkVersion: job.payload?.pack?.version ?? null,
      failureClass: 'adapter_invalid_response',
      rawErrorMessage: 'Runner response must be JSON.',
      phase: 'during_parsing',
    });
  }
  if (await isJobCanceled(job.id)) return [];
  const observations = Array.isArray(payload) ? payload : payload.observations;
  if (!Array.isArray(observations)) {
    throw new AdapterExecutionError('Runner response must be an observation array or { observations }.', {
      adapterType: 'registered-http-runner',
      runnerId: runner.id,
      target: runner.endpointUrl,
      requestTimestamp,
      responseTimestamp: new Date().toISOString(),
      workerId: job.workerId ?? job.claimedBy ?? '',
      jobId: job.id,
      retryAttempt: job.attempts,
      benchmarkId: job.payload?.pack?.id ?? job.payload?.pack?.project ?? '',
      benchmarkVersion: job.payload?.pack?.version ?? null,
      failureClass: 'adapter_invalid_response',
      rawErrorMessage: 'Runner response must be an observation array or { observations }.',
      phase: 'during_parsing',
    });
  }
  return observations;
}

async function runLocalHttpTunnelBackedJob(job, executionTarget) {
  const observations = await dispatchLocalHttpTunnelJob({
    job,
    executionTarget,
    runToken: localTunnelRunTokenForNonce(executionTarget.tokenNonce),
    timeoutMs: job.timeoutMs,
    maxResponseBytes: executionTarget.maxResponseBytes,
  });
  if (await isJobCanceled(job.id)) return [];
  return observations;
}

async function runAdapterBackedJob(job, adapterConfig) {
  if (adapterConfig.type !== 'vercel-ai-sdk') {
    throw new Error(`Unsupported adapter job type: ${adapterConfig.type}`);
  }
  const result = await executeVercelAiSdkAdapterBenchmark(job.payload.pack, {
    ...adapterConfig,
    timeoutMs: job.timeoutMs || adapterConfig.timeoutMs,
  }, {
    environment: 'worker',
    shouldCancel: () => isJobCanceled(job.id),
    workerId: job.workerId ?? job.claimedBy ?? '',
    jobId: job.id,
    retryAttempt: job.attempts,
  });
  const failing = result.observations.find((observation) => observation?.metadata?.adapterDiagnostics?.failureClass);
  if (failing) {
    const diagnostics = failing.metadata.adapterDiagnostics;
    throw new AdapterExecutionError(failing.error ?? diagnostics.rawErrorMessage ?? 'Adapter execution failed.', diagnostics);
  }
  return result.observations;
}

async function runHostedProviderBackedJob(job, executionTarget) {
  const resolved = await resolveHostedProviderSecret({
    projectId: job.projectId,
    secretRef: executionTarget.secretRef,
    provider: executionTarget.provider,
    environment: executionTarget.environment ?? 'production',
  });
  let apiKey = resolved.secretValue;
  try {
    const result = await executeHostedProviderBenchmark(job.payload.pack, {
      provider: executionTarget.provider,
      model: executionTarget.model,
      secretRef: resolved.metadata.ref,
      secretResolver: async () => apiKey,
      timeoutMs: job.timeoutMs || executionTarget.timeoutMs || 30000,
      mode: executionTarget.mode ?? 'sample',
    }, {
      environment: 'worker',
      shouldCancel: () => isJobCanceled(job.id),
      workerId: job.workerId ?? job.claimedBy ?? '',
      jobId: job.id,
      retryAttempt: job.attempts,
    });
    const failing = result.observations.find((observation) => observation?.metadata?.diagnostics?.failureClass);
    if (failing) {
      throw new AdapterExecutionError(failing.error ?? failing.metadata.diagnostics.rawErrorMessage ?? 'Hosted provider execution failed.', failing.metadata.diagnostics);
    }
    return result.observations;
  } finally {
    apiKey = null;
  }
}

function failUnsupportedExecutionTarget(job, executionTarget) {
  throw new AdapterExecutionError(`Unsupported execution target type: ${executionTarget?.type ?? 'missing'}`, {
    adapterType: executionTarget?.type ?? '',
    workerId: job.workerId ?? job.claimedBy ?? '',
    jobId: job.id,
    retryAttempt: job.attempts,
    benchmarkId: job.payload?.pack?.id ?? job.payload?.pack?.project ?? '',
    benchmarkVersion: job.payload?.pack?.version ?? null,
    failureClass: executionTarget ? 'execution_target_unsupported' : 'execution_target_missing',
    rawErrorMessage: `Unsupported execution target type: ${executionTarget?.type ?? 'missing'}`,
    phase: 'before_dispatch',
  });
}

async function isJobCanceled(jobId) {
  const current = await readJob(jobId);
  return current?.status === 'canceled' || current?.status === 'cancelled';
}

async function markRunnerJobFailure(jobId, error) {
  const current = await readJob(jobId);
  if (!current || current.status === 'canceled') return current;
  const message = error instanceof Error ? error.message : String(error);
  const diagnostics = normalizeAdapterDiagnostics(error?.diagnostics, {
    adapterType: current.payload?.executionTarget?.type ?? current.payload?.adapter?.type ?? (current.runnerId ? 'registered-http-runner' : ''),
    target: current.payload?.executionTarget?.endpointUrl ?? current.payload?.executionTarget?.routeUrl ?? current.payload?.adapter?.target ?? '',
    runnerId: current.runnerId ?? '',
    workerId: current.workerId ?? current.claimedBy ?? '',
    jobId: current.id,
    retryAttempt: current.attempts,
    benchmarkId: current.payload?.pack?.id ?? current.payload?.pack?.project ?? '',
    benchmarkVersion: current.payload?.pack?.version ?? null,
    failureClass: error?.failureClass ?? classifyAdapterError(error),
    rawErrorMessage: message,
    phase: error?.diagnostics?.phase ?? 'during_adapter_call',
  });
  const canRetry = current.attempts < current.maxAttempts && adapterFailureRetryable(diagnostics.failureClass);
  const failedAt = canRetry ? null : new Date().toISOString();
  const nextRetryAt = canRetry ? retryReadyAt(current.retryBackoffMs) : null;
  if (!canRetry && current.organizationId) {
    await recordUsageEvent({
      organizationId: current.organizationId,
      projectId: current.projectId,
      runId: current.id,
      eventType: 'run_completed',
      quantity: 1,
      metadata: { status: 'failed', failureClass: diagnostics.failureClass },
      idempotencyKey: `${current.id}:run_completed`,
      createdAt: failedAt,
    });
  }
  return updateJobStatus(jobId, {
    status: canRetry ? 'retrying' : 'failed',
    error: message,
    lastError: message,
    retryReason: canRetry ? message : null,
    result: {
      ...(current.result ?? {}),
      execution: executionDescriptor(current),
      diagnostics,
      failureClass: diagnostics.failureClass,
      retryable: diagnostics.retryable,
    },
    claimedBy: null,
    workerId: null,
    lockedAt: null,
    claimedAt: null,
    nextRunAt: nextRetryAt,
    nextRetryAt,
    finishedAt: failedAt,
    failedAt,
  });
}

async function recoverStaleRunnerJobs({ projectId, staleAfterMs = Number(process.env.HARNESSAMP_WORKER_STALE_AFTER_MS ?? 120000) } = {}) {
  const leaseMs = normalizePositiveInteger(staleAfterMs, 120000);
  const cutoff = new Date(Date.now() - leaseMs).toISOString();
  const reason = `Worker lease expired after ${leaseMs}ms.`;

  if (useMemory()) {
    const recovered = [];
    for (const job of memory.jobs.values()) {
      if (projectId && job.projectId !== projectId) continue;
      if (!RUNNER_JOB_RECOVERABLE_STATUSES.has(job.status)) continue;
      const leaseTime = Date.parse(job.lockedAt ?? job.claimedAt ?? job.startedAt ?? job.updatedAt);
      if (!Number.isFinite(leaseTime) || leaseTime > Date.parse(cutoff)) continue;
      const canRetry = job.attempts < job.maxAttempts;
      const recoveredJob = await updateJobStatus(job.id, {
        status: canRetry ? 'retrying' : 'failed',
        error: canRetry ? job.error : job.error ?? reason,
        lastError: job.lastError ?? job.error ?? reason,
        retryReason: canRetry ? reason : null,
        claimedBy: null,
        workerId: null,
        lockedAt: null,
        claimedAt: null,
        nextRunAt: canRetry ? new Date().toISOString() : null,
        nextRetryAt: canRetry ? new Date().toISOString() : null,
        finishedAt: canRetry ? null : new Date().toISOString(),
        failedAt: canRetry ? null : new Date().toISOString(),
      });
      if (recoveredJob) recovered.push(recoveredJob);
    }
    return recovered;
  }

  await ensureSchema();
  const result = await query(
    `update runner_jobs
     set status = case when attempts < max_attempts then 'retrying' else 'failed' end,
         error = case when attempts < max_attempts then error else coalesce(error, $3) end,
         last_error = coalesce(last_error, error, $3),
         retry_reason = case when attempts < max_attempts then $3 else null end,
         history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'status', case when attempts < max_attempts then 'retrying' else 'failed' end,
           'message', 'Recovered stale worker lease.',
           'error', $3,
           'attempts', attempts,
           'createdAt', $4
         )),
         claimed_by = null,
         worker_id = null,
         locked_at = null,
         claimed_at = null,
         next_run_at = case when attempts < max_attempts then $4::timestamptz else null end,
         next_retry_at = case when attempts < max_attempts then $4::timestamptz else null end,
         finished_at = case when attempts < max_attempts then null else $4::timestamptz end,
         failed_at = case when attempts < max_attempts then null else $4::timestamptz end,
         updated_at = $4
     where ($1::text is null or project_id = $1)
       and status in ('claimed', 'running')
       and coalesce(locked_at, claimed_at, started_at, updated_at) <= $2::timestamptz
     returning *`,
    [projectId ?? null, cutoff, reason, new Date().toISOString()],
  );
  return result.rows.map(normalizeJobRow);
}

async function claimJobForWorker(job, workerId) {
  const normalizedWorkerId = normalizeOptionalText(workerId) ?? 'api-worker';
  if (!useMemory()) {
    await ensureSchema();
    const updated = await query(
      `update runner_jobs
       set status = 'claimed',
           attempts = attempts + 1,
           error = null,
           last_error = null,
           retry_reason = null,
           history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
             'status', 'claimed',
             'message', 'Worker claimed job.',
             'attempts', attempts + 1,
             'claimedBy', $2,
             'createdAt', $3
           )),
           claimed_by = $2,
           worker_id = $2,
           locked_at = $3,
           claimed_at = $3,
           next_run_at = null,
           next_retry_at = null,
           finished_at = null,
           updated_at = $3
       where id = $1
         and status in ('queued', 'retrying')
         and attempts < max_attempts
         and (next_run_at is null or next_run_at <= $3)
       returning *`,
      [job.id, normalizedWorkerId, new Date().toISOString()],
    );
    if (updated.rows[0]) return normalizeJobRow(updated.rows[0]);

    const fresh = await readJob(job.id);
    if (fresh && RUNNER_JOB_CLAIMABLE_STATUSES.has(fresh.status) && fresh.attempts >= fresh.maxAttempts) {
      return updateJobStatus(fresh.id, {
        status: 'failed',
        error: fresh.error ?? 'Runner job exhausted all attempts.',
        finishedAt: new Date().toISOString(),
      });
    }
    return null;
  }

  const current = memory.jobs.get(job.id);
  if (!current) return null;
  if (!RUNNER_JOB_CLAIMABLE_STATUSES.has(current.status)) return null;
  if (!isJobDue(current)) return null;
  if (current.attempts >= current.maxAttempts) {
    return updateJobStatus(current.id, {
      status: 'failed',
      error: current.error ?? 'Runner job exhausted all attempts.',
      finishedAt: new Date().toISOString(),
    });
  }
  const claimedAt = new Date().toISOString();
  return updateJobStatus(current.id, {
    status: 'claimed',
    attempts: current.attempts + 1,
    error: null,
    lastError: null,
    retryReason: null,
    claimedBy: normalizedWorkerId,
    workerId: normalizedWorkerId,
    lockedAt: claimedAt,
    claimedAt,
    nextRunAt: null,
    nextRetryAt: null,
    finishedAt: null,
  });
}

function isJobDue(job) {
  if (!job.nextRunAt) return true;
  return new Date(job.nextRunAt).getTime() <= Date.now();
}

function retryReadyAt(retryBackoffMs) {
  const delay = normalizeNonNegativeInteger(retryBackoffMs, 0);
  return new Date(Date.now() + delay).toISOString();
}

async function runFetchWithTimeout(fn, timeoutMs, message) {
  const limit = normalizeNonNegativeInteger(timeoutMs, 0);
  if (limit <= 0) return fn();
  let timeout;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), limit);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function persistReport({ snapshot, projectId, workspaceId, organizationId = null, userId }) {
  const reportId = snapshot.id ?? createId('report');
  const safeSnapshot = sanitizeDebugPayload(snapshot);
  const report = {
    id: reportId,
    projectId,
    workspaceId,
    organizationId,
    createdBy: userId,
    gate: snapshot.summary?.verdict ?? 'warn',
    summary: sanitizeDebugPayload(snapshot.summary ?? {}),
    snapshot: {
      ...safeSnapshot,
      id: reportId,
    },
    createdAt: new Date().toISOString(),
  };

  if (useMemory()) {
    memory.reports.set(report.id, report);
    return { id: report.id, storage: 'memory' };
  }

  await ensureSchema();
  await query(
    `insert into reports (id, project_id, workspace_id, organization_id, created_by, gate, summary, snapshot)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (id) do update set
       gate = excluded.gate,
       summary = excluded.summary,
       snapshot = excluded.snapshot`,
    [report.id, projectId, workspaceId, organizationId, userId, report.gate, report.summary, report.snapshot],
  );
  return { id: report.id, storage: 'postgres' };
}

async function persistJob({
  id,
  projectId,
  organizationId = null,
  runnerId,
  userId,
  workspaceId,
  status,
  idempotencyKey,
  payload,
  attempts,
  maxAttempts,
  timeoutMs,
  retryBackoffMs,
}) {
  const job = {
    id,
    projectId,
    organizationId,
    runnerId,
    userId,
    workspaceId,
    status,
    idempotencyKey,
    payload,
    result: null,
    reportId: null,
    error: null,
    lastError: null,
    retryReason: null,
    history: [jobHistoryEntry({ status, message: 'Job queued for worker execution.' })],
    attempts,
    maxAttempts,
    timeoutMs,
    retryBackoffMs,
    claimedBy: null,
    workerId: null,
    lockedAt: null,
    claimedAt: null,
    nextRunAt: null,
    nextRetryAt: null,
    startedAt: null,
    finishedAt: null,
    completedAt: null,
    failedAt: null,
    canceledAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (useMemory()) {
    memory.jobs.set(job.id, job);
    return job;
  }

  await ensureSchema();
  const result = await query(
    `insert into runner_jobs
       (id, project_id, organization_id, workspace_id, runner_id, created_by, status, idempotency_key, payload, result, error, history, attempts, max_attempts, timeout_ms, retry_backoff_ms)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, null, $10, $11, $12, $13, $14)
     returning *`,
    [id, projectId, organizationId, workspaceId, runnerId, userId, status, idempotencyKey, payload, job.history, attempts, maxAttempts, timeoutMs, retryBackoffMs],
  );
  return normalizeJobRow(result.rows[0]);
}

async function updateJobStatus(jobId, patch) {
  if (useMemory()) {
    const existing = memory.jobs.get(jobId);
    if (!existing) return null;
    const next = {
      ...existing,
      ...patch,
      history: appendJobHistory(existing, patch),
      updatedAt: new Date().toISOString(),
    };
    memory.jobs.set(jobId, next);
    return next;
  }

  await ensureSchema();
  const current = await query('select * from runner_jobs where id = $1 limit 1', [jobId]);
  if (!current.rows[0]) return null;

  const row = normalizeJobRow(current.rows[0]);
  const next = {
    ...row,
    ...patch,
    history: appendJobHistory(row, patch),
    updatedAt: new Date().toISOString(),
  };

  const updated = await query(
    `update runner_jobs
     set status = $2,
         report_id = $3,
         result = $4,
         error = $5,
         last_error = $6,
         retry_reason = $7,
         history = $8,
         attempts = $9,
         max_attempts = $10,
         timeout_ms = $11,
         retry_backoff_ms = $12,
         claimed_by = $13,
         worker_id = $14,
         locked_at = $15,
         claimed_at = $16,
         next_run_at = $17,
         next_retry_at = $18,
         started_at = $19,
         finished_at = $20,
         completed_at = $21,
         failed_at = $22,
         cancelled_at = $23,
         updated_at = $24
     where id = $1
     returning *`,
    [
      jobId,
      next.status,
      next.reportId ?? null,
      next.result ?? null,
      next.error ?? null,
      next.lastError ?? next.error ?? null,
      next.retryReason ?? null,
      next.history,
      next.attempts,
      next.maxAttempts,
      next.timeoutMs,
      next.retryBackoffMs,
      next.claimedBy ?? null,
      next.workerId ?? next.claimedBy ?? null,
      next.lockedAt ?? null,
      next.claimedAt ?? next.lockedAt ?? null,
      next.nextRunAt ?? null,
      next.nextRetryAt ?? next.nextRunAt ?? null,
      next.startedAt ?? null,
      next.finishedAt ?? null,
      next.completedAt ?? (next.status === 'completed' ? next.finishedAt : null),
      next.failedAt ?? (next.status === 'failed' ? next.finishedAt : null),
      next.cancelledAt ?? next.canceledAt ?? (next.status === 'canceled' || next.status === 'cancelled' ? next.finishedAt : null),
      next.updatedAt,
    ],
  );
  return normalizeJobRow(updated.rows[0]);
}

async function readJob(jobId) {
  if (useMemory()) {
    return memory.jobs.get(jobId) ?? null;
  }

  await ensureSchema();
  const result = await query('select * from runner_jobs where id = $1 limit 1', [jobId]);
  return result.rows[0] ? normalizeJobRow(result.rows[0]) : null;
}

async function findRunnerJobByIdempotencyKey({ projectId, runnerId, idempotencyKey }) {
  if (!idempotencyKey) return null;
  if (useMemory()) {
    return Array.from(memory.jobs.values()).find((job) => (
      job.projectId === projectId
      && job.runnerId === runnerId
      && job.idempotencyKey === idempotencyKey
    )) ?? null;
  }

  await ensureSchema();
  const result = await query(
    `select * from runner_jobs
     where project_id = $1 and runner_id is not distinct from $2 and idempotency_key = $3
     limit 1`,
    [projectId, runnerId, idempotencyKey],
  );
  return result.rows[0] ? normalizeJobRow(result.rows[0]) : null;
}

async function getRunnerById(runnerId) {
  if (useMemory()) {
    return memory.runners.get(runnerId) ?? null;
  }

  await ensureSchema();
  const result = await query('select * from runner_registrations where id = $1 limit 1', [runnerId]);
  return result.rows[0] ? normalizeRunnerRow(result.rows[0]) : null;
}

async function readBenchmarkPack(benchmarkId) {
  if (!benchmarkId) return null;
  if (useMemory()) {
    return memory.benchmarkPacks.get(benchmarkId) ?? null;
  }

  await ensureSchema();
  const result = await query('select * from benchmark_packs where id = $1 limit 1', [benchmarkId]);
  return result.rows[0] ? normalizeBenchmarkPackRow(result.rows[0]) : null;
}

async function readBenchmarkVersion(versionId) {
  if (!versionId) return null;
  if (useMemory()) {
    return memory.benchmarkVersions.get(versionId) ?? null;
  }

  await ensureSchema();
  const result = await query('select * from benchmark_versions where id = $1 limit 1', [versionId]);
  return result.rows[0] ? normalizeBenchmarkVersionRow(result.rows[0]) : null;
}

async function readPromotionCandidate(candidateId) {
  if (!candidateId) return null;
  if (useMemory()) {
    return memory.promotionCandidates.get(candidateId) ?? null;
  }

  await ensureSchema();
  const result = await query('select * from promotion_candidates where id = $1 limit 1', [candidateId]);
  return result.rows[0] ? normalizePromotionCandidateRow(result.rows[0]) : null;
}

export async function listOrganizationMembers({ organizationId, userId }) {
  await requireOrgPermission({ organizationId, userId, permission: 'manageOrgSettings' });
  if (useMemory()) {
    return Array.from(memory.organizationMembers.values())
      .filter((member) => member.organizationId === organizationId && member.status !== 'removed')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
  await ensureSchema();
  const result = await query(
    `select * from organization_members
     where organization_id = $1 and status <> 'removed'
     order by created_at asc`,
    [organizationId],
  );
  return result.rows.map(normalizeOrganizationMemberRow);
}

export async function inviteOrganizationMember({ organizationId, userId, email, role = 'viewer' }) {
  await requireOrgPermission({ organizationId, userId, permission: 'inviteMembers' });
  const normalizedEmail = normalizeOptionalText(email)?.toLowerCase();
  if (!normalizedEmail) throw new Error('Member email is required');
  const normalizedRole = normalizeOrgRole(role);
  const invitedUser = await findUserByEmail(normalizedEmail);
  const now = new Date().toISOString();
  const member = {
    id: createId('om'),
    organizationId,
    userId: invitedUser?.id ?? null,
    email: normalizedEmail,
    role: normalizedRole,
    status: invitedUser ? 'active' : 'invited',
    invitedAt: invitedUser ? null : now,
    joinedAt: invitedUser ? now : null,
    createdAt: now,
    updatedAt: now,
  };
  if (useMemory()) {
    memory.organizationMembers.set(organizationMemberKey(member), member);
    return member;
  }
  await ensureSchema();
  const result = await query(
    `insert into organization_members
       (id, organization_id, user_id, email, role, status, invited_at, joined_at, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     on conflict (organization_id, email) do update set
       user_id = excluded.user_id,
       role = excluded.role,
       status = excluded.status,
       invited_at = excluded.invited_at,
       joined_at = excluded.joined_at,
       updated_at = excluded.updated_at
     returning *`,
    [member.id, organizationId, invitedUser?.id ?? null, normalizedEmail, normalizedRole, member.status, member.invitedAt, member.joinedAt, now],
  );
  return normalizeOrganizationMemberRow(result.rows[0]);
}

export async function updateOrganizationMember({ organizationId, memberId, userId, role = null, status = null }) {
  if (role) await requireOrgPermission({ organizationId, userId, permission: 'changeMemberRoles' });
  if (status === 'removed') await requireOrgPermission({ organizationId, userId, permission: 'removeMembers' });
  const existing = await readOrganizationMember(organizationId, memberId);
  if (!existing) return null;
  const nextRole = role ? normalizeOrgRole(role) : existing.role;
  const nextStatus = status ? normalizeMemberStatus(status) : existing.status;
  if (existing.role === 'owner' && (nextRole !== 'owner' || nextStatus === 'removed')) {
    await assertNotLastOwner(organizationId, existing.id);
  }
  const now = new Date().toISOString();
  if (useMemory()) {
    const next = { ...existing, role: nextRole, status: nextStatus, updatedAt: now };
    memory.organizationMembers.set(organizationMemberKey(next), next);
    return next;
  }
  await ensureSchema();
  const result = await query(
    `update organization_members
     set role = $3, status = $4, updated_at = $5
     where organization_id = $1 and id = $2
     returning *`,
    [organizationId, memberId, nextRole, nextStatus, now],
  );
  return result.rows[0] ? normalizeOrganizationMemberRow(result.rows[0]) : null;
}

export async function removeOrganizationMember({ organizationId, memberId, userId }) {
  return updateOrganizationMember({ organizationId, memberId, userId, status: 'removed' });
}

export async function updateOrganization({ organizationId, userId, name = null, status = null }) {
  await requireOrgPermission({ organizationId, userId, permission: 'manageOrgSettings' });
  const organization = await readOrganization(organizationId);
  if (!organization) return null;
  const now = new Date().toISOString();
  const next = {
    ...organization,
    name: normalizeOptionalText(name) ?? organization.name,
    slug: name ? slugify(name) : organization.slug,
    status: normalizeOrgStatus(status ?? organization.status),
    updatedAt: now,
  };
  if (useMemory()) {
    memory.organizations.set(organizationId, next);
    return organizationSummary(next, organizationMemberForUser(organizationId, userId));
  }
  await ensureSchema();
  const result = await query(
    `update organizations
     set name = $2, slug = $3, status = $4, updated_at = $5
     where id = $1
     returning *`,
    [organizationId, next.name, next.slug, next.status, now],
  );
  return result.rows[0] ? organizationSummary(normalizeOrganizationRow(result.rows[0]), await getOrganizationMemberForUser({ organizationId, userId })) : null;
}

export async function deleteOrganization({ organizationId, userId }) {
  await requireOrgPermission({ organizationId, userId, permission: 'deleteOrganization' });
  if (useMemory()) {
    const organization = memory.organizations.get(organizationId);
    if (!organization) return null;
    const next = { ...organization, status: 'canceled', updatedAt: new Date().toISOString() };
    memory.organizations.set(organizationId, next);
    return organizationSummary(next, organizationMemberForUser(organizationId, userId));
  }
  await ensureSchema();
  const result = await query(
    `update organizations set status = 'canceled', updated_at = now() where id = $1 returning *`,
    [organizationId],
  );
  return result.rows[0] ? organizationSummary(normalizeOrganizationRow(result.rows[0]), await getOrganizationMemberForUser({ organizationId, userId })) : null;
}

export async function getOrganizationPlan({ organizationId, userId }) {
  const organization = await getOrganization({ organizationId, userId });
  if (!organization) return null;
  return {
    organizationId,
    currentPlan: organization.plan,
    definition: planDefinition(organization.plan),
  };
}

export async function updateOrganizationPlan({ organizationId, userId, plan }) {
  await requireOrgPermission({ organizationId, userId, permission: 'manageBilling' });
  const normalizedPlan = normalizePlan(plan);
  const now = new Date().toISOString();
  if (useMemory()) {
    const organization = memory.organizations.get(organizationId);
    if (!organization) return null;
    const next = { ...organization, plan: normalizedPlan, updatedAt: now };
    memory.organizations.set(organizationId, next);
    return { organizationId, currentPlan: normalizedPlan, definition: planDefinition(normalizedPlan) };
  }
  await ensureSchema();
  const result = await query(
    `update organizations set plan = $2, updated_at = $3 where id = $1 returning *`,
    [organizationId, normalizedPlan, now],
  );
  return result.rows[0] ? { organizationId, currentPlan: normalizedPlan, definition: planDefinition(normalizedPlan) } : null;
}

export async function recordUsageEvent({
  organizationId,
  projectId = null,
  runId = null,
  reportId = null,
  eventType,
  quantity = 1,
  metadata = {},
  idempotencyKey = null,
}) {
  if (!organizationId || !eventType) return null;
  const event = {
    id: createId('usage'),
    organizationId,
    projectId,
    runId,
    reportId,
    eventType,
    quantity: Number(quantity) || 0,
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? sanitizeDebugPayload(metadata) : {},
    idempotencyKey,
    createdAt: new Date().toISOString(),
  };
  if (useMemory()) {
    if (idempotencyKey) {
      const duplicate = Array.from(memory.usageEvents.values()).find((item) => item.organizationId === organizationId && item.idempotencyKey === idempotencyKey);
      if (duplicate) return duplicate;
    }
    memory.usageEvents.set(event.id, event);
    return event;
  }
  await ensureSchema();
  const result = await query(
    `insert into usage_events
       (id, organization_id, project_id, run_id, report_id, event_type, quantity, metadata, idempotency_key, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (organization_id, idempotency_key) do nothing
     returning *`,
    [event.id, organizationId, projectId, runId, reportId, eventType, event.quantity, event.metadata, idempotencyKey, event.createdAt],
  );
  return result.rows[0] ? normalizeUsageEventRow(result.rows[0]) : null;
}

export async function getOrgUsageForPeriod({ organizationId, userId = null, periodStart = null, periodEnd = null } = {}) {
  if (userId) await requireOrgPermission({ organizationId, userId, permission: 'viewRun' });
  const period = {
    periodStart: periodStart ?? monthPeriod().periodStart,
    periodEnd: periodEnd ?? monthPeriod().periodEnd,
  };
  const events = await listUsageEventsForPeriod({ organizationId, ...period });
  const totals = aggregateUsageEvents(events);
  const organization = await readOrganization(organizationId);
  const definition = planDefinition(organization?.plan ?? 'free');
  return {
    organizationId,
    period,
    plan: definition.plan,
    limits: definition.limits,
    features: definition.features,
    totals,
    remaining: {
      monthlyRuns: Math.max(0, definition.limits.monthlyRuns - totals.runCount),
      monthlyScenarios: Math.max(0, definition.limits.monthlyScenarios - totals.scenarioCount),
      monthlyProviderCalls: Math.max(0, definition.limits.monthlyProviderCalls - totals.providerCallCount),
      monthlyExecutionMinutes: Math.max(0, definition.limits.monthlyExecutionMinutes - totals.executionMinutes),
    },
    events,
  };
}

export async function estimateOrganizationRunUsage({ organizationId, userId, pack, benchmark = null, tier = null, runMode = 'sample', mutationConfig = null, executionTarget = null, ciGate = false }) {
  await requireOrgPermission({ organizationId, userId, permission: 'createRun' });
  const usage = await getOrgUsageForPeriod({ organizationId });
  const organization = await readOrganization(organizationId);
  const estimate = estimateRunUsage({ benchmark, pack, tier, runMode, mutationConfig });
  return evaluateRunEntitlements({
    plan: organization?.plan ?? 'free',
    usage: usage.totals,
    estimate,
    executionTarget,
    runMode,
    ciGate,
  });
}

async function buildBenchmarkDetail(benchmark) {
  if (useMemory()) {
    const versions = benchmarkVersionsFor(benchmark.id).sort((left, right) => right.versionNumber - left.versionNumber);
    const reviews = Array.from(memory.benchmarkReviews.values())
      .filter((review) => review.benchmarkId === benchmark.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const reviewAssignments = Array.from(memory.benchmarkReviewAssignments.values())
      .filter((assignment) => assignment.benchmarkId === benchmark.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const promotionCandidates = Array.from(memory.promotionCandidates.values())
      .filter((candidate) => candidate.benchmarkId === benchmark.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const goldenCases = Array.from(memory.goldenCases.values())
      .filter((item) => item.benchmarkId === benchmark.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return {
      benchmark: benchmarkPackSummary(benchmark),
      versions: summarizeBenchmarkVersions(versions),
      reviews,
      reviewAssignments,
      promotionCandidates,
      goldenCases,
    };
  }

  await ensureSchema();
  const [versions, reviews, reviewAssignments, promotionCandidates, goldenCases] = await Promise.all([
    query('select * from benchmark_versions where benchmark_pack_id = $1 order by version_number desc', [benchmark.id]),
    query('select * from benchmark_reviews where benchmark_pack_id = $1 order by created_at desc', [benchmark.id]),
    query('select * from benchmark_review_assignments where benchmark_pack_id = $1 order by created_at desc', [benchmark.id]),
    query('select * from promotion_candidates where benchmark_pack_id = $1 order by created_at desc', [benchmark.id]),
    query('select * from golden_cases where benchmark_pack_id = $1 order by created_at desc', [benchmark.id]),
  ]);
  return {
    benchmark: benchmarkPackSummary(benchmark),
    versions: summarizeBenchmarkVersions(versions.rows.map(normalizeBenchmarkVersionRow)),
    reviews: reviews.rows.map(normalizeBenchmarkReviewRow),
    reviewAssignments: reviewAssignments.rows.map(normalizeBenchmarkReviewAssignmentRow),
    promotionCandidates: promotionCandidates.rows.map(normalizePromotionCandidateRow),
    goldenCases: goldenCases.rows.map(normalizeGoldenCaseRow),
  };
}

async function getProjectMembership(userId, projectId) {
  if (useMemory()) {
    const project = memory.projects.get(projectId);
    if (!project) return null;
    const role = projectRoleFor(projectId, userId);
    if (!role) return null;
    return {
      projectId,
      organizationId: project.organizationId ?? memory.workspaces.get(project.workspaceId)?.organizationId ?? null,
      workspaceId: project.workspaceId,
      role,
    };
  }

  await ensureSchema();
  const result = await query(
    `select p.id as project_id,
            coalesce(p.organization_id, w.organization_id) as organization_id,
            p.workspace_id,
            coalesce(om.role, pm.role, case when w.owner_user_id = $1 then 'owner' else null end) as role
     from projects p
     join workspaces w on w.id = p.workspace_id
     left join organization_members om on om.organization_id = coalesce(p.organization_id, w.organization_id) and om.user_id = $1 and om.status = 'active'
     left join project_memberships pm on pm.project_id = p.id and pm.user_id = $1
     where p.id = $2 and (w.owner_user_id = $1 or pm.user_id = $1 or om.user_id = $1)
     limit 1`,
    [userId, projectId],
  );

  if (!result.rows[0]) return null;
  return {
    projectId: result.rows[0].project_id,
    organizationId: result.rows[0].organization_id,
    workspaceId: result.rows[0].workspace_id,
    role: normalizeOrgRole(result.rows[0].role, 'viewer'),
  };
}

function workspaceHasMember(workspaceId, userId) {
  return Array.from(memory.projects.values()).some((project) => project.workspaceId === workspaceId && projectRoleFor(project.id, userId));
}

function projectRoleFor(projectId, userId) {
  const membership = memory.memberships.get(`${projectId}:${userId}`);
  const project = memory.projects.get(projectId);
  if (!project) return null;
  const orgMember = organizationMemberForUser(project.organizationId ?? memory.workspaces.get(project.workspaceId)?.organizationId, userId);
  if (orgMember) return orgMember.role;
  if (membership) return normalizeLegacyRole(membership.role);
  const workspace = memory.workspaces.get(project.workspaceId);
  return workspace?.ownerUserId === userId ? 'owner' : null;
}

function canMutateProject(role) {
  return ['owner', 'admin', 'developer', 'maintainer'].includes(role);
}

function normalizeLegacyRole(role) {
  if (role === 'maintainer') return 'developer';
  return normalizeOrgRole(role, role);
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const SUPPORTED_HOSTED_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'custom']);
const EXECUTABLE_HOSTED_PROVIDERS = new Set(['openai', 'anthropic']);
const SECRET_ENVIRONMENTS = new Set(['development', 'staging', 'production']);

function normalizeProvider(value) {
  const provider = normalizeOptionalText(value)?.toLowerCase() ?? '';
  return SUPPORTED_HOSTED_PROVIDERS.has(provider) ? provider : null;
}

function normalizeSecretEnvironment(value) {
  const environment = normalizeOptionalText(value)?.toLowerCase() ?? 'production';
  if (!SECRET_ENVIRONMENTS.has(environment)) throw new Error('Secret environment must be development, staging, or production');
  return environment;
}

function defaultValidationModel(provider) {
  if (provider === 'anthropic') return 'claude-3-5-haiku-latest';
  return 'gpt-4.1-mini';
}

async function updateProjectSecretStatus({ projectId, secretId, userId, status }) {
  await requireProjectPermission({ userId, projectId, permission: 'manageSecrets' });
  const existing = await readProjectSecret(secretId);
  if (!existing || existing.projectId !== projectId) return null;
  const next = { ...existing, status, updatedAt: new Date().toISOString() };
  if (useMemory()) {
    memory.projectSecrets.set(secretId, next);
    return projectSecretSummary(next);
  }
  await ensureSchema();
  const result = await query(
    `update project_secrets
     set status = $3, updated_at = $4
     where id = $1 and project_id = $2
     returning *`,
    [secretId, projectId, status, next.updatedAt],
  );
  return result.rows[0] ? projectSecretSummary(normalizeProjectSecretRow(result.rows[0])) : null;
}

async function updateProjectSecretValidation({
  projectId,
  secretId,
  validationStatus,
  lastValidationErrorClass,
  lastValidationError,
}) {
  const now = new Date().toISOString();
  if (useMemory()) {
    const existing = memory.projectSecrets.get(secretId);
    if (!existing || existing.projectId !== projectId) return null;
    const next = {
      ...existing,
      validationStatus,
      lastValidationErrorClass,
      lastValidationError,
      updatedAt: now,
    };
    memory.projectSecrets.set(secretId, next);
    return projectSecretSummary(next);
  }
  await ensureSchema();
  const result = await query(
    `update project_secrets
     set validation_status = $3,
         last_validation_error_class = $4,
         last_validation_error = $5,
         updated_at = $6
     where id = $1 and project_id = $2
     returning *`,
    [secretId, projectId, validationStatus, lastValidationErrorClass, lastValidationError, now],
  );
  return result.rows[0] ? projectSecretSummary(normalizeProjectSecretRow(result.rows[0])) : null;
}

async function validateHostedProviderTargetForProject({ projectId, target }) {
  assertHostedByokEnabled();
  if (!EXECUTABLE_HOSTED_PROVIDERS.has(target.provider)) {
    throw new Error(`Hosted provider execution is not implemented for ${target.provider}.`);
  }
  if (!target.model) throw new Error('hosted_provider execution target requires model.');
  if (!target.secretRef) throw new Error('hosted_provider execution target requires secretRef.');
  const secret = await readProjectSecret(target.secretRef);
  if (!secret || secret.projectId !== projectId || secret.status === 'deleted') {
    throw new Error('Hosted provider secret not found.');
  }
  if (secret.status !== 'active') {
    throw new Error('Hosted provider secret is disabled.');
  }
  if (secret.provider !== target.provider) {
    throw new Error('Hosted provider secret provider mismatch.');
  }
  if ((secret.environment ?? 'production') !== (target.environment ?? 'production')) {
    throw new Error('Hosted provider secret environment mismatch.');
  }
}

async function readProjectSecret(secretId) {
  if (!secretId) return null;
  if (useMemory()) return memory.projectSecrets.get(secretId) ?? null;
  await ensureSchema();
  const result = await query('select * from project_secrets where id = $1 limit 1', [secretId]);
  return result.rows[0] ? normalizeProjectSecretRow(result.rows[0]) : null;
}

async function markProjectSecretUsed(secretId) {
  const now = new Date().toISOString();
  if (useMemory()) {
    const existing = memory.projectSecrets.get(secretId);
    if (existing) memory.projectSecrets.set(secretId, { ...existing, lastUsedAt: now, updatedAt: now });
    return;
  }
  await ensureSchema();
  await query('update project_secrets set last_used_at = $2, updated_at = $2 where id = $1', [secretId, now]);
}

function projectSecretSummary(secret) {
  return {
    id: secret.id,
    ref: secret.id,
    projectId: secret.projectId,
    organizationId: secret.organizationId ?? null,
    environment: secret.environment ?? 'production',
    provider: secret.provider,
    name: secret.displayName,
    displayName: secret.displayName,
    configured: secret.status === 'active',
    maskedValue: secret.maskedPreview,
    maskedPreview: secret.maskedPreview,
    status: secret.status,
    validationStatus: secret.validationStatus ?? null,
    lastValidationErrorClass: secret.lastValidationErrorClass ?? null,
    lastValidationError: secret.lastValidationError ?? null,
    createdBy: secret.createdBy ?? null,
    createdAt: secret.createdAt,
    updatedAt: secret.updatedAt,
    lastUsedAt: secret.lastUsedAt ?? null,
  };
}

async function checkRunEntitlement({ organizationId, executionTarget, pack, runMode = 'sample', ciGate = false }) {
  const organization = await readOrganization(organizationId);
  const usage = await getOrgUsageForPeriod({ organizationId });
  const estimate = estimateRunUsage({ pack, runMode });
  return evaluateRunEntitlements({
    plan: organization?.plan ?? 'free',
    usage: usage.totals,
    estimate,
    executionTarget,
    runMode,
    ciGate,
  });
}

export async function requireOrgPermission({ organizationId, userId, permission }) {
  const member = await getOrganizationMemberForUser({ organizationId, userId });
  if (!member || member.status !== 'active') {
    throw new Error('Organization membership not found');
  }
  if (!canRole(member.role, permission)) {
    throw new Error(`Organization permission denied: ${permission}`);
  }
  return member;
}

async function requireProjectPermission({ userId, projectId, permission }) {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership) throw new Error('Project membership not found');
  if (!canRole(membership.role, permission)) {
    throw new Error(`Organization permission denied: ${permission}`);
  }
  return membership;
}

function requireOrgPermissionSync({ organizationId, userId, permission }) {
  const member = organizationMemberForUser(organizationId, userId);
  if (!member || member.status !== 'active') throw new Error('Organization membership not found');
  if (!canRole(member.role, permission)) throw new Error(`Organization permission denied: ${permission}`);
  return member;
}

async function readOrganization(organizationId) {
  if (!organizationId) return null;
  if (useMemory()) return memory.organizations.get(organizationId) ?? null;
  await ensureSchema();
  const result = await query('select * from organizations where id = $1 limit 1', [organizationId]);
  return result.rows[0] ? normalizeOrganizationRow(result.rows[0]) : null;
}

async function getOrganizationMemberForUser({ organizationId, userId }) {
  if (!organizationId || !userId) return null;
  if (useMemory()) return organizationMemberForUser(organizationId, userId);
  await ensureSchema();
  const result = await query(
    `select * from organization_members
     where organization_id = $1 and user_id = $2 and status = 'active'
     limit 1`,
    [organizationId, userId],
  );
  return result.rows[0] ? normalizeOrganizationMemberRow(result.rows[0]) : null;
}

async function findUserByEmail(email) {
  const normalizedEmail = normalizeOptionalText(email)?.toLowerCase();
  if (!normalizedEmail) return null;
  if (useMemory()) {
    return Array.from(memory.users.values()).find((user) => String(user.email ?? '').toLowerCase() === normalizedEmail) ?? null;
  }
  await ensureSchema();
  const result = await query('select * from users where lower(email) = $1 limit 1', [normalizedEmail]);
  return result.rows[0] ? normalizeUserRow(result.rows[0]) : null;
}

function organizationMemberForUser(organizationId, userId) {
  return Array.from(memory.organizationMembers.values()).find((member) => (
    member.organizationId === organizationId
    && member.userId === userId
    && member.status === 'active'
  )) ?? null;
}

async function readOrganizationMember(organizationId, memberId) {
  if (useMemory()) {
    return Array.from(memory.organizationMembers.values()).find((member) => member.organizationId === organizationId && member.id === memberId) ?? null;
  }
  await ensureSchema();
  const result = await query(
    `select * from organization_members where organization_id = $1 and id = $2 limit 1`,
    [organizationId, memberId],
  );
  return result.rows[0] ? normalizeOrganizationMemberRow(result.rows[0]) : null;
}

async function assertNotLastOwner(organizationId, excludingMemberId) {
  const owners = useMemory()
    ? Array.from(memory.organizationMembers.values()).filter((member) => member.organizationId === organizationId && member.role === 'owner' && member.status === 'active' && member.id !== excludingMemberId)
    : (await query(
      `select id from organization_members
       where organization_id = $1 and role = 'owner' and status = 'active' and id <> $2`,
      [organizationId, excludingMemberId],
    )).rows;
  if (!owners.length) throw new Error('Organization must have at least one owner');
}

async function listUsageEventsForPeriod({ organizationId, periodStart, periodEnd }) {
  if (useMemory()) {
    return Array.from(memory.usageEvents.values())
      .filter((event) => event.organizationId === organizationId)
      .filter((event) => event.createdAt >= periodStart && event.createdAt < periodEnd)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
  await ensureSchema();
  const result = await query(
    `select * from usage_events
     where organization_id = $1 and created_at >= $2 and created_at < $3
     order by created_at asc`,
    [organizationId, periodStart, periodEnd],
  );
  return result.rows.map(normalizeUsageEventRow);
}

function createOrganizationRecord({ name, plan = 'free', status = 'active', now = new Date().toISOString() }) {
  return {
    id: createId('org'),
    name,
    slug: uniqueMemoryOrgSlug(slugify(name)),
    plan: normalizePlan(plan),
    status: normalizeOrgStatus(status),
    createdAt: now,
    updatedAt: now,
  };
}

function organizationSummary(organization, member = null) {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    plan: normalizePlan(organization.plan),
    status: organization.status,
    role: member?.role ?? null,
    permissions: member?.role ? rolePermissions(member.role) : {},
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  };
}

function organizationMemberKey(member) {
  return `${member.organizationId}:${member.userId ?? member.email}`;
}

function userEmailFor(userId) {
  return memory.users.get(userId)?.email ?? `${userId}@harnessamp.local`;
}

function uniqueMemoryOrgSlug(base) {
  let slug = base || 'organization';
  let suffix = 2;
  const existing = new Set(Array.from(memory.organizations.values()).map((org) => org.slug));
  while (existing.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

async function uniqueOrganizationSlug(base) {
  let slug = base || 'organization';
  let suffix = 2;
  while (true) {
    const existing = await query('select id from organizations where slug = $1 limit 1', [slug]);
    if (!existing.rows[0]) return slug;
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
}

function normalizeOrgStatus(value) {
  const status = String(value ?? 'active').toLowerCase();
  return ['active', 'trialing', 'past_due', 'suspended', 'canceled'].includes(status) ? status : 'active';
}

function normalizeMemberStatus(value) {
  const status = String(value ?? 'active').toLowerCase();
  return ['active', 'invited', 'removed'].includes(status) ? status : 'active';
}

function normalizeAdapterConfig(value) {
  if (!value || typeof value !== 'object') return null;
  const type = normalizeOptionalText(value.type ?? value.adapter);
  if (!type) return null;
  if (type === 'vercel-ai-sdk' || type === 'vercel_ai_sdk') {
    return validateVercelAiSdkAdapterConfig(value);
  }
  throw new Error(`Unsupported adapter type: ${type}`);
}

function executionDescriptor(job) {
  const target = normalizeExecutionTarget(job.payload?.executionTarget, {
    runnerId: job.runnerId,
    adapter: job.payload?.adapter,
  });
  const adapter = adapterConfigForExecutionTarget(target);
  const safeTarget = executionTargetSafeMetadata(target);
  if (adapter || target.type === 'vercel_ai_sdk') {
    return {
      kind: 'adapter',
      type: target.type,
      adapterType: adapter?.type ?? 'vercel-ai-sdk',
      target: adapter?.target ?? safeTarget.routeUrl ?? '',
      routeUrl: safeTarget.routeUrl ?? adapter?.target ?? '',
      timeoutMs: job.timeoutMs || adapter?.timeoutMs || 0,
    };
  }
  if (target.type === 'hosted_provider') {
    return {
      kind: 'hosted-provider',
      type: target.type,
      provider: target.provider,
      model: target.model,
      environment: target.environment ?? 'production',
      secretRef: target.secretRef,
      timeoutMs: job.timeoutMs || target.timeoutMs || 0,
    };
  }
  if (target.type === 'local_http_tunnel') {
    return {
      kind: 'http-tunnel',
      type: target.type,
      label: 'Ephemeral local test target',
      reuseLabel: 'Not reusable',
      lifecycle: 'run-scoped',
      target: safeTarget.endpointUrl ?? target.endpointUrl ?? '',
      endpointUrl: safeTarget.endpointUrl ?? target.endpointUrl ?? '',
      timeoutMs: job.timeoutMs,
    };
  }
  return {
    kind: 'registered-runner',
    type: target.type,
    runnerId: job.runnerId ?? null,
    timeoutMs: job.timeoutMs,
  };
}

function collectObservationDiagnostics(observations) {
  return (Array.isArray(observations) ? observations : [])
    .map((observation) => observation?.metadata?.adapterDiagnostics ?? observation?.diagnostics)
    .filter(Boolean)
    .map((diagnostics) => normalizeAdapterDiagnostics(diagnostics));
}

function normalizePositiveInteger(value, fallback) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 1) return fallback;
  return Math.floor(normalized);
}

function normalizeNonNegativeInteger(value, fallback) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return fallback;
  return Math.floor(normalized);
}

function normalizeStatusFilter(statuses) {
  if (Array.isArray(statuses)) {
    return statuses.map(String).map((item) => item.trim()).filter(Boolean);
  }
  if (typeof statuses === 'string') {
    return statuses.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function appendJobHistory(job, patch) {
  const history = Array.isArray(job.history) ? job.history : [];
  if (!shouldRecordJobHistory(job, patch)) return history;
  return [
    ...history,
    jobHistoryEntry({
      status: patch.status ?? job.status,
      message: jobHistoryMessage(job, patch),
      attempts: patch.attempts ?? job.attempts,
      claimedBy: patch.claimedBy ?? job.claimedBy ?? null,
      reportId: patch.reportId ?? job.reportId ?? null,
      error: patch.error ?? null,
      nextRunAt: patch.nextRunAt ?? null,
    }),
  ];
}

function jobHistoryEntry({ status, message, attempts = 0, claimedBy = null, reportId = null, error = null, nextRunAt = null }) {
  return {
    status,
    message,
    attempts,
    claimedBy,
    reportId,
    error,
    nextRunAt,
    createdAt: new Date().toISOString(),
  };
}

function shouldRecordJobHistory(job, patch) {
  return Boolean(
    patch.status && patch.status !== job.status
    || patch.error
    || patch.reportId
    || patch.claimedBy
    || patch.nextRunAt
  );
}

function jobHistoryMessage(job, patch) {
  if (patch.status === 'claimed') return 'Worker claimed job.';
  if (patch.status === 'running') return 'Worker started execution.';
  if (patch.status === 'retrying') return 'Attempt failed; job scheduled for retry.';
  if (patch.status === 'failed') return 'Job failed after exhausting attempts.';
  if (patch.status === 'completed') return 'Job completed and linked a report.';
  if (patch.status === 'canceled' || patch.status === 'cancelled') return 'Job canceled before completion.';
  if (patch.status === 'queued' && job.status === 'failed') return 'Job queued for retry.';
  if (patch.error) return 'Job recorded an error.';
  return 'Job updated.';
}

function useMemory() {
  return !hasPostgresConfig();
}

function reportSummary(report) {
  return {
    id: report.id,
    projectId: report.projectId,
    gate: report.gate,
    createdAt: report.createdAt,
    summary: report.summary,
    project: report.snapshot?.suite?.project ?? null,
    profile: report.snapshot?.suite?.profile ?? null,
  };
}

function benchmarkVersionsFor(benchmarkId) {
  return Array.from(memory.benchmarkVersions.values()).filter((version) => version.benchmarkId === benchmarkId);
}

function summarizeBenchmarkVersions(versions) {
  const ordered = [...versions].sort((left, right) => left.versionNumber - right.versionNumber);
  const previousById = new Map();
  ordered.forEach((version, index) => {
    previousById.set(version.id, ordered[index - 1] ?? null);
  });
  return versions.map((version) => benchmarkVersionSummary(version, previousById.get(version.id)));
}

function goldenCasesForCandidate(candidateId) {
  return Array.from(memory.goldenCases.values()).filter((item) => item.promotionCandidateId === candidateId);
}

function benchmarkPackSummary(benchmark) {
  if (!benchmark) return null;
  const versions = useMemory()
    ? benchmarkVersionsFor(benchmark.id)
    : [];
  const latestVersion = useMemory()
    ? versions.find((version) => version.id === benchmark.latestVersionId) ?? null
    : null;
  const approvedVersion = useMemory()
    ? versions.find((version) => version.id === benchmark.approvedVersionId) ?? null
    : null;
  return {
    id: benchmark.id,
    projectId: benchmark.projectId,
    workspaceId: benchmark.workspaceId,
    name: benchmark.name,
    slug: benchmark.slug,
    description: benchmark.description,
    latestVersionId: benchmark.latestVersionId,
    approvedVersionId: benchmark.approvedVersionId,
    versionCount: useMemory() ? versions.length : undefined,
    latestVersion: latestVersion ? benchmarkVersionSummary(latestVersion) : undefined,
    approvedVersion: approvedVersion ? benchmarkVersionSummary(approvedVersion) : undefined,
    createdBy: benchmark.createdBy,
    createdAt: benchmark.createdAt,
    updatedAt: benchmark.updatedAt,
  };
}

function benchmarkVersionSummary(version, previousVersion = null) {
  if (!version) return null;
  return {
    id: version.id,
    benchmarkId: version.benchmarkId,
    projectId: version.projectId,
    workspaceId: version.workspaceId,
    versionNumber: version.versionNumber,
    status: version.status,
    source: version.source,
    readiness: version.readiness,
    validation: {
      ok: Boolean(version.validation?.ok),
      errors: version.validation?.errors ?? [],
    },
    pack: version.pack,
    createdBy: version.createdBy,
    approvedBy: version.approvedBy,
    approvedAt: version.approvedAt,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
    diffFromPrevious: previousVersion ? diffBenchmarkPacks(previousVersion.pack, version.pack) : null,
  };
}

function normalizeUserRow(row) {
  return {
    id: row.id,
    githubId: row.github_id,
    login: row.login,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    createdAt: String(row.created_at),
  };
}

function normalizeWorkspaceRow(row) {
  return {
    id: row.id,
    organizationId: row.organization_id ?? row.organizationId ?? null,
    name: row.name,
    ownerUserId: row.owner_user_id,
    createdAt: String(row.created_at),
  };
}

function normalizeProjectRow(row) {
  const role = row.role ? normalizeOrgRole(row.role, row.role) : null;
  return {
    id: row.id,
    organizationId: row.organization_id ?? row.organizationId ?? null,
    workspaceId: row.workspace_id,
    name: row.name,
    slug: row.slug,
    createdBy: row.created_by,
    role,
    permissions: role ? rolePermissions(role) : {},
    createdAt: String(row.created_at),
  };
}

function normalizeRunnerRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    endpointUrl: row.endpoint_url,
    sharedSecret: row.shared_secret,
    status: row.status,
    createdBy: row.created_by,
    createdAt: String(row.created_at),
  };
}

function normalizeReportRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    organizationId: row.organization_id ?? null,
    createdBy: row.created_by,
    gate: row.gate,
    summary: row.summary,
    snapshot: row.snapshot,
    createdAt: String(row.created_at),
  };
}

function normalizeFailureWorkflowRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    organizationId: row.organization_id ?? null,
    workspaceId: row.workspace_id,
    failureId: row.failure_id,
    status: row.status,
    owner: row.owner ?? null,
    severity: row.severity ?? null,
    latestAction: row.latest_action ?? null,
    evidence: row.evidence ?? {},
    actions: Array.isArray(row.actions) ? row.actions : [],
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function failureWorkflowKey(projectId, failureId) {
  return `${projectId}:${failureId}`;
}

function normalizeFailureRegressionSuiteRow(row) {
  return {
    id: row.suite_id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description ?? 'Pinned regression cases.',
    failureIds: Array.isArray(row.failure_ids) ? row.failure_ids.map(String).filter(Boolean) : [],
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function failureRegressionSuiteKey(projectId, suiteId) {
  return `${projectId}:${suiteId}`;
}

function mergeFailureIds(failureId, existingFailureIds = []) {
  const existing = Array.isArray(existingFailureIds) ? existingFailureIds.map(String).filter(Boolean) : [];
  return Array.from(new Set([failureId, ...existing].filter(Boolean)));
}

function normalizeJobRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    organizationId: row.organization_id ?? null,
    workspaceId: row.workspace_id,
    runnerId: row.runner_id,
    userId: row.created_by,
    reportId: row.report_id,
    status: row.status,
    idempotencyKey: row.idempotency_key ?? null,
    payload: row.payload,
    result: row.result,
    error: row.error,
    lastError: row.last_error ?? row.error ?? null,
    retryReason: row.retry_reason ?? null,
    history: Array.isArray(row.history) ? row.history : [],
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 1),
    timeoutMs: Number(row.timeout_ms ?? 0),
    retryBackoffMs: Number(row.retry_backoff_ms ?? 0),
    claimedBy: row.claimed_by ?? null,
    workerId: row.worker_id ?? row.claimed_by ?? null,
    lockedAt: row.locked_at ? String(row.locked_at) : null,
    claimedAt: row.claimed_at ? String(row.claimed_at) : row.locked_at ? String(row.locked_at) : null,
    nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
    nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : row.next_run_at ? String(row.next_run_at) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : row.status === 'completed' && row.finished_at ? String(row.finished_at) : null,
    failedAt: row.failed_at ? String(row.failed_at) : row.status === 'failed' && row.finished_at ? String(row.finished_at) : null,
    canceledAt: row.cancelled_at ? String(row.cancelled_at) : ['canceled', 'cancelled'].includes(row.status) && row.finished_at ? String(row.finished_at) : null,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : ['canceled', 'cancelled'].includes(row.status) && row.finished_at ? String(row.finished_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeProjectSecretRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    organizationId: row.organization_id ?? null,
    environment: row.environment ?? 'production',
    provider: row.provider,
    displayName: row.display_name,
    maskedPreview: row.masked_preview,
    status: row.status,
    validationStatus: row.validation_status ?? null,
    lastValidationErrorClass: row.last_validation_error_class ?? null,
    lastValidationError: row.last_validation_error ?? null,
    encryptedSecret: row.encrypted_secret,
    createdBy: row.created_by,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
  };
}

function normalizeOrganizationRow(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: normalizePlan(row.plan),
    status: normalizeOrgStatus(row.status),
    createdAt: String(row.created_at ?? row.createdAt),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? row.created_at ?? row.createdAt),
  };
}

function normalizeOrganizationMemberRow(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id ?? null,
    email: row.email,
    role: normalizeOrgRole(row.role),
    status: normalizeMemberStatus(row.status),
    invitedAt: row.invited_at ? String(row.invited_at) : null,
    joinedAt: row.joined_at ? String(row.joined_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeUsageEventRow(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id ?? null,
    runId: row.run_id ?? null,
    reportId: row.report_id ?? null,
    eventType: row.event_type,
    quantity: Number(row.quantity ?? 0),
    metadata: row.metadata ?? {},
    idempotencyKey: row.idempotency_key ?? null,
    createdAt: String(row.created_at),
  };
}

function normalizeBenchmarkPackRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? '',
    latestVersionId: row.latest_version_id,
    approvedVersionId: row.approved_version_id,
    createdBy: row.created_by,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeBenchmarkVersionRow(row) {
  return {
    id: row.id,
    benchmarkId: row.benchmark_pack_id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    versionNumber: Number(row.version_number),
    status: row.status,
    source: row.source,
    pack: row.pack,
    validation: row.validation,
    readiness: row.readiness,
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeBenchmarkReviewRow(row) {
  return {
    id: row.id,
    versionId: row.benchmark_version_id,
    benchmarkId: row.benchmark_pack_id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    reviewerId: row.reviewer_id,
    decision: row.decision,
    comments: row.comments ?? '',
    readinessSnapshot: row.readiness_snapshot,
    createdAt: String(row.created_at),
  };
}

function normalizeBenchmarkReviewAssignmentRow(row) {
  return {
    id: row.id,
    versionId: row.benchmark_version_id,
    benchmarkId: row.benchmark_pack_id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    reviewer: row.reviewer,
    status: row.status,
    notes: row.notes ?? '',
    assignedBy: row.assigned_by,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizePromotionCandidateRow(row) {
  return {
    id: row.id,
    versionId: row.benchmark_version_id,
    benchmarkId: row.benchmark_pack_id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    status: row.status,
    visibility: row.visibility,
    caseData: row.case_data,
    notes: row.notes ?? '',
    createdBy: row.created_by,
    promotedBy: row.promoted_by,
    promotedAt: row.promoted_at ? String(row.promoted_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeGoldenCaseRow(row) {
  return {
    id: row.id,
    versionId: row.benchmark_version_id,
    benchmarkId: row.benchmark_pack_id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    promotionCandidateId: row.promotion_candidate_id,
    visibility: row.visibility,
    caseData: row.case_data,
    createdBy: row.created_by,
    createdAt: String(row.created_at),
  };
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'project';
}
