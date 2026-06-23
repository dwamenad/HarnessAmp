export const TRACE_SCHEMA_VERSION = 'harnessamp.trace.v0.1';

export const TRACE_EVENT_TYPES = [
  'agent_invocation',
  'llm_call',
  'tool_call',
  'retrieval_call',
  'memory_read',
  'memory_write',
  'citation_selection',
  'adapter_request',
  'adapter_response',
  'evaluator_step',
  'failure_classification',
  'release_gate_decision',
  'worker_lifecycle',
];

export const FAILURE_ORIGINS = [
  'model_behavior',
  'retrieval',
  'tool_use',
  'policy_boundary',
  'adapter_contract',
  'execution_target',
  'worker_lifecycle',
  'evaluator',
  'unknown',
];

const TRACE_EVENT_TYPE_SET = new Set(TRACE_EVENT_TYPES);
const SECRET_KEY_PATTERN = /authorization|cookie|token|secret|password|credential|api[_-]?key|x-api-key|set-cookie/iu;
const API_KEY_PATTERN = /\b(sk-[A-Za-z0-9_-]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._~+/-]+=*)\b/gu;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/gu;

export function normalizeTraceBatch(payload, defaults = {}) {
  const batchDefaults = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? {
        ...defaults,
        runId: payload.run_id ?? payload.runId ?? defaults.runId,
        scenarioId: payload.scenario_id ?? payload.scenarioId ?? defaults.scenarioId,
        mutationId: payload.mutation_id ?? payload.mutationId ?? defaults.mutationId,
        traceId: payload.trace_id ?? payload.traceId ?? defaults.traceId,
        harnessId: payload.harness_id ?? payload.harnessId ?? defaults.harnessId,
        benchmarkId: payload.benchmark_id ?? payload.benchmarkId ?? defaults.benchmarkId,
        agentVersion: payload.agent_version ?? payload.agentVersion ?? defaults.agentVersion,
        executionTargetId: payload.execution_target_id ?? payload.executionTargetId ?? payload.target_id ?? payload.targetId ?? defaults.executionTargetId,
        adapterContractVersion: payload.adapter_contract_version ?? payload.adapterContractVersion ?? defaults.adapterContractVersion,
        workerId: payload.worker_id ?? payload.workerId ?? defaults.workerId,
      }
    : defaults;
  const rawEvents = Array.isArray(payload?.events)
    ? payload.events
    : Array.isArray(payload)
      ? payload
      : [payload?.event ?? payload].filter(Boolean);
  const events = rawEvents
    .map((event, index) => normalizeTraceEvent(event, { ...batchDefaults, batchIndex: index }))
    .filter(Boolean);
  return orderTraceEvents(events);
}

