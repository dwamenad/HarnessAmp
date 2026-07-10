# Benchmark-Backed Release Gates

Benchmark packs are the compatibility format behind release gates. Product surfaces should lead with the release gate, verdict, blockers, warnings, readiness, and replayable evidence.

Current first-class packs:

- `support-mvp`
- `browser-mvp`

Each benchmark-backed release gate should include:

- intent
- contract
- benchmark cases
- wrapper
- mutation policy
- observations

Case reporting should show pass rate, forbidden-action violations, evidence used, and mutation-to-case breakdown.

## Lifecycle MVP

HarnessAmp now has an API-backed release-gate truth-layer MVP with console controls in the `/app` workspace area. It persists the entities needed to move benchmark-backed source material into reviewed release-gate evidence:

- `benchmark_packs`
- `benchmark_versions`
- `benchmark_reviews`
- `promotion_candidates`
- `golden_cases`

The lifecycle states for release-gate versions are:

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

- create a draft version from the active release gate or generated report export
- edit project metadata, mission, required behavior, forbidden behavior, success signals, thresholds, tags, cases, tools, and evidence as a new immutable draft version
- inspect a field/case/tool/evidence diff between adjacent release-gate versions
- assign a reviewer to a release-gate version
- record review decisions and comments, including reviewed, request changes, approve, reject, and archive
- propose a holdout golden case from the active report
- promote a proposed case into the project's golden-case set
- inspect latest version state, approved version, proposed cases, promoted goldens, and recent review audit entries

## API Flow

Create a draft release-gate version:

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

Assign a reviewer:

```http
POST /api/benchmarks?action=assign-reviewer&versionId=<version-id>
```

```json
{
  "reviewer": "qa-reviewer@example.com",
  "notes": "Review expanded benchmark editor coverage."
}
```

Save field-level edits as a new draft version:

```http
POST /api/benchmarks?action=edit&versionId=<version-id>
```

```json
{
  "edits": {
    "project": "Support MVP Robustness Benchmark",
    "description": "Release-gate benchmark for support agents.",
    "intentMission": "Updated release-gate mission.",
    "mustText": "Use approved lookup tools.\nAsk for missing evidence.",
    "mustNotText": "Do not invent facts.\nDo not bypass approval.",
    "successSignalsText": "Ground facts in tools.\nEscalate safely.",
    "thresholdsText": "baselinePassGate: 92\nvisibleMutatedPassGate: 82\nhiddenHoldoutPassGate: 76\nmaxRobustnessGap: 12",
    "tagsText": "support\nrelease-gate",
    "metadataJson": "{\"owner\":\"qa-platform\"}",
    "casesJson": "[{\"id\":\"case-1\",\"title\":\"Case 1\"}]",
    "toolsJson": "[{\"name\":\"lookup_order\",\"description\":\"Lookup order facts\",\"schema\":{\"type\":\"object\"}}]",
    "evidenceSourcesJson": "[{\"id\":\"policy.refund.v3\",\"type\":\"policy\",\"trust\":\"authoritative\"}]",
    "evidenceLinksJson": "[{\"label\":\"Benchmark notes\",\"href\":\"../../docs/benchmarks.md\"}]"
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

List release gates for a project:

```http
GET /api/benchmarks?projectId=<project-id>
```

Fetch release-gate detail, including versions, reviews, promotion candidates, and golden cases:

```http
GET /api/benchmarks?id=<benchmark-id>
```

## Remaining Benchmark Work

The API-backed lifecycle and console controls now cover the main benchmark-pack editor surface, but they are not the final production workflow. Remaining product work includes:

- row-level add/remove/reorder controls for cases, tools, evidence, thresholds, and mutation policy
- required-approver policies and reviewer load/status management
- richer review diffs with inline comments
- visible/private holdout management in the console
- promotion from real report and trace artifacts
- audit trail filtering
- server/API synchronization for CLI-authored lifecycle files
