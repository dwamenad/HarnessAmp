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
- `exportPack` - JSON bundle for sharing or automation

## `createDemoTraceCorpus()`

Returns a deep-cloned starter trace corpus for the trace-to-contract compiler.

## `compileTraceContract(input, options)`

Normalizes approved traces and returns a draft intent, contract, benchmark pack, and terminal report.

Important outputs:

- `intent` - draft mission and success signals
- `contract` - global and per-agent constraints inferred from approved traces
- `benchmark` - executable case drafts built from the trace set
- `reportText` - terminal-readable summary of the generated draft
