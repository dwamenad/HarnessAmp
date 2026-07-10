# Product Requirements Document

## Product

HarnessAmp

## Status

Draft

## One-line definition

HarnessAmp is an intent-preservation harness for AI agent systems. It converts an intended goal, explicit contracts, and benchmark cases into a repeatable mutation test that measures whether agents still behave correctly when the wrapper changes.

## Problem

Most agent evaluations are run against one fixed wrapper:

- one prompt stack
- one tool layout
- one response shape
- one runtime policy

That setup can produce false confidence. The agent appears correct because it learned one exact wrapper, not because it reliably preserves the intended goal.

HarnessAmp already covers mutation and drift scoring. It does not yet establish the goal contract or build the release-gate pack that makes the score defensible. Without that layer, it is a mutation lab rather than a full harness.

## Users

### Primary users

- teams shipping multi-agent workflows
- teams running support, research, browser, or coding agents in production
- infra and eval teams responsible for agent reliability

### Secondary users

- AI platform teams building internal harnesses
- labs comparing versions of agent wrappers over time

## Core user jobs

1. Define what the agent system is supposed to preserve.
2. Turn that definition into an executable release-gate pack.
3. Stress the wrapper without changing the underlying mission.
4. Detect where the system becomes brittle.
5. Block releases when hidden variants expose drift.

## Product thesis

The product should not infer truth from the developer prompt. It should compile existing truth into executable checks.

That means HarnessAmp owns three layers:

1. Intent and contract definition
2. Wrapper mutation and execution
3. Drift diagnosis and hardening feedback

## Non-goals

- replacing domain-specific evaluators
- inventing business policy from scratch
- fully automating benchmark approval without human review
- serving only coding-agent workflows

## Key concepts

### Intent

The mission the system is meant to achieve.

Example:
"Resolve billing issues using approved docs only."

### Contract

The constraints and invariants that must hold.

Examples:

- must cite approved sources
- must escalate on policy conflict
- must not invent policy
- must not expose internal chain-of-thought

### Benchmark pack

A versioned set of cases, assertions, and scorers that prove the contract.

### Wrapper

The delivery layer around the model:

- prompts
- tools
- response contract
- retrieval settings
- message order
- runtime policy

### Mutation surface

A harmless wrapper change that should not alter mission success.

## Product requirements

### 1. Intent pack authoring

Users must be able to define:

- mission
- participating agents
- per-agent roles
- allowed tools and permissions
- required outputs
- forbidden behaviors
- escalation rules
- approved evidence sources

The product must support both single-agent and multi-agent systems.

### 2. Benchmark builder

HarnessAmp must support three benchmark-authoring paths:

- manual authoring
- source-derived drafts from docs, SOPs, APIs, or folders
- trace-derived drafts from approved human or agent runs

Generated release-gate drafts must require explicit approval before becoming release-grade goldens.

### 3. Multi-agent benchmark structure

Each benchmark case must support:

- global mission assertions
- per-agent role assertions
- allowed evidence references
- optional hidden truth
- acceptable end states
- forbidden actions

Each case must allow multiple acceptable outputs where appropriate.

### 4. Wrapper mutation engine

HarnessAmp must mutate:

- instruction encoding
- tool naming and ordering
- response contract shape
- evidence ordering
- message envelope
- timing and retry policy

Mutations must preserve the intended mission and contract.

### 5. Execution and scoring

HarnessAmp must:

- run visible variants
- run hidden holdouts
- ingest external observed runs
- score mission success
- score role fidelity
- score contract compliance
- measure robustness gap
- identify the weakest surface

### 6. Output and operator workflow

The product must output:

- benchmark summary
- visible vs holdout comparison
- per-surface drift
- per-agent failures
- recommendations
- exportable pack JSON
- terminal-readable report text

## MVP scope

The MVP should deliver:

1. A new pack format with `intent`, `contract`, `benchmark`, and `wrapper`.
2. Manual benchmark authoring.
3. Trace-derived draft generation from approved runs.
4. Multi-agent case support for up to 3 agents.
5. Deterministic assertions plus optional judge-based checks.
6. Mutation and scoring over visible and hidden variants.
7. Browser and CLI views using the same engine.

## Post-MVP

- source-derived release-gate drafts from folders and docs
- benchmark approval workflow
- continuous benchmark refresh from production traces
- multi-run experiment comparison
- agent-team coordination scoring
- CI release gates on hidden holdouts

## Example target workflow

Multi-agent support system:

- `planner` routes the request
- `researcher` retrieves approved evidence
- `responder` answers the customer
- `escalation` creates a handoff when needed

HarnessAmp should let the team define the mission, compile benchmark cases, mutate wrapper surfaces, and confirm that the same mission still succeeds after wrapper drift.

## Success metrics

- time to create first release-gate pack
- percent of cases with explicit assertions
- hidden holdout failure rate caught before release
- reduction in production regressions caused by wrapper changes
- number of release decisions blocked by hidden drift

## Risks

- benchmark authoring may be expensive without good draft tooling
- weak contracts will produce weak drift scores
- judge-based scoring may hide disagreement if not paired with deterministic assertions
- mutation surfaces may accidentally change task semantics if not reviewed carefully

## Open questions

1. Should the first benchmark-builder path be trace-derived or manually authored?
2. How much of benchmark approval should happen in the product versus in git review?
3. What minimum benchmark size should be required before the robustness gap is treated as release-grade?
4. Which multi-agent domains should be first-class: support, coding, browser, or research?
