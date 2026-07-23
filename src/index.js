// Toolrail — utility API for AI agents, pay-per-call via x402.
// Products: PDF generation, EU VAT (rates + VIES validation), ECB FX rates,
// and Chilean operational data (UF/UTM, business days, RUT, net salary, pharmacies).
//
// Payments: x402 v2 (@x402/express). Runs in FREE mode until EVM_PAY_TO and/or
// SOL_PAY_TO are configured, so everything is testable without a wallet.

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { createFacilitatorConfig } from "@coinbase/x402";
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";

import { config, NETWORKS, paymentsEnabled } from "./config.js";
import { pdfEndpoint, pdfTemplatesInfo, renderPdfQueued } from "./pdf.js";
import { guideWebHtml, guidePdfHtml, resolveLang } from "./guide.js";
import { vatRates, vatValidate, vatPrice } from "./vat.js";
import { fxConvert, fxRates, fxCurrencies } from "./fx.js";
import {
  clIndicadores, clUfConvert, clDiasHabiles, clFeriados, clRut, clSueldoLiquido, clFarmacias, clReajuste,
} from "./chile.js";
import { brIndices, brCep } from "./brasil.js";
import { arIndices, coTrm, peTipoCambio, mxIndicadores, latamFx, fxSnapshot } from "./latam.js";
import { daysHolidays, daysBusinessDays, validateIban, validatePhone, qrEndpoint } from "./global.js";
import { validateTaxId, latamIndexacion, latamDolarArgentina } from "./latam.js";
import { landingHtml, llmsTxt, openapiSpec, skillMd } from "./landing.js";
import { mcpHandler, MCP_TOOL_COUNT } from "./mcp.js";
import { PREVIEWS } from "./previews.js";
import { statsMiddleware, statsEndpoint, registerKnownPaths, startStatsLogging } from "./stats.js";
import { rateLimiter, securityHeaders, LANDING_CSP } from "./security.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // behind Render's proxy: req.ip = real client IP
app.use(securityHeaders);
app.use(rateLimiter);
app.use(express.json({ limit: "600kb" }));
// Open CORS: agents and web clients anywhere may call us; expose the x402
// payment headers so browser-based clients can read the 402 challenge.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-PAYMENT, PAYMENT, PAYMENT-SIGNATURE");
  res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE, Content-Disposition");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(statsMiddleware); // count every request (before the paywall) — see /admin/stats

// ---------- Paid route catalog (descriptions double as Bazaar discovery copy) ----------

