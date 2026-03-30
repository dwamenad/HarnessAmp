import { SAMPLE_TRACE_CORPUS } from './sample-traces.js';

export function createDemoTraceCorpus() {
  return deepClone(SAMPLE_TRACE_CORPUS);
}

export function compileTraceContract(input, options = {}) {
  const corpus = normalizeTraceCorpus(input);
  const approvedTraces = corpus.traces.filter((trace) => trace.approved && trace.success);

  if (!approvedTraces.length) {
    throw new Error('At least one approved successful trace is required to compile a contract.');
  }

  const agentProfiles = buildAgentProfiles(approvedTraces);
  const topology = buildTopology(agentProfiles);
  const intent = buildIntent(corpus, approvedTraces, agentProfiles);
  const contract = buildContract(corpus, approvedTraces, agentProfiles, topology);
  const benchmark = buildBenchmark(corpus, approvedTraces, agentProfiles, topology, options);
  const reportText = formatTraceContractReport(corpus, intent, contract, benchmark);

  return {
    corpus,
    intent,
    contract,
    benchmark,
    reportText,
    summary: {
      approvedTraceCount: approvedTraces.length,
      totalTraceCount: corpus.traces.length,
      agentCount: contract.agents.length,
      handoffEdgeCount: topology.handoffs.length,
      toolCount: countDistinct(contract.agents.flatMap((agent) => agent.allowedTools)),
      caseCount: benchmark.cases.length,
      reviewStatus: 'draft',
    },
  };
}

export function formatTraceContractReport(corpus, intent, contract, benchmark) {
  const lines = [];
  lines.push('# Trace contract report');
  lines.push('');
  lines.push(`- Project: ${corpus.project}`);
  lines.push(`- Mission: ${intent.mission}`);
  lines.push(`- Approved traces: ${benchmark.summary.approvedTraceCount}`);
  lines.push(`- Agents: ${contract.agents.length}`);
  lines.push(`- Benchmark cases: ${benchmark.cases.length}`);
  lines.push('');
  lines.push('## Agent contracts');
  lines.push('');
  contract.agents.forEach((agent) => {
    const tools = agent.allowedTools.length ? agent.allowedTools.join(', ') : 'none';
    lines.push(`- ${agent.id} (${agent.role}): tools=${tools}`);
  });
  lines.push('');
  lines.push('## Handoff graph');
  lines.push('');
  if (contract.handoffs.length) {
    contract.handoffs.forEach((edge) => {
      lines.push(`- ${edge.from} -> ${edge.to} (${edge.count} traces)`);
    });
  } else {
    lines.push('- No handoffs inferred.');
  }
  lines.push('');
  lines.push('## Benchmark cases');
  lines.push('');
  benchmark.cases.forEach((item) => {
    lines.push(`- ${item.id}: ${item.title}`);
  });
  return lines.join('\n');
}

function normalizeTraceCorpus(input) {
  const source = Array.isArray(input) ? { traces: input } : isObject(input) ? input : {};
  return {
    project: stringOr(source.project, 'HarnessAmp Trace Compiler'),
    mission: stringOr(source.mission, ''),
    traces: Array.isArray(source.traces) ? source.traces.map(normalizeTrace).filter(Boolean) : [],
  };
}

function normalizeTrace(raw, index) {
  if (!isObject(raw)) return null;

  const trace = {
    id: stringOr(raw.id, `trace-${String(index + 1).padStart(3, '0')}`),
    title: stringOr(raw.title, `Trace ${index + 1}`),
    input: stringOr(raw.input ?? raw.userGoal ?? raw.prompt, ''),
    approved: raw.approved !== false,
    success: Boolean(raw.success ?? raw.outcome?.success ?? true),
    budget: {
      maxTokens: numberOr(raw.budget?.maxTokens ?? raw.maxTokens, null),
      maxLatencyMs: numberOr(raw.budget?.maxLatencyMs ?? raw.maxLatencyMs, null),
    },
    agents: Array.isArray(raw.agents) ? raw.agents.map(normalizeAgentRef).filter(Boolean) : [],
    assertions: normalizeStringArray(raw.assertions),
    events: Array.isArray(raw.events) ? raw.events.map(normalizeEvent).filter(Boolean) : [],
  };

  if (!trace.events.length && trace.agents.length) {
    trace.events.push({
      type: 'message',
      agentId: trace.agents[0].id,
      toAgentId: '',
      toolName: '',
      arguments: null,
      content: trace.input,
    });
  }

  return trace;
}

