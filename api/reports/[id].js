import { getReport } from '../_store.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('allow', 'GET');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const report = await getReport(request.query.id);
    if (!report) {
      response.status(404).json({ error: 'Report not found' });
      return;
    }

    response.status(200).json(report);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
}
