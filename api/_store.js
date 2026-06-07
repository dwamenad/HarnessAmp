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
import { buildReportSnapshot } from '../src/shared/report-snapshot.js';
import { ensureSchema, hasPostgresConfig, query } from './_db.js';

const memory = globalThis.__harnessAmpStore ?? {
  users: new Map(),
  workspaces: new Map(),
  projects: new Map(),
  memberships: new Map(),
  runners: new Map(),
  reports: new Map(),
  jobs: new Map(),
  failureWorkflows: new Map(),
  benchmarkPacks: new Map(),
  benchmarkVersions: new Map(),
  benchmarkReviews: new Map(),
  benchmarkReviewAssignments: new Map(),
  promotionCandidates: new Map(),
  goldenCases: new Map(),
  events: [],
};

const RUNNER_JOB_TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled']);
const RUNNER_JOB_CLAIMABLE_STATUSES = new Set(['queued', 'retrying']);

globalThis.__harnessAmpStore = memory;
memory.benchmarkPacks ??= new Map();
memory.benchmarkVersions ??= new Map();
memory.benchmarkReviews ??= new Map();
memory.benchmarkReviewAssignments ??= new Map();
memory.promotionCandidates ??= new Map();
memory.goldenCases ??= new Map();
memory.failureWorkflows ??= new Map();

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
    currentWorkspaceId: workspace.id,
    defaultProjectId: project.id,
  };
}

export async function getSessionContext(userId) {
  const user = await getUserById(userId);
  if (!user) return null;

  const workspaces = await listWorkspacesForUser(userId);
  const currentWorkspaceId = workspaces[0]?.id ?? null;
  const projects = currentWorkspaceId ? await listProjectsForWorkspace(userId, currentWorkspaceId) : [];
  return {
    user,
    workspaces,
    currentWorkspaceId,
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

  const workspace = await createWorkspace(user.id, `${user.login} Lab`);
  const project = await createProject(user.id, workspace.id, 'Primary Project');
  return { workspace, project };
}

export async function listWorkspacesForUser(userId) {
  if (useMemory()) {
    return Array.from(memory.workspaces.values())
      .filter((workspace) => workspace.ownerUserId === userId || workspaceHasMember(workspace.id, userId))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  await ensureSchema();
  const result = await query(
    `select distinct w.*
     from workspaces w
     left join projects p on p.workspace_id = w.id
     left join project_memberships pm on pm.project_id = p.id and pm.user_id = $1
     where w.owner_user_id = $1 or pm.user_id = $1
     order by w.created_at asc`,
    [userId],
  );
  return result.rows.map(normalizeWorkspaceRow);
}

export async function createWorkspace(userId, name) {
  if (useMemory()) {
    const workspace = {
      id: createId('ws'),
      name,
      ownerUserId: userId,
      createdAt: new Date().toISOString(),
    };
    memory.workspaces.set(workspace.id, workspace);
    return workspace;
  }

  await ensureSchema();
  const result = await query(
    `insert into workspaces (id, name, owner_user_id)
     values ($1, $2, $3)
     returning *`,
    [createId('ws'), name, userId],
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
      }))
      .filter((project) => Boolean(project.role))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  await ensureSchema();
  const result = await query(
    `select p.*, 
            coalesce(pm.role, case when w.owner_user_id = $1 then 'owner' else null end) as role
     from projects p
     join workspaces w on w.id = p.workspace_id
     left join project_memberships pm on pm.project_id = p.id and pm.user_id = $1
     where p.workspace_id = $2 and (w.owner_user_id = $1 or pm.user_id = $1)
     order by p.created_at asc`,
    [userId, workspaceId],
  );
  return result.rows.map(normalizeProjectRow);
}

