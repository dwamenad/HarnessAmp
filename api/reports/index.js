import { readJsonBody, badRequest, methodNotAllowed, serverError, unauthorized } from '../_http.js';
import { validateReportSnapshot } from '../_report-schema.js';
import { readSessionContext } from '../_session.js';
import { saveReport } from '../_store.js';

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

    const body = await readJsonBody(request);
    const snapshot = body.snapshot ?? body;
    const projectId = body.projectId ?? snapshot?.suite?.projectId;
    if (!projectId) {
      badRequest(response, 'Missing projectId');
      return;
    }

    const validation = validateReportSnapshot(snapshot);
    if (!validation.ok) {
      response.status(400).json({ error: 'Invalid report payload', details: validation.errors });
      return;
    }

    const saved = await saveReport({
      snapshot,
      projectId,
      userId: session.user.id,
    });
    response.status(200).json(saved);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Only owners and maintainers')) {
      response.status(403).json({ error: error.message });
      return;
    }
    serverError(response, error);
  }
}
