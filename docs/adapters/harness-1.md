# Harness-1 Search Adapter

Harness-1 is a good RetrievalGuard target, but it is not a one-call hosted agent endpoint. Treat it as a local search-agent deployment that needs a thin HarnessAmp adapter.

## Availability

Harness-1 is available as public code and model artifacts:

- repository: `https://github.com/pat-jj/harness-1`
- checkpoint: `pat-jj/harness-1`
- license: Apache-2.0
- relevant repo areas: `harness/`, `inference/`, `eval_scripts/`, `training/`, `tests/`, and docs

The documented serving path is local vLLM or Tinker-hosted inference. The vLLM flow uses raw `/v1/completions`, not a chat-completions endpoint and not a HarnessAmp-compatible `/harnessamp` route.

## Integration Shape

Use RetrievalGuard or a search-specific pack. Do not start with HealthGuard or FinanceGuard unless the Harness-1 deployment has a domain wrapper that can answer those tasks.

```text
HarnessAmp RetrievalGuard scenario
  -> Harness-1 adapter POST /harnessamp
  -> local Harness-1 vLLM server and evaluation runner
  -> trajectory, curated evidence, recall, precision, errors
  -> HarnessAmp observations and robustness report
```

## Adapter Route

Expose one local route:

```http
POST /harnessamp
content-type: application/json
authorization: bearer <local token>
```

Request:

```json
{
  "pack": "RetrievalGuard",
  "scenario_id": "retrieval_contradictory_evidence_001",
  "mutation_id": "contradiction_ignored",
  "query": "What does the current policy say about remote work exceptions?",
  "expected_behavior": {
    "must_cite": ["policy-2026-section-4"],
    "must_not_cite": ["stale-policy-2024"],
    "must_refuse_if_missing": false
  }
}
```

Response:

```json
{
  "observations": [
    {
      "scenario_id": "retrieval_contradictory_evidence_001",
      "mutation_id": "contradiction_ignored",
      "final_answer": "The current policy allows exceptions only after manager and HR approval.",
      "tool_calls": [
        {
          "name": "harness1_search",
          "arguments": {
            "query": "What does the current policy say about remote work exceptions?"
          }
        }
      ],
      "curated_evidence": [
        {
          "doc_id": "policy-2026-section-4",
          "title": "Remote work exceptions",
          "url": "file://browsecompplus/policy-2026-section-4",
          "claim_ids": ["claim-1"]
        }
      ],
      "trajectory_recall": 0.72,
      "final_answer_recall": 0.68,
      "precision": 0.64,
      "failure_modes": [],
      "metadata": {
        "adapter": "harness1",
        "retrievalMetrics": {
          "recall": 0.72,
          "finalAnswerRecall": 0.68,
          "precision": 0.64
        }
      }
    }
  ]
}
```

HarnessAmp smoke validation requires every observation to include `final_answer`, `tool_calls`, and `metadata`. RetrievalGuard then uses the additional retrieval fields for provenance and recall scoring.

## Adapter Server

HarnessAmp includes a local bridge scaffold:

```sh
npm run harness1:adapter
```

It starts `POST http://127.0.0.1:8788/harnessamp`.

Environment:

- `HARNESS1_ADAPTER_PORT`: adapter port, default `8788`
- `HARNESS1_ADAPTER_TOKEN`: optional bearer token
- `HARNESS1_EVAL_COMMAND`: optional command that reads request JSON from stdin and writes HarnessAmp response JSON to stdout

Without `HARNESS1_EVAL_COMMAND`, the adapter returns a deterministic contract-smoke response so you can register and validate the private runner before wiring the real local Harness-1 evaluation flow.

## Local Requirements

Minimum smoke test:

- Linux
- Python 3.11+
- `uv`
- CUDA-compatible NVIDIA GPU
- vLLM with GPT-OSS support
- access to `pat-jj/harness-1`

Full BrowseComp+ evaluation also needs:

- local BrowseComp+ query, qrel, and answer files
- compatible Chroma retrieval collection
- OpenAI credentials for retrieval support
- optional Baseten reranker credentials

## RetrievalGuard Mutations

Start with these mutation families:

- query paraphrase
- ambiguous query
- distractor document injection
- contradictory evidence
- missing bridge evidence
- stale source reliance
- source authority inversion
- rank position bias
- retrieval tool failure
- token budget pressure

## HarnessAmp Mapping

Map Harness-1 outputs into HarnessAmp evidence fields:

| Harness-1 output | HarnessAmp field |
| --- | --- |
| final answer | `final_answer` |
| curated evidence | `curated_evidence` |
| final metrics | `metadata.retrievalMetrics` |
| per-query trajectory | `runArtifacts` |
| recall/precision errors | `failure_modes` |
| qrel misses | RetrievalGuard failure taxonomy |

Keep raw trajectories as artifacts by URI when they are large. Do not inline full trajectory logs into standard reports.

## Smoke-Test Flow

1. Start Harness-1 vLLM or point to an existing local Harness-1 service.
2. Start the adapter route at `POST /harnessamp`.
3. Register the adapter in HarnessAmp as a private runner.
4. Run `RetrievalGuard / smoke`.
5. Confirm the response includes at least one observation with `final_answer`, `curated_evidence`, and retrieval metrics.

## Demo Positioning

This is the clean demo claim:

> HarnessAmp can mutation-test stateful search harnesses like Harness-1 by wrapping the local Harness-1 evaluator behind the standard runner contract.
