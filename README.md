# HarnessAmp

[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Node 18+](https://img.shields.io/badge/Node-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![CLI First](https://img.shields.io/badge/CLI-first-orange)](#quick-start)
[![JSON Bundles](https://img.shields.io/badge/JSON-bundles-4C78FF)](#quick-start)

HarnessAmp stress-tests AI agents before production. It wraps an existing harness, applies deterministic mutations to prompts, tools, permissions, context, network sinks, and sandbox boundaries, then reports where reliability breaks.

<p align="center">
  <img src="docs/screenshots/readme-hero-gate.png" alt="HarnessAmp robustness gate hero showing baseline, mutated pass rate, robustness gap, and recommended control" width="900">
  <br/>
  <em>HarnessAmp turns wrapper fragility into a visible Robustness Gap and PR-ready release signal.</em>
</p>

## What it does

HarnessAmp is not an agent framework. It is reliability infrastructure around agent frameworks, graph workflows, MCP tool servers, HTTP runners, and custom harnesses.

The workflow is:

```text
Wrap -> Mutate -> Run -> Diagnose -> Gate
```

Core surfaces:

- `src/core/` - bundle normalization, trace compiler, diagnosis, and failure taxonomy
- `src/mutations/` - deterministic mutation packs and risk-profile selection
- `src/adapters/` - runner contract and adapter placeholders
- `src/reports/` - failure corpus and report artifacts
- `src/cli/` - command manifest and terminal workflow
- `api/` - Vercel report and telemetry endpoints

## Quick start

```bash
git clone https://github.com/dwamenad/HarnessAmp.git
cd HarnessAmp
npm install
npm run dev
```

`npm run dev` starts both the Vite frontend and the local API runtime. By default:

- `/` is the product landing page
- `/app` is the interactive evaluation surface
- `/docs` is the built-in documentation experience

If you want a seeded local session instead of anonymous mode, restart dev with:

```bash
HARNESSAMP_DEV_AUTH=1 npm run dev
```

Useful commands:

| Task | Command |
| --- | --- |
| Browser demo | `npm run dev` |
| Analyze bundle | `npm run analyze -- examples/demo-bundle.json` |
| Diagnose mutations | `npm run diagnose -- examples/demo-bundle.json` |
| Release gate | `npm run release:gate` |
| GitHub Action gate | `node scripts/github-action.mjs --bundle examples/demo-bundle.json` |
| Custom HTTP runner | `node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --runner-kind custom_http --runner-endpoint https://runner.example.com/harnessamp` |
| Replit demo | `npm run replit:start` |
| Compile traces | `npm run compile:traces` |
| Run tests | `npm test` |
| Run E2E tests | `npm run test:e2e` |
| Build | `npm run build` |

## Product surfaces

HarnessAmp now ships as three focused surfaces instead of one long page:

- `/` - a shorter product landing page with workflow, proof, and report preview
- `/app` - the interactive evaluation surface for running assessments and reviewing reports
- `/docs` - repo-backed docs rendered from the checked-in Markdown and JSON reference files

The `/app` surface includes:

- sample workflows and scenario packs
- optional JSON upload and pasted source data behind `Edit source data`
- Ajv validation against the repo schemas
- risk profiles for support, browser, and tool-heavy agents
- configurable thresholds for overall score, stressed score, and performance drop
- connected HTTP runner configuration
- browser-saved and workspace-saved reports
- copy/download actions for reports, packs, workflow snippets, and share links

<p align="center">
  <img src="docs/screenshots/readme-console-gate.png" alt="HarnessAmp product console with bundle presets, risk profiles, mutation intensity, schema validation, and benchmark contract panels" width="900">
  <br/>
  <em>Interactive app surface with guided evaluations, connected runners, validation, and release-gate thresholds.</em>
</p>

Anonymous visitors can use the landing page, docs, and app without errors. Sign in only when you want shared workspace reports, team projects, or saved runner setup.

## Replit demo

HarnessAmp includes a Replit-ready demo that starts the web console and a custom HTTP runner endpoint.

```bash
npm run replit:start
```

Then point the HTTP runner field at:

```text
https://<your-repl-url>/harnessamp
```

See [docs/replit.md](docs/replit.md) and [examples/replit](examples/replit).

## Mutation packs

Current deterministic packs:

- `prompt_integrity_pack`
- `tool_payload_pack`
- `permissioning_pack`
- `network_sink_pack`
- `context_memory_pack`
- `sandbox_boundary_pack`
- `multimodal_pack`

Each pack targets wrapper conditions that often change between a clean demo and production: prompt phrasing, tool payload shape, approval state, network sinks, memory context, sandbox scope, and multimodal inputs.

## Reports and CI

Reports can be exported as Markdown or JSON, saved locally, or saved through the Vercel API routes. Durable shared reports require KV environment variables:

```text
KV_REST_API_URL
KV_REST_API_TOKEN
```

Release gates fail on configured thresholds for overall score, holdout pass rate, and robustness gap.

The reusable GitHub Action at `action.yml` turns HarnessAmp into a PR-blocking robustness gate. It emits:

- `harnessamp-report.md`
- `harnessamp-report.json`
- `harnessamp-failure-corpus.json`

The PR-facing metric is `Robustness Gap`, defined as original pass rate minus mutated pass rate.

<p align="center">
  <img src="docs/screenshots/readme-ci-action.png" alt="HarnessAmp integrations view showing reusable GitHub Action configuration and artifact outputs" width="900">
  <br/>
  <em>Reusable GitHub Action flow that emits Markdown, JSON, and failure-corpus artifacts.</em>
</p>

## Docs

- Built-in docs route: `/docs`
- [Installation](docs/installation.md)
- [Usage](docs/usage.md)
- [CLI](docs/cli.md)
- [GitHub OAuth](docs/github-oauth.md)
- [Replit demo](docs/replit.md)
- [Failure patterns](docs/failure-patterns.md)
- [MCP manifest prototype](docs/mcp.md)
- [Mutation engine](docs/mutation-engine.md)
- [Runner contract](docs/adapters/runner-contract.md)
- [Testing](docs/testing.md)
- [Architecture](docs/architecture.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md).
