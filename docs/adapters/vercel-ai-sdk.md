# Vercel AI SDK Adapter

The Vercel AI SDK adapter lets HarnessAmp execute release-gate scenarios against Next.js or Vercel AI SDK-style route handlers without asking teams to build a separate HarnessAmp HTTP runner first.

This adapter is one execution-target option. It lets users bring their own app route to HarnessAmp while keeping provider API keys inside the user's app or worker environment.

Use it when your product already exposes AI behavior through routes such as:

- `app/api/chat/route.ts`
- `app/api/completion/route.ts`
- tool-calling chat routes built with `streamText`
- routes returning structured output objects
- routes returning text, JSON, Server-Sent Events, or AI SDK UI/data stream responses

The target can be a local route module path or an HTTP route URL:

```json
{
  "executionTarget": {
    "type": "vercel_ai_sdk",
    "routeUrl": "https://example.com/api/harnessamp/agent"
  }
}
```

The adapter is additive. Existing custom HTTP runners, Replit runners, Harness-1 adapters, worker jobs, benchmark governance, reports, and exports continue to use their existing paths.

## What It Captures

Each scenario execution is normalized into a HarnessAmp observation with:

- scenario id
- mutation or variant id
- input prompt/messages
- output text
- tool calls and tool results when present
- structured output objects
- citations and sources when present
- latency
- error state
- diagnostics envelope with phase, worker/job ids, retry attempt, HTTP status, and failure class
- model/provider metadata when available
- safe raw debug payload only when explicitly enabled

Secrets are redacted from headers, env overrides, and debug metadata. Do not enable raw debug capture for private production traces unless you have reviewed the payload shape.

## Local CLI Example

```bash
node scripts/harnessamp.mjs run examples/demo-bundle.json \
  --adapter vercel-ai-sdk \
  --target ./examples/vercel-ai-sdk/app/api/chat/route.mjs \
  --mode sample \
  --timeout-ms 5000 \
  --json
```

Important flags:

- `--adapter vercel-ai-sdk` selects the adapter runner.
- `--target <path>` points at a route module exporting `POST` or a default handler.
- `--mode sample|full` controls whether HarnessAmp executes sample visible variants or the full variant set.
- `--streaming-mode auto|text|ui-message|data` controls stream parsing hints.
- `--model-label <label>` stores a model/provider label in reports.
- `--structured-output-schema <name>` records the expected structured-output schema label.
- `--timeout-ms <n>` fails a scenario when the handler does not respond in time.

When `--adapter vercel-ai-sdk` is used, the CLI also prints a compact adapter summary to stderr with the selected adapter, target, run count, and any failure class. Adapter execution failures exit non-zero.

The adapter calls the route handler with a standard `Request` whose JSON body includes:

- `messages`
- `prompt`
- `scenario`
- `mutation`
- `benchmark`
- `metadata`

## Worker Job Example

Adapter jobs use the same durable worker lifecycle as custom HTTP runner jobs.

```json
{
  "adapter": {
    "type": "vercel-ai-sdk",
    "target": "./app/api/chat/route.mjs",
    "modelLabel": "openai/gpt-5.4",
    "mode": "sample",
    "streamingMode": "auto",
    "captureToolCalls": true
  },
  "pack": {
    "project": "Support Agent",
    "benchmark": {
      "cases": []
    }
  },
  "maxAttempts": 2,
  "timeoutMs": 30000
}
```

The API returns immediately with a queued job. A separate worker claims it, executes the adapter, generates a normal HarnessAmp report, and links the report id back to the job.

## Production Model

Run the frontend/API and worker separately:

```bash
node scripts/harnessamp.mjs worker \
  --project-id <project-id> \
  --api-url https://harnessamp.example.com \
  --worker-id vercel-ai-sdk-worker-1
```

Required production environment:

```text
DATABASE_URL=<postgres>
WORKER_SERVICE_TOKEN=<shared worker token>
```

Optional adapter environment:

```text
HARNESSAMP_VERCEL_AI_SDK_TARGET=./app/api/chat/route.mjs
HARNESSAMP_VERCEL_AI_SDK_MODEL=openai/gpt-5.4
HARNESSAMP_VERCEL_AI_SDK_TIMEOUT_MS=30000
HARNESSAMP_ADAPTER_TIMEOUT_MS=30000
```

AI provider credentials remain owned by the target app or route process. HarnessAmp should not write provider API keys into reports, job payloads, or logs.

## Diagnostics And Failure Classes

Every adapter invocation produces a normalized diagnostics envelope in the run metadata and worker job result. The envelope records:

- adapter type and safe target route
- request and response timestamps
- latency
- HTTP status when a `Response` is returned
- timeout status
- retry attempt
- worker id and job id
- benchmark id/version
- scenario id
- mutation id/family
- normalized failure class
- safely truncated raw error message
- phase: `before_dispatch`, `during_adapter_call`, `during_parsing`, `during_scoring`, `during_report_creation`, or `completion`

Failure classes are deterministic:

- `execution_target_missing`
- `execution_target_invalid`
- `execution_target_unsupported`
- `registered_runner_missing`
- `vercel_ai_sdk_route_missing`
- `hosted_provider_disabled`
- `hosted_provider_missing_secret`
- `hosted_provider_invalid_secret`
- `hosted_provider_auth_failed`
- `hosted_provider_rate_limited`
- `hosted_provider_timeout`
- `hosted_provider_invalid_request`
- `hosted_provider_response_invalid`
- `hosted_provider_network_error`
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

`adapter_target_missing`, `adapter_invalid_response`, `adapter_schema_mismatch`, and `adapter_worker_canceled` are non-retryable by default. Timeout, HTTP, rate-limit, auth, execution, and unknown failures can retry until the job reaches `maxAttempts`.

Debug failed worker-backed adapter jobs from:

- `GET /api/jobs/<job-id>`: inspect `result.diagnostics`, `lastError`, `retryReason`, `attempts`, and `workerId`
- the dashboard job detail panel: execution path, target route, lifecycle state, failure class, last error, retry schedule, and report state
- worker CLI logs: one-line job status with adapter/runner, target, report state, and failure class
- generated reports: observation metadata includes adapter diagnostics when a report is created

## Generic HTTP Runner vs Vercel AI SDK Adapter

Use the generic HTTP runner when you already have a deployed HarnessAmp-compatible endpoint that returns observations.

Use the Vercel AI SDK adapter when you have an AI SDK route/handler and want HarnessAmp to call it directly, normalize the response, and generate observations for release evidence reports.

## Supported And Unsupported Cases

Supported:

- JSON responses with `text`, `outputText`, `output`, `toolCalls`, `toolResults`, `sources`, `citations`, `usage`, and metadata fields.
- text responses.
- Server-Sent Events and line-delimited stream responses.
- AI SDK-style streamed text chunks and JSON data chunks.
- route modules exporting `POST` or a default function.

Unsupported in this first adapter build:

- TypeScript route files without a runtime transpiler.
- browser-only hooks such as `useChat`.
- arbitrary long-running background streams with no final output.
- automatic live provider credential setup.
- OpenAI Agents SDK execution.

## Fixture

See `examples/vercel-ai-sdk/` for a deterministic route fixture covering chat, streaming, tool calls, and structured output without live model calls.
