# HarnessAmp

HarnessAmp is a release-certification console for tool-connected AI agents.

It certifies whether the agent-tool contract is safe enough to release before the agent touches real users, tickets, refunds, accounts, knowledge bases, MCP servers, CRM/order tools, or internal systems.

It connects to the agent runtime you already operate, runs release gates through the same execution path, and returns Toolchain Release Evidence with blockers, warnings, trace references, replayable regression cases, and a ToolchainReadinessReport.

```text
Connect agent -> validate target -> run release gate -> inspect blockers -> decide release
```

In HarnessAmp, an agent is any versioned AI system that can be invoked through an execution target and evaluated against behavioral contracts. HarnessAmp does not define how the agent is built; it defines whether the agent is ready to ship.

## Problem

Agent demos can pass while production wrappers fail: tools change shape, context goes stale, permissions loosen, side effects become unsafe, and users apply pressure. HarnessAmp turns those contract failures into repeatable release evidence.

## What It Does

| Need | HarnessAmp gives you |
| --- | --- |
| Validate real AI agents before release | Release gates for tools, context, permissions, memory, network sinks, and domain safety boundaries |
| Keep provider keys out of HarnessAmp | Registered runners and deployed adapter routes call models from your own infrastructure |
| Understand why certification failed | Agent-tool contract failures, release blockers, warnings, trace evidence, and recommended fixes |
| Block risky releases | Pass/warn/block gates, JSON/Markdown/CSV/HTML reports, and CI artifacts |

## Core Concepts

| Term | Meaning |
| --- | --- |
| Agent | A versioned AI system invoked through an execution target and evaluated against behavioral contracts. |
| Execution target | The runner, deployed adapter route, local tunnel, or gated hosted path HarnessAmp uses to invoke the agent. |
| Harness | The binding of an agent, execution target, release gate, contracts, and gate profile. |
| Release gate | Versioned scenarios, failure profiles, expected behavior, scoring, and failure classes used for certification. |
| Failure profile | A related set of scenario changes around known failure modes. |
| Failure class | A canonical domain or execution failure such as `refund_overreach`, `urgent_care_miss`, or `unsupported_citation`. |
| Report | Exportable release evidence with scenarios, replay metadata, failure classes, target readiness, and recommended fixes. |
| Release verdict | The certified, blocked, warning, or not-certifiable decision derived from behavioral failures, target readiness, lifecycle state, contracts, trace evidence, and score. |

Failure Intelligence means domain-specific failure classification, replayable scenario evidence, release-gate impact, recommended fixes tied to concrete failures, and a clean separation between behavioral failures and execution/infrastructure failures.

## Screenshots

Screenshots below use seeded/demo data only. They do not include real secrets, tokens, private URLs, or customer data.

![HarnessAmp homepage](docs/screenshots/homepage.png)

![Execution targets registry](docs/screenshots/execution-targets.png)

![Endpoint validation panel](docs/screenshots/target-validation.png)

![Guided new run workflow](docs/screenshots/new-run-workflow.png)

![Worker lifecycle run detail](docs/screenshots/run-lifecycle.png)

![Report summary](docs/screenshots/report-summary.png)

![Project secrets hosted BYOK panel](docs/screenshots/project-secrets.png)

## How Execution Works

HarnessAmp is the control plane. Customer workloads stay on your runner, deployed adapter route, or approved hosted execution path.

1. Choose a versioned release gate.
2. Select an execution target.
3. Validate the target.
4. Start a worker-backed release certification.
5. Review blockers, warnings, traces, replay cases, and release verdict.

The console uses one production evidence snapshot across `/dashboard`, `/targets`, certification summaries, reports, and organization/admin surfaces. That snapshot labels the project as `Sample workspace`, `Connected project`, or `Production run`; labels evidence as `Sample data` or `Real execution`; and derives the release verdict from target readiness, validation, lifecycle, release gate result, failure triage, contract state, and entitlement metadata.

## Toolchain Readiness and Execution Targets

Recommended production path:

