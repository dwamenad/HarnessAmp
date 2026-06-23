export function renderRoute(route, context) {
  if (route.routeType === 'failure') return renderSaasFailureDetail(route.failureId, context);
  return renderSaasFailuresList(context);
}

export function renderSaasFailuresList(context) {
  const {
    consoleState,
    escapeHtml,
    filteredFailures,
    regressionSuitesWithFailures,
    renderEmptyState,
    renderFailuresTable,
    renderNextActions,
    renderRegressionSuiteCard,
    renderSelect,
    renderSelectFromObjects,
    supportQualityLoopSummary,
  } = context;
  const filters = consoleState.failureFilters;
  const failures = filteredFailures();
  const suites = regressionSuitesWithFailures();
  const views = consoleState.savedFailureViews;
  const supportLoop = supportQualityLoopSummary();
  return `
    <section class="ha-page">
      <div class="ha-section-head"><div><h2>Failure Queue</h2><p>Filter failures, assign owners, resolve false positives, and pin regression cases.</p></div><a class="ha-primary" href="/failures/fail-redflag-017">Open top failure</a></div>
      <article class="ha-panel ha-panel--wide ha-support-loop">
        <div class="ha-panel__head">
          <h3>Support quality loop</h3>
          <span class="ha-badge ${supportLoop.status === 'blocked' ? 'ha-badge--critical' : 'ha-badge--major'}">${escapeHtml(supportLoop.status)}</span>
        </div>
        <p>${escapeHtml(supportLoop.summary)}</p>
        <div class="ha-loop-grid">
          <div><span>Imported inputs</span><strong>${escapeHtml(String(supportLoop.importedInputs.total))}</strong><small>${escapeHtml(supportLoop.importedInputs.sources.join(', '))}</small></div>
          <div><span>Failure patterns</span><strong>${escapeHtml(String(supportLoop.failurePatterns.length))}</strong><small>${escapeHtml(supportLoop.failurePatterns.map((item) => item.label).join(', ') || 'none')}</small></div>
          <div><span>Generated cases</span><strong>${escapeHtml(String(supportLoop.generatedEvalCases.length))}</strong><small>${escapeHtml(supportLoop.generatedEvalCases.slice(0, 2).map((item) => item.id).join(', ') || 'none')}</small></div>
          <div><span>Instruction risks</span><strong>${escapeHtml(String(supportLoop.instructionStackRisks.length))}</strong><small>${escapeHtml(supportLoop.instructionStackRisks.map((item) => item.label).join(', ') || 'none')}</small></div>
        </div>
      </article>
      ${renderNextActions([
        ['Open support blocker', '/failures/fail-support-mfa-031', 'Review account-action failure'],
        ['Add regression', '/failures/fail-support-refund-044', 'Pin reproducible evidence as a generated support regression case'],
        ['Rerun case', '/runs/new', 'Verify policy and instruction fixes'],
      ])}
      <article class="ha-panel ha-filter-bar">
        ${renderSelectFromObjects('Saved view', views.map((view) => ({ value: view.id, label: view.name })), consoleState.savedFailureViewId, 'failure-saved-view-select')}
        <label><span>Search</span><input id="failure-search" type="search" value="${escapeHtml(filters.search)}" placeholder="contract, mutation, scenario, owner" /></label>
        ${renderSelect('Severity', ['All', 'Critical', 'Major', 'Minor'], filters.severity, 'failure-filter-severity')}
        ${renderSelect('Status', ['All', 'New', 'Assigned', 'In Progress', 'False positive', 'Regression pinned', 'Resolved'], filters.status, 'failure-filter-status')}
        ${renderSelect('Owner', ['All', 'Safety Review', 'Clinical Safety', 'Knowledge Review', 'Privacy Review', 'Compliance Review'], filters.owner, 'failure-filter-owner')}
        <button id="failure-save-view" type="button">Save current view</button>
        <button id="failure-clear-filters" type="button">Clear filters</button>
      </article>
      <article class="ha-panel">
        <div class="ha-panel__head"><h3>Open failures</h3><span>${failures.length} shown</span></div>
        ${failures.length ? renderFailuresTable(failures) : renderEmptyState('No failures match the current filters.', 'Clear filters or start a new run to refresh the queue.', '/runs/new', 'Start run')}
      </article>
      <article class="ha-panel ha-panel--wide">
        <div class="ha-panel__head"><h3>Regression suites</h3><span>${suites.reduce((count, suite) => count + suite.failures.length, 0)} pinned cases</span></div>
        <div class="ha-suite-grid">${suites.map(renderRegressionSuiteCard).join('')}</div>
      </article>
    </section>
  `;
}

