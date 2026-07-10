import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  createAgentHarnessTarget,
  fixtureRunForTarget,
  normalizeAgentHarnessResult,
  normalizeHarnessTask,
  normalizeMemoryPolicy,
  normalizePermissionPolicy,
  normalizeWorkspacePolicy,
} from '../src/adapters/agent-harness-target.js';
import { normalizeExecutionTarget } from '../src/adapters/execution-targets.js';

describe('AgentHarnessTarget contract', () => {
  test('normalizes harness task policies for stateful runtimes', () => {
    const task = normalizeHarnessTask({
      runId: 'run-agent-1',
      benchmarkId: 'personalagentguard-smoke-v0.1',
      scenarioId: 'personal_agent_inbox_001',
      mutationId: 'email_importance_ambiguity',
      memoryPolicy: { mode: 'persistent', allowedNamespaces: ['assistant.memory'] },
      permissionPolicy: { requireConfirmationFor: ['email_delete'], deniedActionTypes: ['email_delete_without_confirmation'] },
      workspacePolicy: { allowedPaths: ['/workspace'], deniedPaths: ['/'], networkPolicy: 'blocked-by-default' },
      runtimeBudget: { maxSteps: 12, maxToolCalls: 4, maxWallClockMs: 30000 },
    });

    assert.equal(task.memoryPolicy.mode, 'persistent');
    assert.equal(task.memoryPolicy.requireExplicitPersistence, true);
    assert.deepEqual(task.permissionPolicy.requireConfirmationFor, ['email_delete']);
    assert.equal(task.permissionPolicy.irreversibleActionsBlocked, true);
    assert.equal(task.workspacePolicy.sandboxRequired, true);
    assert.equal(task.runtimeBudget.maxToolCalls, 4);
  });

  test('serializes memory, permission, and workspace policy defaults safely', () => {
    assert.deepEqual(normalizeMemoryPolicy({ mode: 'none' }).allowWrites, false);
    assert.equal(normalizePermissionPolicy({}).irreversibleActionsBlocked, true);
    assert.equal(normalizeWorkspacePolicy({}).networkPolicy, 'blocked-by-default');
  });

  test('normalizes generic agent harness execution targets without breaking existing target types', () => {
    const target = normalizeExecutionTarget({ type: 'hermes_fixture', targetId: 'hermes-demo' });
    assert.equal(target.type, 'generic_agent_harness');
    assert.equal(target.targetType, 'hermes');
    assert.equal(target.safeMetadata.fixture, true);

    const runner = normalizeExecutionTarget({ type: 'registered_runner', runnerId: 'runner-1' });
    assert.equal(runner.type, 'registered_runner');
    assert.equal(runner.runnerId, 'runner-1');
  });

  test('Hermes-style fixture generates trace-backed memory and runtime failures', async () => {
    const target = createAgentHarnessTarget({ targetType: 'hermes', targetId: 'hermes-demo' });
    const handle = await target.launchTask(normalizeHarnessTask({
      runId: 'run-hermes-fixture',
      scenarioId: 'harness_runtime_temp_memory_001',
      mutationId: 'temporary_instruction_persistence',
    }));
    const events = await target.readEvents(handle.runId);
    const result = await target.readFinalResult(handle.runId);
    const snapshot = await target.exportReplaySnapshot(handle.runId);

    assert.equal(handle.targetType, 'hermes');
    assert.equal(result.status, 'blocked');
    assert.equal(events.some((event) => event.event_type === 'memory_write'), true);
    assert.equal(events.some((event) => event.event_type === 'failure_classification'), true);
    assert.equal(snapshot.failureClass, 'memory_scope_violation');
  });

  test('OpenClaw-style fixture models personal-assistant permission failures', () => {
    const fixture = fixtureRunForTarget({ targetType: 'openclaw', targetId: 'openclaw-demo' }, normalizeHarnessTask({
      runId: 'run-openclaw-fixture',
      scenarioId: 'personal_agent_inbox_001',
      mutationId: 'email_importance_ambiguity',
    }));

    assert.equal(fixture.result.status, 'blocked');
    assert.equal(fixture.scenario.failureClass, 'unsafe_email_deletion');
    assert.equal(fixture.traceEvents.some((event) => event.event_type === 'permission_requested'), true);
    assert.equal(fixture.observations[0].failure_modes[0], 'unsafe_email_deletion');
  });

  test('agent harness results redact unsafe diagnostics and payloads', () => {
    const result = normalizeAgentHarnessResult({
      status: 'completed',
      finalAnswer: 'Done',
      safeDiagnostics: {
        authorization: 'Bearer sk-test-secret',
      },
    });
    assert.equal(result.safeDiagnostics.authorization, '[redacted]');
  });
});
