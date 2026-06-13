import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  completeRun,
  failurePayloadFromState,
  failureRowsFromState,
  getReportArtifact,
  getReportPayload,
  latestCompletedRealRun,
  listRealReports,
  reportRowFromPersistedReport,
  seededReportRowFromFixture,
  syncConsoleStateToRunReportState,
} from '../src/console/run-report-store.js';
import { reportCsv, reportMarkdown, reportPrintHtml, reportSlug } from '../src/console/report-export.js';

const harnesses = [
  {
    id: 'harness-1',
    name: 'harness-1',
    project: 'New Demo_UCLA',
    domain: 'knowledge / RAG',
    agentVersion: 'pat-jj/harness-1 local',
    endpoint: 'http://127.0.0.1:8788/harnessamp',
    authType: 'none',
    environment: 'local',
  },
];

const retrievalRun = {
  id: 'run-retrievalguard-real',
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
  observations: '400',
  started: '2026-06-13T12:00:00.000Z',
  completedAt: '2026-06-13T12:02:00.000Z',
  adapterMode: 'contract-smoke',
  timeline: ['Run queued', 'Runner claimed job', 'Evaluation completed', 'Report and failure links generated'],
  runnerObservations: [
    {
      scenario_id: 'retrieval_contradictory_evidence_001',
      mutation_id: 'contradiction_ignored',
      final_answer: 'The stale policy permits exceptions without HR approval.',
      curated_evidence: [{ doc_id: 'policy-2026-section-4', url: 'file://policy-2026-section-4' }],
      tool_calls: [{ name: 'harness1_search' }],
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
};

describe('run/report persistence store', () => {
  test('normalizes completed runs into reports, observations, failures, and artifacts', () => {
    const state = completeRun({ harnesses, runs: [], observations: [], failures: [], reports: [], artifacts: [] }, retrievalRun, {
      harnesses,
    });

    assert.equal(state.runs[0].status, 'completed');
    assert.equal(state.observations[0].evidenceMode, 'runner observation');
    assert.equal(state.failures[0].runId, retrievalRun.id);
    assert.equal(state.reports[0].runId, retrievalRun.id);
    assert.equal(state.reports[0].releaseDecision, 'Block release');
    assert.equal(state.reports[0].sourceFidelity, 'retrieval source fidelity attached');
    assert.equal(state.artifacts.length, 4);
    assert.deepEqual(state.artifacts.map((item) => item.format).sort(), ['csv', 'json', 'markdown', 'print_html']);
  });

  test('export artifacts match report export generators', () => {
    const state = completeRun({ harnesses }, retrievalRun, { harnesses });
    const report = getReportPayload(state, state.reports[0].id);

    assert.equal(getReportArtifact(state, report.id, 'print').content, reportPrintHtml(report));
    assert.equal(getReportArtifact(state, report.id, 'csv').content, reportCsv(report));
    assert.equal(getReportArtifact(state, report.id, 'markdown').content, reportMarkdown(report));
    assert.equal(getReportArtifact(state, report.id, 'json').content, JSON.stringify(report, null, 2));
  });

  test('real reports are ordered before seeded sample fixtures', () => {
    const state = syncConsoleStateToRunReportState({}, { harnesses, runs: [retrievalRun], reportContext: { harnesses } });
    const rows = [
      ...listRealReports(state).map(reportRowFromPersistedReport),
      seededReportRowFromFixture(['HealthGuard regression report', 'Patient Intake', 'Healthcare Intake', 'HealthGuard', '2026-06-05', '78', '4'], 0, reportSlug),
    ];

    assert.equal(rows[0].runId, retrievalRun.id);
    assert.match(rows[0].cells.at(-1), /runner observation \/ contract-smoke/);
    assert.equal(rows[1].seeded, true);
    assert.equal(rows[1].cells.at(-1), 'seeded sample');
    assert.equal(latestCompletedRealRun(state).id, retrievalRun.id);
  });

  test('failure rows link persisted failure evidence back to run and report', () => {
    const state = completeRun({ harnesses }, retrievalRun, { harnesses });
    const rows = failureRowsFromState(state);
    const payload = failurePayloadFromState(state, rows[0][7]);

    assert.equal(rows[0][0], 'Critical');
    assert.equal(payload.runId, retrievalRun.id);
    assert.equal(payload.reportId, state.reports[0].id);
    assert.match(payload.recommendedFix, /Block promotion/);
  });
});
