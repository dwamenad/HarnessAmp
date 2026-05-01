# Benchmark Packs

Benchmark packs define the stable mission and contract that HarnessAmp mutates around.

Use this directory for release-grade benchmark assets, not one-off harness demos. A pack should separate:

- `intent` - the mission the agent must preserve
- `contract` - required behaviors, allowed tools, authority boundaries, and forbidden behaviors
- `benchmark` - executable cases and scoring expectations
- `wrapper` - prompts, tools, schemas, retries, response format, and runtime envelope

The wrapper can mutate. The intent and contract should not.

Current packs:

- [`support-mvp`](support-mvp/README.md) - customer-support robustness benchmark for tool-using agents
