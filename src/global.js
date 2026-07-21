// Global utilities for agents:
// - Public holidays & business-day math for ~187 countries (Nager.Date, free, no key).
//   For Chile we merge Nager with our curated table (data/feriados-chile.json) for accuracy.
// - IBAN validation: ISO 13616 mod-97 + per-country length registry (pure logic).
// - Phone validation/formatting for ~240 regions (google-libphonenumber, pure logic).
// - QR code generation (PNG/SVG bytes).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import libphonenumber from "google-libphonenumber";
import QRCode from "qrcode";
import { fetchJson, TTLCache, badRequest, upstreamError } from "./util.js";

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const FERIADOS_CL = JSON.parse(readFileSync(path.join(dataDir, "feriados-chile.json"), "utf8"));

const cache = new TTLCache(24 * 60 * 60 * 1000);
const NAGER = "https://date.nager.at/api/v3";

// ---------- Holidays (global) ----------

async function getHolidays(country, year) {
  const key = `hol:${country}:${year}`;
  let list = cache.get(key);
  if (list) return list;
  list = await fetchJson(`${NAGER}/PublicHolidays/${year}/${country}`, { timeoutMs: 10000 });
  if (!Array.isArray(list)) throw new Error("unexpected Nager response");
  // For Chile, union with our curated table (statutory moved holidays, early coverage).
  if (country === "CL" && FERIADOS_CL.holidays[String(year)]) {
    const seen = new Set(list.map(h => h.date));
    for (const h of FERIADOS_CL.holidays[String(year)]) {
      if (!seen.has(h.date)) list.push({ date: h.date, localName: h.name, name: h.name, countryCode: "CL", global: true, types: ["Public"] });
    }
    list.sort((a, b) => a.date.localeCompare(b.date));
  }
  return cache.set(key, list);
}

export async function daysHolidays(req, res) {
  const country = String(req.query.country || "").toUpperCase();
  const year = Number(req.query.year || new Date().getFullYear());
  if (!/^[A-Z]{2}$/.test(country)) return badRequest(res, "'country' must be an ISO 3166-1 alpha-2 code (e.g. DE, US, CL).");
  if (!Number.isInteger(year) || year < 1975 || year > 2075) return badRequest(res, "'year' must be an integer between 1975 and 2075.");
  try {
    const list = await getHolidays(country, year);
    res.json({
      country, year, total: list.length,
      holidays: list.map(h => ({ date: h.date, name: h.name, local_name: h.localName, nationwide: h.global !== false, counties: h.counties || null, types: h.types || [] })),
      source: country === "CL" ? "Nager.Date + curated Chilean statutory table" : "Nager.Date (public holidays dataset)",
    });
  } catch (err) {
    upstreamError(res, `Nager.Date (country '${country}' may be unsupported)`, err);
  }
}

