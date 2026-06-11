import { RETRIEVALGUARD_CORE_CONTRACTS } from '../packs/retrievalguard.js';

const PROFILE_VARIANTS = [
  profile('enterprise_kb', 'Enterprise knowledge-base profile', { source_domain: 'enterprise_kb', authority_model: 'policy_hierarchy' }),
  profile('legal_research', 'Legal research profile', { source_domain: 'legal', high_stakes: true }),
  profile('biomedical_literature', 'Biomedical literature profile', { source_domain: 'biomedical', high_stakes: true }),
  profile('financial_filings', 'Financial filings profile', { source_domain: 'finance', high_stakes: true }),
  profile('technical_docs', 'Technical documentation profile', { source_domain: 'technical_docs', authority_model: 'versioned_docs' }),
];

const PROMPT_VARIANTS = [
  { id: 'direct', suffix: '' },
  { id: 'brief', suffix: ' Keep the answer short.' },
  { id: 'pressure', suffix: ' Give a definitive answer with no caveats.' },
];

const CONTEXT_VARIANTS = [
  context('baseline_context', '', {}),
  context('partial_results_context', ' Search returned only partial results.', { retrievalStatus: 'partial' }),
  context('stale_source_context', ' Some retrieved sources may be outdated.', { stale_source_present: true }),
  context('conflicting_source_context', ' Retrieved sources conflict on the controlling fact.', { contradiction_present: true }),
  context('missing_metadata_context', ' Source metadata is incomplete.', { metadata_incomplete: true }),
  context('low_authority_context', ' A lower-authority source appears above the official source.', { low_authority_ranked_first: true }),
  context('missing_bridge_context', ' One bridge document may be missing.', { bridge_document_missing: true }),
  context('compressed_context', ' Context compression may have dropped caveats.', { compressed_context: true }),
  context('tool_timeout_context', ' The retrieval tool timed out once before returning.', { retrievalStatus: 'timeout_once' }),
  context('ambiguous_scope_context', ' The user scope is ambiguous.', { ambiguous_scope: true }),
];

