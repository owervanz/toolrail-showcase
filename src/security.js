// Security hardening layer: rate limiting, security headers, timing-safe
// comparisons. Zero external dependencies — small, auditable, in-memory.

import crypto from "node:crypto";
import { config } from "./config.js";

// ---------- Per-IP rate limiter (fixed window) ----------
// Generous by default (legit agent bursts pass untouched); floods get 429.
// Behind Render's proxy `app.set("trust proxy", 1)` makes req.ip the client IP.

const WINDOW_MS = 60 * 1000;
const buckets = new Map(); // ip -> { count, windowStart }

export function rateLimiter(req, res, next) {
  const limit = config.rateLimitPerMin;
  if (!limit) return next(); // disabled via env RATE_LIMIT_PER_MIN=0
  const ip = req.ip || "unknown";
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    b = { count: 0, windowStart: now };
    buckets.set(ip, b);
  }
  b.count++;
  if (b.count > limit) {
    res.setHeader("Retry-After", Math.ceil((b.windowStart + WINDOW_MS - now) / 1000));
    return res.status(429).json({ error: "Rate limit exceeded. Slow down and retry shortly." });
  }
  // Bound memory under IP-rotation floods
  if (buckets.size > 20000) buckets.clear();
  next();
}

// ---------- Security headers ----------

export function securityHeaders(req, res, next) {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
}

// CSP only for our own landing page (scriptless by design). Applied per-route
// so it can't interfere with the x402 paywall HTML on paid endpoints.
export const LANDING_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

// ---------- Timing-safe secret comparison ----------

export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
