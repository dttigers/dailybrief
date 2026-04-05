import type { MiddlewareHandler } from "hono";

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX) || 100;
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;

// Periodically clean up stale entries to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of store) {
    if (now - entry.windowStart > WINDOW_MS) {
      store.delete(ip);
    }
  }
}, 60_000).unref();

/**
 * Simple in-memory sliding-window rate limiter.
 * Limits each IP to RATE_LIMIT_MAX requests per RATE_LIMIT_WINDOW_MS window.
 */
export const rateLimiter: MiddlewareHandler = async (c, next) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    // New window
    store.set(ip, { count: 1, windowStart: now });
    await next();
    return;
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil(
      (entry.windowStart + WINDOW_MS - now) / 1000
    );
    c.header("Retry-After", String(retryAfter));
    return c.json(
      { error: "Rate limit exceeded", retryAfter },
      429
    );
  }

  await next();
};
