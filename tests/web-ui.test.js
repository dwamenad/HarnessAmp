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
const changesRouteSource = await readFile(new URL('../src/console/routes/changes.js', import.meta.url), 'utf8');
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
    'Agent-tool contract failures found',
    'failureIntelligence',
    'classifiedFailures',
    'failureEvidenceForReport',
    'retrievalEvidenceForReport',
    'gateForReport',
    'auditTrailForReport',
    'runner-observation',
    'contract-smoke-preview',
  ].forEach((text) => assert.match(reportExportSource, new RegExp(text)));
});

test('web app exposes generic agent harness target surfaces', () => {
  [
    'Agent Harness Target',
    'generic-agent-harness',
    'hermes-fixture',
    'openclaw-fixture',
    'agentHarnessTargetSelected',
    'agentHarnessExecutionTargetPayload',
    'agentHarnessTaskForDraft',
    'fixtureRunForTarget',
    'agent-harness-fixture',
    'Ready to create agent harness fixture',
    'renderAgentHarnessPolicyPreview',
    'Agent harness policy snapshot',
    'Memory policy',
    'Permission policy',
    'Workspace policy',
    'PersonalAgentGuard',
    'HarnessRuntimeGuard',
  ].forEach((text) => assert.match(source, new RegExp(text)));
  [
    'Generic Agent Harness',
    'Hermes-style fixture',
    'OpenClaw-style fixture',
  ].forEach((text) => assert.match(labelsSource, new RegExp(text)));
  [
    'PersonalAgentGuard',
    'HarnessRuntimeGuard',
    'unsafe_email_deletion',
    'memory_scope_violation',
  ].forEach((text) => assert.match(packCatalogSource, new RegExp(text)));
  [
    'Agent harness evidence',
    'agent_harness_target',
    'memory_policy',
    'permission_policy',
    'workspace_policy',
  ].forEach((text) => assert.match(reportExportSource, new RegExp(text)));
  [
    'Memory events',
    'Permission events',
    'Workspace changes and artifacts',
    'Likely owner/root cause',
  ].forEach((text) => assert.match(failuresRouteSource, new RegExp(text)));
  assert.match(runsRouteSource, /renderAgentHarnessPolicyPreview/);
});

test('web app splits the product landing page from the operator surface', () => {
  const consoleSurfaceSources = [
    source,
    targetsRouteSource,
    reportsRouteSource,
    runsRouteSource,
    failuresRouteSource,
  ].join('\n');
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
    'Explore change impact',
    'Run sample demo',
    'Product preview',
    'Ship tool changes without breaking your agents.',
    'HarnessAmp maps API, MCP, schema, and policy changes',
    'What happens after the tool contract changes?',
    'Create a release certification run',
    'Keep your agent. Test the contracts around it.',
    'Sample data first. Real execution when connected.',
    'Adapter contract kit',
    'executionTargetRegistryRows',
    'executionTargetTerms',
    'buildProductionEvidence',
    'productionEvidenceForDashboard',
    'renderTargetReadinessSnapshot',
    'targetReliabilityForRegistryTarget',
    'readinessStatusForTarget',
    'target-card__readiness',
    'Ephemeral local testing only - not production certifiable',
    'targetReleaseCapability',
    'targetRecommendedNextAction',
    'Registered runner',
    'Vercel AI SDK route',
    'Hosted BYOK unavailable',
    'Local tunnel doctor',
    'Validate endpoint',
    'Toolchain readiness',
    'contract version supported',
    'Expired or completed tunnels are not reusable.',
    'Demo vs real execution',
    'Worker-backed run lifecycle',
    'Get a decision, not a dashboard full of traces.',
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
    'Release gate truth',
    'runHttpRunner',
    'browser-mvp-benchmark',
    'renderJobObservability',
    'Worker',
    'Retry schedule',
    'Error history',
    'Release decision',
    'Toolchain release verdict',
    'Failure triage',
    'ha-triage-list',
    'categorized blockers',
    'Historical comparison',
    'Target reliability',
    'lifecycleDisplayLabel',
    'Blocked',
    'Review critical failures',
    'renderDashboardNextAction',
    'Top blocker',
    'See the blast radius before you ship.',
    'renderDashboardReleaseSnapshot',
    'renderDashboardFailureSummary',
    'Recent test runs',
    'ha-evidence-card',
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
  ].forEach((text) => assert.match(consoleSurfaceSources, new RegExp(text)));
  [
    'Change intelligence',
    'What breaks when a tool changes?',
    'Run targeted checks',
    'Dependency map',
    'Run affected workflows',
  ].forEach((text) => assert.match(changesRouteSource, new RegExp(text)));
  [
    'Toolchain Readiness',
    'renderExecutionTargets',
    'readinessLabels',
    'target-registry',
    'renderToolContractDoctorPanel',
    'Release certification starts here',
    'Validate reachability, tokens, JSON, contract version',
  ].forEach((text) => assert.match(targetsRouteSource, new RegExp(text)));
  [
    'Sample workspace',
    'Connected project',
    'Production run',
    'Sample data',
    'Real execution',
    'Certified',
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
  const failureSources = `${source}\n${failuresRouteSource}`;
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
    'Trace provenance',
    'Failure origin',
    'Promotion candidate',
    'renderTraceProvenance',
    'provenanceLabel',
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
  ].forEach((text) => assert.match(failureSources, new RegExp(text)));
});

