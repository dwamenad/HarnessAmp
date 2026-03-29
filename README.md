# HarnessAmp

HarnessAmp is a small harness-robustness lab for AI agents.

It is optimized for terminal-first and CLI-first workflows:

- JSON bundles that are easy to generate from shell scripts or Python jobs
- a shared analysis engine used by both the browser UI and the terminal CLI
- report output that can be pasted into reviews, notes, or CI logs

It does three things:

1. Ingests a baseline agent harness.
2. Generates semantically equivalent variants that stress wrapper dependence.
3. Scores how brittle the harness is across visible and hidden holdouts.

The repo ships with:

- a browser UI for editing a harness bundle and viewing the report
- a CLI that prints the same report from the terminal
- a shared scoring engine used by both surfaces

## Run it

```bash
npm install
npm run dev
```

Open the local Vite URL, load the demo bundle, and the app will show a simulated analysis.

If you prefer the terminal, start with:

```bash
npm run analyze -- examples/cli/quickstart-bundle.json
npm run analyze -- examples/cli/quickstart-bundle.json --pack
```

## Build it

```bash
npm run build
```

## Test it

```bash
npm test
```

## CLI

Print the demo report:

```bash
npm run analyze
```

Analyze a bundle file:

```bash
npm run analyze -- examples/demo-bundle.json
```

Output the generated pack JSON:

```bash
npm run analyze -- examples/demo-bundle.json --pack
```

## Input format

The UI and CLI accept a JSON bundle with this shape:

```json
{
  "project": "Northstar Support Copilot",
  "harness": {
    "agentName": "Northstar",
    "systemPrompt": "...",
    "developerPrompt": "...",
    "tools": [],
    "scenarios": [],
    "wrapper": {
      "responseFormat": "json",
      "retryPolicy": {
        "maxAttempts": 3,
        "backoffMs": 400,
        "jitterMs": 120
      },
      "toolApproval": true,
      "stopSequences": ["###STOP###"],
      "messageEnvelope": "system+developer"
    }
  }
}
```

Optional observed runs can be pasted as a JSON array:

```json
[
  {
    "variantId": "prompt-visible",
    "passed": true,
    "score": 88,
    "latencyMs": 1280,
    "notes": "Held under wrapper drift."
  }
]
```

## What the product is for

This is not a benchmark runner. It is a harness hardening tool.

The goal is to catch cases where an agent succeeds only because it learned one exact wrapper:

- prompt wording
- tool names
- schema layout
- retry timing
- scenario order

HarnessAmp mutates those surfaces and highlights the widest gaps so you can fix the brittle parts before release.

## Repository layout

The repo is organized to be easy to scan and expand:

- `docs/` - architecture, usage, CLI, testing, and troubleshooting notes
- `examples/` - starter bundles and structured example packs
- `scripts/` - terminal helpers and report tooling
- `src/` - the browser UI and shared analysis engine
- `tests/` - Node test coverage for the scoring logic

Start with [docs/index.md](docs/index.md) for the guide map.