export function normalizeTraceEvent(value, defaults = {}) {
  if (!value || typeof value !== 'object') return null;
  const runId = stringField(value.run_id ?? value.runId ?? defaults.runId);
  const scenarioId = stringField(value.scenario_id ?? value.scenarioId ?? defaults.scenarioId);
  const mutationId = stringField(value.mutation_id ?? value.mutationId ?? defaults.mutationId);
  const eventType = normalizeEventType(value.event_type ?? value.eventType);
  const traceId = stringField(value.trace_id ?? value.traceId ?? defaults.traceId ?? `${runId || 'trace'}-${scenarioId || defaults.batchIndex || 0}`);
  const timestamp = normalizeTimestamp(value.timestamp ?? value.createdAt ?? defaults.timestamp);
  const safePayload = redactTracePayload(value.safe_payload ?? value.safePayload ?? value.metadata ?? {});
  const redactedPayload = redactTracePayload(value.redacted_payload ?? value.redactedPayload ?? value.payload ?? value.input ?? value.output ?? {});

  return {
    schema_version: TRACE_SCHEMA_VERSION,
    run_id: runId,
    scenario_id: scenarioId,
    mutation_id: mutationId,
    harness_id: stringField(value.harness_id ?? value.harnessId ?? defaults.harnessId),
    benchmark_id: stringField(value.benchmark_id ?? value.benchmarkId ?? defaults.benchmarkId),
    agent_version: stringField(value.agent_version ?? value.agentVersion ?? defaults.agentVersion),
    execution_target_id: stringField(value.execution_target_id ?? value.executionTargetId ?? value.target_id ?? value.targetId ?? defaults.executionTargetId),
    trace_id: traceId,
    span_id: stringField(value.span_id ?? value.spanId ?? `${eventType}-${defaults.batchIndex ?? 0}`),
    parent_span_id: stringField(value.parent_span_id ?? value.parentSpanId),
    event_type: eventType,
    timestamp,
    latency_ms: numberOrNull(value.latency_ms ?? value.latencyMs),
    status: stringField(value.status ?? 'ok'),
    input_summary: redactString(value.input_summary ?? value.inputSummary ?? summarizePayload(value.input ?? value.prompt ?? safePayload.input)),
    output_summary: redactString(value.output_summary ?? value.outputSummary ?? summarizePayload(value.output ?? value.response ?? redactedPayload.output)),
    safe_payload: safePayload,
    redacted_payload: redactedPayload,
    error_class: stringField(value.error_class ?? value.errorClass),
    failure_class: stringField(value.failure_class ?? value.failureClass),
    evidence_refs: stringArray(value.evidence_refs ?? value.evidenceRefs),
    tool_name: stringField(value.tool_name ?? value.toolName ?? value.name),
    retrieved_document_ids: stringArray(value.retrieved_document_ids ?? value.retrievedDocumentIds ?? value.document_ids ?? value.documentIds),
    citation_ids: stringArray(value.citation_ids ?? value.citationIds),
    cost_estimate: numberOrNull(value.cost_estimate ?? value.costEstimate),
    model_name: stringField(value.model_name ?? value.modelName ?? value.model),
    adapter_contract_version: stringField(value.adapter_contract_version ?? value.adapterContractVersion ?? defaults.adapterContractVersion),
    worker_id: stringField(value.worker_id ?? value.workerId ?? defaults.workerId),
  };
}

export function validateTraceEvents(events) {
  const errors = [];
  events.forEach((event, index) => {
    if (!event.run_id) errors.push(`events[${index}].run_id is required`);
    if (!event.trace_id) errors.push(`events[${index}].trace_id is required`);
    if (!TRACE_EVENT_TYPE_SET.has(event.event_type)) errors.push(`events[${index}].event_type is invalid`);
  });
  return { ok: errors.length === 0, errors };
}

export function orderTraceEvents(events = []) {
  return [...events].sort((left, right) => {
    const time = String(left.timestamp).localeCompare(String(right.timestamp));
    if (time !== 0) return time;
    return String(left.span_id).localeCompare(String(right.span_id));
  });
}

