import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../src/console/app-shell.js', import.meta.url), 'utf8');
const routerSource = await readFile(new URL('../src/console/router.js', import.meta.url), 'utf8');
const labelsSource = await readFile(new URL('../src/console/lib/labels.js', import.meta.url), 'utf8');
const dashboardRouteSource = await readFile(new URL('../src/console/routes/dashboard.js', import.meta.url), 'utf8');
const runsRouteSource = await readFile(new URL('../src/console/routes/runs.js', import.meta.url), 'utf8');
const targetsRouteSource = await readFile(new URL('../src/console/routes/targets.js', import.meta.url), 'utf8');
const reportsRouteSource = await readFile(new URL('../src/console/routes/reports.js', import.meta.url), 'utf8');
const failuresRouteSource = await readFile(new URL('../src/console/routes/failures.js', import.meta.url), 'utf8');
const orgRouteSource = await readFile(new URL('../src/console/routes/org.js', import.meta.url), 'utf8');
const publicDemoRouteSource = await readFile(new URL('../src/console/routes/public-demo.js', import.meta.url), 'utf8');
const packCatalogSource = await readFile(new URL('../src/v2/domain-pack-catalog.js', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const reportExportSource = await readFile(new URL('../src/console/report-export.js', import.meta.url), 'utf8');
const harness1DocSource = await readFile(new URL('../docs/adapters/harness-1.md', import.meta.url), 'utf8');
const harness1RequestSource = await readFile(new URL('../examples/harness1-adapter/request.json', import.meta.url), 'utf8');
const harness1ResponseSource = await readFile(new URL('../examples/harness1-adapter/response.json', import.meta.url), 'utf8');

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
    'validate-endpoint',
    'endpoint-validation-panel',
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
  [
    'Release decision',
    'Create CI gate',
    'Compare latest run',
    'reportTableRows',
    'localRunReportRows',
    'localRunReportId',
    'latestCompletedLocalRun',
    'dashboardMetricsForRun',
    'latestCommandCenterReport',
    'localRunCommandCenterReport',
    'updateHarnessLastRun',
    'harnessId',
    'reportEvidenceLabelForRun',
    'ensureRunnerObservationCaptured',
    'shouldCaptureRunnerObservation',
    'syncRunReportStateFromConsole',
    'runReportState',
    'Print HTML',
  ].forEach((text) => assert.match(source, new RegExp(text)));
  [
    'Failure Evidence',
    'localRunReportPayload',
    'RetrievalGuard Source Fidelity',
    'Remediation Checklist',
    'Regression Plan',
    'Release Gate',
    'failureEvidenceForReport',
    'retrievalEvidenceForReport',
    'gateForReport',
    'auditTrailForReport',
    'runner-observation',
    'contract-smoke-preview',
  ].forEach((text) => assert.match(reportExportSource, new RegExp(text)));
});