test('saas start run supports end-to-end queued run flow', () => {
  const runSources = `${source}\n${runsRouteSource}`;
  [
    'run-config-form',
    'run-workflow',
    'Benchmark',
    'Toolchain type',
    'Validate',
    'Run release certification',
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
    'Certification result',
    'runModeLabels',
    'Tool Contract Doctor',
    'run-launch-state',
    'renderLaunchStateCallout',
    'runLaunchState',
    'Run release certification',
    'Start toolchain QA run',
    'Select agent and execution target',
    'Release gate and failure profile',
    'Review preflight checklist',
    'Targeted rerun',
    'Rerun release blockers',
    'Rerun replayable regression cases from this report',
    'Fixed, Still failing, Newly failing, Regressed, or Not rerun',
    'Agent Toolchain QA',
    'Sample evidence only',
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
    'Release certification eligible',
    'Sample certification only',
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
  ].forEach((text) => assert.match(runSources, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
});

test('saas reports page exposes working export controls', () => {
  [
    'renderReportsTable',
    'renderReportEvidenceLibrary',
    'renderReportEvidenceCard',
    'ha-evidence-library',
    'Rerun failures',
    'ha-report-table',
    'Failure intelligence',
    'renderFailureIntelligencePanel',
    'reportExportDetail',
    'Browser-ready certificate',
    'data-report-export',
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
  ].forEach((text) => assert.match(source, new RegExp(text)));
  [
    'Trace-backed evidence',
    'trace_id',
    'regression_status',
    'Rerun failed scenarios from this report',
  ].forEach((text) => assert.match(reportExportSource, new RegExp(text)));
  [
    'renderSaasReports',
    'report-export-status',
    'Toolchain Release Evidence Reports',
    'Seeded sample rows stay labeled',
    'Export release evidence JSON',
    'Export audit CSV',
    'Create CI gate',
    'Compare latest run',
  ].forEach((text) => assert.match(reportsRouteSource, new RegExp(text)));
});

test('saas pack catalog exposes RetrievalGuard, CustomerCareGuard, and LegalGuard manifests', () => {
  [
    'RetrievalGuard',
    'CustomerCareGuard',
    'Instruction Manifest Doctor',
    'LegalGuard',
    'citation_fidelity',
    'tool_failure_transparency',
    'refund_authority',
    'jurisdiction_discipline',
    'deadline_safety',
    'policy_source_fidelity',
    'instruction_precedence',
    'refund_policy_mismatch',
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
  assert.match(source, /renderInstructionDoctorSummaryPanel/);
  assert.match(source, /renderInstructionDoctorDetailPanel/);
  assert.match(source, /instructionDoctorRows/);
  assert.match(source, /Agent release packs/);
  assert.match(source, /Release gates for instruction stacks, tools, policies, and live behavior/);
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
    'Recent certification history',
    'Known regressions',
    'compare-baseline-run',
    'compare-latest-run',
    'selectedRunComparison',
    'latestBenchmarkComparison',
    'Release gate baseline',
    'Gate metric changes',
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
  assert.match(mainSource, /renderBootstrapError/);
  assert.doesNotMatch(mainSource, /renderBootstrapLoading/);
  assert.doesNotMatch(mainSource, /Loading HarnessAmp/);
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
