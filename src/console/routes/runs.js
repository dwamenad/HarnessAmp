import { readinessLabels } from '../lib/labels.js';
import { renderTargetReadinessSnapshot } from '../components/target-readiness.js';

export function renderRoute(route, context) {
  if (route.pathname === '/runs/new') return renderSaasNewRun(context);
  if (route.routeType === 'run-summary') return renderSaasRunSummary(route.runId, context);
  if (route.routeType === 'run-progress') return renderSaasRunProgress(route.runId, context);
  return renderSaasNewRun(context);
}

export function renderSaasNewRun(context) {
  const {
    consoleState,
    state,
    estimateRunSelection,
    escapeHtml,
    getConsoleHarnesses,
    renderBenchmarkAuthority,
    renderBenchmarkContents,
    renderCiSlug,
    renderDataSourceStrip,
    renderExpectedArtifacts,
    renderField,
    renderGatePreview,
    renderHarnessReadiness,
    renderLaunchStateCallout,
    renderPreflightChecklist,
    renderRunExecutionTargetStep,
    renderRunLaunchWorkflow,
    renderRunModeControl,
    renderRunTargetReadiness,
    renderRunUsageEstimate,
    renderSaasMetric,
    renderSelect,
    renderSelectFromObjects,
    runnablePackOptions,
    runEligibilityForBenchmark,
    runLaunchState,
    runPreflightItems,
    runTierOptions,
    selectedBenchmarkForDraft,
    benchmarkRunOptions,
  } = context;
  const draft = consoleState.runDraft;
  const harnesses = getConsoleHarnesses();
  const packOptions = runnablePackOptions();
  const selectedPack = packOptions.find((pack) => pack.id === draft.packId) ?? packOptions[0];
  const selectedTier = runTierOptions().find((tier) => tier.id === draft.tier) ?? runTierOptions()[0];
  const selectedBenchmark = selectedBenchmarkForDraft(draft);
  const estimated = estimateRunSelection(selectedPack, selectedTier);
  const selectedHarness = harnesses.find((harness) => harness.id === draft.harnessId) ?? harnesses[0];
  const eligibility = runEligibilityForBenchmark(selectedBenchmark, estimated);
  const preflight = runPreflightItems({ benchmark: selectedBenchmark, harness: selectedHarness, eligibility, draft });
  const launchState = runLaunchState({ benchmark: selectedBenchmark, harness: selectedHarness, eligibility, draft });
  return `
    <section class="ha-page">
      <div class="ha-section-head ha-section-head--launcher"><div><span class="ha-kicker">Agent Toolchain QA</span><h2>Create a release certification run</h2><p>Select the agent, confirm its toolchain, choose the gate, inject failures, and generate audit-ready release evidence.</p></div>${renderDataSourceStrip(state.sessionStatus === 'authenticated' ? 'Live project data' : 'Sample evidence only', state.sessionStatus === 'authenticated' ? 'Uses API-backed job queue.' : 'Sample evidence only - does not certify your real agent.')}</div>
      ${renderRunLaunchWorkflow()}
      <div class="ha-grid ha-grid--split">
        <form class="ha-panel ha-form" id="run-config-form">
          <section class="ha-run-step-section">
            <div class="ha-panel__head"><h3>Select agent and execution target</h3><span>${escapeHtml(draft.agentVersion || selectedHarness?.agentVersion || 'unknown-agent')}</span></div>
            ${renderSelectFromObjects('Agent / harness', harnesses.map((harness) => ({ value: harness.id, label: `${harness.name} / ${harness.environment}` })), selectedHarness?.id, 'run-harness-select')}
            ${renderField('Agent version', draft.agentVersion || selectedHarness?.agentVersion || 'unknown', 'run-agent-version')}
            ${renderRunExecutionTargetStep()}
          </section>
          <section class="ha-run-step-section">
            <div class="ha-panel__head"><h3>Release gate and failure profile</h3><span>${escapeHtml(selectedBenchmark?.slug ?? 'select gate')}</span></div>
          ${renderSelectFromObjects('Release gate', benchmarkRunOptions(), selectedBenchmark?.id ?? '', 'run-benchmark-select')}
          ${renderRunModeControl(draft.runMode)}
          ${renderBenchmarkAuthority(selectedBenchmark, selectedPack, selectedTier)}
          ${renderField('Max observations', String(draft.maxObservations), 'run-max-observations', 'number')}
          ${renderBenchmarkContents(selectedBenchmark)}
          </section>
          <section class="ha-run-step-section">
            <div class="ha-panel__head"><h3>Review preflight checklist</h3><span>before launch</span></div>
          <details class="ha-advanced-run">
            <summary>Advanced overrides</summary>
            ${renderSelectFromObjects('Gate family', packOptions.map((pack) => ({ value: pack.id, label: pack.name })), selectedPack?.id, 'run-pack-select')}
            ${renderSelectFromObjects('Coverage tier', runTierOptions().map((tier) => ({ value: tier.id, label: tier.label })), selectedTier.id, 'run-tier-select')}
            ${renderSelect('Fail condition', ['block on critical failures', 'block on high severity', 'block on score below threshold', 'never block'], draft.failCondition, 'run-fail-condition')}
          </details>
          ${renderLaunchStateCallout(launchState)}
          </section>
          <section class="ha-run-step-section">
            <div class="ha-panel__head"><h3>Targeted rerun</h3><span>trace-backed failures only</span></div>
            ${renderSelect('Rerun scope', ['Rerun release blockers', 'Rerun permission warnings', 'Rerun selected failure class', 'Rerun replayable regression cases from this report'], 'Rerun release blockers', 'run-rerun-scope')}
            <p class="ha-muted">Use trace provenance to rerun only failed scenarios, then classify outcomes as Fixed, Still failing, Newly failing, Regressed, or Not rerun.</p>
          </section>
          <div class="ha-form-actions">
            <button class="ha-primary" id="start-configured-run" type="button" ${launchState.canLaunch ? '' : 'disabled'}>${escapeHtml(launchState.actionLabel)}</button>
            <a class="ha-secondary" href="/targets">Manage targets</a>
            <a class="ha-secondary" href="/runs/${escapeHtml(consoleState.activeRunId || 'run-healthguard-2419')}">View active certification</a>
          </div>
          <p class="ha-form-feedback" id="run-config-feedback">${escapeHtml(consoleState.runFeedback)}</p>
        </form>
        <article class="ha-panel ha-estimate">
          <h3>Toolchain QA readiness</h3>
          ${renderSaasMetric('Release gate', selectedBenchmark ? `${selectedBenchmark.name} v${selectedBenchmark.version}` : 'Mapped from pack/tier', selectedBenchmark ? selectedBenchmark.slug : `${selectedPack.name} ${selectedTier.label}`, 'neutral')}
          ${renderSaasMetric('Release eligibility', eligibility.label, eligibility.detail, eligibility.tone)}
          ${renderSaasMetric('Estimated scenarios', estimated.scenarios, `${selectedPack.name} ${selectedTier.label}`, 'neutral')}
          ${renderSaasMetric('Estimated evaluated observations', estimated.observations, 'response x contract checks', 'neutral')}
          ${renderRunUsageEstimate({ estimated, draft })}
          ${renderPreflightChecklist(preflight)}
          ${renderRunTargetReadiness()}
          ${context.renderAgentHarnessPolicyPreview ? context.renderAgentHarnessPolicyPreview() : ''}
          ${renderGatePreview(selectedBenchmark)}
          ${renderHarnessReadiness(selectedHarness)}
          ${renderExpectedArtifacts()}
          ${renderCiSlug(selectedBenchmark)}
          <div class="ha-run-links">
            <a href="/failures">Open failure queue</a>
            <a href="/reports">Open reports</a>
          </div>
        </article>
      </div>
    </section>
  `;
}

