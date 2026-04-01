# Troubleshooting

## The bundle will not parse

- Make sure the JSON is valid.
- Check for trailing commas.
- Use the browser editor status line to see the parse error.

## The score does not update

- Confirm the bundle contains a `harness` object.
- Reload the page if localStorage has stale data.

## The layer view shows inferred data

- The bundle is missing explicit `intent`, `contract`, or `benchmark` sections.
- Use the trace compiler to draft those sections from approved traces.
- Do not treat inferred layers as a strong release gate until they are reviewed and promoted.

## Docker commands are not found

- Docker Desktop can be installed without `docker` being on your shell `PATH`.
- Use `PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"` before Docker commands on macOS if needed.

## Copy buttons do nothing

- Clipboard permissions can be blocked by the browser or host shell.
- Try the CLI `--pack` output if you need a file instead.
