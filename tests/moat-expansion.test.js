import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { analyzeBundle, classifyRobustnessGap } from '../src/core/engine.js';
import { compileMcpManifest } from '../src/core/mcp.js';
import { listFailurePatterns } from '../src/reports/failure-patterns.js';

test('robustness gap bands classify release risk', () => {
  assert.equal(classifyRobustnessGap(5).id, 'stable');
  assert.equal(classifyRobustnessGap(18).id, 'brittle');
  assert.equal(classifyRobustnessGap(34).id, 'release_risk');
  assert.equal(classifyRobustnessGap(70).id, 'blocker');
});

test('analysis summary includes robustness gap band', () => {
  const analysis = analyzeBundle();

  assert.ok(analysis.summary.robustnessBand);
  assert.match(analysis.reportText, /Robustness Gap band/);
});

test('failure pattern library exposes named anti-patterns', () => {
  const patterns = listFailurePatterns();

  assert.ok(patterns.length >= 8);
  assert.ok(patterns.some((pattern) => pattern.id === 'prompt_phrasing_overfit'));
});

test('MCP manifest compiler creates a diagnosable HarnessAmp bundle', () => {
  const bundle = compileMcpManifest({
    name: 'Demo MCP',
    tools: [
      {
        name: 'create_refund',
        description: 'Create refund after approval.',
        inputSchema: {
          type: 'object',
          properties: { approval_id: { type: 'string' } },
          required: ['approval_id'],
        },
      },
    ],
  });
  const analysis = analyzeBundle(bundle);

  assert.equal(bundle.harness.tools[0].metadata.writeCapable, true);
  assert.equal(analysis.bundle.harness.domain, 'mcp-tool-server');
  assert.ok(analysis.pack.variants.length > 0);
});

test('Replit runner returns observations for a mutation pack', async () => {
  const child = spawn(process.execPath, ['examples/replit/custom-http-runner.mjs'], {
    env: { ...process.env, PORT_RUNNER: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const [chunk] = await once(child.stdout, 'data');
  const port = Number(String(chunk).match(/listening on (\d+)/)?.[1] ?? 0);

  try {
    assert.ok(port > 0);
    const response = await fetch(`http://127.0.0.1:${port}/harnessamp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pack: {
          analysis: {
            variants: [
              { id: 'prompt-visible', familyId: 'prompt', familyLabel: 'Prompt phrasing', tier: 'visible', estimatedLatencyMs: 300 },
              { id: 'prompt-holdout', familyId: 'prompt', familyLabel: 'Prompt phrasing', tier: 'holdout', estimatedLatencyMs: 400 },
            ],
          },
        },
      }),
    });
    const payload = await response.json();

    assert.equal(payload.observations.length, 2);
    assert.equal(payload.observations[0].variantId, 'prompt-visible');
  } finally {
    child.kill();
  }
});
