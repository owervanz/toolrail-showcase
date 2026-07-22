// MCP (Model Context Protocol) server — the "free lead-gen channel" half of
// Toolrail's distribution strategy, mirroring how the fastest-growing x402
// services (BlockRun et al.) meet developers where they already work:
// `claude mcp add` / Cursor / any MCP-compatible client, no wallet needed.
//
// Strategy: MCP tool calls are FREE (rate-limited via the same global
// limiter), exposing the JSON-data endpoints only — binary outputs (PDF, QR)
// stay HTTP/x402-only for now, kept simple on purpose. The x402 HTTP API
// remains the unlimited, paid, agent-native channel. Every MCP tool reuses
// the EXACT SAME handler functions as the HTTP routes (single source of
// truth) via a tiny Express req/res shim — zero business-logic duplication.

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { vatRates, vatValidate, vatPrice } from "./vat.js";
import { fxConvert, fxRates } from "./fx.js";
import { daysHolidays, daysBusinessDays, validateIban, validatePhone } from "./global.js";
import { validateTaxId, latamIndexacion, latamDolarArgentina, latamFx } from "./latam.js";
import { brIndices, brCep } from "./brasil.js";
import { arIndices, coTrm, peTipoCambio, mxIndicadores } from "./latam.js";
import {
  clIndicadores, clUfConvert, clDiasHabiles, clFeriados, clRut, clSueldoLiquido, clFarmacias, clReajuste,
} from "./chile.js";
import { config } from "./config.js";

// ---------- Express-handler adapter: call the real route handler, capture its res.json()/res.status() as a plain value instead of writing to a real HTTP response ----------

function callHandler(handler, args) {
  return new Promise(resolve => {
    let statusCode = 200;
    const req = { query: args || {}, body: args || {}, params: {}, headers: {}, get: () => undefined };
    const res = {
      status(code) { statusCode = code; return res; },
      json(body) { resolve({ statusCode, body }); return res; },
      send(body) { resolve({ statusCode, body }); return res; },
      setHeader() { return res; },
      type() { return res; },
    };
    try {
      const maybePromise = handler(req, res);
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(err => resolve({ statusCode: 500, body: { error: String(err?.message || err) } }));
      }
    } catch (err) {
      resolve({ statusCode: 500, body: { error: String(err?.message || err) } });
    }
  });
}

function toolResult({ statusCode, body }) {
  const text = typeof body === "string" ? body : JSON.stringify(body, null, 2);
  return { content: [{ type: "text", text }], isError: statusCode >= 400 };
}

// ---------- Tool catalog: name, description, zod input shape, handler ----------

