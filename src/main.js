import Ajv2020 from 'ajv/dist/2020';
import { analyzeBundle, createDemoBundle, safeJsonParse } from './core/engine.js';
import { buildReportSnapshot as createReportSnapshot } from './shared/report-snapshot.js';
import { MUTATION_PACKS } from './mutations/registry.js';
import supportProfile from '../examples/risk-profiles/support-agent.json';
import browserProfile from '../examples/risk-profiles/browser-agent.json';
import quickstartBundle from '../examples/cli/quickstart-bundle.json';
import observedRuns from '../examples/cli/observed-runs.json';
import supportMvpBenchmarkPack from '../examples/benchmarks/support-mvp/benchmark-pack.json';
import browserMvpBenchmarkPack from '../examples/benchmarks/browser-mvp/benchmark-pack.json';
import harnessBundleSchema from '../docs/schemas/harness_bundle.schema.json';
import riskProfileSchema from '../docs/schemas/risk_profile.schema.json';
import diagnosticReportSchema from '../docs/schemas/diagnostic_report.schema.json';
import benchmarkPackSchema from '../docs/schemas/benchmark_pack.schema.json';
import docsInstall from '../docs/install.md?raw';
import docsSchemas from '../docs/schemas.md?raw';
import docsRunnerContract from '../docs/runner-contract.md?raw';
import docsCiGates from '../docs/ci-gates.md?raw';
import docsMutationPacks from '../docs/mutation-packs.md?raw';
import docsBenchmarks from '../docs/benchmarks.md?raw';

const riskProfiles = {
  'support-agent': {
    label: 'Support agent',
    profile: supportProfile,
    bundle: createDemoBundle(),
    coverage: ['prompt_integrity_pack', 'tool_payload_pack', 'permissioning_pack', 'network_sink_pack', 'context_memory_pack'],
  },
  'browser-agent': {
    label: 'Browser agent',
    profile: browserProfile,
    bundle: {
      ...quickstartBundle,
      project: 'Browser Checkout Agent',
      description: 'Demo profile for a browser agent with external network and messaging exposure.',
    },
    coverage: ['prompt_integrity_pack', 'tool_payload_pack', 'network_sink_pack', 'context_memory_pack', 'sandbox_boundary_pack', 'multimodal_pack'],
  },
  'tool-heavy-agent': {
    label: 'Tool-heavy agent',
    profile: {
      agentDomain: 'internal_ops_agent',
      toolRisk: ['write_capable', 'database', 'code_execution', 'external_network'],
      dataSensitivity: ['internal', 'confidential', 'pii'],
      autonomyLevel: 'semi_autonomous',
    },
    bundle: {
      ...createDemoBundle(),
      project: 'Ops Automation Agent',
      description: 'Demo profile for an internal agent with database, file, and execution surfaces.',
    },
    coverage: MUTATION_PACKS,
  },
};

const bundlePresets = {
  'profile-demo': {
    label: 'Profile demo harness',
    type: 'harness',
    description: 'Uses the selected risk profile and its built-in demo harness bundle.',
  },
  'support-mvp-benchmark': {
    label: 'Support MVP benchmark pack',
    type: 'benchmark',
    description: 'Loads the checked-in intent, contract, benchmark cases, and wrapper for the support release gate.',
    lockedProfileId: 'support-agent',
    bundle: supportMvpBenchmarkPack,
  },
  'browser-mvp-benchmark': {
    label: 'Browser MVP benchmark pack',
    type: 'benchmark',
    description: 'Loads the browser-agent benchmark with origin, download, and cross-origin failure modes.',
    lockedProfileId: 'browser-agent',
    bundle: browserMvpBenchmarkPack,
  },
};

const mutationPackDetails = [
  ['prompt_integrity_pack', 'Mutates user pressure, ambiguity, hierarchy conflicts, and citation traps.', 'User says approval exists even when trusted state is missing.'],
  ['tool_payload_pack', 'Mutates tool output shape, status/body consistency, embedded instructions, and tenant identity.', 'Required tool field disappears from a successful response.'],
  ['permissioning_pack', 'Mutates approval state, tenant scope, and sensitive tool authorization.', 'Refund action loses human approval metadata.'],
  ['network_sink_pack', 'Mutates external destinations, callback URLs, webhook sinks, and exfiltration paths.', 'Agent is asked to send internal output to an untrusted endpoint.'],
  ['context_memory_pack', 'Mutates stale memory, cross-session residue, retrieval noise, and context pressure.', 'Old account context is blended into the current user.'],
  ['sandbox_boundary_pack', 'Mutates file-system, execution, browser, and local-environment boundaries.', 'Code runner receives a path outside the allowed workspace.'],
  ['multimodal_pack', 'Mutates screenshot, document, and visual-context assumptions.', 'A screenshot contains instruction-like text that should be treated as data.'],
];

const integrations = [
  ['GitHub Actions', 'Use the reusable action to emit Markdown, JSON, and failure-corpus artifacts while blocking risky PRs.'],
  ['Local JSON', 'Commit harness bundles, observed runs, and diagnostic reports as plain JSON artifacts.'],
  ['CLI', 'Use the terminal as the primary workflow and open the web report only when reviewing results.'],
  ['HTTP runners', 'Point HarnessAmp at an endpoint that runs your real agent and returns normalized run results.'],
  ['MCP tool servers', 'Exercise tool-call boundaries and server responses without changing the agent framework.'],
  ['Custom runners', 'Implement the runner contract for graph agents, crew-style agents, or internal harnesses.'],
];

const quickstart = [
  ['Install or clone', 'Clone the repo and run `npm install`.'],
  ['Add harness bundle', 'Start with `examples/cli/quickstart-bundle.json` or paste your own wrapper JSON.'],
  ['Run diagnose', 'Execute `npm run diagnose -- examples/cli/quickstart-bundle.json`.'],
  ['Interpret report', 'Review baseline, mutated pass rate, weakest surface, and recommended controls.'],
  ['Add CI gate', 'Use pass/warn/block status to protect merges and releases.'],
];

const githubActionsSnippet = `name: HarnessAmp release gate

on:
  pull_request:
  workflow_dispatch:

jobs:
  robustness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: ./
        with:
          bundle: examples/demo-bundle.json
          max-mutations: 24
          max-robustness-gap: 20
          output-dir: harnessamp-artifacts`;

const runnerContract = [
  ['Input', 'Accept one baseline or mutated variant with scenario id, mutation id, seed, wrapper payload, and metadata.'],
  ['Execution', 'Run the target agent exactly once per variant through the same harness path used in production tests.'],
  ['Output', 'Return variantId, passed, score, latencyMs, notes, and optional tool calls or error class.'],
  ['Determinism', 'Preserve replay seed, environment label, model/runtime version, and runner version.'],
  ['Boundary', 'Keep approvals, network sinks, filesystem scope, and tenant identity outside prompt-only control.'],
];

const proofStats = [
  ['7', 'mutation packs'],
  ['20+', 'deterministic mutations'],
  ['3 artifacts', 'report + json + corpus'],
  ['red X', 'PR-blocking gate'],
  ['2 benchmark lanes', 'support + browser'],
];

const docPages = [
  { slug: 'install', id: 'docs-install', title: 'Install', body: docsInstall },
  { slug: 'schemas', id: 'docs-schemas', title: 'Schemas', body: docsSchemas },
  { slug: 'runner-contract', id: 'docs-runner-contract', title: 'Runner contract', body: docsRunnerContract },
  { slug: 'ci-gates', id: 'docs-ci-gates', title: 'CI gates', body: docsCiGates },
  { slug: 'mutation-packs', id: 'docs-mutation-packs', title: 'Mutation packs', body: docsMutationPacks },
  { slug: 'benchmarks', id: 'docs-benchmarks', title: 'Benchmarks', body: docsBenchmarks },
];

const workflow = [
  ['Wrap', 'Load your harness without rewriting the agent runtime.'],
  ['Mutate', 'Apply deterministic changes to prompts, tools, permissions, context, network sinks, and sandbox boundaries.'],
  ['Run', 'Replay baseline and mutated cases through the same runner contract.'],
  ['Diagnose', 'Compare behavioral deltas and classify reliability failures.'],
  ['Gate', 'Emit pass, warn, or block status before a release moves forward.'],
];

const modules = [
  ['Mutation Engine', 'Structured wrapper changes for prompt wording, tool payloads, schema drift, context pressure, permissions, and execution boundaries.'],
  ['Risk Profiles', 'Target the surfaces that matter for support agents, browser agents, graph agents, internal tools, or custom harnesses.'],
  ['Behavioral Delta Layer', 'Measure how output quality, pass rate, latency, tool calls, and error classes shift when conditions change.'],
  ['Failure Classifier', 'Turn brittle behavior into named failure modes that engineers can route, reproduce, and fix.'],
  ['Robustness Reports', 'Readable diagnostic output with weakest surface, recommended controls, and replay metadata.'],
  ['CI/CD Gates', 'Convert the Robustness Gap into pass, warn, or block status for pull requests and releases.'],
];

const STORAGE_KEY = 'harnessamp.webDemoState';
const REPORT_STORAGE_KEY = 'harnessamp.savedReports';
const EVENT_STORAGE_KEY = 'harnessamp.telemetryEvents';

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateHarnessBundleSchema = ajv.compile(harnessBundleSchema);
const validateRiskProfileSchema = ajv.compile(riskProfileSchema);
const validateDiagnosticReportSchema = ajv.compile(diagnosticReportSchema);
const validateBenchmarkPackSchema = ajv.compile(benchmarkPackSchema);
const validateObservedRunsSchema = ajv.compile({
  type: 'array',
  items: harnessBundleSchema.properties.observations.items,
});

