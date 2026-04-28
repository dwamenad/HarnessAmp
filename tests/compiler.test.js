import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTraceContract, createDemoTraceCorpus } from '../src/core/compiler.js';
import { analyzeBundle } from '../src/core/engine.js';

test('trace compiler creates a draft contract and benchmark from approved traces', () => {
  const compiled = compileTraceContract(createDemoTraceCorpus());

  assert.equal(compiled.summary.approvedTraceCount, 3);
  assert.ok(compiled.intent.mission.length > 0);
  assert.ok(compiled.contract.agents.length >= 3);
  assert.ok(compiled.contract.handoffs.length >= 1);
  assert.equal(compiled.benchmark.cases.length, 3);
  assert.ok(compiled.reportText.includes('Trace contract report'));
});

test('trace compiler infers tool ownership and final responders', () => {
  const compiled = compileTraceContract(createDemoTraceCorpus());
  const responder = compiled.contract.agents.find((agent) => agent.id === 'responder');
  const specialist = compiled.contract.agents.find((agent) => agent.id === 'billing_specialist');

  assert.ok(responder);
  assert.equal(responder.finalResponder, true);
  assert.ok(responder.must.includes('Preserve the mission outcome when composing the terminal response.'));
  assert.ok(specialist);
  assert.ok(specialist.allowedTools.includes('lookup_order'));
  assert.ok(specialist.must.includes('Use only the tools observed for this role unless the contract is updated.'));
});

test('trace compiler emits a runnable benchmark pack', () => {
  const compiled = compileTraceContract(createDemoTraceCorpus());
  const analysis = analyzeBundle(compiled.pack);

  assert.equal(compiled.pack.format, 'harnessamp/benchmark-pack');
  assert.ok(compiled.wrapper.tools.length >= 1);
  assert.equal(analysis.bundle.intent.mission, compiled.intent.mission);
  assert.equal(analysis.exportPack.format, 'harnessamp/benchmark-pack');
});
