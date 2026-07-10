# Failure Profiles and Mutation Packs

Mutation packs are release-gate internals. Product surfaces should present their results as failure profiles, blockers, warnings, and replayable release evidence unless the reader is debugging the generation engine.

HarnessAmp currently maps failure profiles to deterministic wrapper mutations across:

- prompt integrity
- tool payloads
- permissions
- network sinks
- context and memory
- sandbox boundaries
- multimodal inputs

Each internal pack should preserve task intent while changing the wrapper conditions around execution.

## v2 Domain Packs

HarnessAmp v2 also includes contract-based domain packs:

- `financeguard-core` for personal-finance boundaries and numerical integrity.
- `healthguard-core` for healthcare triage, clinical-source fidelity, and clinician oversight.
- `retrievalguard-core` for retrieval agents, RAG systems, citation assistants, and stateful search agents.
- `customercareguard-core` for customer-support policy, refund authority, authentication, privacy, and escalation boundaries.
- `legalguard-core` for legal-information boundaries, jurisdiction discipline, deadline safety, contract source fidelity, and counsel escalation.

RetrievalGuard's static MVP suite lives in `examples/retrievalguard-basic/` and generated smoke/core/deep/nightly suites are available through the standard v2 generated runner.

```bash
node scripts/harnessamp.mjs run examples/retrievalguard-basic --pack retrievalguard-core --fail-on high
node scripts/harnessamp.mjs run --pack retrievalguard-core --generated smoke --fail-on high
```

RetrievalGuard curated scenarios use qrel fixtures and expected-claim fixtures to validate required documents, required citations, forbidden citations, source labels, required citation spans, bridge documents, and abstention behavior.

## Strengthened Pack Evaluation

The v2 packs now emit domain evaluation metrics in addition to contract pass/fail results.

- FinanceGuard scores contract pass rate, fixture compliance, tool discipline, numeric accuracy, stale-data discipline, advice-boundary compliance, privacy containment, fraud escalation, and action authorization.
- HealthGuard scores red-flag recall, clinical-boundary compliance, medication safety, privacy containment, source fidelity, and equity consistency.
- CustomerCareGuard scores policy fidelity, authority boundaries, authentication-before-action, privacy containment, escalation coverage, abuse containment, and ethical cancellation.
- LegalGuard scores jurisdiction discipline, legal-advice boundary, deadline safety, source fidelity, confidentiality protection, counsel escalation, and unlawful-evasion refusal.
- RetrievalGuard continues to score required-document recall, evidence precision, citation fidelity, provenance completeness, bridge completeness, abstention calibration, source-authority selection, contradiction handling, and tool-failure transparency.

Static entry scenarios for FinanceGuard, HealthGuard, CustomerCareGuard, and LegalGuard now include expected-behavior fixtures under each pack's `fixtures/expected/` directory. Generated suites include provenance samples that identify the template, mutation, profile, prompt variant, and context variant behind generated cases.

The static suites also include representative multi-turn pressure cases:

- FinanceGuard: repeated emotional pressure to cash out retirement savings.
- HealthGuard: repeated crisis cue with explicit resistance to human escalation.
- CustomerCareGuard: spouse/coworker social-engineering pressure for invoices and reset links.
- LegalGuard: repeated request for unlawful discovery evasion.

Failed v2 report entries can be converted into regression-suite candidates with `collectV2RegressionCorpus()` from `src/v2/regression-corpus.js`. Each candidate includes the scenario, mutation, violated contract, severity, evidence, domain metrics, failure signals, provenance, and a recommended release-blocking regression suite.
