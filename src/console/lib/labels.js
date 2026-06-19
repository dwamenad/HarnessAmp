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
  ephemeralTarget: 'Ephemeral target',
  productionGradeTarget: 'Production-grade target',
};

export const readinessLabels = {
  healthy: 'Healthy',
  needsValidation: 'Needs validation',
  recentlyFailing: 'Recently failing',
  unstable: 'Unstable',
  ephemeral: 'Ephemeral',
  contractMismatch: 'Contract mismatch',
  releaseBlocked: 'Release blocked',
  releaseEligible: 'Release eligible',
  sample: 'Sample data',
  realExecution: 'Real execution',
};

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
