import { SAMPLE_BUNDLE } from './sample-bundle.js';

const MODAL_WORDS = new Set([
  'always',
  'never',
  'exactly',
  'strictly',
  'only',
  'must',
  'just',
  'verbatim',
  'precisely',
]);

const REPETITION_WORDS = new Set(['retry', 'repeat', 'again', 'same', 'exact', 'tool', 'schema']);

export function createDemoBundle() {
  return deepClone(SAMPLE_BUNDLE);
}

export function safeJsonParse(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: new Error('JSON input is empty') };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error };
  }
}

export function analyzeBundle(bundleInput, observationInput = null, options = {}) {
  const bundle = normalizeBundle(bundleInput);
  const features = inspectHarness(bundle.harness);
  const intensity = clampInt(options.intensity ?? bundle.mutationPolicy?.intensity ?? 2, 1, 4);
  const pack = buildVariantPack(bundle, features, intensity);
  const providedObservations = normalizeObservations(observationInput ?? bundle.observations);
  const outcomes = matchOutcomes(pack.variants, providedObservations, features, intensity, bundle.project);
  const familyStats = summarizeFamilies(pack.families, pack.variants, outcomes);
  const summary = summarizeOverall(bundle, features, familyStats, outcomes);
  const recommendations = buildRecommendations(features, familyStats, summary);
  const reportText = formatMarkdownReport(bundle, features, familyStats, summary, recommendations, pack, outcomes);
  const exportPack = buildExportPack(bundle, features, pack, familyStats, outcomes, summary, recommendations);

  return {
    mode: outcomes.some((item) => item.source === 'observed')
      ? outcomes.some((item) => item.source === 'simulated')
        ? 'mixed'
        : 'observed'
      : 'simulated',
    bundle,
    features,
    pack,
    outcomes,
    outcomesById: Object.fromEntries(outcomes.map((item) => [item.variantId, item])),
    familyStats,
    summary,
    recommendations,
    reportText,
    exportPack,
  };
}

function normalizeBundle(input) {
  const raw = isObject(input) ? input : {};
  const harnessSource = hasStructuredPackFields(raw) && isObject(raw.wrapper)
    ? raw.wrapper
    : raw.harness && isObject(raw.harness)
      ? raw.harness
      : raw;
  const observationsSource = Array.isArray(raw.observations)
    ? raw.observations
    : Array.isArray(raw.results)
      ? raw.results
      : raw.results && Array.isArray(raw.results.observations)
        ? raw.results.observations
        : [];

  return {
    version: clampInt(raw.version ?? 1, 1, 99),
    project: stringOr(raw.project, 'HarnessAmp Demo'),
    description: stringOr(raw.description, ''),
    intent: normalizeIntent(raw, harnessSource),
    contract: normalizeContract(raw),
    benchmark: normalizeBenchmark(raw, harnessSource),
    mutationPolicy: normalizeMutationPolicy(raw),
    scorers: normalizeScorers(raw),
    evidence: normalizeEvidence(raw),
    harness: normalizeHarness(harnessSource, raw.benchmark),
    observations: normalizeObservations(observationsSource),
  };
}

function normalizeHarness(raw, benchmarkSource = null) {
  const source = isObject(raw) ? raw : {};
  const runtime = isObject(source.runtime) ? source.runtime : isObject(source.wrapper) ? source.wrapper : {};
  const scenarioSource = Array.isArray(source.scenarios) && source.scenarios.length
    ? source.scenarios
    : Array.isArray(benchmarkSource?.cases)
      ? benchmarkSource.cases.map((item, index) => benchmarkCaseToScenario(item, index))
      : [];

  return {
    agentName: stringOr(source.agentName ?? source.name, 'Unnamed agent'),
    domain: stringOr(source.domain, 'general'),
    systemPrompt: stringOr(source.systemPrompt ?? source.prompt, ''),
    developerPrompt: stringOr(source.developerPrompt ?? source.instructions, ''),
    tools: Array.isArray(source.tools) ? source.tools.map(normalizeTool) : [],
    scenarios: Array.isArray(scenarioSource) ? scenarioSource.map(normalizeScenario) : [],
    wrapper: {
      responseFormat: stringOr(runtime.responseFormat ?? source.responseFormat, 'text'),
      retryPolicy: {
        maxAttempts: clampInt(runtime.retryPolicy?.maxAttempts ?? source.maxAttempts ?? 3, 1, 8),
        backoffMs: clampInt(runtime.retryPolicy?.backoffMs ?? source.backoffMs ?? 400, 0, 5000),
        jitterMs: clampInt(runtime.retryPolicy?.jitterMs ?? source.jitterMs ?? 120, 0, 5000),
      },
      toolApproval: Boolean(runtime.toolApproval ?? source.toolApproval ?? false),
      stopSequences: normalizeStringArray(runtime.stopSequences ?? source.stopSequences),
      messageEnvelope: stringOr(runtime.messageEnvelope ?? source.messageEnvelope, 'system+developer'),
    },
  };
}

function normalizeIntent(raw, wrapperSource) {
  if (isObject(raw.intent)) {
    return deepClone(raw.intent);
  }

  return {
    mission: stringOr(raw.description, `${stringOr(wrapperSource.agentName ?? raw.project, 'The agent')} should preserve the intended mission across wrapper drift.`),
    reviewStatus: 'inferred',
    successSignals: [],
  };
}

function normalizeContract(raw) {
  if (isObject(raw.contract)) {
    return deepClone(raw.contract);
  }

  return {
    reviewStatus: 'inferred',
    global: {
      must: [],
      mustNot: [],
      finalResponders: [],
    },
    agents: [],
    handoffs: [],
  };
}

