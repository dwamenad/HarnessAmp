# HarnessAmp Production Build PRD

## Status

Draft for implementation handoff. Updated June 4, 2026 after durable runner-job record MVP.

## Product

HarnessAmp

## Objective

Turn HarnessAmp from a polished local/product prototype into production-grade agent reliability infrastructure by building four missing pillars:

- externally deployed worker or managed queue infrastructure
- real non-HTTP runner adapters
- live MCP server execution
- benchmark editor and golden-promotion workflow

The current app already has a landing page, `/app` evaluation surface, `/docs` documentation, local API runtime, GitHub auth, workspace/project basics, saved reports, custom HTTP runner support, durable runner-job records, automatic failure-corpus capture, report comparison, benchmark lifecycle controls, and benchmark readiness scoring.

## Current Baseline

### Built

- Product landing page at `/`
- Interactive evaluation surface at `/app`
- Repo-backed docs at `/docs`
- Local full-stack dev runtime via `npm run dev`
- Anonymous mode with optional GitHub auth
- Workspace/project/report APIs
- Durable runner-job records with idempotency keys, attempts, retry/backoff metadata, worker claim/run actions, cancellation, and report linkage
- Browser-saved and workspace-saved reports
- `MockRunner` and `CustomHTTPRunner`
- Benchmark packs and schema validation
- Trace compiler foundation
- Failure corpus generation
- Report comparison against saved runs
- Benchmark readiness checklist
- CI gate and GitHub Action artifact path

### Known Gaps

- Runner jobs now persist durable state, but the worker still needs to be deployed outside the app request path or backed by a managed queue for production hosting.
- `ModelSDKRunner`, `AgentFrameworkRunner`, `GraphWorkflowRunner`, `CrewWorkflowRunner`, `MultiAgentRunner`, and `MCPRunner` are placeholders.
- MCP support compiles manifests but does not connect to or execute live MCP servers.
- Benchmark packs can be viewed and scored, but not edited, reviewed, versioned, or promoted through an approval workflow in the product.

## Users

Primary users:

- AI platform teams responsible for agent reliability
- engineering teams shipping support, browser, coding, research, or internal-ops agents
- eval and release owners who need repeatable pass/warn/block gates

Secondary users:

- security reviewers validating tool-use boundaries
- product owners reviewing approved benchmark cases
- infra teams integrating agent runners with CI/CD

## User Problems

1. Teams need runner jobs that survive API process restarts, timeouts, retries, and deployment boundaries.
2. Teams do not want every real integration to go through a generic HTTP shim.
3. Teams using MCP servers need HarnessAmp to test real tool behavior, not only compiled manifests.
4. Teams need a product workflow to author, review, approve, and promote benchmark packs into release-grade goldens.

## Product Principles

- Keep HarnessAmp framework-agnostic. Adapters translate external systems into `AgentRunResult`; they do not own mutation logic or scoring semantics.
- Make benchmark approval human-reviewed. Generated drafts should not silently become release gates.
- Treat secrets and external tool execution as security-sensitive. Reports must not expose credentials, bearer tokens, or raw private environment values.
- Prefer durable, inspectable artifacts: jobs, reports, benchmark versions, failure corpora, and promotion records should be traceable.

## Scope

### In Scope

- Durable job queue and worker execution model
- At least one production-grade non-HTTP runner adapter
- Live MCP execution MVP with allowlisted tools
- Benchmark editor MVP
- Golden promotion flow for approved benchmark versions and passing traces/results
- Tests, docs, and migration path from the current local prototype

### Out of Scope For First Release

- Fully automated benchmark approval without reviewer action
- Marketplace of third-party adapters
- Arbitrary untrusted MCP tool execution
- Enterprise SSO and full organization administration
- Real-time multiplayer editing
- Judge-model scoring as the only source of truth

## Workstream 1: Durable Worker And Queue

### Problem

Runner job records are now durable, but production hosting still needs an external worker or managed queue binding. If execution depends on an app request staying alive, long-running jobs and retries remain fragile.

### Requirements

- Add a managed queue backend or deploy the existing worker action as a separate worker process.
- Preserve persisted job payloads, state transitions, retry count, timestamps, result report id, and errors.
- Move runner dispatch out of product UI/API request lifecycle into the worker deployment.
- Support job states: `queued`, `running`, `completed`, `failed`, `canceled`, `retrying`.
- Add idempotency keys so duplicate dispatches do not create duplicate reports.
- Add timeout and retry/backoff configuration.
- Keep cancellation semantics explicit.
- Keep the existing polling UI working, with clear states.

