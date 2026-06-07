import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const packCatalogSource = await readFile(new URL('../src/v2/domain-pack-catalog.js', import.meta.url), 'utf8');

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
    'project-command-center',
    'runner-select',
    'job-state',
    'job-observability',
    'job-timeline',
    'cancel-active-job',
    'benchmark-select',
    'benchmark-version-select',
    'promotion-candidate-select',
    'create-benchmark-draft',
    'approve-benchmark-version',
    'propose-golden-case',
    'promote-golden-case',
    'save-benchmark-edits',
    'record-benchmark-review',
    'assign-benchmark-reviewer',
    'benchmark-review-decision',
    'benchmark-reviewer-id',
    'benchmark-review-comments',
    'benchmark-edit-project',
    'benchmark-edit-description',
    'benchmark-edit-mission',
    'benchmark-edit-must',
    'benchmark-edit-must-not',
    'benchmark-edit-success-signals',
    'benchmark-edit-thresholds',
    'benchmark-edit-tags',
    'benchmark-edit-metadata',
    'benchmark-edit-cases',
    'benchmark-edit-tools',
    'benchmark-edit-evidence-sources',
    'benchmark-edit-evidence-links',
    'benchmark-version-diff',
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
    'failure-corpus-summary',
    'report-comparison',
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
    'Project command center',
    'Operational focus',
    'Latest gate',
    'Review queue',
    'commandCenterNextAction',
    'renderProjectCommandCenter',
    'report-details',
    'validateHarnessBundle',
    'validateBenchmarkPack',
    'validateRiskProfile',
    'validateDiagnosticSnapshot',
    'benchmarkReadiness',
    'renderBenchmarkLifecycleControls',
    'renderBenchmarkVersionDiff',
    'renderBenchmarkEditFields',
    'recordBenchmarkReviewDecision',
    'assignBenchmarkReviewerFromConsole',
    'saveBenchmarkEditsAsDraft',
    'createBenchmarkDraftFromActivePack',
    '/api/benchmarks',
    'Review readiness',
    'Benchmark truth',
    'runHttpRunner',
    'browser-mvp-benchmark',
    'renderJobObservability',
    'Worker',
    'Retry schedule',
    'Error history',
  ].forEach((text) => assert.match(source, new RegExp(text)));
});

test('web demo persists workspace and report snapshots locally', () => {
  assert.match(source, /harnessamp\.webDemoState/);
  assert.match(source, /harnessamp\.savedReports/);
  assert.match(source, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(source, /localStorage\.setItem\(REPORT_STORAGE_KEY/);
});

test('saas console persists harnesses and exposes smoke-test controls', () => {
  [
    'harnessamp.consoleState',
    'renderSaasConsole',
    'Sign in with GitHub',
    'authStartHref()',
    'logout-button',
    'console-harness-form',
    'console-harness-name',
    'console-harness-project',
    'console-harness-endpoint',
    'console-save-harness',
    'console-run-smoke',
    'console-smoke-panel',
    'validateHarnessObservationResponse',
    'runConsoleHarnessSmokeTest',
    'persistConsoleState',
  ].forEach((text) => assert.match(source, new RegExp(text)));
});

test('saas failure page exposes actionable workflow controls', () => {
  [
    'failure-assign-owner',
    'failure-rerun-case',
    'failure-export',
    'failure-severity',
    'failure-action-status',
    'failure-action-title',
    'failure-action-message',
    'failure-action-log',
    'data-failure-action',
    'bindFailureWorkflowEvents',
    'handleFailureAction',
    'hydrateFailureWorkflow',
    'persistFailureWorkflowAction',
    'applyFailureWorkflow',
    'renderFailureWorkflowLog',
    '/api/failures\\?projectId=',
    'appendFailureWorkflowLog',
    'updateFailureSeverity',
    'failurePayload',
    'Task drafted',
    'False-positive review',
    'Severity changed',
    'Regression pinned',
    'Exported failure evidence',
  ].forEach((text) => assert.match(source, new RegExp(text)));
});

test('saas reports page exposes working export controls', () => {
  [
    'data-report-export',
    'report-export-status',
    'bindReportExportEvents',
    'exportSaasReport',
    'reportPayload',
    'reportCsv',
    'reportMarkdown',
    'reportPrintHtml',
    'Downloaded report CSV',
    'Downloaded print-ready PDF report',
  ].forEach((text) => assert.match(source, new RegExp(text)));
});

test('saas pack catalog exposes CustomerCareGuard and LegalGuard manifests', () => {
  [
    'CustomerCareGuard',
    'LegalGuard',
    'refund_authority',
    'jurisdiction_discipline',
    'deadline_safety',
    'policy_source_fidelity',
    'unauthorized_legal_advice',
    'sourceHierarchy',
    'authorityModel',
    'generatedMatrix',
  ].forEach((text) => assert.match(packCatalogSource, new RegExp(text)));
  assert.match(source, /catalogCardRows/);
  assert.match(source, /Generated scale/);
});
