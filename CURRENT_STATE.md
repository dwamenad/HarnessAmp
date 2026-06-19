# HarnessAmp Current State

Last updated: June 19, 2026

## Snapshot

Branch: `codex/harnessamp-v2-contracts`

Checked-out commit:

```text
f8fe2a1 Add target reliability release gate reporting
```

Full commit:

```text
f8fe2a1f71b0e219a43c976189e4085a544be187
```

Working tree: dirty. The tree includes the execution-target, org/admin, usage/plan, reporting, and production-readiness cleanup work currently in progress. Notable modified files include `src/main.js`, `styles.css`, `src/console/report-export.js`, `api/_store.js`, `api/jobs.js`, `api/projects.js`, `api/secrets.js`, docs, README, API tests, report tests, and web UI tests. New local files include `api/orgs.js`, `src/core/plans.js`, `src/core/rbac.js`, `src/console/router.js`, and `src/console/lib/labels.js`.

Current local browser target observed in this thread:

```text
http://localhost:4173/dashboard
```

## Current Product State

HarnessAmp now has a console-oriented SaaS surface around release readiness, benchmark runs, execution targets, report evidence, failure triage, CI/runners, and organization administration. The strongest product spine is execution-target readiness: registered runners, Vercel AI SDK routes, local HTTPS tunnels, and gated Hosted BYOK all feed run launch, target validation, reports, and release-gate reasoning.

The console currently distinguishes sample/demo behavior from real execution in several places, but that mode model is still being normalized. A first cleanup slice introduced shared vocabulary in `src/console/lib/labels.js`:

- `Sample workspace`
- `Connected project`
- `Production run`
- `Sample data`
- `Real execution`
- `Local preview`
- `Ephemeral target`
- `Production-grade target`
- readiness labels such as `Healthy`, `Needs validation`, `Recently failing`, `Unstable`, and `Contract mismatch`

The dashboard now pulls its source badge from that shared model instead of hard-coding `Local preview` for seeded console state.

## Route And Page Structure

Current route ownership is still mostly rendered from `src/main.js`, but route metadata and console nav ownership have been moved to `src/console/router.js`.

Primary product routes:

- `/`
- `/app#demo`
- `/dashboard`
- `/harnesses`
- `/harnesses/new`
- `/packs`
- `/packs/:slug`
- `/contracts`
- `/targets`
- `/runs/new`
- `/runs/:id`
- `/runs/:id/summary`
- `/failures`
- `/failures/:id`
- `/compare`
- `/reports`
- `/ci`
- `/org`
- `/org/members`
- `/org/usage`
- `/org/billing`
- `/team`
- `/docs`
- `/report/:id`
- `/projects/:projectId/reports/:reportId`

The sidebar now treats `Organization` as a collapsible admin group with `Overview`, `Members`, `Usage`, `Billing`, and `Team` as children. The remaining cleanup is to fold or rename `Team` into the member/admin model so account administration feels coherent instead of duplicated.

## Current `src/main.js` Responsibilities

`src/main.js` is still the largest frontend monolith, currently about 8,677 lines after the first route/label extraction. It still owns:

- app boot and render orchestration
- public landing page rendering
- docs rendering
- public demo rendering and local report save/load behavior
- console app shell
- dashboard route rendering
- harnesses and smoke-test UI
- mutation pack catalog/detail views
- run launch, run progress, and run summary views
- execution-target registry cards and validation panels
- failure list/detail workflow
- compare and reports routes
- CI/runners route
- org/admin route rendering
- most event binding
- project/org/API hydration helpers
- local browser state and console state persistence

The new `src/console/router.js` owns route labels, nav arrays, route parsing, sidebar active-state helpers, and metric link routing. The new `src/console/lib/labels.js` owns shared mode, target, lifecycle, validation, and readiness vocabulary. These are the first seams for splitting route modules.

## Current `api/_store.js` Responsibilities

`api/_store.js` remains a backend monolith at about 3,790 lines. It still mixes:

- in-memory fallback storage
- Postgres-backed persistence queries
- users, organizations, organization members, workspaces, and projects
- reports and report snapshots
- runner registrations and worker jobs
- project secrets and Hosted BYOK secret metadata
- target validation and job execution metadata
- failure workflows and regression suites
- benchmark registry/version/review/promotion state
- usage events, usage estimates, plan checks, and entitlements
- RBAC enforcement helpers

New domain primitives exist in `src/core/plans.js` and `src/core/rbac.js`, and `api/orgs.js` exposes org/admin endpoints, but `_store.js` still owns too much persistence and policy behavior. The next backend cleanup should split this into store adapters plus domain services for orgs, projects, jobs, reports, targets, secrets, usage, benchmarks, RBAC, and entitlements.

## Bundle Structure

The app still ships public site, docs, public demo, and console behavior through the same Vite entry. A current build passes but still emits a large JavaScript chunk warning:

```text
dist/assets/index-*.js ~856 kB minified
```

The cleanup target is to split public/docs/demo/console chunks with dynamic imports after route modules are separated. No heavy dependency should be added for this.

## Test Coverage Inventory

Relevant coverage currently includes:

- `tests/web-ui.test.js`: static UI guards for console routes, target readiness, reports, org/admin, nav, accessibility hooks, and public/demo separation.
- `tests/api-routes.test.js`: API route behavior across projects, jobs, targets, secrets, org/usage/plan, and related persistence paths.
- `tests/report-export.test.js`: release-gate/report export consistency across JSON, CSV, Markdown, and Print HTML.
- `tests/adapter-contract.test.js`, `tests/vercel-ai-sdk-adapter.test.js`, `tests/local-worker.test.js`, and `tests/harness1-adapter.test.js`: execution substrate and adapter behavior.
- `tests/benchmark-*.test.js`, `tests/v2-*.test.js`, and generated pack tests: benchmark registry, pack generation, scoring, and failure evidence.
- `tests/e2e/demo.spec.js`: browser-level route and demo/console flow checks.

Focused verification for this cleanup slice:

```bash
node --test tests/web-ui.test.js
```

Result: 13 passing.

Syntax verification:

```bash
node --check src/main.js
node --check src/console/router.js
node --check src/console/lib/labels.js
```

Result: passing.

## Cleanup Debt

Highest-priority remaining cleanup:

1. Split `src/main.js` into route modules for dashboard, runs, targets, reports, failures, org/admin, and public demo.
2. Make `Sample workspace`, `Connected project`, and `Production run` the only mode labels used across dashboard, demo, run launch, reports, targets, and CI surfaces.
3. Make `/targets` the canonical readiness surface and make dashboard/report/run summary views link back to target readiness instead of duplicating partial details.
4. Centralize release-gate logic so reports answer “Can this agent be released?” from structured gate status, target readiness, validation state, and worker/job state.
5. Fold `Team` into the organization `Members` concept or clearly distinguish project team versus organization members.
6. Split `api/_store.js` into store adapters and domain services while preserving memory fallback and Postgres behavior.
7. Code-split public/docs/demo/console bundles to remove the Vite large chunk warning.
8. Consolidate overlapping docs around adapters, runners, install, deployment, usage, and schemas into clearer canonical paths.
