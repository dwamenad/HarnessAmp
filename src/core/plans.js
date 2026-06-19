export const PLAN_ORDER = Object.freeze(['free', 'starter', 'team', 'business', 'enterprise']);

export const PLAN_DEFINITIONS = Object.freeze({
  free: {
    plan: 'free',
    label: 'Free',
    limits: {
      projects: 1,
      members: 1,
      monthlyRuns: 3,
      monthlyScenarios: 200,
      monthlyProviderCalls: 0,
      monthlyExecutionMinutes: 10,
      retainedReports: 3,
      maxScenariosPerRun: 50,
    },
    features: {
      hostedByok: false,
      ciGates: false,
      fullBenchmarks: false,
      reportExports: false,
      teamMembers: false,
      advancedTargets: false,
      priorityQueue: false,
      auditLogs: false,
    },
  },
  starter: {
    plan: 'starter',
    label: 'Starter',
    limits: {
      projects: 1,
      members: 3,
      monthlyRuns: 25,
      monthlyScenarios: 5000,
      monthlyProviderCalls: 5000,
      monthlyExecutionMinutes: 250,
      retainedReports: 25,
      maxScenariosPerRun: 500,
    },
    features: {
      hostedByok: true,
      ciGates: false,
      fullBenchmarks: false,
      reportExports: true,
      teamMembers: true,
      advancedTargets: false,
      priorityQueue: false,
      auditLogs: false,
    },
  },
  team: {
    plan: 'team',
    label: 'Team',
    limits: {
      projects: 5,
      members: 15,
      monthlyRuns: 150,
      monthlyScenarios: 75000,
      monthlyProviderCalls: 75000,
      monthlyExecutionMinutes: 2500,
      retainedReports: 250,
      maxScenariosPerRun: 5000,
    },
    features: {
      hostedByok: true,
      ciGates: true,
      fullBenchmarks: true,
      reportExports: true,
      teamMembers: true,
      advancedTargets: true,
      priorityQueue: false,
      auditLogs: false,
    },
  },
  business: {
    plan: 'business',
    label: 'Business',
    limits: {
      projects: 25,
      members: 75,
      monthlyRuns: 1000,
      monthlyScenarios: 500000,
      monthlyProviderCalls: 500000,
      monthlyExecutionMinutes: 20000,
      retainedReports: 2500,
      maxScenariosPerRun: 25000,
    },
    features: {
      hostedByok: true,
      ciGates: true,
      fullBenchmarks: true,
      reportExports: true,
      teamMembers: true,
      advancedTargets: true,
      priorityQueue: true,
      auditLogs: false,
    },
  },
  enterprise: {
    plan: 'enterprise',
    label: 'Enterprise',
    limits: {
      projects: 1000,
      members: 1000,
      monthlyRuns: 1000000,
      monthlyScenarios: 100000000,
      monthlyProviderCalls: 100000000,
      monthlyExecutionMinutes: 1000000,
      retainedReports: 100000,
      maxScenariosPerRun: 1000000,
    },
    features: {
      hostedByok: true,
      ciGates: true,
      fullBenchmarks: true,
      reportExports: true,
      teamMembers: true,
      advancedTargets: true,
      priorityQueue: true,
      auditLogs: true,
    },
  },
});

const USAGE_EVENT_TO_KEY = Object.freeze({
  run_created: 'runCount',
  run_started: 'runStartedCount',
  run_completed: 'runCompletedCount',
  scenario_executed: 'scenarioCount',
  mutation_executed: 'mutationCount',
  provider_call: 'providerCallCount',
  execution_ms: 'workerRuntimeMs',
  report_exported: 'reportExports',
  ci_gate_run: 'ciGateRuns',
});

export function normalizePlan(value, fallback = 'free') {
  const plan = String(value ?? '').toLowerCase();
  return PLAN_DEFINITIONS[plan] ? plan : fallback;
}

export function planDefinition(plan) {
  return PLAN_DEFINITIONS[normalizePlan(plan)];
}

export function planRank(plan) {
  return PLAN_ORDER.indexOf(normalizePlan(plan));
}

export function minimumPlanFor(feature) {
  return PLAN_ORDER.find((plan) => PLAN_DEFINITIONS[plan].features[feature]) ?? 'enterprise';
}

export function monthPeriod(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
  const periodEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString();
  return { periodStart, periodEnd };
}

export function aggregateUsageEvents(events = []) {
  const totals = {
    runCount: 0,
    runStartedCount: 0,
    runCompletedCount: 0,
    scenarioCount: 0,
    mutationCount: 0,
    benchmarkCount: 0,
    providerCallCount: 0,
    executionMinutes: 0,
    workerRuntimeMs: 0,
    reportExports: 0,
    ciGateRuns: 0,
  };
  for (const event of Array.isArray(events) ? events : []) {
    const key = USAGE_EVENT_TO_KEY[event?.eventType];
    if (!key) continue;
    const quantity = Number(event.quantity ?? 0);
    if (!Number.isFinite(quantity)) continue;
    totals[key] += quantity;
  }
  totals.executionMinutes = Math.ceil(totals.workerRuntimeMs / 60000);
  totals.benchmarkCount = totals.runCount;
  return totals;
}

