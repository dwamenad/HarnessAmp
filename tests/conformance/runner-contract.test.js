import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createDemoBundle } from '../../src/core/engine.js';
import {
  AgentRunner,
  AgentFrameworkRunner,
  CrewWorkflowRunner,
  CustomHTTPRunner,
  GraphWorkflowRunner,
  MCPRunner,
  MockRunner,
  ModelSDKRunner,
  MultiAgentRunner,
  createRunner,
} from '../../src/adapters/runners.js';
import { listCliCommands } from '../../src/cli/index.js';

const REQUIRED_RUN_RESULT_FIELDS = [
  'runId',
  'harnessId',
  'harnessVersion',
  'agentVersion',
  'modelVersion',
  'mutationPackVersion',
  'mutationId',
  'mutationSeed',
  'runnerVersion',
  'evaluatorVersion',
  'timestamp',
  'environment',
  'toolMode',
  'taskId',
  'inputPrompt',
  'outputText',
  'toolCalls',
  'toolOutputs',
  'errors',
  'latencyMs',
  'tokenUsage',
  'metadata',
];

test('mock runner satisfies the AgentRunResult conformance shape', async () => {
  const bundle = createDemoBundle();
  const runner = createRunner('mock');
  const result = await runner.run({
    bundle,
    task: bundle.harness.scenarios[0],
    environment: 'conformance',
  });

  assert.ok(runner instanceof MockRunner);
  REQUIRED_RUN_RESULT_FIELDS.forEach((field) => {
    assert.ok(field in result, `missing ${field}`);
  });
  assert.equal(result.environment, 'conformance');
  assert.equal(result.toolMode, 'mock');
  assert.equal(Array.isArray(result.toolCalls), true);
  assert.equal(Array.isArray(result.toolOutputs), true);
  assert.equal(Array.isArray(result.errors), true);
  assert.equal(typeof result.metadata.passed, 'boolean');
});

test('future adapter classes are explicit AgentRunner placeholders', async () => {
  const placeholders = [
    ModelSDKRunner,
    AgentFrameworkRunner,
    GraphWorkflowRunner,
    CrewWorkflowRunner,
    MultiAgentRunner,
    MCPRunner,
  ];

  for (const Runner of placeholders) {
    const runner = new Runner();
    assert.ok(runner instanceof AgentRunner);
    await assert.rejects(() => runner.run({}), /must be implemented/);
  }
});

test('custom HTTP runner normalizes external runner responses', async () => {
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      passed: true,
      score: 91,
      outputText: `external ok for ${payload.task.id}`,
      latencyMs: 42,
      toolCalls: [{ name: 'lookup_customer', arguments: {} }],
    }));
  });
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    const bundle = createDemoBundle();
    const runner = createRunner('custom_http', {
      endpoint: `http://127.0.0.1:${address.port}`,
    });
    const result = await runner.run({
      bundle,
      task: bundle.harness.scenarios[0],
      environment: 'conformance',
    });

    assert.ok(runner instanceof CustomHTTPRunner);
    REQUIRED_RUN_RESULT_FIELDS.forEach((field) => {
      assert.ok(field in result, `missing ${field}`);
    });
    assert.equal(result.metadata.passed, true);
    assert.equal(result.metadata.score, 91);
    assert.equal(result.toolMode, 'live');
    assert.equal(result.outputText, `external ok for ${bundle.harness.scenarios[0].id}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('CLI manifest exposes the expected harness workflow commands', () => {
  const commandNames = listCliCommands().map((command) => command.name);

  assert.deepEqual(commandNames, ['validate', 'mutate', 'run', 'diagnose', 'report', 'worker', 'benchmark']);
});
