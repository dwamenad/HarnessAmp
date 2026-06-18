import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { ADAPTER_FAILURE_CLASSES } from '../src/adapters/contract.js';
import {
  buildDoctorScenarioRequest,
  validateAdapterError,
  validateObservationResponse,
  validatePreflightResponse,
  validateScenarioRequest,
} from '../src/adapters/harnessamp-contract.js';
import {
  dispatchLocalHttpTunnelJob,
  runLocalTunnelDoctor,
} from '../src/adapters/local-http-tunnel.js';

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

test('adapter contract validators accept valid adapter response', () => {
  assert.equal(validateObservationResponse({ observations: [] }).valid, true);
  assert.equal(validatePreflightResponse({ ok: true }).valid, true);
  assert.equal(validateScenarioRequest(buildDoctorScenarioRequest()).valid, true);
  assert.equal(validateAdapterError({ error: 'adapter_error', retryable: true }).valid, true);
});

test('adapter contract validators reject missing required response fields', () => {
  const validation = validateObservationResponse({ result: 'done' });
  assert.equal(validation.valid, false);
  assert.match(validation.issues.join(' '), /observations array/);
});

test('doctor reports non-JSON adapter response', async () => {
  const result = await runLocalTunnelDoctor({
    url: 'https://doctor.example.test/api/agent',
    resolver: publicResolver,
    fetchImpl: async (_url, init = {}) => {
      const body = JSON.parse(init.body);
      return body.preflight
        ? jsonResponse({ ok: true })
        : textResponse('not-json');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.checks.at(-1).failureClass, ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_INVALID_JSON);
});

test('doctor reports malformed JSON adapter response', async () => {
  const result = await runLocalTunnelDoctor({
    url: 'https://doctor.example.test/api/agent',
    resolver: publicResolver,
    fetchImpl: async (_url, init = {}) => {
      const body = JSON.parse(init.body);
      return body.preflight
        ? jsonResponse({ ok: true })
        : textResponse('{not-json');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.checks.at(-1).failureClass, ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_INVALID_JSON);
});

test('dispatch rejects missing run token cleanly', async () => {
  await assert.rejects(
    () => dispatchLocalHttpTunnelJob({
      job: doctorJob(),
      executionTarget: { endpointUrl: 'https://doctor.example.test/api/agent' },
      runToken: '',
      resolver: publicResolver,
      fetchImpl: async () => jsonResponse({ observations: [] }),
    }),
    (error) => error.failureClass === ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH,
  );
});

test('doctor reports wrong-token acceptance as actionable contract failure', async () => {
  const result = await runLocalTunnelDoctor({
    url: 'https://doctor.example.test/api/agent',
    resolver: publicResolver,
    fetchImpl: async (_url, init = {}) => {
      const body = JSON.parse(init.body);
      return body.preflight
        ? jsonResponse({ ok: true })
        : jsonResponse({ observations: [] });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.checks.at(-1).check, 'token');
  assert.match(result.checks.at(-1).action, /x-harnessamp-run-token/);
});

test('doctor reports adapter-thrown error response', async () => {
  const result = await runLocalTunnelDoctor({
    url: 'https://doctor.example.test/api/agent',
    resolver: publicResolver,
    fetchImpl: async (_url, init = {}) => {
      const body = JSON.parse(init.body);
      return body.preflight
        ? jsonResponse({ ok: true })
        : jsonResponse({ error: 'adapter_error', retryable: true }, { status: 500 });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.checks.at(-1).failureClass, ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_HTTP_ERROR);
});

test('doctor reports timeout', async () => {
  const result = await runLocalTunnelDoctor({
    url: 'https://doctor.example.test/api/agent',
    timeoutMs: 10,
    resolver: publicResolver,
    fetchImpl: async (_url, init = {}) => {
      const body = JSON.parse(init.body);
      return body.preflight ? jsonResponse({ ok: true }) : new Promise(() => {});
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.checks.at(-1).failureClass, ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_TIMEOUT);
});

test('doctor command succeeds with authenticated adapter contract', async () => {
  const preload = await writeDoctorPreload('success');
  const { stdout } = await execFileAsync('npm', ['run', 'harnessamp:doctor', '--', '--url', 'https://doctor.example.test/api/agent'], {
    cwd: repoRoot,
    env: { ...process.env, NODE_OPTIONS: `--import ${preload}` },
  });

  assert.match(stdout, /HarnessAmp adapter doctor: pass/);
  assert.doesNotMatch(stdout, /runToken|x-harnessamp-run-token:|secret/i);
});

test('doctor command failure prints actionable diagnostics', async () => {
  const preload = await writeDoctorPreload('failure');
  await assert.rejects(
    () => execFileAsync('npm', ['run', 'harnessamp:doctor', '--', '--url', 'https://doctor.example.test/api/agent'], {
      cwd: repoRoot,
      env: { ...process.env, NODE_OPTIONS: `--import ${preload}` },
    }),
    (error) => {
      assert.match(error.stdout, /HarnessAmp adapter doctor: fail/);
      assert.match(error.stdout, /action:/);
      assert.doesNotMatch(error.stdout, /runToken|x-harnessamp-run-token:/);
      return true;
    },
  );
});

function publicResolver() {
  return Promise.resolve([{ address: '203.0.113.42', family: 4 }]);
}

function jsonResponse(payload, options = {}) {
  return new Response(JSON.stringify(payload), {
    status: options.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(text, options = {}) {
  return new Response(text, {
    status: options.status ?? 200,
    headers: { 'content-type': options.contentType ?? 'text/plain' },
  });
}

function doctorJob() {
  return {
    id: 'doctor_job',
    attempts: 1,
    workerId: 'doctor-worker',
    payload: {
      profileId: 'doctor',
      presetId: 'contract',
      thresholds: {},
      pack: buildDoctorScenarioRequest().pack,
    },
  };
}

async function writeDoctorPreload(mode) {
  const dir = await mkdtemp(join(tmpdir(), 'harnessamp-doctor-'));
  const file = join(dir, `${mode}.mjs`);
  await writeFile(file, `
globalThis.__harnessAmpLocalTunnelDnsLookup = async () => [{ address: '203.0.113.42', family: 4 }];
let expectedToken = '';
globalThis.fetch = async (_url, init = {}) => {
  const body = JSON.parse(init.body);
  const token = init.headers['x-harnessamp-run-token'];
  if (${JSON.stringify(mode)} === 'failure') return new Response(JSON.stringify({ ready: false }), { status: 200, headers: { 'content-type': 'application/json' } });
  if (body.preflight) {
    expectedToken = token;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (token !== expectedToken) {
    return new Response(JSON.stringify({ error: 'invalid_run_token', retryable: false }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ observations: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
};
`, 'utf8');
  return file;
}
