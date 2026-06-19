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
  } = context;
  const filters = consoleState.failureFilters;
  const failures = filteredFailures();
  const suites = regressionSuitesWithFailures();
  const views = consoleState.savedFailureViews;
  return `
    <section class="ha-page">
      <div class="ha-section-head"><div><h2>Failure Queue</h2><p>Filter failures, assign owners, resolve false positives, and pin regression cases.</p></div><a class="ha-primary" href="/failures/fail-redflag-017">Open top failure</a></div>
      ${renderNextActions([
        ['Assign owner', '/failures/fail-redflag-017', 'Route the top critical failure'],
        ['Add regression', '/failures/fail-redflag-017', 'Pin reproducible evidence'],
        ['Rerun case', '/failures/fail-redflag-017', 'Verify after remediation'],
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
