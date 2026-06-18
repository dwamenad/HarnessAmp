import { badRequest, methodNotAllowed, readJsonBody, serverError, unauthorized } from './_http.js';
import { readSessionContext } from './_session.js';
import { createRunnerJob, createRunnerRegistration, listProjectReports, listRunners, saveEvent } from './_store.js';
import { normalizeExecutionTarget } from '../src/adapters/execution-targets.js';
import {
  createLocalTunnelTokenNonce,
  localTunnelRunTokenForNonce,
  preflightLocalHttpTunnelTarget,
  runLocalTunnelDoctor,
} from '../src/adapters/local-http-tunnel.js';

export default async function handler(request, response) {
  try {
    const session = await readSessionContext(request);
    if (!session?.user) {
      unauthorized(response);
      return;
    }

    const projectId = typeof request.query?.projectId === 'string' ? request.query.projectId : null;
    const resource = typeof request.query?.resource === 'string' ? request.query.resource : '';
    if (!projectId || !resource) {
      badRequest(response, 'projectId and resource are required');
      return;
    }

    if (resource === 'reports') {
      if (request.method !== 'GET') {
        methodNotAllowed(response, 'GET');
        return;
      }

      const reports = await listProjectReports({
        projectId,
        userId: session.user.id,
      });
      response.status(200).json({ reports });
      return;
    }

    if (resource === 'runners') {
      if (request.method === 'GET') {
        const runners = await listRunners({
          projectId,
          userId: session.user.id,
        });
        response.status(200).json({ runners });
        return;
      }

      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        if (!body.name || !body.endpointUrl) {
          badRequest(response, 'Runner name and endpointUrl are required');
          return;
        }

        const runner = await createRunnerRegistration({
          projectId,
          userId: session.user.id,
          name: body.name.trim(),
          endpointUrl: body.endpointUrl.trim(),
          sharedSecret: body.sharedSecret?.trim() || null,
          status: body.status ?? 'active',
        });
        response.status(200).json({ runner });
        return;
      }

      methodNotAllowed(response, ['GET', 'POST']);
      return;
    }

    if (resource === 'jobs') {
      if (request.method !== 'POST') {
        methodNotAllowed(response, 'POST');
        return;
      }

      const body = await readJsonBody(request);
      const requestedExecutionTarget = body.executionTarget ?? body.execution_target ?? null;
      if ((!requestedExecutionTarget && !body.runnerId && !body.adapter?.type) || !body.pack) {
        badRequest(response, 'executionTarget, runnerId, or adapter, and pack are required');
        return;
      }
      let executionTarget = null;
      try {
        executionTarget = normalizeExecutionTarget(requestedExecutionTarget, {
          runnerId: body.runnerId ?? null,
          adapter: body.adapter ?? null,
        });
      } catch (error) {
        badRequest(response, error instanceof Error ? error.message : String(error));
        return;
      }
      let localTunnelTokenNonce = null;
      let localTunnelRunToken = '';
      try {
        localTunnelTokenNonce = executionTarget.type === 'local_http_tunnel'
          ? createLocalTunnelTokenNonce()
          : null;
        localTunnelRunToken = localTunnelRunTokenForNonce(localTunnelTokenNonce);
      } catch (error) {
        await recordExecutionTargetValidation({
          projectId,
          userId: session.user.id,
          targetType: executionTarget.type,
          targetId: executionTarget.runnerId ?? executionTarget.secretRef ?? null,
          phase: 'before_preflight',
          error,
        });
        badRequest(response, error instanceof Error ? error.message : String(error));
        return;
      }
      const localTunnelMaxResponseBytes = executionTarget.type === 'local_http_tunnel'
        ? body.maxResponseBytes ?? body.localTunnelMaxResponseBytes ?? null
        : null;
      try {
        const preflight = await preflightLocalHttpTunnelTarget(executionTarget, {
          runToken: localTunnelRunToken,
          timeoutMs: body.preflightTimeoutMs ?? body.localTunnelPreflightTimeoutMs,
          maxResponseBytes: localTunnelMaxResponseBytes,
        });
        await recordExecutionTargetValidation({
          projectId,
          userId: session.user.id,
          targetType: executionTarget.type,
          targetId: executionTarget.runnerId ?? executionTarget.secretRef ?? null,
          phase: 'preflight',
          statusCode: 200,
          durationMs: preflight?.durationMs,
          contractVersion: preflight?.contractVersion,
        });
        if (executionTarget.type === 'local_http_tunnel') {
          executionTarget = {
            ...executionTarget,
            contractVersion: preflight?.contractVersion ?? '',
          };
        }
      } catch (error) {
        await recordExecutionTargetValidation({
          projectId,
          userId: session.user.id,
          targetType: executionTarget.type,
          targetId: executionTarget.runnerId ?? executionTarget.secretRef ?? null,
          phase: 'preflight',
          error,
        });
        badRequest(response, error instanceof Error ? error.message : String(error));
        return;
      }

      const job = await createRunnerJob({
        projectId,
        runnerId: body.runnerId ?? null,
        userId: session.user.id,
        pack: body.pack,
        thresholds: body.thresholds ?? {},
        profileId: body.profileId ?? null,
        presetId: body.presetId ?? null,
        adapter: body.adapter ?? null,
        executionTarget,
        localTunnelTokenNonce,
        localTunnelMaxResponseBytes,
        idempotencyKey: body.idempotencyKey ?? request.headers?.['idempotency-key'] ?? null,
        maxAttempts: body.maxAttempts ?? 1,
        timeoutMs: body.timeoutMs ?? 0,
        retryBackoffMs: body.retryBackoffMs ?? 0,
      });
      response.status(200).json({
        jobId: job.id,
        status: job.status,
        idempotencyKey: job.idempotencyKey,
        executionTarget: job.payload?.executionTarget?.safeMetadata ?? null,
        adapter: job.payload?.adapter ?? null,
        execution: job.result?.execution ?? {
          kind: job.payload?.executionTarget?.type === 'registered_runner'
            ? 'registered-runner'
            : job.payload?.executionTarget?.type === 'local_http_tunnel'
              ? 'http-tunnel'
              : 'adapter',
          type: job.payload?.executionTarget?.type ?? null,
          adapterType: job.payload?.adapter?.type ?? null,
          target: job.payload?.executionTarget?.safeMetadata?.endpointUrl ?? job.payload?.executionTarget?.routeUrl ?? job.payload?.adapter?.target ?? null,
          endpointUrl: job.payload?.executionTarget?.safeMetadata?.endpointUrl ?? null,
          label: job.payload?.executionTarget?.type === 'local_http_tunnel' ? 'Ephemeral local test target' : null,
          reuseLabel: job.payload?.executionTarget?.type === 'local_http_tunnel' ? 'Not reusable' : null,
          lifecycle: job.payload?.executionTarget?.type === 'local_http_tunnel' ? 'run-scoped' : null,
          runnerId: job.runnerId ?? null,
        },
        diagnostics: job.result?.diagnostics ?? null,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        workerId: job.workerId,
        claimedAt: job.claimedAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        failedAt: job.failedAt,
        canceledAt: job.canceledAt,
        cancelledAt: job.cancelledAt,
        lastError: job.lastError,
        retryReason: job.retryReason,
        nextRetryAt: job.nextRetryAt,
      });
      return;
    }

    if (resource === 'validate-target') {
      if (request.method !== 'POST') {
        methodNotAllowed(response, 'POST');
        return;
      }
      const body = await readJsonBody(request);
      let executionTarget = null;
      try {
        executionTarget = normalizeExecutionTarget(body.executionTarget ?? body.execution_target ?? null, {
          runnerId: body.runnerId ?? null,
          adapter: body.adapter ?? null,
        });
      } catch (error) {
        await recordExecutionTargetValidation({
          projectId,
          userId: session.user.id,
          targetType: 'unknown',
          targetId: null,
          phase: 'configuration',
          error,
        });
        badRequest(response, error instanceof Error ? error.message : String(error));
        return;
      }

      if (executionTarget.type !== 'local_http_tunnel') {
        const validation = {
          ok: true,
          checks: [
            { check: 'reachable', ok: true, message: 'Reusable registered runners and deployed adapter routes are validated during dispatch.' },
          ],
        };
        await recordExecutionTargetValidation({
          projectId,
          userId: session.user.id,
          targetType: executionTarget.type,
          targetId: executionTarget.runnerId ?? executionTarget.secretRef ?? null,
          phase: 'configuration',
          statusCode: 200,
        });
        response.status(200).json({ validation });
        return;
      }

      const startedAt = Date.now();
      let runToken = '';
      try {
        runToken = localTunnelRunTokenForNonce(createLocalTunnelTokenNonce());
      } catch (error) {
        const validation = validationFromError(error);
        await recordExecutionTargetValidation({
          projectId,
          userId: session.user.id,
          targetType: executionTarget.type,
          targetId: null,
          phase: 'before_preflight',
          error,
          durationMs: Date.now() - startedAt,
        });
        response.status(400).json({ validation });
        return;
      }

      const validation = await runLocalTunnelDoctor({
        url: executionTarget.endpointUrl,
        runToken,
        timeoutMs: body.timeoutMs ?? body.preflightTimeoutMs,
        maxResponseBytes: body.maxResponseBytes,
      });
      const failing = validation.checks.find((check) => !check.ok);
      await recordExecutionTargetValidation({
        projectId,
        userId: session.user.id,
        targetType: executionTarget.type,
        targetId: null,
        phase: failing?.check ?? 'doctor',
        status: validation.ok ? 'passed' : 'failed',
        statusCode: validation.ok ? 200 : null,
        durationMs: Date.now() - startedAt,
        failureClass: failing?.failureClass ?? null,
        contractVersion: validation.checks.find((check) => check.contractVersion)?.contractVersion ?? null,
      });
      response.status(validation.ok ? 200 : 400).json({ validation });
      return;
    }

    badRequest(response, 'Unknown project resource');
  } catch (error) {
    if (
      error instanceof Error
      && (error.message.includes('Only owners and maintainers') || error.message.includes('membership'))
    ) {
      response.status(403).json({ error: error.message });
      return;
    }
    serverError(response, error);
  }
}

async function recordExecutionTargetValidation({
  projectId,
  userId,
  targetType,
  targetId = null,
  phase,
  status = null,
  statusCode = null,
  durationMs = null,
  contractVersion = null,
  failureClass = null,
  error = null,
}) {
  const diagnostics = error?.diagnostics ?? {};
  await saveEvent({
    name: 'execution_target_validation',
    targetId,
    targetType,
    phase,
    status: status ?? (error || failureClass ? 'failed' : 'passed'),
    failureClass: failureClass ?? error?.failureClass ?? diagnostics.failureClass ?? null,
    statusCode: statusCode ?? diagnostics.httpStatus ?? null,
    durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : diagnostics.latencyMs ?? null,
    contractVersion: contractVersion ?? diagnostics.contractVersion ?? null,
    createdAt: new Date().toISOString(),
  }, {
    userId,
    projectId,
  });
}

function validationFromError(error) {
  return {
    ok: false,
    checks: [{
      check: 'configuration',
      ok: false,
      failureClass: error?.failureClass ?? 'execution_target_invalid',
      message: error instanceof Error ? error.message : String(error ?? 'Validation failed.'),
      action: 'Fix the execution target configuration and validate again.',
    }],
  };
}
