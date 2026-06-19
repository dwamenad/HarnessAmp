import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import authHandler from '../api/auth.js';
import benchmarksHandler from '../api/benchmarks.js';
import failuresHandler from '../api/failures.js';
import harnessSmokeHandler from '../api/harness-smoke.js';
import jobsHandler from '../api/jobs.js';
import orgsHandler from '../api/orgs.js';
import projectsHandler from '../api/projects.js';
import reportsHandler from '../api/reports.js';
import secretsHandler from '../api/secrets.js';
import { analyzeBundle, createDemoBundle } from '../src/core/engine.js';
import { buildReportSnapshot } from '../src/shared/report-snapshot.js';
import {
  createProject,
  createRunnerRegistration,
  createRunnerJob,
  createWorkspace,
  getOrCreateGitHubUser,
  getOrgUsageForPeriod,
  inviteOrganizationMember,
  listEventsForProject,
  listOrganizationMembers,
  listProjectsForWorkspace,
  listWorkspacesForUser,
  removeOrganizationMember,
  seedDevSession,
  updateOrganizationMember,
  updateOrganizationPlan,
} from '../api/_store.js';
import { HARNESSAMP_ADAPTER_CONTRACT_VERSION } from '../src/adapters/harnessamp-contract.js';

const supportMvpPack = JSON.parse(
  await readFile(new URL('../examples/benchmarks/support-mvp/benchmark-pack.json', import.meta.url), 'utf8'),
);

function createMockResponse() {
  const response = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    end(payload) {
      this.body = payload ?? this.body;
    },
  };
  return response;
}

function createFetchResponse({
  ok = true,
  status = 200,
  body = {},
  headers = {},
  url = '',
} = {}) {
  const normalizedHeaders = new Map(Object.entries({ 'content-type': 'application/json', ...headers }).map(([key, value]) => [key.toLowerCase(), String(value)]));
  const safeBody = body && typeof body === 'object' && !Array.isArray(body) && (body.ok === true || body.ready === true)
    ? { contractVersion: HARNESSAMP_ADAPTER_CONTRACT_VERSION, ...body }
    : body;
  const text = typeof safeBody === 'string' ? safeBody : JSON.stringify(safeBody);
  return {
    ok,
    status,
    url,
    headers: {
      get(name) {
        return normalizedHeaders.get(String(name).toLowerCase()) ?? null;
      },
    },
    async text() {
      return text;
    },
    async json() {
      return JSON.parse(text);
    },
  };
}

function installLocalTunnelDns(address = '203.0.113.10') {
  const previous = globalThis.__harnessAmpLocalTunnelDnsLookup;
  globalThis.__harnessAmpLocalTunnelDnsLookup = async () => [{ address, family: address.includes(':') ? 6 : 4 }];
  return () => {
    if (previous === undefined) delete globalThis.__harnessAmpLocalTunnelDnsLookup;
    else globalThis.__harnessAmpLocalTunnelDnsLookup = previous;
  };
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('report writes require authentication', async () => {
  delete process.env.HARNESSAMP_DEV_AUTH;

  const request = {
    method: 'POST',
    headers: {},
    query: {},
    body: {},
  };
  const response = createMockResponse();

  await reportsHandler(request, response);
  assert.equal(response.statusCode, 401);
});

test('dev-auth session endpoint returns a seeded user context', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const request = {
    method: 'GET',
    headers: {},
    query: {},
  };
  const response = createMockResponse();

  request.query = { action: 'session' };
  await authHandler(request, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.user.login, 'dev-user');
  assert.ok(Array.isArray(response.body.workspaces));
});

test('organization APIs expose owner context, members, usage, and plan estimates', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  await seedDevSession();

  const createResponse = createMockResponse();
  await orgsHandler({
    method: 'POST',
    headers: {},
    query: {},
    body: { name: 'API Org Controls' },
  }, createResponse);

  assert.equal(createResponse.statusCode, 200);
  assert.equal(createResponse.body.organization.plan, 'free');

  const orgId = createResponse.body.organization.id;
  const membersResponse = createMockResponse();
  await orgsHandler({
    method: 'GET',
    headers: {},
    query: { orgId, resource: 'members' },
  }, membersResponse);

  assert.equal(membersResponse.statusCode, 200);
  assert.equal(membersResponse.body.members[0].role, 'owner');

  const estimateResponse = createMockResponse();
  await orgsHandler({
    method: 'POST',
    headers: {},
    query: { orgId, resource: 'estimate-run' },
    body: {
      executionTarget: { type: 'hosted_provider', provider: 'openai', secretRef: 'sec_missing' },
      pack: createDemoBundle(),
    },
  }, estimateResponse);

  assert.equal(estimateResponse.statusCode, 200);
  assert.equal(estimateResponse.body.entitlement.allowed, false);
  assert.ok(estimateResponse.body.entitlement.reasons.some((reason) => reason.code === 'plan_hosted_byok_required'));

  const usageResponse = createMockResponse();
  await orgsHandler({
    method: 'GET',
    headers: {},
    query: { orgId, resource: 'usage' },
  }, usageResponse);

  assert.equal(usageResponse.statusCode, 200);
  assert.equal(usageResponse.body.usage.plan, 'free');
  assert.equal(usageResponse.body.usage.totals.runCount, 0);
});

test('organization RBAC follows active member roles and removal', async () => {
  const owner = await getOrCreateGitHubUser({
    githubId: 'owner-rbac-user',
    login: 'owner-rbac-user',
    name: 'Owner RBAC',
    email: 'owner-rbac@harnessamp.local',
    avatarUrl: null,
  });
  const developer = await getOrCreateGitHubUser({
    githubId: 'developer-rbac-user',
    login: 'developer-rbac-user',
    name: 'Developer RBAC',
    email: 'developer-rbac@harnessamp.local',
    avatarUrl: null,
  });
  const workspace = await createWorkspace(owner.id, 'RBAC Org Workspace');
  const project = await createProject(owner.id, workspace.id, 'RBAC Project');

  const member = await inviteOrganizationMember({
    organizationId: workspace.organizationId,
    userId: owner.id,
    email: developer.email,
    role: 'developer',
  });

  assert.equal(member.status, 'active');
  assert.equal(member.userId, developer.id);
  assert.ok((await listWorkspacesForUser(developer.id)).some((item) => item.id === workspace.id));
  assert.ok((await listProjectsForWorkspace(developer.id, workspace.id)).some((item) => item.id === project.id));
  assert.equal((await listOrganizationMembers({ organizationId: workspace.organizationId, userId: owner.id })).length, 2);

  const updated = await updateOrganizationMember({
    organizationId: workspace.organizationId,
    memberId: member.id,
    userId: owner.id,
    role: 'viewer',
  });
  assert.equal(updated.role, 'viewer');

  await assert.rejects(
    () => createProject(developer.id, workspace.id, 'Viewer Created Project'),
    /Organization permission denied/,
  );

  await removeOrganizationMember({
    organizationId: workspace.organizationId,
    memberId: member.id,
    userId: owner.id,
  });
  assert.equal((await listProjectsForWorkspace(developer.id, workspace.id)).length, 0);
});

test('plan enforcement blocks gated run types and usage metering tracks completed runs', async () => {
  const previousHostedByok = process.env.HARNESSAMP_ENABLE_HOSTED_BYOK;
  process.env.HARNESSAMP_ENABLE_HOSTED_BYOK = '1';
  const owner = await getOrCreateGitHubUser({
    githubId: 'usage-owner-user',
    login: 'usage-owner-user',
    name: 'Usage Owner',
    email: 'usage-owner@harnessamp.local',
    avatarUrl: null,
  });
  const workspace = await createWorkspace(owner.id, 'Usage Metering Workspace');
  const project = await createProject(owner.id, workspace.id, 'Usage Metering Project');

  const blockedHosted = await createRunnerJob({
    projectId: project.id,
    userId: owner.id,
    pack: createDemoBundle(),
    executionTarget: { type: 'hosted_provider', provider: 'openai', model: 'gpt-4.1-mini', secretRef: 'sec_missing' },
  }).then(
    () => null,
    (error) => error,
  );
  assert.equal(blockedHosted.statusCode, 402);
  assert.ok(blockedHosted.entitlement.reasons.some((reason) => reason.code === 'plan_hosted_byok_required'));

  await updateOrganizationPlan({ organizationId: workspace.organizationId, userId: owner.id, plan: 'team' });
  const runner = await createRunnerRegistration({
    projectId: project.id,
    userId: owner.id,
    name: 'Usage HTTP Runner',
    endpointUrl: 'https://runner.example.test/usage',
  });

  const originalFetch = globalThis.fetch;
  const previousWorkerToken = process.env.WORKER_SERVICE_TOKEN;
  const previousDevAuth = process.env.HARNESSAMP_DEV_AUTH;
  try {
    process.env.WORKER_SERVICE_TOKEN = 'usage-worker-token';
    delete process.env.HARNESSAMP_DEV_AUTH;
    globalThis.fetch = async () => createFetchResponse({
      body: {
        observations: [
          { scenarioId: 'usage-1', response: 'ok', score: 1 },
          { scenarioId: 'usage-2', response: 'ok', score: 1 },
        ],
      },
    });
    const job = await createRunnerJob({
      projectId: project.id,
      userId: owner.id,
      runnerId: runner.id,
      pack: createDemoBundle(),
      idempotencyKey: 'usage-metering-job-001',
    });

    const runResponse = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: { authorization: 'Bearer usage-worker-token' },
      query: { id: job.id, action: 'run' },
      body: { projectId: project.id, workerId: 'usage-worker' },
    }, runResponse);
    assert.equal(runResponse.statusCode, 200);
    assert.equal(runResponse.body.status, 'completed');

    const usage = await getOrgUsageForPeriod({ organizationId: workspace.organizationId, userId: owner.id });
    assert.equal(usage.totals.runCount, 1);
    assert.equal(usage.totals.runCompletedCount, 1);
    assert.ok(usage.totals.scenarioCount > 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv('WORKER_SERVICE_TOKEN', previousWorkerToken);
    restoreEnv('HARNESSAMP_DEV_AUTH', previousDevAuth);
    restoreEnv('HARNESSAMP_ENABLE_HOSTED_BYOK', previousHostedByok);
  }
});

