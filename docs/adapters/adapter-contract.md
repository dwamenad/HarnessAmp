# HarnessAmp Adapter Contract

Use this contract when exposing a local or hosted agent endpoint to HarnessAmp. The same contract works through ngrok, Cloudflare Tunnel, Tailscale Funnel, Vercel, Render, Fly.io, or any other public HTTPS endpoint.

## When To Use It

Use `local_http_tunnel` when you want to test an agent running on your machine before deploying it. Keep the tunnel open until the run completes, then rotate or close it. Do not treat a local tunnel as a durable production execution target.

Use a registered runner or deployed adapter endpoint for production execution.

## Endpoint

- Method: `POST`
- Content type: JSON only
- URL: public HTTPS only
- Required request header: `x-harnessamp-run-token`

HarnessAmp sends a fresh run token during preflight and dispatch. Your adapter should record the token from preflight for the current run and reject dispatch requests with a missing or different token. Do not log the token.

## Preflight Request

```json
{
  "type": "harnessamp_preflight",
  "preflight": true,
  "contract": "harnessamp_http_runner_v1"
}
```

Valid preflight response:

```json
{ "ok": true }
```

Also valid:

```json
{ "ready": true }
```

Invalid preflight response:

```json
{ "ok": false }
```

## Scenario Request

```json
{
  "jobId": "job_123",
  "profile": "support-agent",
  "preset": "core",
  "thresholds": {},
  "pack": {
    "id": "support-pack",
    "harness": {
      "scenarios": [
        { "id": "scenario-001", "objective": "Answer safely." }
      ]
    }
  }
}
```

## Observation Response

Return JSON with an `observations` array:

```json
{
  "observations": [
    {
      "runId": "job_123:scenario-001",
      "taskId": "scenario-001",
      "outputText": "The agent response.",
      "errors": [],
      "metadata": {
        "passed": true
      }
    }
  ]
}
```

HarnessAmp also accepts a raw observation array for backwards compatibility, but new adapters should return `{ "observations": [] }`.

Invalid observation response:

```json
{ "result": "done" }
```

## Error Response

Return safe JSON errors. Never include provider keys, run tokens, cookies, authorization headers, full prompts containing secrets, or raw stack traces.

```json
{
  "error": "adapter_error",
  "code": "upstream_failed",
  "retryable": true
}
```

Use `401` for a missing token, `403` for a wrong token, `400` for malformed contract payloads, and `5xx` for transient adapter or upstream failures.

## Timeouts And Limits

Adapters should respond to preflight quickly. Scenario dispatch should complete within the job timeout. Responses must be JSON and should stay compact; HarnessAmp enforces response-size limits and will reject oversized responses.

## Safe Logging

Log request ids, scenario ids, status codes, latency, and failure class. Do not log:

- `x-harnessamp-run-token`
- provider API keys
- authorization headers
- cookies
- raw tool output containing secrets
- full stack traces in responses

## How To Test A Local Agent

1. Run your local app.
2. Expose it with an HTTPS tunnel, for example `ngrok http <port>`.
3. Run:

   ```bash
   npm run harnessamp:doctor -- --url https://example.ngrok.app/api/agent
   ```

4. Fix any reported contract failures.
5. Paste the same forwarding URL into the HarnessAmp dashboard as a "Local tunnel" execution target.

## Examples

- Next.js API route: `examples/adapter-contract/nextjs-route.ts`
- Express route: `examples/adapter-contract/express-route.mjs`
- Vercel AI SDK route: `examples/adapter-contract/vercel-ai-sdk-route.ts`
- Generic fetch handler: `examples/adapter-contract/fetch-handler.mjs`

## Common Preflight Failures

- Missing token: read `x-harnessamp-run-token` and return `401` if absent.
- Invalid JSON: return JSON only, including error responses.
- Missing readiness field: return `{ "ok": true }` or `{ "ready": true }`.
- Endpoint unreachable: start the local app and keep the tunnel open.
- Timeout: make preflight fast and increase `--timeout-ms` only when needed.
- Contract mismatch: check the request body and response shape.
- Blocked private/internal URL: use the public HTTPS tunnel URL, not `localhost`, private IPs, or metadata endpoints.

## Security Notes For Local Tunnels

HarnessAmp enforces HTTPS-only tunnel URLs, blocks localhost/private/link-local/metadata targets, resolves hostnames before preflight and dispatch, validates redirect targets, sends a per-run token, applies timeouts and response-size limits, and redacts token-like values from diagnostics. These controls are there to keep local testing bounded; they are not a substitute for deploying a production runner.
