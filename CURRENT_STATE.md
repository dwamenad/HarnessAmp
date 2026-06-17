# HarnessAmp Current State

Last updated: June 17, 2026

## Snapshot

HarnessAmp is on branch `codex/harnessamp-v2-contracts`.

Latest checked-out commit:

```text
9df4de5 Add worker queue and Vercel AI SDK adapter
```

Full commit:

```text
9df4de55c19c389a99676d92e0f8c42c1b8f45a3
```

Git status at this snapshot:

- Execution-target, adapter diagnostics, and hosted BYOK work is currently uncommitted.
- The branch tracks `origin/codex/harnessamp-v2-contracts`.
- No commit or push has been made for this hosted BYOK slice.

Modified files for the current build:

- `README.md`
- `api/_db.js`
- `api/_store.js`
- `api/projects.js`
- `api/secrets.js`
- `docs/adapters/vercel-ai-sdk.md`
- `docs/cli.md`
- `docs/deployment.md`
- `docs/reference/api.md`
- `scripts/dev-api.mjs`
- `scripts/harnessamp.mjs`
- `src/adapters/contract.js`
- `src/adapters/execution-targets.js`
- `src/adapters/hosted-provider.js`
- `src/adapters/runners.js`
- `src/adapters/secrets.js`
- `src/adapters/vercel-ai-sdk.js`
- `src/cli/index.js`
- `src/core/local-worker.js`
- `src/core/run-jobs.js`
- `src/main.js`
- `styles.css`
- `tests/api-routes.test.js`
- `tests/conformance/runner-contract.test.js`
- `tests/diagnose.test.js`
- `tests/vercel-ai-sdk-adapter.test.js`
- `vercel.json`
- `CURRENT_STATE.md`

## Current Product State

HarnessAmp has durable worker/queue execution, registered HTTP runner support, Vercel AI SDK route adapter support, adapter-backed project jobs, report linking, and dashboard controls that enqueue worker-backed jobs instead of executing from the browser.

This build enables the hosted provider BYOK MVP on top of the first-class Execution Target layer. Registered HTTP runners and Vercel AI SDK routes remain the recommended production paths. Hosted Provider BYOK is a feature-flagged convenience path for quick tests, individual developers, and small teams when encrypted project secret storage is configured.

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

## Adapter Diagnostics Layer

Implemented in the current working tree:

- Shared adapter contract utilities in `src/adapters/contract.js`.
- Deterministic failure classes:
  - `execution_target_missing`
  - `execution_target_invalid`
  - `execution_target_unsupported`
  - `registered_runner_missing`
  - `vercel_ai_sdk_route_missing`
  - `hosted_provider_disabled`
  - `hosted_provider_secret_missing`
  - `hosted_provider_secret_disabled`
  - `hosted_provider_secret_provider_mismatch`
  - `hosted_provider_auth_error`
  - `hosted_provider_rate_limited`
  - `hosted_provider_timeout`
  - `hosted_provider_invalid_response`
  - `hosted_provider_model_missing`
  - `hosted_provider_unknown_error`
  - `adapter_target_missing`
  - `adapter_timeout`
  - `adapter_http_error`
  - `adapter_invalid_response`
  - `adapter_schema_mismatch`
  - `adapter_execution_error`
  - `adapter_auth_error`
  - `adapter_rate_limited`
  - `adapter_worker_canceled`
  - `adapter_unknown_error`
- Normalized diagnostics envelopes with adapter type, safe target, timestamps, latency, HTTP status, timeout flag, retry attempt, worker id, job id, benchmark id/version, scenario id, mutation id/family, failure class, safely truncated raw error, retryability, and execution phase.
- Vercel AI SDK adapter observations now carry diagnostics in `metadata.diagnostics` and `metadata.adapterDiagnostics`.
- Worker-backed adapter failures persist diagnostics in job `result`.
- Registered HTTP runner failures use the same diagnostics shape where applicable.
- Non-retryable adapter classes stop immediately: target missing, invalid response, schema mismatch, and worker canceled.
- Retryable adapter classes continue through existing retry lifecycle until attempts are exhausted.
- Adapter timeout configuration now supports `timeoutMs`, `HARNESSAMP_VERCEL_AI_SDK_TIMEOUT_MS`, and `HARNESSAMP_ADAPTER_TIMEOUT_MS`.
- Secret-like header/env keys are stripped from adapter config, and diagnostics/debug payloads redact secret-looking fields.
- Redaction now covers OpenAI-style keys, Anthropic-style keys, bearer tokens, authorization headers, and secret-looking query parameters/messages.

## Execution Target Layer

Implemented in the current working tree:

- Normalized execution target helper in `src/adapters/execution-targets.js`.
- Job creation accepts `executionTarget` and `execution_target`.
- Legacy `runnerId` and `adapter` payloads still work and normalize into an execution target.
- Supported target types:
  - `registered_runner`
  - `vercel_ai_sdk`
  - `hosted_provider`
