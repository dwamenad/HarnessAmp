import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import {
  generateHealthGuardScenarios,
  getHealthGuardGenerationMatrix,
  summarizeHealthGuardGeneratedCoverage,
} from '../src/v2/generators/healthguard-generator.js';
import { formatMarkdownSuiteReport } from '../src/v2/reporters.js';
import { runGeneratedV2Suite } from '../src/v2/suite-runner.js';

test('HealthGuard generated matrix expands curated fixtures into large suites', () => {
  const matrix = getHealthGuardGenerationMatrix();

  assert.equal(matrix.templateCount, 24);
  assert.equal(matrix.mutationVariantCount, 19);
  assert.equal(matrix.profileVariantCount, 5);
  assert.equal(matrix.promptVariantCount, 3);
  assert.equal(matrix.contextVariantCount, 10);
  assert.equal(matrix.tiers.smoke.scenarioCount, 400);
  assert.equal(matrix.tiers.core.scenarioCount, 4560);
  assert.equal(matrix.tiers.deep.scenarioCount, 22800);
  assert.equal(matrix.tiers.nightly.scenarioCount, 68400);
});

test('HealthGuard core generated scenarios cover all operators and contracts', () => {
  const scenarios = generateHealthGuardScenarios({ tier: 'core' });
  const coverage = summarizeHealthGuardGeneratedCoverage(scenarios);

  assert.equal(scenarios.length, 4560);
  assert.equal(coverage.templateCount, 24);
  assert.equal(coverage.mutationOperatorCount, 17);
  assert.equal(coverage.contractCount, 20);
  assert.equal(coverage.contextVariantCount, 10);
  assert.ok(coverage.mutationOperators.includes('red_flag_triage_mutation'));
  assert.ok(coverage.mutationOperators.includes('ehr_api_schema_drift_mutation'));
  assert.ok(coverage.contractIds.includes('portal_drafts_require_review_framing'));
  assert.ok(coverage.contractIds.includes('lab_explanations_preserve_units_and_avoid_diagnosis'));
});

test('HealthGuard generated suites can be capped deterministically', () => {
  const scenarios = generateHealthGuardScenarios({ tier: 'nightly', maxScenarios: 125 });
  const coverage = summarizeHealthGuardGeneratedCoverage(scenarios);

  assert.equal(scenarios.length, 125);
  assert.equal(new Set(scenarios.map((scenario) => scenario.id)).size, 125);
  assert.ok(coverage.templateCount >= 1);
  assert.ok(coverage.mutationOperatorCount >= 1);
});

test('HealthGuard generated smoke suite runs through the v2 suite runner', async () => {
  const report = await runGeneratedV2Suite({
    packName: 'healthguard-core',
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
  assert.match(markdown, /Generated Coverage/);
  assert.match(markdown, /Mutation operators: 5/);
  assert.match(markdown, /Context variants: 10/);
});

test('CLI can run a generated HealthGuard smoke suite', () => {
  const result = spawnSync(process.execPath, [
    'scripts/harnessamp.mjs',
    'run',
    '--pack',
    'healthguard-core',
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
