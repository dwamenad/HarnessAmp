import { readSessionCookie } from './_auth.js';
import { getSessionContext, seedDevSession } from './_store.js';

export async function readSessionContext(request) {
  if (process.env.HARNESSAMP_DEV_AUTH === '1') {
    return seedDevSession();
  }

  const session = readSessionCookie(request);
  if (!session?.userId) return null;
  const context = await getSessionContext(session.userId);
  if (!context) return null;
  return {
    ...context,
    currentWorkspaceId: session.currentWorkspaceId ?? context.currentWorkspaceId,
  };
}
