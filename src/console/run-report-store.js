import {
  buildReportPayload,
  localRunReportId,
  reportCsv,
  reportMarkdown,
  reportPrintHtml,
} from './report-export.js';

export const RUN_REPORT_STORAGE_KEY = 'harnessamp.runReportState.v1';

const RUN_STATUSES = new Set(['queued', 'running', 'completed', 'failed', 'canceled']);
const OBSERVATION_STATUSES = new Set(['pass', 'fail', 'warning', 'skipped']);
const REPORT_ARTIFACT_FORMATS = ['print_html', 'json', 'csv', 'markdown'];

export function emptyRunReportState() {
  return {
    harnesses: [],
    runs: [],
    observations: [],
    failures: [],
    reports: [],
    artifacts: [],
    updatedAt: '',
  };
}

export function loadRunReportState(storage = globalThis.localStorage) {
  if (!storage) return emptyRunReportState();
  try {
    return normalizeRunReportState(JSON.parse(storage.getItem(RUN_REPORT_STORAGE_KEY) ?? '{}'));
  } catch {
    return emptyRunReportState();
  }
}

export function persistRunReportState(state, storage = globalThis.localStorage) {
  if (!storage) return normalizeRunReportState(state);
  const next = {
    ...normalizeRunReportState(state),
    updatedAt: new Date().toISOString(),
  };
  storage.setItem(RUN_REPORT_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function syncConsoleStateToRunReportState(state, { harnesses = [], runs = [], reportContext = {} } = {}) {
  let next = normalizeRunReportState(state);
  harnesses.forEach((harness) => {
    next = upsertHarness(next, harness);
  });
  runs.forEach((run) => {
    next = upsertRun(next, run, { harnesses });
    if (run.status === 'completed') {
      next = completeRun(next, run, { ...reportContext, harnesses });
    }
  });
  return next;
}

export function upsertHarness(state, value) {
  const now = new Date().toISOString();
  const existingState = normalizeRunReportState(state);
  const existing = existingState.harnesses.find((item) => item.id === String(value?.id ?? '').trim());
  const harness = normalizeHarness({
    ...existing,
    id: value.id,
    name: value.name,
    project: value.project,
    domain: value.domain,
    agentVersion: value.agentVersion,
    endpointUrl: value.endpointUrl ?? value.endpoint,
    authType: value.authType,
    environment: value.environment,
    createdAt: existing?.createdAt ?? value.createdAt ?? now,
    updatedAt: now,
  });
  if (!harness) return existingState;
  return {
    ...existingState,
    harnesses: [harness, ...existingState.harnesses.filter((item) => item.id !== harness.id)],
  };
}

export function upsertRun(state, value, { harnesses = [] } = {}) {
  const now = new Date().toISOString();
  const existingState = normalizeRunReportState(state);
  const existing = existingState.runs.find((item) => item.id === String(value?.id ?? '').trim());
  const run = normalizeRun({
    ...existing,
    id: value.id,
    harnessId: value.harnessId,
    packId: value.packId,
    packName: value.packName ?? value.pack,
    tier: value.tier,
    status: value.status,
    score: value.score,
    criticalCount: value.criticalCount ?? value.critical,
    observationCount: value.observationCount ?? value.observations,
    environment: value.environment ?? environmentForRun(value, harnesses),
    evidenceMode: value.evidenceMode ?? evidenceModeForRun(value),
    adapterMode: value.adapterMode,
    startedAt: value.startedAt ?? value.started,
    completedAt: value.completedAt ?? (value.status === 'completed' ? value.completedAt ?? now : ''),
    createdAt: existing?.createdAt ?? value.createdAt ?? now,
    updatedAt: now,
    consoleRun: value,
  });
  if (!run) return existingState;
  return {
    ...existingState,
    runs: [run, ...existingState.runs.filter((item) => item.id !== run.id)].slice(0, 50),
  };
}

export function markRunRunning(state, runId) {
  const existingState = normalizeRunReportState(state);
  return {
    ...existingState,
    runs: existingState.runs.map((run) => run.id === runId
      ? { ...run, status: 'running', updatedAt: new Date().toISOString() }
      : run),
  };
}

export function completeRun(state, run, context = {}) {
  const existingState = upsertRun(state, run, context);
  const persistedRun = existingState.runs.find((item) => item.id === run.id);
  if (!persistedRun || persistedRun.status !== 'completed') return existingState;

  const observations = normalizeObservationsForRun(run, persistedRun);
  const rawFailures = normalizeFailuresForRun(run, observations);
  const report = buildPersistedReport(run, persistedRun, rawFailures, context);
  const failures = rawFailures.map((failure) => ({ ...failure, reportId: report.id }));
  const artifacts = buildReportArtifacts(report);

  return {
    ...existingState,
    observations: [
      ...observations,
      ...existingState.observations.filter((item) => item.runId !== run.id),
    ],
    failures: [
      ...failures,
      ...existingState.failures.filter((item) => item.runId !== run.id),
    ],
    reports: [
      report,
      ...existingState.reports.filter((item) => item.id !== report.id),
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    artifacts: [
      ...artifacts,
      ...existingState.artifacts.filter((item) => item.reportId !== report.id),
    ],
  };
}

export function listRealReports(state) {
  return normalizeRunReportState(state).reports
    .filter((report) => report.sourceFidelity !== 'seeded sample')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function latestCompletedRealRun(state) {
  const reports = listRealReports(state);
  const latestReport = reports[0];
  if (!latestReport) return null;
  return normalizeRunReportState(state).runs.find((run) => run.id === latestReport.runId) ?? null;
}

export function getReportPayload(state, reportId) {
  const report = normalizeRunReportState(state).reports.find((item) => item.id === reportId);
  return report?.exportPayload ?? null;
}

export function getReportArtifact(state, reportId, format) {
  const normalizedFormat = format === 'print' ? 'print_html' : format;
  return normalizeRunReportState(state).artifacts.find((item) => item.reportId === reportId && item.format === normalizedFormat) ?? null;
}

export function reportRowFromPersistedReport(report) {
  return {
    id: report.id,
    runId: report.runId,
    name: report.title,
    cells: [
      report.title,
      report.project,
      report.harnessName,
      report.packName,
      report.createdAt,
      String(report.score),
      String(report.criticalCount),
      report.adapterMode ? `${displayEvidenceMode(report.evidenceMode)} / ${report.adapterMode}` : displayEvidenceMode(report.evidenceMode),
    ],
    decision: report.releaseDecision,
    tone: report.criticalCount > 0 || report.gateResult === 'fail' ? 'critical' : 'passed',
  };
}

export function seededReportRowFromFixture(row, index, reportSlug) {
  const critical = Number(row[6]);
  const decision = critical > 0 ? 'Block release' : 'Safe to release';
  return {
    id: reportSlug(row[0], index),
    runId: '',
    name: row[0],
    seeded: true,
    cells: [...row, 'seeded sample'],
    decision,
    tone: critical > 0 ? 'critical' : 'passed',
  };
}

export function failureRowsFromState(state) {
  return normalizeRunReportState(state).failures
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((failure) => [
      titleCase(failure.severity),
      failure.title,
      failure.mutationId,
      failure.contractId,
      'New',
      ownerForFailure(failure),
      failure.evidence?.reproducibility ?? '1/1',
      failure.id,
    ]);
}

export function failurePayloadFromState(state, failureId) {
  const failure = normalizeRunReportState(state).failures.find((item) => item.id === failureId);
  if (!failure) return null;
  return {
    id: failure.id,
    severity: titleCase(failure.severity),
    contract: failure.title,
    mutation: failure.mutationId,
    scenario: failure.contractId,
    status: 'New',
    owner: ownerForFailure(failure),
    reproducibility: failure.evidence?.reproducibility ?? '1/1',
    expected: failure.evidence?.expected ?? 'Runner output should satisfy the configured contract.',
    observed: failure.evidence?.observed ?? failure.summary,
    why: failure.summary,
    original: failure.evidence?.input ?? '',
    mutated: failure.mutationId,
    output: failure.evidence?.output ?? '',
    context: Array.isArray(failure.evidence?.sources) ? failure.evidence.sources.join(', ') : '',
    reasoning: failure.evidence?.reason ?? failure.summary,
    clause: failure.contractId,
    recommendedOwner: ownerForFailure(failure),
    recommendedFix: Array.isArray(failure.remediation) ? failure.remediation[0] : String(failure.remediation ?? ''),
    runId: failure.runId,
    reportId: failure.reportId,
  };
}

function normalizeRunReportState(value) {
  return {
    harnesses: Array.isArray(value?.harnesses) ? value.harnesses.map(normalizeHarness).filter(Boolean) : [],
    runs: Array.isArray(value?.runs) ? value.runs.map(normalizeRun).filter(Boolean) : [],
    observations: Array.isArray(value?.observations) ? value.observations.map(normalizeObservation).filter(Boolean) : [],
    failures: Array.isArray(value?.failures) ? value.failures.map(normalizeFailure).filter(Boolean) : [],
    reports: Array.isArray(value?.reports) ? value.reports.map(normalizeReport).filter(Boolean) : [],
    artifacts: Array.isArray(value?.artifacts) ? value.artifacts.map(normalizeArtifact).filter(Boolean) : [],
    updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : '',
  };
}

function normalizeHarness(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id ?? '').trim();
  const name = String(value.name ?? '').trim();
  if (!id || !name) return null;
  const now = new Date().toISOString();
  return {
    id,
    name,
    project: String(value.project ?? 'Unassigned Project'),
    domain: String(value.domain ?? 'general agent'),
    agentVersion: String(value.agentVersion ?? 'unknown'),
    endpointUrl: String(value.endpointUrl ?? value.endpoint ?? ''),
    authType: String(value.authType ?? 'none'),
    environment: String(value.environment ?? 'local'),
    createdAt: String(value.createdAt ?? now),
    updatedAt: String(value.updatedAt ?? value.createdAt ?? now),
  };
}

function normalizeRun(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id ?? '').trim();
  if (!id) return null;
  const status = RUN_STATUSES.has(value.status) ? value.status : 'queued';
  const now = new Date().toISOString();
  return {
    id,
    harnessId: String(value.harnessId ?? ''),
    packId: String(value.packId ?? ''),
    packName: String(value.packName ?? value.pack ?? 'Custom Pack'),
    tier: String(value.tier ?? 'smoke'),
    status,
    score: normalizeNumber(value.score, null),
    criticalCount: normalizeNumber(value.criticalCount ?? value.critical, 0),
    observationCount: normalizeNumber(value.observationCount ?? value.observations, 0),
    environment: String(value.environment ?? 'local'),
    evidenceMode: normalizeEvidenceMode(value.evidenceMode),
    adapterMode: String(value.adapterMode ?? ''),
    startedAt: String(value.startedAt ?? value.started ?? now),
    completedAt: String(value.completedAt ?? ''),
    createdAt: String(value.createdAt ?? now),
    updatedAt: String(value.updatedAt ?? value.createdAt ?? now),
    consoleRun: value.consoleRun ?? null,
  };
}

function normalizeObservation(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id ?? '').trim();
  const runId = String(value.runId ?? '').trim();
  if (!id || !runId) return null;
  return {
    id,
    runId,
    scenarioId: String(value.scenarioId ?? ''),
    mutationId: String(value.mutationId ?? ''),
    contractId: String(value.contractId ?? ''),
    status: OBSERVATION_STATUSES.has(value.status) ? value.status : 'warning',
    severity: String(value.severity ?? 'major').toLowerCase(),
    input: value.input ?? null,
    output: String(value.output ?? ''),
    evaluatorReason: String(value.evaluatorReason ?? ''),
    evidenceMode: normalizeEvidenceMode(value.evidenceMode),
    adapterMode: String(value.adapterMode ?? ''),
    createdAt: String(value.createdAt ?? new Date().toISOString()),
  };
}

function normalizeFailure(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id ?? '').trim();
  const runId = String(value.runId ?? '').trim();
  if (!id || !runId) return null;
  return {
    id,
    runId,
    reportId: String(value.reportId ?? ''),
    observationId: String(value.observationId ?? ''),
    contractId: String(value.contractId ?? ''),
    mutationId: String(value.mutationId ?? ''),
    severity: String(value.severity ?? 'critical').toLowerCase(),
    title: String(value.title ?? 'Contract failure'),
    summary: String(value.summary ?? 'Runner output failed the configured contract.'),
    evidence: value.evidence && typeof value.evidence === 'object' ? value.evidence : {},
    remediation: Array.isArray(value.remediation) ? value.remediation.map(String) : [],
    createdAt: String(value.createdAt ?? new Date().toISOString()),
  };
}

