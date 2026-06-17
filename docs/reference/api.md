# API Reference

## `createDemoBundle()`

Returns a deep-cloned starter bundle for the HarnessAmp UI and CLI.

## `safeJsonParse(text)`

Parses a JSON string and returns `{ ok, value }` or `{ ok, error }` instead of throwing.

## `analyzeBundle(bundleInput, observationInput, options)`

Normalizes a bundle, builds mutation families, scores outcomes, and returns the report payload.

Important outputs:

- `summary` - overall score and risk labels
- `pack` - visible and holdout variants
- `recommendations` - hardening guidance
- `reportText` - markdown CLI output
- `exportPack` - first-class benchmark pack with `intent`, `contract`, `benchmark`, `wrapper`, mutation policy, and analysis payload

## `createDemoTraceCorpus()`

Returns a deep-cloned starter trace corpus for the trace-to-contract compiler.

## `compileTraceContract(input, options)`

Normalizes approved traces and returns a draft intent, contract, benchmark pack, and terminal report.

Important outputs:

- `intent` - draft mission and success signals
- `contract` - global and per-agent constraints inferred from approved traces
- `benchmark` - executable case drafts built from the trace set
- `wrapper` - runnable scaffold for mutation testing
- `pack` - benchmark-pack payload ready for `analyzeBundle`
- `reportText` - terminal-readable summary of the generated draft

## `collectFailureCorpus(analysis, options)`

Builds a failure corpus from failed visible and holdout variants in an analysis run.

Important outputs:

- `summary` - entry counts, hidden failure counts, and unique surfaces
- `entries` - concrete regression records with expected vs observed behavior

## `collectDiagnosticFailureCorpus(diagnosis)`

Builds a failure corpus from mutation-diagnosis findings.

Important outputs:

- `summary` - entry counts and unique surfaces/failure types
- `entries` - mutation-linked failure records with trust boundaries and recommended controls

## `mergeFailureCorpora(...corpora)`

Merges multiple failure corpora while deduplicating entries by id.

## `generateMutationSuite(bundleInput, options)`

Builds deterministic mutation records and mutated harnesses from a creator harness or benchmark pack.

Important outputs:

- `selectedPacks` - mutation packs selected from the risk profile
- `mutations` - structured mutation objects with trust boundaries, severity, expected failure, and mutated harnesses

Useful generated-suite options:

- `generatedTier` - `smoke`, `core`, `deep`, or `nightly`
- `maxGeneratedMutations` - caps a generated tier for local inspection or CI sampling
- `shard` - a `1/10` style generated-suite shard
- `shardIndex` and `shardCount` - numeric shard controls for worker orchestration
- `surfaces` and `severities` - smart-sampling filters for changed or high-risk areas
- `prioritization` - `risk` by default, or `registry` to preserve registry order
- `mutation.baseMutationId` - links each generated record back to the registry mutation it expanded from

## `diagnoseHarness(bundleInput, options)`

Runs the production diagnosis flow with the default mock runner.

Important outputs:

- `runJobs` - per-baseline/per-mutation job states, attempts, timestamps, and errors
- `baselineRuns` - original task runs
- `mutationRuns` - mutated task runs
- `runArtifacts` - normalized redacted artifacts from runner traces, including terminal commands, file diffs, sandbox events, approvals, and logs
- `deltas` - behavioral changes between original and mutated runs
- `findings` - classified failures with recommendations
- `failureClusters` - deduplicated root-cause groups for repeated generated failures
- `mutationValue` - base-mutation ranking by unique failure clusters, failure rate, and redundant findings
- `summary` - pass/warn/block verdict and robustness drop
- `reportText` - markdown robustness report

Useful options:

- `concurrency` - max run jobs in flight at once
- `maxAttempts` - attempts per run job
- `retryBackoffMs` - delay before retrying failed run jobs
- `timeoutMs` - per-run timeout
- `maxArtifactTextLength` - text cap for inline artifact content
- `onJobUpdate(job)` - callback for state persistence or progress telemetry
- `shouldCancel(job)` - callback that can cancel queued work

## `evaluateDiagnosisGate(diagnosis, thresholds)`

Converts a diagnosis into CI gate checks.

Important outputs:

- `verdict` - `pass`, `warn`, or `block`
- `shouldFail` - whether the process should exit non-zero
- `metrics.robustnessGap` - original pass rate minus mutated pass rate
- `checks` - threshold-by-threshold pass/fail results

## Runner Job API

Runner jobs are durable queue records for workspace-backed external runner work. Creating a job persists `queued` state and returns immediately; a worker action claims and executes the job separately.

### Execution Targets

HarnessAmp job creation accepts a normalized execution target. This is the preferred API shape for bringing your own model without giving HarnessAmp direct provider keys.

Registered runner:

```json
{
  "pack": { "project": "HealthGuard" },
  "executionTarget": {
    "type": "registered_runner",
    "runnerId": "runner_123"
  }
}
```

Vercel AI SDK route:

