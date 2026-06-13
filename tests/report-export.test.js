import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildReportPayload,
  localRunReportId,
  reportCsv,
  reportMarkdown,
  reportPrintHtml,
} from '../src/console/report-export.js';

const harnesses = [
  {
    id: 'harness-1',
    name: 'harness-1',
    project: 'New Demo_UCLA',
    environment: 'local',
  },
];

const failedRetrievalRun = {
  id: 'run-retrievalguard-demo',
  name: 'RetrievalGuard Smoke',
  harness: 'harness-1 - local',
  harnessId: 'harness-1',
  pack: 'RetrievalGuard',
  packId: 'retrievalguard-core',
  tier: 'smoke',
  tierLabel: 'Smoke',
  status: 'completed',
  score: '78',
  critical: '4',
  observations: '50',
  started: '06/12/2026, 08:58 PM',
  timeline: ['Run queued', 'Runner claimed job', 'Evaluation completed', 'Report and failure links generated'],
  runnerObservations: [
    {
      scenario_id: 'retrieval_contradictory_evidence_001',
      mutation_id: 'contradiction_ignored',
      final_answer: 'The policy allows exceptions after manager approval.',
      tool_calls: [{ name: 'harness1_search' }],
      curated_evidence: [{ doc_id: 'policy-2026-section-4', url: 'file://policy-2026-section-4' }],
      failure_modes: ['contradiction_ignored'],
      metadata: {
        mode: 'contract-smoke',
        retrievalMetrics: {
          recall: 0.72,
          finalAnswerRecall: 0.68,
          precision: 0.64,
        },
      },
    },
  ],
  adapterMode: 'contract-smoke',
};

describe('report export payloads', () => {
  test('failed RetrievalGuard local reports include release evidence and source fidelity', () => {
    const report = buildReportPayload(localRunReportId(failedRetrievalRun), {
      localRuns: [failedRetrievalRun],
      harnesses,
    });

    assert.equal(report.releaseDecision, 'Block release');
    assert.equal(report.project, 'New Demo_UCLA');
    assert.equal(report.evidenceMode, 'runner-observation');
    assert.equal(report.adapterMode, 'contract-smoke');
    assert.equal(report.gate.thresholds[0].result, 'fail');
    assert.equal(report.failureEvidence.length, 1);
    assert.equal(report.failureEvidence[0].scenarioId, 'retrieval_contradictory_evidence_001');
    assert.equal(report.retrievalEvidence.metrics.citationPrecision, 0.64);
    assert.match(report.remediation.join('\n'), /qrel coverage/);
  });

  test('print, markdown, and csv exports include failed-run evidence sections', () => {
    const report = buildReportPayload(localRunReportId(failedRetrievalRun), {
      localRuns: [failedRetrievalRun],
      harnesses,
    });
    const html = reportPrintHtml(report);
    const markdown = reportMarkdown(report);
    const csv = reportCsv(report);

    assert.match(html, /Failure Evidence/);
    assert.match(html, /RetrievalGuard Source Fidelity/);
    assert.match(html, /Remediation Checklist/);
    assert.match(html, /Regression Plan/);
    assert.match(html, /Audit Trail/);
    assert.match(html, /Evidence mode/);
    assert.match(markdown, /Release gate/);
    assert.match(markdown, /runner-observation/);
    assert.match(csv, /recommended_control/);
    assert.match(csv, /retrieval_contradictory_evidence_001/);
  });

  test('passing local reports do not invent failure evidence', () => {
    const passingRun = {
      ...failedRetrievalRun,
      id: 'run-retrievalguard-passing',
      score: '94',
      critical: '0',
      runnerObservations: [],
      adapterMode: '',
    };
    const report = buildReportPayload(localRunReportId(passingRun), {
      localRuns: [passingRun],
      harnesses,
    });

    assert.equal(report.releaseDecision, 'Safe to release');
    assert.equal(report.failureEvidence.length, 0);
    assert.equal(report.regressionPlan.cases.length, 0);
  });
});
