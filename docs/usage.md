# Usage

HarnessAmp supports two primary workflows:

Regardless of entrypoint, the analysis should be read in this order:

1. `intent`
2. `contract`
3. `benchmark`
4. `wrapper`

The first three should stay fixed. The wrapper is the only layer that should drift under mutation.

## Browser UI

- Open the app with `npm run dev`.
- The command starts both the Vite UI and the local API runtime.
- Paste or import a harness bundle.
- Check whether the `intent`, `contract`, and `benchmark` layers are explicit or inferred.
- Paste observed runs if you have real results.
- Compare visible variants against hidden holdouts.

## Terminal CLI

- Run `npm run analyze` for the built-in demo bundle.
- Pass a bundle file to analyze your own harness.
- Add `--pack` to export the generated variant pack JSON.
- Use the CLI when you want the report in text form for a terminal window, script, or CI log.
- Treat the browser as a review surface rather than the only place to use the tool.
- Treat inferred layers as a prompt to formalize the pack before using the output as a release gate.

## Trace compiler

- Run `npm run compile:traces` for the built-in approved trace demo.
- Pass a trace corpus file to compile your own approved traces into a draft `intent`, `contract`, and `benchmark`.
- Use this before mutation testing when you have traces and SOPs but no clean release-gate pack yet.

## Failure corpus

- Run `npm run collect:failures -- <bundle.json> <observations.json>` to extract failed variants into a reusable corpus.
- Store the corpus over time and use it to prioritize new mutation families and regression checks.
- Treat this as the internal moat layer, not just another report artifact.

## Release gate

- Run `npm run release:gate -- <bundle.json> <observations.json>` to enforce thresholds on overall score, holdout pass rate, and visible-vs-holdout gap.
- Write markdown/json artifacts from the same command for CI and PR review.
- Use lenient thresholds first, then tighten them as the release gate matures.

## Mutation diagnosis

- Run `npm run diagnose -- <bundle.json>` to generate failure-profile coverage, run baseline and mutated tasks through the mock runner, classify failures, and print a diagnostic report.
- Use `node scripts/harnessamp.mjs registry` to inspect the internal mutation packs behind those failure profiles.
- Use `node scripts/harnessamp.mjs mutate <bundle.json> --max-mutations 20` to inspect deterministic mutation records before running them.
- Treat sandbox-boundary mutations as defensive checks only; they describe expected boundary enforcement without procedural exploit steps.

## Docker

- Run `npm run docker:build` to build the production image.
- Run `docker run --rm -p 8088:80 harnessamp:local` to serve the static build through Nginx.
