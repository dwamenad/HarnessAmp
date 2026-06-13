# HarnessAmp Current State

Last updated: June 13, 2026

## Snapshot

HarnessAmp is on branch `codex/harnessamp-v2-contracts`.

Latest commit:

```text
5f657f5 Add Harness-1 RetrievalGuard reporting flow
```

GitHub push status:

- Branch pushed to `origin/codex/harnessamp-v2-contracts`
- Working tree was clean immediately after the push

Local services currently running:

- Web app: `http://127.0.0.1:4173`
- Harness-1 adapter: `http://127.0.0.1:8788/harnessamp`

## Product Surface

HarnessAmp currently has three major surfaces:

- Public product site and docs
- SaaS-style operator console at `/dashboard`
- CLI/API reliability engine for mutation packs, runner jobs, reports, failure evidence, and release gates

The console routes in active use include:

- `/dashboard`
- `/harnesses`
- `/harnesses/new`
- `/packs`
- `/packs/retrievalguard`
- `/contracts`
- `/runs/new`
- `/runs/:id`
- `/runs/:id/summary`
- `/failures`
- `/failures/:id`
- `/compare`
- `/reports`
- `/ci`
- `/usage`
- `/team`

## Latest Completed Work

The latest pushed work adds a full local Harness-1 to RetrievalGuard reporting flow.

Implemented:

- Harness-1 adapter example under `examples/harness1-adapter/`
- Adapter docs at `docs/adapters/harness-1.md`
- `npm run harness1:adapter`
- RetrievalGuard smoke payload support for local Harness-1 testing
- RAG/retrieval harness domain options in the UI
- Report export module at `src/console/report-export.js`
- Report evidence labels:
  - `runner observation`
  - `contract-smoke preview`
  - `seeded sample`
- Adapter mode display such as `runner observation / contract-smoke`
- `Print HTML`, JSON, CSV, and Markdown report exports
- Local run report rows that use actual browser run state before seeded sample reports
- Dashboard metrics that can reflect the latest completed local run
- A local persisted run/report state layer for harnesses, runs, observations, failures, reports, and export artifacts
- Explicit seeded sample isolation so demo reports appear after real reports and stay labeled `seeded sample`
- Public `/` now funnels into `/dashboard` as the main product entry, keeps `/app` as a sample diagnosis sandbox, and avoids duplicate product/app explanation sections
- `/dashboard` now stays operational by removing the inert route-state explainer panels
- `.Rhistory` and `outputs/` ignored as local artifacts

## RetrievalGuard And Harness-1 Flow

To run the local adapter:

```bash
npm run harness1:adapter
```

Register this endpoint in HarnessAmp:

```text
http://127.0.0.1:8788/harnessamp
```

Recommended new harness values:

- Harness name: `harness-1`
- Project: `New Demo_UCLA`
- Domain: `knowledge / RAG`
- Agent version: `pat-jj/harness-1 local`
- Endpoint URL: `http://127.0.0.1:8788/harnessamp`
- Auth type: `none`
- Environment: `local`

Then start a run:

- Harness: `harness-1 / local`
- Mutation Pack: `RetrievalGuard`
- Tier: `Smoke`

Expected report behavior:

- The latest report appears first in `/reports`
- Evidence column should show `runner observation / contract-smoke`
- Release decision should block when critical failures are present
- Exports should include Print HTML, JSON, CSV, and Markdown
- RetrievalGuard reports should include source fidelity, failure evidence, remediation, regression plan, and audit trail sections

## Report Expectations

When a run fails, the robust report should show:

- Release decision and gate result
- Score, critical count, observation count, and environment
- Evidence mode and adapter mode
- Failed contracts and mutation IDs
- Scenario-level failure evidence
- Retrieved/cited source evidence for RetrievalGuard
- Citation precision, recall, final-answer recall, and provenance completeness when available
- Required, missing, or stale source IDs
- Remediation checklist
- Regression plan
- Audit trail

The app no longer labels the print artifact as a PDF. It now uses `Print HTML` because the browser downloads an HTML report that can be printed or saved as PDF by the browser.

## Mutation Packs

Current v2 pack set:

- HealthGuard
- FinanceGuard
- RetrievalGuard
- CustomerCareGuard
- LegalGuard
- AgentGuard/catalog entries where applicable in the console

RetrievalGuard covers:

- Query intent preservation
- Query ambiguity
- Distractor document injection
- Contradictory evidence injection
- Stale document injection
- Missing key document handling
- Citation metadata corruption
- Retrieval order shuffle
- Reranker drift
- Tool failure handling
- Context compression loss
- Missing bridge document handling
- Source authority swaps
- Answer pressure

## Key Files

Recent files worth knowing:

- `src/main.js`
- `src/console/report-export.js`
- `examples/harness1-adapter/server.mjs`
- `examples/harness1-adapter/README.md`
- `examples/harness1-adapter/request.json`
- `examples/harness1-adapter/response.json`
- `docs/adapters/harness-1.md`
- `docs/adapters/index.md`
- `tests/harness1-adapter.test.js`
- `tests/report-export.test.js`
- `tests/web-ui.test.js`

## Verification

Last verification before commit:

```bash
npm test -- --test-reporter=spec
npm run build
```

Results:

- Full test suite: 199 passing
- Production build: passing
- Vite emitted only the existing large chunk warning

Browser verification performed locally:

- Registered `harness-1` with `http://127.0.0.1:8788/harnessamp`
- Smoke test passed
- Started `RetrievalGuard Smoke`
- Run completed and opened summary
- `/reports` showed the new local report first
- Evidence column showed `runner observation / contract-smoke`

## Known Notes

- The SaaS console now has a local persisted source-of-truth layer for completed local runs and reports. API-backed project jobs still use the existing project job/report APIs, and seeded demo fixtures remain as explicitly labeled fallback/sample rows.
- Local Harness-1 adapter mode defaults to deterministic `contract-smoke` unless `HARNESS1_EVAL_COMMAND` is configured.
- Vercel production will only reflect this branch after deployment or merge.
- `.Rhistory` and `outputs/` are local ignored artifacts.
