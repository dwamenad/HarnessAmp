import { runFinanceGuardDemoAgent } from './demo-agents/financeguard-agent.js';
import { checkContracts } from './contract-checkers.js';
import { buildRunReport } from './reporters.js';
import { diffTraces } from './trace-diff.js';
import { getV2Pack } from './packs/index.js';

export async function runV2Scenario(scenario, options = {}) {
  const pack = getV2Pack(options.packName ?? 'financeguard-core');
  const failOn = options.failOn ?? 'critical';
  const baselineTrace = await runScenarioAgent(scenario, {});
  const mutatedTraces = [];
  const behavioralDiffs = [];
  const contractResults = [];

  for (const mutation of pack.mutations) {
    const mutatedScenario = mutation.apply(scenario);
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

function runScenarioAgent(scenario, context) {
  if (scenario.domain === 'personal_finance') {
    return runFinanceGuardDemoAgent(scenario, context);
  }
  throw new Error(`No v2 demo agent available for domain: ${scenario.domain}`);
}
