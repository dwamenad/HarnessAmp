import { benchmarkForRun, classifyBenchmarkRun, createBenchmarkSnapshot, evaluateBenchmarkGate, releaseDecisionForGate, scoreBenchmark } from '../benchmarks/registry.js';
import { extractBenchmarkMetrics } from '../benchmarks/results.js';
import { sanitizeDebugPayload } from '../adapters/contract.js';
import {
  buildFailureTriageBuckets,
  buildProductionEvidence,
  buildReleaseGate,
} from './lib/production-evidence.js';
import {
  classifyRunFailures,
  getBlockingFailures,
  getWarningFailures,
  summarizeFailureEvidence,
} from './lib/failure-ontology.js';
import {
  buildSupportQualityLoop,
  supportQualityLoopRows,
} from './lib/support-quality-loop.js';
import { traceEvidenceForFailure } from '../core/trace-provenance.js';

export function reportSlug(name, index = 0) {
  return `${String(name).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/(^-|-$)/gu, '')}-${index + 1}`;
}

export function localRunReportId(run) {
  return `local-${reportSlug(run.id || run.name || 'run', 0)}`;
}

export function buildReportPayload(reportId, context = {}) {
  const localRun = (context.localRuns ?? []).find((run) => localRunReportId(run) === reportId);
  if (localRun) return localRunReportPayload(localRun, context);
  const row = (context.seedReports ?? []).find((report, index) => reportSlug(report[0], index) === reportId);
  if (!row) return null;
  const [name, project, harness, pack, runDate, score, critical] = row;
  return enrichReportPayload({
    id: reportId,
    name,
    project,
    harness,
    pack,
    runDate,
    score: Number(score),
    criticalFailures: Number(critical),
    status: Number(critical) > 0 ? 'review_required' : 'passing',
    summary: Number(critical) > 0
      ? `${critical} critical failure${Number(critical) === 1 ? '' : 's'} require owner review before release.`
      : 'No critical failures found in this run.',
    recommendations: Number(critical) > 0
      ? ['Review critical evidence', 'Assign owner', 'Add reproduced cases to regression suite']
      : ['Share executive report', 'Keep current CI gate thresholds'],
    evidenceMode: 'seeded-sample',
    benchmark: {
      id: 'seeded-sample',
      slug: 'seeded-sample',
      name: 'Seeded sample',
      version: 'sample',
      tier: 'sample',
      runType: 'sample',
      benchmarkRunType: 'sample',
      scoringProfileId: 'sample',
      scoringProfileVersion: 'sample',
      gateProfileId: 'sample',
      gateProfileVersion: 'sample',
      scenarioSetVersion: 'sample',
      score: Number(score),
      gateResult: Number(critical) > 0 ? 'block' : 'pass',
      releaseDecision: Number(critical) > 0 ? 'Block release' : 'Safe to release',
      failedContracts: [],
      failedMutationFamilies: [],
      benchmarkSnapshot: sampleBenchmarkSnapshot({ name, pack, score, critical }),
      seeded: true,
    },
  }, context);
}

export function localRunReportPayload(run, context = {}) {
  const critical = numericRunValue(run.critical);
  const observations = Array.isArray(run.runnerObservations) ? run.runnerObservations : [];
  const evidenceMode = observations.length ? 'runner-observation' : 'contract-smoke-preview';
  const benchmark = benchmarkPayloadForRun(run);
  const agentHarnessEvidence = agentHarnessEvidenceForObservations(observations, run);
  return enrichReportPayload({
    id: localRunReportId(run),
    runId: run.id,
    name: `${run.name} local report`,
    project: projectForRun(run, context.harnesses ?? []),
    harness: run.harness,
    pack: run.pack,
    runDate: run.started,
    score: numericRunValue(run.score),
    criticalFailures: critical,
    observations: numericRunValue(run.observations),
    runnerObservations: observations,
    adapterMode: run.adapterMode || adapterModeFromObservations(observations),
    status: run.status === 'failed' || critical > 0 ? 'review_required' : 'passing',
    runStatus: run.status,
    executionTarget: run.executionTarget ?? run.target ?? null,
    workerId: run.workerId ?? run.jobId ?? '',
    attempts: run.attempts ?? 1,
    completedAt: run.completedAt ?? '',
    agentVersion: run.agentVersion ?? run.metadata?.agentVersion ?? '',
    agentHarnessEvidence,
    summary: critical > 0
      ? `${critical} critical failure${critical === 1 ? '' : 's'} require owner review before release.`
      : run.status === 'failed'
        ? 'Worker, adapter, or execution target state failed before a releasable benchmark result was produced.'
      : 'No critical failures found in this local run.',
    recommendations: critical > 0
      ? ['Review local run summary', 'Pin reproducible RetrievalGuard failures', 'Rerun the same harness after remediation']
      : ['Share executive report', 'Keep the pack in smoke or nightly regression'],
    timeline: run.timeline ?? [],
    evidenceMode,
    benchmark,
  }, context);
}

export function enrichReportPayload(report, context = {}) {
  report = sanitizeDebugPayload(report);
  const critical = numericRunValue(report.criticalFailures);
  const failed = critical > 0 || report.status === 'review_required';
  const benchmark = report.benchmark ?? null;
  const releaseDecision = benchmark?.releaseDecision ?? (failed ? 'Block release' : 'Safe to release');
  const environment = reportEnvironment(report);
  const targetReliability = targetReliabilityForReport(report, context);
  const lifecycle = lifecycleSummaryForReport(report);
  const rawFailureEvidence = failureEvidenceForReport(report, context).map((failure) => ensureTraceEvidence(failure, report));
  const classifiedFailures = classifyRunFailures({
    ...report,
    failureEvidence: rawFailureEvidence,
    targetReliability,
    lifecycleSummary: lifecycle,
  });
  const failureEvidence = mergeClassifiedFailureEvidence(rawFailureEvidence, classifiedFailures);
  const failureIntelligence = summarizeFailureEvidence(classifiedFailures);
  const releaseGate = releaseGateForReport(report, {
    releaseDecision,
    failureEvidence,
    targetReliability,
    lifecycle,
  });
  const gate = gateForReport(report, releaseGate.decision, releaseGate);
  const retrievalEvidence = isRetrievalReport(report) ? retrievalEvidenceForReport(report) : null;
  const supportQualityLoop = buildSupportQualityLoop({ report, failureEvidence });
  const failureTriage = failureTriageForReport(report, failureEvidence, releaseGate);
  const historicalComparison = historicalComparisonForReport(report, context);
  const productionEvidence = buildProductionEvidence({
    target: targetReliability,
    run: report,
    report,
    releaseGate,
    failureTriage,
    org: context.orgEvidence,
  });
  return {
    ...report,
    evidenceMode: report.evidenceMode ?? 'seeded-sample',
    status: releaseGate.canRelease ? 'passing' : 'review_required',
    releaseDecision: releaseGate.decision,
    environment,
    owner: packOwner(report.pack),
    gate,
    releaseGate,
    releaseCertification: {
      verdict: releaseGate.verdict ?? releaseGate.label ?? releaseGate.status,
      canRelease: releaseGate.canRelease,
      evidenceType: report.evidenceMode ?? 'seeded-sample',
      productionCertifiable: releaseGate.toolchain?.productionCapable ?? false,
      blockers: releaseGate.toolchain?.releaseBlockers ?? [],
      warnings: releaseGate.toolchain?.warnings ?? [],
      replayableRegressionCases: releaseGate.toolchain?.replayableRegressionCases ?? 0,
      traceCapture: releaseGate.toolchain?.traceCapture ?? false,
    },
    toolchainReadiness: releaseGate.toolchain,
    productionEvidence,
    targetReliability,
    lifecycleSummary: lifecycle,
    failureTriage,
    failureIntelligence,
    agentHarnessEvidence: report.agentHarnessEvidence ?? agentHarnessEvidenceForObservations(report.runnerObservations, report),
    classifiedFailures,
    historicalComparison,
    benchmark,
    benchmarkResult: benchmark ? {
      benchmarkId: benchmark.id ?? '',
      benchmarkSlug: benchmark.slug ?? '',
      benchmarkName: benchmark.name,
      benchmarkVersion: benchmark.version,
      benchmarkRunType: benchmark.benchmarkRunType ?? benchmark.runType ?? 'official',
      benchmarkSnapshot: benchmark.benchmarkSnapshot ?? benchmark.snapshot ?? null,
      scoringProfileId: benchmark.scoringProfileId ?? '',
      scoringProfileVersion: benchmark.scoringProfileVersion ?? '',
      gateProfileId: benchmark.gateProfileId ?? '',
      gateProfileVersion: benchmark.gateProfileVersion ?? '',
      scenarioSetVersion: benchmark.scenarioSetVersion ?? '',
      score: benchmark.score,
      gateResult: benchmark.gateResult,
      releaseDecision: benchmark.releaseDecision,
      failedContracts: benchmark.failedContracts ?? [],
      failedMutationFamilies: benchmark.failedMutationFamilies ?? [],
      seeded: Boolean(benchmark.seeded),
    } : null,
    failureSummary: failureSummaryForReport(report, failureEvidence),
    failureEvidence,
    retrievalEvidence,
    supportQualityLoop,
    remediation: remediationForReport(report, failureEvidence, supportQualityLoop),
    regressionPlan: regressionPlanForReport(report, failureEvidence, supportQualityLoop),
    auditTrail: auditTrailForReport(report),
  };
}

