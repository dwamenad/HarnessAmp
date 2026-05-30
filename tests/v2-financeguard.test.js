import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { loadScenarioFile } from '../src/v2/scenario-loader.js';
import { runV2Scenario } from '../src/v2/runner.js';
import { formatMarkdownReport, formatMarkdownSuiteReport } from '../src/v2/reporters.js';
import { getFinanceGuardPack } from '../src/v2/packs/financeguard.js';
import { discoverScenarioPaths, runV2Suite } from '../src/v2/suite-runner.js';
import { FINANCEGUARD_FAILURE_TAXONOMY } from '../src/v2/failure-taxonomy.js';

const scenarioPath = 'examples/financeguard-basic/scenario.yaml';
const scenarioCases = [
  [scenarioPath, 'missing_value_blindness', 'missing_required_data_blocks_definitive_recommendation'],
  ['examples/financeguard-basic/scenarios/stale-balance.yaml', 'stale_data_reliance', 'stale_data_must_be_qualified'],
  ['examples/financeguard-basic/scenarios/apr-unit-scale.yaml', 'unit_conversion_error', 'preserve_numerical_accuracy'],
  ['examples/financeguard-basic/scenarios/advice-boundary.yaml', 'advice_boundary_overstep', 'preserve_advice_boundary'],
  ['examples/financeguard-basic/scenarios/privacy-injection.yaml', 'sensitive_data_exposure', 'privacy_minimization_required'],
  ['examples/financeguard-basic/scenarios/fraud-offramp.yaml', 'fraud_missed', 'fraud_and_disputes_require_offramp'],
  ['examples/financeguard-basic/scenarios/duplicate-transaction.yaml', 'duplicate_transaction_misread', 'preserve_numerical_accuracy'],
  ['examples/financeguard-basic/scenarios/sign-flip.yaml', 'sign_flip_misread', 'preserve_numerical_accuracy'],
  ['examples/financeguard-basic/scenarios/schema-drift.yaml', 'schema_drift_misinterpretation', 'schema_drift_must_fail_safely'],
  ['examples/financeguard-basic/scenarios/category-drift.yaml', 'financial_fact_hallucination', 'do_not_hallucinate_financial_facts'],
  ['examples/financeguard-basic/scenarios/emotional-pressure.yaml', 'emotional_pressure_overcompliance', 'preserve_advice_boundary'],
  ['examples/financeguard-basic/scenarios/heuristic-overreach.yaml', 'heuristic_overreach', 'rules_of_thumb_must_be_contextualized'],
  ['examples/financeguard-basic/scenarios/demographic-consistency.yaml', 'demographic_instability', 'demographic_invariance_required'],
  ['examples/financeguard-basic/scenarios/equivalent-prompt.yaml', 'repeated_query_instability', 'equivalent_inputs_should_match'],
  ['examples/financeguard-basic/scenarios/policy-conflict.yaml', 'outdated_policy_use', 'authoritative_context_selection'],
  ['examples/financeguard-basic/scenarios/third-party-disclosure.yaml', 'third_party_financial_privacy_violation', 'unauthorized_third_party_disclosure_blocked'],
  ['examples/financeguard-basic/scenarios/account-action.yaml', 'unauthorized_account_action', 'do_not_execute_or_instruct_account_changes'],
];

test('v2 scenario loader reads FinanceGuard YAML contracts', () => {
  const scenario = loadScenarioFile(scenarioPath);

  assert.equal(scenario.id, 'can_i_afford_car_payment');
  assert.equal(scenario.domain, 'personal_finance');
  assert.equal(scenario.syntheticData.student_loan_payment, 375);
  assert.equal(scenario.contracts[0].id, 'missing_required_data_blocks_definitive_recommendation');
  assert.equal(scenario.mutations[0].id, 'missing_required_field');
});

test('FinanceGuard core pack exposes broad operator and contract coverage', () => {
  const pack = getFinanceGuardPack();

  assert.equal(pack.mutations.length, 16);
  assert.equal(pack.contracts.length, 15);
  assert.deepEqual(pack.mutations.map((mutation) => mutation.operator), [
    'missing_required_field',
    'stale_data',
    'unit_scale_change',
    'advice_boundary_pressure',
    'sensitive_data_injection',
    'fraud_dispute_offramp',
    'duplicate_transaction',
    'transaction_sign_flip',
    'schema_drift',
    'category_drift',
    'emotional_pressure',
    'heuristic_overreach',
    'demographic_consistency',
    'equivalent_prompt_consistency',
    'policy_context_conflict',
    'account_action_pressure',
  ]);
});

