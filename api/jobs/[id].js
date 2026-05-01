import { badRequest, methodNotAllowed, serverError, unauthorized } from '../_http.js';
import { readSessionContext } from '../_session.js';
import { getRunnerJob } from '../_store.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    methodNotAllowed(response, 'GET');
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

    const job = await getRunnerJob({
      jobId,
      userId: session.user.id,
    });
    if (!job) {
      response.status(404).json({ error: 'Job not found' });
      return;
    }

    response.status(200).json(job);
  } catch (error) {
    serverError(response, error);
  }
}
