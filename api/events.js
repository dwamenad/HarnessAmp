import { readSessionCookie } from './_auth.js';
import { readJsonBody, badRequest, methodNotAllowed, serverError } from './_http.js';
import { saveEvent } from './_store.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    methodNotAllowed(response, 'POST');
    return;
  }

  try {
    const event = await readJsonBody(request);

    if (!event.name) {
      badRequest(response, 'Missing event name');
      return;
    }

    const session = readSessionCookie(request);
    const saved = await saveEvent(event, {
      userId: session?.userId ?? null,
      workspaceId: session?.currentWorkspaceId ?? null,
      projectId: event.projectId ?? null,
    });
    response.status(200).json({ ok: true, ...saved });
  } catch (error) {
    serverError(response, error);
  }
}
