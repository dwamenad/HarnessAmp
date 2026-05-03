# Current State of HarnessAmp

Last updated: May 2, 2026

## One-Line Definition

HarnessAmp is agent reliability infrastructure: a mutation-based robustness testing layer that wraps an existing AI agent harness, applies deterministic stress tests to the wrapper around the agent, and reports where reliability breaks.

## Product Positioning

HarnessAmp is not a generic evaluation framework and it is not an agent framework.

It is designed to answer a narrower and more operational question:

> What wrapper conditions make this agent fail?

The product thesis is:

- existing evals often test one fixed prompt, tool layout, schema, and runtime policy
- production agents operate under changing prompts, schemas, tools, context, permissions, and network conditions
- a system that only works under one clean wrapper is not production-ready
- HarnessAmp mutates the wrapper while preserving the intended mission, then diagnoses the failure mode

Useful shorthand:

- Insurance for AI agents
- Chaos Monkey for LLM prompts, tools, and agent harnesses
- A robustness testing layer for the environment around the agent

## Current Workflow

```text
Wrap -> Mutate -> Run -> Diagnose -> Gate
```

The runtime flow is:

1. Load a creator harness or benchmark bundle.
2. Validate and normalize the input.
3. Select mutation packs from the agent risk profile.
4. Generate deterministic mutated harnesses.
5. Run baseline and mutated cases through a runner.
6. Compare original vs mutated behavior.
7. Compute behavioral deltas.
8. Classify failures.
9. Generate a diagnostic report.
10. Return a CI-style `PASS`, `WARN`, or `BLOCK` recommendation.

## Core Product Model

HarnessAmp currently frames agent reliability through four layers:

| Layer | Meaning |
| --- | --- |
| `intent` | The mission the agent system is supposed to preserve |
| `contract` | The constraints, invariants, role boundaries, and forbidden behaviors |
| `benchmark` | The cases and assertions that prove the contract |
| `wrapper` | The mutable delivery layer around the model |

Only the wrapper should drift during mutation tests.

## What Counts as the Wrapper

In HarnessAmp, the wrapper is everything around the model that shapes behavior without changing the underlying mission.

Examples:

- prompt stack
- developer instructions
- tool names
- tool schemas
- tool payloads
- response format
- retrieval context
- memory context
- permission policy
- approval state
- network sinks
- sandbox boundaries
- message order
- retry and timing behavior
- multimodal inputs

## Mutation Engine

The mutation engine is the differentiated core of the product.

It does not randomly fuzz prompts. It creates structured, replayable, diagnostic mutations.

Each mutation contains:

- `mutationId`
- `mutationFamily`
- `surface`
- `target`
- `trustBoundary`
- `operation`
- `severity`
- `mutationTemplate`
- `expectedFailure`
- `robustBehavior`
- `diagnosticSignal`
- `recommendedControl`
- `scoringTags`
- `version`
- `deterministicSeed`

Current mutation packs:

- `prompt_integrity_pack`
- `tool_payload_pack`
- `permissioning_pack`
- `network_sink_pack`
- `context_memory_pack`
- `sandbox_boundary_pack`
- `multimodal_pack`

Sandbox-boundary mutations are defensive and non-procedural. They are intended to verify enforcement, not document exploit steps.

## Risk Profiles

HarnessAmp selects mutation packs based on risk profile fields:

- `agentDomain`
- `toolRisk`
- `dataSensitivity`
- `autonomyLevel`

Example:

```json
{
  "agentDomain": "browser_agent",
  "toolRisk": ["external_network", "email_or_messaging"],
  "dataSensitivity": ["pii"],
  "autonomyLevel": "semi_autonomous"
}
```

That profile should prioritize prompt, context, network, permissioning, and multimodal mutation packs.

## Failure Diagnosis

HarnessAmp is designed to report not only whether a run failed, but why it failed.

Current failure categories include concepts such as:

