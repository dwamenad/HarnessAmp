import crypto from 'node:crypto';
import { appendSetCookie, parseCookies, serializeCookie, sessionCookieOptions } from './_cookies.js';

const SESSION_COOKIE = 'harnessamp_session';
const OAUTH_COOKIE = 'harnessamp_oauth';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function isGitHubAuthConfigured() {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export function buildGitHubAuthorizeUrl(request, next = '/app') {
  const state = randomToken(32);
  const verifier = randomToken(48);
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: buildAbsoluteUrl(request, '/api/auth/github/callback'),
    scope: 'read:user user:email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    allow_signup: 'false',
  });

  return {
    url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    state,
    verifier,
    next,
  };
}

export async function exchangeGitHubCode({ code, codeVerifier, redirectUri }) {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? 'GitHub token exchange failed');
  }
  return payload.access_token;
}

export async function fetchGitHubProfile(accessToken) {
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${accessToken}`,
    'user-agent': 'HarnessAmp',
  };

  const [userResponse, emailResponse] = await Promise.all([
    fetch('https://api.github.com/user', { headers }),
    fetch('https://api.github.com/user/emails', { headers }),
  ]);

  if (!userResponse.ok) {
    throw new Error(`GitHub user lookup failed with HTTP ${userResponse.status}`);
  }

  const user = await userResponse.json();
  const emails = emailResponse.ok ? await emailResponse.json() : [];
  const primaryEmail = Array.isArray(emails)
    ? emails.find((entry) => entry.primary)?.email ?? emails.find((entry) => entry.verified)?.email ?? null
    : null;

  return {
    githubId: String(user.id),
    login: user.login,
    name: user.name ?? user.login,
    email: primaryEmail,
    avatarUrl: user.avatar_url ?? null,
  };
}

export function setOauthCookie(response, request, payload) {
  appendSetCookie(response, serializeCookie(OAUTH_COOKIE, sign(payload), sessionCookieOptions(request, 60 * 10)));
}

export function readOauthCookie(request) {
  const cookies = parseCookies(request?.headers?.cookie ?? '');
  return verify(cookies[OAUTH_COOKIE] ?? '');
}

export function clearOauthCookie(response, request) {
  appendSetCookie(response, serializeCookie(OAUTH_COOKIE, '', sessionCookieOptions(request, 0)));
}

export function setSessionCookie(response, request, session) {
  const payload = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  appendSetCookie(response, serializeCookie(SESSION_COOKIE, sign(payload), sessionCookieOptions(request, SESSION_TTL_SECONDS)));
}

export function clearSessionCookie(response, request) {
  appendSetCookie(response, serializeCookie(SESSION_COOKIE, '', sessionCookieOptions(request, 0)));
}

export function readSessionCookie(request) {
  const cookies = parseCookies(request?.headers?.cookie ?? '');
  const payload = verify(cookies[SESSION_COOKIE] ?? '');
  if (!payload) return null;
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function buildAbsoluteUrl(request, path) {
  if (process.env.APP_BASE_URL) {
    return new URL(path, process.env.APP_BASE_URL).toString();
  }
  const host = request?.headers?.host;
  const protocol = request?.headers?.['x-forwarded-proto'] ?? (host?.includes('localhost') || host?.includes('127.0.0.1') ? 'http' : 'https');
  return `${protocol}://${host}${path}`;
}

export function randomToken(size = 32) {
  return base64url(crypto.randomBytes(size));
}

export function signSessionPayload(payload) {
  return sign(payload);
}

export function verifySessionPayload(token) {
  return verify(token);
}

function sign(payload) {
  const encoded = base64url(Buffer.from(JSON.stringify(payload)));
  const signature = base64url(crypto.createHmac('sha256', sessionSecret()).update(encoded).digest());
  return `${encoded}.${signature}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  const expected = base64url(crypto.createHmac('sha256', sessionSecret()).update(encoded).digest());
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function sessionSecret() {
  return process.env.SESSION_SECRET || 'harnessamp-dev-session-secret';
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