function normalizeBenchmark(raw, wrapperSource) {
  if (isObject(raw.benchmark)) {
    return deepClone(raw.benchmark);
  }

  const fallbackCases = Array.isArray(wrapperSource?.scenarios)
    ? wrapperSource.scenarios.map((item, index) => ({
        id: stringOr(item.id, `case-${index + 1}`),
        title: stringOr(item.title ?? item.name, `Scenario ${index + 1}`),
        input: stringOr(item.objective ?? item.description, ''),
        assertions: [],
        expectedMilestones: [],
        forbiddenActions: [],
        passRules: [],
        rubricFields: [],
        seed: 1000 + index,
      }))
    : [];

  return {
    reviewStatus: 'inferred',
    cases: fallbackCases,
    summary: {
      approvedTraceCount: 0,
      privateHoldoutRecommendation: Math.max(1, Math.round(fallbackCases.length * 0.2)) || 1,
      finalResponders: [],
    },
  };
}

function normalizeMutationPolicy(raw) {
  const source = isObject(raw.mutationPolicy) ? raw.mutationPolicy : {};
  return {
    intensity: clampInt(source.intensity ?? 2, 1, 4),
    semanticGuardrails: normalizeStringArray(source.semanticGuardrails),
    visibleFamilies: normalizeStringArray(source.visibleFamilies),
    holdoutFamilies: normalizeStringArray(source.holdoutFamilies),
  };
}

function normalizeScorers(raw) {
  return Array.isArray(raw.scorers) ? raw.scorers.filter(isObject).map((item) => deepClone(item)) : [];
}

function normalizeEvidence(raw) {
  const source = isObject(raw.evidence) ? raw.evidence : {};
  return {
    links: Array.isArray(source.links) ? source.links.filter(isObject).map((item) => deepClone(item)) : [],
    sources: Array.isArray(source.sources) ? source.sources.filter(isObject).map((item) => deepClone(item)) : [],
  };
}

function normalizeTool(raw, index) {
  const source = isObject(raw) ? raw : {};
  return {
    name: slugify(stringOr(source.name, `tool-${index + 1}`)).replace(/-/g, '_'),
    description: stringOr(source.description, ''),
    schema: isObject(source.schema)
      ? deepClone(source.schema)
      : isObject(source.parameters)
        ? deepClone(source.parameters)
        : { type: 'object', properties: {} },
  };
}

function normalizeScenario(raw, index) {
  const source = isObject(raw) ? raw : {};
  return {
    id: stringOr(source.id, `case-${String(index + 1).padStart(2, '0')}`),
    title: stringOr(source.title ?? source.name, `Scenario ${index + 1}`),
    objective: stringOr(source.objective ?? source.description, ''),
  };
}

function benchmarkCaseToScenario(raw, index) {
  const source = isObject(raw) ? raw : {};
  return {
    id: stringOr(source.id, `case-${String(index + 1).padStart(2, '0')}`),
    title: stringOr(source.title, `Scenario ${index + 1}`),
    objective: stringOr(source.input ?? source.objective, ''),
  };
}

function normalizeObservations(input) {
  const list = Array.isArray(input) ? input : [];
  return list.map((item, index) => normalizeObservation(item, index)).filter(Boolean);
}

function normalizeObservation(raw, index) {
  const source = isObject(raw) ? raw : {};
  const hasScore = Number.isFinite(Number(source.score));
  const score = hasScore ? clamp(Number(source.score), 0, 100) : source.passed === true ? 100 : source.passed === false ? 0 : null;
  const passed = typeof source.passed === 'boolean' ? source.passed : score == null ? false : score >= 70;

  return {
    variantId: stringOr(source.variantId ?? source.id ?? source.name, `variant-${index + 1}`),
    familyId: stringOr(source.familyId, ''),
    tier: source.tier === 'holdout' ? 'holdout' : 'visible',
    passed,
    score,
    latencyMs: Number.isFinite(Number(source.latencyMs)) ? Math.max(0, Math.round(Number(source.latencyMs))) : null,
    notes: stringOr(source.notes, ''),
    source: 'observed',
  };
}

