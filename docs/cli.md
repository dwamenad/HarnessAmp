# CLI

The CLI uses the same engine as the browser UI.

```bash
npm run analyze
npm run analyze -- examples/demo-bundle.json
npm run analyze -- examples/demo-bundle.json --pack
npm run analyze -- examples/demo-bundle.json examples/cli/observed-runs.json
npm run compile:traces
npm run compile:traces -- examples/traces/approved-support-traces.json
npm run compile:traces -- examples/traces/approved-support-traces.json --pack
npm run collect:failures -- examples/demo-bundle.json examples/cli/observed-runs.json
npm run release:gate -- examples/demo-bundle.json examples/cli/observed-runs.json
npm run diagnose -- examples/demo-bundle.json
node scripts/harnessamp.mjs mutate examples/demo-bundle.json --max-mutations 20
node scripts/harnessamp.mjs run examples/demo-bundle.json --adapter vercel-ai-sdk --target ./examples/vercel-ai-sdk/app/api/chat/route.mjs --mode sample --json
node scripts/harnessamp.mjs run examples/demo-bundle.json --target-type vercel-ai-sdk --target-url http://localhost:3000/api/harnessamp/agent --json
HARNESSAMP_PROVIDER_API_KEY=sk-... node scripts/harnessamp.mjs secrets create --project-id <project-id> --provider openai --name "OpenAI dev key"
node scripts/harnessamp.mjs run examples/demo-bundle.json --target-type hosted-provider --provider openai --model gpt-4.1-mini --secret-ref sec_123 --json
npm run harnessamp:doctor -- --url https://example.ngrok.app/api/agent
node scripts/harnessamp.mjs worker --project-id <project-id> --api-url http://127.0.0.1:3000
node scripts/harnessamp.mjs benchmark import examples/benchmarks/support-mvp/benchmark-pack.json --out benchmark.lifecycle.json
node scripts/harnessamp.mjs benchmark edit benchmark.lifecycle.json --edits benchmark-edits.json --out benchmark.lifecycle.json
node scripts/harnessamp.mjs benchmark review benchmark.lifecycle.json --decision approve --comments "Approved for release gate." --out benchmark.lifecycle.json
node scripts/harnessamp.mjs benchmark export benchmark.lifecycle.json --version approved --out benchmark-pack.json
```

Flags:

- `--json` prints the full analysis object.
- `--pack` prints the generated pack payload.
- `--concurrency <n>` sets how many baseline/mutation run jobs execute at once for `run`, `report`, and `diagnose`.
- `--run-attempts <n>` retries failed run jobs before the diagnosis fails.
- `--retry-backoff-ms <n>` waits before retrying a failed run job.
- `--timeout-ms <n>` fails an individual run job after the configured timeout.
- `--adapter vercel-ai-sdk` runs the bundle through a Vercel AI SDK route or compatible handler instead of the default mock runner.
- `--target-type vercel-ai-sdk|registered-runner` selects the execution-target shape.
- `--target-url <url-or-path>` points at a Vercel AI SDK route URL or local route module path.
- `--runner-id <id>` records a registered runner id for API/worker-backed workflows.
- `--provider <provider>` selects a hosted provider for BYOK runs or secret creation.
- `--model <model>` selects the hosted provider model label.
- `--secret-ref <id>` references an encrypted project secret. Raw keys are not printed.
- `--target <path>` points the Vercel AI SDK adapter at a route module that exports `POST` or another configured handler.
- `--mode sample|full` selects visible sample variants or all generated variants for adapter-backed runs.
- `--streaming-mode auto|text|sse|data` controls stream text normalization for adapter-backed runs.
- `--model-label <label>` labels adapter-backed observations in reports.
- `--structured-output-schema <json>` records the expected structured-output shape for adapter-backed runs.
- no flag prints the markdown report.

For `--adapter vercel-ai-sdk` or `--target-type vercel-ai-sdk`, the CLI writes execution-target progress to stderr without changing JSON output: selected target type, target route, total runs, failure count, and failure classes. Adapter execution failures exit non-zero.

## Bring Your Own Model

Use an execution target to run HealthGuard, FinanceGuard, RetrievalGuard, CustomerCareGuard, LegalGuard, or a custom mutation pack against your own model or agent. HarnessAmp sends scenarios to the target. The target calls your model with provider credentials stored in your infrastructure, then returns behavior for scoring.

Local Vercel route example:

```bash
node scripts/harnessamp.mjs run examples/demo-bundle.json \
  --target-type vercel-ai-sdk \
  --target-url ./examples/vercel-ai-sdk/app/api/chat/route.mjs \
  --mode sample \
  --json
```

Route URL example:

```bash
node scripts/harnessamp.mjs run examples/demo-bundle.json \
  --target-type vercel-ai-sdk \
  --target-url http://localhost:3000/api/harnessamp/agent \
  --mode sample \
  --json
```

Registered runners are created and executed through the API/dashboard worker lifecycle. Use `POST /api/projects/<project-id>/jobs` with `executionTarget.type = "registered_runner"` to enqueue a registered runner job.

Local tunnel jobs are also created and executed through the API/dashboard worker lifecycle. Run your local agent app, run `ngrok http <port>` or another HTTPS tunnel, then enqueue with `executionTarget.type = "local_http_tunnel"` and `endpointUrl` set to the forwarding URL. The local adapter must accept preflight `POST` requests, return `{ "ok": true }` or `{ "ready": true }`, read `x-harnessamp-run-token`, and require the same header value on scenario dispatch requests for that run. Keep the tunnel open while the worker runs the benchmark, do not expose sensitive local services, and rotate or close the tunnel after testing. This target is for local testing, not production execution.

