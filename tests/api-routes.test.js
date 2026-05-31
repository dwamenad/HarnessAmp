import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import authHandler from '../api/auth.js';
import benchmarksHandler from '../api/benchmarks.js';
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
      },
    },
  }, editResponse);

  assert.equal(editResponse.statusCode, 200);
  assert.equal(editResponse.body.version.status, 'draft');
  assert.equal(editResponse.body.version.versionNumber, 2);
  assert.equal(editResponse.body.baseVersion.id, versionId);
  assert.equal(editResponse.body.diff.summary.fieldChangeCount, 2);
  assert.ok(editResponse.body.diff.changedFields.some((item) => item.field === 'intent.mission'));

  const editedVersionId = editResponse.body.version.id;

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
  assert.equal(detailResponse.body.promotionCandidates.length, 1);
  assert.equal(detailResponse.body.goldenCases.length, 1);
  assert.equal(detailResponse.body.versions[0].diffFromPrevious.summary.changeCount, 2);
});
