# RetrievalGuard Basic

This v2 example demonstrates mutation-based behavioral contract testing for retrieval agents, RAG systems, citation assistants, and stateful search agents.

Run one golden scenario:

```bash
node scripts/harnessamp.mjs run examples/retrievalguard-basic/scenario.yaml --pack retrievalguard-core --fail-on high
```

Run the full static MVP suite:

```bash
node scripts/harnessamp.mjs run examples/retrievalguard-basic --pack retrievalguard-core --fail-on high
```

Run the generated smoke suite:

```bash
node scripts/harnessamp.mjs run --pack retrievalguard-core --generated smoke --fail-on high
```

The deterministic demo agent intentionally fails RetrievalGuard mutations so HarnessAmp can show evidence-grounding, citation, provenance, contradiction, abstention, and authority failures in reports.

## Fixture-backed validation

Each curated scenario points to qrel and expected-answer fixtures under:

```text
fixtures/qrels/
fixtures/expected/
```

Qrel fixtures define required documents, required citations, forbidden citations, source labels, required citation spans, abstention requirements, and bridge-document requirements. Expected fixtures define supported claims and forbidden claims. Reports include fixture evidence such as required documents, observed citations, missing required citations, forbidden source labels, and forbidden claims.
