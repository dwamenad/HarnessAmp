import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluateDiagnosisGate, formatCiGateSummary } from '../src/core/ci-gate.js';

test('CI gate returns pass when robustness metrics satisfy thresholds', () => {
  const gate = evaluateDiagnosisGate({
    summary: {
      originalPassRate: 95,
      mutatedPassRate: 88,
      robustnessDrop: 7,
      highestRiskFailureType: { severity: 'low' },
    },
  });

  assert.equal(gate.verdict, 'pass');
  assert.equal(gate.shouldFail, false);
});

test('CI gate returns warn for non-blocking score failures', () => {
  const gate = evaluateDiagnosisGate({
    summary: {
      originalPassRate: 95,
      mutatedPassRate: 58,
      robustnessDrop: 10,
      highestRiskFailureType: { severity: 'medium' },
    },
  }, {
    minHoldoutPass: 60,
    maxRobustnessGap: 20,
  });

  assert.equal(gate.verdict, 'warn');
  assert.equal(gate.shouldFail, false);
});

test('CI gate can fail on warn when configured', () => {
  const gate = evaluateDiagnosisGate({
    summary: {
      originalPassRate: 95,
      mutatedPassRate: 58,
      robustnessDrop: 10,
      highestRiskFailureType: { severity: 'medium' },
    },
  }, {
    minHoldoutPass: 60,
    maxRobustnessGap: 20,
    failOnWarn: true,
  });

  assert.equal(gate.verdict, 'warn');
  assert.equal(gate.shouldFail, true);
});

test('CI gate blocks on excessive Robustness Gap', () => {
  const gate = evaluateDiagnosisGate({
    summary: {
      originalPassRate: 96,
      mutatedPassRate: 52,
      robustnessDrop: 44,
      highestRiskFailureType: { severity: 'high' },
    },
  }, {
    maxRobustnessGap: 20,
  });

  assert.equal(gate.verdict, 'block');
  assert.equal(gate.shouldFail, true);
});

test('CI summary standardizes Robustness Gap wording', () => {
  const gate = evaluateDiagnosisGate({
    summary: {
      harnessName: 'Demo',
      project: 'HarnessAmp',
      originalPassRate: 90,
      mutatedPassRate: 75,
      robustnessDrop: 15,
      highestRiskFailureType: { label: 'Schema Overtrust', severity: 'high' },
    },
  });
  const summary = formatCiGateSummary({ summary: { harnessName: 'Demo', project: 'HarnessAmp' }, findings: [] }, gate);

  assert.match(summary, /Robustness Gap: 15 points/);
});

test('GitHub Action command path writes report, JSON, and failure corpus artifacts', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'harnessamp-action-'));
  const result = spawnSync(process.execPath, [
    'scripts/github-action.mjs',
    '--bundle',
    'examples/demo-bundle.json',
    '--max-mutations',
    '3',
    '--min-overall-score',
    '0',
    '--min-holdout-pass',
    '0',
    '--max-robustness-gap',
    '100',
    '--output-dir',
    outputDir,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const reportPath = join(outputDir, 'harnessamp-report.md');
  const jsonPath = join(outputDir, 'harnessamp-report.json');
  const corpusPath = join(outputDir, 'harnessamp-failure-corpus.json');

  assert.equal(existsSync(reportPath), true);
  assert.equal(existsSync(jsonPath), true);
  assert.equal(existsSync(corpusPath), true);
  assert.match(readFileSync(reportPath, 'utf8'), /Robustness Gap/);
  assert.match(readFileSync(corpusPath, 'utf8'), /"entries"/);
});
