import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { analyzeBundle, createDemoBundle, safeJsonParse } from '../src/core/engine.js';
import { diagnoseHarness } from '../src/core/diagnose.js';
import { evaluateDiagnosisGate, formatCiGateSummary } from '../src/core/ci-gate.js';

const args = process.argv.slice(2);
const positional = [];
const options = {
  minHoldoutPass: 60,
  maxGap: 20,
  minOverallScore: 65,
  writeJson: null,
  writeMd: null,
  diagnose: false,
  maxMutations: 24,
  failOnWarn: false,
};

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--min-holdout-pass') {
    options.minHoldoutPass = Number(args[index + 1] ?? options.minHoldoutPass);
    index += 1;
    continue;
  }
  if (arg === '--max-gap') {
    options.maxGap = Number(args[index + 1] ?? options.maxGap);
    index += 1;
    continue;
  }
  if (arg === '--min-overall-score') {
    options.minOverallScore = Number(args[index + 1] ?? options.minOverallScore);
    index += 1;
    continue;
  }
  if (arg === '--write-json') {
    options.writeJson = args[index + 1] ?? null;
    index += 1;
    continue;
  }
  if (arg === '--write-md') {
    options.writeMd = args[index + 1] ?? null;
    index += 1;
    continue;
  }
  if (arg === '--diagnose') {
    options.diagnose = true;
    continue;
  }
  if (arg === '--max-mutations') {
    options.maxMutations = Number(args[index + 1] ?? options.maxMutations);
    index += 1;
    continue;
  }
  if (arg === '--fail-on-warn') {
    options.failOnWarn = String(args[index + 1] ?? 'false').toLowerCase() === 'true';
    index += 1;
    continue;
  }
  if (!arg.startsWith('--')) {
    positional.push(arg);
  }
}

const bundlePath = positional[0] ?? null;
const observationsPath = positional[1] ?? null;

let bundleInput = createDemoBundle();
let observationsInput = null;

if (bundlePath) {
  bundleInput = JSON.parse(readFileSync(resolve(bundlePath), 'utf8'));
}

if (observationsPath) {
  const observationText = readFileSync(resolve(observationsPath), 'utf8');
  const parsed = safeJsonParse(observationText);
  if (!parsed.ok) {
    throw parsed.error;
  }
  observationsInput = parsed.value;
}

if (options.diagnose) {
  const diagnosis = await diagnoseHarness(bundleInput, {
    maxMutations: options.maxMutations,
  });
  const gate = evaluateDiagnosisGate(diagnosis, {
    minOverallScore: options.minOverallScore,
    minHoldoutPass: options.minHoldoutPass,
    maxRobustnessGap: options.maxGap,
    failOnWarn: options.failOnWarn,
  });
  const markdown = formatCiGateSummary(diagnosis, gate, {
    reportPath: options.writeMd,
    jsonPath: options.writeJson,
  });
  const payload = {
    verdict: gate.verdict,
    thresholds: gate.thresholds,
    metrics: gate.metrics,
    checks: gate.checks,
    summary: diagnosis.summary,
  };

  if (options.writeJson) {
    await ensureParent(options.writeJson);
    await writeFile(resolve(options.writeJson), JSON.stringify(payload, null, 2));
  }

  if (options.writeMd) {
    await ensureParent(options.writeMd);
    await writeFile(resolve(options.writeMd), markdown);
  }

  console.log(markdown);

  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, { flag: 'a' });
  }

  if (gate.shouldFail) {
    process.exitCode = gate.verdict === 'block' ? 2 : 1;
  }
  process.exit();
}

const analysis = analyzeBundle(bundleInput, observationsInput);
const checks = [
  {
    id: 'overall_score',
    label: 'Overall score',
    actual: analysis.summary.overallScore,
    operator: '>=',
    threshold: options.minOverallScore,
    passed: analysis.summary.overallScore >= options.minOverallScore,
  },
  {
    id: 'holdout_pass',
    label: 'Holdout pass rate',
    actual: analysis.summary.holdoutPassRate,
    operator: '>=',
    threshold: options.minHoldoutPass,
    passed: analysis.summary.holdoutPassRate >= options.minHoldoutPass,
  },
  {
    id: 'gap',
    label: 'Visible/holdout gap',
    actual: analysis.summary.gap,
    operator: '<=',
    threshold: options.maxGap,
    passed: analysis.summary.gap <= options.maxGap,
  },
];

const verdict = checks.every((item) => item.passed) ? 'pass' : 'fail';
const payload = {
  verdict,
  thresholds: {
    minOverallScore: options.minOverallScore,
    minHoldoutPass: options.minHoldoutPass,
    maxGap: options.maxGap,
  },
  summary: analysis.summary,
  checks,
};

const markdown = formatGateMarkdown(analysis, payload);

if (options.writeJson) {
  await ensureParent(options.writeJson);
  await writeFile(resolve(options.writeJson), JSON.stringify(payload, null, 2));
}

if (options.writeMd) {
  await ensureParent(options.writeMd);
  await writeFile(resolve(options.writeMd), markdown);
}

console.log(markdown);

if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, { flag: 'a' });
}

if (verdict === 'fail') {
  process.exitCode = 1;
}

function formatGateMarkdown(analysis, payload) {
  const lines = [];
  lines.push('# HarnessAmp release gate');
  lines.push('');
  lines.push(`- Project: ${analysis.bundle.project}`);
  lines.push(`- Verdict: ${payload.verdict.toUpperCase()}`);
  lines.push(`- Overall score: ${analysis.summary.overallScore}`);
  lines.push(`- Holdout pass rate: ${analysis.summary.holdoutPassRate}%`);
  lines.push(`- Gap: ${analysis.summary.gap} points`);
  lines.push('');
  lines.push('| Check | Actual | Threshold | Status |');
  lines.push('| --- | --- | --- | --- |');
  payload.checks.forEach((item) => {
    lines.push(`| ${item.label} | ${item.actual} | ${item.operator} ${item.threshold} | ${item.passed ? 'PASS' : 'FAIL'} |`);
  });
  lines.push('');
  lines.push(`- Hotspot: ${analysis.summary.hotspot?.label ?? 'None'}`);
  return lines.join('\n');
}

async function ensureParent(path) {
  await mkdir(dirname(resolve(path)), { recursive: true });
}