export function traceEventsForObservation(run, observation, rawObservation = observation) {
  const defaults = {
    runId: run.id,
    scenarioId: observation.scenarioId ?? rawObservation?.scenario_id,
    mutationId: observation.mutationId ?? rawObservation?.mutation_id,
    harnessId: run.harnessId,
    benchmarkId: run.benchmarkId || run.packId,
    agentVersion: run.agentVersion ?? run.metadata?.agentVersion,
    executionTargetId: run.executionTarget?.id ?? run.executionTarget?.runnerId ?? run.target?.id,
    workerId: run.workerId ?? run.jobId,
    timestamp: observation.createdAt ?? run.completedAt ?? run.started,
  };
  const supplied = [
    ...(Array.isArray(rawObservation?.trace_events) ? rawObservation.trace_events : []),
    ...(Array.isArray(rawObservation?.traceEvents) ? rawObservation.traceEvents : []),
  ];
  if (supplied.length) return normalizeTraceBatch(supplied, defaults);

  const traceId = rawObservation?.trace_id ?? rawObservation?.traceId ?? `${run.id}:${defaults.scenarioId}`;
  const events = [
    {
      ...defaults,
      trace_id: traceId,
      span_id: 'scenario-input',
      event_type: 'agent_invocation',
      input_summary: summarizePayload(rawObservation?.input ?? rawObservation?.query ?? observation.input),
      status: 'ok',
    },
    ...(Array.isArray(rawObservation?.tool_calls) ? rawObservation.tool_calls.map((toolCall, index) => ({
      ...defaults,
      trace_id: traceId,
      span_id: `tool-${index + 1}`,
      parent_span_id: 'scenario-input',
      event_type: 'tool_call',
      tool_name: toolCall.name ?? toolCall.toolName,
      input_summary: summarizePayload(toolCall.arguments ?? toolCall.input),
      output_summary: summarizePayload(toolCall.output),
      status: toolCall.status ?? 'ok',
      safe_payload: { toolName: toolCall.name ?? toolCall.toolName },
    })) : []),
    ...(Array.isArray(rawObservation?.curated_evidence) ? [{
      ...defaults,
      trace_id: traceId,
      span_id: 'retrieval-evidence',
      parent_span_id: 'scenario-input',
      event_type: 'retrieval_call',
      retrieved_document_ids: rawObservation.curated_evidence.map((item) => item.doc_id ?? item.id ?? item.url).filter(Boolean),
      output_summary: `${rawObservation.curated_evidence.length} retrieved evidence reference(s) captured.`,
      status: 'ok',
    }] : []),
    {
      ...defaults,
      trace_id: traceId,
      span_id: 'agent-response',
      parent_span_id: 'scenario-input',
      event_type: 'adapter_response',
      output_summary: summarizePayload(rawObservation?.final_answer ?? rawObservation?.output ?? observation.output),
      status: observation.status === 'fail' ? 'failed' : 'ok',
    },
    {
      ...defaults,
      trace_id: traceId,
      span_id: 'evaluator',
      parent_span_id: 'agent-response',
      event_type: 'evaluator_step',
      output_summary: observation.evaluatorReason,
      status: observation.status === 'fail' ? 'failed' : 'ok',
      failure_class: Array.isArray(rawObservation?.failure_modes) ? rawObservation.failure_modes[0] : '',
    },
  ];
  return normalizeTraceBatch(events, defaults);
}

export function traceEvidenceForFailure({ run, observation, rawObservation, failureClass = '', expected = '', actual = '' }) {
  const events = traceEventsForObservation(run, observation, rawObservation);
  return summarizeTraceEvents(events, {
    scenarioId: observation.scenarioId,
    mutationId: observation.mutationId,
    failureClass,
    expected,
    actual,
    agentVersion: run.agentVersion ?? run.metadata?.agentVersion ?? '',
  });
}

