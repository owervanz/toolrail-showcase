<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&height=160&section=header&text=Toolrail&fontSize=48&animation=fadeIn&fontAlignY=38&desc=A%20production%20API%20that%20gets%20paid%20by%20AI%20agents,%20not%20humans&descAlignY=62&descAlign=50" width="100%"/>

**Live product:** [toolrail.dev](https://toolrail.dev) &nbsp;·&nbsp; **Guide:** [toolrail.dev/guia](https://toolrail.dev/guia) &nbsp;·&nbsp; **By:** [@owervanz](https://github.com/owervanz)

<img src="https://img.shields.io/badge/status-live%20in%20production-4ade80?style=for-the-badge" />
<img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" />
<img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
<img src="https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white" />
<img src="https://img.shields.io/badge/Base-0052FF?style=for-the-badge&logo=coinbase&logoColor=white" />
<img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" />

</div>

---

## What this is

An API that AI agents pay for **autonomously, in USDC, per request** — no accounts, no API keys, no subscriptions. Built on **x402**, the HTTP-native payment protocol Coinbase shipped in 2026 (Visa, Mastercard, Google and Stripe joined its foundation the same year). When an agent calls a paid endpoint without paying, the server replies with the standard `402 Payment Required` and machine-readable payment instructions; the agent pays, retries, gets the resource. I designed, built, secured and deployed the whole thing solo, end to end.

**The niche:** official operational data for Latin America that no one else in the ecosystem serves — tax-ID validation for 7 countries, central-bank FX rates, inflation-indexed units, business-day math for 187 countries, plus PDF/QR generation and EU VAT tooling.

## By the numbers

| | |
|---|---|
| **30** paid endpoints | live, cataloged, priced individually |
| **7** countries | official tax-ID check-digit algorithms (Chile, Argentina, Brazil, Mexico, Peru, Colombia, Spain) |
| **6** central banks | integrated as live data sources (Chile, Argentina, Brazil, Mexico, Colombia, Peru) |
| **2** payment networks | Base + Solana mainnet, every endpoint accepts both |
| **3** languages | product docs shipped in Spanish, English, Portuguese |
| **27** MCP tools | same data, zero payment, free discovery channel for Claude/Cursor |
| **64** automated tests | run 3x per change before every deploy — this repo included |
| **3** security audits | data-integrity, adversarial, and hardening passes (details below) |

## Architecture

- **Payment layer:** [x402 v2](https://x402.org) resource server (`@x402/express`, `@x402/core`) wired to the Coinbase CDP facilitator for mainnet settlement and automatic marketplace discovery (`bazaarResourceServerExtension`) — plus a free testnet facilitator fallback for local development.
- **Data layer:** live integrations with official sources only — European Central Bank, EU Commission (VAT/VIES), Nager.Date (187-country holidays), and six Latin American central banks — with **defensive JSON parsing** for legacy government backends (see "real bugs" below).
- **Document generation:** headless-Chrome PDF rendering (Puppeteer) with JavaScript disabled and all network requests blocked mid-render — hardened against SSRF from user-supplied HTML.
- **Delivery:** Docker on Render, auto-deployed on push; custom domain, TLS, DNS.
- **Two distribution channels, one source of truth:** the paid x402 HTTP API is the unlimited, agent-native channel; an [MCP server](https://modelcontextprotocol.io) (`POST /mcp`, Streamable HTTP) exposes 27 of the same tools for free, rate-limited, for wallet-less clients like Claude Desktop or Cursor (`claude mcp add --transport http toolrail https://toolrail.dev/mcp`). Every MCP tool calls the **exact same handler function** as its HTTP route through a small Express req/res adapter (see [`src/mcp.js`](src/mcp.js)) — zero business-logic duplication between the two surfaces.

## Real bugs I hit and fixed

Three, worth reading if you're building on this stack:

1. **Solana testnet vs. devnet.** Solana has three confusingly-named test networks. I hardcoded the wrong CAIP-2 identifier and the deploy crashed with `facilitator does not support this scheme`. Fix: query the facilitator's `/supported` endpoint instead of trusting general docs — see [`src/config.js`](src/config.js).
2. **JSON that isn't JSON.** One central-bank source occasionally appends raw PHP warning dumps *after* valid JSON, and returns `"n.d."` instead of numbers on weekends. Fixed with balanced-brace extraction and walk-back-to-last-numeric-value logic — see [`src/latam.js`](src/latam.js) (`bcrpJson`).
3. **Security that bit its own tail.** A strict CSP (`default-src 'none'`) added during a hardening pass silently blocked the page's own favicon `<link>` tag. Nobody caught it in automated tests — only cross-browser manual QA did. Fixed with a scoped `img-src 'self'` — see [`src/security.js`](src/security.js).

## Security

Three audit passes, each with regression tests baked into `test/smoke.mjs`:

- **Data integrity** — day-accurate values across timezones (`todayIn()` per-country), dual-source fallback for critical data.
- **Adversarial** — credential sanitization in error messages, SSRF-hardened PDF rendering, secret-free git history.
- **Hardening** — per-IP rate limiting, HSTS/CSP/X-Frame-Options, timing-safe admin auth, clean JSON error boundaries (no stack traces ever reach the client).

## Run it yourself

```bash
npm install
npm start        # http://localhost:4402, free mode — no wallet needed to explore
npm test         # 64 automated checks against a live local instance
```

## Stack

<img src="https://skillicons.dev/icons?i=nodejs,js,docker,express,git&perline=12" />

---

<div align="center">

This repo is a curated snapshot for portfolio purposes. The production service — with its live payment configuration, monitoring and business logic for distribution — is deployed and maintained privately.

**[→ See it live at toolrail.dev](https://toolrail.dev)**

</div>
