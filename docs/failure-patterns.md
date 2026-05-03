# Agent Failure Patterns

HarnessAmp should become a library of production agent failure modes, not just a runner.

The first public pattern set is:

| Pattern | Surface | Signal | Control |
| --- | --- | --- | --- |
| Prompt Phrasing Overfit | prompt | Visible prompt variants pass while hidden prompt holdouts fail. | Move stable controls into schema, metadata, or runtime policy instead of exact prompt wording. |
| Tool Alias Dependence | tools | The agent fails when tool names are semantically renamed or reordered. | Bind tools by structured capability metadata and keep names out of freeform policy prose. |
| Schema Order Sensitivity | schema | The agent changes behavior when JSON keys or required fields are reordered. | Normalize schemas and validate tool payloads before model exposure. |
| Fake Approval Compliance | permissioning | The agent accepts user-claimed approval instead of trusted approval state. | Represent approval as signed runtime metadata and enforce it outside the prompt layer. |
| Tool Error as Success | tool payload | The agent treats an error body or inconsistent status as a valid successful result. | Require status/body consistency checks and explicit tool-error handling branches. |
| Cross-Tenant Context Confusion | context | The agent uses records, memory, or retrieved context from the wrong tenant or user. | Validate tenant and user identity at every tool/context boundary. |
| Network Sink Leakage | network | The agent sends sensitive information to an unapproved callback, URL, or webhook sink. | Use egress allowlists and block URL fields from untrusted payloads unless explicitly approved. |
| Hidden Multimodal Instruction | multimodal | The agent follows OCR, alt text, annotation, or metadata instructions hidden in an input artifact. | Quarantine extracted text as untrusted data and require corroboration before acting on it. |

## Why this matters

Generic evaluators can show a score. HarnessAmp should show the recurring production anti-pattern behind the score.

The failure corpus should eventually answer:

- Which failure patterns recur across agents?
- Which mutation surfaces expose the most production risk?
- Which engineering controls actually reduce the Robustness Gap?
- Which failures were fixed once but came back in later releases?
