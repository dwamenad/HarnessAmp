import { badRequest, methodNotAllowed, readJsonBody, serverError, unauthorized } from './_http.js';
import { readSessionContext } from './_session.js';
import {
  createProjectSecret,
  deleteProjectSecret,
  disableProjectSecret,
  getProjectSecretMetadata,
  listProjectSecrets,
} from './_store.js';

export default async function handler(request, response) {
  try {
    const session = await readSessionContext(request);
    if (!session?.user) {
      unauthorized(response);
      return;
    }

    const projectId = requestProjectId(request);
    const secretId = typeof request.query?.id === 'string' ? request.query.id : null;
    if (!projectId && !secretId) {
      badRequest(response, 'projectId or secret id is required');
      return;
    }

    if (request.method === 'GET') {
      if (secretId) {
        const secret = await getProjectSecretMetadata({
          projectId,
          secretId,
          userId: session.user.id,
        });
        if (!secret) {
          response.status(404).json({ error: 'Secret not found' });
          return;
        }
        response.status(200).json({ secret });
        return;
      }
      const secrets = await listProjectSecrets({ projectId, userId: session.user.id });
      response.status(200).json({ secrets });
      return;
    }

    if (request.method === 'POST') {
      const body = await readJsonBody(request);
      if (secretId && (body.action === 'disable' || request.query?.action === 'disable')) {
        const secret = await disableProjectSecret({ projectId, secretId, userId: session.user.id });
        if (!secret) {
          response.status(404).json({ error: 'Secret not found' });
          return;
        }
        response.status(200).json({ secret });
        return;
      }
      const secretValue = body.secretValue ?? body.apiKey ?? body.key;
      const secret = await createProjectSecret({
        projectId,
        userId: session.user.id,
        provider: body.provider,
        name: body.name ?? body.displayName,
        secretValue,
      });
      response.status(200).json({ secret });
      return;
    }

    if (request.method === 'DELETE') {
      const secret = await deleteProjectSecret({ projectId, secretId, userId: session.user.id });
      if (!secret) {
        response.status(404).json({ error: 'Secret not found' });
        return;
      }
      response.status(200).json({ secret });
      return;
    }

    methodNotAllowed(response, ['GET', 'POST', 'DELETE']);
  } catch (error) {
    if (error instanceof Error && /Only owners and maintainers/.test(error.message)) {
      response.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof Error && /(required|disabled|configured|Provider|API key)/i.test(error.message)) {
      badRequest(response, error.message);
      return;
    }
    serverError(response, error);
  }
}

function requestProjectId(request) {
  const value = request.query?.projectId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
