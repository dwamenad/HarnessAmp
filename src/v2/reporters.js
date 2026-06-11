import { meetsSeverityThreshold, severityRank } from './severity.js';
import { sanitizeReportText, sanitizeReportValue } from './report-sanitizer.js';

export function buildRunReport({ scenario, pack, baselineTrace, mutatedTraces, behavioralDiffs, contractResults, domainEvaluations = [], retrievalEvaluations = [], failOn }) {
  const failingResults = contractResults.filter((result) => !result.passed);
  const blockingFailures = failingResults.filter((result) => meetsSeverityThreshold(result.severity, failOn));
  const maxSeverity = failingResults
    .map((result) => result.severity)
    .sort((left, right) => severityRank(right) - severityRank(left))[0] ?? 'low';

  return sanitizeReportValue({
    version: '2.0.0-alpha',
    runId: `${scenario.id}__${pack.id}`,
    domain: scenario.domain,
    scenario: {
      id: scenario.id,
      name: scenario.name,
      sourcePath: scenario.sourcePath,
    },
    pack: {
      id: pack.id,
      name: pack.name,
    },
    baselineTrace,
    mutatedTraces,
    contractResults,
    domainEvaluations,
    retrievalEvaluations,
    behavioralDiffs,
    riskScore: riskScore(failingResults),
    highestSeverity: maxSeverity,
    gate: blockingFailures.length ? 'block' : failingResults.length ? 'warn' : 'pass',
    failOn,
    sanitized: true,
  });
}

export function formatMarkdownReport(report) {
  const firstFailure = report.contractResults.find((result) => !result.passed);
  const firstDiff = report.behavioralDiffs[0];
  const lines = [];

  lines.push('# HarnessAmp v2 Behavioral Contract Report');
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`- Scenario: ${report.scenario.name}`);
  lines.push(`- Domain: ${report.domain}`);
  lines.push(`- Pack: ${report.pack.id}`);
  lines.push(`- Gate: ${report.gate.toUpperCase()}`);
  lines.push(`- Risk score: ${report.riskScore}`);
  lines.push(`- Highest severity: ${report.highestSeverity}`);
  lines.push('');

  if (firstFailure) {
    lines.push('## Failure');
    lines.push('');
    lines.push(`Failure: ${firstFailure.failureType}`);
    lines.push('');
    lines.push('What changed:');
    lines.push(firstDiff?.summary ?? 'No behavioral diff recorded.');
    lines.push('');
    lines.push('Baseline behavior:');
    lines.push(firstDiff?.baselineBehavior?.finalAnswer ?? report.baselineTrace.finalAnswer);
    lines.push('');
    lines.push('Mutated behavior:');
    lines.push(firstDiff?.mutatedBehavior?.finalAnswer ?? report.mutatedTraces[0]?.finalAnswer ?? '');
    lines.push('');
    lines.push('Violated contract:');
    lines.push(firstFailure.contractId);
    lines.push('');
    lines.push('Severity:');
    lines.push(firstFailure.severity);
    lines.push('');
    lines.push('Recommended gate:');
    lines.push(report.gate === 'block' ? 'Block release.' : 'Review before release.');
    lines.push('');
  }

  if (Array.isArray(report.retrievalEvaluations) && report.retrievalEvaluations.length) {
    lines.push('## RetrievalGuard Evaluation');
    lines.push('');
    report.retrievalEvaluations.forEach((evaluation) => {
      lines.push(`- ${evaluation.mutationId ?? 'baseline'}: overall ${formatMetric(evaluation.overallScore)}`);
      Object.entries(evaluation.metrics ?? {}).forEach(([name, value]) => {
        lines.push(`  ${name}: ${formatMetric(value)}`);
      });
      const signals = retrievalSignalLines(evaluation.failureSignals);
      signals.forEach((signal) => lines.push(`  Signal: ${signal}`));
    });
    lines.push('');
  }

  const nonRetrievalEvaluations = Array.isArray(report.domainEvaluations)
    ? report.domainEvaluations.filter((evaluation) => evaluation.pack !== 'RetrievalGuard')
    : [];
  if (nonRetrievalEvaluations.length) {
    lines.push('## Domain Pack Evaluation');
    lines.push('');
    nonRetrievalEvaluations.forEach((evaluation) => {
      lines.push(`- ${evaluation.pack} ${evaluation.mutationId ?? 'baseline'}: overall ${formatMetric(evaluation.overallScore)}`);
      Object.entries(evaluation.metrics ?? {}).forEach(([name, value]) => {
        lines.push(`  ${name}: ${formatMetric(value)}`);
      });
      const signals = domainSignalLines(evaluation.failureSignals);
      signals.forEach((signal) => lines.push(`  Signal: ${signal}`));
      if (evaluation.provenance?.generated) {
        lines.push(`  Provenance: ${evaluation.provenance.rationale}`);
      }
    });
    lines.push('');
  }

  lines.push('## Contract Results');
  lines.push('');
  report.contractResults.forEach((result) => {
    lines.push(`- ${result.passed ? 'PASS' : 'FAIL'} ${result.contractId} (${result.severity})`);
    lines.push(`  ${result.explanation}`);
    if (!result.passed && Array.isArray(result.evidence) && result.evidence.length) {
      result.evidence.forEach((item) => {
        lines.push(`  Evidence: ${item}`);
      });
    }
  });
  lines.push('');
  lines.push('## Behavioral Diffs');
  lines.push('');
  report.behavioralDiffs.forEach((diff) => {
    lines.push(`- ${diff.mutationId}: ${diff.summary}`);
  });

  return sanitizeReportText(lines.join('\n'));
}

