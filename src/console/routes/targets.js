import { readinessLabels } from '../lib/labels.js';
import { renderTargetReadinessSnapshot } from '../components/target-readiness.js';

export function renderRoute(route, context) {
  return renderExecutionTargets(route, context);
}

export function renderExecutionTargets(_route, context) {
  const targets = context.executionTargetRegistryRows();
  const productionTargets = targets.filter((target) => target.evidence.target.isProductionGrade && target.evidence.target.readinessLabel === readinessLabels.healthy);
  const ephemeralTargets = targets.filter((target) => target.ephemeral);
  const failingTargets = targets.filter((target) => target.failureClass && target.failureClass !== 'none');
  const primaryEvidence = context.primaryTargetEvidence(targets);
  return `
    <section class="ha-page">
      <div class="ha-section-head">
        <div><h2>Execution Targets</h2><p>Canonical readiness surface for release evidence.</p></div>
        <div class="ha-run-links"><a class="ha-primary" href="/runs/new">Start run</a><a href="/docs/adapters/adapter-contract">Adapter contract</a></div>
      </div>
      <div class="ha-metrics ha-metrics--priority">
        ${context.renderSaasMetric('Targets', String(targets.length), `${productionTargets.length} validated production-grade`, 'neutral')}
        ${context.renderSaasMetric('Local preview', String(ephemeralTargets.length), 'ephemeral, not release evidence', ephemeralTargets.length ? 'warn' : 'neutral')}
        ${context.renderSaasMetric('Attention', String(failingTargets.length), 'failure class present', failingTargets.length ? 'critical' : 'passed')}
      </div>
      ${renderTargetReadinessSnapshot(primaryEvidence)}
      <div class="target-registry">
        ${targets.map(context.renderExecutionTargetCard).join('')}
      </div>
      <article class="ha-panel ha-panel--wide">
        <div class="ha-panel__head"><h3>Validation controls</h3><span>safe diagnostics only</span></div>
        <p class="ha-section-note">Validate reachability, tokens, JSON, contract version, scenario mapping, and private-network blocking before enqueueing real runs.</p>
        ${context.renderEndpointValidationPanel()}
      </article>
    </section>
  `;
}