const CATALOG = [
  { route: "POST /pdf", price: config.prices.pdf,
    description: "Generate a print-ready PDF from JSON data (invoice, report, contract templates) or raw HTML. Returns application/pdf. No account or subscription needed.",
    example: `curl -X POST ${config.baseUrl}/pdf -H "Content-Type: application/json" -d '{"template":"invoice","data":{"number":"F-001","currency":"USD","tax_rate":19,"issuer":{"name":"Acme"},"client":{"name":"Client Inc"},"items":[{"description":"Consulting","quantity":2,"unit_price":150}]}}' -o invoice.pdf` },
  { route: "GET /vat/rates", price: config.prices.vatRate,
    description: "Current VAT rates for 44 European countries (EU-27 + UK, CH, NO...). Standard, reduced and super-reduced rates, sourced daily from the European Commission TEDB.",
    example: `curl "${config.baseUrl}/vat/rates?country=DE"` },
  { route: "POST /vat/validate", price: config.prices.vatValidate,
    description: "Validate an EU VAT number against the official European Commission VIES registry, with retries and caching for reliability. Returns validity, company name and address.",
    example: `curl -X POST ${config.baseUrl}/vat/validate -H "Content-Type: application/json" -d '{"countryCode":"IE","vatNumber":"6388047V"}'` },
  { route: "POST /vat/price", price: config.prices.vatRate,
    description: "VAT price calculator for 44 European countries: net-to-gross or gross-to-net with the current standard or reduced rate. Returns net, VAT amount and gross.",
    example: `curl -X POST ${config.baseUrl}/vat/price -H "Content-Type: application/json" -d '{"amount":100,"country":"DE","direction":"net-to-gross"}'` },
  { route: "GET /fx/convert", price: config.prices.fx,
    description: "Convert between 30+ major currencies using official European Central Bank reference rates, current or historical since 1999.",
    example: `curl "${config.baseUrl}/fx/convert?from=USD&to=EUR&amount=100"` },
  { route: "GET /fx/rates", price: config.prices.fx,
    description: "Full ECB reference rate table for any base currency, current or for a historical date since 1999.",
    example: `curl "${config.baseUrl}/fx/rates?base=USD"` },
  { route: "GET /days/holidays", price: config.prices.clDiasHabiles,
    description: "Official public holidays for 187 countries (any year 1975-2075): date, local and English name, nationwide vs regional flag. Chile enhanced with a curated statutory table.",
    example: `curl "${config.baseUrl}/days/holidays?country=DE&year=2026"` },
  { route: "GET /days/business-days", price: config.prices.clDiasHabiles,
    description: "Business-day calculator for 187 countries: add N working days to a date skipping weekends and official public holidays. Essential for scheduling, deadlines and logistics.",
    example: `curl "${config.baseUrl}/days/business-days?country=US&from=2026-08-01&days=10"` },
  { route: "POST /validate/iban", price: config.prices.clRut,
    description: "Validate an IBAN (international bank account number): ISO 13616 mod-97 check digits and per-country length registry for 88 countries. Returns formatted IBAN and BBAN.",
    example: `curl -X POST ${config.baseUrl}/validate/iban -H "Content-Type: application/json" -d '{"iban":"DE89 3704 0044 0532 0130 00"}'` },
  { route: "POST /validate/phone", price: config.prices.clRut,
    description: "Validate and format phone numbers for ~240 regions (Google libphonenumber): validity, region, line type, E.164 / international / national formats.",
    example: `curl -X POST ${config.baseUrl}/validate/phone -H "Content-Type: application/json" -d '{"phone":"+56 9 6123 4567"}'` },
  { route: "POST /validate/tax-id", price: config.prices.clIndicador,
    description: "Validate tax IDs across Latin America and Spain with official check-digit algorithms: Chile RUT, Argentina CUIT/CUIL, Brazil CPF and CNPJ, Mexico RFC, Peru RUC, Colombia NIT, Spain NIF/NIE. The only pan-LATAM ID validator for agents.",
    example: `curl -X POST ${config.baseUrl}/validate/tax-id -H "Content-Type: application/json" -d '{"country":"BR","id":"529.982.247-25"}'` },
  { route: "GET /latam/indexacion", price: config.prices.clIndicador,
    description: "Latin American inflation-indexed units used in real contracts, mortgages and rents: UF (Chile), UVA (Argentina), UVR (Colombia), UDI (Mexico) — live official central-bank values with local-currency conversion.",
    example: `curl "${config.baseUrl}/latam/indexacion?unidad=uva&monto=100"` },
  { route: "GET /latam/dolar-argentina", price: config.prices.clIndicador,
    description: "Argentine dollar quotes in one call: oficial, blue (parallel) and euro rates plus the gap percentage — the region's most watched FX spread.",
    example: `curl "${config.baseUrl}/latam/dolar-argentina"` },
  { route: "GET /latam/fx", price: config.prices.latamFx,
    description: "All official LATAM exchange rates against USD in ONE call: Chilean peso (central bank), Argentine oficial+blue with gap, Brazilian real (PTAX), Mexican peso (FIX), Colombian peso (legal TRM) and Peruvian sol (SBS). The region's FX aggregator no one else serves.",
    example: `curl "${config.baseUrl}/latam/fx"` },
  { route: "GET /br/indices", price: config.prices.clIndicador,
    description: "Brazil's key official rates in one call: SELIC target, annualized CDI, monthly IPCA inflation and PTAX dollar — straight from Banco Central do Brasil's SGS API.",
    example: `curl "${config.baseUrl}/br/indices"` },
  { route: "GET /br/cep", price: config.prices.clRut,
    description: "Brazilian postal code (CEP) lookup: street, neighborhood, city, state and IBGE code for any of Brazil's 700k+ CEPs.",
    example: `curl "${config.baseUrl}/br/cep?cep=01310-100"` },
  { route: "GET /ar/indices", price: config.prices.clIndicador,
    description: "Argentina's macro pulse: latest monthly inflation, compounded year-over-year inflation, and country risk (riesgo país) in basis points.",
    example: `curl "${config.baseUrl}/ar/indices"` },
  { route: "GET /co/trm", price: config.prices.clIndicador,
    description: "Colombia's official TRM (Tasa Representativa del Mercado) — the legal COP/USD rate used for taxes and contracts, with validity dates.",
    example: `curl "${config.baseUrl}/co/trm"` },
  { route: "GET /pe/tipo-cambio", price: config.prices.clIndicador,
    description: "Peru's official SBS exchange rate (buy/sell PEN per USD) from the central bank (BCRP).",
    example: `curl "${config.baseUrl}/pe/tipo-cambio"` },
  { route: "GET /mx/indicadores", price: config.prices.clIndicador,
    description: "Mexico's official FIX dollar rate (used for obligations) and TIIE 28-day interest rate, from Banco de México.",
    example: `curl "${config.baseUrl}/mx/indicadores"` },
  { route: "GET /cl/reajuste", price: config.prices.clSueldo,
    description: "Chilean IPC adjustment calculator: compound official monthly inflation between two months to reajust any amount — the standard calculation for rents, alimony and contracts in Chile.",
    example: `curl "${config.baseUrl}/cl/reajuste?desde=2025-01&hasta=2025-06&monto=500000"` },
  { route: "POST /qr", price: config.prices.clRut,
    description: "Generate a QR code as PNG or SVG from any text or URL (up to 2000 chars, 64-2048 px). Pairs with the PDF endpoint for payment links and labels.",
    example: `curl -X POST ${config.baseUrl}/qr -H "Content-Type: application/json" -d '{"data":"https://toolrail.dev","format":"png","size":512}' -o qr.png` },
  { route: "GET /cl/indicadores", price: config.prices.clIndicador,
    description: "Chilean economic indicators: UF, UTM, dolar observado, euro, IPC — current or for a given date. Official Banco Central de Chile data.",
    example: `curl "${config.baseUrl}/cl/indicadores?indicador=uf"` },
  { route: "GET /cl/uf", price: config.prices.clIndicador,
    description: "Convert amounts between UF (Unidad de Fomento) and Chilean pesos at any date. Essential for Chilean contracts, rents and insurance.",
    example: `curl "${config.baseUrl}/cl/uf?monto=50&direccion=uf-clp"` },
  { route: "GET /cl/dias-habiles", price: config.prices.clDiasHabiles,
    description: "Chilean business-day calculator: add N working days to a date respecting national holidays. Types: administrativo (Mon-Fri) or corrido.",
    example: `curl "${config.baseUrl}/cl/dias-habiles?desde=2026-08-01&plazo=10"` },
  { route: "GET /cl/feriados", price: config.prices.clDiasHabiles,
    description: "Official Chilean public holidays for 2026-2027 as structured JSON, including statutory moved holidays.",
    example: `curl "${config.baseUrl}/cl/feriados?ano=2026"` },
  { route: "POST /cl/rut", price: config.prices.clRut,
    description: "Validate and format a Chilean RUT (tax ID) including check digit (modulo 11).",
    example: `curl -X POST ${config.baseUrl}/cl/rut -H "Content-Type: application/json" -d '{"rut":"12.345.678-5"}'` },
  { route: "POST /cl/sueldo-liquido", price: config.prices.clSueldo,
    description: "Chilean net salary calculator: gross to net with AFP, health, unemployment insurance and impuesto unico using live UF/UTM values and current legal brackets.",
    example: `curl -X POST ${config.baseUrl}/cl/sueldo-liquido -H "Content-Type: application/json" -d '{"bruto":1500000,"afp":"modelo"}'` },
  { route: "GET /cl/farmacias-turno", price: config.prices.clFarmacias,
    description: "On-duty (night shift) pharmacies in Chile by comuna, from the official MINSAL registry.",
    example: `curl "${config.baseUrl}/cl/farmacias-turno?comuna=VALPARAISO"` },
  { route: "GET /guia/pdf", price: "$7.00",
    description: "PDF edition of 'Build your own x402 API' — available in Spanish, English or Portuguese (?lang=es|en|pt). A real-world walkthrough of building Toolrail: architecture, real bugs found and fixed, security checklist, discovery channels, and an honest revenue simulation. Includes a printable launch checklist. One-time purchase.",
    example: `curl "${config.baseUrl}/guia/pdf?lang=en" -o guide-x402.pdf` },
];

