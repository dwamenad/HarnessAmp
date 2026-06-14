export function compareBenchmarkResults(current, baseline, { currentFailures = [], baselineFailures = [] } = {}) {
  if (!current || !baseline) return null;
  const currentSlug = current.benchmarkSlug ?? current.benchmarkSnapshot?.slug ?? '';
  const baselineSlug = baseline.benchmarkSlug ?? baseline.benchmarkSnapshot?.slug ?? '';
  const currentVersion = current.benchmarkVersion ?? current.benchmarkSnapshot?.version ?? '';
  const baselineVersion = baseline.benchmarkVersion ?? baseline.benchmarkSnapshot?.version ?? '';
  if (currentSlug !== baselineSlug || currentVersion !== baselineVersion) return null;

  const currentContracts = current.failedContracts ?? [];
  const baselineContracts = baseline.failedContracts ?? [];
  const currentFamilies = current.failedMutationFamilies ?? [];
  const baselineFamilies = baseline.failedMutationFamilies ?? [];
  const currentCritical = Number(current.criticalCount ?? 0);
  const baselineCritical = Number(baseline.criticalCount ?? 0);

  return {
    baselineRunId: baseline.runId,
    baselineBenchmarkResultId: baseline.id,
    baselineAgentVersion: baseline.agentVersion ?? 'unknown',
    currentRunId: current.runId,
    currentBenchmarkResultId: current.id,
    currentAgentVersion: current.agentVersion ?? 'unknown',
    benchmarkSlug: currentSlug,
    benchmarkVersion: currentVersion,
    scoreDelta: Number(current.score ?? 0) - Number(baseline.score ?? 0),
    gateResultChanged: current.gateResult !== baseline.gateResult,
    releaseDecisionChanged: current.releaseDecision !== baseline.releaseDecision,
    newCriticalFailures: Math.max(0, currentCritical - baselineCritical),
    resolvedCriticalFailures: Math.max(0, baselineCritical - currentCritical),
    newFailedContracts: difference(currentContracts, baselineContracts),
    resolvedFailedContracts: difference(baselineContracts, currentContracts),
    newFailedMutationFamilies: difference(currentFamilies, baselineFamilies),
    resolvedFailedMutationFamilies: difference(baselineFamilies, currentFamilies),
    newFailureIds: difference(failureIds(currentFailures), failureIds(baselineFailures)),
    resolvedFailureIds: difference(failureIds(baselineFailures), failureIds(currentFailures)),
  };
}

export function findBenchmarkBaseline(current, candidates = []) {
  if (!current) return null;
  const slug = current.benchmarkSlug ?? current.benchmarkSnapshot?.slug ?? '';
  const version = current.benchmarkVersion ?? current.benchmarkSnapshot?.version ?? '';
  return candidates
    .filter((candidate) => candidate.runId !== current.runId)
    .filter((candidate) => (candidate.benchmarkSlug ?? candidate.benchmarkSnapshot?.slug) === slug)
    .filter((candidate) => (candidate.benchmarkVersion ?? candidate.benchmarkSnapshot?.version) === version)
    .sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')))[0] ?? null;
}

function difference(left = [], right = []) {
  const rightSet = new Set(right);
  return Array.from(new Set(left)).filter((item) => !rightSet.has(item));
}

function failureIds(failures) {
  return failures.map((failure) => failure.id ?? failure.observationId ?? failure.summary).filter(Boolean);
}
