import assert from 'node:assert/strict';
import test from 'node:test';

import { runLocalApiWorker } from '../src/core/local-worker.js';

test('local API worker polls queued jobs and runs them once', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/api/jobs?')) {
      return jsonResponse({
        jobs: [
          { id: 'job_001', status: 'queued' },
          { id: 'job_002', status: 'retrying' },
        ],
      });
    }
    return jsonResponse({
      id: url.pathname.split('/').pop(),
      status: 'completed',
      reportId: 'report_worker_test',
    });
  };

  const result = await runLocalApiWorker({
    apiUrl: 'http://127.0.0.1:3000',
    projectId: 'proj_worker',
    workerId: 'worker-test',
    workerToken: 'worker-secret',
    once: true,
    fetchImpl,
  });

  assert.deepEqual(result, { processed: 2, polls: 1 });
  assert.equal(calls[0].url, 'http://127.0.0.1:3000/api/jobs?projectId=proj_worker&status=queued%2Cretrying');
  assert.equal(calls[0].init.headers.authorization, 'Bearer worker-secret');
  assert.equal(calls[1].url, 'http://127.0.0.1:3000/api/jobs/job_001?action=run');
  assert.equal(calls[1].init.headers.authorization, 'Bearer worker-secret');
  assert.equal(JSON.parse(calls[1].init.body).projectId, 'proj_worker');
  assert.equal(JSON.parse(calls[1].init.body).workerId, 'worker-test');
  assert.equal(calls[2].url, 'http://127.0.0.1:3000/api/jobs/job_002?action=run');
});

test('local API worker can stop after max jobs', async () => {
  const runIds = [];
  const fetchImpl = async (url) => {
    if (String(url).includes('/api/jobs?')) {
      return jsonResponse({
        jobs: [
          { id: 'job_a', status: 'queued' },
          { id: 'job_b', status: 'queued' },
        ],
      });
    }
    runIds.push(url.pathname.split('/').pop());
    return jsonResponse({ id: runIds.at(-1), status: 'completed' });
  };

  const result = await runLocalApiWorker({
    projectId: 'proj_worker',
    once: true,
    maxJobs: 1,
    fetchImpl,
  });

  assert.deepEqual(result, { processed: 1, polls: 1 });
  assert.deepEqual(runIds, ['job_a']);
});

test('local API worker requires a project id', async () => {
  await assert.rejects(
    () => runLocalApiWorker({ once: true, fetchImpl: async () => jsonResponse({ jobs: [] }) }),
    /--project-id/,
  );
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}
