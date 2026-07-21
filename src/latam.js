// LATAM data pack — the niche nobody else serves in x402:
// - Tax ID validation for Latin America + Spain (pure check-digit logic, zero upkeep):
//   CL RUT, AR CUIT/CUIL, BR CPF/CNPJ, MX RFC (format+date), PE RUC, CO NIT, ES NIF/NIE.
// - Inflation-indexed units used in contracts across the region:
//   UF (Chile, live), UVA (Argentina, live), UDI (Mexico, Banxico token).
// - Argentine dollar quotes (oficial/blue/euro) — the region's most-watched FX gap.
// All sources official or community mirrors of official data. No scraping.

import { fetchJson, TTLCache, badRequest, upstreamError, todayIn } from "./util.js";
import { getIndicator } from "./chile.js";
import { config } from "./config.js";

const cache = new TTLCache(12 * 60 * 60 * 1000); // daily-changing units
const fxCache = new TTLCache(15 * 60 * 1000);    // AR dollar quotes move intraday

// ---------- Tax ID validation ----------

const digitsOf = s => s.replace(/\D/g, "");

function checkRut(clean) {
  const body = clean.slice(0, -1), dv = clean.slice(-1).toUpperCase();
  if (!/^\d{7,8}$/.test(body) || !/^[0-9K]$/.test(dv)) return { valid: false, reason: "Malformed RUT." };
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) { sum += Number(body[i]) * mul; mul = mul === 7 ? 2 : mul + 1; }
  const e = 11 - (sum % 11);
  const expected = e === 11 ? "0" : e === 10 ? "K" : String(e);
  return dv === expected
    ? { valid: true, type: "RUT", formatted: `${Number(body).toLocaleString("es-CL")}-${dv}` }
    : { valid: false, reason: `Check digit should be ${expected}.` };
}

function checkCuit(raw) {
  const d = digitsOf(raw);
  if (d.length !== 11) return { valid: false, reason: "CUIT/CUIL must have 11 digits." };
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = w.reduce((s, wi, i) => s + wi * Number(d[i]), 0);
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0; else if (dv === 10) dv = 9;
  return Number(d[10]) === dv
    ? { valid: true, type: "CUIT/CUIL", formatted: `${d.slice(0, 2)}-${d.slice(2, 10)}-${d[10]}` }
    : { valid: false, reason: `Check digit should be ${dv}.` };
}

function checkCpfDigit(d, len) {
  let sum = 0;
  for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
  const r = (sum * 10) % 11;
  return r === 10 ? 0 : r;
}

