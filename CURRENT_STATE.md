# HarnessAmp Current State

Last updated: June 17, 2026

## Snapshot

HarnessAmp is on branch `codex/harnessamp-v2-contracts`.

Latest checked-out commit:

```text
56985d2 Add hosted BYOK execution targets
```

Full commit:

```text
56985d2c09d2e23f328136087f343e17b42dfeed
```

The branch tracks `origin/codex/harnessamp-v2-contracts`.

Current working tree state:

- The hosted BYOK execution-target slice has been committed and pushed.
- The local tunnel, Adapter Contract Kit, and public execution-target positioning slice is currently local and uncommitted.

Modified files for the local tunnel build:

- `README.md`
- `CURRENT_STATE.md`
- `api/_store.js`
- `api/jobs.js`
- `api/projects.js`
- `docs/adapters/adapter-contract.md`
- `docs/adapters/index.md`
- `docs/cli.md`
- `docs/deployment.md`
- `docs/reference/api.md`
- `examples/adapter-contract/express-route.mjs`
- `examples/adapter-contract/fetch-handler.mjs`
- `examples/adapter-contract/nextjs-route.ts`
- `examples/adapter-contract/vercel-ai-sdk-route.ts`
- `package.json`
- `scripts/harnessamp.mjs`
- `src/adapters/contract.js`
- `src/adapters/harnessamp-contract.js`
- `src/adapters/execution-targets.js`
- `src/adapters/local-http-tunnel.js`
- `src/main.js`
- `styles.css`
- `tests/adapter-contract.test.js`
- `tests/api-routes.test.js`
- `tests/e2e/demo.spec.js`
- `tests/web-ui.test.js`

## Current Product State

HarnessAmp has durable worker/queue execution, registered HTTP runner support, Vercel AI SDK route adapter support, hosted provider BYOK support behind encrypted project secrets, adapter-backed project jobs, report linking, and dashboard controls that enqueue worker-backed jobs instead of executing from the browser.

This local build adds and hardens a short-lived local HTTPS tunnel execution target for testing an agent running on a developer machine, plus an Adapter Contract Kit for developers exposing compatible endpoints. The target is normalized as `local_http_tunnel`, stored as an ephemeral HTTP execution target with safe metadata, and labeled as "Local tunnel" in the UI.

The public site and `/app#demo` now position HarnessAmp around secure execution targets for real-agent evaluation, while keeping local tunnels clearly labeled as short-lived local testing and Hosted BYOK as a gated convenience path that requires encrypted project secret storage.

Primary product routes remain:

- `/`
- `/dashboard`
- `/reports`
- `/failures`
- `/failures/:id`
- `/runs/new`
- `/runs/:id`
- `/runs/:id/summary`
- `/compare`
- `/ci`
- `/docs`
- `/app#demo`

## Execution Target Layer

Implemented:

- Normalized execution target helper in `src/adapters/execution-targets.js`.
- Job creation accepts `executionTarget` and `execution_target`.
- Legacy `runnerId` and `adapter` payloads still work and normalize into an execution target.
- Supported target types:
  - `registered_runner`
  - `vercel_ai_sdk`
  - `hosted_provider`
  - `local_http_tunnel`
- Job payloads store safe execution target metadata, not provider API keys.
- `local_http_tunnel` stores safe metadata with `endpointUrl`, `label: "Local tunnel"`, `transport: "http"`, and `ephemeral: true`.
- API responses expose safe execution target metadata.
- Vercel AI SDK targets can be local route module paths or HTTP route URLs.
- Local tunnel targets require a valid public HTTPS endpoint URL.
- Worker dispatch resolves execution target type before calling the registered runner path, local tunnel HTTP path, hosted provider path, or Vercel AI SDK adapter.
- Unknown or disabled target types fail deterministically with normalized failure classes.
- Hosted Provider BYOK rejects raw provider-key style job payloads and requires `secretRef`.

## Local Tunnel Target

Implemented in the current working tree:

- New execution target type: `local_http_tunnel`.
- Accepted URL fields include `endpointUrl`, `endpoint_url`, `url`, `routeUrl`, `route_url`, `target`, `targetUrl`, and `target_url`.
- URL normalization rejects missing, invalid, and non-HTTPS URLs before enqueueing.
- Preflight and worker dispatch reject localhost, `127.0.0.1`, `0.0.0.0`, `::1`, private ranges, link-local ranges, and cloud metadata endpoints.
- Hostnames are resolved before preflight and before worker dispatch; DNS results that point to private/internal IPs are blocked.
- Redirects are followed manually and every redirect target is validated before sending the next request.
- Job creation generates a per-run local tunnel token and sends it as `x-harnessamp-run-token` on preflight and dispatch.
- Job API responses redact private local tunnel token fields from job payloads.
- Job creation performs a lightweight preflight `POST` before creating a queue record.
- Preflight payload:

```json
{
  "type": "harnessamp_preflight",
  "preflight": true,
  "contract": "harnessamp_http_runner_v1"
}
```

- Preflight accepts `{ "ok": true }`, `{ "ready": true }`, an observation array, or `{ "observations": [] }`.
- Preflight rejects unreachable endpoints, unsafe redirects, private IP resolutions, timeouts, oversized responses, non-2xx responses, non-JSON responses, and non-ready payloads.
- Worker execution dispatches the benchmark job to the tunnel endpoint with the same pack-level HTTP contract used by registered runner jobs:
  - `jobId`
  - `profile`
  - `preset`
  - `thresholds`
  - `pack`
