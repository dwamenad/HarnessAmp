# Harness-1 Adapter Example

This folder contains the minimal payload shape for testing a local Harness-1 deployment with HarnessAmp RetrievalGuard.

Harness-1 is not treated as a hosted HarnessAmp runner. Run a local adapter that accepts `POST /harnessamp`, calls the Harness-1 local vLLM/evaluation flow, then returns HarnessAmp observations.

Start the adapter:

```sh
npm run harness1:adapter
```

By default it returns deterministic contract-smoke responses so HarnessAmp can verify the runner shape. To delegate to a real local Harness-1 evaluator, set `HARNESS1_EVAL_COMMAND` to a command that reads the request JSON from stdin and writes a HarnessAmp response JSON to stdout.

Files:

- `request.json`: HarnessAmp-to-adapter request
- `response.json`: adapter-to-HarnessAmp response
- `server.mjs`: local `POST /harnessamp` adapter

Use this example when configuring a private runner endpoint from the HarnessAmp console.
