const defaultChanges = [
  {
    id: 'chg-approval-token',
    status: 'blocking',
    source: 'payments-mcp@2.8.0',
    title: 'Refund approval is now required',
    summary: 'The refund tool now requires an approval_token for actions above $100.',
    changedAt: '12 min ago',
    surface: 'Tool input contract',
    before: 'refund_customer(customer_id, amount)',
    after: 'refund_customer(account_id, amount, approval_token)',
    agents: [
      { name: 'Support Copilot', environment: 'staging', status: 'broken', workflow: 'Refund escalation', detail: 'Calls the old customer_id field and skips approval.' },
      { name: 'Billing Resolver', environment: 'production shadow', status: 'review', workflow: 'Charge dispute', detail: 'Maps account identity, but has no approval policy.' },
    ],
    checks: [
      ['Schema compatibility', 'failed', 'customer_id no longer resolves'],
      ['Approval boundary', 'failed', 'missing approval_token on $150 refund'],
      ['Fallback behavior', 'passed', 'agent requests human review'],
    ],
  },
  {
    id: 'chg-search-provenance',
    status: 'review',
    source: 'knowledge-search@4.1.0',
    title: 'Search results now include source confidence',
    summary: 'The retrieval tool adds a confidence field and can return partial records.',
    changedAt: '46 min ago',
    surface: 'Tool output contract',
    before: '{ answer, sources[] }',
    after: '{ answer, sources[], confidence, partial }',
    agents: [
      { name: 'Knowledge Assistant', environment: 'staging', status: 'review', workflow: 'Policy lookup', detail: 'Needs an explicit low-confidence response rule.' },
    ],
    checks: [
      ['Schema compatibility', 'passed', 'new optional fields are tolerated'],
      ['Grounding policy', 'review', 'partial results can still be cited as complete'],
    ],
  },
  {
    id: 'chg-ticket-scope',
    status: 'compatible',
    source: 'support-api@1.14.2',
    title: 'Ticket lookup narrows default fields',
    summary: 'The support API removes internal notes from default ticket payloads.',
    changedAt: '2 hr ago',
    surface: 'Data access policy',
    before: 'ticket includes internal_notes',
    after: 'internal_notes requires explicit scope',
    agents: [
      { name: 'Support Copilot', environment: 'staging', status: 'compatible', workflow: 'Ticket triage', detail: 'Uses public ticket fields only.' },
    ],
    checks: [
      ['Least privilege', 'passed', 'internal notes are not required'],
      ['Task completion', 'passed', 'ticket triage remains intact'],
    ],
  },
];

export function buildChangeImpactSnapshot(changes = defaultChanges) {
  const normalized = changes.map((change) => ({
    ...change,
    agents: Array.isArray(change.agents) ? change.agents : [],
    checks: Array.isArray(change.checks) ? change.checks : [],
  }));
  const affectedAgents = normalized.flatMap((change) => change.agents.map((agent) => ({ ...agent, changeId: change.id })));
  const blockers = normalized.filter((change) => change.status === 'blocking');
  const reviews = normalized.filter((change) => change.status === 'review');
  const failedChecks = normalized.flatMap((change) => change.checks.filter(([, status]) => status === 'failed').map((check) => ({ changeId: change.id, check })));

  return {
    changes: normalized,
    summary: {
      totalChanges: normalized.length,
      blockingChanges: blockers.length,
      needsReview: reviews.length,
      affectedAgents: new Set(affectedAgents.map((agent) => agent.name)).size,
      affectedWorkflows: affectedAgents.length,
      failedChecks: failedChecks.length,
      releaseReady: blockers.length === 0 && failedChecks.length === 0,
    },
    dependencyNodes: buildDependencyNodes(normalized),
  };
}

function buildDependencyNodes(changes) {
  return changes.flatMap((change) => change.agents.map((agent) => ({
    id: `${change.id}:${agent.name}`,
    tool: change.source,
    agent: agent.name,
    status: agent.status,
    workflow: agent.workflow,
  })));
}

