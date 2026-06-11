import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadScenarioFile } from './scenario-loader.js';
import { runV2Scenario } from './runner.js';
import { meetsSeverityThreshold, severityRank } from './severity.js';
import { summarizeDomainEvaluations } from './domain-evaluator.js';
import {
  generateFinanceGuardScenarios,
  summarizeFinanceGuardGeneratedCoverage,
} from './generators/financeguard-generator.js';
import {
  generateHealthGuardScenarios,
  summarizeHealthGuardGeneratedCoverage,
} from './generators/healthguard-generator.js';
import {
  generateCustomerCareGuardScenarios,
  summarizeCustomerCareGuardGeneratedCoverage,
} from './generators/customercareguard-generator.js';
import {
  generateLegalGuardScenarios,
  summarizeLegalGuardGeneratedCoverage,
} from './generators/legalguard-generator.js';
import {
  generateRetrievalGuardScenarios,
  summarizeRetrievalGuardGeneratedCoverage,
} from './generators/retrievalguard-generator.js';

export async function runV2Suite(path, options = {}) {
  const scenarioPaths = discoverScenarioPaths(path);
  const reports = [];

  for (const scenarioPath of scenarioPaths) {
    const scenario = loadScenarioFile(scenarioPath);
    reports.push(await runV2Scenario(scenario, options));
  }

  return buildSuiteReport({
    id: options.suiteId ?? `${options.packName ?? 'financeguard-core'}-suite`,
    name: options.suiteName ?? defaultSuiteName(options.packName ?? 'financeguard-core'),
    sourcePath: resolve(path),
    packName: options.packName ?? 'financeguard-core',
    failOn: options.failOn ?? 'critical',
    reports,
  });
}

export async function runGeneratedV2Suite(options = {}) {
  const packName = options.packName ?? 'healthguard-core';
  const tier = options.generatedTier ?? options.tier ?? 'core';
  const generator = generatedGeneratorFor(packName);
  const scenarios = generator.generate({
    tier,
    maxScenarios: options.maxGeneratedScenarios,
  });
  const reports = [];

  for (const scenario of scenarios) {
    reports.push(await runV2Scenario(scenario, options));
  }

  return buildSuiteReport({
    id: options.suiteId ?? `${packName.replace('-core', '')}-generated-${tier}`,
    name: options.suiteName ?? `${generatedSuiteLabel(packName)} Generated ${capitalize(tier)} Suite`,
    sourcePath: `generated:${packName}:${tier}`,
    packName,
    failOn: options.failOn ?? 'critical',
    reports,
    generated: {
      pack: packName,
      tier,
      maxGeneratedScenarios: options.maxGeneratedScenarios ?? null,
      coverage: generator.summarize(scenarios),
      provenanceSamples: scenarios.slice(0, 3).map(generatedProvenanceSample),
    },
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
    .filter((item) => !/\/(?:financeguard|healthguard|customercareguard|legalguard|retrievalguard)-core\.ya?ml$/i.test(item))
    .sort((left, right) => left.localeCompare(right));
}

export function buildSuiteReport({ id, name, sourcePath, packName, failOn, reports, generated = null }) {
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
    evaluationSummary: summarizeDomainEvaluations(reports.flatMap((report) => report.domainEvaluations ?? [])),
    generated,
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

function defaultSuiteName(packName) {
  if (packName === 'healthguard-core') return 'HealthGuard Core Suite';
  if (packName === 'customercareguard-core') return 'CustomerCareGuard Core Suite';
  if (packName === 'legalguard-core') return 'LegalGuard Core Suite';
  if (packName === 'retrievalguard-core') return 'RetrievalGuard Core Suite';
  return 'FinanceGuard Core Suite';
}

function generatedGeneratorFor(packName) {
  if (packName === 'customercareguard-core') {
    return {
      generate: generateCustomerCareGuardScenarios,
      summarize: summarizeCustomerCareGuardGeneratedCoverage,
    };
  }
  if (packName === 'legalguard-core') {
    return {
      generate: generateLegalGuardScenarios,
      summarize: summarizeLegalGuardGeneratedCoverage,
    };
  }
  if (packName === 'retrievalguard-core') {
    return {
      generate: generateRetrievalGuardScenarios,
      summarize: summarizeRetrievalGuardGeneratedCoverage,
    };
  }
  if (packName === 'healthguard-core') {
    return {
      generate: generateHealthGuardScenarios,
      summarize: summarizeHealthGuardGeneratedCoverage,
    };
  }
  if (packName === 'financeguard-core') {
    return {
      generate: generateFinanceGuardScenarios,
      summarize: summarizeFinanceGuardGeneratedCoverage,
    };
  }
  throw new Error(`Generated v2 suites are not available for pack: ${packName}`);
}

function generatedSuiteLabel(packName) {
  if (packName === 'healthguard-core') return 'HealthGuard';
  if (packName === 'financeguard-core') return 'FinanceGuard';
  if (packName === 'customercareguard-core') return 'CustomerCareGuard';
  if (packName === 'legalguard-core') return 'LegalGuard';
  if (packName === 'retrievalguard-core') return 'RetrievalGuard';
  return packName;
}

function capitalize(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function generatedProvenanceSample(scenario) {
  const metadata = scenario.metadata ?? {};
  return {
    scenarioId: scenario.id,
    templateId: metadata.generatedTemplateId,
    mutationVariantId: metadata.generatedMutationVariantId,
    profileId: metadata.generatedProfileId,
    promptVariantId: metadata.generatedPromptVariantId,
    contextVariantId: metadata.generatedContextVariantId,
    rationale: `template ${metadata.generatedTemplateId}, mutation ${metadata.generatedMutationVariantId}, profile ${metadata.generatedProfileId}, prompt ${metadata.generatedPromptVariantId}, context ${metadata.generatedContextVariantId}`,
  };
}