// ---------- x402 wiring ----------

if (paymentsEnabled()) {
  const nets = NETWORKS[config.networkMode] || NETWORKS.testnet;
  // With CDP credentials use Coinbase's facilitator (mainnet settlement + Bazaar
  // auto-listing); otherwise the free x402.org facilitator (testnet).
  const useCdp = Boolean(config.cdpApiKeyId && config.cdpApiKeySecret);
  const facilitatorConfig = useCdp
    ? createFacilitatorConfig(config.cdpApiKeyId, config.cdpApiKeySecret)
    : { url: config.facilitatorUrl };
  const facilitator = new HTTPFacilitatorClient(facilitatorConfig);
  const resourceServer = new x402ResourceServer(facilitator);
  // Bazaar discovery extension: marks our 402s as discoverable so the CDP
  // facilitator can index the service in the Bazaar catalog.
  resourceServer.registerExtension(bazaarResourceServerExtension);
  if (config.evmPayTo) resourceServer.register(nets.evm, new ExactEvmScheme());
  if (config.solPayTo) resourceServer.register(nets.svm, new ExactSvmScheme());

  const TAGS_BY_PREFIX = {
    "/pdf": ["documents", "pdf", "invoices", "reports"],
    "/vat": ["vat", "tax", "europe", "compliance"],
    "/fx": ["currency", "exchange-rates", "ecb", "finance"],
    "/days": ["holidays", "business-days", "calendar", "global"],
    "/validate": ["validation", "iban", "phone", "tax-id", "compliance"],
    "/latam": ["latam", "indexation", "argentina", "colombia", "mexico", "finance"],
    "/br": ["brazil", "latam", "selic", "ipca", "cep", "finance"],
    "/ar": ["argentina", "latam", "inflation", "riesgo-pais", "finance"],
    "/co": ["colombia", "latam", "trm", "finance"],
    "/pe": ["peru", "latam", "exchange-rate", "finance"],
    "/mx": ["mexico", "latam", "fix", "tiie", "finance"],
    "/qr": ["qr-codes", "images", "utilities"],
    "/cl": ["chile", "latam", "uf", "payroll"],
    "/guia": ["guide", "education", "x402", "tutorial", "spanish"],
  };
  const tagsFor = path => TAGS_BY_PREFIX[Object.keys(TAGS_BY_PREFIX).find(p => path.startsWith(p))] || [];

  const routes = {};
  for (const item of CATALOG) {
    const path = item.route.split(" ")[1];
    const accepts = [];
    if (config.evmPayTo) accepts.push({ scheme: "exact", price: item.price, network: nets.evm, payTo: config.evmPayTo });
    if (config.solPayTo) accepts.push({ scheme: "exact", price: item.price, network: nets.svm, payTo: config.solPayTo });
    const preview = PREVIEWS[item.route];
    routes[item.route] = {
      accepts: accepts.length === 1 ? accepts[0] : accepts,
      description: item.description,
      serviceName: config.serviceName,
      tags: tagsFor(path),
      // "Try before you buy": unpaid calls get a sample of the real response
      // shape alongside the 402 challenge, instead of an empty body.
      ...(preview ? {
        unpaidResponseBody: () => ({
          contentType: "application/json",
          body: { preview: true, example_response: preview, note: "Frozen illustrative sample — not today's value. Pay the quoted amount (x402) to get the live, current result." },
        }),
      } : {}),
    };
  }
  // Sync with the facilitator at boot: it validates networks and provides required
  // metadata (e.g. the Solana feePayer). Networks here must match its /supported list.
  app.use(paymentMiddleware(routes, resourceServer, { appName: config.serviceName }));
  console.log(`[x402] Payments ENABLED (${config.networkMode}) via ${useCdp ? "Coinbase CDP facilitator" : config.facilitatorUrl}`);
  if (config.evmPayTo) console.log(`[x402]   EVM payTo: ${config.evmPayTo} on ${nets.evm}`);
  if (config.solPayTo) console.log(`[x402]   SOL payTo: ${config.solPayTo} on ${nets.svm}`);
} else {
  console.log("[x402] FREE MODE — no payout address configured (set EVM_PAY_TO / SOL_PAY_TO to enable payments)");
}

