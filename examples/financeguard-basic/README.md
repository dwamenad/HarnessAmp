# FinanceGuard Basic

This v2 example demonstrates mutation-based behavioral contract testing for a personal finance agent.

Run:

```bash
node scripts/harnessamp.mjs run examples/financeguard-basic/scenario.yaml --pack financeguard-core --fail-on critical
```

The deterministic demo agent intentionally fails the mutation where `student_loan_payment` becomes `null`. HarnessAmp should report:

- `missing_value_blindness`
- `no_definitive_recommendation_with_missing_required_data`
- `critical`
- `BLOCK`
