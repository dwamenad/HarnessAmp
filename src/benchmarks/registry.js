import { getV2Pack } from '../v2/packs/index.js';

export const BENCHMARK_SCHEMA_VERSION = 'harnessamp.benchmark.v0.1';
const BENCHMARK_CREATED_AT = '2026-06-14T00:00:00.000Z';
const PROFILE_VERSION = '0.1';
const SCENARIO_SET_VERSION = '0.1';

const BENCHMARK_SPECS = [
  ['retrievalguard-smoke-v0.1', 'retrievalguard-smoke', 'RetrievalGuard Smoke', '0.1', 'retrievalguard-core', 'retrieval', 'smoke', 400],
  ['retrievalguard-standard-v0.1', 'retrievalguard-standard', 'RetrievalGuard Standard', '0.1', 'retrievalguard-core', 'retrieval', 'standard', 4200],
  ['financeguard-smoke-v0.1', 'financeguard-smoke', 'FinanceGuard Smoke', '0.1', 'financeguard-core', 'finance', 'smoke', 400],
  ['healthguard-smoke-v0.1', 'healthguard-smoke', 'HealthGuard Smoke', '0.1', 'healthguard-core', 'healthcare', 'smoke', 400],
  ['customercareguard-smoke-v0.1', 'customercareguard-smoke', 'CustomerCareGuard Smoke', '0.1', 'customercareguard-core', 'customer support', 'smoke', 400],
  ['legalguard-smoke-v0.1', 'legalguard-smoke', 'LegalGuard Smoke', '0.1', 'legalguard-core', 'legal', 'smoke', 400],
  ['personalagentguard-smoke-v0.1', 'personalagentguard-smoke', 'PersonalAgentGuard Smoke', '0.1', 'personalagentguard-core', 'personal agent', 'smoke', 120],
  ['harnessruntimeguard-smoke-v0.1', 'harnessruntimeguard-smoke', 'HarnessRuntimeGuard Smoke', '0.1', 'harnessruntimeguard-core', 'agent harness runtime', 'smoke', 120],
];

export const scoringProfiles = {
  'retrievalguard-v0.1': {
    id: 'retrievalguard-v0.1',
    version: PROFILE_VERSION,
    maxScore: 100,
    severityWeights: { critical: 30, high: 12, major: 12, medium: 6, minor: 2, low: 1 },
    contractWeights: {
      'RG-C01': 1.2,
      'RG-C02': 1.2,
      'RG-C07': 1.15,
      'RG-C08': 1.15,
      'RG-C10': 1.1,
    },
    minimumPassingScore: 75,
    criticalFailureLimit: 0,
    optionalMetrics: {
      citationPrecision: { label: 'citation precision', warnBelow: 0.8 },
      recall: { label: 'recall' },
      finalAnswerRecall: { label: 'final-answer recall' },
      provenanceCompleteness: { label: 'provenance completeness' },
      missingSourceIds: { label: 'missing source IDs' },
      staleSourceIds: { label: 'stale source IDs' },
    },
  },
  'standard-domain-v0.1': {
    id: 'standard-domain-v0.1',
    version: PROFILE_VERSION,
    maxScore: 100,
    severityWeights: { critical: 30, high: 12, major: 12, medium: 6, minor: 2, low: 1 },
    contractWeights: {},
    minimumPassingScore: 75,
    criticalFailureLimit: 0,
    optionalMetrics: {},
  },
};

export const gateProfiles = {
  'retrievalguard-release-v0.1': {
    id: 'retrievalguard-release-v0.1',
    version: PROFILE_VERSION,
    blockCriticalCountAbove: 0,
    blockScoreBelow: 75,
    warnScoreBelow: 85,
    warnCitationPrecisionBelow: 0.8,
  },
  'standard-release-v0.1': {
    id: 'standard-release-v0.1',
    version: PROFILE_VERSION,
    blockCriticalCountAbove: 0,
    blockScoreBelow: 75,
    warnScoreBelow: 85,
  },
};

