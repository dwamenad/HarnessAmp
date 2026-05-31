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

### `POST /api/benchmarks?action=edit&versionId=<version-id>`

Creates a new draft version from an existing benchmark version and returns the field/case/tool diff.

Body:

- `edits.intentMission` - replacement mission text
- `edits.mustText` - newline-separated required behaviors
- `edits.mustNotText` - newline-separated forbidden behaviors
- `edits.successSignalsText` - optional newline-separated success signals
- `edits.casePatch` - optional single-case patch with `id`, `title`, `input`, `assertionsText`, and `forbiddenActionsText`

Important outputs:

- `baseVersion` - source version used for the edit
- `version` - new draft version
- `diff` - changed fields plus case and tool changes
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