test('session endpoint returns anonymous payload without auth', async () => {
  delete process.env.HARNESSAMP_DEV_AUTH;
  const request = {
    method: 'GET',
    headers: {},
    query: { action: 'session' },
  };
  const response = createMockResponse();

  await authHandler(request, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.user, null);
  assert.deepEqual(response.body.workspaces, []);
});

test('server report save and load round-trips through the API handlers', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const bundle = createDemoBundle();
  const analysis = analyzeBundle(bundle, bundle.observations, { intensity: 2 });
  const snapshot = buildReportSnapshot({
    analysis,
    reportId: 'report_roundtrip',
    workspace: {
      workspaceName: 'Reliability Lab',
      projectName: 'Primary Project',
    },
    projectId: session.defaultProjectId,
    profileId: 'support-agent',
    presetId: 'profile-demo',
    thresholds: {
      minOverallScore: 65,
      minHoldoutPass: 60,
      maxGap: 20,
    },
    sourceBundle: bundle,
  });

  const createRequest = {
    method: 'POST',
    headers: {},
    query: {},
    body: {
      projectId: session.defaultProjectId,
      snapshot,
    },
  };
  const createResponse = createMockResponse();
  await reportsHandler(createRequest, createResponse);

  assert.equal(createResponse.statusCode, 200);
  assert.equal(createResponse.body.id, 'report_roundtrip');

  const getRequest = {
    method: 'GET',
    headers: {},
    query: { id: 'report_roundtrip' },
  };
  const getResponse = createMockResponse();
  await reportsHandler(getRequest, getResponse);

  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.body.id, 'report_roundtrip');
  assert.equal(getResponse.body.summary.verdict, snapshot.summary.verdict);
});

test('failure workflow actions persist with audit history', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();

  const createRequest = {
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, failureId: 'fail-redflag-017' },
    body: {
      action: 'assign-owner',
      status: 'Assigned',
      owner: 'Safety Review',
      severity: 'Critical',
      message: 'Assigned to Safety Review.',
      comment: 'Reviewer confirmed this needs clinical safety owner.',
      evidence: {
        contract: 'Escalate red flags',
        scenario: 'healthguard_redflag_001',
      },
    },
  };
  const createResponse = createMockResponse();
  await failuresHandler(createRequest, createResponse);

  assert.equal(createResponse.statusCode, 200);
  assert.equal(createResponse.body.workflow.failureId, 'fail-redflag-017');
  assert.equal(createResponse.body.workflow.status, 'Assigned');
  assert.equal(createResponse.body.workflow.owner, 'Safety Review');
  assert.equal(createResponse.body.workflow.actions.length, 1);
  assert.equal(createResponse.body.workflow.actions[0].action, 'assign-owner');
  assert.equal(createResponse.body.workflow.actions[0].comment, 'Reviewer confirmed this needs clinical safety owner.');

  const secondResponse = createMockResponse();
  await failuresHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, failureId: 'fail-redflag-017' },
    body: {
      action: 'rerun-case',
      status: 'Reproduced',
      message: 'The failure reproduced with the same contract breach and remains open.',
    },
  }, secondResponse);

  assert.equal(secondResponse.statusCode, 200);
  assert.equal(secondResponse.body.workflow.status, 'Reproduced');
  assert.equal(secondResponse.body.workflow.owner, 'Safety Review');
  assert.equal(secondResponse.body.workflow.actions.length, 2);
  assert.equal(secondResponse.body.workflow.actions[0].action, 'rerun-case');

  const getResponse = createMockResponse();
  await failuresHandler({
    method: 'GET',
    headers: {},
    query: { projectId: session.defaultProjectId, failureId: 'fail-redflag-017' },
  }, getResponse);

  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.body.workflow.status, 'Reproduced');
  assert.equal(getResponse.body.workflow.actions.length, 2);
});

test('failure regression suites persist pinned cases per project', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();

  const createResponse = createMockResponse();
  await failuresHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'regression-suites' },
    body: {
      suiteId: 'healthguard-red-flags',
      name: 'HealthGuard red flags',
      description: 'Urgent symptom, diagnosis-boundary, and escalation regressions.',
      failureId: 'fail-redflag-017',
    },
  }, createResponse);

  assert.equal(createResponse.statusCode, 200);
  assert.equal(createResponse.body.suite.id, 'healthguard-red-flags');
  assert.deepEqual(createResponse.body.suite.failureIds, ['fail-redflag-017']);

  const getResponse = createMockResponse();
  await failuresHandler({
    method: 'GET',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'regression-suites' },
  }, getResponse);

  assert.equal(getResponse.statusCode, 200);
  assert.ok(getResponse.body.suites.some((suite) => (
    suite.id === 'healthguard-red-flags'
    && suite.failureIds.includes('fail-redflag-017')
  )));
});

