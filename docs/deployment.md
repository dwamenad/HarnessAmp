# API And Worker Deployment

This runbook covers the local API process, local worker process, required environment variables, and the intended production split between the Vercel frontend/API and a separate worker runtime.

## Local API

The full local app is started with one command:

```bash
npm install
npm run dev
```

`npm run dev` starts:

- Vite web app: `http://127.0.0.1:4173`
- local API runtime: `http://127.0.0.1:3000`

The API runtime mirrors the Vercel rewrite behavior for routes such as:

- `/api/session`
- `/api/auth/github/start`
- `/api/auth/github/callback`
- `/api/workspaces/:workspaceId/projects`
- `/api/projects/:projectId/runners`
- `/api/projects/:projectId/jobs`
- `/api/jobs/:id`

For split terminals, run:

```bash
npm run dev:api
npm run dev:web
```

Use split terminals when you need to restart the API without losing Vite state or when you want API logs isolated from frontend logs.

## Local Auth Modes

For the fastest local workflow, use seeded development auth:

```bash
HARNESSAMP_DEV_AUTH=1 npm run dev
```

In seeded mode, `/api/session` returns a local dev user, workspace, and project. GitHub OAuth is bypassed.

For local GitHub OAuth, set:

```text
HARNESSAMP_DEV_AUTH=0
APP_BASE_URL=http://127.0.0.1:4173
SESSION_SECRET=<long random string>
GITHUB_CLIENT_ID=<GitHub OAuth client id>
GITHUB_CLIENT_SECRET=<GitHub OAuth client secret>
```

The local GitHub OAuth callback should be:

```text
http://127.0.0.1:4173/api/auth/github/callback
```

`vite preview` is not enough for OAuth or API testing because it only serves the static build. Use `npm run dev` or `npm run dev:api` plus `npm run dev:web`.

## Local Worker

Runner jobs are durable API records. Creating a job does not execute it inline; a worker must claim and run queued or retrying jobs.

Start the app/API first:

```bash
HARNESSAMP_DEV_AUTH=1 npm run dev
```

Then find or create a project in the console and run the worker against that project:

```bash
node scripts/harnessamp.mjs worker \
  --project-id <project-id> \
  --api-url http://127.0.0.1:3000 \
  --worker-id local-worker-1
```

Useful worker flags:

- `--project-id <id>` selects which project queue to poll.
- `--api-url <url>` points to the HarnessAmp API. Local default: `http://127.0.0.1:3000`.
- `--worker-id <id>` labels claims and run history.
- `--once` polls once, processes available jobs, and exits.
- `--interval-ms <n>` sets the polling interval for long-running workers.
- `--max-jobs <n>` exits after processing a fixed number of jobs.
- `--stale-after-ms <n>` recovers `claimed` or `running` jobs whose worker lease is older than the timeout. Default: `120000`.

Example one-shot local worker:

```bash
node scripts/harnessamp.mjs worker \
  --project-id <project-id> \
  --api-url http://127.0.0.1:3000 \
  --once
```

## Required Environment Variables

### Local Development

```text
APP_BASE_URL=http://127.0.0.1:4173
HARNESSAMP_DEV_AUTH=1
SESSION_SECRET=<long random string>
DATABASE_URL=<optional Postgres URL>
POSTGRES_URL=<optional Postgres URL alternative>
WORKER_SERVICE_TOKEN=<optional shared worker token for API polling>
HARNESSAMP_ENABLE_HOSTED_BYOK=0
HARNESSAMP_SECRET_ENCRYPTION_KEY=<required only when hosted BYOK is enabled>
HARNESSAMP_SECRET_ENCRYPTION_KEY_VERSION=<optional key version label>
```

Notes:

- If `HARNESSAMP_DEV_AUTH=1`, GitHub OAuth is skipped.
- If `DATABASE_URL` or `POSTGRES_URL` is absent, the API uses in-memory storage for local development.
- In-memory storage resets when the API process restarts.

### GitHub OAuth

```text
HARNESSAMP_DEV_AUTH=0
APP_BASE_URL=https://harnessamp.vercel.app
SESSION_SECRET=<long random string>
GITHUB_CLIENT_ID=<GitHub OAuth client id>
GITHUB_CLIENT_SECRET=<GitHub OAuth client secret>
```

Production GitHub OAuth callback:

```text
https://harnessamp.vercel.app/api/auth/github/callback
```

