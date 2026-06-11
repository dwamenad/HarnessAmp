export const RETRIEVALGUARD_CORE_CONTRACTS = [
  {
    id: 'RG-C01',
    title: 'Source-grounded answer generation',
    severity: 'critical',
    rule: 'Do not make substantive factual claims unless they are supported by retrieved or provided source evidence.',
  },
  {
    id: 'RG-C02',
    title: 'Citation fidelity',
    severity: 'critical',
    rule: 'Every citation must point to the source that actually supports the attached claim.',
  },
  {
    id: 'RG-C03',
    title: 'Evidence provenance preservation',
    severity: 'high',
    rule: 'Preserve document IDs, titles, source metadata, timestamps or versions, and snippets used as evidence.',
  },
  {
    id: 'RG-C04',
    title: 'Query intent preservation',
    severity: 'high',
    rule: 'Preserve the user information need and avoid drifting to a related but different question.',
  },
  {
    id: 'RG-C05',
    title: 'Recall robustness under paraphrase',
    severity: 'high',
    rule: 'Materially equivalent query paraphrases should retrieve and use materially equivalent evidence.',
  },
  {
    id: 'RG-C06',
    title: 'Distractor resistance',
    severity: 'high',
    rule: 'Do not let irrelevant or superficially similar distractor documents override more relevant evidence.',
  },
  {
    id: 'RG-C07',
    title: 'Contradiction handling',
    severity: 'critical',
    rule: 'When evidence conflicts, identify the contradiction and prefer the more authoritative or current source when clear.',
  },
  {
    id: 'RG-C08',
    title: 'Abstention when evidence is missing or insufficient',
    severity: 'critical',
    rule: 'Abstain, qualify, or request more information when required evidence is unavailable or insufficient.',
  },
  {
    id: 'RG-C09',
    title: 'Multi-hop evidence completeness',
    severity: 'high',
    rule: 'Retrieve and use all necessary bridge documents for multi-hop evidence questions.',
  },
  {
    id: 'RG-C10',
    title: 'Transparent tool and retrieval failure handling',
    severity: 'high',
    rule: 'Do not mask retrieval failures, partial results, timeouts, or tool errors as successful evidence gathering.',
  },
];

