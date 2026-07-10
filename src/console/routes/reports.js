export function renderRoute(route, context) {
  return renderSaasReports(route, context);
}

export function renderSaasReports(_route, context) {
  const reportRows = context.reportTableRows();
  return `
    <section class="ha-page">
      <div class="ha-section-head"><div><span class="ha-kicker">Toolchain Release Evidence</span><h2>Toolchain Release Evidence Reports</h2><p>Can this agent be released? Review blockers, permission warnings, unsafe action failures, grounding failures, replay cases, and trace coverage.</p></div>${context.renderDataSourceStrip('Local preview', 'Real local reports appear before seeded samples.')}</div>
      ${context.renderNextActions([
        ['Export release evidence JSON', '#reports-table', 'Share release decision and failure evidence'],
        ['Export audit CSV', '#reports-table', 'Review blockers and permission warnings'],
        ['Create CI gate', '/ci', 'Use report thresholds in pull requests'],
        ['Compare latest run', '/compare', 'Inspect regressions against baseline'],
      ])}
      <article class="ha-panel ha-report-status" id="report-export-status" aria-live="polite">
        <strong>Audit-ready evidence exports</strong>
        <span>Seeded sample rows stay labeled. Choose release evidence JSON, audit CSV, Markdown evidence report, or print release certificate.</span>
      </article>
      ${context.renderReportEvidenceLibrary(reportRows)}
    </section>
  `;
}
