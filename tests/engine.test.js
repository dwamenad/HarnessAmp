import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBundle, createDemoBundle } from '../src/engine.js';

test('demo bundle generates a stable analysis', () => {
  const analysis = analyzeBundle(createDemoBundle());

  assert.ok(analysis.summary.overallScore >= 0);
  assert.ok(analysis.summary.overallScore <= 100);
  assert.equal(analysis.familyStats.length, 6);
  assert.equal(analysis.pack.visibleVariants.length, 6);
  assert.equal(analysis.pack.holdoutVariants.length, 6);
  assert.ok(analysis.reportText.includes('HarnessAmp report'));
});

test('observed runs override the simulated outcomes', () => {
  const bundle = createDemoBundle();
  const analysis = analyzeBundle(
    bundle,
    [
      { variantId: 'prompt-visible', passed: true, score: 100, latencyMs: 500 },
      { variantId: 'prompt-holdout', passed: true, score: 100, latencyMs: 500 },
      { variantId: 'tools-visible', passed: true, score: 100, latencyMs: 500 },
      { variantId: 'tools-holdout', passed: true, score: 100, latencyMs: 500 },
      { variantId: 'schema-visible', passed: true, score: 100, latencyMs: 500 },
      { variantId: 'schema-holdout', passed: true, score: 100, latencyMs: 500 },
      { variantId: 'timing-visible', passed: true, score: 100, latencyMs: 500 },
      { variantId: 'timing-holdout', passed: true, score: 100, latencyMs: 500 },
      { variantId: 'scenarios-visible', passed: true, score: 100, latencyMs: 500 },
      { variantId: 'scenarios-holdout', passed: true, score: 100, latencyMs: 500 },
      { variantId: 'envelope-visible', passed: true, score: 100, latencyMs: 500 },
      { variantId: 'envelope-holdout', passed: true, score: 100, latencyMs: 500 },
    ],
  );

  assert.equal(analysis.summary.modeLabel, 'observed');
  assert.ok(analysis.summary.overallScore >= 95);
});