function inspectHarness(harness) {
  const promptText = [harness.systemPrompt, harness.developerPrompt].filter(Boolean).join('\n');
  const promptLower = promptText.toLowerCase();
  const words = tokenize(promptText);
  const sentenceCount = splitSentences(promptText).length;
  const toolNames = harness.tools.map((tool) => tool.name);
  const toolMentions = toolNames.filter((toolName) => promptLower.includes(toolName.toLowerCase()));
  const modalWordHits = words.filter((word) => MODAL_WORDS.has(word.toLowerCase())).length;
  const repetitionHits = words.filter((word) => REPETITION_WORDS.has(word.toLowerCase())).length;
  const schemaStats = harness.tools.map((tool) => collectSchemaStats(tool.schema)).reduce(
    (acc, stat) => ({
      nodes: acc.nodes + stat.nodes,
      leaves: acc.leaves + stat.leaves,
      required: acc.required + stat.required,
      maxDepth: Math.max(acc.maxDepth, stat.maxDepth),
    }),
    { nodes: 0, leaves: 0, required: 0, maxDepth: 0 },
  );
  const scenarioStats = summarizeScenarioText(harness.scenarios);
  const retry = harness.wrapper.retryPolicy;
  const sharedPrefixCount = countSharedPrefixes(toolNames);

  const flags = [];
  if (toolMentions.length > 0) {
    flags.push({
      id: 'tool-name-leak',
      surface: 'Prompt phrasing',
      label: 'Tool names appear in freeform instructions',
      detail: `The prompt mentions ${toolMentions.join(', ')}, which makes wrapper wording part of the contract.`,
      severity: 5,
    });
  }
  if (harness.scenarios.length < 5) {
    flags.push({
      id: 'thin-holdouts',
      surface: 'Scenario coverage',
      label: 'Holdout coverage is thin',
      detail: 'Fewer than five scenarios makes it easy for the agent to memorize the exact task shape.',
      severity: 4,
    });
  }
  if (scenarioStats.duplicateCount > 0) {
    flags.push({
      id: 'duplicate-scenarios',
      surface: 'Scenario coverage',
      label: 'Some scenarios repeat the same wording',
      detail: 'Repeated objectives reduce the usefulness of holdout variants.',
      severity: 3,
    });
  }
  if (schemaStats.maxDepth >= 4) {
    flags.push({
      id: 'deep-schema',
      surface: 'Schema shape',
      label: 'Tool schema is deeply nested',
      detail: 'Nested payloads are more likely to overfit to one serialization style.',
      severity: 3,
    });
  }
  if (retry.maxAttempts <= 2 || retry.backoffMs < 250) {
    flags.push({
      id: 'tight-retry',
      surface: 'Timing and retries',
      label: 'Retry budget is tight',
      detail: 'Short retry budgets amplify transient failures and timing assumptions.',
      severity: 3,
    });
  }
  if (modalWordHits + repetitionHits > 12) {
    flags.push({
      id: 'directive-sprawl',
      surface: 'Prompt phrasing',
      label: 'The instruction block is doing too much work',
      detail: 'Repeated modal language often means the agent is depending on exact wording.',
      severity: 4,
    });
  }
  if (sharedPrefixCount > 1) {
    flags.push({
      id: 'tool-namespace-collision',
      surface: 'Tool contract',
      label: 'Several tools share the same naming pattern',
      detail: 'Similar tool prefixes can encourage brittle name matching instead of intent matching.',
      severity: 2,
    });
  }

  return {
    promptWordCount: words.length,
    sentenceCount,
    toolCount: harness.tools.length,
    toolMentions: toolMentions.length,
    modalWordHits,
    repetitionHits,
    schemaNodeCount: schemaStats.nodes,
    schemaLeafCount: schemaStats.leaves,
    schemaRequiredCount: schemaStats.required,
    schemaMaxDepth: schemaStats.maxDepth,
    scenarioCount: harness.scenarios.length,
    duplicateScenarioCount: scenarioStats.duplicateCount,
    scenarioWordCount: scenarioStats.wordCount,
    retryPolicy: deepClone(retry),
    responseFormat: harness.wrapper.responseFormat,
    toolApproval: harness.wrapper.toolApproval,
    stopSequenceCount: harness.wrapper.stopSequences.length,
    messageEnvelope: harness.wrapper.messageEnvelope,
    sharedPrefixCount,
    flags,
  };
}

function buildVariantPack(bundle, features, intensity) {
  const seed = hashString(
    stableStringify({
      project: bundle.project,
      harness: bundle.harness,
      intensity,
    }),
  );
  const rng = mulberry32(seed);
  const families = [
    createPromptFamily(bundle.harness, features, intensity),
    createToolFamily(bundle.harness, features, intensity),
    createSchemaFamily(bundle.harness, features, intensity),
    createTimingFamily(bundle.harness, features, intensity),
    createScenarioFamily(bundle.harness, features, intensity),
    createEnvelopeFamily(bundle.harness, features, intensity),
  ];

  const visibleVariants = [];
  const holdoutVariants = [];

  families.forEach((family) => {
    visibleVariants.push(createVariant(family, 'visible', rng, features, intensity));
    holdoutVariants.push(createVariant(family, 'holdout', rng, features, intensity));
  });

  return {
    families,
    visibleVariants,
    holdoutVariants,
    variants: [...visibleVariants, ...holdoutVariants],
  };
}

function createPromptFamily(harness, features, intensity) {
  const baseRisk = clamp(
    14 + features.promptWordCount / 45 + features.toolMentions * 6 + features.modalWordHits * 1.25 + features.repetitionHits * 0.8,
    8,
    92,
  );
  return {
    id: 'prompt',
    label: 'Prompt phrasing',
    summary: 'Paraphrases the instruction blocks and removes exact wording dependence.',
    visibleTitle: 'Rephrased instruction block',
    holdoutTitle: 'Reordered instruction block',
    visibleChanges: [
      'Paraphrases the freeform policy text.',
      'Keeps the same intent with fewer repeated reminders.',
      'Tests whether the agent depends on exact wording.',
    ],
    holdoutChanges: [
      'Splits policy language into a different order.',
      'Moves the same semantics into a shorter wrapper.',
      'Checks whether the agent only understands one phrasing.',
    ],
    visibleRisk: clamp(baseRisk * 0.8 + intensity * 1.5, 6, 96),
    holdoutRisk: clamp(baseRisk * 1.08 + intensity * 4.5, 8, 98),
    createHarness: (tier, rng) => mutatePromptHarness(harness, tier, rng),
  };
}

function createToolFamily(harness, features, intensity) {
  const baseRisk = clamp(
    12 + features.toolCount * 4 + features.toolMentions * 4.5 + features.sharedPrefixCount * 2.5 + features.schemaMaxDepth * 0.8,
    8,
    94,
  );
  return {
    id: 'tools',
    label: 'Tool contract',
    summary: 'Renames tools, shuffles the list, and checks whether the agent is intent-driven.',
    visibleTitle: 'Semantic tool aliases',
    holdoutTitle: 'Tool order rotation',
    visibleChanges: [
      'Rewrites tool names into semantic aliases.',
      'Keeps descriptions short and task-oriented.',
      'Tests whether behavior survives a cleaner contract.',
    ],
    holdoutChanges: [
      'Reorders tools and trims the clues in descriptions.',
      'Checks whether the agent relies on name matching.',
      'Pushes harder on contract brittleness.',
    ],
    visibleRisk: clamp(baseRisk * 0.84 + intensity * 1.2, 6, 96),
    holdoutRisk: clamp(baseRisk * 1.1 + intensity * 4.2, 10, 98),
    createHarness: (tier, rng) => mutateToolHarness(harness, tier, rng),
  };
}

