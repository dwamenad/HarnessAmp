# Runner Contract

The runner contract lets HarnessAmp stay infrastructure-agnostic.

Every adapter must implement:

```js
async run({ bundle, mutation, task, environment }) => AgentRunResult
```

## Required Result Fields

An `AgentRunResult` should include:

- `runId`
- `harnessId`
- `harnessVersion`
- `agentVersion`
- `modelVersion`
- `mutationId`
- `mutationSeed`
- `runnerVersion`
- `evaluatorVersion`
- `timestamp`
- `environment`
- `toolMode`
- `taskId`
- `inputPrompt`
- `outputText`
- `toolCalls`
- `toolOutputs`
- `errors`
- `latencyMs`
- `tokenUsage`
- `metadata`

## Conformance Expectations

Adapters must preserve enough trace information for HarnessAmp to compute:

- baseline versus mutated behavior
- pass-to-fail deltas
- tool usage added or lost
- missing-data handling degradation
- approval bypass
- network sink usage
- sandbox boundary crossing
- multimodal hidden instruction following

If an adapter cannot provide a field, it should return an explicit empty value rather than omitting the field.

## Current Implementation

`MockRunner` is the default local runner. It exists so the mutation engine, delta layer, classifier, report generator, CLI, and UI can run end-to-end without external credentials.

`CustomHTTPRunner` posts baseline and mutated payloads to a configured endpoint and normalizes compact responses into the `AgentRunResult` shape.

Use it with:

```bash
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json \
  --runner-kind custom_http \
  --runner-endpoint https://runner.example.com/harnessamp
```

The remaining runner classes are placeholders and intentionally throw until implemented.
