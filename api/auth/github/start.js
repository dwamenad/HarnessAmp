import { buildGitHubAuthorizeUrl, isGitHubAuthConfigured, setOauthCookie, setSessionCookie } from '../../_auth.js';
import { redirect, serverError } from '../../_http.js';
import { seedDevSession } from '../../_store.js';

export default async function handler(request, response) {
  try {
    const next = typeof request.query?.next === 'string' ? request.query.next : '/app';

    if (process.env.HARNESSAMP_DEV_AUTH === '1') {
      const session = await seedDevSession();
      setSessionCookie(response, request, {
        userId: session.user.id,
        currentWorkspaceId: session.currentWorkspaceId,
      });
      redirect(response, next);
      return;
    }

    if (!isGitHubAuthConfigured()) {
      response.status(500).json({ error: 'GitHub OAuth is not configured' });
      return;
    }

    const oauth = buildGitHubAuthorizeUrl(request, next);
    setOauthCookie(response, request, {
      state: oauth.state,
      verifier: oauth.verifier,
      next,
    });
    redirect(response, oauth.url);
  } catch (error) {
    serverError(response, error);
  }
}