export async function createProject(userId, workspaceId, name) {
  if (useMemory()) {
    const workspace = memory.workspaces.get(workspaceId);
    if (!workspace || workspace.ownerUserId !== userId) {
      throw new Error('Only workspace owners can create projects');
    }
    const project = {
      id: createId('proj'),
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
  if (!workspace.rows[0] || workspace.rows[0].owner_user_id !== userId) {
    throw new Error('Only workspace owners can create projects');
  }

  const projectId = createId('proj');
  const createdAt = new Date().toISOString();
  const result = await query(
    `insert into projects (id, workspace_id, name, slug, created_by, created_at)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [projectId, workspaceId, name, slugify(name), userId, createdAt],
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
  const membership = await getProjectMembership(userId, projectId);
  if (!membership) throw new Error('Project membership not found');

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
  const membership = await getProjectMembership(userId, projectId);
  if (!membership || !canMutateProject(membership.role)) {
    throw new Error('Only owners and maintainers can save reports');
  }
  return persistReport({ snapshot, projectId, workspaceId: membership.workspaceId, userId });
}

export async function getReport({ id, userId }) {
  if (useMemory()) {
    const report = memory.reports.get(id) ?? null;
    if (!report) return null;
    const membership = await getProjectMembership(userId, report.projectId);
    return membership ? report : null;
  }

  await ensureSchema();
  const result = await query(
    `select r.*
     from reports r
     join projects p on p.id = r.project_id
     join workspaces w on w.id = p.workspace_id
     left join project_memberships pm on pm.project_id = p.id and pm.user_id = $2
     where r.id = $1 and (w.owner_user_id = $2 or pm.user_id = $2)
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

export async function recordFailureWorkflowAction({
  projectId,
  failureId,
  userId,
  action,
  status,
  owner = null,
  severity = null,
  message = null,
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
  const membership = await getProjectMembership(userId, projectId);
  if (!membership || !canMutateProject(membership.role)) {
    throw new Error('Only owners and maintainers can register runners');
  }

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
}) {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership || !canMutateProject(membership.role)) {
    throw new Error('Only owners and maintainers can create jobs');
  }

  const runner = await getRunnerById(runnerId);
  if (!runner || runner.projectId !== projectId) {
    throw new Error('Runner not found');
  }

  const payload = {
    pack,
    thresholds,
    profileId,
    presetId,
  };
  const normalizedIdempotencyKey = normalizeOptionalText(idempotencyKey);
  if (normalizedIdempotencyKey) {
    const existing = await findRunnerJobByIdempotencyKey({
      projectId,
      runnerId,
      idempotencyKey: normalizedIdempotencyKey,
    });
    if (existing) return existing;
  }

  const job = await persistJob({
    id: createId('job'),
    projectId,
    runnerId,
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

export async function listRunnerJobsForWorker({ projectId, statuses = [] }) {
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
  return updateJobStatus(jobId, {
    status: 'canceled',
    error: null,
    claimedBy: null,
    lockedAt: null,
    nextRunAt: null,
    finishedAt: new Date().toISOString(),
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
    claimedBy: null,
    lockedAt: null,
    nextRunAt: new Date().toISOString(),
    finishedAt: null,
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

async function dispatchRunnerJob(job) {
  if (await isJobCanceled(job.id)) return readJob(job.id);
  const runner = await getRunnerById(job.runnerId);
  if (!runner) throw new Error('Runner not found');

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
    throw new Error(`Runner returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (await isJobCanceled(job.id)) return readJob(job.id);
  const observations = Array.isArray(payload) ? payload : payload.observations;
  if (!Array.isArray(observations)) {
    throw new Error('Runner response must be an observation array or { observations }.');
  }

  if (await isJobCanceled(job.id)) return readJob(job.id);
  const analysis = analyzeBundle(job.payload.pack, observations, {
    intensity: job.payload.pack?.mutationPolicy?.intensity ?? 2,
  });
  const snapshot = buildReportSnapshot({
    analysis,
    reportId: createId('report'),
    workspace: {
      workspaceId: job.workspaceId,
    },
    projectId: job.projectId,
    profileId: job.payload.profileId,
    presetId: job.payload.presetId,
    thresholds: job.payload.thresholds,
    sourceBundle: job.payload.pack,
  });

  if (await isJobCanceled(job.id)) return readJob(job.id);
  const saved = await persistReport({
    snapshot,
    projectId: job.projectId,
    workspaceId: job.workspaceId,
    userId: job.userId,
  });

  if (await isJobCanceled(job.id)) return readJob(job.id);
  await updateJobStatus(job.id, {
    status: 'completed',
    reportId: saved.id,
    result: {
      reportId: saved.id,
      gate: snapshot.summary.verdict,
      overallScore: snapshot.summary.overallScore,
    },
    error: null,
    claimedBy: null,
    lockedAt: null,
    nextRunAt: null,
    finishedAt: new Date().toISOString(),
  });
  return readJob(job.id);
}

async function isJobCanceled(jobId) {
  const current = await readJob(jobId);
  return current?.status === 'canceled';
}

async function markRunnerJobFailure(jobId, error) {
  const current = await readJob(jobId);
  if (!current || current.status === 'canceled') return current;
  const message = error instanceof Error ? error.message : String(error);
  const canRetry = current.attempts < current.maxAttempts;
  return updateJobStatus(jobId, {
    status: canRetry ? 'retrying' : 'failed',
    error: message,
    claimedBy: null,
    lockedAt: null,
    nextRunAt: canRetry ? retryReadyAt(current.retryBackoffMs) : null,
    finishedAt: canRetry ? null : new Date().toISOString(),
  });
}

async function claimJobForWorker(job, workerId) {
  const normalizedWorkerId = normalizeOptionalText(workerId) ?? 'api-worker';
  if (!useMemory()) {
    await ensureSchema();
    const updated = await query(
      `update runner_jobs
       set status = 'running',
           attempts = attempts + 1,
           error = null,
           history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
             'status', 'running',
             'message', 'Worker claimed job.',
             'attempts', attempts + 1,
             'claimedBy', $2,
             'createdAt', $3
           )),
           claimed_by = $2,
           locked_at = $3,
           next_run_at = null,
           started_at = coalesce(started_at, $3),
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

  if (!RUNNER_JOB_CLAIMABLE_STATUSES.has(job.status)) return null;
  if (!isJobDue(job)) return null;
  if (job.attempts >= job.maxAttempts) {
    return updateJobStatus(job.id, {
      status: 'failed',
      error: job.error ?? 'Runner job exhausted all attempts.',
      finishedAt: new Date().toISOString(),
    });
  }
  return updateJobStatus(job.id, {
    status: 'running',
    attempts: job.attempts + 1,
    error: null,
    claimedBy: normalizedWorkerId,
    lockedAt: new Date().toISOString(),
    nextRunAt: null,
    startedAt: job.startedAt ?? new Date().toISOString(),
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

async function persistReport({ snapshot, projectId, workspaceId, userId }) {
  const reportId = snapshot.id ?? createId('report');
  const report = {
    id: reportId,
    projectId,
    workspaceId,
    createdBy: userId,
    gate: snapshot.summary?.verdict ?? 'warn',
    summary: snapshot.summary ?? {},
    snapshot: {
      ...snapshot,
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
    `insert into reports (id, project_id, workspace_id, created_by, gate, summary, snapshot)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (id) do update set
       gate = excluded.gate,
       summary = excluded.summary,
       snapshot = excluded.snapshot`,
    [report.id, projectId, workspaceId, userId, report.gate, report.summary, report.snapshot],
  );
  return { id: report.id, storage: 'postgres' };
}

async function persistJob({
  id,
  projectId,
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
    runnerId,
    userId,
    workspaceId,
    status,
    idempotencyKey,
    payload,
    result: null,
    reportId: null,
    error: null,
    history: [jobHistoryEntry({ status, message: 'Job queued for worker execution.' })],
    attempts,
    maxAttempts,
    timeoutMs,
    retryBackoffMs,
    claimedBy: null,
    lockedAt: null,
    nextRunAt: null,
    startedAt: null,
    finishedAt: null,
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
       (id, project_id, workspace_id, runner_id, created_by, status, idempotency_key, payload, result, error, history, attempts, max_attempts, timeout_ms, retry_backoff_ms)
     values ($1, $2, $3, $4, $5, $6, $7, $8, null, null, $9, $10, $11, $12, $13)
     returning *`,
    [id, projectId, workspaceId, runnerId, userId, status, idempotencyKey, payload, job.history, attempts, maxAttempts, timeoutMs, retryBackoffMs],
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
         history = $6,
         attempts = $7,
         max_attempts = $8,
         timeout_ms = $9,
         retry_backoff_ms = $10,
         claimed_by = $11,
         locked_at = $12,
         next_run_at = $13,
         started_at = $14,
         finished_at = $15,
         updated_at = $16
     where id = $1
     returning *`,
    [
      jobId,
      next.status,
      next.reportId ?? null,
      next.result ?? null,
      next.error ?? null,
      next.history,
      next.attempts,
      next.maxAttempts,
      next.timeoutMs,
      next.retryBackoffMs,
      next.claimedBy ?? null,
      next.lockedAt ?? null,
      next.nextRunAt ?? null,
      next.startedAt ?? null,
      next.finishedAt ?? null,
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
     where project_id = $1 and runner_id = $2 and idempotency_key = $3
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
      workspaceId: project.workspaceId,
      role,
    };
  }

  await ensureSchema();
  const result = await query(
    `select p.id as project_id,
            p.workspace_id,
            coalesce(pm.role, case when w.owner_user_id = $1 then 'owner' else null end) as role
     from projects p
     join workspaces w on w.id = p.workspace_id
     left join project_memberships pm on pm.project_id = p.id and pm.user_id = $1
     where p.id = $2 and (w.owner_user_id = $1 or pm.user_id = $1)
     limit 1`,
    [userId, projectId],
  );

  if (!result.rows[0]) return null;
  return {
    projectId: result.rows[0].project_id,
    workspaceId: result.rows[0].workspace_id,
    role: result.rows[0].role,
  };
}

function workspaceHasMember(workspaceId, userId) {
  return Array.from(memory.projects.values()).some((project) => project.workspaceId === workspaceId && projectRoleFor(project.id, userId));
}

function projectRoleFor(projectId, userId) {
  const membership = memory.memberships.get(`${projectId}:${userId}`);
  if (membership) return membership.role;
  const project = memory.projects.get(projectId);
  if (!project) return null;
  const workspace = memory.workspaces.get(project.workspaceId);
  return workspace?.ownerUserId === userId ? 'owner' : null;
}

function canMutateProject(role) {
  return role === 'owner' || role === 'maintainer';
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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
  if (patch.status === 'running') return 'Worker claimed job.';
  if (patch.status === 'retrying') return 'Attempt failed; job scheduled for retry.';
  if (patch.status === 'failed') return 'Job failed after exhausting attempts.';
  if (patch.status === 'completed') return 'Job completed and linked a report.';
  if (patch.status === 'canceled') return 'Job canceled before completion.';
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
    name: row.name,
    ownerUserId: row.owner_user_id,
    createdAt: String(row.created_at),
  };
}

function normalizeProjectRow(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    slug: row.slug,
    createdBy: row.created_by,
    role: row.role ?? null,
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

function normalizeJobRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    runnerId: row.runner_id,
    userId: row.created_by,
    reportId: row.report_id,
    status: row.status,
    idempotencyKey: row.idempotency_key ?? null,
    payload: row.payload,
    result: row.result,
    error: row.error,
    history: Array.isArray(row.history) ? row.history : [],
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 1),
    timeoutMs: Number(row.timeout_ms ?? 0),
    retryBackoffMs: Number(row.retry_backoff_ms ?? 0),
    claimedBy: row.claimed_by ?? null,
    lockedAt: row.locked_at ? String(row.locked_at) : null,
    nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
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
