import { badRequest, methodNotAllowed, readJsonBody, serverError, unauthorized } from './_http.js';
import { validateReportSnapshot } from './_report-schema.js';
import { readSessionContext } from './_session.js';
import { getReport, saveReport } from './_store.js';

export default async function handler(request, response) {
  try {
    const session = await readSessionContext(request);
    if (!session?.user) {
      unauthorized(response);
      return;
    }

    if (request.method === 'POST') {
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
      return;
    }

    if (request.method === 'GET') {
      const reportId = typeof request.query?.id === 'string' ? request.query.id : null;
      if (!reportId) {
        badRequest(response, 'Missing report id');
        return;
      }

      const report = await getReport({
        id: reportId,
        userId: session.user.id,
      });
      if (!report) {
        response.status(404).json({ error: 'Report not found' });
        return;
      }

      response.status(200).json(report.snapshot);
      return;
    }

    methodNotAllowed(response, ['GET', 'POST']);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Only owners and maintainers')) {
      response.status(403).json({ error: error.message });
      return;
    }
    serverError(response, error);
  }
}
