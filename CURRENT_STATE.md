# Current State of HarnessAmp

Last updated: May 31, 2026

## Short Definition

HarnessAmp is reliability infrastructure for production AI agents. It wraps an existing agent harness, mutates the operating envelope around the agent, reruns baseline and mutated workflows through a runner contract, diagnoses behavioral drift, and turns the result into release-gate evidence.

The core loop is:

```text
Wrap -> Mutate -> Run -> Diagnose -> Gate
```

HarnessAmp is not positioned as a new agent framework or a generic eval dashboard. Its narrow job is to answer:

> What wrapper conditions make this agent unreliable?

## Repository Snapshot

- Package name: `harnessamp`
- Version: `0.1.0`
- Runtime: Node 18+, ESM
- Frontend: Vite
- Main app routes: `/`, `/app`, `/docs`
- CLI entrypoint: `scripts/harnessamp.mjs`
- Git branch observed locally: `codex/harnessamp-v2-contracts`
- Latest observed commit: `6ba51ec Refresh production README`
- Local worktree note: `PRD.md` and `outputs/` are currently untracked in this checkout.

## What Is Working Now

HarnessAmp currently has a functional local product prototype plus production-oriented CLI and CI paths.

Implemented surfaces include:

- product landing page at `/`
- interactive evaluation console at `/app`
- repo-backed documentation browser at `/docs`
- local full-stack dev runtime via `npm run dev`
- anonymous/local development mode and optional GitHub OAuth session flow
- workspace, project, report, runner job, auth, and event API routes
- browser-saved and workspace-saved reports
- Markdown and JSON report output
- report snapshotting and report comparison
- benchmark pack validation and readiness scoring
- API-backed benchmark draft, review, approval, promotion-candidate, and golden-case lifecycle
- deterministic mutation registry and generated mutation suites
- failure classification, failure corpus generation, and report artifacts
- custom HTTP runner support for real external agent endpoints
- reusable GitHub Action for robustness gates
- Docker and Replit demo paths

## Product Model

HarnessAmp models an agent system in four layers:

| Layer | Meaning |
| --- | --- |
| `intent` | The mission the agent should preserve |
| `contract` | The invariants, constraints, role boundaries, and forbidden behaviors |
| `benchmark` | The cases and assertions that prove the contract |
| `wrapper` | The mutable prompt, tool, schema, policy, memory, and runtime surface around the model |

Only the wrapper is supposed to drift during mutation tests. If the intent or contract changes, that is benchmark authoring work, not mutation testing.

## Mutation Engine

The v1 mutation engine is the core generic reliability layer. It does not randomly fuzz prompts; it produces structured, replayable mutations with IDs, surfaces, operations, severity, expected failure, robust behavior, diagnostic signal, scoring tags, version, and deterministic seed.

The current v1 mutation packs are:

- `prompt_integrity_pack`
- `tool_payload_pack`
- `permissioning_pack`
- `network_sink_pack`
- `context_memory_pack`
- `sandbox_boundary_pack`
- `multimodal_pack`

The generated v1 suite path has been scaled for production-style use:

| Tier | v1 generic mutation count |
| --- | ---: |
| Smoke | 400 |
| Core | 3,400 |
| Deep | 17,000 |
| Nightly | 51,000 |

Generated suites support risk-prioritized ordering, sharding, severity filters, surface filters, caps for local runs, failure clustering, and mutation value scoring.

## v2 Domain Packs

HarnessAmp v2 adds domain-specific behavioral contract packs for high-stakes assistants.

Current first-class v2 packs:

| Pack | Focus | Current state |
| --- | --- | --- |
| `financeguard-core` | Personal finance safety, numerical fidelity, advice boundaries, privacy, fraud/dispute offramps, and account-action controls | Implemented with scenario loading, demo agent, generated suite support, contract checks, Markdown/JSON reports, and CI-style gates |
| `healthguard-core` | Clinical caution, medication safety, PHI minimization, red-flag escalation, source fidelity, and equity consistency | Implemented with scenario loading, demo agent, generated suite support, contract checks, Markdown/JSON reports, and CI-style gates |

Generated v2 suite scale:

| Pack | Smoke | Core | Deep | Nightly |
| --- | ---: | ---: | ---: | ---: |
| FinanceGuard | 400 | 3,400 | 17,000 | 51,000 |
| HealthGuard | 400 | 4,560 | 22,800 | 68,400 |

The v2 implementation includes:

- YAML scenario loading
- deterministic demo agents
- baseline and mutated traces
- trace diffing
- behavioral contract checks
- structured failure taxonomies
- single-scenario and directory suite runners
- generated suite runners
- report sanitization
- Markdown and JSON reporters
- gate exit codes based on `--fail-on`

## CLI State

The CLI is the strongest operator surface right now.

Available commands:

```bash
node scripts/harnessamp.mjs validate examples/demo-bundle.json
node scripts/harnessamp.mjs mutate examples/demo-bundle.json --max-mutations 20
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --json
node scripts/harnessamp.mjs report examples/demo-bundle.json
node scripts/harnessamp.mjs registry
node scripts/harnessamp.mjs run examples/financeguard-basic --pack financeguard-core --fail-on high
node scripts/harnessamp.mjs run examples/healthguard-basic --pack healthguard-core --fail-on high
```

The `diagnose` command returns a release verdict and exits non-zero for `warn` or `block`. The `run` command handles v2 scenario files, v2 scenario directories, generated v2 suites, and v1 bundle execution.

## Runner And Adapter State

HarnessAmp keeps customer workloads outside the product. It sends a baseline or mutated payload to a runner and expects a normalized `AgentRunResult`.

Implemented:

- `MockRunner` for deterministic local tests
- `CustomHTTPRunner` for production agent endpoints
- runner job queue utilities with concurrency, retry, timeout, cancellation checks, and per-job status transitions
- Replit demo runner

Placeholder or incomplete:

- `ModelSDKRunner`
- `AgentFrameworkRunner`
- `GraphWorkflowRunner`
- `CrewWorkflowRunner`
- `MultiAgentRunner`
- `MCPRunner`

The adapter boundary is present, but most named framework adapters still need real implementations.

## Web App State

The browser console is a polished local/product workbench. It supports:

- sample workflows, benchmark packs, and scenario packs
- pasted JSON and file-upload workflows
- Ajv schema validation
- support, browser, and tool-heavy risk profile presets
- mutation intensity controls
- configurable pass/warn/block thresholds
- HTTP runner endpoint configuration
- local and workspace-backed report saves
- report comparison against saved runs
- signed-in benchmark lifecycle controls for creating draft versions, field-level editing, version diff review, approving versions, proposing holdout goldens, and promoting golden cases
- copy/download actions for reports, JSON, mutation packs, CI YAML, and share links
- optimized proof and workflow views

This is useful for demos and operator review. It is not yet a complete enterprise SaaS workflow.

## API And Persistence State

The API layer includes routes for:

- auth and GitHub OAuth
- workspaces
- projects
- reports
- runner jobs
- benchmark packs, versions, reviews, promotion candidates, and golden cases
- events

Persistence can use an in-memory store for local development or Postgres when `DATABASE_URL` is configured. The app has schema setup helpers and dev-session seeding.

Current limitation: runner jobs are still effectively local/API-process coordinated. The queue utilities model retries and job states, but the production PRD correctly identifies durable external worker infrastructure as an unfinished pillar.

Benchmark truth-layer persistence now has an API and console MVP. It supports creating draft benchmark versions, editing mission/required/forbidden fields into immutable new draft versions, reviewing field/case/tool diffs, recording review decisions, approving versions as the release-gate source of truth, proposing golden cases from report/trace/manual evidence, and promoting those cases into visible or holdout `golden_cases`.

## MCP State

HarnessAmp can compile an MCP-style tool manifest into a diagnosable harness bundle.

Implemented:

- parse `tools[]`
- accept `inputSchema`
- infer write-capable tools from names and descriptions
- generate a HarnessAmp bundle from the manifest

Not implemented yet:

- live MCP server connection
- runtime tool discovery from a live server
- MCP tool execution during a test
- resource and prompt ingestion
- OAuth/session handling
- allowlisted live MCP execution with sanitized report artifacts