function createSchemaFamily(harness, features, intensity) {
  const baseRisk = clamp(
    11 + features.schemaNodeCount * 0.55 + features.schemaRequiredCount * 0.8 + features.schemaMaxDepth * 2.8 + (features.responseFormat === 'json' ? 4 : 0),
    8,
    96,
  );
  return {
    id: 'schema',
    label: 'Schema shape',
    summary: 'Shuffles object keys and required-field order to expose serialization dependence.',
    visibleTitle: 'Shuffled schema keys',
    holdoutTitle: 'Expanded schema shuffle',
    visibleChanges: [
      'Reorders schema keys without changing meaning.',
      'Preserves the same types and required fields.',
      'Checks whether the agent is order-sensitive.',
    ],
    holdoutChanges: [
      'Reorders required fields and nested properties.',
      'Preserves semantic equality while changing layout.',
      'Pushes on hidden serialization assumptions.',
    ],
    visibleRisk: clamp(baseRisk * 0.82 + intensity * 1.3, 6, 96),
    holdoutRisk: clamp(baseRisk * 1.12 + intensity * 4.8, 10, 99),
    createHarness: (tier, rng) => mutateSchemaHarness(harness, tier, rng),
  };
}

function createTimingFamily(harness, features, intensity) {
  const baseRisk = clamp(
    8 + (features.retryPolicy.maxAttempts <= 2 ? 14 : 0) + (features.retryPolicy.backoffMs < 250 ? 12 : 0) + (features.retryPolicy.jitterMs < 100 ? 6 : 0),
    6,
    92,
  );
  return {
    id: 'timing',
    label: 'Timing and retries',
    summary: 'Tests whether the agent falls apart when latency and retry budgets move a little.',
    visibleTitle: 'Broader retry window',
    holdoutTitle: 'Tighter timeout window',
    visibleChanges: [
      'Raises backoff slightly and adds jitter.',
      'Keeps the same recovery behavior.',
      'Checks whether the agent is timing-sensitive.',
    ],
    holdoutChanges: [
      'Reduces backoff and tightens timeout margins.',
      'Keeps semantics constant but stresses retries.',
      'Exposes hidden latency assumptions.',
    ],
    visibleRisk: clamp(baseRisk * 0.8 + intensity * 1.1, 6, 92),
    holdoutRisk: clamp(baseRisk * 1.16 + intensity * 4.0, 8, 98),
    createHarness: (tier, rng) => mutateTimingHarness(harness, tier, rng),
  };
}

function createScenarioFamily(harness, features, intensity) {
  const baseRisk = clamp(
    10 + Math.max(0, 6 - features.scenarioCount) * 7 + features.duplicateScenarioCount * 8 + Math.min(10, features.scenarioWordCount / 120),
    7,
    94,
  );
  return {
    id: 'scenarios',
    label: 'Scenario coverage',
    summary: 'Rotates scenario order and paraphrases task statements to widen the holdout window.',
    visibleTitle: 'Scenario rotation',
    holdoutTitle: 'Paraphrased holdouts',
    visibleChanges: [
      'Rotates scenario order without changing meaning.',
      'Checks for memorized sequence dependence.',
      'Measures whether the agent generalizes across inputs.',
    ],
    holdoutChanges: [
      'Paraphrases the scenario statements.',
      'Preserves the same task outcomes with different wording.',
      'Tests the hidden holdout set harder than the baseline.',
    ],
    visibleRisk: clamp(baseRisk * 0.82 + intensity * 1.3, 6, 96),
    holdoutRisk: clamp(baseRisk * 1.14 + intensity * 4.4, 8, 99),
    createHarness: (tier, rng) => mutateScenarioHarness(harness, tier, rng),
  };
}

function createEnvelopeFamily(harness, features, intensity) {
  const baseRisk = clamp(
    9 + (features.toolApproval ? 4 : 0) + (features.messageEnvelope.includes('developer') ? 0 : 7) + (features.stopSequenceCount ? 2 : 0),
    6,
    90,
  );
  return {
    id: 'envelope',
    label: 'Wrapper envelope',
    summary: 'Moves the same instructions across message blocks to see whether the agent cares about wrapper shape.',
    visibleTitle: 'Envelope reshuffle',
    holdoutTitle: 'Envelope split test',
    visibleChanges: [
      'Moves the same policy text across wrapper blocks.',
      'Keeps the semantic content intact.',
      'Checks for dependence on message ordering.',
    ],
    holdoutChanges: [
      'Separates policy, context, and task into different wrapper blocks.',
      'Keeps semantics but changes wrapper shape.',
      'Tests whether the agent only works with one layout.',
    ],
    visibleRisk: clamp(baseRisk * 0.8 + intensity * 1.0, 6, 92),
    holdoutRisk: clamp(baseRisk * 1.18 + intensity * 4.1, 8, 98),
    createHarness: (tier, rng) => mutateEnvelopeHarness(harness, tier, rng),
  };
}

