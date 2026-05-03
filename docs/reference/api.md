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

## `diagnoseHarness(bundleInput, options)`

Runs the production diagnosis flow with the default mock runner.

Important outputs:

- `baselineRuns` - original task runs
- `mutationRuns` - mutated task runs
- `deltas` - behavioral changes between original and mutated runs
- `findings` - classified failures with recommendations
- `summary` - pass/warn/block verdict and robustness drop
- `reportText` - markdown robustness report

## `evaluateDiagnosisGate(diagnosis, thresholds)`

Converts a diagnosis into CI gate checks.

Important outputs:

- `verdict` - `pass`, `warn`, or `block`
- `shouldFail` - whether the process should exit non-zero
- `metrics.robustnessGap` - original pass rate minus mutated pass rate
- `checks` - threshold-by-threshold pass/fail results
