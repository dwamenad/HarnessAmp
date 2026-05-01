import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { analyzeBundle } from '../src/core/engine.js';

const schema = JSON.parse(await readFile(new URL('../docs/schemas/benchmark_pack.schema.json', import.meta.url), 'utf8'));
const supportMvpPack = JSON.parse(await readFile(new URL('../examples/benchmarks/support-mvp/benchmark-pack.json', import.meta.url), 'utf8'));

test('support MVP benchmark pack matches the benchmark schema', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  assert.equal(validate(supportMvpPack), true, JSON.stringify(validate.errors, null, 2));
});

test('support MVP benchmark pack is analyzable by the core engine', () => {
  const analysis = analyzeBundle(supportMvpPack);

  assert.equal(analysis.bundle.project, 'Support MVP Robustness Benchmark');
  assert.equal(analysis.features.scenarioCount, 8);
  assert.ok(analysis.pack.variants.length > 0);
});
