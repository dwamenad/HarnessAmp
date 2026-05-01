import { badRequest, methodNotAllowed, serverError, unauthorized } from '../../../_http.js';
import { readSessionContext } from '../../../_session.js';
import { cancelRunnerJob } from '../../../_store.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    methodNotAllowed(response, 'POST');
    return;
  }

  try {
    const session = await readSessionContext(request);
    if (!session?.user) {
      unauthorized(response);
      return;
    }

    const jobId = request.query?.id;
    if (!jobId) {
      badRequest(response, 'Job id is required');
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

    response.status(200).json(job);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Only owners and maintainers')) {
      response.status(403).json({ error: error.message });
      return;
    }
    serverError(response, error);
  }
}