- Use a registered runner for deployed agents, RAG systems, enterprise copilots, and production apps.
- Use a deployed Vercel AI SDK route when your Next.js/Vercel app already owns the provider credentials.
- Keep OpenAI, Anthropic, Gemini, Mistral, Groq, Together, or other provider keys in your own runner or app environment.
- Use local HTTPS tunnels only for short-lived local testing.

| Target | Intended use |
| --- | --- |
| `registered_runner` | Production-grade reusable runner endpoint |
| `vercel_ai_sdk` | Deployed HTTPS adapter route or local route module during development |
| `local_http_tunnel` | Ephemeral, run-scoped local test target. Not reusable |
| `hosted_provider` | Hosted BYOK for OpenAI and Anthropic via encrypted project secrets |
| `mock` | Local deterministic development |

Hosted BYOK is feature-flagged and requires `HARNESSAMP_SECRET_ENCRYPTION_KEY`. OpenAI and Anthropic are executable first; Gemini/custom providers can be represented as secrets but are not dispatched by the hosted worker path yet. Registered runners and deployed adapter routes remain the broadest production paths.

## Run Workflow

The console separates seeded demos from real execution:

- `/targets` is the Toolchain Readiness and execution-target validation surface.
- `/runs/new` launches release certification against a selected execution target.
- Project secrets save encrypted provider keys for hosted OpenAI/Anthropic runs without exposing raw keys after submission.
- Reports show Toolchain Release Evidence, not setup instructions.
- Docs hold deeper implementation details.

Worker-backed runs expose queue state, retries, cancellation, report links, and normalized failure classes such as `adapter_timeout`, `adapter_http_error`, `adapter_invalid_response`, `local_tunnel_private_ip_blocked`, and `hosted_provider_disabled`.

## Release Gate Packs

HarnessAmp ships contract-based release gates for high-stakes assistants:

| Pack | Domain | Contracts | Smoke | Core | Deep | Nightly |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| FinanceGuard | Finance | 15 | 400 | 3,400 | 17,000 | 51,000 |
| HealthGuard | Healthcare | 20 | 400 | 4,560 | 22,800 | 68,400 |
| RetrievalGuard | Knowledge/RAG | 10 | 400 | 4,200 | 21,000 | 63,000 |
| CustomerCareGuard | Customer support | 10 | 400 | 3,600 | 18,000 | 54,000 |
| LegalGuard | Legal | 10 | 400 | 4,200 | 21,000 | 63,000 |

Example:

```bash
node scripts/harnessamp.mjs run --pack healthguard-core --generated smoke --fail-on high
```

## Reports

Reports emphasize:

- release verdict: `Certified`, `Blocked`, `Warning`, or `Not certifiable`
- robustness gap
- failed contracts
- failure profiles
- reproducible diagnostics
- target readiness and failure-class context
- exportable Markdown, JSON, CSV, and Print HTML evidence

## Local Development

```bash
git clone https://github.com/dwamenad/HarnessAmp.git
cd HarnessAmp
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4173/dashboard
```

Seeded local auth:

```bash
HARNESSAMP_DEV_AUTH=1 npm run dev
```

Useful commands:

| Task | Command |
| --- | --- |
| Start local app | `npm run dev` |
| Build production app | `npm run build` |
| Run tests | `npm test` |
| Run E2E tests | `npm run test:e2e` |
| Validate a bundle | `node scripts/harnessamp.mjs validate examples/demo-bundle.json` |
| Run release gate | `node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --json` |
| Run local worker | `node scripts/harnessamp.mjs worker --project-id <project-id> --api-url http://127.0.0.1:3000 --stale-after-ms 120000` |

## Environment Variables

Durable API-backed users, workspaces, reports, runner jobs, and release-gate versions:

```text
DATABASE_URL
# or
POSTGRES_URL
```

Worker service:

```text
WORKER_SERVICE_TOKEN
HARNESSAMP_WORKER_STALE_AFTER_MS
```

Registered runners:

