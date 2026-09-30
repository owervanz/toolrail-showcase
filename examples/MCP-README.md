# Toolrail: a free MCP request from Node.js

Use Node.js 22 or later. Download `mcp-free.mjs` into an empty folder, then run:

```sh
npm init -y
npm install @modelcontextprotocol/sdk@1.30.0
node mcp-free.mjs
```

This makes one `cl_rut` call with a public example RUT. It checks format and
checksum, not identity or tax registration. To convert 50 UF instead:

```sh
node mcp-free.mjs uf
```

The MCP demo allows 30 tool calls per anonymous client per UTC day, shared with
the browser demo. Invalid attempts also consume quota. There are no payments,
wallets, API keys or subscriptions in this example. Errors are printed instead
of replacing unavailable data with estimates. UF results include date and source.

The free host may need time to start after inactivity. Connection setup allows
90 seconds; tool calls allow 60 seconds. Calls are not automatically retried.

## Editors

- Cursor: merge `cursor-mcp.json` into `.cursor/mcp.json`.
- VS Code: merge `vscode-mcp.json` into `.vscode/mcp.json`.
- Keep existing server entries. Review the remote URL before enabling tools.
- Client/model availability and any client charges depend on your chosen client;
  Toolrail's MCP demo is free within its quota.

Full integration guide: https://toolrail.dev/integrate
Spanish: https://toolrail.dev/integrar
