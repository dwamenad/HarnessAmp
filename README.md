# HarnessAmp

Production-ready mutation testing and release gates for AI agents.

HarnessAmp wraps an existing agent harness, mutates the operating envelope around it, runs baseline and mutated tasks through the same runner, and turns wrapper fragility into a clear release verdict: `pass`, `warn`, or `block`.

```text
Wrap -> Mutate -> Run -> Diagnose -> Gate
```

<p align="center">
  <img src="docs/screenshots/readme-dashboard-current.jpg" alt="HarnessAmp dashboard showing CI gate status, active harnesses, failure counts, and generated pack coverage" width="900">
</p>

## Why It Exists

Agent demos often pass while production wrappers drift: prompts change, tools return different shapes, permissions loosen, stale context appears, and users apply pressure. HarnessAmp makes those wrapper failures repeatable and reviewable.

| Production problem | HarnessAmp gives you |
| --- | --- |
| Agents pass happy-path demos but fail under pressure. | Deterministic mutations for prompts, tools, context, memory, permissions, network sinks, and domain-specific safety boundaries. |
| Eval scores do not explain what broke. | Behavioral diffs, failure taxonomy, violated contracts, and recommended fixes. |
| CI needs a release decision. | A robustness gate that emits Markdown, JSON, failure corpus artifacts, and non-zero exits for blocking failures. |
| Teams already have their own runtime. | A runner contract for mock, HTTP, Replit demo, worker, and future adapter paths. |

## Quick Start

```bash
git clone https://github.com/dwamenad/HarnessAmp.git
cd HarnessAmp
npm install
npm run dev
```

Open the local console at:

```text
http://127.0.0.1:4174/dashboard
```

For seeded local auth:

```bash
HARNESSAMP_DEV_AUTH=1 npm run dev
```

Run the CLI gate:

```bash
node scripts/harnessamp.mjs validate examples/demo-bundle.json
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --json
```

Run a generated v2 smoke suite:

```bash
node scripts/harnessamp.mjs run --pack healthguard-core --generated smoke --fail-on high
```

## Product Console

HarnessAmp includes a web console for operating robustness work: harness inventory, mutation packs, new runs, failures, reports, CI runners, usage, and team settings.

<p align="center">
  <img src="docs/screenshots/readme-packs-current.jpg" alt="HarnessAmp mutation pack catalog showing HealthGuard, FinanceGuard, CustomerCareGuard, LegalGuard, and generated suite scale" width="900">
</p>

Key routes:

| Route | Purpose |
| --- | --- |
| `/dashboard` | Operator overview and CI gate status |
| `/harnesses` | Harness inventory |
| `/runs/new` | Start a robustness run |
| `/packs` | Domain mutation packs and generated suite scale |
| `/failures` | Failure evidence and triage |
| `/reports` | Exportable reports |
| `/ci` | CI runner setup |
| `/usage` | Estimated usage and run volume |

## Domain Packs

HarnessAmp v2 ships runnable contract-based packs for high-stakes assistants.

| Pack | Domain | Contracts | Smoke | Core | Deep | Nightly |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| FinanceGuard | Finance | 15 | 400 | 3,400 | 17,000 | 51,000 |
| HealthGuard | Healthcare | 20 | 400 | 4,560 | 22,800 | 68,400 |
| RetrievalGuard | Knowledge/RAG | 10 | 400 | 4,200 | 21,000 | 63,000 |
| CustomerCareGuard | Customer support | 10 | 400 | 3,600 | 18,000 | 54,000 |
| LegalGuard | Legal | 10 | 400 | 4,200 | 21,000 | 63,000 |

Run them:

```bash
node scripts/harnessamp.mjs run --pack financeguard-core --generated smoke --fail-on high
node scripts/harnessamp.mjs run --pack healthguard-core --generated smoke --fail-on high
node scripts/harnessamp.mjs run --pack retrievalguard-core --generated smoke --fail-on high
node scripts/harnessamp.mjs run --pack customercareguard-core --generated smoke --fail-on high
node scripts/harnessamp.mjs run --pack legalguard-core --generated smoke --fail-on high
```

RetrievalGuard covers source-grounded answers, citation fidelity, provenance preservation, query intent, paraphrase recall, distractor resistance, contradiction handling, abstention, multi-hop evidence, and retrieval tool failure transparency.

The curated RetrievalGuard suite is fixture-backed: qrels and expected-claim files define required sources, required citations, forbidden citations, citation spans, bridge documents, and abstention behavior.

All v2 domain packs now emit pack-specific evaluation metrics in reports. FinanceGuard, HealthGuard, CustomerCareGuard, and LegalGuard include expected-behavior fixtures for their static entry scenarios, generated suites include provenance samples, and failed v2 pack cases can be promoted into regression-corpus candidates.

CustomerCareGuard covers policy fidelity, refund authority, authentication before account action, privacy minimization, mandatory escalation, abuse containment, and ethical cancellation.

LegalGuard covers legal-information boundaries, jurisdiction discipline, deadline safety, source fidelity, confidentiality, counsel escalation, and unlawful-evasion refusal.

## Failure Evidence

HarnessAmp reports are designed for engineering review. A failure names the scenario, mutation, behavioral delta, violated contract, severity, failure type, evidence, and recommended fix.

<p align="center">
  <img src="docs/screenshots/readme-failure-current.jpg" alt="HarnessAmp failure evidence page showing expected behavior, observed behavior, scenario input, mutated scenario, and workflow actions" width="900">
</p>

## Generated v1 Engine

The generic v1 mutation engine is still available for broad robustness testing.

