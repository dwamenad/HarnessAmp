# HarnessAmp

<p align="center">
  <strong>Production-ready mutation testing and release gates for AI agents.</strong>
  <br/>
  Wrap any agent harness, mutate the operating envelope, run the same workflow through real or mock runners, and ship with a measurable Robustness Gap.
</p>

<p align="center">
  <a href="#quick-start"><img src="https://img.shields.io/badge/CLI-production%20ready-111827" alt="CLI production ready"></a>
  <a href="#generated-suite-scale"><img src="https://img.shields.io/badge/generated%20suites-51k%2B-4C78FF" alt="Generated suites"></a>
  <a href="#ci-and-release-gates"><img src="https://img.shields.io/badge/CI-gate%20ready-0F766E" alt="CI gate ready"></a>
  <a href="#runner-integrations"><img src="https://img.shields.io/badge/runners-HTTP%20%2F%20MCP%20%2F%20custom-7C3AED" alt="Runner integrations"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node-18%2B-339933?logo=node.js&logoColor=white" alt="Node 18+"></a>
  <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white" alt="Vite 6"></a>
</p>

<p align="center">
  <img src="docs/screenshots/readme-hero-gate.png" alt="HarnessAmp robustness gate hero showing baseline, mutated pass rate, robustness gap, and recommended control" width="900">
  <br/>
  <em>HarnessAmp turns wrapper fragility into a visible release signal: pass, warn, or block.</em>
</p>

## What HarnessAmp Is

HarnessAmp is reliability infrastructure for production AI agents. It is not another agent framework. It sits around the agent systems teams already use: graph workflows, model SDKs, MCP tool servers, browser agents, coding agents, custom HTTP runners, and internal harnesses.

The core loop is simple:

```text
Wrap -> Mutate -> Run -> Diagnose -> Gate
```

HarnessAmp validates an approved harness, applies deterministic mutations to the wrapper around the agent, executes baseline and mutated tasks, clusters failures by root cause, and emits CI-ready artifacts that explain what broke and how to fix it.

## Why Teams Use It

| Production problem | HarnessAmp answer |
| --- | --- |
| Agent demos pass, but production wrappers drift. | Deterministic mutations stress prompts, tools, permissions, memory, network sinks, sandbox scope, and multimodal context. |
| Generic eval scores do not explain failure causes. | Reports classify failure types, trust boundaries, behavioral deltas, and recommended controls. |
| Large suites are expensive to run naively. | Generated suites are risk-prioritized, shardable, capped, and filterable by severity or surface. |
| CI needs a clear release decision. | The robustness gate returns `pass`, `warn`, or `block` and writes Markdown, JSON, and failure-corpus artifacts. |
| Teams already have their own agent runtime. | The runner contract supports mock, custom HTTP, MCP-style, and future adapter workflows. |

## Quick Start

```bash
git clone https://github.com/dwamenad/HarnessAmp.git
cd HarnessAmp
npm install
npm run dev
```

`npm run dev` starts the Vite frontend and local API runtime.

| Route | Purpose |
| --- | --- |
| `/` | Product landing page |
| `/app` | Interactive evaluation console |
| `/docs` | Repo-backed documentation browser |

For a seeded local session:

```bash
HARNESSAMP_DEV_AUTH=1 npm run dev
```

Run the production CLI path:

```bash
node scripts/harnessamp.mjs validate examples/demo-bundle.json
node scripts/harnessamp.mjs report examples/demo-bundle.json
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --json
```

`diagnose` is a gate command. It exits non-zero when the evaluated harness should warn or block.

## Production Workflow

```text
1. Define the harness bundle
2. Select risk profile and mutation packs
3. Run baseline tasks
4. Run mutated tasks through the same runner contract
5. Compute behavioral deltas
6. Classify failures and cluster duplicates
7. Emit report, JSON, failure corpus, and release verdict
```

The report is designed for engineering review, not vanity scoring. It names the mutation, the trust boundary, the observed behavior change, the failure type, and the recommended hardening control.

## Generated Suite Scale

HarnessAmp ships large deterministic generated suites for the generic v1 mutation engine and high-stakes v2 packs.

| Engine | Smoke | Core | Deep | Nightly |
| --- | ---: | ---: | ---: | ---: |
| v1 generic mutation engine | 400 | 3,400 | 17,000 | 51,000 |
| FinanceGuard v2 | 400 | 3,400 | 17,000 | 51,000 |
| HealthGuard v2 | 400 | 4,560 | 22,800 | 68,400 |

