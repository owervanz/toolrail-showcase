// Chilean operational data for agents:
// - Economic indicators (UF, UTM, dólar, IPC) with UF<->CLP conversion.
//   Primary source: mindicador.cl (no key). Fallback: CMF API when CMF_API_KEY is set.
// - Business-day math with the national holiday table (data/feriados-chile.json).
// - RUT validation/formatting (módulo 11, pure logic).
// - Net salary ("sueldo líquido") calculation: tax brackets are defined in UTM by law,
//   so they self-update with the live UTM value; AFP fees & caps live in data/parametros-chile.json.
// - On-duty pharmacies via MINSAL/Farmanet.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fetchJson, TTLCache, badRequest, upstreamError, todayIn, cachedOrStale } from "./util.js";
import { config } from "./config.js";

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const FERIADOS = JSON.parse(readFileSync(path.join(dataDir, "feriados-chile.json"), "utf8"));
const PARAMS = JSON.parse(readFileSync(path.join(dataDir, "parametros-chile.json"), "utf8"));

const cache = new TTLCache(60 * 60 * 1000);

// ---------- Indicators ----------

const INDICATOR_CODES = ["uf", "utm", "dolar", "euro", "ipc"];

export async function getIndicator(code, date /* YYYY-MM-DD | null */) {
  const key = `ind:${code}:${date || "latest"}`;
  const { value, stale, staleAgeS } = await cachedOrStale(cache, key, async () => {
    // mindicador expects dd-mm-yyyy for dated queries
    let url = `https://mindicador.cl/api/${code}`;
    if (date) {
      const [y, m, d] = date.split("-");
      url += `/${d}-${m}-${y}`;
    }
    try {
      const data = await fetchJson(url);
      const serie = data.serie?.[0];
      if (!serie) throw new Error("no data for date");
      return { valor: serie.valor, fecha: serie.fecha.slice(0, 10), fuente: "mindicador.cl (Banco Central de Chile)" };
    } catch (err) {
      // Fallback: CMF API (requires free key) — only UF/UTM/dólar/euro/IPC
      if (!config.cmfApiKey) throw err;
      const cmfName = { uf: "uf", utm: "utm", dolar: "dolar", euro: "euro", ipc: "ipc" }[code];
      const datePart = date ? `/${date.replaceAll("-", "/")}` : "";
      const cmf = await fetchJson(
        `https://api.cmfchile.cl/api-sbifv3/recursos_api/${cmfName}${datePart}?apikey=${config.cmfApiKey}&formato=json`
      );
      const entry = (cmf.UFs || cmf.UTMs || cmf.Dolares || cmf.Euros || cmf.IPCs || [])[0];
      if (!entry) throw new Error("CMF: no data");
      const valor = Number(String(entry.Valor).replace(/\./g, "").replace(",", "."));
      return { valor, fecha: entry.Fecha, fuente: "CMF Chile" };
    }
  });
  // Third layer: both mindicador.cl AND CMF failed live, but we have a recent
  // cached value — serve it labeled stale instead of a hard 502.
  return stale ? { ...value, stale: true, stale_reason: `mindicador.cl y CMF no respondieron — mostrando el último valor conocido (hace ~${staleAgeS}s de su vencimiento normal).` } : value;
}

export async function clIndicadores(req, res) {
  const code = String(req.query.indicador || "uf").toLowerCase();
  const date = req.query.fecha ? String(req.query.fecha) : null;
  if (!INDICATOR_CODES.includes(code)) return badRequest(res, `'indicador' must be one of: ${INDICATOR_CODES.join(", ")}`);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return badRequest(res, "'fecha' must be YYYY-MM-DD.");
  try {
    const ind = await getIndicator(code, date);
    res.json({ indicador: code, ...ind });
  } catch (err) {
    upstreamError(res, "mindicador.cl / CMF", err);
  }
}

