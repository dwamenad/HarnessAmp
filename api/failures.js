import { badRequest, methodNotAllowed, readJsonBody, serverError, unauthorized } from './_http.js';
import { readSessionContext } from './_session.js';
import {
  getFailureWorkflow,
  listFailureRegressionSuites,
  recordFailureWorkflowAction,
  upsertFailureRegressionSuite,
} from './_store.js';

export default async function handler(request, response) {
  try {
    const session = await readSessionContext(request);
    if (!session?.user) {
      unauthorized(response);
      return;
    }

    const projectId = typeof request.query?.projectId === 'string' ? request.query.projectId : null;
    const failureId = typeof request.query?.failureId === 'string' ? request.query.failureId : null;
    const resource = typeof request.query?.resource === 'string' ? request.query.resource : 'workflow';
    if (!projectId) {
      badRequest(response, 'projectId is required');
      return;
    }

    if (resource === 'regression-suites') {
      if (request.method === 'GET') {
        const suites = await listFailureRegressionSuites({
          projectId,
          userId: session.user.id,
        });
        response.status(200).json({ suites });
        return;
      }

      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        if (!body.suiteId || !body.name) {
          badRequest(response, 'suiteId and name are required');
          return;
        }
        const suite = await upsertFailureRegressionSuite({
          projectId,
          userId: session.user.id,
          suiteId: body.suiteId,
          name: body.name,
          description: body.description,
          failureId: body.failureId,
        });
        response.status(200).json({ suite });
        return;
      }

      methodNotAllowed(response, ['GET', 'POST']);
      return;
    }

    if (!failureId) {
      badRequest(response, 'failureId is required');
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
        comment: body.comment,
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
