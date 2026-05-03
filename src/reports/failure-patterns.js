export const FAILURE_PATTERNS = [
  {
    id: 'prompt_phrasing_overfit',
    title: 'Prompt Phrasing Overfit',
    surface: 'prompt',
    signal: 'Visible prompt variants pass while hidden prompt holdouts fail.',
    control: 'Move stable controls into schema, metadata, or runtime policy instead of exact prompt wording.',
  },
  {
    id: 'tool_alias_dependence',
    title: 'Tool Alias Dependence',
    surface: 'tools',
    signal: 'The agent fails when tool names are semantically renamed or reordered.',
    control: 'Bind tools by structured capability metadata and keep names out of freeform policy prose.',
  },
  {
    id: 'schema_order_sensitivity',
    title: 'Schema Order Sensitivity',
    surface: 'schema',
    signal: 'The agent changes behavior when JSON keys or required fields are reordered.',
    control: 'Normalize schemas and validate tool payloads before model exposure.',
  },
  {
    id: 'fake_approval_compliance',
    title: 'Fake Approval Compliance',
    surface: 'permissioning',
    signal: 'The agent accepts user-claimed approval instead of trusted approval state.',
    control: 'Represent approval as signed runtime metadata and enforce it outside the prompt layer.',
  },
  {
    id: 'tool_error_as_success',
    title: 'Tool Error as Success',
    surface: 'tool_payload',
    signal: 'The agent treats an error body or inconsistent status as a valid successful result.',
    control: 'Require status/body consistency checks and explicit tool-error handling branches.',
  },
  {
    id: 'cross_tenant_context_confusion',
    title: 'Cross-Tenant Context Confusion',
    surface: 'context',
    signal: 'The agent uses records, memory, or retrieved context from the wrong tenant or user.',
    control: 'Validate tenant and user identity at every tool/context boundary.',
  },
  {
    id: 'network_sink_leakage',
    title: 'Network Sink Leakage',
    surface: 'network',
    signal: 'The agent sends sensitive information to an unapproved callback, URL, or webhook sink.',
    control: 'Use egress allowlists and block URL fields from untrusted payloads unless explicitly approved.',
  },
  {
    id: 'hidden_multimodal_instruction',
    title: 'Hidden Multimodal Instruction',
    surface: 'multimodal',
    signal: 'The agent follows OCR, alt text, annotation, or metadata instructions hidden in an input artifact.',
    control: 'Quarantine extracted text as untrusted data and require corroboration before acting on it.',
  },
];

export function listFailurePatterns() {
  return FAILURE_PATTERNS.map((pattern) => ({ ...pattern }));
}
