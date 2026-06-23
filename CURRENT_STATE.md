# HarnessAmp Current State

Last updated: June 21, 2026

## Snapshot

Branch: `codex/harnessamp-v2-contracts`

Checked-out commit:

```text
f7350ff Split runs and failures route ownership
```

Full commit:

```text
f7350fff9eaa29ea1ac6542046b872ad2e151fa5
```

Working tree: dirty. Current local changes add two market-positioning slices on top of `f7350ff`. The first adds `src/console/lib/support-quality-loop.js`, seeds CustomerCareGuard support failures and a production-failure-loop report, leads `/failures` with imported support inputs/failure patterns/generated evals/instruction-stack risks, carries support-loop evidence through JSON/CSV/Markdown/Print HTML report exports, and adds focused model/export tests. The second adds `src/console/lib/instruction-manifest-doctor.js`, adds an Instruction Manifest Doctor catalog entry, leads `/packs` with manifest findings, and renders `/packs/instruction-manifest-doctor` with release-blocking instruction-stack findings.

Current local browser target observed in this thread:

```text
http://127.0.0.1:4173/packs
```

## Current Product State

HarnessAmp now has a console-oriented SaaS surface around release readiness, benchmark runs, execution targets, report evidence, failure triage, CI/runners, and organization administration. The strongest product spine is now the Production Evidence Control Plane: a shared evidence snapshot derives `Can this agent be released?` from execution target readiness, validation, lifecycle, benchmark result, failure triage, contract state, sample/live mode, and org/admin status.

The current local slice adds a visible customer-support wedge: support tickets, policies, and account-event shapes now become failure patterns, generated regression evals, instruction-stack risks, and release blockers. This is surfaced in `/failures`, support failure details, and report exports instead of being treated as another static benchmark pack.

The latest local slice adds Instruction Manifest Doctor as a first-class release pack. HarnessAmp now explicitly tests persistent instruction files such as `AGENTS.md`, `CLAUDE.md`, Copilot instructions, Cursor rules, policy docs, and tool schemas for conflicts, stale commands, policy threshold drift, missing escalation, unsafe tool permissions, untrusted-content boundary failures, secret-like content, and context bloat.

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

The route modules are being split incrementally. `/targets`, `/reports`, `/runs/new`, run progress, run summary, `/failures`, and failure detail now own their page-level render bodies in route modules while consuming shared helper functions from `src/console/app-shell.js`. The remaining route modules still delegate page bodies back into the shell; the next split should continue with dashboard, harnesses, packs, contracts, compare, CI, org, and public/demo.

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

`src/console/app-shell.js` is now the largest frontend module, currently about 8,600 lines after the route-loader extraction. It still owns:

- app boot and render orchestration
- public landing page rendering
- docs rendering
- public demo rendering and local report save/load behavior
- console app shell
- dashboard route rendering
- harnesses and smoke-test UI
- mutation pack catalog/detail views
- shared run launch, run progress, and run summary helpers used by the `/runs` route module
- execution-target registry helpers, target cards, and validation panels used by the `/targets` route module
- shared failure workflow helpers used by the `/failures` route module
- compare route and shared report table/export helpers used by the `/reports` route module
- CI/runners route
- org/admin route rendering
- most event binding
- project/org/API hydration helpers
- local browser state and console state persistence