### Recommended Implementation

Use one of these queue options:

- Vercel Queues if staying fully inside Vercel.
- Inngest or Trigger.dev if workflow observability and retries matter more than minimal dependency footprint.
- Postgres-backed jobs if the team wants to avoid another managed service.

The queue choice should expose:

- enqueue
- claim/dequeue
- retry with backoff
- dead-letter or failed terminal state
- job status lookup

### Completed In Current Checkout

- Creating a runner job persists `queued` state and returns immediately.
- Jobs store payload, status, attempts, max attempts, retry/backoff metadata, timestamps, result, report id, and errors.
- Idempotency keys dedupe duplicate creation for the same project and runner.
- Worker actions can claim, run, retry, and cancel jobs.
- Completed jobs create a report and link it to the job.
- Tests cover enqueue, completion, failure, retry, cancellation, and idempotency in memory mode.

### Remaining Acceptance Criteria

- A worker can complete the job after the API request finishes.
- Worker execution is deployed outside the app request path or connected to a managed queue.
- Postgres-backed claim behavior is verified against a real database.
- Operational tests cover worker restart, delayed retry, and duplicate worker claim contention.

## Workstream 2: Real Non-HTTP Runner Adapters

### Problem

The current adapter layer has a real mock runner and custom HTTP runner, but the named framework/model adapters are placeholders.

### Requirements

- Implement one first-class adapter before expanding the matrix.
- Preserve the existing `AgentRunResult` contract.
- Keep credentials out of report artifacts.
- Add adapter-specific config validation.
- Add conformance tests for every implemented adapter.
- Add a working example and docs.

### Recommended First Adapter

Pick one based on target users:

- OpenAI Agents SDK if the target is modern agent teams using OpenAI-native orchestration.
- Vercel AI SDK if the target is JavaScript app teams.
- LangGraph if the target is enterprise graph workflows.

Recommended first build: OpenAI Agents SDK or Vercel AI SDK. Both align with a JavaScript repo and can produce structured run metadata.

### Functional Requirements

- Accept a HarnessAmp bundle, mutation, task, and environment.
- Build the target runner input from the mutated wrapper.
- Execute exactly one baseline or mutated task per call.
- Capture output text, tool calls, tool outputs, latency, token usage where available, model/runtime version, and error information.
- Normalize the result into `AgentRunResult`.

### Acceptance Criteria

- Adapter passes existing runner conformance tests.
- Adapter can run at least one example bundle end-to-end.
- CLI can run `diagnose` with the adapter.
- App or docs explain required environment variables.
- Failed external calls produce structured HarnessAmp errors.

## Workstream 3: Live MCP Execution

### Problem

HarnessAmp can compile an MCP-style manifest into a bundle, but it cannot connect to a live MCP server, discover runtime capabilities, or execute MCP tools during a test.

### Requirements

- Add an MCP client runtime.
- Support at least one transport for MVP: stdio or HTTP/SSE.
- Discover tools from a live server.
- Optionally ingest resources and prompts after the first tool-only MVP.
- Map MCP tool calls/results into `AgentRunResult.toolCalls` and `toolOutputs`.
- Add allowlists for tools, servers, and resource access.
- Support per-run timeout and cancellation.
- Prevent secrets from being written into report artifacts.

### Security Requirements

- Default deny for tool execution.
- Explicit allowlist for server command/URL and tool names.
- Redact credentials and sensitive environment variables.
- Store only normalized tool outputs unless raw capture is explicitly enabled.
- Add clear errors for blocked tools and auth failures.

### MVP Scope

- Tool discovery
- Tool execution
- Tool result normalization
- One fixture MCP server in tests
- CLI execution path
- Documentation for setup and security model

### Acceptance Criteria

- HarnessAmp can connect to a fixture MCP server and run a mutated case.
- Tool calls are captured in `AgentRunResult`.
- Blocked tools fail safely and are reflected in the report.
- Tests cover discovery, execution, blocked tool, timeout, and malformed result.

## Workstream 4: Benchmark Editor And Golden Promotion

### Problem

