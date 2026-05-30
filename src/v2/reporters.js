import { meetsSeverityThreshold, severityRank } from './severity.js';
import { sanitizeReportText, sanitizeReportValue } from './report-sanitizer.js';

export function buildRunReport({ scenario, pack, baselineTrace, mutatedTraces, behavioralDiffs, contractResults, failOn }) {
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

  lines.push('## Contract Results');
  lines.push('');
  report.contractResults.forEach((result) => {
    lines.push(`- ${result.passed ? 'PASS' : 'FAIL'} ${result.contractId} (${result.severity})`);
    lines.push(`  ${result.explanation}`);
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
  const title = report.suite.pack === 'healthguard-core' ? 'HealthGuard' : 'FinanceGuard';

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