// ---------- Routes ----------

// Docs are pure functions of the (constant) catalog — compute once at boot so
// a flood of free-endpoint requests costs near-zero CPU. The landing is
// re-rendered every 15 minutes with a live central-bank FX snapshot (still
// static between refreshes: floods stay near-zero CPU).
const STATIC_DOCS = {
  landing: landingHtml(CATALOG, config.baseUrl, null, MCP_TOOL_COUNT),
  llms: llmsTxt(CATALOG, config.baseUrl, MCP_TOOL_COUNT),
  skill: skillMd(CATALOG, config.baseUrl, MCP_TOOL_COUNT),
  openapi: openapiSpec(CATALOG, config.baseUrl),
};

async function refreshLandingLive() {
  try {
    const { monedas } = await fxSnapshot();
    if (Object.keys(monedas).length >= 3) {
      STATIC_DOCS.landing = landingHtml(CATALOG, config.baseUrl, { fx: monedas }, MCP_TOOL_COUNT);
    }
  } catch (err) {
    console.warn("[landing] live FX refresh failed:", err?.message || err);
  }
}
refreshLandingLive();
setInterval(refreshLandingLive, 15 * 60 * 1000).unref();

app.get("/", (req, res) => {
  // Browsers get the human landing page; agents and curl get the JSON catalog.
  if ((req.headers.accept || "").includes("text/html")) {
    res.setHeader("Content-Security-Policy", LANDING_CSP);
    return res.type("html").send(STATIC_DOCS.landing);
  }
  res.json({
    service: config.serviceName,
    description: "Utility API for AI agents: PDF generation, public holidays and business days for 187 countries, EU VAT, ECB FX rates, IBAN/phone validation, QR codes and Chilean operational data. Pay per call via x402 (USDC on Base / Solana). No API keys, no subscriptions.",
    payments: paymentsEnabled() ? { protocol: "x402", mode: config.networkMode } : { mode: "free (preview)" },
    endpoints: CATALOG.map(({ route, price, description, example }) => ({ route, price, description, example })),
    free_endpoints: ["GET /", "GET /health", "GET /pdf/templates", "GET /openapi.json", "GET /llms.txt", "GET /skill.md", "POST /mcp"],
    mcp: { url: `${config.baseUrl}/mcp`, transport: "streamable-http", tools: MCP_TOOL_COUNT, cost: "free (rate-limited)", setup: `claude mcp add --transport http toolrail ${config.baseUrl}/mcp` },
    docs: `${config.baseUrl}/pdf/templates`,
    openapi: `${config.baseUrl}/openapi.json`,
  });
});
app.get("/health", (req, res) => res.json({ ok: true, uptime_s: Math.round(process.uptime()) }));

