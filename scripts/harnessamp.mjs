#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { diagnoseHarness } from '../src/core/diagnose.js';
import { analyzeBundle, createDemoBundle, safeJsonParse } from '../src/core/engine.js';
import { generateMutationSuite, getMutationRegistry } from '../src/mutations/registry.js';

const [command = 'diagnose', ...rest] = process.argv.slice(2);
const options = parseArgs(rest);
const bundle = loadBundle(options.positional[0]);

if (command === 'validate') {
  const analysis = analyzeBundle(bundle);
  console.log(JSON.stringify({
    valid: true,
    project: analysis.bundle.project,
    harnessName: analysis.bundle.harness.agentName,
    toolCount: analysis.bundle.harness.tools.length,
    scenarioCount: analysis.bundle.harness.scenarios.length,
  }, null, 2));
} else if (command === 'mutate') {
  const suite = generateMutationSuite(bundle, {
    maxMutations: options.maxMutations,
    riskProfile: options.riskProfile,
  });
  console.log(JSON.stringify(suite, null, 2));
} else if (command === 'run') {
  const diagnosis = await diagnoseHarness(bundle, {
    maxMutations: options.maxMutations ?? 5,
    riskProfile: options.riskProfile,
  });
  console.log(JSON.stringify({
    baselineRuns: diagnosis.baselineRuns,
    mutationRuns: diagnosis.mutationRuns,
  }, null, 2));
} else if (command === 'report') {
  const diagnosis = await diagnoseHarness(bundle, {
    maxMutations: options.maxMutations,
    riskProfile: options.riskProfile,
  });
  console.log(diagnosis.reportText);
} else if (command === 'registry') {
  console.log(JSON.stringify(getMutationRegistry(), null, 2));
} else if (command === 'diagnose') {
  const diagnosis = await diagnoseHarness(bundle, {
    maxMutations: options.maxMutations,
    riskProfile: options.riskProfile,
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
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      parsed.positional.push(arg);
    }
  }

  return parsed;
}

function loadBundle(path) {
  if (!path) return createDemoBundle();
  const text = readFileSync(resolve(path), 'utf8');
  const parsed = safeJsonParse(text);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
}
