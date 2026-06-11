# HarnessAmp Current State

Last updated: June 10, 2026

## Summary

HarnessAmp is a deployed AI-agent reliability testing product prototype with three working layers:

- public product site at `https://harnessamp.vercel.app/`
- SaaS-style operator console at `https://harnessamp.vercel.app/dashboard`
- CLI/API reliability engine for mutation testing, generated suites, runner jobs, benchmark lifecycle work, reports, failure evidence, and release gates

The latest pushed feature branch is `codex/harnessamp-v2-contracts` at commit `e9875ba` (`Expand safety packs and harden failure workflows`). That branch has been pushed to GitHub, but production will only show it after the PR/branch is merged and Vercel deploys the new build.

## Repository And Deployment

- Repository: `dwamenad/HarnessAmp`
- Local branch: `codex/harnessamp-v2-contracts`
- Latest pushed branch commit: `e9875ba Expand safety packs and harden failure workflows`
- Production URL: `https://harnessamp.vercel.app/`
- Production app entry: `https://harnessamp.vercel.app/dashboard`
- Local preview used for verification: `http://127.0.0.1:4174/`
- Local untracked files intentionally left alone: `.Rhistory`, `outputs/`

## Product State

The product is now strongest as a demo-ready reliability platform for testing assistant wrapper behavior under pressure. It can show a buyer or reviewer:

- how a project dashboard looks
- how mutation packs are selected
- how high-risk failure evidence is reviewed
- how CI gates summarize release risk
- how domain packs scale from smoke to nightly test volumes
- how reports and failure artifacts can be exported

The app still uses a mix of real engine/API capability and simulated console data. The core CLI and v2 pack execution are more real than parts of the SaaS UI.

Latest local work after `9a3d992` adds failure fix guidance and a regression suite builder. This has not been committed or pushed yet.

## Console Routes

Working console routes include:

- `/dashboard`
- `/harnesses`
- `/harnesses/new`
- `/packs`
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

The console includes:

- left-side app navigation
- `Start Run`, `New Harness`, and GitHub auth actions
- dashboard metrics and recent runs
- harness registration and smoke-test controls
- mutation pack catalog
- run configuration with harness, pack, tier, and gate selection
- local/API-backed queued run start with live progress and summary landing
- filterable failure queue
- failure evidence pages with durable workflow actions
- failure fix guidance with copyable checklists
- regression suite builder for pinned failures
- report export controls
- usage and billing dashboard
- team and role views

## Recent Changes In `e9875ba`

### CustomerCareGuard

CustomerCareGuard was added as a v2 safety pack for customer support agents.

It covers:

- policy source fidelity
- refund and credit authority
- authentication before sensitive account action
- privacy minimization
- mandatory escalation
- account security protection
- complaint/legal-threat handling
- abusive-user containment
- ethical cancellation and retention

Implemented files include:

- `src/v2/packs/customercareguard.js`
- `src/v2/generators/customercareguard-generator.js`
- `src/v2/demo-agents/customercareguard-agent.js`
- `examples/customercareguard-basic/`
- `tests/v2-customercareguard-generated.test.js`

### LegalGuard

LegalGuard was added as a v2 safety pack for legal-domain assistants.

It covers:

- legal-information boundary
- jurisdiction discipline
- deadline safety
- confidentiality
- contract source fidelity
- balanced rights/obligations
- qualified counsel escalation
- urgent legal triage
- unlawful-evasion refusal

Implemented files include:

- `src/v2/packs/legalguard.js`
- `src/v2/generators/legalguard-generator.js`
- `src/v2/demo-agents/legalguard-agent.js`
- `examples/legalguard-basic/`
- `tests/v2-legalguard-generated.test.js`

### RetrievalGuard

RetrievalGuard was added as a v2 safety and robustness pack for retrieval agents, search agents, RAG systems, citation assistants, and stateful evidence-gathering agents.

It covers:

- source-grounded answer generation
- citation fidelity
- evidence provenance preservation
- query intent preservation
- paraphrase recall
- distractor resistance
- contradiction handling
- abstention when evidence is missing
- multi-hop evidence completeness
- transparent retrieval/tool failure handling

Implemented files include:

- `src/v2/packs/retrievalguard.js`
- `src/v2/generators/retrievalguard-generator.js`
- `src/v2/demo-agents/retrievalguard-agent.js`
- `examples/retrievalguard-basic/`
- `examples/retrievalguard-basic/fixtures/qrels/`
- `examples/retrievalguard-basic/fixtures/expected/`
- `tests/v2-retrievalguard.test.js`

### Pack Catalog

The `/packs` catalog now includes HealthGuard, FinanceGuard, RetrievalGuard, CustomerCareGuard, and LegalGuard with generated suite scale.
Pack cards now also show the evaluation model: fixture-backed expected behavior or qrel-backed evidence fixtures, domain metrics, severity release gates, generated provenance, and regression promotion readiness.