export function estimateRunUsage({ benchmark = null, pack = null, tier = null, runMode = 'sample', mutationConfig = null } = {}) {
  const source = pack ?? benchmark ?? {};
  const variants = Array.isArray(source.variants) ? source.variants : [];
  const scenarios = Array.isArray(source.harness?.scenarios)
    ? source.harness.scenarios
    : Array.isArray(source.scenarios)
      ? source.scenarios
      : [];
  const visibleVariants = variants.filter((variant) => variant.tier === 'visible');
  const selectedVariants = runMode === 'full' || runMode === 'ci'
    ? variants
    : visibleVariants.length
      ? visibleVariants
      : variants.slice(0, 2);
  const scenarioCount = Math.max(1, scenarios.length || selectedVariants.length || 1);
  const mutationCount = Math.max(0, selectedVariants.length || Number(mutationConfig?.count ?? 0) || 0);
  const providerCallCount = Math.max(scenarioCount, mutationCount || scenarioCount);
  return {
    benchmarkId: source.id ?? source.slug ?? source.project ?? '',
    benchmarkName: source.name ?? source.project ?? 'Benchmark',
    tier: tier ?? source.tier ?? (runMode === 'full' ? 'standard' : 'sample'),
    runMode,
    runCount: 1,
    scenarioCount,
    mutationCount,
    benchmarkCount: 1,
    providerCallCount,
    executionMinutes: Math.max(1, Math.ceil(providerCallCount / 60)),
  };
}

export function evaluateRunEntitlements({
  plan,
  usage = {},
  estimate = {},
  executionTarget = null,
  runMode = 'sample',
  ciGate = false,
} = {}) {
  const definition = planDefinition(plan);
  const reasons = [];
  const feature = definition.features;
  const limits = definition.limits;
  const targetType = executionTarget?.type ?? '';

  if (targetType === 'hosted_provider' && !feature.hostedByok) {
    reasons.push({
      code: 'plan_hosted_byok_required',
      message: 'Hosted BYOK requires the Starter plan or higher.',
      requiredPlan: minimumPlanFor('hostedByok'),
    });
  }
  if (ciGate && !feature.ciGates) {
    reasons.push({
      code: 'plan_ci_gates_required',
      message: 'CI gates require the Team plan or higher.',
      requiredPlan: minimumPlanFor('ciGates'),
    });
  }
  if ((runMode === 'full' || estimate.scenarioCount > limits.maxScenariosPerRun) && !feature.fullBenchmarks) {
    reasons.push({
      code: 'plan_full_benchmark_required',
      message: `${estimate.benchmarkName ?? 'This benchmark'} requires the Team plan because it exceeds Starter benchmark limits.`,
      requiredPlan: minimumPlanFor('fullBenchmarks'),
    });
  }
  if ((usage.runCount ?? 0) + (estimate.runCount ?? 1) > limits.monthlyRuns) {
    reasons.push({
      code: 'plan_monthly_runs_exceeded',
      message: 'This run would exceed the monthly run limit for the current plan.',
      requiredPlan: nextPlan(plan),
    });
  }
  if ((usage.scenarioCount ?? 0) + (estimate.scenarioCount ?? 0) > limits.monthlyScenarios) {
    reasons.push({
      code: 'plan_monthly_scenarios_exceeded',
      message: 'This run would exceed the monthly scenario budget for the current plan.',
      requiredPlan: nextPlan(plan),
    });
  }
  if ((usage.providerCallCount ?? 0) + (estimate.providerCallCount ?? 0) > limits.monthlyProviderCalls) {
    reasons.push({
      code: 'plan_monthly_provider_calls_exceeded',
      message: 'This run would exceed the monthly provider-call budget for the current plan.',
      requiredPlan: nextPlan(plan),
    });
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    estimate,
    plan: definition.plan,
    limits,
    usage,
    remaining: {
      monthlyRuns: Math.max(0, limits.monthlyRuns - (usage.runCount ?? 0)),
      monthlyScenarios: Math.max(0, limits.monthlyScenarios - (usage.scenarioCount ?? 0)),
      monthlyProviderCalls: Math.max(0, limits.monthlyProviderCalls - (usage.providerCallCount ?? 0)),
      monthlyExecutionMinutes: Math.max(0, limits.monthlyExecutionMinutes - (usage.executionMinutes ?? 0)),
    },
  };
}

function nextPlan(plan) {
  const index = planRank(plan);
  return PLAN_ORDER[Math.min(PLAN_ORDER.length - 1, index + 1)] ?? 'enterprise';
}