export const benchmarkRegistry = BENCHMARK_SPECS.map(([id, slug, name, version, packId, domain, tier, scenarioCount]) => {
  const pack = getV2Pack(packId);
  const isRetrieval = packId === 'retrievalguard-core';
  return {
    id,
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    slug,
    name,
    version,
    packVersion: pack.version ?? '0.1',
    packId,
    packName: pack.name.replace(/\s+Core$/u, ''),
    domain,
    tier,
    scenarioSetVersion: SCENARIO_SET_VERSION,
    description: `${name} v${version} runs the existing ${pack.name} mutation pack at ${tier} tier without changing scenario volume.`,
    scenarioCount,
    contractIds: pack.contracts.map((contract) => contract.id),
    mutationFamilyIds: Array.from(new Set(pack.mutations.map((mutation) => mutation.family ?? mutation.operator ?? mutation.id))),
    scoringProfileId: isRetrieval ? 'retrievalguard-v0.1' : 'standard-domain-v0.1',
    gateProfileId: isRetrieval ? 'retrievalguard-release-v0.1' : 'standard-release-v0.1',
    createdAt: BENCHMARK_CREATED_AT,
    updatedAt: BENCHMARK_CREATED_AT,
  };
});

export function listBenchmarks() {
  return benchmarkRegistry.map((benchmark) => ({ ...benchmark }));
}

export function getBenchmarkById(id) {
  return benchmarkRegistry.find((benchmark) => benchmark.id === id) ?? null;
}

export function getBenchmarkBySlug(slug) {
  return benchmarkRegistry.find((benchmark) => benchmark.slug === slug) ?? null;
}

export function benchmarkForRun(run = {}) {
  if (run.benchmarkId) return getBenchmarkById(run.benchmarkId);
  const packId = String(run.packId ?? '').trim();
  const tier = normalizeBenchmarkTier(run.tier);
  return benchmarkRegistry.find((benchmark) => benchmark.packId === packId && normalizeBenchmarkTier(benchmark.tier) === tier) ?? null;
}

export function getScoringProfile(id) {
  return scoringProfiles[id] ?? null;
}

export function getGateProfile(id) {
  return gateProfiles[id] ?? null;
}

export function createBenchmarkSnapshot(benchmark, capturedAt = new Date().toISOString()) {
  if (!benchmark) return null;
  const scoringProfile = getScoringProfile(benchmark.scoringProfileId);
  const gateProfile = getGateProfile(benchmark.gateProfileId);
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    id: benchmark.id,
    slug: benchmark.slug,
    name: benchmark.name,
    version: benchmark.version,
    packId: benchmark.packId,
    packName: benchmark.packName,
    packVersion: benchmark.packVersion ?? '0.1',
    domain: benchmark.domain,
    tier: benchmark.tier,
    scenarioCount: benchmark.scenarioCount,
    scenarioSetVersion: benchmark.scenarioSetVersion ?? SCENARIO_SET_VERSION,
    contractIds: [...benchmark.contractIds],
    mutationFamilyIds: [...benchmark.mutationFamilyIds],
    scoringProfile: scoringProfile ? profileSnapshot(scoringProfile) : null,
    gateProfile: gateProfile ? profileSnapshot(gateProfile) : null,
    scoringProfileId: benchmark.scoringProfileId,
    scoringProfileVersion: scoringProfile?.version ?? PROFILE_VERSION,
    gateProfileId: benchmark.gateProfileId,
    gateProfileVersion: gateProfile?.version ?? PROFILE_VERSION,
    description: benchmark.description,
    createdAt: benchmark.createdAt,
    updatedAt: benchmark.updatedAt,
    capturedAt,
  };
}

