# GitHub OAuth Setup

HarnessAmp already includes GitHub OAuth routes for hosted and local API mode.

## Routes

| Purpose | Route |
| --- | --- |
| Start login | `/api/auth/github/start` |
| OAuth callback | `/api/auth/github/callback` |
| Current session | `/api/session` |
| Logout | `/api/logout` |

The browser app uses the login route through the **GitHub login** button.

## Create the GitHub OAuth App

1. Go to GitHub **Settings**.
2. Open **Developer settings**.
3. Open **OAuth Apps**.
4. Click **New OAuth App**.
5. Use these values for local development:

```text
Application name: HarnessAmp Local
Homepage URL: http://127.0.0.1:4173
Authorization callback URL: http://127.0.0.1:4173/api/auth/github/callback
```

6. Copy the generated client id and client secret.

For Vercel production, create a second OAuth app or update the callback to:

```text
Homepage URL: https://harnessamp.vercel.app
Authorization callback URL: https://harnessamp.vercel.app/api/auth/github/callback
```

## Local Environment

Copy the template:

```bash
cp .env.example .env.local
```

Set:

```text
SESSION_SECRET=<long random string>
GITHUB_CLIENT_ID=<from GitHub>
GITHUB_CLIENT_SECRET=<from GitHub>
APP_BASE_URL=http://127.0.0.1:4173
HARNESSAMP_DEV_AUTH=0
```

Then run:

```bash
npm run dev
```

The Vite server proxies `/api` requests to the local API runtime on port `3000`.

If you want separate terminals instead of the combined launcher, use:

```bash
npm run dev:api
npm run dev:web
```

Open:

```text
http://127.0.0.1:4173/
```

Click **GitHub login**.

## Vercel Environment

Set these variables in the Vercel project:

```text
SESSION_SECRET
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
APP_BASE_URL=https://harnessamp.vercel.app
```

Then redeploy.

## Local Dev Shortcut

For local development without GitHub OAuth, either leave `.env.local` out entirely or set:

```text
HARNESSAMP_DEV_AUTH=1
```

The local API runtime seeds a local dev user and skips the GitHub redirect. When `npm run dev` starts without `HARNESSAMP_DEV_AUTH` set, it defaults to this seeded mode.

Do not set `HARNESSAMP_DEV_AUTH=1` in production.

## How It Works

1. `/api/auth/github/start` creates a signed OAuth state cookie.
2. GitHub redirects back to `/api/auth/github/callback`.
3. HarnessAmp exchanges the code for a GitHub access token.
4. HarnessAmp reads the GitHub profile and primary email.
5. HarnessAmp creates or updates the local user.
6. HarnessAmp creates a signed `harnessamp_session` cookie.
7. `/api/session` returns the current user, workspaces, and default project.
