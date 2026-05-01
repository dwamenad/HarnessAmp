import assert from 'node:assert/strict';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import diagnosticReportSchema from '../docs/schemas/diagnostic_report.schema.json' with { type: 'json' };
import { analyzeBundle, createDemoBundle } from '../src/core/engine.js';
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
});
