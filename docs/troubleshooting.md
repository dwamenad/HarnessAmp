# Troubleshooting

## The bundle will not parse

- Make sure the JSON is valid.
- Check for trailing commas.
- Use the browser editor status line to see the parse error.

## The score does not update

- Confirm the bundle contains a `harness` object.
- Reload the page if localStorage has stale data.

## Copy buttons do nothing

- Clipboard permissions can be blocked by the browser or host shell.
- Try the CLI `--pack` output if you need a file instead.

