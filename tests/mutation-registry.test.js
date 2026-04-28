import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoBundle } from '../src/core/engine.js';
import { generateMutationSuite, getMutationRegistry, selectMutationPacks } from '../src/mutations/registry.js';

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
