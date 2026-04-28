# Risk profile examples

Risk profiles select mutation packs before a diagnose run.

Use them with:

```bash
node scripts/harnessamp.mjs mutate examples/demo-bundle.json --risk-profile '{"agentDomain":"browser_agent","toolRisk":["external_network"],"dataSensitivity":["pii"],"autonomyLevel":"semi_autonomous"}'
```

The schema lives at `docs/schemas/risk_profile.schema.json`.