```text
HARNESSAMP_RUNNER_ENDPOINT
HARNESSAMP_RUNNER_TOKEN
HARNESSAMP_RUNNER_TIMEOUT_MS
```

Local tunnel safety in production-like environments:

```text
HARNESSAMP_LOCAL_TUNNEL_TOKEN_SECRET
```

Gated Hosted BYOK:

```text
HARNESSAMP_ENABLE_HOSTED_BYOK=1
HARNESSAMP_SECRET_ENCRYPTION_KEY=<32-byte base64 key or passphrase>
```

Local seeded auth:

```text
HARNESSAMP_DEV_AUTH=1
```

Local verification:

```bash
npm run verify
```

`npm run verify` runs the Node test suite and production build. Browser checks remain available separately with `npm run test:e2e -- --reporter=line`.

## Organizations and Plans

HarnessAmp groups workspaces, projects, secrets, reports, runner jobs, and usage under organizations. Organization roles are `owner`, `admin`, `developer`, and `viewer`; owners manage billing and destructive org settings, admins manage members and project operations, developers can create runs and export reports, and viewers can inspect reports without launching work.

Plan checks run before job enqueue. Free organizations cannot use Hosted BYOK, CI gates, or full release certifications; Starter enables Hosted BYOK; Team enables CI gates and full release certifications; Business and Enterprise raise limits and add higher operational allowances. Usage is metered monthly for runs, scenarios, mutations, provider calls, execution minutes, CI gate runs, and report exports.

## Security Model

- Registered runners and deployed adapter routes keep provider keys in user-controlled infrastructure.
- Local tunnel targets are ephemeral, run-scoped, and not reusable production targets.
- HarnessAmp blocks localhost, private IP ranges, link-local ranges, cloud metadata endpoints, unsafe redirects, unsupported contract versions, oversized responses, and non-JSON preflight responses for local tunnel targets.
- Hosted BYOK is feature-flagged and uses encrypted project secrets for approved OpenAI/Anthropic runs.
- Organization RBAC is enforced on projects, secrets, runners, reports, runs, and billing surfaces before side effects are written.
- Usage events are idempotent per run phase and are stored with organization/project/run identifiers, safe metadata, and no raw provider credentials.
- Raw provider keys are not returned by API responses and should not be sent to job creation endpoints for registered runner or deployed adapter execution.
- Validation audit events store safe metadata only: target type, phase, status, duration, failure class, contract version, and timestamp.

## Repository Map

| Path | Role |
| --- | --- |
| `src/core/` | Bundle normalization, diagnosis, jobs, trace compiler, failure taxonomy |
| `src/mutations/` | v1 mutation registry, generated tiers, sharding, risk filters |
| `src/v2/` | Domain packs, contract checkers, generated scenario engines, v2 runner |
| `src/adapters/` | Execution target adapters and contracts |
| `api/` | Auth, organizations, projects, runners, jobs, reports, secrets, usage, and event endpoints |
| `docs/` | Concepts, adapters, deployment, API reference, and screenshots |
| `examples/` | Demo bundles, release-gate fixtures, Replit runner, Vercel AI SDK fixture |
| `tests/` | Engine, adapter, API, UI, and E2E coverage |

## Docs

- [Execution targets](docs/adapters/execution-targets.md)
- [Adapter contract](docs/adapters/adapter-contract.md)
- [Runner contract](docs/adapters/runner-contract.md)
- [Vercel AI SDK adapter](docs/adapters/vercel-ai-sdk.md)
- [Deployment](docs/deployment.md)
- [API reference](docs/reference/api.md)
- [CI gates](docs/ci-gates.md)
- [Testing](docs/testing.md)

## Current Status / Roadmap

Current:

- execution target registry and validation
- guided `/runs/new` launch flow
- worker-backed registered runner, Vercel AI SDK, local tunnel, and gated hosted BYOK paths
- encrypted project secrets for hosted BYOK
- release evidence reports and release gates

Next:

- deeper production runner observability
- richer adapter setup docs
- more release-gate governance workflows
- broader hosted BYOK approval and audit tooling

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md).
