export const CI_SCHEMA_VERSION = 'harnessamp.ci.v0.1';

export const CI_EXIT_CODES = {
  pass: 0,
  warnStrict: 1,
  block: 2,
  infrastructureFailure: 3,
  invalidConfig: 4,
};

export function benchmarkCiOutput({ benchmarkResult, run = {}, baselineComparison = null, artifacts = {} } = {}) {
  const snapshot = benchmarkResult?.benchmarkSnapshot ?? {};
  const runType = benchmarkResult?.benchmarkRunType ?? 'official';
  return stableObject({
    schemaVersion: CI_SCHEMA_VERSION,
    benchmark: {
      id: benchmarkResult?.benchmarkId ?? snapshot.id ?? '',
      slug: benchmarkResult?.benchmarkSlug ?? snapshot.slug ?? '',
      name: benchmarkResult?.benchmarkName ?? snapshot.name ?? '',
      version: benchmarkResult?.benchmarkVersion ?? snapshot.version ?? '',
      runType,
    },
    run: {
      id: benchmarkResult?.runId ?? run.id ?? '',
      harnessId: benchmarkResult?.harnessId ?? run.harnessId ?? '',
      agentVersion: benchmarkResult?.agentVersion ?? run.agentVersion ?? 'unknown',
      environment: run.environment ?? 'local',
    },
    result: {
      score: Number(benchmarkResult?.score ?? 0),
      gateResult: benchmarkResult?.gateResult ?? 'warn',
      releaseDecision: normalizeReleaseDecision(benchmarkResult?.releaseDecision),
      criticalCount: Number(benchmarkResult?.criticalCount ?? 0),
      majorCount: Number(benchmarkResult?.majorCount ?? 0),
      minorCount: Number(benchmarkResult?.minorCount ?? 0),
      observationCount: Number(benchmarkResult?.observationCount ?? 0),
    },
    failures: {
      failedContracts: [...(benchmarkResult?.failedContracts ?? [])].sort(),
      failedMutationFamilies: [...(benchmarkResult?.failedMutationFamilies ?? [])].sort(),
      topFailures: artifacts.topFailures ?? [],
    },
    baseline: baselineComparison ? {
      baselineRunId: baselineComparison.baselineRunId,
      baselineBenchmarkResultId: baselineComparison.baselineBenchmarkResultId,
      scoreDelta: baselineComparison.scoreDelta,
      newCriticalFailures: baselineComparison.newCriticalFailures,
      resolvedCriticalFailures: baselineComparison.resolvedCriticalFailures,
      newFailedContracts: baselineComparison.newFailedContracts,
      resolvedFailedContracts: baselineComparison.resolvedFailedContracts,
      newFailedMutationFamilies: baselineComparison.newFailedMutationFamilies,
      resolvedFailedMutationFamilies: baselineComparison.resolvedFailedMutationFamilies,
    } : null,
    artifacts: {
      reportUrl: artifacts.reportUrl ?? '',
      jsonExportAvailable: Boolean(artifacts.jsonExportAvailable),
      markdownExportAvailable: Boolean(artifacts.markdownExportAvailable),
      csvExportAvailable: Boolean(artifacts.csvExportAvailable),
      printHtmlExportAvailable: Boolean(artifacts.printHtmlExportAvailable),
    },
  });
}

export function ciExitCodeForBenchmarkResult(benchmarkResult, { strictWarnings = false, infrastructureFailure = false, invalidConfig = false } = {}) {
  if (invalidConfig) return CI_EXIT_CODES.invalidConfig;
  if (infrastructureFailure) return CI_EXIT_CODES.infrastructureFailure;
  if (benchmarkResult?.gateResult === 'block') return CI_EXIT_CODES.block;
  if (benchmarkResult?.gateResult === 'warn' && strictWarnings) return CI_EXIT_CODES.warnStrict;
  return CI_EXIT_CODES.pass;
}

export function stableCiJson(input) {
  return `${JSON.stringify(stableObject(input), null, 2)}\n`;
}

function normalizeReleaseDecision(value) {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('block')) return 'block';
  if (text.includes('review') || text.includes('warn')) return 'warn';
  return 'pass';
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])]));
}
