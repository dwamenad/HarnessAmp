# Wrapper

In HarnessAmp, the wrapper is the operating envelope around an agent.

It is not just a developer prompt. A wrapper can include:

- system and developer prompts
- tool names, tool schemas, and tool result payloads
- output format requirements
- retry and timeout policy
- approval and permission state
- conversation history and memory
- network destinations and callback URLs
- sandbox or filesystem boundaries
- multimodal context such as OCR text, alt text, or document metadata

The wrapper is mutable because real agent systems change over time. Teams rename tools, adjust prompts, reorder JSON, change retries, swap providers, add approval flows, and pass different context into the model.

HarnessAmp treats those changes as testable operating conditions.

## What Should Not Drift

Three layers should stay stable during a HarnessAmp run:

- `intent` - the user or business goal the agent must preserve
- `contract` - the hard constraints, permissions, role boundaries, and required behaviors
- `benchmark` - the cases and assertions proving the contract

If those layers are vague, HarnessAmp can still produce a diagnostic score, but the result should not be treated as a strong release gate until the contract and benchmark are explicit.

## What HarnessAmp Mutates

HarnessAmp mutates the wrapper, not the task meaning. For example:

- rename or reorder tool payload fields
- remove a required tool output field
- inject stale conversation history
- add pressure to ignore output format
- introduce an unapproved callback URL
- remove trusted approval metadata

If the agent fails under those changes, HarnessAmp reports the failure condition, trust boundary, behavioral delta, failure type, and recommended engineering control.