// Brand assets (favicon, logo, social card)
const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");
app.use("/assets", express.static(ASSETS_DIR, { maxAge: "7d" }));
app.get("/favicon.ico", (req, res) => res.sendFile(path.join(ASSETS_DIR, "favicon-32.png")));
app.get("/favicon.svg", (req, res) => res.sendFile(path.join(ASSETS_DIR, "favicon.svg")));
app.get("/pdf/templates", pdfTemplatesInfo);
app.get("/llms.txt", (req, res) => res.type("text/plain").send(STATIC_DOCS.llms));
app.get("/skill.md", (req, res) => res.type("text/markdown").send(STATIC_DOCS.skill));

// Machine-readable service manifest at the conventional .well-known location,
// used by ecosystem crawlers and aggregators.
const wellKnownX402 = (req, res) => res.json({
  x402Version: 2,
  name: config.serviceName,
  description: "Pay-per-call utility API for AI agents: PDF generation, global holidays/business days, EU VAT, ECB FX rates, IBAN/phone/tax-ID validation, QR codes, and LATAM operational data (UF/UVA/UVR/UDI, Argentine dollar). USDC on Base & Solana. No API keys.",
  website: config.baseUrl,
  openapi: `${config.baseUrl}/openapi.json`,
  llms_txt: `${config.baseUrl}/llms.txt`,
  skill: `${config.baseUrl}/skill.md`,
  mcp: { url: `${config.baseUrl}/mcp`, transport: "streamable-http", tools: MCP_TOOL_COUNT, cost: "free (rate-limited)" },
  resources: CATALOG.map(({ route, price, description }) => {
    const [method, path] = route.split(" ");
    return { resource: `${config.baseUrl}${path}`, method, price, description };
  }),
});
app.get("/.well-known/x402.json", wellKnownX402);
app.get("/.well-known/x402", wellKnownX402);
app.get("/admin/stats", statsEndpoint);

// MCP (Model Context Protocol): free, rate-limited discovery channel — the
// x402 HTTP API above remains the unlimited paid channel. See src/mcp.js.
app.post("/mcp", mcpHandler);

