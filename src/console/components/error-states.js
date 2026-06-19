export function renderRouteErrorState(label = 'Route') {
  return `
    <section class="ha-page">
      <article class="ha-panel route-error-state" aria-live="polite">
        <span class="ha-badge ha-badge--critical">Unavailable</span>
        <h2>${escapeHtml(label)} unavailable</h2>
        <p>This view could not load. Refresh the page or open another console route.</p>
        <div class="ha-run-links"><a href="/dashboard">Dashboard</a><a href="/targets">Targets</a></div>
      </article>
    </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#039;');
}
