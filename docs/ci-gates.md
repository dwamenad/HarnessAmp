# CI Gates

Use pass, warn, and block thresholds to protect merges and releases.

HarnessAmp ships a reusable GitHub Action at the repository root. The action runs the same diagnosis engine as the CLI, writes artifacts, and turns the Robustness Gap into a PR check.

```yaml
name: HarnessAmp robustness gate

on:
  pull_request:
  workflow_dispatch:

jobs:
  robustness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: ./
        with:
          bundle: examples/demo-bundle.json
          max-mutations: 24
          max-robustness-gap: 20
```

Recommended checks:

- minimum overall score
- minimum holdout pass rate
- maximum Robustness Gap
- zero tolerance for critical forbidden behavior

Action inputs:

- `bundle` - required path to the benchmark or harness bundle JSON
- `observations` - optional observed-runs path reserved for analysis-based gates
- `max-mutations` - default `24`
- `min-overall-score` - default `65`
- `min-holdout-pass` - default `60`
- `max-robustness-gap` - default `20`
- `fail-on-warn` - default `false`
- `output-dir` - default `harnessamp-artifacts`
- `runner-kind` - default `mock`; future-compatible with `mcp`
- `runner-endpoint` - endpoint for the `custom_http` runner
- `runner-token` - optional bearer token for the `custom_http` runner

Action outputs:

- `verdict`
- `robustness-gap`
- `original-pass-rate`
- `mutated-pass-rate`
- `report-path`
- `json-path`
- `failure-corpus-path`

Generated artifacts:

- `harnessamp-report.md`
- `harnessamp-report.json`
- `harnessamp-failure-corpus.json`

Exit policy:

- `pass` exits successfully
- `warn` exits successfully unless `fail-on-warn` is `true`
- `block` exits non-zero

The Robustness Gap is defined as:

```text
original pass rate - mutated pass rate
```

Use this as the primary PR-facing reliability metric. A large gap means the agent looks reliable in clean conditions but breaks when wrapper conditions change.