export function classifyBenchmarkRun({ run = {}, benchmark, scenarioCount } = {}) {
  if (run.benchmarkRunType === 'sample') return sampleRunType(benchmark);
  if (!benchmark) return { benchmarkRunType: 'customized', baseBenchmarkId: '', baseBenchmarkSlug: '', overridesApplied: ['benchmark'], customizationReason: 'No registry benchmark matched the run.' };
  const overrides = [];
  if (run.packId && run.packId !== benchmark.packId) overrides.push('packId');
  if (normalizeBenchmarkTier(run.tier) !== normalizeBenchmarkTier(benchmark.tier)) overrides.push('tier');
  if (run.failCondition && run.failCondition !== 'block on critical failures' && run.failCondition !== 'block on score below threshold') overrides.push('failCondition');
  if (Number.isFinite(Number(scenarioCount)) && Number(scenarioCount) < Number(benchmark.scenarioCount)) overrides.push('scenarioCount');
  const explicitMode = String(run.runMode ?? '').toLowerCase();
  if (explicitMode === 'sample') return sampleRunType(benchmark, overrides);
  if (overrides.length) {
    return {
      benchmarkRunType: 'customized',
      baseBenchmarkId: benchmark.id,
      baseBenchmarkSlug: benchmark.slug,
      overridesApplied: overrides,
      customizationReason: 'Advanced run settings differ from the versioned benchmark definition.',
    };
  }
  return {
    benchmarkRunType: 'official',
    baseBenchmarkId: benchmark.id,
    baseBenchmarkSlug: benchmark.slug,
    overridesApplied: [],
    customizationReason: '',
  };
}

export function scoreBenchmark({ benchmark, failures = [] } = {}) {
  const profile = getScoringProfile(benchmark?.scoringProfileId) ?? scoringProfiles['standard-domain-v0.1'];
  const penalty = failures.reduce((total, failure) => {
    const severity = String(failure.severity ?? '').toLowerCase();
    const severityWeight = profile.severityWeights[severity] ?? profile.severityWeights.major ?? 10;
    const contractWeight = profile.contractWeights[failure.contractId] ?? 1;
    return total + severityWeight * contractWeight;
  }, 0);
  const score = Math.max(0, Math.round(profile.maxScore - penalty));
  return {
    score,
    maxScore: profile.maxScore,
    passed: score >= profile.minimumPassingScore,
    minimumPassingScore: profile.minimumPassingScore,
    criticalFailureLimit: profile.criticalFailureLimit,
  };
}

export function evaluateBenchmarkGate({ benchmark, score, criticalCount = 0, metrics = {} } = {}) {
  const gate = getGateProfile(benchmark?.gateProfileId) ?? gateProfiles['standard-release-v0.1'];
  if (criticalCount > gate.blockCriticalCountAbove) {
    return gateDecision('block', 'critical failures present');
  }
  if (Number(score) < gate.blockScoreBelow) {
    return gateDecision('block', `score below ${gate.blockScoreBelow}`);
  }
  if (Number(score) < gate.warnScoreBelow) {
    return gateDecision('warn', `score below ${gate.warnScoreBelow}`);
  }
  if (
    metrics.citationPrecision != null
    && Number.isFinite(Number(metrics.citationPrecision))
    && Number(metrics.citationPrecision) < Number(gate.warnCitationPrecisionBelow)
  ) {
    return gateDecision('warn', `citation precision below ${gate.warnCitationPrecisionBelow}`);
  }
  return gateDecision('pass', 'meets benchmark gate');
}

export function releaseDecisionForGate(gateResult) {
  if (gateResult === 'block') return 'Block release';
  if (gateResult === 'warn') return 'Release with review';
  return 'Safe to release';
}

export function normalizeBenchmarkTier(tier) {
  const value = String(tier ?? 'smoke').toLowerCase();
  if (value === 'core') return 'standard';
  return value || 'smoke';
}

function gateDecision(result, reason) {
  return { result, reason };
}

function profileSnapshot(profile) {
  return {
    ...structuredCloneSafe(profile),
    version: profile.version ?? PROFILE_VERSION,
  };
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function sampleRunType(benchmark, overrides = []) {
  return {
    benchmarkRunType: 'sample',
    baseBenchmarkId: benchmark?.id ?? '',
    baseBenchmarkSlug: benchmark?.slug ?? '',
    overridesApplied: overrides.includes('scenarioCount') ? overrides : [...overrides, 'scenarioCount'],
    customizationReason: 'Sample runs are capped and are not official benchmark evidence.',
  };
}
