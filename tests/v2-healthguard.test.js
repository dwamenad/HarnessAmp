import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { loadScenarioFile } from '../src/v2/scenario-loader.js';
import { runV2Scenario } from '../src/v2/runner.js';
import { formatMarkdownReport, formatMarkdownSuiteReport } from '../src/v2/reporters.js';
import { getHealthGuardPack } from '../src/v2/packs/healthguard.js';
import { discoverScenarioPaths, runV2Suite } from '../src/v2/suite-runner.js';
import { HEALTHGUARD_FAILURE_TAXONOMY } from '../src/v2/failure-taxonomy.js';

const scenarioPath = 'examples/healthguard-basic/scenario.yaml';
const scenarioCases = [
  [scenarioPath, 'red_flag_missed', 'red_flags_require_urgent_escalation'],
  ['examples/healthguard-basic/scenarios/chest-pain-triage.yaml', 'clinician_replacement', 'preserve_human_clinician_oversight'],
  ['examples/healthguard-basic/scenarios/shortness-of-breath.yaml', 'red_flag_missed', 'red_flags_require_urgent_escalation'],
  ['examples/healthguard-basic/scenarios/infant-fever.yaml', 'unearned_clinical_specificity', 'missing_context_blocks_specific_guidance'],
  ['examples/healthguard-basic/scenarios/pregnancy-abdominal-pain.yaml', 'diagnosis_without_clinician', 'no_autonomous_diagnosis'],
  ['examples/healthguard-basic/scenarios/medication-interaction-check.yaml', 'medication_interaction_missed', 'medication_risk_requires_caution'],
  ['examples/healthguard-basic/scenarios/allergy-question.yaml', 'contraindication_missed', 'medication_risk_requires_caution'],
  ['examples/healthguard-basic/scenarios/acetaminophen-duplicate-ingredient.yaml', 'duplicate_ingredient_missed', 'medication_risk_requires_caution'],
  ['examples/healthguard-basic/scenarios/lab-result-explanation.yaml', 'test_result_hallucination', 'no_clinical_fact_hallucination'],
  ['examples/healthguard-basic/scenarios/discharge-instruction-explanation.yaml', 'medication_instruction_distortion', 'preserve_medication_units_and_instructions'],
  ['examples/healthguard-basic/scenarios/clinical-note-summarization.yaml', 'clinical_negation_flip', 'clinical_summary_source_fidelity'],
  ['examples/healthguard-basic/scenarios/patient-portal-message-draft.yaml', 'phi_exposure', 'phi_minimization_required'],
];

test('v2 scenario loader reads HealthGuard YAML contracts', () => {
  const scenario = loadScenarioFile(scenarioPath);

  assert.equal(scenario.id, 'headache_triage');
  assert.equal(scenario.domain, 'healthcare');
  assert.equal(scenario.syntheticData.synthetic, true);
  assert.equal(scenario.syntheticData.real_patient_data, false);
  assert.equal(scenario.contracts[0].id, 'red_flags_require_urgent_escalation');
  assert.equal(scenario.mutations[0].id, 'red_flag_triage_mutation');
});

test('HealthGuard core pack exposes MVP operator and contract coverage', () => {
  const pack = getHealthGuardPack();

  assert.equal(pack.mutations.length, 8);
  assert.equal(pack.contracts.length, 10);
  assert.deepEqual(pack.mutations.map((mutation) => mutation.operator), [
    'red_flag_triage_mutation',
    'incomplete_clinical_context_mutation',
    'medication_safety_mutation',
    'dose_unit_mutation',
    'clinical_negation_flip',
    'hallucinated_test_result_mutation',
    'phi_sensitive_data_injection',
    'human_oversight_pressure_mutation',
  ]);
});

test('HealthGuard exposes a structured failure taxonomy', () => {
  assert.equal(HEALTHGUARD_FAILURE_TAXONOMY.red_flag_missed.severityDefault, 'critical');
  assert.ok(HEALTHGUARD_FAILURE_TAXONOMY.phi_exposure.recommendedFix.includes('Redact'));
  assert.ok(Object.keys(HEALTHGUARD_FAILURE_TAXONOMY).length >= 20);
});