### Production Persistence

Use one of:

```text
DATABASE_URL=<Postgres connection string>
POSTGRES_URL=<Postgres connection string>
```

Postgres is required for production workflows that need durable users, workspaces, projects, reports, runner records, jobs, benchmark versions, and review history.

### Production Worker Authentication

Set the same `WORKER_SERVICE_TOKEN` value in both places:

- the Vercel frontend/API environment
- the separately deployed worker service environment

The worker sends this value as `Authorization: Bearer <token>` when polling and running jobs. The token only enables worker job reads plus `claim` and `run` actions; browser-session permissions are still required for creating, canceling, retrying, and managing project records.

## Production Topology

The Vercel deployment should run the frontend and serverless API only:

- static Vite frontend
- `/api/*` serverless handlers
- GitHub OAuth callback
- workspace/project/report/job/benchmark endpoints

The worker should run separately from Vercel because queued runner jobs need a long-lived polling process. Do not rely on Vercel serverless functions as the production worker loop.

Recommended production shape:

```text
Vercel frontend/API
  |
  | reads/writes
  v
Postgres
  ^
  | polls /api/projects/:projectId/jobs and /api/jobs/:id actions
  |
Separate worker service
```

The separate worker can be deployed on any platform that supports a long-running Node process, for example Render, Fly.io, Railway, a container service, or a VM.

## Bring Your Own Model In Production

HarnessAmp should usually receive an execution target, not a provider API key.

Recommended target options:

- `registered_runner`: deploy your own runner endpoint near the agent or model. The runner calls OpenAI, Anthropic, Gemini, Mistral, Groq, Together, a self-hosted model, or an internal agent service with credentials stored in your infrastructure.
- `vercel_ai_sdk`: point HarnessAmp at a Next.js/Vercel route that calls your agent. Provider keys stay in the app or worker environment.
- `local_http_tunnel`: expose a local HarnessAmp-compatible agent endpoint through a short-lived public HTTPS tunnel for testing. ngrok is the common path, but any compatible HTTPS tunnel works. Do not use this as a durable production execution target.
- `hosted_provider`: gated encrypted BYOK mode. Enable only with encrypted project secret storage, feature flag approval, and explicit team acceptance of that security model.

HarnessAmp stores only safe execution-target metadata such as target type, runner id, route URL/path, tunnel endpoint URL, provider, model label, masked secret preview, and timing/error diagnostics. Hosted BYOK stores encrypted provider keys in `project_secrets`; job records reference `secretRef` only. Raw provider keys must not appear in job records, dashboard views, worker logs, API responses, CLI output, or reports.

For local tunnel testing:

1. Run the local agent app.
2. Run `ngrok http <port>` or an equivalent HTTPS tunnel.
3. Paste the forwarding URL as `executionTarget.endpointUrl` or choose “Local tunnel” in the dashboard.
4. Implement the HTTP contract: preflight returns `{ "ok": true, "contractVersion": "harnessamp_http_runner_v1" }` or `{ "ready": true, "contractVersion": "harnessamp_http_runner_v1" }`, and dispatch returns observations mapped to the requested scenario id.
5. Read `x-harnessamp-run-token` on preflight and require the same header value for scenario dispatch requests in that run.
6. Run `npm run harnessamp:doctor -- --url <forwarding-url>` before enqueueing a benchmark.
7. Keep the tunnel open while the worker runs the benchmark.
8. Do not expose sensitive local services. Rotate or close the tunnel after testing.

HarnessAmp enforces HTTPS-only tunnel URLs, rejects localhost/private/link-local/metadata targets, resolves hostnames before preflight and dispatch, blocks redirects to unsafe targets, sends a per-run `x-harnessamp-run-token`, requires `HARNESSAMP_LOCAL_TUNNEL_TOKEN_SECRET` in production-like environments, applies request timeouts and response-size limits, rejects unsupported contract versions, and redacts token-like values from diagnostics.

Worker service command:

```bash
node scripts/harnessamp.mjs worker \
  --project-id <project-id> \
  --api-url https://harnessamp.vercel.app \
  --worker-id prod-worker-1 \
  --interval-ms 5000
```

Recommended worker environment:

```text
WORKER_SERVICE_TOKEN=<same value configured in Vercel>
HARNESSAMP_WORKER_STALE_AFTER_MS=120000
HARNESSAMP_VERCEL_AI_SDK_TARGET=<optional default route module path>
HARNESSAMP_VERCEL_AI_SDK_MODEL=<optional report label>
HARNESSAMP_VERCEL_AI_SDK_TIMEOUT_MS=<optional adapter timeout>
HARNESSAMP_ADAPTER_TIMEOUT_MS=<optional generic adapter timeout>
HARNESSAMP_ENABLE_HOSTED_BYOK=1
HARNESSAMP_SECRET_ENCRYPTION_KEY=<32-byte secret or passphrase>
HARNESSAMP_SECRET_ENCRYPTION_KEY_VERSION=<rotation label>
```

Prefer the environment variable over passing the token on the command line. The CLI also accepts `--worker-token <token>` for controlled local debugging.

Adapter-backed jobs, such as the Vercel AI SDK adapter, run inside the worker process. The worker must be able to import the target route module path. If the production route is TypeScript-only, point the adapter at a compiled JavaScript module or a small JavaScript wrapper that exports the same `Request -> Response` handler.

For production Vercel AI SDK routes, prefer one of these patterns:

- deploy the worker with the same compiled route module available on disk and point `HARNESSAMP_VERCEL_AI_SDK_TARGET` at that module
- create a small internal JavaScript wrapper that imports the app route and exports `POST`
- keep provider API keys in the app/worker runtime environment, not in HarnessAmp job payloads

Do not put authorization headers, cookies, provider keys, or tokens in adapter config intended for dashboard display. HarnessAmp strips secret-like header/env keys and redacts secret-looking values in diagnostics, reports, and worker logs.

## Job Lifecycle

Runner jobs move through these durable states:

- `queued`: the API accepted the run and returned immediately.
- `claimed`: a worker atomically claimed the job and incremented the attempt count.
- `running`: the worker started the external runner request.
- `retrying`: an attempt failed or a worker lease expired, and the job is due after `nextRetryAt`.
- `completed`: a report was generated and linked through `reportId`.
- `failed`: attempts were exhausted or stale recovery could not retry safely.
- `canceled`: a user/admin canceled the job before completion.

Adapter-backed failures also record a deterministic failure class in `result.diagnostics.failureClass`. `adapter_target_missing`, `adapter_invalid_response`, `adapter_schema_mismatch`, and `adapter_worker_canceled` do not retry automatically. Timeout, HTTP, rate-limit, auth, execution, and unknown adapter failures retry while attempts remain.

Workers check cancellation before external dispatch, before report creation, and before final completion. A canceled job does not create a report. Worker polling also recovers stale `claimed` or `running` jobs whose `claimedAt`/`lockedAt` lease exceeds `HARNESSAMP_WORKER_STALE_AFTER_MS` or `--stale-after-ms`.

Two workers cannot claim the same pending job. The Postgres path uses a single conditional `UPDATE` against claimable states, so only one worker can move a job from `queued` or `retrying` to `claimed`.

## Deployment Checklist

1. Set Vercel env vars:
   - `APP_BASE_URL=https://harnessamp.vercel.app`
   - `SESSION_SECRET`
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `DATABASE_URL` or `POSTGRES_URL`
   - `WORKER_SERVICE_TOKEN`
2. Configure the GitHub OAuth callback:
   - `https://harnessamp.vercel.app/api/auth/github/callback`
3. Deploy the Vercel frontend/API.
4. Run database migrations/schema setup through the API startup path.
5. Deploy a separate long-running worker process with the same `WORKER_SERVICE_TOKEN`.
   - Include `HARNESSAMP_WORKER_STALE_AFTER_MS` if the default 120 seconds does not match your runner latency.
   - Include `HARNESSAMP_VERCEL_AI_SDK_TARGET` if this worker should process adapter-backed jobs with a default route target.
6. Confirm `/api/session` returns the expected auth state.
7. Register a runner in the console.
8. Enqueue a job.
9. Confirm the worker claims and completes the job.
10. Confirm the console shows job history and report linkage.

## Out Of Scope For This Phase

The following are intentionally not complete in this phase:

- managed production queue infrastructure
- automatic worker autoscaling
- multi-tenant enterprise permission hardening
- required reviewer policy enforcement
- full audit-log product surface
- durable server-backed artifact storage for every export
- real PDF generation service
- complete framework-specific runner adapters
- live MCP server execution
- billing/payment integration

The current implementation is production-shaped and demo-ready, but the worker and governance layers still need hardening before enterprise use.
