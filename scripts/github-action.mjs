#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { diagnoseHarness } from '../src/core/diagnose.js';
import { evaluateDiagnosisGate, formatCiGateSummary } from '../src/core/ci-gate.js';
import { safeJsonParse } from '../src/core/engine.js';
import { collectDiagnosticFailureCorpus } from '../src/reports/failure-corpus.js';

const options = parseArgs(process.argv.slice(2));
const outputDir = resolve(options.outputDir);
const reportPath = resolve(outputDir, 'harnessamp-report.md');
const jsonPath = resolve(outputDir, 'harnessamp-report.json');
const failureCorpusPath = resolve(outputDir, 'harnessamp-failure-corpus.json');

const bundle = readJsonFile(options.bundle, 'bundle');
const diagnosis = await diagnoseHarness(bundle, {
  maxMutations: options.maxMutations,
  runnerKind: options.runnerKind,
  runnerOptions: {
    endpoint: options.runnerEndpoint,
    token: options.runnerToken,
  },
});
const gate = evaluateDiagnosisGate(diagnosis, {
  minOverallScore: options.minOverallScore,
  minHoldoutPass: options.minHoldoutPass,
  maxRobustnessGap: options.maxRobustnessGap,
  failOnWarn: options.failOnWarn,
});
const failureCorpus = collectDiagnosticFailureCorpus(diagnosis);
const summaryText = formatCiGateSummary(diagnosis, gate, {
  reportPath,
  jsonPath,
  failureCorpusPath,
});

await ensureParent(reportPath);
await writeFile(reportPath, `${summaryText}\n\n${diagnosis.reportText}\n`);
await writeFile(jsonPath, JSON.stringify({ diagnosis, gate }, null, 2));
await writeFile(failureCorpusPath, JSON.stringify(failureCorpus, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, `${summaryText}\n`, { flag: 'a' });
}

await writeGithubOutput({
  verdict: gate.verdict,
  'robustness-gap': gate.metrics.robustnessGap,
  'original-pass-rate': gate.metrics.originalPassRate,
  'mutated-pass-rate': gate.metrics.mutatedPassRate,
  'report-path': reportPath,
  'json-path': jsonPath,
  'failure-corpus-path': failureCorpusPath,
});

console.log(summaryText);

if (gate.shouldFail) {
  process.exitCode = gate.verdict === 'block' ? 2 : 1;
}

function parseArgs(args) {
  const parsed = {
    bundle: null,
    observations: null,
    maxMutations: 24,
    minOverallScore: 65,
    minHoldoutPass: 60,
    maxRobustnessGap: 20,
    failOnWarn: false,
    outputDir: 'harnessamp-artifacts',
    runnerKind: 'mock',
    runnerEndpoint: '',
    runnerToken: '',
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--bundle') {
      parsed.bundle = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--observations') {
      parsed.observations = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--max-mutations') {
      parsed.maxMutations = Number(args[index + 1] ?? parsed.maxMutations);
      index += 1;
      continue;
    }
    if (arg === '--min-overall-score') {
      parsed.minOverallScore = Number(args[index + 1] ?? parsed.minOverallScore);
      index += 1;
      continue;
    }
    if (arg === '--min-holdout-pass') {
      parsed.minHoldoutPass = Number(args[index + 1] ?? parsed.minHoldoutPass);
      index += 1;
      continue;
    }
    if (arg === '--max-robustness-gap') {
      parsed.maxRobustnessGap = Number(args[index + 1] ?? parsed.maxRobustnessGap);
      index += 1;
      continue;
    }
    if (arg === '--fail-on-warn') {
      parsed.failOnWarn = String(args[index + 1] ?? 'false').toLowerCase() === 'true';
      index += 1;
      continue;
    }
    if (arg === '--output-dir') {
      parsed.outputDir = args[index + 1] ?? parsed.outputDir;
      index += 1;
      continue;
    }
    if (arg === '--runner-kind') {
      parsed.runnerKind = args[index + 1] ?? parsed.runnerKind;
      index += 1;
      continue;
    }
    if (arg === '--runner-endpoint') {
      parsed.runnerEndpoint = args[index + 1] ?? parsed.runnerEndpoint;
      index += 1;
      continue;
    }
    if (arg === '--runner-token') {
      parsed.runnerToken = args[index + 1] ?? parsed.runnerToken;
      index += 1;
      continue;
    }
  }

  if (!parsed.bundle) {
    throw new Error('Missing required --bundle path.');
  }

  return parsed;
}

function readJsonFile(path, label) {
  const text = readFileSync(resolve(path), 'utf8');
  const parsed = safeJsonParse(text);
  if (!parsed.ok) {
    throw new Error(`Invalid ${label} JSON at ${path}: ${parsed.error.message}`);
  }
  return parsed.value;
}

async function writeGithubOutput(outputs) {
  const outputPath = process.env.GITHUB_OUTPUT;
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
  if (!outputPath) return;
  await writeFile(outputPath, `${lines.join('\n')}\n`, { flag: 'a' });
}

async function ensureParent(path) {
  await mkdir(dirname(path), { recursive: true });
}