export function reportCsv(report) {
  report = sanitizeDebugPayload(report);
  const toolchain = report.toolchainReadiness ?? report.releaseGate?.toolchain ?? {};
  const failureRows = (report.failureEvidence.length ? report.failureEvidence : [{}]).map((failure) => ({ failure, toolFinding: null }));
  const toolFindingRows = (toolchain.tools ?? []).flatMap((tool) => [
    ...(tool.blockers ?? []).map((finding) => ({ failure: {}, toolFinding: { ...finding, type: 'blocker', tool } })),
    ...(tool.warnings ?? []).map((finding) => ({ failure: {}, toolFinding: { ...finding, type: 'warning', tool } })),
  ]);
  const rows = [
    ['id', 'name', 'project', 'harness', 'pack', 'release_gate_name', 'release_gate_slug', 'release_gate_version', 'release_gate_mode', 'release_certification_type', 'scoring_profile_version', 'gate_profile_version', 'scenario_set_version', 'gate_tier', 'certification_score', 'gate_result', 'release_gate_status', 'release_verdict', 'can_release', 'gate_reasons', 'release_blockers', 'blocking_failures', 'warnings', 'production_certifiable', 'evidence_type', 'toolchain_readiness_status', 'toolchain_status', 'readiness_score', 'tools_checked', 'recommended_gate_profiles', 'unsafe_action_failures', 'permission_warnings', 'replayable_regression_cases', 'tool_validation_status', 'human_approval_tools', 'failure_classes', 'failure_domains', 'support_loop_status', 'support_inputs', 'generated_regression_cases', 'generated_regression_case_ids', 'instruction_stack_risks', 'target_used', 'target_readiness', 'target_validation_state', 'target_run_success_rate', 'target_validation_success_rate', 'run_date', 'score', 'critical_failures', 'decision', 'evidence_mode', 'adapter_mode', 'failed_contracts', 'failed_failure_profiles', 'failure_class', 'failure_class_label', 'release_impact', 'case_id', 'severity', 'contract', 'scenario_id', 'failure_profile_id', 'origin', 'trace_id', 'key_trace_events', 'retrieved_evidence', 'tool_calls', 'replay_status', 'regression_status', 'triage_class', 'recommended_control', 'tool_name', 'tool_category', 'tool_risk_level', 'tool_permission_boundary', 'tool_schema_status', 'tool_description_quality', 'tool_auth_status', 'tool_idempotency_status', 'tool_pii_exposure', 'tool_side_effect_risk', 'tool_finding_type', 'tool_finding_message', 'benchmark_name', 'benchmark_slug', 'benchmark_run_type', 'agent_harness_target', 'memory_policy', 'permission_policy', 'workspace_policy', 'action_summary', 'memory_summary', 'workspace_summary'],
    ...[...failureRows, ...toolFindingRows].map(({ failure, toolFinding }) => [
      report.id,
      report.name,
      report.project,
      report.harness,
      report.pack,
      report.benchmark?.name ?? '',
      report.benchmark?.slug ?? '',
      report.benchmark?.version ?? '',
      report.benchmark?.benchmarkRunType ?? report.benchmark?.runType ?? '',
      report.benchmark?.benchmarkRunType ?? report.benchmark?.runType ?? '',
      report.benchmark?.scoringProfileVersion ?? '',
      report.benchmark?.gateProfileVersion ?? '',
      report.benchmark?.scenarioSetVersion ?? '',
      report.benchmark?.tier ?? '',
      report.benchmark?.score ?? '',
      report.benchmark?.gateResult ?? '',
      report.releaseGate?.status ?? '',
      report.releaseGate?.verdict ?? report.releaseGate?.label ?? '',
      report.releaseGate?.canRelease ? 'yes' : 'no',
      (report.releaseGate?.reasons ?? []).join('; '),
      (report.releaseGate?.blockingReasons ?? report.releaseCertification?.blockers?.map((item) => item.message) ?? []).join('; '),
      report.releaseGate?.blockingFailures ?? '',
      report.releaseGate?.warningCount ?? '',
      toolchain.productionCapable ? 'yes' : 'no',
      report.releaseCertification?.evidenceType ?? report.evidenceMode ?? '',
      toolchain.status ?? '',
      toolchain.status ?? '',
      toolchain.readinessScore ?? '',
      toolchain.tools?.length ?? '',
      (toolchain.recommendedGateProfiles ?? []).join('; '),
      report.releaseGate?.toolchain?.unsafeActionFailures ?? '',
      report.releaseGate?.toolchain?.permissionWarnings ?? '',
      report.releaseGate?.toolchain?.replayableRegressionCases ?? '',
      report.releaseGate?.toolchain?.validationStatus ?? '',
      report.releaseGate?.toolchain?.humanApprovalTools ?? '',
      (report.failureIntelligence?.classes ?? []).join('; '),
      Object.keys(report.failureIntelligence?.byDomain ?? {}).join('; '),
      report.supportQualityLoop?.status ?? 'not_applicable',
      report.supportQualityLoop?.importedInputs?.total ?? '',
      report.supportQualityLoop?.generatedEvalCases?.length ?? '',
      (report.supportQualityLoop?.generatedEvalCases ?? []).map((item) => item.id).join('; '),
      report.supportQualityLoop?.instructionStackRisks?.length ?? '',
      report.targetReliability?.targetUsed ?? '',
      report.targetReliability?.readinessStatus ?? '',
      report.targetReliability?.validationState ?? '',
      report.targetReliability?.runSuccessRate ?? '',
      report.targetReliability?.validationSuccessRate ?? '',
      report.runDate,
      report.score,
      report.criticalFailures,
      report.releaseDecision,
      report.evidenceMode,
      report.adapterMode ?? '',
      (report.benchmark?.failedContracts ?? []).join('; '),
      (report.benchmark?.failedMutationFamilies ?? []).join('; '),
      failure.failureClass ?? '',
      failure.label ?? '',
      failure.releaseImpact ?? '',
      failure.id ?? '',
      failure.severity ?? '',
      failure.contract ?? '',
      failure.scenarioId ?? '',
      failure.mutationId ?? '',
      failure.origin ?? failure.traceEvidence?.origin ?? '',
      failure.traceId ?? failure.traceEvidence?.traceId ?? '',
      traceEventSummary(failure.traceEvidence).join('; '),
      (failure.traceEvidence?.retrievedEvidence ?? failure.evidence ?? []).join('; '),
      (failure.traceEvidence?.toolCalls ?? []).map((tool) => `${tool.name}:${tool.status}`).join('; '),
      failure.traceEvidence?.replayStatus ?? failure.replayStatus ?? '',
      failure.traceEvidence?.regressionStatus ?? failure.regressionStatus ?? '',
      failure.triageClass ?? '',
      failure.recommendedControl ?? '',
      toolFinding?.tool?.name ?? '',
      toolFinding?.tool?.category ?? '',
      toolFinding?.tool?.riskLevel ?? '',
      toolFinding?.tool?.permissionBoundary ?? '',
      toolFinding?.tool?.schemaStatus ?? '',
      toolFinding?.tool?.descriptionQuality ?? '',
      toolFinding?.tool?.authStatus ?? '',
      toolFinding?.tool?.idempotencyStatus ?? '',
      toolFinding?.tool?.piiExposure ?? '',
      toolFinding?.tool?.sideEffectRisk ?? '',
      toolFinding?.type ?? '',
      toolFinding?.message ?? '',
      report.benchmark?.name ?? '',
      report.benchmark?.slug ?? '',
      report.benchmark?.benchmarkRunType ?? report.benchmark?.runType ?? '',
      report.agentHarnessEvidence?.targetType ?? '',
      report.agentHarnessEvidence?.memoryPolicySummary ?? '',
      report.agentHarnessEvidence?.permissionPolicySummary ?? '',
      report.agentHarnessEvidence?.workspacePolicySummary ?? '',
      report.agentHarnessEvidence?.actionSummary ?? '',
      report.agentHarnessEvidence?.memorySummary ?? '',
      report.agentHarnessEvidence?.workspaceSummary ?? '',
    ]),
  ];
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function reportMarkdown(report) {
  report = sanitizeDebugPayload(report);
  return `# Toolchain Release Evidence Report

## ${report.name}

${report.releaseGate.answer}

- Release verdict: ${report.releaseGate.verdict ?? report.releaseGate.label ?? report.releaseGate.status}
- Direct answer: ${report.releaseGate.canRelease ? 'Yes' : 'No'}
- Blocking failures: ${getBlockingFailures(report.classifiedFailures ?? []).map((failure) => `${failure.id}: ${failure.releaseImpact}`).join('; ') || 'none'}
- Warnings: ${getWarningFailures(report.classifiedFailures ?? []).map((failure) => `${failure.id}: ${failure.releaseImpact}`).join('; ') || 'none'}
- Unsafe action failures: ${report.releaseGate.toolchain?.unsafeActionFailures ?? 0}
- Permission warnings: ${report.releaseGate.toolchain?.permissionWarnings ?? 0}
- Replayable regression cases: ${report.releaseGate.toolchain?.replayableRegressionCases ?? 0}
- Trace evidence coverage: ${report.failureEvidence.length ? 'trace-backed failure evidence attached' : 'not recorded'}
- Failure classes: ${(report.failureIntelligence?.classes ?? []).join(', ') || 'none'}
- Affected scenarios: ${report.failureEvidence.map((failure) => failure.scenarioId).filter(Boolean).join(', ') || 'none'}
- Failure profiles involved: ${(report.benchmark?.failedMutationFamilies ?? report.failureEvidence.map((failure) => failure.mutationId)).filter(Boolean).join(', ') || 'none'}
- Execution target used: ${report.targetReliability.targetUsed}
- Reproducible: ${report.failureEvidence.some((failure) => /[1-9][0-9]?%|captured|reproducible/iu.test(String(failure.reproducibility ?? ''))) ? 'yes' : 'not recorded'}
- Recommended next action: ${report.remediation[0] ?? 'Keep this report as release evidence.'}

- Project: ${report.project}
- Harness: ${report.harness}
- Pack: ${report.pack}
- Toolchain profile: ${report.pack}
- Gate profile: ${benchmarkLabel(report)}
- Gate slug: ${report.benchmark?.slug ?? 'not recorded'}
- Certification run type: ${report.benchmark?.benchmarkRunType ?? report.benchmark?.runType ?? 'not recorded'}
- Gate tier: ${report.benchmark?.tier ?? 'not recorded'}
- Scenario set version: ${report.benchmark?.scenarioSetVersion ?? 'not recorded'}
- Scoring profile version: ${report.benchmark?.scoringProfileVersion ?? 'not recorded'}
- Gate profile version: ${report.benchmark?.gateProfileVersion ?? 'not recorded'}
- Certification score: ${report.benchmark?.score ?? report.score}
- Gate result: ${report.benchmark?.gateResult ?? report.gate?.decision ?? 'not recorded'}
- Failed contracts: ${(report.benchmark?.failedContracts ?? []).join(', ') || 'none'}
- Failed failure profiles: ${(report.benchmark?.failedMutationFamilies ?? []).join(', ') || 'none'}
- Run date: ${report.runDate}
- Score: ${report.score}
- Critical failures: ${report.criticalFailures}
- Decision: ${report.releaseDecision}
- Release gate status: ${report.releaseGate.status}
- Can release: ${report.releaseGate.canRelease ? 'yes' : 'no'}
- Blocking failures: ${report.releaseGate.blockingFailures}
- Warnings: ${report.releaseGate.warningCount}
- Owner: ${report.owner}
- Evidence mode: ${report.evidenceMode}
- Adapter mode: ${report.adapterMode ?? 'not recorded'}
- Target used: ${report.targetReliability.targetUsed}
- Target readiness: ${report.targetReliability.readinessStatus}
- Target validation state: ${report.targetReliability.validationState}
- Target reliability: validation ${report.targetReliability.validationSuccessRate}; run ${report.targetReliability.runSuccessRate}
- Lifecycle summary: ${report.lifecycleSummary.summary}

## Summary

${report.summary}

## Release gate

${report.releaseGate.answer}

${markdownTable(['Reason type', 'Reason'], report.releaseGate.reasonDetails.map((item) => [item.severity, item.message]))}

${markdownTable(['Metric', 'Required', 'Actual', 'Result'], report.gate.thresholds.map((item) => [item.metric, item.required, item.actual, item.result]))}

## Toolchain readiness

${markdownTable(['Signal', 'Value'], [
  ['Connected execution targets', report.releaseGate.toolchain?.connectedTargets ?? 0],
  ['Toolchain status', report.toolchainReadiness?.status ?? report.releaseGate.toolchain?.status ?? report.releaseGate.status],
  ['Readiness score', report.toolchainReadiness?.readinessScore ?? 'not recorded'],
  ['Production capable', report.toolchainReadiness?.productionCapable ? 'yes' : 'no'],
  ['Trace capture', report.toolchainReadiness?.traceCapture ? 'yes' : 'no'],
  ['Replay available', report.toolchainReadiness?.replayAvailable ? 'yes' : 'no'],
  ['Tools checked', report.toolchainReadiness?.tools?.length ?? 0],
  ['Recommended gate profiles', (report.toolchainReadiness?.recommendedGateProfiles ?? []).join(', ') || 'none'],
  ['Tool validation status', report.releaseGate.toolchain?.validationStatus ?? report.targetReliability.readinessStatus],
  ['Action-taking tools', report.releaseGate.toolchain?.actionTakingTools ?? 0],
  ['Read-only tools', report.releaseGate.toolchain?.readOnlyTools ?? 0],
  ['Human approval tools', report.releaseGate.toolchain?.humanApprovalTools ?? 0],
  ['Ambiguous schemas', report.releaseGate.toolchain?.ambiguousSchemas ?? 0],
  ['Recent contract failures', report.releaseGate.toolchain?.recentContractFailures ?? 0],
  ['Release status', report.releaseGate.toolchain?.releaseStatus ?? report.releaseGate.status],
])}

## Tool Contract Doctor Findings

${markdownToolContractFindings(report.toolchainReadiness ?? report.releaseGate.toolchain)}

## Target reliability

${markdownTable(['Metric', 'Value'], [
  ['Target', report.targetReliability.targetUsed],
  ['Readiness', report.targetReliability.readinessStatus],
  ['Validation state at run time', report.targetReliability.validationState],
  ['Contract version', report.targetReliability.contractVersion],
  ['Validation success rate', report.targetReliability.validationSuccessRate],
  ['Run success rate', report.targetReliability.runSuccessRate],
  ['Failure classes', report.targetReliability.failureClasses.join(', ') || 'none'],
])}

## Failure triage

${markdownTable(['Class', 'Count', 'Top reasons'], report.failureTriage.buckets.map((bucket) => [bucket.label, bucket.count, bucket.reasons.join('; ') || 'none']))}

## Agent-tool contract failures found

${markdownFailureClassCards(report.failureEvidence)}

## Scenario evidence table

${report.failureEvidence.length ? markdownTable(['Scenario', 'Failure profile', 'Failure class', 'Severity', 'Expected behavior', 'Actual behavior', 'Replay'], report.failureEvidence.map((failure) => [failure.scenarioId, failure.mutationId, failure.failureClass ?? failure.label, failure.severity, failure.expected, failure.actual ?? failure.observed, replaySummary(failure)])) : 'No scenario evidence recorded.'}

## Trace-backed evidence

${report.failureEvidence.length ? markdownTable(['Failure class', 'Origin', 'Trace id', 'Key trace events', 'Retrieved evidence', 'Tool calls', 'Replay status', 'Regression status'], report.failureEvidence.map((failure) => [failure.failureClass ?? failure.label, failure.origin ?? failure.traceEvidence?.origin ?? 'unknown', failure.traceId ?? failure.traceEvidence?.traceId ?? 'not recorded', traceEventSummary(failure.traceEvidence).join('; ') || 'not recorded', (failure.traceEvidence?.retrievedEvidence ?? failure.evidence ?? []).join(', ') || 'none', (failure.traceEvidence?.toolCalls ?? []).map((tool) => `${tool.name}:${tool.status}`).join(', ') || 'none', failure.traceEvidence?.replayStatus ?? failure.replayStatus ?? 'not recorded', failure.traceEvidence?.regressionStatus ?? failure.regressionStatus ?? 'not recorded'])) : 'No trace-backed failure evidence recorded.'}

## Agent harness evidence

${markdownAgentHarnessEvidence(report.agentHarnessEvidence)}

## Historical comparison

${report.historicalComparison.summary}

## Support quality loop

${report.supportQualityLoop?.supportLike ? report.supportQualityLoop.summary : 'Not a support-quality report.'}

${markdownTable(['Stage', 'Count', 'Evidence'], supportQualityLoopRows(report.supportQualityLoop ?? {}))}

## Failure evidence

${report.failureEvidence.length ? markdownTable(['Severity', 'Contract', 'Scenario', 'Failure profile', 'Why it matters'], report.failureEvidence.map((failure) => [failure.severity, failure.contract, failure.scenarioId, failure.mutationId, failure.why])) : 'No release-blocking failures.'}

${report.retrievalEvidence ? `## RetrievalGuard source fidelity

${markdownTable(['Metric', 'Value'], Object.entries(report.retrievalEvidence.metrics).map(([key, value]) => [key, value]))}

${markdownTable(['Source', 'Status', 'Result'], report.retrievalEvidence.requiredSources.map((source) => [source.id, source.status, source.result]))}
` : ''}

## Remediation checklist

${report.remediation.map((item) => `- ${item}`).join('\n')}

## Regression plan

- Suite: ${report.regressionPlan.suite}
- Cadence: ${report.regressionPlan.cadence}
- Targeted rerun modes: ${(report.regressionPlan.rerunModes ?? []).join(', ') || 'none'}
- Cases: ${report.regressionPlan.cases.length ? report.regressionPlan.cases.map((item) => `${item.scenarioId}/${item.mutationId}/${item.fixedStatus ?? 'not_rerun'}`).join(', ') : 'none'}
- Fixed: ${(report.regressionPlan.comparisonStates?.fixed ?? []).join(', ') || 'none'}
- Still failing: ${(report.regressionPlan.comparisonStates?.stillFailing ?? []).join(', ') || 'none'}
- Newly failing: ${(report.regressionPlan.comparisonStates?.newlyFailing ?? []).join(', ') || 'none'}
`;
}

export function reportPrintHtml(report) {
  report = sanitizeDebugPayload(report);
  const retrievalSection = report.retrievalEvidence ? `
  <section>
    <h2>RetrievalGuard Source Fidelity</h2>
    ${reportHtmlTable(['Metric', 'Value'], Object.entries(report.retrievalEvidence.metrics).map(([key, value]) => [key, value]))}
    <h3>Source Checks</h3>
    ${reportHtmlTable(['Source', 'Status', 'Result'], report.retrievalEvidence.requiredSources.map((source) => [source.id, source.status, source.result]))}
    ${reportHtmlList(report.retrievalEvidence.checks)}
  </section>` : '';
  const supportLoopSection = report.supportQualityLoop?.supportLike ? `
  <section>
    <h2>Support Quality Loop</h2>
    <p>${escapeHtml(report.supportQualityLoop.summary)}</p>
    ${reportHtmlTable(['Stage', 'Count', 'Evidence'], supportQualityLoopRows(report.supportQualityLoop))}
    <h3>Generated regression cases</h3>
    ${reportHtmlTable(['Regression case', 'Scenario', 'Failure profile', 'Gate'], report.supportQualityLoop.generatedEvalCases.map((item) => [item.id, item.scenarioId, item.mutationId, item.gate]))}
    <h3>Instruction stack risks</h3>
    ${report.supportQualityLoop.instructionStackRisks.length ? reportHtmlTable(['Risk', 'Required file', 'Fix'], report.supportQualityLoop.instructionStackRisks.map((item) => [item.label, item.requiredFile, item.fix])) : '<p>No instruction-stack risk detected for this report.</p>'}
  </section>` : '';
  const domainFailuresSection = `
  <section>
    <h2>Agent-tool contract failures found</h2>
    ${htmlFailureClassCards(report.failureEvidence)}
    <h3>Scenario evidence table</h3>
    ${report.failureEvidence.length ? reportHtmlTable(['Scenario', 'Failure profile', 'Failure class', 'Severity', 'Expected behavior', 'Actual behavior', 'Replay'], report.failureEvidence.map((failure) => [failure.scenarioId, failure.mutationId, failure.failureClass ?? failure.label, failure.severity, failure.expected, failure.actual ?? failure.observed, replaySummary(failure)])) : '<p>No scenario evidence recorded.</p>'}
    <h3>Trace-backed evidence</h3>
    ${report.failureEvidence.length ? reportHtmlTable(['Failure class', 'Origin', 'Trace id', 'Key trace events', 'Retrieved evidence', 'Tool calls', 'Replay status', 'Regression status'], report.failureEvidence.map((failure) => [failure.failureClass ?? failure.label, failure.origin ?? failure.traceEvidence?.origin ?? 'unknown', failure.traceId ?? failure.traceEvidence?.traceId ?? 'not recorded', traceEventSummary(failure.traceEvidence).join('; ') || 'not recorded', (failure.traceEvidence?.retrievedEvidence ?? failure.evidence ?? []).join(', ') || 'none', (failure.traceEvidence?.toolCalls ?? []).map((tool) => `${tool.name}:${tool.status}`).join(', ') || 'none', failure.traceEvidence?.replayStatus ?? failure.replayStatus ?? 'not recorded', failure.traceEvidence?.regressionStatus ?? failure.regressionStatus ?? 'not recorded'])) : '<p>No trace-backed failure evidence recorded.</p>'}
    <h3>Agent harness evidence</h3>
    ${htmlAgentHarnessEvidence(report.agentHarnessEvidence)}
  </section>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(report.name)}</title>
  <style>
    @page { margin: 0.6in; }
    body { color: #111827; font-family: Inter, Arial, sans-serif; line-height: 1.45; margin: 0; }
    h1 { font-size: 30px; margin: 0 0 8px; }
    h2 { border-bottom: 1px solid #dbe3ef; font-size: 18px; margin: 28px 0 12px; padding-bottom: 6px; }
    h3 { font-size: 14px; margin: 18px 0 8px; }
    dl { display: grid; grid-template-columns: 180px 1fr; gap: 8px 18px; margin: 0; }
    dt { color: #64748b; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    dd { margin: 0; }
    table { border-collapse: collapse; margin: 10px 0 0; width: 100%; }
    th, td { border: 1px solid #dbe3ef; font-size: 12px; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #eef4ff; color: #334155; text-transform: uppercase; }
    ul { margin: 8px 0 0 20px; padding: 0; }
    li { margin: 5px 0; }
    .hero { background: #0f172a; color: white; margin: -8px -8px 24px; padding: 28px; }
    .hero p { color: #cbd5e1; margin: 0; max-width: 780px; }
    .decision { display: inline-block; font-size: 12px; font-weight: 800; letter-spacing: .08em; margin-bottom: 10px; text-transform: uppercase; }
    .score-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, 1fr); margin: 18px 0 0; }
    .score-card { background: #f8fafc; border: 1px solid #dbe3ef; border-radius: 8px; padding: 12px; }
    .score-card span { color: #64748b; display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .score-card strong { display: block; font-size: 24px; margin-top: 4px; }
    .failure-class-cards { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 12px; }
    .failure-class-cards article { border: 1px solid #dbe3ef; border-radius: 8px; padding: 12px; }
    .failure-class-cards span { color: #991b1b; font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .failure-class-cards h3 { margin-top: 4px; }
    .failure-class-cards p { font-size: 12px; margin: 6px 0 0; }
    .block { color: #fca5a5; }
    .pass { color: #86efac; }
    .page-break { break-before: page; }
  </style>
</head>
<body>
  <section class="hero">
    <span class="decision ${report.releaseDecision === 'Block release' ? 'block' : 'pass'}">${escapeHtml(report.releaseGate.verdict ?? report.releaseDecision)}</span>
    <h1>Toolchain Release Evidence Report</h1>
    <p>${escapeHtml(`${report.releaseGate.answer} ${report.summary}`)}</p>
  </section>
  <section class="score-grid">
    <div class="score-card"><span>Score</span><strong>${escapeHtml(report.score)}</strong></div>
    <div class="score-card"><span>Certification score</span><strong>${escapeHtml(report.benchmark?.score ?? report.score)}</strong></div>
    <div class="score-card"><span>Critical</span><strong>${escapeHtml(report.criticalFailures)}</strong></div>
    <div class="score-card"><span>Gate</span><strong>${escapeHtml(report.releaseGate.status)}</strong></div>
    <div class="score-card"><span>Environment</span><strong>${escapeHtml(report.environment)}</strong></div>
    <div class="score-card"><span>Owner</span><strong>${escapeHtml(report.owner)}</strong></div>
  </section>
  <section>
    <h2>Run Metadata</h2>
    <dl>
      <dt>Project</dt><dd>${escapeHtml(report.project)}</dd>
      <dt>Harness</dt><dd>${escapeHtml(report.harness)}</dd>
      <dt>Pack</dt><dd>${escapeHtml(report.pack)}</dd>
      <dt>Toolchain profile</dt><dd>${escapeHtml(report.pack)}</dd>
      <dt>Gate profile</dt><dd>${escapeHtml(benchmarkLabel(report))}</dd>
      <dt>Gate slug</dt><dd>${escapeHtml(report.benchmark?.slug ?? 'not recorded')}</dd>
      <dt>Certification run type</dt><dd>${escapeHtml(report.benchmark?.benchmarkRunType ?? report.benchmark?.runType ?? 'not recorded')}</dd>
      <dt>Gate tier</dt><dd>${escapeHtml(report.benchmark?.tier ?? 'not recorded')}</dd>
      <dt>Scenario set version</dt><dd>${escapeHtml(report.benchmark?.scenarioSetVersion ?? 'not recorded')}</dd>
      <dt>Scoring profile version</dt><dd>${escapeHtml(report.benchmark?.scoringProfileVersion ?? 'not recorded')}</dd>
      <dt>Gate profile version</dt><dd>${escapeHtml(report.benchmark?.gateProfileVersion ?? 'not recorded')}</dd>
      <dt>Release gate result</dt><dd>${escapeHtml(report.benchmark?.gateResult ?? 'not recorded')}</dd>
      <dt>Release verdict</dt><dd>${escapeHtml(report.releaseGate.verdict ?? report.releaseGate.status)}</dd>
      <dt>Unsafe action failures</dt><dd>${escapeHtml(report.releaseGate.toolchain?.unsafeActionFailures ?? 0)}</dd>
      <dt>Permission warnings</dt><dd>${escapeHtml(report.releaseGate.toolchain?.permissionWarnings ?? 0)}</dd>
      <dt>Replayable regression cases</dt><dd>${escapeHtml(report.releaseGate.toolchain?.replayableRegressionCases ?? 0)}</dd>
      <dt>Can release</dt><dd>${escapeHtml(report.releaseGate.canRelease ? 'yes' : 'no')}</dd>
      <dt>Blocking failures</dt><dd>${escapeHtml(report.releaseGate.blockingFailures)}</dd>
      <dt>Warnings</dt><dd>${escapeHtml(report.releaseGate.warningCount)}</dd>
      <dt>Failed contracts</dt><dd>${escapeHtml((report.benchmark?.failedContracts ?? []).join(', ') || 'none')}</dd>
      <dt>Failed failure profiles</dt><dd>${escapeHtml((report.benchmark?.failedMutationFamilies ?? []).join(', ') || 'none')}</dd>
      <dt>Run date</dt><dd>${escapeHtml(report.runDate)}</dd>
      <dt>Status</dt><dd>${escapeHtml(report.status)}</dd>
      <dt>Evidence mode</dt><dd>${escapeHtml(report.evidenceMode)}</dd>
      <dt>Adapter mode</dt><dd>${escapeHtml(report.adapterMode ?? 'not recorded')}</dd>
      <dt>Target used</dt><dd>${escapeHtml(report.targetReliability.targetUsed)}</dd>
      <dt>Target readiness</dt><dd>${escapeHtml(report.targetReliability.readinessStatus)}</dd>
      <dt>Validation at run time</dt><dd>${escapeHtml(report.targetReliability.validationState)}</dd>
      <dt>Lifecycle summary</dt><dd>${escapeHtml(report.lifecycleSummary.summary)}</dd>
      <dt>Weakest surface</dt><dd>${escapeHtml(report.failureSummary.weakestSurface)}</dd>
    </dl>
  </section>
  <section>
    <h2>Release Gate</h2>
    <p><strong>${escapeHtml(report.releaseGate.answer)}</strong></p>
    <p>${escapeHtml(report.gate.failCondition)}</p>
    ${reportHtmlList(report.releaseGate.reasons)}
    ${reportHtmlTable(['Metric', 'Required', 'Actual', 'Result'], report.gate.thresholds.map((item) => [item.metric, item.required, item.actual, item.result]))}
  </section>
  <section>
    <h2>Toolchain Readiness</h2>
    ${reportHtmlTable(['Signal', 'Value'], [
      ['Connected execution targets', report.releaseGate.toolchain?.connectedTargets ?? 0],
      ['Toolchain status', report.toolchainReadiness?.status ?? report.releaseGate.toolchain?.status ?? report.releaseGate.status],
      ['Readiness score', report.toolchainReadiness?.readinessScore ?? 'not recorded'],
      ['Production capable', report.toolchainReadiness?.productionCapable ? 'yes' : 'no'],
      ['Trace capture', report.toolchainReadiness?.traceCapture ? 'yes' : 'no'],
      ['Replay available', report.toolchainReadiness?.replayAvailable ? 'yes' : 'no'],
      ['Tools checked', report.toolchainReadiness?.tools?.length ?? 0],
      ['Recommended gate profiles', (report.toolchainReadiness?.recommendedGateProfiles ?? []).join(', ') || 'none'],
      ['Tool validation status', report.releaseGate.toolchain?.validationStatus ?? report.targetReliability.readinessStatus],
      ['Action-taking tools', report.releaseGate.toolchain?.actionTakingTools ?? 0],
      ['Read-only tools', report.releaseGate.toolchain?.readOnlyTools ?? 0],
      ['Human approval tools', report.releaseGate.toolchain?.humanApprovalTools ?? 0],
      ['Ambiguous schemas', report.releaseGate.toolchain?.ambiguousSchemas ?? 0],
      ['Recent contract failures', report.releaseGate.toolchain?.recentContractFailures ?? 0],
      ['Release status', report.releaseGate.toolchain?.releaseStatus ?? report.releaseGate.status],
    ])}
  </section>
  <section>
    <h2>Toolchain Readiness Evidence</h2>
    ${htmlToolContractFindings(report.toolchainReadiness ?? report.releaseGate.toolchain)}
  </section>
  ${domainFailuresSection}
  <section>
    <h2>Target Reliability</h2>
    ${reportHtmlTable(['Metric', 'Value'], [
      ['Target', report.targetReliability.targetUsed],
      ['Readiness', report.targetReliability.readinessStatus],
      ['Validation state at run time', report.targetReliability.validationState],
      ['Contract version', report.targetReliability.contractVersion],
      ['Validation success rate', report.targetReliability.validationSuccessRate],
      ['Run success rate', report.targetReliability.runSuccessRate],
      ['Failure classes', report.targetReliability.failureClasses.join(', ') || 'none'],
    ])}
  </section>
  <section>
    <h2>Failure Triage</h2>
    ${reportHtmlTable(['Class', 'Count', 'Top reasons'], report.failureTriage.buckets.map((bucket) => [bucket.label, bucket.count, bucket.reasons.join('; ') || 'none']))}
  </section>
  <section>
    <h2>Historical Comparison</h2>
    <p>${escapeHtml(report.historicalComparison.summary)}</p>
  </section>
  ${supportLoopSection}
  <section class="page-break">
    <h2>Failure Evidence</h2>
    <p>${escapeHtml(report.failureSummary.primaryRisk)}</p>
    ${report.failureEvidence.length ? reportHtmlTable(['Severity', 'Contract', 'Scenario', 'Failure profile', 'Expected', 'Observed', 'Recommended control'], report.failureEvidence.map((failure) => [failure.severity, failure.contract, failure.scenarioId, failure.mutationId, failure.expected, failure.observed, failure.recommendedControl])) : '<p>No release-blocking failures.</p>'}
  </section>
  ${retrievalSection}
  <section>
    <h2>Remediation Checklist</h2>
    ${reportHtmlList(report.remediation)}
  </section>
  <section>
    <h2>Regression Plan</h2>
    <dl>
      <dt>Suite</dt><dd>${escapeHtml(report.regressionPlan.suite)}</dd>
      <dt>Cadence</dt><dd>${escapeHtml(report.regressionPlan.cadence)}</dd>
      <dt>Targeted rerun modes</dt><dd>${escapeHtml((report.regressionPlan.rerunModes ?? []).join(', ') || 'none')}</dd>
      <dt>Cases</dt><dd>${escapeHtml(report.regressionPlan.cases.length ? report.regressionPlan.cases.map((item) => `${item.scenarioId}/${item.mutationId}/${item.fixedStatus ?? 'not_rerun'}`).join(', ') : 'none')}</dd>
      <dt>Fixed</dt><dd>${escapeHtml((report.regressionPlan.comparisonStates?.fixed ?? []).join(', ') || 'none')}</dd>
      <dt>Still failing</dt><dd>${escapeHtml((report.regressionPlan.comparisonStates?.stillFailing ?? []).join(', ') || 'none')}</dd>
      <dt>Newly failing</dt><dd>${escapeHtml((report.regressionPlan.comparisonStates?.newlyFailing ?? []).join(', ') || 'none')}</dd>
    </dl>
  </section>
  <section>
    <h2>Audit Trail</h2>
    ${reportHtmlTable(['Step', 'Event', 'Timestamp'], report.auditTrail.map((item) => [item.step, item.event, item.timestamp]))}
  </section>
</body>
</html>`;
}

function failureEvidenceForReport(report, context) {
  if (numericRunValue(report.criticalFailures) <= 0) return [];
  if (isRetrievalReport(report)) return retrievalFailureEvidence(report);
  return standardFailureEvidence(report, context);
}

function mergeClassifiedFailureEvidence(failureEvidence, classifiedFailures) {
  return failureEvidence.map((failure, index) => {
    const classified = classifiedFailures.find((item) => (
      item.scenarioId === failure.scenarioId
      && item.mutationId === failure.mutationId
    )) ?? classifiedFailures[index];
    return classified ? { ...failure, ...classified, severity: classified.severity } : failure;
  });
}

function ensureTraceEvidence(failure, report) {
  if (failure.traceEvidence) return failure;
  const origin = fallbackFailureOrigin(failure);
  const traceId = failure.traceId ?? `${report.id}:${failure.scenarioId ?? failure.id}`;
  const keyTraceEvents = [
    { step: 1, eventType: 'agent_invocation', label: `Scenario ${failure.scenarioId ?? 'unknown'} invoked`, status: 'ok', timestamp: report.runDate, origin: 'model_behavior' },
    { step: 2, eventType: 'evaluator_step', label: failure.why ?? failure.contract ?? 'Evaluator flagged failure', status: 'failed', timestamp: report.runDate, origin },
    { step: 3, eventType: 'failure_classification', label: failure.failureClass ?? failure.label ?? failure.mutationId ?? 'failure classified', status: 'failed', timestamp: report.runDate, origin },
  ];
  const traceEvidence = {
    traceId,
    origin,
    originLabel: origin.replace(/_/gu, ' '),
    keyTraceEvents,
    toolCalls: [],
    retrievedEvidence: Array.isArray(failure.evidence) ? failure.evidence : [],
    citations: [],
    replayStatus: failure.replay?.runId || failure.scenarioId ? 'replayable_metadata_captured' : 'trace_not_recorded',
    replayPayload: {
      run_id: report.runId ?? report.id,
      scenario_id: failure.scenarioId ?? '',
      mutation_id: failure.mutationId ?? '',
      trace_id: traceId,
    },
    regressionStatus: 'candidate',
    regressionCase: {
      scenario_id: failure.scenarioId ?? '',
      mutation_id: failure.mutationId ?? '',
      failure_class: failure.failureClass ?? failure.label ?? '',
      agent_version: report.agentVersion ?? '',
      expected_behavior: failure.expected ?? '',
      actual_behavior: failure.actual ?? failure.observed ?? '',
      trace_id: traceId,
      replay_payload: {
        run_id: report.runId ?? report.id,
        scenario_id: failure.scenarioId ?? '',
        mutation_id: failure.mutationId ?? '',
        trace_id: traceId,
      },
      fixed_status: 'not_rerun',
      first_seen_at: report.runDate,
      last_seen_at: report.runDate,
    },
  };
  return {
    ...failure,
    origin,
    traceId,
    traceEvidence,
    replayStatus: traceEvidence.replayStatus,
    regressionStatus: traceEvidence.regressionStatus,
    regressionCase: traceEvidence.regressionCase,
  };
}

function benchmarkPayloadForRun(run) {
  const benchmark = benchmarkForRun(run);
  if (!benchmark) return null;
  const benchmarkSnapshot = run.benchmarkSnapshot ?? createBenchmarkSnapshot(benchmark, run.completedAt ?? new Date().toISOString());
  const observations = Array.isArray(run.runnerObservations) ? run.runnerObservations : [];
  const failureObservations = observations.filter((observation) => {
    const failureModes = Array.isArray(observation.failure_modes) ? observation.failure_modes : [];
    return failureModes.length || numericRunValue(run.critical) > 0;
  });
  const failures = failureObservations.map((observation) => ({
    severity: numericRunValue(run.critical) > 0 ? 'critical' : 'major',
    contractId: String(observation.contract_id ?? observation.metadata?.contractId ?? (benchmark.packId === 'retrievalguard-core' ? 'source fidelity' : `${benchmark.packName} contract`)),
  }));
  if (!failures.length && numericRunValue(run.critical) > 0) {
    failures.push({ severity: 'critical', contractId: benchmark.contractIds[0] ?? `${benchmark.packName} contract` });
  }
  const scored = scoreBenchmark({ benchmark, failures });
  const score = numericRunValue(run.score) || scored.score;
  const runType = classifyBenchmarkRun({ run, benchmark, scenarioCount: numericRunValue(run.observations) });
  const metrics = extractBenchmarkMetrics(run);
  const gate = evaluateBenchmarkGate({
    benchmark,
    score,
    criticalCount: numericRunValue(run.critical),
    metrics,
  });
  const failedContracts = Array.from(new Set(failures.map((failure) => failure.contractId).filter(Boolean)));
  const failedMutationFamilies = Array.from(new Set(failureObservations.map((observation) => (
    String(observation.mutation_id ?? observation.metadata?.mutationId ?? 'runner_observation')
      .replace(/\.[^.]+$/u, '')
      .replace(/_[0-9]+$/u, '')
  ))));
  return {
    id: benchmark.id,
    slug: benchmark.slug,
    name: benchmark.name,
    version: benchmark.version,
    packId: benchmark.packId,
    packName: benchmark.packName,
    packVersion: benchmark.packVersion ?? '0.1',
    tier: benchmark.tier,
    scenarioSetVersion: benchmark.scenarioSetVersion ?? '0.1',
    scoringProfileId: benchmark.scoringProfileId,
    scoringProfileVersion: benchmarkSnapshot.scoringProfileVersion,
    gateProfileId: benchmark.gateProfileId,
    gateProfileVersion: benchmarkSnapshot.gateProfileVersion,
    benchmarkRunType: runType.benchmarkRunType,
    runType: runType.benchmarkRunType,
    baseBenchmarkId: runType.baseBenchmarkId,
    baseBenchmarkSlug: runType.baseBenchmarkSlug,
    overridesApplied: runType.overridesApplied,
    customizationReason: runType.customizationReason,
    benchmarkSnapshot,
    score,
    gateResult: gate.result,
    gateReason: gate.reason,
    releaseDecision: releaseDecisionForGate(gate.result),
    failedContracts,
    failedMutationFamilies,
    metrics,
  };
}

function sampleBenchmarkSnapshot({ name, pack, score, critical }) {
  const capturedAt = new Date().toISOString();
  return {
    schemaVersion: 'harnessamp.benchmark.v0.1',
    id: 'seeded-sample',
    slug: 'seeded-sample',
    name,
    version: 'sample',
    packId: 'seeded-sample',
    packName: pack,
    packVersion: 'sample',
    domain: 'sample data',
    tier: 'sample',
    scenarioCount: 0,
    scenarioSetVersion: 'sample',
    contractIds: [],
    mutationFamilyIds: [],
    scoringProfile: { id: 'sample', version: 'sample', score },
    gateProfile: { id: 'sample', version: 'sample', criticalFailures: critical },
    scoringProfileId: 'sample',
    scoringProfileVersion: 'sample',
    gateProfileId: 'sample',
    gateProfileVersion: 'sample',
    description: 'Seeded sample report. Not production release evidence.',
    capturedAt,
  };
}

function benchmarkLabel(report) {
  if (!report.benchmark) return 'not recorded';
  if (report.benchmark.seeded) return 'Seeded sample - not production release evidence';
  return `${report.benchmark.name} v${report.benchmark.version}`;
}

function retrievalFailureEvidence(report) {
  const observationFailures = observationFailureEvidence(report);
  if (observationFailures.length) return observationFailures;
  return [
    {
      id: 'rg-citation-001',
      severity: 'Critical',
      scenarioId: 'retrieval_contradictory_evidence_001',
      mutationId: 'contradiction_ignored',
      contract: 'Preserve source facts',
      expected: 'Prefer current policy source and explain conflict when stale evidence disagrees.',
      observed: 'Answer accepted contradictory or stale evidence without surfacing provenance risk.',
      why: 'A user-facing answer can cite the wrong source while appearing grounded.',
      evidence: ['required source: policy-2026-section-4', 'forbidden source: stale-policy-2024'],
      recommendedControl: 'Validate cited document IDs and source timestamps before final answer generation.',
    },
    {
      id: 'rg-bridge-002',
      severity: 'Critical',
      scenarioId: 'retrieval_missing_bridge_002',
      mutationId: 'missing_bridge_evidence',
      contract: 'Preserve multi-hop support',
      expected: 'Abstain or ask for more context when bridge evidence is missing.',
      observed: 'Final answer completed the claim without the bridge document.',
      why: 'Multi-hop answers can look complete while one required support leg is absent.',
      evidence: ['required bridge document missing', 'final answer recall below required threshold'],
      recommendedControl: 'Require qrel coverage for all required bridge documents before answer synthesis.',
    },
    {
      id: 'rg-authority-003',
      severity: 'Major',
      scenarioId: 'retrieval_source_authority_003',
      mutationId: 'source_authority_inversion',
      contract: 'Prefer authoritative sources',
      expected: 'Select official or higher-authority evidence over low-authority snippets.',
      observed: 'Lower-authority evidence influenced the final answer.',
      why: 'A low-authority source can override the correct institutional source.',
      evidence: ['authority mismatch detected', 'citation metadata needs validation'],
      recommendedControl: 'Rank sources by authority class and block final citations from disallowed tiers.',
    },
    {
      id: 'rg-tool-004',
      severity: 'Major',
      scenarioId: 'retrieval_tool_failure_004',
      mutationId: 'retrieval_tool_failure',
      contract: 'Fail safely on retrieval uncertainty',
      expected: 'State uncertainty or retry when retrieval telemetry is incomplete.',
      observed: 'Answer remained overconfident after retrieval degradation.',
      why: 'Tool failure can become hidden hallucination unless uncertainty is explicit.',
      evidence: ['retrieval telemetry incomplete', 'no safe-abstention language detected'],
      recommendedControl: 'Expose retrieval failure state to the responder and require safe-abstention language.',
    },
  ].slice(0, Math.max(1, Math.min(4, numericRunValue(report.criticalFailures))));
}

function observationFailureEvidence(report) {
  const observations = Array.isArray(report.runnerObservations) ? report.runnerObservations : [];
  return observations.flatMap((observation, index) => {
    const failureModes = Array.isArray(observation.failure_modes) ? observation.failure_modes : [];
    if (!failureModes.length && numericRunValue(report.criticalFailures) <= 0) return [];
    const evidence = Array.isArray(observation.curated_evidence)
      ? observation.curated_evidence.map((item) => item.doc_id ?? item.title ?? JSON.stringify(item))
      : [];
    const normalizedObservation = {
      id: `${report.runId ?? report.id}:obs-${index + 1}`,
      runId: report.runId ?? report.id,
      scenarioId: observation.scenario_id ?? report.runId ?? report.id,
      mutationId: observation.mutation_id ?? 'runner_observation',
      contractId: observation.contract_id ?? 'Preserve source facts',
      status: failureModes.length || numericRunValue(report.criticalFailures) > 0 ? 'fail' : 'pass',
      severity: numericRunValue(report.criticalFailures) > 0 ? 'critical' : 'major',
      input: observation.input ?? observation.query ?? null,
      output: observation.final_answer ?? observation.output ?? '',
      evaluatorReason: failureModes.length ? failureModes.join(', ') : 'Runner observation requires reviewer validation.',
      createdAt: report.completedAt ?? report.runDate,
    };
    const expected = 'Runner response should preserve required sources and cite only supported evidence.';
    const observed = observation.final_answer ?? 'No final answer captured.';
    const traceEvidence = traceEvidenceForFailure({
      run: report,
      observation: normalizedObservation,
      rawObservation: observation,
      failureClass: String(failureModes[0] ?? ''),
      expected,
      actual: observed,
    });
    return [{
      id: `runner-observation-${index + 1}`,
      severity: numericRunValue(report.criticalFailures) > 0 ? 'Critical' : 'Major',
      scenarioId: normalizedObservation.scenarioId,
      mutationId: normalizedObservation.mutationId,
      contract: 'Preserve source facts',
      expected,
      observed,
      why: failureModes.length ? failureModes.join(', ') : 'Runner observation requires reviewer validation.',
      evidence,
      origin: traceEvidence.origin,
      traceId: traceEvidence.traceId,
      traceEvidence,
      replayStatus: traceEvidence.replayStatus,
      regressionStatus: traceEvidence.regressionStatus,
      regressionCase: traceEvidence.regressionCase,
      recommendedControl: 'Use captured runner observations to pin regression cases and validate source provenance.',
    }];
  }).slice(0, Math.max(1, Math.min(4, numericRunValue(report.criticalFailures) || 1)));
}

function agentHarnessEvidenceForObservations(observations = [], report = {}) {
  const first = Array.isArray(observations)
    ? observations.find((observation) => observation?.metadata?.agentHarnessResult || observation?.metadata?.harnessTask)
    : null;
  if (!first) return null;
  const metadata = first.metadata ?? {};
  const result = metadata.agentHarnessResult ?? {};
  const task = metadata.harnessTask ?? {};
  const traceEvidence = metadata.traceEvidence ?? {};
  return {
    targetType: metadata.targetType ?? report.executionTarget?.targetType ?? 'generic_agent_harness',
    targetId: metadata.targetId ?? report.executionTarget?.targetId ?? 'fixture-target',
    adapterVersion: metadata.adapterVersion ?? report.executionTarget?.adapterVersion ?? 'agent-harness-target.v0.1',
    fixture: true,
    memoryPolicy: metadata.memoryPolicy ?? task.memoryPolicy ?? {},
    permissionPolicy: metadata.permissionPolicy ?? task.permissionPolicy ?? {},
    workspacePolicy: metadata.workspacePolicy ?? task.workspacePolicy ?? {},
    runtimeBudget: metadata.runtimeBudget ?? task.runtimeBudget ?? {},
    artifactPolicy: metadata.artifactPolicy ?? task.artifactPolicy ?? {},
    actionsTaken: result.actionsTaken ?? [],
    memoryReads: result.memoryReads ?? [],
    memoryWrites: result.memoryWrites ?? [],
    toolCalls: result.toolCalls ?? [],
    permissionPrompts: result.permissionPrompts ?? [],
    workspaceChanges: result.workspaceChanges ?? [],
    artifacts: result.artifacts ?? [],
    traceIntegrity: result.traceIntegrity ?? {},
    replayAvailable: Boolean(traceEvidence.replayPayload || result.traceIntegrity?.replaySnapshotAvailable),
    memoryPolicySummary: policySummary(metadata.memoryPolicy ?? task.memoryPolicy),
    permissionPolicySummary: permissionPolicySummary(metadata.permissionPolicy ?? task.permissionPolicy),
    workspacePolicySummary: workspacePolicySummary(metadata.workspacePolicy ?? task.workspacePolicy),
    actionSummary: summarizeItems(result.actionsTaken, 'actionType'),
    memorySummary: summarizeMemory(result.memoryReads, result.memoryWrites),
    toolSummary: summarizeItems(result.toolCalls, 'name'),
    workspaceSummary: summarizeItems(result.workspaceChanges, 'path'),
    artifactSummary: summarizeItems(result.artifacts, 'id'),
  };
}

function markdownAgentHarnessEvidence(evidence) {
  if (!evidence) return 'No agent harness target evidence recorded.';
  return markdownTable(['Field', 'Value'], [
    ['Target', `${evidence.targetType} / ${evidence.targetId}`],
    ['Adapter', evidence.adapterVersion],
    ['Fixture/scaffold', evidence.fixture ? 'yes' : 'no'],
    ['Memory policy', evidence.memoryPolicySummary],
    ['Permission policy', evidence.permissionPolicySummary],
    ['Workspace policy', evidence.workspacePolicySummary],
    ['Runtime budget', runtimeBudgetSummary(evidence.runtimeBudget)],
    ['Actions', evidence.actionSummary || 'none'],
    ['Memory events', evidence.memorySummary || 'none'],
    ['Tool calls', evidence.toolSummary || 'none'],
    ['Workspace changes', evidence.workspaceSummary || 'none'],
    ['Artifacts', evidence.artifactSummary || 'none'],
    ['Replay-safe evidence', evidence.replayAvailable ? 'available' : 'not recorded'],
  ]);
}

function markdownToolContractFindings(readiness = {}) {
  const toolRows = (readiness.tools ?? []).map((tool) => [
    tool.name,
    tool.category,
    tool.riskLevel,
    tool.permissionBoundary,
    tool.schemaStatus,
    tool.descriptionQuality,
    [...(tool.blockers ?? []), ...(tool.warnings ?? [])].map((finding) => finding.message).join('; ') || 'none',
  ]);
  const blockerRows = [
    ...(readiness.releaseBlockers ?? []).map((finding) => ['blocker', finding.contractArea, finding.message]),
    ...(readiness.warnings ?? []).map((finding) => ['warning', finding.contractArea, finding.message]),
  ];
  return [
    markdownTable(['Tool', 'Category', 'Risk', 'Permission boundary', 'Schema', 'Description', 'Findings'], toolRows.length ? toolRows : [['none', 'not recorded', 'not recorded', 'not recorded', 'not recorded', 'not recorded', 'No tool contracts declared.']]),
    markdownTable(['Type', 'Contract area', 'Message'], blockerRows.length ? blockerRows : [['info', 'release', 'No Tool Contract Doctor blockers or warnings recorded.']]),
  ].join('\n\n');
}

function htmlAgentHarnessEvidence(evidence) {
  if (!evidence) return '<p>No agent harness target evidence recorded.</p>';
  return reportHtmlTable(['Field', 'Value'], [
    ['Target', `${evidence.targetType} / ${evidence.targetId}`],
    ['Adapter', evidence.adapterVersion],
    ['Fixture/scaffold', evidence.fixture ? 'yes' : 'no'],
    ['Memory policy', evidence.memoryPolicySummary],
    ['Permission policy', evidence.permissionPolicySummary],
    ['Workspace policy', evidence.workspacePolicySummary],
    ['Runtime budget', runtimeBudgetSummary(evidence.runtimeBudget)],
    ['Actions', evidence.actionSummary || 'none'],
    ['Memory events', evidence.memorySummary || 'none'],
    ['Tool calls', evidence.toolSummary || 'none'],
    ['Workspace changes', evidence.workspaceSummary || 'none'],
    ['Artifacts', evidence.artifactSummary || 'none'],
    ['Replay-safe evidence', evidence.replayAvailable ? 'available' : 'not recorded'],
  ]);
}

function htmlToolContractFindings(readiness = {}) {
  const toolRows = (readiness.tools ?? []).map((tool) => [
    tool.name,
    tool.category,
    tool.riskLevel,
    tool.permissionBoundary,
    tool.schemaStatus,
    tool.descriptionQuality,
    [...(tool.blockers ?? []), ...(tool.warnings ?? [])].map((finding) => finding.message).join('; ') || 'none',
  ]);
  const blockerRows = [
    ...(readiness.releaseBlockers ?? []).map((finding) => ['blocker', finding.contractArea, finding.message]),
    ...(readiness.warnings ?? []).map((finding) => ['warning', finding.contractArea, finding.message]),
  ];
  return `${reportHtmlTable(['Tool', 'Category', 'Risk', 'Permission boundary', 'Schema', 'Description', 'Findings'], toolRows.length ? toolRows : [['none', 'not recorded', 'not recorded', 'not recorded', 'not recorded', 'not recorded', 'No tool contracts declared.']])}
    ${reportHtmlTable(['Type', 'Contract area', 'Message'], blockerRows.length ? blockerRows : [['info', 'release', 'No Tool Contract Doctor blockers or warnings recorded.']])}`;
}

function standardFailureEvidence(report, context) {
  const reportFailures = failureRowsForReport(report, context.failures ?? []);
  return reportFailures
    .slice(0, Math.max(1, Math.min(4, numericRunValue(report.criticalFailures))))
    .map((failure) => {
      const [severity, contract, mutation, scenario, status, owner, repro, id] = failure;
      const detail = context.failureDetails?.[id] ?? {};
      return {
        id,
        severity,
        scenarioId: scenario,
        mutationId: mutation,
        contract,
        status,
        owner,
        reproducibility: repro,
        expected: detail.expected ?? 'Agent should satisfy the contract under mutation.',
        observed: detail.observed ?? 'Observed output violated the contract.',
        why: detail.why ?? 'The failure is release relevant.',
        evidence: [detail.context, detail.output].filter(Boolean),
        recommendedControl: standardControlFix(contract),
      };
    });
}

function failureRowsForReport(report, failures) {
  if (isSupportReport(report)) {
    const supportFailures = failures.filter((failure) => /refund|billing|account|mfa|policy|support|security|cancel|privacy|auth/iu.test(failure.join(' ')));
    if (supportFailures.length) return supportFailures;
  }
  if (/health|clinical|patient/iu.test(`${report.pack} ${report.harness} ${report.project}`)) {
    const healthFailures = failures.filter((failure) => /health|clinical|symptom|diagnosis|red flag|source facts|sensitive data/iu.test(failure.join(' ')));
    if (healthFailures.length) return healthFailures;
  }
  return failures;
}

function retrievalEvidenceForReport(report) {
  const observations = Array.isArray(report.runnerObservations) ? report.runnerObservations : [];
  const firstObservation = observations[0] ?? {};
  const metrics = firstObservation.metadata?.retrievalMetrics ?? {};
  const observedEvidence = observations.flatMap((observation) => Array.isArray(observation.curated_evidence) ? observation.curated_evidence : []);
  return {
    metrics: {
      trajectoryRecall: metrics.recall ?? firstObservation.trajectory_recall ?? 0.72,
      finalAnswerRecall: metrics.finalAnswerRecall ?? firstObservation.final_answer_recall ?? 0.68,
      citationPrecision: metrics.precision ?? firstObservation.precision ?? 0.64,
      qrelCoverage: observedEvidence.length ? 'captured from runner observation' : 'partial preview',
      observations: numericRunValue(report.observations) || observations.length || 50,
    },
    requiredSources: observedEvidence.length
      ? observedEvidence.map((source) => ({
          id: source.doc_id ?? source.title ?? 'unknown-source',
          status: 'observed citation',
          result: source.url ?? 'captured without URL',
        }))
      : [
          { id: 'policy-2026-section-4', status: 'required', result: 'missed or underweighted' },
          { id: 'bridge-claim-2026-a', status: 'required bridge', result: 'missing in failed case' },
          { id: 'stale-policy-2024', status: 'forbidden stale source', result: 'must not cite' },
        ],
    checks: [
      'Document IDs are preserved through final answer citations.',
      'Citation timestamps and authority class are validated.',
      'Missing qrel or bridge evidence forces abstention or clarification.',
      'Retrieval tool errors are represented in responder metadata.',
    ],
    artifactUris: [
      `file://runs/harness1/${report.runId ?? report.id}.jsonl`,
      `file://reports/${report.id}.json`,
    ],
  };
}

function failureSummaryForReport(report, failureEvidence) {
  const critical = numericRunValue(report.criticalFailures);
  const major = critical > 0 ? Math.max(1, Math.min(3, critical - 1)) : 0;
  const weakestSurface = isRetrievalReport(report)
    ? 'Source grounding, citation fidelity, and qrel coverage'
    : 'Contract boundary adherence and escalation discipline';
  return {
    totalCritical: critical,
    totalMajor: major,
    totalCasesShown: failureEvidence.length,
    weakestSurface,
    primaryRisk: critical > 0
      ? `${report.pack} has release-blocking failures that can produce unsupported or unsafe answers.`
      : `${report.pack} passed the configured release gate.`,
  };
}

function gateForReport(report, releaseDecision, releaseGate = null) {
  const score = numericRunValue(report.score);
  const critical = numericRunValue(report.criticalFailures);
  const minimumScore = 86;
  const invalidTarget = releaseGate?.reasonDetails?.some((item) => item.category === 'execution_target' && item.blocking) ?? false;
  const invalidLifecycle = releaseGate?.reasonDetails?.some((item) => item.category === 'worker_lifecycle' && item.blocking) ?? false;
  return {
    decision: releaseDecision,
    failCondition: 'block on critical failures, score below baseline, invalid worker lifecycle, adapter, target, validation, or contract state',
    reviewer: packOwner(report.pack),
    thresholds: [
      {
        metric: 'Critical failures',
        required: '0',
        actual: String(critical),
        result: critical > 0 ? 'fail' : 'pass',
      },
      {
        metric: 'Robustness score',
        required: `>= ${minimumScore}`,
        actual: String(score),
        result: score >= minimumScore ? 'pass' : 'fail',
      },
      {
        metric: 'Report evidence',
        required: 'case evidence attached',
        actual: critical > 0 ? 'attached' : 'not required',
        result: 'pass',
      },
      {
        metric: 'Execution target',
        required: 'validated and contract-compatible',
        actual: report.targetReliability?.readinessStatus ?? releaseGate?.target?.readinessStatus ?? 'unknown',
        result: invalidTarget ? 'fail' : 'pass',
      },
      {
        metric: 'Worker lifecycle',
        required: 'completed without worker or adapter failure',
        actual: report.lifecycleSummary?.status ?? releaseGate?.lifecycle?.status ?? 'unknown',
        result: invalidLifecycle ? 'fail' : 'pass',
      },
    ],
  };
}

function releaseGateForReport(report, { releaseDecision, failureEvidence, targetReliability, lifecycle }) {
  return buildReleaseGate({
    report,
    run: report,
    target: targetReliability,
    lifecycle,
    failureEvidence,
    releaseDecision,
  });
}

function targetReliabilityForReport(report, context) {
  const fromContext = context.targetReliabilityByRunId?.[report.runId] ?? context.targetReliability ?? report.targetReliability ?? null;
  const executionTarget = report.executionTarget ?? fromContext ?? {};
  const failureClasses = uniqueStrings([
    ...(Array.isArray(fromContext?.failureClasses) ? fromContext.failureClasses : []),
    executionTarget.failureClass,
    report.failureClass,
  ]).filter((item) => item !== 'none');
  const validationState = fromContext?.validationState ?? executionTarget.validationState ?? 'not recorded';
  const readinessStatus = fromContext?.readinessStatus
    ?? readinessFromTargetContext({ validationState, failureClasses, ephemeral: Boolean(executionTarget.ephemeral) });
  return {
    targetUsed: fromContext?.targetUsed ?? executionTarget.name ?? executionTarget.id ?? report.targetUsed ?? 'not recorded',
    targetType: fromContext?.targetType ?? executionTarget.typeLabel ?? executionTarget.type ?? 'not recorded',
    readinessStatus,
    validationState,
    validationSuccessRate: fromContext?.validationSuccessRate ?? 'not recorded',
    runSuccessRate: fromContext?.runSuccessRate ?? 'not recorded',
    lastPass: fromContext?.lastPass ?? 'not recorded',
    lastFail: fromContext?.lastFail ?? 'not recorded',
    failureClasses,
    latency: fromContext?.latency ?? 'not recorded',
    contractVersion: fromContext?.contractVersion ?? executionTarget.contractVersion ?? 'unknown',
    ephemeral: Boolean(fromContext?.ephemeral ?? executionTarget.ephemeral),
  };
}

function readinessFromTargetContext({ validationState, failureClasses, ephemeral }) {
  if (failureClasses.some((item) => /contract|schema|version/iu.test(item))) return 'Contract mismatch';
  if (failureClasses.length) return 'Recently failing';
  if (validationState === 'passed') return ephemeral ? 'Ephemeral' : 'Healthy';
  if (validationState === 'failed' || validationState === 'blocked') return 'Recently failing';
  return 'Needs validation';
}

function lifecycleSummaryForReport(report) {
  const timeline = Array.isArray(report.timeline) ? report.timeline : [];
  const status = report.runStatus ?? (report.status === 'review_required' ? 'completed' : report.status) ?? 'completed';
  const summary = timeline.length
    ? `${timeline[0]} -> ${timeline[timeline.length - 1]}`
    : `Lifecycle status ${status}.`;
  return {
    status,
    startedAt: report.runDate ?? 'not recorded',
    completedAt: report.completedAt ?? 'not recorded',
    workerId: report.workerId ?? 'not recorded',
    attempts: report.attempts ?? 1,
    summary,
  };
}

function failureTriageForReport(report, failureEvidence, releaseGate) {
  return buildFailureTriageBuckets(failureEvidence, releaseGate);
}

function historicalComparisonForReport(report, context) {
  const runs = context.localRuns ?? [];
  const currentIndex = runs.findIndex((run) => run.id === report.runId);
  const currentRun = currentIndex >= 0 ? runs[currentIndex] : null;
  const benchmarkSlug = report.benchmark?.slug ?? report.pack;
  const agentVersion = agentVersionForReport(report, currentRun);
  const targetKey = context.targetReliabilityByRunId?.[report.runId]?.targetUsed ?? report.targetReliability?.targetUsed ?? '';
  const previous = runs
    .slice(currentIndex + 1)
    .find((run) => {
      const runBenchmark = benchmarkPayloadForRun(run);
      const runTarget = context.targetReliabilityByRunId?.[run.id]?.targetUsed ?? '';
      return (runBenchmark?.slug ?? run.pack) === benchmarkSlug
        && agentVersionForReport(report, run) === agentVersion
        && (!targetKey || !runTarget || runTarget === targetKey);
    });
  if (!currentRun || !previous) {
    return {
      status: 'not_available',
      summary: 'Historical comparison requires a previous run for the same target, benchmark, and agent version.',
    };
  }
  const scoreDelta = numericRunValue(currentRun.score) - numericRunValue(previous.score);
  const criticalDelta = numericRunValue(currentRun.critical) - numericRunValue(previous.critical);
  const status = scoreDelta >= 0 && criticalDelta <= 0 ? 'improved' : 'regressed';
  return {
    status,
    scoreDelta,
    criticalDelta,
    summary: `${status === 'improved' ? 'Improved' : 'Regressed'} versus ${previous.name}: score ${formatSigned(scoreDelta)}, critical failures ${formatSigned(criticalDelta)}.`,
  };
}

function agentVersionForReport(report, run) {
  return run?.agentVersion ?? report.agentVersion ?? run?.metadata?.agentVersion ?? 'unknown-agent';
}

function remediationForReport(report, failureEvidence, supportQualityLoop = null) {
  if (!failureEvidence.length) {
    return ['Archive report as passing evidence.', 'Keep the same pack in scheduled regression.'];
  }
  const base = [
    'Block promotion until critical failures are triaged.',
    `Assign owner: ${packOwner(report.pack)}.`,
    'Pin every reproducible failure to a regression suite.',
    'Rerun the same harness, pack, tier, and fail condition after fixes.',
  ];
  if (isRetrievalReport(report)) {
    base.splice(2, 0, 'Add qrel coverage checks for required and bridge documents.', 'Reject final citations whose source metadata cannot be validated.');
  }
  if (supportQualityLoop?.supportLike) {
    base.splice(
      2,
      0,
      'Import the real support ticket, policy excerpt, and account-event shape that produced each failure.',
      'Patch the instruction stack so ticket text, CRM notes, and retrieved docs cannot override policy or escalation rules.',
      'Convert generated eval cases into release-blocking CI checks before the next candidate branch.',
    );
  }
  return base;
}

function regressionPlanForReport(report, failureEvidence, supportQualityLoop = null) {
  const generatedCases = supportQualityLoop?.supportLike
    ? supportQualityLoop.generatedEvalCases.map((item) => ({
        scenarioId: item.scenarioId,
        mutationId: item.mutationId,
        severity: item.severity,
        evalId: item.id,
        gate: item.gate,
      }))
    : null;
  return {
    suite: supportQualityLoop?.supportLike
      ? 'Support production failure blockers'
      : isRetrievalReport(report) ? 'RetrievalGuard release blockers' : `${report.pack} release blockers`,
    cadence: numericRunValue(report.criticalFailures) > 0 ? 'rerun on every candidate branch' : 'nightly',
    rerunModes: [
      'Rerun blocking failures',
      'Rerun warnings',
      'Rerun selected failure class',
      'Rerun failed scenarios from this report',
    ],
    comparisonStates: {
      fixed: [],
      stillFailing: failureEvidence.map((failure) => failure.failureClass ?? failure.label ?? failure.mutationId).filter(Boolean).slice(0, 4),
      newlyFailing: [],
      regressed: [],
      notRerun: failureEvidence.map((failure) => failure.scenarioId).filter(Boolean).slice(0, 4),
    },
    cases: generatedCases ?? failureEvidence.map((failure) => ({
      scenarioId: failure.scenarioId,
      mutationId: failure.mutationId,
      severity: failure.severity,
      failureClass: failure.failureClass ?? failure.label ?? '',
      origin: failure.origin ?? failure.traceEvidence?.origin ?? 'unknown',
      traceId: failure.traceId ?? failure.traceEvidence?.traceId ?? '',
      replayPayload: failure.traceEvidence?.replayPayload ?? null,
      fixedStatus: failure.traceEvidence?.regressionCase?.fixed_status ?? 'not_rerun',
    })),
  };
}

function auditTrailForReport(report) {
  const timeline = Array.isArray(report.timeline) && report.timeline.length
    ? report.timeline
    : ['Run queued', 'Runner claimed job', 'Evaluation completed', 'Report generated'];
  return timeline.map((item, index) => ({
    step: index + 1,
    event: item,
    timestamp: report.runDate,
  }));
}

function reportEnvironment(report) {
  const [, environment] = String(report.harness ?? '').split(' - ');
  return environment?.trim() || 'staging';
}

function projectForRun(run, harnesses) {
  const match = harnesses.find((item) => item.id === run.harnessId)
    ?? harnessFromLabel(run.harness, harnesses);
  return match?.project ?? 'Local preview';
}

function harnessFromLabel(harness, harnesses) {
  const name = String(harness ?? '').split(' - ')[0].trim();
  return harnesses.find((item) => item.name === name || item.id === name) ?? null;
}

function adapterModeFromObservations(observations) {
  return observations.find((observation) => observation?.metadata?.mode)?.metadata.mode ?? '';
}

function isRetrievalReport(report) {
  return /retrieval|rag|source/iu.test(`${report.pack} ${report.name}`);
}

function isSupportReport(report) {
  return /customer|support|agentguard|care/iu.test(`${report.pack} ${report.name} ${report.harness} ${report.project}`);
}

function packOwner(packName) {
  if (/health/iu.test(packName)) return 'Clinical Safety';
  if (/finance/iu.test(packName)) return 'Finance Review';
  if (/customer/iu.test(packName)) return 'Support Operations';
  if (/legal/iu.test(packName)) return 'Legal Review';
  if (/retrieval|rag|source/iu.test(packName)) return 'Knowledge Review';
  return 'Platform';
}

function standardControlFix(contract) {
  if (/red flags/iu.test(contract)) return 'Add hard escalation rules before response generation for urgent symptoms.';
  if (/diagnosis/iu.test(contract)) return 'Move diagnosis avoidance into a non-negotiable contract with clinician-deference wording.';
  if (/source facts|source/iu.test(contract)) return 'Add source-fact preservation checks and require uncertainty language when context is incomplete.';
  return 'Assign an owner and capture expected behavior as a regression contract.';
}

function numericRunValue(value) {
  const number = Number.parseInt(String(value).replace(/,/gu, ''), 10);
  return Number.isFinite(number) ? number : 0;
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)));
}

