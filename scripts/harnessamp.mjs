#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { diagnoseHarness } from '../src/core/diagnose.js';
import { analyzeBundle, createDemoBundle, safeJsonParse } from '../src/core/engine.js';
import { generateMutationSuite, getMutationRegistry } from '../src/mutations/registry.js';
import { formatMarkdownReport, formatMarkdownSuiteReport } from '../src/v2/reporters.js';
import { runV2Scenario } from '../src/v2/runner.js';
import { loadScenarioFile } from '../src/v2/scenario-loader.js';
import { runGeneratedV2Suite, runV2Suite } from '../src/v2/suite-runner.js';

const [command = 'diagnose', ...rest] = process.argv.slice(2);
const options = parseArgs(rest);

if (command === 'validate') {
  const bundle = loadBundle(options.positional[0]);
  const analysis = analyzeBundle(bundle);
  console.log(JSON.stringify({
    valid: true,
    project: analysis.bundle.project,
    harnessName: analysis.bundle.harness.agentName,
    toolCount: analysis.bundle.harness.tools.length,
    scenarioCount: analysis.bundle.harness.scenarios.length,
  }, null, 2));
} else if (command === 'mutate') {
  const bundle = loadBundle(options.positional[0]);
  const suite = generateMutationSuite(bundle, {
    maxMutations: options.maxMutations,
    generatedTier: options.generatedTier,
    maxGeneratedMutations: options.maxGeneratedScenarios,
    shard: options.shard,
    shardIndex: options.shardIndex,
    shardCount: options.shardCount,
    surfaces: options.surfaces,
    severities: options.severities,
    prioritization: options.prioritization,
    riskProfile: options.riskProfile,
  });
  console.log(JSON.stringify(suite, null, 2));
} else if (command === 'run') {
  if (options.generatedTier && !options.positional[0]) {
    const report = await runGeneratedV2Suite({
      packName: options.packName,
      failOn: options.failOn,
      suiteName: options.suiteName,
      generatedTier: options.generatedTier,
      maxGeneratedScenarios: options.maxGeneratedScenarios,
    });
    const output = options.reportFormat === 'json'
      ? JSON.stringify(report, null, 2)
      : formatMarkdownSuiteReport(report);
    await writeOrPrint(output, options.outPath);
    if (report.gate === 'block') process.exitCode = 2;
    else if (report.gate === 'warn') process.exitCode = 1;
  } else if (isV2SuitePath(options.positional[0])) {
    const report = await runV2Suite(options.positional[0], {
      packName: options.packName,
      failOn: options.failOn,
      suiteName: options.suiteName,
    });
    const output = options.reportFormat === 'json'
      ? JSON.stringify(report, null, 2)
      : formatMarkdownSuiteReport(report);
    await writeOrPrint(output, options.outPath);
    if (report.gate === 'block') process.exitCode = 2;
    else if (report.gate === 'warn') process.exitCode = 1;
  } else if (isScenarioPath(options.positional[0])) {
    const scenario = loadScenarioFile(options.positional[0]);
    const report = await runV2Scenario(scenario, {
      packName: options.packName,
      failOn: options.failOn,
    });
    const output = options.reportFormat === 'json'
      ? JSON.stringify(report, null, 2)
      : formatMarkdownReport(report);
    await writeOrPrint(output, options.outPath);
    if (report.gate === 'block') process.exitCode = 2;
    else if (report.gate === 'warn') process.exitCode = 1;
  } else {
    const bundle = loadBundle(options.positional[0]);
    const diagnosis = await diagnoseHarness(bundle, {
      maxMutations: options.generatedTier ? options.maxMutations : options.maxMutations ?? 5,
      generatedTier: options.generatedTier,
      maxGeneratedMutations: options.maxGeneratedScenarios,
      shard: options.shard,
      shardIndex: options.shardIndex,
      shardCount: options.shardCount,
      surfaces: options.surfaces,
      severities: options.severities,
      prioritization: options.prioritization,
      riskProfile: options.riskProfile,
      runnerKind: options.runnerKind,
      runnerOptions: options.runnerOptions,
      concurrency: options.concurrency,
      maxAttempts: options.maxAttemptsPerRun,
      timeoutMs: options.timeoutMs,
      retryBackoffMs: options.retryBackoffMs,
    });
    console.log(JSON.stringify({
      baselineRuns: diagnosis.baselineRuns,
      mutationRuns: diagnosis.mutationRuns,
    }, null, 2));
  }
} else if (command === 'report') {
  const bundle = loadBundle(options.positional[0]);
  const diagnosis = await diagnoseHarness(bundle, {
    maxMutations: options.maxMutations,
    generatedTier: options.generatedTier,
    maxGeneratedMutations: options.maxGeneratedScenarios,
    shard: options.shard,
    shardIndex: options.shardIndex,
    shardCount: options.shardCount,
    surfaces: options.surfaces,
    severities: options.severities,
    prioritization: options.prioritization,
    riskProfile: options.riskProfile,
    runnerKind: options.runnerKind,
    runnerOptions: options.runnerOptions,
    concurrency: options.concurrency,
    maxAttempts: options.maxAttemptsPerRun,
    timeoutMs: options.timeoutMs,
    retryBackoffMs: options.retryBackoffMs,
  });
  console.log(diagnosis.reportText);
} else if (command === 'registry') {
  console.log(JSON.stringify(getMutationRegistry(), null, 2));
} else if (command === 'diagnose') {
  const bundle = loadBundle(options.positional[0]);
  const diagnosis = await diagnoseHarness(bundle, {
    maxMutations: options.maxMutations,
    generatedTier: options.generatedTier,
    maxGeneratedMutations: options.maxGeneratedScenarios,
    shard: options.shard,
    shardIndex: options.shardIndex,
    shardCount: options.shardCount,
    surfaces: options.surfaces,
    severities: options.severities,
    prioritization: options.prioritization,
    riskProfile: options.riskProfile,
    runnerKind: options.runnerKind,
    runnerOptions: options.runnerOptions,
    concurrency: options.concurrency,
    maxAttempts: options.maxAttemptsPerRun,
    timeoutMs: options.timeoutMs,
    retryBackoffMs: options.retryBackoffMs,
  });
  if (options.json) {
    console.log(JSON.stringify(diagnosis, null, 2));
  } else {
    console.log(diagnosis.reportText);
  }
  if (diagnosis.summary.verdict === 'block') {
    process.exitCode = 2;
  } else if (diagnosis.summary.verdict === 'warn') {
    process.exitCode = 1;
  }
} else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 2;
}

