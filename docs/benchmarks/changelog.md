# Benchmark changelog and governance

## Current benchmark versions

- RetrievalGuard Smoke v0.1
- RetrievalGuard Standard v0.1
- FinanceGuard Smoke v0.1
- HealthGuard Smoke v0.1
- CustomerCareGuard Smoke v0.1
- LegalGuard Smoke v0.1

## Identity rules

Benchmark results preserve immutable identity at completion time: benchmark id, slug, name, version, pack id/name/version, tier, scenario set version, scoring profile id/version, gate profile id/version, and creation timestamp. Reports must read these stored fields from the result snapshot, not from the live registry.

## Snapshots

Every completed benchmark result stores a `benchmarkSnapshot` with benchmark identity, domain, scenario count, contract ids, mutation family ids, scoring profile snapshot, gate profile snapshot, description, and capture time. Old reports use this stored snapshot so later registry edits do not change historical evidence.

## Run types

- `official`: no advanced overrides changed the selected benchmark definition.
- `customized`: a versioned benchmark was used as a base, but pack, tier, scenario count, scoring, gate, or fail condition was changed.
- `sample`: seeded reports and capped sample runs. These are useful for preview or demos but are not official benchmark evidence.

Customized runs store `baseBenchmarkId`, `baseBenchmarkSlug`, `overridesApplied`, and a customization reason. Seeded reports must keep `evidenceMode` and `benchmarkRunType` marked as sample.

## Versioning policy

Scoring profile changes require a scoring profile version bump. Gate threshold changes require a gate profile version bump. Scenario additions, removals, or fixture changes require a scenario set version bump. Pack behavior changes should bump pack version when available.

## CI output

The deterministic CI output schema is `harnessamp.ci.v0.1`. Exit codes are:

- `0`: pass
- `1`: warn when strict mode treats warnings as failure
- `2`: block
- `3`: infrastructure or runtime failure
- `4`: invalid config or invalid benchmark slug

CI consumers should parse the machine-readable output rather than scraping human report text.
