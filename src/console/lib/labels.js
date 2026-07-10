export const workspaceModeLabels = {
  sampleWorkspace: {
    id: 'sample-workspace',
    label: 'Sample workspace',
    detail: 'Sample data and browser-persisted actions only. Not production release evidence.',
  },
  connectedProject: {
    id: 'connected-project',
    label: 'Connected project',
    detail: 'Project-backed state is connected. Validate execution targets before release evidence.',
  },
  productionRun: {
    id: 'production-run',
    label: 'Production run',
    detail: 'Worker-backed run with production-capable execution target evidence.',
  },
};

export const dataModeLabels = {
  sampleData: 'Sample data',
  realExecution: 'Real execution',
  localPreview: 'Local preview',
  ephemeralTarget: 'Ephemeral',
  productionGradeTarget: 'Production-grade',
};

export const evidenceTypeLabels = {
  sample_data: 'Sample evidence',
  seeded_sample: 'Seeded sample evidence',
  real_execution: 'Release evidence',
  runner_observation: 'Trace-backed release evidence',
  local_preview: 'Local preview evidence',
  agent_harness_fixture: 'Fixture evidence',
};

export const readinessLabels = {
  healthy: 'Certified',
  needsValidation: 'Needs validation',
  recentlyFailing: 'Recently failing',
  unstable: 'Unstable',
  ephemeral: 'Ephemeral',
  contractMismatch: 'Contract mismatch',
  releaseBlocked: 'Blocked',
  releaseEligible: 'Certified',
  warningsPresent: 'Warnings present',
  notApplicable: 'Not certifiable',
  sample: 'Sample data',
  realExecution: 'Real execution',
};

export const releaseVerdictLabels = {
  eligible: 'Certified',
  blocked: 'Blocked',
  warning: 'Warning',
  notApplicable: 'Not certifiable',
};

export const toolchainQaLabels = {
  productCategory: 'Agent Toolchain QA',
  releaseCertification: 'Release certification',
  releaseEvidence: 'Toolchain Release Evidence',
  agentToolContract: 'Agent-tool contract',
  toolContractValidation: 'Tool contract validation',
  toolchainReadiness: 'Toolchain Readiness',
  failureInjection: 'Failure injection',
  unsafeAction: 'Unsafe action failure',
  permissionBoundary: 'Permission boundary warning',
  replayableRegression: 'Replayable regression case',
  auditReadyEvidence: 'Audit-ready evidence',
};

export const runModeLabels = {
  sample: {
    label: 'Sample certification',
    detail: 'Seeded smoke evidence',
  },
  full: {
    label: 'Full release gate',
    detail: 'Release coverage',
  },
  ci: {
    label: 'CI regression gate',
    detail: 'Pull request blocker',
  },
  doctor: {
    label: 'Tool contract doctor',
    detail: 'Schema and permission scan',
  },
};

export const gateProfileLabels = [
  'Customer Support Agent Gate',
  'Retrieval Agent Gate',
  'MCP Tool Safety Gate',
  'Refund / Account Action Safety Gate',
  'Evidence Grounding Gate',
];

export const workerLifecycleLabels = {
  queued: 'Queued',
  claimed: 'Claimed',
  running: 'Running',
  retrying: 'Retrying',
  completed: 'Completed',
  failed: 'Failed',
  canceled: 'Canceled',
  cancelled: 'Canceled',
};

export const executionTargetTerms = {
  runner: {
    title: 'Registered runner',
    badge: dataModeLabels.realExecution,
    detail: 'Durable target for staging or production-like agents. Provider keys stay in your infrastructure.',
    productionPath: true,
  },
  'vercel-ai-sdk': {
    title: 'Vercel AI SDK route',
    badge: dataModeLabels.realExecution,
    detail: 'Deployed HTTPS adapter route that owns provider keys in your app environment.',
    productionPath: true,
  },
  'local-http-tunnel': {
    title: 'Local HTTPS tunnel',
    badge: dataModeLabels.ephemeralTarget,
    detail: 'Short-lived local preview target. Validate every current forwarding URL before launch.',
    productionPath: false,
  },
  'hosted-provider': {
    title: 'Hosted BYOK (gated)',
    badge: 'Needs saved encrypted key',
    detail: 'Feature-flagged convenience path for approved projects with encrypted project secrets.',
    productionPath: false,
  },
  'generic-agent-harness': {
    title: 'Generic Agent Harness',
    badge: 'Scaffold target',
    detail: 'Adapter contract for external agent harnesses. Connects traces, replay snapshots, and final results.',
    productionPath: false,
  },
  'hermes-fixture': {
    title: 'Hermes-style fixture',
    badge: 'Fixture/demo',
    detail: 'Scaffold target modeling skills, memory, subagents, scheduled automation, terminal actions, and artifacts.',
    productionPath: false,
  },
  'openclaw-fixture': {
    title: 'OpenClaw-style fixture',
    badge: 'Fixture/demo',
    detail: 'Scaffold target modeling email, calendar, browser, chat context, persistent memory, contacts, and permissions.',
    productionPath: false,
  },
};

