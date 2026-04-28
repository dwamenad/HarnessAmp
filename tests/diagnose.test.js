import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBehavioralDeltas, diagnoseHarness } from '../src/core/diagnose.js';
import { createDemoBundle } from '../src/core/engine.js';
import { getFailureType } from '../src/core/failure-taxonomy.js';
import { createRunner, MockRunner, ModelSDKRunner } from '../src/adapters/runners.js';

test('diagnose command path produces deltas, findings, and diagnostic report text', async () => {
  const diagnosis = await diagnoseHarness(createDemoBundle(), { maxMutations: 20 });

  assert.equal(diagnosis.suite.mutations.length, 20);
  assert.ok(diagnosis.baselineRuns.length >= 1);
  assert.equal(diagnosis.mutationRuns.length, 20);
  assert.ok(diagnosis.deltas.some((delta) => delta.deltaType.includes('pass_to_fail')));
  assert.ok(diagnosis.findings.length >= 1);
  assert.ok(diagnosis.reportText.includes('HarnessAmp Robustness Report'));
  assert.ok(['pass', 'warn', 'block'].includes(diagnosis.summary.verdict));
});

test('behavioral delta comparison detects degraded mutated behavior', () => {
  const deltas = computeBehavioralDeltas(
    [{ taskId: 'case-01', metadata: { passed: true }, toolCalls: [{ name: 'lookup' }], outputText: 'PASS', latencyMs: 100 }],
    [{ taskId: 'case-01', mutationId: 'm1', metadata: { passed: false }, toolCalls: [], outputText: 'FAIL: Invented missing field.', latencyMs: 300 }],
    [{ mutationId: 'm1', operation: 'missing_required_field', trustBoundary: 'tool_output_to_model_context', severity: 'high' }],
  );

  assert.ok(deltas[0].deltaType.includes('pass_to_fail'));
  assert.ok(deltas[0].deltaType.includes('tool_usage_lost'));
  assert.ok(deltas[0].deltaType.includes('hallucination_introduced'));
});

test('runner abstraction keeps mock and future adapters separate', async () => {
  const runner = createRunner('mock');
  assert.ok(runner instanceof MockRunner);

  const futureRunner = createRunner('model_sdk');
  assert.ok(futureRunner instanceof ModelSDKRunner);
  await assert.rejects(() => futureRunner.run({}), /must be implemented/);
});

test('failure taxonomy provides engineering fixes', () => {
  const failure = getFailureType('schema_overtrust');

  assert.equal(failure.label, 'Schema Overtrust');
  assert.ok(failure.recommendedFix.includes('schema validation'));
});
