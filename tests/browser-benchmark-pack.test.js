import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import benchmarkPackSchema from '../docs/schemas/benchmark_pack.schema.json' with { type: 'json' };
import browserBenchmarkPack from '../examples/benchmarks/browser-mvp/benchmark-pack.json' with { type: 'json' };
import { analyzeBundle } from '../src/core/engine.js';

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(benchmarkPackSchema);

test('browser MVP benchmark pack matches the benchmark schema', () => {
  assert.equal(validate(browserBenchmarkPack), true, JSON.stringify(validate.errors, null, 2));
});

test('browser MVP benchmark pack is analyzable by the core engine', () => {
  const analysis = analyzeBundle(browserBenchmarkPack, browserBenchmarkPack.observations, {
    intensity: browserBenchmarkPack.mutationPolicy.intensity,
  });

  assert.equal(analysis.bundle.project, 'Browser MVP Robustness Benchmark');
  assert.ok(analysis.reportText.includes('Browser MVP Robustness Benchmark'));
  assert.ok(analysis.pack.variants.length > 0);
});

test('web app source references the browser benchmark preset', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /browser-mvp-benchmark/);
  assert.match(source, /Browser MVP benchmark pack/);
});
