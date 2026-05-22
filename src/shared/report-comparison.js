export function compareReportSnapshots(current, previous) {
  if (!current || !previous) return null;

  const currentSummary = current.summary ?? {};
  const previousSummary = previous.summary ?? {};
  const currentFailures = current.failureCorpus?.summary ?? {};
  const previousFailures = previous.failureCorpus?.summary ?? {};
  const currentGeneratedAt = current.generatedAt ?? '';
  const previousGeneratedAt = previous.generatedAt ?? '';

  const result = {
    currentId: current.id ?? null,
    previousId: previous.id ?? null,
    currentGeneratedAt,
    previousGeneratedAt,
    metrics: {
      overallScore: metricDelta(currentSummary.overallScore, previousSummary.overallScore),
      originalPassRate: metricDelta(currentSummary.originalPassRate, previousSummary.originalPassRate),
      mutatedPassRate: metricDelta(currentSummary.mutatedPassRate, previousSummary.mutatedPassRate),
      robustnessDrop: metricDelta(currentSummary.robustnessDrop, previousSummary.robustnessDrop, { lowerIsBetter: true }),
      failureEntries: metricDelta(currentFailures.entryCount, previousFailures.entryCount, { lowerIsBetter: true }),
      hiddenFailures: metricDelta(currentFailures.hiddenFailureCount, previousFailures.hiddenFailureCount, { lowerIsBetter: true }),
    },
  };

  return {
    ...result,
    status: classifyComparison(result.metrics),
  };
}

export function pickComparableReport(current, candidates = []) {
  if (!current) return null;
  const currentSuite = current.suite ?? {};

  return candidates
    .filter((candidate) => candidate && candidate.id !== current.id)
    .filter((candidate) => {
      const suite = candidate.suite ?? {};
      return suite.project === currentSuite.project
        && suite.profile === currentSuite.profile
        && suite.preset === currentSuite.preset;
    })
    .sort((left, right) => String(right.generatedAt ?? '').localeCompare(String(left.generatedAt ?? '')))[0] ?? null;
}

function metricDelta(current, previous, options = {}) {
  const currentValue = numberOrNull(current);
  const previousValue = numberOrNull(previous);
  const delta = currentValue == null || previousValue == null ? null : currentValue - previousValue;
  const improved = delta == null ? null : options.lowerIsBetter ? delta < 0 : delta > 0;
  const worsened = delta == null ? null : options.lowerIsBetter ? delta > 0 : delta < 0;

  return {
    current: currentValue,
    previous: previousValue,
    delta,
    improved,
    worsened,
  };
}

function classifyComparison(metrics) {
  const values = Object.values(metrics);
  const worsened = values.filter((item) => item.worsened).length;
  const improved = values.filter((item) => item.improved).length;

  if (worsened > improved) return 'regressed';
  if (improved > worsened) return 'improved';
  return 'steady';
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