test('harness smoke probe reports upstream HTTP diagnostics', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  await seedDevSession();
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://agent.example.test/harnessamp');
      assert.equal(init.method, 'POST');
      return {
        ok: false,
        status: 404,
        headers: {
          get(name) {
            return name === 'content-type' ? 'text/html' : null;
          },
        },
        async text() {
          return '<h1>Not found</h1>';
        },
      };
    };

    const response = createMockResponse();
    await harnessSmokeHandler({
      method: 'POST',
      headers: {},
      query: {},
      body: {
        endpoint: 'https://agent.example.test/harnessamp',
        payload: {
          scenario_id: 'healthguard_redflag_001',
          mutation_id: 'symptom_minimization',
          input: { user_message: 'Chest pressure' },
        },
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.statusCode, 404);
    assert.equal(response.body.responsePreview, '<h1>Not found</h1>');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runner jobs enqueue durably, dedupe by idempotency key, and run through worker action', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const bundle = createDemoBundle();
  const originalFetch = globalThis.fetch;
  let runnerCalls = 0;

  try {
    globalThis.fetch = async (url, init) => {
      runnerCalls += 1;
      const body = JSON.parse(init.body);
      assert.equal(url, 'https://runner.example.test/harnessamp');
      assert.equal(body.jobId, firstCreate.body.jobId);
      return {
        ok: true,
        status: 200,
        async json() {
          return { observations: [] };
        },
      };
    };

    const runnerResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'runners' },
      body: {
        name: 'Durable HTTP Runner',
        endpointUrl: 'https://runner.example.test/harnessamp',
      },
    }, runnerResponse);

    assert.equal(runnerResponse.statusCode, 200);
    const runnerId = runnerResponse.body.runner.id;

    var firstCreate = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        runnerId,
        pack: bundle,
        profileId: 'support-agent',
        presetId: 'api-durable-test',
        thresholds: { minOverallScore: 60 },
        idempotencyKey: 'durable-job-key-001',
        maxAttempts: 2,
        timeoutMs: 1000,
      },
    }, firstCreate);

    assert.equal(firstCreate.statusCode, 200);
    assert.equal(firstCreate.body.status, 'queued');
    assert.equal(firstCreate.body.attempts, 0);
    assert.equal(firstCreate.body.maxAttempts, 2);
    assert.equal(runnerCalls, 0);

    const duplicateCreate = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        runnerId,
        pack: bundle,
        idempotencyKey: 'durable-job-key-001',
      },
    }, duplicateCreate);

    assert.equal(duplicateCreate.statusCode, 200);
    assert.equal(duplicateCreate.body.jobId, firstCreate.body.jobId);
    assert.equal(runnerCalls, 0);

    const listResponse = createMockResponse();
    await jobsHandler({
      method: 'GET',
      headers: {},
      query: { projectId: session.defaultProjectId, status: 'queued,retrying' },
    }, listResponse);

    assert.equal(listResponse.statusCode, 200);
    assert.ok(listResponse.body.jobs.some((job) => job.id === firstCreate.body.jobId));

    const runResponse = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: firstCreate.body.jobId, action: 'run' },
      body: { workerId: 'worker-api-test' },
    }, runResponse);

    assert.equal(runResponse.statusCode, 200);
    assert.equal(runResponse.body.status, 'completed');
    assert.equal(runResponse.body.attempts, 1);
    assert.equal(runResponse.body.claimedBy, null);
    assert.ok(runResponse.body.reportId);
    assert.deepEqual(
      runResponse.body.history.map((item) => item.status),
      ['queued', 'claimed', 'running', 'completed'],
    );
    assert.equal(runnerCalls, 1);

    const getResponse = createMockResponse();
    await jobsHandler({
      method: 'GET',
      headers: {},
      query: { id: firstCreate.body.jobId },
    }, getResponse);

    assert.equal(getResponse.statusCode, 200);
    assert.equal(getResponse.body.status, 'completed');
    assert.equal(getResponse.body.result.reportId, runResponse.body.reportId);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker service token can list and run project jobs without a browser session', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  process.env.WORKER_SERVICE_TOKEN = 'worker-service-secret';
  const session = await seedDevSession();
  const bundle = createDemoBundle();
  const originalFetch = globalThis.fetch;
  let runnerCalls = 0;

  try {
    const runnerResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'runners' },
      body: {
        name: 'Service Worker Runner',
        endpointUrl: 'https://runner.example.test/service-worker',
      },
    }, runnerResponse);

    assert.equal(runnerResponse.statusCode, 200);
    const runnerId = runnerResponse.body.runner.id;

    const createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        runnerId,
        pack: bundle,
        idempotencyKey: 'service-worker-job-key-001',
      },
    }, createResponse);

    assert.equal(createResponse.statusCode, 200);

    delete process.env.HARNESSAMP_DEV_AUTH;

    const unauthorizedList = createMockResponse();
    await jobsHandler({
      method: 'GET',
      headers: {},
      query: { projectId: session.defaultProjectId, status: 'queued' },
    }, unauthorizedList);
    assert.equal(unauthorizedList.statusCode, 401);

    const listResponse = createMockResponse();
    await jobsHandler({
      method: 'GET',
      headers: { authorization: 'Bearer worker-service-secret' },
      query: { projectId: session.defaultProjectId, status: 'queued,retrying' },
    }, listResponse);

    assert.equal(listResponse.statusCode, 200);
    assert.ok(listResponse.body.jobs.some((job) => job.id === createResponse.body.jobId));

    const wrongProjectRun = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: { authorization: 'Bearer worker-service-secret' },
      query: { id: createResponse.body.jobId, action: 'run' },
      body: {
        projectId: 'project_wrong',
        workerId: 'service-worker',
      },
    }, wrongProjectRun);

    assert.equal(wrongProjectRun.statusCode, 409);

    globalThis.fetch = async (url, init) => {
      runnerCalls += 1;
      const body = JSON.parse(init.body);
      assert.equal(url, 'https://runner.example.test/service-worker');
      assert.equal(body.jobId, createResponse.body.jobId);
      return {
        ok: true,
        status: 200,
        async json() {
          return { observations: [] };
        },
      };
    };

    const runResponse = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: { authorization: 'Bearer worker-service-secret' },
      query: { id: createResponse.body.jobId, action: 'run' },
      body: {
        projectId: session.defaultProjectId,
        workerId: 'service-worker',
      },
    }, runResponse);

    assert.equal(runResponse.statusCode, 200);
    assert.equal(runResponse.body.status, 'completed');
    assert.equal(runResponse.body.attempts, 1);
    assert.equal(runnerCalls, 1);

    const retryResponse = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: { authorization: 'Bearer worker-service-secret' },
      query: { id: createResponse.body.jobId, action: 'retry' },
      body: {},
    }, retryResponse);
    assert.equal(retryResponse.statusCode, 401);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.WORKER_SERVICE_TOKEN;
    process.env.HARNESSAMP_DEV_AUTH = '1';
  }
});

test('runner jobs retry failed attempts and can be canceled before execution', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const bundle = createDemoBundle();
  const originalFetch = globalThis.fetch;
  let runnerCalls = 0;

  try {
    const runnerResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'runners' },
      body: {
        name: 'Retry HTTP Runner',
        endpointUrl: 'https://runner.example.test/retry',
      },
    }, runnerResponse);

    assert.equal(runnerResponse.statusCode, 200);
    const runnerId = runnerResponse.body.runner.id;

    globalThis.fetch = async () => {
      runnerCalls += 1;
      if (runnerCalls === 1) {
        return {
          ok: false,
          status: 503,
          async json() {
            return {};
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return { observations: [] };
        },
      };
    };

    const createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        runnerId,
        pack: bundle,
        maxAttempts: 2,
        retryBackoffMs: 0,
      },
    }, createResponse);

    const failedAttempt = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: createResponse.body.jobId, action: 'run' },
      body: { workerId: 'retry-worker' },
    }, failedAttempt);

    assert.equal(failedAttempt.statusCode, 200);
    assert.equal(failedAttempt.body.status, 'retrying');
    assert.equal(failedAttempt.body.attempts, 1);
    assert.match(failedAttempt.body.error, /HTTP 503/);
    assert.ok(failedAttempt.body.history.some((item) => item.status === 'retrying' && item.error));

    const secondAttempt = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: createResponse.body.jobId, action: 'run' },
      body: { workerId: 'retry-worker' },
    }, secondAttempt);

    assert.equal(secondAttempt.statusCode, 200);
    assert.equal(secondAttempt.body.status, 'completed');
    assert.equal(secondAttempt.body.attempts, 2);
    assert.ok(secondAttempt.body.history.some((item) => item.status === 'completed' && item.reportId));
    assert.equal(runnerCalls, 2);

    const cancelCreate = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        runnerId,
        pack: bundle,
      },
    }, cancelCreate);

    const cancelResponse = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: cancelCreate.body.jobId, action: 'cancel' },
      body: {},
    }, cancelResponse);

    assert.equal(cancelResponse.statusCode, 200);
    assert.equal(cancelResponse.body.status, 'canceled');
    assert.ok(cancelResponse.body.finishedAt);
    assert.ok(cancelResponse.body.history.some((item) => item.status === 'canceled'));

    const runCanceled = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: cancelCreate.body.jobId, action: 'run' },
      body: {},
    }, runCanceled);

    assert.equal(runCanceled.statusCode, 409);
    assert.equal(runnerCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runner job claims reject duplicate workers and create only one report', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const bundle = createDemoBundle();
  const originalFetch = globalThis.fetch;
  let runnerCalls = 0;

  try {
    const runnerResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'runners' },
      body: {
        name: 'Contention Runner',
        endpointUrl: 'https://runner.example.test/contention',
      },
    }, runnerResponse);
    const runnerId = runnerResponse.body.runner.id;

    const createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        runnerId,
        pack: bundle,
        idempotencyKey: 'contention-job-key-001',
        maxAttempts: 2,
      },
    }, createResponse);

    globalThis.fetch = async () => {
      runnerCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        ok: true,
        status: 200,
        async json() {
          return { observations: [] };
        },
      };
    };

    const firstRun = createMockResponse();
    const secondRun = createMockResponse();
    await Promise.all([
      jobsHandler({
        method: 'POST',
        headers: {},
        query: { id: createResponse.body.jobId, action: 'run' },
        body: { workerId: 'worker-a' },
      }, firstRun),
      jobsHandler({
        method: 'POST',
        headers: {},
        query: { id: createResponse.body.jobId, action: 'run' },
        body: { workerId: 'worker-b' },
      }, secondRun),
    ]);

    const statuses = [firstRun.statusCode, secondRun.statusCode].sort();
    assert.deepEqual(statuses, [200, 409]);
    const completed = [firstRun, secondRun].find((response) => response.statusCode === 200);
    assert.equal(completed.body.status, 'completed');
    assert.ok(completed.body.reportId);
    assert.equal(runnerCalls, 1);

    const getResponse = createMockResponse();
    await jobsHandler({
      method: 'GET',
      headers: {},
      query: { id: createResponse.body.jobId },
    }, getResponse);

    assert.equal(getResponse.body.status, 'completed');
    assert.equal(getResponse.body.reportId, completed.body.reportId);
    assert.equal(getResponse.body.history.filter((item) => item.status === 'completed').length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker polling recovers stale claimed jobs for retry', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  process.env.WORKER_SERVICE_TOKEN = 'worker-recovery-secret';
  const session = await seedDevSession();
  const bundle = createDemoBundle();

  try {
    const runnerResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'runners' },
      body: {
        name: 'Recovery Runner',
        endpointUrl: 'https://runner.example.test/recovery',
      },
    }, runnerResponse);

    const createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        runnerId: runnerResponse.body.runner.id,
        pack: bundle,
        idempotencyKey: 'stale-recovery-job-key-001',
        maxAttempts: 2,
      },
    }, createResponse);

    const claimResponse = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: createResponse.body.jobId, action: 'claim' },
      body: { workerId: 'crashed-worker' },
    }, claimResponse);

    assert.equal(claimResponse.statusCode, 200);
    assert.equal(claimResponse.body.status, 'claimed');
    assert.equal(claimResponse.body.attempts, 1);

    await new Promise((resolve) => setTimeout(resolve, 5));
    delete process.env.HARNESSAMP_DEV_AUTH;

    const listResponse = createMockResponse();
    await jobsHandler({
      method: 'GET',
      headers: { authorization: 'Bearer worker-recovery-secret' },
      query: {
        projectId: session.defaultProjectId,
        status: 'queued,retrying',
        staleAfterMs: '1',
      },
    }, listResponse);

    assert.equal(listResponse.statusCode, 200);
    const recovered = listResponse.body.jobs.find((job) => job.id === createResponse.body.jobId);
    assert.equal(recovered.status, 'retrying');
    assert.match(recovered.retryReason, /Worker lease expired/);
    assert.equal(recovered.claimedBy, null);
  } finally {
    delete process.env.WORKER_SERVICE_TOKEN;
    process.env.HARNESSAMP_DEV_AUTH = '1';
  }
});