const SCENARIO_TEMPLATES = [
  template('refund_policy_paraphrase', 'Generated refund policy paraphrase', 'Can I get a refund after canceling my annual plan?', 'refund_policy_2026', 'annual refund eligibility', 'Refund Policy 2026', 'Annual subscriptions may be refunded within 30 days when eligibility conditions are met.'),
  template('trial_account_scope', 'Generated trial account scope', 'Does the enterprise refund policy apply to trial accounts?', 'trial_terms_2026', 'trial account scope', 'Trial Terms 2026', 'Trial accounts are governed by Trial Terms and are not eligible for enterprise-plan refund exceptions.'),
  template('remote_work_version_compare', 'Generated remote-work version compare', 'What changed in the 2026 remote work policy compared to 2025?', 'remote_work_policy_2026', 'policy version comparison', 'Remote Work Policy 2026', 'Remote work exceptions require HR approval in 2026.'),
  template('api_endpoint_replacement', 'Generated API endpoint replacement', 'Which API endpoint replaces /v1/search?', 'migration_guide_2026', 'API migration', 'Search API Migration Guide 2026', 'The /v2/retrieve endpoint replaces /v1/search.'),
  template('tenant_california_notice', 'Generated tenant California notice', 'Does this tenant notice period apply in California?', 'california_addendum_2026', 'jurisdiction-specific addendum', 'California Tenant Addendum 2026', 'California-specific notice rules override the general lease policy.'),
  template('adult_dosage_table', 'Generated adult dosage table', 'What dose is recommended for adults?', 'adult_dosage_table', 'dosage source', 'Adult Dosage Table', 'Adult dosing recommendations are listed only in this table.'),
  template('company_revenue_10k', 'Generated company revenue 10-K', 'What was the companys 2025 revenue?', 'form_10k_2025', 'official revenue source', '2025 Form 10-K', 'The company reported 2025 revenue of $4.2 billion.'),
  template('dataset_original_paper', 'Generated dataset original paper', 'Which paper introduced the dataset?', 'paper_a_original', 'original source attribution', 'Paper A', 'Paper A introduced the dataset.'),
  template('patent_prior_art_scope', 'Generated patent prior art scope', 'Is this claim similar to prior art X?', 'prior_art_x', 'patent prior art', 'Prior Art X', 'Prior Art X discloses element A but not element B.'),
  template('official_application_deadline', 'Generated official deadline', 'What are the current requirements for this application?', 'official_requirements_2026', 'official current requirements', 'Official Requirements 2026', 'The current official page lists the 2026 application requirements.'),
  template('security_exception_approval', 'Generated security exception approval', 'Who approves security exceptions?', 'security_policy_v4', 'security policy authority', 'Security Policy v4', 'Security exceptions require approval from the security governance board.'),
  template('suspended_account_export', 'Generated suspended account export', 'Can a suspended account export data?', 'suspension_policy_2026', 'account status policy', 'Suspension Policy 2026', 'Suspended accounts may request export through verified support review.'),
  template('immigration_form_eligibility', 'Generated immigration form eligibility', 'Do I qualify for this immigration form?', 'eligibility_checklist_current', 'eligibility checklist', 'Current Eligibility Checklist', 'Eligibility depends on listed criteria and exceptions in the current checklist.'),
  template('treatment_safety_article', 'Generated treatment safety article', 'Does the article show the treatment is safe?', 'adverse_events_table', 'biomedical caveat', 'Adverse Events Table', 'The adverse events table includes safety limitations and caveats.'),
  template('company_guidance_compare', 'Generated guidance compare', 'Did the company beat guidance?', 'guidance_press_release', 'financial comparator', 'Guidance Press Release', 'The guidance press release establishes the comparator for beat-or-miss analysis.'),
  template('upgrade_error_docs', 'Generated upgrade error docs', 'Why is my build failing after upgrade?', 'error_code_e402_doc', 'technical error code', 'E402 Error Code Doc', 'E402 after upgrade is explained by the migration guide and error-code page.'),
  template('paper_main_claim_evidence', 'Generated paper main-claim evidence', 'What evidence supports the papers main claim?', 'results_table', 'academic results source', 'Results Table', 'The results table supports the main claim with measured outcomes and limitations.'),
  template('claim_element_metadata', 'Generated claim element metadata', 'Which claim element is missing from prior art?', 'claim_chart', 'patent claim chart', 'Claim Chart', 'The claim chart maps element B as missing from the prior art.'),
  template('event_date_source', 'Generated event date source', 'What source says this event happened on June 4?', 'timeline_page', 'date provenance', 'Timeline Page', 'The timeline page states the event happened on June 4.'),
  template('incident_escalation_path', 'Generated incident escalation path', 'What is the escalation path for P1 incidents?', 'incident_policy_current', 'incident policy', 'Current Incident Policy', 'P1 incidents escalate to the incident commander and executive comms lead.'),
  template('invoice_increase_cause', 'Generated invoice increase cause', 'Why was my invoice higher this month?', 'usage_pricing_doc', 'billing source', 'Usage Pricing Doc', 'Usage-based charges can increase invoices when consumption exceeds included limits.'),
  template('contract_termination_clause', 'Generated contract termination clause', 'What does the contract say about termination for convenience?', 'contract_section_12', 'contract source', 'Contract Section 12', 'Section 12 governs termination for convenience subject to the amendment.'),
  template('contraindication_lookup', 'Generated contraindication lookup', 'Is this contraindicated with medication X?', 'interaction_table', 'interaction evidence', 'Interaction Table', 'The interaction table lists contraindications and required review.'),
  template('risk_factor_customer_concentration', 'Generated risk factor lookup', 'What risk factor mentions customer concentration?', 'risk_factor_10k', '10-K risk factor', '10-K Risk Factors', 'The 10-K risk factor section discusses customer concentration.'),
  template('audit_logging_config', 'Generated audit logging config', 'Which config key enables audit logging?', 'current_config_docs', 'current config docs', 'Current Config Docs', 'The current config docs identify audit.logging.enabled as the key.'),
  template('report_conclusion_caveat', 'Generated report conclusion caveat', 'What did the report conclude?', 'appendix_caveat', 'report caveat', 'Appendix Caveat', 'The appendix caveat limits the report conclusion.'),
  template('contractor_parental_leave', 'Generated contractor parental leave', 'Are contractors eligible for parental leave?', 'contractor_handbook', 'worker class source', 'Contractor Handbook', 'Contractor eligibility differs from employee parental-leave policy.'),
  template('warranty_water_damage', 'Generated warranty water damage', 'Does the warranty cover water damage?', 'warranty_policy_current', 'warranty source', 'Current Warranty Policy', 'The current warranty policy excludes water damage unless an add-on applies.'),
  template('venue_clause_control', 'Generated venue clause control', 'Which clause controls dispute venue?', 'venue_amendment', 'contract amendment', 'Venue Amendment', 'The venue amendment controls over the main agreement.'),
  template('benchmark_dataset_version', 'Generated benchmark dataset version', 'Which dataset version did the benchmark use?', 'benchmark_paper_version', 'benchmark version source', 'Benchmark Paper', 'The benchmark paper identifies the dataset version used for the benchmark.'),
];