```json
{
  "pack": { "project": "HealthGuard" },
  "execution_target": {
    "type": "vercel_ai_sdk",
    "routeUrl": "https://example.com/api/harnessamp/agent"
  }
}
```

Hosted provider BYOK:

```json
{
  "pack": { "project": "HealthGuard" },
  "executionTarget": {
    "type": "hosted_provider",
    "provider": "openai",
    "model": "gpt-4.1-mini",
    "secretRef": "sec_123"
  }
}
```

`registered_runner` requires a valid project runner id. `vercel_ai_sdk` requires a route URL or route module path. `hosted_provider` requires `HARNESSAMP_ENABLE_HOSTED_BYOK=1`, encrypted project secret storage, supported provider, model, and an active project secret whose provider matches the target.

## Project Secrets API

Project secrets store encrypted provider keys for hosted BYOK. Raw keys are accepted only on create and are never returned by API responses.

### `POST /api/projects/<project-id>/secrets`

Body:

- `provider` - `openai`, `anthropic`, `google`, `mistral`, `groq`, or `together`
- `name` - display name
- `secretValue` - raw provider API key; accepted only for encryption and never returned

Returns:

- `secret` - safe metadata with `id`, `ref`, `provider`, `displayName`, `maskedPreview`, `status`, timestamps, and validation metadata

### `GET /api/projects/<project-id>/secrets`

Lists safe metadata for non-deleted project secrets.

### `POST /api/projects/<project-id>/secrets/<secret-id>`

With `{ "action": "disable" }`, disables a secret so hosted provider jobs cannot use it.

### `DELETE /api/projects/<project-id>/secrets/<secret-id>`

Marks a secret deleted. The raw encrypted value is not returned.

### `POST /api/projects/<project-id>/runners`

Registers a custom HTTP runner for a project.

Body:

- `name` - runner label
- `endpointUrl` - runner endpoint URL
- `sharedSecret` - optional bearer token stored with the runner registration

### `POST /api/projects/<project-id>/jobs`

Creates or returns a durable runner job.

Body:

- `executionTarget` or `execution_target` - preferred normalized target object
- `runnerId` - legacy registered runner id for a custom HTTP runner; omit when using `executionTarget`
- `adapter` - legacy adapter config, currently `{ "type": "vercel-ai-sdk", "target": "./app/api/chat/route.mjs" }`
- `pack` - benchmark or harness pack to evaluate
- `thresholds` - optional release-gate thresholds
- `profileId` - optional risk profile id
- `presetId` - optional UI preset id
- `idempotencyKey` - optional key that deduplicates job creation for the same project and runner or adapter
- `maxAttempts` - attempts before terminal failure
- `timeoutMs` - external runner request timeout
- `retryBackoffMs` - delay before a failed attempt can be claimed again

`executionTarget`, `runnerId`, or `adapter.type` is required. Adapter-backed jobs use the same queue, claim, retry, cancellation, and report-linking lifecycle as registered HTTP runners.

Execution targets are validated before enqueueing when possible. Hosted provider job creation rejects disabled BYOK, missing `secretRef`, missing model, unsupported provider, provider mismatch, disabled/deleted secrets, cross-project secrets, and raw provider API keys in job payloads.

Returns:

- `jobId`
- `status`
- `idempotencyKey`
- `executionTarget` - safe target metadata only
- `adapter`
- `execution` - safe execution descriptor with `kind`, `adapterType`, `target`, and/or `runnerId`
- `diagnostics` - initial diagnostics metadata when available
- `attempts`
- `maxAttempts`
- `workerId`
- `claimedAt`
- `startedAt`
- `completedAt`
- `failedAt`
- `cancelledAt`
- `lastError`
- `retryReason`
- `nextRetryAt`

### `GET /api/jobs/<job-id>`

Returns the current job document, including `status`, `attempts`, `maxAttempts`, `reportId`, `result`, `error`, `lastError`, `retryReason`, `history`, `claimedBy`, `workerId`, `lockedAt`, `claimedAt`, `nextRunAt`, `nextRetryAt`, `startedAt`, `completedAt`, `failedAt`, `cancelledAt`, and `finishedAt`.

For adapter-backed and hosted-provider jobs, `result.diagnostics` contains the normalized adapter envelope: adapter type, safe target, timestamps, latency, HTTP status, timeout flag, retry attempt, worker id, job id, benchmark id/version, scenario id, mutation id/family, failure class, safely truncated raw error, retryability, usage metadata where available, and execution phase.

### `GET /api/jobs?projectId=<project-id>&status=queued,retrying&staleAfterMs=120000`

Lists project runner jobs, optionally filtered by comma-separated status values. The local `harnessamp worker` command uses this endpoint to find queued or retryable jobs from the API process.

Worker services may call this endpoint with `Authorization: Bearer <WORKER_SERVICE_TOKEN>`. Worker-authenticated polls recover stale `claimed` or `running` jobs older than `staleAfterMs` by moving them to `retrying` when attempts remain, or `failed` when attempts are exhausted.

### `POST /api/jobs/<job-id>?action=claim`

