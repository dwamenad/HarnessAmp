# Architecture

HarnessAmp has three main layers:

1. `src/main.js` renders the browser interface.
2. `src/engine.js` normalizes bundles, analyzes the harness, and builds the report data.
3. `scripts/analyze.mjs` exposes the same engine in the terminal.

The repo is intentionally split so the UI, scoring logic, and CLI output stay aligned.

Inside the product, the analysis model is four-layered:

1. `intent` - the mission that should remain stable
2. `contract` - the hard constraints and role boundaries
3. `benchmark` - the cases and assertions proving the contract
4. `wrapper` - the mutable prompt, tool, schema, and runtime surface

Only the wrapper should drift under test.

Supporting content lives in:

- `examples/` for starter bundles and sample packs
- `tests/` for engine and regression coverage
- `docs/` for operator-facing references