export function renderSaasFailureDetail(failureId = 'fail-redflag-017', context) {
  const {
    allFailureRows,
    consoleState,
    escapeHtml,
    failureFixGuidance,
    failurePayload,
    readLocalFailureWorkflow,
    regressionSuiteOptions,
    renderFailureAuditTrail,
    renderReleaseDecision,
    renderSelect,
    renderSelectFromObjects,
    saasFailureDetails,
    severityClass,
  } = context;
  const [severity, contract, mutation, scenario, status, owner, reproducibility, id] = allFailureRows().find((failure) => failure[7] === failureId) ?? allFailureRows()[0];
  const savedWorkflow = readLocalFailureWorkflow(id);
  const currentSeverity = savedWorkflow?.severity ?? severity;
  const currentStatus = savedWorkflow?.status ?? status;
  const currentOwner = savedWorkflow?.owner ?? owner;
  const payload = failurePayload(id);
  const detail = payload ?? saasFailureDetails[id] ?? saasFailureDetails['fail-redflag-017'];
  const guidance = failureFixGuidance(payload);
  return `
    <section class="ha-page">
      <div class="ha-failure-header">
        <div><span id="failure-severity" class="ha-badge ${severityClass(currentSeverity)}">${escapeHtml(currentSeverity)}</span><h2>${escapeHtml(contract)}</h2><p>Mutation family: ${escapeHtml(mutation)} / Scenario: ${escapeHtml(scenario)} / Status: <span id="failure-status">${escapeHtml(currentStatus)}</span> / Owner: <span id="failure-owner">${escapeHtml(currentOwner)}</span></p></div>
        <div class="ha-topbar__actions">
          <button id="failure-assign-owner" data-failure-action="assign-owner" data-failure-id="${escapeHtml(id)}" type="button">Assign owner</button>
          <button id="failure-rerun-case" data-failure-action="rerun-case" data-failure-id="${escapeHtml(id)}" type="button">Rerun this case</button>
          <button id="failure-export" data-failure-action="export-failure" data-failure-id="${escapeHtml(id)}" type="button">Export failure</button>
        </div>
      </div>
      ${renderReleaseDecision(currentSeverity === 'Critical' ? 'Block release' : 'Release with review', `${currentSeverity} failure in ${contract}; owner ${currentOwner}; status ${currentStatus}.`, currentSeverity === 'Critical' ? 'critical' : 'major')}
      <article class="ha-panel ha-failure-status" id="failure-action-status" aria-live="polite">
        <div>
          <strong id="failure-action-title">Workflow ready</strong>
          <span id="failure-action-message">Choose an action.</span>
        </div>
        <ol id="failure-action-log" class="ha-action-log">
          <li>No workflow actions recorded yet.</li>
        </ol>
      </article>
      <article class="ha-panel ha-panel--wide">
        <div class="ha-panel__head"><h3>Audit trail</h3><span>tamper-evident workflow log</span></div>
        ${renderFailureAuditTrail(id, currentStatus, currentOwner, currentSeverity)}
      </article>
      <div class="ha-grid ha-grid--evidence">
        <article class="ha-panel ha-evidence">
          <h3>Expected behavior</h3><p>${escapeHtml(detail.expected)}</p>
          <h3>Observed behavior</h3><p>${escapeHtml(detail.observed)}</p>
          <h3>Why this matters</h3><p>${escapeHtml(detail.why)}</p>
          <h3>Reproducibility</h3><p>${escapeHtml(reproducibility)} across recent reruns.</p>
          <h3>Owner</h3><p>${escapeHtml(payload?.recommendedOwner ?? 'Safety Review')}</p>
        </article>
        <article class="ha-panel ha-evidence">
          <h3>Original scenario</h3><pre>${escapeHtml(detail.original)}</pre>
          <h3>Mutated scenario</h3><pre>${escapeHtml(detail.mutated)}</pre>
          <h3>Agent input</h3><pre>${escapeHtml(JSON.stringify({ scenario_id: scenario, mutation_id: mutation, failure_id: id, run_id: payload?.runId, report_id: payload?.reportId }, null, 2))}</pre>
          <h3>Agent output</h3><pre>${escapeHtml(detail.output)}</pre>
        </article>
        <article class="ha-panel ha-evidence">
          <h3>Tool calls</h3><p>No tool calls.</p>
          <h3>Retrieved context</h3><p>${escapeHtml(detail.context)}</p>
          <h3>Evaluator reasoning</h3><p>${escapeHtml(detail.reasoning)}</p>
          <h3>Contract clause</h3><p>${escapeHtml(detail.clause)}</p>
          <h3>Auditability</h3><p>Owner, status, severity, comments, reruns, and regression-suite pinning are recorded in the workflow log.</p>
        </article>
        ${renderTraceProvenance(detail, escapeHtml)}
        <article class="ha-panel ha-fix-guidance">
          <div class="ha-panel__head"><h3>Fix guidance</h3><button id="copy-fix-checklist" data-failure-id="${escapeHtml(id)}" type="button">Copy checklist</button></div>
          <div class="ha-guidance-block"><span>Likely root cause</span><p>${escapeHtml(guidance.rootCause)}</p></div>
          <div class="ha-guidance-block"><span>Suggested control fix</span><p>${escapeHtml(guidance.controlFix)}</p></div>
          <div class="ha-guidance-block"><span>Regression test</span><p>${escapeHtml(guidance.regressionTest)}</p></div>
          <ol>${guidance.checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>
        </article>
        <article class="ha-panel ha-actions">
          <h3>Actions</h3>
          <div class="ha-triage-controls">
            ${renderSelect('Assignee', ['Safety Review', 'Clinical Safety', 'Knowledge Review', 'Privacy Review', 'Compliance Review'], currentOwner, 'failure-owner-select')}
            ${renderSelect('Severity', ['Critical', 'Major', 'Minor'], currentSeverity, 'failure-severity-select')}
            ${renderSelectFromObjects('Regression suite', regressionSuiteOptions(), consoleState.selectedRegressionSuiteId, 'failure-regression-suite-select')}
            <label><span>Comment</span><textarea id="failure-comment" rows="3" placeholder="Add reviewer note"></textarea></label>
          </div>
          ${[
            ['create-task', 'Create task'],
            ['assign-owner', 'Assign owner'],
            ['false-positive', 'Mark false positive'],
            ['change-severity', 'Change severity'],
            ['add-comment', 'Add comment'],
            ['rerun-case', 'Rerun this case'],
            ['add-regression', 'Add to regression suite'],
            ['export-failure', 'Export failure'],
          ].map(([action, item]) => `<button data-failure-action="${action}" data-failure-id="${escapeHtml(id)}" type="button">${item}</button>`).join('')}
        </article>
      </div>
    </section>
  `;
}

