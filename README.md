# Toolrail

Chile and LATAM data utilities for agents and automations: UF conversion, RUT format/checksum checks, business days, FX, inflation-indexed units and more.

**[Try it free in your browser](https://toolrail.dev/probar?utm_source=github)** · **[Integration guide](https://toolrail.dev/integrate?utm_source=github)** · **[Español](https://toolrail.dev/es?utm_source=github)**

## Get a first result

The [browser demo](https://toolrail.dev/try?utm_source=github) lets you convert 50 UF to Chilean pesos, check an example RUT and add Chilean business days to a date. It uses the existing MCP tools, with no account or wallet required.

The free MCP demo exposes **27 JSON tools**, limited to **30 tool calls per anonymous client per UTC day**. Browser demo calls share that quota.

For **Claude Code**, run:

```sh
claude mcp add --transport http toolrail https://toolrail.dev/mcp
```

Then ask:

```text
Use Toolrail to convert 50 UF to Chilean pesos.
Include the value date and source.
```

For Cursor, VS Code and Claude Desktop/Web, follow the [client-specific instructions](https://toolrail.dev/integrate?utm_source=github). Cursor has a direct installation button.

For a free Node.js call with no wallet or API key, use [the runnable MCP example](examples/mcp-free.mjs) and [its setup instructions](examples/MCP-README.md). Editor configurations are included for [Cursor](examples/cursor-mcp.json) and [VS Code](examples/vscode-mcp.json). Merge them with existing servers.

## Para comenzar en español

[Prueba gratis UF, RUT y días hábiles](https://toolrail.dev/probar?utm_source=github). Después [conecta Toolrail a tu agente](https://toolrail.dev/integrar?utm_source=github) o ejecuta el ejemplo MCP de Node. La demo permite 30 llamadas por cliente anónimo y día UTC. El alojamiento gratuito puede tardar en arrancar después de inactividad.

## Runnable reports / Reportes ejecutables

The [workflow guide](examples/WORKFLOWS.md) includes three free Node.js workflows: a UF report with its date/source, batch RUT format/checksum validation, and Chilean deadline reports. They reuse existing MCP tools, run sequentially and identify partial results or tool errors. Each batch is limited to ten rows and shares the existing free quota.

Descarga [workflows.mjs](examples/workflows.mjs), los [RUT ilustrativos](examples/ruts.example.json) y los [plazos de ejemplo](examples/deadlines.example.json). Sigue las [instrucciones en español](examples/WORKFLOWS.md): no requiere cuenta, wallet ni pago. Los RUT no verifican identidad y los plazos hábiles usan el calendario nacional 2026–2027.

## Production HTTP API

The [live catalog](https://toolrail.dev/.well-known/agent-catalog.json) lists **30 paid resources** and their current prices. Most utilities cost **0.002–0.015 USDC per call**; the downloadable guide PDF is separately priced. Every paid endpoint accepts USDC on Base or Solana mainnet through **x402 v2**.

An unpaid call returns HTTP `402` with a base64 JSON `PAYMENT-REQUIRED` header. An x402 client signs a payment authorization and retries using `PAYMENT-SIGNATURE`. Configure a funded wallet and inspect the quote before signing. The API does not require an account, API key or subscription.

- [Download a Node.js buyer example](https://toolrail.dev/assets/examples/x402-buyer.mjs)
- [Example setup and spending limit](https://toolrail.dev/assets/examples/README.md)
- [OpenAPI specification](https://toolrail.dev/openapi.json)
- [Agent instructions](https://toolrail.dev/skill.md)

The buyer example defaults to quote inspection and requires an explicit opt-in for a paid request. Keep private keys in your local environment.

## Useful workflows and scope

| Workflow | What to check |
| --- | --- |
| [UF conversion](https://toolrail.dev/api/uf-chile) | Value date, source and any fallback marker |
| [RUT checks](https://toolrail.dev/api/validar-rut) | Format and checksum only; does not verify identity or tax registration |
| [Chilean business days](https://toolrail.dev/api/dias-habiles-chile) | National calendar for 2026–2027, counting rule and skipped holidays |
| LATAM FX | Individual observation dates, sources and partial errors; Argentina's blue rate is a market quote |
| International holidays | Country and year support from the upstream calendar provider |

The service combines public data sources and calculations. Sources include the ECB, EU VAT/VIES services, Latin American institutions, calendar providers and market-data providers. Results have different update schedules and coverage; consult each endpoint's documentation before relying on a value.

## Architecture and this repository

The service uses Node.js, Express, the x402 SDKs and Streamable HTTP MCP. MCP tools reuse the corresponding HTTP handlers. PDF generation uses Chromium with JavaScript disabled and external requests blocked. Production runs in Docker on Render, with a custom domain and TLS.

**This repository is a curated source snapshot for portfolio purposes.** It does not track every production change. Use the live catalog and integration guide for current behavior, quotas and prices. Production configuration and private credentials are maintained separately.

To explore the snapshot locally with Node.js 22+:

```sh
npm install
npm start
npm test
```

Without payout addresses, the local service starts in preview mode at `http://localhost:4402`. Chromium or a compatible browser is required for PDFs.

[Toolrail](https://toolrail.dev/es?utm_source=github) · [Build guide](https://toolrail.dev/guia?lang=es&utm_source=github) · [GitHub: @owervanz](https://github.com/owervanz)