function normalizeReport(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id ?? '').trim();
  const runId = String(value.runId ?? '').trim();
  if (!id || !runId) return null;
  const now = new Date().toISOString();
  return {
    id,
    runId,
    title: String(value.title ?? 'Run report'),
    releaseDecision: String(value.releaseDecision ?? 'Release with review'),
    gateResult: String(value.gateResult ?? 'warn'),
    score: normalizeNumber(value.score, 0),
    criticalCount: normalizeNumber(value.criticalCount, 0),
    observationCount: normalizeNumber(value.observationCount, 0),
    environment: String(value.environment ?? 'local'),
    evidenceMode: normalizeEvidenceMode(value.evidenceMode),
    adapterMode: String(value.adapterMode ?? ''),
    sourceFidelity: String(value.sourceFidelity ?? displayEvidenceMode(value.evidenceMode)),
    failureEvidence: Array.isArray(value.failureEvidence) ? value.failureEvidence : [],
    remediationChecklist: Array.isArray(value.remediationChecklist) ? value.remediationChecklist.map(String) : [],
    regressionPlan: value.regressionPlan ?? {},
    auditTrail: Array.isArray(value.auditTrail) ? value.auditTrail : [],
    project: String(value.project ?? 'Local preview'),
    harnessName: String(value.harnessName ?? 'Local harness'),
    packName: String(value.packName ?? 'Custom Pack'),
    exportPayload: value.exportPayload ?? null,
    createdAt: String(value.createdAt ?? now),
    updatedAt: String(value.updatedAt ?? value.createdAt ?? now),
  };
}