function checkBr(raw) {
  const d = digitsOf(raw);
  if (d.length === 11) { // CPF
    if (/^(\d)\1{10}$/.test(d)) return { valid: false, reason: "CPF with all identical digits is invalid." };
    if (checkCpfDigit(d, 9) !== Number(d[9]) || checkCpfDigit(d, 10) !== Number(d[10])) {
      return { valid: false, reason: "CPF check digits do not validate." };
    }
    return { valid: true, type: "CPF", formatted: `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` };
  }
  if (d.length === 14) { // CNPJ
    const dig = (len, weights) => {
      const sum = weights.reduce((s, wi, i) => s + wi * Number(d[i]), 0);
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const d1 = dig(12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = dig(13, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    if (d1 !== Number(d[12]) || d2 !== Number(d[13])) return { valid: false, reason: "CNPJ check digits do not validate." };
    return { valid: true, type: "CNPJ", formatted: `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` };
  }
  return { valid: false, reason: "Brazil expects CPF (11 digits) or CNPJ (14 digits)." };
}

function checkRfc(raw) {
  const rfc = raw.toUpperCase().replace(/[\s-]/g, "");
  const m = rfc.match(/^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z0-9]{3})$/);
  if (!m) return { valid: false, reason: "RFC format: 3-4 letters + YYMMDD + 3-char homoclave." };
  const [, , yy, mm, dd] = m;
  const month = Number(mm), day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return { valid: false, reason: "RFC embedded date is invalid." };
  return {
    valid: true, type: m[1].length === 4 ? "RFC (persona física)" : "RFC (persona moral)", formatted: rfc,
    note: "Format and embedded-date validation; SAT does not publish an official public check-digit service.",
  };
}

function checkRuc(raw) {
  const d = digitsOf(raw);
  if (d.length !== 11) return { valid: false, reason: "RUC must have 11 digits." };
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = w.reduce((s, wi, i) => s + wi * Number(d[i]), 0);
  const dv = (11 - (sum % 11)) % 10;
  return Number(d[10]) === dv
    ? { valid: true, type: "RUC", formatted: d }
    : { valid: false, reason: `Check digit should be ${dv}.` };
}

function checkNit(raw) {
  const clean = raw.replace(/[\s.]/g, "");
  const [body, dvRaw] = clean.includes("-") ? clean.split("-") : [clean.slice(0, -1), clean.slice(-1)];
  if (!/^\d{5,15}$/.test(body) || !/^\d$/.test(dvRaw)) return { valid: false, reason: "NIT format: digits + check digit (e.g. 900373115-3)." };
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  let sum = 0;
  const rev = [...body].reverse();
  for (let i = 0; i < rev.length; i++) sum += Number(rev[i]) * weights[i];
  const r = sum % 11;
  const dv = r > 1 ? 11 - r : r;
  return Number(dvRaw) === dv
    ? { valid: true, type: "NIT", formatted: `${body}-${dvRaw}` }
    : { valid: false, reason: `Check digit should be ${dv}.` };
}

function checkNif(raw) {
  const s = raw.toUpperCase().replace(/[\s-]/g, "");
  const LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
  let m = s.match(/^(\d{8})([A-Z])$/);
  if (m) {
    const ok = LETTERS[Number(m[1]) % 23] === m[2];
    return ok ? { valid: true, type: "NIF/DNI", formatted: s } : { valid: false, reason: `Letter should be ${LETTERS[Number(m[1]) % 23]}.` };
  }
  m = s.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (m) {
    const num = Number({ X: "0", Y: "1", Z: "2" }[m[1]] + m[2]);
    const ok = LETTERS[num % 23] === m[3];
    return ok ? { valid: true, type: "NIE", formatted: s } : { valid: false, reason: `Letter should be ${LETTERS[num % 23]}.` };
  }
  return { valid: false, reason: "Spain expects NIF/DNI (8 digits + letter) or NIE (X/Y/Z + 7 digits + letter)." };
}

const VALIDATORS = {
  CL: raw => checkRut(raw.replace(/[.\s-]/g, "").toUpperCase()),
  AR: checkCuit,
  BR: checkBr,
  MX: checkRfc,
  PE: checkRuc,
  CO: checkNit,
  ES: checkNif,
};

export function validateTaxId(req, res) {
  const country = String(req.body?.country ?? req.query.country ?? "").toUpperCase();
  const id = String(req.body?.id ?? req.query.id ?? "").trim();
  if (!VALIDATORS[country]) return badRequest(res, `'country' must be one of: ${Object.keys(VALIDATORS).join(", ")} (CL=RUT, AR=CUIT/CUIL, BR=CPF/CNPJ, MX=RFC, PE=RUC, CO=NIT, ES=NIF/NIE).`);
  if (!id) return badRequest(res, "Provide 'id' (the tax identifier to validate).");
  const result = VALIDATORS[country](id);
  res.json({ country, id, ...result });
}

// ---------- Inflation-indexed units ----------

// Freshness strategy for daily indexed units: cache the SERIES (the expensive
// fetch) and resolve "today's value" per request. Both UVA and UVR publish
// values ahead of time, so a cached series always contains the current date —
// the answer stays day-accurate even while the cache ages.

function valueForToday(entries /* [{fecha|ts, valor}] sorted asc */, timeZone) {
  const today = todayIn(timeZone);
  let best = null;
  for (const e of entries) {
    const fecha = e.fecha || new Date(e.ts).toISOString().slice(0, 10);
    if (fecha <= today) best = { valor: e.valor, fecha };
    else break;
  }
  if (!best) throw new Error("no value for today in series");
  return best;
}

async function getUva() {
  let serie = cache.get("uva-serie");
  if (!serie) {
    serie = await fetchJson("https://api.argentinadatos.com/v1/finanzas/indices/uva", { timeoutMs: 15000 });
    if (!Array.isArray(serie) || !serie.length) throw new Error("empty UVA series");
    cache.set("uva-serie", serie);
  }
  const { valor, fecha } = valueForToday(serie, "America/Argentina/Buenos_Aires");
  return { valor, fecha, moneda: "ARS", fuente: "BCRA vía ArgentinaDatos" };
}

async function getUvr() {
  let data = cache.get("uvr-serie");
  if (!data) {
    // Banco de la República's series backend (same endpoint their own site uses).
    // Returns the full daily series incl. pre-published future values; we pick today's.
    data = await fetchJson(
      "https://suameca.banrep.gov.co/estadisticas-economicas-back/rest/estadisticaEconomicaRestService/consultaMenuXId?idMenu=100005",
      {
        timeoutMs: 25000,
        retries: 3, // BanRep occasionally returns an empty 200 without full browser headers
        options: {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://suameca.banrep.gov.co/estadisticas-economicas/informacionSerie/100005/unidad_valor_real_uvr",
          },
        },
      }
    );
    if (!data?.SERIES?.[0]?.data?.length) throw new Error("BanRep: no UVR data");
    cache.set("uvr-serie", data);
  }
  const entries = data.SERIES[0].data.map(([ts, valor]) => ({ ts, valor }));
  const { valor, fecha } = valueForToday(entries, "America/Bogota");
  return { valor, fecha, moneda: "COP", fuente: "Banco de la República (Colombia)" };
}

