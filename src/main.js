import Ajv2020 from 'ajv/dist/2020';
import { marked } from 'marked';
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

const rawMarkdownDocs = import.meta.glob('../docs/**/*.md', {
  eager: true,
  import: 'default',
  query: '?raw',
});

const rawJsonDocs = import.meta.glob('../docs/**/*.json', {
  eager: true,
  import: 'default',
  query: '?raw',
});

const rawDocModules = {
  ...rawMarkdownDocs,
  ...rawJsonDocs,
};

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
    description: 'Starts with the selected risk profile and a sample workflow.',
  },
  'support-mvp-benchmark': {
    label: 'Support MVP benchmark pack',
    type: 'benchmark',
    description: 'Loads the support release scenario pack with built-in rules and test cases.',
    lockedProfileId: 'support-agent',
    bundle: supportMvpBenchmarkPack,
  },
  'browser-mvp-benchmark': {
    label: 'Browser MVP benchmark pack',
    type: 'benchmark',
    description: 'Loads the browser release scenario pack with origin, download, and cross-site failure modes.',
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

const docPages = createDocPages(rawDocModules);
const docPageMap = new Map(docPages.map((page) => [page.slug, page]));
const docSourceMap = new Map(docPages.map((page) => [page.sourcePath, page]));
const docsSidebarGroups = buildDocsSidebarGroups(docPages);
const docsSequence = docPages.filter((page) => page.slug !== '__missing__');
const docsHomePage = docPageMap.get('') ?? docPages[0];
const featuredDocPages = pickFeaturedDocPages(docPages);

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

const landingPaths = [
  ['Open the app', 'Use `/app` for guided evaluations, saved reports, validation checks, and connected runner workflows.'],
  ['Keep team features deeper', 'Sign-in, shared reports, and runner setup stay in the app so the product page can stay focused.'],
  ['Keep setup in docs', 'Installation, sign-in setup, deployment steps, and reference material live under `/docs` for easier rollout.'],
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
  if (getRoute().kind === 'docs') {
    state.session = null;
    state.sessionStatus = 'anonymous';
    render();
    await hydrateRouteState();
    window.addEventListener('hashchange', scrollToRouteTarget);
    return;
  }

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
  const activeReportUrl = activeReportPath ? new URL(activeReportPath, window.location.origin).toString() : '';

  if (route.kind === 'docs') {
    app.innerHTML = `
      <div class="site-shell site-shell--docs">
        ${renderTopbar(route, isAuthed)}
        ${renderDocsExperience(route)}
      </div>
    `;

    bindEvents();
    observeReveals();
    scrollToRouteTarget();
    return;
  }

  app.innerHTML = `
    <div class="site-shell">
      ${renderTopbar(route, isAuthed)}
      <main id="top">
        ${route.kind === 'home'
          ? renderHomeSurface(activeReportUrl)
          : renderAppSurface({
            preset,
            profile,
            profileLocked,
            activeReportUrl,
            isAuthed,
          })}
      </main>
    </div>
  `;

  bindEvents();
  observeReveals();
  scrollToRouteTarget();
}

function renderHomeSurface(activeReportUrl) {
  return `
    ${renderHomeHero()}
    ${renderProofStrip()}
    ${renderWorkflowSection()}
    ${renderProductSection()}
    ${renderHomeReportPreview(activeReportUrl)}
    ${renderLandingPathsSection()}
    ${renderDocsLandingSpotlight()}
    ${renderClosingSection({ href: '/app#demo', label: 'Run a robustness diagnosis' })}
  `;
}

function renderAppSurface({
  preset,
  profile,
  profileLocked,
  activeReportUrl,
  isAuthed,
}) {
  return `
    ${renderDemoSection({ preset, profile, profileLocked })}
    ${renderReportSection(activeReportUrl)}
    ${renderWorkspaceSection(isAuthed)}
    ${renderDocsOverview()}
    ${renderClosingSection({ href: '/docs', label: 'Open docs' })}
  `;
}

function renderHomeHero() {
  return `
    <section class="hero reveal">
      <div class="hero__copy">
        <p class="eyebrow">Agent reliability diagnosis</p>
        <h1>Turn agent fragility into a failing PR check.</h1>
        <p class="hero__lede">HarnessAmp stress-tests agent workflows under changing conditions, then highlights the failures, regressions, and controls teams should address before release.</p>
        <div class="hero__actions">
          <a class="button button--primary" href="/app#demo">Launch the app</a>
          <a class="button button--secondary" href="#report">View sample report</a>
        </div>
      </div>
      ${renderDiagnosticBoard()}
    </section>
  `;
}

function renderProofStrip() {
  return `<section class="proof-strip reveal" aria-label="Proof artifacts">${proofStats.map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('')}</section>`;
}

function renderWorkflowSection() {
  return `
    <section id="workflow" class="section section--split reveal">
      <div><p class="eyebrow">Robustness workflow</p><h2>Wrap -> Mutate -> Run -> Diagnose -> Gate</h2></div>
      <div class="workflow">${workflow.map(([title, detail], index) => `<article><span>${String(index + 1).padStart(2, '0')}</span><h3>${title}</h3><p>${detail}</p></article>`).join('')}</div>
    </section>
  `;
}

function renderProductSection() {
  return `
    <section id="product" class="section reveal">
      <div class="section__intro"><p class="eyebrow">Core product</p><h2>Reliability modules for agents that already run.</h2><p>HarnessAmp does not ask teams to adopt a new agent framework. It tests how the system behaves when real operating conditions shift.</p></div>
      <div class="module-grid">${modules.map(([title, detail]) => `<article><h3>${title}</h3><p>${detail}</p></article>`).join('')}</div>
    </section>
  `;
}

function renderHomeReportPreview(activeReportUrl) {
  return `
    <section id="report" class="section section--split reveal">
      <div class="section__intro">
        <p class="eyebrow">Diagnosis output</p>
        <h2>See the Robustness Gap before it reaches production.</h2>
        <p>The homepage keeps the report preview concise: baseline versus stressed performance, overall risk band, highest-risk surface, recommended next step, and a link you can share with the team.</p>
        <div class="hero__actions">
          <a class="button button--primary" href="/app#report">Open full report</a>
          <a class="button button--secondary" href="/docs/usage">Read usage docs</a>
        </div>
      </div>
      <div class="report">
        <div><span>Baseline</span><strong id="report-baseline">--</strong></div>
        <div><span>Stressed</span><strong id="report-mutated">--</strong></div>
        <div><span>Performance drop</span><strong class="danger" id="report-drop">--</strong></div>
        <div><span>Risk band</span><strong id="report-gap-band">--</strong></div>
        <div><span>Highest-risk surface</span><strong id="report-surface">--</strong></div>
        <div><span>Recommended next step</span><strong id="report-control">--</strong></div>
        <div><span>Release status</span><strong class="danger" id="report-gate">--</strong></div>
        <div><span>Share link</span><strong id="report-path">${activeReportUrl ? escapeHtml(activeReportUrl) : '--'}</strong></div>
      </div>
    </section>
  `;
}

function renderLandingPathsSection() {
  return `
    <section id="demo" class="section reveal">
      <div class="section__intro">
        <p class="eyebrow">How teams use it</p>
        <h2>Start with the product story here, then go deeper in the app.</h2>
        <p>The homepage explains the workflow. The interactive evaluation tools, team features, and setup guides are split between <code class="docs-inline-code">/app</code> and <code class="docs-inline-code">/docs</code> so the experience stays focused.</p>
      </div>
      <div class="module-grid">${landingPaths.map(([title, detail]) => `<article><h3>${title}</h3><p>${detail}</p></article>`).join('')}</div>
      <div class="hero__actions">
        <a class="button button--primary" href="/app#demo">Open app</a>
        <a class="button button--secondary" href="/docs/install">Install path</a>
        <a class="button button--secondary" href="/docs/github-oauth">Sign-in setup</a>
      </div>
    </section>
  `;
}

function renderDemoSection({ preset, profile, profileLocked }) {
  return `
    <section id="demo" class="section demo-section reveal">
      <div class="section__intro">
        <p class="eyebrow">Interactive evaluation</p>
        <h2>Run a sample assessment and review the result.</h2>
        <p>Use the guided app to test a sample workflow, review the resulting scorecard, and compare baseline performance with stressed conditions.</p>
        <div class="try-path">
          <span>01 Choose a starting point</span>
          <span>02 Review inputs</span>
          <span>03 Run evaluation</span>
          <span>04 Save or share</span>
        </div>
      </div>
      <div class="demo-console">
        <div class="demo-controls">
          <label><span>Starting point</span><select id="bundle-preset-select">${Object.entries(bundlePresets).map(([id, item]) => `<option value="${id}" ${id === state.bundlePresetId ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
          <label><span>Risk profile</span><select id="profile-select" ${profileLocked ? 'disabled' : ''}>${Object.entries(riskProfiles).map(([id, item]) => `<option value="${id}" ${id === profile.id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
          <label><span>Stress level</span><select id="intensity-select">${[1, 2, 3, 4].map((value) => `<option value="${value}" ${value === state.intensity ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
          <label class="check-control"><input id="observed-toggle" type="checkbox" ${state.useObservedRuns ? 'checked' : ''} /><span>Include sample outcomes</span></label>
          <label class="check-control"><input id="custom-toggle" type="checkbox" ${state.useCustomInput ? 'checked' : ''} /><span>Edit source data</span></label>
          <button class="button button--primary" id="run-demo" type="button">Run evaluation</button>
        </div>
        <div class="preset-note">
          <strong>${escapeHtml(preset.label)}</strong>
          <span>${escapeHtml(preset.description)}${profileLocked ? ` Locked to ${profile.label.toLowerCase()}.` : ''}</span>
        </div>
        <div class="threshold-controls">
          <label><span>Minimum overall score</span><input id="min-overall-score" type="number" min="0" max="100" value="${state.thresholds.minOverallScore}" /></label>
          <label><span>Minimum stressed score</span><input id="min-holdout-pass" type="number" min="0" max="100" value="${state.thresholds.minHoldoutPass}" /></label>
          <label><span>Maximum performance drop</span><input id="max-gap" type="number" min="0" max="100" value="${state.thresholds.maxGap}" /></label>
        </div>
        <div class="runner-controls">
          <label><span>Connected runner endpoint</span><input id="runner-endpoint" type="url" placeholder="https://runner.example.com/harnessamp" value="${escapeHtml(state.runnerEndpoint)}" /></label>
          <button class="button button--secondary" id="run-http-runner" type="button">Test connected runner</button>
          <span id="runner-status">${escapeHtml(state.runnerStatus)}</span>
        </div>
        <div class="input-workbench-shell ${state.useCustomInput ? 'is-active' : ''}">
          <p class="input-workbench-note">${state.useCustomInput
    ? 'Paste or upload source workflow data and run results when you want to test a custom scenario.'
    : 'Turn on Edit source data when you want to paste a workflow JSON or real run results.'}</p>
          <div class="input-workbench" id="input-workbench" ${state.useCustomInput ? '' : 'hidden'}>
          <label>
            <span>Source workflow JSON</span>
            <input id="bundle-file" type="file" accept="application/json,.json" />
            <textarea id="bundle-json" spellcheck="false">${escapeHtml(state.customBundleText)}</textarea>
          </label>
          <label>
            <span>Outcome data JSON</span>
            <input id="runs-file" type="file" accept="application/json,.json" />
            <textarea id="runs-json" spellcheck="false">${escapeHtml(state.customRunsText)}</textarea>
          </label>
          <p id="input-error" class="input-error">${escapeHtml(state.inputError)}</p>
        </div>
        </div>
        <div class="demo-result">
          <div><span>Profile</span><strong id="demo-profile">--</strong></div>
          <div><span>Coverage</span><strong id="demo-variants">--</strong></div>
          <div><span>Run reference</span><strong id="demo-seed">--</strong></div>
          <div><span>Status</span><strong class="danger" id="demo-gate">--</strong></div>
        </div>
        <div class="coverage-panel">
          <h3>Coverage</h3>
          <div id="coverage-list" class="coverage-list"></div>
        </div>
        <div class="schema-panel">
          <h3>Data validation</h3>
          <div id="schema-status-list" class="schema-status-list"></div>
        </div>
        <div class="benchmark-panel">
          <div class="benchmark-panel__header">
            <h3>Evaluation rules</h3>
            <p id="benchmark-summary-meta">Choose a scenario pack to inspect its rules, thresholds, and allowed behavior.</p>
          </div>
          <div id="benchmark-contract-panel" class="benchmark-contract-panel"></div>
        </div>
        <div class="benchmark-panel benchmark-panel--cases">
          <div class="benchmark-panel__header">
            <h3>Test scenarios</h3>
            <p id="benchmark-cases-meta">Scenario details appear when the selected starting point includes them.</p>
          </div>
          <div id="benchmark-case-list" class="benchmark-case-list"></div>
        </div>
      </div>
    </section>
  `;
}

function renderReportSection(activeReportUrl) {
  return `
    <section id="report" class="section report-section reveal">
      <div class="report-copy"><p class="eyebrow">Report</p><h2>Turn results into a clear next action.</h2><p>Review baseline versus stressed performance, the highest-risk surface, and the specific follow-up needed before rollout.</p></div>
      <div class="report">
        <div><span>Baseline</span><strong id="report-baseline">--</strong></div>
        <div><span>Stressed</span><strong id="report-mutated">--</strong></div>
        <div><span>Performance drop</span><strong class="danger" id="report-drop">--</strong></div>
        <div><span>Risk band</span><strong id="report-gap-band">--</strong></div>
        <div><span>Highest-risk surface</span><strong id="report-surface">--</strong></div>
        <div><span>Failure pattern</span><strong id="report-failure">--</strong></div>
        <div><span>Recommended next step</span><strong id="report-control">--</strong></div>
        <div><span>Release status</span><strong class="danger" id="report-gate">--</strong></div>
        <div><span>Share link</span><strong id="report-path">${activeReportUrl ? escapeHtml(activeReportUrl) : '--'}</strong></div>
      </div>
      <div class="export-actions">
        <button class="button button--secondary" id="copy-report" type="button">Copy report</button>
        <button class="button button--secondary" id="download-report" type="button">Download report</button>
        <button class="button button--secondary" id="download-report-json" type="button">Download report JSON</button>
        <button class="button button--secondary" id="download-pack" type="button">Download test package</button>
        <button class="button button--secondary" id="copy-ci" type="button">Copy workflow snippet</button>
        <button class="button button--secondary" id="save-report" type="button">Save to this browser</button>
        <button class="button button--secondary" id="save-server-report" type="button">Save to workspace</button>
        <button class="button button--secondary" id="load-server-report" type="button">Open saved report</button>
        <button class="button button--secondary" id="copy-report-link" type="button">Copy share link</button>
        <span class="action-feedback" id="action-feedback">${escapeHtml(state.feedback)}</span>
      </div>
      <div class="variant-panel">
        <h3>Scenarios to review</h3>
        <div class="variant-table-wrap">
          <table class="variant-table">
            <thead><tr><th>Mutation</th><th>Surface</th><th>Status</th><th>Score</th><th>Latency</th><th>Source</th></tr></thead>
            <tbody id="variant-table-body"></tbody>
          </table>
        </div>
      </div>
      <div class="case-panel">
        <h3>Scenario breakdown</h3>
        <div id="case-results" class="case-results"></div>
      </div>
      <details class="report-details">
        <summary>View raw report</summary>
        <pre class="report-text" id="report-text"></pre>
      </details>
    </section>
  `;
}

function renderWorkspaceSection(isAuthed) {
  return `
    <section id="workspace" class="section workspace-section reveal">
      <div class="section__intro"><p class="eyebrow">Team access</p><h2>Manage saved reports and connected runners.</h2><p>You can explore the app without signing in. Sign in when you want shared reports, team projects, and connected runner setup.</p></div>
      <div class="workspace-grid">
        <div class="workspace-panel workspace-panel--auth">
          <h3>Account</h3>
          ${isAuthed ? `
            <div class="session-card">
              <strong>${escapeHtml(state.session.user.name)}</strong>
              <span>${escapeHtml(state.session.user.login)}</span>
              <small>${escapeHtml(state.session.user.email ?? 'no public email')}</small>
            </div>
            <label><span>Team</span><select id="workspace-select">${renderWorkspaceOptions()}</select></label>
            <label><span>Project</span><select id="project-select">${renderProjectOptions()}</select></label>
            <label><span>Access level</span><input id="project-role-display" type="text" value="${escapeHtml(activeProjectRole())}" disabled /></label>
            <div class="inline-actions">
              <label><span>New team</span><input id="workspace-draft-name" type="text" value="${escapeHtml(state.workspaceDraftName)}" /></label>
              <button class="button button--secondary" id="create-workspace" type="button">Create team</button>
            </div>
            <div class="inline-actions">
              <label><span>New project</span><input id="project-draft-name" type="text" value="${escapeHtml(state.projectDraftName)}" /></label>
              <button class="button button--secondary" id="create-project" type="button">Create project</button>
            </div>
          ` : `
            <div class="session-empty">
              <p>Sign in to sync reports, manage team projects, and reuse connected runners across devices.</p>
              <a class="button button--primary" href="${escapeHtml(authStartHref())}">Sign in with GitHub</a>
            </div>
          `}
          <label class="check-control"><input id="analytics-toggle" type="checkbox" ${state.analyticsEnabled ? 'checked' : ''} /><span>Allow product analytics</span></label>
        </div>
        <div class="workspace-panel">
          <h3>Connected runners</h3>
          ${isAuthed ? `
            <label><span>Runner name</span><input id="runner-registration-name" type="text" value="${escapeHtml(state.runnerRegistrationName)}" /></label>
            <label><span>Runner endpoint</span><input id="runner-registration-endpoint" type="url" value="${escapeHtml(state.runnerRegistrationEndpoint)}" placeholder="https://runner.example.com/harnessamp" /></label>
            <label><span>Access token</span><input id="runner-registration-secret" type="password" value="${escapeHtml(state.runnerRegistrationSecret)}" placeholder="Optional bearer token" /></label>
            <div class="inline-actions">
              <button class="button button--secondary" id="register-runner" type="button">Register runner</button>
              <button class="button button--secondary" id="dispatch-job" type="button">Start run</button>
            </div>
            <label><span>Active runner</span><select id="runner-select">${renderRunnerOptions()}</select></label>
            <p class="runner-state" id="job-state">${escapeHtml(state.activeJobStatus || 'No run started')}</p>
          ` : `
            <p class="session-muted">Sign in to add runners and start saved runs.</p>
          `}
        </div>
        <div class="workspace-panel">
          <h3>Saved reports</h3>
          ${isAuthed ? `
            <p class="session-muted">Saved reports stay attached to the selected project and can be reopened from any signed-in device.</p>
            <div id="project-report-list" class="project-report-list">${renderProjectReportList()}</div>
          ` : `
            <p class="session-muted">Without signing in, saved reports stay in this browser only.</p>
          `}
        </div>
      </div>
    </section>
  `;
}

function renderDiagnosticBoard() {
  return `
    <div class="diagnostic-board" aria-label="Live robustness diagnosis">
      <div class="board-header"><span id="hero-run-label">latest run</span><strong id="hero-gate">RUN</strong></div>
      <div class="scoreline">
        <div><span>Baseline</span><b id="hero-baseline">--</b></div>
        <div><span>Stressed</span><b class="warn" id="hero-mutated">--</b></div>
        <div><span>Drop</span><b class="danger" id="hero-drop">--</b></div>
      </div>
      <div class="trace"><span>highest risk</span><strong id="hero-surface">waiting for run</strong></div>
      <div class="trace"><span>next step</span><strong id="hero-control">run an evaluation to generate a release-ready summary</strong></div>
      <div class="mutation-map" id="hero-bars">${Array.from({ length: 8 }, (_, index) => `<i style="--h: ${36 + index * 6}%"></i>`).join('')}</div>
    </div>
  `;
}

function renderClosingSection({ href, label }) {
  return `
    <section class="closing reveal">
      <p>If your agent breaks when conditions change, it was not production-ready.</p>
      <h2>Prove your agents still work when conditions change.</h2>
      <a class="button button--primary" href="${escapeHtml(href)}">${escapeHtml(label)}</a>
    </section>
  `;
}

function renderTopbar(route, isAuthed) {
  return `
    <header class="topbar">
      <a class="brand" href="/" aria-label="HarnessAmp home">
        <span class="brand__mark brand__mark--image"><img src="/logo.png" alt="" /></span>
        <span><strong>HarnessAmp</strong><small>Reliability testing</small></span>
      </a>
      <nav class="topbar__nav" aria-label="Primary navigation">
        <a href="/" ${route.kind === 'home' ? 'aria-current="page"' : ''}>Product</a>
        <a href="/app" ${route.kind === 'app' || route.kind === 'report' || route.kind === 'project-report' ? 'aria-current="page"' : ''}>App</a>
        <a href="/docs" ${route.kind === 'docs' ? 'aria-current="page"' : ''}>Docs</a>
        <a href="/app#demo">Demo</a>
        <a href="/app#report">Reports</a>
      </nav>
      ${isAuthed
        ? '<button class="nav-cta nav-cta--button" id="logout-button" type="button">Log out</button>'
        : `<a class="nav-cta" href="${escapeHtml(authStartHref())}">Sign in</a>`}
    </header>
  `;
}

function renderDocsOverview() {
  return `
    <section id="docs-preview" class="section reveal">
      <div class="section__intro">
        <p class="eyebrow">Documentation</p>
        <h2>Open setup and reference material without leaving the product.</h2>
        <p>Browse installation steps, sign-in setup, usage guides, and reference pages in a dedicated docs area.</p>
      </div>
      <div class="docs-grid">
        ${featuredDocPages.map((page) => `
          <article>
            <span>${escapeHtml(page.groupLabel)}</span>
            <h3>${escapeHtml(page.title)}</h3>
            <p>${escapeHtml(page.description)}</p>
            <a class="button button--secondary" href="${escapeHtml(page.routePath)}">Open page</a>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderDocsExperience(route) {
  const page = docPageMap.get(route.slug ?? '') ?? docsHomePage;
  const isMissing = !docPageMap.has(route.slug ?? '');
  const rendered = renderDocBody(page);
  const pageIndex = docsSequence.findIndex((item) => item.slug === page.slug);
  const previous = pageIndex > 0 ? docsSequence[pageIndex - 1] : null;
  const next = pageIndex >= 0 ? docsSequence[pageIndex + 1] ?? null : null;

  return `
    <main id="docs-top" class="docs-shell">
      <aside class="docs-sidebar reveal is-visible">
        <div class="docs-sidebar__header">
          <p class="eyebrow">Documentation</p>
          <h1>HarnessAmp docs</h1>
          <p>Reference guides, setup notes, and technical details for teams evaluating or deploying HarnessAmp.</p>
        </div>
        <a class="docs-home-link ${page.slug === '' ? 'is-active' : ''}" href="/docs">Overview</a>
        ${docsSidebarGroups.map((group) => `
          <section class="docs-sidebar__group">
            <span>${escapeHtml(group.label)}</span>
            ${group.pages.map((item) => `
              <a class="${item.slug === page.slug ? 'is-active' : ''}" href="${escapeHtml(item.routePath)}" ${item.slug === page.slug ? 'aria-current="page"' : ''}>
                ${escapeHtml(item.sidebarTitle)}
              </a>
            `).join('')}
          </section>
        `).join('')}
      </aside>

      <section class="docs-page">
        <div class="docs-page__hero reveal is-visible">
          <div class="docs-breadcrumbs">${renderDocBreadcrumbs(page)}</div>
          <div class="docs-page__title">
            <p class="eyebrow">${isMissing ? 'Docs / Missing page' : `Docs / ${escapeHtml(page.groupLabel)}`}</p>
            <h2>${escapeHtml(isMissing ? 'Page not found' : page.title)}</h2>
            <p>${escapeHtml(isMissing ? 'This docs route does not exist in the current repository snapshot. Use the sidebar to jump back into the published pages.' : page.description)}</p>
          </div>
          <div class="docs-meta">
            <span>${escapeHtml(page.routePath)}</span>
            <span>${escapeHtml(page.sourcePath)}</span>
            <span>${escapeHtml(page.format.toUpperCase())}</span>
          </div>
        </div>

        ${page.slug === '' ? renderDocsLandingSpotlight() : ''}

        <div class="docs-page__body">
          <article class="docs-article reveal is-visible">
            ${isMissing ? `
              <div class="docs-callout">
                <strong>Missing page</strong>
                <p>The requested docs path is not available. Open the docs overview or a page from the sidebar.</p>
              </div>
            ` : rendered.html}
          </article>
          <aside class="docs-toc reveal is-visible">
            <span>On this page</span>
            ${renderDocsToc(rendered.toc)}
          </aside>
        </div>

        <nav class="docs-pagination reveal is-visible" aria-label="Docs pagination">
          ${previous ? `<a class="docs-pagination__link" href="${escapeHtml(previous.routePath)}"><span>Previous</span><strong>${escapeHtml(previous.title)}</strong></a>` : '<div class="docs-pagination__link docs-pagination__link--empty"></div>'}
          ${next ? `<a class="docs-pagination__link" href="${escapeHtml(next.routePath)}"><span>Next</span><strong>${escapeHtml(next.title)}</strong></a>` : '<div class="docs-pagination__link docs-pagination__link--empty"></div>'}
        </nav>
      </section>
    </main>
  `;
}

function renderDocsLandingSpotlight() {
  return `
    <section class="docs-landing reveal is-visible">
      <div class="docs-landing__intro">
        <p class="eyebrow">Start here</p>
        <h3>Open the essentials first.</h3>
        <p>Jump straight to the overview, install path, usage guide, release workflow, and reference pages from one place.</p>
      </div>
      <div class="docs-grid docs-grid--compact">
        ${featuredDocPages.map((page) => `
          <article>
            <span>${escapeHtml(page.groupLabel)}</span>
            <h3>${escapeHtml(page.title)}</h3>
            <p>${escapeHtml(page.description)}</p>
            <a class="button button--secondary" href="${escapeHtml(page.routePath)}">Read page</a>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderDocsToc(items) {
  if (!items.length) {
    return '<p class="docs-toc__empty">This page has no section headings.</p>';
  }
  return `
    <div class="docs-toc__list">
      ${items.map((item) => `<a class="docs-toc__item docs-toc__item--depth-${item.depth}" href="#${escapeHtml(item.id)}">${escapeHtml(item.text)}</a>`).join('')}
    </div>
  `;
}

function renderDocBreadcrumbs(page) {
  const segments = page.slug ? page.slug.split('/') : [];
  const crumbs = [{ label: 'Docs', href: '/docs' }];
  segments.forEach((segment, index) => {
    const slug = segments.slice(0, index + 1).join('/');
    const doc = docPageMap.get(slug);
    crumbs.push({
      label: doc?.title ?? humanizeDocSegment(segment),
      href: doc?.routePath ?? `/docs/${slug}`,
    });
  });

  return crumbs.map((crumb, index) => index === crumbs.length - 1
    ? `<strong>${escapeHtml(crumb.label)}</strong>`
    : `<a href="${escapeHtml(crumb.href)}">${escapeHtml(crumb.label)}</a>`).join('<span>/</span>');
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
  bindIfPresent('#save-report', 'click', () => saveReportSnapshot('Saved to this browser'));
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
  const bundleLabel = preset.type === 'benchmark' ? 'Scenario pack' : 'Source workflow';
  trackEvent('diagnosis_started', { profile: selected.id, preset: state.bundlePresetId, customInput: state.useCustomInput });
  const customBundle = state.useCustomInput ? parseJsonInput(state.customBundleText, bundleLabel) : null;
  const customRuns = state.useCustomInput && state.useObservedRuns ? parseJsonInput(state.customRunsText, 'Outcome data') : null;

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

  setText('hero-run-label', `${selected.label} assessment`);
  setText('hero-gate', gate);
  setText('hero-baseline', `${visible}%`);
  setText('hero-mutated', `${holdout}%`);
  setText('hero-drop', `${drop}%`);
  setText('hero-surface', weakest?.label ?? 'No weak surface detected');
  setText('hero-control', recommendation);
  setText('demo-profile', bundleType === 'benchmark' ? `${selected.label} / benchmark` : selected.label);
  setText('demo-variants', `${analysis.pack.variants.length} scenarios`);
  setText('demo-seed', seed);
  setText('demo-gate', gate);
  setText('report-baseline', `${visible}% pass`);
  setText('report-mutated', `${holdout}% pass`);
  setText('report-drop', `${drop}%`);
  setText('report-gap-band', analysis.summary.robustnessBand?.label ?? fallbackRobustnessBand(analysis.summary.gap));
  setText('report-surface', weakest?.label ?? 'stable');
  setText('report-failure', failure);
  setText('report-control', recommendation);
  setText('report-seed', seed);
  setText('report-gate', gate);
  setText('report-id', reportId);
  setText('report-path', reportUrl());
  setText('report-saved', getSavedReports()[reportId] ? 'browser' : 'unsaved');
  setText('report-text', analysis.reportText);
  renderVariantTable(analysis);
  renderCaseResults(snapshot.caseResults ?? []);
  renderSchemaStatus(sourceBundle, selected.profile, analysis, bundleType);
  renderBenchmarkPanels(sourceBundle, analysis, preset);
  persistState();

  const coverageList = document.querySelector('#coverage-list');
  if (coverageList) {
    coverageList.innerHTML = MUTATION_PACKS.map((pack) => `
      <span class="${coverage.includes(pack) ? 'is-active' : ''}">${formatPackName(pack)}</span>
    `).join('');
  }

  const heroBars = document.querySelector('#hero-bars');
  if (heroBars) {
    heroBars.innerHTML = analysis.familyStats.slice(0, 8).map((family) => {
      const height = Math.max(18, Math.round(100 - family.holdoutRate));
      return `<i style="--h: ${height}%"></i>`;
    }).join('');
  }
}

async function runHttpRunner() {
  if (!state.runnerEndpoint.trim()) {
    state.runnerStatus = 'Add a runner URL to test a connected workflow.';
    setText('runner-status', state.runnerStatus);
    return;
  }

  if (!state.analysis) runDiagnosis();
  state.runnerStatus = 'Sending the assessment to the connected runner...';
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
    state.runnerStatus = `Loaded ${observations.length} run result${observations.length === 1 ? '' : 's'} and refreshed the report.`;
    setText('runner-status', state.runnerStatus);
    persistState();
    runDiagnosis();
  } catch (error) {
    state.runnerStatus = friendlyRunnerError(error);
    setText('runner-status', state.runnerStatus);
    persistState();
  }
}

function friendlyRunnerError(error) {
  const message = String(error?.message ?? error ?? '');
  if (message === 'Failed to fetch') {
    return 'Runner is unreachable. Check the URL and allow cross-origin POST requests.';
  }
  return message;
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
      notes: result.outputText ?? result.notes ?? 'Connected runner returned a result.',
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

  const body = document.querySelector('#variant-table-body');
  if (!body) return;

  body.innerHTML = rows.map(({ outcome, variant }) => `
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
  const inputSchemaLabel = bundleType === 'benchmark' ? 'Scenario pack' : 'Source workflow';
  const inputSchemaResult = bundleType === 'benchmark' ? validateBenchmarkPack(bundle) : validateHarnessBundle(bundle);
  const checks = [
    [inputSchemaLabel, inputSchemaResult],
    ['Outcome data', validateObservedRuns(state.useObservedRuns ? parseObservedRunsForValidation() : [])],
    ['Selected setup', validateRiskProfile(profile)],
    ['Generated report', validateDiagnosticSnapshot(buildReportSnapshot(analysis, bundle))],
  ];

  const schemaList = document.querySelector('#schema-status-list');
  if (!schemaList) return;

  schemaList.innerHTML = checks.map(([label, result]) => `
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
    setText('benchmark-summary-meta', 'Choose a scenario pack to review its rules, thresholds, and allowed behavior.');
    setText('benchmark-cases-meta', 'Scenario details appear when the selected pack includes them.');
    contractPanel.innerHTML = `
      <article class="benchmark-empty">
        <h4>Example setup</h4>
        <p>The current starting point uses sample workflow data. Switch to a scenario pack to review cases, checks, and release thresholds.</p>
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
  const responsePathCount = finalResponders.length || contract.agents?.length || 1;
  setText('benchmark-cases-meta', `${responsePathCount} response path${responsePathCount === 1 ? '' : 's'} · replayable scenarios`);

  contractPanel.innerHTML = `
    <article>
      <span>Mission</span>
      <h4>${escapeHtml(analysis.bundle.project)}</h4>
      <p>${escapeHtml(intent.mission ?? 'No mission documented.')}</p>
      ${renderInlineList(intent.successSignals, 'Success signals')}
    </article>
    <article>
      <span>Expected behavior</span>
      <h4>Critical checks</h4>
      ${renderBulletList(globalRules.must, 'No required behaviors documented.')}
    </article>
    <article>
      <span>Never allow</span>
      <h4>Forbidden behavior</h4>
      ${renderBulletList(globalRules.mustNot, 'No global forbidden actions documented.')}
    </article>
    <article>
      <span>Release decision</span>
      <h4>Passing thresholds</h4>
      <ul>
        ${renderGateRow('Baseline score', summary.baselinePassGate)}
        ${renderGateRow('Observed stress score', summary.visibleMutatedPassGate)}
        ${renderGateRow('Holdout stress score', summary.hiddenHoldoutPassGate)}
        ${renderGateRow('Maximum performance drop', summary.maxRobustnessGap)}
      </ul>
    </article>
    <article>
      <span>Coverage</span>
      <h4>Included agents</h4>
      ${renderInlineList(finalResponders.length ? finalResponders : contract.agents?.map((item) => item.id), 'No agent coverage documented.')}
    </article>
    <article>
      <span>Allowed tools</span>
      <h4>Tool access</h4>
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
        <strong>reference ${escapeHtml(item.seed ?? '--')}</strong>
        <span>${escapeHtml((item.allowedAgents ?? []).join(', ') || 'all agents')}</span>
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
  setText('report-saved', 'browser');
  showFeedback(message);
}

async function saveServerReport() {
  if (!state.analysis) return;
  if (state.sessionStatus !== 'authenticated' || !state.selectedProjectId) {
    saveReportSnapshot('Saved to this browser');
    showFeedback('Sign in and choose a project to save to the workspace.');
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
    setText('report-path', reportUrl());
    setText('report-saved', payload.storage === 'server' ? 'workspace' : (payload.storage ?? 'workspace'));
    showFeedback('Saved to the workspace');
    persistState();
    await refreshProjectResources();
    renderProjectResources();
  } catch (error) {
    showFeedback(error.message);
    saveReportSnapshot('Saved to this browser');
  }
}

async function loadServerReport() {
  if (!state.reportId) {
    showFeedback('Save or open a report first.');
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
  setText('report-gap-band', snapshot.summary?.robustnessBand?.label ?? fallbackRobustnessBand(snapshot.summary?.robustnessDrop));
  setText('report-surface', snapshot.deltas?.[0]?.mutationId ? humanizeDocSegment(snapshot.deltas[0].mutationId) : 'Stable');
  setText('report-failure', snapshot.findings?.[0]?.failureTypes?.[0]?.id ? humanizeDocSegment(snapshot.findings[0].failureTypes[0].id) : 'Review needed');
  setText('report-control', snapshot.findings?.[0]?.recommendation ?? 'Review controls');
  setText('report-seed', snapshot.mutationRuns?.[0]?.variantId ?? '--');
  setText('report-gate', String(snapshot.summary?.verdict ?? 'warn').toUpperCase());
  setText('report-id', state.reportId ?? '--');
  setText('report-path', reportUrl());
  setText('report-saved', options.localOnly ? 'browser' : 'workspace');
  setText('report-text', snapshot.markdown ?? JSON.stringify(snapshot, null, 2));
  renderCaseResults(snapshot.caseResults ?? []);
  renderSnapshotVariantTable(snapshot);
  showFeedback(options.localOnly ? 'Opened the browser-saved report' : 'Opened the workspace report');
  persistState();
}

function fallbackRobustnessBand(gap) {
  const value = Number(gap);
  if (!Number.isFinite(value)) return '--';
  if (value >= 30) return 'Release Risk (high)';
  if (value >= 15) return 'Regression Risk (medium)';
  return 'Stable (low)';
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
    if (!payload?.user) {
      throw new Error('anonymous');
    }
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
  if (getRoute().kind !== 'docs') runDiagnosis();
}

function authStartHref() {
  const next = `${window.location.pathname}${window.location.hash}`;
  return `/api/auth/github/start?next=${encodeURIComponent(next)}`;
}

function getRoute(pathname = window.location.pathname) {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname;
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

  if (normalizedPath === '/docs') {
    return {
      kind: 'docs',
      slug: '',
    };
  }

  const docsMatch = normalizedPath.match(/^\/docs\/(.+)$/u);
  if (docsMatch) {
    return {
      kind: 'docs',
      slug: decodeURIComponent(docsMatch[1]),
    };
  }

  if (normalizedPath === '/app') {
    return { kind: 'app' };
  }

  return { kind: 'home' };
}

function scrollToRouteTarget() {
  const route = getRoute();
  const targetSelector = window.location.hash
    || (route.kind === 'docs' ? '#docs-top' : '')
    || (route.kind === 'app' ? '#demo' : '')
    || (route.kind === 'report' || route.kind === 'project-report' ? '#report' : '')
    || '#top';
  const target = document.querySelector(targetSelector);
  if (!target) return;

  const scroll = () => {
    target.classList.add('is-visible');
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
      runnerStatus: '',
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
    runnerStatus,
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

function createDocPages(rawModules) {
  return Object.entries(rawModules)
    .map(([modulePath, body]) => createDocPage(modulePath, body))
    .sort(compareDocPages);
}

function createDocPage(modulePath, body) {
  const sourcePath = normalizeDocFilePath(modulePath.replace('../docs/', ''));
  const format = sourcePath.endsWith('.json') ? 'json' : 'markdown';
  const parsedJson = format === 'json' ? safeJsonParse(body) : null;
  const slug = sourcePathToSlug(sourcePath);
  const title = format === 'json'
    ? extractJsonDocTitle(parsedJson?.ok ? parsedJson.value : null, sourcePath)
    : extractMarkdownTitle(body, sourcePath);
  const description = format === 'json'
    ? extractJsonDocDescription(parsedJson?.ok ? parsedJson.value : null, title)
    : extractMarkdownDescription(body, title);
  const groupKey = resolveDocGroupKey(sourcePath, slug);

  return {
    sourcePath,
    format,
    slug,
    routePath: slug ? `/docs/${slug}` : '/docs',
    title,
    sidebarTitle: title,
    description,
    groupKey,
    groupLabel: resolveDocGroupLabel(groupKey),
    body: String(body).trim(),
    rendered: null,
  };
}

function compareDocPages(left, right) {
  const groupOrder = {
    overview: 0,
    guides: 1,
    concepts: 2,
    adapters: 3,
    reference: 4,
    schemas: 5,
  };
  const leftGroup = groupOrder[left.groupKey] ?? 99;
  const rightGroup = groupOrder[right.groupKey] ?? 99;
  if (leftGroup !== rightGroup) return leftGroup - rightGroup;

  const leftWeight = resolveDocWeight(left.sourcePath);
  const rightWeight = resolveDocWeight(right.sourcePath);
  if (leftWeight !== rightWeight) return leftWeight - rightWeight;

  return left.title.localeCompare(right.title);
}

function resolveDocWeight(sourcePath) {
  const explicitOrder = [
    'index.md',
    'install.md',
    'installation.md',
    'usage.md',
    'cli.md',
    'examples.md',
    'benchmarks.md',
    'ci-gates.md',
    'mutation-packs.md',
    'mutation-engine.md',
    'architecture.md',
    'testing.md',
    'troubleshooting.md',
    'reference/index.md',
    'reference/api.md',
    'schemas.md',
  ];
  const explicitIndex = explicitOrder.indexOf(sourcePath);
  if (explicitIndex !== -1) return explicitIndex;
  if (sourcePath.endsWith('/index.md')) return 30;
  if (sourcePath.endsWith('.json')) return 90;
  return 50;
}

function resolveDocGroupKey(sourcePath, slug) {
  if (!slug) return 'overview';
  const segments = sourcePath.split('/');
  if (segments.length === 1) return 'guides';
  return segments[0];
}

function resolveDocGroupLabel(groupKey) {
  const labels = {
    overview: 'Overview',
    guides: 'Guides',
    concepts: 'Concepts',
    adapters: 'Adapters',
    reference: 'Reference',
    schemas: 'Schemas',
  };
  return labels[groupKey] ?? humanizeDocSegment(groupKey);
}

function buildDocsSidebarGroups(pages) {
  const groups = new Map();
  pages
    .filter((page) => page.slug)
    .forEach((page) => {
      if (!groups.has(page.groupKey)) {
        groups.set(page.groupKey, {
          key: page.groupKey,
          label: page.groupLabel,
          pages: [],
        });
      }
      groups.get(page.groupKey).pages.push(page);
    });

  return Array.from(groups.values()).sort((left, right) => compareDocPages(left.pages[0], right.pages[0]));
}

function pickFeaturedDocPages(pages) {
  const preferred = ['install', 'usage', 'cli', 'benchmarks', 'ci-gates', 'reference/api'];
  const selected = preferred
    .map((slug) => pages.find((page) => page.slug === slug))
    .filter(Boolean);

  if (selected.length >= 6) return selected;

  const fallback = pages.filter((page) => page.slug && page.groupKey !== 'schemas');
  for (const page of fallback) {
    if (selected.length >= 6) break;
    if (!selected.some((item) => item.slug === page.slug)) selected.push(page);
  }
  return selected;
}

function renderDocBody(page) {
  if (page.rendered) return page.rendered;

  if (page.format === 'json') {
    page.rendered = {
      html: `<pre class="docs-code-block"><code>${escapeHtml(page.body)}</code></pre>`,
      toc: [],
    };
    return page.rendered;
  }

  marked.setOptions({ gfm: true });

  const parser = new DOMParser();
  const markup = marked.parse(page.body);
  const fragment = parser.parseFromString(`<article>${markup}</article>`, 'text/html').body.firstElementChild;
  const toc = [];
  const usedIds = new Set();

  if (!fragment) {
    page.rendered = { html: '', toc };
    return page.rendered;
  }

  rewriteDocLinks(fragment, page);

  const leadingTitle = fragment.querySelector('h1');
  if (leadingTitle) leadingTitle.remove();

  fragment.querySelectorAll('h2, h3, h4').forEach((heading) => {
    const text = heading.textContent?.trim() ?? '';
    const id = uniqueDocAnchorId(slugifyDocText(text), usedIds);
    heading.id = id;
    toc.push({ id, text, depth: Number(heading.tagName.slice(1)) });
  });

  fragment.querySelectorAll('pre').forEach((element) => element.classList.add('docs-code-block'));
  fragment.querySelectorAll('table').forEach((element) => element.classList.add('docs-table'));
  fragment.querySelectorAll('code').forEach((element) => {
    if (element.parentElement?.tagName !== 'PRE') element.classList.add('docs-inline-code');
  });
  fragment.querySelectorAll('a[href]').forEach((element) => {
    const href = element.getAttribute('href') ?? '';
    if (/^https?:\/\//.test(href)) {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noreferrer');
    }
  });

  page.rendered = {
    html: fragment.innerHTML,
    toc,
  };
  return page.rendered;
}

function rewriteDocLinks(root, page) {
  root.querySelectorAll('a[href]').forEach((element) => {
    const href = element.getAttribute('href');
    if (!href) return;
    element.setAttribute('href', resolveDocLink(page.sourcePath, href));
  });
}

function resolveDocLink(currentSourcePath, href) {
  if (!href || href.startsWith('#') || /^[a-z]+:/i.test(href)) return href;

  const [targetPath, rawHash = ''] = href.split('#');
  if (!targetPath) return rawHash ? `#${slugifyDocText(rawHash)}` : href;
  if (!targetPath.endsWith('.md') && !targetPath.endsWith('.json')) return href;

  const resolvedPath = normalizeDocFilePath(joinDocPaths(dirnameDocPath(currentSourcePath), targetPath));
  const targetPage = docSourceMap.get(resolvedPath);
  if (!targetPage) return href;

  const hash = rawHash ? `#${slugifyDocText(decodeURIComponent(rawHash))}` : '';
  return `${targetPage.routePath}${hash}`;
}

function extractMarkdownTitle(body, sourcePath) {
  const match = String(body).match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || humanizeDocSegment(sourcePath.split('/').pop()?.replace(/\.md$/, '') ?? 'Docs');
}

function extractMarkdownDescription(body, title) {
  const lines = String(body).split('\n');
  let inCodeFence = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence || !line || line === `# ${title}`) continue;
    if (/^(#|>|- |\* |\d+\. )/.test(line)) continue;
    return line;
  }

  return 'Summary pulled from the repository documentation.';
}

function extractJsonDocTitle(value, sourcePath) {
  if (value && typeof value.title === 'string' && value.title.trim()) return value.title.trim();
  return humanizeDocSegment(sourcePath.split('/').pop()?.replace(/\.json$/, '') ?? 'Schema');
}

function extractJsonDocDescription(value, title) {
  if (value && typeof value.description === 'string' && value.description.trim()) return value.description.trim();
  return `${title} JSON schema reference.`;
}

function sourcePathToSlug(sourcePath) {
  const withoutExtension = sourcePath.replace(/\.(md|json)$/u, '');
  if (withoutExtension === 'index') return '';
  if (withoutExtension.endsWith('/index')) return withoutExtension.slice(0, -('/index'.length));
  return withoutExtension;
}

function humanizeDocSegment(value) {
  return String(value)
    .replace(/\.schema$/u, ' schema')
    .replace(/[-_.]+/gu, ' ')
    .replace(/\b\w/gu, (match) => match.toUpperCase())
    .trim();
}

function slugifyDocText(value) {
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/gu, '')
    .replace(/[-\s]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return normalized || 'section';
}

function uniqueDocAnchorId(candidate, usedIds) {
  let next = candidate;
  let suffix = 2;
  while (usedIds.has(next)) {
    next = `${candidate}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(next);
  return next;
}

function normalizeDocFilePath(value) {
  const stack = [];
  String(value)
    .replaceAll('\\', '/')
    .split('/')
    .forEach((segment) => {
      if (!segment || segment === '.') return;
      if (segment === '..') {
        stack.pop();
        return;
      }
      stack.push(segment);
    });
  return stack.join('/');
}

function dirnameDocPath(value) {
  const parts = normalizeDocFilePath(value).split('/');
  parts.pop();
  return parts.join('/');
}

function joinDocPaths(basePath, nextPath) {
  return [basePath, nextPath].filter(Boolean).join('/');
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