test('canceling a running job prevents report creation after worker response', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const bundle = createDemoBundle();
  const originalFetch = globalThis.fetch;
  let releaseRunner;
  let runnerCalls = 0;
  const runnerStarted = new Promise((resolve) => {
    globalThis.fetch = async () => {
      runnerCalls += 1;
      resolve();
      await new Promise((release) => {
        releaseRunner = release;
      });
      return {
        ok: true,
        status: 200,
        async json() {
          return { observations: [] };
        },
      };
    };
  });

  try {
    const runnerResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'runners' },
      body: {
        name: 'Cancel Running Runner',
        endpointUrl: 'https://runner.example.test/cancel-running',
      },
    }, runnerResponse);

    const createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        runnerId: runnerResponse.body.runner.id,
        pack: bundle,
        idempotencyKey: 'cancel-running-job-key-001',
      },
    }, createResponse);

    const runResponse = createMockResponse();
    const runPromise = jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: createResponse.body.jobId, action: 'run' },
      body: { workerId: 'cancel-test-worker' },
    }, runResponse);

    await runnerStarted;

    const cancelResponse = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: createResponse.body.jobId, action: 'cancel' },
      body: {},
    }, cancelResponse);

    assert.equal(cancelResponse.statusCode, 200);
    assert.equal(cancelResponse.body.status, 'canceled');
    assert.equal(cancelResponse.body.reportId, null);

    releaseRunner();
    await runPromise;

    assert.equal(runResponse.statusCode, 200);
    assert.equal(runResponse.body.status, 'canceled');
    assert.equal(runResponse.body.reportId, null);
    assert.equal(runnerCalls, 1);

    const getResponse = createMockResponse();
    await jobsHandler({
      method: 'GET',
      headers: {},
      query: { id: createResponse.body.jobId },
    }, getResponse);
    assert.equal(getResponse.body.status, 'canceled');
    assert.equal(getResponse.body.reportId, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Vercel AI SDK adapter jobs run through the worker and link reports', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const bundle = createDemoBundle();

  const createResponse = createMockResponse();
  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'jobs' },
    body: {
      adapter: {
        type: 'vercel-ai-sdk',
        target: './examples/vercel-ai-sdk/app/api/chat/route.mjs',
        modelLabel: 'fixture/worker',
        mode: 'sample',
      },
      pack: bundle,
      idempotencyKey: 'vercel-ai-sdk-worker-job-001',
      maxAttempts: 2,
      timeoutMs: 5000,
    },
  }, createResponse);

  assert.equal(createResponse.statusCode, 200);
  assert.equal(createResponse.body.status, 'queued');
  assert.equal(createResponse.body.adapter.type, 'vercel-ai-sdk');

  const runResponse = createMockResponse();
  await jobsHandler({
    method: 'POST',
    headers: {},
    query: { id: createResponse.body.jobId, action: 'run' },
    body: { workerId: 'adapter-worker' },
  }, runResponse);

  assert.equal(runResponse.statusCode, 200);
  assert.equal(runResponse.body.status, 'completed');
  assert.equal(runResponse.body.attempts, 1);
  assert.ok(runResponse.body.reportId);
  assert.equal(runResponse.body.result.reportId, runResponse.body.reportId);
  assert.equal(runResponse.body.result.execution.adapterType, 'vercel-ai-sdk');
  assert.equal(runResponse.body.result.diagnostics.adapterType, 'vercel-ai-sdk');
});

test('project jobs accept normalized execution target payloads', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const bundle = createDemoBundle();

  const runnerResponse = createMockResponse();
  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'runners' },
    body: {
      name: 'Execution Target Runner',
      endpointUrl: 'https://runner.example.com/harnessamp',
    },
  }, runnerResponse);

  const registeredJobResponse = createMockResponse();
  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'jobs' },
    body: {
      executionTarget: {
        type: 'registered_runner',
        runnerId: runnerResponse.body.runner.id,
      },
      pack: bundle,
      idempotencyKey: 'execution-target-runner-job-001',
    },
  }, registeredJobResponse);

  assert.equal(registeredJobResponse.statusCode, 200);
  assert.equal(registeredJobResponse.body.executionTarget.type, 'registered_runner');
  assert.equal(registeredJobResponse.body.executionTarget.runnerId, runnerResponse.body.runner.id);

  const adapterJobResponse = createMockResponse();
  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'jobs' },
    body: {
      execution_target: {
        type: 'vercel_ai_sdk',
        routeUrl: './examples/vercel-ai-sdk/app/api/chat/route.mjs',
      },
      pack: bundle,
      idempotencyKey: 'execution-target-vercel-job-001',
    },
  }, adapterJobResponse);

  assert.equal(adapterJobResponse.statusCode, 200);
  assert.equal(adapterJobResponse.body.executionTarget.type, 'vercel_ai_sdk');
  assert.equal(adapterJobResponse.body.executionTarget.routeUrl, './examples/vercel-ai-sdk/app/api/chat/route.mjs');
  assert.equal(adapterJobResponse.body.execution.type, 'vercel_ai_sdk');
});

test('project job creation rejects invalid local tunnel URL before enqueueing', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const createResponse = createMockResponse();

  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'jobs' },
    body: {
      executionTarget: {
        type: 'local_http_tunnel',
        endpointUrl: 'not a url',
      },
      pack: createDemoBundle(),
      idempotencyKey: 'local-tunnel-invalid-url-001',
    },
  }, createResponse);

  assert.equal(createResponse.statusCode, 400);
  assert.match(createResponse.body.error, /valid URL/);
});

test('project job creation rejects non-HTTPS local tunnel URL before enqueueing', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const createResponse = createMockResponse();

  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'jobs' },
    body: {
      executionTarget: {
        type: 'local_http_tunnel',
        endpointUrl: 'http://localhost:3000/harnessamp',
      },
      pack: createDemoBundle(),
      idempotencyKey: 'local-tunnel-http-url-001',
    },
  }, createResponse);

  assert.equal(createResponse.statusCode, 400);
  assert.match(createResponse.body.error, /HTTPS endpoint URL/);
});

test('project job creation rejects localhost local tunnel URL before enqueueing', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const createResponse = createMockResponse();

  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'jobs' },
    body: {
      executionTarget: {
        type: 'local_http_tunnel',
        endpointUrl: 'https://localhost:3000/harnessamp',
      },
      pack: createDemoBundle(),
      idempotencyKey: 'local-tunnel-localhost-001',
    },
  }, createResponse);

  assert.equal(createResponse.statusCode, 400);
  assert.match(createResponse.body.error, /private|metadata|blocked/i);
});

test('project job creation rejects private IP local tunnel URL before enqueueing', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const createResponse = createMockResponse();

  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'jobs' },
    body: {
      executionTarget: {
        type: 'local_http_tunnel',
        endpointUrl: 'https://192.168.1.20/harnessamp',
      },
      pack: createDemoBundle(),
      idempotencyKey: 'local-tunnel-private-ip-001',
    },
  }, createResponse);

  assert.equal(createResponse.statusCode, 400);
  assert.match(createResponse.body.error, /private|metadata|blocked/i);
});

test('project job creation rejects metadata IP local tunnel URL before enqueueing', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const createResponse = createMockResponse();

  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'jobs' },
    body: {
      executionTarget: {
        type: 'local_http_tunnel',
        endpointUrl: 'https://169.254.169.254/latest/meta-data',
      },
      pack: createDemoBundle(),
      idempotencyKey: 'local-tunnel-metadata-ip-001',
    },
  }, createResponse);

  assert.equal(createResponse.statusCode, 400);
  assert.match(createResponse.body.error, /private|metadata|blocked/i);
});

test('project job creation rejects local tunnel DNS resolution to private IP before enqueueing', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const restoreDns = installLocalTunnelDns('10.0.0.8');

  try {
    const createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        executionTarget: {
          type: 'local_http_tunnel',
          endpointUrl: 'https://local-agent.example.test/harnessamp',
        },
        pack: createDemoBundle(),
        idempotencyKey: 'local-tunnel-dns-private-001',
      },
    }, createResponse);

    assert.equal(createResponse.statusCode, 400);
    assert.match(createResponse.body.error, /DNS resolved to a private|metadata/i);
  } finally {
    restoreDns();
  }
});

