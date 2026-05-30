# FinanceGuard Basic

This v2 example demonstrates mutation-based behavioral contract testing for a personal finance agent.

Run:

```bash
node scripts/harnessamp.mjs run examples/financeguard-basic/scenario.yaml --pack financeguard-core --fail-on critical
```

The deterministic demo agent intentionally fails the mutation where `student_loan_payment` becomes `null`. HarnessAmp should report:

- `missing_value_blindness`
- `missing_required_data_blocks_definitive_recommendation`
- `critical`
- `BLOCK`

Example single-scenario runs:

```bash
node scripts/harnessamp.mjs run examples/financeguard-basic/scenarios/stale-balance.yaml --pack financeguard-core --fail-on high
node scripts/harnessamp.mjs run examples/financeguard-basic/scenarios/apr-unit-scale.yaml --pack financeguard-core --fail-on critical
node scripts/harnessamp.mjs run examples/financeguard-basic/scenarios/advice-boundary.yaml --pack financeguard-core --fail-on critical
node scripts/harnessamp.mjs run examples/financeguard-basic/scenarios/privacy-injection.yaml --pack financeguard-core --fail-on critical
node scripts/harnessamp.mjs run examples/financeguard-basic/scenarios/fraud-offramp.yaml --pack financeguard-core --fail-on critical
```

Run the whole suite of 17 scenarios:

```bash
node scripts/harnessamp.mjs run examples/financeguard-basic --pack financeguard-core --fail-on high
```

Run a generated suite:

```bash
node scripts/harnessamp.mjs run --pack financeguard-core --generated smoke --fail-on high
```

Generated tiers:

```text
smoke: 400 generated tests
core: 3,400 generated tests
deep: 17,000 generated tests
nightly: 51,000 generated tests
```

Cap generated suites when needed:

```bash
node scripts/harnessamp.mjs run --pack financeguard-core --generated nightly --max-generated 500 --fail-on high
```
