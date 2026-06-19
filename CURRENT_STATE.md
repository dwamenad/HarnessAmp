# HarnessAmp Current State

Last updated: June 19, 2026

## Snapshot

Branch: `codex/harnessamp-v2-contracts`

Checked-out commit:

```text
26c938c Fix bootstrap shell test
```

Full commit:

```text
26c938c1c5e9dfa963c1c22ae8449f42c424cd68
```

Working tree: dirty. Current local changes are the route ownership pass after the green `26c938c` CI repair. The pass moves `/targets` and `/reports` page-level rendering into `src/console/routes/targets.js` and `src/console/routes/reports.js`, leaves shared card/table helpers in `src/console/app-shell.js`, updates static ownership tests, adds a cold-load `/targets` browser guard, and refreshes this state file.

Current local browser target observed in this thread:

```text
http://localhost:4173/targets
```

## Current Product State

HarnessAmp now has a console-oriented SaaS surface around release readiness, benchmark runs, execution targets, report evidence, failure triage, CI/runners, and organization administration. The strongest product spine is now the Production Evidence Control Plane: a shared evidence snapshot derives `Can this agent be released?` from execution target readiness, validation, lifecycle, benchmark result, failure triage, contract state, sample/live mode, and org/admin status.

The console now distinguishes sample/demo behavior from real execution through shared vocabulary and canonical evidence helpers:

- `Sample workspace`
- `Connected project`
- `Production run`
- `Sample data`
- `Real execution`
- `Local preview`
- `Ephemeral`
- `Production-grade`
- readiness labels such as `Healthy`, `Needs validation`, `Recently failing`, `Unstable`, and `Contract mismatch`
- release labels such as `Release eligible`, `Release blocked`, and `Warnings present`

`src/console/lib/production-evidence.js` is the new canonical source for the shared evidence object, release-gate classification, target normalization, and failure-triage buckets. Dashboard, `/targets`, run summaries, report exports, and the Organization overview now consume that model or a route adapter around it.

## Route And Page Structure

`src/main.js` is now a small async bootstrap that renders compact loading/error states and dynamically imports `src/console/app-shell.js`. Route metadata and console nav ownership live in `src/console/router.js`. Console route ownership now has module boundaries under `src/console/routes/`:

- `dashboard.js`: dashboard, harnesses, packs, contracts, compare, CI
- `runs.js`: new run, run progress, run summary
- `targets.js`: execution-target readiness surface
- `reports.js`: reports
- `failures.js`: failure list/detail
- `org.js`: organization overview, members, usage, billing, settings, `/team` compatibility alias
- `public-demo.js`: home, docs, app/demo, report path surfaces

The route modules are being split incrementally. `/targets` and `/reports` now own their page-level render bodies in their route modules while consuming shared helper functions from `src/console/app-shell.js`. The remaining route modules still delegate page bodies back into the shell; the next split should continue with `/runs/new`, run summary, `/failures`, and dashboard.

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

The sidebar treats `Organization` as a collapsible admin group with `Overview`, `Members`, `Usage`, and `Billing` as children. `/team` remains as a compatibility route but renders the Members surface instead of appearing as a separate nav concept.

## Current Frontend Ownership

`src/main.js` is now a small bootstrap of about 35 lines. It owns:

- dynamic import of `src/console/app-shell.js`
- safe bootstrap failure state
- no visible normal-path loading screen; `Loading HarnessAmp` was removed to avoid a pre-render flash

`src/console/app-shell.js` is now the largest frontend module, currently about 8,900 lines after the route-loader extraction. It still owns:

- app boot and render orchestration
- public landing page rendering
- docs rendering
- public demo rendering and local report save/load behavior
- console app shell
- dashboard route rendering
- harnesses and smoke-test UI
- mutation pack catalog/detail views
- run launch, run progress, and run summary views
- execution-target registry helpers, target cards, and validation panels used by the `/targets` route module
- failure list/detail workflow
- compare route and shared report table/export helpers used by the `/reports` route module
- CI/runners route
- org/admin route rendering
- most event binding
- project/org/API hydration helpers
- local browser state and console state persistence

`src/console/router.js` owns route labels, nav arrays, route parsing, sidebar active-state helpers, and metric link routing. `src/console/lib/labels.js` owns shared vocabulary. `src/console/lib/production-evidence.js` owns the canonical project readiness/release-gate model. `src/console/components/target-readiness.js` renders the shared readiness snapshot. `src/console/components/loading-states.js` and `src/console/components/error-states.js` render safe route import states.

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

New domain primitives exist in `src/core/plans.js` and `src/core/rbac.js`, and `api/orgs.js` exposes org/admin endpoints, but `_store.js` still owns too much persistence and policy behavior. This slice adds thin service entry points at `api/services/production-evidence.js` and `api/services/release-gate.js`; the next backend cleanup should split `_store.js` into store adapters plus domain services for orgs, projects, jobs, reports, targets, secrets, usage, benchmarks, RBAC, and entitlements.

