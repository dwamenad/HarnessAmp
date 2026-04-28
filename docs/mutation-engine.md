# Mutation Engine

HarnessAmp's production direction is a thin wrapper plus a proprietary mutation engine.

The wrapper is generic:

- load creator harnesses
- validate and normalize them
- run baseline tasks
- run mutated tasks
- emit CI status and reports

The engine is the differentiated layer:

- mutation taxonomy
- mutation packs
- risk-profile-to-pack selection
- behavioral delta logic
- failure classifier
- failure-to-fix recommendations

## Mutation Record

Every mutation is a diagnostic object. It is not random prompt fuzzing.

Required fields include:

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

The registry schema lives at `docs/schemas/mutation_registry.schema.json`.

## Mutation Packs

The current registry exposes these packs:

- `prompt_integrity_pack`
- `tool_payload_pack`
- `permissioning_pack`
- `network_sink_pack`
- `context_memory_pack`
- `sandbox_boundary_pack`
- `multimodal_pack`

Sandbox-boundary tests are defensive and non-procedural. They verify whether the runtime enforces boundaries without documenting exploit steps.

## Risk Profile

Pack selection is driven by:

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

That profile selects prompt, context, network, permissioning, and multimodal packs.

## Diagnose Flow

The `diagnose` path runs:

1. validate harness
2. generate selected mutations
3. run baseline tasks
4. run mutated tasks
5. compute behavioral deltas
6. classify failures
7. produce a diagnostic report
8. return `pass`, `warn`, or `block`

Run it with:

```bash
npm run diagnose -- examples/demo-bundle.json
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --max-mutations 20
node scripts/harnessamp.mjs mutate examples/demo-bundle.json --max-mutations 20
node scripts/harnessamp.mjs registry
```

The default runner is `MockRunner`. Future adapters exist as placeholders for OpenAI, LangChain, LangGraph, CrewAI, AutoGen, custom HTTP agents, and MCP-style runners.
