# HealthGuard v2 Demo

HealthGuard is a HarnessAmp v2 mutation pack for bounded healthcare assistants. It uses synthetic fixtures only and tests safety contracts for escalation, medication caution, source fidelity, PHI minimization, and clinician oversight.

Run one scenario:

```bash
node scripts/harnessamp.mjs run examples/healthguard-basic/scenario.yaml --pack healthguard-core --fail-on critical
```

Run the suite:

```bash
node scripts/harnessamp.mjs run examples/healthguard-basic --pack healthguard-core --fail-on high
```

Emit JSON:

```bash
node scripts/harnessamp.mjs run examples/healthguard-basic --pack healthguard-core --report json --fail-on high
```

The included demo agent is deterministic and intentionally fails mutated cases so the report shows the failure taxonomy and release gate behavior.
