import Ajv2020 from 'ajv/dist/2020';
import { analyzeBundle, createDemoBundle, safeJsonParse } from './core/engine.js';
import { MUTATION_PACKS } from './mutations/registry.js';
import supportProfile from '../examples/risk-profiles/support-agent.json';
import browserProfile from '../examples/risk-profiles/browser-agent.json';
import quickstartBundle from '../examples/cli/quickstart-bundle.json';
import observedRuns from '../examples/cli/observed-runs.json';
import supportMvpBenchmarkPack from '../examples/benchmarks/support-mvp/benchmark-pack.json';
import harnessBundleSchema from '../docs/schemas/harness_bundle.schema.json';
import riskProfileSchema from '../docs/schemas/risk_profile.schema.json';
import diagnosticReportSchema from '../docs/schemas/diagnostic_report.schema.json';
import benchmarkPackSchema from '../docs/schemas/benchmark_pack.schema.json';

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
  ['GitHub Actions', 'Run `harnessamp diagnose` in CI and fail the job when the release gate returns block.'],
  ['Local JSON', 'Commit harness bundles, observed runs, and diagnostic reports as plain JSON artifacts.'],
  ['CLI', 'Use the terminal as the primary workflow and open the web report only when reviewing results.'],
  ['HTTP runners', 'Wrap agents behind an endpoint that accepts variant payloads and returns observed outcomes.'],
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
  push:
    branches: [main]