Run generated v1 suites:

```bash
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --generated smoke
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --generated nightly --shard 1/10
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --generated core --severity critical,high --surface permission,network
```

The generated v1 engine is optimized for production use:

- risk-prioritized ordering by severity and mutation surface
- shardable execution for parallel CI workers
- caps for local sampling and incremental rollout
- severity and surface filters for changed-area testing
- `failureClusters` to deduplicate repeated generated findings
- `mutationValue` to rank base mutations by unique failure yield

## Domain Packs

HarnessAmp v2 includes contract-based packs for high-stakes assistants.

| Pack | Focus | Run it |
| --- | --- | --- |
| FinanceGuard | Personal finance safety, numerical fidelity, fraud/dispute offramps, privacy, account-action boundaries, advice limits. | `node scripts/harnessamp.mjs run --pack financeguard-core --generated smoke --fail-on high` |
| HealthGuard | Clinical caution, red-flag escalation, medication safety, PHI minimization, clinician oversight, source fidelity, equity consistency. | `node scripts/harnessamp.mjs run --pack healthguard-core --generated smoke --fail-on high` |

FinanceGuard currently covers 20 generated templates, 16 mutation operators, and 15 behavioral contracts. HealthGuard currently covers 21 synthetic scenarios, 17 mutation operators, and 20 behavioral contracts.

## Product Console

The web app gives operators a guided surface for running assessments and reviewing release reports.

<p align="center">
  <img src="docs/screenshots/readme-console-gate.png" alt="HarnessAmp product console with bundle presets, risk profiles, mutation intensity, schema validation, and benchmark contract panels" width="900">
  <br/>
  <em>Interactive console with bundle presets, schema validation, runner setup, thresholds, saved reports, and release-gate output.</em>
</p>

The `/app` surface includes:

- sample workflows, benchmark packs, and scenario packs
- JSON upload and pasted source data behind `Edit source data`
- Ajv validation against checked-in schemas
- risk profiles for support, browser, and tool-heavy agents
- configurable thresholds for score, holdout pass rate, performance drop, and Robustness Gap
- connected HTTP runner configuration
- browser-saved and workspace-saved reports
- copy and download actions for reports, packs, snippets, and share links

Anonymous visitors can use the landing page, docs, and app. Sign in only when shared workspace reports, team projects, or saved runner setup are needed.

## Mutation Packs

The v1 registry ships seven deterministic mutation packs:

| Pack | Surface |
| --- | --- |
| `prompt_integrity_pack` | Ambiguity, instruction hierarchy, confidence traps, fake approvals, citation pressure |
| `tool_payload_pack` | Missing fields, wrong types, error-as-success, cross-tenant records, embedded instructions |
| `permissioning_pack` | Human approval, tenant context, tool identity |
| `network_sink_pack` | Callback URLs, outbound data leakage, destination trust |
| `context_memory_pack` | Stale history, irrelevant context, memory conflicts |
| `sandbox_boundary_pack` | Filesystem and environment boundaries |
| `multimodal_pack` | OCR and metadata instruction injection |

Sandbox-boundary mutations are defensive and non-procedural. They verify expected boundary enforcement without documenting exploit steps.

## Runner Integrations

HarnessAmp keeps customer workloads outside the product. It sends a baseline or mutated payload to a runner and expects a normalized `AgentRunResult` back.

Supported today:

- `mock` runner for local end-to-end testing
- `custom_http` runner for production agent endpoints
- Replit demo runner for public demos
- adapter placeholders for model SDKs, graph workflows, crew-style workflows, multi-agent runtimes, and MCP-style runners

Custom HTTP example:

```bash
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json \
  --runner-kind custom_http \
  --runner-endpoint https://runner.example.com/harnessamp \
  --concurrency 8 \
  --run-attempts 2 \
  --timeout-ms 30000
```

See [runner contract](docs/adapters/runner-contract.md).

## CI And Release Gates

The reusable GitHub Action at `action.yml` turns HarnessAmp into a PR-blocking robustness gate.

```yaml
name: HarnessAmp robustness gate

on:
  pull_request:
  workflow_dispatch:

jobs:
  robustness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: ./
        with:
          bundle: examples/demo-bundle.json
          max-mutations: 24
          max-robustness-gap: 20
          output-dir: harnessamp-artifacts
```

