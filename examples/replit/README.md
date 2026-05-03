# HarnessAmp on Replit

This example makes HarnessAmp easy to fork and run on Replit.

It starts two local services:

- HarnessAmp web console on port `4173`
- demo custom HTTP runner on port `8787`

## Run

In Replit, press **Run**.

Locally, run:

```bash
npm install
npm run replit:start
```

## Try the custom HTTP runner

Use the Replit runner endpoint in the HarnessAmp UI:

```text
https://<your-repl-url>/harnessamp
```

Or run it from the shell:

```bash
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json \
  --runner-kind custom_http \
  --runner-endpoint http://127.0.0.1:8787/harnessamp \
  --max-mutations 6
```

## What this proves

The demo shows the core HarnessAmp integration story:

1. HarnessAmp generates baseline and mutated harness payloads.
2. A real external runner receives those payloads.
3. The runner returns normalized pass/fail evidence.
4. HarnessAmp computes the Robustness Gap.
5. The report explains which mutation condition broke reliability.

This is the fastest path for someone to understand HarnessAmp without wiring a production agent first.
