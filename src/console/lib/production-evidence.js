import {
  dataModeLabels,
  executionTargetDisplayName,
  readinessLabels,
  workspaceModeLabels,
} from './labels.js';

export const EXPECTED_RUNNER_CONTRACT_VERSION = 'harnessamp_http_runner_v1';

export const releaseGateLabels = {
  eligible: readinessLabels.releaseEligible,
  blocked: readinessLabels.releaseBlocked,
  warning: readinessLabels.warningsPresent,
  notApplicable: readinessLabels.notApplicable,
};

export function buildProductionEvidence({
  projectMode = null,
  sourceType = null,
  target = null,
  run = null,
  report = null,
  releaseGate = null,
  failureTriage = null,
  org = null,
} = {}) {
  const normalizedTarget = normalizeTargetEvidence(target);
  const normalizedRun = normalizeRunEvidence(run, report);
  const usedSampleData = normalizedRun.usedSampleData || isSampleReport(report) || sourceType === 'sample_data';
  const derivedMode = normalizeProjectMode(projectMode ?? modeFromEvidence({
    usedSampleData,
    target: normalizedTarget,
    run: normalizedRun,
    releaseGate,
  }));
  const normalizedSourceType = sourceType ?? (usedSampleData ? 'sample_data' : 'real_execution');
  const gate = releaseGate ?? buildReleaseGate({
    report,
    run: normalizedRun,
    target: normalizedTarget,
    failureEvidence: [],
  });
  const triage = failureTriage ?? buildFailureTriageBuckets([], gate);

  return {
    projectMode: derivedMode.id,
    modeLabel: derivedMode.label,
    sourceType: normalizeSourceType(normalizedSourceType),
    sourceLabel: normalizeSourceType(normalizedSourceType) === 'sample_data' ? dataModeLabels.sampleData : dataModeLabels.realExecution,
    target: normalizedTarget,
    run: normalizedRun,
    releaseGate: gate,
    failureTriage: triage,
    org: normalizeOrgEvidence(org),
  };
}