CI artifacts:

- `harnessamp-report.md`
- `harnessamp-report.json`
- `harnessamp-failure-corpus.json`

The PR-facing metric is `Robustness Gap`: original pass rate minus mutated pass rate.

<p align="center">
  <img src="docs/screenshots/readme-ci-action.png" alt="HarnessAmp integrations view showing reusable GitHub Action configuration and artifact outputs" width="900">
  <br/>
  <em>Reusable GitHub Action flow that emits Markdown, JSON, and failure-corpus artifacts.</em>
</p>

## Replit Demo

HarnessAmp includes a Replit-ready demo that starts the web console and a custom HTTP runner endpoint.

```bash
npm run replit:start
```

Then point the HTTP runner field at:

```text
https://<your-repl-url>/harnessamp
```

See [docs/replit.md](docs/replit.md) and [examples/replit](examples/replit).

## Repository Map

| Path | Role |
| --- | --- |
| `src/core/` | Bundle normalization, diagnosis, run jobs, trace compiler, failure taxonomy |
| `src/mutations/` | v1 mutation registry, generated tiers, sharding, risk filters |
| `src/v2/` | Contract checkers, scenario runner, FinanceGuard, HealthGuard, generated domain suites |
| `src/adapters/` | Runner contract and adapter implementations |
| `src/reports/` | Failure corpus and report artifacts |
| `api/` | Local/Vercel report, auth, project, workspace, job, and event endpoints |
| `docs/` | Schemas, concepts, usage, CI, runner contract, architecture |
| `examples/` | Demo bundles, benchmark packs, domain scenarios, Replit runner |
| `tests/` | Engine, mutation, diagnosis, conformance, v2, web, and E2E coverage |

## Useful Commands

| Task | Command |
| --- | --- |
| Start product console | `npm run dev` |
| Start local API only | `npm run dev:api` |
| Run local worker | `node scripts/harnessamp.mjs worker --project-id <project-id> --api-url http://127.0.0.1:3000` |
| Build production app | `npm run build` |
| Preview production build | `npm run preview` |
| Analyze bundle | `npm run analyze -- examples/demo-bundle.json` |
| Inspect mutations | `node scripts/harnessamp.mjs mutate examples/demo-bundle.json --max-mutations 20` |
| Run robustness report | `node scripts/harnessamp.mjs report examples/demo-bundle.json` |
| Run release gate | `node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --json` |
| Run generated v1 smoke | `node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --generated smoke` |
| Run FinanceGuard smoke | `node scripts/harnessamp.mjs run --pack financeguard-core --generated smoke --fail-on high` |
| Run HealthGuard smoke | `node scripts/harnessamp.mjs run --pack healthguard-core --generated smoke --fail-on high` |
| Compile traces | `npm run compile:traces -- examples/traces/approved-support-traces.json` |
| Collect failures | `npm run collect:failures -- examples/demo-bundle.json examples/cli/observed-runs.json` |
| Run unit tests | `npm test` |
| Run E2E tests | `npm run test:e2e` |
| Build Docker image | `npm run docker:build` |

## Production Configuration

Durable API-backed users, workspaces, reports, runner jobs, and benchmark versions require Postgres:

```text
DATABASE_URL
# or
POSTGRES_URL
```

Optional runner environment:

```text
HARNESSAMP_RUNNER_ENDPOINT
HARNESSAMP_RUNNER_TOKEN
HARNESSAMP_RUNNER_TIMEOUT_MS
```

Production worker service authentication:

```text
WORKER_SERVICE_TOKEN
```

For local seeded auth:

```text
HARNESSAMP_DEV_AUTH=1
```

## Docs

- Built-in docs route: `/docs`
- [Installation](docs/installation.md)
- [API and worker deployment](docs/deployment.md)
- [Usage](docs/usage.md)
- [CLI](docs/cli.md)
- [Mutation engine](docs/mutation-engine.md)
- [Runner contract](docs/adapters/runner-contract.md)
- [CI gates](docs/ci-gates.md)
- [GitHub OAuth](docs/github-oauth.md)
- [Replit demo](docs/replit.md)
- [Failure patterns](docs/failure-patterns.md)
- [Schemas](docs/schemas.md)
- [Testing](docs/testing.md)
- [Architecture](docs/architecture.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md).