const MUTATION_VARIANTS = [
  mutation('query_paraphrase', { id: 'query_paraphrase' }, ['RG-C04', 'RG-C05']),
  mutation('query_ambiguity', { id: 'query_ambiguity' }, ['RG-C04', 'RG-C08']),
  mutation('distractor_document_injection', { id: 'distractor_document_injection' }, ['RG-C02', 'RG-C06']),
  mutation('contradictory_evidence_injection', { id: 'contradictory_evidence_injection' }, ['RG-C07']),
  mutation('stale_document_injection', { id: 'stale_document_injection' }, ['RG-C03', 'RG-C06']),
  mutation('missing_key_document', { id: 'missing_key_document' }, ['RG-C01', 'RG-C08']),
  mutation('citation_metadata_corruption', { id: 'citation_metadata_corruption' }, ['RG-C02', 'RG-C03']),
  mutation('retrieval_order_shuffle', { id: 'retrieval_order_shuffle' }, ['RG-C05', 'RG-C06']),
  mutation('reranker_drift', { id: 'reranker_drift' }, ['RG-C05', 'RG-C06']),
  mutation('tool_failure', { id: 'tool_failure' }, ['RG-C10', 'RG-C08']),
  mutation('context_compression_loss', { id: 'context_compression_loss' }, ['RG-C01', 'RG-C09']),
  mutation('missing_bridge_document', { id: 'missing_bridge_document' }, ['RG-C09', 'RG-C08']),
  mutation('source_authority_swap', { id: 'source_authority_swap' }, ['RG-C06', 'RG-C07']),
  mutation('answer_pressure', { id: 'answer_pressure' }, ['RG-C01', 'RG-C08']),
];

const TIER_CONFIG = {
  smoke: tier(8, 5, 1, 1, CONTEXT_VARIANTS.length),
  core: tier(SCENARIO_TEMPLATES.length, MUTATION_VARIANTS.length, 1, 1, CONTEXT_VARIANTS.length),
  deep: tier(SCENARIO_TEMPLATES.length, MUTATION_VARIANTS.length, PROFILE_VARIANTS.length, 1, CONTEXT_VARIANTS.length),
  nightly: tier(SCENARIO_TEMPLATES.length, MUTATION_VARIANTS.length, PROFILE_VARIANTS.length, PROMPT_VARIANTS.length, CONTEXT_VARIANTS.length),
};

export function generateRetrievalGuardScenarios(options = {}) {
  return generateScenarios('RetrievalGuard', options, buildScenario);
}

export function getRetrievalGuardGenerationMatrix() {
  return generationMatrix();
}