const defaultState = {
  bundlePresetId: 'profile-demo',
  profileId: 'support-agent',
  intensity: 2,
  useObservedRuns: true,
  useCustomInput: false,
  customBundleText: JSON.stringify(quickstartBundle, null, 2),
  customRunsText: JSON.stringify(observedRuns, null, 2),
  thresholds: {
    minOverallScore: 65,
    minHoldoutPass: 60,
    maxGap: 20,
  },
  runnerEndpoint: '',
  runnerStatus: '',
  reportId: '',
  reportPath: '',
  accountEmail: 'demo@harnessamp.local',
  workspaceName: 'Reliability Lab',
  projectName: 'Northstar Support Copilot',
  projectRole: 'owner',
  analyticsEnabled: true,
  sessionStatus: 'loading',
  selectedWorkspaceId: '',
  selectedProjectId: '',
  selectedRunnerId: '',
  workspaceDraftName: 'Reliability Lab',
  projectDraftName: 'Northstar Support Copilot',
  runnerRegistrationName: 'Primary runner',
  runnerRegistrationEndpoint: '',
  runnerRegistrationSecret: '',
  workspaceProjects: [],
  projectReports: [],
  projectRunners: [],
  activeJobId: '',
  activeJobStatus: '',
  loadedServerReport: null,
  inputError: '',
  feedback: '',
  analysis: null,
};

const state = loadState();
const app = document.querySelector('#app');

installErrorMonitoring();
initializeApp().catch((error) => {
  console.error(error);
});

async function initializeApp() {
  if (!state.useCustomInput) syncCustomEditorsToPreset();
  await refreshSession();
  render();
  runDiagnosis();
  await hydrateRouteState();
  window.addEventListener('hashchange', scrollToRouteTarget);
}

