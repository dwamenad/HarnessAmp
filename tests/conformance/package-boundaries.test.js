import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBundle as analyzeFromCore, createDemoBundle } from '../../src/core/engine.js';
import { analyzeBundle as analyzeFromShim } from '../../src/engine.js';
import { generateMutationSuite } from '../../src/mutations/registry.js';
import { generateMutationSuite as generateMutationSuiteFromShim } from '../../src/mutation-registry.js';

test('new package boundaries expose the primary engine and mutation APIs', () => {
  const bundle = createDemoBundle();
  const analysis = analyzeFromCore(bundle);
  const suite = generateMutationSuite(bundle, { maxMutations: 4 });

  assert.equal(analysis.bundle.project, bundle.project);
  assert.equal(suite.mutations.length, 4);
});

test('legacy top-level modules remain compatibility shims', () => {
  const bundle = createDemoBundle();

  assert.equal(analyzeFromShim(bundle).bundle.project, analyzeFromCore(bundle).bundle.project);
  assert.deepEqual(
    generateMutationSuiteFromShim(bundle, { maxMutations: 4 }).mutations.map((mutation) => mutation.mutationId),
    generateMutationSuite(bundle, { maxMutations: 4 }).mutations.map((mutation) => mutation.mutationId),
  );
});