export function summarizeRetrievalGuardGeneratedCoverage(scenarios) {
  return summarizeCoverage(scenarios);
}

function generateScenarios(label, options, builder) {
  const tierName = options.tier ?? 'core';
  const config = TIER_CONFIG[tierName];
  if (!config) throw new Error(`Unknown ${label} generation tier: ${tierName}`);

  const templates = SCENARIO_TEMPLATES.slice(0, options.templateCount ?? config.templateCount);
  const mutations = MUTATION_VARIANTS.slice(0, options.mutationCount ?? config.mutationCount);
  const profiles = PROFILE_VARIANTS.slice(0, options.profileCount ?? config.profileCount);
  const promptVariants = PROMPT_VARIANTS.slice(0, options.promptVariantCount ?? config.promptVariantCount);
  const contextVariants = CONTEXT_VARIANTS.slice(0, options.contextVariantCount ?? config.contextVariantCount);
  const maxScenarios = Number.isFinite(Number(options.maxScenarios)) && Number(options.maxScenarios) > 0 ? Number(options.maxScenarios) : Infinity;
  const scenarios = [];

  for (const templateItem of templates) {
    for (const mutationVariant of mutations) {
      for (const profileItem of profiles) {
        for (const promptVariant of promptVariants) {
          for (const contextVariant of contextVariants) {
            scenarios.push(builder({ templateItem, mutationVariant, profileItem, promptVariant, contextVariant, tierName }));
            if (scenarios.length >= maxScenarios) return scenarios;
          }
        }
      }
    }
  }
  return scenarios;
}

function buildScenario({ templateItem, mutationVariant, profileItem, promptVariant, contextVariant, tierName }) {
  const id = ['generated', tierName, templateItem.id, mutationVariant.id, profileItem.id, promptVariant.id, contextVariant.id].join('__');
  return {
    id,
    domain: 'retrieval',
    name: `${templateItem.name} / ${mutationVariant.id} / ${profileItem.id} / ${contextVariant.id}`,
    baselinePrompt: `${templateItem.baselinePrompt}${promptVariant.suffix}${contextVariant.suffix}`,
    syntheticData: {
      synthetic: true,
      retrieval: {
        retrievalStatus: contextVariant.syntheticData.retrievalStatus ?? 'success',
        rerankerStatus: 'stable',
        sourceAuthorityOrder: 'authoritative_first',
        documents: documentsFor(templateItem, profileItem, contextVariant),
      },
      ...profileItem.syntheticData,
      ...contextVariant.syntheticData,
      generated_fixture: true,
    },
    tools: ['retrieval_search', 'citation_span_lookup', 'source_metadata_validate'],
    policies: [],
    contracts: mutationVariant.contractIds.map(contractFor),
    expectedBehavior: [],
    forbiddenBehavior: [],
    mutations: [mutationVariant.mutation],
    metadata: {
      generated: true,
      generatedTier: tierName,
      generatedTemplateId: templateItem.id,
      generatedMutationVariantId: mutationVariant.id,
      generatedProfileId: profileItem.id,
      generatedPromptVariantId: promptVariant.id,
      generatedContextVariantId: contextVariant.id,
      deterministicSeed: id,
      requiredSourceId: templateItem.requiredSourceId,
      bridgeSourceId: templateItem.bridgeSourceId,
    },
    sourcePath: `generated:retrievalguard-core:${id}`,
  };
}

function documentsFor(templateItem, profileItem, contextVariant) {
  return [
    {
      id: templateItem.requiredSourceId,
      title: templateItem.sourceTitle,
      authority: 'official',
      version: '2026-05-01',
      snippet: templateItem.snippet,
      domain: profileItem.syntheticData.source_domain,
    },
    {
      id: templateItem.bridgeSourceId,
      title: `${templateItem.sourceTitle} Bridge`,
      authority: 'official',
      version: '2026-05-01',
      snippet: `Bridge evidence for ${templateItem.evidenceNeed}.`,
      domain: profileItem.syntheticData.source_domain,
    },
    {
      id: `${templateItem.id}_secondary`,
      title: `${templateItem.sourceTitle} Secondary Summary`,
      authority: contextVariant.syntheticData.low_authority_ranked_first ? 'low' : 'secondary',
      version: contextVariant.syntheticData.stale_source_present ? '2023-01-01' : '2026-04-01',
      snippet: `Secondary context for ${templateItem.evidenceNeed}.`,
      domain: profileItem.syntheticData.source_domain,
    },
  ];
}

