import { readJsonBody, badRequest, methodNotAllowed, serverError, unauthorized } from '../_http.js';
import { readSessionContext } from '../_session.js';
import { createWorkspace, listWorkspacesForUser } from '../_store.js';

export default async function handler(request, response) {
  try {
    const session = await readSessionContext(request);
    if (!session?.user) {
      unauthorized(response);
      return;
    }

    if (request.method === 'GET') {
      const workspaces = await listWorkspacesForUser(session.user.id);
      response.status(200).json({ workspaces });
      return;
    }

    if (request.method !== 'POST') {
      methodNotAllowed(response, ['GET', 'POST']);
      return;
    }

    const body = await readJsonBody(request);
    if (!body.name || typeof body.name !== 'string') {
      badRequest(response, 'Workspace name is required');
      return;
    }

    const workspace = await createWorkspace(session.user.id, body.name.trim());
    response.status(200).json({ workspace });
  } catch (error) {
    serverError(response, error);
  }
}
