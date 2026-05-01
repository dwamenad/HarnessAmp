import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('web demo exposes production demo controls', () => {
  [
    'bundle-preset-select',
    'profile-select',
    'intensity-select',
    'custom-toggle',
    'bundle-file',
    'runs-file',
    'runner-endpoint',
    'run-http-runner',
    'min-overall-score',
    'min-holdout-pass',
    'max-gap',
  ].forEach((id) => assert.match(source, new RegExp(`id="${id}"`)));
});

test('web report exposes export and persistence actions', () => {
  [
    'download-report-json',
    'download-pack',
    'copy-ci',
    'save-report',
    'report-id',
    'report-saved',
    'action-feedback',
  ].forEach((id) => assert.match(source, new RegExp(`id="${id}"`)));
});

test('web demo includes validation, docs, runner, and deploy sections', () => {
  [
    'schema-status-list',
    'benchmark-contract-panel',
    'benchmark-case-list',
    'Runner contract',
    'Docs /',
    'Static hosting ready',
    'validateHarnessBundle',
    'validateBenchmarkPack',
    'validateRiskProfile',
    'validateDiagnosticSnapshot',
    'runHttpRunner',
  ].forEach((text) => assert.match(source, new RegExp(text)));
});

test('web demo persists workspace and report snapshots locally', () => {
  assert.match(source, /harnessamp\.webDemoState/);
  assert.match(source, /harnessamp\.savedReports/);
  assert.match(source, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(source, /localStorage\.setItem\(REPORT_STORAGE_KEY/);
});