## Bundle Structure

The app no longer ships the console shell through the initial Vite entry. `src/main.js` dynamically imports `src/console/app-shell.js`; console route wrappers are also dynamically imported. `vite.config.js` still defines manual chunks for report export, benchmark runtime, and `marked`. A current build passes and emits these chunks:

```text
dist/assets/index-*.js ~2.75 kB minified
dist/assets/dashboard-*.js ~0.47 kB minified
dist/assets/runs-*.js ~0.24 kB minified
dist/assets/targets-*.js ~1.82 kB minified
dist/assets/reports-*.js ~1.04 kB minified
dist/assets/failures-*.js ~0.14 kB minified
dist/assets/org-*.js ~0.34 kB minified
dist/assets/public-demo-*.js ~0.23 kB minified
dist/assets/vendor-marked-*.js ~39.67 kB minified
dist/assets/console-report-export-*.js ~50.23 kB minified
dist/assets/benchmark-runtime-*.js ~91.19 kB minified
dist/assets/app-shell-*.js ~688.36 kB minified
```

The Vite large chunk warning remains for `dist/assets/app-shell-*.js` because most route bodies and route-specific data imports still live in the shell. `/targets` and `/reports` now carry their page-level markup in their own chunks, which is why those route chunks are larger and the shell is slightly smaller. Eliminating the warning requires moving dashboard/runs/failures/org/public-demo render bodies and route-specific data imports into their route modules. No heavy dependency was added.

## Test Coverage Inventory

Relevant coverage currently includes:

- `tests/web-ui.test.js`: static UI guards for console routes, target readiness, reports, org/admin, nav, accessibility hooks, and public/demo separation.
- `tests/api-routes.test.js`: API route behavior across projects, jobs, targets, secrets, org/usage/plan, and related persistence paths.
- `tests/report-export.test.js`: release-gate/report export consistency across JSON, CSV, Markdown, and Print HTML.
- `tests/production-evidence.test.js`: canonical production evidence for sample workspace, connected project/local preview, production run, contract mismatch, warnings, and worker lifecycle blockers.
- `tests/adapter-contract.test.js`, `tests/vercel-ai-sdk-adapter.test.js`, `tests/local-worker.test.js`, and `tests/harness1-adapter.test.js`: execution substrate and adapter behavior.
- `tests/benchmark-*.test.js`, `tests/v2-*.test.js`, and generated pack tests: benchmark registry, pack generation, scoring, and failure evidence.
- `tests/e2e/demo.spec.js`: browser-level route and demo/console flow checks.

Focused verification for this cleanup slice:

```bash
node --test tests/web-ui.test.js
node --input-type=module <route browser smoke against http://localhost:4173/targets and /reports>
```

Result: `tests/web-ui.test.js` passed 14 tests. Browser smoke confirmed `/targets` and `/reports` render expected headings/copy, do not show `Loading HarnessAmp` or `Preparing the console`, and report no browser errors.

Full verification:

```bash
npm test
npm run build
```

Result: `npm test` passed 285 tests. `npm run build` passed with the remaining `dist/assets/app-shell-*.js ~688.36 kB` chunk warning. The configured `npm run test:e2e` was not run during this pass because its webServer starts a fresh API server on `127.0.0.1:3000`, which is already used by the live local app server in this thread.

Syntax verification:

```bash
node --check src/main.js
node --check src/console/app-shell.js
node --check src/console/router.js
node --check src/console/lib/labels.js
node --check src/console/lib/production-evidence.js
node --check src/console/components/target-readiness.js
node --check src/console/report-export.js
node --check src/console/routes/dashboard.js
node --check src/console/routes/runs.js
node --check src/console/routes/targets.js
node --check src/console/routes/reports.js
node --check src/console/routes/failures.js
node --check src/console/routes/org.js
node --check src/console/routes/public-demo.js
node --check api/services/production-evidence.js
node --check api/services/release-gate.js
```

Result: passing.

## Cleanup Debt

Highest-priority remaining cleanup:

1. Continue moving real route render bodies and route-specific state/data imports from `src/console/app-shell.js` into `src/console/routes/*`; `/targets` and `/reports` page-level bodies are now split.
2. Move `/runs/new`, run summary, `/failures`, dashboard, org, and public/demo page bodies next.
3. Split docs/public-demo data and benchmark catalog imports so they are loaded only by their route modules.
4. Continue replacing older "demo" and "ready" copy where it bypasses the shared evidence labels.
5. Expand `/targets` browser-level coverage so production-capable, ephemeral, failed, and contract-mismatched targets are verified through rendered DOM, not only static guards.
6. Split `api/_store.js` into store adapters and domain services while preserving memory fallback and Postgres behavior.
7. Consolidate overlapping docs around adapters, runners, install, deployment, usage, and schemas into clearer canonical paths.
