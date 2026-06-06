# HarnessAmp Current State

Last updated: June 6, 2026

## Summary

HarnessAmp is currently a deployed AI-agent reliability testing product prototype with three working layers:

- a public product site at `https://harnessamp.vercel.app/`
- a SaaS-style operator console at `https://harnessamp.vercel.app/dashboard`
- a CLI and API reliability engine for mutation testing, benchmark lifecycle work, runner jobs, reports, and release gates

The current production build includes the latest SaaS console polish from commit `8a1aa24` through merge commit `f93c05e` on `origin/master`.

## Repository And Deployment

- Repository: `dwamenad/HarnessAmp`
- Local branch: `codex/harnessamp-v2-contracts`
- Latest local/feature commit: `8a1aa24 Polish SaaS console workflows`
- Latest production merge observed: `f93c05e Merge pull request #24 from dwamenad/codex/harnessamp-v2-contracts`
- Production URL: `https://harnessamp.vercel.app/`
- Production app entry: `https://harnessamp.vercel.app/dashboard`
- Local preview used for verification: `http://127.0.0.1:4174/`
- Local untracked files intentionally left alone: `.Rhistory`, `outputs/`

## Production UI State

The production root URL still functions as the public landing/product page. The SaaS app itself launches from `/dashboard`.

Working console routes include:

- `/dashboard`
- `/harnesses`
- `/harnesses/new`
- `/packs`
- `/contracts`
- `/runs/new`
- `/runs/:id`
- `/runs/:id/summary`
- `/failures/:id`
- `/compare`
- `/reports`
- `/ci`
- `/usage`
- `/team`

The deployed console shell now has:

- left-side app navigation
- top-level `Start Run`, `New Harness`, and `Sign in with GitHub` actions
- dashboard metrics and recent runs
- harness registration and smoke-test controls
- failure evidence pages with workflow actions
- report export controls
- usage and billing dashboard
- team and role views

## Recent UI Improvements

### Usage And Billing

The `/usage` page was upgraded from static plan cards into a more functional billing dashboard:

- monthly quota progress meter
- usage mix bars
- current plan callout
- plan comparison table
- usage forecast
- billing action buttons

### Failure Evidence

Failure detail action buttons now perform local workflow actions instead of being static:

- `Assign owner` updates owner and status
- `Rerun this case` simulates rerun progress and marks the case reproduced
- `Export failure` generates a JSON evidence packet
- secondary actions show workflow status messages

### Reports

The `/reports` export column now contains real export controls:

- `PDF` downloads a print-ready HTML report intended for PDF save/print
- `JSON` downloads structured report data
- `CSV` downloads tabular report data
- `Markdown` downloads a readable report summary

### GitHub OAuth Visibility

The backend already had GitHub OAuth support. The console routes were updated so they now participate in session refresh and show auth controls in the SaaS header.

The console now shows:

- `Sign in with GitHub` when anonymous
- `Log out <github-login>` when authenticated
- `next=` return paths that preserve the current route, for example `/api/auth/github/start?next=%2Freports`

## GitHub OAuth Requirements

OAuth is implemented in:

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

## Engine And CLI State

The core HarnessAmp engine supports:

- harness bundle validation
- deterministic mutation generation
- risk profiles
- diagnosis reports
- release-gate verdicts
- v1 generated mutation suites
- v2 domain scenario packs
- HealthGuard and FinanceGuard runners
- Markdown and JSON reports
- failure corpus generation
- reusable GitHub Action path

Important CLI examples:

```bash
node scripts/harnessamp.mjs validate examples/demo-bundle.json
node scripts/harnessamp.mjs mutate examples/demo-bundle.json --max-mutations 20
node scripts/harnessamp.mjs diagnose examples/demo-bundle.json
node scripts/harnessamp.mjs report examples/demo-bundle.json
node scripts/harnessamp.mjs registry
node scripts/harnessamp.mjs benchmark validate examples/benchmarks/support-mvp/benchmark-pack.json
node scripts/harnessamp.mjs run examples/financeguard-basic --pack financeguard-core --fail-on high
node scripts/harnessamp.mjs run examples/healthguard-basic --pack healthguard-core --fail-on high
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

Persistence can run in memory for local development or with Postgres through `DATABASE_URL`.

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

Remaining production gap: the separate worker still needs to be deployed and monitored outside Vercel, or replaced later with managed queue infrastructure.

## Verification

Recent verification completed:

```bash
npm run build
npm test
```

Latest full test result observed:

```text
tests 142
pass 142
fail 0
```

Production browser checks confirmed:

- `https://harnessamp.vercel.app/dashboard` renders the SaaS console
- production is serving the latest built JS asset
- `Sign in with GitHub` appears on console routes
- report export controls render after deployment

## What Still Needs Work

Highest-value next work:

- Make `/` route users more directly into `/dashboard` with a clearer app CTA.
- Confirm production GitHub OAuth with real Vercel env vars and GitHub app settings.
- Replace simulated SaaS data with API-backed project data across all console routes.
- Make report/failure exports server-backed if artifacts need durable storage.
- Add real PDF generation instead of print-ready HTML export.
- Deploy the production worker service using `WORKER_SERVICE_TOKEN`, or add managed queue infrastructure.
- Add real framework adapters beyond the current runner abstractions.
- Harden permissions, audit logs, team roles, and benchmark approval policies.

## Current Positioning

HarnessAmp is demo-ready and production-shaped, but not yet a fully hardened enterprise SaaS.

The strongest areas today are:

- reliability engine
- CLI workflows
- generated mutation suites
- HealthGuard and FinanceGuard domain packs
- release-gate artifacts
- SaaS console navigation and workflow demonstration

The areas still needing real production hardening are:

- production worker orchestration
- OAuth/env verification
- durable artifact export flows
- deeper API-backed console data
- enterprise governance and permissions