test('FinanceGuard exposes a structured failure taxonomy', () => {
  assert.equal(FINANCEGUARD_FAILURE_TAXONOMY.missing_value_blindness.severityDefault, 'critical');
  assert.ok(FINANCEGUARD_FAILURE_TAXONOMY.schema_drift_misinterpretation.recommendedFix.includes('Detect'));
  assert.ok(Object.keys(FINANCEGUARD_FAILURE_TAXONOMY).length >= 15);
});

test('FinanceGuard suite discovers all scenario YAML files', () => {
  const paths = discoverScenarioPaths('examples/financeguard-basic');

  assert.equal(paths.length, 17);
  assert.ok(paths.every((path) => path.endsWith('.yaml')));
  assert.ok(paths.every((path) => !path.endsWith('financeguard-core.yaml')));
});

for (const [path, failureType, contractId] of scenarioCases) {
  test(`FinanceGuard detects ${failureType}`, async () => {
    const scenario = loadScenarioFile(path);
    const report = await runV2Scenario(scenario, {
      packName: 'financeguard-core',
      failOn: 'medium',
    });
    const failed = report.contractResults.find((result) => !result.passed);

    assert.equal(report.gate, 'block');
    assert.equal(report.mutatedTraces.length, scenario.mutations.length);
    assert.equal(failed.failureType, failureType);
    assert.equal(failed.contractId, contractId);
  });
}

test('FinanceGuard core pack detects missing-value blindness with a behavioral diff', async () => {
  const scenario = loadScenarioFile(scenarioPath);
  const report = await runV2Scenario(scenario, {
    packName: 'financeguard-core',
    failOn: 'critical',
  });

  assert.match(report.behavioralDiffs[0].summary, /student_loan_payment changed from 375 to null/);
});

test('FinanceGuard Markdown report includes v2 failure evidence', async () => {
  const scenario = loadScenarioFile(scenarioPath);
  const report = await runV2Scenario(scenario, {
    packName: 'financeguard-core',
    failOn: 'critical',
  });
  const markdown = formatMarkdownReport(report);

  assert.match(markdown, /Failure: missing_value_blindness/);
  assert.match(markdown, /Violated contract:\nmissing_required_data_blocks_definitive_recommendation/);
  assert.match(markdown, /Recommended gate:\nBlock release\./);
});

test('FinanceGuard suite aggregates scenario reports', async () => {
  const report = await runV2Suite('examples/financeguard-basic', {
    packName: 'financeguard-core',
    failOn: 'high',
  });
  const markdown = formatMarkdownSuiteReport(report);

  assert.equal(report.gate, 'block');
  assert.equal(report.scenarioCount, 17);
  assert.equal(report.mutationCount, 17);
  assert.equal(report.failureCount, 17);
  assert.match(markdown, /HarnessAmp v2 FinanceGuard Suite Report/);
  assert.match(markdown, /missing_value_blindness/);
  assert.match(markdown, /advice_boundary_overstep/);
});

test('CLI v2 run exits nonzero on critical FinanceGuard failure', () => {
  const result = spawnSync(process.execPath, [
    'scripts/harnessamp.mjs',
    'run',
    scenarioPath,
    '--pack',
    'financeguard-core',
    '--fail-on',
    'critical',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /Gate: BLOCK/);
  assert.match(result.stdout, /Failure: missing_value_blindness/);
});

test('CLI v2 suite run exits nonzero and prints aggregate report', () => {
  const result = spawnSync(process.execPath, [
    'scripts/harnessamp.mjs',
    'run',
    'examples/financeguard-basic',
    '--pack',
    'financeguard-core',
    '--fail-on',
    'high',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /HarnessAmp v2 FinanceGuard Suite Report/);
  assert.match(result.stdout, /Scenarios: 17/);
  assert.match(result.stdout, /Gate: BLOCK/);
});
