import { badRequest, methodNotAllowed, serverError, unauthorized } from './_http.js';
import { readSessionContext } from './_session.js';
import { cancelRunnerJob, getRunnerJob } from './_store.js';

export default async function handler(request, response) {
  try {
    const session = await readSessionContext(request);
    if (!session?.user) {
      unauthorized(response);
      return;
    }

    const jobId = typeof request.query?.id === 'string' ? request.query.id : null;
    if (!jobId) {
      badRequest(response, 'Job id is required');
      return;
    }

    if (request.method === 'GET') {
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

    if (request.method === 'POST' && request.query?.action === 'cancel') {
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

    methodNotAllowed(response, ['GET', 'POST']);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Only owners and maintainers')) {
      response.status(403).json({ error: error.message });
      return;
    }
    serverError(response, error);
  }
}
