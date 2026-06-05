export const BENCHMARK_VERSION_STATUSES = ['draft', 'reviewed', 'approved', 'rejected', 'archived'];

export const BENCHMARK_REVIEW_DECISIONS = ['reviewed', 'request_changes', 'approve', 'reject', 'archive'];

export const GOLDEN_CASE_VISIBILITIES = ['visible', 'holdout'];

const EDITABLE_ARRAY_SEPARATOR = /\r?\n/u;

export function validateBenchmarkPackCandidate(pack) {
  const errors = [];
  if (!isObject(pack)) errors.push('Benchmark pack must be an object.');
  if (!stringValue(pack?.project)) errors.push('Benchmark pack project is required.');
  if (!stringValue(pack?.intent?.mission)) errors.push('intent.mission is required.');
  if (!isObject(pack?.contract)) errors.push('contract is required.');
  if (!Array.isArray(pack?.benchmark?.cases)) errors.push('benchmark.cases must be an array.');
  if (!isObject(pack?.wrapper)) errors.push('wrapper is required.');
  if (!stringValue(pack?.wrapper?.agentName)) errors.push('wrapper.agentName is required.');
  if (!Array.isArray(pack?.wrapper?.tools)) errors.push('wrapper.tools must be an array.');
  if (!isObject(pack?.wrapper?.runtime)) errors.push('wrapper.runtime is required.');

  return {
    ok: errors.length === 0,
    errors,
    summary: summarizeBenchmarkPack(pack),
  };
}

export function summarizeBenchmarkPack(pack) {
  const cases = Array.isArray(pack?.benchmark?.cases) ? pack.benchmark.cases : [];
  const tools = Array.isArray(pack?.wrapper?.tools) ? pack.wrapper.tools : [];
  const holdoutCases = cases.filter((item) => item?.tier === 'holdout');
  const visibleCases = cases.filter((item) => item?.tier !== 'holdout');
  const observations = Array.isArray(pack?.observations) ? pack.observations : [];
  const holdoutObservations = observations.filter((item) => item?.tier === 'holdout');
  const contractMust = Array.isArray(pack?.contract?.global?.must) ? pack.contract.global.must : [];
  const contractMustNot = Array.isArray(pack?.contract?.global?.mustNot) ? pack.contract.global.mustNot : [];
  const evidenceLinks = Array.isArray(pack?.evidence?.links) ? pack.evidence.links : [];
  const evidenceSources = Array.isArray(pack?.evidence?.sources) ? pack.evidence.sources : [];
  const mutationFamilies = [
    ...(Array.isArray(pack?.mutationPolicy?.visibleFamilies) ? pack.mutationPolicy.visibleFamilies : []),
    ...(Array.isArray(pack?.mutationPolicy?.holdoutFamilies) ? pack.mutationPolicy.holdoutFamilies : []),
  ];
  const holdoutSignalCount = Math.max(
    holdoutCases.length,
    holdoutObservations.length,
    Array.isArray(pack?.mutationPolicy?.holdoutFamilies) ? pack.mutationPolicy.holdoutFamilies.length : 0,
  );

  const readinessChecks = [
    { id: 'mission', passed: Boolean(stringValue(pack?.intent?.mission)) },
    { id: 'contract', passed: contractMust.length + contractMustNot.length > 0 },
    { id: 'cases', passed: cases.length > 0 },
    { id: 'holdouts', passed: holdoutSignalCount > 0 },
    { id: 'wrapper', passed: Boolean(stringValue(pack?.wrapper?.agentName) && tools.length > 0) },
    { id: 'mutation_policy', passed: mutationFamilies.length > 0 },
    { id: 'evidence', passed: evidenceLinks.length + evidenceSources.length > 0 },
  ];
  const readinessScore = Math.round((readinessChecks.filter((item) => item.passed).length / readinessChecks.length) * 100);

  return {
    project: stringValue(pack?.project) || 'Untitled benchmark',
    description: stringValue(pack?.description) || '',
    caseCount: cases.length,
    visibleCaseCount: visibleCases.length,
    holdoutCaseCount: holdoutSignalCount,
    holdoutObservationCount: holdoutObservations.length,
    toolCount: tools.length,
    contractRuleCount: contractMust.length + contractMustNot.length,
    evidenceCount: evidenceLinks.length + evidenceSources.length,
    readinessScore,
    readinessChecks,
  };
}

