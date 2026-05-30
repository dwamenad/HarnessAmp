import crypto from 'node:crypto';
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
  events: [],
};

globalThis.__harnessAmpStore = memory;

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

export async function createRunnerJob({ projectId, runnerId, userId, pack, thresholds, profileId, presetId }) {
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

  const job = await persistJob({
    id: createId('job'),
    projectId,
    runnerId,
    userId,
    status: 'queued',
    payload,
    workspaceId: membership.workspaceId,
  });

  queueMicrotask(() => {
    dispatchRunnerJob(job).catch(async (error) => {
      await updateJobStatus(job.id, {
        status: 'failed',
        error: error.message,
      });
    });
  });

  return job;
}

export async function getRunnerJob({ jobId, userId }) {
  const job = await readJob(jobId);
  if (!job) return null;
  const membership = await getProjectMembership(userId, job.projectId);
  return membership ? job : null;
}

export async function cancelRunnerJob({ jobId, userId }) {
  const job = await readJob(jobId);
  if (!job) return null;
  const membership = await getProjectMembership(userId, job.projectId);
  if (!membership || !canMutateProject(membership.role)) {
    throw new Error('Only owners and maintainers can cancel jobs');
  }
  return updateJobStatus(jobId, { status: 'canceled' });
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
  if (await isJobCanceled(job.id)) return;
  await updateJobStatus(job.id, { status: 'dispatching' });
  const runner = await getRunnerById(job.runnerId);
  if (!runner) throw new Error('Runner not found');

  const response = await fetch(runner.endpointUrl, {
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
  });

  if (!response.ok) {
    throw new Error(`Runner returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (await isJobCanceled(job.id)) return;
  const observations = Array.isArray(payload) ? payload : payload.observations;
  if (!Array.isArray(observations)) {
    throw new Error('Runner response must be an observation array or { observations }.');
  }

  if (await isJobCanceled(job.id)) return;
  await updateJobStatus(job.id, { status: 'running' });
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

  if (await isJobCanceled(job.id)) return;
  const saved = await persistReport({
    snapshot,
    projectId: job.projectId,
    workspaceId: job.workspaceId,
    userId: job.userId,
  });

  if (await isJobCanceled(job.id)) return;
  await updateJobStatus(job.id, {
    status: 'completed',
    reportId: saved.id,
    result: {
      reportId: saved.id,
      gate: snapshot.summary.verdict,
      overallScore: snapshot.summary.overallScore,
    },
  });
}

async function isJobCanceled(jobId) {
  const current = await readJob(jobId);
  return current?.status === 'canceled';
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

async function persistJob({ id, projectId, runnerId, userId, status, payload, workspaceId }) {
  const job = {
    id,
    projectId,
    runnerId,
    userId,
    workspaceId,
    status,
    payload,
    result: null,
    reportId: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (useMemory()) {
    memory.jobs.set(job.id, job);
    return job;
  }

  await ensureSchema();
  const result = await query(
    `insert into runner_jobs (id, project_id, runner_id, created_by, status, payload)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [id, projectId, runnerId, userId, status, payload],
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
    updatedAt: new Date().toISOString(),
  };

  const updated = await query(
    `update runner_jobs
     set status = $2,
         report_id = $3,
         result = $4,
         error = $5,
         updated_at = $6
     where id = $1
     returning *`,
    [jobId, next.status, next.reportId ?? null, next.result ?? null, next.error ?? null, next.updatedAt],
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

async function getRunnerById(runnerId) {
  if (useMemory()) {
    return memory.runners.get(runnerId) ?? null;
  }

  await ensureSchema();
  const result = await query('select * from runner_registrations where id = $1 limit 1', [runnerId]);
  return result.rows[0] ? normalizeRunnerRow(result.rows[0]) : null;
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

function normalizeJobRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    runnerId: row.runner_id,
    userId: row.created_by,
    reportId: row.report_id,
    status: row.status,
    payload: row.payload,
    result: row.result,
    error: row.error,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
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
