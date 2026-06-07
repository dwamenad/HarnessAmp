import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import {
  generateLegalGuardScenarios,
  getLegalGuardGenerationMatrix,
  summarizeLegalGuardGeneratedCoverage,
} from '../src/v2/generators/legalguard-generator.js';
import { formatMarkdownSuiteReport } from '../src/v2/reporters.js';
import { runGeneratedV2Suite } from '../src/v2/suite-runner.js';

test('LegalGuard generated matrix expands curated fixtures into large suites', () => {
  const matrix = getLegalGuardGenerationMatrix();

  assert.equal(matrix.templateCount, 35);
  assert.equal(matrix.mutationVariantCount, 12);
  assert.equal(matrix.profileVariantCount, 5);
  assert.equal(matrix.promptVariantCount, 3);
  assert.equal(matrix.contextVariantCount, 10);
  assert.equal(matrix.tiers.smoke.scenarioCount, 400);
  assert.equal(matrix.tiers.core.scenarioCount, 4200);
  assert.equal(matrix.tiers.deep.scenarioCount, 21000);
  assert.equal(matrix.tiers.nightly.scenarioCount, 63000);
});

test('LegalGuard core generated scenarios cover all operators and contracts', () => {
  const scenarios = generateLegalGuardScenarios({ tier: 'core' });
  const coverage = summarizeLegalGuardGeneratedCoverage(scenarios);

  assert.equal(scenarios.length, 4200);
  assert.equal(coverage.templateCount, 35);
  assert.equal(coverage.mutationOperatorCount, 12);
  assert.equal(coverage.contractCount, 10);
  assert.equal(coverage.contextVariantCount, 10);
  assert.ok(coverage.mutationOperators.includes('deadline_urgency'));
  assert.ok(coverage.mutationOperators.includes('illegal_evasion_request'));
  assert.ok(coverage.contractIds.includes('deadline_safety'));
  assert.ok(coverage.contractIds.includes('unlawful_evasion_refusal'));
});

test('LegalGuard generated suites can be capped deterministically', () => {
  const scenarios = generateLegalGuardScenarios({ tier: 'nightly', maxScenarios: 125 });
  const coverage = summarizeLegalGuardGeneratedCoverage(scenarios);

  assert.equal(scenarios.length, 125);
  assert.equal(new Set(scenarios.map((scenario) => scenario.id)).size, 125);
  assert.ok(coverage.templateCount >= 1);
  assert.ok(coverage.mutationOperatorCount >= 1);
});

test('LegalGuard generated smoke suite runs through the v2 suite runner', async () => {
  const report = await runGeneratedV2Suite({
    packName: 'legalguard-core',
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
  assert.match(markdown, /HarnessAmp v2 LegalGuard Suite Report/);
  assert.match(markdown, /Generated Coverage/);
});

test('CLI can run a generated LegalGuard smoke suite', () => {
  const result = spawnSync(process.execPath, [
    'scripts/harnessamp.mjs',
    'run',
    '--pack',
    'legalguard-core',
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
