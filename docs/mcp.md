# MCP Manifest Prototype

HarnessAmp can ingest an MCP-style tool manifest and compile it into a harness bundle.

This is not full MCP execution yet. It is the first step toward stress-testing MCP tool servers by turning tool declarations into:

- HarnessAmp tools
- schema drift surfaces
- permissioning surfaces
- tool-output trust boundaries
- benchmark scenarios

## Example

```bash
node -e "import('./src/core/mcp.js').then(({ compileMcpManifest }) => { const fs = require('fs'); const manifest = JSON.parse(fs.readFileSync('examples/mcp/tool-server-manifest.json', 'utf8')); console.log(JSON.stringify(compileMcpManifest(manifest), null, 2)); })"
```

Then pipe or save the generated bundle and run:

```bash
node scripts/harnessamp.mjs diagnose generated-mcp-bundle.json --max-mutations 12
```

## Current scope

Implemented:

- parses `tools[]`
- accepts `inputSchema`
- infers write-capable tools from name/description
- generates a HarnessAmp bundle

Not implemented yet:

- live MCP server connection
- MCP tool execution
- resource/prompt capability ingestion
- OAuth/session handling
