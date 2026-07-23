// Brazil pack — the largest LATAM economy, served from its excellent official APIs:
// - Key rates & indices from Banco Central do Brasil's SGS API (no key required):
//   SELIC target (432), CDI annualized (4389), IPCA monthly variation (433), PTAX USD (1).
// - Postal code (CEP) lookup via ViaCEP (the de-facto standard, no key).

import { fetchJson, TTLCache, badRequest, upstreamError, cachedOrStale } from "./util.js";

const cache = new TTLCache(6 * 60 * 60 * 1000);

const SGS = {
  selic: { serie: 432, nombre: "SELIC meta", unidad: "% a.a." },
  cdi: { serie: 4389, nombre: "CDI anualizado", unidad: "% a.a." },
  ipca: { serie: 433, nombre: "IPCA variación mensual", unidad: "% mensual" },
  ptax: { serie: 1, nombre: "Dólar PTAX venta", unidad: "BRL por USD" },
};

function sgsLatest(serie) {
  return cachedOrStale(cache, `sgs:${serie}`, async () => {
    const data = await fetchJson(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`, { timeoutMs: 12000 });
    const d = data?.[0];
    if (!d) throw new Error(`SGS ${serie}: sin datos`);
    const [dd, mm, yy] = d.data.split("/");
    return { valor: Number(d.valor), fecha: `${yy}-${mm}-${dd}` };
  });
}

export async function brIndices(req, res) {
  // One slow/down series (e.g. PTAX) shouldn't take out the other three —
  // settle each independently instead of failing the whole call on Promise.all.
  const results = await Promise.allSettled(
    Object.entries(SGS).map(async ([k, meta]) => {
      const { value, stale } = await sgsLatest(meta.serie);
      return [k, { valor: value.valor, fecha: value.fecha, nombre: meta.nombre, unidad: meta.unidad, ...(stale ? { stale: true } : {}) }];
    })
  );
  const indices = {};
  const errores = [];
  Object.keys(SGS).forEach((k, i) => {
    const r = results[i];
    if (r.status === "fulfilled") indices[r.value[0]] = r.value[1];
    else errores.push({ indicador: k, error: String(r.reason?.message || r.reason).slice(0, 120) });
  });
  if (!Object.keys(indices).length) return upstreamError(res, "Banco Central do Brasil (SGS)", new Error("ninguna serie respondió"));
  res.json({
    pais: "Brasil", indices, fuente: "Banco Central do Brasil (SGS)",
    ...(errores.length ? { indicadores_no_disponibles: errores } : {}),
  });
}

export async function brCep(req, res) {
  const raw = String(req.query.cep || "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(raw)) return badRequest(res, "'cep' must have 8 digits (e.g. 01310-100).");
  try {
    const key = `cep:${raw}`;
    let data = cache.get(key);
    if (!data) data = cache.set(key, await fetchJson(`https://viacep.com.br/ws/${raw}/json/`, { timeoutMs: 10000 }));
    if (data.erro) return res.json({ cep: raw, found: false });
    res.json({
      cep: data.cep, found: true,
      calle: data.logradouro || null, complemento: data.complemento || null,
      barrio: data.bairro || null, ciudad: data.localidade, estado: data.uf,
      ibge: data.ibge || null, ddd: data.ddd || null,
      fuente: "ViaCEP",
    });
  } catch (err) {
    upstreamError(res, "ViaCEP", err);
  }
}
