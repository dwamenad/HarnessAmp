import {
  buildAbsoluteUrl,
  buildGitHubAuthorizeUrl,
  clearOauthCookie,
  clearSessionCookie,
  exchangeGitHubCode,
  fetchGitHubProfile,
  isGitHubAuthConfigured,
  readOauthCookie,
  setOauthCookie,
  setSessionCookie,
} from './_auth.js';
import { badRequest, methodNotAllowed, redirect, serverError, unauthorized } from './_http.js';
import { readSessionContext } from './_session.js';
import { ensureDefaultWorkspaceProject, getOrCreateGitHubUser, seedDevSession } from './_store.js';

export default async function handler(request, response) {
  const action = String(request.query?.action ?? '');

  try {
    if (request.method === 'GET' && action === 'github-start') {
      const next = typeof request.query?.next === 'string' ? request.query.next : '/app';

      if (process.env.HARNESSAMP_DEV_AUTH === '1') {
        const session = await seedDevSession();
        setSessionCookie(response, request, {
          userId: session.user.id,
          currentWorkspaceId: session.currentWorkspaceId,
          defaultProjectId: session.defaultProjectId,
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
      return;
    }

    if (request.method === 'GET' && action === 'github-callback') {
      const { code, state } = request.query ?? {};
      if (typeof code !== 'string' || typeof state !== 'string') {
        badRequest(response, 'Missing OAuth code or state');
        return;
      }

      const oauth = readOauthCookie(request);
      if (!oauth || oauth.state !== state || !oauth.verifier) {
        badRequest(response, 'OAuth state validation failed');
        return;
      }

      const accessToken = await exchangeGitHubCode({
        code,
        codeVerifier: oauth.verifier,
        redirectUri: buildAbsoluteUrl(request, '/api/auth/github/callback'),
      });
      const profile = await fetchGitHubProfile(accessToken);
      const user = await getOrCreateGitHubUser(profile);
      const { workspace, project } = await ensureDefaultWorkspaceProject(user);

      clearOauthCookie(response, request);
      setSessionCookie(response, request, {
        userId: user.id,
        currentWorkspaceId: workspace.id,
        defaultProjectId: project.id,
      });
      redirect(response, oauth.next || '/app');
      return;
    }

    if (request.method === 'GET' && action === 'session') {
      const session = await readSessionContext(request);
      if (!session?.user) {
        response.status(200).json({
          user: null,
          workspaces: [],
          currentWorkspaceId: null,
          defaultProjectId: null,
        });
        return;
      }

      response.status(200).json({
        user: session.user,
        workspaces: session.workspaces,
        currentWorkspaceId: session.currentWorkspaceId,
        defaultProjectId: session.defaultProjectId,
      });
      return;
    }

    if (request.method === 'POST' && action === 'logout') {
      clearSessionCookie(response, request);
      response.status(200).json({ ok: true });
      return;
    }

    methodNotAllowed(response, ['GET', 'POST']);
  } catch (error) {
    serverError(response, error);
  }
}