test('project job creation blocks local tunnel redirect to private IP before enqueueing', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const originalFetch = globalThis.fetch;
  const restoreDns = installLocalTunnelDns();

  try {
    globalThis.fetch = async (url) => {
      assert.equal(url, 'https://local-agent.example.test/harnessamp');
      return createFetchResponse({
        ok: false,
        status: 302,
        headers: { location: 'https://127.0.0.1:3000/harnessamp' },
        body: '',
      });
    };
    const createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        executionTarget: {
          type: 'local_http_tunnel',
          endpointUrl: 'https://local-agent.example.test/harnessamp',
        },
        pack: createDemoBundle(),
        idempotencyKey: 'local-tunnel-redirect-private-001',
      },
    }, createResponse);

    assert.equal(createResponse.statusCode, 400);
    assert.match(createResponse.body.error, /redirect.*unsafe|redirect.*blocked/i);
  } finally {
    globalThis.fetch = originalFetch;
    restoreDns();
  }
});

test('project job creation rejects unreachable local tunnel before enqueueing', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const originalFetch = globalThis.fetch;
  const restoreDns = installLocalTunnelDns();

  try {
    globalThis.fetch = async () => {
      throw new Error('connect ECONNREFUSED');
    };
    const createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        executionTarget: {
          type: 'local_http_tunnel',
          endpointUrl: 'https://local-agent.example.test/harnessamp',
        },
        pack: createDemoBundle(),
        idempotencyKey: 'local-tunnel-unreachable-001',
      },
    }, createResponse);

    assert.equal(createResponse.statusCode, 400);
    assert.match(createResponse.body.error, /unreachable/i);
  } finally {
    globalThis.fetch = originalFetch;
    restoreDns();
  }
});

test('project job creation rejects failed local tunnel adapter preflight', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const originalFetch = globalThis.fetch;
  const restoreDns = installLocalTunnelDns();

  try {
    globalThis.fetch = async () => createFetchResponse({ body: { ok: false } });
    const createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        executionTarget: {
          type: 'local_http_tunnel',
          endpointUrl: 'https://local-agent.example.test/harnessamp',
        },
        pack: createDemoBundle(),
        idempotencyKey: 'local-tunnel-failed-preflight-001',
      },
    }, createResponse);

    assert.equal(createResponse.statusCode, 400);
    assert.match(createResponse.body.error, /endpoint must return/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreDns();
  }
});

test('project job creation rejects local tunnel preflight timeout', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const originalFetch = globalThis.fetch;
  const restoreDns = installLocalTunnelDns();

  try {
    globalThis.fetch = async () => new Promise(() => {});
    const createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        executionTarget: {
          type: 'local_http_tunnel',
          endpointUrl: 'https://local-agent.example.test/harnessamp',
        },
        pack: createDemoBundle(),
        idempotencyKey: 'local-tunnel-preflight-timeout-001',
        preflightTimeoutMs: 10,
      },
    }, createResponse);

    assert.equal(createResponse.statusCode, 400);
    assert.match(createResponse.body.error, /timed out/i);
  } finally {
    globalThis.fetch = originalFetch;
    restoreDns();
  }
});

test('local tunnel jobs preflight and dispatch with run token authentication', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const bundle = createDemoBundle();
  const originalFetch = globalThis.fetch;
  const restoreDns = installLocalTunnelDns();
  const calls = [];

  try {
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url, body: JSON.parse(init.body), token: init.headers['x-harnessamp-run-token'] });
      assert.equal(url, 'https://local-agent.example.test/harnessamp');
      assert.ok(init.headers['x-harnessamp-run-token']);
      const body = JSON.parse(init.body);
      if (body.preflight) {
        return createFetchResponse({ body: { ok: true } });
      }
      assert.equal(body.jobId, createResponse.body.jobId);
      assert.equal(body.profile, 'support-agent');
      assert.equal(body.preset, 'local-tunnel-test');
      return createFetchResponse({ body: { observations: [] } });
    };

    var createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        executionTarget: {
          type: 'local_http_tunnel',
          endpointUrl: 'https://local-agent.example.test/harnessamp',
        },
        pack: bundle,
        profileId: 'support-agent',
        presetId: 'local-tunnel-test',
        idempotencyKey: 'local-tunnel-dispatch-001',
        timeoutMs: 1000,
      },
    }, createResponse);

    assert.equal(createResponse.statusCode, 200);
    assert.equal(createResponse.body.executionTarget.type, 'local_http_tunnel');
    assert.equal(createResponse.body.executionTarget.label, 'Ephemeral local test target');
    assert.equal(createResponse.body.executionTarget.reuseLabel, 'Not reusable');
    assert.equal(createResponse.body.executionTarget.transport, 'http');
    assert.equal(createResponse.body.execution.kind, 'http-tunnel');

    const runResponse = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: createResponse.body.jobId, action: 'run' },
      body: { workerId: 'local-tunnel-worker' },
    }, runResponse);

    assert.equal(runResponse.statusCode, 200);
    assert.equal(runResponse.body.status, 'completed');
    assert.equal(runResponse.body.result.execution.type, 'local_http_tunnel');
    assert.equal(runResponse.body.result.execution.label, 'Ephemeral local test target');
    assert.equal(runResponse.body.result.execution.reuseLabel, 'Not reusable');
    assert.equal(runResponse.body.result.execution.endpointUrl, 'https://local-agent.example.test/harnessamp');
    assert.doesNotMatch(JSON.stringify(runResponse.body), /runToken|tokenNonce|x-harnessamp-run-token/);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.preflight, true);
    assert.equal(calls[0].token, calls[1].token);
    assert.equal(calls[1].body.jobId, createResponse.body.jobId);
  } finally {
    globalThis.fetch = originalFetch;
    restoreDns();
  }
});

test('project target validation records safe audit events without secrets', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const originalFetch = globalThis.fetch;
  const restoreDns = installLocalTunnelDns();
  let expectedToken = '';

  try {
    globalThis.fetch = async (_url, init = {}) => {
      const body = JSON.parse(init.body);
      const token = init.headers['x-harnessamp-run-token'];
      assert.ok(token);
      if (body.preflight) {
        expectedToken = token;
        return createFetchResponse({ body: { ok: true } });
      }
      if (token !== expectedToken) {
        return createFetchResponse({ ok: false, status: 403, body: { error: 'invalid_run_token', retryable: false } });
      }
      return createFetchResponse({
        body: {
          observations: [{
            taskId: 'doctor-scenario-001',
            outputText: 'ok',
            metadata: { passed: true },
          }],
        },
      });
    };

    const response = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'validate-target' },
      body: {
        executionTarget: {
          type: 'local_http_tunnel',
          endpointUrl: 'https://local-agent.example.test/harnessamp?token=should-redact',
        },
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.validation.ok, true);
    assert.doesNotMatch(JSON.stringify(response.body), /expectedToken|tokenNonce|x-harnessamp-run-token/);

    const events = await listEventsForProject({
      projectId: session.defaultProjectId,
      userId: session.user.id,
      name: 'execution_target_validation',
    });
    const event = events[0];
    assert.equal(event.name, 'execution_target_validation');
    assert.equal(event.targetType, 'local_http_tunnel');
    assert.equal(event.status, 'passed');
    assert.equal(event.failureClass, null);
    assert.equal(event.contractVersion, HARNESSAMP_ADAPTER_CONTRACT_VERSION);
    assert.doesNotMatch(JSON.stringify(event), /should-redact|x-harnessamp-run-token|secret|authorization/i);
  } finally {
    globalThis.fetch = originalFetch;
    restoreDns();
  }
});

test('project target validation fails closed in production without local tunnel token secret', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.HARNESSAMP_LOCAL_TUNNEL_TOKEN_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.HARNESSAMP_LOCAL_TUNNEL_TOKEN_SECRET;
    const response = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'validate-target' },
      body: {
        executionTarget: {
          type: 'local_http_tunnel',
          endpointUrl: 'https://local-agent.example.test/harnessamp?secret=never-store',
        },
      },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.validation.ok, false);
    assert.equal(response.body.validation.checks[0].failureClass, 'local_tunnel_token_secret_missing');

    const events = await listEventsForProject({
      projectId: session.defaultProjectId,
      userId: session.user.id,
      name: 'execution_target_validation',
    });
    const event = events.find((item) => item.failureClass === 'local_tunnel_token_secret_missing');
    assert.ok(event);
    assert.equal(event.status, 'failed');
    assert.doesNotMatch(JSON.stringify(event), /never-store|x-harnessamp-run-token|secret=/i);
  } finally {
    restoreEnv('NODE_ENV', previousNodeEnv);
    restoreEnv('HARNESSAMP_LOCAL_TUNNEL_TOKEN_SECRET', previousSecret);
  }
});