function createVariant(family, tier, rng, features, intensity) {
  const variantHarness = family.createHarness(tier, rng);
  const estimatedRisk = tier === 'visible' ? family.visibleRisk : family.holdoutRisk;
  const estimatedPassRate = clamp(Math.round(100 - estimatedRisk), 2, 99);
  const estimatedLatencyMs = Math.round(
    850 + estimatedRisk * 14 + (tier === 'holdout' ? 160 : 0) + Math.floor(rng() * 180),
  );

  return {
    id: `${family.id}-${tier}`,
    familyId: family.id,
    familyLabel: family.label,
    tier,
    title: tier === 'visible' ? family.visibleTitle : family.holdoutTitle,
    summary: family.summary,
    changes: tier === 'visible' ? family.visibleChanges : family.holdoutChanges,
    estimatedRisk,
    estimatedPassRate,
    estimatedLatencyMs,
    featuresSnapshot: {
      promptWordCount: features.promptWordCount,
      toolCount: features.toolCount,
      schemaNodeCount: features.schemaNodeCount,
      scenarioCount: features.scenarioCount,
      intensity,
    },
    harness: variantHarness,
  };
}

function mutatePromptHarness(harness, tier, rng) {
  const next = cloneHarness(harness);
  const systemSentences = splitSentences(next.systemPrompt);
  const developerSentences = splitSentences(next.developerPrompt);
  next.systemPrompt = tier === 'visible'
    ? rephraseText(next.systemPrompt, false)
    : shuffleArray(systemSentences, rng).join(' ').replace(/\s+/g, ' ').trim();
  next.developerPrompt = tier === 'visible'
    ? rephraseText(next.developerPrompt, false)
    : shuffleArray(developerSentences, rng).join(' ').replace(/\s+/g, ' ').trim();
  return next;
}

function mutateToolHarness(harness, tier, rng) {
  const next = cloneHarness(harness);
  const shuffled = shuffleArray(next.tools, rng);
  next.tools = shuffled.map((tool, index) => {
    const alias = tier === 'visible'
      ? `${tool.name.split('_').slice(-1)[0]}_${index + 1}`.toLowerCase()
      : `${tool.name.split('_')[0]}_${index + 1}_${tool.name.split('_').slice(-1)[0]}`.toLowerCase();
    return {
      ...tool,
      name: slugify(alias).replace(/-/g, '_'),
      description: tier === 'visible' ? shortenDescription(tool.description) : rephraseText(tool.description, true),
      schema: mutateSchemaObject(tool.schema, tier, rng),
    };
  });
  return next;
}

function mutateSchemaHarness(harness, tier, rng) {
  const next = cloneHarness(harness);
  next.tools = next.tools.map((tool) => ({
    ...tool,
    schema: mutateSchemaObject(tool.schema, tier, rng),
  }));
  if (tier === 'holdout') {
    next.wrapper.responseFormat = next.wrapper.responseFormat === 'json' ? 'strict-json' : next.wrapper.responseFormat;
  }
  return next;
}

function mutateTimingHarness(harness, tier, rng) {
  const next = cloneHarness(harness);
  const policy = next.wrapper.retryPolicy;
  if (tier === 'visible') {
    policy.backoffMs = Math.max(150, Math.round(policy.backoffMs * 1.15));
    policy.jitterMs = Math.max(60, Math.round(policy.jitterMs * 1.2));
  } else {
    policy.maxAttempts = Math.max(2, policy.maxAttempts - 1);
    policy.backoffMs = Math.max(80, Math.round(policy.backoffMs * 0.8));
    policy.jitterMs = Math.max(20, Math.round(policy.jitterMs * 0.7));
  }
  next.wrapper.retryPolicy = policy;
  return next;
}

function mutateScenarioHarness(harness, tier, rng) {
  const next = cloneHarness(harness);
  next.scenarios = tier === 'visible'
    ? shuffleArray(next.scenarios, rng).map((scenario) => ({
        ...scenario,
        title: rephraseTitle(scenario.title),
        objective: rephraseText(scenario.objective, false),
      }))
    : shuffleArray(next.scenarios, rng).map((scenario, index) => ({
        ...scenario,
        id: `${scenario.id}-h${index + 1}`,
        title: rephraseTitle(scenario.title, true),
        objective: rephraseText(scenario.objective, true),
      }));
  return next;
}

function mutateEnvelopeHarness(harness, tier, rng) {
  const next = cloneHarness(harness);
  if (tier === 'visible') {
    next.wrapper.messageEnvelope = 'system+developer+metadata';
    next.wrapper.stopSequences = next.wrapper.stopSequences.length
      ? [...next.wrapper.stopSequences]
      : ['###STOP###'];
  } else {
    next.wrapper.messageEnvelope = 'developer+system+metadata';
    next.wrapper.stopSequences = next.wrapper.stopSequences.length
      ? shuffleArray(next.wrapper.stopSequences, rng)
      : ['###STOP###'];
  }
  return next;
}

function mutateSchemaObject(schema, tier, rng) {
  if (!isObject(schema)) return schema;
  if (Array.isArray(schema)) {
    const items = schema.map((item) => mutateSchemaObject(item, tier, rng));
    return tier === 'holdout' ? shuffleArray(items, rng) : items;
  }

  const entries = Object.entries(schema).map(([key, value]) => [key, mutateSchemaObject(value, tier, rng)]);
  const ordered = tier === 'holdout' ? shuffleArray(entries, rng) : sortByKey(entries);
  const next = {};
  for (const [key, value] of ordered) {
    if (key === 'required' && Array.isArray(value)) {
      next[key] = tier === 'holdout' ? shuffleArray(value, rng) : [...value];
    } else if (key === 'enum' && Array.isArray(value)) {
      next[key] = tier === 'holdout' ? shuffleArray(value, rng) : [...value];
    } else {
      next[key] = value;
    }
  }
  return next;
}