async function getUdi() {
  if (!config.banxicoToken) {
    throw new Error("UDI requires a free Banxico token (set BANXICO_TOKEN; get one at banxico.org.mx/SieAPIRest).");
  }
  // Banxico pre-publishes UDIs ~2 weeks ahead; "oportuno" returns the LATEST
  // (future) datum. We ask for today's date specifically so the answer matches
  // the day of the query, falling back to oportuno if the range comes empty.
  const today = todayIn("America/Mexico_City");
  const key = `udi:${today}`;
  let hit = cache.get(key);
  if (!hit) {
    const base = "https://www.banxico.org.mx/SieAPIRest/service/v1/series/SP68257/datos";
    let d;
    try {
      const ranged = await fetchJson(`${base}/${today}/${today}?token=${config.banxicoToken}`, { timeoutMs: 15000 });
      d = ranged?.bmx?.series?.[0]?.datos?.[0];
    } catch { /* fall through to oportuno */ }
    if (!d) {
      const latest = await fetchJson(`${base}/oportuno?token=${config.banxicoToken}`, { timeoutMs: 15000 });
      d = latest?.bmx?.series?.[0]?.datos?.[0];
    }
    if (!d) throw new Error("Banxico: no UDI data");
    const [dd, mm, yy] = d.fecha.split("/");
    hit = cache.set(key, { valor: Number(d.dato), fecha: `${yy}-${mm}-${dd}` });
  }
  return { ...hit, moneda: "MXN", fuente: "Banco de México (SIE)" };
}

export async function latamIndexacion(req, res) {
  const unidad = String(req.query.unidad || "uf").toLowerCase();
  const monto = req.query.monto !== undefined ? Number(req.query.monto) : null;
  const SUPPORTED = { uf: "Chile", uva: "Argentina", udi: "México", uvr: "Colombia" };
  if (!SUPPORTED[unidad]) {
    return badRequest(res, `'unidad' must be one of: ${Object.keys(SUPPORTED).join(", ")} (ui Uruguay coming soon).`);
  }
  if (monto !== null && (!Number.isFinite(monto) || monto <= 0)) return badRequest(res, "'monto' must be a positive number.");
  try {
    let data;
    if (unidad === "uf") {
      const uf = await getIndicator("uf", req.query.fecha ? String(req.query.fecha) : null);
      data = { valor: uf.valor, fecha: uf.fecha, moneda: "CLP", fuente: uf.fuente };
    } else if (unidad === "uva") {
      data = await getUva();
    } else if (unidad === "uvr") {
      data = await getUvr();
    } else {
      data = await getUdi();
    }
    res.json({
      unidad: unidad.toUpperCase(), pais: SUPPORTED[unidad], ...data,
      ...(monto !== null ? { monto, equivalente_moneda_local: Math.round(monto * data.valor * 100) / 100 } : {}),
    });
  } catch (err) {
    upstreamError(res, `fuente de ${unidad.toUpperCase()}`, err);
  }
}

// ---------- Argentina: inflation & country risk ----------

export async function arIndices(req, res) {
  try {
    let hit = cache.get("ar-indices");
    if (!hit) {
      const [inflacion, riesgo] = await Promise.all([
        fetchJson("https://api.argentinadatos.com/v1/finanzas/indices/inflacion", { timeoutMs: 15000 }),
        fetchJson("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo", { timeoutMs: 15000 }),
      ]);
      if (!Array.isArray(inflacion) || !inflacion.length) throw new Error("sin serie de inflación");
      const last12 = inflacion.slice(-12);
      const interanual = (last12.reduce((f, m) => f * (1 + m.valor / 100), 1) - 1) * 100;
      const ultimo = inflacion[inflacion.length - 1];
      hit = cache.set("ar-indices", {
        inflacion_mensual: { valor: ultimo.valor, mes: ultimo.fecha.slice(0, 7) },
        inflacion_interanual_pct: Math.round(interanual * 10) / 10,
        riesgo_pais: { valor: riesgo.valor, fecha: riesgo.fecha, unidad: "puntos básicos" },
      });
    }
    res.json({ pais: "Argentina", ...hit, fuente: "INDEC/BCRA vía ArgentinaDatos" });
  } catch (err) {
    upstreamError(res, "ArgentinaDatos", err);
  }
}

