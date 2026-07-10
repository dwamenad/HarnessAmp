# CI Diagnose Gate

`node scripts/harnessamp.mjs diagnose` returns a release recommendation:

- `pass` exits with `0`
- `warn` exits with `1`
- `block` exits with `2`

Use `warn` as a non-blocking signal while a release gate is still immature. Use `block` once the gate has reviewed `intent`, `contract`, and `benchmark` sections.

Example:

```bash
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --max-mutations 20
```

For larger harnesses, tune execution instead of increasing serverless request time:

```bash
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json \
  --max-mutations 80 \
  --concurrency 8 \
  --run-attempts 2 \
  --retry-backoff-ms 1000 \
  --timeout-ms 60000
```

Diagnosis now creates explicit baseline and mutation run jobs. Each job moves through `queued`, `running`, `retrying`, `completed`, `failed`, or `canceled`, and the final JSON report includes a `runJobs` section for CI artifacts and worker debugging.

External coding-agent runners can return redacted command logs, file diffs, sandbox events, approval events, and terminal output. HarnessAmp normalizes those into `runArtifacts` so CI can publish compact debugging evidence without storing full raw transcripts inline.

The report is intentionally diagnostic. It should identify the mutation, trust boundary, failure type, and engineering control rather than only returning a score.