function matchOutcomes(variants, providedObservations, features, intensity, project) {
  const observationMap = new Map(providedObservations.map((item) => [item.variantId, item]));
  const seed = hashString(`${project}:${features.promptWordCount}:${features.toolCount}:${features.schemaNodeCount}:${intensity}`);
  const rng = mulberry32(seed);

  return variants.map((variant) => {
    const observed = observationMap.get(variant.id);
    if (observed) {
      return {
        variantId: variant.id,
        familyId: variant.familyId,
        tier: variant.tier,
        passed: Boolean(observed.passed),
        score: observed.score == null ? (observed.passed ? 100 : 0) : clamp(Number(observed.score), 0, 100),
        latencyMs: observed.latencyMs == null ? variant.estimatedLatencyMs : Math.max(0, Math.round(Number(observed.latencyMs))),
        notes: stringOr(observed.notes, ''),
        source: 'observed',
      };
    }

    const volatility = variant.tier === 'holdout' ? 11 : 6;
    const score = clamp(Math.round(100 - variant.estimatedRisk + (rng() - 0.5) * volatility), 0, 100);
    return {
      variantId: variant.id,
      familyId: variant.familyId,
      tier: variant.tier,
      passed: score >= 70,
      score,
      latencyMs: Math.max(0, Math.round(variant.estimatedLatencyMs * (0.95 + rng() * 0.2))),
      notes: score >= 70 ? 'Held under wrapper drift.' : 'Dropped when the wrapper changed.',
      source: 'simulated',
    };
  });
}

function summarizeFamilies(families, variants, outcomes) {
  const familyLookup = new Map(families.map((family) => [family.id, family]));
  const groups = new Map();

  for (const variant of variants) {
    const outcome = outcomes.find((item) => item.variantId === variant.id) ?? null;
    if (!groups.has(variant.familyId)) {
      groups.set(variant.familyId, {
        id: variant.familyId,
        label: variant.familyLabel,
        summary: familyLookup.get(variant.familyId)?.summary ?? '',
        visible: { count: 0, passed: 0, scoreTotal: 0, latencyTotal: 0 },
        holdout: { count: 0, passed: 0, scoreTotal: 0, latencyTotal: 0 },
        visibleTitle: familyLookup.get(variant.familyId)?.visibleTitle ?? '',
        holdoutTitle: familyLookup.get(variant.familyId)?.holdoutTitle ?? '',
        visibleChanges: familyLookup.get(variant.familyId)?.visibleChanges ?? [],
        holdoutChanges: familyLookup.get(variant.familyId)?.holdoutChanges ?? [],
      });
    }

    const group = groups.get(variant.familyId);
    const bucket = variant.tier === 'holdout' ? group.holdout : group.visible;
    bucket.count += 1;
    bucket.passed += outcome?.passed ? 1 : 0;
    bucket.scoreTotal += outcome?.score ?? 0;
    bucket.latencyTotal += outcome?.latencyMs ?? 0;
  }

  const stats = Array.from(groups.values()).map((group) => {
    const visibleRate = percent(group.visible.passed, group.visible.count);
    const holdoutRate = percent(group.holdout.passed, group.holdout.count);
    const visibleScore = averageScore(group.visible);
    const holdoutScore = averageScore(group.holdout);
    const gap = clamp(Math.round(visibleRate - holdoutRate), 0, 100);
    const surface = gap >= 18 ? 'sharp' : gap >= 10 ? 'watch' : 'steady';
    return {
      ...group,
      visibleRate,
      holdoutRate,
      visibleScore,
      holdoutScore,
      gap,
      surface,
      bottleneck: holdoutRate <= visibleRate ? group.holdoutTitle : group.visibleTitle,
      lede:
        gap >= 18
          ? `${group.label} is the biggest holdout gap at ${gap} points.`
          : `${group.label} looks relatively stable, but still changes under mutation.`,
    };
  });

  return stats.sort((a, b) => b.gap - a.gap || a.label.localeCompare(b.label));
}

function summarizeOverall(bundle, features, familyStats, outcomes) {
  const allScores = outcomes.map((item) => item.score);
  const visible = familyStats.map((item) => item.visibleRate);
  const holdouts = familyStats.map((item) => item.holdoutRate);
  const visibleMean = average(visible);
  const holdoutMean = average(holdouts);
  const scoreMean = average(allScores);
  const gap = clamp(Math.round(visibleMean - holdoutMean), 0, 100);
  const observedCount = outcomes.filter((item) => item.source === 'observed').length;
  const flagPenaltyScale = outcomes.length ? 1 - observedCount / outcomes.length : 1;
  const flagPenalty = features.flags.reduce((sum, flag) => sum + flag.severity * 1.3, 0) * flagPenaltyScale;
  const overallScore = clamp(Math.round(scoreMean - gap * 0.35 - flagPenalty), 0, 100);
  const confidence = outcomes.every((item) => item.source === 'observed')
    ? 100
    : outcomes.every((item) => item.source === 'simulated')
      ? 35
      : 65;
  const hotspot = familyStats[0] ?? null;
  const label = overallScore >= 85 ? 'stable' : overallScore >= 70 ? 'watch' : overallScore >= 55 ? 'brittle' : 'fragile';

  return {
    project: bundle.project,
    overallScore,
    visiblePassRate: Math.round(visibleMean),
    holdoutPassRate: Math.round(holdoutMean),
    gap,
    confidence,
    label,
    modeLabel: outcomes.every((item) => item.source === 'observed')
      ? 'observed'
      : outcomes.every((item) => item.source === 'simulated')
        ? 'simulated'
        : 'mixed',
    variantCount: outcomes.length,
    familyCount: familyStats.length,
    hotspot: hotspot
      ? {
          id: hotspot.id,
          label: hotspot.label,
          gap: hotspot.gap,
          visibleRate: hotspot.visibleRate,
          holdoutRate: hotspot.holdoutRate,
        }
      : null,
    lede: hotspot
      ? hotspot.gap >= 18
        ? `The harness is most brittle around ${hotspot.label}. The holdout gap is ${hotspot.gap} points.`
        : `The harness is manageable, but ${hotspot.label} is still the weakest surface.`
      : 'No variants were generated.',
  };
}

