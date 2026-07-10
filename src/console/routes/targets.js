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
  const contractMismatchTargets = targets.filter((target) => target.evidence.target.hasContractMismatch);
  const primaryEvidence = context.primaryTargetEvidence(targets);
  return `
    <section class="ha-page">
      <div class="ha-section-head">
        <div><span class="ha-kicker">Agent Toolchain QA</span><h2>Toolchain Readiness</h2><p>Release certification starts here: confirm production-capable execution targets, permission boundaries, trace capture, and replay evidence before agents touch real systems.</p></div>
        <div class="ha-run-links"><a class="ha-primary" href="/runs/new">Start certification run</a><a href="/docs/adapters/adapter-contract">Agent-tool contract</a></div>
      </div>
      <div class="ha-metrics ha-metrics--priority">
        ${context.renderSaasMetric('Certified', String(productionTargets.length), 'validated production-capable toolchains', 'passed')}
        ${context.renderSaasMetric('Needs validation', String(targets.length - productionTargets.length - failingTargets.length), 'schema, auth, permission, and trace checks pending', 'major')}
        ${context.renderSaasMetric('Unsafe for release', String(failingTargets.length), 'failure class present', failingTargets.length ? 'critical' : 'passed')}
        ${context.renderSaasMetric('Not certifiable', String(ephemeralTargets.length), 'local tunnels and fixture targets stay non-production evidence', ephemeralTargets.length ? 'warn' : 'neutral')}
        ${context.renderSaasMetric('Contract mismatch', String(contractMismatchTargets.length), 'expected vs observed version drift', contractMismatchTargets.length ? 'critical' : 'passed')}
      </div>
      ${renderTargetReadinessSnapshot(primaryEvidence)}
      ${context.renderToolContractDoctorPanel ? context.renderToolContractDoctorPanel(primaryEvidence.target) : ''}
      <div class="target-registry">
        ${targets.map(context.renderExecutionTargetCard).join('')}
      </div>
      <article class="ha-panel ha-panel--wide">
        <div class="ha-panel__head"><h3>Tool contract validation controls</h3><span>safe diagnostics only</span></div>
        <p class="ha-section-note">Validate reachability, tokens, JSON, contract version, scenario mapping, failure handling, and private-network blocking before release certification.</p>
        ${context.renderEndpointValidationPanel()}
      </article>
    </section>
  `;
}
