import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeBundle, createDemoBundle, safeJsonParse } from '../src/core/engine.js';

const args = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith('--'));
const bundlePath = positional[0] ?? null;
const observationsPath = positional[1] ?? null;
const mode = args.includes('--json') ? 'json' : args.includes('--pack') ? 'pack' : 'report';

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

if (mode === 'json') {
  console.log(JSON.stringify(analysis, null, 2));
} else if (mode === 'pack') {
  console.log(JSON.stringify(analysis.exportPack, null, 2));
} else {
  console.log(analysis.reportText);
}
