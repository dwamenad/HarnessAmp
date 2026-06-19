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

## Organization API

Organizations are the billing, RBAC, and usage boundary for workspaces, projects, secrets, reports, and runner jobs. All organization endpoints require an authenticated session.

Roles:

- `owner` - billing, organization settings, members, secrets, targets, runs, exports, and destructive operations
- `admin` - organization operations, members, secrets, targets, runs, and exports
- `developer` - project work, target creation, run creation, report viewing, and exports
- `viewer` - report and run visibility without launch or mutation permissions

Plans:

- `free` - local/runner evaluation basics with low monthly limits; no Hosted BYOK, CI gates, or full benchmarks
- `starter` - Hosted BYOK and report exports for small projects
- `team` - CI gates, full benchmark runs, advanced targets, and higher team limits
- `business` - larger limits and priority queue allowance
- `enterprise` - highest limits and audit-log entitlement

### `GET /api/orgs`

Lists organizations for the authenticated user, including the user's role and permissions.

### `POST /api/orgs`

Creates an organization, owner membership, and default workspace.

Body:

- `name` - organization name
- `plan` - optional plan; defaults to `free`

### `GET /api/orgs/<org-id>`

Returns one organization when the authenticated user is an active member.

### `PATCH /api/orgs/<org-id>`

Updates organization name or status. Requires organization settings permission.

### `DELETE /api/orgs/<org-id>`

Marks the organization deleted. Requires owner permission.

### `GET /api/orgs/<org-id>/members`

Lists non-removed organization members. Requires member visibility.

### `POST /api/orgs/<org-id>/members`

Invites a member by email. If a user with that email already exists, the membership is activated immediately; otherwise it remains `invited`.

Body:

- `email` - invitee email
- `role` - one of `owner`, `admin`, `developer`, or `viewer`

### `PATCH /api/orgs/<org-id>/members/<member-id>`

Changes a member role or status. HarnessAmp prevents removing or demoting the last active owner.

### `DELETE /api/orgs/<org-id>/members/<member-id>`

Marks a member as removed. Removed members lose project visibility and run permissions inherited from the organization.

### `GET /api/orgs/<org-id>/usage`

Returns monthly organization usage and remaining allowance. Optional query parameters:

- `periodStart`
- `periodEnd`

Metered counters include `runCount`, `runStartedCount`, `runCompletedCount`, `scenarioCount`, `mutationCount`, `providerCallCount`, `executionMinutes`, `reportExports`, and `ciGateRuns`.

### `GET /api/orgs/<org-id>/plan`

Returns the current plan definition, limits, features, usage, and remaining monthly allowance.

### `PATCH /api/orgs/<org-id>/plan`

Updates the plan. Requires owner billing permission.

Body:

- `plan` - `free`, `starter`, `team`, `business`, or `enterprise`

### `POST /api/orgs/<org-id>/usage/estimate-run`

Estimates run usage and plan eligibility before enqueue.

Body:

- `pack` or `benchmark`
- `tier`
- `runMode` or `mode`
- `mutationConfig`
- `executionTarget`
- `ciGate`

Returns an entitlement object with `allowed`, blocking `reasons`, estimated run counters, current usage, limits, and remaining allowance.

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

Local HTTPS tunnel:

```json
{
  "pack": { "project": "HealthGuard" },
  "executionTarget": {
    "type": "local_http_tunnel",
    "endpointUrl": "https://example.ngrok-free.app/harnessamp"
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

`registered_runner` requires a valid project runner id. `vercel_ai_sdk` requires a route URL or route module path. `local_http_tunnel` requires a public HTTPS `endpointUrl`, validates reachability with a lightweight preflight `POST`, and dispatches worker jobs to the endpoint using the same observation contract as registered HTTP runners. HarnessAmp sends `x-harnessamp-run-token` on preflight and dispatch; local adapters should read it on preflight and require the same value on subsequent dispatch requests for that run. `hosted_provider` requires `HARNESSAMP_ENABLE_HOSTED_BYOK=1`, encrypted project secret storage, supported provider, model, and an active project secret whose provider matches the target.

The formal adapter contract and copy-paste route examples are documented in `docs/adapters/adapter-contract.md`. Use `npm run harnessamp:doctor -- --url <https-endpoint>` to verify a local or hosted adapter endpoint before enqueueing a benchmark.

## Project Secrets API

Project secrets store encrypted provider keys for hosted BYOK. Raw keys are accepted only on create or rotate and are never returned by API responses. OpenAI and Anthropic are executable hosted providers; Gemini and custom are scaffolded metadata providers.

### `POST /api/projects/<project-id>/secrets`

Body:

- `provider` - `openai`, `anthropic`, `gemini`, or `custom`
- `environment` - `development`, `staging`, or `production`
- `name` - display name
- `secretValue` - raw provider API key; accepted only for encryption and never returned

Returns:

- `secret` - safe metadata with `id`, `ref`, `projectId`, `environment`, `provider`, `name`, `displayName`, `configured`, `maskedValue`, `maskedPreview`, `status`, timestamps, and validation metadata

### `GET /api/projects/<project-id>/secrets`

Lists safe metadata for non-deleted project secrets.

### `POST /api/projects/<project-id>/secrets/<secret-id>/validate`

Validates OpenAI or Anthropic credentials with a minimal provider request. Validation updates safe metadata only: `validationStatus`, `lastValidationErrorClass`, and redacted `lastValidationError`.

### `PATCH /api/projects/<project-id>/secrets/<secret-id>`

Rotates the encrypted value or updates provider/name/environment metadata. Raw values are accepted only in the request body and never returned.

### `POST /api/projects/<project-id>/secrets/<secret-id>`

With `{ "action": "disable" }`, disables a secret so hosted provider jobs cannot use it. With `{ "action": "validate" }`, performs the same validation as the `/validate` route for local/dev runtimes that route actions through query params.

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

Execution targets are validated before enqueueing when possible. Local tunnel job creation rejects invalid URLs, non-HTTPS URLs, localhost, private IP ranges, link-local ranges, cloud metadata endpoints, DNS resolutions to private/internal IPs, unsafe redirects, unreachable tunnel endpoints, preflight timeouts, oversized responses, non-2xx preflight responses, non-JSON preflight responses, missing production token secrets, unsupported contract versions, and preflight responses that do not confirm readiness with `{ "ok": true, "contractVersion": "harnessamp_http_runner_v1" }` or `{ "ready": true, "contractVersion": "harnessamp_http_runner_v1" }`. The same URL and redirect safety checks run during worker dispatch. Hosted provider job creation rejects disabled BYOK, missing `secretRef`, missing model, unsupported provider, provider/environment mismatch, disabled/deleted secrets, cross-project secrets, raw provider API keys in job payloads, and organization plans that do not include Hosted BYOK. Full benchmark and CI gate runs are blocked before enqueue unless the organization plan includes those features and has enough monthly capacity.

### `POST /api/projects/<project-id>/validate-target`

Runs safe execution target validation before launch. Local tunnel validation uses the adapter doctor path and returns pass/fail checks for reachability, token acceptance, JSON validity, observation contract validity, private/internal URL blocking, and supported contract version. Validation writes a safe `execution_target_validation` audit event with project id, actor id, target id when available, target type, phase, pass/fail status, failure class, status code, duration, contract version when available, and created timestamp. It does not store tokens, nonces, secrets, authorization headers, full sensitive URLs, or request/response bodies.

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

For adapter-backed and hosted-provider jobs, `result.diagnostics` contains the normalized adapter envelope: adapter type, safe target, timestamps, latency, HTTP status, timeout flag, retry attempt, worker id, job id, benchmark id/version, scenario id, mutation id/family, contract version when available, failure class, safely truncated raw error, retryability, usage metadata where available, and execution phase.

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

Non-retryable execution classes currently stop immediately: `execution_target_missing`, `execution_target_invalid`, `execution_target_unsupported`, `registered_runner_missing`, `vercel_ai_sdk_route_missing`, `hosted_provider_disabled`, `hosted_provider_missing_secret`, `hosted_provider_invalid_secret`, `hosted_provider_auth_failed`, `hosted_provider_invalid_request`, `hosted_provider_model_missing`, `local_tunnel_redirect_blocked`, `local_tunnel_private_ip_blocked`, `local_tunnel_contract_mismatch`, `local_tunnel_invalid_json`, `local_tunnel_token_secret_missing`, `adapter_contract_version_unsupported`, `adapter_observation_scenario_mismatch`, `adapter_target_missing`, `adapter_invalid_response`, `adapter_schema_mismatch`, and `adapter_worker_canceled`.

Local tunnel-specific failure classes include `local_tunnel_unreachable`, `local_tunnel_timeout`, `local_tunnel_tls_error`, `local_tunnel_dns_error`, `local_tunnel_redirect_blocked`, `local_tunnel_private_ip_blocked`, `local_tunnel_contract_mismatch`, `local_tunnel_invalid_json`, `local_tunnel_token_secret_missing`, `local_tunnel_http_error`, and `local_tunnel_closed_or_expired`.

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