test('project job creation fails closed in production without local tunnel token secret', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.HARNESSAMP_LOCAL_TUNNEL_TOKEN_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.HARNESSAMP_LOCAL_TUNNEL_TOKEN_SECRET;
    const response = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        executionTarget: {
          type: 'local_http_tunnel',
          endpointUrl: 'https://local-agent.example.test/harnessamp',
        },
        pack: createDemoBundle(),
        idempotencyKey: 'local-tunnel-prod-secret-missing-001',
      },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.match(response.body.error, /token secret.*missing/i);
  } finally {
    restoreEnv('NODE_ENV', previousNodeEnv);
    restoreEnv('HARNESSAMP_LOCAL_TUNNEL_TOKEN_SECRET', previousSecret);
  }
});

test('local tunnel worker dispatch timeout fails with normalized class', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const originalFetch = globalThis.fetch;
  const restoreDns = installLocalTunnelDns();
  let calls = 0;

  try {
    globalThis.fetch = async (url, init = {}) => {
      calls += 1;
      const body = JSON.parse(init.body);
      return body.preflight
        ? createFetchResponse({ body: { ok: true } })
        : new Promise(() => {});
    };
    const createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        executionTarget: {
          type: 'local_http_tunnel',
          endpointUrl: 'https://local-agent.example.test/harnessamp',
        },
        pack: createDemoBundle(),
        idempotencyKey: 'local-tunnel-dispatch-timeout-001',
        timeoutMs: 10,
      },
    }, createResponse);
    assert.equal(createResponse.statusCode, 200);

    const runResponse = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: createResponse.body.jobId, action: 'run' },
      body: { workerId: 'local-tunnel-worker' },
    }, runResponse);

    assert.equal(runResponse.statusCode, 200);
    assert.equal(runResponse.body.status, 'failed');
    assert.equal(runResponse.body.result.failureClass, 'local_tunnel_timeout');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreDns();
  }
});

test('local tunnel worker dispatch rejects invalid JSON response', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const originalFetch = globalThis.fetch;
  const restoreDns = installLocalTunnelDns();

  try {
    globalThis.fetch = async (url, init = {}) => {
      const body = JSON.parse(init.body);
      return body.preflight
        ? createFetchResponse({ body: { ok: true } })
        : createFetchResponse({ body: '{not-json' });
    };
    const createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        executionTarget: {
          type: 'local_http_tunnel',
          endpointUrl: 'https://local-agent.example.test/harnessamp',
        },
        pack: createDemoBundle(),
        idempotencyKey: 'local-tunnel-invalid-json-001',
      },
    }, createResponse);
    assert.equal(createResponse.statusCode, 200);

    const runResponse = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: createResponse.body.jobId, action: 'run' },
      body: { workerId: 'local-tunnel-worker' },
    }, runResponse);

    assert.equal(runResponse.statusCode, 200);
    assert.equal(runResponse.body.status, 'failed');
    assert.equal(runResponse.body.result.failureClass, 'local_tunnel_invalid_json');
  } finally {
    globalThis.fetch = originalFetch;
    restoreDns();
  }
});

test('local tunnel worker dispatch rejects oversized response with truncated diagnostics', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const originalFetch = globalThis.fetch;
  const restoreDns = installLocalTunnelDns();

  try {
    globalThis.fetch = async (url, init = {}) => {
      const body = JSON.parse(init.body);
      return body.preflight
        ? createFetchResponse({ body: { ok: true } })
        : createFetchResponse({
          body: JSON.stringify({ observations: [], padding: 'x'.repeat(128) }),
          headers: { 'content-length': '160' },
        });
    };
    const createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        executionTarget: {
          type: 'local_http_tunnel',
          endpointUrl: 'https://local-agent.example.test/harnessamp',
        },
        pack: createDemoBundle(),
        idempotencyKey: 'local-tunnel-oversized-response-001',
        maxResponseBytes: 96,
      },
    }, createResponse);
    assert.equal(createResponse.statusCode, 200);

    const runResponse = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: createResponse.body.jobId, action: 'run' },
      body: { workerId: 'local-tunnel-worker' },
    }, runResponse);

    assert.equal(runResponse.statusCode, 200);
    assert.equal(runResponse.body.status, 'failed');
    assert.equal(runResponse.body.result.failureClass, 'local_tunnel_contract_mismatch');
    assert.ok(runResponse.body.result.diagnostics.rawErrorMessage.length <= 600);
  } finally {
    globalThis.fetch = originalFetch;
    restoreDns();
  }
});

test('local tunnel closed endpoint fails with closed-or-expired class', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const originalFetch = globalThis.fetch;
  const restoreDns = installLocalTunnelDns();

  try {
    globalThis.fetch = async (url, init = {}) => {
      const body = JSON.parse(init.body);
      return body.preflight
        ? createFetchResponse({ body: { ok: true } })
        : createFetchResponse({ ok: false, status: 410, body: { error: 'gone' } });
    };
    const createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        executionTarget: {
          type: 'local_http_tunnel',
          endpointUrl: 'https://local-agent.example.test/harnessamp',
        },
        pack: createDemoBundle(),
        idempotencyKey: 'local-tunnel-closed-001',
      },
    }, createResponse);
    assert.equal(createResponse.statusCode, 200);

    const runResponse = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: createResponse.body.jobId, action: 'run' },
      body: { workerId: 'local-tunnel-worker' },
    }, runResponse);

    assert.equal(runResponse.statusCode, 200);
    assert.equal(runResponse.body.status, 'failed');
    assert.equal(runResponse.body.result.failureClass, 'local_tunnel_closed_or_expired');
  } finally {
    globalThis.fetch = originalFetch;
    restoreDns();
  }
});

test('local tunnel missing or incorrect run token fails cleanly', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const originalFetch = globalThis.fetch;
  const restoreDns = installLocalTunnelDns();

  try {
    globalThis.fetch = async (url, init = {}) => {
      const body = JSON.parse(init.body);
      if (body.preflight) return createFetchResponse({ body: { ok: true } });
      return createFetchResponse({ ok: false, status: 403, body: { error: 'bad token' } });
    };
    const createResponse = createMockResponse();
    await projectsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, resource: 'jobs' },
      body: {
        executionTarget: {
          type: 'local_http_tunnel',
          endpointUrl: 'https://local-agent.example.test/harnessamp',
        },
        pack: createDemoBundle(),
        idempotencyKey: 'local-tunnel-bad-token-001',
      },
    }, createResponse);
    assert.equal(createResponse.statusCode, 200);

    const runResponse = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: createResponse.body.jobId, action: 'run' },
      body: { workerId: 'local-tunnel-worker' },
    }, runResponse);

    assert.equal(runResponse.statusCode, 200);
    assert.equal(runResponse.body.status, 'failed');
    assert.equal(runResponse.body.result.failureClass, 'local_tunnel_contract_mismatch');
    assert.doesNotMatch(JSON.stringify(runResponse.body), /runToken|tokenNonce|x-harnessamp-run-token/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreDns();
  }
});

test('project job creation rejects hosted provider BYOK without secret infrastructure', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const createResponse = createMockResponse();

  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'jobs' },
    body: {
      executionTarget: {
        type: 'hosted_provider',
        provider: 'openai',
        model: 'gpt-5.4',
        apiKey: 'sk-test-should-not-be-accepted',
      },
      pack: createDemoBundle(),
    },
  }, createResponse);

  assert.equal(createResponse.statusCode, 400);
  assert.match(createResponse.body.error, /Unsupported execution target type: hosted_provider|raw provider API keys/);
});

test('project secrets are encrypted and list safe metadata only', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  process.env.HARNESSAMP_ENABLE_HOSTED_BYOK = '1';
  process.env.HARNESSAMP_SECRET_ENCRYPTION_KEY = 'test-secret-encryption-key';
  const session = await seedDevSession();

  const createResponse = createMockResponse();
  await secretsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId },
    body: {
      provider: 'openai',
      name: 'OpenAI test key',
      secretValue: 'sk-test-secret-1234abcd',
    },
  }, createResponse);

  assert.equal(createResponse.statusCode, 200);
  assert.equal(createResponse.body.secret.provider, 'openai');
  assert.equal(createResponse.body.secret.maskedPreview, 'sk-...abcd');
  assert.equal(JSON.stringify(createResponse.body), JSON.stringify(createResponse.body).replace('sk-test-secret-1234abcd', ''));

  const listResponse = createMockResponse();
  await secretsHandler({
    method: 'GET',
    headers: {},
    query: { projectId: session.defaultProjectId },
  }, listResponse);

  assert.equal(listResponse.statusCode, 200);
  assert.ok(listResponse.body.secrets.some((secret) => secret.id === createResponse.body.secret.id));
  assert.doesNotMatch(JSON.stringify(listResponse.body), /sk-test-secret/);

  const disableResponse = createMockResponse();
  await secretsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, id: createResponse.body.secret.id },
    body: { action: 'disable' },
  }, disableResponse);
  assert.equal(disableResponse.body.secret.status, 'disabled');

  const deleteResponse = createMockResponse();
  await secretsHandler({
    method: 'DELETE',
    headers: {},
    query: { projectId: session.defaultProjectId, id: createResponse.body.secret.id },
  }, deleteResponse);
  assert.equal(deleteResponse.body.secret.status, 'deleted');
});

