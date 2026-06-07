import { badRequest, methodNotAllowed, readJsonBody, serverError, unauthorized } from './_http.js';
import { readSessionContext } from './_session.js';
import { getFailureWorkflow, recordFailureWorkflowAction } from './_store.js';

export default async function handler(request, response) {
  try {
    const session = await readSessionContext(request);
    if (!session?.user) {
      unauthorized(response);
      return;
    }

    const projectId = typeof request.query?.projectId === 'string' ? request.query.projectId : null;
    const failureId = typeof request.query?.failureId === 'string' ? request.query.failureId : null;
    if (!projectId || !failureId) {
      badRequest(response, 'projectId and failureId are required');
      return;
    }

    if (request.method === 'GET') {
      const workflow = await getFailureWorkflow({
        projectId,
        failureId,
        userId: session.user.id,
      });
      response.status(200).json({ workflow });
      return;
    }

    if (request.method === 'POST') {
      const body = await readJsonBody(request);
      if (!body.action || !body.status) {
        badRequest(response, 'action and status are required');
        return;
      }

      const workflow = await recordFailureWorkflowAction({
        projectId,
        failureId,
        userId: session.user.id,
        action: body.action,
        status: body.status,
        owner: body.owner,
        severity: body.severity,
        message: body.message,
        evidence: body.evidence,
      });
      response.status(200).json({ workflow });
      return;
    }

    methodNotAllowed(response, ['GET', 'POST']);
  } catch (error) {
    if (
      error instanceof Error
      && (error.message.includes('Only owners and maintainers') || error.message.includes('membership'))
    ) {
      response.status(403).json({ error: error.message });
      return;
    }
    serverError(response, error);
  }
}