// ---------- Colombia: official TRM ----------

export async function coTrm(req, res) {
  try {
    let hit = fxCache.get("co-trm");
    if (!hit) {
      const data = await fetchJson("https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC", { timeoutMs: 15000 });
      const d = data?.[0];
      if (!d) throw new Error("sin datos TRM");
      hit = fxCache.set("co-trm", {
        valor: Number(d.valor),
        vigente_desde: d.vigenciadesde?.slice(0, 10),
        vigente_hasta: d.vigenciahasta?.slice(0, 10),
      });
    }
    res.json({
      pais: "Colombia", indicador: "TRM (Tasa Representativa del Mercado)", moneda: "COP por USD", ...hit,
      nota: "Tasa oficial legal para impuestos y contratos en Colombia.",
      fuente: "Superintendencia Financiera vía datos.gov.co",
    });
  } catch (err) {
    upstreamError(res, "datos.gov.co (TRM)", err);
  }
}

// ---------- Peru: official exchange rate ----------

// BCRP hand-crafts its JSON and intermittently appends stray characters after
// the closing brace — fetch as text and cut to the outermost object before parsing.
async function bcrpJson(url) {
  let lastErr;
  for (let attempt = 0; attempt <= 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`BCRP HTTP ${res.status}`);
      const text = await res.text();
      // Their PHP backend can append warning dumps AFTER the JSON — extract the
      // first balanced {...} object instead of trusting the end of the body.
      const start = text.indexOf("{");
      if (start < 0) throw new Error("BCRP: respuesta sin JSON");
      let depth = 0, end = -1;
      for (let i = start; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}" && --depth === 0) { end = i; break; }
      }
      if (end < 0) throw new Error("BCRP: JSON sin cerrar");
      return JSON.parse(text.slice(start, end + 1));
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < 2) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function parseBcrp(data) {
  const periods = data?.periods;
  if (!Array.isArray(periods) || !periods.length) throw new Error("BCRP: sin datos");
  // Weekends/holidays come as "n.d." — walk back to the latest numeric value.
  for (let i = periods.length - 1; i >= 0; i--) {
    const v = Number(periods[i].values?.[0]);
    if (Number.isFinite(v)) return { valor: v, fecha_bcrp: periods[i].name };
  }
  throw new Error("BCRP: sin valores numéricos en el rango");
}

export async function peTipoCambio(req, res) {
  try {
    let hit = fxCache.get("pe-tc");
    if (!hit) {
      const today = todayIn("America/Lima");
      const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const fmt = s => s.replace(/-0?/g, "-"); // BCRP wants 2026-7-19 style
      const [venta, compra] = await Promise.all([
        bcrpJson(`https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04640PD/json/${fmt(from)}/${fmt(today)}`),
        bcrpJson(`https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04639PD/json/${fmt(from)}/${fmt(today)}`),
      ]);
      hit = fxCache.set("pe-tc", { venta: parseBcrp(venta), compra: parseBcrp(compra) });
    }
    res.json({
      pais: "Perú", indicador: "Tipo de cambio SBS", moneda: "PEN por USD",
      venta: hit.venta.valor, compra: hit.compra.valor, fecha_bcrp: hit.venta.fecha_bcrp,
      fuente: "BCRP (Banco Central de Reserva del Perú)",
    });
  } catch (err) {
    upstreamError(res, "BCRP", err);
  }
}

// ---------- Mexico: FIX dollar & TIIE ----------

async function banxicoSerie(serie) {
  if (!config.banxicoToken) throw new Error("Requires BANXICO_TOKEN (free at banxico.org.mx/SieAPIRest).");
  const key = `banxico:${serie}`;
  let hit = fxCache.get(key);
  if (!hit) {
    const data = await fetchJson(
      `https://www.banxico.org.mx/SieAPIRest/service/v1/series/${serie}/datos/oportuno?token=${config.banxicoToken}`,
      { timeoutMs: 15000 }
    );
    const d = data?.bmx?.series?.[0]?.datos?.[0];
    if (!d) throw new Error(`Banxico ${serie}: sin datos`);
    const [dd, mm, yy] = d.fecha.split("/");
    hit = fxCache.set(key, { valor: Number(d.dato), fecha: `${yy}-${mm}-${dd}` });
  }
  return hit;
}

