import { badRequest, methodNotAllowed, readJsonBody, serverError, unauthorized } from './_http.js';
import { readSessionContext } from './_session.js';
import { createRunnerJob, createRunnerRegistration, listProjectReports, listRunners } from './_store.js';

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
      if ((!body.runnerId && !body.adapter?.type) || !body.pack) {
        badRequest(response, 'runnerId or adapter, and pack are required');
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
        idempotencyKey: body.idempotencyKey ?? request.headers?.['idempotency-key'] ?? null,
        maxAttempts: body.maxAttempts ?? 1,
        timeoutMs: body.timeoutMs ?? 0,
        retryBackoffMs: body.retryBackoffMs ?? 0,
      });
      response.status(200).json({
        jobId: job.id,
        status: job.status,
        idempotencyKey: job.idempotencyKey,
        adapter: job.payload?.adapter ?? null,
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