`src/console/router.js` owns route labels, nav arrays, route parsing, sidebar active-state helpers, and metric link routing. `src/console/lib/labels.js` owns shared vocabulary. `src/console/lib/production-evidence.js` owns the canonical project readiness/release-gate model. `src/console/lib/support-quality-loop.js` owns the customer-support failure loop model. `src/console/lib/instruction-manifest-doctor.js` owns instruction-stack static analysis. `src/console/components/target-readiness.js` renders the shared readiness snapshot. `src/console/components/loading-states.js` and `src/console/components/error-states.js` render safe route import states.

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
dist/assets/runs-*.js ~11.00 kB minified
dist/assets/targets-*.js ~1.82 kB minified
dist/assets/reports-*.js ~1.04 kB minified
dist/assets/failures-*.js ~8.65 kB minified
dist/assets/org-*.js ~0.34 kB minified
dist/assets/public-demo-*.js ~0.23 kB minified
dist/assets/vendor-marked-*.js ~39.67 kB minified
dist/assets/console-report-export-*.js ~59.78 kB minified
dist/assets/benchmark-runtime-*.js ~96.83 kB minified
dist/assets/app-shell-*.js ~688.42 kB minified
```

The Vite large chunk warning remains for `dist/assets/app-shell-*.js` because dashboard, harnesses, packs, contracts, compare, CI, org, public/demo, docs, and many route-specific data imports still live in the shell. `/targets`, `/reports`, `/runs`, and `/failures` now carry page-level markup in their own chunks, which is why those route chunks are larger and the shell is smaller. Eliminating the warning requires moving the remaining page bodies and route-specific data imports into their route modules. No heavy dependency was added.

## Test Coverage Inventory

Relevant coverage currently includes:

- `tests/web-ui.test.js`: static UI guards for console routes, target readiness, reports, org/admin, nav, accessibility hooks, and public/demo separation.
- `tests/api-routes.test.js`: API route behavior across projects, jobs, targets, secrets, org/usage/plan, and related persistence paths.
- `tests/report-export.test.js`: release-gate/report export consistency across JSON, CSV, Markdown, Print HTML, and support quality loop evidence.
- `tests/support-quality-loop.test.js`: customer-support failure loop derivation for imported support inputs, generated evals, instruction-stack risks, and release blockers.
- `tests/instruction-manifest-doctor.test.js`: instruction-stack analyzer coverage for conflicts, policy drift, unsafe tools, clean stacks, and release-gate status.
- `tests/domain-pack-catalog.test.js`: domain pack catalog coverage including Instruction Manifest Doctor metadata and normalized card rows.
- `tests/production-evidence.test.js`: canonical production evidence for sample workspace, connected project/local preview, production run, contract mismatch, warnings, and worker lifecycle blockers.
- `tests/adapter-contract.test.js`, `tests/vercel-ai-sdk-adapter.test.js`, `tests/local-worker.test.js`, and `tests/harness1-adapter.test.js`: execution substrate and adapter behavior.
- `tests/benchmark-*.test.js`, `tests/v2-*.test.js`, and generated pack tests: benchmark registry, pack generation, scoring, and failure evidence.
- `tests/e2e/demo.spec.js`: browser-level route and demo/console flow checks.

Focused verification for these support-loop and instruction-doctor slices:

```bash
node --test tests/support-quality-loop.test.js
node --test tests/instruction-manifest-doctor.test.js
node --test tests/domain-pack-catalog.test.js
node --test tests/report-export.test.js
node --test tests/web-ui.test.js
node --input-type=module <browser smoke against http://127.0.0.1:4173/failures, /failures/fail-support-mfa-031, /packs, and /packs/instruction-manifest-doctor>
```

Result: `tests/support-quality-loop.test.js` passed 2 tests, `tests/instruction-manifest-doctor.test.js` passed 2 tests, `tests/domain-pack-catalog.test.js` passed 2 tests, `tests/report-export.test.js` passed 6 tests, and `tests/web-ui.test.js` passed 14 tests. Browser smoke confirmed the support quality loop renders on `/failures`, the support MFA blocker detail renders at `/failures/fail-support-mfa-031`, the Instruction Manifest Doctor renders on `/packs` and `/packs/instruction-manifest-doctor`, the mobile doctor detail renders, and there are no browser console errors or 4xx/5xx responses under the full dev server.

Full verification:

```bash
npm test
npm run build
```

Result: `npm test` passed 290 tests. `npm run build` passed with the remaining `dist/assets/app-shell-*.js ~688.42 kB` chunk warning. The configured `npm run test:e2e` was not run during this pass because focused Playwright browser smoke covered the changed routes while the full dev server was already running on `127.0.0.1:3000`/`4173`.

Syntax verification:

```bash
node --check src/main.js
node --check src/console/app-shell.js
node --check src/console/router.js
node --check src/console/lib/labels.js
node --check src/console/lib/production-evidence.js
node --check src/console/lib/support-quality-loop.js
node --check src/console/lib/instruction-manifest-doctor.js
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

1. Continue moving real route render bodies and route-specific state/data imports from `src/console/app-shell.js` into `src/console/routes/*`; `/targets`, `/reports`, `/runs`, and `/failures` page-level bodies are now split.
2. Move dashboard, harnesses, packs, contracts, compare, CI, org, and public/demo page bodies next.
3. Split docs/public-demo data and benchmark catalog imports so they are loaded only by their route modules.
4. Make the support quality loop ingest real trace/ticket/policy files instead of seeded failure rows.
5. Connect Instruction Manifest Doctor to real repo/file ingestion instead of the seeded sample manifests.
6. Continue replacing older "demo" and "ready" copy where it bypasses the shared evidence labels.
7. Expand `/targets` browser-level coverage so production-capable, ephemeral, failed, and contract-mismatched targets are verified through rendered DOM, not only static guards.
8. Split `api/_store.js` into store adapters and domain services while preserving memory fallback and Postgres behavior.
9. Consolidate overlapping docs around adapters, runners, install, deployment, usage, and schemas into clearer canonical paths.
