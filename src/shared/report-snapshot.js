import { collectFailureCorpus } from '../reports/failure-corpus.js';

export function buildReportSnapshot({
  analysis,
  reportId,
  generatedAt = new Date().toISOString(),
  workspace = {},
  projectId = null,
  profileId,
  presetId,
  thresholds,
  sourceBundle = null,
}) {
  if (!analysis) return {};

  return {
    version: 'web-demo-2',
    id: reportId,
    generatedAt,
    workspace,
    suite: {
      project: analysis.bundle.project,
      projectId,
      profile: profileId,
      preset: presetId,
      thresholds,
    },
    baselineRuns: analysis.outcomes.filter((outcome) => outcome.tier === 'visible'),
    mutationRuns: analysis.outcomes,
    deltas: analysis.familyStats.map((family) => ({
      deltaType: ['pass_rate'],
      before: {
        passRate: family.visibleRate,
        score: family.visibleScore,
      },
      after: {
        passRate: family.holdoutRate,
        score: family.holdoutScore,
      },
      mutationId: family.id,
      explanation: `${family.label} pass rate is ${Math.round(family.holdoutRate)}% after mutation.`,
      severity: family.gap >= 18 ? 'high' : family.gap >= 10 ? 'medium' : 'low',
    })),
    findings: analysis.recommendations.map((item, index) => ({
      id: `finding-${index + 1}`,
      mutationId: item.family ?? analysis.summary.hotspot?.id ?? 'overall',
      failureTypes: [{ id: item.title ?? 'wrapper_brittleness' }],
      highestSeverity: index === 0 ? 'high' : 'medium',
      recommendation: item.detail ?? item.title ?? 'Review wrapper controls.',
    })),
    summary: {
      originalPassRate: analysis.summary.visiblePassRate,
      mutatedPassRate: analysis.summary.holdoutPassRate,
      robustnessDrop: analysis.summary.gap,
      robustnessBand: analysis.summary.robustnessBand,
      verdict: normalizeVerdict(analysis.summary),
      overallScore: analysis.summary.overallScore,
      confidence: analysis.summary.confidence,
      label: analysis.summary.label,
    },
    failureCorpus: collectFailureCorpus(analysis),
    caseResults: buildCaseResults({ analysis, sourceBundle }),
    markdown: analysis.reportText,
  };
}

export function buildCaseResults({ analysis, sourceBundle = null }) {
  const cases = normalizeCases(analysis, sourceBundle);
  if (!cases.length) return [];

  const observationGroups = groupCaseObservations(sourceBundle?.observations ?? []);
  return cases.map((item) => {
    const observations = observationGroups.get(item.id) ?? [];
    const passedCount = observations.filter((entry) => entry.passed).length;
    const mutationBreakdown = new Map();

    observations.forEach((entry) => {
      const mutationKey = extractMutationKey(entry.variantId);
      if (!mutationBreakdown.has(mutationKey)) {
        mutationBreakdown.set(mutationKey, {
          mutationId: mutationKey,
          passed: 0,
          failed: 0,
          notes: [],
        });
      }
      const bucket = mutationBreakdown.get(mutationKey);
      if (entry.passed) bucket.passed += 1;
      else bucket.failed += 1;
      if (entry.notes) bucket.notes.push(entry.notes);
    });

    const observationCount = observations.length;
    const passRate = observationCount ? Math.round((passedCount / observationCount) * 100) : null;
    const status = observationCount === 0 ? 'no_data' : passedCount === observationCount ? 'pass' : passedCount > 0 ? 'warn' : 'fail';
    const evidenceUsed = dedupe([
      ...(item.allowedEvidence ?? []),
      ...(analysis.bundle.evidence?.sources ?? []).map((source) => source.id).slice(0, 3),
    ]);

    return {
      id: item.id,
      title: item.title,
      input: item.input ?? item.objective ?? '',
      allowedAgents: item.allowedAgents ?? [],
      scorerFields: item.rubricFields ?? [],
      assertions: item.assertions ?? [],
      forbiddenActions: item.forbiddenActions ?? [],
      expectedMilestones: item.expectedMilestones ?? [],
      evidenceUsed,
      observationCount,
      passRate,
      status,
      mutationBreakdown: Array.from(mutationBreakdown.values()),
    };
  });
}

function normalizeCases(analysis, sourceBundle) {
  const benchmarkCases = analysis.bundle.benchmark?.cases;
  if (Array.isArray(benchmarkCases) && benchmarkCases.length) {
    return benchmarkCases;
  }

  const bundleCases = sourceBundle?.benchmark?.cases;
  if (Array.isArray(bundleCases) && bundleCases.length) {
    return bundleCases;
  }

  return (analysis.bundle.harness?.scenarios ?? []).map((scenario) => ({
    id: scenario.id,
    title: scenario.title,
    objective: scenario.objective,
    assertions: [],
    forbiddenActions: [],
    rubricFields: [],
    expectedMilestones: [],
  }));
}

function groupCaseObservations(observations) {
  const groups = new Map();
  for (const observation of observations) {
    const caseId = extractCaseId(observation.variantId);
    if (!groups.has(caseId)) groups.set(caseId, []);
    groups.get(caseId).push(observation);
  }
  return groups;
}

function extractCaseId(variantId = '') {
  if (!variantId.includes('__')) return variantId;
  return variantId.split('__')[0];
}

function extractMutationKey(variantId = '') {
  if (!variantId.includes('__')) return variantId;
  const parts = variantId.split('__');
  return parts[1] || variantId;
}

function normalizeVerdict(summary) {
  const score = summary?.overallScore ?? 0;
  const gap = summary?.gap ?? 0;
  const holdout = summary?.holdoutPassRate ?? 0;

  if (score < 55 || holdout < 60 || gap > 20) return 'block';
  if (score < 70 || holdout < 75 || gap > 10) return 'warn';
  return 'pass';
}

function dedupe(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
