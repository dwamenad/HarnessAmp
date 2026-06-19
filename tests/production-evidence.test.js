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
    assert.equal(evidence.releaseGate.status, 'warning');
    assert.match(evidence.releaseGate.warnings.join('\n'), /ephemeral/);
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
});
