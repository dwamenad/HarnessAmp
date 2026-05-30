import { runFinanceGuardDemoAgent } from './demo-agents/financeguard-agent.js';
import { runHealthGuardDemoAgent } from './demo-agents/healthguard-agent.js';
import { checkContracts } from './contract-checkers.js';
import { buildRunReport } from './reporters.js';
import { diffTraces } from './trace-diff.js';
import { getV2Pack } from './packs/index.js';

export async function runV2Scenario(scenario, options = {}) {
  const pack = getV2Pack(options.packName ?? 'financeguard-core');
  const failOn = options.failOn ?? 'critical';
  const baselineTrace = await runScenarioAgent(scenario, {});
  const mutations = selectMutations(pack.mutations, scenario.mutations);
  const mutatedTraces = [];
  const behavioralDiffs = [];
  const contractResults = [];

  for (const { mutation, mutationRef } of mutations) {
    const mutatedScenario = mutation.apply(scenario, mutationRef);
    const mutatedTrace = await runScenarioAgent(mutatedScenario, { mutation });
    const diff = diffTraces(baselineTrace, mutatedTrace, mutation);
    mutatedTraces.push(mutatedTrace);
    behavioralDiffs.push(diff);
    contractResults.push(...checkContracts({
      scenario,
      baselineTrace,
      mutatedTrace,
      mutation,
      diff,
    }));
  }

  return buildRunReport({
    scenario,
    pack,
    baselineTrace,
    mutatedTraces,
    behavioralDiffs,
    contractResults,
    failOn,
  });
}

function selectMutations(mutations, mutationRefs = []) {
  if (!mutationRefs.length) {
    return mutations.map((mutation) => ({ mutation, mutationRef: { id: mutation.id, options: {} } }));
  }

  return mutationRefs.map((mutationRef) => {
    const mutation = mutations.find((candidate) => matchesMutationRef(candidate, mutationRef));
    if (!mutation) {
      throw new Error(`Unknown mutation in scenario: ${mutationRef.id ?? mutationRef.family}`);
    }
    return { mutation, mutationRef };
  });
}

function matchesMutationRef(mutation, mutationRef) {
  return mutationRef.id === mutation.id
    || mutationRef.id === mutation.operator
    || mutationRef.id === mutation.family
    || mutationRef.family === mutation.family;
}

function runScenarioAgent(scenario, context) {
  if (scenario.domain === 'personal_finance') {
    return runFinanceGuardDemoAgent(scenario, context);
  }
  if (scenario.domain === 'healthcare' || scenario.domain === 'health') {
    return runHealthGuardDemoAgent(scenario, context);
  }
  throw new Error(`No v2 demo agent available for domain: ${scenario.domain}`);
}
