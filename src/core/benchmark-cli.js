import crypto from 'node:crypto';
import {
  applyBenchmarkPackEdits,
  cloneJson,
  diffBenchmarkPacks,
  normalizeReviewDecision,
  statusForReviewDecision,
  validateBenchmarkPackCandidate,
} from './benchmark-lifecycle.js';

export const BENCHMARK_LIFECYCLE_FORMAT = 'harnessamp.benchmark.lifecycle.v1';

export function isBenchmarkLifecycleDocument(value) {
  return Boolean(value && value.format === BENCHMARK_LIFECYCLE_FORMAT && Array.isArray(value.versions));
}

export function importBenchmarkPack(pack, options = {}) {
  const validation = validatePackOrThrow(pack);
  const now = options.now ?? new Date().toISOString();
  const benchmarkId = options.benchmarkId ?? createLifecycleId('bench');
  const versionId = options.versionId ?? createLifecycleId('benchver');
  const version = {
    id: versionId,
    benchmarkId,
    versionNumber: 1,
    status: 'draft',
    source: options.source ?? 'cli-import',
    pack: cloneJson(pack),
    validation,
    readiness: validation.summary,
    createdBy: options.userId ?? 'cli',
    approvedBy: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  return {
    format: BENCHMARK_LIFECYCLE_FORMAT,
    benchmark: {
      id: benchmarkId,
      name: validation.summary.project,
      slug: slugify(validation.summary.project),
      description: validation.summary.description,
      latestVersionId: versionId,
      approvedVersionId: null,
      createdBy: options.userId ?? 'cli',
      createdAt: now,
      updatedAt: now,
    },
    versions: [version],
    reviews: [],
    promotionCandidates: [],
    goldenCases: [],
  };
}

export function normalizeBenchmarkLifecycleInput(input, options = {}) {
  if (isBenchmarkLifecycleDocument(input)) return cloneJson(input);
  return importBenchmarkPack(input, options);
}

export function editBenchmarkLifecycleDocument(input, edits = {}, options = {}) {
  const document = normalizeBenchmarkLifecycleInput(input, options);
  const baseVersion = resolveBenchmarkLifecycleVersion(document, options.version ?? 'latest');
  const editedPack = applyBenchmarkPackEdits(baseVersion.pack, edits);
  const diff = diffBenchmarkPacks(baseVersion.pack, editedPack);
  if (diff.summary.changeCount === 0) {
    return {
      document,
      baseVersion,
      version: baseVersion,
      diff,
      unchanged: true,
    };
  }

  const validation = validatePackOrThrow(editedPack);
  const now = options.now ?? new Date().toISOString();
  const version = {
    id: options.versionId ?? createLifecycleId('benchver'),
    benchmarkId: document.benchmark.id,
    versionNumber: nextVersionNumber(document.versions),
    status: 'draft',
    source: options.source ?? `cli-edit:v${baseVersion.versionNumber}`,
    pack: editedPack,
    validation,
    readiness: validation.summary,
    createdBy: options.userId ?? 'cli',
    approvedBy: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  document.versions.push(version);
  document.benchmark.latestVersionId = version.id;
  document.benchmark.name = validation.summary.project;
  document.benchmark.slug = slugify(validation.summary.project);
  document.benchmark.description = validation.summary.description;
  document.benchmark.updatedAt = now;

  return {
    document,
    baseVersion,
    version,
    diff,
    unchanged: false,
  };
}

export function reviewBenchmarkLifecycleDocument(input, options = {}) {
  const document = normalizeBenchmarkLifecycleInput(input, options);
  const version = resolveBenchmarkLifecycleVersion(document, options.version ?? 'latest');
  const decision = normalizeReviewDecision(options.decision ?? 'reviewed');
  const status = statusForReviewDecision(decision, version.status);
  const now = options.now ?? new Date().toISOString();
  const review = {
    id: options.reviewId ?? createLifecycleId('benchrev'),
    versionId: version.id,
    benchmarkId: document.benchmark.id,
    reviewerId: options.userId ?? 'cli',
    decision,
    comments: options.comments ?? '',
    readinessSnapshot: cloneJson(version.readiness),
    createdAt: now,
  };

  version.status = status;
  version.updatedAt = now;
  if (status === 'approved') {
    version.approvedBy = options.userId ?? 'cli';
    version.approvedAt = now;
    document.benchmark.approvedVersionId = version.id;
  }
  document.benchmark.latestVersionId = version.id;
  document.benchmark.updatedAt = now;
  document.reviews.push(review);

  return {
    document,
    version,
    review,
  };
}

export function exportBenchmarkPack(input, selector = 'approved') {
  const document = normalizeBenchmarkLifecycleInput(input);
  const fallbackSelector = selector === 'approved' && !document.benchmark.approvedVersionId ? 'latest' : selector;
  const version = resolveBenchmarkLifecycleVersion(document, fallbackSelector);
  return cloneJson(version.pack);
}

export function diffBenchmarkLifecycleInputs(beforeInput, afterInput, options = {}) {
  const beforePack = isBenchmarkLifecycleDocument(beforeInput)
    ? resolveBenchmarkLifecycleVersion(beforeInput, options.beforeVersion ?? 'latest').pack
    : beforeInput;
  const afterPack = isBenchmarkLifecycleDocument(afterInput)
    ? resolveBenchmarkLifecycleVersion(afterInput, options.afterVersion ?? 'latest').pack
    : afterInput;
  return diffBenchmarkPacks(beforePack, afterPack);
}

export function summarizeBenchmarkLifecycleDocument(input) {
  const document = normalizeBenchmarkLifecycleInput(input);
  const latest = resolveBenchmarkLifecycleVersion(document, 'latest');
  const approved = document.benchmark.approvedVersionId
    ? resolveBenchmarkLifecycleVersion(document, 'approved')
    : null;
  return {
    benchmark: {
      id: document.benchmark.id,
      name: document.benchmark.name,
      description: document.benchmark.description,
      latestVersionId: document.benchmark.latestVersionId,
      approvedVersionId: document.benchmark.approvedVersionId,
    },
    latestVersion: summarizeVersion(latest),
    approvedVersion: approved ? summarizeVersion(approved) : null,
    versionCount: document.versions.length,
    reviewCount: document.reviews.length,
    promotionCandidateCount: document.promotionCandidates?.length ?? 0,
    goldenCaseCount: document.goldenCases?.length ?? 0,
  };
}

export function resolveBenchmarkLifecycleVersion(document, selector = 'latest') {
  if (!isBenchmarkLifecycleDocument(document)) {
    throw new Error('Benchmark lifecycle document is required.');
  }
  const versions = document.versions ?? [];
  if (!versions.length) throw new Error('Benchmark lifecycle document has no versions.');

  if (selector === 'latest') {
    return findVersionById(document, document.benchmark.latestVersionId)
      ?? [...versions].sort((left, right) => right.versionNumber - left.versionNumber)[0];
  }
  if (selector === 'approved') {
    const approved = findVersionById(document, document.benchmark.approvedVersionId)
      ?? [...versions].filter((item) => item.status === 'approved').sort((left, right) => right.versionNumber - left.versionNumber)[0];
    if (!approved) throw new Error('No approved benchmark version found.');
    return approved;
  }

  const numeric = Number(selector);
  const version = Number.isFinite(numeric)
    ? versions.find((item) => Number(item.versionNumber) === numeric)
    : findVersionById(document, selector);
  if (!version) throw new Error(`Benchmark version not found: ${selector}`);
  return version;
}

function validatePackOrThrow(pack) {
  const validation = validateBenchmarkPackCandidate(pack);
  if (!validation.ok) {
    throw new Error(`Invalid benchmark pack: ${validation.errors.join('; ')}`);
  }
  return validation;
}

function nextVersionNumber(versions) {
  return Math.max(0, ...versions.map((item) => Number(item.versionNumber ?? 0)).filter(Number.isFinite)) + 1;
}

function findVersionById(document, versionId) {
  if (!versionId) return null;
  return document.versions.find((item) => item.id === versionId) ?? null;
}

function summarizeVersion(version) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    source: version.source,
    readinessScore: version.readiness?.readinessScore ?? null,
    caseCount: version.readiness?.caseCount ?? null,
    toolCount: version.readiness?.toolCount ?? null,
    evidenceCount: version.readiness?.evidenceCount ?? null,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  };
}

function createLifecycleId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

function slugify(value) {
  return String(value ?? 'benchmark')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/(^-|-$)/gu, '')
    || 'benchmark';
}
