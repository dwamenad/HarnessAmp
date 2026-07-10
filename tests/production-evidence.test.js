import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildProductionEvidence,
  buildReleaseGate,
  normalizeTargetEvidence,
} from '../src/console/lib/production-evidence.js';

describe('production evidence control plane', () => {
  test('sample workspace is not production release evidence', () => {
    const evidence = buildProductionEvidence({
      projectMode: 'sample_workspace',
      sourceType: 'sample_data',
      report: {
        evidenceMode: 'seeded-sample',
        benchmark: { seeded: true, gateResult: 'pass' },
        score: 98,
        criticalFailures: 0,
      },
    });

    assert.equal(evidence.projectMode, 'sample_workspace');
    assert.equal(evidence.modeLabel, 'Sample workspace');
    assert.equal(evidence.sourceLabel, 'Sample data');
    assert.equal(evidence.releaseGate.status, 'not_applicable');
    assert.equal(evidence.releaseGate.canRelease, false);
    assert.match(evidence.releaseGate.blockingReasons.join('\n'), /Sample data cannot be used/);
  });

  test('connected project with local tunnel stays local preview and ephemeral', () => {
    const target = normalizeTargetEvidence({
      name: 'Ephemeral local test target',
      typeLabel: 'Local HTTPS tunnel',
      isEphemeral: true,
      grade: 'Local testing only',
      validationStatus: 'passed',
      readinessLabel: 'Ephemeral',
      contractVersion: 'harnessamp_http_runner_v1',
    });
    const evidence = buildProductionEvidence({
      projectMode: 'connected_project',
      sourceType: 'real_execution',
      target,
      releaseGate: buildReleaseGate({ target }),
    });

    assert.equal(evidence.projectMode, 'connected_project');
    assert.equal(evidence.modeLabel, 'Connected project');
    assert.equal(evidence.target.isEphemeral, true);
    assert.equal(evidence.target.isProductionGrade, false);
    assert.equal(evidence.target.readinessLabel, 'Ephemeral');
    assert.equal(evidence.releaseGate.status, 'blocked');
    assert.match(evidence.releaseGate.blockingReasons.join('\n'), /ephemeral/);
  });

  test('production run with validated target is release eligible', () => {
    const target = normalizeTargetEvidence({
      name: 'prod-runner-1',
      typeLabel: 'Registered runner',
      isProductionGrade: true,
      validationStatus: 'passed',
      readinessLabel: 'Healthy',
      contractVersion: 'harnessamp_http_runner_v1',
      lastSuccessfulRunAt: '2026-06-19T12:00:00.000Z',
    });
    const run = {
      id: 'run-prod-1',
      status: 'completed',
      lifecycleStatus: 'completed',
      benchmark: { gateResult: 'pass', failedContracts: [] },
      score: 94,
      criticalFailures: 0,
      usedRealExecution: true,
      runnerObservations: [{ tool_calls: [{ name: 'retrieval_search', inputSchema: { type: 'object' } }] }],
      declaredTools: [{
        name: 'retrieval_search',
        description: 'Search approved evidence sources for answer grounding.',
        inputSchema: { type: 'object' },
      }],
    };
    const releaseGate = buildReleaseGate({ run, target });
    const evidence = buildProductionEvidence({
      projectMode: 'production_run',
      sourceType: 'real_execution',
      target,
      run,
      releaseGate,
    });

    assert.equal(evidence.projectMode, 'production_run');
    assert.equal(evidence.modeLabel, 'Production run');
    assert.equal(evidence.sourceLabel, 'Real execution');
    assert.equal(evidence.releaseGate.status, 'eligible');
    assert.equal(evidence.releaseGate.canRelease, true);
  });

  test('contract mismatch and worker lifecycle failures block release', () => {
    const gate = buildReleaseGate({
      target: {
        name: 'runner-with-old-contract',
        typeLabel: 'Registered runner',
        isProductionGrade: true,
        validationStatus: 'passed',
        readinessLabel: 'Healthy',
        contractVersion: 'harnessamp_http_runner_v0',
      },
      lifecycle: { status: 'failed' },
      run: { status: 'failed', usedRealExecution: true, score: 98, criticalFailures: 0 },
    });

    assert.equal(gate.status, 'blocked');
    assert.equal(gate.canRelease, false);
    assert.match(gate.blockingReasons.join('\n'), /contract mismatch/i);
    assert.match(gate.blockingReasons.join('\n'), /Worker lifecycle ended as failed/);
  });

  test('blocking domain failure classes block release before score', () => {
    const gate = buildReleaseGate({
      report: {
        pack: 'CustomerCareGuard',
        evidenceMode: 'runner-observation',
        score: 98,
        criticalFailures: 0,
        benchmark: {
          name: 'CustomerCareGuard Smoke',
          scoringProfileVersion: '0.1',
          gateProfileVersion: '0.1',
          gateResult: 'pass',
        },
      },
      run: { status: 'completed', usedRealExecution: true, score: 98, criticalFailures: 0 },
      target: {
        name: 'prod-runner-1',
        typeLabel: 'Registered runner',
        isProductionGrade: true,
        validationStatus: 'passed',
        readinessLabel: 'Healthy',
        contractVersion: 'harnessamp_http_runner_v1',
      },
      failureEvidence: [{
        contract: 'Preserve refund policy hierarchy',
        scenarioId: 'customercare_refund_policy_044',
        mutationId: 'ticket prompt injection',
      }],
    });

    assert.equal(gate.status, 'blocked');
    assert.match(gate.blockingReasons.join('\n'), /refund_overreach/);
  });

  test('invalid and ephemeral execution targets block production release evidence', () => {
    const invalidTargetGate = buildReleaseGate({
      run: { status: 'completed', usedRealExecution: true, score: 94, criticalFailures: 0 },
      target: {
        name: 'invalid-runner',
        typeLabel: 'Registered runner',
        isProductionGrade: true,
        validationStatus: 'failed',
        readinessLabel: 'Recently failing',
        contractVersion: 'harnessamp_http_runner_v1',
      },
    });
    const localTunnelGate = buildReleaseGate({
      run: { status: 'completed', usedRealExecution: true, score: 94, criticalFailures: 0 },
      target: {
        name: 'local tunnel',
        typeLabel: 'Local HTTPS tunnel',
        isEphemeral: true,
        validationStatus: 'passed',
        readinessLabel: 'Ephemeral',
        contractVersion: 'harnessamp_http_runner_v1',
      },
    });

    assert.equal(invalidTargetGate.status, 'blocked');
    assert.match(invalidTargetGate.blockingReasons.join('\n'), /Target validation state is failed/);
    assert.equal(localTunnelGate.status, 'blocked');
    assert.match(localTunnelGate.blockingReasons.join('\n'), /local_tunnel_ephemeral/);
  });
});
