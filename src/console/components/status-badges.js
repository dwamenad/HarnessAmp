export function renderStatusBadge(label, className = 'ha-badge--neutral') {
  return `<span class="ha-badge ${escapeHtml(className)}">${escapeHtml(label)}</span>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#039;');
}