export function buildReleaseGate({
  report = null,
  run = null,
  target = null,
  lifecycle = null,
  failureEvidence = [],
  releaseDecision = null,
} = {}) {
  const normalizedTarget = normalizeTargetEvidence(target);
  const normalizedRun = normalizeRunEvidence(run, report);
  const lifecycleStatus = String(lifecycle?.status ?? normalizedRun.lifecycleStatus ?? normalizedRun.status ?? '').toLowerCase();
  const benchmarkGate = String(report?.benchmark?.gateResult ?? normalizedRun.gateResult ?? '').toLowerCase();
  const failedContracts = uniqueStrings([
    ...(Array.isArray(report?.benchmark?.failedContracts) ? report.benchmark.failedContracts : []),
    ...(Array.isArray(normalizedRun.failedContracts) ? normalizedRun.failedContracts : []),
  ]);
  const criticalFailures = numericValue(report?.criticalFailures ?? normalizedRun.criticalFailures);
  const score = numericValue(report?.score ?? normalizedRun.score);
  const reasonDetails = [];

  if (normalizedRun.usedSampleData || isSampleReport(report)) {
    reasonDetails.push(blockingReason('sample_data', 'Sample data cannot be used as production release evidence.'));
  }
  if (criticalFailures > 0) {
    reasonDetails.push(blockingReason('agent_behavior', `${criticalFailures} critical benchmark failure${criticalFailures === 1 ? '' : 's'} recorded.`));
  }
  if (score > 0 && score < 86) {
    reasonDetails.push(blockingReason('agent_behavior', `Robustness score ${score} is below the 86 baseline.`));
  }
  if (['block', 'fail', 'failed'].includes(benchmarkGate)) {
    reasonDetails.push(blockingReason('agent_behavior', `Benchmark gate result is ${benchmarkGate}.`));
  } else if (benchmarkGate === 'warn') {
    reasonDetails.push(warningReason('agent_behavior', 'Benchmark gate returned warn.'));
  }
  if (failedContracts.length) {
    reasonDetails.push(blockingReason('adapter_contract', `Failed contracts: ${failedContracts.join(', ')}.`));
  }
  if (['failed', 'canceled', 'cancelled'].includes(lifecycleStatus)) {
    reasonDetails.push(blockingReason('worker_lifecycle', `Worker lifecycle ended as ${lifecycleStatus}.`));
  }
  if (normalizedTarget.hasContractMismatch) {
    reasonDetails.push(blockingReason('adapter_contract', `Target contract mismatch: expected ${normalizedTarget.expectedContractVersion}, saw ${normalizedTarget.contractVersion || 'unknown'}.`));
  }
  if (normalizedTarget.lastFailureClass && normalizedTarget.lastFailureClass !== 'none') {
    reasonDetails.push(classifiedTargetReason(normalizedTarget.lastFailureClass));
  }
  if ([readinessLabels.recentlyFailing, readinessLabels.unstable, readinessLabels.contractMismatch].includes(normalizedTarget.readinessLabel)) {
    reasonDetails.push(blockingReason('execution_target', `Execution target readiness is ${normalizedTarget.readinessLabel}.`));
  }
  if (['failed', 'blocked'].includes(String(normalizedTarget.validationStatus ?? '').toLowerCase())) {
    reasonDetails.push(blockingReason('validation', `Target validation state is ${normalizedTarget.validationStatus}.`));
  }
  if (normalizedTarget.readinessLabel === readinessLabels.needsValidation) {
    reasonDetails.push(warningReason('validation', 'Execution target needs validation before production release.'));
  }
  if (normalizedTarget.isEphemeral) {
    reasonDetails.push(warningReason('execution_target', 'Local preview targets are ephemeral and cannot be durable release evidence.'));
  }
  if (!normalizedTarget.isProductionGrade && !normalizedRun.usedSampleData) {
    reasonDetails.push(warningReason('execution_target', 'Production release evidence should use a validated production-grade target.'));
  }
  if (!reasonDetails.length) {
    reasonDetails.push(infoReason('release', 'Passed all required benchmark, worker, adapter, target, validation, and contract checks available for this evidence.'));
  }

  const blocking = reasonDetails.filter((item) => item.blocking);
  const warnings = reasonDetails.filter((item) => item.severity === 'warning');
  const informational = reasonDetails.filter((item) => item.severity === 'info' || item.severity === 'pass');
  const notApplicable = blocking.some((item) => item.category === 'sample_data') || normalizedRun.usedSampleData || isSampleReport(report);
  const status = notApplicable
    ? 'not_applicable'
    : blocking.length
      ? 'blocked'
      : warnings.length
        ? 'warning'
        : 'eligible';
  const canRelease = status === 'eligible' || status === 'warning';
  const decision = canRelease ? (releaseDecision ?? 'Safe to release') : 'Block release';

  return {
    status,
    label: releaseGateLabels[status],
    canRelease,
    decision,
    answer: gateAnswer(status),
    blockingReasons: uniqueStrings(blocking.map((item) => item.message)),
    warnings: uniqueStrings(warnings.map((item) => item.message)),
    informationalDiagnostics: uniqueStrings(informational.map((item) => item.message)),
    blockingFailures: blocking.length,
    warningCount: warnings.length,
    failedContracts,
    reasons: uniqueStrings(reasonDetails.map((item) => item.message)),
    reasonDetails,
    target: normalizedTarget,
    lifecycle: lifecycle ?? {
      status: lifecycleStatus || normalizedRun.lifecycleStatus || 'not recorded',
      summary: normalizedRun.lifecycleStatus ? `Lifecycle status ${normalizedRun.lifecycleStatus}.` : 'Lifecycle status not recorded.',
    },
  };
}