export async function clUfConvert(req, res) {
  const monto = Number(req.query.monto);
  const dir = String(req.query.direccion || "uf-clp");
  const date = req.query.fecha ? String(req.query.fecha) : null;
  if (!Number.isFinite(monto) || monto <= 0) return badRequest(res, "'monto' must be a positive number.");
  if (!["uf-clp", "clp-uf"].includes(dir)) return badRequest(res, "'direccion' must be 'uf-clp' or 'clp-uf'.");
  try {
    const uf = await getIndicator("uf", date);
    const result = dir === "uf-clp" ? monto * uf.valor : monto / uf.valor;
    res.json({
      direccion: dir,
      monto,
      resultado: Math.round(result * 100) / 100,
      valor_uf: uf.valor,
      fecha: uf.fecha,
      fuente: uf.fuente,
      ...(uf.stale ? { stale: true, stale_reason: uf.stale_reason } : {}),
    });
  } catch (err) {
    upstreamError(res, "mindicador.cl / CMF", err);
  }
}

// ---------- Business days ----------

const holidaySet = new Set(
  Object.values(FERIADOS.holidays).flat().map(h => h.date)
);

function isBusinessDay(d, { includeSaturday = false } = {}) {
  const dow = d.getUTCDay();
  if (dow === 0) return false; // Sunday
  if (dow === 6 && !includeSaturday) return false;
  const iso = d.toISOString().slice(0, 10);
  return !holidaySet.has(iso);
}

