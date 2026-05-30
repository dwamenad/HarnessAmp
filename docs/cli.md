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
```

Flags:

- `--json` prints the full analysis object.
- `--pack` prints the generated pack payload.
- `--concurrency <n>` sets how many baseline/mutation run jobs execute at once for `run`, `report`, and `diagnose`.
- `--run-attempts <n>` retries failed run jobs before the diagnosis fails.
- `--retry-backoff-ms <n>` waits before retrying a failed run job.
- `--timeout-ms <n>` fails an individual run job after the configured timeout.
- no flag prints the markdown report.

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

Docker workflow:

1. Build the image with `npm run docker:build`.
2. Run it with `docker run --rm -p 8088:80 harnessamp:local`.
3. Use the container when you want the production build rather than Vite dev mode.