export async function daysBusinessDays(req, res) {
  const country = String(req.query.country || "").toUpperCase();
  const from = String(req.query.from || new Date().toISOString().slice(0, 10));
  const days = Number(req.query.days || 0);
  const nationwideOnly = String(req.query.nationwide_only || "true") !== "false";
  if (!/^[A-Z]{2}$/.test(country)) return badRequest(res, "'country' must be an ISO 3166-1 alpha-2 code.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return badRequest(res, "'from' must be YYYY-MM-DD.");
  if (!Number.isInteger(days) || days < 0 || days > 1095) return badRequest(res, "'days' must be an integer 0-1095.");

  const start = new Date(`${from}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return badRequest(res, "Invalid 'from' date.");

  try {
    // Preload holiday sets for the years the walk can touch.
    const startYear = start.getUTCFullYear();
    const years = [startYear, startYear + 1 + Math.floor(days / 250)];
    const holidaySet = new Set();
    for (let y = years[0]; y <= years[1]; y++) {
      for (const h of await getHolidays(country, y)) {
        if (!nationwideOnly || h.global !== false) holidaySet.add(h.date);
      }
    }

    const isBiz = d => {
      const dow = d.getUTCDay();
      if (dow === 0 || dow === 6) return false; // weekend assumed Sat-Sun (see note)
      return !holidaySet.has(d.toISOString().slice(0, 10));
    };

    const cursor = new Date(start);
    let remaining = days;
    const skippedHolidays = [];
    while (remaining > 0) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      const iso = cursor.toISOString().slice(0, 10);
      if (isBiz(cursor)) remaining--;
      else if (holidaySet.has(iso)) skippedHolidays.push(iso);
    }
    res.json({
      country, from, days,
      result_date: cursor.toISOString().slice(0, 10),
      is_business_day_start: isBiz(start),
      skipped_holidays: skippedHolidays,
      note: "Weekend assumed Saturday-Sunday. Set nationwide_only=false to also skip regional holidays.",
      source: "Nager.Date public holidays",
    });
  } catch (err) {
    upstreamError(res, `Nager.Date (country '${country}' may be unsupported)`, err);
  }
}

// ---------- IBAN ----------

// ISO 13616 registry: official IBAN length per country code.
const IBAN_LENGTHS = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DJ: 27, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FK: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23,
  GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27,
  JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25,
  MC: 27, MD: 24, ME: 22, MK: 19, MN: 20, MR: 27, MT: 31, MU: 30, NI: 28, NL: 18,
  NO: 15, OM: 23, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, RU: 33,
  SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, SO: 23, ST: 25, SV: 28,
  TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20, YE: 30,
};

export function validateIban(req, res) {
  const raw = String(req.body?.iban ?? req.query.iban ?? "").trim();
  if (!raw) return badRequest(res, "Provide 'iban' in body or query.");
  const iban = raw.replace(/[\s-]/g, "").toUpperCase();
  const fail = reason => res.json({ iban: raw, valid: false, reason });

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return fail("Malformed: expected 2 letters, 2 check digits, then alphanumerics.");
  const country = iban.slice(0, 2);
  const expectedLen = IBAN_LENGTHS[country];
  if (!expectedLen) return fail(`Unknown IBAN country code '${country}'.`);
  if (iban.length !== expectedLen) return fail(`Wrong length for ${country}: got ${iban.length}, expected ${expectedLen}.`);

  // ISO 7064 mod-97: move first 4 chars to the end, map A-Z to 10-35, mod 97 must be 1.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const v = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of v) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  if (remainder !== 1) return fail("Check digits do not validate (mod-97).");

  res.json({
    iban: raw, valid: true, country,
    formatted: iban.replace(/(.{4})/g, "$1 ").trim(),
    check_digits: iban.slice(2, 4),
    bban: iban.slice(4),
  });
}

// ---------- Phone ----------

const phoneUtil = libphonenumber.PhoneNumberUtil.getInstance();
const PNF = libphonenumber.PhoneNumberFormat;
const PNT = libphonenumber.PhoneNumberType;
const TYPE_NAMES = Object.fromEntries(Object.entries(PNT).map(([k, v]) => [v, k.toLowerCase()]));

export function validatePhone(req, res) {
  const raw = String(req.body?.phone ?? req.query.phone ?? "").trim();
  const region = (req.body?.region ?? req.query.region ?? "") ? String(req.body?.region ?? req.query.region).toUpperCase() : undefined;
  if (!raw) return badRequest(res, "Provide 'phone' (E.164 like +56912345678, or national format with 'region').");
  try {
    const num = phoneUtil.parse(raw, region);
    const valid = phoneUtil.isValidNumber(num);
    if (!valid) return res.json({ phone: raw, valid: false, reason: "Number is not valid for its region." });
    res.json({
      phone: raw,
      valid: true,
      region: phoneUtil.getRegionCodeForNumber(num),
      type: TYPE_NAMES[phoneUtil.getNumberType(num)] || "unknown",
      e164: phoneUtil.format(num, PNF.E164),
      international: phoneUtil.format(num, PNF.INTERNATIONAL),
      national: phoneUtil.format(num, PNF.NATIONAL),
    });
  } catch (err) {
    res.json({ phone: raw, valid: false, reason: String(err.message || err) });
  }
}

// ---------- QR ----------

export async function qrEndpoint(req, res) {
  const data = String(req.body?.data ?? req.query.data ?? "");
  const format = String(req.body?.format ?? req.query.format ?? "png").toLowerCase();
  const size = Math.min(Math.max(Number(req.body?.size ?? req.query.size ?? 512) || 512, 64), 2048);
  if (!data) return badRequest(res, "Provide 'data' (text/URL to encode, max 2000 chars).");
  if (data.length > 2000) return badRequest(res, "'data' too long (max 2000 chars).");
  if (!["png", "svg"].includes(format)) return badRequest(res, "'format' must be png or svg.");
  try {
    if (format === "svg") {
      const svg = await QRCode.toString(data, { type: "svg", width: size, margin: 2 });
      res.type("image/svg+xml").send(svg);
    } else {
      const png = await QRCode.toBuffer(data, { type: "png", width: size, margin: 2 });
      res.type("image/png").send(png);
    }
  } catch (err) {
    res.status(500).json({ error: "QR generation failed", detail: String(err.message || err) });
  }
}