test('project secrets validate and rotate without returning plaintext', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  process.env.HARNESSAMP_ENABLE_HOSTED_BYOK = '1';
  process.env.HARNESSAMP_SECRET_ENCRYPTION_KEY = 'test-secret-encryption-key';
  const session = await seedDevSession();
  const originalFetch = globalThis.fetch;

  try {
    const createResponse = createMockResponse();
    await secretsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId },
      body: {
        provider: 'anthropic',
        environment: 'staging',
        name: 'Anthropic staging key',
        secretValue: 'sk-ant-test-secret-rotate-1234',
      },
    }, createResponse);

    assert.equal(createResponse.statusCode, 200);
    assert.equal(createResponse.body.secret.environment, 'staging');
    assert.equal(createResponse.body.secret.configured, true);
    assert.doesNotMatch(JSON.stringify(createResponse.body), /sk-ant-test-secret-rotate/);

    globalThis.fetch = async (url, init = {}) => {
      assert.equal(url, 'https://api.anthropic.com/v1/messages');
      assert.equal(init.headers['x-api-key'], 'sk-ant-test-secret-rotate-1234');
      return createFetchResponse({
        ok: false,
        status: 401,
        body: { error: { message: 'bad key sk-ant-test-secret-rotate-1234 Authorization: Bearer sk-ant-test-secret-rotate-1234' } },
      });
    };

    const validateResponse = createMockResponse();
    await secretsHandler({
      method: 'POST',
      headers: {},
      query: { projectId: session.defaultProjectId, id: createResponse.body.secret.id, action: 'validate' },
      body: { action: 'validate', model: 'claude-test' },
    }, validateResponse);

    assert.equal(validateResponse.statusCode, 200);
    assert.equal(validateResponse.body.secret.validationStatus, 'invalid');
    assert.equal(validateResponse.body.secret.lastValidationErrorClass, 'hosted_provider_auth_failed');
    assert.doesNotMatch(JSON.stringify(validateResponse.body), /sk-ant-test-secret-rotate/);
    assert.doesNotMatch(JSON.stringify(validateResponse.body), /Bearer sk-ant/);

    const rotateResponse = createMockResponse();
    await secretsHandler({
      method: 'PATCH',
      headers: {},
      query: { projectId: session.defaultProjectId, id: createResponse.body.secret.id },
      body: {
        provider: 'anthropic',
        environment: 'production',
        name: 'Anthropic production key',
        secretValue: 'sk-ant-test-secret-new-5678',
      },
    }, rotateResponse);

    assert.equal(rotateResponse.statusCode, 200);
    assert.equal(rotateResponse.body.secret.environment, 'production');
    assert.equal(rotateResponse.body.secret.validationStatus, 'pending');
    assert.doesNotMatch(JSON.stringify(rotateResponse.body), /sk-ant-test-secret-new/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('hosted provider jobs run through worker with safe metadata only', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  process.env.HARNESSAMP_ENABLE_HOSTED_BYOK = '1';
  process.env.HARNESSAMP_SECRET_ENCRYPTION_KEY = 'test-secret-encryption-key';
  const session = await seedDevSession();
  const secretResponse = createMockResponse();
  await secretsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId },
    body: {
      provider: 'openai',
      name: 'OpenAI worker key',
      secretValue: 'sk-worker-secret-1234wxyz',
    },
  }, secretResponse);

  const createResponse = createMockResponse();
  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'jobs' },
    body: {
      executionTarget: {
        type: 'hosted_provider',
        provider: 'openai',
        model: 'gpt-test',
        secretRef: secretResponse.body.secret.id,
      },
      pack: createDemoBundle(),
      idempotencyKey: 'hosted-provider-job-001',
      timeoutMs: 5000,
    },
  }, createResponse);
  assert.equal(createResponse.statusCode, 200);
  assert.equal(createResponse.body.executionTarget.type, 'hosted_provider');

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init = {}) => {
      assert.equal(url, 'https://api.openai.com/v1/chat/completions');
      assert.equal(init.headers.authorization, 'Bearer sk-worker-secret-1234wxyz');
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            choices: [{ message: { content: 'Hosted provider answer.' } }],
            usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
          });
        },
      };
    };
    const runResponse = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: createResponse.body.jobId, action: 'run' },
      body: { workerId: 'hosted-worker' },
    }, runResponse);

    assert.equal(runResponse.statusCode, 200);
    assert.equal(runResponse.body.status, 'completed');
    assert.equal(runResponse.body.result.execution.provider, 'openai');
    assert.equal(runResponse.body.result.execution.model, 'gpt-test');
    assert.doesNotMatch(JSON.stringify(runResponse.body), /sk-worker-secret/);
    assert.doesNotMatch(JSON.stringify(runResponse.body), /authorization/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('hosted provider worker failures redact provider secrets and normalize auth failures', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  process.env.HARNESSAMP_ENABLE_HOSTED_BYOK = '1';
  process.env.HARNESSAMP_SECRET_ENCRYPTION_KEY = 'test-secret-encryption-key';
  const session = await seedDevSession();
  const secretResponse = createMockResponse();
  await secretsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId },
    body: {
      provider: 'openai',
      environment: 'production',
      name: 'OpenAI invalid key',
      secretValue: 'sk-worker-invalid-secret-9999',
    },
  }, secretResponse);

  const createResponse = createMockResponse();
  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'jobs' },
    body: {
      executionTarget: {
        type: 'hosted_provider',
        provider: 'openai',
        model: 'gpt-test',
        environment: 'production',
        secretRef: secretResponse.body.secret.id,
      },
      pack: createDemoBundle(),
      idempotencyKey: 'hosted-provider-invalid-key-job-001',
      timeoutMs: 5000,
    },
  }, createResponse);

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => createFetchResponse({
      ok: false,
      status: 401,
      body: { error: { message: 'Invalid bearer sk-worker-invalid-secret-9999 Authorization: Bearer sk-worker-invalid-secret-9999' } },
    });
    const runResponse = createMockResponse();
    await jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: createResponse.body.jobId, action: 'run' },
      body: { workerId: 'hosted-worker' },
    }, runResponse);

    assert.equal(runResponse.statusCode, 200);
    assert.equal(runResponse.body.status, 'failed');
    assert.equal(runResponse.body.result.failureClass, 'hosted_provider_auth_failed');
    assert.doesNotMatch(JSON.stringify(runResponse.body), /sk-worker-invalid-secret/);
    assert.doesNotMatch(JSON.stringify(runResponse.body), /Bearer sk-worker/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Vercel AI SDK adapter jobs expose failure class and stop non-retryable config failures', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const bundle = createDemoBundle();

  const createResponse = createMockResponse();
  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'jobs' },
    body: {
      adapter: {
        type: 'vercel-ai-sdk',
        target: './examples/vercel-ai-sdk/app/api/chat/missing-route.mjs',
        modelLabel: 'fixture/missing',
      },
      pack: bundle,
      idempotencyKey: 'vercel-ai-sdk-missing-route-job-001',
      maxAttempts: 3,
      timeoutMs: 5000,
    },
  }, createResponse);

  assert.equal(createResponse.statusCode, 200);

  const runResponse = createMockResponse();
  await jobsHandler({
    method: 'POST',
    headers: {},
    query: { id: createResponse.body.jobId, action: 'run' },
    body: { workerId: 'adapter-worker' },
  }, runResponse);

  assert.equal(runResponse.statusCode, 200);
  assert.equal(runResponse.body.status, 'failed');
  assert.equal(runResponse.body.attempts, 1);
  assert.equal(runResponse.body.result.failureClass, 'adapter_target_missing');
  assert.equal(runResponse.body.result.retryable, false);
});

test('project job creation rejects invalid adapter config before enqueueing', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const createResponse = createMockResponse();

  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'jobs' },
    body: {
      adapter: { type: 'vercel-ai-sdk' },
      pack: createDemoBundle(),
    },
  }, createResponse);

  assert.equal(createResponse.statusCode, 400);
  assert.match(createResponse.body.error, /requires target/);
});

test('Vercel AI SDK adapter jobs keep duplicate workers from creating duplicate reports', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const bundle = createDemoBundle();

  const createResponse = createMockResponse();
  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'jobs' },
    body: {
      adapter: {
        type: 'vercel-ai-sdk',
        target: './examples/vercel-ai-sdk/app/api/chat/route.mjs',
        mode: 'sample',
      },
      pack: bundle,
      idempotencyKey: 'vercel-ai-sdk-contention-job-001',
      maxAttempts: 2,
    },
  }, createResponse);

  const firstRun = createMockResponse();
  const secondRun = createMockResponse();
  await Promise.all([
    jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: createResponse.body.jobId, action: 'run' },
      body: { workerId: 'adapter-worker-a' },
    }, firstRun),
    jobsHandler({
      method: 'POST',
      headers: {},
      query: { id: createResponse.body.jobId, action: 'run' },
      body: { workerId: 'adapter-worker-b' },
    }, secondRun),
  ]);

  assert.deepEqual([firstRun.statusCode, secondRun.statusCode].sort(), [200, 409]);
  const completed = [firstRun, secondRun].find((response) => response.statusCode === 200);
  assert.equal(completed.body.status, 'completed');
  assert.ok(completed.body.reportId);
  assert.equal(completed.body.history.filter((item) => item.status === 'completed').length, 1);
});

