import {
  benchmarkForRun,
  classifyBenchmarkRun,
  createBenchmarkSnapshot,
  evaluateBenchmarkGate,
  releaseDecisionForGate,
  scoreBenchmark,
} from './registry.js';

export function generateBenchmarkResult({ run, persistedRun = {}, harness, observations = [], failures = [], createdAt } = {}) {
  const benchmark = benchmarkForRun(run);
  if (!benchmark) return null;
  const now = createdAt ?? new Date().toISOString();
  const benchmarkSnapshot = run.benchmarkSnapshot ?? createBenchmarkSnapshot(benchmark, now);
  const runType = classifyBenchmarkRun({
    run,
    benchmark,
    scenarioCount: persistedRun.observationCount ?? run.observations,
  });
  const normalizedFailures = failures.map((failure) => ({
    ...failure,
    severity: String(failure.severity ?? '').toLowerCase(),
  }));
  const scoreResult = scoreBenchmark({ benchmark, failures: normalizedFailures });
  const metrics = extractBenchmarkMetrics(run);
  const gate = evaluateBenchmarkGate({
    benchmark,
    score: persistedRun.score ?? scoreResult.score,
    criticalCount: countSeverity(normalizedFailures, 'critical'),
    metrics,
  });
  const failedContracts = unique(normalizedFailures.map((failure) => failure.contractId).filter(Boolean));
  const failedMutationFamilies = unique(normalizedFailures.map((failure) => mutationFamilyId(failure.mutationId)).filter(Boolean));

  return {
    id: `benchmark-result:${run.id}`,
    benchmarkId: benchmark.id,
    benchmarkSlug: benchmark.slug,
    benchmarkName: benchmark.name,
    benchmarkVersion: benchmark.version,
    packId: benchmark.packId,
    packName: benchmark.packName,
    packVersion: benchmark.packVersion ?? '0.1',
    tier: benchmark.tier,
    scenarioSetVersion: benchmark.scenarioSetVersion ?? '0.1',
    scoringProfileId: benchmark.scoringProfileId,
    scoringProfileVersion: benchmarkSnapshot.scoringProfileVersion,
    gateProfileId: benchmark.gateProfileId,
    gateProfileVersion: benchmarkSnapshot.gateProfileVersion,
    benchmarkRunType: runType.benchmarkRunType,
    baseBenchmarkId: runType.baseBenchmarkId,
    baseBenchmarkSlug: runType.baseBenchmarkSlug,
    overridesApplied: runType.overridesApplied,
    customizationReason: runType.customizationReason,
    benchmarkSnapshot,
    runId: run.id,
    harnessId: run.harnessId ?? persistedRun.harnessId ?? '',
    agentVersion: run.agentVersion ?? harness?.agentVersion ?? 'unknown',
    score: Number(persistedRun.score ?? scoreResult.score),
    gateResult: gate.result,
    gateReason: gate.reason,
    releaseDecision: releaseDecisionForGate(gate.result),
    criticalCount: countSeverity(normalizedFailures, 'critical'),
    majorCount: normalizedFailures.filter((failure) => ['major', 'high'].includes(failure.severity)).length,
    minorCount: normalizedFailures.filter((failure) => ['minor', 'medium', 'low'].includes(failure.severity)).length,
    observationCount: Number(persistedRun.observationCount ?? observations.length ?? 0),
    passedContracts: benchmark.contractIds.filter((contractId) => !failedContracts.includes(contractId)),
    failedContracts,
    failedMutationFamilies,
    metrics,
    createdAt: now,
  };
}

export function benchmarkMetadataForResult(result, benchmark) {
  if (!result || !benchmark) return null;
  const snapshot = result.benchmarkSnapshot;
  return {
    id: snapshot?.id ?? benchmark.id,
    slug: snapshot?.slug ?? benchmark.slug,
    name: snapshot?.name ?? benchmark.name,
    version: snapshot?.version ?? benchmark.version,
    packId: snapshot?.packId ?? benchmark.packId,
    packName: snapshot?.packName ?? benchmark.packName,
    packVersion: snapshot?.packVersion ?? benchmark.packVersion ?? '0.1',
    tier: snapshot?.tier ?? benchmark.tier,
    scenarioSetVersion: snapshot?.scenarioSetVersion ?? benchmark.scenarioSetVersion ?? '0.1',
    scoringProfileId: result.scoringProfileId,
    scoringProfileVersion: result.scoringProfileVersion,
    gateProfileId: result.gateProfileId,
    gateProfileVersion: result.gateProfileVersion,
    runType: result.benchmarkRunType,
    benchmarkRunType: result.benchmarkRunType,
    baseBenchmarkId: result.baseBenchmarkId,
    baseBenchmarkSlug: result.baseBenchmarkSlug,
    overridesApplied: result.overridesApplied,
    customizationReason: result.customizationReason,
    snapshot,
    benchmarkSnapshot: snapshot,
    score: result.score,
    gateResult: result.gateResult,
    releaseDecision: result.releaseDecision,
    failedContracts: result.failedContracts,
    failedMutationFamilies: result.failedMutationFamilies,
  };
}

export function extractBenchmarkMetrics(run = {}) {
  const observations = Array.isArray(run.runnerObservations) ? run.runnerObservations : [];
  const metrics = observations.find((observation) => observation?.metadata?.retrievalMetrics)?.metadata?.retrievalMetrics ?? {};
  const observedSources = observations.flatMap((observation) => (
    Array.isArray(observation.curated_evidence) ? observation.curated_evidence : []
  ));
  return {
    citationPrecision: numberOrNull(metrics.precision),
    recall: numberOrNull(metrics.recall),
    finalAnswerRecall: numberOrNull(metrics.finalAnswerRecall),
    provenanceCompleteness: observedSources.length ? 1 : null,
    missingSourceIds: [],
    staleSourceIds: [],
  };
}

function countSeverity(failures, severity) {
  return failures.filter((failure) => failure.severity === severity).length;
}

function mutationFamilyId(mutationId) {
  return String(mutationId ?? '')
    .replace(/\.[^.]+$/u, '')
    .replace(/_[0-9]+$/u, '')
    .trim();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values) {
  return Array.from(new Set(values));
}