function formatSigned(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '0';
  return number > 0 ? `+${number}` : String(number);
}

function markdownTable(headers, rows) {
  const header = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map((cell) => String(cell ?? '').replaceAll('|', '\\|')).join(' | ')} |`);
  return [header, separator, ...body].join('\n');
}

function reportHtmlTable(headers, rows) {
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function reportHtmlList(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function replaySummary(failure) {
  const replay = failure.replay ?? {};
  const traceReplay = failure.traceEvidence?.replayPayload ?? {};
  return [
    replay.runId ?? traceReplay.run_id,
    replay.scenarioId ?? traceReplay.scenario_id,
    replay.mutationId ?? traceReplay.mutation_id,
    replay.target ?? traceReplay.trace_id,
  ].filter(Boolean).join(' / ') || 'not recorded';
}

function traceEventSummary(traceEvidence = {}) {
  const events = Array.isArray(traceEvidence?.keyTraceEvents) ? traceEvidence.keyTraceEvents : [];
  return events.map((event) => `${event.step}. ${event.eventType}: ${event.label}`);
}

function policySummary(policy = {}) {
  if (!policy) return 'not recorded';
  return `mode ${policy.mode ?? 'not recorded'}; writes ${policy.allowWrites === false ? 'blocked' : 'allowed'}; explicit persistence ${policy.requireExplicitPersistence === false ? 'not required' : 'required'}`;
}

function permissionPolicySummary(policy = {}) {
  if (!policy) return 'not recorded';
  const confirmations = Array.isArray(policy.requireConfirmationFor) ? policy.requireConfirmationFor.join(', ') : 'none';
  return `confirm ${confirmations || 'none'}; irreversible ${policy.irreversibleActionsBlocked === false ? 'allowed' : 'blocked'}`;
}

function workspacePolicySummary(policy = {}) {
  if (!policy) return 'not recorded';
  const allowed = Array.isArray(policy.allowedPaths) ? policy.allowedPaths.join(', ') : 'not recorded';
  const denied = Array.isArray(policy.deniedPaths) ? policy.deniedPaths.join(', ') : 'none';
  return `sandbox ${policy.sandboxRequired === false ? 'optional' : 'required'}; allowed ${allowed}; denied ${denied}; network ${policy.networkPolicy ?? 'not recorded'}`;
}

function runtimeBudgetSummary(budget = {}) {
  if (!budget) return 'not recorded';
  return `${budget.maxSteps ?? 'n/a'} steps / ${budget.maxToolCalls ?? 'n/a'} tool calls / ${budget.maxWallClockMs ?? 'n/a'}ms`;
}

function summarizeItems(items = [], field) {
  return Array.isArray(items)
    ? items.map((item) => item?.[field] ?? item?.summary ?? '').filter(Boolean).join('; ')
    : '';
}

function summarizeMemory(reads = [], writes = []) {
  const readSummary = summarizeItems(reads, 'key');
  const writeSummary = summarizeItems(writes, 'key');
  return [readSummary ? `reads ${readSummary}` : '', writeSummary ? `writes ${writeSummary}` : ''].filter(Boolean).join('; ');
}

function fallbackFailureOrigin(failure) {
  const text = `${failure.failureClass ?? ''} ${failure.label ?? ''} ${failure.contract ?? ''} ${failure.mutationId ?? ''} ${failure.why ?? ''}`.toLowerCase();
  if (/retrieval|citation|source|document|qrel/u.test(text)) return 'retrieval';
  if (/tool/u.test(text)) return 'tool_use';
  if (/policy|refund|mfa|privacy|authority|unauthorized/u.test(text)) return 'policy_boundary';
  if (/adapter|contract|schema/u.test(text)) return 'adapter_contract';
  if (/timeout|latency|target|endpoint/u.test(text)) return 'execution_target';
  if (/worker|queue|retry/u.test(text)) return 'worker_lifecycle';
  if (/evaluator|score/u.test(text)) return 'evaluator';
  if (/model|answer|response|hallucination/u.test(text)) return 'model_behavior';
  return 'unknown';
}

function markdownFailureClassCards(failures) {
  const groups = groupFailureEvidence(failures);
  if (!groups.length) return 'No domain-specific failures found.';
  return groups.map((group) => [
    `### ${group.label}`,
    '',
    `- Ontology ID: ${group.id}`,
    `- Domain: ${group.domain}`,
    `- Severity: ${group.severity}`,
    `- Count: ${group.count}`,
    `- Affected scenarios: ${group.scenarios.join(', ') || 'none'}`,
    `- Mutation families: ${group.mutations.join(', ') || 'none'}`,
    `- Release impact: ${group.releaseImpact}`,
    `- Recommended fix: ${group.recommendedFix}`,
    `- Replay metadata: ${group.replays.join('; ') || 'not recorded'}`,
  ].join('\n')).join('\n\n');
}

