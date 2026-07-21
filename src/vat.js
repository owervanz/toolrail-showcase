// EU VAT: rates for 44 European countries + official VIES number validation.
// Rates: EC "Taxes in Europe" DB via the daily-updated vatnode dataset.
// Validation: official European Commission VIES REST API, with retries + cache
// (VIES is known for intermittent MS_UNAVAILABLE responses — resilience IS the product).

import { fetchJson, TTLCache, badRequest, upstreamError } from "./util.js";

const RATES_URL = "https://raw.githubusercontent.com/vatnode/eu-vat-rates-data/main/data/eu-vat-rates-data.json";
const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";

const ratesCache = new TTLCache(24 * 60 * 60 * 1000);
const viesCache = new TTLCache(60 * 60 * 1000);

async function loadRates() {
  let all = ratesCache.get("rates");
  if (!all) all = ratesCache.set("rates", await fetchJson(RATES_URL, { timeoutMs: 10000 }));
  return all;
}

export async function vatRates(req, res) {
  const country = req.query.country ? String(req.query.country).toUpperCase() : null;
  try {
    const all = await loadRates();
    const { version, source, rates = {} } = all;
    if (!country) {
      const summary = {};
      for (const [code, info] of Object.entries(rates)) {
        summary[code] = { country: info.country, standard: info.standard, reduced: info.reduced };
      }
      return res.json({ version, source, countries: summary });
    }
    const info = rates[country];
    if (!info || !info.country) return badRequest(res, `Unknown country code '${country}'. Use ISO codes like DE, FR, ES.`);
    res.json({ version, source, code: country, ...info });
  } catch (err) {
    upstreamError(res, "EC TEDB dataset", err);
  }
}

export async function vatPrice(req, res) {
  const amount = Number(req.body?.amount);
  const country = String(req.body?.country || "").toUpperCase();
  const direction = String(req.body?.direction || "net-to-gross");
  const rateType = String(req.body?.rate || "standard");
  if (!Number.isFinite(amount) || amount <= 0) return badRequest(res, "'amount' must be a positive number.");
  if (!/^[A-Z]{2}$/.test(country)) return badRequest(res, "'country' must be an ISO code like DE, FR, ES.");
  if (!["net-to-gross", "gross-to-net"].includes(direction)) return badRequest(res, "'direction' must be 'net-to-gross' or 'gross-to-net'.");
  try {
    const all = await loadRates();
    const info = all.rates?.[country];
    if (!info) return badRequest(res, `Unknown country '${country}'.`);
    let rate;
    if (rateType === "standard") rate = info.standard;
    else if (rateType === "reduced") rate = Array.isArray(info.reduced) ? info.reduced[0] : null;
    else rate = Number(rateType); // allow explicit numeric rate for special cases
    if (!Number.isFinite(rate)) return badRequest(res, `Rate '${rateType}' not available for ${country}. Standard: ${info.standard}, reduced: ${JSON.stringify(info.reduced)}.`);
    const r = rate / 100;
    const net = direction === "net-to-gross" ? amount : amount / (1 + r);
    const gross = direction === "net-to-gross" ? amount * (1 + r) : amount;
    const round = n => Math.round(n * 100) / 100;
    res.json({
      country, currency: info.currency, vat_name: info.vat_abbr || info.vat_name,
      rate_percent: rate, rate_type: rateType,
      net: round(net), vat: round(gross - net), gross: round(gross),
      dataset_version: all.version, source: all.source,
    });
  } catch (err) {
    upstreamError(res, "EC TEDB dataset", err);
  }
}

export async function vatValidate(req, res) {
  const countryCode = String(req.body?.countryCode || "").toUpperCase();
  const vatNumber = String(req.body?.vatNumber || "").replace(/[\s.-]/g, "");
  if (!/^[A-Z]{2}$/.test(countryCode) || !vatNumber) {
    return badRequest(res, "Body must include countryCode (e.g. 'DE') and vatNumber.");
  }

  const key = `${countryCode}${vatNumber}`;
  const cached = viesCache.get(key);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    const data = await fetchJson(VIES_URL, {
      timeoutMs: 10000,
      retries: 3, // VIES member states are frequently briefly unavailable
      options: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode, vatNumber }),
      },
    });
    const result = {
      countryCode,
      vatNumber,
      valid: Boolean(data.valid),
      name: data.name || null,
      address: data.address || null,
      consultationDate: data.requestDate || new Date().toISOString(),
      source: "European Commission VIES",
    };
    viesCache.set(key, result);
    res.json(result);
  } catch (err) {
    upstreamError(res, "VIES (EU member state temporarily unavailable — retry later)", err);
  }
}