test('web app splits the product landing page from the operator surface', () => {
  [
    'schema-status-list',
    'benchmark-contract-panel',
    'benchmark-case-list',
    'renderHomeSurface',
    'renderAppSurface',
    'renderSandboxHandoff',
    'Ready to operate real runs?',
    'demo-advanced',
    'Advanced setup',
    'advancedSetupStatus',
    'Default thresholds:',
    'renderDocsLandingSpotlight',
    'renderDocsExperience',
    'renderDocsOverview',
    'rawMarkdownDocs',
    '/report/',
    'href="/dashboard"',
    '>Open console</a>',
    'View seeded demo',
    'Run sample demo',
    'Product preview',
    'Validate real AI agents before release.',
    'Run benchmark packs against the agent you actually operate',
    'Connect the agent you operate.',
    'Sample data first. Real execution when connected.',
    'Adapter contract kit',
    'Execution Targets',
    'renderExecutionTargets',
    'executionTargetRegistryRows',
    'executionTargetTerms',
    'readinessLabels',
    'buildProductionEvidence',
    'productionEvidenceForDashboard',
    'renderTargetReadinessSnapshot',
    'targetReliabilityForRegistryTarget',
    'readinessStatusForTarget',
    'target-card__readiness',
    'target-registry',
    'Registered runner',
    'Vercel AI SDK route',
    'Hosted BYOK unavailable',
    'Local tunnel doctor',
    'Validate endpoint',
    'Target readiness',
    'contract version supported',
    'Expired or completed tunnels are not reusable.',
    'Demo vs real execution',
    'Worker-backed run lifecycle',
    'Reports that explain the gate.',
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
    'Release decision',
    'Release gate status',
    'Failure triage',
    'ha-triage-list',
    'categorized blockers',
    'Historical comparison',
    'Target reliability',
    'lifecycleDisplayLabel',
    'Release blocked',
    'Block release',
    'Review critical failures',
    'renderDashboardNextAction',
    'Top blocker',
    'runLifecycleLabel',
    'ha-run-table',
    'failed quality gate',
    'Release gate configuration',
    'Release gate policy editor',
    'Harness-1 example adapter',
    '/docs/adapters/harness-1',
    'Environment separation',
    'ha-skip-link',
    'Governance ownership',
    "BYOK', 'gated",
    'Hosted BYOK \\(gated\\)',
  ].forEach((text) => assert.match(source, new RegExp(text)));
  [
    'Sample workspace',
    'Connected project',
    'Production run',
    'Sample data',
    'Real execution',
    'Healthy',
    'Needs validation',
    'Recently failing',
    'Unstable',
    'Ephemeral',
    'Contract mismatch',
  ].forEach((text) => assert.match(labelsSource, new RegExp(text)));
  [
    'Launch the app',
    'Operational states',
    'Loading and error states',
    'renderRouteStatePanels',
  ].forEach((text) => assert.doesNotMatch(source, new RegExp(text)));
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
    'console-save-gate',
    'copy-smoke-payload',
    'customer care',
    'legal',
    'knowledge / RAG',
    'retrieval agent',
    'search harness',
    'inferHarnessDomain',
    'Expected runner contract',
    'Run a passing smoke test before saving this harness.',
    'Endpoint not compatible yet',
    'isSmokeReadyForDraft',
    'harnessDraftSignature',
    'endpointUrlIsValid',
    'console-save-harness',
    'console-run-smoke',
    'console-smoke-panel',
    'ha-table-wrap',
    'ha-harness-table',
    'validateHarnessObservationResponse',
    'runConsoleHarnessSmokeTest',
    'runHarnessSmokeProbe',
    '/api/harness-smoke',
    'The endpoint route was not found',
    'persistConsoleState',
  ].forEach((text) => assert.match(source, new RegExp(text)));
});

test('saas failure page exposes actionable workflow controls', () => {
  [
    'renderSaasFailuresList',
    'failure-search',
    'failure-filter-severity',
    'failure-filter-status',
    'failure-filter-owner',
    'failure-saved-view-select',
    'failure-save-view',
    'failure-clear-filters',
    'failure-assign-owner',
    'failure-rerun-case',
    'failure-export',
    'failure-owner-select',
    'failure-severity-select',
    'failure-regression-suite-select',
    'failure-comment',
    'copy-fix-checklist',
    'failure-severity',
    'failure-action-status',
    'failure-action-title',
    'failure-action-message',
    'failure-action-log',
    'data-failure-action',
    'Regression suite',
    'Auditability',
    'Pin reproducible evidence',
    'bindFailureWorkflowEvents',
    'handleFailureAction',
    'hydrateFailureWorkflow',
    'persistFailureWorkflowAction',
    'applyFailureWorkflow',
    'renderFailureWorkflowLog',
    'renderFailureAuditTrail',
    'failureRowWithWorkflow',
    'filteredFailures',
    'updateFailureFilter',
    'applySavedFailureView',
    'saveCurrentFailureView',
    'defaultSavedFailureViews',
    'clearFailureFilters',
    'failureFixGuidance',
    'copyFailureFixChecklist',
    'pinFailureToRegressionSuite',
    'hydrateRegressionSuites',
    'persistRegressionSuitePin',
    'mergeRegressionSuitesFromServer',
    'regressionSuitesWithFailures',
    'renderRegressionSuiteCard',
    'defaultRegressionSuites',
    '/api/failures\\?projectId=',
    'resource=regression-suites',
    'comment: workflow.comment',
    'appendFailureWorkflowLog',
    'updateFailureSeverity',
    'failurePayload',
    'Task drafted',
    'False positive resolved',
    'Severity changed',
    'Regression pinned',
    'Release blocker suite',
    'Suggested control fix',
    'Exported failure evidence',
  ].forEach((text) => assert.match(source, new RegExp(text)));
});

