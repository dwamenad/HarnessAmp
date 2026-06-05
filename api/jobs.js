import { badRequest, methodNotAllowed, readJsonBody, serverError, unauthorized } from './_http.js';
import { readSessionContext } from './_session.js';
import {
  cancelRunnerJob,
  claimRunnerJob,
  getRunnerJob,
  listRunnerJobs,
  retryRunnerJob,
  runRunnerJobWorker,
} from './_store.js';

export default async function handler(request, response) {
  try {
    const session = await readSessionContext(request);
    if (!session?.user) {
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
        const jobs = await listRunnerJobs({
          projectId,
          userId: session.user.id,
          statuses: request.query?.status ?? request.query?.statuses ?? [],
        });
        response.status(200).json({ jobs });
        return;
      }

      const job = await getRunnerJob({
        jobId,
        userId: session.user.id,
      });
      if (!job) {
        response.status(404).json({ error: 'Job not found' });
        return;
      }

      response.status(200).json(job);
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
        const job = await cancelRunnerJob({
          jobId,
          userId: session.user.id,
        });
        if (!job) {
          response.status(404).json({ error: 'Job not found' });
          return;
        }

        response.status(200).json(job);
        return;
      }

      if (action === 'claim') {
        const job = await claimRunnerJob({
          jobId,
          userId: session.user.id,
          workerId: body.workerId ?? request.query?.workerId,
        });
        if (!job) {
          response.status(409).json({ error: 'Job is not claimable yet' });
          return;
        }

        response.status(200).json(job);
        return;
      }

      if (action === 'run') {
        const job = await runRunnerJobWorker({
          jobId,
          userId: session.user.id,
          workerId: body.workerId ?? request.query?.workerId,
        });
        if (!job) {
          response.status(409).json({ error: 'Job is not runnable yet' });
          return;
        }

        response.status(200).json(job);
        return;
      }

      if (action === 'retry') {
        const job = await retryRunnerJob({
          jobId,
          userId: session.user.id,
        });
        if (!job) {
          response.status(404).json({ error: 'Job not found' });
          return;
        }

        response.status(200).json(job);
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