function render() {
  const preset = getSelectedBundlePreset();
  const profile = getSelectedRiskProfile(preset);
  const profileLocked = Boolean(preset.lockedProfileId);
  const route = getRoute();
  const isAuthed = state.sessionStatus === 'authenticated' && state.session?.user;
  const activeReportPath = state.reportPath || (state.reportId ? reportPathFor(state.selectedProjectId, state.reportId) : '');

  app.innerHTML = `
    <div class="site-shell">
      <header class="topbar">
        <a class="brand" href="/" aria-label="HarnessAmp home">
          <span class="brand__mark">HA</span>
          <span><strong>HarnessAmp</strong><small>Robustness infrastructure</small></span>
        </a>
        <nav class="topbar__nav" aria-label="Primary navigation">
          <a href="/" ${route.kind === 'home' ? 'aria-current="page"' : ''}>Product</a>
          <a href="/app" ${route.kind === 'app' || route.kind === 'report' || route.kind === 'project-report' ? 'aria-current="page"' : ''}>App</a>
          <a href="/docs/install" ${route.kind === 'docs' ? 'aria-current="page"' : ''}>Docs</a>
          <a href="/app#report">Reports</a>
          <a href="/app#packs">Packs</a>
        </nav>
        ${isAuthed
          ? `<button class="nav-cta nav-cta--button" id="logout-button" type="button">Log out</button>`
          : `<a class="nav-cta" href="${escapeHtml(authStartHref())}">GitHub login</a>`}
      </header>

      <main id="top">
        <section class="hero reveal">
          <div class="hero__copy">
            <p class="eyebrow">Agent reliability diagnosis</p>
            <h1>Turn agent fragility into a failing PR check.</h1>
            <p class="hero__lede">HarnessAmp wraps your agent harness, mutates prompts, tools, permissions, context, network sinks, and sandbox boundaries, then reports the Robustness Gap and the exact condition that broke reliability.</p>
            <div class="hero__actions">
              <a class="button button--primary" href="#demo">Run a robustness diagnosis</a>
              <a class="button button--secondary" href="#report">View sample report</a>
            </div>
          </div>
          <div class="diagnostic-board" aria-label="Live robustness diagnosis">
            <div class="board-header"><span id="hero-run-label">diagnosis/pending</span><strong id="hero-gate">RUN</strong></div>
            <div class="scoreline">
              <div><span>Baseline</span><b id="hero-baseline">--</b></div>
              <div><span>Mutated</span><b class="warn" id="hero-mutated">--</b></div>
              <div><span>Drop</span><b class="danger" id="hero-drop">--</b></div>
            </div>
            <div class="trace"><span>weakest_surface</span><strong id="hero-surface">waiting for run</strong></div>
            <div class="trace"><span>recommended_control</span><strong id="hero-control">run a diagnosis to generate CI-ready evidence</strong></div>
            <div class="mutation-map" id="hero-bars">${Array.from({ length: 8 }, (_, index) => `<i style="--h: ${36 + index * 6}%"></i>`).join('')}</div>
          </div>
        </section>

        <section class="proof-strip reveal" aria-label="Proof artifacts">${proofStats.map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('')}</section>

        <section id="workflow" class="section section--split reveal">
          <div><p class="eyebrow">Robustness workflow</p><h2>Wrap -> Mutate -> Run -> Diagnose -> Gate</h2></div>
          <div class="workflow">${workflow.map(([title, detail], index) => `<article><span>${String(index + 1).padStart(2, '0')}</span><h3>${title}</h3><p>${detail}</p></article>`).join('')}</div>
        </section>

        <section id="demo" class="section demo-section reveal">
          <div class="section__intro">
            <p class="eyebrow">Interactive demo</p>
            <h2>Load a sample harness. Choose risk. Run mutations.</h2>
            <p>The browser demo calls the same analysis engine used by the CLI, reusable GitHub Action, and release gate. The output is a report, JSON payload, and corpus-ready failure record.</p>
            <div class="try-path">
              <span>01 Select profile</span>
              <span>02 Review schema</span>
              <span>03 Run diagnosis</span>
              <span>04 Save report</span>
            </div>
          </div>
          <div class="demo-console">
            <div class="demo-controls">
              <label><span>Bundle preset</span><select id="bundle-preset-select">${Object.entries(bundlePresets).map(([id, item]) => `<option value="${id}" ${id === state.bundlePresetId ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
              <label><span>Risk profile</span><select id="profile-select" ${profileLocked ? 'disabled' : ''}>${Object.entries(riskProfiles).map(([id, item]) => `<option value="${id}" ${id === profile.id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
              <label><span>Mutation intensity</span><select id="intensity-select">${[1, 2, 3, 4].map((value) => `<option value="${value}" ${value === state.intensity ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
              <label class="check-control"><input id="observed-toggle" type="checkbox" ${state.useObservedRuns ? 'checked' : ''} /><span>Use observed runs</span></label>
              <label class="check-control"><input id="custom-toggle" type="checkbox" ${state.useCustomInput ? 'checked' : ''} /><span>Use pasted JSON</span></label>
              <button class="button button--primary" id="run-demo" type="button">Run diagnosis</button>
            </div>
            <div class="preset-note">
              <strong>${escapeHtml(preset.label)}</strong>
              <span>${escapeHtml(preset.description)}${profileLocked ? ` Locked to ${profile.label.toLowerCase()}.` : ''}</span>
            </div>
            <div class="threshold-controls">
              <label><span>Min overall score</span><input id="min-overall-score" type="number" min="0" max="100" value="${state.thresholds.minOverallScore}" /></label>
              <label><span>Min holdout pass</span><input id="min-holdout-pass" type="number" min="0" max="100" value="${state.thresholds.minHoldoutPass}" /></label>
              <label><span>Max robustness gap</span><input id="max-gap" type="number" min="0" max="100" value="${state.thresholds.maxGap}" /></label>
            </div>
            <div class="runner-controls">
              <label><span>HTTP runner endpoint</span><input id="runner-endpoint" type="url" placeholder="https://runner.example.com/harnessamp" value="${escapeHtml(state.runnerEndpoint)}" /></label>
              <button class="button button--secondary" id="run-http-runner" type="button">Run HTTP runner</button>
              <span id="runner-status">${escapeHtml(state.runnerStatus)}</span>
            </div>
            <div class="input-workbench" id="input-workbench">
              <label>
                <span>Harness bundle JSON</span>
                <input id="bundle-file" type="file" accept="application/json,.json" />
                <textarea id="bundle-json" spellcheck="false">${escapeHtml(state.customBundleText)}</textarea>
              </label>
              <label>
                <span>Observed runs JSON</span>
                <input id="runs-file" type="file" accept="application/json,.json" />
                <textarea id="runs-json" spellcheck="false">${escapeHtml(state.customRunsText)}</textarea>
              </label>
              <p id="input-error" class="input-error">${escapeHtml(state.inputError)}</p>
            </div>
            <div class="demo-result">
              <div><span>Profile</span><strong id="demo-profile">--</strong></div>
              <div><span>Mutation variants</span><strong id="demo-variants">--</strong></div>
              <div><span>Replay seed</span><strong id="demo-seed">--</strong></div>
              <div><span>Gate</span><strong class="danger" id="demo-gate">--</strong></div>
            </div>
            <div class="coverage-panel">
              <h3>Visible mutation coverage</h3>
              <div id="coverage-list" class="coverage-list"></div>
            </div>
            <div class="schema-panel">
              <h3>Schema validation</h3>
              <div id="schema-status-list" class="schema-status-list"></div>
            </div>
            <div class="benchmark-panel">
              <div class="benchmark-panel__header">
                <h3>Benchmark contract</h3>
                <p id="benchmark-summary-meta">Select a benchmark preset to inspect intent, contract, and gates.</p>
              </div>
              <div id="benchmark-contract-panel" class="benchmark-contract-panel"></div>
            </div>
            <div class="benchmark-panel benchmark-panel--cases">
              <div class="benchmark-panel__header">
                <h3>Benchmark cases</h3>
                <p id="benchmark-cases-meta">Cases appear when the active bundle is a benchmark pack.</p>
              </div>
              <div id="benchmark-case-list" class="benchmark-case-list"></div>
            </div>
          </div>
        </section>

        <section id="product" class="section reveal">
          <div class="section__intro"><p class="eyebrow">Core product</p><h2>Reliability modules for agents that already run.</h2><p>HarnessAmp does not ask teams to adopt a new agent framework. It tests the wrapper conditions around the system they already have.</p></div>
          <div class="module-grid">${modules.map(([title, detail]) => `<article><h3>${title}</h3><p>${detail}</p></article>`).join('')}</div>
        </section>

        <section id="report" class="section report-section reveal">
          <div class="report-copy"><p class="eyebrow">Sample report page</p><h2>From pass rate to engineering control.</h2><p>This report is generated from the selected preset, selected risk profile, mutation intensity, and observed run fixture.</p></div>
          <div class="report">
            <div><span>Baseline</span><strong id="report-baseline">--</strong></div>
            <div><span>Mutated</span><strong id="report-mutated">--</strong></div>
            <div><span>Robustness drop</span><strong class="danger" id="report-drop">--</strong></div>
            <div><span>Gap band</span><strong id="report-gap-band">--</strong></div>
            <div><span>Weakest surface</span><strong id="report-surface">--</strong></div>
            <div><span>Failure class</span><strong id="report-failure">--</strong></div>
            <div><span>Recommended control</span><strong id="report-control">--</strong></div>
            <div><span>Replay seed</span><strong id="report-seed">--</strong></div>
            <div><span>CI gate</span><strong class="danger" id="report-gate">--</strong></div>
            <div><span>Report id</span><strong id="report-id">--</strong></div>
            <div><span>Shareable route</span><strong id="report-path">${activeReportPath ? escapeHtml(activeReportPath) : '--'}</strong></div>
            <div><span>Saved snapshot</span><strong id="report-saved">local</strong></div>
          </div>
          <div class="export-actions">
            <button class="button button--secondary" id="copy-report" type="button">Copy Markdown report</button>
            <button class="button button--secondary" id="download-report" type="button">Download report</button>
            <button class="button button--secondary" id="download-report-json" type="button">Download report JSON</button>
            <button class="button button--secondary" id="download-pack" type="button">Download mutation pack</button>
            <button class="button button--secondary" id="copy-ci" type="button">Copy CI gate snippet</button>
            <button class="button button--secondary" id="save-report" type="button">Save report snapshot</button>
            <button class="button button--secondary" id="save-server-report" type="button">Save server report</button>
            <button class="button button--secondary" id="load-server-report" type="button">Load server report</button>
            <button class="button button--secondary" id="copy-report-link" type="button">Copy report link</button>
            <span class="action-feedback" id="action-feedback">${escapeHtml(state.feedback)}</span>
          </div>
          <div class="variant-panel">
            <h3>Failed and warning variants</h3>
            <div class="variant-table-wrap">
              <table class="variant-table">
                <thead><tr><th>Mutation</th><th>Surface</th><th>Status</th><th>Score</th><th>Latency</th><th>Source</th></tr></thead>
                <tbody id="variant-table-body"></tbody>
              </table>
            </div>
          </div>
          <div class="case-panel">
            <h3>Case-level reporting</h3>
            <div id="case-results" class="case-results"></div>
          </div>
          <pre class="report-text" id="report-text"></pre>
        </section>

        <section id="workspace" class="section workspace-section reveal">
          <div class="section__intro"><p class="eyebrow">Auth and workspaces</p><h2>Project context for team reports and runner jobs.</h2><p>Anonymous visitors can use the demo. Saving team reports, registering runners, and dispatching jobs requires GitHub auth and a selected project.</p></div>
          <div class="workspace-grid">
            <div class="workspace-panel workspace-panel--auth">
              <h3>Session</h3>
              ${isAuthed ? `
                <div class="session-card">
                  <strong>${escapeHtml(state.session.user.name)}</strong>
                  <span>${escapeHtml(state.session.user.login)}</span>
                  <small>${escapeHtml(state.session.user.email ?? 'no public email')}</small>
                </div>
                <label><span>Workspace</span><select id="workspace-select">${renderWorkspaceOptions()}</select></label>
                <label><span>Project</span><select id="project-select">${renderProjectOptions()}</select></label>
                <label><span>Project role</span><input id="project-role-display" type="text" value="${escapeHtml(activeProjectRole())}" disabled /></label>
                <div class="inline-actions">
                  <label><span>New workspace</span><input id="workspace-draft-name" type="text" value="${escapeHtml(state.workspaceDraftName)}" /></label>
                  <button class="button button--secondary" id="create-workspace" type="button">Create workspace</button>
                </div>
                <div class="inline-actions">
                  <label><span>New project</span><input id="project-draft-name" type="text" value="${escapeHtml(state.projectDraftName)}" /></label>
                  <button class="button button--secondary" id="create-project" type="button">Create project</button>
                </div>
              ` : `
                <div class="session-empty">
                  <p>GitHub auth enables saved reports, project membership, runner registration, and cross-device report routes.</p>
                  <a class="button button--primary" href="${escapeHtml(authStartHref())}">Sign in with GitHub</a>
                </div>
              `}
              <label class="check-control"><input id="analytics-toggle" type="checkbox" ${state.analyticsEnabled ? 'checked' : ''} /><span>Allow client analytics events</span></label>
            </div>
            <div class="workspace-panel">
              <h3>Runner control plane</h3>
              ${isAuthed ? `
                <label><span>Runner name</span><input id="runner-registration-name" type="text" value="${escapeHtml(state.runnerRegistrationName)}" /></label>
                <label><span>Runner endpoint</span><input id="runner-registration-endpoint" type="url" value="${escapeHtml(state.runnerRegistrationEndpoint)}" placeholder="https://runner.example.com/harnessamp" /></label>
                <label><span>Runner secret</span><input id="runner-registration-secret" type="password" value="${escapeHtml(state.runnerRegistrationSecret)}" placeholder="Optional bearer token" /></label>
                <div class="inline-actions">
                  <button class="button button--secondary" id="register-runner" type="button">Register runner</button>
                  <button class="button button--secondary" id="dispatch-job" type="button">Dispatch job</button>
                </div>
                <label><span>Registered runner</span><select id="runner-select">${renderRunnerOptions()}</select></label>
                <p class="runner-state" id="job-state">${escapeHtml(state.activeJobStatus || 'No runner job dispatched')}</p>
              ` : `
                <p class="session-muted">Sign in to register project-scoped runners and dispatch async jobs.</p>
              `}
            </div>
            <div class="workspace-panel">
              <h3>Project reports</h3>
              ${isAuthed ? `
                <p class="session-muted">Saved reports live under the selected project and open at pathname routes.</p>
                <div id="project-report-list" class="project-report-list">${renderProjectReportList()}</div>
              ` : `
                <p class="session-muted">Anonymous mode keeps reports in the browser only.</p>
              `}
            </div>
          </div>
        </section>

        <section id="packs" class="section reveal">
          <div class="section__intro"><p class="eyebrow">Mutation pack browser</p><h2>7 packs covering 20+ deterministic mutations.</h2><p>Each pack targets a wrapper condition that can change after the agent looked stable in a narrow baseline test.</p></div>
          <div class="pack-grid">${mutationPackDetails.map(([name, detail, example]) => `<article><span>${name}</span><h3>${formatPackName(name)}</h3><p>${detail}</p><small>${example}</small></article>`).join('')}</div>
        </section>

        <section id="integrations" class="section reveal">
          <div class="section__intro"><p class="eyebrow">Integrations detail</p><h2>Bring your runner. Keep your stack.</h2><p>The default mock runner proves the workflow. The custom HTTP runner lets real agents receive baseline and mutated payloads through the same contract.</p></div>
          <div class="integration-grid">${integrations.map(([title, detail]) => `<article><h3>${title}</h3><p>${detail}</p></article>`).join('')}</div>
          <div class="ci-snippet">
            <div class="section__intro"><p class="eyebrow">Concrete CI path</p><h2>Reusable action, PR summary, and artifacts.</h2><p>Each run writes a Markdown report, JSON report, and failure corpus artifact. A block verdict exits non-zero.</p></div>
            <pre>${escapeHtml(githubActionsSnippet)}</pre>
          </div>
        </section>

        <section id="runner-contract" class="section reveal">
          <div class="section__intro"><p class="eyebrow">Runner contract</p><h2>The adapter shape custom teams implement.</h2><p>HarnessAmp stays framework-agnostic by asking every runner to expose the same small execution contract.</p></div>
          <div class="contract-grid">${runnerContract.map(([title, detail]) => `<article><h3>${title}</h3><p>${detail}</p></article>`).join('')}</div>
        </section>

        <section id="quickstart" class="section quickstart reveal">
          <div><p class="eyebrow">Docs path</p><h2>Quickstart from clone to release gate.</h2></div>
          <div class="quickstart-list">${quickstart.map(([title, detail], index) => `<article><span>${index + 1}</span><h3>${title}</h3><p>${detail}</p></article>`).join('')}</div>
        </section>

        ${renderDocsSections()}

        <section id="deploy" class="section deploy-section reveal">
          <div class="section__intro"><p class="eyebrow">Deployment</p><h2>Static hosting ready.</h2><p>The app builds as a static Vite site. Deploy the generated dist directory to Vercel, Netlify, GitHub Pages, or any static host.</p></div>
          <pre>npm run build
npx serve dist

# production output
dist/index.html
dist/assets/*</pre>
        </section>

        <section class="section artifacts reveal">
          <div class="section__intro"><p class="eyebrow">Real proof artifacts</p><h2>Embedded from repo examples.</h2><p>The demo uses examples/cli/quickstart-bundle.json, examples/cli/observed-runs.json, examples/benchmarks/support-mvp/benchmark-pack.json, examples/benchmarks/browser-mvp/benchmark-pack.json, and the checked-in risk profile files.</p></div>
          <div class="artifact-actions">
            <button class="button button--secondary" id="download-example-bundle" type="button">Download quickstart bundle</button>
            <button class="button button--secondary" id="download-example-runs" type="button">Download observed runs</button>
            <button class="button button--secondary" id="download-example-benchmark" type="button">Download benchmark pack</button>
            <button class="button button--secondary" id="download-browser-benchmark" type="button">Download browser benchmark</button>
            <button class="button button--secondary" id="download-risk-profile" type="button">Download risk profile</button>
            <button class="button button--secondary" id="download-ci-yaml" type="button">Download CI YAML</button>
          </div>
          <div class="artifact-grid">
            <pre>${escapeHtml(JSON.stringify(quickstartBundle, null, 2).slice(0, 900))}</pre>
            <pre>${escapeHtml(JSON.stringify(observedRuns, null, 2))}</pre>
            <pre>${escapeHtml(JSON.stringify(supportMvpBenchmarkPack, null, 2).slice(0, 1500))}</pre>
            <pre>${escapeHtml(JSON.stringify(browserMvpBenchmarkPack, null, 2).slice(0, 1500))}</pre>
          </div>
        </section>

        <section class="closing reveal">
          <p>If your agent breaks when the wrapper changes, it was not production-ready.</p>
          <h2>Prove your agents still work when conditions change.</h2>
          <a class="button button--primary" href="#demo">Run a robustness diagnosis</a>
        </section>
      </main>
    </div>
  `;

  bindEvents();
  observeReveals();
  scrollToRouteTarget();
}

function renderDocsSections() {
  return docPages.map((page) => `
    <section id="${page.id}" class="section docs-section reveal">
      <div class="section__intro"><p class="eyebrow">Docs / ${page.title}</p><h2>${page.title}</h2><p>Route: /docs/${page.slug}</p></div>
      <pre>${escapeHtml(page.body.trim())}</pre>
    </section>
  `).join('');
}

function bindEvents() {
  bindIfPresent('#bundle-preset-select', 'change', (event) => {
    state.bundlePresetId = event.target.value;
    const preset = getSelectedBundlePreset();
    if (preset.lockedProfileId) state.profileId = preset.lockedProfileId;
    if (!state.useCustomInput) syncCustomEditorsToPreset();
    persistState();
    render();
    runDiagnosis();
  });
  bindIfPresent('#profile-select', 'change', (event) => {
    state.profileId = event.target.value;
    if (!state.useCustomInput) syncCustomEditorsToPreset();
    persistState();
    runDiagnosis();
  });
  bindIfPresent('#intensity-select', 'change', (event) => {
    state.intensity = Number(event.target.value);
    persistState();
    runDiagnosis();
  });
  bindIfPresent('#observed-toggle', 'change', (event) => {
    state.useObservedRuns = event.target.checked;
    persistState();
    runDiagnosis();
  });
  bindIfPresent('#custom-toggle', 'change', (event) => {
    if (event.target.checked) syncCustomEditorsToPreset();
    state.useCustomInput = event.target.checked;
    persistState();
    runDiagnosis();
  });
  bindIfPresent('#bundle-json', 'input', (event) => {
    state.customBundleText = event.target.value;
    persistState();
  });
  bindIfPresent('#runs-json', 'input', (event) => {
    state.customRunsText = event.target.value;
    persistState();
  });
  bindIfPresent('#bundle-file', 'change', (event) => readJsonFile(event, 'bundle'));
  bindIfPresent('#runs-file', 'change', (event) => readJsonFile(event, 'runs'));
  bindIfPresent('#min-overall-score', 'input', (event) => updateThreshold('minOverallScore', event.target.value));
  bindIfPresent('#min-holdout-pass', 'input', (event) => updateThreshold('minHoldoutPass', event.target.value));
  bindIfPresent('#max-gap', 'input', (event) => updateThreshold('maxGap', event.target.value));
  bindIfPresent('#runner-endpoint', 'input', (event) => {
    state.runnerEndpoint = event.target.value;
    persistState();
  });
  bindIfPresent('#analytics-toggle', 'change', (event) => updateWorkspaceField('analyticsEnabled', event.target.checked));
  bindIfPresent('#run-demo', 'click', runDiagnosis);
  bindIfPresent('#run-http-runner', 'click', runHttpRunner);
  bindIfPresent('#copy-report', 'click', () => copyText(activeReportMarkdown(), 'Copied report'));
  bindIfPresent('#download-report', 'click', () => downloadText('harnessamp-report.md', activeReportMarkdown(), 'Downloaded report'));
  bindIfPresent('#download-report-json', 'click', () => downloadText('harnessamp-report.json', JSON.stringify(activeReportSnapshot(), null, 2), 'Downloaded report JSON'));
  bindIfPresent('#download-pack', 'click', () => downloadText('harnessamp-mutation-pack.json', JSON.stringify(state.analysis?.exportPack ?? {}, null, 2), 'Downloaded mutation pack'));
  bindIfPresent('#copy-ci', 'click', () => copyText(githubActionsSnippet, 'Copied CI snippet'));
  bindIfPresent('#save-report', 'click', () => saveReportSnapshot('Saved report snapshot'));
  bindIfPresent('#save-server-report', 'click', saveServerReport);
  bindIfPresent('#load-server-report', 'click', loadServerReport);
  bindIfPresent('#copy-report-link', 'click', () => copyText(reportUrl(), 'Copied report link'));
  bindIfPresent('#download-example-bundle', 'click', () => downloadText('quickstart-bundle.json', JSON.stringify(quickstartBundle, null, 2), 'Downloaded bundle'));
  bindIfPresent('#download-example-runs', 'click', () => downloadText('observed-runs.json', JSON.stringify(observedRuns, null, 2), 'Downloaded runs'));
  bindIfPresent('#download-example-benchmark', 'click', () => downloadText('support-mvp-benchmark-pack.json', JSON.stringify(supportMvpBenchmarkPack, null, 2), 'Downloaded benchmark'));
  bindIfPresent('#download-browser-benchmark', 'click', () => downloadText('browser-mvp-benchmark-pack.json', JSON.stringify(browserMvpBenchmarkPack, null, 2), 'Downloaded browser benchmark'));
  bindIfPresent('#download-risk-profile', 'click', () => {
    const profile = getSelectedRiskProfile();
    downloadText(`${profile.id}.risk-profile.json`, JSON.stringify(profile.profile, null, 2), 'Downloaded risk profile');
  });
  bindIfPresent('#download-ci-yaml', 'click', () => downloadText('harnessamp-release-gate.yml', githubActionsSnippet, 'Downloaded CI YAML'));
  bindIfPresent('#logout-button', 'click', logout);
  bindIfPresent('#workspace-select', 'change', async (event) => {
    state.selectedWorkspaceId = event.target.value;
    persistState();
    await refreshProjectsForWorkspace();
    render();
    runDiagnosis();
  });
  bindIfPresent('#project-select', 'change', async (event) => {
    state.selectedProjectId = event.target.value;
    persistState();
    await refreshProjectResources();
    renderProjectResources();
    if (state.analysis) updateReportContextOnly();
  });
  bindIfPresent('#workspace-draft-name', 'input', (event) => {
    state.workspaceDraftName = event.target.value;
    persistState();
  });
  bindIfPresent('#project-draft-name', 'input', (event) => {
    state.projectDraftName = event.target.value;
    persistState();
  });
  bindIfPresent('#create-workspace', 'click', createWorkspaceFromDraft);
  bindIfPresent('#create-project', 'click', createProjectFromDraft);
  bindIfPresent('#runner-registration-name', 'input', (event) => {
    state.runnerRegistrationName = event.target.value;
    persistState();
  });
  bindIfPresent('#runner-registration-endpoint', 'input', (event) => {
    state.runnerRegistrationEndpoint = event.target.value;
    persistState();
  });
  bindIfPresent('#runner-registration-secret', 'input', (event) => {
    state.runnerRegistrationSecret = event.target.value;
    persistState();
  });
  bindIfPresent('#register-runner', 'click', registerRunner);
  bindIfPresent('#runner-select', 'change', (event) => {
    state.selectedRunnerId = event.target.value;
    persistState();
  });
  bindIfPresent('#dispatch-job', 'click', dispatchProjectJob);
}

function runDiagnosis() {
  const preset = getSelectedBundlePreset();
  const selected = getSelectedRiskProfile(preset);
  const bundleLabel = preset.type === 'benchmark' ? 'Benchmark pack' : 'Harness bundle';
  trackEvent('diagnosis_started', { profile: selected.id, preset: state.bundlePresetId, customInput: state.useCustomInput });
  const customBundle = state.useCustomInput ? parseJsonInput(state.customBundleText, bundleLabel) : null;
  const customRuns = state.useCustomInput && state.useObservedRuns ? parseJsonInput(state.customRunsText, 'Observed runs') : null;

  if (customBundle?.error || customRuns?.error) {
    state.inputError = customBundle?.error ?? customRuns?.error;
    setText('input-error', state.inputError);
    persistState();
    return;
  }

  state.inputError = '';
  setText('input-error', '');
  persistState();

  const baseBundle = state.useCustomInput ? customBundle.value : resolvePresetBundle(preset, selected);
  const bundleType = detectBundleType(baseBundle, preset);
  const bundleCoverage = resolveBundleCoverage(baseBundle, selected, preset);
  const bundle = {
    ...baseBundle,
    mutationPolicy: {
      ...(baseBundle.mutationPolicy ?? {}),
      intensity: state.intensity,
      visibleFamilies: bundleCoverage.visibleFamilies,
      holdoutFamilies: bundleCoverage.holdoutFamilies,
    },
  };

  const runs = state.useObservedRuns ? (state.useCustomInput ? customRuns.value : resolvePresetRuns(preset, baseBundle)) : [];
  state.analysis = analyzeBundle(bundle, runs, { intensity: state.intensity });
  updateReport({ preset, profile: selected, sourceBundle: baseBundle, bundleType, coverage: bundleCoverage.visibleFamilies });
  trackEvent('diagnosis_completed', { profile: selected.id, preset: state.bundlePresetId, gate: gateFor(state.analysis.summary) });
}

function getSelectedBundlePreset() {
  return bundlePresets[state.bundlePresetId] ?? bundlePresets['profile-demo'];
}

function getSelectedRiskProfile(preset = getSelectedBundlePreset()) {
  const profileId = preset.lockedProfileId ?? state.profileId;
  const selected = riskProfiles[profileId] ?? riskProfiles['support-agent'];
  return {
    ...selected,
    id: profileId,
  };
}

function resolvePresetBundle(preset, profile) {
  if (preset.bundle) return cloneJson(preset.bundle);
  return cloneJson(profile.bundle);
}

function resolvePresetRuns(preset, bundle) {
  if (Array.isArray(bundle?.observations) && bundle.observations.length) {
    return cloneJson(bundle.observations);
  }
  if (preset.type === 'benchmark' && Array.isArray(preset.bundle?.observations)) {
    return cloneJson(preset.bundle.observations);
  }
  return cloneJson(observedRuns);
}

function resolveBundleCoverage(bundle, profile, preset) {
  const visibleFamilies = normalizeCoverage(bundle?.mutationPolicy?.visibleFamilies) ?? profile.coverage;
  const holdoutFamilies = normalizeCoverage(bundle?.mutationPolicy?.holdoutFamilies) ?? visibleFamilies;
  return {
    visibleFamilies,
    holdoutFamilies,
    presetType: preset.type,
  };
}

function normalizeCoverage(value) {
  return Array.isArray(value) && value.length ? value.filter((item) => typeof item === 'string') : null;
}

function detectBundleType(bundle, preset = getSelectedBundlePreset()) {
  if (preset.type === 'benchmark') return 'benchmark';
  return isBenchmarkPackShape(bundle) ? 'benchmark' : 'harness';
}

function isBenchmarkPackShape(bundle) {
  return isObject(bundle)
    && (
      bundle.format === 'harnessamp.benchmark.v1'
      || (isObject(bundle.intent) && isObject(bundle.contract) && isObject(bundle.benchmark) && isObject(bundle.wrapper))
    );
}

function syncCustomEditorsToPreset() {
  const preset = getSelectedBundlePreset();
  const profile = getSelectedRiskProfile(preset);
  const nextBundleText = JSON.stringify(resolvePresetBundle(preset, profile), null, 2);
  const nextRunsText = JSON.stringify(resolvePresetRuns(preset, preset.bundle ?? profile.bundle), null, 2);
  state.customBundleText = nextBundleText;
  state.customRunsText = nextRunsText;
}

function updateReport(context) {
  const {
    preset,
    profile: selected,
    sourceBundle,
    bundleType,
    coverage,
  } = context;
  const analysis = state.analysis;
  const visible = Math.round(analysis.summary.visiblePassRate);
  const holdout = Math.round(analysis.summary.holdoutPassRate);
  const drop = Math.max(0, visible - holdout);
  const gate = gateFor(analysis.summary);
  const weakest = weakestFamily(analysis);
  const recommendation = analysis.recommendations[0]?.detail ?? analysis.recommendations[0]?.title ?? 'Add validation around the weakest wrapper surface.';
  const seed = replaySeed(analysis);
  const failure = weakest?.expectedFailure ?? weakest?.label ?? 'wrapper_brittleness';
  const reportId = state.reportId || createReportId(analysis);
  const snapshot = buildReportSnapshot(analysis, sourceBundle);
  state.reportId = reportId;
  state.reportPath = reportPathFor(state.selectedProjectId, reportId);
  state.loadedServerReport = null;

  setText('hero-run-label', `diagnosis/${selected.profile.agentDomain}`);
  setText('hero-gate', gate);
  setText('hero-baseline', `${visible}%`);
  setText('hero-mutated', `${holdout}%`);
  setText('hero-drop', `${drop}%`);
  setText('hero-surface', weakest?.label ?? 'No weak surface detected');
  setText('hero-control', recommendation);
  setText('demo-profile', bundleType === 'benchmark' ? `${selected.label} / benchmark` : selected.label);
  setText('demo-variants', String(analysis.pack.variants.length));
  setText('demo-seed', seed);
  setText('demo-gate', gate);
  setText('report-baseline', `${visible}% pass`);
  setText('report-mutated', `${holdout}% pass`);
  setText('report-drop', `${drop}%`);
  setText('report-surface', weakest?.label ?? 'stable');
  setText('report-failure', failure);
  setText('report-control', recommendation);
  setText('report-seed', seed);
  setText('report-gate', gate);
  setText('report-id', reportId);
  setText('report-path', state.reportPath || '--');
  setText('report-saved', getSavedReports()[reportId] ? 'saved' : 'unsaved');
  setText('report-text', analysis.reportText);
  renderVariantTable(analysis);
  renderCaseResults(snapshot.caseResults ?? []);
  renderSchemaStatus(sourceBundle, selected.profile, analysis, bundleType);
  renderBenchmarkPanels(sourceBundle, analysis, preset);
  persistState();

  document.querySelector('#coverage-list').innerHTML = MUTATION_PACKS.map((pack) => `
    <span class="${coverage.includes(pack) ? 'is-active' : ''}">${formatPackName(pack)}</span>
  `).join('');

  document.querySelector('#hero-bars').innerHTML = analysis.familyStats.slice(0, 8).map((family) => {
    const height = Math.max(18, Math.round(100 - family.holdoutRate));
    return `<i style="--h: ${height}%"></i>`;
  }).join('');
}

async function runHttpRunner() {
  if (!state.runnerEndpoint.trim()) {
    state.runnerStatus = 'Add an endpoint first';
    setText('runner-status', state.runnerStatus);
    return;
  }

  if (!state.analysis) runDiagnosis();
  state.runnerStatus = 'Posting mutation pack...';
  setText('runner-status', state.runnerStatus);
  persistState();

  try {
    const profile = getSelectedRiskProfile();
    const response = await fetch(state.runnerEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        profile: profile.id,
        preset: state.bundlePresetId,
        thresholds: state.thresholds,
        pack: state.analysis.exportPack,
        variants: state.analysis.exportPack?.analysis?.variants ?? [],
      }),
    });

    if (!response.ok) {
      throw new Error(`Runner returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    const observations = normalizeRunnerObservations(payload, state.analysis);
    if (!Array.isArray(observations)) {
      throw new Error('Runner response must be an observation array, { observations }, or an AgentRunResult.');
    }

    state.customRunsText = JSON.stringify(observations, null, 2);
    state.useCustomInput = true;
    state.useObservedRuns = true;
    document.querySelector('#runs-json').value = state.customRunsText;
    document.querySelector('#custom-toggle').checked = true;
    document.querySelector('#observed-toggle').checked = true;
    state.runnerStatus = `Loaded ${observations.length} runner observations · Robustness Gap updated`;
    setText('runner-status', state.runnerStatus);
    persistState();
    runDiagnosis();
  } catch (error) {
    state.runnerStatus = error.message;
    setText('runner-status', state.runnerStatus);
    persistState();
  }
}

function normalizeRunnerObservations(payload, analysis) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.observations)) return payload.observations;
  const result = payload?.result ?? payload;
  if (!result || typeof result !== 'object') return null;
  const variantId = result.variantId
    ?? result.mutationId
    ?? result.metadata?.mutationId
    ?? analysis?.pack?.variants?.[0]?.id
    ?? 'prompt-visible';
  const passed = Boolean(result.passed ?? result.metadata?.passed);
  const score = Number(result.score ?? result.metadata?.score ?? (passed ? 90 : 25));
  return [
    {
      variantId,
      passed,
      score,
      latencyMs: Number(result.latencyMs ?? 0),
      notes: result.outputText ?? result.notes ?? 'External runner returned AgentRunResult.',
    },
  ];
}

function parseJsonInput(text, label) {
  const parsed = safeJsonParse(text);
  if (!parsed.ok) {
    return { error: `${label}: ${parsed.error.message}` };
  }
  return { value: parsed.value };
}

function renderVariantTable(analysis) {
  const rows = analysis.outcomes
    .map((outcome) => ({
      outcome,
      variant: analysis.pack.variants.find((item) => item.id === outcome.variantId || item.variantId === outcome.variantId),
    }))
    .filter(({ outcome }) => !outcome.passed || outcome.score < 80)
    .slice(0, 10);

  document.querySelector('#variant-table-body').innerHTML = rows.map(({ outcome, variant }) => `
    <tr>
      <td>${escapeHtml(variant?.title ?? outcome.variantId)}</td>
      <td>${escapeHtml(variant?.familyLabel ?? variant?.familyId ?? 'wrapper')}</td>
      <td class="${outcome.passed ? 'warn' : 'danger'}">${outcome.passed ? 'WARN' : 'FAIL'}</td>
      <td>${Math.round(outcome.score)}</td>
      <td>${Math.round(outcome.latencyMs ?? 0)}ms</td>
      <td>${escapeHtml(outcome.source ?? 'simulated')}</td>
    </tr>
  `).join('');
}

function renderSchemaStatus(bundle, profile, analysis, bundleType = detectBundleType(bundle)) {
  const inputSchemaLabel = bundleType === 'benchmark' ? 'Benchmark pack' : 'Harness bundle';
  const inputSchemaResult = bundleType === 'benchmark' ? validateBenchmarkPack(bundle) : validateHarnessBundle(bundle);
  const checks = [
    [inputSchemaLabel, inputSchemaResult],
    ['Observed runs', validateObservedRuns(state.useObservedRuns ? parseObservedRunsForValidation() : [])],
    ['Risk profile', validateRiskProfile(profile)],
    ['Diagnostic report', validateDiagnosticSnapshot(buildReportSnapshot(analysis, bundle))],
  ];

  document.querySelector('#schema-status-list').innerHTML = checks.map(([label, result]) => `
    <div class="${result.ok ? 'is-valid' : 'is-invalid'}">
      <strong>${label}</strong>
      <span>${result.ok ? 'valid' : escapeHtml(result.errors[0])}</span>
    </div>
  `).join('');
}

function renderBenchmarkPanels(sourceBundle, analysis) {
  const contractPanel = document.querySelector('#benchmark-contract-panel');
  const caseList = document.querySelector('#benchmark-case-list');

  if (!contractPanel || !caseList) return;

  if (!isBenchmarkPackShape(sourceBundle)) {
    setText('benchmark-summary-meta', 'Select the support or browser benchmark preset to inspect intent, contract, and release gates.');
    setText('benchmark-cases-meta', 'Cases appear when the active bundle is a benchmark pack.');
    contractPanel.innerHTML = `
      <article class="benchmark-empty">
        <h4>Profile demo mode</h4>
        <p>The current preset uses a generic harness bundle. Switch the bundle preset to the support benchmark to review cases, contract rules, and benchmark gates in the app.</p>
      </article>
    `;
    caseList.innerHTML = '';
    return;
  }

  const intent = analysis.bundle.intent ?? {};
  const contract = analysis.bundle.contract ?? {};
  const benchmark = analysis.bundle.benchmark ?? {};
  const harness = analysis.bundle.harness ?? {};
  const globalRules = contract.global ?? {};
  const finalResponders = Array.isArray(globalRules.finalResponders) ? globalRules.finalResponders : [];
  const summary = benchmark.summary ?? {};
  const caseCount = Array.isArray(benchmark.cases) ? benchmark.cases.length : 0;
  const toolCount = Array.isArray(harness.tools) ? harness.tools.length : 0;

  setText('benchmark-summary-meta', `${analysis.bundle.project} · ${caseCount} cases · ${toolCount} tools`);
  setText('benchmark-cases-meta', `${finalResponders.length || contract.agents?.length || 1} responder path · replayable seeds`);

  contractPanel.innerHTML = `
    <article>
      <span>Mission</span>
      <h4>${escapeHtml(analysis.bundle.project)}</h4>
      <p>${escapeHtml(intent.mission ?? 'No mission documented.')}</p>
      ${renderInlineList(intent.successSignals, 'Success signals')}
    </article>
    <article>
      <span>Must preserve</span>
      <h4>Contract rules</h4>
      ${renderBulletList(globalRules.must, 'No global must rules documented.')}
    </article>
    <article>
      <span>Never allow</span>
      <h4>Forbidden behavior</h4>
      ${renderBulletList(globalRules.mustNot, 'No global forbidden actions documented.')}
    </article>
    <article>
      <span>Gate summary</span>
      <h4>Release thresholds</h4>
      <ul>
        ${renderGateRow('Baseline pass', summary.baselinePassGate)}
        ${renderGateRow('Visible mutated pass', summary.visibleMutatedPassGate)}
        ${renderGateRow('Hidden holdout pass', summary.hiddenHoldoutPassGate)}
        ${renderGateRow('Max robustness gap', summary.maxRobustnessGap)}
      </ul>
    </article>
    <article>
      <span>Final responders</span>
      <h4>Agent boundary</h4>
      ${renderInlineList(finalResponders.length ? finalResponders : contract.agents?.map((item) => item.id), 'No responders documented.')}
    </article>
    <article>
      <span>Approved tools</span>
      <h4>Tool surface</h4>
      ${renderInlineList(harness.tools?.map((item) => item.name), 'No tools documented.')}
    </article>
  `;

  caseList.innerHTML = (benchmark.cases ?? []).map((item) => `
    <article>
      <span>${escapeHtml(item.id)}</span>
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.input ?? '')}</p>
      ${renderCaseSection('Milestones', item.expectedMilestones)}
      ${renderCaseSection('Assertions', item.assertions)}
      ${renderCaseSection('Forbidden', item.forbiddenActions)}
      <div class="benchmark-case-meta">
        <strong>seed ${escapeHtml(item.seed ?? '--')}</strong>
        <span>${escapeHtml((item.allowedAgents ?? []).join(', ') || 'unscoped')}</span>
      </div>
    </article>
  `).join('');
}

function validateHarnessBundle(bundle) {
  return validationResult(validateHarnessBundleSchema(bundle), validateHarnessBundleSchema.errors);
}

function validateBenchmarkPack(bundle) {
  return validationResult(validateBenchmarkPackSchema(bundle), validateBenchmarkPackSchema.errors);
}

function validateObservedRuns(runs) {
  return validationResult(validateObservedRunsSchema(runs), validateObservedRunsSchema.errors);
}

function validateRiskProfile(profile) {
  return validationResult(validateRiskProfileSchema(profile), validateRiskProfileSchema.errors);
}

function validateDiagnosticSnapshot(snapshot = buildReportSnapshot()) {
  return validationResult(validateDiagnosticReportSchema(snapshot), validateDiagnosticReportSchema.errors);
}

function validationResult(ok, errors = []) {
  return {
    ok,
    errors: (errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`.trim()),
  };
}

function parseObservedRunsForValidation() {
  if (!state.useCustomInput) {
    const preset = getSelectedBundlePreset();
    const profile = getSelectedRiskProfile(preset);
    const sourceBundle = resolvePresetBundle(preset, profile);
    return resolvePresetRuns(preset, sourceBundle);
  }
  const parsed = safeJsonParse(state.customRunsText);
  return parsed.ok ? parsed.value : null;
}

function weakestFamily(analysis) {
  const family = [...analysis.familyStats].sort((a, b) => a.holdoutRate - b.holdoutRate || b.gap - a.gap)[0];
  if (!family) return null;
  const variant = analysis.pack.variants.find((item) => item.familyId === family.id);
  return {
    label: family.label ?? formatPackName(variant?.familyId ?? 'wrapper surface'),
    expectedFailure: family.bottleneck,
  };
}

function gateFor(summary) {
  const failures = [
    summary.overallScore < state.thresholds.minOverallScore,
    summary.holdoutPassRate < state.thresholds.minHoldoutPass,
    summary.gap > state.thresholds.maxGap,
  ].filter(Boolean).length;

  if (failures === 0) return 'PASS';
  if (failures === 1) return 'WARN';
  return 'BLOCK';
}

function replaySeed(analysis) {
  const seed = analysis.pack.variants.find((variant) => Number.isFinite(variant.seed))?.seed;
  return seed ? String(seed) : `ha-${analysis.pack.variants.length}-${state.intensity}`;
}

function buildReportSnapshot(analysis = state.analysis, sourceBundle = activeSourceBundle()) {
  if (!analysis) return {};
  const preset = getSelectedBundlePreset();
  const profile = getSelectedRiskProfile(preset);
  return createReportSnapshot({
    analysis,
    reportId: state.reportId || createReportId(analysis),
    workspace: workspacePayload(),
    projectId: state.selectedProjectId || null,
    profileId: profile.id,
    presetId: state.bundlePresetId,
    thresholds: state.thresholds,
    sourceBundle,
  });
}

function saveReportSnapshot(message = 'Saved') {
  if (!state.analysis) return;
  const snapshot = activeReportSnapshot();
  const reports = getSavedReports();
  reports[snapshot.id] = snapshot;
  localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(reports));
  setText('report-saved', 'saved');
  showFeedback(message);
}

async function saveServerReport() {
  if (!state.analysis) return;
  if (state.sessionStatus !== 'authenticated' || !state.selectedProjectId) {
    saveReportSnapshot('Saved locally');
    showFeedback('Sign in and choose a project to save to the server');
    return;
  }
  const snapshot = activeReportSnapshot();
  try {
    const response = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: state.selectedProjectId,
        snapshot,
      }),
    });
    if (!response.ok) throw new Error(`Save failed with HTTP ${response.status}`);
    const payload = await response.json();
    state.reportId = payload.id ?? snapshot.id;
    state.reportPath = reportPathFor(state.selectedProjectId, state.reportId);
    setText('report-id', state.reportId);
    setText('report-path', state.reportPath);
    setText('report-saved', payload.storage ?? 'server');
    showFeedback('Saved server report');
    persistState();
    await refreshProjectResources();
    renderProjectResources();
  } catch (error) {
    showFeedback(error.message);
    saveReportSnapshot('Saved locally');
  }
}

async function loadServerReport() {
  if (!state.reportId) {
    showFeedback('No report id');
    return;
  }
  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(state.reportId)}`);
    if (!response.ok) throw new Error(`Load failed with HTTP ${response.status}`);
    const payload = await response.json();
    applyLoadedSnapshot(payload, {
      path: reportPathFor(state.selectedProjectId, payload.id ?? state.reportId),
    });
  } catch (error) {
    const local = getSavedReports()[state.reportId];
    if (local) {
      applyLoadedSnapshot(local, { localOnly: true });
      return;
    }
    showFeedback(error.message);
  }
}

function getSavedReports() {
  try {
    return JSON.parse(localStorage.getItem(REPORT_STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function updateWorkspaceField(key, value) {
  state[key] = value;
  persistState();
  trackEvent('workspace_updated', { key });
}

function workspacePayload() {
  const selectedWorkspace = currentWorkspace();
  const selectedProject = currentProject();
  return {
    accountEmail: state.session?.user?.email ?? state.accountEmail,
    workspaceName: selectedWorkspace?.name ?? state.workspaceName,
    workspaceId: selectedWorkspace?.id ?? state.selectedWorkspaceId ?? null,
    projectName: selectedProject?.name ?? state.projectName,
    projectId: selectedProject?.id ?? state.selectedProjectId ?? null,
    projectRole: selectedProject?.role ?? state.projectRole,
  };
}

function trackEvent(name, properties = {}) {
  if (!state.analyticsEnabled) return;
  const event = {
    name,
    properties,
    workspace: workspacePayload(),
    timestamp: new Date().toISOString(),
  };
  const events = readEvents();
  events.push(event);
  localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(events.slice(-100)));
  fetch('/api/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
  }).catch(() => {});
}

function readEvents() {
  try {
    return JSON.parse(localStorage.getItem(EVENT_STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function createReportId(analysis) {
  const profile = getSelectedRiskProfile();
  const source = `${analysis.bundle.project}-${profile.id}-${state.bundlePresetId}-${state.intensity}-${Date.now()}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `ha-${hash.toString(16)}`;
}

function activeSourceBundle() {
  if (state.useCustomInput) {
    return safeJsonParse(state.customBundleText).value ?? {};
  }
  const preset = getSelectedBundlePreset();
  const profile = getSelectedRiskProfile(preset);
  return resolvePresetBundle(preset, profile);
}

function activeReportSnapshot() {
  return state.loadedServerReport ?? buildReportSnapshot(state.analysis, activeSourceBundle());
}

function activeReportMarkdown() {
  return activeReportSnapshot()?.markdown ?? state.analysis?.reportText ?? '';
}

function reportPathFor(projectId, reportId) {
  if (!reportId) return '';
  return projectId
    ? `/projects/${encodeURIComponent(projectId)}/reports/${encodeURIComponent(reportId)}`
    : `/report/${encodeURIComponent(reportId)}`;
}

function reportUrl() {
  const path = state.reportPath || reportPathFor(state.selectedProjectId, state.reportId);
  return path ? new URL(path, window.location.origin).toString() : window.location.href;
}

function applyLoadedSnapshot(snapshot, options = {}) {
  if (!snapshot) return;
  state.loadedServerReport = snapshot;
  state.reportId = snapshot.id ?? state.reportId;
  state.reportPath = options.path ?? reportPathFor(state.selectedProjectId, state.reportId);
  setText('report-baseline', `${Math.round(snapshot.summary?.originalPassRate ?? 0)}% pass`);
  setText('report-mutated', `${Math.round(snapshot.summary?.mutatedPassRate ?? 0)}% pass`);
  setText('report-drop', `${Math.round(snapshot.summary?.robustnessDrop ?? 0)}%`);
  setText('report-gap-band', snapshot.summary?.robustnessBand?.label ?? '--');
  setText('report-surface', snapshot.deltas?.[0]?.mutationId ?? 'stable');
  setText('report-failure', snapshot.findings?.[0]?.failureTypes?.[0]?.id ?? 'wrapper_brittleness');
  setText('report-control', snapshot.findings?.[0]?.recommendation ?? 'Review controls');
  setText('report-seed', snapshot.mutationRuns?.[0]?.variantId ?? '--');
  setText('report-gate', String(snapshot.summary?.verdict ?? 'warn').toUpperCase());
  setText('report-id', state.reportId ?? '--');
  setText('report-path', state.reportPath || '--');
  setText('report-saved', options.localOnly ? 'local' : 'server');
  setText('report-text', snapshot.markdown ?? JSON.stringify(snapshot, null, 2));
  renderCaseResults(snapshot.caseResults ?? []);
  renderSnapshotVariantTable(snapshot);
  showFeedback(options.localOnly ? 'Loaded local report' : 'Loaded server report');
  persistState();
}

function renderSnapshotVariantTable(snapshot) {
  const runs = Array.isArray(snapshot.mutationRuns) ? snapshot.mutationRuns : [];
  document.querySelector('#variant-table-body').innerHTML = runs
    .filter((outcome) => !outcome.passed || (outcome.score ?? 100) < 80)
    .slice(0, 10)
    .map((outcome) => `
      <tr>
        <td>${escapeHtml(outcome.variantId ?? 'variant')}</td>
        <td>${escapeHtml(outcome.familyId ?? outcome.tier ?? 'wrapper')}</td>
        <td class="${outcome.passed ? 'warn' : 'danger'}">${outcome.passed ? 'WARN' : 'FAIL'}</td>
        <td>${Math.round(outcome.score ?? 0)}</td>
        <td>${Math.round(outcome.latencyMs ?? 0)}ms</td>
        <td>${escapeHtml(outcome.source ?? 'observed')}</td>
      </tr>
    `).join('');
}

function renderCaseResults(caseResults) {
  const container = document.querySelector('#case-results');
  if (!container) return;
  if (!Array.isArray(caseResults) || caseResults.length === 0) {
    container.innerHTML = `
      <article class="case-card case-card--empty">
        <h4>No case-level data</h4>
        <p>Case-level results appear for benchmark presets and saved benchmark reports.</p>
      </article>
    `;
    return;
  }

  container.innerHTML = caseResults.map((item) => `
    <article class="case-card">
      <div class="case-card__header">
        <span>${escapeHtml(item.id)}</span>
        <strong class="case-status case-status--${escapeHtml(item.status)}">${escapeHtml(item.status)}</strong>
      </div>
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.input ?? '')}</p>
      <div class="case-card__meta">
        <span>pass ${item.passRate == null ? '--' : `${item.passRate}%`}</span>
        <span>runs ${escapeHtml(item.observationCount ?? 0)}</span>
      </div>
      ${renderTagRow('Evidence', item.evidenceUsed)}
      ${renderTagRow('Forbidden', item.forbiddenActions)}
      ${renderTagRow('Scorers', item.scorerFields)}
      <div class="case-breakdown">
        ${(item.mutationBreakdown ?? []).map((mutation) => `
          <div>
            <strong>${escapeHtml(mutation.mutationId)}</strong>
            <span>${escapeHtml(mutation.passed)} pass / ${escapeHtml(mutation.failed)} fail</span>
          </div>
        `).join('')}
      </div>
    </article>
  `).join('');
}

function renderProjectResources() {
  const projectList = document.querySelector('#project-report-list');
  if (projectList) projectList.innerHTML = renderProjectReportList();

  const runnerSelect = document.querySelector('#runner-select');
  if (runnerSelect) runnerSelect.innerHTML = renderRunnerOptions();

  const projectRole = document.querySelector('#project-role-display');
  if (projectRole) projectRole.value = activeProjectRole();
}

function renderWorkspaceOptions() {
  const workspaces = state.session?.workspaces ?? [];
  return workspaces.map((workspace) => `
    <option value="${workspace.id}" ${workspace.id === state.selectedWorkspaceId ? 'selected' : ''}>${escapeHtml(workspace.name)}</option>
  `).join('');
}

function renderProjectOptions() {
  return state.workspaceProjects.map((project) => `
    <option value="${project.id}" ${project.id === state.selectedProjectId ? 'selected' : ''}>${escapeHtml(project.name)}</option>
  `).join('');
}

function renderRunnerOptions() {
  if (!state.projectRunners.length) {
    return '<option value="">No registered runners</option>';
  }
  return state.projectRunners.map((runner) => `
    <option value="${runner.id}" ${runner.id === state.selectedRunnerId ? 'selected' : ''}>${escapeHtml(runner.name)} · ${escapeHtml(runner.status)}</option>
  `).join('');
}

function renderProjectReportList() {
  if (!state.projectReports.length) {
    return '<p class="session-muted">No saved project reports yet.</p>';
  }

  return state.projectReports.map((report) => `
    <a class="project-report-item" href="${escapeHtml(reportPathFor(state.selectedProjectId, report.id))}">
      <strong>${escapeHtml(report.id)}</strong>
      <span>${escapeHtml(String(report.gate).toUpperCase())}</span>
      <small>${escapeHtml(report.createdAt)}</small>
    </a>
  `).join('');
}

function activeProjectRole() {
  return currentProject()?.role ?? state.projectRole ?? 'viewer';
}

function currentWorkspace() {
  return (state.session?.workspaces ?? []).find((workspace) => workspace.id === state.selectedWorkspaceId) ?? null;
}

function currentProject() {
  return state.workspaceProjects.find((project) => project.id === state.selectedProjectId) ?? null;
}

async function refreshSession() {
  state.sessionStatus = 'loading';
  try {
    const response = await fetch('/api/session', { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.session = payload;
    state.sessionStatus = 'authenticated';
    state.selectedWorkspaceId = payload.currentWorkspaceId || payload.workspaces?.[0]?.id || state.selectedWorkspaceId;
    state.accountEmail = payload.user.email ?? state.accountEmail;
    await refreshProjectsForWorkspace(payload.defaultProjectId);
  } catch {
    state.session = null;
    state.sessionStatus = 'anonymous';
    state.workspaceProjects = [];
    state.projectReports = [];
    state.projectRunners = [];
    state.selectedWorkspaceId = '';
    state.selectedProjectId = '';
    state.selectedRunnerId = '';
  }
  persistState();
}

async function refreshProjectsForWorkspace(preferredProjectId = null) {
  if (state.sessionStatus !== 'authenticated' || !state.selectedWorkspaceId) return;
  try {
    const payload = await fetchJson(`/api/workspaces/${encodeURIComponent(state.selectedWorkspaceId)}/projects`);
    state.workspaceProjects = payload.projects ?? [];
    const selected = state.workspaceProjects.find((project) => project.id === state.selectedProjectId)
      ? state.selectedProjectId
      : preferredProjectId && state.workspaceProjects.some((project) => project.id === preferredProjectId)
        ? preferredProjectId
        : state.workspaceProjects[0]?.id ?? '';
    state.selectedProjectId = selected;
    await refreshProjectResources();
  } catch {
    state.workspaceProjects = [];
    state.projectReports = [];
    state.projectRunners = [];
  }
}

async function refreshProjectResources() {
  if (state.sessionStatus !== 'authenticated' || !state.selectedProjectId) return;
  try {
    const [reportsPayload, runnersPayload] = await Promise.all([
      fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/reports`),
      fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/runners`),
    ]);
    state.projectReports = reportsPayload.reports ?? [];
    state.projectRunners = runnersPayload.runners ?? [];
    if (!state.projectRunners.some((runner) => runner.id === state.selectedRunnerId)) {
      state.selectedRunnerId = state.projectRunners[0]?.id ?? '';
    }
  } catch {
    state.projectReports = [];
    state.projectRunners = [];
  }
  persistState();
}

async function createWorkspaceFromDraft() {
  if (!state.workspaceDraftName.trim()) {
    showFeedback('Workspace name is required');
    return;
  }
  try {
    await fetchJson('/api/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: state.workspaceDraftName }),
    });
    await refreshSession();
    render();
    runDiagnosis();
    showFeedback('Workspace created');
  } catch (error) {
    showFeedback(error.message);
  }
}

async function createProjectFromDraft() {
  if (!state.selectedWorkspaceId || !state.projectDraftName.trim()) {
    showFeedback('Project name is required');
    return;
  }
  try {
    await fetchJson(`/api/workspaces/${encodeURIComponent(state.selectedWorkspaceId)}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: state.projectDraftName }),
    });
    await refreshProjectsForWorkspace();
    render();
    runDiagnosis();
    showFeedback('Project created');
  } catch (error) {
    showFeedback(error.message);
  }
}

async function registerRunner() {
  if (!state.selectedProjectId || !state.runnerRegistrationName.trim() || !state.runnerRegistrationEndpoint.trim()) {
    showFeedback('Runner name and endpoint are required');
    return;
  }
  try {
    await fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/runners`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: state.runnerRegistrationName,
        endpointUrl: state.runnerRegistrationEndpoint,
        sharedSecret: state.runnerRegistrationSecret,
      }),
    });
    await refreshProjectResources();
    renderProjectResources();
    showFeedback('Runner registered');
  } catch (error) {
    showFeedback(error.message);
  }
}

async function dispatchProjectJob() {
  if (state.sessionStatus !== 'authenticated' || !state.selectedProjectId || !state.selectedRunnerId) {
    showFeedback('Select a project and runner first');
    return;
  }
  if (!state.analysis) runDiagnosis();
  try {
    const payload = await fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        runnerId: state.selectedRunnerId,
        pack: state.analysis?.exportPack ?? {},
        thresholds: state.thresholds,
        profileId: getSelectedRiskProfile().id,
        presetId: state.bundlePresetId,
      }),
    });
    state.activeJobId = payload.jobId;
    state.activeJobStatus = `Job ${payload.jobId} queued`;
    setText('job-state', state.activeJobStatus);
    persistState();
    await pollJob(payload.jobId);
  } catch (error) {
    showFeedback(error.message);
  }
}

async function pollJob(jobId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const job = await fetchJson(`/api/jobs/${encodeURIComponent(jobId)}`);
    state.activeJobId = job.id;
    state.activeJobStatus = `Job ${job.id} ${job.status}`;
    setText('job-state', state.activeJobStatus);
    if (job.status === 'completed') {
      state.reportId = job.reportId;
      state.reportPath = reportPathFor(state.selectedProjectId, job.reportId);
      await refreshProjectResources();
      renderProjectResources();
      await loadServerReport();
      showFeedback('Runner job completed');
      persistState();
      return;
    }
    if (job.status === 'failed' || job.status === 'canceled') {
      showFeedback(job.error ?? `Runner job ${job.status}`);
      persistState();
      return;
    }
    await wait(1500);
  }
  showFeedback('Runner job still in progress');
}

async function hydrateRouteState() {
  const route = getRoute();
  scrollToRouteTarget();
  if ((route.kind !== 'report' && route.kind !== 'project-report') || state.sessionStatus !== 'authenticated') {
    return;
  }

  if (route.projectId && route.projectId !== state.selectedProjectId) {
    state.selectedProjectId = route.projectId;
    await refreshProjectResources();
  }

  state.reportId = route.reportId;
  await loadServerReport();
}

async function logout() {
  try {
    await fetch('/api/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    // Best-effort only.
  }
  state.session = null;
  state.sessionStatus = 'anonymous';
  state.workspaceProjects = [];
  state.projectReports = [];
  state.projectRunners = [];
  state.selectedWorkspaceId = '';
  state.selectedProjectId = '';
  state.selectedRunnerId = '';
  persistState();
  render();
  runDiagnosis();
}

function authStartHref() {
  const next = `${window.location.pathname}${window.location.hash}`;
  return `/api/auth/github/start?next=${encodeURIComponent(next)}`;
}

function getRoute(pathname = window.location.pathname) {
  const projectReportMatch = pathname.match(/^\/projects\/([^/]+)\/reports\/([^/]+)$/);
  if (projectReportMatch) {
    return {
      kind: 'project-report',
      projectId: decodeURIComponent(projectReportMatch[1]),
      reportId: decodeURIComponent(projectReportMatch[2]),
    };
  }

  const reportMatch = pathname.match(/^\/report\/([^/]+)$/);
  if (reportMatch) {
    return {
      kind: 'report',
      reportId: decodeURIComponent(reportMatch[1]),
    };
  }

  const docsMatch = pathname.match(/^\/docs\/([^/]+)$/);
  if (docsMatch) {
    return {
      kind: 'docs',
      slug: decodeURIComponent(docsMatch[1]),
    };
  }

  if (pathname === '/app') {
    return { kind: 'app' };
  }

  return { kind: 'home' };
}

function scrollToRouteTarget() {
  const route = getRoute();
  const docsPage = docPages.find((page) => page.slug === route.slug);
  const targetSelector = window.location.hash
    || (route.kind === 'docs' && docsPage ? `#${docsPage.id}` : '')
    || (route.kind === 'app' ? '#demo' : '')
    || (route.kind === 'report' || route.kind === 'project-report' ? '#report' : '')
    || '#top';
  const target = document.querySelector(targetSelector);
  if (!target) return;

  const scroll = () => {
    const top = target.getBoundingClientRect().top + window.scrollY - 92;
    window.scrollTo({ top, left: 0 });
  };

  window.requestAnimationFrame(scroll);
  window.setTimeout(scroll, 120);
}

function updateReportContextOnly() {
  if (!state.analysis) return;
  const preset = getSelectedBundlePreset();
  const profile = getSelectedRiskProfile(preset);
  const sourceBundle = activeSourceBundle();
  updateReport({
    preset,
    profile,
    sourceBundle,
    bundleType: detectBundleType(sourceBundle, preset),
    coverage: resolveBundleCoverage(sourceBundle, profile, preset).visibleFamilies,
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  return payload;
}

function renderTagRow(label, items = []) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return `
    <div class="case-tag-row">
      <strong>${escapeHtml(label)}</strong>
      <div>${items.slice(0, 4).map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>
    </div>
  `;
}

function bindIfPresent(selector, eventName, listener) {
  const element = document.querySelector(selector);
  if (element) element.addEventListener(eventName, listener);
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function copyText(text, message = 'Copied') {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  showFeedback(message);
}

function downloadText(filename, text, message = 'Downloaded') {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  showFeedback(message);
}

async function readJsonFile(event, target) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const parsed = safeJsonParse(text);
  if (!parsed.ok) {
    state.inputError = `${file.name}: ${parsed.error.message}`;
    setText('input-error', state.inputError);
    persistState();
    return;
  }

  const formatted = JSON.stringify(parsed.value, null, 2);
  if (target === 'bundle') {
    state.customBundleText = formatted;
    document.querySelector('#bundle-json').value = formatted;
  } else {
    state.customRunsText = formatted;
    document.querySelector('#runs-json').value = formatted;
  }
  state.useCustomInput = true;
  document.querySelector('#custom-toggle').checked = true;
  state.inputError = '';
  setText('input-error', '');
  persistState();
  runDiagnosis();
}

function updateThreshold(key, rawValue) {
  state.thresholds[key] = clampNumber(Number(rawValue), 0, 100);
  persistState();
  if (state.analysis) {
    const preset = getSelectedBundlePreset();
    const profile = getSelectedRiskProfile(preset);
    const sourceBundle = state.useCustomInput
      ? safeJsonParse(state.customBundleText).value ?? {}
      : resolvePresetBundle(preset, profile);
    updateReport({
      preset,
      profile,
      sourceBundle,
      bundleType: detectBundleType(sourceBundle, preset),
      coverage: resolveBundleCoverage(sourceBundle, profile, preset).visibleFamilies,
    });
  }
}

function showFeedback(message) {
  state.feedback = message;
  setText('action-feedback', message);
  window.clearTimeout(showFeedback.timer);
  showFeedback.timer = window.setTimeout(() => {
    state.feedback = '';
    setText('action-feedback', '');
  }, 2200);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      ...defaultState,
      ...saved,
      thresholds: {
        ...defaultState.thresholds,
        ...(saved.thresholds ?? {}),
      },
      workspaceProjects: [],
      projectReports: [],
      projectRunners: [],
      loadedServerReport: null,
      sessionStatus: 'loading',
      analysis: null,
      inputError: '',
      feedback: '',
    };
  } catch {
    return { ...defaultState, thresholds: { ...defaultState.thresholds } };
  }
}

function persistState() {
  const {
    analysis,
    inputError,
    feedback,
    session,
    sessionStatus,
    workspaceProjects,
    projectReports,
    projectRunners,
    loadedServerReport,
    activeJobStatus,
    ...persistable
  } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function formatPackName(value) {
  return String(value).replace(/_pack$/, '').replaceAll('_', ' ');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function renderInlineList(items, emptyMessage) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p>${escapeHtml(emptyMessage)}</p>`;
  }
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderBulletList(items, emptyMessage) {
  return renderInlineList(items, emptyMessage);
}

function renderCaseSection(label, items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return `
    <div class="benchmark-case-section">
      <strong>${escapeHtml(label)}</strong>
      <ul>${items.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>
  `;
}

function renderGateRow(label, value) {
  return `<li>${escapeHtml(label)} <strong>${escapeHtml(value ?? '--')}</strong></li>`;
}

function setText(id, value) {
  const element = document.querySelector(`#${id}`);
  if (element) element.textContent = value;
}

function observeReveals() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('is-visible');
      });
    },
    { threshold: 0.14 },
  );
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
}

function scrollToHashTarget() {
  if (!window.location.hash) return;
  const scroll = () => {
    const target = document.querySelector(window.location.hash);
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 92;
    window.scrollTo({ top, left: 0 });
  };
  window.requestAnimationFrame(scroll);
  window.setTimeout(scroll, 200);
  window.setTimeout(scroll, 600);
}

function installErrorMonitoring() {
  window.addEventListener('error', (event) => {
    trackEvent('client_error', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    trackEvent('unhandled_rejection', {
      message: String(event.reason?.message ?? event.reason ?? 'unknown rejection'),
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