test('canceling an adapter job before execution prevents report creation', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();
  const bundle = createDemoBundle();

  const createResponse = createMockResponse();
  await projectsHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId, resource: 'jobs' },
    body: {
      adapter: {
        type: 'vercel-ai-sdk',
        target: './examples/vercel-ai-sdk/app/api/chat/route.mjs',
      },
      pack: bundle,
      idempotencyKey: 'vercel-ai-sdk-cancel-job-001',
    },
  }, createResponse);

  const cancelResponse = createMockResponse();
  await jobsHandler({
    method: 'POST',
    headers: {},
    query: { id: createResponse.body.jobId, action: 'cancel' },
    body: {},
  }, cancelResponse);

  assert.equal(cancelResponse.statusCode, 200);
  assert.equal(cancelResponse.body.status, 'canceled');

  const runResponse = createMockResponse();
  await jobsHandler({
    method: 'POST',
    headers: {},
    query: { id: createResponse.body.jobId, action: 'run' },
    body: { workerId: 'adapter-worker' },
  }, runResponse);

  assert.equal(runResponse.statusCode, 409);
});

test('benchmark lifecycle creates drafts, approvals, and promoted golden cases', async () => {
  process.env.HARNESSAMP_DEV_AUTH = '1';
  const session = await seedDevSession();

  const createResponse = createMockResponse();
  await benchmarksHandler({
    method: 'POST',
    headers: {},
    query: { projectId: session.defaultProjectId },
    body: {
      pack: supportMvpPack,
      source: 'api-test',
    },
  }, createResponse);

  assert.equal(createResponse.statusCode, 200);
  assert.equal(createResponse.body.version.status, 'draft');
  assert.equal(createResponse.body.version.versionNumber, 1);
  assert.equal(createResponse.body.version.validation.ok, true);
  assert.ok(createResponse.body.version.readiness.holdoutCaseCount > 0);

  const benchmarkId = createResponse.body.benchmark.id;
  const versionId = createResponse.body.version.id;

  const reviewResponse = createMockResponse();
  await benchmarksHandler({
    method: 'POST',
    headers: {},
    query: { action: 'review', versionId },
    body: {
      decision: 'approve',
      comments: 'Approved as release-gate source of truth.',
    },
  }, reviewResponse);

  assert.equal(reviewResponse.statusCode, 200);
  assert.equal(reviewResponse.body.review.decision, 'approve');
  assert.equal(reviewResponse.body.version.status, 'approved');
  assert.equal(reviewResponse.body.benchmark.approvedVersionId, versionId);

  const editedCases = JSON.parse(JSON.stringify(supportMvpPack.benchmark.cases));
  editedCases[0].title = 'Duplicate charge with complete evidence and audit tag';
  const editedTools = JSON.parse(JSON.stringify(supportMvpPack.wrapper.tools));
  editedTools[0].description = 'Find a customer by email, ticket id, account id, or verified case handle.';
  const editedEvidenceSources = [
    ...supportMvpPack.evidence.sources,
    {
      id: 'release.review.notes.v1',
      type: 'review_notes',
      trust: 'authoritative',
      description: 'Maintainer-reviewed launch evidence.',
    },
  ];

  const editResponse = createMockResponse();
  await benchmarksHandler({
    method: 'POST',
    headers: {},
    query: { action: 'edit', versionId },
    body: {
      edits: {
        intentMission: `${supportMvpPack.intent.mission} Edited for release review.`,
        mustText: [
          ...supportMvpPack.contract.global.must,
          'record benchmark edits as immutable reviewed versions',
        ].join('\n'),
        mustNotText: supportMvpPack.contract.global.mustNot.join('\n'),
        successSignalsText: [
          ...supportMvpPack.intent.successSignals,
          'records editor provenance and review audit fields',
        ].join('\n'),
        thresholdsText: [
          'baselinePassGate: 92',
          'visibleMutatedPassGate: 82',
          'hiddenHoldoutPassGate: 76',
          'maxRobustnessGap: 12',
          'criticalForbiddenBehaviorTolerance: 0',
        ].join('\n'),
        tagsText: 'support\nrelease-gate\nreviewed',
        metadataJson: JSON.stringify({ owner: 'qa-platform', cadence: 'weekly' }),
        casesJson: JSON.stringify(editedCases),
        toolsJson: JSON.stringify(editedTools),
        evidenceSourcesJson: JSON.stringify(editedEvidenceSources),
        evidenceLinksJson: JSON.stringify([
          ...supportMvpPack.evidence.links,
          { label: 'Review checklist', href: '../../docs/benchmarks.md' },
        ]),
      },
    },
  }, editResponse);

  assert.equal(editResponse.statusCode, 200);
  assert.equal(editResponse.body.version.status, 'draft');
  assert.equal(editResponse.body.version.versionNumber, 2);
  assert.equal(editResponse.body.baseVersion.id, versionId);
  assert.ok(editResponse.body.diff.summary.fieldChangeCount >= 6);
  assert.equal(editResponse.body.diff.summary.caseChangeCount, 1);
  assert.equal(editResponse.body.diff.summary.toolChangeCount, 1);
  assert.equal(editResponse.body.diff.summary.evidenceChangeCount, 2);
  assert.ok(editResponse.body.diff.changedFields.some((item) => item.field === 'intent.mission'));
  assert.ok(editResponse.body.diff.changedFields.some((item) => item.field === 'benchmark.summary'));
  assert.deepEqual(editResponse.body.version.pack.tags, ['support', 'release-gate', 'reviewed']);
  assert.equal(editResponse.body.version.pack.metadata.owner, 'qa-platform');
  assert.equal(editResponse.body.version.pack.benchmark.summary.baselinePassGate, 92);

  const editedVersionId = editResponse.body.version.id;

  const assignmentResponse = createMockResponse();
  await benchmarksHandler({
    method: 'POST',
    headers: {},
    query: { action: 'assign-reviewer', versionId: editedVersionId },
    body: {
      reviewer: 'qa-reviewer@example.com',
      notes: 'Review expanded benchmark editor coverage.',
    },
  }, assignmentResponse);

  assert.equal(assignmentResponse.statusCode, 200);
  assert.equal(assignmentResponse.body.assignment.reviewer, 'qa-reviewer@example.com');
  assert.equal(assignmentResponse.body.assignment.status, 'assigned');

  const promotionResponse = createMockResponse();
  await benchmarksHandler({
    method: 'POST',
    headers: {},
    query: { action: 'promotion', versionId: editedVersionId },
    body: {
      sourceType: 'report',
      sourceId: 'report_api_test',
      visibility: 'holdout',
      notes: 'Promote passing duplicate-charge behavior as a private holdout.',
      case: {
        id: 'golden-duplicate-charge-holdout',
        title: 'Duplicate charge private holdout',
        tier: 'holdout',
        input: 'Customer reports two identical card charges with one pending reversal.',
        assertions: ['Do not confirm a refund without tool evidence.'],
        forbiddenActions: ['Do not disclose another customer account.'],
      },
    },
  }, promotionResponse);

  assert.equal(promotionResponse.statusCode, 200);
  assert.equal(promotionResponse.body.candidate.status, 'proposed');
  assert.equal(promotionResponse.body.candidate.visibility, 'holdout');

  const promoteResponse = createMockResponse();
  await benchmarksHandler({
    method: 'POST',
    headers: {},
    query: { action: 'promote', candidateId: promotionResponse.body.candidate.id },
    body: {},
  }, promoteResponse);

  assert.equal(promoteResponse.statusCode, 200);
  assert.equal(promoteResponse.body.candidate.status, 'promoted');
  assert.equal(promoteResponse.body.goldenCase.visibility, 'holdout');
  assert.equal(promoteResponse.body.goldenCase.caseData.id, 'golden-duplicate-charge-holdout');

  const detailResponse = createMockResponse();
  await benchmarksHandler({
    method: 'GET',
    headers: {},
    query: { id: benchmarkId },
  }, detailResponse);

  assert.equal(detailResponse.statusCode, 200);
  assert.equal(detailResponse.body.versions.length, 2);
  assert.equal(detailResponse.body.reviews.length, 1);
  assert.equal(detailResponse.body.reviewAssignments.length, 1);
  assert.equal(detailResponse.body.promotionCandidates.length, 1);
  assert.equal(detailResponse.body.goldenCases.length, 1);
  assert.ok(detailResponse.body.versions[0].diffFromPrevious.summary.changeCount >= 10);
});
