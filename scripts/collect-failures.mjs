import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyzeBundle, createDemoBundle, safeJsonParse } from '../src/core/engine.js';
import { collectFailureCorpus, formatFailureCorpusReport, mergeFailureCorpora } from '../src/reports/failure-corpus.js';

const args = process.argv.slice(2);
const positional = [];
let mergePath = null;
let writePath = null;
let mode = 'json';

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--merge') {
    mergePath = args[index + 1] ?? null;
    index += 1;
    continue;
  }
  if (arg === '--write') {
    writePath = args[index + 1] ?? null;
    index += 1;
    continue;
  }
  if (arg === '--report') {
    mode = 'report';
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

const analysis = analyzeBundle(bundleInput, observationsInput);
const nextCorpus = collectFailureCorpus(analysis);

let output = nextCorpus;
if (mergePath) {
  const existing = JSON.parse(readFileSync(resolve(mergePath), 'utf8'));
  output = mergeFailureCorpora(existing, nextCorpus);
}

const serialized = mode === 'report' ? formatFailureCorpusReport(output) : JSON.stringify(output, null, 2);

if (writePath) {
  await writeFile(resolve(writePath), serialized);
}

console.log(serialized);