- hallucination
- schema overtrust
- instruction drift
- tool overreliance
- context confusion
- format violation
- missing-data mishandling
- unsafe completion
- task derailment
- tool-error mishandling
- ambiguous-instruction failure
- permission-boundary failure
- network-exfiltration risk
- sandbox-boundary failure
- multimodal-instruction injection
- approval bypass
- cross-tenant data leak
- secret leakage
- over-autonomy
- retry loop or denial-of-wallet risk

The diagnosis layer maps failures to recommended engineering controls, such as:

- schema validation
- explicit missing-field handling
- output format validation
- approval checks
- egress allowlists
- tenant/user identity validation
- retry limits
- sandbox path checks
- hidden text or OCR quarantine policies

## Behavioral Delta Layer

The behavioral delta layer compares baseline behavior against mutated behavior.

Examples of tracked deltas:

- pass to fail
- fail to pass
- tool usage lost
- tool usage added
- hallucination introduced
- format adherence degraded
- missing-data handling degraded
- instruction following degraded
- permission boundary crossed
- network sink used
- approval requirement lost
- sandbox boundary crossed
- multimodal hidden instruction followed

This is the layer that turns raw eval results into reliability evidence.

## Browser Product Console

The browser UI is currently implemented as a product console.

It supports:

- sample and pasted JSON harnesses
- JSON file upload
- Ajv schema validation
- support, browser, and tool-heavy risk profiles
- HTTP runner endpoint configuration
- configurable pass/warn/block thresholds
- local and server-backed report saves
- workspace and project context
- report copy/download actions
- mutation pack and CI artifact export
- optimized proof and workflow views

Current screenshots live in:

- `docs/screenshots/harnessamp-demo-current.png`
- `docs/screenshots/harnessamp-report-current.png`
- `docs/screenshots/harnessamp-proof-optimized.png`
- `docs/screenshots/harnessamp-workflow-optimized.png`

## CLI and Terminal Workflow

The CLI uses the same engine as the browser UI.

Useful commands:

```bash
npm run dev
npm run build
npm test
npm run test:e2e
npm run analyze -- examples/demo-bundle.json
npm run diagnose -- examples/demo-bundle.json
npm run compile:traces
npm run collect:failures -- examples/demo-bundle.json examples/cli/observed-runs.json
npm run release:gate -- examples/demo-bundle.json examples/cli/observed-runs.json
node scripts/harnessamp.mjs registry
node scripts/harnessamp.mjs mutate examples/demo-bundle.json --max-mutations 20
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json
```

Terminal-first workflow:

1. Save a harness bundle as JSON.
2. Analyze it with the CLI.
3. Inspect visible vs hidden gaps.
4. Generate mutations.
5. Run diagnosis.
6. Export Markdown or JSON reports.
7. Use release gates in CI.

## Benchmark Packs

Benchmark packs define the release-gate surface for target agent classes.

Current first-class examples:

- `support-mvp`
- `browser-mvp`

Each benchmark pack should include:

- intent
- contract
- benchmark cases
- wrapper
- mutation policy
- observations

The current product direction is to make benchmark packs the foundation for defensible mutation testing.

## Trace-to-Contract Compiler

HarnessAmp includes an early trace compiler path.

Purpose:

- take approved human or agent traces
- extract a draft intent
- extract contract candidates
- generate benchmark draft cases
- require human approval before promotion to goldens

The important design principle is:

> HarnessAmp should compile existing truth into executable checks. It should not invent business truth from scratch.

## Failure Corpus

HarnessAmp includes a failure-corpus path for collecting observed failures.

The failure corpus is intended to become a long-term moat because it records:

- source pack version
- mutation surface
- failure type
- observed behavior
- expected behavior
- recommended fix
- whether the fix generalized

Over time, this corpus should improve:

- mutation taxonomy
- severity scoring
- benchmark recommendations
- hardening guidance
- release thresholds

## CI and Release Gates

HarnessAmp supports pass/warn/block thinking for CI and release workflows.

Recommended gate checks:

- minimum overall score
- minimum holdout pass rate
- maximum robustness gap
- zero tolerance for critical forbidden behavior

Expected CI artifacts:

