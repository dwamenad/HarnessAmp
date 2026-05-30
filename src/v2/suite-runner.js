import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadScenarioFile } from './scenario-loader.js';
import { runV2Scenario } from './runner.js';
import { meetsSeverityThreshold, severityRank } from './severity.js';

export async function runV2Suite(path, options = {}) {
  const scenarioPaths = discoverScenarioPaths(path);
  const reports = [];

  for (const scenarioPath of scenarioPaths) {
    const scenario = loadScenarioFile(scenarioPath);
    reports.push(await runV2Scenario(scenario, options));
  }

  return buildSuiteReport({
    id: options.suiteId ?? 'financeguard-core-suite',
    name: options.suiteName ?? 'FinanceGuard Core Suite',
    sourcePath: resolve(path),
    packName: options.packName ?? 'financeguard-core',
    failOn: options.failOn ?? 'critical',
    reports,
  });
}

export function discoverScenarioPaths(path) {
  const sourcePath = resolve(path);
  const stats = statSync(sourcePath);
  if (stats.isFile()) {
    return [sourcePath];
  }

  const paths = [];
  collectYamlFiles(sourcePath, paths);
  return paths
    .filter((item) => !item.endsWith('financeguard-core.yaml'))
    .sort((left, right) => left.localeCompare(right));
}

function buildSuiteReport({ id, name, sourcePath, packName, failOn, reports }) {
  const allResults = reports.flatMap((report) => report.contractResults);
  const failingResults = allResults.filter((result) => !result.passed);
  const blockingFailures = failingResults.filter((result) => meetsSeverityThreshold(result.severity, failOn));
  const highestSeverity = failingResults
    .map((result) => result.severity)
    .sort((left, right) => severityRank(right) - severityRank(left))[0] ?? 'low';
  const failureCounts = summarizeFailures(failingResults);

  return {
    version: '2.0.0-alpha',
    runId: `${id}__${Date.now()}`,
    suite: {
      id,
      name,
      sourcePath,
      pack: packName,
    },
    scenarioCount: reports.length,
    mutationCount: reports.reduce((sum, report) => sum + report.mutatedTraces.length, 0),
    contractResultCount: allResults.length,
    failureCount: failingResults.length,
    highestSeverity,
    riskScore: reports.reduce((sum, report) => sum + report.riskScore, 0),
    gate: blockingFailures.length ? 'block' : failingResults.length ? 'warn' : 'pass',
    failOn,
    failureCounts,
    reports,
  };
}

function collectYamlFiles(dir, paths) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      collectYamlFiles(path, paths);
      continue;
    }
    if (/\.ya?ml$/i.test(path)) {
      paths.push(path);
    }
  }
}

function summarizeFailures(failingResults) {
  const counts = new Map();
  for (const result of failingResults) {
    const key = result.failureType ?? 'unknown_failure';
    if (!counts.has(key)) {
      counts.set(key, {
        failureType: key,
        count: 0,
        highestSeverity: result.severity,
      });
    }
    const item = counts.get(key);
    item.count += 1;
    if (severityRank(result.severity) > severityRank(item.highestSeverity)) {
      item.highestSeverity = result.severity;
    }
  }
  return Array.from(counts.values()).sort((left, right) => right.count - left.count || severityRank(right.highestSeverity) - severityRank(left.highestSeverity));
}
