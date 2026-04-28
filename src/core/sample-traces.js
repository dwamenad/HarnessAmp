export const SAMPLE_TRACE_CORPUS = {
  project: 'Northstar Support Copilot',
  mission: 'Resolve support requests through the approved planner, specialist, and responder workflow.',
  traces: [
    {
      id: 'trace-001',
      title: 'Duplicate charge resolution',
      input: 'I was charged twice for order 1234. Can you fix it?',
      approved: true,
      success: true,
      budget: {
        maxTokens: 1800,
        maxLatencyMs: 6500,
      },
      agents: [
        { id: 'triage', role: 'triage' },
        { id: 'billing_specialist', role: 'specialist' },
        { id: 'responder', role: 'responder' },
      ],
      assertions: [
        'Use billing tools before making a refund claim.',
        'Responder asks for the smallest missing verification detail.',
      ],
      events: [
        { type: 'message', agentId: 'triage', content: 'Classify the request as billing and route to the billing specialist.' },
        { type: 'handoff', agentId: 'triage', toAgentId: 'billing_specialist', content: 'Billing issue for duplicate charge on order 1234.' },
        { type: 'tool_call', agentId: 'billing_specialist', toolName: 'lookup_order', arguments: { order_id: '1234' } },
        { type: 'tool_call', agentId: 'billing_specialist', toolName: 'lookup_customer', arguments: { email: 'customer@example.com' } },
        { type: 'handoff', agentId: 'billing_specialist', toAgentId: 'responder', content: 'Order exists; account verification required before refund.' },
        { type: 'final_response', agentId: 'responder', content: 'I can help with that. Please confirm the billing email so I can verify the account and continue.' },
      ],
    },
    {
      id: 'trace-002',
      title: 'Missing shipment escalation',
      input: 'My shipment has not arrived and tracking stopped updating.',
      approved: true,
      success: true,
      budget: {
        maxTokens: 2200,
        maxLatencyMs: 7200,
      },
      agents: [
        { id: 'triage', role: 'triage' },
        { id: 'shipping_specialist', role: 'specialist' },
        { id: 'responder', role: 'responder' },
        { id: 'escalation', role: 'escalation' },
      ],
      assertions: [
        'Escalate after the shipping specialist confirms the package is stalled.',
        'Responder must communicate the escalation clearly and avoid guessing ETA.',
      ],
      events: [
        { type: 'handoff', agentId: 'triage', toAgentId: 'shipping_specialist', content: 'Shipping issue with stale tracking.' },
        { type: 'tool_call', agentId: 'shipping_specialist', toolName: 'lookup_order', arguments: { order_id: '9981' } },
        { type: 'tool_call', agentId: 'shipping_specialist', toolName: 'track_package', arguments: { tracking_id: 'ZX-9912' } },
        { type: 'handoff', agentId: 'shipping_specialist', toAgentId: 'escalation', content: 'Tracking has been stalled for five days.' },
        { type: 'tool_call', agentId: 'escalation', toolName: 'create_handoff', arguments: { priority: 'high' } },
        { type: 'handoff', agentId: 'escalation', toAgentId: 'responder', content: 'Escalation created; communicate next steps.' },
        { type: 'final_response', agentId: 'responder', content: 'I escalated this shipment issue to a human specialist and marked it high priority. You will receive the next update from the team handling delayed shipments.' },
      ],
    },
    {
      id: 'trace-003',
      title: 'Return policy clarification',
      input: 'Can I return this item even though I opened it?',
      approved: true,
      success: true,
      budget: {
        maxTokens: 1600,
        maxLatencyMs: 5800,
      },
      agents: [
        { id: 'triage', role: 'triage' },
        { id: 'policy_specialist', role: 'specialist' },
        { id: 'responder', role: 'responder' },
      ],
      assertions: [
        'Use approved policy sources before answering.',
        'Responder gives a policy-backed answer and cites the decision boundary.',
      ],
      events: [
        { type: 'handoff', agentId: 'triage', toAgentId: 'policy_specialist', content: 'Return policy question about opened items.' },
        { type: 'tool_call', agentId: 'policy_specialist', toolName: 'search_policy_docs', arguments: { topic: 'opened returns' } },
        { type: 'handoff', agentId: 'policy_specialist', toAgentId: 'responder', content: 'Opened items can be returned within 30 days if packaging is intact.' },
        { type: 'final_response', agentId: 'responder', content: 'Yes, opened items can still be returned within 30 days as long as the packaging is intact. If you want, I can help you start that process.' },
      ],
    },
  ],
};
