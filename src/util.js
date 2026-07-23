// Small shared helpers: fetch with timeout/retries and a TTL cache.

export async function fetchJson(url, { timeoutMs = 8000, retries = 2, options = {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(timer);
      // Never echo credentials embedded in source URLs into error messages
      // (they can end up in 502 bodies shown to callers).
      const safeUrl = url.replace(/([?&](?:token|apikey|key)=)[^&]+/gi, "$1***");
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${safeUrl}`);
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export class TTLCache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.map = new Map();
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    // Expired entries are kept (not deleted) so getStale() can still reach
    // them as a last-resort fallback — see cachedOrStale below.
    if (Date.now() > hit.expires) return undefined;
    return hit.value;
  }
  // Last known value regardless of TTL — used only when a live refetch has
  // already failed, so a transient upstream outage degrades to "serving a
  // recent, honestly-labeled value" instead of a hard error.
  getStale(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    return { value: hit.value, ageMs: Date.now() - (hit.expires - this.ttlMs) };
  }
  set(key, value) {
    if (this.map.size > 5000) this.map.clear();
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
    return value;
  }
}

// Cache-aside with a stale-on-error fallback: try the cache, then a live
// fetch, and only if BOTH the cache is cold/expired AND the live fetch fails
// does the caller see an error — if a previous (even expired) value exists,
// it's returned labeled `stale: true` instead. Callers merge `.value` into
// their response and check `.stale` to add a disclosure field.
export async function cachedOrStale(cache, key, fetchFn) {
  const fresh = cache.get(key);
  if (fresh !== undefined) return { value: fresh, stale: false };
  try {
    return { value: cache.set(key, await fetchFn()), stale: false };
  } catch (err) {
    const stale = cache.getStale(key);
    if (stale) return { value: stale.value, stale: true, staleAgeS: Math.round(stale.ageMs / 1000) };
    throw err;
  }
}

// "Today" as YYYY-MM-DD in a specific IANA timezone (en-CA locale renders ISO format).
// Daily values belong to their country's calendar day, not the server's UTC day.
export function todayIn(timeZone) {
  return new Date().toLocaleDateString("en-CA", { timeZone });
}

export function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

export function upstreamError(res, source, err) {
  return res.status(502).json({ error: `Upstream source failed: ${source}`, detail: String(err.message || err) });
}