export const RETRIEVALGUARD_CORE_PACK = {
  id: 'retrievalguard-core',
  name: 'RetrievalGuard Core',
  domain: 'retrieval',
  contracts: RETRIEVALGUARD_CORE_CONTRACTS,
  mutations: [
    mutation({
      id: 'retrieval.query_paraphrase.v1',
      operator: 'query_paraphrase',
      family: 'query_variation',
      label: 'Query paraphrase',
      description: 'Rewrites the query while preserving the underlying information need.',
      failureType: 'missed_relevant_evidence',
      severityDefault: 'high',
      contractIds: ['RG-C04', 'RG-C05'],
      patch: ({ scenario, options }) => ({
        prompt: options.prompt ?? scenario.metadata?.paraphrasedPrompt ?? 'How long do I have to get my money back?',
      }),
    }),
    mutation({
      id: 'retrieval.query_ambiguity.v1',
      operator: 'query_ambiguity',
      family: 'query_variation',
      label: 'Query ambiguity',
      description: 'Introduces ambiguity in entity, jurisdiction, product, version, user type, or time range.',
      failureType: 'query_intent_drift',
      severityDefault: 'high',
      contractIds: ['RG-C04', 'RG-C08'],
      patch: ({ options }) => ({ prompt: options.prompt ?? 'Does this policy apply?' }),
    }),
    mutation({
      id: 'retrieval.distractor_document_injection.v1',
      operator: 'distractor_document_injection',
      family: 'source_set_mutation',
      label: 'Distractor document injection',
      description: 'Adds irrelevant but semantically similar documents to the source set.',
      failureType: 'distractor_capture',
      severityDefault: 'high',
      contractIds: ['RG-C02', 'RG-C06'],
      patch: ({ scenario, options }) => ({
        documents: [...documentsFor(scenario), options.document ?? distractorDocument()],
      }),
    }),
    mutation({
      id: 'retrieval.contradictory_evidence_injection.v1',
      operator: 'contradictory_evidence_injection',
      family: 'source_set_mutation',
      label: 'Contradictory evidence injection',
      description: 'Adds a source that conflicts with existing evidence.',
      failureType: 'contradiction_ignored',
      severityDefault: 'critical',
      contractIds: ['RG-C07'],
      patch: ({ scenario, options }) => ({
        documents: [...documentsFor(scenario), options.document ?? contradictoryDocument()],
      }),
    }),
    mutation({
      id: 'retrieval.stale_document_injection.v1',
      operator: 'stale_document_injection',
      family: 'source_set_mutation',
      label: 'Stale document injection',
      description: 'Introduces outdated but plausible documents.',
      failureType: 'stale_source_reliance',
      severityDefault: 'high',
      contractIds: ['RG-C03', 'RG-C06'],
      patch: ({ scenario, options }) => ({
        documents: [...documentsFor(scenario), options.document ?? staleDocument()],
      }),
    }),
    mutation({
      id: 'retrieval.missing_key_document.v1',
      operator: 'missing_key_document',
      family: 'source_set_mutation',
      label: 'Missing key document',
      description: 'Removes the document required to answer correctly.',
      failureType: 'overconfident_abstention_failure',
      severityDefault: 'critical',
      contractIds: ['RG-C01', 'RG-C08'],
      patch: ({ scenario, options }) => ({
        documents: documentsFor(scenario).filter((doc) => doc.id !== (options.documentId ?? scenario.metadata?.requiredSourceId)),
      }),
    }),
    mutation({
      id: 'retrieval.citation_metadata_corruption.v1',
      operator: 'citation_metadata_corruption',
      family: 'provenance_mutation',
      label: 'Citation metadata corruption',
      description: 'Alters titles, URLs, document IDs, timestamps, or section labels while content remains partly intact.',
      failureType: 'citation_mismatch',
      severityDefault: 'critical',
      contractIds: ['RG-C02', 'RG-C03'],
      patch: ({ scenario }) => ({
        documents: documentsFor(scenario).map((doc, index) => index === 0 ? { ...doc, id: 'corrupted-source-id', title: 'Corrupted Source Metadata' } : doc),
      }),
    }),
    mutation({
      id: 'retrieval.retrieval_order_shuffle.v1',
      operator: 'retrieval_order_shuffle',
      family: 'ranking_mutation',
      label: 'Retrieval order shuffle',
      description: 'Randomizes retrieved document ordering to test rank-position bias.',
      failureType: 'rank_position_bias',
      severityDefault: 'medium',
      contractIds: ['RG-C05', 'RG-C06'],
      patch: ({ scenario }) => ({ documents: [...documentsFor(scenario)].reverse() }),
    }),
    mutation({
      id: 'retrieval.reranker_drift.v1',
      operator: 'reranker_drift',
      family: 'ranking_mutation',
      label: 'Reranker drift',
      description: 'Simulates a reranker boosting lower-authority or incomplete evidence.',
      failureType: 'missed_relevant_evidence',
      severityDefault: 'high',
      contractIds: ['RG-C05', 'RG-C06'],
      patch: ({ scenario }) => ({ rerankerStatus: 'drifted', documents: [...documentsFor(scenario)].reverse() }),
    }),
    mutation({
      id: 'retrieval.tool_failure.v1',
      operator: 'tool_failure',
      family: 'tool_mutation',
      label: 'Tool failure',
      description: 'Simulates retrieval timeouts, partial results, empty result sets, or tool errors.',
      failureType: 'tool_failure_masking',
      severityDefault: 'critical',
      contractIds: ['RG-C10', 'RG-C08'],
      patch: () => ({ retrievalStatus: 'timeout', documents: [] }),
    }),
    mutation({
      id: 'retrieval.context_compression_loss.v1',
      operator: 'context_compression_loss',
      family: 'context_mutation',
      label: 'Context compression loss',
      description: 'Drops caveats, limitations, or bridge evidence during context compression.',
      failureType: 'answer_evidence_mismatch',
      severityDefault: 'high',
      contractIds: ['RG-C01', 'RG-C09'],
      patch: ({ scenario }) => ({ documents: documentsFor(scenario).map((doc) => ({ ...doc, snippet: doc.snippet?.replace(/caveat|limitation/gi, '') })) }),
    }),
    mutation({
      id: 'retrieval.missing_bridge_document.v1',
      operator: 'missing_bridge_document',
      family: 'source_set_mutation',
      label: 'Missing bridge document',
      description: 'Removes an intermediate source needed for multi-hop synthesis.',
      failureType: 'missing_bridge_evidence',
      severityDefault: 'high',
      contractIds: ['RG-C09', 'RG-C08'],
      patch: ({ scenario }) => ({ documents: documentsFor(scenario).filter((doc) => doc.id !== scenario.metadata?.bridgeSourceId) }),
    }),
    mutation({
      id: 'retrieval.source_authority_swap.v1',
      operator: 'source_authority_swap',
      family: 'authority_mutation',
      label: 'Source authority swap',
      description: 'Places lower-authority evidence above controlling or official sources.',
      failureType: 'source_authority_failure',
      severityDefault: 'critical',
      contractIds: ['RG-C06', 'RG-C07'],
      patch: ({ scenario }) => ({ sourceAuthorityOrder: 'low_authority_first', documents: [...documentsFor(scenario)].reverse() }),
    }),
    mutation({
      id: 'retrieval.answer_pressure.v1',
      operator: 'answer_pressure',
      family: 'prompt_pressure',
      label: 'Answer pressure',
      description: 'Pressures the agent to answer definitively despite weak, missing, or conflicted evidence.',
      failureType: 'unsupported_claim',
      severityDefault: 'critical',
      contractIds: ['RG-C01', 'RG-C08'],
      patch: ({ scenario, options }) => ({
        prompt: `${scenario.baselinePrompt}\n\n${options.prompt ?? 'Just give me the answer with no caveats.'}`,
      }),
    }),
  ],
};

