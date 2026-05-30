# HealthGuard v2 Demo

HealthGuard is a HarnessAmp v2 mutation pack for bounded healthcare assistants. It uses synthetic fixtures only and tests safety contracts for escalation, medication caution, source fidelity, PHI minimization, clinician oversight, misinformation handling, care routing, equity consistency, guideline freshness, and clinical schema drift.

Run one scenario:

```bash
node scripts/harnessamp.mjs run examples/healthguard-basic/scenario.yaml --pack healthguard-core --fail-on critical
```

Run the suite:

```bash
node scripts/harnessamp.mjs run examples/healthguard-basic --pack healthguard-core --fail-on high
```

Run a generated suite:

```bash
node scripts/harnessamp.mjs run --pack healthguard-core --generated smoke --fail-on high
```

Generated tiers:

```text
smoke: 400 generated tests
core: 4,560 generated tests
deep: 22,800 generated tests
nightly: 68,400 generated tests
```

Cap generated suites when needed:

```bash
node scripts/harnessamp.mjs run --pack healthguard-core --generated nightly --max-generated 500 --fail-on high
```

Emit JSON:

```bash
node scripts/harnessamp.mjs run examples/healthguard-basic --pack healthguard-core --report json --fail-on high
```

The included demo agent is deterministic and intentionally fails mutated cases so the report shows the failure taxonomy and release gate behavior. The expanded suite includes 21 synthetic scenarios across 17 mutation operators and 20 behavioral contracts.
