import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { loadScenarioFile } from '../src/v2/scenario-loader.js';
import { runV2Scenario } from '../src/v2/runner.js';
import { formatMarkdownReport, formatMarkdownSuiteReport } from '../src/v2/reporters.js';
import { getRetrievalGuardPack } from '../src/v2/packs/retrievalguard.js';
import { RETRIEVALGUARD_FAILURE_TAXONOMY } from '../src/v2/failure-taxonomy.js';
import { evaluateRetrievalGuardObservation } from '../src/v2/retrievalguard-evaluator.js';
import {
  generateRetrievalGuardScenarios,
  getRetrievalGuardGenerationMatrix,
  summarizeRetrievalGuardGeneratedCoverage,
} from '../src/v2/generators/retrievalguard-generator.js';
import { discoverScenarioPaths, runGeneratedV2Suite, runV2Suite } from '../src/v2/suite-runner.js';

const scenarioPath = 'examples/retrievalguard-basic/scenario.yaml';
const scenarioCases = [
  [scenarioPath, 'query_intent_drift', 'RG-C04'],
  ['examples/retrievalguard-basic/scenarios/trial-distractor.yaml', 'citation_mismatch', 'RG-C02'],
  ['examples/retrievalguard-basic/scenarios/remote-work-contradiction.yaml', 'contradiction_ignored', 'RG-C07'],
  ['examples/retrievalguard-basic/scenarios/api-stale-docs.yaml', 'stale_source_reliance', 'RG-C06'],
  ['examples/retrievalguard-basic/scenarios/california-addendum-missing.yaml', 'missing_bridge_evidence', 'RG-C09'],
  ['examples/retrievalguard-basic/scenarios/dosage-table-missing.yaml', 'overconfident_abstention_failure', 'RG-C01'],
  ['examples/retrievalguard-basic/scenarios/revenue-authority.yaml', 'source_authority_failure', 'RG-C02'],
  ['examples/retrievalguard-basic/scenarios/dataset-rank-shuffle.yaml', 'rank_position_bias', 'RG-C06'],
];

test('RetrievalGuard core pack exposes spec contracts and mutation families', () => {
  const pack = getRetrievalGuardPack();

  assert.equal(pack.id, 'retrievalguard-core');
  assert.equal(pack.contracts.length, 10);
  assert.equal(pack.mutations.length, 14);
  assert.deepEqual(pack.contracts.map((contract) => contract.id), [
    'RG-C01',
    'RG-C02',
    'RG-C03',
    'RG-C04',
    'RG-C05',
    'RG-C06',
    'RG-C07',
    'RG-C08',
    'RG-C09',
    'RG-C10',
  ]);
  assert.deepEqual(pack.mutations.map((mutation) => mutation.operator), [
    'query_paraphrase',
    'query_ambiguity',
    'distractor_document_injection',
    'contradictory_evidence_injection',
    'stale_document_injection',
    'missing_key_document',
    'citation_metadata_corruption',
    'retrieval_order_shuffle',
    'reranker_drift',
    'tool_failure',
    'context_compression_loss',
    'missing_bridge_document',
    'source_authority_swap',
    'answer_pressure',
  ]);
});

test('RetrievalGuard exposes a structured failure taxonomy', () => {
  assert.equal(RETRIEVALGUARD_FAILURE_TAXONOMY.citation_mismatch.severityDefault, 'critical');
  assert.ok(RETRIEVALGUARD_FAILURE_TAXONOMY.tool_failure_masking.recommendedFix.includes('timeouts'));
  assert.ok(Object.keys(RETRIEVALGUARD_FAILURE_TAXONOMY).length >= 14);
});

