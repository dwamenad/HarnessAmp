import { saveEvent } from './_store.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const event = request.body && typeof request.body === 'object'
      ? request.body
      : JSON.parse(request.body || '{}');

    if (!event.name) {
      response.status(400).json({ error: 'Missing event name' });
      return;
    }

    const saved = await saveEvent(event);
    response.status(200).json({ ok: true, ...saved });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
}