function normalizeAgentRef(raw, index) {
  if (!isObject(raw)) return null;
  return {
    id: stringOr(raw.id ?? raw.name, `agent-${index + 1}`),
    role: stringOr(raw.role, ''),
  };
}

function normalizeEvent(raw) {
  if (!isObject(raw)) return null;

  const inferredType = inferEventType(raw);
  return {
    type: inferredType,
    agentId: stringOr(raw.agentId ?? raw.agent ?? raw.fromAgent, ''),
    toAgentId: stringOr(raw.toAgentId ?? raw.toAgent ?? raw.recipient, ''),
    toolName: stringOr(raw.toolName ?? raw.tool ?? raw.name, ''),
    arguments: isObject(raw.arguments ?? raw.args) ? deepClone(raw.arguments ?? raw.args) : null,
    content: stringOr(raw.content ?? raw.message ?? raw.output, ''),
  };
}

function inferEventType(raw) {
  const explicit = stringOr(raw.type, '').toLowerCase();
  if (explicit) return explicit;
  if (raw.toolName || raw.tool || raw.args || raw.arguments) return 'tool_call';
  if (raw.toAgentId || raw.toAgent || raw.recipient) return 'handoff';
  if (raw.final === true || raw.channel === 'user' || raw.audience === 'user') return 'final_response';
  return 'message';
}