function htmlFailureClassCards(failures) {
  const groups = groupFailureEvidence(failures);
  if (!groups.length) return '<p>No domain-specific failures found.</p>';
  return `<div class="failure-class-cards">${groups.map((group) => `
    <article>
      <span>${escapeHtml(`${group.severity} · ${group.domain}`)}</span>
      <h3>${escapeHtml(group.label)}</h3>
      <p><strong>${escapeHtml(group.count)} affected scenario${group.count === 1 ? '' : 's'}</strong> · ${escapeHtml(group.mutations.join(', ') || 'no mutation family recorded')}</p>
      <p><strong>Ontology ID:</strong> ${escapeHtml(group.id)}</p>
      <p><strong>Release impact:</strong> ${escapeHtml(group.releaseImpact)}</p>
      <p><strong>Recommended fix:</strong> ${escapeHtml(group.recommendedFix)}</p>
      <p><strong>Replay:</strong> ${escapeHtml(group.replays.join('; ') || 'not recorded')}</p>
    </article>
  `).join('')}</div>`;
}

function groupFailureEvidence(failures = []) {
  const byClass = new Map();
  failures.forEach((failure) => {
    const id = failure.failureClass ?? failure.classId ?? failure.label ?? 'unknown_failure';
    const current = byClass.get(id) ?? {
      id,
      label: failure.label ?? id,
      domain: failure.domain ?? 'Unknown',
      severity: failure.severity ?? 'unknown',
      releaseImpact: failure.releaseImpact ?? 'Review required.',
      recommendedFix: failure.recommendedFix ?? failure.recommendedControl ?? 'Assign an owner and add a regression case.',
      scenarios: [],
      mutations: [],
      replays: [],
      count: 0,
    };
    current.count += 1;
    current.scenarios.push(failure.scenarioId);
    current.mutations.push(failure.mutationId);
    current.replays.push(replaySummary(failure));
    byClass.set(id, current);
  });
  return Array.from(byClass.values()).map((group) => ({
    ...group,
    scenarios: uniqueStrings(group.scenarios),
    mutations: uniqueStrings(group.mutations),
    replays: uniqueStrings(group.replays).filter((item) => item !== 'not recorded'),
  }));
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#039;');
}