export function clDiasHabiles(req, res) {
  const desde = String(req.query.desde || todayIn("America/Santiago"));
  const plazo = Number(req.query.plazo || 0);
  // "administrativo" = Mon–Fri (ley 19.880). "judicial"/"corrido-descuenta-feriados" variants can be added later.
  const tipo = String(req.query.tipo || "administrativo");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return badRequest(res, "'desde' must be YYYY-MM-DD.");
  if (!Number.isInteger(plazo) || plazo < 0 || plazo > 3650) return badRequest(res, "'plazo' must be an integer 0-3650 (days).");
  if (!["administrativo", "habil-bancario", "corrido"].includes(tipo)) {
    return badRequest(res, "'tipo' must be: administrativo (Mon-Fri), habil-bancario (Mon-Fri) or corrido.");
  }

  const yearsCovered = Object.keys(FERIADOS.holidays);
  const start = new Date(`${desde}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return badRequest(res, "Invalid 'desde' date.");

  const cursor = new Date(start);
  let remaining = plazo;
  const skipped = [];
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const iso = cursor.toISOString().slice(0, 10);
    if (!yearsCovered.includes(iso.slice(0, 4))) {
      return badRequest(res, `Holiday table covers years ${yearsCovered.join(", ")} only; requested range exceeds it.`);
    }
    if (tipo === "corrido" || isBusinessDay(cursor)) {
      remaining--;
    } else if (holidaySet.has(iso)) {
      skipped.push(iso);
    }
  }
  res.json({
    desde,
    plazo,
    tipo,
    fecha_resultado: cursor.toISOString().slice(0, 10),
    es_habil_hoy: isBusinessDay(start),
    feriados_saltados: skipped,
    tabla_feriados_asOf: FERIADOS.asOf,
  });
}

export function clFeriados(req, res) {
  const year = String(req.query.ano || req.query["año"] || todayIn("America/Santiago").slice(0, 4));
  const list = FERIADOS.holidays[year];
  if (!list) {
    return badRequest(res, `Year ${year} not covered. Available: ${Object.keys(FERIADOS.holidays).join(", ")}.`);
  }
  res.json({ year: Number(year), total: list.length, feriados: list, asOf: FERIADOS.asOf, note: FERIADOS.note });
}

// ---------- RUT ----------

export function clRut(req, res) {
  const raw = String(req.body?.rut ?? req.query.rut ?? "").trim();
  if (!raw) return badRequest(res, "Provide 'rut' in body or query (e.g. 12.345.678-5).");
  const clean = raw.replace(/[.\s-]/g, "").toUpperCase();
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d{7,8}$/.test(body) || !/^[0-9K]$/.test(dv)) {
    return res.json({ rut: raw, valid: false, reason: "Malformed RUT (expected 7-8 digits + check digit)." });
  }
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const expected = 11 - (sum % 11);
  const expectedDv = expected === 11 ? "0" : expected === 10 ? "K" : String(expected);
  const valid = dv === expectedDv;
  const formatted = `${Number(body).toLocaleString("es-CL")}-${dv}`;
  res.json({ rut: raw, valid, formatted: valid ? formatted : null, check_digit_expected: expectedDv });
}

// ---------- Net salary ----------

export async function clSueldoLiquido(req, res) {
  const bruto = Number(req.body?.bruto);
  const afpName = String(req.body?.afp || "modelo").toLowerCase();
  const salud = req.body?.salud || "fonasa"; // "fonasa" | { plan_uf: number }
  const tipoContrato = String(req.body?.tipo_contrato || "indefinido");
  if (!Number.isFinite(bruto) || bruto <= 0) return badRequest(res, "'bruto' (CLP monthly gross) must be a positive number.");
  const comisionAfp = PARAMS.comisionesAfp[afpName];
  if (comisionAfp === undefined) return badRequest(res, `'afp' must be one of: ${Object.keys(PARAMS.comisionesAfp).join(", ")}`);
  if (!["indefinido", "plazo_fijo"].includes(tipoContrato)) return badRequest(res, "'tipo_contrato' must be 'indefinido' or 'plazo_fijo'.");

  try {
    const [uf, utm] = await Promise.all([getIndicator("uf", null), getIndicator("utm", null)]);
    const staleInputs = uf.stale || utm.stale;
    const topeImponible = PARAMS.topeImponibleUF * uf.valor;
    const imponible = Math.min(bruto, topeImponible);

    const afp = imponible * (PARAMS.cotizacionAfpBase + comisionAfp);
    const cotizSalud = typeof salud === "object" && Number.isFinite(Number(salud.plan_uf))
      ? Math.max(Number(salud.plan_uf) * uf.valor, imponible * PARAMS.cotizacionSaludMin)
      : imponible * PARAMS.cotizacionSaludMin;
    const cesantiaRate = tipoContrato === "indefinido" ? PARAMS.seguroCesantiaIndefinido : PARAMS.seguroCesantiaPlazoFijo;
    const cesantia = Math.min(bruto, PARAMS.topeImponibleCesantiaUF * uf.valor) * cesantiaRate;

    const baseTributable = bruto - afp - cotizSalud - cesantia;
    // Progressive tax over UTM-defined brackets (art. 43 LIR)
    let impuesto = 0;
    let prevLimit = 0;
    for (const tramo of PARAMS.tramosImpuestoUnicoUTM) {
      const limit = tramo.hastaUTM === null ? Infinity : tramo.hastaUTM * utm.valor;
      if (baseTributable > prevLimit) {
        impuesto += (Math.min(baseTributable, limit) - prevLimit) * tramo.tasa;
        prevLimit = limit;
      } else break;
    }

    const liquido = baseTributable - impuesto;
    res.json({
      bruto,
      descuentos: {
        afp: Math.round(afp),
        salud: Math.round(cotizSalud),
        seguro_cesantia: Math.round(cesantia),
        impuesto_unico: Math.round(impuesto),
      },
      liquido: Math.round(liquido),
      parametros: {
        afp: afpName,
        comision_afp: comisionAfp,
        tope_imponible_clp: Math.round(topeImponible),
        valor_uf: uf.valor,
        valor_utm: utm.valor,
        parametros_asOf: PARAMS.asOf,
      },
      disclaimer: "Cálculo referencial. No reemplaza una liquidación de sueldo oficial.",
      ...(staleInputs ? { stale: true, stale_reason: "UF/UTM: mindicador.cl y CMF no respondieron — cálculo con el último valor conocido." } : {}),
    });
  } catch (err) {
    upstreamError(res, "mindicador.cl / CMF (UF/UTM)", err);
  }
}

// ---------- IPC adjustment ("reajuste") between months ----------
// The everyday Chilean legal/contract calculation: rents, alimony, contracts
// "reajustado según IPC". Compounds official monthly IPC variations.

async function ipcYear(year) {
  const key = `ipc:${year}`;
  let hit = cache.get(key);
  if (!hit) {
    const data = await fetchJson(`https://mindicador.cl/api/ipc/${year}`);
    if (!Array.isArray(data?.serie)) throw new Error(`IPC ${year}: sin serie`);
    hit = cache.set(key, data.serie);
  }
  return hit;
}