test('HealthGuard suite discovers all synthetic scenario YAML files', () => {
  const paths = discoverScenarioPaths('examples/healthguard-basic');

  assert.equal(paths.length, 12);
  assert.ok(paths.every((path) => path.endsWith('.yaml')));
  assert.ok(paths.every((path) => !path.endsWith('healthguard-core.yaml')));
});

for (const [path, failureType, contractId] of scenarioCases) {
  test(`HealthGuard detects ${failureType}`, async () => {
    const scenario = loadScenarioFile(path);
    const report = await runV2Scenario(scenario, {
      packName: 'healthguard-core',
      failOn: 'high',
    });
    const failed = report.contractResults.find((result) => (
      !result.passed && result.failureType === failureType && result.contractId === contractId
    ));

    assert.equal(report.gate, 'block');
    assert.equal(report.mutatedTraces.length, scenario.mutations.length);
    assert.ok(failed, `Expected ${failureType} for ${contractId}`);
  });
}

test('HealthGuard catches prescribing overstep in medication-risk scenarios', async () => {
  const scenario = loadScenarioFile('examples/healthguard-basic/scenarios/medication-interaction-check.yaml');
  const report = await runV2Scenario(scenario, {
    packName: 'healthguard-core',
    failOn: 'critical',
  });

  assert.ok(report.contractResults.some((result) => (
    !result.passed
    && result.failureType === 'prescribing_overstep'
    && result.contractId === 'no_treatment_selection_or_prescribing'
  )));
});

test('HealthGuard report sanitizer removes synthetic PHI-like identifiers', async () => {
  const scenario = loadScenarioFile('examples/healthguard-basic/scenarios/patient-portal-message-draft.yaml');
  const report = await runV2Scenario(scenario, {
    packName: 'healthguard-core',
    failOn: 'critical',
  });
  const reportJson = JSON.stringify(report);
  const markdown = formatMarkdownReport(report);

  assert.doesNotMatch(reportJson, /MRN-HG-441992|01\/04\/1982|212-555-0198/);
  assert.doesNotMatch(markdown, /MRN-HG-441992|01\/04\/1982|212-555-0198/);
  assert.match(reportJson, /\[REDACTED/);
  assert.match(markdown, /\[REDACTED/);
});

test('HealthGuard Markdown report includes v2 failure evidence', async () => {
  const scenario = loadScenarioFile(scenarioPath);
  const report = await runV2Scenario(scenario, {
    packName: 'healthguard-core',
    failOn: 'critical',
  });
  const markdown = formatMarkdownReport(report);

  assert.match(markdown, /Failure: red_flag_missed/);
  assert.match(markdown, /Violated contract:\nred_flags_require_urgent_escalation/);
  assert.match(markdown, /Recommended gate:\nBlock release\./);
});

test('HealthGuard suite aggregates scenario reports', async () => {
  const report = await runV2Suite('examples/healthguard-basic', {
    packName: 'healthguard-core',
    failOn: 'high',
  });
  const markdown = formatMarkdownSuiteReport(report);

  assert.equal(report.gate, 'block');
  assert.equal(report.scenarioCount, 12);
  assert.equal(report.mutationCount, 12);
  assert.ok(report.failureCount >= 12);
  assert.match(markdown, /HarnessAmp v2 HealthGuard Suite Report/);
  assert.match(markdown, /red_flag_missed/);
  assert.match(markdown, /phi_exposure/);
});

test('CLI v2 run exits nonzero on critical HealthGuard failure', () => {
  const result = spawnSync(process.execPath, [
    'scripts/harnessamp.mjs',
    'run',
    scenarioPath,
    '--pack',
    'healthguard-core',
    '--fail-on',
    'critical',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /Gate: BLOCK/);
  assert.match(result.stdout, /Failure: red_flag_missed/);
});

test('CLI v2 HealthGuard suite run exits nonzero and prints aggregate report', () => {
  const result = spawnSync(process.execPath, [
    'scripts/harnessamp.mjs',
    'run',
    'examples/healthguard-basic',
    '--pack',
    'healthguard-core',
    '--fail-on',
    'high',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /HarnessAmp v2 HealthGuard Suite Report/);
  assert.match(result.stdout, /Scenarios: 12/);
  assert.match(result.stdout, /Gate: BLOCK/);
});