test('RetrievalGuard generated matrix expands curated fixtures into large suites', () => {
  const matrix = getRetrievalGuardGenerationMatrix();

  assert.equal(matrix.templateCount, 30);
  assert.equal(matrix.mutationVariantCount, 14);
  assert.equal(matrix.profileVariantCount, 5);
  assert.equal(matrix.promptVariantCount, 3);
  assert.equal(matrix.contextVariantCount, 10);
  assert.equal(matrix.tiers.smoke.scenarioCount, 400);
  assert.equal(matrix.tiers.core.scenarioCount, 4200);
  assert.equal(matrix.tiers.deep.scenarioCount, 21000);
  assert.equal(matrix.tiers.nightly.scenarioCount, 63000);
});

test('RetrievalGuard core generated scenarios cover all operators and contracts', () => {
  const scenarios = generateRetrievalGuardScenarios({ tier: 'core' });
  const coverage = summarizeRetrievalGuardGeneratedCoverage(scenarios);

  assert.equal(scenarios.length, 4200);
  assert.equal(coverage.templateCount, 30);
  assert.equal(coverage.mutationOperatorCount, 14);
  assert.equal(coverage.contractCount, 10);
  assert.equal(coverage.contextVariantCount, 10);
  assert.ok(coverage.mutationOperators.includes('citation_metadata_corruption'));
  assert.ok(coverage.mutationOperators.includes('tool_failure'));
  assert.ok(coverage.contractIds.includes('RG-C02'));
  assert.ok(coverage.contractIds.includes('RG-C10'));
});

test('RetrievalGuard generated suites can be capped deterministically', () => {
  const scenarios = generateRetrievalGuardScenarios({ tier: 'nightly', maxScenarios: 125 });
  const coverage = summarizeRetrievalGuardGeneratedCoverage(scenarios);

  assert.equal(scenarios.length, 125);
  assert.equal(new Set(scenarios.map((scenario) => scenario.id)).size, 125);
  assert.ok(coverage.templateCount >= 1);
  assert.ok(coverage.mutationOperatorCount >= 1);
});

test('RetrievalGuard suite discovers the eight static MVP scenarios', () => {
  const paths = discoverScenarioPaths('examples/retrievalguard-basic');

  assert.equal(paths.length, 8);
  assert.ok(paths.every((path) => path.endsWith('.yaml')));
  assert.ok(paths.every((path) => !path.endsWith('retrievalguard-core.yaml')));
});

test('RetrievalGuard scenario loader attaches fixture-backed qrels and expected claims', () => {
  const scenario = loadScenarioFile(scenarioPath);

  assert.deepEqual(scenario.fixtures.qrels.requiredDocuments, ['refund_policy_2026']);
  assert.equal(scenario.fixtures.qrels.requiredSpans[0].documentId, 'refund_policy_2026');
  assert.ok(scenario.fixtures.expected.forbiddenClaims.includes('cancellation always triggers a refund'));
});

test('RetrievalGuard evaluator scores fixture-backed retrieval and citation behavior', async () => {
  const scenario = loadScenarioFile('examples/retrievalguard-basic/scenarios/trial-distractor.yaml');
  const report = await runV2Scenario(scenario, {
    packName: 'retrievalguard-core',
    failOn: 'high',
  });
  const evaluation = report.retrievalEvaluations[0];

  assert.equal(evaluation.metrics.requiredDocumentRecall, 1);
  assert.equal(evaluation.metrics.evidencePrecision, 0.333);
  assert.equal(evaluation.metrics.citationFidelity, 0);
  assert.deepEqual(evaluation.failureSignals.missingRequiredCitations, []);
  assert.ok(evaluation.failureSignals.forbiddenClaimHits.includes('consumer refund policy controls the trial account'));
});