export function formatMarkdownSuiteReport(report) {
  const lines = [];
  const title = suiteTitle(report.suite.pack);

  lines.push(`# HarnessAmp v2 ${title} Suite Report`);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`- Suite: ${report.suite.name}`);
  lines.push(`- Pack: ${report.suite.pack}`);
  lines.push(`- Gate: ${report.gate.toUpperCase()}`);
  lines.push(`- Scenarios: ${report.scenarioCount}`);
  lines.push(`- Mutations: ${report.mutationCount}`);
  lines.push(`- Contract results: ${report.contractResultCount}`);
  lines.push(`- Failures: ${report.failureCount}`);
  lines.push(`- Highest severity: ${report.highestSeverity}`);
  lines.push(`- Risk score: ${report.riskScore}`);
  lines.push('');

  if (report.generated) {
    lines.push('## Generated Coverage');
    lines.push('');
    lines.push(`- Tier: ${report.generated.tier}`);
    lines.push(`- Templates: ${report.generated.coverage.templateCount}`);
    lines.push(`- Mutation operators: ${report.generated.coverage.mutationOperatorCount}`);
    lines.push(`- Contracts: ${report.generated.coverage.contractCount}`);
    lines.push(`- Profiles: ${report.generated.coverage.profileCount}`);
    lines.push(`- Prompt variants: ${report.generated.coverage.promptVariantCount}`);
    lines.push(`- Context variants: ${report.generated.coverage.contextVariantCount}`);
    if (Array.isArray(report.generated.provenanceSamples) && report.generated.provenanceSamples.length) {
      lines.push('- Provenance samples:');
      report.generated.provenanceSamples.forEach((sample) => {
        lines.push(`  ${sample.scenarioId}: ${sample.rationale}`);
      });
    }
    lines.push('');
  }

  if (report.evaluationSummary?.evaluationCount) {
    lines.push('## Evaluation Summary');
    lines.push('');
    lines.push(`- Evaluations: ${report.evaluationSummary.evaluationCount}`);
    lines.push(`- Average overall score: ${formatMetric(report.evaluationSummary.averageOverallScore)}`);
    Object.entries(report.evaluationSummary.averageMetrics ?? {}).forEach(([name, value]) => {
      lines.push(`- ${name}: ${formatMetric(value)}`);
    });
    lines.push('');
  }

  lines.push('## Top Failures');
  lines.push('');
  if (!report.failureCounts.length) {
    lines.push('- No failures.');
  } else {
    report.failureCounts.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.failureType} - ${item.count} failure(s), highest severity ${item.highestSeverity}`);
    });
  }
  lines.push('');

  lines.push('## Scenario Results');
  lines.push('');
  report.reports.forEach((scenarioReport) => {
    const failed = scenarioReport.contractResults.filter((result) => !result.passed);
    lines.push(`### ${scenarioReport.scenario.name}`);
    lines.push('');
    lines.push(`- Gate: ${scenarioReport.gate.toUpperCase()}`);
    lines.push(`- Mutations: ${scenarioReport.mutatedTraces.length}`);
    lines.push(`- Failures: ${failed.length}`);
    failed.forEach((result) => {
      lines.push(`- ${result.failureType}: ${result.contractId} (${result.severity})`);
    });
    lines.push('');
  });

  return sanitizeReportText(lines.join('\n'));
}

function riskScore(failingResults) {
  return failingResults.reduce((sum, result) => sum + severityRank(result.severity) * 25, 0);
}

function suiteTitle(packName) {
  if (packName === 'healthguard-core') return 'HealthGuard';
  if (packName === 'customercareguard-core') return 'CustomerCareGuard';
  if (packName === 'legalguard-core') return 'LegalGuard';
  if (packName === 'retrievalguard-core') return 'RetrievalGuard';
  return 'FinanceGuard';
}

function formatMetric(value) {
  return typeof value === 'number' ? value.toFixed(3) : 'n/a';
}

function retrievalSignalLines(signals = {}) {
  const lines = [];
  [
    ['missingRequiredDocuments', 'missing required docs'],
    ['missingBridgeDocuments', 'missing bridge docs'],
    ['missingRequiredCitations', 'missing required citations'],
    ['forbiddenCitationHits', 'forbidden citations'],
    ['forbiddenClaimHits', 'forbidden claims'],
    ['forbiddenSourceHits', 'forbidden source labels'],
    ['unsupportedCitationIds', 'unsupported citation ids'],
    ['citationSpanMismatches', 'citation span mismatches'],
  ].forEach(([key, label]) => {
    const value = signals[key];
    if (Array.isArray(value) && value.length) {
      lines.push(`${label}: ${value.join(', ')}`);
    }
  });
  if (signals.retrievalStatus && signals.retrievalStatus !== 'success') {
    lines.push(`retrieval status: ${signals.retrievalStatus}`);
  }
  return lines;
}

function domainSignalLines(signals = {}) {
  const lines = [];
  [
    ['failedContracts', 'failed contracts'],
    ['failureTypes', 'failure types'],
    ['forbiddenClaimHits', 'forbidden claims'],
    ['forbiddenActionHits', 'forbidden actions'],
    ['missingRequiredPhrases', 'missing required phrases'],
    ['missingRequiredToolCalls', 'missing required tool calls'],
    ['forbiddenToolCalls', 'forbidden tool calls'],
    ['missingRequiredDataFields', 'missing required data fields'],
  ].forEach(([key, label]) => {
    const value = signals[key];
    if (Array.isArray(value) && value.length) {
      lines.push(`${label}: ${value.join(', ')}`);
    }
  });
  return lines;
}
