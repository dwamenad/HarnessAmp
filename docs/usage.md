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
- Use this before mutation testing when you have traces and SOPs but no clean benchmark pack yet.
