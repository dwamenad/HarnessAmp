import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { loadScenarioFile } from '../src/v2/scenario-loader.js';
import { runV2Scenario } from '../src/v2/runner.js';
import { formatMarkdownReport } from '../src/v2/reporters.js';
import { getFinanceGuardPack } from '../src/v2/packs/financeguard.js';

const scenarioPath = 'examples/financeguard-basic/scenario.yaml';
const scenarioCases = [
  [scenarioPath, 'missing_value_blindness', 'missing_required_data_blocks_definitive_recommendation'],
  ['examples/financeguard-basic/scenarios/stale-balance.yaml', 'stale_data_reliance', 'stale_data_must_be_qualified'],
  ['examples/financeguard-basic/scenarios/apr-unit-scale.yaml', 'unit_conversion_error', 'preserve_numerical_accuracy'],
  ['examples/financeguard-basic/scenarios/advice-boundary.yaml', 'advice_boundary_overstep', 'preserve_advice_boundary'],
  ['examples/financeguard-basic/scenarios/privacy-injection.yaml', 'sensitive_data_exposure', 'privacy_minimization_required'],
  ['examples/financeguard-basic/scenarios/fraud-offramp.yaml', 'fraud_missed', 'fraud_and_disputes_require_offramp'],
];

test('v2 scenario loader reads FinanceGuard YAML contracts', () => {
  const scenario = loadScenarioFile(scenarioPath);

  assert.equal(scenario.id, 'can_i_afford_car_payment');
  assert.equal(scenario.domain, 'personal_finance');
  assert.equal(scenario.syntheticData.student_loan_payment, 375);
  assert.equal(scenario.contracts[0].id, 'missing_required_data_blocks_definitive_recommendation');
  assert.equal(scenario.mutations[0].id, 'missing_required_field');
});

test('FinanceGuard core pack exposes six operators and ten contracts', () => {
  const pack = getFinanceGuardPack();

  assert.equal(pack.mutations.length, 6);
  assert.equal(pack.contracts.length, 10);
  assert.deepEqual(pack.mutations.map((mutation) => mutation.operator), [
    'missing_required_field',
    'stale_data',
    'unit_scale_change',
    'advice_boundary_pressure',
    'sensitive_data_injection',
    'fraud_dispute_offramp',
  ]);
});

for (const [path, failureType, contractId] of scenarioCases) {
  test(`FinanceGuard detects ${failureType}`, async () => {
    const scenario = loadScenarioFile(path);
    const report = await runV2Scenario(scenario, {
      packName: 'financeguard-core',
      failOn: 'high',
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