function renderTraceProvenance(detail, escapeHtml) {
  const traceEvidence = detail.traceEvidence ?? {};
  const events = Array.isArray(traceEvidence.keyTraceEvents) ? traceEvidence.keyTraceEvents : [];
  const toolCalls = Array.isArray(detail.toolCalls) ? detail.toolCalls : traceEvidence.toolCalls ?? [];
  const retrieved = Array.isArray(detail.retrievedEvidence) ? detail.retrievedEvidence : traceEvidence.retrievedEvidence ?? [];
  return `
    <article class="ha-panel ha-trace-provenance">
      <div class="ha-panel__head"><h3>Trace provenance</h3><span>${escapeHtml(traceEvidence.traceId ?? 'trace not recorded')}</span></div>
      <div class="ha-trace-origin">
        <div><span>Origin</span><strong>${escapeHtml(detail.failureOrigin ?? traceEvidence.origin ?? 'unknown')}</strong></div>
        <div><span>Replay</span><strong>${escapeHtml(traceEvidence.replayStatus ?? 'not recorded')}</strong></div>
        <div><span>Regression</span><strong>${escapeHtml(detail.regressionStatus ?? traceEvidence.regressionStatus ?? 'candidate')}</strong></div>
      </div>
      <ol class="ha-trace-timeline">
        ${events.length ? events.map((event) => `<li><span>${escapeHtml(event.eventType)}</span><p>${escapeHtml(event.label)}</p><small>${escapeHtml(event.status ?? '')}</small></li>`).join('') : '<li><span>trace</span><p>No trace events recorded for this failure yet.</p><small>not recorded</small></li>'}
      </ol>
      <h3>Failure origin</h3>
      <p>${escapeHtml(provenanceLabel(detail.failureOrigin ?? traceEvidence.origin))}</p>
      <h3>Tool and retrieval evidence</h3>
      <p>${escapeHtml(toolCalls.length ? toolCalls.map((tool) => `${tool.name}:${tool.status}`).join(', ') : 'No tool calls recorded.')}</p>
      <p>${escapeHtml(retrieved.length ? retrieved.join(', ') : 'No retrieved evidence recorded.')}</p>
      <h3>Promotion candidate</h3>
      <pre>${escapeHtml(JSON.stringify(detail.regressionCase ?? traceEvidence.regressionCase ?? {}, null, 2))}</pre>
    </article>
  `;
}

function provenanceLabel(origin = 'unknown') {
  const labels = {
    model_behavior: 'Model behavior produced the release-blocking answer.',
    retrieval: 'Failure originated in retrieved evidence, source selection, or citation mismatch.',
    tool_use: 'Failure originated in tool call choice, arguments, or tool result handling.',
    policy_boundary: 'Failure originated in a missed policy, authority, privacy, or safety boundary.',
    adapter_contract: 'Failure originated in adapter response shape or contract mismatch.',
    execution_target: 'Failure originated in endpoint latency, timeout, or target readiness.',
    worker_lifecycle: 'Failure originated in queue, worker claim, retry, or lifecycle state.',
    evaluator: 'Failure originated in evaluator judgment or classification.',
    unknown: 'Origin has not been classified yet.',
  };
  return labels[origin] ?? labels.unknown;
}
