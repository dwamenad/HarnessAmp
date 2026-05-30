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

## Generated v1 Suites

The v1 engine can also expand the same registry into deterministic generated suites:

```bash
node scripts/harnessamp.mjs mutate examples/demo-bundle.json --generated smoke
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --generated smoke
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json --generated nightly --max-generated 500
```

Generated tiers:

- `smoke`: 400 generated tests
- `core`: 3,400 generated tests
- `deep`: 17,000 generated tests
- `nightly`: 51,000 generated tests

Each generated record keeps the v1 mutation shape, but adds a unique mutation id, the base registry mutation id, and generated metadata for the scenario, risk-profile variant, prompt variant, and context variant.

The default runner is `MockRunner`. Future adapters exist as placeholders for model SDKs, agent frameworks, graph workflows, crew-style workflows, multi-agent runtimes, custom HTTP agents, and MCP-style runners.