jobs:
  robustness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run release:gate -- examples/cli/quickstart-bundle.json examples/cli/observed-runs.json --write-md artifacts/harnessamp-gate.md --write-json artifacts/harnessamp-gate.json`;

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
  ['seeded', 'replayable runs'],
  ['pass/warn/block', 'CI status'],
  ['real examples', 'repo-backed demo'],
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
  ['CI/CD Gates', 'Use robustness thresholds to pass, warn, or block merges and deploys.'],
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
  accountEmail: 'demo@harnessamp.local',
  workspaceName: 'Reliability Lab',
  projectName: 'Northstar Support Copilot',
  projectRole: 'owner',
  analyticsEnabled: true,
  inputError: '',
  feedback: '',
  analysis: null,
};

const state = loadState();
const app = document.querySelector('#app');

if (!state.useCustomInput) syncCustomEditorsToPreset();

installErrorMonitoring();
render();
runDiagnosis();

function render() {
  const preset = getSelectedBundlePreset();
  const profile = getSelectedRiskProfile(preset);
  const profileLocked = Boolean(preset.lockedProfileId);

  app.innerHTML = `
    <div class="site-shell">
      <header class="topbar">
        <a class="brand" href="#top" aria-label="HarnessAmp home">
          <span class="brand__mark">HA</span>
          <span><strong>HarnessAmp</strong><small>Robustness infrastructure</small></span>
        </a>
        <nav class="topbar__nav" aria-label="Primary navigation">
          <a href="#demo">Demo</a>
          <a href="#report">Report</a>
          <a href="#packs">Packs</a>
          <a href="#workspace">Workspace</a>
          <a href="#docs-install">Docs</a>
          <a href="#quickstart">Quickstart</a>
        </nav>
        <a class="nav-cta" href="#demo">Run demo</a>
      </header>

      <main id="top">
        <section class="hero reveal">
          <div class="hero__copy">
            <p class="eyebrow">Agent reliability diagnosis</p>
            <h1>Find out what makes your agent fail.</h1>
            <p class="hero__lede">HarnessAmp wraps your agent harness, applies deterministic mutations to prompts, tools, permissions, context, network sinks, and sandbox boundaries, then reports exactly where reliability breaks.</p>
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
            <div class="trace"><span>recommended_control</span><strong id="hero-control">select a profile and run diagnosis</strong></div>
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
            <p>The browser demo calls the same analysis engine used by the CLI examples, then renders the resulting pack, report, and gate status.</p>
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
            <div><span>Weakest surface</span><strong id="report-surface">--</strong></div>
            <div><span>Failure class</span><strong id="report-failure">--</strong></div>
            <div><span>Recommended control</span><strong id="report-control">--</strong></div>
            <div><span>Replay seed</span><strong id="report-seed">--</strong></div>
            <div><span>CI gate</span><strong class="danger" id="report-gate">--</strong></div>
            <div><span>Report id</span><strong id="report-id">--</strong></div>
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
          <pre class="report-text" id="report-text"></pre>
        </section>

        <section id="workspace" class="section workspace-section reveal">
          <div class="section__intro"><p class="eyebrow">Auth and workspaces</p><h2>Project context for team reports.</h2><p>This prototype records workspace identity with saved reports. In production, these fields map to an auth provider and database access rules.</p></div>
          <div class="workspace-panel">
            <label><span>Account email</span><input id="account-email" type="email" value="${escapeHtml(state.accountEmail)}" /></label>
            <label><span>Workspace</span><input id="workspace-name" type="text" value="${escapeHtml(state.workspaceName)}" /></label>
            <label><span>Project</span><input id="project-name" type="text" value="${escapeHtml(state.projectName)}" /></label>
            <label><span>Role</span><select id="project-role">
              ${['owner', 'maintainer', 'viewer'].map((role) => `<option value="${role}" ${role === state.projectRole ? 'selected' : ''}>${role}</option>`).join('')}
            </select></label>
            <label class="check-control"><input id="analytics-toggle" type="checkbox" ${state.analyticsEnabled ? 'checked' : ''} /><span>Allow local analytics events</span></label>
          </div>
        </section>

        <section id="packs" class="section reveal">
          <div class="section__intro"><p class="eyebrow">Mutation pack browser</p><h2>7 packs covering 20+ deterministic mutations.</h2><p>Each pack targets a wrapper condition that can change after the agent looked stable in a narrow baseline test.</p></div>
          <div class="pack-grid">${mutationPackDetails.map(([name, detail, example]) => `<article><span>${name}</span><h3>${formatPackName(name)}</h3><p>${detail}</p><small>${example}</small></article>`).join('')}</div>
        </section>

        <section id="integrations" class="section reveal">
          <div class="section__intro"><p class="eyebrow">Integrations detail</p><h2>Bring your runner. Keep your stack.</h2></div>
          <div class="integration-grid">${integrations.map(([title, detail]) => `<article><h3>${title}</h3><p>${detail}</p></article>`).join('')}</div>
          <div class="ci-snippet">
            <div class="section__intro"><p class="eyebrow">Concrete CI path</p><h2>Release gate command and GitHub Actions.</h2></div>
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
          <div class="section__intro"><p class="eyebrow">Real proof artifacts</p><h2>Embedded from repo examples.</h2><p>The demo uses examples/cli/quickstart-bundle.json, examples/cli/observed-runs.json, examples/benchmarks/support-mvp/benchmark-pack.json, and the checked-in risk profile files.</p></div>
          <div class="artifact-actions">
            <button class="button button--secondary" id="download-example-bundle" type="button">Download quickstart bundle</button>
            <button class="button button--secondary" id="download-example-runs" type="button">Download observed runs</button>
            <button class="button button--secondary" id="download-example-benchmark" type="button">Download benchmark pack</button>
            <button class="button button--secondary" id="download-risk-profile" type="button">Download risk profile</button>
            <button class="button button--secondary" id="download-ci-yaml" type="button">Download CI YAML</button>
          </div>
          <div class="artifact-grid">
            <pre>${escapeHtml(JSON.stringify(quickstartBundle, null, 2).slice(0, 900))}</pre>
            <pre>${escapeHtml(JSON.stringify(observedRuns, null, 2))}</pre>
            <pre>${escapeHtml(JSON.stringify(supportMvpBenchmarkPack, null, 2).slice(0, 1500))}</pre>
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
  scrollToHashTarget();
}