export function applyBenchmarkPackEdits(pack, edits = {}) {
  const next = cloneJson(pack);
  next.intent ??= {};
  next.contract ??= {};
  next.contract.global ??= {};
  next.benchmark ??= {};
  next.benchmark.summary ??= {};
  next.benchmark.cases ??= [];
  next.wrapper ??= {};
  next.wrapper.tools ??= [];
  next.evidence ??= {};

  if (hasStringEdit(edits.project)) next.project = edits.project.trim();
  if (edits.description != null) next.description = String(edits.description).trim();
  if (hasStringEdit(edits.intentMission)) next.intent.mission = edits.intentMission.trim();
  if (edits.successSignalsText != null) next.intent.successSignals = parseEditableList(edits.successSignalsText);
  if (edits.mustText != null) next.contract.global.must = parseEditableList(edits.mustText);
  if (edits.mustNotText != null) next.contract.global.mustNot = parseEditableList(edits.mustNotText);
  if (edits.tagsText != null) next.tags = parseEditableList(edits.tagsText);
  if (edits.metadataJson != null) next.metadata = parseObjectEdit(edits.metadataJson, 'metadata');
  if (edits.thresholdsText != null) next.benchmark.summary = parseThresholdsEdit(edits.thresholdsText);
  if (edits.casesJson != null) next.benchmark.cases = parseArrayEdit(edits.casesJson, 'benchmark.cases');
  if (edits.toolsJson != null) next.wrapper.tools = parseArrayEdit(edits.toolsJson, 'wrapper.tools');
  if (edits.evidenceSourcesJson != null) next.evidence.sources = parseArrayEdit(edits.evidenceSourcesJson, 'evidence.sources');
  if (edits.evidenceLinksJson != null) next.evidence.links = parseArrayEdit(edits.evidenceLinksJson, 'evidence.links');

  if (isObject(edits.casePatch)) {
    const caseId = stringValue(edits.casePatch.id);
    const index = caseId
      ? next.benchmark.cases.findIndex((item) => item.id === caseId)
      : 0;
    if (index >= 0) {
      next.benchmark.cases[index] = {
        ...next.benchmark.cases[index],
        ...normalizeCasePatch(edits.casePatch),
      };
    }
  }

  if (isObject(edits.toolPatch)) {
    const toolName = stringValue(edits.toolPatch.name);
    const index = toolName
      ? next.wrapper.tools.findIndex((item) => item.name === toolName)
      : 0;
    if (index >= 0) {
      next.wrapper.tools[index] = {
        ...next.wrapper.tools[index],
        ...normalizeToolPatch(edits.toolPatch),
      };
    }
  }

  return next;
}

export function diffBenchmarkPacks(before, after) {
  const changedFields = [
    fieldChange('project', before?.project, after?.project),
    fieldChange('description', before?.description, after?.description),
    fieldChange('intent.mission', before?.intent?.mission, after?.intent?.mission),
    fieldChange('intent.successSignals', before?.intent?.successSignals, after?.intent?.successSignals),
    fieldChange('contract.global.must', before?.contract?.global?.must, after?.contract?.global?.must),
    fieldChange('contract.global.mustNot', before?.contract?.global?.mustNot, after?.contract?.global?.mustNot),
    fieldChange('benchmark.summary', before?.benchmark?.summary, after?.benchmark?.summary),
    fieldChange('metadata', before?.metadata, after?.metadata),
    fieldChange('tags', before?.tags, after?.tags),
    fieldChange('wrapper.agentName', before?.wrapper?.agentName, after?.wrapper?.agentName),
    fieldChange('mutationPolicy.visibleFamilies', before?.mutationPolicy?.visibleFamilies, after?.mutationPolicy?.visibleFamilies),
    fieldChange('mutationPolicy.holdoutFamilies', before?.mutationPolicy?.holdoutFamilies, after?.mutationPolicy?.holdoutFamilies),
  ].filter(Boolean);

  const caseChanges = diffObjectList(before?.benchmark?.cases, after?.benchmark?.cases);
  const toolChanges = diffObjectList(before?.wrapper?.tools, after?.wrapper?.tools, 'name');
  const evidenceSourceChanges = diffObjectList(before?.evidence?.sources, after?.evidence?.sources);
  const evidenceLinkChanges = diffObjectList(before?.evidence?.links, after?.evidence?.links, 'url');
  const evidenceChangeCount = evidenceSourceChanges.added.length
    + evidenceSourceChanges.removed.length
    + evidenceSourceChanges.changed.length
    + evidenceLinkChanges.added.length
    + evidenceLinkChanges.removed.length
    + evidenceLinkChanges.changed.length;
  const changeCount = changedFields.length
    + caseChanges.added.length
    + caseChanges.removed.length
    + caseChanges.changed.length
    + toolChanges.added.length
    + toolChanges.removed.length
    + toolChanges.changed.length
    + evidenceChangeCount;

  return {
    changedFields,
    caseChanges,
    toolChanges,
    evidenceSourceChanges,
    evidenceLinkChanges,
    summary: {
      changeCount,
      fieldChangeCount: changedFields.length,
      caseChangeCount: caseChanges.added.length + caseChanges.removed.length + caseChanges.changed.length,
      toolChangeCount: toolChanges.added.length + toolChanges.removed.length + toolChanges.changed.length,
      evidenceChangeCount,
    },
  };
}

export function normalizeReviewDecision(decision) {
  const normalized = String(decision || '').trim().toLowerCase();
  if (!BENCHMARK_REVIEW_DECISIONS.includes(normalized)) {
    throw new Error(`Unknown benchmark review decision: ${decision}`);
  }
  return normalized;
}

export function statusForReviewDecision(decision, currentStatus = 'draft') {
  const normalized = normalizeReviewDecision(decision);
  if (normalized === 'approve') return 'approved';
  if (normalized === 'reject') return 'rejected';
  if (normalized === 'archive') return 'archived';
  if (normalized === 'reviewed' || normalized === 'request_changes') return 'reviewed';
  return currentStatus;
}