Benchmark packs exist, and readiness scoring helps inspect them, but there is no product workflow for editing, reviewing, versioning, approving, or promoting benchmark packs.

### Requirements

- Add benchmark versioning.
- Support draft, reviewed, approved, archived, and rejected states.
- Build editor UI for intent, contract, cases, assertions, forbidden actions, thresholds, agents, tools, and evidence.
- Add validation and readiness scoring before approval.
- Add review metadata: reviewer, timestamp, comments, decision, diff.
- Add golden promotion from passing traces or report results.
- Support public visible cases and private holdout cases.

### Data Model

Minimum entities:

- `benchmark_packs`
- `benchmark_versions`
- `benchmark_reviews`
- `golden_cases`
- `promotion_candidates`
- `holdout_cases`

Each approved benchmark version should preserve:

- source version
- author
- reviewer
- approval timestamp
- schema validation result
- readiness score
- visible/holdout split

### Editor MVP

The first editor should support:

- selecting an existing benchmark pack
- editing mission and success signals
- editing global must/must-not rules
- adding/editing cases
- editing thresholds
- validating schema
- previewing readiness score
- saving as draft
- submitting for review
- approving a version

### Golden Promotion MVP

The first promotion flow should support:

- selecting a passing report or trace
- proposing one or more golden cases
- reviewing generated assertions
- assigning visible or holdout status
- approving into a benchmark version

### Acceptance Criteria

- A user can create a draft benchmark version from an existing pack.
- A user can edit and validate the draft.
- A reviewer can approve the draft.
- Approved versions are immutable.
- A report can propose promotion candidates.
- Approved golden cases become part of the next benchmark version.
- Hidden holdouts are not exposed in public export paths unless explicitly allowed.

## Suggested Build Order

### Phase 1: Durable Jobs

Goal: make runner jobs production-safe.

Deliverables:

- queue backend integration
- worker dispatcher
- job state persistence
- retry/cancel/idempotency tests
- UI status compatibility

### Phase 2: First Real Adapter

Goal: prove the adapter contract against one real ecosystem.

Deliverables:

- first adapter implementation
- config/env docs
- conformance tests
- CLI example
- app docs link

### Phase 3: Benchmark Editor MVP

Goal: let teams edit and approve benchmark packs in the product.

Deliverables:

- benchmark version storage
- editor UI
- draft/review/approve lifecycle
- validation/readiness gate
- docs and tests

### Phase 4: Golden Promotion

Goal: turn passing traces/results into reviewed benchmark cases.

Deliverables:

- promotion candidate model
- report-to-golden proposal action
- reviewer approval flow
- visible/holdout designation

### Phase 5: Live MCP Execution

Goal: execute live MCP tool servers safely.

Deliverables:

- MCP client runtime
- fixture MCP server
- tool allowlist
- result normalization
- timeout/error tests

## Success Metrics

- Percent of runner jobs completed outside the API request lifecycle.
- First successful end-to-end diagnosis through a real non-HTTP adapter.
- Time to create and approve a benchmark version.
- Number of promoted golden cases per project.
- Reduction in repeated failure types across report comparisons.
- MCP tool execution coverage with zero leaked secrets in reports.

## Risks

- Queue choice can lock the deployment architecture too early.
- Runner adapters can become shallow wrappers if conformance requirements are weak.
- MCP execution expands the security surface significantly.
- Benchmark editing can become too complex if the first version tries to solve all domains.
- Golden promotion can encode bad behavior if approval UX is too weak.

## Open Decisions

1. Which queue backend should be used for production?
2. Which non-HTTP adapter should be first: OpenAI Agents SDK, Vercel AI SDK, LangGraph, or another target?
3. Should benchmark approval live primarily in the product UI, GitHub PRs, or both?
4. Should MCP MVP start with stdio transport or HTTP/SSE?
5. What fields must be redacted from all report artifacts by default?
6. How should private holdouts be stored and exported?

## Implementation Notes

- Keep `AgentRunResult` as the core adapter contract.
- Keep report snapshots backward-compatible; additional fields are acceptable because the schema allows additional properties.
- Keep benchmark pack validation in the same schema-driven style already used by the app.
- Prefer adding focused tests around new behavior instead of broad snapshot tests.
- Do not make MCP execution available without explicit allowlists.
- Do not add multiple real adapters before one adapter has strong conformance coverage.
