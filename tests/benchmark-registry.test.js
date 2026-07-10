import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  benchmarkForRun,
  benchmarkRegistry,
  classifyBenchmarkRun,
  createBenchmarkSnapshot,
  evaluateBenchmarkGate,
  getBenchmarkBySlug,
  listBenchmarks,
  scoreBenchmark,
} from '../src/benchmarks/registry.js';
import { generateBenchmarkResult } from '../src/benchmarks/results.js';

describe('benchmark registry and scoring', () => {
  test('registry contains required first-class benchmarks', () => {
    const slugs = listBenchmarks().map((benchmark) => benchmark.slug);

    assert.deepEqual(slugs, [
      'retrievalguard-smoke',
      'retrievalguard-standard',
      'financeguard-smoke',
      'healthguard-smoke',
      'customercareguard-smoke',
      'legalguard-smoke',
      'personalagentguard-smoke',
      'harnessruntimeguard-smoke',
    ]);
    assert.equal(getBenchmarkBySlug('retrievalguard-smoke').version, '0.1');
    assert.equal(getBenchmarkBySlug('retrievalguard-standard').scenarioCount, 4200);
    assert.equal(getBenchmarkBySlug('personalagentguard-smoke').scenarioCount, 120);
    assert.equal(getBenchmarkBySlug('harnessruntimeguard-smoke').scenarioCount, 120);
  });

  test('scoring profile calculates expected weighted scores', () => {
    const benchmark = getBenchmarkBySlug('retrievalguard-smoke');
    const scored = scoreBenchmark({
      benchmark,
      failures: [
        { severity: 'critical', contractId: 'RG-C02' },
        { severity: 'minor', contractId: 'RG-C05' },
      ],
    });

    assert.equal(scored.score, 62);
    assert.equal(scored.minimumPassingScore, 75);
  });

  test('gate profile blocks when critical failures are present', () => {
    const benchmark = getBenchmarkBySlug('retrievalguard-smoke');
    const gate = evaluateBenchmarkGate({
      benchmark,
      score: 96,
      criticalCount: 1,
      metrics: { citationPrecision: 0.99 },
    });

    assert.equal(gate.result, 'block');
    assert.match(gate.reason, /critical/);
  });

  test('benchmark result is generated from completed RetrievalGuard smoke run', () => {
    const run = {
      id: 'run-rg-smoke',
      harnessId: 'harness-1',
      pack: 'RetrievalGuard',
      packId: 'retrievalguard-core',
      tier: 'smoke',
      score: '78',
      critical: '1',
      observations: '400',
      runnerObservations: [
        {
          mutation_id: 'contradiction_ignored',
          failure_modes: ['contradiction_ignored'],
          metadata: {
            retrievalMetrics: {
              precision: 0.64,
              recall: 0.72,
              finalAnswerRecall: 0.68,
            },
          },
        },
      ],
    };
    const benchmark = benchmarkForRun(run);
    const result = generateBenchmarkResult({
      run,
      persistedRun: { score: 78, observationCount: 400 },
      harness: { agentVersion: 'pat-jj/harness-1 local' },
      observations: [{ status: 'fail' }],
      failures: [{ severity: 'critical', contractId: 'RG-C07', mutationId: 'contradiction_ignored' }],
      createdAt: '2026-06-14T00:00:00.000Z',
    });

    assert.equal(benchmark.slug, 'retrievalguard-smoke');
    assert.equal(result.benchmarkName, 'RetrievalGuard Smoke');
    assert.equal(result.benchmarkSlug, 'retrievalguard-smoke');
    assert.equal(result.benchmarkVersion, '0.1');
    assert.equal(result.benchmarkSnapshot.slug, 'retrievalguard-smoke');
    assert.equal(result.benchmarkSnapshot.scoringProfile.version, '0.1');
    assert.equal(result.benchmarkRunType, 'official');
    assert.equal(result.agentVersion, 'pat-jj/harness-1 local');
    assert.equal(result.gateResult, 'block');
    assert.equal(result.releaseDecision, 'Block release');
    assert.deepEqual(result.failedContracts, ['RG-C07']);
    assert.deepEqual(result.failedMutationFamilies, ['contradiction_ignored']);
  });

  test('benchmark snapshot remains stable if registry definition changes later', () => {
    const benchmark = getBenchmarkBySlug('retrievalguard-smoke');
    const snapshot = createBenchmarkSnapshot(benchmark, '2026-06-14T00:00:00.000Z');
    const originalName = benchmarkRegistry.find((item) => item.id === benchmark.id).name;
    benchmarkRegistry.find((item) => item.id === benchmark.id).name = 'Changed RetrievalGuard Smoke';

    assert.equal(snapshot.name, 'RetrievalGuard Smoke');

    benchmarkRegistry.find((item) => item.id === benchmark.id).name = originalName;
  });

  test('benchmark run type distinguishes official, customized, and sample runs', () => {
    const benchmark = getBenchmarkBySlug('retrievalguard-smoke');

    assert.equal(classifyBenchmarkRun({ run: { packId: benchmark.packId, tier: 'smoke' }, benchmark, scenarioCount: 400 }).benchmarkRunType, 'official');
    const customized = classifyBenchmarkRun({ run: { packId: benchmark.packId, tier: 'core' }, benchmark, scenarioCount: 400 });
    assert.equal(customized.benchmarkRunType, 'customized');
    assert.deepEqual(customized.overridesApplied, ['tier']);
    assert.equal(classifyBenchmarkRun({ run: { runMode: 'sample', packId: benchmark.packId, tier: 'smoke' }, benchmark, scenarioCount: 120 }).benchmarkRunType, 'sample');
  });
});
