# Adapters

HarnessAmp should wrap agent systems without becoming another agent framework.

The adapter layer is the boundary between HarnessAmp and external infrastructure such as agent frameworks, graph workflows, model SDKs, crew-style workflows, multi-agent runtimes, MCP servers, or custom HTTP agents.

- [Runner Contract](runner-contract.md)

## Adapter Principle

Adapters should translate an external agent system into the HarnessAmp runner contract.

They should not:

- own mutation logic
- define failure taxonomy
- rewrite benchmark semantics
- hide tool calls or errors
- approve sensitive actions

Adapters should only run the baseline or mutated harness and return a structured `AgentRunResult`.

## Planned Adapter Packages

The core repo keeps placeholder classes for future adapters:

- `ModelSDKRunner`
- `AgentFrameworkRunner`
- `GraphWorkflowRunner`
- `CrewWorkflowRunner`
- `MultiAgentRunner`
- `CustomHTTPRunner`
- `MCPRunner`

When these become real integrations, each should pass the conformance tests in `tests/conformance/`.