const TOOLS = [
  { name: "vat_rates", description: "Current VAT rates for 44 European countries (EC TEDB).",
    input: { country: z.string().length(2).describe("ISO country code, e.g. DE, FR, ES") },
    handler: vatRates },
  { name: "vat_validate", description: "Validate an EU VAT number against the official VIES registry.",
    input: { countryCode: z.string().length(2), vatNumber: z.string() },
    handler: vatValidate },
  { name: "vat_price", description: "Compute net/gross price with EU VAT for a given country.",
    input: { amount: z.number().positive(), country: z.string().length(2), direction: z.enum(["net-to-gross", "gross-to-net"]).optional() },
    handler: vatPrice },
  { name: "fx_convert", description: "Convert between 30+ currencies using official ECB reference rates.",
    input: { from: z.string().length(3), to: z.string().length(3), amount: z.number().positive().optional(), date: z.string().optional() },
    handler: fxConvert },
  { name: "fx_rates", description: "Full ECB reference rate table for a base currency.",
    input: { base: z.string().length(3).optional(), date: z.string().optional() },
    handler: fxRates },
  { name: "days_holidays", description: "Official public holidays for any of 187 countries.",
    input: { country: z.string().length(2), year: z.number().int().optional() },
    handler: daysHolidays },
  { name: "days_business_days", description: "Add N business days to a date, respecting official holidays, for 187 countries.",
    input: { country: z.string().length(2), from: z.string().optional(), days: z.number().int().min(0) },
    handler: daysBusinessDays },
  { name: "validate_iban", description: "Validate an IBAN (ISO 13616 mod-97, 88 countries).",
    input: { iban: z.string() },
    handler: validateIban },
  { name: "validate_phone", description: "Validate and format a phone number (~240 regions).",
    input: { phone: z.string(), region: z.string().length(2).optional() },
    handler: validatePhone },
  { name: "validate_tax_id", description: "Validate a LATAM/Spain tax ID: RUT (CL), CUIT/CUIL (AR), CPF/CNPJ (BR), RFC (MX), RUC (PE), NIT (CO), NIF/NIE (ES).",
    input: { country: z.enum(["CL", "AR", "BR", "MX", "PE", "CO", "ES"]), id: z.string() },
    handler: validateTaxId },
  { name: "latam_indexacion", description: "LATAM inflation-indexed units: UF (Chile), UVA (Argentina), UVR (Colombia), UDI (Mexico).",
    input: { unidad: z.enum(["uf", "uva", "uvr", "udi"]), monto: z.number().positive().optional(), fecha: z.string().optional() },
    handler: latamIndexacion },
  { name: "latam_dolar_argentina", description: "Argentine dollar quotes: oficial, blue (parallel) and the gap percentage.",
    input: {}, handler: latamDolarArgentina },
  { name: "latam_fx", description: "All official LATAM exchange rates vs USD in one call: CLP, ARS, BRL, MXN, COP, PEN.",
    input: {}, handler: latamFx },
  { name: "br_indices", description: "Brazil's SELIC, CDI, IPCA and PTAX dollar (Banco Central do Brasil).",
    input: {}, handler: brIndices },
  { name: "br_cep", description: "Brazilian postal code (CEP) lookup: street, city, state.",
    input: { cep: z.string() }, handler: brCep },
  { name: "ar_indices", description: "Argentina's monthly/annual inflation and country risk (riesgo país).",
    input: {}, handler: arIndices },
  { name: "co_trm", description: "Colombia's official TRM (legal COP/USD exchange rate).",
    input: {}, handler: coTrm },
  { name: "pe_tipo_cambio", description: "Peru's official SBS exchange rate (BCRP).",
    input: {}, handler: peTipoCambio },
  { name: "mx_indicadores", description: "Mexico's official FIX dollar rate and TIIE 28-day rate (Banxico).",
    input: {}, handler: mxIndicadores },
  { name: "cl_reajuste", description: "Chilean IPC adjustment: compound official inflation between two months.",
    input: { desde: z.string(), hasta: z.string(), monto: z.number().positive().optional() },
    handler: clReajuste },
  { name: "cl_indicadores", description: "Chilean economic indicators: UF, UTM, dolar, euro, IPC.",
    input: { indicador: z.enum(["uf", "utm", "dolar", "euro", "ipc"]).optional(), fecha: z.string().optional() },
    handler: clIndicadores },
  { name: "cl_uf", description: "Convert between UF and Chilean pesos at any date.",
    input: { monto: z.number().positive(), direccion: z.enum(["uf-clp", "clp-uf"]).optional() },
    handler: clUfConvert },
  { name: "cl_dias_habiles", description: "Chilean business-day calculator, respecting national holidays.",
    input: { desde: z.string().optional(), plazo: z.number().int().min(0), tipo: z.enum(["administrativo", "habil-bancario", "corrido"]).optional() },
    handler: clDiasHabiles },
  { name: "cl_feriados", description: "Official Chilean public holidays for 2026-2027.",
    input: { ano: z.union([z.string(), z.number()]).optional() },
    handler: clFeriados },
  { name: "cl_rut", description: "Validate and format a Chilean RUT (modulo 11 check digit).",
    input: { rut: z.string() }, handler: clRut },
  { name: "cl_sueldo_liquido", description: "Chilean net salary calculator: gross to net with AFP, health, cesantía and impuesto único.",
    input: { bruto: z.number().positive(), afp: z.string().optional(), tipo_contrato: z.enum(["indefinido", "plazo_fijo"]).optional() },
    handler: clSueldoLiquido },
  { name: "cl_farmacias_turno", description: "On-duty (night shift) pharmacies in Chile by comuna (MINSAL).",
    input: { comuna: z.string().optional() },
    handler: clFarmacias },
];

function buildServer() {
  const server = new McpServer({ name: "toolrail", version: "1.0.0" }, {
    instructions: `Toolrail: free LATAM + global utility data tools (${TOOLS.length} tools) — official central-bank FX, tax-ID validation for 7 countries, business-day math for 187 countries, EU VAT, and Chilean payroll/UF tooling. This MCP channel is free and rate-limited. For unlimited/agentic pay-per-call access (USDC on Base or Solana, no rate limit), use the x402 HTTP API directly at ${config.baseUrl} (see /skill.md).`,
  });
  for (const t of TOOLS) {
    server.registerTool(t.name, { description: t.description, inputSchema: t.input }, async args => {
      const result = await callHandler(t.handler, args || {});
      return toolResult(result);
    });
  }
  return server;
}

// Stateless mode: a fresh server+transport per request avoids session-state
// complexity entirely, matching how the rest of Toolrail is stateless.
export async function mcpHandler(req, res) {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP request failed", detail: String(err?.message || err) });
    }
  }
}

export const MCP_TOOL_COUNT = TOOLS.length;