- Job payloads store safe execution target metadata, not provider API keys.
- API responses expose safe execution target metadata.
- Vercel AI SDK targets can be local route module paths or HTTP route URLs.
- Worker dispatch resolves execution target type before calling the registered runner path or Vercel AI SDK adapter.
- Unknown or disabled target types fail deterministically with normalized failure classes.
- Hosted Provider BYOK rejects raw provider-key style job payloads and requires `secretRef`.

## Project Secrets And Hosted BYOK

Implemented in the current working tree:

- Project secret storage in memory mode and Postgres table `project_secrets`.
- Encryption utilities in `src/adapters/secrets.js` using AES-256-GCM.
- Encryption requires `HARNESSAMP_SECRET_ENCRYPTION_KEY`; hosted BYOK requires `HARNESSAMP_ENABLE_HOSTED_BYOK=1`.
- Safe secret metadata includes id/ref, project id, provider, display name, masked preview, status, validation metadata, created/updated timestamps, last-used timestamp, and creator id.
- Raw provider keys are accepted only on secret creation or local terminal-only runs via `HARNESSAMP_PROVIDER_API_KEY`.
- Raw provider keys are not returned from API responses, job records, dashboard state, CLI output, worker logs, diagnostics, or reports.
- Secret API endpoint:
  - `POST /api/projects/:projectId/secrets`
  - `GET /api/projects/:projectId/secrets`
  - `POST /api/projects/:projectId/secrets/:id` with disable action
  - `DELETE /api/projects/:projectId/secrets/:id`
- Hosted provider worker execution decrypts inside the worker path only, calls the provider adapter, then discards the decrypted value.
- Hosted provider adapters support OpenAI and Anthropic-style APIs for the MVP.
- Hosted provider diagnostics capture safe provider/model metadata, token usage where available, latency, HTTP status, job id, project id through job context, scenario id, and mutation id.

## API, CLI, Dashboard

Implemented in the current working tree:

- Project job creation validates execution targets before enqueueing when possible.
- Project job creation validates hosted provider `secretRef`, project ownership, provider match, status, and model.
- Project job creation returns safe execution metadata and initial diagnostics metadata.
- Project job creation returns `executionTarget` safe metadata.
- `GET /api/jobs/<job-id>` exposes adapter execution diagnostics through the job result.
- Worker logs include adapter or runner kind, target, report state, and failure class.
- CLI accepts `--target-type`, `--target-url`, `--runner-id`, `--provider`, `--model`, and `--secret-ref`.
- CLI adds `secrets create`, `secrets list`, `secrets disable`, and `secrets delete`.
- CLI execution-target runs print pack, benchmark, target type, safe target identifier, run count, and failure classes to stderr without changing JSON stdout.
- CLI exits non-zero when adapter execution produces failed runs.
- Dashboard run creation now has a “Choose execution target” section with registered runner, Vercel AI SDK route, and hosted provider BYOK options.
- Dashboard project settings can save encrypted provider keys, show masked previews, disable/delete keys, and select active secrets for hosted provider runs.
- Dashboard job detail shows:
  - registered HTTP runner vs Vercel AI SDK route
  - target route or runner id
  - lifecycle state
  - failure class
  - last error
  - retry reason and schedule
  - worker id and timestamps
  - clear `No report yet` state while the worker is running

## Documentation

Updated in the current working tree:

- `docs/adapters/vercel-ai-sdk.md`
- `docs/cli.md`
- `docs/reference/api.md`
- `docs/deployment.md`
- `README.md`

Docs now explain how users can bring their own model through execution targets, why registered runners are the recommended production path, how Vercel AI SDK routes keep provider keys inside customer apps, what HarnessAmp does and does not store, API payloads, CLI commands, local and production setup, timeout/retry behavior, failure classes, debugging, secret handling, and local fixture usage.

## Verification Run

Focused adapter/API/worker/UI verification:

```bash
npm test -- --test-reporter=spec tests/api-routes.test.js tests/vercel-ai-sdk-adapter.test.js tests/diagnose.test.js tests/web-ui.test.js tests/local-worker.test.js tests/dev-api.test.js
```

Result:

- 61 passing

Whitespace check:

```bash
git diff --check
```

Result:

- passing

Production build:

```bash
npm run build
```

Result:

- passing
- Vite still emits the existing large chunk warning only

Full source test suite:

```bash
npm test -- --test-reporter=spec
```

Result:

- 240 passing

## Known Notes

- This hosted BYOK slice is local and uncommitted.
- No OpenAI Agents SDK, LangGraph, MCP, or additional framework adapter work was added.
- The existing RetrievalGuard/Harness-1 adapter flow remains in place.
- Production durability still requires `DATABASE_URL` or `POSTGRES_URL`.
- Worker authentication uses `WORKER_SERVICE_TOKEN` for worker polling and run actions.