// SEO plumbing: robots + sitemap (the modern "tags" that actually work,
// along with the JSON-LD block in the landing head).
app.get("/robots.txt", (req, res) => res.type("text/plain").send(
  `User-agent: *\nAllow: /\n\nSitemap: ${config.baseUrl}/sitemap.xml\n`
));
app.get("/sitemap.xml", (req, res) => {
  const urls = ["/", "/skill.md", "/llms.txt", "/openapi.json", "/pdf/templates"];
  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${config.baseUrl}${u}</loc></url>`).join("\n") +
    `\n</urlset>`
  );
});
app.get("/openapi.json", (req, res) => res.json(STATIC_DOCS.openapi));

// Guide: free web edition (authority/marketing asset) + paid PDF edition
// (monetized via our own x402 rails — no third-party account needed).
// Available in Spanish, English and Portuguese via ?lang=es|en|pt (default es).
app.get("/guia", (req, res) => {
  const lang = resolveLang(req.query.lang);
  res.setHeader("Content-Security-Policy", LANDING_CSP);
  res.type("html").send(guideWebHtml(config.baseUrl, lang));
});
app.get("/guia/pdf", async (req, res) => {
  const lang = resolveLang(req.query.lang);
  try {
    const pdf = await renderPdfQueued(guidePdfHtml(lang));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="toolrail-guide-x402-${lang}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    res.status(500).json({ error: "PDF rendering failed", detail: String(err.message || err) });
  }
});

app.post("/pdf", pdfEndpoint);
app.get("/vat/rates", vatRates);
app.post("/vat/validate", vatValidate);
app.post("/vat/price", vatPrice);
app.get("/fx/convert", fxConvert);
app.get("/fx/rates", fxRates);
app.get("/fx/currencies", fxCurrencies);
app.get("/days/holidays", daysHolidays);
app.get("/days/business-days", daysBusinessDays);
app.post("/validate/iban", validateIban);
app.get("/validate/iban", validateIban);
app.post("/validate/phone", validatePhone);
app.get("/validate/phone", validatePhone);
app.post("/qr", qrEndpoint);
app.post("/validate/tax-id", validateTaxId);
app.get("/validate/tax-id", validateTaxId);
app.get("/latam/indexacion", latamIndexacion);
app.get("/latam/dolar-argentina", latamDolarArgentina);
app.get("/latam/fx", latamFx);
app.get("/br/indices", brIndices);
app.get("/br/cep", brCep);
app.get("/ar/indices", arIndices);
app.get("/co/trm", coTrm);
app.get("/pe/tipo-cambio", peTipoCambio);
app.get("/mx/indicadores", mxIndicadores);
app.get("/cl/reajuste", clReajuste);
app.get("/cl/indicadores", clIndicadores);
app.get("/cl/uf", clUfConvert);
app.get("/cl/dias-habiles", clDiasHabiles);
app.get("/cl/feriados", clFeriados);
app.post("/cl/rut", clRut);
app.get("/cl/rut", clRut);
app.post("/cl/sueldo-liquido", clSueldoLiquido);
app.get("/cl/farmacias-turno", clFarmacias);

app.use((req, res) => res.status(404).json({ error: "Not found", see: "GET / for the endpoint catalog" }));

// Last line of defense: never leak internals in unexpected failures.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.type === "entity.parse.failed" || err?.statusCode === 400 || err?.status === 400) {
    return res.status(400).json({ error: "Invalid request body (expected valid JSON)." });
  }
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: "Request body too large." });
  }
  console.error("[unhandled]", err?.message || err);
  res.status(500).json({ error: "Internal error." });
});

process.on("unhandledRejection", err => {
  console.error("[unhandledRejection]", err?.message || err);
});

// Without this handler, Node's default behavior for an uncaught synchronous
// throw is to print a trace and kill the whole process — one bad code path
// would take down every in-flight request, not just the one that hit it.
process.on("uncaughtException", err => {
  console.error("[uncaughtException]", err?.stack || err?.message || err);
});

registerKnownPaths([
  ...CATALOG.map(i => i.route.split(" ")[1]),
  "/", "/health", "/pdf/templates", "/llms.txt", "/skill.md", "/openapi.json",
  "/.well-known/x402.json", "/.well-known/x402", "/fx/currencies", "/admin/stats", "/guia", "/mcp",
]);
startStatsLogging();

app.listen(config.port, () => {
  console.log(`${config.serviceName} listening on :${config.port}`);
});
