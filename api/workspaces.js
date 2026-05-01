import { badRequest, methodNotAllowed, readJsonBody, serverError, unauthorized } from './_http.js';
import { readSessionContext } from './_session.js';
import { createProject, createWorkspace, listProjectsForWorkspace, listWorkspacesForUser } from './_store.js';

export default async function handler(request, response) {
  try {
    const session = await readSessionContext(request);
    if (!session?.user) {
      unauthorized(response);
      return;
    }

    const resource = typeof request.query?.resource === 'string' ? request.query.resource : '';
    if (resource === 'projects') {
      const workspaceId = typeof request.query?.workspaceId === 'string' ? request.query.workspaceId : null;
      if (!workspaceId) {
        badRequest(response, 'Workspace id is required');
        return;
      }

      if (request.method === 'GET') {
        const projects = await listProjectsForWorkspace(session.user.id, workspaceId);
        response.status(200).json({ projects });
        return;
      }

      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        if (!body.name || typeof body.name !== 'string') {
          badRequest(response, 'Project name is required');
          return;
        }

        const project = await createProject(session.user.id, workspaceId, body.name.trim());
        response.status(200).json({ project });
        return;
      }

      methodNotAllowed(response, ['GET', 'POST']);
      return;
    }

    if (request.method === 'GET') {
      const workspaces = await listWorkspacesForUser(session.user.id);
      response.status(200).json({ workspaces });
      return;
    }

    if (request.method === 'POST') {
      const body = await readJsonBody(request);
      if (!body.name || typeof body.name !== 'string') {
        badRequest(response, 'Workspace name is required');
        return;
      }

      const workspace = await createWorkspace(session.user.id, body.name.trim());
      response.status(200).json({ workspace });
      return;
    }

    methodNotAllowed(response, ['GET', 'POST']);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Only workspace owners')) {
      response.status(403).json({ error: error.message });
      return;
    }
    serverError(response, error);
  }
}
