import { clearSessionCookie } from './_auth.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  clearSessionCookie(response, request);
  response.status(200).json({ ok: true });
}
