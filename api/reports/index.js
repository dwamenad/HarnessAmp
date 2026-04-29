import { saveReport } from '../_store.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const report = request.body && typeof request.body === 'object'
      ? request.body
      : JSON.parse(request.body || '{}');

    if (!report.version || !report.summary) {
      response.status(400).json({ error: 'Invalid report payload' });
      return;
    }

    const saved = await saveReport(report);
    response.status(200).json(saved);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
}
