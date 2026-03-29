# Architecture

HarnessAmp has three main layers:

1. `src/main.js` renders the browser interface.
2. `src/engine.js` normalizes bundles, analyzes the harness, and builds the report data.
3. `scripts/analyze.mjs` exposes the same engine in the terminal.

The repo is intentionally split so the UI, scoring logic, and CLI output stay aligned.

Supporting content lives in:

- `examples/` for starter bundles and sample packs
- `tests/` for engine and regression coverage
- `docs/` for operator-facing references

