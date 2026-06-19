export function renderTargetReadinessSnapshot(evidence, { compact = false } = {}) {
  const target = evidence?.target ?? {};
  const gate = evidence?.releaseGate ?? {};
  const blockers = gate.blockingReasons ?? gate.reasons ?? [];
  const warnings = gate.warnings ?? [];
  return `
    <article class="ha-panel target-readiness-snapshot ${compact ? 'target-readiness-snapshot--compact' : ''}">
      <div class="ha-panel__head">
        <h3>Target readiness</h3>
        <span class="ha-badge ${badgeClass(target.readinessLabel)}">${escapeHtml(target.readinessLabel ?? 'Needs validation')}</span>
      </div>
      <div class="target-readiness-snapshot__grid">
        ${snapshotItem('Mode', evidence?.modeLabel ?? 'Sample workspace')}
        ${snapshotItem('Source', evidence?.sourceLabel ?? 'Sample data')}
        ${snapshotItem('Target', target.name ?? 'not recorded')}
        ${snapshotItem('Type', target.typeLabel ?? 'not recorded')}
        ${snapshotItem('Grade', target.isProductionGrade ? 'Production-grade' : target.isEphemeral ? 'Local preview / Ephemeral' : 'Needs validation')}
        ${snapshotItem('Validation', target.validationStatus ?? 'pending')}
        ${snapshotItem('Last pass', target.lastSuccessfulRunAt ?? target.lastPass ?? 'none')}
        ${snapshotItem('Failure class', target.lastFailureClass ?? 'none')}
        ${snapshotItem('Contract', target.hasContractMismatch ? 'Contract mismatch' : target.contractVersion ?? 'unknown')}
        ${snapshotItem('Release gate', gate.label ?? 'Not release evidence')}
      </div>
      ${blockers.length || warnings.length ? `<ul class="ha-compact-list">${[...blockers, ...warnings].slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
      <div class="ha-run-links"><a href="/targets">Review readiness</a><a href="/runs/new">Run release gate</a></div>
    </article>
  `;
}

export function renderProductionEvidenceBadge(evidence) {
  return `<span class="ha-badge ${badgeClass(evidence?.releaseGate?.label ?? evidence?.modeLabel)}">${escapeHtml(evidence?.releaseGate?.label ?? evidence?.modeLabel ?? 'Sample workspace')}</span>`;
}

function snapshotItem(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function badgeClass(value) {
  const text = String(value ?? '').toLowerCase();
  if (/blocked|failing|mismatch|failed|not release/u.test(text)) return 'ha-badge--critical';
  if (/warning|needs|ephemeral|local preview|pending/u.test(text)) return 'ha-badge--major';
  if (/healthy|eligible|production run|real execution|production-grade|passed/u.test(text)) return 'ha-badge--passed';
  return 'ha-badge--neutral';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#039;');
}