Claims a `queued` or due `retrying` job for a worker. Claiming sets the job to `claimed`, increments `attempts`, records `claimedBy`/`workerId`, and stamps `claimedAt`/`lockedAt`.

Body:

- `workerId` - optional worker/process label
- `projectId` - required when using `WORKER_SERVICE_TOKEN`; it must match the job project

### `POST /api/jobs/<job-id>?action=run`

Claims and executes a job through the registered runner or configured adapter. The action moves the job from `claimed` to `running`, dispatches execution from the worker/API process, writes exactly one report on success, and links it through `reportId`. On retryable failure it marks the job `retrying` until attempts are exhausted, then `failed`.

Non-retryable execution classes currently stop immediately: `execution_target_missing`, `execution_target_invalid`, `execution_target_unsupported`, `registered_runner_missing`, `vercel_ai_sdk_route_missing`, `hosted_provider_disabled`, `hosted_provider_secret_missing`, `hosted_provider_secret_disabled`, `hosted_provider_secret_provider_mismatch`, `hosted_provider_auth_error`, `hosted_provider_model_missing`, `adapter_target_missing`, `adapter_invalid_response`, `adapter_schema_mismatch`, and `adapter_worker_canceled`.

Worker services may call this action with `Authorization: Bearer <WORKER_SERVICE_TOKEN>` and a matching `projectId` in the JSON body.

### `POST /api/jobs/<job-id>?action=retry`

Moves a non-completed, non-canceled job back to `retrying` so a worker can claim it again.

### `POST /api/jobs/<job-id>?action=cancel`

Cancels a non-terminal job. Workers check cancellation before external dispatch, report creation, and completion.

## Benchmark Lifecycle API

`/api/benchmarks` is the API-backed benchmark truth layer. It requires an authenticated session and project membership.

### `GET /api/benchmarks?projectId=<project-id>`

Lists benchmark packs for a project.

Returns:

- `benchmarks` - pack summaries with latest and approved version ids

### `GET /api/benchmarks?id=<benchmark-id>`

Returns the benchmark detail payload.

Returns:

- `benchmark` - pack summary
- `versions` - draft, reviewed, approved, rejected, or archived versions
- `reviews` - review decisions and comments
- `reviewAssignments` - reviewer assignments for benchmark versions
- `promotionCandidates` - proposed or promoted golden-case candidates
- `goldenCases` - promoted visible or holdout cases

### `POST /api/benchmarks?projectId=<project-id>`

Creates a draft benchmark version. Pass an optional `benchmarkId` to add a new version to an existing pack.

Body:

- `pack` - benchmark-pack payload
- `source` - optional source label, such as `manual`, `trace-compiler`, or `report-promotion`
- `benchmarkId` - optional existing benchmark pack id

### `POST /api/benchmarks?action=review&versionId=<version-id>`

Records a benchmark review and updates the version state.

Supported decisions:

- `reviewed`
- `request_changes`
- `approve`
- `reject`
- `archive`

### `POST /api/benchmarks?action=assign-reviewer&versionId=<version-id>`

Assigns a reviewer label, email, or user id to a benchmark version.

Body:

- `reviewer` - required reviewer label
- `notes` - optional assignment notes

### `POST /api/benchmarks?action=edit&versionId=<version-id>`

Creates a new draft version from an existing benchmark version and returns the field/case/tool/evidence diff.

Body:

- `edits.project` - replacement project name
- `edits.description` - replacement description
- `edits.intentMission` - replacement mission text
- `edits.mustText` - newline-separated required behaviors
- `edits.mustNotText` - newline-separated forbidden behaviors
- `edits.successSignalsText` - newline-separated success signals
- `edits.thresholdsText` - newline-separated `key: value` threshold summary, or a JSON object
- `edits.tagsText` - newline-separated top-level tags
- `edits.metadataJson` - top-level metadata JSON object
- `edits.casesJson` - full replacement `benchmark.cases` JSON array
- `edits.toolsJson` - full replacement `wrapper.tools` JSON array
- `edits.evidenceSourcesJson` - full replacement `evidence.sources` JSON array
- `edits.evidenceLinksJson` - full replacement `evidence.links` JSON array
- `edits.casePatch` - optional single-case patch with `id`, `title`, `input`, `tier`, list fields, `seed`, and `metadataJson`
- `edits.toolPatch` - optional single-tool patch with `name`, `description`, and `schemaJson`

Important outputs:

- `baseVersion` - source version used for the edit
- `version` - new draft version
- `diff` - changed fields plus case, tool, and evidence changes
- `unchanged` - true when the edit did not change the pack

### `POST /api/benchmarks?action=promotion&versionId=<version-id>`

Creates a promotion candidate from a report, trace, or manually reviewed case.

Body:

- `case` - benchmark case payload to promote
- `visibility` - `visible` or `holdout`
- `sourceType` - optional source type, default `report`
- `sourceId` - optional source id
- `notes` - optional reviewer note

### `POST /api/benchmarks?action=promote&candidateId=<candidate-id>`

Promotes a candidate into `golden_cases` and marks the candidate as `promoted`.
