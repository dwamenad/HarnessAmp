import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import {
  generateFinanceGuardScenarios,
  getFinanceGuardGenerationMatrix,
  summarizeFinanceGuardGeneratedCoverage,
} from '../src/v2/generators/financeguard-generator.js';
import { formatMarkdownSuiteReport } from '../src/v2/reporters.js';
import { runGeneratedV2Suite } from '../src/v2/suite-runner.js';

test('FinanceGuard generated matrix expands curated fixtures into large suites', () => {
  const matrix = getFinanceGuardGenerationMatrix();

  assert.equal(matrix.templateCount, 20);
  assert.equal(matrix.mutationVariantCount, 17);
  assert.equal(matrix.profileVariantCount, 5);
  assert.equal(matrix.promptVariantCount, 3);
  assert.equal(matrix.contextVariantCount, 10);
  assert.equal(matrix.tiers.smoke.scenarioCount, 400);
  assert.equal(matrix.tiers.core.scenarioCount, 3400);
  assert.equal(matrix.tiers.deep.scenarioCount, 17000);
  assert.equal(matrix.tiers.nightly.scenarioCount, 51000);
});

test('FinanceGuard core generated scenarios cover all operators and contracts', () => {
  const scenarios = generateFinanceGuardScenarios({ tier: 'core' });
  const coverage = summarizeFinanceGuardGeneratedCoverage(scenarios);

  assert.equal(scenarios.length, 3400);
  assert.equal(coverage.templateCount, 20);
  assert.equal(coverage.mutationOperatorCount, 16);
  assert.equal(coverage.contractCount, 15);
  assert.equal(coverage.contextVariantCount, 10);
  assert.ok(coverage.mutationOperators.includes('missing_required_field'));
  assert.ok(coverage.mutationOperators.includes('account_action_pressure'));
  assert.ok(coverage.contractIds.includes('authoritative_context_selection'));
  assert.ok(coverage.contractIds.includes('unauthorized_third_party_disclosure_blocked'));
});

test('FinanceGuard generated suites can be capped deterministically', () => {
  const scenarios = generateFinanceGuardScenarios({ tier: 'nightly', maxScenarios: 125 });
  const coverage = summarizeFinanceGuardGeneratedCoverage(scenarios);

  assert.equal(scenarios.length, 125);
  assert.equal(new Set(scenarios.map((scenario) => scenario.id)).size, 125);
  assert.ok(coverage.templateCount >= 1);
  assert.ok(coverage.mutationOperatorCount >= 1);
});

test('FinanceGuard generated smoke suite runs through the v2 suite runner', async () => {
  const report = await runGeneratedV2Suite({
    packName: 'financeguard-core',
    generatedTier: 'smoke',
    failOn: 'high',
  });
  const markdown = formatMarkdownSuiteReport(report);

  assert.equal(report.generated.tier, 'smoke');
  assert.equal(report.scenarioCount, 400);
  assert.equal(report.mutationCount, 400);
  assert.equal(report.generated.coverage.templateCount, 8);
  assert.equal(report.generated.coverage.mutationOperatorCount, 5);
  assert.equal(report.generated.coverage.contextVariantCount, 10);
  assert.equal(report.gate, 'block');
  assert.match(markdown, /HarnessAmp v2 FinanceGuard Suite Report/);
  assert.match(markdown, /Generated Coverage/);
  assert.match(markdown, /Mutation operators: 5/);
});

test('CLI can run a generated FinanceGuard smoke suite', () => {
  const result = spawnSync(process.execPath, [
    'scripts/harnessamp.mjs',
    'run',
    '--pack',
    'financeguard-core',
    '--generated',
    'smoke',
    '--fail-on',
    'high',
    '--report',
    'json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const report = JSON.parse(result.stdout);

  assert.equal(result.status, 2, result.stderr);
  assert.equal(report.generated.tier, 'smoke');
  assert.equal(report.scenarioCount, 400);
  assert.equal(report.generated.coverage.mutationOperatorCount, 5);
  assert.equal(report.generated.coverage.contextVariantCount, 10);
  assert.equal(report.gate, 'block');
});
