# HarnessAmp

[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Node 18+](https://img.shields.io/badge/Node-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Browser UI](https://img.shields.io/badge/Browser-Workbench-1f2937)](#browser-workbench)
[![CLI First](https://img.shields.io/badge/CLI-first-orange)](#terminal-ui)
[![JSON Bundles](https://img.shields.io/badge/JSON-bundles-4C78FF)](#quick-start)

<p align="center">
  <img src="output/playwright/readme-hero.png" alt="HarnessAmp browser workbench overview" width="900">
  <br/>
  <em>Browser workbench showing the live robustness score, mutation families, and hidden holdout gap.</em>
</p>

HarnessAmp is a harness-hardening lab for AI agents. It combines a browser workbench, a terminal CLI, and a shared analysis engine so you can move from bundle to report to exported pack without switching tools.

It is optimized for terminal-first and CLI-first workflows:

- JSON bundles that are easy to generate from shell scripts or Python jobs
- live reports that can be inspected in the browser or pasted into a terminal window
- visible and hidden variants that surface wrapper drift before release

## Why use this tool

- Catch wrapper drift before it becomes a shipping bug.
- Compare visible variants against hidden holdouts.
- Diagnose whether the brittle surface is prompt wording, tool contracts, schema shape, timing, or scenario coverage.
- Export report text and pack JSON for CI, PR review, or incident notes.
- Keep the same analysis path available from a browser, shell, or automated job.

## Installation

### From source

```bash
git clone https://github.com/dwamenad/HarnessAmp.git
cd HarnessAmp
npm install
npm run dev
```

### Common commands

| Task | Command |
| --- | --- |
| Start the browser workbench | `npm run dev` |
| Run the terminal report | `npm run analyze` |
| Analyze a bundle file | `npm run analyze -- examples/demo-bundle.json` |
| Export the generated pack JSON | `npm run analyze -- examples/demo-bundle.json --pack` |
| Build for production | `npm run build` |
| Run the tests | `npm test` |

## Quick start

### CLI-first workflow

This is the fastest path when you want the report in a terminal window, shell script, or CI log:

```bash
npm run analyze -- examples/cli/quickstart-bundle.json
npm run analyze -- examples/cli/quickstart-bundle.json examples/cli/observed-runs.json
npm run analyze -- examples/cli/quickstart-bundle.json --pack
```

### Browser workbench

Open `npm run dev`, paste a harness bundle, and compare visible variants against hidden holdouts from the inspector panel.

The browser and terminal use the same analysis engine, so the score, gap, and weakest surface stay aligned across both surfaces.

## Terminal UI

The terminal view is the main review surface for CLI-first workflows. It keeps the current report text visible in a shell-friendly format so you can copy it into notes, PRs, or CI logs.

<p align="center">
  <img src="output/playwright/readme-terminal.png" alt="HarnessAmp terminal report view" width="900">
  <br/>
  <em>Terminal-first report view with the same analysis text used by the browser UI.</em>
</p>

Use the CLI when you want the shortest path from bundle to diagnosis:

```bash
npm run analyze -- examples/demo-bundle.json
npm run analyze -- examples/demo-bundle.json examples/cli/observed-runs.json
npm run analyze -- examples/demo-bundle.json --pack
```

The report highlights:

- visible vs hidden pass rates
- the robustness gap
- the weakest surface family
- short recommendations for hardening

## What the product is for

HarnessAmp is not a benchmark runner. It is a harness hardening tool.

It looks for cases where an agent only succeeds because it learned one exact wrapper:

- prompt wording
- tool names
- schema layout
- retry timing
- scenario order

HarnessAmp mutates those surfaces and highlights the widest gaps so you can fix brittle parts before release.

## Examples and walkthroughs

- [Documentation home](docs/index.md)
- [Installation guide](docs/installation.md)
- [Usage guide](docs/usage.md)
- [CLI guide](docs/cli.md)
- [Examples guide](docs/examples.md)
- [Testing guide](docs/testing.md)
- [Troubleshooting guide](docs/troubleshooting.md)
- [API reference](docs/reference/api.md)
- [Architecture guide](docs/architecture.md)

## Repository layout

- `docs/` - architecture, usage, CLI, testing, and troubleshooting notes
- `examples/` - starter bundles and example packs
- `output/playwright/` - README screenshots and browser captures
- `scripts/` - terminal helpers and report tooling
- `src/` - the browser UI and shared analysis engine
- `tests/` - Node test coverage for the scoring logic

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md), and [STYLE_GUIDE.md](STYLE_GUIDE.md).
