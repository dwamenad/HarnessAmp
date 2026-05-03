# Runner Contract

An external runner accepts a baseline or mutated HarnessAmp payload and returns an `AgentRunResult`.

Expected inputs:

- `bundle`
- `mutation`
- `task`
- `environment`

Expected outputs:

- `passed`
- `score`
- `outputText`
- `latencyMs`
- optional `toolCalls`
- optional `toolOutputs`
- optional `errors`
- optional `metadata`

HarnessAmp is the control plane. Customer workloads stay on the registered runner.

## Custom HTTP Runner

The CLI and GitHub Action can call a real agent through the `custom_http` runner:

```bash
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json \
  --runner-kind custom_http \
  --runner-endpoint https://runner.example.com/harnessamp
```

The endpoint receives:

```json
{
  "bundle": {},
  "mutation": null,
  "task": {},
  "environment": "local"
}
```

The endpoint can return either a full `AgentRunResult` or a compact result:

```json
{
  "passed": true,
  "score": 92,
  "outputText": "Completed with approved evidence.",
  "latencyMs": 840,
  "toolCalls": []
}
```
