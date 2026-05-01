import { readJsonBody, badRequest, methodNotAllowed, serverError, unauthorized } from '../../../../_http.js';
import { readSessionContext } from '../../../../_session.js';
import { createProject, listProjectsForWorkspace } from '../../../../_store.js';

export default async function handler(request, response) {
  try {
    const session = await readSessionContext(request);
    if (!session?.user) {
      unauthorized(response);
      return;
    }

    const workspaceId = request.query?.id;
    if (!workspaceId) {
      badRequest(response, 'Workspace id is required');
      return;
    }

    if (request.method === 'GET') {
      const projects = await listProjectsForWorkspace(session.user.id, workspaceId);
      response.status(200).json({ projects });
      return;
    }

    if (request.method !== 'POST') {
      methodNotAllowed(response, ['GET', 'POST']);
      return;
    }

    const body = await readJsonBody(request);
    if (!body.name || typeof body.name !== 'string') {
      badRequest(response, 'Project name is required');
      return;
    }

    const project = await createProject(session.user.id, workspaceId, body.name.trim());
    response.status(200).json({ project });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Only workspace owners')) {
      response.status(403).json({ error: error.message });
      return;
    }
    serverError(response, error);
  }
}