export async function mxIndicadores(req, res) {
  try {
    const [fix, tiie] = await Promise.all([banxicoSerie("SF43718"), banxicoSerie("SF43783")]);
    res.json({
      pais: "México",
      dolar_fix: { valor: fix.valor, fecha: fix.fecha, unidad: "MXN por USD", nota: "Tipo de cambio FIX oficial para obligaciones" },
      tiie_28d: { valor: tiie.valor, fecha: tiie.fecha, unidad: "% anual" },
      fuente: "Banco de México (SIE)",
    });
  } catch (err) {
    upstreamError(res, "Banco de México", err);
  }
}

// ---------- The flagship: all-LATAM official FX in one call ----------

export async function fxSnapshot() {
  const jobs = {
    CLP: async () => {
      const d = await getIndicator("dolar", null);
      return { valor: d.valor, fecha: d.fecha, fuente: d.fuente, tipo: "dólar observado" };
    },
    ARS: async () => {
      const raw = fxCache.get("dolar-ar") || fxCache.set("dolar-ar", await fetchJson("https://api.bluelytics.com.ar/v2/latest", { timeoutMs: 12000 }));
      return {
        oficial: raw.oficial?.value_avg, blue: raw.blue?.value_avg,
        brecha_pct: raw.oficial && raw.blue ? Math.round(((raw.blue.value_avg / raw.oficial.value_avg) - 1) * 1000) / 10 : null,
        fuente: "Bluelytics", tipo: "oficial + paralelo",
      };
    },
    BRL: async () => {
      const data = await fetchJson("https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/1?formato=json", { timeoutMs: 12000 });
      const [dd, mm, yy] = data[0].data.split("/");
      return { valor: Number(data[0].valor), fecha: `${yy}-${mm}-${dd}`, fuente: "BCB", tipo: "PTAX venta" };
    },
    MXN: async () => {
      const f = await banxicoSerie("SF43718");
      return { valor: f.valor, fecha: f.fecha, fuente: "Banxico", tipo: "FIX oficial" };
    },
    COP: async () => {
      const data = await fetchJson("https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC", { timeoutMs: 12000 });
      return { valor: Number(data[0].valor), vigente_desde: data[0].vigenciadesde?.slice(0, 10), fuente: "datos.gov.co", tipo: "TRM legal" };
    },
    PEN: async () => {
      const today = todayIn("America/Lima");
      const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const fmt = s => s.replace(/-0?/g, "-");
      const venta = await bcrpJson(`https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04640PD/json/${fmt(from)}/${fmt(today)}`);
      const p = parseBcrp(venta);
      return { valor: p.valor, fecha_bcrp: p.fecha_bcrp, fuente: "BCRP", tipo: "SBS venta" };
    },
  };

  const results = await Promise.allSettled(Object.values(jobs).map(fn => fn()));
  const monedas = {};
  const errores = [];
  Object.keys(jobs).forEach((code, i) => {
    const r = results[i];
    if (r.status === "fulfilled") monedas[code] = r.value;
    else errores.push({ moneda: code, error: String(r.reason?.message || r.reason).slice(0, 120) });
  });
  return { monedas, errores };
}

export async function latamFx(req, res) {
  const { monedas, errores } = await fxSnapshot();
  if (!Object.keys(monedas).length) return upstreamError(res, "todas las fuentes FX LATAM", new Error("ninguna fuente respondió"));
  res.json({
    descripcion: "Tipos de cambio oficiales de LATAM contra USD, en una sola llamada",
    monedas,
    ...(errores.length ? { fuentes_no_disponibles: errores } : {}),
    completo: errores.length === 0,
  });
}

// ---------- Argentine dollar ----------

export async function latamDolarArgentina(req, res) {
  try {
    let data = fxCache.get("dolar-ar");
    if (!data) {
      const raw = await fetchJson("https://api.bluelytics.com.ar/v2/latest", { timeoutMs: 12000 });
      data = fxCache.set("dolar-ar", raw);
    }
    res.json({
      oficial: data.oficial, blue: data.blue,
      oficial_euro: data.oficial_euro, blue_euro: data.blue_euro,
      brecha_pct: data.oficial && data.blue
        ? Math.round(((data.blue.value_avg / data.oficial.value_avg) - 1) * 1000) / 10
        : null,
      last_update: data.last_update,
      fuente: "Bluelytics (promedio de cotizaciones publicadas)",
    });
  } catch (err) {
    upstreamError(res, "bluelytics.com.ar", err);
  }
}