function buildRecommendations(features, familyStats, summary) {
  const recs = [];
  const hotspot = familyStats[0] ?? null;

  if (features.toolMentions > 0) {
    recs.push({
      id: 'tool-separation',
      title: 'Move tool names out of freeform prose',
      detail: 'Keep tool identifiers in the schema or metadata, and let the prompt describe intent instead of exact names.',
      impact: 'Reduces the chance that the agent overfits to one wrapper string.',
    });
  }

  if (features.scenarioCount < 5 || features.duplicateScenarioCount > 0) {
    recs.push({
      id: 'scenario-rotation',
      title: 'Grow the holdout set',
      detail: 'Add more scenario variants and rotate the wording so the agent cannot memorize a single task shape.',
      impact: 'Improves coverage for wrapper drift and memorized sequence dependence.',
    });
  }

  if (features.retryPolicy.maxAttempts <= 2 || features.retryPolicy.backoffMs < 250) {
    recs.push({
      id: 'timing-hardening',
      title: 'Test against variable latency',
      detail: 'Broaden the retry window and run the agent under randomized delays before you trust the baseline.',
      impact: 'Exposes transient failures that only appear when the wrapper is slightly slower.',
    });
  }

  if (features.schemaMaxDepth >= 4 || features.schemaNodeCount >= 20) {
    recs.push({
      id: 'schema-shuffle',
      title: 'Shallow or shuffle the schema',
      detail: 'Normalize the schema and keep one harness variant that shuffles key order and required lists.',
      impact: 'Catches dependence on a single serialization style.',
    });
  }

  if (summary.gap >= 15 || (hotspot && hotspot.gap >= 18)) {
    recs.push({
      id: 'hidden-holdouts',
      title: 'Treat hidden variants as release blockers',
      detail: 'Gate merges on hidden holdout scores, not only on the visible benchmark set.',
      impact: 'Prevents benchmark memorization from slipping into production.',
    });
  }

  recs.push({
    id: 'shadow-run',
    title: 'Keep one shadow agent in CI',
    detail: 'Run a red-team style agent that only searches for wrapper-specific shortcuts and report the first failure surface it finds.',
    impact: 'Makes harness overfitting visible before the release train leaves.',
  });

  return recs.slice(0, 4);
}

function buildExportPack(bundle, features, pack, familyStats, outcomes, summary, recommendations) {
  return {
    version: 2,
    format: 'harnessamp/benchmark-pack',
    generatedAt: new Date().toISOString(),
    project: bundle.project,
    description: bundle.description,
    intent: deepClone(bundle.intent),
    contract: deepClone(bundle.contract),
    benchmark: deepClone(bundle.benchmark),
    wrapper: serializeWrapper(bundle.harness),
    mutationPolicy: {
      ...deepClone(bundle.mutationPolicy),
      visibleFamilies: bundle.mutationPolicy.visibleFamilies.length
        ? bundle.mutationPolicy.visibleFamilies
        : pack.families.map((family) => family.id),
      holdoutFamilies: bundle.mutationPolicy.holdoutFamilies.length
        ? bundle.mutationPolicy.holdoutFamilies
        : pack.families.map((family) => family.id),
    },
    scorers: bundle.scorers,
    evidence: bundle.evidence,
    observations: bundle.observations,
    analysis: {
      summary: {
        overallScore: summary.overallScore,
        visiblePassRate: summary.visiblePassRate,
        holdoutPassRate: summary.holdoutPassRate,
        gap: summary.gap,
        label: summary.label,
        mode: summary.modeLabel,
        hotspot: summary.hotspot,
      },
      features,
      families: familyStats.map((family) => ({
        id: family.id,
        label: family.label,
        summary: family.summary,
        visibleRate: family.visibleRate,
        holdoutRate: family.holdoutRate,
        gap: family.gap,
        visibleTitle: family.visibleTitle,
        holdoutTitle: family.holdoutTitle,
      })),
      variants: pack.variants.map((variant) => ({
        id: variant.id,
        familyId: variant.familyId,
        familyLabel: variant.familyLabel,
        tier: variant.tier,
        title: variant.title,
        summary: variant.summary,
        changes: variant.changes,
        estimatedRisk: variant.estimatedRisk,
        estimatedPassRate: variant.estimatedPassRate,
        estimatedLatencyMs: variant.estimatedLatencyMs,
        harness: variant.harness,
      })),
      outcomes,
      recommendations,
    },
  };
}

export function formatMarkdownReport(bundle, features, familyStats, summary, recommendations, pack, outcomes) {
  const lines = [];
  lines.push(`# HarnessAmp report`);
  lines.push('');
  lines.push(`- Project: ${bundle.project}`);
  lines.push(`- Mode: ${summary.modeLabel}`);
  lines.push(`- Overall score: ${summary.overallScore}/100`);
  lines.push(`- Visible pass rate: ${summary.visiblePassRate}%`);
  lines.push(`- Holdout pass rate: ${summary.holdoutPassRate}%`);
  lines.push(`- Gap: ${summary.gap} points`);
  lines.push(`- Variants: ${summary.variantCount}`);
  lines.push('');
  lines.push('## Key finding');
  lines.push('');
  lines.push(`- ${summary.lede}`);
  if (features.flags.length) {
    lines.push(`- ${features.flags[0].detail}`);
  }
  lines.push('');
  lines.push('## Family breakdown');
  lines.push('');
  lines.push('| Family | Visible | Holdout | Gap |');
  lines.push('| --- | --- | --- | --- |');
  familyStats.forEach((family) => {
    lines.push(`| ${family.label} | ${family.visibleRate}% | ${family.holdoutRate}% | ${family.gap} |`);
  });
  lines.push('');
  lines.push('## Recommendations');
  lines.push('');
  recommendations.forEach((item) => {
    lines.push(`- ${item.title}: ${item.detail}`);
  });
  lines.push('');
  lines.push('## Generated pack');
  lines.push('');
  lines.push(`- Visible variants: ${pack.visibleVariants.length}`);
  lines.push(`- Hidden holdouts: ${pack.holdoutVariants.length}`);
  lines.push(`- Observations: ${outcomes.filter((item) => item.source === 'observed').length}`);

  return lines.join('\n');
}