export function buildFailureTriageBuckets(failureEvidence = [], releaseGate = {}) {
  const buckets = [
    ['agent_behavior', 'Agent behavior failures'],
    ['adapter_contract', 'Adapter contract failures'],
    ['execution_target', 'Execution target failures'],
    ['validation', 'Validation failures'],
    ['worker_lifecycle', 'Worker lifecycle failures'],
  ].map(([id, label]) => ({ id, label, count: 0, reasons: [] }));
  const bucketById = Object.fromEntries(buckets.map((bucket) => [bucket.id, bucket]));

  failureEvidence.forEach((failure) => {
    const bucketId = classifyFailureCause(failure);
    failure.triageClass = bucketId;
    bucketById[bucketId].count += 1;
    bucketById[bucketId].reasons.push(failure.contract || failure.why || failure.id || 'failure evidence');
  });

  (releaseGate.reasonDetails ?? []).forEach((reason) => {
    const bucketId = normalizeReasonCategory(reason.category);
    if (!bucketId || !bucketById[bucketId]) return;
    if (reason.blocking) bucketById[bucketId].count += 1;
    bucketById[bucketId].reasons.push(reason.message);
  });

  const normalizedBuckets = buckets.map((bucket) => ({
    ...bucket,
    reasons: uniqueStrings(bucket.reasons).slice(0, 3),
  }));
  return {
    agentBehaviorFailures: bucketById.agent_behavior.count,
    adapterContractFailures: bucketById.adapter_contract.count,
    executionTargetFailures: bucketById.execution_target.count,
    validationFailures: bucketById.validation.count,
    workerLifecycleFailures: bucketById.worker_lifecycle.count,
    buckets: normalizedBuckets,
  };
}

export function normalizeTargetEvidence(target = {}) {
  target = target ?? {};
  const targetType = normalizeTargetType(target.type ?? target.targetType ?? target.typeLabel);
  const typeLabel = target.typeLabel ?? executionTargetDisplayName(targetType);
  const isEphemeral = Boolean(target.isEphemeral ?? target.ephemeral ?? targetType === 'local-http-tunnel' ?? targetType === 'local_http_tunnel');
  const isProductionGrade = Boolean(target.isProductionGrade ?? target.productionGrade ?? (
    !isEphemeral
    && /production-grade|registered runner|vercel ai sdk/iu.test(`${target.grade ?? ''} ${typeLabel}`)
  ));
  const validationStatus = normalizeValidationStatus(target.validationStatus ?? target.validationState);
  const failureClass = firstString(target.lastFailureClass, target.failureClass, target.failureClasses?.[0], 'none');
  const contractVersion = firstString(target.contractVersion, target.observedContractVersion, '');
  const expectedContractVersion = firstString(target.expectedContractVersion, EXPECTED_RUNNER_CONTRACT_VERSION);
  const hasContractMismatch = Boolean(target.hasContractMismatch ?? (
    contractVersion
    && !/unknown|not applicable/iu.test(contractVersion)
    && expectedContractVersion
    && contractVersion !== expectedContractVersion
  ));
  const readinessLabel = normalizeReadinessLabel(target.readinessLabel ?? target.readinessStatus, {
    isEphemeral,
    isProductionGrade,
    validationStatus,
    failureClass,
    hasContractMismatch,
  });
  return {
    id: firstString(target.id, target.targetKey, target.name, ''),
    name: firstString(target.name, target.targetUsed, 'not recorded'),
    type: targetType,
    typeLabel,
    isEphemeral,
    isProductionGrade,
    readinessStatus: readinessKey(readinessLabel),
    readinessLabel,
    validationStatus,
    lastValidatedAt: firstString(target.lastValidatedAt, 'not validated'),
    lastSuccessfulRunAt: firstString(target.lastSuccessfulRunAt, target.lastPass, 'none'),
    lastFailureClass: failureClass,
    contractVersion: contractVersion || 'unknown',
    expectedContractVersion,
    hasContractMismatch,
    validationSuccessRate: firstString(target.validationSuccessRate, 'not recorded'),
    runSuccessRate: firstString(target.runSuccessRate, 'not recorded'),
    lastPass: firstString(target.lastPass, 'none'),
    lastFail: firstString(target.lastFail, 'none'),
    failureClasses: uniqueStrings([...(target.failureClasses ?? []), failureClass]).filter((item) => item !== 'none'),
    latency: firstString(target.latency, 'not recorded'),
  };
}

