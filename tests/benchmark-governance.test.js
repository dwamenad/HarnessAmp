import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compareBenchmarkResults } from '../src/benchmarks/baseline-comparison.js';
import { benchmarkCiOutput, ciExitCodeForBenchmarkResult, stableCiJson } from '../src/benchmarks/ci-output.js';

const baseline = {
  id: 'benchmark-result:baseline',
  benchmarkId: 'retrievalguard-smoke-v0.1',
  benchmarkSlug: 'retrievalguard-smoke',
  benchmarkName: 'RetrievalGuard Smoke',
  benchmarkVersion: '0.1',
  benchmarkRunType: 'official',
  runId: 'run-baseline',
  harnessId: 'harness-1',
  agentVersion: 'agent@1',
  score: 88,
  gateResult: 'pass',
  releaseDecision: 'Safe to release',
  criticalCount: 0,
  majorCount: 1,
  minorCount: 0,
  observationCount: 400,
  failedContracts: ['RG-C05'],
  failedMutationFamilies: ['ranking_mutation'],
  benchmarkSnapshot: {
    slug: 'retrievalguard-smoke',
    version: '0.1',
  },
};

const current = {
  ...baseline,
  id: 'benchmark-result:current',
  runId: 'run-current',
  agentVersion: 'agent@2',
  score: 82,
  gateResult: 'block',
  releaseDecision: 'Block release',
  criticalCount: 1,
  majorCount: 0,
  failedContracts: ['RG-C02'],
  failedMutationFamilies: ['provenance_mutation'],
};

describe('benchmark governance helpers', () => {
  test('baseline comparison detects score delta and new/resolved failures', () => {
    const comparison = compareBenchmarkResults(current, baseline, {
      currentFailures: [{ id: 'failure-current' }],
      baselineFailures: [{ id: 'failure-baseline' }],
    });

    assert.equal(comparison.scoreDelta, -6);
    assert.equal(comparison.newCriticalFailures, 1);
    assert.equal(comparison.resolvedCriticalFailures, 0);
    assert.deepEqual(comparison.newFailedContracts, ['RG-C02']);
    assert.deepEqual(comparison.resolvedFailedContracts, ['RG-C05']);
    assert.deepEqual(comparison.newFailedMutationFamilies, ['provenance_mutation']);
    assert.deepEqual(comparison.resolvedFailedMutationFamilies, ['ranking_mutation']);
    assert.deepEqual(comparison.newFailureIds, ['failure-current']);
    assert.deepEqual(comparison.resolvedFailureIds, ['failure-baseline']);
  });

  test('CI output contract is deterministic and machine-readable', () => {
    const comparison = compareBenchmarkResults(current, baseline);
    const output = benchmarkCiOutput({
      benchmarkResult: current,
      baselineComparison: comparison,
      artifacts: {
        reportUrl: '/reports#run-current',
        jsonExportAvailable: true,
        markdownExportAvailable: true,
        csvExportAvailable: true,
        printHtmlExportAvailable: true,
      },
    });

    assert.equal(output.schemaVersion, 'harnessamp.ci.v0.1');
    assert.equal(output.benchmark.slug, 'retrievalguard-smoke');
    assert.equal(output.benchmark.runType, 'official');
    assert.equal(output.result.releaseDecision, 'block');
    assert.equal(output.baseline.scoreDelta, -6);
    assert.equal(stableCiJson(output), stableCiJson(output));
  });

  test('CI exit codes distinguish pass and block', () => {
    assert.equal(ciExitCodeForBenchmarkResult({ gateResult: 'pass' }), 0);
    assert.equal(ciExitCodeForBenchmarkResult({ gateResult: 'block' }), 2);
  });
});
