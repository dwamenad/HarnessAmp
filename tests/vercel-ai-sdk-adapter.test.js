import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  executeVercelAiSdkAdapterBenchmark,
  executeVercelAiSdkAgentRun,
  validateVercelAiSdkAdapterConfig,
} from '../src/adapters/vercel-ai-sdk.js';
import { createRunner } from '../src/adapters/runners.js';
import { createDemoBundle } from '../src/core/engine.js';
import { sanitizeDebugPayload } from '../src/adapters/contract.js';
import { decryptSecretValue, encryptSecretValue, maskSecretValue } from '../src/adapters/secrets.js';

const fixtureTarget = './examples/vercel-ai-sdk/app/api/chat/route.mjs';

test('secret utilities encrypt, mask, and redact provider keys', () => {
  process.env.HARNESSAMP_SECRET_ENCRYPTION_KEY = 'test-secret-encryption-key';
  const encrypted = encryptSecretValue('sk-test-secret-1234abcd');
  assert.notEqual(encrypted.ciphertext, 'sk-test-secret-1234abcd');
  assert.equal(decryptSecretValue(encrypted), 'sk-test-secret-1234abcd');
  assert.equal(maskSecretValue('sk-test-secret-1234abcd'), 'sk-...abcd');
  const redacted = sanitizeDebugPayload({
    authorization: 'Bearer sk-test-secret-1234abcd',
    message: 'failed with sk-ant-test-secret-xyz987',
  });
  assert.equal(redacted.authorization, '[redacted]');
  assert.doesNotMatch(redacted.message, /sk-ant-test-secret/);
});

test('secret encryption fails closed without encryption key', () => {
  const previous = process.env.HARNESSAMP_SECRET_ENCRYPTION_KEY;
  delete process.env.HARNESSAMP_SECRET_ENCRYPTION_KEY;
  assert.throws(() => encryptSecretValue('sk-test-secret'), /encryption is not configured/);
  if (previous) process.env.HARNESSAMP_SECRET_ENCRYPTION_KEY = previous;
});

test('Vercel AI SDK adapter config validation normalizes safe execution options', () => {
  const config = validateVercelAiSdkAdapterConfig({
    type: 'vercel-ai-sdk',
    target: fixtureTarget,
    modelLabel: 'fixture/model',
    timeoutMs: 1000,
    headers: {
      'x-test': 'yes',
      authorization: 'secret',
    },
  });

  assert.equal(config.type, 'vercel-ai-sdk');
  assert.equal(config.target, fixtureTarget);
  assert.equal(config.modelLabel, 'fixture/model');
  assert.equal(config.headers['x-test'], 'yes');
  assert.equal(config.headers.authorization, undefined);
});

test('Vercel AI SDK runner captures basic chat route output', async () => {
  const bundle = createDemoBundle();
  const runner = createRunner('vercel-ai-sdk', {
    target: fixtureTarget,
    modelLabel: 'fixture/chat',
  });
  const result = await runner.run({
    bundle,
    task: { id: 'chat-case', objective: 'answer a normal customer question' },
    environment: 'adapter-test',
  });

  assert.equal(result.environment, 'adapter-test');
  assert.equal(result.modelVersion, 'fixture/chat');
  assert.match(result.outputText, /Chat answer/);
  assert.equal(result.metadata.passed, true);
  assert.equal(result.metadata.adapterType, 'vercel-ai-sdk');
});

test('Vercel AI SDK adapter captures streaming response text and sources', async () => {
  const bundle = createDemoBundle();
  const result = await executeVercelAiSdkAgentRun({
    bundle,
    task: { id: 'stream-case', objective: 'please stream the answer' },
    config: {
      type: 'vercel-ai-sdk',
      target: fixtureTarget,
      modelLabel: 'fixture/stream',
    },
  });

  assert.equal(result.outputText, 'Streaming AI SDK response.');
  assert.equal(result.metadata.passed, true);
  assert.equal(result.metadata.citations.length, 0);
  assert.equal(result.metadata.sources[0].id, 'doc-1');
});