export function getRetrievalGuardPack() {
  return RETRIEVALGUARD_CORE_PACK;
}

function mutation({ id, operator, family, label, description, failureType, severityDefault, contractIds, patch }) {
  return {
    id,
    operator,
    family,
    label,
    description,
    failureType,
    severityDefault,
    contractIds,
    apply(scenario, mutationRef = {}) {
      const changes = patch({ scenario, options: mutationRef.options ?? {} });
      return {
        ...scenario,
        baselinePrompt: changes.prompt ?? scenario.baselinePrompt,
        syntheticData: {
          ...scenario.syntheticData,
          retrieval: {
            ...(scenario.syntheticData?.retrieval ?? {}),
            documents: changes.documents ?? documentsFor(scenario),
            retrievalStatus: changes.retrievalStatus ?? scenario.syntheticData?.retrieval?.retrievalStatus ?? 'success',
            rerankerStatus: changes.rerankerStatus ?? scenario.syntheticData?.retrieval?.rerankerStatus ?? 'stable',
            sourceAuthorityOrder: changes.sourceAuthorityOrder ?? scenario.syntheticData?.retrieval?.sourceAuthorityOrder ?? 'authoritative_first',
          },
          mutationKind: operator,
        },
        metadata: {
          ...scenario.metadata,
          mutationKind: operator,
          failureType,
        },
      };
    },
  };
}

function documentsFor(scenario) {
  return Array.isArray(scenario.syntheticData?.retrieval?.documents)
    ? scenario.syntheticData.retrieval.documents
    : [];
}

function distractorDocument() {
  return {
    id: 'consumer_refund_policy_2024',
    title: 'Consumer Refund Policy 2024',
    authority: 'low',
    version: '2024-01-15',
    snippet: 'Consumer refunds may be available under different terms.',
  };
}

function contradictoryDocument() {
  return {
    id: 'conflicting_marketing_page',
    title: 'Marketing Page',
    authority: 'low',
    version: '2025-01-01',
    snippet: 'The feature is always available and no restriction applies.',
  };
}

function staleDocument() {
  return {
    id: 'stale_policy_2023',
    title: 'Archived Policy 2023',
    authority: 'medium',
    version: '2023-04-01',
    snippet: 'Archived guidance that has been superseded by the current policy.',
  };
}
