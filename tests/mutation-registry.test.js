import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createDemoBundle } from '../src/core/engine.js';
import {
  generateGeneratedMutationSuite,
  generateMutationSuite,
  getGeneratedMutationMatrix,
  getMutationRegistry,
  selectMutationPacks,
  summarizeGeneratedMutationCoverage,
} from '../src/mutations/registry.js';

test('mutation registry exposes production mutation packs', () => {
  const registry = getMutationRegistry();

  assert.ok(registry.packs.length >= 7);
  assert.ok(registry.mutations.length >= 20);
  assert.ok(registry.mutations.every((mutation) => mutation.mutationId && mutation.trustBoundary));
});

test('risk profile selects relevant mutation packs', () => {
  const selected = selectMutationPacks({
    agentDomain: 'browser_agent',
    toolRisk: ['external_network', 'email_or_messaging'],
    dataSensitivity: ['pii'],
    autonomyLevel: 'semi_autonomous',
  });

  assert.ok(selected.includes('network_sink_pack'));
  assert.ok(selected.includes('permissioning_pack'));
  assert.ok(selected.includes('multimodal_pack'));
});

test('mutation suite deterministically links mutated harnesses to mutation ids', () => {
  const first = generateMutationSuite(createDemoBundle(), { maxMutations: 20 });
  const second = generateMutationSuite(createDemoBundle(), { maxMutations: 20 });

  assert.equal(first.mutations.length, 20);
  assert.deepEqual(first.mutations.map((item) => item.mutationId), second.mutations.map((item) => item.mutationId));
  assert.ok(first.mutations.every((mutation) => mutation.bundle.mutation.id === mutation.mutationId));
  assert.ok(first.mutations.every((mutation) => mutation.harness));
});

test('v1 generated matrix exposes large deterministic test tiers', () => {
  const matrix = getGeneratedMutationMatrix(createDemoBundle());

  assert.equal(matrix.scenarioVariantCount, 5);
  assert.equal(matrix.mutationTemplateCount, 22);
  assert.equal(matrix.riskProfileVariantCount, 5);
  assert.equal(matrix.promptVariantCount, 3);
  assert.equal(matrix.contextVariantCount, 34);
  assert.equal(matrix.tiers.smoke.mutationCount, 400);
  assert.equal(matrix.tiers.core.mutationCount, 3400);
  assert.equal(matrix.tiers.deep.mutationCount, 17000);
  assert.equal(matrix.tiers.nightly.mutationCount, 51000);
});

test('v1 generated smoke suite expands records without breaking mutation shape', () => {
  const suite = generateMutationSuite(createDemoBundle(), { generatedTier: 'smoke' });
  const coverage = summarizeGeneratedMutationCoverage(suite.mutations);

  assert.equal(suite.generated.tier, 'smoke');
  assert.equal(suite.mutations.length, 400);
  assert.equal(new Set(suite.mutations.map((mutation) => mutation.mutationId)).size, 400);
  assert.ok(suite.mutations.every((mutation) => mutation.bundle.mutation.id === mutation.mutationId));
  assert.ok(suite.mutations.every((mutation) => mutation.baseMutationId));
  assert.equal(coverage.baseMutationCount, 8);
  assert.equal(coverage.taskCount, 5);
  assert.equal(coverage.contextVariantCount, 10);
});

test('v1 generated core suite covers the full selected mutation registry', () => {
  const suite = generateGeneratedMutationSuite(createDemoBundle(), { tier: 'core' });
  const coverage = summarizeGeneratedMutationCoverage(suite.mutations);

  assert.equal(suite.mutations.length, 3400);
  assert.equal(coverage.baseMutationCount, getMutationRegistry().mutations.length);
  assert.equal(coverage.contextVariantCount, 34);
  assert.equal(coverage.mutationPackCount, 7);
  assert.ok(coverage.surfaces.includes('prompt'));
  assert.ok(coverage.surfaces.includes('sandbox'));
});

test('v1 generated suites can be capped deterministically', () => {
  const first = generateMutationSuite(createDemoBundle(), { generatedTier: 'nightly', maxGeneratedMutations: 125 });
  const second = generateMutationSuite(createDemoBundle(), { generatedTier: 'nightly', maxGeneratedMutations: 125 });

  assert.equal(first.mutations.length, 125);
  assert.equal(new Set(first.mutations.map((mutation) => mutation.mutationId)).size, 125);
  assert.deepEqual(
    first.mutations.map((mutation) => mutation.mutationId),
    second.mutations.map((mutation) => mutation.mutationId),
  );
});

test('CLI can inspect a capped v1 generated mutation suite', () => {
  const result = spawnSync(process.execPath, [
    'scripts/harnessamp.mjs',
    'mutate',
    'examples/demo-bundle.json',
    '--generated',
    'smoke',
    '--max-generated',
    '25',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  const suite = JSON.parse(result.stdout);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(suite.generated.tier, 'smoke');
  assert.equal(suite.mutations.length, 25);
  assert.equal(suite.generated.coverage.contextVariantCount, 10);
});