export async function clReajuste(req, res) {
  const desde = String(req.query.desde || "");
  const hasta = String(req.query.hasta || "");
  const monto = req.query.monto !== undefined ? Number(req.query.monto) : null;
  if (!/^\d{4}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}$/.test(hasta)) {
    return badRequest(res, "'desde' and 'hasta' must be YYYY-MM months (e.g. desde=2025-01&hasta=2025-06).");
  }
  if (desde >= hasta) return badRequest(res, "'desde' must be an earlier month than 'hasta'.");
  if (monto !== null && (!Number.isFinite(monto) || monto <= 0)) return badRequest(res, "'monto' must be a positive number.");

  try {
    const y1 = Number(desde.slice(0, 4)), y2 = Number(hasta.slice(0, 4));
    const byMonth = new Map();
    for (let y = y1; y <= y2; y++) {
      for (const e of await ipcYear(y)) byMonth.set(e.fecha.slice(0, 7), e.valor);
    }
    // Compound the monthly variations of every month AFTER 'desde' up to and including 'hasta'
    const months = [];
    let [y, m] = desde.split("-").map(Number);
    for (;;) {
      m++; if (m > 12) { m = 1; y++; }
      const label = `${y}-${String(m).padStart(2, "0")}`;
      if (label > hasta) break;
      months.push(label);
    }
    const missing = months.filter(mm => !byMonth.has(mm));
    if (missing.length) {
      return badRequest(res, `IPC not yet published for: ${missing.join(", ")}. Latest available month may lag ~1 month.`);
    }
    const factor = months.reduce((f, mm) => f * (1 + byMonth.get(mm) / 100), 1);
    res.json({
      desde, hasta,
      meses_compuestos: months.length,
      variacion_pct: Math.round((factor - 1) * 10000) / 100,
      factor: Math.round(factor * 1000000) / 1000000,
      ...(monto !== null ? { monto, monto_reajustado: Math.round(monto * factor) } : {}),
      metodologia: "Variación acumulada componiendo el IPC mensual oficial de los meses posteriores a 'desde' hasta 'hasta' inclusive (convención fin de mes).",
      fuente: "INE Chile vía mindicador.cl",
    });
  } catch (err) {
    upstreamError(res, "mindicador.cl (IPC)", err);
  }
}

// ---------- On-duty pharmacies ----------

export async function clFarmacias(req, res) {
  const comuna = req.query.comuna ? String(req.query.comuna).toUpperCase() : null;
  try {
    let locales = cache.get("farmacias");
    if (!locales) {
      locales = await fetchJson("https://midas.minsal.cl/farmacia_v2/WS/getLocalesTurnos.php", { timeoutMs: 12000 });
      cache.set("farmacias", locales);
    }
    const filtered = comuna
      ? locales.filter(l => String(l.comuna_nombre || "").toUpperCase().includes(comuna))
      : locales.slice(0, 100);
    res.json({
      comuna: comuna || "(todas, primeras 100)",
      total: filtered.length,
      farmacias: filtered.map(l => ({
        nombre: l.local_nombre,
        direccion: l.local_direccion,
        comuna: l.comuna_nombre,
        apertura: l.funcionamiento_hora_apertura,
        cierre: l.funcionamiento_hora_cierre,
        telefono: l.local_telefono,
      })),
      fuente: "MINSAL / Farmanet",
    });
  } catch (err) {
    upstreamError(res, "MINSAL Farmanet (intermitente — reintentar)", err);
  }
}
