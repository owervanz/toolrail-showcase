// FX rates via Frankfurter (ECB official reference rates).
// Free, no key, no hard quota. https://frankfurter.dev

import { fetchJson, TTLCache, badRequest, upstreamError } from "./util.js";

const cache = new TTLCache(60 * 60 * 1000); // rates update once per working day
const BASE = "https://api.frankfurter.dev/v1";

export async function fxConvert(req, res) {
  const from = String(req.query.from || "").toUpperCase();
  const to = String(req.query.to || "").toUpperCase();
  const amount = Number(req.query.amount || 1);
  const date = req.query.date ? String(req.query.date) : "latest";

  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    return badRequest(res, "Params 'from' and 'to' must be 3-letter currency codes (e.g. USD, EUR).");
  }
  if (!Number.isFinite(amount) || amount <= 0) return badRequest(res, "'amount' must be a positive number.");
  if (date !== "latest" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return badRequest(res, "'date' must be YYYY-MM-DD or omitted for latest.");
  }

  const key = `${date}:${from}:${to}`;
  try {
    let rate = cache.get(key);
    if (rate === undefined) {
      const data = await fetchJson(`${BASE}/${date}?base=${from}&symbols=${to}`);
      rate = data.rates?.[to];
      if (typeof rate !== "number") return badRequest(res, `Currency pair ${from}/${to} not available (ECB covers ~30 major currencies; for CLP use /cl/indicadores).`);
      cache.set(key, rate);
    }
    res.json({
      from, to, amount,
      rate,
      converted: Math.round(amount * rate * 10000) / 10000,
      date: date === "latest" ? new Date().toISOString().slice(0, 10) : date,
      source: "European Central Bank reference rates via Frankfurter",
    });
  } catch (err) {
    upstreamError(res, "frankfurter.dev", err);
  }
}

export async function fxRates(req, res) {
  const base = String(req.query.base || "USD").toUpperCase();
  const date = req.query.date ? String(req.query.date) : "latest";
  if (!/^[A-Z]{3}$/.test(base)) return badRequest(res, "'base' must be a 3-letter currency code.");
  if (date !== "latest" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return badRequest(res, "'date' must be YYYY-MM-DD or omitted.");
  const key = `table:${date}:${base}`;
  try {
    let data = cache.get(key);
    if (!data) data = cache.set(key, await fetchJson(`${BASE}/${date}?base=${base}`));
    res.json({ base, date: data.date, rates: data.rates, source: "European Central Bank reference rates via Frankfurter" });
  } catch (err) {
    upstreamError(res, "frankfurter.dev", err);
  }
}

export async function fxCurrencies(req, res) {
  try {
    let list = cache.get("currencies");
    if (!list) list = cache.set("currencies", await fetchJson(`${BASE}/currencies`));
    res.json(list);
  } catch (err) {
    upstreamError(res, "frankfurter.dev", err);
  }
}