function parseArgs(args) {
  const parsed = {
    positional: [],
    maxMutations: null,
    json: false,
    riskProfile: null,
    runnerKind: 'mock',
    runnerOptions: {},
    concurrency: 4,
    maxAttemptsPerRun: 1,
    timeoutMs: 0,
    retryBackoffMs: 0,
    packName: 'financeguard-core',
    failOn: 'critical',
    reportFormat: 'markdown',
    outPath: null,
    suiteName: null,
    generatedTier: null,
    maxGeneratedScenarios: null,
    shard: null,
    shardIndex: null,
    shardCount: null,
    surfaces: null,
    severities: null,
    prioritization: 'risk',
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--max-mutations') {
      parsed.maxMutations = Number(args[index + 1] ?? 0);
      index += 1;
      continue;
    }
    if (arg === '--risk-profile') {
      parsed.riskProfile = JSON.parse(args[index + 1] ?? '{}');
      index += 1;
      continue;
    }
    if (arg === '--runner-kind') {
      parsed.runnerKind = args[index + 1] ?? parsed.runnerKind;
      index += 1;
      continue;
    }
    if (arg === '--runner-endpoint') {
      parsed.runnerOptions.endpoint = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--runner-token') {
      parsed.runnerOptions.token = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--concurrency') {
      parsed.concurrency = Number(args[index + 1] ?? parsed.concurrency);
      index += 1;
      continue;
    }
    if (arg === '--run-attempts') {
      parsed.maxAttemptsPerRun = Number(args[index + 1] ?? parsed.maxAttemptsPerRun);
      index += 1;
      continue;
    }
    if (arg === '--timeout-ms') {
      parsed.timeoutMs = Number(args[index + 1] ?? parsed.timeoutMs);
      index += 1;
      continue;
    }
    if (arg === '--retry-backoff-ms') {
      parsed.retryBackoffMs = Number(args[index + 1] ?? parsed.retryBackoffMs);
      index += 1;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--pack' || arg === '--mutations') {
      parsed.packName = args[index + 1] ?? parsed.packName;
      index += 1;
      continue;
    }
    if (arg === '--fail-on') {
      parsed.failOn = args[index + 1] ?? parsed.failOn;
      index += 1;
      continue;
    }
    if (arg === '--report') {
      parsed.reportFormat = args[index + 1] ?? parsed.reportFormat;
      index += 1;
      continue;
    }
    if (arg === '--out') {
      parsed.outPath = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--suite-name') {
      parsed.suiteName = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--generated') {
      parsed.generatedTier = args[index + 1] ?? 'core';
      index += 1;
      continue;
    }
    if (arg === '--max-generated') {
      parsed.maxGeneratedScenarios = Number(args[index + 1] ?? 0);
      index += 1;
      continue;
    }
    if (arg === '--shard') {
      parsed.shard = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--shard-index') {
      parsed.shardIndex = Number(args[index + 1] ?? 0);
      index += 1;
      continue;
    }
    if (arg === '--shard-count') {
      parsed.shardCount = Number(args[index + 1] ?? 0);
      index += 1;
      continue;
    }
    if (arg === '--surface' || arg === '--changed-surface') {
      parsed.surfaces = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--severity') {
      parsed.severities = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--prioritization' || arg === '--priority') {
      parsed.prioritization = args[index + 1] ?? parsed.prioritization;
      index += 1;
      continue;
    }
    if (!arg.startsWith('--')) {
      parsed.positional.push(arg);
    }
  }

  return parsed;
}

function isScenarioPath(path) {
  return typeof path === 'string' && /\.ya?ml$/i.test(path);
}

function isV2SuitePath(path) {
  if (typeof path !== 'string') return false;
  try {
    return statSync(resolve(path)).isDirectory();
  } catch {
    return false;
  }
}

async function writeOrPrint(output, outPath) {
  if (outPath) {
    await writeFile(resolve(outPath), `${output}\n`);
  } else {
    console.log(output);
  }
}

function loadBundle(path) {
  if (!path) return createDemoBundle();
  const text = readFileSync(resolve(path), 'utf8');
  const parsed = safeJsonParse(text);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
}
