# Usage

HarnessAmp supports two primary workflows:

## Browser UI

- Open the app with `npm run dev`.
- Paste or import a harness bundle.
- Paste observed runs if you have real results.
- Compare visible variants against hidden holdouts.

## Terminal CLI

- Run `npm run analyze` for the built-in demo bundle.
- Pass a bundle file to analyze your own harness.
- Add `--pack` to export the generated variant pack JSON.
- Use the CLI when you want the report in text form for a terminal window, script, or CI log.
- Treat the browser as a review surface rather than the only place to use the tool.

## Trace compiler

- Run `npm run compile:traces` for the built-in approved trace demo.
- Pass a trace corpus file to compile your own approved traces into a draft `intent`, `contract`, and `benchmark`.
- Use this before mutation testing when you have traces and SOPs but no clean benchmark pack yet.
