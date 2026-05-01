import { badRequest, methodNotAllowed, serverError, unauthorized } from '../../../../_http.js';
import { readSessionContext } from '../../../../_session.js';
import { listProjectReports } from '../../../../_store.js';

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

    const projectId = request.query?.projectId;
    if (!projectId) {
      badRequest(response, 'Project id is required');
      return;
    }

    const reports = await listProjectReports({
      projectId,
      userId: session.user.id,
    });
    response.status(200).json({ reports });
  } catch (error) {
    if (error instanceof Error && error.message.includes('membership')) {
      response.status(403).json({ error: error.message });
      return;
    }
    serverError(response, error);
  }
}
