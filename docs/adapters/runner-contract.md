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

## Optional Coding-Agent Trace Fields

Coding-agent runners should include trace data either at `trace` or `metadata.trace`.

Supported trace fields:

- `commands` - terminal commands with `command`, `cwd`, `output`, `exitCode`, and `durationMs`
- `fileDiffs` - file changes with `path`, `diff`, `language`, and `changeType`
- `sandboxEvents` - sandbox decisions with `action`, `path`, `allowed`, and `policy`
- `approvals` - approval decisions with `action`, `approved`, `source`, and `reason`
- `terminalOutput`, `stdout`, `stderr` - redacted textual logs

Adapters may also return `artifacts` or `runArtifacts` directly. HarnessAmp normalizes these into the diagnostic report `runArtifacts` collection. Large raw blobs should be stored externally and referenced with `uri`; reports should default to redacted artifacts.

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
- file and terminal behavior associated with coding-agent failures

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