export function normalizeRunEvidence(run = {}, report = null) {
  run = run ?? {};
  const status = firstString(run.status, report?.runStatus, report?.status, 'not recorded');
  const evidenceMode = firstString(report?.evidenceMode, run.evidenceMode, run.runMode, '');
  const benchmark = report?.benchmark ?? run.benchmark ?? {};
  const usedSampleData = Boolean(
    run.usedSampleData
    || report?.benchmark?.seeded
    || /sample|seeded/iu.test(`${evidenceMode} ${benchmark.runType ?? ''} ${benchmark.benchmarkRunType ?? ''}`)
  );
  const usedRealExecution = Boolean(run.usedRealExecution ?? (!usedSampleData && (run.jobId || report?.runId || /runner|real|official|customized/iu.test(evidenceMode))));
  return {
    id: firstString(run.id, report?.runId, report?.id, ''),
    status,
    lifecycleStatus: firstString(run.lifecycleStatus, report?.lifecycleSummary?.status, status),
    benchmarkId: firstString(run.benchmarkId, benchmark.id, benchmark.slug, ''),
    benchmarkVersion: firstString(run.benchmarkVersion, benchmark.version, ''),
    scoringProfile: firstString(run.scoringProfile, benchmark.scoringProfileVersion, benchmark.scoringProfileId, ''),
    gateProfile: firstString(run.gateProfile, benchmark.gateProfileVersion, benchmark.gateProfileId, ''),
    completedAt: firstString(run.completedAt, report?.completedAt, report?.runDate, ''),
    usedSampleData,
    usedRealExecution,
    criticalFailures: numericValue(run.criticalFailures ?? run.critical ?? report?.criticalFailures),
    score: numericValue(run.score ?? report?.score),
    gateResult: firstString(run.gateResult, benchmark.gateResult, ''),
    failedContracts: Array.isArray(benchmark.failedContracts) ? benchmark.failedContracts : [],
  };
}

function modeFromEvidence({ usedSampleData, target, run, releaseGate }) {
  if (usedSampleData) return 'sample_workspace';
  if (
    target?.isProductionGrade
    && !target?.isEphemeral
    && target?.readinessLabel === readinessLabels.healthy
    && run?.usedRealExecution
    && releaseGate?.canRelease !== false
  ) return 'production_run';
  return 'connected_project';
}

function normalizeProjectMode(value) {
  const key = String(value ?? '').replace(/-/gu, '_').toLowerCase();
  if (key === 'production_run') return { id: 'production_run', label: workspaceModeLabels.productionRun.label };
  if (key === 'connected_project') return { id: 'connected_project', label: workspaceModeLabels.connectedProject.label };
  return { id: 'sample_workspace', label: workspaceModeLabels.sampleWorkspace.label };
}

function normalizeSourceType(value) {
  return String(value ?? '').replace(/-/gu, '_').toLowerCase() === 'real_execution' ? 'real_execution' : 'sample_data';
}

function normalizeTargetType(value) {
  const text = String(value ?? '').toLowerCase().replace(/_/gu, '-');
  if (/vercel/iu.test(text)) return 'vercel-ai-sdk';
  if (/local|tunnel/iu.test(text)) return 'local-http-tunnel';
  if (/hosted|byok|provider/iu.test(text)) return 'hosted-provider';
  return 'runner';
}

function normalizeValidationStatus(value) {
  const status = String(value ?? '').toLowerCase();
  if (['passed', 'healthy', 'active', 'valid'].includes(status)) return 'passed';
  if (['failed', 'recently failing'].includes(status)) return 'failed';
  if (['blocked', 'contract mismatch'].includes(status)) return 'blocked';
  if (status === 'warning') return 'warning';
  return status || 'pending';
}