test('saas start run supports end-to-end queued run flow', () => {
  [
    'run-config-form',
    'run-workflow',
    'Benchmark',
    'Execution target',
    'Validate',
    'Start run',
    'run-target-heading',
    'target-choice-grid',
    'renderRunExecutionTargetStep',
    'renderRunTargetReadiness',
    'run-harness-select',
    'run-benchmark-select',
    'run-agent-version',
    'run-pack-select',
    'run-tier-select',
    'run-fail-condition',
    'renderRunModeControl',
    'renderPreflightChecklist',
    'renderExpectedArtifacts',
    'runPreflightItems',
    'updateRunMode',
    'BenchmarkResult',
    'Full benchmark',
    'CI gate',
    'run-launch-state',
    'renderLaunchStateCallout',
    'runLaunchState',
    'Start worker run',
    'Start sample preview',
    'Validate the selected execution target before launch.',
    'Local tunnel targets must use the public HTTPS forwarding URL.',
    'canValidateExecutionTarget',
    'hostedByokLaunchReady',
    'isHttpsUrl',
    'renderBenchmarkAuthority',
    'renderBenchmarkContents',
    'renderGatePreview',
    'renderHarnessReadiness',
    'runEligibilityForBenchmark',
    'Release-gate eligible',
    'Sample run',
    'read-only registry',
    'copy-benchmark-slug',
    'start-configured-run',
    'bindRunExecutionEvents',
    'startConfiguredRun',
    'createLocalRunRecord',
    'updateRunBenchmark',
    'scheduleActiveRunProgression',
    'run-live-status',
    'failure queue',
    '/api/projects/${encodeURIComponent(state.selectedProjectId)}/jobs',
    'window.location.href = `/runs/${encodeURIComponent(run.id)}`',
    'window.location.href = `/runs/${encodeURIComponent(updatedCurrent.id)}/summary`',
  ].forEach((text) => assert.match(source, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
});

test('saas reports page exposes working export controls', () => {
  [
    'renderReportsTable',
    'ha-report-table',
    'reportExportDetail',
    'Browser-ready review copy',
    'data-report-export',
    'report-export-status',
    'bindReportExportEvents',
    'exportSaasReport',
    'reportPayload',
    'reportCsv',
    'reportMarkdown',
    'reportPrintHtml',
    'Downloaded report CSV',
    'Downloaded Print HTML report',
    'safeValidationMessage',
    'Bearer \\[redacted\\]',
    '\\[redacted-api-key\\]',
    'Benchmark',
    'Seeded sample rows stay labeled',
  ].forEach((text) => assert.match(source, new RegExp(text)));
});

test('saas pack catalog exposes RetrievalGuard, CustomerCareGuard, and LegalGuard manifests', () => {
  [
    'RetrievalGuard',
    'CustomerCareGuard',
    'LegalGuard',
    'citation_fidelity',
    'tool_failure_transparency',
    'refund_authority',
    'jurisdiction_discipline',
    'deadline_safety',
    'policy_source_fidelity',
    'unauthorized_legal_advice',
    'sourceHierarchy',
    'authorityModel',
    'generatedMatrix',
    'evaluationModel',
    'fixture-backed expected behavior',
    'qrel-backed evidence fixtures',
    'generated provenance',
  ].forEach((text) => assert.match(packCatalogSource, new RegExp(text)));
  assert.match(source, /catalogCardRows/);
  assert.match(source, /Generated scale/);
  assert.match(source, /Evaluation model/);
  assert.match(source, /Fixture-backed/);
  assert.match(source, /Catalog only/);
  assert.match(source, /Roadmap only/);
});

test('saas console exposes strengthened operator controls', () => {
  const consoleRouteSources = [source, routerSource, orgRouteSource, runsRouteSource, dashboardRouteSource].join('\n');
  [
    'renderSaasPackDetail',
    'packContractNames',
    'compactPackDescription',
    'compactEvaluationModel',
    'compactScaleText',
    'Fixture coverage',
    'Recent run history',
    'Known regressions',
    'compare-baseline-run',
    'compare-latest-run',
    'selectedRunComparison',
    'latestBenchmarkComparison',
    'Benchmark result baseline',
    'Pack metric changes',
    'policy-block-critical',
    'policy-min-score',
    'policy-max-gap',
    'releasePolicyDecisionLabel',
    'retrievalguard-smoke',
    '--benchmark retrievalguard-smoke',
    'Deterministic CI output',
    'harnessamp.ci.v0.1',
    'CI exit codes',
    'renderEnvironmentOverview',
    'production blocking',
    'renderOrgOverview',
    'renderOrgMembers',
    'renderOrgUsage',
    'renderOrgBilling',
    'Project secrets',
    'Raw values',
    'renderRunUsageEstimate',
    'Estimated usage',
    '/org/members',
    '/org/usage',
    '/org/billing',
    'organization-select',
  ].forEach((text) => assert.match(consoleRouteSources, new RegExp(text)));
});

test('saas sidebar nests organization administration', () => {
  assert.match(routerSource, /export const saasNav = \[/);
  assert.match(routerSource, /export const organizationNav = \[/);
  assert.match(source, /organizationNavCollapsed: true/);
  assert.match(source, /resolveRoute\(pathname/);
  assert.match(labelsSource, /workspaceModeLabels/);
  assert.match(labelsSource, /Sample workspace/);
  assert.match(labelsSource, /Production run/);
  assert.match(source, /renderSaasNavGroup\(route, 'Organization', 'OG', '\/org', organizationNav\)/);
  assert.match(source, /organization-nav-toggle/);
  assert.match(source, /aria-expanded="\$\{collapsed \? 'false' : 'true'\}"/);
  assert.match(source, /const childItems = \[\[href, 'Overview', icon\], \.\.\.items\]/);
  assert.match(source, /ha-nav-sub/);
  assert.match(source, /organization-nav-sub/);
  assert.match(routerSource, /\['\/org\/members', 'Members', 'MB'\]/);
  assert.match(routerSource, /\['\/org\/usage', 'Usage', 'US'\]/);
  assert.match(routerSource, /\['\/org\/billing', 'Billing', 'BL'\]/);
  assert.doesNotMatch(routerSource, /\['\/team', 'Team', 'TM'\]/);
  assert.match(routerSource, /'\/team': 'Members'/);
  assert.match(source, /state\.organizationNavCollapsed = !state\.organizationNavCollapsed/);
  assert.doesNotMatch(routerSource, /\['\/usage', 'Usage', 'UB'\]/);
  assert.match(routerSource, /return '\/org\/usage'/);
});

test('console app shell lazy-loads route modules from a small bootstrap', () => {
  assert.match(mainSource, /import\('\.\/console\/app-shell\.js'\)/);
  assert.match(mainSource, /renderBootstrapLoading/);
  assert.match(mainSource, /renderBootstrapError/);
  assert.match(source, /routeModuleLoaders/);
  assert.match(source, /import\('\.\/routes\/dashboard\.js'\)/);
  assert.match(source, /import\('\.\/routes\/runs\.js'\)/);
  assert.match(source, /import\('\.\/routes\/targets\.js'\)/);
  assert.match(source, /import\('\.\/routes\/reports\.js'\)/);
  assert.match(source, /import\('\.\/routes\/failures\.js'\)/);
  assert.match(source, /import\('\.\/routes\/org\.js'\)/);
  assert.match(source, /renderRouteLoadingState/);
  assert.match(source, /renderRouteErrorState/);
  assert.match(dashboardRouteSource, /renderSaasDashboard/);
  assert.match(runsRouteSource, /renderSaasNewRun/);
  assert.match(targetsRouteSource, /renderExecutionTargets/);
  assert.match(reportsRouteSource, /renderSaasReports/);
  assert.match(failuresRouteSource, /renderSaasFailuresList/);
  assert.match(orgRouteSource, /route\.pathname === '\/team'/);
  assert.match(publicDemoRouteSource, /renderHomeSurface/);
});

test('saas console includes keyboard and motion accessibility styles', () => {
  [
    'focus-visible',
    'ha-skip-link',
    'prefers-reduced-motion',
    'ha-env-grid',
    'ha-audit-trail',
    'ha-policy-form',
    'ha-launch-state',
    'ha-triage-list',
    'ha-nav-group',
    'ha-nav-sub',
    'is-section-active',
    'is-collapsed',
    'ha-nav-group__chevron',
  ].forEach((text) => assert.match(styleSource, new RegExp(text)));
});

test('Harness-1 adapter docs map local search harnesses to RetrievalGuard', () => {
  [
    'Harness-1 Search Adapter',
    'POST /harnessamp',
    'npm run harness1:adapter',
    'HARNESS1_EVAL_COMMAND',
    'RetrievalGuard',
    'local Harness-1 vLLM server',
    'final_answer',
    'tool_calls',
    'metadata',
    'trajectory_recall',
    'precision',
    'pat-jj/harness-1',
  ].forEach((text) => assert.match(harness1DocSource, new RegExp(text)));
  assert.match(harness1RequestSource, /retrieval_contradictory_evidence_001/);
  assert.match(harness1ResponseSource, /curated_evidence/);
  assert.match(harness1ResponseSource, /tool_calls/);
  assert.match(harness1ResponseSource, /retrievalMetrics/);
});
