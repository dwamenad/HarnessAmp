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

