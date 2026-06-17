import {
  adapterFailureRetryable,
  classifyAdapterError,
  normalizeAdapterDiagnostics,
} from '../adapters/contract.js';

const TERMINAL_STATES = new Set(['completed', 'failed', 'canceled']);

export function createRunJobQueue(items, options = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  return items.map((item, index) => ({
    id: item.id ?? `run_job_${String(index + 1).padStart(4, '0')}`,
    kind: item.kind ?? 'mutation',
    label: item.label ?? item.id ?? `Run job ${index + 1}`,
    taskId: item.task?.id ?? item.taskId ?? null,
    mutationId: item.mutation?.mutationId ?? null,
    payload: item,
    status: 'queued',
    attempts: 0,
    maxAttempts: options.maxAttempts ?? 1,
    result: null,
    error: null,
    createdAt: now(),
    updatedAt: now(),
    startedAt: null,
    finishedAt: null,
  }));
}

export async function executeRunJobQueue(jobs, options) {
  const {
    runner,
    environment = 'local',
    concurrency = 4,
    maxAttempts = 1,
    timeoutMs = 0,
    retryBackoffMs = 0,
    onJobUpdate = null,
    shouldCancel = null,
  } = options ?? {};

  if (!runner || typeof runner.run !== 'function') {
    throw new Error('executeRunJobQueue requires a runner with run().');
  }

  const queue = jobs.map((job) => ({
    ...job,
    maxAttempts: Math.max(1, Number(job.maxAttempts ?? maxAttempts ?? 1)),
  }));
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, queue.length || 1));
  let cursor = 0;

  async function nextJob() {
    const job = queue[cursor];
    cursor += 1;
    return job ?? null;
  }

  async function worker() {
    while (true) {
      const job = await nextJob();
      if (!job) return;
      await runJob(job, {
        runner,
        environment,
        timeoutMs,
        retryBackoffMs,
        onJobUpdate,
        shouldCancel,
      });
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    jobs: queue,
    completed: queue.filter((job) => job.status === 'completed'),
    failed: queue.filter((job) => job.status === 'failed'),
    canceled: queue.filter((job) => job.status === 'canceled'),
    results: queue.filter((job) => job.status === 'completed').map((job) => job.result),
  };
}

async function runJob(job, options) {
  const { runner, environment, timeoutMs, retryBackoffMs, onJobUpdate, shouldCancel } = options;

  while (!TERMINAL_STATES.has(job.status) && job.attempts < job.maxAttempts) {
    if (typeof shouldCancel === 'function' && await shouldCancel(job)) {
      updateJob(job, { status: 'canceled', finishedAt: new Date().toISOString() }, onJobUpdate);
      return job;
    }

    updateJob(job, {
      status: job.attempts > 0 ? 'retrying' : 'running',
      attempts: job.attempts + 1,
      startedAt: job.startedAt ?? new Date().toISOString(),
      error: null,
    }, onJobUpdate);

    try {
      const result = await runWithTimeout(
        () => runner.run({
          bundle: job.payload.bundle,
          mutation: job.payload.mutation ?? null,
          task: job.payload.task ?? null,
          environment,
        }),
        timeoutMs,
        job,
      );
      updateJob(job, {
        status: 'completed',
        result,
        finishedAt: new Date().toISOString(),
      }, onJobUpdate);
      return job;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const diagnostics = normalizeAdapterDiagnostics(error?.diagnostics, {
        jobId: job.id,
        retryAttempt: job.attempts,
        scenarioId: job.taskId ?? job.payload?.task?.id ?? '',
        mutationId: job.mutationId ?? '',
        failureClass: error?.failureClass ?? classifyAdapterError(error),
        rawErrorMessage: message,
        phase: error?.diagnostics?.phase ?? 'adapter_call',
      });
      const shouldRetry = job.attempts < job.maxAttempts && adapterFailureRetryable(diagnostics.failureClass);
      updateJob(job, {
        status: shouldRetry ? 'queued' : 'failed',
        error: message,
        diagnostics,
        finishedAt: shouldRetry ? null : new Date().toISOString(),
      }, onJobUpdate);
      if (shouldRetry) {
        await waitForRetryBackoff(retryBackoffMs, job);
      }
    }
  }

  return job;
}

async function waitForRetryBackoff(retryBackoffMs, job) {
  const delay = typeof retryBackoffMs === 'function'
    ? Number(retryBackoffMs(job))
    : Number(retryBackoffMs);
  if (!Number.isFinite(delay) || delay <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

async function runWithTimeout(fn, timeoutMs, job) {
  const limit = Number(timeoutMs);
  if (!Number.isFinite(limit) || limit <= 0) {
    return fn();
  }

  let timeout;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Run job ${job.id} timed out after ${limit}ms`));
        }, limit);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function updateJob(job, patch, onJobUpdate) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  if (typeof onJobUpdate === 'function') {
    onJobUpdate({ ...job, payload: undefined });
  }
}
