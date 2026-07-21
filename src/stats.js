// In-memory usage counters: which endpoints get probed, paid, and served.
// Intentionally simple — no DB, resets on restart. Purpose: spot demand trends,
// not accounting (payments are already the on-chain source of truth).

import { config } from "./config.js";
import { safeEqual } from "./security.js";

const startedAt = new Date().toISOString();
const counters = new Map(); // "METHOD /path" -> { requests, ok, unpaid, errors }

let knownPaths = new Set();
export function registerKnownPaths(paths) {
  knownPaths = new Set(paths);
}

export function statsMiddleware(req, res, next) {
  const path = req.path.replace(/\/+$/, "") || "/";
  const key = knownPaths.has(path) ? `${req.method} ${path}` : "OTHER";
  res.on("finish", () => {
    const c = counters.get(key) || { requests: 0, ok: 0, unpaid: 0, errors: 0 };
    c.requests++;
    if (res.statusCode === 402) c.unpaid++;
    else if (res.statusCode >= 200 && res.statusCode < 300) c.ok++;
    else if (res.statusCode >= 500) c.errors++;
    counters.set(key, c);
  });
  next();
}

export function statsEndpoint(req, res) {
  if (!config.adminKey) {
    return res.status(503).json({ error: "Stats disabled: set ADMIN_KEY env var, then call /admin/stats with header X-Admin-Key (preferred) or ?key=." });
  }
  // Header preferred (query strings end up in proxy/server logs); both accepted.
  const provided = req.get("x-admin-key") || String(req.query.key || "");
  if (!safeEqual(provided, config.adminKey)) {
    return res.status(403).json({ error: "Invalid key." });
  }
  const byRoute = Object.fromEntries(
    [...counters.entries()].sort((a, b) => b[1].requests - a[1].requests)
  );
  res.json({
    since: startedAt,
    uptime_s: Math.round(process.uptime()),
    note: "In-memory counters, reset on each restart/deploy. unpaid = 402 challenges served (interest without payment); ok = completed responses.",
    routes: byRoute,
  });
}

// Periodic one-line summary into server logs (survives in Render's log stream
// even without querying /admin/stats).
export function startStatsLogging(intervalMs = 6 * 60 * 60 * 1000) {
  setInterval(() => {
    const total = [...counters.values()].reduce((s, c) => s + c.requests, 0);
    if (!total) return;
    const top = [...counters.entries()].sort((a, b) => b[1].requests - a[1].requests).slice(0, 5)
      .map(([k, c]) => `${k}:${c.requests}`).join(" | ");
    console.log(`[stats] total=${total} top: ${top}`);
  }, intervalMs).unref();
}
