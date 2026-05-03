export const DEFAULT_CI_THRESHOLDS = {
  minOverallScore: 65,
  minHoldoutPass: 60,
  maxRobustnessGap: 20,
  failOnWarn: false,
};

export function normalizeCiThresholds(input = {}) {
  return {
    minOverallScore: normalizeNumber(input.minOverallScore, DEFAULT_CI_THRESHOLDS.minOverallScore),
    minHoldoutPass: normalizeNumber(input.minHoldoutPass, DEFAULT_CI_THRESHOLDS.minHoldoutPass),
    maxRobustnessGap: normalizeNumber(input.maxRobustnessGap, DEFAULT_CI_THRESHOLDS.maxRobustnessGap),
    failOnWarn: normalizeBoolean(input.failOnWarn, DEFAULT_CI_THRESHOLDS.failOnWarn),
  };
}

export function evaluateDiagnosisGate(diagnosis, input = {}) {
  const thresholds = normalizeCiThresholds(input);
  const summary = diagnosis.summary ?? {};
  const originalPassRate = normalizeNumber(summary.originalPassRate, 0);
  const mutatedPassRate = normalizeNumber(summary.mutatedPassRate, 0);
  const robustnessGap = normalizeNumber(summary.robustnessDrop, Math.max(0, originalPassRate - mutatedPassRate));
  const overallScore = normalizeNumber(summary.overallScore, mutatedPassRate);
  const highestSeverity = summary.highestRiskFailureType?.severity ?? 'low';
  const criticalFailure = highestSeverity === 'critical';

  const checks = [
    {
      id: 'overall_score',
      label: 'Overall score',
      actual: overallScore,
      operator: '>=',
      threshold: thresholds.minOverallScore,
      passed: overallScore >= thresholds.minOverallScore,
    },
    {
      id: 'mutated_pass_rate',
      label: 'Mutated pass rate',
      actual: mutatedPassRate,
      operator: '>=',
      threshold: thresholds.minHoldoutPass,
      passed: mutatedPassRate >= thresholds.minHoldoutPass,
    },
    {
      id: 'robustness_gap',
      label: 'Robustness Gap',
      actual: robustnessGap,
      operator: '<=',
      threshold: thresholds.maxRobustnessGap,
      passed: robustnessGap <= thresholds.maxRobustnessGap,
    },
    {
      id: 'critical_failure',
      label: 'Critical failure',
      actual: criticalFailure ? 1 : 0,
      operator: '==',
      threshold: 0,
      passed: !criticalFailure,
    },
  ];

  const failedChecks = checks.filter((check) => !check.passed);
  const verdict = failedChecks.some((check) => check.id === 'critical_failure' || check.id === 'robustness_gap')
    ? 'block'
    : failedChecks.length > 0 || summary.verdict === 'warn'
      ? 'warn'
      : summary.verdict === 'block'
        ? 'block'
        : 'pass';

  return {
    verdict,
    shouldFail: verdict === 'block' || (verdict === 'warn' && thresholds.failOnWarn),
    thresholds,
    metrics: {
      originalPassRate,
      mutatedPassRate,
      robustnessGap,
      overallScore,
    },
    checks,
  };
}

export function formatCiGateSummary(diagnosis, gate, artifactPaths = {}) {
  const summary = diagnosis.summary ?? {};
  const lines = [];
  lines.push('# HarnessAmp robustness gate');
  lines.push('');
  lines.push(`- Verdict: ${gate.verdict.toUpperCase()}`);
  lines.push(`- Harness: ${summary.harnessName ?? 'unknown'}`);
  lines.push(`- Project: ${summary.project ?? diagnosis.bundle?.project ?? 'unknown'}`);
  lines.push(`- Original pass rate: ${gate.metrics.originalPassRate}%`);
  lines.push(`- Mutated pass rate: ${gate.metrics.mutatedPassRate}%`);
  lines.push(`- Robustness Gap: ${gate.metrics.robustnessGap} points`);
  lines.push(`- Highest-risk failure type: ${summary.highestRiskFailureType?.label ?? 'None'}`);
  lines.push(`- Most sensitive mutation category: ${summary.mostSensitiveMutationCategory?.mutationFamily ?? 'none'}`);
  lines.push('');
  lines.push('| Check | Actual | Threshold | Status |');
  lines.push('| --- | --- | --- | --- |');
  gate.checks.forEach((check) => {
    lines.push(`| ${check.label} | ${check.actual} | ${check.operator} ${check.threshold} | ${check.passed ? 'PASS' : 'FAIL'} |`);
  });
  lines.push('');
  lines.push('## Artifacts');
  lines.push('');
  lines.push(`- Markdown report: ${artifactPaths.reportPath ?? 'not written'}`);
  lines.push(`- JSON report: ${artifactPaths.jsonPath ?? 'not written'}`);
  lines.push(`- Failure corpus: ${artifactPaths.failureCorpusPath ?? 'not written'}`);
  lines.push('');
  lines.push('## Engineering Recommendations');
  lines.push('');
  const recommendations = Array.from(new Set((diagnosis.findings ?? []).map((finding) => finding.recommendation).filter(Boolean)));
  if (recommendations.length) {
    recommendations.slice(0, 8).forEach((recommendation) => lines.push(`- ${recommendation}`));
  } else {
    lines.push('- Keep the mutation suite in CI and tighten thresholds as real runner coverage improves.');
  }
  return lines.join('\n');
}

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return fallback;
}