export function normalizeGoldenCaseVisibility(visibility) {
  const normalized = String(visibility || 'visible').trim().toLowerCase();
  if (!GOLDEN_CASE_VISIBILITIES.includes(normalized)) {
    throw new Error(`Unknown golden case visibility: ${visibility}`);
  }
  return normalized;
}

export function nextBenchmarkVersionNumber(versions) {
  const numbers = versions
    .map((item) => Number(item.versionNumber ?? item.version_number ?? 0))
    .filter((value) => Number.isFinite(value));
  return Math.max(0, ...numbers) + 1;
}

export function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function hasStringEdit(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseEditableList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value ?? '')
    .split(EDITABLE_ARRAY_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArrayEdit(value, label) {
  if (Array.isArray(value)) return cloneJson(value);
  const parsed = parseJsonEdit(value, label);
  if (!Array.isArray(parsed)) throw invalidEdit(`${label} must be a JSON array.`);
  return parsed;
}

function parseObjectEdit(value, label) {
  if (isObject(value)) return cloneJson(value);
  const parsed = parseJsonEdit(value, label);
  if (!isObject(parsed)) throw invalidEdit(`${label} must be a JSON object.`);
  return parsed;
}

function parseThresholdsEdit(value) {
  if (isObject(value)) return cloneJson(value);
  const text = String(value ?? '').trim();
  if (!text) return {};
  if (text.startsWith('{')) return parseObjectEdit(text, 'benchmark.summary');

  return Object.fromEntries(
    text.split(EDITABLE_ARRAY_SEPARATOR)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^([^:=]+)\s*[:=]\s*(.+)$/u);
        if (!match) throw invalidEdit(`Threshold line must use key: value format: ${line}`);
        return [match[1].trim(), parseScalar(match[2].trim())];
      }),
  );
}

function parseJsonEdit(value, label) {
  try {
    return JSON.parse(String(value ?? '').trim() || 'null');
  } catch (error) {
    throw invalidEdit(`${label} is not valid JSON: ${error.message}`);
  }
}

function parseScalar(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  const number = Number(value);
  return Number.isFinite(number) && value !== '' ? number : value;
}

function normalizeCasePatch(patch) {
  const next = {};
  ['id', 'title', 'input', 'tier'].forEach((key) => {
    if (hasStringEdit(patch[key])) next[key] = patch[key].trim();
  });
  if (patch.allowedAgentsText != null) next.allowedAgents = parseEditableList(patch.allowedAgentsText);
  if (patch.expectedMilestonesText != null) next.expectedMilestones = parseEditableList(patch.expectedMilestonesText);
  if (patch.assertionsText != null) next.assertions = parseEditableList(patch.assertionsText);
  if (patch.forbiddenActionsText != null) next.forbiddenActions = parseEditableList(patch.forbiddenActionsText);
  if (patch.passRulesText != null) next.passRules = parseEditableList(patch.passRulesText);
  if (patch.rubricFieldsText != null) next.rubricFields = parseEditableList(patch.rubricFieldsText);
  if (patch.metadataJson != null) next.metadata = parseObjectEdit(patch.metadataJson, 'case.metadata');
  if (patch.seed != null) {
    const seed = Number(patch.seed);
    if (Number.isFinite(seed)) next.seed = seed;
  }
  return next;
}

function normalizeToolPatch(patch) {
  const next = {};
  ['name', 'description'].forEach((key) => {
    if (hasStringEdit(patch[key])) next[key] = patch[key].trim();
  });
  if (patch.schemaJson != null) next.schema = parseObjectEdit(patch.schemaJson, 'tool.schema');
  return next;
}

function invalidEdit(message) {
  return new Error(`Invalid benchmark edits: ${message}`);
}

function fieldChange(field, before, after) {
  if (stableStringify(before) === stableStringify(after)) return null;
  return {
    field,
    before: simplifyDiffValue(before),
    after: simplifyDiffValue(after),
  };
}

function diffObjectList(before = [], after = [], key = 'id') {
  const beforeItems = Array.isArray(before) ? before : [];
  const afterItems = Array.isArray(after) ? after : [];
  const beforeMap = new Map(beforeItems.map((item, index) => [item?.[key] ?? `index_${index}`, item]));
  const afterMap = new Map(afterItems.map((item, index) => [item?.[key] ?? `index_${index}`, item]));
  const added = [];
  const removed = [];
  const changed = [];

  for (const [id, item] of afterMap.entries()) {
    if (!beforeMap.has(id)) {
      added.push(id);
      continue;
    }
    if (stableStringify(beforeMap.get(id)) !== stableStringify(item)) changed.push(id);
  }

  for (const id of beforeMap.keys()) {
    if (!afterMap.has(id)) removed.push(id);
  }

  return { added, removed, changed };
}

function simplifyDiffValue(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return null;
  if (typeof value === 'object') return value;
  return String(value);
}

function stableStringify(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJson(value[key])]),
  );
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}
