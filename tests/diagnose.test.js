import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBehavioralDeltas, diagnoseHarness } from '../src/core/diagnose.js';
import { createDemoBundle } from '../src/core/engine.js';
import { getFailureType } from '../src/core/failure-taxonomy.js';
import { normalizeRunArtifacts } from '../src/core/run-artifacts.js';
import { createRunJobQueue, executeRunJobQueue } from '../src/core/run-jobs.js';
import { createRunner, MockRunner, ModelSDKRunner } from '../src/adapters/runners.js';

test('diagnose command path produces deltas, findings, and diagnostic report text', async () => {
  const diagnosis = await diagnoseHarness(createDemoBundle(), { maxMutations: 20 });

  assert.equal(diagnosis.suite.mutations.length, 20);
  assert.equal(diagnosis.runJobs.length, diagnosis.baselineRuns.length + diagnosis.mutationRuns.length);
  assert.ok(diagnosis.runJobs.every((job) => job.status === 'completed'));
  assert.ok(diagnosis.baselineRuns.length >= 1);
  assert.equal(diagnosis.mutationRuns.length, 20);
  assert.ok(diagnosis.deltas.some((delta) => delta.deltaType.includes('pass_to_fail')));
  assert.ok(diagnosis.findings.length >= 1);
  assert.ok(diagnosis.reportText.includes('HarnessAmp Robustness Report'));
  assert.ok(['pass', 'warn', 'block'].includes(diagnosis.summary.verdict));
});

test('generated diagnosis clusters duplicate failures and ranks mutation value', async () => {
  const diagnosis = await diagnoseHarness(createDemoBundle(), {
    generatedTier: 'smoke',
    maxGeneratedMutations: 40,
  });

  assert.equal(diagnosis.suite.generated.tier, 'smoke');
  assert.equal(diagnosis.mutationRuns.length, 40);
  assert.ok(diagnosis.failureClusters.length > 0);
  assert.ok(diagnosis.summary.uniqueFailureCount <= diagnosis.summary.failureCount);
  assert.ok(diagnosis.mutationValue.length > 0);
  assert.ok(diagnosis.mutationValue[0].uniqueFailureClusters >= 1);
  assert.match(diagnosis.reportText, /Failure Clusters/);
  assert.match(diagnosis.reportText, /Mutation Value Map/);
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

test('run job queue executes jobs with bounded parallelism', async () => {
  let active = 0;
  let maxActive = 0;
  const runner = {
    async run({ task }) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return {
        runId: task.id,
        taskId: task.id,
        mutationId: null,
        metadata: { passed: true },
        outputText: 'PASS',
        toolCalls: [],
        errors: [],
        latencyMs: 10,
      };
    },
  };
  const jobs = createRunJobQueue(Array.from({ length: 5 }, (_, index) => ({
    id: `job-${index}`,
    kind: 'baseline',
    bundle: {},
    task: { id: `case-${index}` },
  })));

  const result = await executeRunJobQueue(jobs, { runner, concurrency: 2 });

  assert.equal(result.completed.length, 5);
  assert.equal(result.failed.length, 0);
  assert.ok(maxActive <= 2);
});

test('run job queue retries failed attempts', async () => {
  let attempts = 0;
  const runner = {
    async run({ task }) {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('temporary runner outage');
      }
      return {
        runId: task.id,
        taskId: task.id,
        mutationId: null,
        metadata: { passed: true },
        outputText: 'PASS',
        toolCalls: [],
        errors: [],
        latencyMs: 10,
      };
    },
  };
  const jobs = createRunJobQueue([{
    id: 'retry-job',
    kind: 'baseline',
    bundle: {},
    task: { id: 'case-retry' },
  }], { maxAttempts: 2 });

  const result = await executeRunJobQueue(jobs, { runner, maxAttempts: 2 });

  assert.equal(result.completed.length, 1);
  assert.equal(result.jobs[0].attempts, 2);
  assert.equal(result.jobs[0].status, 'completed');
});

test('run job queue applies retry backoff before the next attempt', async () => {
  let attempts = 0;
  const startedAt = Date.now();
  const runner = {
    async run({ task }) {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary runner outage');
      return {
        runId: task.id,
        taskId: task.id,
        mutationId: null,
        metadata: { passed: true },
        outputText: 'PASS',
        toolCalls: [],
        errors: [],
        latencyMs: 10,
      };
    },
  };
  const jobs = createRunJobQueue([{
    id: 'backoff-job',
    kind: 'baseline',
    bundle: {},
    task: { id: 'case-backoff' },
  }], { maxAttempts: 2 });

  const result = await executeRunJobQueue(jobs, { runner, maxAttempts: 2, retryBackoffMs: 20 });

  assert.equal(result.jobs[0].status, 'completed');
  assert.ok(Date.now() - startedAt >= 20);
});

test('run artifact normalization captures coding-agent traces', () => {
  const artifacts = normalizeRunArtifacts({
    runId: 'run-1',
    taskId: 'case-01',
    mutationId: 'mut-1',
    timestamp: '2026-05-30T00:00:00.000Z',
    metadata: {
      trace: {
        commands: [{ command: 'npm test', output: 'pass', exitCode: 0 }],
        fileDiffs: [{ path: 'src/app.js', diff: '+console.log("ok")' }],
        sandboxEvents: [{ action: 'read', path: '/workspace/src/app.js', allowed: true }],
        approvals: [{ action: 'network', approved: false, reason: 'blocked by policy' }],
        terminalOutput: 'terminal transcript',
      },
    },
  });

  assert.deepEqual(
    artifacts.map((artifact) => artifact.type).sort(),
    ['approval_event', 'file_diff', 'sandbox_event', 'terminal_command', 'terminal_output'].sort(),
  );
  assert.ok(artifacts.every((artifact) => artifact.redacted === true));
});

test('failure taxonomy provides engineering fixes', () => {
  const failure = getFailureType('schema_overtrust');

  assert.equal(failure.label, 'Schema Overtrust');
  assert.ok(failure.recommendedFix.includes('schema validation'));
});
