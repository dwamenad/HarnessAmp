# Vercel AI SDK Adapter Fixture

This fixture mimics Next.js App Router AI SDK routes without making live model calls.

Run the adapter locally:

```bash
node scripts/harnessamp.mjs run examples/demo-bundle.json \
  --adapter vercel-ai-sdk \
  --target ./examples/vercel-ai-sdk/app/api/chat/route.mjs \
  --mode sample \
  --timeout-ms 5000 \
  --json
```

Use these query modes in tests or local experiments:

- default chat response: `route.mjs`
- streaming response: set `metadata.mode = "stream"` in the request body
- tool response: set `metadata.mode = "tools"`
- structured response: set `metadata.mode = "structured"`

The route returns deterministic payloads shaped like AI SDK route outputs so HarnessAmp can verify adapter normalization without provider credentials.