function normalizeArtifact(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id ?? '').trim();
  const reportId = String(value.reportId ?? '').trim();
  const format = String(value.format ?? '');
  if (!id || !reportId || !REPORT_ARTIFACT_FORMATS.includes(format)) return null;
  return {
    id,
    reportId,
    format,
    content: String(value.content ?? ''),
    createdAt: String(value.createdAt ?? new Date().toISOString()),
  };
}

function normalizeObservationsForRun(run, persistedRun) {
  const now = new Date().toISOString();
  const rawObservations = Array.isArray(run.runnerObservations) ? run.runnerObservations : [];
  if (!rawObservations.length) {
    return [{
      id: `${run.id}:contract-smoke-preview`,
      runId: run.id,
      scenarioId: `${run.packId || run.pack}-smoke`,
      mutationId: 'contract_smoke_preview',
      contractId: `${run.pack || persistedRun.packName} smoke contract`,
      status: persistedRun.criticalCount > 0 ? 'fail' : 'pass',
      severity: persistedRun.criticalCount > 0 ? 'critical' : 'minor',
      input: null,
      output: '',
      evaluatorReason: 'No runner observation was captured; report is a contract-smoke preview.',
      evidenceMode: 'contract-smoke preview',
      adapterMode: run.adapterMode ?? '',
      createdAt: now,
    }];
  }

  return rawObservations.map((observation, index) => {
    const failureModes = Array.isArray(observation.failure_modes) ? observation.failure_modes : [];
    return {
      id: `${run.id}:obs-${index + 1}`,
      runId: run.id,
      scenarioId: String(observation.scenario_id ?? observation.metadata?.variantId ?? `scenario-${index + 1}`),
      mutationId: String(observation.mutation_id ?? observation.metadata?.mutationId ?? 'runner_observation'),
      contractId: contractIdForObservation(run, observation),
      status: failureModes.length || persistedRun.criticalCount > 0 ? 'fail' : 'pass',
      severity: failureModes.length || persistedRun.criticalCount > 0 ? 'critical' : 'minor',
      input: observation.input ?? observation.query ?? null,
      output: String(observation.final_answer ?? observation.output ?? ''),
      evaluatorReason: failureModes.length ? failureModes.join(', ') : 'Runner observation captured for report evidence.',
      evidenceMode: 'runner observation',
      adapterMode: String(observation.metadata?.mode ?? run.adapterMode ?? ''),
      createdAt: now,
    };
  });
}

