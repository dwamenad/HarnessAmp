export function renderRoute(route, context) {
  return renderSaasReports(route, context);
}

export function renderSaasReports(_route, context) {
  const reportRows = context.reportTableRows();
  return `
    <section class="ha-page">
      <div class="ha-section-head"><div><h2>Run reports</h2><p>Pass/fail gates, robustness gap, failed contracts, mutation failures, and reproducible diagnostics.</p></div>${context.renderDataSourceStrip('Local preview', 'Real local reports appear before seeded samples.')}</div>
      ${context.renderNextActions([
        ['Export executive report', '#reports-table', 'Share release decision and failure evidence'],
        ['Create CI gate', '/ci', 'Use report thresholds in pull requests'],
        ['Compare latest run', '/compare', 'Inspect regressions against baseline'],
      ])}
      <article class="ha-panel ha-report-status" id="report-export-status" aria-live="polite">
        <strong>Exports ready</strong>
        <span>Seeded sample rows stay labeled. Choose a format for review.</span>
      </article>
      <article class="ha-panel" id="reports-table">${context.renderReportsTable(reportRows)}</article>
    </section>
  `;
}
