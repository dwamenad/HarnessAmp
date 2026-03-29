import { analyzeBundle, createDemoBundle, safeJsonParse } from './engine.js';

const STORAGE_KEYS = {
  bundle: 'harnessamp.bundle',
  observations: 'harnessamp.observations',
  intensity: 'harnessamp.intensity',
  holdouts: 'harnessamp.holdouts',
};

const DEMO_OBSERVATIONS = JSON.stringify(
  [
    {
      variantId: 'prompt-visible',
      passed: true,
      score: 92,
      latencyMs: 342,
      notes: 'Visible phrasing held under wrapper drift.',
    },
    {
      variantId: 'schema-holdout',
      passed: false,
      score: 18,
      latencyMs: 1204,
      notes: 'Holdout serialization collapsed on reordered keys.',
    },
  ],
  null,
  2,
);

const SCORE_CIRCUMFERENCE = 552.92;

const state = {
  bundleText: '',
  observationsText: '',
  intensity: 2,
  showHoldouts: true,
  activeVariantTier: 'visible',
  analysis: null,
  parseError: '',
};

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="relative min-h-screen">
    <div class="grain-overlay"></div>

    <nav class="rise-in fixed top-0 z-50 flex w-full items-center justify-between gap-4 border-b border-white/10 bg-[#131313]/95 px-6 py-3 shadow-[0_0_12px_rgba(255,140,0,0.1)] backdrop-blur-sm">
      <div class="flex items-center gap-8">
        <div class="flex flex-col">
          <span class="text-xl font-bold tracking-tighter text-[#ffb77d] font-headline">HARNESSAMP</span>
          <span class="font-label text-[10px] uppercase tracking-[0.32em] text-slate-500">ROBUSTNESS LAB</span>
        </div>
        <div class="hidden items-center gap-6 md:flex">
          <a class="border-b-2 border-[#ffb77d] pb-1 font-headline text-sm font-bold uppercase tracking-tight text-[#ffb77d]" href="#">DIAGNOSTICS</a>
          <a class="font-label text-xs text-slate-400 transition-colors hover:text-white" href="#">TELEMETRY</a>
          <a class="font-label text-xs text-slate-400 transition-colors hover:text-white" href="#">LOGS</a>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-3">
        <label class="inline-flex items-center gap-3 border border-white/10 bg-white/5 px-4 py-2">
          <span class="font-label text-[10px] uppercase tracking-[0.28em] text-slate-400">Mutation intensity</span>
          <select id="intensity-select" class="border-0 bg-transparent p-0 font-label text-[11px] uppercase tracking-widest text-[#e5e2e1] outline-none">
            <option value="1">Light</option>
            <option value="2" selected>Standard</option>
            <option value="3">Aggressive</option>
            <option value="4">Lab</option>
          </select>
        </label>

        <label class="inline-flex items-center gap-3 border border-white/10 bg-white/5 px-4 py-2">
          <input type="checkbox" id="show-holdouts" class="h-4 w-4 accent-[#ffb77d]" checked />
          <span class="font-label text-[10px] uppercase tracking-[0.28em] text-slate-400">Show hidden holdouts</span>
        </label>

        <button type="button" class="bg-white/5 px-4 py-1.5 font-mono text-[11px] text-slate-400 border border-white/5 transition-all hover:bg-white/10 hover:-translate-y-[1px] active:scale-[0.97]" id="load-demo-btn">Load demo</button>
        <button type="button" class="bg-white/5 px-4 py-1.5 font-mono text-[11px] text-slate-400 border border-white/5 transition-all hover:bg-white/10 hover:-translate-y-[1px] active:scale-[0.97]" id="import-bundle-btn">Import bundle</button>
        <button type="button" class="bg-white/5 px-4 py-1.5 font-mono text-[11px] text-slate-400 border border-white/5 transition-all hover:bg-white/10 hover:-translate-y-[1px] active:scale-[0.97]" id="import-results-btn">Import runs</button>
        <button type="button" class="bg-[#ff8c00] px-4 py-1.5 font-mono text-[11px] font-bold text-[#623200] transition-all hover:shadow-[0_0_15px_rgba(255,140,0,0.3)] hover:-translate-y-[1px] active:scale-[0.97]" id="analyze-btn">Analyze bundle</button>
        <button type="button" class="bg-white/5 px-4 py-1.5 font-mono text-[11px] text-slate-400 border border-white/5 transition-all hover:bg-white/10 hover:-translate-y-[1px] active:scale-[0.97]" id="export-btn">Export pack</button>
        <button type="button" class="bg-white/5 px-4 py-1.5 font-mono text-[11px] text-slate-400 border border-white/5 transition-all hover:bg-white/10 hover:-translate-y-[1px] active:scale-[0.97]" id="copy-report-btn">Copy report</button>
      </div>
    </nav>

    <main class="mx-auto max-w-[1600px] px-6 pb-12 pt-36 md:pt-28 lg:pt-24">
      <div class="grid grid-cols-1 items-start gap-12 lg:grid-cols-12">
        <div class="space-y-12 lg:col-span-8">
          <section class="rise-in">
            <div class="mb-3 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="h-2 w-2 bg-[#e6feff] animate-pulse"></div>
                <h2 class="font-headline text-lg font-bold tracking-tight uppercase">Harness bundle</h2>
              </div>
              <span id="bundle-status" class="font-label text-[10px] uppercase tracking-widest text-slate-500">JSON CONFIGURATION</span>
            </div>

            <div class="group relative">
              <textarea id="bundle-input" class="h-[480px] w-full border-none bg-[#0e0e0e] p-6 font-label text-[13px] leading-relaxed text-[#e6feff] focus:ring-1 focus:ring-[#ffb77d80]" spellcheck="false"></textarea>
              <div class="absolute right-4 top-4 flex flex-col gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button type="button" id="bundle-copy-btn" class="bg-[#2a2a2a] p-2 text-slate-400 transition-colors hover:text-[#ffb77d]" aria-label="Copy bundle">
                  <span class="material-symbols-outlined text-sm">content_copy</span>
                </button>
                <button type="button" id="bundle-analyze-btn" class="bg-[#2a2a2a] p-2 text-slate-400 transition-colors hover:text-[#ffb77d]" aria-label="Analyze bundle">
                  <span class="material-symbols-outlined text-sm">auto_fix_high</span>
                </button>
              </div>
            </div>
          </section>

          <section class="rise-in">
            <div class="mb-3 flex items-center gap-3">
              <div class="h-2 w-2 bg-slate-600"></div>
              <h2 class="font-headline text-lg font-bold tracking-tight uppercase">Observed runs</h2>
            </div>
            <textarea id="results-input" class="h-[180px] w-full border-none bg-[#0e0e0e] p-6 font-label text-[13px] leading-relaxed text-slate-400 focus:ring-1 focus:ring-[#ffb77d80]" spellcheck="false"></textarea>
          </section>
        </div>

        <aside class="rise-in space-y-9 lg:sticky lg:top-24 lg:col-span-4">
          <section class="bg-[#2a2a2a] p-8 border-t border-[#ffb77d33]">
            <div class="mb-10 flex flex-col items-center">
              <div class="relative flex h-48 w-48 items-center justify-center">
                <svg class="h-full w-full -rotate-90 transform">
                  <circle class="text-white/5" cx="96" cy="96" fill="transparent" r="88" stroke="currentColor" stroke-width="2"></circle>
                  <circle id="score-arc" class="score-ring__progress text-[#ffb77d]" cx="96" cy="96" fill="transparent" r="88" stroke="currentColor" stroke-dasharray="${SCORE_CIRCUMFERENCE}" stroke-dashoffset="${SCORE_CIRCUMFERENCE}" stroke-width="4"></circle>
                </svg>
                <div class="absolute inset-0 flex flex-col items-center justify-center">
                  <span id="score-value" class="font-label text-4xl font-bold text-white">--</span>
                  <span class="mt-1 font-label text-[10px] uppercase tracking-widest text-[#ffb77d]">ROBUSTNESS SCORE</span>
                  <span id="score-class" class="mt-1 font-label text-[10px] uppercase tracking-[0.28em] text-slate-400">WAITING</span>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-px bg-white/5">
              <div class="bg-[#2a2a2a] p-4">
                <p class="mb-1 font-label text-[10px] uppercase text-slate-500">Visible Pass</p>
                <p id="visible-rate" class="font-label text-xl text-white">--</p>
              </div>
              <div class="bg-[#2a2a2a] p-4">
                <p class="mb-1 font-label text-[10px] uppercase text-slate-500">Holdout Pass</p>
                <p id="holdout-rate" class="font-label text-xl text-[#e6feff]">--</p>
              </div>
              <div class="bg-[#2a2a2a] p-4">
                <p class="mb-1 font-label text-[10px] uppercase text-slate-500">Robustness Gap</p>
                <p id="gap-rate" class="font-label text-xl text-[#ffb4ab]">--</p>
              </div>
              <div class="bg-[#2a2a2a] p-4">
                <p class="mb-1 font-label text-[10px] uppercase text-slate-500">Family Count</p>
                <p id="family-count" class="font-label text-xl text-white">--</p>
              </div>
            </div>

            <div class="mt-8 space-y-4">
              <div class="flex items-center justify-between border-b border-white/5 py-2">
                <span class="font-label text-[11px] text-slate-400">MODE</span>
                <span id="mode-label" class="font-label text-[11px] font-bold text-[#e6feff]">DEMO SIMULATION</span>
              </div>
              <div class="flex items-center justify-between border-b border-white/5 py-2">
                <span class="font-label text-[11px] text-slate-400">CONFIDENCE</span>
                <span id="confidence-label" class="font-label text-[11px] text-white">LOW (0.48)</span>
              </div>
              <div class="flex items-center justify-between border-b border-white/5 py-2">
                <span class="font-label text-[11px] text-slate-400">WEAKEST SURFACE</span>
                <span id="hotspot-label" class="font-label text-[11px] text-[#ffb4ab]">WAITING</span>
              </div>
              <div id="flag-list" class="flex flex-wrap gap-2 pt-4"></div>
            </div>
          </section>
        </aside>
      </div>

      <section class="rise-in mt-24">
        <div class="mb-9 flex items-center gap-4">
          <h2 class="font-headline text-2xl font-bold tracking-tight uppercase">Mutation families</h2>
          <div class="h-px flex-1 bg-white/5"></div>
          <span id="family-note" class="font-label text-[10px] uppercase tracking-widest text-slate-500">--</span>
        </div>
        <div id="family-list" class="grid gap-4"></div>
      </section>

      <section class="rise-in mt-24">
        <div class="mb-4 flex items-center gap-4">
          <h2 class="font-headline text-2xl font-bold tracking-tight uppercase">Variant pack</h2>
          <div class="h-px flex-1 bg-white/5"></div>
          <div class="ml-auto flex gap-4">
            <button type="button" id="visible-variants-tab" class="font-label text-[11px] uppercase tracking-widest text-[#e6feff] border-b border-[#e6feff] pb-1">VISIBLE VARIANTS <span id="visible-count" class="ml-2 text-[10px] text-slate-500">00</span></button>
            <button type="button" id="holdout-variants-tab" class="font-label text-[11px] uppercase tracking-widest text-slate-500 transition-colors hover:text-white">HIDDEN HOLDOUTS <span id="holdout-count" class="ml-2 text-[10px] text-slate-500">00</span></button>
          </div>
        </div>
        <div id="pack-note" class="mb-6 font-label text-[10px] uppercase tracking-widest text-slate-500">--</div>
        <div class="overflow-x-auto">
          <table class="w-full border-collapse font-label text-[12px]">
            <thead>
              <tr class="border-b border-white/10 text-left uppercase tracking-widest text-slate-500">
                <th class="py-4 px-6 font-medium">Family</th>
                <th class="py-4 px-6 font-medium">Variant Title</th>
                <th class="py-4 px-6 font-medium">Summary</th>
                <th class="py-4 px-6 font-medium">Status</th>
                <th class="py-4 px-6 font-medium text-right">Score</th>
                <th class="py-4 px-6 font-medium text-right">Latency</th>
              </tr>
            </thead>
            <tbody id="variant-table-body" class="divide-y divide-white/5"></tbody>
          </table>
        </div>
      </section>

      <section class="rise-in mt-24 mb-12">
        <div class="relative overflow-hidden bg-[#2a2a2a] p-9 border-l-4 border-[#e6feff]">
          <div class="absolute right-0 top-0 h-64 w-64 translate-x-32 -translate-y-32 rotate-45 bg-[#e6feff0d]"></div>
          <h2 class="relative z-10 mb-8 font-headline text-2xl font-bold tracking-tight uppercase">Hardening plan</h2>
          <div id="recommendation-list" class="relative z-10 space-y-6"></div>
          <div class="mt-12 flex justify-end border-t border-white/10 pt-8">
            <button type="button" id="generate-patch-btn" class="flex items-center gap-2 bg-[#e6feff] px-6 py-2.5 font-label text-xs font-bold tracking-widest text-[#003739] transition-all hover:bg-white active:scale-95">
              GENERATE PATCH REPO
              <span class="material-symbols-outlined text-sm">terminal</span>
            </button>
          </div>
        </div>
      </section>
    </main>

    <footer class="rise-in border-t border-white/5 bg-[#0e0e0e] px-6 py-6">
      <div class="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-4 md:flex-row">
        <div class="flex items-center gap-4">
          <span class="font-label text-[10px] uppercase tracking-widest text-slate-500">SYSTEM_VERSION: 4.22.0-STABLE</span>
          <span class="font-label text-[10px] text-slate-700">|</span>
          <span class="font-label text-[10px] uppercase tracking-widest text-slate-500">KERNEL_HASH: 0xFD8E2</span>
        </div>
        <div class="font-label text-[10px] uppercase tracking-widest text-slate-500">© 2026 HARNESSAMP PRECISION LABS</div>
      </div>
    </footer>
  </div>

  <input type="file" id="bundle-file" accept="application/json,.json" hidden />
  <input type="file" id="results-file" accept="application/json,.json" hidden />
`;

const bundleInput = document.querySelector('#bundle-input');
const resultsInput = document.querySelector('#results-input');
const intensitySelect = document.querySelector('#intensity-select');
const showHoldoutsToggle = document.querySelector('#show-holdouts');
const loadDemoBtn = document.querySelector('#load-demo-btn');
const importBundleBtn = document.querySelector('#import-bundle-btn');
const importResultsBtn = document.querySelector('#import-results-btn');
const analyzeBtn = document.querySelector('#analyze-btn');
const exportBtn = document.querySelector('#export-btn');
const copyReportBtn = document.querySelector('#copy-report-btn');
const bundleCopyBtn = document.querySelector('#bundle-copy-btn');
const bundleAnalyzeBtn = document.querySelector('#bundle-analyze-btn');
const generatePatchBtn = document.querySelector('#generate-patch-btn');
const bundleFileInput = document.querySelector('#bundle-file');
const resultsFileInput = document.querySelector('#results-file');
const visibleTabBtn = document.querySelector('#visible-variants-tab');
const holdoutTabBtn = document.querySelector('#holdout-variants-tab');

const statusTargets = {
  bundleStatus: document.querySelector('#bundle-status'),
  scoreArc: document.querySelector('#score-arc'),
  scoreValue: document.querySelector('#score-value'),
  scoreClass: document.querySelector('#score-class'),
  visibleRate: document.querySelector('#visible-rate'),
  holdoutRate: document.querySelector('#holdout-rate'),
  gapRate: document.querySelector('#gap-rate'),
  familyCount: document.querySelector('#family-count'),
  modeLabel: document.querySelector('#mode-label'),
  confidenceLabel: document.querySelector('#confidence-label'),
  hotspotLabel: document.querySelector('#hotspot-label'),
  flagList: document.querySelector('#flag-list'),
  familyList: document.querySelector('#family-list'),
  variantTableBody: document.querySelector('#variant-table-body'),
  visibleCount: document.querySelector('#visible-count'),
  holdoutCount: document.querySelector('#holdout-count'),
  familyNote: document.querySelector('#family-note'),
  packNote: document.querySelector('#pack-note'),
  recommendationList: document.querySelector('#recommendation-list'),
};

const FLAG_LABELS = {
  'tool-name-leak': 'TOOL NAME LEAK',
  'thin-holdouts': 'THIN HOLDOUTS',
  'duplicate-scenarios': 'DUPLICATE SCENARIOS',
  'deep-schema': 'DEEP SCHEMA',
  'tight-retry': 'TIGHT RETRY',
  'directive-sprawl': 'DIRECTIVE SPRAWL',
  'tool-namespace-collision': 'TOOL NAMESPACE',
};

const TONE_CLASSES = {
  secondary: 'border-[#e6feff33] bg-[#e6feff0d] text-[#e6feff]',
  primary: 'border-[#ffb77d33] bg-[#ffb77d0d] text-[#ffb77d]',
  error: 'border-[#ffb4ab33] bg-[#ffb4ab0d] text-[#ffb4ab]',
};

let saveTimer = null;

init();

function init() {
  const savedBundle = localStorage.getItem(STORAGE_KEYS.bundle);
  const savedObservations = localStorage.getItem(STORAGE_KEYS.observations);
  const savedIntensity = localStorage.getItem(STORAGE_KEYS.intensity);
  const savedHoldouts = localStorage.getItem(STORAGE_KEYS.holdouts);

  state.bundleText = savedBundle == null ? JSON.stringify(createDemoBundle(), null, 2) : savedBundle;
  state.observationsText = savedObservations == null ? DEMO_OBSERVATIONS : savedObservations;
  state.intensity = Number(savedIntensity ?? 2);
  state.showHoldouts = savedHoldouts == null ? true : savedHoldouts === 'true';

  bundleInput.value = state.bundleText;
  resultsInput.value = state.observationsText;
  intensitySelect.value = String(state.intensity);
  showHoldoutsToggle.checked = state.showHoldouts;

  bindEvents();
  analyzeAndRender();
}

function bindEvents() {
  bundleInput.addEventListener('input', scheduleAnalyze);
  resultsInput.addEventListener('input', scheduleAnalyze);

  intensitySelect.addEventListener('change', () => {
    state.intensity = Number(intensitySelect.value);
    persistControls();
    analyzeAndRender();
  });

  showHoldoutsToggle.addEventListener('change', () => {
    state.showHoldouts = showHoldoutsToggle.checked;
    if (!state.showHoldouts && state.activeVariantTier === 'holdout') {
      state.activeVariantTier = 'visible';
    }
    persistControls();
    renderCurrentAnalysis();
  });

  loadDemoBtn.addEventListener('click', loadDemo);
  importBundleBtn.addEventListener('click', () => bundleFileInput.click());
  importResultsBtn.addEventListener('click', () => resultsFileInput.click());
  analyzeBtn.addEventListener('click', analyzeAndRender);
  exportBtn.addEventListener('click', exportPack);
  copyReportBtn.addEventListener('click', copyReport);
  bundleCopyBtn.addEventListener('click', copyBundle);
  bundleAnalyzeBtn.addEventListener('click', analyzeAndRender);
  generatePatchBtn.addEventListener('click', exportPack);
  visibleTabBtn.addEventListener('click', () => {
    state.activeVariantTier = 'visible';
    renderCurrentAnalysis();
  });
  holdoutTabBtn.addEventListener('click', () => {
    if (!state.showHoldouts) return;
    state.activeVariantTier = 'holdout';
    renderCurrentAnalysis();
  });

  bundleFileInput.addEventListener('change', () => importJsonFile(bundleFileInput, 'bundle'));
  resultsFileInput.addEventListener('change', () => importJsonFile(resultsFileInput, 'observations'));
}

function scheduleAnalyze() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    analyzeAndRender();
  }, 160);
}

function loadDemo() {
  const demoBundle = createDemoBundle();
  bundleInput.value = JSON.stringify(demoBundle, null, 2);
  resultsInput.value = DEMO_OBSERVATIONS;
  state.bundleText = bundleInput.value;
  state.observationsText = resultsInput.value;
  state.activeVariantTier = 'visible';
  persistDraft();
  analyzeAndRender();
}

function importJsonFile(input, target) {
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? '');
    if (target === 'bundle') {
      bundleInput.value = text;
      state.bundleText = text;
    } else {
      resultsInput.value = text;
      state.observationsText = text;
    }
    persistDraft();
    analyzeAndRender();
  };
  reader.readAsText(file);
  input.value = '';
}

function analyzeAndRender() {
  state.bundleText = bundleInput.value;
  state.observationsText = resultsInput.value;
  persistDraft();

  const bundleParse = safeJsonParse(state.bundleText);
  if (!bundleParse.ok) {
    state.parseError = `Bundle JSON: ${bundleParse.error.message}`;
    updateStatusBanner();
    return;
  }

  let observations = null;
  if (state.observationsText.trim()) {
    const resultsParse = safeJsonParse(state.observationsText);
    if (!resultsParse.ok) {
      state.parseError = `Runs JSON: ${resultsParse.error.message}`;
      updateStatusBanner();
      return;
    }
    observations = resultsParse.value;
  }

  state.analysis = analyzeBundle(bundleParse.value, observations, { intensity: state.intensity });
  state.parseError = '';
  persistDraft();
  renderCurrentAnalysis();
}

function renderCurrentAnalysis() {
  if (!state.analysis) {
    updateStatusBanner();
    return;
  }

  const { analysis } = state;
  const score = analysis.summary.overallScore;
  const scoreClass = scoreClassFor(analysis.summary.label);

  setScoreRing(score);
  statusTargets.scoreValue.textContent = `${score}`;
  statusTargets.scoreClass.textContent = scoreClass.label;
  setScoreClassTone(scoreClass.tone);

  statusTargets.visibleRate.textContent = `${analysis.summary.visiblePassRate}%`;
  statusTargets.holdoutRate.textContent = `${analysis.summary.holdoutPassRate}%`;
  statusTargets.gapRate.textContent = `${analysis.summary.gap}%`;
  statusTargets.familyCount.textContent = formatCount(analysis.summary.familyCount);
  statusTargets.modeLabel.textContent = modeLabelFor(analysis.mode);
  statusTargets.confidenceLabel.textContent = confidenceLabelFor(analysis.mode);
  statusTargets.hotspotLabel.textContent = analysis.summary.hotspot ? analysis.summary.hotspot.label.toUpperCase() : 'NO HOTSPOT';
  setHotspotTone(analysis.summary.hotspot);
  renderRiskFlags(analysis.features.flags);
  renderFamilyStats(analysis.familyStats);
  renderVariants(analysis);
  renderRecommendations(analysis.recommendations);
  statusTargets.familyNote.textContent = `${analysis.pack.families.length} families, ${analysis.pack.visibleVariants.length} visible variants, ${analysis.pack.holdoutVariants.length} hidden holdouts.`;
  statusTargets.packNote.textContent = packNoteFor(analysis);
  updateStatusBanner();
}

function renderRiskFlags(flags) {
  if (!flags.length) {
    statusTargets.flagList.innerHTML = '<span class="font-label text-[10px] uppercase tracking-widest text-slate-500">No major risks surfaced yet.</span>';
    return;
  }

  statusTargets.flagList.innerHTML = flags
    .slice(0, 4)
    .map((flag) => {
      const tone = flag.severity >= 5 ? 'error' : flag.severity >= 4 ? 'primary' : 'secondary';
      return `
        <span class="inline-flex items-center gap-2 border px-2 py-0.5 font-label text-[9px] uppercase tracking-widest ${TONE_CLASSES[tone]}" title="${escapeHtml(flag.detail)}">
          ${escapeHtml(flagLabel(flag))}
          <span class="text-[8px] opacity-75">S${flag.severity}</span>
        </span>
      `;
    })
    .join('');
}

function renderFamilyStats(families) {
  statusTargets.familyList.innerHTML = families
    .map((family) => {
      const status = familySurfaceStatus(family.surface);
      const visibleWidth = clamp(family.visibleRate, 0, 100);
      const holdoutWidth = clamp(family.holdoutRate, 0, 100);

      return `
        <div class="grid grid-cols-1 items-center gap-6 bg-[#1c1b1b] p-6 transition-colors hover:bg-[#201f1f] lg:grid-cols-12">
          <div class="lg:col-span-3">
            <h3 class="font-label text-sm font-bold uppercase text-white">${escapeHtml(family.label)}</h3>
            <p class="mt-1 font-label text-[11px] text-slate-500">${escapeHtml(family.lede)}</p>
          </div>
          <div class="space-y-3 lg:col-span-7 lg:px-8">
            <div>
              <div class="flex justify-between font-label text-[10px] uppercase tracking-widest">
                <span class="text-slate-500">Visible</span>
                <span class="text-[#e6feff]">${visibleWidth}%</span>
              </div>
              <div class="mt-2 h-2 w-full bg-[#0e0e0e]">
                <div class="h-full bg-[#e6feff]" style="width: ${visibleWidth}%"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between font-label text-[10px] uppercase tracking-widest">
                <span class="text-slate-500">Holdout</span>
                <span class="text-[#ffb77d]">${holdoutWidth}%</span>
              </div>
              <div class="mt-2 h-2 w-full bg-[#0e0e0e]">
                <div class="h-full bg-[#ffb77d]" style="width: ${holdoutWidth}%"></div>
              </div>
            </div>
            <p class="font-label text-[10px] uppercase tracking-widest text-slate-500">${escapeHtml(family.bottleneck)}</p>
          </div>
          <div class="lg:col-span-2 lg:flex lg:justify-end">
            <span class="border px-3 py-1 font-label text-[11px] uppercase tracking-widest ${TONE_CLASSES[status.tone]}">${status.label}</span>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderVariants(analysis) {
  if (!state.showHoldouts && state.activeVariantTier === 'holdout') {
    state.activeVariantTier = 'visible';
  }

  const visible = analysis.pack.visibleVariants;
  const holdout = analysis.pack.holdoutVariants;
  const variants = state.activeVariantTier === 'holdout' ? holdout : visible;

  statusTargets.visibleCount.textContent = formatCount(visible.length);
  statusTargets.holdoutCount.textContent = formatCount(holdout.length);
  visibleTabBtn.className = tabButtonClass(state.activeVariantTier === 'visible', false);
  holdoutTabBtn.className = tabButtonClass(state.activeVariantTier === 'holdout', !state.showHoldouts);
  holdoutTabBtn.disabled = !state.showHoldouts;
  holdoutTabBtn.setAttribute('aria-disabled', String(!state.showHoldouts));

  statusTargets.variantTableBody.innerHTML = variants.map((variant) => renderVariantRow(analysis, variant)).join('');
}

function renderVariantRow(analysis, variant) {
  const outcome = analysis.outcomesById[variant.id];
  const score = outcome?.score ?? variant.estimatedPassRate;
  const latency = outcome?.latencyMs ?? variant.estimatedLatencyMs;
  const passed = outcome?.passed ?? score >= 70;
  const status = variantStatusFor(score, passed);
  const changes = variant.changes
    .slice(0, 3)
    .map((item) => `<span class="inline-flex items-center border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">${escapeHtml(item)}</span>`)
    .join('');

  return `
    <tr class="transition-colors hover:bg-white/[0.02]">
      <td class="py-5 px-6 text-slate-400">${escapeHtml(variant.familyLabel)}</td>
      <td class="py-5 px-6 font-bold text-white">${escapeHtml(variant.title)}</td>
      <td class="py-5 px-6 text-slate-400">
        <div>${escapeHtml(variant.summary)}</div>
        <div class="mt-2 flex flex-wrap gap-2">${changes}</div>
      </td>
      <td class="py-5 px-6">
        <span class="border px-2 py-0.5 ${status.classes}">${status.label}</span>
      </td>
      <td class="py-5 px-6 text-right text-white">${score}</td>
      <td class="py-5 px-6 text-right text-slate-500">${latency}ms</td>
    </tr>
  `;
}

function renderRecommendations(recommendations) {
  statusTargets.recommendationList.innerHTML = recommendations
    .map(
      (item, index) => `
        <div class="flex items-start gap-6">
          <span class="font-label text-xl font-bold ${index === 0 ? 'text-[#e6feff]' : 'text-slate-600'}">${String(index + 1).padStart(2, '0')}</span>
          <div>
            <h4 class="font-label text-sm font-bold uppercase tracking-wide text-white">${escapeHtml(item.title)}</h4>
            <p class="mt-1 max-w-2xl font-label text-[12px] leading-relaxed text-slate-400">${escapeHtml(item.detail)}</p>
            <p class="mt-1 font-label text-[10px] uppercase tracking-widest text-slate-500">${escapeHtml(item.impact)}</p>
          </div>
        </div>
      `,
    )
    .join('');
}

function updateStatusBanner() {
  if (state.parseError) {
    statusTargets.bundleStatus.textContent = state.parseError;
    statusTargets.bundleStatus.className = 'font-label text-[10px] uppercase tracking-widest text-[#ffb4ab]';
    statusTargets.bundleStatus.title = state.parseError;
    return;
  }

  statusTargets.bundleStatus.textContent = 'JSON CONFIGURATION';
  statusTargets.bundleStatus.className = 'font-label text-[10px] uppercase tracking-widest text-slate-500';
  statusTargets.bundleStatus.removeAttribute('title');
}

function persistControls() {
  localStorage.setItem(STORAGE_KEYS.intensity, String(state.intensity));
  localStorage.setItem(STORAGE_KEYS.holdouts, String(state.showHoldouts));
}

function persistDraft() {
  localStorage.setItem(STORAGE_KEYS.bundle, state.bundleText);
  localStorage.setItem(STORAGE_KEYS.observations, state.observationsText);
  persistControls();
}

function exportPack() {
  if (!state.analysis) {
    return;
  }

  const blob = new Blob([JSON.stringify(state.analysis.exportPack, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(state.analysis.bundle.project)}-harness-pack.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function copyReport() {
  if (!state.analysis) return;
  await navigator.clipboard.writeText(state.analysis.reportText);
  pulseButton(copyReportBtn, 'Copied');
}

async function copyBundle() {
  await navigator.clipboard.writeText(bundleInput.value);
  pulseButton(bundleCopyBtn, 'Copied');
}

function pulseButton(button, label) {
  const original = button.innerHTML;
  button.innerHTML = label;
  setTimeout(() => {
    button.innerHTML = original;
  }, 1200);
}

function setScoreRing(score) {
  const normalized = clamp(score, 0, 100);
  const offset = SCORE_CIRCUMFERENCE * (1 - normalized / 100);
  statusTargets.scoreArc.style.strokeDashoffset = String(offset);
}

function setScoreClassTone(tone) {
  const toneClasses = ['text-slate-400', 'text-[#e6feff]', 'text-[#ffb77d]', 'text-[#ffb4ab]'];
  statusTargets.scoreClass.classList.remove(...toneClasses);
  statusTargets.scoreClass.classList.add(tone);
}

function setHotspotTone(hotspot) {
  const classes = ['text-slate-500', 'text-[#e6feff]', 'text-[#ffb77d]', 'text-[#ffb4ab]'];
  statusTargets.hotspotLabel.classList.remove(...classes);
  if (!hotspot) {
    statusTargets.hotspotLabel.classList.add('text-slate-500');
    return;
  }

  statusTargets.hotspotLabel.classList.add(hotspot.gap >= 18 ? 'text-[#ffb4ab]' : 'text-[#ffb77d]');
}

function tabButtonClass(active, disabled) {
  const base = 'font-label text-[11px] uppercase tracking-widest transition-colors';
  if (disabled) {
    return `${base} cursor-not-allowed text-slate-600`;
  }
  if (active) {
    return `${base} border-b border-[#e6feff] pb-1 text-[#e6feff]`;
  }
  return `${base} text-slate-500 hover:text-white`;
}

function flagLabel(flag) {
  return FLAG_LABELS[flag.id] ?? flag.surface.toUpperCase();
}

function scoreClassFor(label) {
  switch (label) {
    case 'stable':
      return { label: 'STABLE', tone: 'text-[#e6feff]' };
    case 'watch':
      return { label: 'WATCH', tone: 'text-[#ffb77d]' };
    case 'brittle':
      return { label: 'BRITTLE', tone: 'text-[#ffb77d]' };
    default:
      return { label: 'FRAGILE', tone: 'text-[#ffb4ab]' };
  }
}

function modeLabelFor(mode) {
  if (mode === 'observed') return 'OBSERVED RUNS';
  if (mode === 'mixed') return 'MIXED RUNS';
  return 'DEMO SIMULATION';
}

function confidenceLabelFor(mode) {
  if (mode === 'observed') return 'HIGH (0.94)';
  if (mode === 'mixed') return 'MEDIUM (0.72)';
  return 'LOW (0.48)';
}

function familySurfaceStatus(surface) {
  switch (surface) {
    case 'sharp':
      return { label: 'CRITICAL', tone: 'error' };
    case 'watch':
      return { label: 'VULNERABLE', tone: 'primary' };
    default:
      return { label: 'STABLE', tone: 'secondary' };
  }
}

function variantStatusFor(score, passed) {
  if (!passed) {
    return { label: 'FAIL', classes: TONE_CLASSES.error };
  }
  if (score >= 85) {
    return { label: 'PASS', classes: 'border-green-500/20 bg-green-500/10 text-green-400' };
  }
  return { label: 'WARN', classes: TONE_CLASSES.primary };
}

function packNoteFor(analysis) {
  if (!state.showHoldouts) {
    return 'Hidden holdouts are turned off.';
  }

  if (state.activeVariantTier === 'holdout') {
    return `Hidden holdouts · ${analysis.pack.holdoutVariants.length} rows`;
  }

  return `Visible variants · ${analysis.pack.visibleVariants.length} rows`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatCount(value) {
  return String(value).padStart(2, '0');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