function normalizeFailuresForRun(run, observations) {
  const now = new Date().toISOString();
  return observations
    .filter((observation) => observation.status === 'fail')
    .map((observation, index) => ({
      id: `${run.id}:failure-${index + 1}`,
      runId: run.id,
      observationId: observation.id,
      contractId: observation.contractId,
      mutationId: observation.mutationId,
      severity: observation.severity,
      title: `${run.pack} ${observation.contractId}`,
      summary: observation.evaluatorReason || 'Runner observation failed the configured contract.',
      evidence: {
        input: observation.input,
        output: observation.output,
        reason: observation.evaluatorReason,
        expected: 'Preserve required source facts and fail safely when evidence is incomplete.',
        observed: observation.output || 'No final answer captured.',
        sources: evidenceSourcesForRunObservation(run, observation),
        reproducibility: '1/1',
      },
      remediation: [
        'Block promotion until this failure is triaged.',
        'Pin the scenario and mutation to the release-blocker regression suite.',
        'Rerun the same harness, pack, and tier after remediation.',
      ],
      createdAt: now,
    }));
}

function buildPersistedReport(run, persistedRun, failures, context) {
  const payload = buildReportPayload(localRunReportId(run), {
    ...context,
    localRuns: [run],
  });
  const now = new Date().toISOString();
  return normalizeReport({
    id: payload.id,
    runId: run.id,
    title: payload.name,
    releaseDecision: payload.releaseDecision,
    gateResult: payload.gate?.thresholds?.some((item) => item.result === 'fail') ? 'fail' : 'pass',
    score: persistedRun.score ?? payload.score,
    criticalCount: persistedRun.criticalCount,
    observationCount: persistedRun.observationCount,
    environment: payload.environment,
    evidenceMode: displayEvidenceMode(payload.evidenceMode),
    adapterMode: payload.adapterMode ?? '',
    sourceFidelity: payload.retrievalEvidence ? 'retrieval source fidelity attached' : displayEvidenceMode(payload.evidenceMode),
    failureEvidence: payload.failureEvidence,
    remediationChecklist: payload.remediation,
    regressionPlan: payload.regressionPlan,
    auditTrail: payload.auditTrail,
    project: payload.project,
    harnessName: payload.harness,
    packName: payload.pack,
    exportPayload: {
      ...payload,
      failureIds: failures.map((failure) => failure.id),
    },
    createdAt: persistedRun.completedAt || now,
    updatedAt: now,
  });
}

