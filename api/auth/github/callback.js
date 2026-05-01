import {
  buildAbsoluteUrl,
  clearOauthCookie,
  exchangeGitHubCode,
  fetchGitHubProfile,
  readOauthCookie,
  setSessionCookie,
} from '../../_auth.js';
import { badRequest, redirect, serverError } from '../../_http.js';
import { ensureDefaultWorkspaceProject, getOrCreateGitHubUser } from '../../_store.js';

export default async function handler(request, response) {
  try {
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
  } catch (error) {
    serverError(response, error);
  }
}
