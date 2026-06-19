export function renderRouteLoadingState(label = 'Route') {
  return `
    <section class="ha-page">
      <article class="ha-panel route-loading-state" aria-live="polite">
        <span class="ha-badge ha-badge--neutral">Loading</span>
        <h2>Loading ${escapeHtml(label)}</h2>
        <p>Preparing this console view.</p>
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
