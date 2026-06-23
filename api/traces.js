import { badRequest, methodNotAllowed, readJsonBody, serverError, unauthorized } from './_http.js';
import { readSessionContext } from './_session.js';
import {
  listTraceEvents,
  normalizeTraceEventsPayload,
  saveTraceEvents,
} from './_store.js';
import { validateTraceEvents } from '../src/core/trace-provenance.js';

export default async function handler(request, response) {
  try {
    const session = await readSessionContext(request);
    if (!session?.user) {
      unauthorized(response);
      return;
    }

    const projectId = typeof request.query?.projectId === 'string'
      ? request.query.projectId
      : session.defaultProjectId ?? null;
    const runId = typeof request.query?.runId === 'string' ? request.query.runId : null;
    const traceId = typeof request.query?.traceId === 'string' ? request.query.traceId : null;

    if (request.method === 'GET') {
      const events = await listTraceEvents({
        projectId,
        userId: session.user.id,
        runId,
        traceId,
      });
      response.status(200).json({ events });
      return;
    }

    if (request.method !== 'POST') {
      methodNotAllowed(response, ['GET', 'POST']);
      return;
    }

    const body = await readJsonBody(request);
    const events = normalizeTraceEventsPayload(body, {
      runId: runId ?? body.run_id ?? body.runId,
      scenarioId: body.scenario_id ?? body.scenarioId,
      mutationId: body.mutation_id ?? body.mutationId,
      traceId: body.trace_id ?? body.traceId,
      harnessId: body.harness_id ?? body.harnessId,
      benchmarkId: body.benchmark_id ?? body.benchmarkId,
      agentVersion: body.agent_version ?? body.agentVersion,
      executionTargetId: body.execution_target_id ?? body.executionTargetId ?? body.target_id ?? body.targetId,
      adapterContractVersion: body.adapter_contract_version ?? body.adapterContractVersion,
      workerId: body.worker_id ?? body.workerId,
    });

    const validation = validateTraceEvents(events);
    if (!validation.ok) {
      response.status(400).json({ error: 'Invalid trace events', details: validation.errors });
      return;
    }

    if (!events.length) {
      badRequest(response, 'At least one trace event is required');
      return;
    }

    const saved = await saveTraceEvents({
      events,
      projectId,
      userId: session.user.id,
    });
    response.status(200).json({
      ok: true,
      accepted: saved.accepted,
      traceIds: saved.traceIds,
      storage: saved.storage,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('membership')) {
      response.status(403).json({ error: error.message });
      return;
    }
    serverError(response, error);
  }
}