export function renderSaasRunProgress(runId = 'run-healthguard-2419', context) {
  const {
    escapeHtml,
    lifecycleDisplayLabel,
    nextRunAction,
    renderBreakdownPanel,
    renderLifecycleRail,
    renderSaasMetric,
    runLifecycleLabel,
    runRecord,
  } = context;
  const run = runRecord(runId);
  const id = run.id;
  const status = run.status;
  const progress = run.progress ?? (status === 'queued' ? 8 : status === 'running' ? 58 : status === 'failed' ? 41 : 100);
  const statusText = runLifecycleLabel(run);
  const statusDisplay = lifecycleDisplayLabel(statusText);
  const jobMeta = run.jobId ? ` / Job ${run.jobId}` : '';
  return `
    <section class="ha-page">
      <div class="ha-section-head"><div><h2>${escapeHtml(run.name)}</h2><p>${escapeHtml(run.harness)} / ${escapeHtml(run.pack)} / ${escapeHtml(run.tierLabel)} / Started ${escapeHtml(run.started)}${escapeHtml(jobMeta)}. Certification status: ${escapeHtml(statusDisplay)}.</p></div><a class="ha-primary" href="/runs/${escapeHtml(id)}/summary">View evidence summary</a></div>
      ${renderLifecycleRail(statusText)}
      <div class="ha-metrics">
        ${renderSaasMetric('Certification status', statusDisplay, 'current state', status === 'completed' ? 'passed' : status === 'failed' ? 'critical' : 'warn')}
        ${renderSaasMetric('Progress', `${progress}%`, `${escapeHtml(run.observations)} observations evaluated`, status === 'completed' ? 'passed' : 'warn')}
        ${renderSaasMetric('Critical failures', run.critical, 'review required when nonzero', Number(run.critical) > 0 ? 'critical' : 'passed')}
        ${renderSaasMetric('Average latency', '1.84s', 'p95 3.1s', 'neutral')}
      </div>
      <article class="ha-panel ha-run-timeline" id="run-live-status" aria-live="polite">
        <div class="ha-meter"><span style="width: ${progress}%"></span></div>
        <ol>${run.timeline.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>
      </article>
      <div class="ha-grid ha-grid--split">
        ${renderBreakdownPanel('Failures by failure injection profile', [['prompt pressure', 8], ['context omission', 6], ['role confusion', 4], ['schema drift', 2]])}
        ${renderBreakdownPanel('Agent-tool contract failures', [['Escalate red flags', 4], ['Avoid diagnosis', 3], ['Preserve facts', 2], ['Minimize sensitive data', 1]])}
        <article class="ha-panel"><h3>Next action</h3><p>${escapeHtml(nextRunAction(run))}</p><div class="ha-run-links"><a href="/runs/${escapeHtml(id)}/summary">Evidence summary</a><a href="/failures">Failure queue</a><a href="/reports">Reports</a></div></article>
        <article class="ha-panel"><h3>Endpoint errors</h3><p>${status === 'failed' ? 'Endpoint validation failed.' : 'No hard failures.'}</p></article>
      </div>
    </section>
  `;
}

