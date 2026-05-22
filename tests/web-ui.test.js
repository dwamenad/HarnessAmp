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
    'workspace-select',
    'project-select',
    'runner-select',
  ].forEach((id) => assert.match(source, new RegExp(`id="${id}"`)));
});

test('web report exposes export and persistence actions', () => {
  [
    'download-report-json',
    'download-pack',
    'copy-ci',
    'save-report',
    'save-server-report',
    'load-server-report',
    'action-feedback',
    'copy-report-link',
    'report-path',
    'case-results',
  ].forEach((id) => assert.match(source, new RegExp(`id="${id}"`)));
});

test('web app splits the product landing page from the operator surface', () => {
  [
    'schema-status-list',
    'benchmark-contract-panel',
    'benchmark-case-list',
    'renderHomeSurface',
    'renderAppSurface',
    'renderLandingPathsSection',
    'renderDocsLandingSpotlight',
    'renderDocsExperience',
    'renderDocsOverview',
    'rawMarkdownDocs',
    '/report/',
    'Launch the app',
    'Manage saved reports and connected runners.',
    'report-details',
    'validateHarnessBundle',
    'validateBenchmarkPack',
    'validateRiskProfile',
    'validateDiagnosticSnapshot',
    'runHttpRunner',
    'browser-mvp-benchmark',
  ].forEach((text) => assert.match(source, new RegExp(text)));
});

test('web demo persists workspace and report snapshots locally', () => {
  assert.match(source, /harnessamp\.webDemoState/);
  assert.match(source, /harnessamp\.savedReports/);
  assert.match(source, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(source, /localStorage\.setItem\(REPORT_STORAGE_KEY/);
});
