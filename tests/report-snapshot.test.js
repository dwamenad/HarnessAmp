import assert from 'node:assert/strict';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import diagnosticReportSchema from '../docs/schemas/diagnostic_report.schema.json' with { type: 'json' };
import { analyzeBundle, createDemoBundle } from '../src/core/engine.js';
import { compareReportSnapshots, pickComparableReport } from '../src/shared/report-comparison.js';
import { buildReportSnapshot } from '../src/shared/report-snapshot.js';

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(diagnosticReportSchema);

test('shared report snapshot matches the diagnostic report schema', () => {
  const bundle = createDemoBundle();
  const analysis = analyzeBundle(bundle, bundle.observations, { intensity: 2 });
  const snapshot = buildReportSnapshot({
    analysis,
    reportId: 'report_test',
    workspace: {
      workspaceName: 'Reliability Lab',
      projectName: 'Northstar',
    },
    projectId: 'proj_test',
    profileId: 'support-agent',
    presetId: 'profile-demo',
    thresholds: {
      minOverallScore: 65,
      minHoldoutPass: 60,
      maxGap: 20,
    },
    sourceBundle: bundle,
  });

  assert.equal(validate(snapshot), true, JSON.stringify(validate.errors, null, 2));
  assert.ok(snapshot.deltas.every((item) => typeof item.mutationId === 'string' && item.mutationId.length > 0));
  assert.ok(snapshot.findings.every((item) => typeof item.mutationId === 'string' && item.mutationId.length > 0));
  assert.ok(snapshot.failureCorpus.summary.entryCount > 0);
});

test('report comparison classifies improvements against a matching prior report', () => {
  const bundle = createDemoBundle();
  const analysis = analyzeBundle(bundle, bundle.observations, { intensity: 2 });
  const previous = buildReportSnapshot({
    analysis,
    reportId: 'report_previous',
    generatedAt: '2026-01-01T00:00:00.000Z',
    profileId: 'support-agent',
    presetId: 'profile-demo',
    thresholds: {
      minOverallScore: 65,
      minHoldoutPass: 60,
      maxGap: 20,
    },
    sourceBundle: bundle,
  });
  const current = {
    ...previous,
    id: 'report_current',
    generatedAt: '2026-01-02T00:00:00.000Z',
    summary: {
      ...previous.summary,
      overallScore: previous.summary.overallScore + 8,
      mutatedPassRate: previous.summary.mutatedPassRate + 12,
      robustnessDrop: Math.max(0, previous.summary.robustnessDrop - 6),
    },
    failureCorpus: {
      ...previous.failureCorpus,
      summary: {
        ...previous.failureCorpus.summary,
        entryCount: Math.max(0, previous.failureCorpus.summary.entryCount - 2),
        hiddenFailureCount: Math.max(0, previous.failureCorpus.summary.hiddenFailureCount - 1),
      },
    },
  };

  const picked = pickComparableReport(current, [previous]);
  const comparison = compareReportSnapshots(current, picked);

  assert.equal(picked.id, 'report_previous');
  assert.equal(comparison.status, 'improved');
  assert.equal(comparison.metrics.robustnessDrop.improved, true);
  assert.equal(comparison.metrics.failureEntries.improved, true);
});
