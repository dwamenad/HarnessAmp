# Public Data Plan

This document answers three operational questions:

1. Which public data sources are worth using to bootstrap HarnessAmp?
2. Which of those sources are safe to ship in an open repo versus internal-only?
3. What should be ingested first?

This is an engineering policy document, not legal advice. When a source has ambiguous redistribution terms, default to shipping transform code, manifests, and derived benchmark-pack metadata rather than vendoring the raw corpus.

## Public Data Ingestion Plan

HarnessAmp needs public data for four distinct jobs:

- `benchmark-pack` seeds
- trace-to-contract examples
- mutation-surface seeds
- failure-corpus bootstrapping

Those jobs should not be mixed together. The right way to ingest public data is to map each source to the narrowest useful artifact.

### Lane 1: Tool-use and role traces

Use these first when the goal is to strengthen the trace-to-contract compiler.

- [ToolSandbox](https://github.com/apple/ToolSandbox)
- [tau2-bench](https://github.com/sierra-research/tau2-bench)
- [tau2-bench-data](https://huggingface.co/datasets/HuggingFaceH4/tau2-bench-data)

Why these fit:

- They expose multi-step tool interactions instead of only final answers.
- They are close to the `intent -> contract -> benchmark` story.
- ToolSandbox already includes trajectory artifacts and explicitly documents conversation traces and result summaries.
- tau2-bench is closer to real support and policy workflows than generic agent benchmarks.

What to ingest:

- approved trace examples
- benchmark-case metadata
- tool definitions
- milestones and policy assertions

What not to ingest yet:

- full raw corpora checked into the repo
- provider-specific execution logs that require external API credentials to replay

### Lane 2: Deterministic environment tasks

Use these when the goal is reproducible release gates and wrapper drift checks.

- [WebArena-Verified](https://github.com/ServiceNow/webarena-verified)
- [SWE-bench](https://github.com/SWE-bench/SWE-bench)

Why these fit:

- They have deterministic or highly structured evaluators.
- They are good seeds for public release-gate packs because the expected state is well-defined.
- WebArena-Verified explicitly emphasizes deterministic scoring and offline replay.
- SWE-bench is valuable for coding-agent packs and real-world issue-resolution workflows.

What to ingest:

- task metadata
- benchmark-pack manifests
- derived assertions and milestone templates
- downloader scripts or instructions, not the full raw datasets

What not to ingest yet:

- heavyweight environment snapshots
- full Docker images
- large mirrored datasets inside the repo

### Lane 3: Tool-schema and mutation seeds

Use these to build the mutation layer, not to define truth.

- [APIs.guru OpenAPI Directory](https://github.com/APIs-guru/openapi-directory)
- [Gorilla / BFCL](https://github.com/ShishirPatil/gorilla)

Why these fit:

- They expose real tool signatures, parameter layouts, and function-calling surfaces.
- They are useful for schema-shape mutations, argument-precision checks, and tool-contract drift generation.

What to ingest:

- selected tool schemas
- derived mutation templates
- benchmark-pack tool manifests

What not to ingest yet:

- broad raw mirrors of the entire API directory
- redistributed copies of specs with unclear downstream rights

### Lane 4: Broad agent benchmark coverage

Use this lane for task-family inspiration and evaluator design, not as the first ingestion target.

- [AgentBench](https://github.com/THUDM/AgentBench)

Why this is lower priority:

- It is broad and useful, but less direct for the current wedge than ToolSandbox, tau2-bench, or WebArena-Verified.
- It helps expand coverage once the pack format and compiler are already stable.

What to ingest:

- task taxonomy
- environment patterns
- pack examples for broad agent workflows

## Safe-To-Ship vs Internal-Only Matrix

The table below is the repo policy that should drive what we commit openly.

| Source | Primary use in HarnessAmp | Open repo | Internal only | Notes |
| --- | --- | --- | --- | --- |
| [ToolSandbox](https://github.com/apple/ToolSandbox) | Trace-to-contract examples, tool-use cases, mutation ideas | Yes, via derived packs and sample traces | No | Good first public seed because it exposes trajectory structure and tool perturbation ideas. |
| [tau2-bench](https://github.com/sierra-research/tau2-bench) | Customer-service and policy-heavy release-gate packs | Yes, via derived packs and import instructions | No | Use repo code plus the MIT-licensed [tau2-bench-data](https://huggingface.co/datasets/HuggingFaceH4/tau2-bench-data) dataset as the safest redistribution basis. |
| [tau2-bench-data](https://huggingface.co/datasets/HuggingFaceH4/tau2-bench-data) | Domain data for support-style packs | Yes, with attribution and version pinning | No | Hugging Face dataset card shows `mit`. |
| [WebArena-Verified](https://github.com/ServiceNow/webarena-verified) | Browser-agent release-gate packs and deterministic release gates | Yes, via manifests, docs, and derived pack examples | No | Do not vendor environment images or large site data into the repo. |
| [SWE-bench](https://github.com/SWE-bench/SWE-bench) | Coding-agent release-gate packs and deterministic issue-resolution cases | Yes, via manifests and derived pack metadata | No | Do not mirror the whole dataset or evaluation images into the repo. |
| [AgentBench](https://github.com/THUDM/AgentBench) | Coverage expansion and environment taxonomy | Yes, selectively | No | Useful, but not a first ingestion target. |
| [APIs.guru OpenAPI Directory](https://github.com/APIs-guru/openapi-directory) | Tool-schema seeds and mutation templates | Use with care | Yes for broad internal mining | The repo states contributed definitions are CC0, while some externally acquired definitions are included under fair-use reasoning. Prefer selected internal mining plus shipped derived templates. |
| [GAIA](https://huggingface.co/datasets/gaia-benchmark/GAIA) | Internal evaluation only | No | Yes | Dataset terms say not to reshare outside a gated or private repository. |
| [WorkArena](https://github.com/ServiceNow/WorkArena) | Internal browser-agent benchmarking | No | Yes | Requires gated access to ServiceNow instances and gated Hugging Face data. Good for internal validation, not for open seed packs. |

## What To Ingest First

This is the concrete order I would use in the repo.

### 1. ToolSandbox

Why first:

- Best fit for the current product wedge.
- Gives us tool-use traces, conversation structure, and already-relevant perturbation patterns.
- Useful for both the compiler and the mutation layer.

First repo artifacts:

- `examples/packs/toolsandbox-*.json`
- `examples/traces/toolsandbox-*.json`
- a small importer script that converts one or two scenarios into benchmark-pack drafts

### 2. tau2-bench-data

Why second:

- Strongest public source for policy-heavy, customer-support-style workflows.
- Good fit for `intent`, `contract`, and role-boundary semantics.
- Cleaner redistribution story than relying only on the repo code.

First repo artifacts:

- `examples/packs/tau2-*.json`
- a trace-to-contract fixture derived from one domain
- benchmark-case assertions for policy adherence and escalation

### 3. WebArena-Verified Hard subset

Why third:

- Strong deterministic evaluator posture.
- Good browser-agent lane for release-gate demos.
- Smaller hard subset is enough to prove the workflow without dragging the repo into environment sprawl.

First repo artifacts:

- a documented import path for the hard subset
- one or two derived browser release-gate packs
- release-gate examples tied to deterministic web tasks

### 4. SWE-bench Lite or Verified metadata

Why fourth:

- Important for coding-agent credibility, but not the first wedge for the current product.
- High operational cost compared with tool-use and workflow datasets.

First repo artifacts:

- coding benchmark-pack examples
- issue-to-pack manifests
- mutation templates around tool contracts, file targets, and patch/test loops

### 5. AgentBench

Why fifth:

- Good for breadth after the pack format is stable.
- Better as an expansion lane than as the first data source.

First repo artifacts:

- taxonomy notes
- selected benchmark-pack examples by environment

### 6. APIs.guru and Gorilla

Why sixth:

- Important for mutation and tool-schema coverage.
- Not strong enough on their own to define ground truth.

First repo artifacts:

- internal schema-mining scripts
- public mutation templates
- public tool-contract fixtures derived from selected specs

## Recommended Repo Policy

Use public data in the repo under these rules:

1. Ship benchmark-pack examples, manifests, transforms, and docs first.
2. Do not vendor large raw corpora unless the redistribution story is clear and the size is reasonable.
3. Treat gated datasets as internal validation assets, not open examples.
4. Treat mixed-license corpora as internal mining inputs unless legal review says otherwise.
5. Version-pin every source in the ingestion pipeline so benchmark drift is explainable.

## Immediate Next Steps

1. Add one ToolSandbox-derived trace fixture and one ToolSandbox-derived benchmark-pack example.
2. Add one tau2-bench-derived support release-gate pack.
3. Add an import note for WebArena-Verified hard subset instead of vendoring the raw benchmark.
4. Keep GAIA and WorkArena out of the open repo and reserve them for internal validation.