test('Vercel AI SDK adapter captures tool calls and tool results', async () => {
  const bundle = createDemoBundle();
  const result = await executeVercelAiSdkAgentRun({
    bundle,
    task: { id: 'tool-case', objective: 'use a tool for this answer' },
    config: {
      type: 'vercel-ai-sdk',
      target: fixtureTarget,
      modelLabel: 'fixture/tools',
    },
  });

  assert.equal(result.toolCalls[0].name, 'lookupPolicy');
  assert.equal(result.toolOutputs[0].toolName, 'lookupPolicy');
  assert.equal(result.metadata.score, 96);
});

test('Vercel AI SDK adapter captures structured output', async () => {
  const bundle = createDemoBundle();
  const result = await executeVercelAiSdkAgentRun({
    bundle,
    task: { id: 'structured-case', objective: 'return structured json' },
    config: {
      type: 'vercel-ai-sdk',
      target: fixtureTarget,
      structuredOutputSchema: 'fixture_answer',
      modelLabel: 'fixture/structured',
    },
  });

  assert.match(result.outputText, /Structured answer/);
  assert.equal(result.metadata.structuredOutput, true);
  assert.equal(result.metadata.citations[0].id, 'doc-structured-1');
});

test('Vercel AI SDK adapter reports timeout errors clearly', async () => {
  const bundle = createDemoBundle();
  const result = await executeVercelAiSdkAgentRun({
    bundle,
    task: { id: 'timeout-case', objective: 'timeout' },
    config: {
      type: 'vercel-ai-sdk',
      handler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return Response.json({ text: 'late' });
      },
      timeoutMs: 1,
    },
  });

  assert.equal(result.metadata.passed, false);
  assert.match(result.errors[0], /timed out/);
  assert.equal(result.metadata.failureClass, 'adapter_timeout');
  assert.equal(result.metadata.diagnostics.phase, 'adapter_call');
});

test('Vercel AI SDK adapter classifies HTTP 500 responses', async () => {
  const bundle = createDemoBundle();
  const result = await executeVercelAiSdkAgentRun({
    bundle,
    task: { id: 'http-error-case', objective: 'server error' },
    config: {
      type: 'vercel-ai-sdk',
      handler: async () => Response.json({ error: 'upstream failed' }, { status: 500 }),
    },
  });

  assert.equal(result.metadata.passed, false);
  assert.equal(result.metadata.failureClass, 'adapter_http_error');
  assert.equal(result.metadata.diagnostics.httpStatus, 500);
});

test('Vercel AI SDK adapter classifies empty responses as invalid', async () => {
  const bundle = createDemoBundle();
  const result = await executeVercelAiSdkAgentRun({
    bundle,
    task: { id: 'invalid-response-case', objective: 'empty response' },
    config: {
      type: 'vercel-ai-sdk',
      handler: async () => new Response('', { headers: { 'content-type': 'text/plain' } }),
    },
  });

  assert.equal(result.metadata.passed, false);
  assert.equal(result.metadata.failureClass, 'adapter_invalid_response');
  assert.equal(result.metadata.diagnostics.retryable, false);
});

test('Vercel AI SDK adapter benchmark execution emits observed HarnessAmp observations', async () => {
  const bundle = createDemoBundle();
  const result = await executeVercelAiSdkAdapterBenchmark(bundle, {
    type: 'vercel-ai-sdk',
    target: fixtureTarget,
    mode: 'sample',
  });

  assert.equal(result.adapter.type, 'vercel-ai-sdk');
  assert.ok(result.observations.length > 0);
  assert.ok(result.observations.every((observation) => observation.source === 'observed'));
  assert.ok(result.observations.every((observation) => observation.variantId));
});

test('Vercel AI SDK adapter can call an HTTP route URL target', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init = {}) => {
      assert.equal(url, 'http://localhost:3000/api/harnessamp/agent');
      const body = JSON.parse(init.body);
      assert.equal(body.metadata.adapter, 'vercel-ai-sdk');
      return Response.json({
        text: `Route URL answer for ${body.prompt}`,
        passed: true,
        score: 91,
      });
    };

    const result = await executeVercelAiSdkAgentRun({
      bundle: createDemoBundle(),
      task: { id: 'route-url-case', objective: 'call route url' },
      config: {
        type: 'vercel-ai-sdk',
        routeUrl: 'http://localhost:3000/api/harnessamp/agent',
      },
    });

    assert.match(result.outputText, /Route URL answer/);
    assert.equal(result.metadata.passed, true);
    assert.equal(result.metadata.diagnostics.target, 'http://localhost:3000/api/harnessamp/agent');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