export function summarizeTraceEvents(events = [], context = {}) {
  const ordered = orderTraceEvents(events);
  const origin = classifyFailureOrigin(ordered, context.failureClass);
  const traceId = ordered[0]?.trace_id ?? '';
  const runId = ordered[0]?.run_id ?? '';
  const scenarioId = context.scenarioId ?? ordered[0]?.scenario_id ?? '';
  const mutationId = context.mutationId ?? ordered[0]?.mutation_id ?? '';
  const keyTraceEvents = ordered.slice(0, 8).map((event, index) => ({
    step: index + 1,
    eventType: event.event_type,
    label: traceEventLabel(event),
    status: event.status,
    timestamp: event.timestamp,
    origin: originForEvent(event),
  }));
  const toolCalls = ordered
    .filter((event) => event.event_type === 'tool_call')
    .map((event) => ({ name: event.tool_name || 'tool', status: event.status, summary: event.output_summary || event.input_summary }));
  const retrievedEvidence = uniqueStrings(ordered.flatMap((event) => event.retrieved_document_ids));
  const citations = uniqueStrings(ordered.flatMap((event) => event.citation_ids));
  const replayPayload = {
    run_id: runId,
    scenario_id: scenarioId,
    mutation_id: mutationId,
    trace_id: traceId,
    event_count: ordered.length,
  };
  return {
    traceId,
    origin,
    originLabel: humanizeOrigin(origin),
    keyTraceEvents,
    toolCalls,
    retrievedEvidence,
    citations,
    replayStatus: traceId ? 'replayable_trace_captured' : 'trace_not_recorded',
    replayPayload,
    regressionStatus: 'candidate',
    regressionCase: {
      scenario_id: scenarioId,
      mutation_id: mutationId,
      failure_class: context.failureClass,
      agent_version: context.agentVersion ?? '',
      expected_behavior: context.expected,
      actual_behavior: context.actual,
      trace_id: traceId,
      replay_payload: replayPayload,
      fixed_status: 'not_rerun',
      first_seen_at: ordered[0]?.timestamp ?? '',
      last_seen_at: ordered.at(-1)?.timestamp ?? '',
    },
  };
}

export function classifyFailureOrigin(events = [], failureClass = '') {
  const text = `${failureClass} ${events.map((event) => `${event.event_type} ${event.error_class} ${event.failure_class} ${event.tool_name} ${event.input_summary} ${event.output_summary}`).join(' ')}`.toLowerCase();
  if (/retrieval|citation|source|document|qrel/u.test(text)) return 'retrieval';
  if (/tool|function/u.test(text)) return 'tool_use';
  if (/policy|refund|mfa|privacy|authority|boundary|unauthorized/u.test(text)) return 'policy_boundary';
  if (/adapter|contract|schema|response format/u.test(text)) return 'adapter_contract';
  if (/timeout|latency|target|endpoint|http|network/u.test(text)) return 'execution_target';
  if (/worker|queue|claim|retry|lease/u.test(text)) return 'worker_lifecycle';
  if (/evaluator|classification|score/u.test(text)) return 'evaluator';
  if (/model|hallucination|instruction|answer|response/u.test(text)) return 'model_behavior';
  return 'unknown';
}

export function redactTracePayload(value) {
  if (Array.isArray(value)) return value.map(redactTracePayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? '[redacted]' : redactTracePayload(nested),
    ]));
  }
  if (typeof value === 'string') return redactString(value);
  return value ?? null;
}

export function redactString(value) {
  return String(value ?? '')
    .replace(API_KEY_PATTERN, '[redacted-secret]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(PHONE_PATTERN, '[redacted-phone]')
    .slice(0, 1000);
}

function normalizeEventType(value) {
  const eventType = String(value ?? '').trim();
  return eventType || 'agent_invocation';
}

function normalizeTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.valueOf()) ? new Date().toISOString() : date.toISOString();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringField(value) {
  return value == null ? '' : redactString(value).trim();
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((item) => redactString(item)));
}

function summarizePayload(value) {
  if (value == null) return '';
  if (typeof value === 'string') return redactString(value).slice(0, 280);
  try {
    return redactString(JSON.stringify(redactTracePayload(value))).slice(0, 280);
  } catch {
    return '[unserializable payload]';
  }
}

function traceEventLabel(event) {
  if (event.event_type === 'tool_call') return `${event.tool_name || 'tool'} ${event.status}`;
  if (event.event_type === 'retrieval_call') return `${event.retrieved_document_ids.length} retrieved document(s)`;
  if (event.event_type === 'citation_selection') return `${event.citation_ids.length} citation(s) selected`;
  return event.output_summary || event.input_summary || event.event_type;
}

function originForEvent(event) {
  return classifyFailureOrigin([event], event.failure_class);
}

function humanizeOrigin(origin) {
  return String(origin || 'unknown').replace(/_/gu, ' ');
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)));
}