- Markdown report
- JSON report
- mutation summary
- failure summary
- release recommendation

## Runner and Adapter Model

HarnessAmp uses a runner abstraction so it can stay infrastructure-agnostic.

Current source boundaries include:

- `src/adapters/runners.js`
- `src/adapters/index.js`
- `tests/conformance/runner-contract.test.js`

The default implemented runner is mock/local-first. Placeholder adapter boundaries exist for future integrations with:

- HTTP agents
- model SDK agents
- graph workflows
- crew-style workflows
- multi-agent runtimes
- MCP-style tool runners
- custom internal harnesses

The strategic constraint is:

> HarnessAmp should wrap existing agent stacks, not replace them.

## Repository Structure

Current source ownership:

```text
src/core/       normalization, trace compilation, diagnosis, failure taxonomy
src/mutations/  mutation registry, pack selection, mutation generation
src/adapters/   runner contract and adapter boundaries
src/reports/    failure corpus and report artifacts
src/cli/        command manifest and terminal workflow
api/            report, workspace, project, auth, and event endpoints
docs/           product, architecture, schema, CLI, and operator docs
examples/       bundles, traces, packs, failures, CLI samples, risk profiles
tests/          unit, conformance, API, UI, and e2e coverage
```

Top-level `src/*.js` files remain as compatibility shims that re-export the newer package boundaries.

## Current Docs

Important docs:

- `README.md`
- `docs/prd.md`
- `docs/architecture.md`
- `docs/mutation-engine.md`
- `docs/cli.md`
- `docs/benchmarks.md`
- `docs/ci-gates.md`
- `docs/adapters/runner-contract.md`
- `docs/concepts/wrapper.md`
- `docs/concepts/trust-boundaries.md`
- `docs/concepts/robustness-gap.md`
- `docs/public-data.md`
- `docs/testing.md`
- `docs/docker.md`

Schemas live in:

- `docs/schemas/benchmark_pack.schema.json`
- `docs/schemas/diagnostic_report.schema.json`
- `docs/schemas/failure_corpus.schema.json`
- `docs/schemas/harness_bundle.schema.json`
- `docs/schemas/mutation_registry.schema.json`
- `docs/schemas/risk_profile.schema.json`
- `docs/schemas/trace_corpus.schema.json`

## Current Test Coverage

The repo has tests for:

- core engine behavior
- diagnosis flow
- trace compiler
- mutation registry
- benchmark packs
- browser benchmark packs
- failure corpus
- report snapshots
- web UI
- API routes
- auth/session behavior
- runner contract conformance
- package boundaries
- Playwright demo flow

## Current Limitations

HarnessAmp is not yet a complete production SaaS.

Known gaps:

- benchmark approval workflow is still early
- source-derived benchmark generation from folders/docs is not complete
- real production runner integrations are placeholders or early boundaries
- human-in-the-loop golden promotion needs a stronger UX
- multi-agent role-boundary scoring needs deeper implementation
- enterprise isolation story exists conceptually but needs deployment hardening
- mutation library is useful now but should become increasingly failure-corpus-driven
- public benchmark and private holdout management need more polish

## Near-Term Product Priorities

Recommended next build order:

1. Harden benchmark-pack authoring.
2. Improve trace-to-contract compiler review flow.
3. Expand deterministic mutation packs based on observed failures.
4. Add GitHub Actions and CI artifact examples.
5. Add one real runner integration path, likely custom HTTP first.
6. Implement multi-agent role-boundary scoring for benchmark packs.
7. Make failure corpus collection automatic after diagnosis.
8. Improve report comparison across versions.

## Strategic Differentiation

HarnessAmp should not compete by being another eval dashboard.

The differentiated wedge is:

> We turn messy real-world agent behavior into executable contracts, mutate the wrapper around those contracts, and report exactly which operating conditions cause reliability failure.

Compared with general eval or observability tools:

- eval tools show how an agent performed
- tracing tools show what happened
- HarnessAmp shows what conditions make the agent unreliable

That distinction should stay central in product, docs, UI, and marketing.

