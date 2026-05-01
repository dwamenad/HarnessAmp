import { unauthorized, serverError } from './_http.js';
import { readSessionContext } from './_session.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('allow', 'GET');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const session = await readSessionContext(request);
    if (!session?.user) {
      unauthorized(response);
      return;
    }

    response.status(200).json({
      user: session.user,
      workspaces: session.workspaces,
      currentWorkspaceId: session.currentWorkspaceId,
      defaultProjectId: session.defaultProjectId,
    });
  } catch (error) {
    serverError(response, error);
  }
}
