import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  classifyToolRisk,
  derivePermissionBoundary,
  deriveSchemaStatus,
  deriveToolchainReadiness,
  isLocalTunnelTarget,
  isSeededOrSampleEvidence,
  mapFailureClassToContractArea,
} from '../src/console/lib/toolchain-readiness.js';

describe('toolchain readiness model', () => {
  test('classifies read-only, retrieval, account mutation, refund, communication, and unknown tools', () => {
    assert.equal(classifyToolRisk({ name: 'knowledge_search', description: 'Search approved knowledge sources.' }), 'low');
    assert.equal(classifyToolRisk({ name: 'citation_lookup', description: 'Read citation metadata.' }), 'low');
    assert.equal(classifyToolRisk({ name: 'account_update', description: 'Update customer account state.' }), 'high');
    assert.equal(classifyToolRisk({ name: 'refund_request', description: 'Approve customer refund.' }), 'high');
    assert.equal(classifyToolRisk({ name: 'send_email', description: 'Send a customer email.' }), 'high');
    assert.equal(classifyToolRisk({ name: 'opaque_tool' }), 'medium');
  });

  test('blocks high-risk mutation tools without approval policy', () => {
    const readiness = deriveToolchainReadiness({
      target: {
        id: 'prod-support-agent',
        typeLabel: 'Registered runner',
        isProductionGrade: true,
        validationStatus: 'passed',
        readinessLabel: 'Healthy',
      },
      run: { usedRealExecution: true, runnerObservations: [{ tool_calls: [{ name: 'refund_request' }] }] },
      tools: [{ name: 'refund_request', description: 'Submit a refund to the billing system.', actionType: 'mutation' }],
      traceCapture: true,
      replayAvailable: true,
    });

    assert.equal(readiness.status, 'blocked');
    assert.equal(readiness.tools[0].riskLevel, 'high');
    assert.equal(readiness.releaseBlockers.some((item) => /approval boundary/.test(item.message)), true);
  });

  test('local tunnel targets cannot production certify', () => {
    const readiness = deriveToolchainReadiness({
      target: {
        id: 'local-preview',
        typeLabel: 'Local HTTPS tunnel',
        isEphemeral: true,
        validationStatus: 'passed',
        readinessLabel: 'Ephemeral',
      },
      run: { usedRealExecution: true },
      tools: [{ name: 'retrieval_search', description: 'Search approved evidence sources.', inputSchema: { type: 'object' } }],
      traceCapture: true,
      replayAvailable: true,
    });

    assert.equal(readiness.productionCapable, false);
    assert.equal(readiness.status, 'blocked');
    assert.equal(readiness.releaseBlockers.some((item) => item.id === 'local-tunnel-ephemeral'), true);
  });

  test('missing trace capture warns for samples and blocks real release evidence', () => {
    const sample = deriveToolchainReadiness({
      report: { evidenceMode: 'seeded-sample', benchmark: { seeded: true } },
      tools: [{ name: 'retrieval_search', description: 'Search approved sources.' }],
    });
    const real = deriveToolchainReadiness({
      target: { id: 'prod', typeLabel: 'Registered runner', isProductionGrade: true, validationStatus: 'passed', readinessLabel: 'Healthy' },
      run: { usedRealExecution: true },
      tools: [{ name: 'retrieval_search', description: 'Search approved sources.' }],
    });

    assert.equal(sample.warnings.some((item) => item.id === 'trace-capture-not-recorded'), true);
    assert.equal(real.releaseBlockers.some((item) => item.id === 'trace-capture-missing'), true);
  });

  test('derives schema status, permission boundary, failure areas, and gate profiles deterministically', () => {
    assert.equal(deriveSchemaStatus({ name: 'lookup', inputSchema: { type: 'object' } }), 'declared');
    assert.equal(derivePermissionBoundary({ name: 'email_delete' }, { permissionPolicy: { requireConfirmationFor: ['email_delete'] } }), 'approval_required');
    assert.equal(mapFailureClassToContractArea('refund_overreach'), 'unsafe side-effect failure');

    const readiness = deriveToolchainReadiness({
      report: { pack: 'RetrievalGuard', benchmark: { name: 'RetrievalGuard Smoke' } },
      failureEvidence: [{ failureClass: 'citation_answer_mismatch', traceEvidence: { replayPayload: { run_id: 'run-1' } } }],
    });

    assert.ok(readiness.recommendedGateProfiles.includes('Retrieval Agent Gate'));
    assert.ok(readiness.failureModesChecked.includes('retrieval/evidence grounding failure'));
  });

  test('centralizes sample and local tunnel certification safeguards', () => {
    assert.equal(isSeededOrSampleEvidence({ evidenceMode: 'seeded-sample', benchmark: { seeded: true } }), true);
    assert.equal(isSeededOrSampleEvidence({ report: { evidenceMode: 'runner-observation' }, run: { usedRealExecution: true } }), false);
    assert.equal(isLocalTunnelTarget({ type: 'local-http-tunnel' }), true);
    assert.equal(isLocalTunnelTarget({ typeLabel: 'Registered runner' }), false);
  });
});
