import assert from 'node:assert/strict';
import os from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import {
  bootstrapDevApiEnvironment,
  createDevApiServer,
  resolveApiRequest,
} from '../scripts/dev-api.mjs';

const ENV_KEYS = ['APP_BASE_URL', 'HARNESSAMP_DEV_AUTH'];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] == null) {
      delete process.env[key];
      continue;
    }
    process.env[key] = ORIGINAL_ENV[key];
  }
});

test('resolveApiRequest mirrors Vercel rewrite params', () => {
  const sessionRoute = resolveApiRequest('http://127.0.0.1:3000/api/session');
  assert.equal(sessionRoute?.name, 'auth');
  assert.equal(sessionRoute?.query.action, 'session');

  const jobsRoute = resolveApiRequest('http://127.0.0.1:3000/api/projects/project_123/jobs?foo=bar');
  assert.equal(jobsRoute?.name, 'projects');
  assert.equal(jobsRoute?.query.projectId, 'project_123');
  assert.equal(jobsRoute?.query.resource, 'jobs');
  assert.equal(jobsRoute?.query.foo, 'bar');

  const benchmarksRoute = resolveApiRequest('http://127.0.0.1:3000/api/benchmarks?projectId=project_123');
  assert.equal(benchmarksRoute?.name, 'benchmarks');
  assert.equal(benchmarksRoute?.query.projectId, 'project_123');

  const failuresRoute = resolveApiRequest('http://127.0.0.1:3000/api/failures?projectId=project_123&failureId=fail_123');
  assert.equal(failuresRoute?.name, 'failures');
  assert.equal(failuresRoute?.query.projectId, 'project_123');
  assert.equal(failuresRoute?.query.failureId, 'fail_123');
});

test('dev api server returns a seeded session when dev auth is enabled', async () => {
  delete process.env.APP_BASE_URL;
  delete process.env.HARNESSAMP_DEV_AUTH;
  bootstrapDevApiEnvironment({
    rootDir: join(os.tmpdir(), 'harnessamp-dev-api-test-empty'),
  });

  const server = createDevApiServer();
  await new Promise((resolveStart) => server.listen(0, '127.0.0.1', resolveStart));

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    const response = await fetch(`http://127.0.0.1:${address.port}/api/session`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.user.login, 'dev-user');
    assert.equal(process.env.HARNESSAMP_DEV_AUTH, '1');
  } finally {
    await new Promise((resolveClose, rejectClose) => {
      server.close((error) => {
        if (error) {
          rejectClose(error);
          return;
        }
        resolveClose();
      });
    });
  }
});