test('RetrievalGuard evaluator rewards supported fixture citations', () => {
  const scenario = loadScenarioFile(scenarioPath);
  const trace = {
    mutationId: 'manual-pass',
    finalAnswer: 'Annual subscriptions may be refunded within 30 days when eligibility conditions are met.',
    input: {
      syntheticData: scenario.syntheticData,
    },
    retrievedDocuments: scenario.syntheticData.retrieval.documents,
    citations: [{
      documentId: 'refund_policy_2026',
      title: 'Refund Policy 2026',
      snippet: 'Annual subscriptions may be refunded within 30 days when eligibility conditions are met.',
    }],
  };
  const evaluation = evaluateRetrievalGuardObservation(scenario, trace);

  assert.equal(evaluation.metrics.requiredDocumentRecall, 1);
  assert.equal(evaluation.metrics.citationFidelity, 1);
  assert.equal(evaluation.metrics.provenanceCompleteness, 1);
  assert.equal(evaluation.metrics.abstentionCalibration, 1);
  assert.ok(evaluation.overallScore > 0.8);
});

for (const [path, failureType, contractId] of scenarioCases) {
  test(`RetrievalGuard detects ${failureType}`, async () => {
    const scenario = loadScenarioFile(path);
    const report = await runV2Scenario(scenario, {
      packName: 'retrievalguard-core',
      failOn: 'medium',
    });
    const failed = report.contractResults.find((result) => !result.passed);

    assert.equal(report.gate, 'block');
    assert.equal(report.mutatedTraces.length, scenario.mutations.length);
    assert.equal(failed.failureType, failureType);
    assert.equal(failed.contractId, contractId);
  });
}

test('RetrievalGuard Markdown report includes retrieval failure evidence', async () => {
  const scenario = loadScenarioFile(scenarioPath);
  const report = await runV2Scenario(scenario, {
    packName: 'retrievalguard-core',
    failOn: 'high',
  });
  const markdown = formatMarkdownReport(report);

  assert.match(markdown, /Failure: query_intent_drift/);
  assert.match(markdown, /Violated contract:\nRG-C04/);
  assert.match(markdown, /Required documents: refund_policy_2026/);
  assert.match(markdown, /Forbidden claims present: cancellation always triggers a refund/);
  assert.match(markdown, /RetrievalGuard Evaluation/);
  assert.match(markdown, /citationFidelity: 0.000/);
  assert.match(markdown, /Signal: forbidden claims: cancellation always triggers a refund/);
  assert.match(markdown, /Recommended gate:\nBlock release\./);
});

test('RetrievalGuard suite aggregates scenario reports', async () => {
  const report = await runV2Suite('examples/retrievalguard-basic', {
    packName: 'retrievalguard-core',
    failOn: 'high',
  });
  const markdown = formatMarkdownSuiteReport(report);

  assert.equal(report.gate, 'block');
  assert.equal(report.scenarioCount, 8);
  assert.equal(report.mutationCount, 8);
  assert.equal(report.failureCount, 11);
  assert.match(markdown, /HarnessAmp v2 RetrievalGuard Suite Report/);
  assert.match(markdown, /citation_mismatch/);
  assert.match(markdown, /source_authority_failure/);
});

test('RetrievalGuard generated smoke suite runs through the v2 suite runner', async () => {
  const report = await runGeneratedV2Suite({
    packName: 'retrievalguard-core',
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
  assert.match(markdown, /HarnessAmp v2 RetrievalGuard Suite Report/);
  assert.match(markdown, /Generated Coverage/);
});

test('CLI can run the RetrievalGuard static MVP suite', () => {
  const result = spawnSync(process.execPath, [
    'scripts/harnessamp.mjs',
    'run',
    'examples/retrievalguard-basic',
    '--pack',
    'retrievalguard-core',
    '--fail-on',
    'high',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /HarnessAmp v2 RetrievalGuard Suite Report/);
  assert.match(result.stdout, /Scenarios: 8/);
  assert.match(result.stdout, /Gate: BLOCK/);
});

test('CLI can run a generated RetrievalGuard smoke suite', () => {
  const result = spawnSync(process.execPath, [
    'scripts/harnessamp.mjs',
    'run',
    '--pack',
    'retrievalguard-core',
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
