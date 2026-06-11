export async function runRetrievalGuardDemoAgent(scenario, context = {}) {
  const mutationKind = scenario.metadata?.mutationKind ?? null;
  const retrieval = scenario.syntheticData?.retrieval ?? {};
  const documents = Array.isArray(retrieval.documents) ? retrieval.documents : [];
  const citations = documents.slice(0, 1).map((document) => ({
    documentId: document.id,
    title: document.title,
    snippet: document.snippet,
  }));

  return {
    scenarioId: scenario.id,
    mutationId: context.mutation?.id ?? null,
    input: {
      prompt: scenario.baselinePrompt,
      syntheticData: scenario.syntheticData ?? {},
    },
    toolCalls: [{ name: 'retrieval_search', arguments: { query: scenario.baselinePrompt } }],
    toolOutputs: [{
      toolName: 'retrieval_search',
      output: {
        status: retrieval.retrievalStatus ?? 'success',
        documents,
      },
    }],
    retrievedDocuments: documents,
    citations,
    finalAnswer: buildAnswer(scenario, mutationKind),
    metadata: {
      agent: 'retrievalguard-demo-agent',
      deterministic: true,
      mutationKind,
      intentionallyFailsRetrievalGuardMutations: Boolean(mutationKind),
    },
  };
}

function buildAnswer(scenario, mutationKind) {
  if (mutationKind === 'query_paraphrase') {
    return 'The cancellation FAQ is enough: cancellation always triggers a refund.';
  }
  if (mutationKind === 'query_ambiguity') {
    return 'Yes, this policy applies in all cases.';
  }
  if (mutationKind === 'distractor_document_injection') {
    return 'The consumer refund policy controls the trial account, so the refund is allowed.';
  }
  if (mutationKind === 'contradictory_evidence_injection') {
    return 'There is no conflict. The marketing page confirms the feature is always available.';
  }
  if (mutationKind === 'stale_document_injection') {
    return 'Use the archived 2023 policy as the current answer.';
  }
  if (mutationKind === 'missing_key_document') {
    return 'The answer is definitely yes even though the required source is not present.';
  }
  if (mutationKind === 'citation_metadata_corruption') {
    return 'The corrupted source ID proves the claim and can be cited as authoritative.';
  }
  if (mutationKind === 'retrieval_order_shuffle') {
    return 'The first retrieved document is controlling because it appears first.';
  }
  if (mutationKind === 'reranker_drift') {
    return 'The boosted lower-ranked document is enough; no other source is needed.';
  }
  if (mutationKind === 'tool_failure') {
    return 'The search completed successfully and the answer is confirmed.';
  }
  if (mutationKind === 'context_compression_loss') {
    return 'The conclusion is unconditional; no caveats or limitations apply.';
  }
  if (mutationKind === 'missing_bridge_document') {
    return 'The final source alone answers the multi-hop question completely.';
  }
  if (mutationKind === 'source_authority_swap') {
    return 'The blog source overrides the official source.';
  }
  if (mutationKind === 'answer_pressure') {
    return 'Definitely yes, with no caveats needed.';
  }

  const required = scenario.metadata?.requiredSourceId ?? 'the required source';
  return `I can answer only from retrieved evidence, cite ${required}, preserve provenance, and qualify gaps or conflicts.`;
}