function renderDocsSections() {
  const docs = [
    ['docs-install', 'Install', 'Clone the repo, install dependencies, and run the first diagnosis from the CLI.', 'npm install\nnpm run diagnose -- examples/cli/quickstart-bundle.json'],
    ['docs-schemas', 'Schemas', 'Validate harness bundles, benchmark packs, risk profiles, mutation registries, and diagnostic reports with the checked-in JSON schemas.', 'docs/schemas/harness_bundle.schema.json\ndocs/schemas/benchmark_pack.schema.json\ndocs/schemas/risk_profile.schema.json\ndocs/schemas/diagnostic_report.schema.json'],
    ['docs-runner-contract', 'Runner contract', 'Implement a small adapter that accepts variants and returns observed outcomes without changing your agent framework.', 'POST /runner\n{ pack, profile, thresholds }\n-> { observations: [...] }'],
    ['docs-ci-gates', 'CI gates', 'Block releases when overall score, holdout pass rate, or robustness gap crosses your thresholds.', 'npm run release:gate -- bundle.json observed-runs.json --write-md artifacts/gate.md'],
    ['docs-mutation-packs', 'Mutation packs', 'Browse deterministic packs for prompt integrity, tool payloads, permissions, network sinks, context, sandbox boundaries, and multimodal inputs.', MUTATION_PACKS.join('\n')],
  ];

  return docs.map(([id, title, detail, example]) => `
    <section id="${id}" class="section docs-section reveal">
      <div class="section__intro"><p class="eyebrow">Docs / ${title}</p><h2>${title}</h2><p>${detail}</p></div>
      <pre>${escapeHtml(example)}</pre>
    </section>
  `).join('');
}

