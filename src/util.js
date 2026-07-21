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
    if (Date.now() > hit.expires) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key, value) {
    if (this.map.size > 5000) this.map.clear();
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
    return value;
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
