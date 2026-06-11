import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import authHandler from '../api/auth.js';
import benchmarksHandler from '../api/benchmarks.js';
import failuresHandler from '../api/failures.js';
import harnessSmokeHandler from '../api/harness-smoke.js';
import jobsHandler from '../api/jobs.js';
import projectsHandler from '../api/projects.js';
import reportsHandler from '../api/reports.js';
import { analyzeBundle, createDemoBundle } from '../src/core/engine.js';
import { buildReportSnapshot } from '../src/shared/report-snapshot.js';
import { seedDevSession } from '../api/_store.js';

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
      ['queued', 'running', 'completed'],
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