function bindEvents() {
  document.querySelector('#bundle-preset-select').addEventListener('change', (event) => {
    state.bundlePresetId = event.target.value;
    const preset = getSelectedBundlePreset();
    if (preset.lockedProfileId) state.profileId = preset.lockedProfileId;
    if (!state.useCustomInput) syncCustomEditorsToPreset();
    persistState();
    render();
    runDiagnosis();
  });
  document.querySelector('#profile-select').addEventListener('change', (event) => {
    state.profileId = event.target.value;
    if (!state.useCustomInput) syncCustomEditorsToPreset();
    persistState();
    runDiagnosis();
  });
  document.querySelector('#intensity-select').addEventListener('change', (event) => {
    state.intensity = Number(event.target.value);
    persistState();
    runDiagnosis();
  });
  document.querySelector('#observed-toggle').addEventListener('change', (event) => {
    state.useObservedRuns = event.target.checked;
    persistState();
    runDiagnosis();
  });
  document.querySelector('#custom-toggle').addEventListener('change', (event) => {
    if (event.target.checked) syncCustomEditorsToPreset();
    state.useCustomInput = event.target.checked;
    persistState();
    runDiagnosis();
  });
  document.querySelector('#bundle-json').addEventListener('input', (event) => {
    state.customBundleText = event.target.value;
    persistState();
  });
  document.querySelector('#runs-json').addEventListener('input', (event) => {
    state.customRunsText = event.target.value;
    persistState();
  });
  document.querySelector('#bundle-file').addEventListener('change', (event) => readJsonFile(event, 'bundle'));
  document.querySelector('#runs-file').addEventListener('change', (event) => readJsonFile(event, 'runs'));
  document.querySelector('#min-overall-score').addEventListener('input', (event) => updateThreshold('minOverallScore', event.target.value));
  document.querySelector('#min-holdout-pass').addEventListener('input', (event) => updateThreshold('minHoldoutPass', event.target.value));
  document.querySelector('#max-gap').addEventListener('input', (event) => updateThreshold('maxGap', event.target.value));
  document.querySelector('#runner-endpoint').addEventListener('input', (event) => {
    state.runnerEndpoint = event.target.value;
    persistState();
  });
  document.querySelector('#account-email').addEventListener('input', (event) => updateWorkspaceField('accountEmail', event.target.value));
  document.querySelector('#workspace-name').addEventListener('input', (event) => updateWorkspaceField('workspaceName', event.target.value));
  document.querySelector('#project-name').addEventListener('input', (event) => updateWorkspaceField('projectName', event.target.value));
  document.querySelector('#project-role').addEventListener('change', (event) => updateWorkspaceField('projectRole', event.target.value));
  document.querySelector('#analytics-toggle').addEventListener('change', (event) => updateWorkspaceField('analyticsEnabled', event.target.checked));
  document.querySelector('#run-demo').addEventListener('click', runDiagnosis);
  document.querySelector('#run-http-runner').addEventListener('click', runHttpRunner);
  document.querySelector('#copy-report').addEventListener('click', () => copyText(state.analysis?.reportText ?? '', 'Copied report'));
  document.querySelector('#download-report').addEventListener('click', () => downloadText('harnessamp-report.md', state.analysis?.reportText ?? '', 'Downloaded report'));
  document.querySelector('#download-report-json').addEventListener('click', () => downloadText('harnessamp-report.json', JSON.stringify(buildReportSnapshot(), null, 2), 'Downloaded report JSON'));
  document.querySelector('#download-pack').addEventListener('click', () => downloadText('harnessamp-mutation-pack.json', JSON.stringify(state.analysis?.exportPack ?? {}, null, 2), 'Downloaded mutation pack'));
  document.querySelector('#copy-ci').addEventListener('click', () => copyText(githubActionsSnippet, 'Copied CI snippet'));
  document.querySelector('#save-report').addEventListener('click', () => saveReportSnapshot('Saved report snapshot'));
  document.querySelector('#save-server-report').addEventListener('click', saveServerReport);
  document.querySelector('#load-server-report').addEventListener('click', loadServerReport);
  document.querySelector('#download-example-bundle').addEventListener('click', () => downloadText('quickstart-bundle.json', JSON.stringify(quickstartBundle, null, 2), 'Downloaded bundle'));
  document.querySelector('#download-example-runs').addEventListener('click', () => downloadText('observed-runs.json', JSON.stringify(observedRuns, null, 2), 'Downloaded runs'));
  document.querySelector('#download-example-benchmark').addEventListener('click', () => downloadText('support-mvp-benchmark-pack.json', JSON.stringify(supportMvpBenchmarkPack, null, 2), 'Downloaded benchmark'));
  document.querySelector('#download-risk-profile').addEventListener('click', () => {
    const profile = getSelectedRiskProfile();
    downloadText(`${profile.id}.risk-profile.json`, JSON.stringify(profile.profile, null, 2), 'Downloaded risk profile');
  });
  document.querySelector('#download-ci-yaml').addEventListener('click', () => downloadText('harnessamp-release-gate.yml', githubActionsSnippet, 'Downloaded CI YAML'));
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
  state.reportId = reportId;

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
  setText('report-saved', getSavedReports()[reportId] ? 'saved' : 'unsaved');
  setText('report-text', analysis.reportText);
  renderVariantTable(analysis);
  renderSchemaStatus(sourceBundle, selected.profile, analysis, bundleType);
  renderBenchmarkPanels(sourceBundle, analysis, preset);
  persistState();

  document.querySelector('#coverage-list').innerHTML = MUTATION_PACKS.map((pack) => `
    <span class="${coverage.includes(pack) ? 'is-active' : ''}">${formatPackName(pack)}</span>
  `).join('');

  document.querySelector('#hero-bars').innerHTML = analysis.familyStats.slice(0, 8).map((family) => {
    const height = Math.max(18, Math.round(100 - family.passRate));
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
      }),
    });

    if (!response.ok) {
      throw new Error(`Runner returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    const observations = Array.isArray(payload) ? payload : payload.observations;
    if (!Array.isArray(observations)) {
      throw new Error('Runner response must be an observation array or { observations }.');
    }

    state.customRunsText = JSON.stringify(observations, null, 2);
    state.useCustomInput = true;
    state.useObservedRuns = true;
    document.querySelector('#runs-json').value = state.customRunsText;
    document.querySelector('#custom-toggle').checked = true;
    document.querySelector('#observed-toggle').checked = true;
    state.runnerStatus = `Loaded ${observations.length} runner observations`;
    setText('runner-status', state.runnerStatus);
    persistState();
    runDiagnosis();
  } catch (error) {
    state.runnerStatus = error.message;
    setText('runner-status', state.runnerStatus);
    persistState();
  }
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
      <td>${escapeHtml(variant?.mutationId ?? outcome.variantId)}</td>
      <td>${escapeHtml(variant?.surface ?? variant?.family ?? 'wrapper')}</td>
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
    ['Diagnostic report', validateDiagnosticSnapshot(buildReportSnapshot(analysis))],
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
    setText('benchmark-summary-meta', 'Select the Support MVP benchmark preset to inspect intent, contract, and release gates.');
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
  const family = [...analysis.familyStats].sort((a, b) => a.passRate - b.passRate)[0];
  if (!family) return null;
  const variant = analysis.pack.variants.find((item) => item.family === family.family);
  return {
    label: formatPackName(family.family ?? variant?.family ?? 'wrapper surface'),
    expectedFailure: variant?.expectedFailure,
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

function buildReportSnapshot(analysis = state.analysis) {
  if (!analysis) return {};
  const preset = getSelectedBundlePreset();
  const profile = getSelectedRiskProfile(preset);
  return {
    version: 'web-demo-1',
    id: state.reportId || createReportId(analysis),
    generatedAt: new Date().toISOString(),
    workspace: workspacePayload(),
    suite: {
      project: analysis.bundle.project,
      profile: profile.id,
      preset: state.bundlePresetId,
      thresholds: state.thresholds,
    },
    baselineRuns: analysis.outcomes.filter((outcome) => outcome.tier === 'visible'),
    mutationRuns: analysis.outcomes,
    deltas: analysis.familyStats.map((family) => ({
      deltaType: ['pass_rate'],
      mutationId: family.family,
      explanation: `${formatPackName(family.family)} pass rate is ${Math.round(family.passRate)}%.`,
      severity: family.passRate < 60 ? 'high' : family.passRate < 80 ? 'medium' : 'low',
    })),
    findings: analysis.recommendations.map((item, index) => ({
      id: `finding-${index + 1}`,
      mutationId: item.family ?? 'wrapper',
      failureTypes: [{ id: item.title ?? 'wrapper_brittleness' }],
      highestSeverity: index === 0 ? 'high' : 'medium',
      recommendation: item.detail ?? item.title ?? 'Review wrapper controls.',
    })),
    summary: {
      originalPassRate: analysis.summary.visiblePassRate,
      mutatedPassRate: analysis.summary.holdoutPassRate,
      robustnessDrop: analysis.summary.gap,
      verdict: gateFor(analysis.summary).toLowerCase() === 'block' ? 'block' : gateFor(analysis.summary).toLowerCase(),
      overallScore: analysis.summary.overallScore,
    },
    markdown: analysis.reportText,
  };
}

function saveReportSnapshot(message = 'Saved') {
  if (!state.analysis) return;
  const snapshot = buildReportSnapshot();
  const reports = getSavedReports();
  reports[snapshot.id] = snapshot;
  localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(reports));
  setText('report-saved', 'saved');
  showFeedback(message);
}

async function saveServerReport() {
  if (!state.analysis) return;
  const snapshot = buildReportSnapshot();
  try {
    const response = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    if (!response.ok) throw new Error(`Save failed with HTTP ${response.status}`);
    const payload = await response.json();
    state.reportId = payload.id ?? snapshot.id;
    setText('report-id', state.reportId);
    setText('report-saved', payload.storage ?? 'server');
    showFeedback('Saved server report');
    persistState();
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
    setText('report-text', payload.markdown ?? JSON.stringify(payload, null, 2));
    setText('report-saved', 'server');
    showFeedback('Loaded server report');
  } catch (error) {
    const local = getSavedReports()[state.reportId];
    if (local) {
      setText('report-text', local.markdown ?? JSON.stringify(local, null, 2));
      setText('report-saved', 'local');
      showFeedback('Loaded local report');
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
  return {
    accountEmail: state.accountEmail,
    workspaceName: state.workspaceName,
    projectName: state.projectName,
    projectRole: state.projectRole,
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
      analysis: null,
      inputError: '',
      feedback: '',
    };
  } catch {
    return { ...defaultState, thresholds: { ...defaultState.thresholds } };
  }
}

function persistState() {
  const { analysis, inputError, feedback, ...persistable } = state;
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
