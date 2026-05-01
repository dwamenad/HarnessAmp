import { readJsonBody, badRequest, methodNotAllowed, serverError, unauthorized } from '../../../../_http.js';
import { readSessionContext } from '../../../../_session.js';
import { createRunnerJob } from '../../../../_store.js';

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

    const projectId = request.query?.projectId;
    const body = await readJsonBody(request);
    if (!projectId || !body.runnerId || !body.pack) {
      badRequest(response, 'projectId, runnerId, and pack are required');
      return;
    }

    const job = await createRunnerJob({
      projectId,
      runnerId: body.runnerId,
      userId: session.user.id,
      pack: body.pack,
      thresholds: body.thresholds ?? {},
      profileId: body.profileId ?? null,
      presetId: body.presetId ?? null,
    });
    response.status(200).json({
      jobId: job.id,
      status: job.status,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Only owners and maintainers')) {
      response.status(403).json({ error: error.message });
      return;
    }
    serverError(response, error);
  }
}
