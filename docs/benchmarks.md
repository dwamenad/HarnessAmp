# Benchmarks

Benchmark packs define the release gate surface for a target agent class.

Current first-class packs:

- `support-mvp`
- `browser-mvp`

Each benchmark should include:

- intent
- contract
- benchmark cases
- wrapper
- mutation policy
- observations

Case reporting should show pass rate, forbidden-action violations, evidence used, and mutation-to-case breakdown.

## Lifecycle MVP

HarnessAmp now has an API-backed benchmark truth-layer MVP with console controls in the `/app` workspace area. It persists the entities needed to move a benchmark from draft material into reviewed release-gate evidence:

- `benchmark_packs`
- `benchmark_versions`
- `benchmark_reviews`
- `promotion_candidates`
- `golden_cases`

The lifecycle states for benchmark versions are:

- `draft`
- `reviewed`
- `approved`
- `rejected`
- `archived`

The intended flow is:

```text
Create draft version -> Review -> Approve -> Propose golden case -> Promote golden case
```

An approved version is the source of truth that mutation runs should target for release gates. Promotion candidates let a passing report, trace, or manually reviewed case become a visible or holdout golden case after maintainer review.

In the app console, signed-in project owners and maintainers can:

- create a draft version from the active benchmark pack or generated report export
- edit mission, required behavior, and forbidden behavior as a new immutable draft version
- inspect a field/case/tool diff between adjacent benchmark versions
- approve the selected benchmark version
- propose a holdout golden case from the active report
- promote a proposed case into the project's golden-case set
- inspect latest version state, approved version, proposed cases, and promoted goldens

## API Flow

Create a draft benchmark version:

```http
POST /api/benchmarks?projectId=<project-id>
```

```json
{
  "source": "manual",
  "pack": {
    "project": "Support MVP Robustness Benchmark",
    "intent": {},
    "contract": {},
    "benchmark": {},
    "wrapper": {}
  }
}
```

Approve a benchmark version:

```http
POST /api/benchmarks?action=review&versionId=<version-id>
```

```json
{
  "decision": "approve",
  "comments": "Approved as release-gate source of truth."
}
```

Save field-level edits as a new draft version:

```http
POST /api/benchmarks?action=edit&versionId=<version-id>
```

```json
{
  "edits": {
    "intentMission": "Updated release-gate mission.",
    "mustText": "Use approved lookup tools.\nAsk for missing evidence.",
    "mustNotText": "Do not invent facts.\nDo not bypass approval."
  }
}
```

Propose a golden case:

```http
POST /api/benchmarks?action=promotion&versionId=<version-id>
```

```json
{
  "sourceType": "report",
  "sourceId": "report_123",
  "visibility": "holdout",
  "case": {
    "id": "golden-private-holdout-001",
    "title": "Private holdout case",
    "tier": "holdout"
  }
}
```

Promote the candidate:

```http
POST /api/benchmarks?action=promote&candidateId=<candidate-id>
```

List benchmark packs for a project:

```http
GET /api/benchmarks?projectId=<project-id>
```

Fetch a benchmark detail, including versions, reviews, promotion candidates, and golden cases:

```http
GET /api/benchmarks?id=<benchmark-id>
```

## Remaining Benchmark Work

The API-backed lifecycle and console controls are not the complete editor. Remaining product work includes:

- browser UI for editing benchmark fields
- broader browser UI for editing cases, tools, evidence, thresholds, and mutation policy
- richer review diffs with reviewer assignment and comments
- visible/private holdout management in the console
- promotion from real report and trace artifacts
- audit trail filtering and reviewer assignment
- CLI commands for benchmark lifecycle operations
