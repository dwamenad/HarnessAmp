import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  classifyFailureOrigin,
  normalizeTraceBatch,
  redactTracePayload,
  summarizeTraceEvents,
  validateTraceEvents,
} from '../src/core/trace-provenance.js';

describe('trace provenance schema', () => {
  test('normalizes batches into canonical trace events and redacts secrets', () => {
    const events = normalizeTraceBatch({
      run_id: 'run-123',
      trace_id: 'trace-abc',
      events: [
        {
          event_type: 'tool_call',
          scenario_id: 'scenario-1',
          mutation_id: 'mutation-1',
          tool_name: 'lookup_customer',
          safe_payload: {
            headers: {
              authorization: 'Bearer sk-test-secret-value',
            },
            email: 'customer@example.com',
          },
          output_summary: 'Customer customer@example.com found.',
        },
      ],
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].run_id, 'run-123');
    assert.equal(events[0].trace_id, 'trace-abc');
    assert.equal(events[0].event_type, 'tool_call');
    assert.equal(events[0].safe_payload.headers.authorization, '[redacted]');
    assert.match(events[0].output_summary, /\[redacted-email\]/);
    assert.equal(validateTraceEvents(events).ok, true);
  });

  test('schema validation rejects unknown event types', () => {
    const events = normalizeTraceBatch({
      run_id: 'run-123',
      trace_id: 'trace-abc',
      event_type: 'raw_http_dump',
    });

    const validation = validateTraceEvents(events);
    assert.equal(validation.ok, false);
    assert.match(validation.errors.join('\n'), /event_type is invalid/);
  });

  test('summarizes trace events into failure provenance and regression metadata', () => {
    const events = normalizeTraceBatch({
      run_id: 'run-123',
      trace_id: 'trace-abc',
      scenario_id: 'retrieval_contradictory_evidence_001',
      mutation_id: 'contradiction_ignored',
      events: [
        { event_type: 'retrieval_call', retrieved_document_ids: ['policy-2026-section-4'], output_summary: 'Retrieved current policy.' },
        { event_type: 'citation_selection', citation_ids: ['stale-policy-2024'], output_summary: 'Selected stale citation.' },
        { event_type: 'failure_classification', failure_class: 'citation_answer_mismatch', status: 'failed' },
      ],
    });

    const evidence = summarizeTraceEvents(events, {
      scenarioId: 'retrieval_contradictory_evidence_001',
      mutationId: 'contradiction_ignored',
      failureClass: 'citation_answer_mismatch',
      expected: 'Use current policy.',
      actual: 'Used stale source.',
    });

    assert.equal(evidence.origin, 'retrieval');
    assert.equal(evidence.replayStatus, 'replayable_trace_captured');
    assert.equal(evidence.regressionCase.fixed_status, 'not_rerun');
    assert.deepEqual(evidence.retrievedEvidence, ['policy-2026-section-4']);
    assert.deepEqual(evidence.citations, ['stale-policy-2024']);
  });

  test('redaction removes obvious credentials and contact identifiers recursively', () => {
    const redacted = redactTracePayload({
      cookie: 'session=secret',
      nested: {
        apiKey: 'sk-live-secret-value',
        phone: '212-555-1212',
      },
    });

    assert.equal(redacted.cookie, '[redacted]');
    assert.equal(redacted.nested.apiKey, '[redacted]');
    assert.equal(redacted.nested.phone, '[redacted-phone]');
    assert.equal(classifyFailureOrigin([], 'adapter response schema mismatch'), 'adapter_contract');
  });
});
