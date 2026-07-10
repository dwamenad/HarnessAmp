export function renderRoute(_route, context) {
  const snapshot = context.changeImpactSnapshot();
  const { summary, changes, dependencyNodes } = snapshot;
  const escapeHtml = context.escapeHtml;

  return `
    <section class="ha-page ha-page--changes">
      <div class="ha-change-hero">
        <div>
          <span class="ha-kicker">Change intelligence</span>
          <h2>What breaks when a tool changes?</h2>
          <p>HarnessAmp maps API, MCP, schema, and policy changes to the agent workflows that depend on them, then runs only the checks that matter.</p>
        </div>
        <div class="ha-change-hero__actions">
          <a class="ha-action-primary" href="/runs/new">Run targeted checks</a>
          <a class="ha-action-secondary" href="/contracts">Browse contracts</a>
        </div>
      </div>

      <div class="ha-impact-stats" aria-label="Change impact summary">
        ${stat('Open changes', summary.totalChanges, 'connected tool versions', 'neutral')}
        ${stat('Release blockers', summary.blockingChanges, 'contract changes with broken paths', summary.blockingChanges ? 'critical' : 'passed')}
        ${stat('Agents affected', summary.affectedAgents, `${summary.affectedWorkflows} workflows in scope`, 'major')}
        ${stat('Targeted checks', summary.failedChecks + 8, 'derived from changed boundaries', 'neutral')}
      </div>

      <div class="ha-change-layout">
        <section class="ha-change-stream">
          <div class="ha-panel__head"><div><span class="ha-kicker">Incoming changes</span><h3>Review before the agent release</h3></div><span class="ha-live-indicator"><i></i> Watching main</span></div>
          <div class="ha-change-list">
            ${changes.map((change, index) => renderChange(change, index === 0, escapeHtml)).join('')}
          </div>
        </section>
        <aside class="ha-impact-graph">
          <div class="ha-panel__head"><div><span class="ha-kicker">Dependency map</span><h3>Blast radius</h3></div><span>${summary.affectedWorkflows} paths</span></div>
          <div class="ha-node-canvas">
            <div class="ha-node ha-node--root"><span>Tool change</span><strong>payments-mcp</strong><small>v2.8.0</small></div>
            <div class="ha-node-links" aria-hidden="true"><i></i><i></i><i></i></div>
            <div class="ha-node-stack">
              ${dependencyNodes.slice(0, 3).map((node) => `<div class="ha-node ha-node--agent is-${escapeHtml(node.status)}"><span>${escapeHtml(node.workflow)}</span><strong>${escapeHtml(node.agent)}</strong><small>${escapeHtml(node.status === 'broken' ? 'requires a fix' : node.status === 'review' ? 'needs review' : 'compatible')}</small></div>`).join('')}
            </div>
          </div>
          <p class="ha-panel-note">The graph is derived from registered tool contracts and replayable workflow traces.</p>
        </aside>
      </div>
    </section>
  `;
}

function renderChange(change, isExpanded, escapeHtml) {
  const statusLabel = change.status === 'blocking' ? 'Release blocked' : change.status === 'review' ? 'Needs review' : 'Compatible';
  return `
    <details class="ha-change-card is-${escapeHtml(change.status)}" ${isExpanded ? 'open' : ''}>
      <summary>
        <span class="ha-change-card__status">${escapeHtml(statusLabel)}</span>
        <div><strong>${escapeHtml(change.title)}</strong><p>${escapeHtml(change.source)} · ${escapeHtml(change.changedAt)}</p></div>
        <span class="ha-change-card__count">${change.agents.length} ${change.agents.length === 1 ? 'agent' : 'agents'}</span>
      </summary>
      <div class="ha-change-card__body">
        <p>${escapeHtml(change.summary)}</p>
        <div class="ha-contract-diff">
          <pre><span>Before</span>${escapeHtml(change.before)}</pre>
          <pre><span>After</span>${escapeHtml(change.after)}</pre>
        </div>
        <div class="ha-check-table">
          ${change.checks.map(([name, status, detail]) => `<div><span class="is-${escapeHtml(status)}">${escapeHtml(status)}</span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(detail)}</small></div>`).join('')}
        </div>
        <div class="ha-change-card__footer">
          <span>${escapeHtml(change.surface)}</span>
          <a href="/runs/new">Run affected workflows</a>
        </div>
      </div>
    </details>
  `;
}

function stat(label, value, detail, tone) {
  return `<article class="ha-impact-stat ha-impact-stat--${tone}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`;
}

