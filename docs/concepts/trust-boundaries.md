# Trust Boundaries

A trust boundary is the seam where data or authority crosses from one part of the agent system into another.

HarnessAmp mutations are organized around these seams because they explain why a failure matters.

Common trust boundaries include:

- `user_input_to_agent_instruction`
- `tool_output_to_model_context`
- `tool_status_to_agent_action`
- `user_claim_to_permission_model`
- `tool_payload_to_outbound_request`
- `history_to_current_instruction`
- `runtime_identity_to_tool_scope`
- `media_metadata_to_instruction_context`
- `sandbox_runtime_to_host_environment`

## Why Boundaries Matter

An eval can say the answer was wrong.

HarnessAmp should say:

> The answer became wrong because malformed tool output crossed the tool-output-to-model-context boundary without schema validation.

That distinction is the product value. It turns a generic failure into an engineering fix.

## Boundary-Centered Reports

Each high-risk finding should answer:

- which boundary was stressed
- what mutation crossed that boundary
- what behavior changed
- which failure type was triggered
- which control reduces recurrence

This is why mutation records carry `surface`, `target`, `trustBoundary`, `expectedFailure`, `diagnosticSignal`, and `recommendedControl`.