function normalizeReadinessLabel(value, context) {
  const text = String(value ?? '');
  if (/contract mismatch/iu.test(text) || context.hasContractMismatch) return readinessLabels.contractMismatch;
  if (/unstable/iu.test(text)) return readinessLabels.unstable;
  if (/recently failing|failed|blocked/iu.test(text) || (context.failureClass && context.failureClass !== 'none')) return readinessLabels.recentlyFailing;
  if (/healthy|production-grade|contract valid/iu.test(text) && context.validationStatus === 'passed') return readinessLabels.healthy;
  if (context.isEphemeral) return readinessLabels.ephemeral;
  if (context.isProductionGrade && context.validationStatus === 'passed') return readinessLabels.healthy;
  return readinessLabels.needsValidation;
}

function readinessKey(label) {
  return String(label).toLowerCase().replace(/[^a-z0-9]+/gu, '_').replace(/(^_|_$)/gu, '');
}

function normalizeOrgEvidence(org = {}) {
  org = org ?? {};
  return {
    plan: firstString(org.plan, 'unknown'),
    usageStatus: firstString(org.usageStatus, 'not recorded'),
    entitlementStatus: firstString(org.entitlementStatus, 'not recorded'),
    secretsStatus: firstString(org.secretsStatus, 'not configured'),
    rbacStatus: firstString(org.rbacStatus, 'not recorded'),
  };
}

function isSampleReport(report) {
  return Boolean(report?.benchmark?.seeded || /sample|seeded/iu.test(`${report?.evidenceMode ?? ''} ${report?.benchmark?.runType ?? ''} ${report?.benchmark?.benchmarkRunType ?? ''}`));
}

function classifiedTargetReason(failureClass) {
  const message = `Latest failure class: ${failureClass}.`;
  if (/validation|private|reachability|token|auth/iu.test(failureClass)) return blockingReason('validation', message);
  if (/worker|queue|claim|retry|timeout|lifecycle/iu.test(failureClass)) return blockingReason('worker_lifecycle', message);
  if (/adapter|schema|contract|json|unsupported|version/iu.test(failureClass)) return blockingReason('adapter_contract', message);
  return blockingReason('execution_target', message);
}

function normalizeReasonCategory(category) {
  if (category === 'adapter' || category === 'contract') return 'adapter_contract';
  if (category === 'target') return 'execution_target';
  if (category === 'lifecycle') return 'worker_lifecycle';
  if (category === 'benchmark' || category === 'release') return 'agent_behavior';
  return category;
}

function classifyFailureCause(failure) {
  const text = `${failure.failureClass ?? ''} ${failure.contract ?? ''} ${failure.mutationId ?? ''} ${failure.why ?? ''}`;
  if (/validation|private|reachability|token|auth/iu.test(text)) return 'validation';
  if (/worker|queue|claim|retry|timeout|lifecycle/iu.test(text)) return 'worker_lifecycle';
  if (/target|endpoint|network|tunnel|unavailable/iu.test(text)) return 'execution_target';
  if (/adapter|schema|contract|json|unsupported|version/iu.test(text)) return 'adapter_contract';
  return 'agent_behavior';
}

function gateAnswer(status) {
  if (status === 'eligible') return 'Can this agent be released? Yes.';
  if (status === 'warning') return 'Can this agent be released? Yes, with warnings.';
  if (status === 'not_applicable') return 'Can this agent be released? No. Sample data is not production release evidence.';
  return 'Can this agent be released? No.';
}

function blockingReason(category, message) {
  return { category: normalizeReasonCategory(category), severity: 'blocking', blocking: true, message };
}

function warningReason(category, message) {
  return { category: normalizeReasonCategory(category), severity: 'warning', blocking: false, message };
}

function infoReason(category, message) {
  return { category: normalizeReasonCategory(category), severity: 'info', blocking: false, message };
}

function numericValue(value) {
  const number = Number.parseInt(String(value ?? '').replace(/,/gu, ''), 10);
  return Number.isFinite(number) ? number : 0;
}

function firstString(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value);
    if (text) return text;
  }
  return '';
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)));
}
