# CI Diagnose Gate

`node scripts/harnessamp.mjs diagnose` returns a release recommendation:

- `pass` exits with `0`
- `warn` exits with `1`
- `block` exits with `2`

Use `warn` as a non-blocking signal while a benchmark pack is still immature. Use `block` once the pack has reviewed `intent`, `contract`, and `benchmark` sections.

Example:

```bash
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --max-mutations 20
```

The report is intentionally diagnostic. It should identify the mutation, trust boundary, failure type, and engineering control rather than only returning a score.