export function workspaceModeForState({ sessionStatus, selectedProjectId, productionRun = false } = {}) {
  if (productionRun) return workspaceModeLabels.productionRun;
  if (sessionStatus === 'authenticated' && selectedProjectId) return workspaceModeLabels.connectedProject;
  return workspaceModeLabels.sampleWorkspace;
}

export function executionTargetDisplayName(value) {
  if (value === 'vercel-ai-sdk') return executionTargetTerms['vercel-ai-sdk'].title;
  if (value === 'local-http-tunnel') return executionTargetTerms['local-http-tunnel'].title;
  if (value === 'hosted-provider') return 'Hosted BYOK';
  if (value === 'generic-agent-harness') return executionTargetTerms['generic-agent-harness'].title;
  if (value === 'hermes-fixture') return executionTargetTerms['hermes-fixture'].title;
  if (value === 'openclaw-fixture') return executionTargetTerms['openclaw-fixture'].title;
  return executionTargetTerms.runner.title;
}

export function validationLabel(validation) {
  if (!validation) return readinessLabels.needsValidation;
  if (validation.status === 'validating') return 'Validation pending';
  return validation.ok ? readinessLabels.healthy : readinessLabels.recentlyFailing;
}

export function endpointCheckStatusLabel(state) {
  if (state === 'pass') return readinessLabels.healthy;
  if (state === 'fail') return readinessLabels.recentlyFailing;
  return readinessLabels.needsValidation;
}

export function releaseVerdictLabel(status) {
  if (status === 'eligible') return releaseVerdictLabels.eligible;
  if (status === 'blocked') return releaseVerdictLabels.blocked;
  if (status === 'warning') return releaseVerdictLabels.warning;
  return releaseVerdictLabels.notApplicable;
}

export function statusTone(value) {
  const text = String(value ?? '').toLowerCase();
  if (/critical|failing|failed|block|blocked|mismatch|recently failing|not certifiable|new/u.test(text)) return 'critical';
  if (/major|warn|warning|queued|not tested|not run|needs validation|ephemeral|local preview|pending|sample/u.test(text)) return 'major';
  if (/running|checking|claimed|retrying/u.test(text)) return 'neutral';
  if (/certified|connected|completed|passing|passed|resolved|healthy|eligible|real execution|trace-backed/u.test(text)) return 'passed';
  return 'neutral';
}

export function badgeClassForStatus(value) {
  const tone = statusTone(value);
  if (tone === 'critical') return 'ha-badge--critical';
  if (tone === 'major') return 'ha-badge--major';
  if (tone === 'passed') return 'ha-badge--passed';
  return 'ha-badge--neutral';
}

export function evidenceTypeLabel(value) {
  const key = String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/gu, '_').replace(/(^_|_$)/gu, '');
  return evidenceTypeLabels[key] ?? evidenceTypeLabels[key.replace(/^runner_observation$/u, 'runner_observation')] ?? String(value ?? 'Evidence not recorded');
}

export function productionCapabilityLabel({ isEphemeral = false, isProductionGrade = false, readinessLabel = '', validationStatus = '' } = {}) {
  if (isEphemeral) return 'Not certifiable';
  if (isProductionGrade && readinessLabel === readinessLabels.healthy && validationStatus === 'passed') return 'Certified';
  if (isProductionGrade) return 'Needs validation';
  return 'Not certifiable';
}

export function releaseBlockerSummary(releaseGate = {}, fallback = 'No release blockers recorded.') {
  const blockers = releaseGate.blockingReasons ?? releaseGate.releaseBlockers?.map((item) => item.message) ?? [];
  if (!blockers.length) return fallback;
  return blockers[0];
}