| Engine | Smoke | Core | Deep | Nightly |
| --- | ---: | ---: | ---: | ---: |
| v1 generic mutation engine | 400 | 3,400 | 17,000 | 51,000 |

Useful generated v1 commands:

```bash
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --generated smoke
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --generated nightly --shard 1/10
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --generated core --severity critical,high --surface permission,network
```

## Runner Contract

HarnessAmp keeps customer workloads outside the product. It sends baseline and mutated payloads to a runner and expects a normalized `AgentRunResult` back.

## Bring Your Own Model

Users can bring their own model or agent to HarnessAmp by exposing an execution target. HarnessAmp sends mutation-pack scenarios to that target, the target calls the user's model using the user's own provider credentials, and HarnessAmp scores the returned behavior. HarnessAmp does not need direct access to provider API keys when using registered runners or Vercel AI SDK routes.

Recommended production path:

- use a registered runner for deployed agents, RAG systems, enterprise copilots, and production apps
- use a Vercel AI SDK route when a Next.js/Vercel app already owns the provider credentials
- keep OpenAI, Anthropic, Gemini, Mistral, Groq, Together, or other provider keys inside your infrastructure
- do not send raw provider API keys to HarnessAmp job creation endpoints

Hosted provider BYOK is available as a convenience execution target when `HARNESSAMP_ENABLE_HOSTED_BYOK=1` and encrypted project secrets are configured. It stores provider keys encrypted at rest, references them by `secretRef` in jobs, and decrypts only inside worker/provider execution. Registered runners and Vercel AI SDK routes remain the recommended production paths.

Supported paths:

| Runner | Use |
| --- | --- |
| `mock` | Local end-to-end testing |
| `custom_http` | Production agent endpoints |
| `vercel-ai-sdk` | Next.js/Vercel AI SDK routes and handlers |
| `hosted_provider` | Convenience BYOK execution through encrypted project secrets |
| Replit demo runner | Public demo deployments |
| Worker service | Durable queued project jobs |

Vercel AI SDK adapter jobs run through the worker lifecycle, not the browser. Job status, API responses, CLI worker logs, dashboard job details, and report metadata expose a normalized diagnostics envelope with adapter type, target route, latency, HTTP status, worker/job ids, retry attempt, phase, safely truncated error text, and deterministic failure classes such as `adapter_timeout`, `adapter_http_error`, `adapter_invalid_response`, and `adapter_target_missing`.

Custom HTTP example:

```bash
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json \
  --runner-kind custom_http \
  --runner-endpoint https://runner.example.com/harnessamp \
  --concurrency 8 \
  --run-attempts 2 \
  --timeout-ms 30000
```

See [docs/adapters/runner-contract.md](docs/adapters/runner-contract.md).

Vercel AI SDK route example:

```bash
node scripts/harnessamp.mjs run examples/demo-bundle.json \
  --adapter vercel-ai-sdk \
  --target ./examples/vercel-ai-sdk/app/api/chat/route.mjs \
  --mode sample \
  --json
```

See [docs/adapters/vercel-ai-sdk.md](docs/adapters/vercel-ai-sdk.md).

## CI Gate

The reusable GitHub Action at `action.yml` turns HarnessAmp into a PR-blocking robustness gate.

```yaml
name: HarnessAmp robustness gate

on:
  pull_request:

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

Artifacts:

- `harnessamp-report.md`
- `harnessamp-report.json`
- `harnessamp-failure-corpus.json`

The PR-facing metric is `Robustness Gap`: original pass rate minus mutated pass rate.

## Useful Commands

| Task | Command |
| --- | --- |
| Start local app | `npm run dev` |
| Build production app | `npm run build` |
| Preview production build | `npm run preview` |
| Run tests | `npm test` |
| Validate a bundle | `node scripts/harnessamp.mjs validate examples/demo-bundle.json` |
| Run release gate | `node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --json` |
| Inspect mutations | `node scripts/harnessamp.mjs mutate examples/demo-bundle.json --max-mutations 20` |
| Run local worker | `node scripts/harnessamp.mjs worker --project-id <project-id> --api-url http://127.0.0.1:3000 --stale-after-ms 120000` |

## Configuration

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

Worker service authentication:

```text
WORKER_SERVICE_TOKEN
HARNESSAMP_WORKER_STALE_AFTER_MS
```

Local seeded auth:

```text
HARNESSAMP_DEV_AUTH=1
```

## Repository Map

| Path | Role |
| --- | --- |
| `src/core/` | Bundle normalization, diagnosis, jobs, trace compiler, failure taxonomy |
| `src/mutations/` | v1 mutation registry, generated tiers, sharding, risk filters |
| `src/v2/` | Domain packs, contract checkers, generated scenario engines, v2 runner |
| `api/` | Local/Vercel report, auth, project, workspace, job, and event endpoints |
| `docs/` | Concepts, usage, deployment, CI, runner contract, architecture |
| `examples/` | Demo bundles, benchmark packs, domain scenarios, Replit runner, Vercel AI SDK fixture |
| `tests/` | Engine, mutation, diagnosis, conformance, v2, web, and E2E coverage |

## Docs

- [Installation](docs/installation.md)
- [Usage](docs/usage.md)
- [CLI](docs/cli.md)
- [Deployment](docs/deployment.md)
- [Mutation engine](docs/mutation-engine.md)
- [Runner contract](docs/adapters/runner-contract.md)
- [Vercel AI SDK adapter](docs/adapters/vercel-ai-sdk.md)
- [CI gates](docs/ci-gates.md)
- [GitHub OAuth](docs/github-oauth.md)
- [Replit demo](docs/replit.md)
- [Testing](docs/testing.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md).
