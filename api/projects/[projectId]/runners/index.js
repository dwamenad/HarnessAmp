import { readJsonBody, badRequest, methodNotAllowed, serverError, unauthorized } from '../../../../_http.js';
import { readSessionContext } from '../../../../_session.js';
import { createRunnerRegistration, listRunners } from '../../../../_store.js';

export default async function handler(request, response) {
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

    if (request.method === 'GET') {
      const runners = await listRunners({
        projectId,
        userId: session.user.id,
      });
      response.status(200).json({ runners });
      return;
    }

    if (request.method !== 'POST') {
      methodNotAllowed(response, ['GET', 'POST']);
      return;
    }

    const body = await readJsonBody(request);
    if (!body.name || !body.endpointUrl) {
      badRequest(response, 'Runner name and endpointUrl are required');
      return;
    }

    const runner = await createRunnerRegistration({
      projectId,
      userId: session.user.id,
      name: body.name.trim(),
      endpointUrl: body.endpointUrl.trim(),
      sharedSecret: body.sharedSecret?.trim() || null,
      status: body.status ?? 'active',
    });
    response.status(200).json({ runner });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Only owners and maintainers')) {
      response.status(403).json({ error: error.message });
      return;
    }
    serverError(response, error);
  }
}
