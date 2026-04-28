import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileTraceContract, createDemoTraceCorpus } from '../src/core/compiler.js';
import { safeJsonParse } from '../src/core/engine.js';

const args = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith('--'));
const inputPath = positional[0] ?? null;
const mode = args.includes('--json') ? 'json' : args.includes('--pack') ? 'pack' : 'report';

let corpusInput = createDemoTraceCorpus();

if (inputPath) {
  const raw = readFileSync(resolve(inputPath), 'utf8');
  const parsed = safeJsonParse(raw);
  if (!parsed.ok) {
    throw parsed.error;
  }
  corpusInput = parsed.value;
}

const compiled = compileTraceContract(corpusInput);

if (mode === 'json') {
  console.log(JSON.stringify(compiled, null, 2));
} else if (mode === 'pack') {
  console.log(JSON.stringify(compiled.pack, null, 2));
} else {
  console.log(compiled.reportText);
}
