# HarnessAmp Current State

Last updated: June 16, 2026

## Snapshot

HarnessAmp is on branch `codex/harnessamp-v2-contracts`.

Latest checked-out commit:

```text
d7d3164 Add benchmark governance layer
```

Full commit:

```text
d7d3164ebe5901953447ce6813eeec62290b01fe
```

Git status at this snapshot:

- Worker/queue and Vercel AI SDK adapter work is currently uncommitted.
- `CURRENT_STATE.md` was refreshed after inspecting the prior local modifications.
- The branch is `codex/harnessamp-v2-contracts`.

Modified files for the current build:

- `README.md`
- `api/_db.js`
- `api/_store.js`
- `api/jobs.js`
- `api/projects.js`
- `docs/adapters/index.md`
- `docs/adapters/vercel-ai-sdk.md`
- `docs/cli.md`
- `docs/deployment.md`
- `docs/reference/api.md`
- `examples/vercel-ai-sdk/`
- `scripts/harnessamp.mjs`
- `src/adapters/index.js`
- `src/adapters/runners.js`
- `src/adapters/vercel-ai-sdk.js`
- `src/core/local-worker.js`
- `src/main.js`
- `styles.css`
- `tests/api-routes.test.js`
- `tests/conformance/runner-contract.test.js`
- `tests/local-worker.test.js`
- `tests/vercel-ai-sdk-adapter.test.js`
- `CURRENT_STATE.md`

## Current Product Direction

HarnessAmp now has production-facing product surfaces, report exports, RetrievalGuard/Harness-1 flow, and benchmark governance. The current build focuses on the execution substrate and first framework adapter: queued runner jobs should be completed by a separate worker process, and Vercel AI SDK route handlers can now be evaluated through the same HarnessAmp runner contract.

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

## Worker Layer In Progress

Implemented in the current working tree:

- Separate worker polling path via `node scripts/harnessamp.mjs worker`.
- Worker poll support for stale lease recovery with `--stale-after-ms` and `HARNESSAMP_WORKER_STALE_AFTER_MS`.
- Durable job state machine covering `queued`, `claimed`, `running`, `retrying`, `completed`, `failed`, and `canceled`.
- Postgres schema columns for worker observability: worker id, claim time, retry time, completion/failure/cancellation times, last error, and retry reason.
- Atomic claim semantics using conditional job-state updates so only one worker can claim a due job.
- Memory-mode claim logic updated to re-read current job state before claiming, so tests model contention safely.
- Worker execution now transitions from `claimed` to `running` before external dispatch.
- Report creation is guarded so a job links at most one report.
- Cancellation is checked before dispatch, before report creation, and before completion.
- Worker polling recovers stale `claimed` or `running` jobs into `retrying` when attempts remain, otherwise `failed`.
- Console job observability now shows worker id, retry reason, retry schedule, claim/start/complete/fail/cancel timestamps, linked report, and cancellation action.
- The dashboard dispatch path no longer runs jobs from the browser after enqueueing.
- Deployment/API/CLI docs now describe the worker process, env vars, lifecycle, stale recovery, and scaling model.

## Vercel AI SDK Adapter In Progress

Implemented in the current working tree:

- `vercel-ai-sdk` / `vercel_ai_sdk` runner kind support in the adapter registry.
- Route handler execution for modules that export `POST` or a configured handler export.
- CLI support for `--adapter vercel-ai-sdk`, `--target`, `--mode`, `--streaming-mode`, `--model-label`, and structured-output metadata.
- Project job creation with `runnerId` or an adapter config, allowing worker-backed adapter jobs without a registered HTTP runner.
- Report observations for text output, stream output, tool calls/results, structured output, citations/sources, latency, and normalized pass/fail state.
- Deterministic fixture under `examples/vercel-ai-sdk/` for local tests and docs.
- Adapter docs at `docs/adapters/vercel-ai-sdk.md`.

## Verification Run

Focused worker/API verification:

```bash
npm test -- --test-reporter=spec tests/api-routes.test.js tests/local-worker.test.js
```

Result:

- 17 passing

Focused UI/report verification:

```bash
npm test -- --test-reporter=spec tests/web-ui.test.js tests/run-report-store.test.js tests/report-export.test.js
```

Result:

- 21 passing

Focused adapter/API/UI verification:

```bash
npm test -- --test-reporter=spec tests/vercel-ai-sdk-adapter.test.js tests/api-routes.test.js tests/conformance/runner-contract.test.js tests/web-ui.test.js
```

Result:

- 41 passing

Completed broader verification:

```bash
git diff --check
npm run build
npm test -- --test-reporter=spec
```

Results:

- `git diff --check`: passing
- Production build: passing
- Full source test suite: 228 passing
- Vite still emits the existing large chunk warning only

Completed browser verification:

```bash
npm run test:e2e -- --reporter=line
```

Result:

- Playwright e2e: 31 passing, 1 skipped

## Known Notes

- The worker layer and Vercel AI SDK adapter are not committed yet.
- No OpenAI Agents SDK, LangGraph, or MCP adapter work was added in this build.
- The existing RetrievalGuard/Harness-1 adapter flow remains in place.
- Production durability still requires `DATABASE_URL` or `POSTGRES_URL`.
- Worker authentication uses `WORKER_SERVICE_TOKEN` for worker polling and run actions.
