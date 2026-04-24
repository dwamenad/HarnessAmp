# Architecture

HarnessAmp has three main layers:

1. `src/main.js` renders the browser interface.
2. `src/engine.js` normalizes bundles, analyzes the harness, and builds the report data.
3. `scripts/analyze.mjs` exposes the same engine in the terminal.
4. `src/compiler.js` compiles approved traces into draft packs.
5. `src/failure-corpus.js` converts failed variants into a reusable corpus.

The repo is intentionally split so the UI, scoring logic, and CLI output stay aligned.

Inside the product, the analysis model is four-layered:

1. `intent` - the mission that should remain stable
2. `contract` - the hard constraints and role boundaries
3. `benchmark` - the cases and assertions proving the contract
4. `wrapper` - the mutable prompt, tool, schema, and runtime surface

Only the wrapper should drift under test.

Operationally, the repo now supports three distinct artifacts:

1. `benchmark pack` - what should be preserved
2. `analysis export` - what changed under mutation
3. `failure corpus` - what actually broke across runs

Supporting content lives in:

- `examples/` for starter bundles and sample packs
- `tests/` for engine and regression coverage
- `docs/` for operator-facing references