export function renderSaasRunSummary(runId = 'run-healthguard-2419', context) {
  const {
    benchmarkForRun,
    benchmarkGateForRun,
    escapeHtml,
    getRunReportState,
    listRealReports,
    localRunReportId,
    productionEvidenceForRun,
    renderFailureTriagePanel,
    renderFailuresTable,
    renderGovernanceList,
    renderHistoricalComparisonPanel,
    renderReleaseDecision,
    renderSaasMetric,
    renderTargetReliabilityReportPanel,
    reportPayload,
    runLifecycleLabel,
    runRecord,
    targetReliabilityContextForRun,
  } = context;
  const run = runRecord(runId);
  const benchmark = benchmarkForRun(run);
  const runReportState = getRunReportState();
  const report = reportPayload(localRunReportId(run)) ?? listRealReports(runReportState).find((item) => item.runId === run.id);
  const evidence = report?.productionEvidence ?? productionEvidenceForRun(run, report);
  const releaseGate = evidence.releaseGate;
  const targetReliability = report?.targetReliability ?? targetReliabilityContextForRun(run);
  const lifecycle = report?.lifecycleSummary ?? { summary: run.timeline?.join(' -> ') ?? runLifecycleLabel(run), status: run.status };
  const benchmarkScore = report?.benchmark?.score ?? run.score;
  const gateResult = report?.releaseGate?.status ?? report?.benchmark?.gateResult ?? benchmarkGateForRun(run);
  const runType = report?.benchmark?.benchmarkRunType ?? report?.benchmark?.runType ?? run.runMode ?? 'seeded sample';
  const snapshot = report?.benchmark?.benchmarkSnapshot ?? report?.benchmark?.snapshot ?? null;
  const scoreTone = Number(run.critical) > 0 ? 'major' : 'passed';
  return `
    <section class="ha-page">
      <div class="ha-section-head"><div><span class="ha-kicker">Release certification evidence</span><h2>${escapeHtml(run.name)} evidence summary</h2><p>${escapeHtml(run.harness)} / ${escapeHtml(benchmark ? `${benchmark.name} v${benchmark.version}` : run.pack)} / ${escapeHtml(run.tierLabel)}</p></div><div class="ha-topbar__actions"><a class="ha-primary" href="/failures/fail-redflag-017">View top blocker</a><a href="/reports">Open evidence library</a></div></div>
      ${renderReleaseDecision(releaseGate?.answer ?? (Number(run.critical) > 0 || run.status === 'failed' ? 'Can this agent be released? No.' : 'Can this agent be released? Yes.'), releaseGate?.reasons?.join(' ') ?? (Number(run.critical) > 0 ? `${run.critical} critical failure(s) must be triaged and pinned before release.` : 'No critical release blockers in this run.'), releaseGate?.canRelease === false ? 'critical' : releaseGate?.warningCount ? 'major' : Number(run.critical) > 0 ? 'critical' : 'passed')}
      <div class="ha-metrics">
        ${renderSaasMetric('Certification score', String(benchmarkScore), benchmark ? `${benchmark.slug} gate ${gateResult}` : 'mapped from run', scoreTone)}
        ${renderSaasMetric('Release verdict', String(releaseGate?.verdict ?? gateResult).toUpperCase(), releaseGate ? `${releaseGate.blockingFailures} blockers / ${releaseGate.warningCount} warnings` : 'not recorded', releaseGate?.canRelease === false || gateResult === 'block' ? 'critical' : releaseGate?.warningCount || gateResult === 'warn' ? 'major' : 'passed')}
        ${renderSaasMetric('Evidence type', runType, snapshot ? `scenario set ${snapshot.scenarioSetVersion}` : 'sample or seeded context', runType === 'official' ? 'passed' : 'major')}
        ${renderSaasMetric('Critical Failures', run.critical, 'review required when nonzero', Number(run.critical) > 0 ? 'critical' : 'passed')}
        ${renderSaasMetric('Target Readiness', targetReliability.readinessStatus, targetReliability.validationState, targetReliability.readinessStatus === readinessLabels.healthy || targetReliability.readinessStatus === 'Production-grade' ? 'passed' : targetReliability.readinessStatus === readinessLabels.needsValidation || targetReliability.readinessStatus === readinessLabels.ephemeral ? 'warn' : 'critical')}
        ${renderSaasMetric('Run Success', targetReliability.runSuccessRate, 'same target context', scoreTone)}
      </div>
      <article class="ha-panel ha-panel--wide">
        <div class="ha-panel__head"><h3>Toolchain release verdict</h3><span>${escapeHtml(releaseGate?.verdict ?? String(gateResult))}</span></div>
        ${renderGovernanceList([
          ['Can release', releaseGate?.canRelease ? 'yes' : 'no'],
          ['Blocking failures', String(releaseGate?.blockingFailures ?? Number(run.critical) ?? 0)],
          ['Warnings', String(releaseGate?.warningCount ?? 0)],
          ['Target used', targetReliability.targetUsed],
          ['Validation state at run time', targetReliability.validationState],
          ['Release gate/version', benchmark ? `${benchmark.name} v${benchmark.version}` : 'not recorded'],
          ['Scoring profile', report?.benchmark?.scoringProfileVersion ?? snapshot?.scoringProfileVersion ?? 'not recorded'],
          ['Gate profile', report?.benchmark?.gateProfileVersion ?? snapshot?.gateProfileVersion ?? 'not recorded'],
          ['Lifecycle summary', lifecycle.summary],
        ])}
        <ul class="ha-compact-list">${(releaseGate?.reasons ?? ['Release gate derived from current run score and critical failures.']).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>
      </article>
      <div class="ha-grid ha-grid--dashboard">
        ${renderTargetReadinessSnapshot(evidence, { compact: true })}
        ${context.renderFailureIntelligencePanel ? context.renderFailureIntelligencePanel(report) : ''}
        ${renderFailureTriagePanel(report)}
        ${renderTargetReliabilityReportPanel(targetReliability)}
        ${renderHistoricalComparisonPanel(report)}
        <article class="ha-panel"><h3>Release evidence artifacts</h3>${renderGovernanceList([['Report', 'Toolchain evidence JSON, audit CSV, Markdown'], ['Failure corpus', 'Replayable regression cases available'], ['Audit', 'Owner/status actions persisted']])}<div class="ha-run-links"><a href="/reports">Evidence report</a><a href="/failures">Failure queue</a><a href="/compare">Compare run</a></div></article>
        <article class="ha-panel ha-panel--wide"><div class="ha-panel__head"><h3>Release blocker list</h3><span>${escapeHtml(run.observations)} observations</span></div>${renderFailuresTable()}</article>
      </div>
    </section>
  `;
}
