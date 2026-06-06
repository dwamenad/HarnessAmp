# CLI

The CLI uses the same engine as the browser UI.

```bash
npm run analyze
npm run analyze -- examples/demo-bundle.json
npm run analyze -- examples/demo-bundle.json --pack
npm run analyze -- examples/demo-bundle.json examples/cli/observed-runs.json
npm run compile:traces
npm run compile:traces -- examples/traces/approved-support-traces.json
npm run compile:traces -- examples/traces/approved-support-traces.json --pack
npm run collect:failures -- examples/demo-bundle.json examples/cli/observed-runs.json
npm run release:gate -- examples/demo-bundle.json examples/cli/observed-runs.json
npm run diagnose -- examples/demo-bundle.json
node scripts/harnessamp.mjs mutate examples/demo-bundle.json --max-mutations 20
node scripts/harnessamp.mjs worker --project-id <project-id> --api-url http://127.0.0.1:3000
node scripts/harnessamp.mjs benchmark import examples/benchmarks/support-mvp/benchmark-pack.json --out benchmark.lifecycle.json
node scripts/harnessamp.mjs benchmark edit benchmark.lifecycle.json --edits benchmark-edits.json --out benchmark.lifecycle.json
node scripts/harnessamp.mjs benchmark review benchmark.lifecycle.json --decision approve --comments "Approved for release gate." --out benchmark.lifecycle.json
node scripts/harnessamp.mjs benchmark export benchmark.lifecycle.json --version approved --out benchmark-pack.json
```

Flags:

- `--json` prints the full analysis object.
- `--pack` prints the generated pack payload.
- `--concurrency <n>` sets how many baseline/mutation run jobs execute at once for `run`, `report`, and `diagnose`.
- `--run-attempts <n>` retries failed run jobs before the diagnosis fails.
- `--retry-backoff-ms <n>` waits before retrying a failed run job.
- `--timeout-ms <n>` fails an individual run job after the configured timeout.
- no flag prints the markdown report.

Worker flags:

- `--project-id <id>` selects the project whose queued/retrying runner jobs should be claimed.
- `--api-url <url>` points at the local HarnessAmp API, defaulting to `http://127.0.0.1:3000`.
- `--worker-id <id>` records the worker label on claimed jobs.
- `--worker-token <token>` sends a worker service bearer token. Prefer `WORKER_SERVICE_TOKEN` in production.
- `--once` polls once and exits.
- `--interval-ms <n>` controls polling delay for long-running workers.
- `--max-jobs <n>` exits after processing that many jobs.

Typical terminal-first flow:

1. Save a harness bundle as JSON.
2. Run `npm run analyze -- <bundle.json>`.
3. Inspect whether `intent`, `contract`, and `benchmark` are explicit in the source pack.
4. Inspect visible vs holdout gaps directly in the terminal.
5. Export the pack if you want to share it with another teammate or CI job.

Typical trace compiler flow:

1. Save approved traces as JSON.
2. Run `npm run compile:traces -- <trace-corpus.json>`.
3. Review the generated `intent`, `contract`, and `benchmark` draft.
4. Promote the approved draft into your benchmark source of truth before running wrapper mutations.

Typical benchmark lifecycle flow:

1. Run `node scripts/harnessamp.mjs benchmark validate <benchmark-pack.json>` before importing a pack.
2. Run `node scripts/harnessamp.mjs benchmark import <benchmark-pack.json> --out benchmark.lifecycle.json` to create a local lifecycle file.
3. Run `node scripts/harnessamp.mjs benchmark edit benchmark.lifecycle.json --edits edits.json --out benchmark.lifecycle.json` to create an immutable draft version from the same edit payload used by the API.
4. Run `node scripts/harnessamp.mjs benchmark review benchmark.lifecycle.json --decision approve --comments "..." --out benchmark.lifecycle.json`.
5. Run `node scripts/harnessamp.mjs benchmark export benchmark.lifecycle.json --version approved --out benchmark-pack.json` for CI or teammate handoff.

Typical failure corpus flow:

1. Run wrapper mutations against a benchmark pack.
2. Collect failing variants with `npm run collect:failures -- <bundle.json> <observations.json>`.
3. Merge the resulting corpus into your running private failure set.
4. Use repeated failures to justify new mutation families or release thresholds.

Typical release gate flow:

1. Run `npm run release:gate -- <bundle.json> <observations.json>`.
2. Set thresholds for overall score, holdout pass rate, and max gap.
3. Publish the markdown/json artifacts in CI.
4. Block merges when hidden holdouts regress.

Typical mutation diagnosis flow:

1. Run `node scripts/harnessamp.mjs validate <bundle.json>`.
2. Run `node scripts/harnessamp.mjs mutate <bundle.json> --max-mutations 20` to inspect selected mutation records.
3. Run `node scripts/harnessamp.mjs diagnose <bundle.json> --concurrency 4` to produce the robustness report.
4. Treat `PASS`, `WARN`, and `BLOCK` as the CI/release signal.

Typical local worker flow:

1. Start the local app/API with `npm run dev`.
2. Register a runner and enqueue jobs from the console.
3. Run `node scripts/harnessamp.mjs worker --project-id <project-id> --once` to process currently queued jobs.
4. Omit `--once` to keep polling for new queued or retrying jobs.

Docker workflow:

1. Build the image with `npm run docker:build`.
2. Run it with `docker run --rm -p 8088:80 harnessamp:local`.
3. Use the container when you want the production build rather than Vite dev mode.
