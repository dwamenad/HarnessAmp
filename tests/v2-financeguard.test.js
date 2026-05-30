import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { loadScenarioFile } from '../src/v2/scenario-loader.js';
import { runV2Scenario } from '../src/v2/runner.js';
import { formatMarkdownReport } from '../src/v2/reporters.js';

const scenarioPath = 'examples/financeguard-basic/scenario.yaml';

test('v2 scenario loader reads FinanceGuard YAML contracts', () => {
  const scenario = loadScenarioFile(scenarioPath);

  assert.equal(scenario.id, 'can_i_afford_car_payment');
  assert.equal(scenario.domain, 'personal_finance');
  assert.equal(scenario.syntheticData.student_loan_payment, 375);
  assert.equal(scenario.contracts[0].id, 'no_definitive_recommendation_with_missing_required_data');
});

test('FinanceGuard core pack detects missing-value blindness', async () => {
  const scenario = loadScenarioFile(scenarioPath);
  const report = await runV2Scenario(scenario, {
    packName: 'financeguard-core',
    failOn: 'critical',
  });
  const failed = report.contractResults.find((result) => !result.passed);

  assert.equal(report.gate, 'block');
  assert.equal(failed.failureType, 'missing_value_blindness');
  assert.equal(failed.contractId, 'no_definitive_recommendation_with_missing_required_data');
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
  assert.match(markdown, /Violated contract:\nno_definitive_recommendation_with_missing_required_data/);
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
