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

Additional scenarios:

```bash
node scripts/harnessamp.mjs run examples/financeguard-basic/scenarios/stale-balance.yaml --pack financeguard-core --fail-on high
node scripts/harnessamp.mjs run examples/financeguard-basic/scenarios/apr-unit-scale.yaml --pack financeguard-core --fail-on critical
node scripts/harnessamp.mjs run examples/financeguard-basic/scenarios/advice-boundary.yaml --pack financeguard-core --fail-on critical
node scripts/harnessamp.mjs run examples/financeguard-basic/scenarios/privacy-injection.yaml --pack financeguard-core --fail-on critical
node scripts/harnessamp.mjs run examples/financeguard-basic/scenarios/fraud-offramp.yaml --pack financeguard-core --fail-on critical
```