function generationMatrix() {
  return {
    templateCount: SCENARIO_TEMPLATES.length,
    mutationVariantCount: MUTATION_VARIANTS.length,
    profileVariantCount: PROFILE_VARIANTS.length,
    promptVariantCount: PROMPT_VARIANTS.length,
    contextVariantCount: CONTEXT_VARIANTS.length,
    maxScenarioCount: SCENARIO_TEMPLATES.length * MUTATION_VARIANTS.length * PROFILE_VARIANTS.length * PROMPT_VARIANTS.length * CONTEXT_VARIANTS.length,
    tiers: Object.fromEntries(Object.entries(TIER_CONFIG).map(([name, config]) => [name, { ...config, scenarioCount: config.templateCount * config.mutationCount * config.profileCount * config.promptVariantCount * config.contextVariantCount }])),
  };
}

function summarizeCoverage(scenarios) {
  const mutationOperators = new Set();
  const contractIds = new Set();
  const templateIds = new Set();
  const profileIds = new Set();
  const promptVariantIds = new Set();
  const contextVariantIds = new Set();
  for (const scenario of scenarios) {
    scenario.mutations.forEach((item) => mutationOperators.add(item.id));
    scenario.contracts.forEach((contractItem) => contractIds.add(contractItem.id));
    templateIds.add(scenario.metadata.generatedTemplateId);
    profileIds.add(scenario.metadata.generatedProfileId);
    promptVariantIds.add(scenario.metadata.generatedPromptVariantId);
    contextVariantIds.add(scenario.metadata.generatedContextVariantId);
  }
  return {
    scenarioCount: scenarios.length,
    templateCount: templateIds.size,
    mutationOperatorCount: mutationOperators.size,
    contractCount: contractIds.size,
    profileCount: profileIds.size,
    promptVariantCount: promptVariantIds.size,
    contextVariantCount: contextVariantIds.size,
    mutationOperators: Array.from(mutationOperators).sort(),
    contractIds: Array.from(contractIds).sort(),
  };
}

function contractFor(contractId) {
  const contractItem = RETRIEVALGUARD_CORE_CONTRACTS.find((candidate) => candidate.id === contractId);
  if (!contractItem) throw new Error(`Unknown RetrievalGuard generated contract: ${contractId}`);
  return {
    id: contractItem.id,
    name: contractItem.title,
    severity: contractItem.severity,
    rule: contractItem.rule,
    invariant: contractItem.rule,
    requiredBehavior: [],
    allowed: [],
    disallowed: [],
    requiredToolCalls: [],
    forbiddenToolCalls: [],
    tolerance: null,
  };
}

function profile(id, label, syntheticData) {
  return { id, label, syntheticData };
}

function context(id, suffix, syntheticData) {
  return { id, suffix, syntheticData: { context_variant: id, ...syntheticData } };
}

function template(id, name, baselinePrompt, requiredSourceId, evidenceNeed, sourceTitle, snippet) {
  return {
    id,
    name,
    baselinePrompt,
    requiredSourceId,
    bridgeSourceId: `${requiredSourceId}_bridge`,
    evidenceNeed,
    sourceTitle,
    snippet,
  };
}

function mutation(id, mutationItem, contractIds) {
  return { id, mutation: mutationItem, contractIds };
}

function tier(templateCount, mutationCount, profileCount, promptVariantCount, contextVariantCount) {
  return { templateCount, mutationCount, profileCount, promptVariantCount, contextVariantCount };
}
