# Replit Demo

HarnessAmp includes a Replit-ready demo for quick public testing.

## What it runs

- Web console: `npm run dev -- --host 0.0.0.0 --port 4173`
- Custom HTTP runner: `node examples/replit/custom-http-runner.mjs`

The runner exposes:

```text
GET /health
POST /harnessamp
```

## Replit flow

1. Import or fork the GitHub repository into Replit.
2. Press **Run**.
3. Open the web console.
4. Set the HTTP runner endpoint to:

```text
https://<your-repl-url>/harnessamp
```

5. Run a robustness diagnosis.

## Local flow

```bash
npm install
npm run replit:start
```

In another shell:

```bash
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json \
  --runner-kind custom_http \
  --runner-endpoint http://127.0.0.1:8787/harnessamp \
  --max-mutations 6
```

## Why this exists

This demo is a fast way to show HarnessAmp's core product wedge:

- HarnessAmp owns mutation, diagnosis, reporting, and the release gate.
- The agent or runner can live somewhere else.
- A simple HTTP boundary is enough to start collecting real robustness evidence.