## CI And Release Gates

HarnessAmp has a reusable GitHub Action at `action.yml`. The action runs the same diagnosis path as the CLI, writes artifacts, and maps robustness results into a release decision.

Expected artifacts include:

- `harnessamp-report.md`
- `harnessamp-report.json`
- `harnessamp-failure-corpus.json`

The intended gate semantics are:

- `pass`: release can proceed
- `warn`: review required
- `block`: release should fail because configured robustness thresholds or forbidden-behavior checks were violated

## Test Coverage

The repo has tests for:

- core engine behavior
- diagnosis flow
- mutation registry behavior
- generated mutation suites
- benchmark pack behavior
- browser benchmark packs
- v2 FinanceGuard scenarios and generated suites
- v2 HealthGuard scenarios and generated suites
- report snapshots
- failure corpus output
- CI gate artifacts
- API routes
- auth/session behavior
- dev API startup behavior
- web UI source behavior
- package boundary conformance
- runner contract behavior
- Playwright demo flow

## Important Files

Core implementation:

- `src/core/engine.js`
- `src/core/diagnose.js`
- `src/core/run-jobs.js`
- `src/mutations/registry.js`
- `src/adapters/runners.js`
- `src/reports/failure-corpus.js`
- `src/v2/runner.js`
- `src/v2/suite-runner.js`
- `src/v2/contract-checkers.js`
- `src/main.js`

Operator and product docs:

- `README.md`
- `PRD.md`
- `docs/architecture.md`
- `docs/cli.md`
- `docs/ci-gates.md`
- `docs/mutation-engine.md`
- `docs/mutation-packs.md`
- `docs/runner-contract.md`
- `docs/mcp.md`
- `docs/v2.md`
- `docs/testing.md`
- `docs/docker.md`
- `docs/replit.md`

Examples:

- `examples/demo-bundle.json`
- `examples/benchmarks/support-mvp/benchmark-pack.json`
- `examples/benchmarks/browser-mvp/benchmark-pack.json`
- `examples/financeguard-basic/`
- `examples/healthguard-basic/`
- `examples/mcp/tool-server-manifest.json`
- `examples/replit/custom-http-runner.mjs`

## Known Gaps

The main unfinished pillars are:

1. Durable external worker and queue infrastructure.
2. Real non-HTTP runner adapters.
3. Live MCP server execution.
4. Full benchmark editor and review-diff UX on top of the new lifecycle API and console controls.

Other important gaps:

- framework runner adapters are mostly placeholders
- benchmark approval workflow is API-backed and available in the console, but still needs broad case/tool/evidence/threshold editing, reviewer assignment, and CLI commands
- human-reviewed golden promotion exists from the active console report, but still needs richer source trace/report selection and review metadata
- live MCP execution needs a security model before production use
- enterprise isolation and organization administration need hardening
- generated benchmark creation from folders/docs/traces is still a foundation rather than a finished UX
- v2 domain packs use deterministic demo agents rather than real external runners

## Practical Next Build Order

Recommended next steps:

1. Make runner jobs durable outside the API process.
2. Implement one real first-class runner adapter, likely OpenAI Agents SDK, Vercel AI SDK, or LangGraph.
3. Add live MCP tool discovery and allowlisted execution.
4. Build the benchmark editor MVP for intent, contracts, cases, assertions, forbidden actions, thresholds, tools, and evidence.
5. Add benchmark versioning, review metadata, and golden promotion from passing reports/traces.
6. Keep expanding failure-corpus-driven mutation selection and severity scoring.
7. Wire v2 packs to real runner adapters so FinanceGuard and HealthGuard can test actual customer agents, not only demo agents.

## Strategic Read

HarnessAmp is strongest today as a CLI-first and demo-ready reliability layer: it can validate bundles, generate deterministic mutations, run assessments, classify failures, produce reports, and enforce CI gates.

The product is not yet a complete production SaaS. The strongest path forward is to preserve the differentiated wedge: turn approved agent intent and contracts into executable robustness checks, mutate the wrapper around those checks, and identify the exact operating conditions that break reliability.
