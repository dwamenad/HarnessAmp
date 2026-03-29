# CLI

The CLI uses the same engine as the browser UI.

```bash
npm run analyze
npm run analyze -- examples/demo-bundle.json
npm run analyze -- examples/demo-bundle.json --pack
npm run analyze -- examples/demo-bundle.json examples/cli/observed-runs.json
```

Flags:

- `--json` prints the full analysis object.
- `--pack` prints the generated pack payload.
- no flag prints the markdown report.

Typical terminal-first flow:

1. Save a harness bundle as JSON.
2. Run `npm run analyze -- <bundle.json>`.
3. Inspect visible vs holdout gaps directly in the terminal.
4. Export the pack if you want to share it with another teammate or CI job.