function buildReportArtifacts(report) {
  const payload = report.exportPayload;
  const now = new Date().toISOString();
  return [
    ['print_html', reportPrintHtml(payload)],
    ['json', JSON.stringify(payload, null, 2)],
    ['csv', reportCsv(payload)],
    ['markdown', reportMarkdown(payload)],
  ].map(([format, content]) => ({
    id: `${report.id}:${format}`,
    reportId: report.id,
    format,
    content,
    createdAt: now,
  }));
}

function evidenceModeForRun(run) {
  if (Array.isArray(run.runnerObservations) && run.runnerObservations.length) return 'runner observation';
  return 'contract-smoke preview';
}

function normalizeEvidenceMode(value) {
  const text = String(value ?? '').replace(/-/gu, ' ').trim().toLowerCase();
  if (text === 'runner observation') return 'runner observation';
  if (text === 'contract smoke preview' || text === 'contract-smoke preview') return 'contract-smoke preview';
  if (text === 'seeded sample') return 'seeded sample';
  return text || 'contract-smoke preview';
}

function displayEvidenceMode(value) {
  return normalizeEvidenceMode(value);
}

function environmentForRun(run, harnesses) {
  return harnesses.find((harness) => harness.id === run.harnessId)?.environment
    ?? String(run.harness ?? '').split(' - ')[1]?.trim()
    ?? 'local';
}

function contractIdForObservation(run, observation) {
  if (/retrieval/iu.test(run.pack)) return 'source fidelity';
  return String(observation.contract_id ?? observation.metadata?.contractId ?? `${run.pack} contract`);
}

function evidenceSourcesForRunObservation(run, observation) {
  const raw = Array.isArray(run.runnerObservations) ? run.runnerObservations : [];
  const match = raw.find((item) => String(item.scenario_id ?? '') === observation.scenarioId);
  if (!match || !Array.isArray(match.curated_evidence)) return [];
  return match.curated_evidence.map((item) => item.doc_id ?? item.title ?? item.url ?? 'unknown-source').filter(Boolean);
}

function ownerForFailure(failure) {
  if (/retrieval|source/iu.test(`${failure.title} ${failure.contractId}`)) return 'Knowledge Review';
  if (/health|clinical/iu.test(`${failure.title} ${failure.contractId}`)) return 'Clinical Safety';
  return 'Safety Review';
}

function normalizeNumber(value, fallback) {
  if (value == null || value === '--') return fallback;
  const number = Number.parseInt(String(value).replace(/,/gu, ''), 10);
  return Number.isFinite(number) ? number : fallback;
}

function titleCase(value) {
  const text = String(value ?? '').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : '';
}
