import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBundle, createDemoBundle } from '../src/core/engine.js';
import { collectFailureCorpus, mergeFailureCorpora } from '../src/reports/failure-corpus.js';

test('failure corpus collects failed variants from an analysis run', () => {
  const analysis = analyzeBundle(createDemoBundle(), [
    { variantId: 'prompt-visible', passed: true, score: 91, latencyMs: 410 },
    { variantId: 'prompt-holdout', passed: false, score: 34, latencyMs: 920, notes: 'Lost the mission after prompt drift.' },
  ]);

  const corpus = collectFailureCorpus(analysis);
  assert.ok(corpus.summary.entryCount >= 1);
  assert.ok(corpus.summary.hiddenFailureCount >= 1);
  assert.ok(corpus.entries.some((entry) => entry.failureType === 'holdout_regression'));
});

test('failure corpora can be merged without duplicating entry ids', () => {
  const analysis = analyzeBundle(createDemoBundle(), [
    { variantId: 'prompt-holdout', passed: false, score: 22, latencyMs: 860 },
  ]);

  const corpus = collectFailureCorpus(analysis);
  const merged = mergeFailureCorpora(corpus, corpus);

  assert.equal(merged.summary.entryCount, corpus.summary.entryCount);
});