function buildAgentProfiles(traces) {
  const profiles = new Map();

  traces.forEach((trace) => {
    trace.agents.forEach((agent) => ensureProfile(profiles, agent.id, agent.role));

    trace.events.forEach((event) => {
      if (!event.agentId) return;
      const profile = ensureProfile(profiles, event.agentId, findAgentRole(trace.agents, event.agentId));
      profile.eventCount += 1;

      if (event.type === 'tool_call' && event.toolName) {
        profile.allowedTools.add(event.toolName);
        profile.toolCallCount += 1;
      }

      if (event.type === 'handoff' && event.toAgentId) {
        profile.handoffsOut += 1;
        profile.handoffTargets.set(event.toAgentId, (profile.handoffTargets.get(event.toAgentId) ?? 0) + 1);
        const target = ensureProfile(profiles, event.toAgentId, findAgentRole(trace.agents, event.toAgentId));
        target.handoffsIn += 1;
      }

      if (event.type === 'final_response') {
        profile.finalResponseCount += 1;
      }
    });
  });

  return Array.from(profiles.values())
    .map((profile) => finalizeProfile(profile))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function ensureProfile(map, id, roleHint = '') {
  const key = stringOr(id, '');
  if (!key) {
    return {
      id: '',
      roleHints: new Map(),
      allowedTools: new Set(),
      eventCount: 0,
      toolCallCount: 0,
      handoffsOut: 0,
      handoffsIn: 0,
      finalResponseCount: 0,
      handoffTargets: new Map(),
    };
  }

  if (!map.has(key)) {
    map.set(key, {
      id: key,
      roleHints: new Map(),
      allowedTools: new Set(),
      eventCount: 0,
      toolCallCount: 0,
      handoffsOut: 0,
      handoffsIn: 0,
      finalResponseCount: 0,
      handoffTargets: new Map(),
    });
  }

  const profile = map.get(key);
  if (roleHint) {
    profile.roleHints.set(roleHint, (profile.roleHints.get(roleHint) ?? 0) + 1);
  }
  return profile;
}

function finalizeProfile(profile) {
  const explicitRole = mostCommonKey(profile.roleHints);
  const role = explicitRole || inferRole(profile);
  const responsibilities = [];

  if (profile.handoffsOut > 0) responsibilities.push('Route work through approved handoff paths.');
  if (profile.allowedTools.size > 0) responsibilities.push(`Use assigned tools: ${Array.from(profile.allowedTools).sort().join(', ')}.`);
  if (profile.finalResponseCount > 0) responsibilities.push('Produce the final user-facing response.');
  if (!responsibilities.length) responsibilities.push('Participate only in the observed workflow steps.');

  const must = [];
  const mustNot = [];

  if (profile.allowedTools.size > 0) {
    must.push('Use only the tools observed for this role unless the contract is updated.');
  }
  if (profile.handoffsOut > 0) {
    must.push('Keep handoffs inside the approved routing graph.');
  }
  if (profile.finalResponseCount > 0) {
    must.push('Preserve the mission outcome when composing the terminal response.');
  } else {
    mustNot.push('Send the final user-facing answer directly.');
  }
  if (profile.allowedTools.size === 0) {
    mustNot.push('Call tools that belong to another role.');
  }

  return {
    id: profile.id,
    role,
    responsibilities,
    must,
    mustNot,
    allowedTools: Array.from(profile.allowedTools).sort(),
    handoffsTo: Array.from(profile.handoffTargets.entries())
      .map(([to, count]) => ({ to, count }))
      .sort((a, b) => a.to.localeCompare(b.to)),
    finalResponder: profile.finalResponseCount > 0,
    toolCallCount: profile.toolCallCount,
    handoffsIn: profile.handoffsIn,
    handoffsOut: profile.handoffsOut,
  };
}

function buildTopology(agentProfiles) {
  const handoffs = [];
  agentProfiles.forEach((agent) => {
    agent.handoffsTo.forEach((target) => {
      handoffs.push({
        from: agent.id,
        to: target.to,
        count: target.count,
      });
    });
  });
  return {
    handoffs: handoffs.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
  };
}

function buildIntent(corpus, traces, agentProfiles) {
  const mission = corpus.mission || inferMission(corpus, traces, agentProfiles);
  const finalResponders = agentProfiles.filter((agent) => agent.finalResponder).map((agent) => agent.id);

  return {
    mission,
    reviewStatus: 'draft',
    derivedFrom: {
      approvedTraceIds: traces.map((trace) => trace.id),
      finalResponders,
    },
    successSignals: [
      'The workflow reaches a successful terminal response.',
      'Only approved handoff paths are used.',
      'Tool usage stays within the observed role boundaries.',
    ],
  };
}

function buildContract(corpus, traces, agentProfiles, topology) {
  const finalResponders = agentProfiles.filter((agent) => agent.finalResponder).map((agent) => agent.id);
  return {
    reviewStatus: 'draft',
    global: {
      must: [
        'Complete the mission using only approved agent roles and observed handoff paths.',
        'Finish with a terminal response or explicit terminal state.',
        'Keep tool calls attached to the roles that demonstrated ownership in approved traces.',
      ],
      mustNot: [
        'Introduce unapproved agent roles into the workflow.',
        'Skip the terminal response after a successful path.',
        'Route directly to a specialist or responder outside the approved graph.',
      ],
      finalResponders,
    },
    agents: agentProfiles.map((agent) => ({
      id: agent.id,
      role: agent.role,
      responsibilities: agent.responsibilities,
      must: agent.must,
      mustNot: agent.mustNot,
      allowedTools: agent.allowedTools,
      finalResponder: agent.finalResponder,
    })),
    handoffs: topology.handoffs,
    provenance: {
      project: corpus.project,
      approvedTraceCount: traces.length,
    },
  };
}

function buildBenchmark(corpus, traces, agentProfiles, topology) {
  const finalResponderIds = new Set(agentProfiles.filter((agent) => agent.finalResponder).map((agent) => agent.id));
  const allowedHandoffEdges = new Set(topology.handoffs.map((edge) => `${edge.from}->${edge.to}`));
  const allowedToolOwners = new Map();

  agentProfiles.forEach((agent) => {
    agent.allowedTools.forEach((tool) => {
      if (!allowedToolOwners.has(tool)) {
        allowedToolOwners.set(tool, new Set());
      }
      allowedToolOwners.get(tool).add(agent.id);
    });
  });

  const cases = traces.map((trace, index) => {
    const milestones = trace.events
      .map((event) => summarizeEvent(event))
      .filter(Boolean)
      .slice(0, 8);

    const derivedAssertions = [
      'Mission outcome remains successful.',
      'Only approved roles participate in the task.',
    ];

    if (trace.events.some((event) => event.type === 'handoff')) {
      derivedAssertions.push('Handoffs stay inside the approved routing graph.');
    }
    if (trace.events.some((event) => event.type === 'tool_call')) {
      derivedAssertions.push('Tool calls remain attached to their observed owner roles.');
    }
    if (trace.events.some((event) => event.type === 'final_response')) {
      derivedAssertions.push('A terminal response is produced by an approved final responder.');
    }

    return {
      id: trace.id,
      title: trace.title,
      input: trace.input,
      allowedAgents: trace.agents.map((agent) => agent.id),
      expectedMilestones: milestones,
      assertions: uniqueStrings([...trace.assertions, ...derivedAssertions]),
      forbiddenActions: buildForbiddenActions(trace, finalResponderIds, allowedHandoffEdges, allowedToolOwners),
      passRules: [
        'final_state_success',
        'allowed_roles_only',
        'approved_handoffs_only',
        'tool_ownership_preserved',
      ],
      rubricFields: [
        'mission_success',
        'handoff_accuracy',
        'role_fidelity',
        'tool_argument_precision',
      ],
      budget: {
        maxTokens: trace.budget.maxTokens,
        maxLatencyMs: trace.budget.maxLatencyMs,
      },
      seed: 1000 + index,
    };
  });

  return {
    reviewStatus: 'draft',
    cases,
    summary: {
      approvedTraceCount: traces.length,
      privateHoldoutRecommendation: Math.max(1, Math.round(cases.length * 0.2)),
      finalResponders: Array.from(finalResponderIds).sort(),
    },
  };
}

function buildForbiddenActions(trace, finalResponderIds, allowedHandoffEdges, allowedToolOwners) {
  const actions = new Set([
    'introduce_unapproved_agent_role',
    'skip_terminal_response_on_success',
  ]);

  trace.events.forEach((event) => {
    if (event.type === 'handoff' && event.agentId && event.toAgentId && !allowedHandoffEdges.has(`${event.agentId}->${event.toAgentId}`)) {
      actions.add(`handoff_outside_contract:${event.agentId}->${event.toAgentId}`);
    }
    if (event.type === 'tool_call' && event.toolName && event.agentId) {
      const owners = allowedToolOwners.get(event.toolName);
      if (owners && !owners.has(event.agentId)) {
        actions.add(`tool_outside_contract:${event.agentId}:${event.toolName}`);
      }
    }
    if (event.type === 'final_response' && event.agentId && !finalResponderIds.has(event.agentId)) {
      actions.add(`final_response_outside_contract:${event.agentId}`);
    }
  });

  return Array.from(actions).sort();
}

function summarizeEvent(event) {
  if (event.type === 'handoff' && event.agentId && event.toAgentId) {
    return `handoff:${event.agentId}->${event.toAgentId}`;
  }
  if (event.type === 'tool_call' && event.agentId && event.toolName) {
    return `tool:${event.agentId}:${event.toolName}`;
  }
  if (event.type === 'final_response' && event.agentId) {
    return `final:${event.agentId}`;
  }
  return '';
}

function inferMission(corpus, traces, agentProfiles) {
  const commonTools = countTerms(traces.flatMap((trace) => trace.events.filter((event) => event.type === 'tool_call').map((event) => event.toolName)));
  const leadingTool = commonTools[0]?.term ?? 'approved tools';
  const responderCount = agentProfiles.filter((agent) => agent.finalResponder).length;
  if (responderCount > 1) {
    return `Coordinate ${corpus.project} tasks through approved agent handoffs and ${leadingTool}.`;
  }
  return `Complete ${corpus.project} tasks through approved agent handoffs and ${leadingTool}.`;
}

function inferRole(profile) {
  if (profile.finalResponseCount > 0 && profile.toolCallCount === 0) return 'responder';
  if (profile.handoffsOut > 0 && profile.toolCallCount === 0 && profile.finalResponseCount === 0) return 'triage';
  if (profile.toolCallCount > 0 && profile.finalResponseCount > 0) return 'executor';
  if (profile.toolCallCount > 0) return 'specialist';
  if (profile.handoffsIn > 0) return 'worker';
  return 'agent';
}

function findAgentRole(agents, agentId) {
  return agents.find((agent) => agent.id === agentId)?.role ?? '';
}

function mostCommonKey(map) {
  let bestKey = '';
  let bestValue = -1;
  for (const [key, value] of map.entries()) {
    if (value > bestValue) {
      bestKey = key;
      bestValue = value;
    }
  }
  return bestKey;
}

function countTerms(values) {
  const counts = new Map();
  values
    .filter(Boolean)
    .forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Array.from(counts.entries())
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function countDistinct(values) {
  return new Set(values.filter(Boolean)).size;
}

function normalizeStringArray(input) {
  return Array.isArray(input) ? input.map((item) => stringOr(item, '')).filter(Boolean) : [];
}

function numberOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
}

function stringOr(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