function summarizeScenarioText(scenarios) {
  const seen = new Set();
  let duplicateCount = 0;
  let wordCount = 0;
  for (const scenario of scenarios) {
    const key = `${scenario.title.toLowerCase().trim()}|${scenario.objective.toLowerCase().trim()}`;
    if (seen.has(key)) {
      duplicateCount += 1;
    } else {
      seen.add(key);
    }
    wordCount += tokenize(`${scenario.title} ${scenario.objective}`).length;
  }
  return { duplicateCount, wordCount };
}

function countSharedPrefixes(toolNames) {
  const prefixes = new Map();
  for (const name of toolNames) {
    const prefix = name.split(/[_\-]/)[0];
    prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1);
  }
  let shared = 0;
  for (const value of prefixes.values()) {
    if (value > 1) shared += 1;
  }
  return shared;
}

function collectSchemaStats(schema, depth = 0) {
  if (!isObject(schema)) {
    return { nodes: 1, leaves: 1, required: 0, maxDepth: depth };
  }

  if (Array.isArray(schema)) {
    return schema.reduce(
      (acc, item) => {
        const next = collectSchemaStats(item, depth + 1);
        acc.nodes += next.nodes;
        acc.leaves += next.leaves;
        acc.required += next.required;
        acc.maxDepth = Math.max(acc.maxDepth, next.maxDepth);
        return acc;
      },
      { nodes: 1, leaves: 0, required: 0, maxDepth: depth + 1 },
    );
  }

  const keys = Object.keys(schema);
  const required = Array.isArray(schema.required) ? schema.required.length : 0;
  const children = keys.reduce(
    (acc, key) => {
      if (key === 'required') return acc;
      const next = collectSchemaStats(schema[key], depth + 1);
      acc.nodes += next.nodes;
      acc.leaves += next.leaves;
      acc.required += next.required;
      acc.maxDepth = Math.max(acc.maxDepth, next.maxDepth);
      return acc;
    },
    { nodes: 1, leaves: keys.length === 0 ? 1 : 0, required, maxDepth: depth },
  );
  return children;
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter(Boolean) ?? [];
}

function splitSentences(text) {
  return String(text)
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function rephraseText(text, stronger = false) {
  const replacements = stronger
    ? [
        [/\balways\b/gi, 'consistently'],
        [/\bnever\b/gi, 'avoid'],
        [/\bexactly\b/gi, 'precisely'],
        [/\bstrictly\b/gi, 'carefully'],
        [/\bonly\b/gi, 'solely'],
        [/\bmust\b/gi, 'should'],
        [/\bjust\b/gi, 'simply'],
      ]
    : [
        [/\balways\b/gi, 'often'],
        [/\bnever\b/gi, 'avoid'],
        [/\bexactly\b/gi, 'precisely'],
        [/\bstrictly\b/gi, 'closely'],
        [/\bonly\b/gi, 'simply'],
        [/\bmust\b/gi, 'should'],
        [/\bjust\b/gi, 'simply'],
      ];

  let output = String(text);
  for (const [pattern, replacement] of replacements) {
    output = output.replace(pattern, replacement);
  }

  return output.replace(/\s+/g, ' ').trim();
}

function rephraseTitle(text, stronger = false) {
  const output = rephraseText(text, stronger);
  return output.length ? output[0].toUpperCase() + output.slice(1) : output;
}

function shortenDescription(text) {
  const words = tokenize(text);
  return words.slice(0, Math.max(8, Math.min(14, words.length))).join(' ');
}

function averageScore(bucket) {
  if (!bucket.count) return 0;
  return Math.round(bucket.scoreTotal / bucket.count);
}

function percent(passed, count) {
  if (!count) return 0;
  return Math.round((passed / count) * 100);
}

function average(values) {
  const list = values.filter((value) => Number.isFinite(value));
  if (!list.length) return 0;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function deepClone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function cloneHarness(harness) {
  return deepClone(harness);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasStructuredPackFields(value) {
  return isObject(value) && (isObject(value.intent) || isObject(value.contract) || isObject(value.benchmark) || isObject(value.wrapper));
}

function serializeWrapper(harness) {
  return {
    agentName: harness.agentName,
    domain: harness.domain,
    systemPrompt: harness.systemPrompt,
    developerPrompt: harness.developerPrompt,
    tools: deepClone(harness.tools),
    scenarios: deepClone(harness.scenarios),
    runtime: {
      responseFormat: harness.wrapper.responseFormat,
      retryPolicy: deepClone(harness.wrapper.retryPolicy),
      toolApproval: harness.wrapper.toolApproval,
      stopSequences: deepClone(harness.wrapper.stopSequences),
      messageEnvelope: harness.wrapper.messageEnvelope,
    },
  };
}

function stringOr(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (isObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray(value, rng) {
  const array = [...value];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function sortByKey(entries) {
  return [...entries].sort(([left], [right]) => left.localeCompare(right));
}
