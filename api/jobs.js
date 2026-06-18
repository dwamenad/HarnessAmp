import { badRequest, methodNotAllowed, readJsonBody, serverError, unauthorized } from './_http.js';
import { readSessionContext } from './_session.js';
import { readWorkerServiceContext } from './_worker-auth.js';
import {
  cancelRunnerJob,
  claimRunnerJob,
  claimRunnerJobForWorker,
  getRunnerJob,
  getRunnerJobForWorker,
  listRunnerJobs,
  listRunnerJobsForWorker,
  retryRunnerJob,
  runRunnerJobForWorkerService,
  runRunnerJobWorker,
} from './_store.js';

export default async function handler(request, response) {
  try {
    const session = await readSessionContext(request);
    const worker = session?.user ? null : readWorkerServiceContext(request);
    if (!session?.user && !worker) {
      unauthorized(response);
      return;
    }

    const jobId = typeof request.query?.id === 'string' ? request.query.id : null;
    if (request.method === 'GET') {
      if (!jobId) {
        const projectId = typeof request.query?.projectId === 'string' ? request.query.projectId : null;
        if (!projectId) {
          badRequest(response, 'Job id or projectId is required');
          return;
        }
        const jobs = worker
          ? await listRunnerJobsForWorker({
            projectId,
            statuses: request.query?.status ?? request.query?.statuses ?? [],
            staleAfterMs: request.query?.staleAfterMs,
          })
          : await listRunnerJobs({
            projectId,
            userId: session.user.id,
            statuses: request.query?.status ?? request.query?.statuses ?? [],
          });
        response.status(200).json({ jobs: jobs.map(sanitizeJobForResponse) });
        return;
      }

      const job = worker
        ? await getRunnerJobForWorker({ jobId, projectId: requestProjectId(request) })
        : await getRunnerJob({
          jobId,
          userId: session.user.id,
        });
      if (!job) {
        response.status(404).json({ error: 'Job not found' });
        return;
      }

      response.status(200).json(sanitizeJobForResponse(job));
      return;
    }

    if (request.method === 'POST') {
      if (!jobId) {
        badRequest(response, 'Job id is required');
        return;
      }
      const action = request.query?.action;
      const body = await readJsonBody(request);

      if (action === 'cancel') {
        if (worker) {
          unauthorized(response, 'Worker service token cannot cancel jobs');
          return;
        }
        const job = await cancelRunnerJob({
          jobId,
          userId: session.user.id,
        });
        if (!job) {
          response.status(404).json({ error: 'Job not found' });
          return;
        }

        response.status(200).json(sanitizeJobForResponse(job));
        return;
      }

      if (action === 'claim') {
        const job = worker
          ? await claimRunnerJobForWorker({
            jobId,
            projectId: requestProjectId(request, body),
            workerId: body.workerId ?? request.query?.workerId,
          })
          : await claimRunnerJob({
            jobId,
            userId: session.user.id,
            workerId: body.workerId ?? request.query?.workerId,
          });
        if (!job) {
          response.status(409).json({ error: 'Job is not claimable yet' });
          return;
        }

        response.status(200).json(sanitizeJobForResponse(job));
        return;
      }

      if (action === 'run') {
        const job = worker
          ? await runRunnerJobForWorkerService({
            jobId,
            projectId: requestProjectId(request, body),
            workerId: body.workerId ?? request.query?.workerId,
          })
          : await runRunnerJobWorker({
            jobId,
            userId: session.user.id,
            workerId: body.workerId ?? request.query?.workerId,
          });
        if (!job) {
          response.status(409).json({ error: 'Job is not runnable yet' });
          return;
        }

        response.status(200).json(sanitizeJobForResponse(job));
        return;
      }

      if (action === 'retry') {
        if (worker) {
          unauthorized(response, 'Worker service token cannot retry jobs');
          return;
        }
        const job = await retryRunnerJob({
          jobId,
          userId: session.user.id,
        });
        if (!job) {
          response.status(404).json({ error: 'Job not found' });
          return;
        }

        response.status(200).json(sanitizeJobForResponse(job));
        return;
      }

      methodNotAllowed(response, ['GET', 'POST']);
      return;
    }

    methodNotAllowed(response, ['GET', 'POST']);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Only owners and maintainers')) {
      response.status(403).json({ error: error.message });
      return;
    }
    serverError(response, error);
  }
}

function sanitizeJobForResponse(job) {
  if (!job || typeof job !== 'object') return job;
  const executionTarget = job.payload?.executionTarget;
  if (!executionTarget || executionTarget.type !== 'local_http_tunnel') return job;
  const { runToken, tokenNonce, ...safeExecutionTarget } = executionTarget;
  return {
    ...job,
    payload: {
      ...(job.payload ?? {}),
      executionTarget: safeExecutionTarget,
    },
  };
}

function requestProjectId(request, body = {}) {
  const value = body.projectId ?? request.query?.projectId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