- Worker execution accepts an observation array or `{ "observations": [] }`.
- Worker execution applies explicit timeouts, max response-size limits, safe JSON parsing, and normalized local tunnel diagnostics.
- Local tunnel failure classes include:
  - `local_tunnel_unreachable`
  - `local_tunnel_timeout`
  - `local_tunnel_tls_error`
  - `local_tunnel_dns_error`
  - `local_tunnel_redirect_blocked`
  - `local_tunnel_private_ip_blocked`
  - `local_tunnel_contract_mismatch`
  - `local_tunnel_invalid_json`
  - `local_tunnel_http_error`
  - `local_tunnel_closed_or_expired`
- Job descriptors, diagnostics, and dashboard job detail include the tunnel endpoint URL and label.

## API, CLI, Dashboard

Implemented:

- Project job creation validates execution targets before enqueueing when possible.
- Project job creation validates local tunnel HTTPS URL and preflights the endpoint.
- Project job creation validates hosted provider `secretRef`, project ownership, provider match, status, and model.
- Project job creation returns safe execution metadata and initial diagnostics metadata.
- `GET /api/jobs/<job-id>` exposes adapter execution diagnostics through the job result.
- Worker logs include adapter or runner kind, target, report state, and failure class.
- CLI accepts `--target-type`, `--target-url`, `--runner-id`, `--provider`, `--model`, and `--secret-ref`.
- CLI adds `secrets create`, `secrets list`, `secrets disable`, and `secrets delete`.
- CLI adds `doctor` via `npm run harnessamp:doctor -- --url <https-endpoint>`.
- Adapter doctor sends preflight and dispatch checks with a temporary run token, validates JSON response shape, checks wrong-token rejection, and prints actionable diagnostics without printing the token.
- Dashboard run creation has a “Choose execution target” section with:
  - registered runner
  - Vercel AI SDK route
  - local tunnel
  - hosted provider BYOK
- The local tunnel UI shows setup steps:
  - run the local app
  - run `ngrok http <port>`
  - paste the HTTPS forwarding URL
  - read `x-harnessamp-run-token` on preflight and require the same header during dispatch
- The local tunnel UI warns users:
  - do not expose sensitive local services
  - keep the tunnel open while the benchmark runs
  - rotate or close the tunnel after testing
- Dashboard job detail labels local tunnel jobs as “Local tunnel”.

## Adapter Contract Kit

Implemented in the current working tree:

- Shared contract constants, JSDoc types, builders, and runtime validators in `src/adapters/harnessamp-contract.js`.
- Types/schemas cover:
  - `HarnessAmpScenarioRequest`
  - `HarnessAmpObservationResponse`
  - `HarnessAmpAdapterError`
  - `HarnessAmpPreflightRequest`
  - `HarnessAmpPreflightResponse`
- Formal adapter contract reference in `docs/adapters/adapter-contract.md`.
- Copy-paste route examples:
  - Next.js API route
  - Express route
  - Vercel AI SDK route
  - generic fetch-based Node handler
- Dashboard local tunnel setup copy includes `x-harnessamp-run-token` behavior.
- Dashboard local tunnel API errors map to safe setup guidance for missing token, invalid JSON, missing readiness/response fields, unreachable endpoint, timeout, contract mismatch, and blocked private/internal URLs.

## Public Site And Demo UI

Implemented in the current working tree:

- Home hero now leads with testing real agents through secure execution targets.
- Proof strip highlights 4 execution targets, adapter doctor, local tunnel testing, BYOK support, and worker-backed runs.
- Home page adds a "Connect your real agent" execution-target section after the workflow section.
- Execution-target cards cover registered runner, Vercel AI SDK route, local HTTPS tunnel, and Hosted BYOK with best-fit and safety/status notes.
- Docs spotlight includes an Adapter Contract Kit card for normalized responses, safe diagnostics, failure classes, timeout/error handling, and preflight validation.
- `/ci` is reframed as "CI / Execution Targets" with cards for registered runners, Vercel AI SDK routes, local tunnel doctor, adapter contract kit, Hosted BYOK, safe diagnostics, and Harness-1 as an example adapter.
- `/app#demo` distinguishes seeded demo mode from real execution, shows execution-target cards, adapter readiness/doctor messaging, worker-backed lifecycle states, and updated CTAs.
- Hosted BYOK copy is gated/feature-flagged and does not imply general availability without encrypted project secret storage.

## Documentation

Updated in the current working tree:

- `README.md`
- `docs/adapters/adapter-contract.md`
- `docs/adapters/index.md`
- `docs/cli.md`
- `docs/deployment.md`
- `docs/reference/api.md`

Docs explain how to test a local agent, the adapter contract reference, Next.js/Express/Vercel AI SDK/fetch examples, common preflight failures, local tunnel security notes, and that ngrok is a common tunnel path, not a hard dependency.

Public UI copy now explains how to connect real agents through execution targets and keeps local tunnels positioned as local testing only.

## Verification Run

Focused adapter contract and API route verification:

```bash
node --test tests/adapter-contract.test.js tests/api-routes.test.js
```

Result:

- 49 passing

Full source test suite:

```bash
npm test -- --test-reporter=spec
```

Result:

- 266 passing

Playwright route/render verification:

```bash
npm run test:e2e
```

Result:

- 31 passing
- 1 skipped

Production build:

```bash
npm run build
```

Result:

- passing
- Vite still emits the existing large chunk warning only

Whitespace check:

```bash
git diff --check
```

Result:

- passing

## Known Notes

- This local tunnel slice is local and uncommitted.
- No ngrok package or runtime dependency was added.
- No OpenAI Agents SDK, LangGraph, MCP, or additional framework adapter work was added.
- The existing RetrievalGuard/Harness-1 adapter flow remains in place.
- Production durability still requires `DATABASE_URL` or `POSTGRES_URL`.
- Worker authentication uses `WORKER_SERVICE_TOKEN` for worker polling and run actions.