Run the adapter doctor before enqueueing:

```bash
npm run harnessamp:doctor -- --url https://example.ngrok.app/api/agent
```

The doctor sends preflight and dispatch checks with a temporary run token, verifies JSON contract shape, verifies the endpoint rejects a wrong token, and prints actionable diagnostics without printing the token.

Hosted provider BYOK:

1. Configure `HARNESSAMP_ENABLE_HOSTED_BYOK=1` and `HARNESSAMP_SECRET_ENCRYPTION_KEY` on the API/worker.
2. Save a key:

   ```bash
   HARNESSAMP_PROVIDER_API_KEY=sk-... node scripts/harnessamp.mjs secrets create \
     --project-id <project-id> \
     --provider openai \
     --name "OpenAI dev key"
   ```

3. Enqueue or run with `executionTarget.type = "hosted_provider"` and the returned `secretRef`.

Raw keys are accepted only from `HARNESSAMP_PROVIDER_API_KEY` for secret creation or local terminal-only runs. CLI output shows masked secret metadata only.

Worker flags:

- `--project-id <id>` selects the project whose queued/retrying runner jobs should be claimed.
- `--api-url <url>` points at the local HarnessAmp API, defaulting to `http://127.0.0.1:3000`.
- `--worker-id <id>` records the worker label on claimed jobs.
- `--worker-token <token>` sends a worker service bearer token. Prefer `WORKER_SERVICE_TOKEN` in production.
- `--once` polls once and exits.
- `--interval-ms <n>` controls polling delay for long-running workers.
- `--max-jobs <n>` exits after processing that many jobs.
- `--stale-after-ms <n>` recovers stale `claimed` or `running` jobs after the worker lease expires.

Typical terminal-first flow:

1. Save a harness bundle as JSON.
2. Run `npm run analyze -- <bundle.json>`.
3. Inspect whether `intent`, `contract`, and `benchmark` are explicit in the source pack.
4. Inspect visible vs holdout gaps directly in the terminal.
5. Export the pack if you want to share it with another teammate or CI job.

Typical trace compiler flow:

1. Save approved traces as JSON.
2. Run `npm run compile:traces -- <trace-corpus.json>`.
3. Review the generated `intent`, `contract`, and `benchmark` draft.
4. Promote the approved draft into your benchmark source of truth before running wrapper mutations.

Typical benchmark lifecycle flow:

1. Run `node scripts/harnessamp.mjs benchmark validate <benchmark-pack.json>` before importing a pack.
2. Run `node scripts/harnessamp.mjs benchmark import <benchmark-pack.json> --out benchmark.lifecycle.json` to create a local lifecycle file.
3. Run `node scripts/harnessamp.mjs benchmark edit benchmark.lifecycle.json --edits edits.json --out benchmark.lifecycle.json` to create an immutable draft version from the same edit payload used by the API.
4. Run `node scripts/harnessamp.mjs benchmark review benchmark.lifecycle.json --decision approve --comments "..." --out benchmark.lifecycle.json`.
5. Run `node scripts/harnessamp.mjs benchmark export benchmark.lifecycle.json --version approved --out benchmark-pack.json` for CI or teammate handoff.

Typical failure corpus flow:

1. Run wrapper mutations against a benchmark pack.
2. Collect failing variants with `npm run collect:failures -- <bundle.json> <observations.json>`.
3. Merge the resulting corpus into your running private failure set.
4. Use repeated failures to justify new mutation families or release thresholds.

Typical release gate flow:

1. Run `npm run release:gate -- <bundle.json> <observations.json>`.
2. Set thresholds for overall score, holdout pass rate, and max gap.
3. Publish the markdown/json artifacts in CI.
4. Block merges when hidden holdouts regress.

Typical mutation diagnosis flow:

1. Run `node scripts/harnessamp.mjs validate <bundle.json>`.
2. Run `node scripts/harnessamp.mjs mutate <bundle.json> --max-mutations 20` to inspect selected mutation records.
3. Run `node scripts/harnessamp.mjs diagnose <bundle.json> --concurrency 4` to produce the robustness report.
4. Treat `PASS`, `WARN`, and `BLOCK` as the CI/release signal.

Typical Vercel AI SDK adapter flow:

1. Export a route handler from a module such as `app/api/chat/route.ts` or use the fixture at `examples/vercel-ai-sdk/app/api/chat/route.mjs`.
2. Run `node scripts/harnessamp.mjs run examples/demo-bundle.json --adapter vercel-ai-sdk --target ./examples/vercel-ai-sdk/app/api/chat/route.mjs --mode sample --json`.
3. Inspect captured text, tool calls, structured outputs, citations, latency, and pass/fail observations.
4. Inspect `metadata.diagnostics` for request/response timing, HTTP status, worker/job ids, retry attempt, phase, and normalized failure class.
5. Use `--mode full` before a release gate when you want visible and holdout variants.

Typical local worker flow:

1. Start the local app/API with `npm run dev`.
2. Register a runner and enqueue jobs from the console.
3. For local agent testing, choose “Local tunnel”, run `ngrok http <port>` or another HTTPS tunnel, and paste the forwarding URL before enqueueing.
4. Run `node scripts/harnessamp.mjs worker --project-id <project-id> --once` to process currently queued jobs.
5. Watch worker logs for adapter or runner target, report id or `no-report-yet`, and failure class on failed adapter-backed jobs.
6. Omit `--once` to keep polling for new queued or retrying jobs.

Docker workflow:

1. Build the image with `npm run docker:build`.
2. Run it with `docker run --rm -p 8088:80 harnessamp:local`.
3. Use the container when you want the production build rather than Vite dev mode.
