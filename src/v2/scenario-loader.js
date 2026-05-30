import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export function loadScenarioFile(path) {
  const sourcePath = resolve(path);
  const text = readFileSync(sourcePath, 'utf8');
  const scenario = parse(text);
  return normalizeScenario(scenario, sourcePath);
}

export function normalizeScenario(input, sourcePath = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Scenario file must contain an object.');
  }

  const contracts = Array.isArray(input.contracts) ? input.contracts : [];
  if (!contracts.length) {
    throw new Error('Scenario must include at least one contract.');
  }

  return {
    id: stringOr(input.id, 'scenario'),
    domain: stringOr(input.domain, 'general'),
    name: stringOr(input.name, input.id ?? 'Scenario'),
    baselinePrompt: stringOr(input.baselinePrompt ?? input.baseline_prompt, ''),
    syntheticData: input.syntheticData ?? input.synthetic_data ?? {},
    tools: Array.isArray(input.tools) ? input.tools : [],
    policies: Array.isArray(input.policies) ? input.policies : [],
    contracts: contracts.map(normalizeContract),
    expectedBehavior: normalizeStringArray(input.expectedBehavior ?? input.expected_behavior),
    forbiddenBehavior: normalizeStringArray(input.forbiddenBehavior ?? input.forbidden_behavior),
    mutations: Array.isArray(input.mutations) ? input.mutations : [],
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    sourcePath,
  };
}

function normalizeContract(contract) {
  if (typeof contract === 'string') {
    return {
      id: contract,
      name: contract,
      severity: 'medium',
      rule: '',
      invariant: '',
      requiredBehavior: [],
      disallowed: [],
    };
  }

  if (!contract || typeof contract !== 'object') {
    throw new Error('Contracts must be strings or objects.');
  }

  return {
    id: stringOr(contract.id, 'contract'),
    name: stringOr(contract.name, contract.id ?? 'Contract'),
    severity: stringOr(contract.severity, 'medium'),
    rule: stringOr(contract.rule ?? contract.invariant, ''),
    invariant: stringOr(contract.invariant ?? contract.rule, ''),
    requiredBehavior: normalizeStringArray(contract.requiredBehavior ?? contract.required_behavior),
    allowed: normalizeStringArray(contract.allowed),
    disallowed: normalizeStringArray(contract.disallowed),
    requiredToolCalls: normalizeStringArray(contract.requiredToolCalls ?? contract.required_tool_calls),
    forbiddenToolCalls: normalizeStringArray(contract.forbiddenToolCalls ?? contract.forbidden_tool_calls),
    tolerance: Number.isFinite(Number(contract.tolerance)) ? Number(contract.tolerance) : null,
  };
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function stringOr(value, fallback) {
  return typeof value === 'string' && value.length ? value : fallback;
}
