# Vercel AI SDK Adapter

The Vercel AI SDK adapter lets HarnessAmp execute benchmark packs against Next.js or Vercel AI SDK-style route handlers without asking teams to build a separate HarnessAmp HTTP runner first.

Use it when your product already exposes AI behavior through routes such as:

- `app/api/chat/route.ts`
- `app/api/completion/route.ts`
- tool-calling chat routes built with `streamText`
- routes returning structured output objects
- routes returning text, JSON, Server-Sent Events, or AI SDK UI/data stream responses

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
```

AI provider credentials remain owned by the target app or route process. HarnessAmp should not write provider API keys into reports, job payloads, or logs.

## Generic HTTP Runner vs Vercel AI SDK Adapter

Use the generic HTTP runner when you already have a deployed HarnessAmp-compatible endpoint that returns observations.

Use the Vercel AI SDK adapter when you have an AI SDK route/handler and want HarnessAmp to call it directly, normalize the response, and generate observations for benchmark reports.

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