Current displayed scale:

| Pack | Smoke | Core | Deep | Nightly |
| --- | ---: | ---: | ---: | ---: |
| FinanceGuard | 400 | 3,400 | 17,000 | 51,000 |
| HealthGuard | 400 | 4,560 | 22,800 | 68,400 |
| RetrievalGuard | 400 | 4,200 | 21,000 | 63,000 |
| CustomerCareGuard | 400 | 3,600 | 18,000 | 54,000 |
| LegalGuard | 400 | 4,200 | 21,000 | 63,000 |

### Strengthened Mutation Pack Evaluation

The v2 runner now emits `domainEvaluations` for every pack mutation trace:

- FinanceGuard: contract pass rate, fixture compliance, tool discipline, numeric accuracy, stale-data discipline, advice-boundary compliance, privacy containment, fraud escalation, and action authorization.
- HealthGuard: red-flag recall, clinical-boundary compliance, medication safety, privacy containment, source fidelity, and equity consistency.
- CustomerCareGuard: policy fidelity, authority boundary, authentication-before-action, privacy containment, escalation coverage, abuse containment, and ethical cancellation.
- LegalGuard: jurisdiction discipline, legal-advice boundary, deadline safety, source fidelity, confidentiality protection, counsel escalation, and unlawful-evasion refusal.
- RetrievalGuard: required-document recall, evidence precision, citation fidelity, provenance completeness, bridge completeness, abstention calibration, source-authority selection, contradiction handling, and tool-failure transparency.

New artifacts:

- `src/v2/domain-evaluator.js`
- `src/v2/regression-corpus.js`
- `examples/financeguard-basic/fixtures/expected/`
- `examples/healthguard-basic/fixtures/expected/`
- `examples/customercareguard-basic/fixtures/expected/`
- `examples/legalguard-basic/fixtures/expected/`
- `tests/v2-domain-evaluator.test.js`

Generated suite reports now include provenance samples, and failed v2 cases can be collected as regression-suite candidates with metrics, failure signals, evidence, severity, and recommended release-blocking suite metadata.

Representative multi-turn pressure scenarios were added for FinanceGuard, HealthGuard, CustomerCareGuard, and LegalGuard. The scenario loader now preserves a normalized `turns` array for these cases.

### Failure Workflows

Failure evidence actions are now more than static UI.

Implemented:

- `GET /api/failures`
- `POST /api/failures`
- durable `failure_workflows` table
- in-memory dev store support
- owner/status/severity/action history persistence
- browser-local fallback when unauthenticated
- reload restore for saved workflow state

Verified behavior:

- click `Assign owner`
- status changes to `Assigned`
- owner changes to `Safety Review`
- workflow log records the action
- reload restores the saved state

### Run Execution Flow

The console now has a fuller `Start Run` path:

- choose harness
- choose pack
- choose tier: smoke, core, deep, nightly
- choose fail condition and max observations
- start a queued run
- use the project job API when authenticated and a runner is selected
- fall back to a local preview run when anonymous
- show live progress
- land automatically on `/runs/:id/summary`
- link from the summary to reports, failures, and compare

### Failure Triage Queue

The failure system now has a queue page at `/failures`:

- search failures
- filter by severity
- filter by status
- filter by owner
- open evidence detail pages

The detail page now supports:

- assignee picker
- severity picker
- reviewer comments
- false-positive resolution
- regression-suite pinning
- audit log display
- reload restore through the existing workflow persistence/local fallback

### Failure Fix Guidance And Regression Suites

Failure evidence pages now include repair guidance:

- likely root cause
- suggested control fix
- regression test recommendation
- copyable fix checklist

The failure queue now includes named regression suites:

- Release blocker suite
- HealthGuard red flags
- Source fidelity suite

Pinned failures persist in browser console state, and the selected suite is used when `Add to regression suite` is clicked.

### README And Screenshots

The README was trimmed and refreshed around the current product story.

New screenshots:

- `docs/screenshots/readme-dashboard-current.jpg`
- `docs/screenshots/readme-packs-current.jpg`
- `docs/screenshots/readme-failure-current.jpg`

## Engine And CLI State

The core HarnessAmp engine supports:

- harness bundle validation
- deterministic mutation generation
- risk profiles
- diagnosis reports
- release-gate verdicts
- v1 generated mutation suites
- v2 domain scenario packs
- HealthGuard, FinanceGuard, CustomerCareGuard, and LegalGuard generated smoke/core/deep/nightly paths
- Markdown and JSON reports
- failure corpus generation
- reusable GitHub Action path

Useful commands:

```bash
node scripts/harnessamp.mjs validate examples/demo-bundle.json
node scripts/harnessamp.mjs mutate examples/demo-bundle.json --max-mutations 20
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json
node scripts/harnessamp.mjs report examples/demo-bundle.json
node scripts/harnessamp.mjs registry
node scripts/harnessamp.mjs run --pack financeguard-core --generated smoke --fail-on high
node scripts/harnessamp.mjs run --pack healthguard-core --generated smoke --fail-on high
node scripts/harnessamp.mjs run examples/retrievalguard-basic --pack retrievalguard-core --fail-on high
node scripts/harnessamp.mjs run --pack retrievalguard-core --generated smoke --fail-on high
node scripts/harnessamp.mjs run --pack customercareguard-core --generated smoke --fail-on high
node scripts/harnessamp.mjs run --pack legalguard-core --generated smoke --fail-on high
```

## API And Persistence State

Implemented API areas:

- auth and GitHub OAuth
- sessions
- workspaces
- projects
- reports
- runners
- jobs
- benchmark packs
- benchmark versions
- benchmark review and promotion workflows
- events
- failure workflows

Persistence can run in memory for local development or with Postgres through `DATABASE_URL`.

## GitHub OAuth State

GitHub OAuth is implemented in:

- `api/auth.js`
- `api/_auth.js`
- `api/_session.js`
- `api/_cookies.js`

Production requires these Vercel environment variables:

```text
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
SESSION_SECRET
APP_BASE_URL=https://harnessamp.vercel.app
```

The GitHub OAuth app callback should be:

```text
https://harnessamp.vercel.app/api/auth/github/callback
```

Local note: `vite preview` only serves the static app. Use `npm run dev` to test local API routes and OAuth behavior end to end.

## Benchmark And Runner State

Working benchmark lifecycle capabilities:

- create draft benchmark versions
- edit metadata, tags, mission, rules, success signals, thresholds, cases, tools, and evidence
- review diffs
- assign reviewers
- record review decisions
- approve versions
- propose and promote golden cases

Working runner/job capabilities:

- connected runner records
- queued jobs
- retry/backoff metadata
- cancellation
- worker claim/run actions
- local worker loop
- `WORKER_SERVICE_TOKEN` bearer auth for separately deployed workers
- job observability UI

Remaining production gap: the separate worker still needs deployment and monitoring outside Vercel, or replacement with managed queue infrastructure.

## Verification

Latest verification after the fix guidance and regression suite update:

```bash
npm test
npm run build
```

Latest full test result:

```text
tests 157
pass 157
fail 0
```

Browser verification completed locally on:

```text
http://127.0.0.1:4174/runs/new
http://127.0.0.1:4174/runs/:id/summary
http://127.0.0.1:4174/failures
http://127.0.0.1:4174/failures/fail-redflag-017
```

Confirmed:

- Start Run creates a run, shows progress, and lands on a summary page.
- run summary links to report center, failure queue, and compare.
- failure queue filters by severity.
- failure queue can clear saved filters.
- failure queue shows pinned regression suite cases.
- failure detail shows fix guidance and a copy checklist action.
- failure workflow action buttons work
- triage controls change owner, severity, status, and comments
- reload restores saved workflow state

## What Still Needs Work

Highest-value next work:

- Commit, push, merge, and deploy the latest local fix guidance/regression suite update, then verify `https://harnessamp.vercel.app/dashboard`, `/runs/new`, `/packs`, `/failures`, `/failures/fail-redflag-017`, and `/reports`.
- Confirm production GitHub OAuth with real Vercel env vars and GitHub app settings.
- Replace simulated SaaS data with API-backed project data across all console routes.
- Make report/failure exports server-backed if artifacts need durable storage.
- Persist full failure comments and assignee options server-side instead of relying partly on workflow action messages/local fallback.
- Persist regression suite definitions and pinned cases server-side.
- Turn copied fix guidance into first-class issue/task templates.
- Replace the local run preview simulation with real worker completion in production.
- Add real PDF generation instead of print-ready HTML export.
- Deploy the production worker service using `WORKER_SERVICE_TOKEN`, or add managed queue infrastructure.
- Add real framework adapters beyond the current runner abstractions.
- Harden permissions, audit logs, team roles, and benchmark approval policies.
- Update `docs/v2.md`, which still describes CustomerCareGuard and LegalGuard as not fully implemented.

## Current Positioning

HarnessAmp is demo-ready and production-shaped, but not yet a fully hardened enterprise SaaS.

Strongest areas today:

- reliability engine
- CLI workflows
- generated mutation suites
- HealthGuard and FinanceGuard
- new CustomerCareGuard and LegalGuard generated packs
- release-gate artifacts
- failure evidence workflows
- failure fix guidance
- regression suite builder
- SaaS console navigation and workflow demonstration

Areas still needing production hardening:

- production worker orchestration
- OAuth/env verification
- durable artifact export flows
- deeper API-backed console data
- enterprise governance and permissions
