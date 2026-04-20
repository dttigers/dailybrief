// vigil-core/src/middleware/metrics.ts
// Phase 105 Plan 02 — ANLY-03 per-route API metrics middleware.
//
// D-05: Registered AFTER bearerAuth in index.ts so c.var.userId is always
//       populated. Public routes (/v1/health, /v1/auth/*, OAuth callback) run
//       in the dispatcher's `return next()` short-circuit and never reach
//       this middleware — they are intentionally NOT measured (no userId →
//       no person attribution).
// D-06: 100% sampling. Every authenticated request emits one api_request
//       event. PostHog SDK batching (flushAt: 20 / flushInterval: 10s,
//       Phase 103 defaults) keeps throughput cheap.
// D-07: performance.now() before/after `await next()` — full downstream
//       stack timed (handler + lower middleware).
// D-08: SINGLE event name `api_request` with primitive properties only:
//       { route, method, status, duration_ms, status_class }.
//       status_class enum: '2xx' | '3xx' | '4xx' | '5xx' | '1xx'.
//
// Wrapper-only call site (Phase 103 D-14): imports trackEvent, never the
// posthog singleton directly. Plan 01's BLOCKED_PROPERTY_NAMES guard
// automatically protects against future property additions.

import type { MiddlewareHandler } from "hono";
import { trackEvent } from "../analytics/posthog.js";

/** Map an HTTP status code to its class enum (D-08). */
export function statusClass(
  status: number,
): "1xx" | "2xx" | "3xx" | "4xx" | "5xx" {
  const bucket = Math.floor(status / 100);
  switch (bucket) {
    case 1:
      return "1xx";
    case 2:
      return "2xx";
    case 3:
      return "3xx";
    case 4:
      return "4xx";
    case 5:
      return "5xx";
    default:
      return "5xx"; // 0 / negative / >=600 — treat as server error
  }
}

/**
 * Build a metricsMiddleware. Production uses the default (real trackEvent);
 * tests inject a spy to assert call shape without going through the SDK shim.
 * Mirrors the dep-injection pattern from createProcessPhotoRouter / createMeRouter.
 */
export function createMetricsMiddleware(
  trackFn: typeof trackEvent = trackEvent,
): MiddlewareHandler {
  return async (c, next) => {
    const start = performance.now();
    await next();
    const duration_ms = Math.round(performance.now() - start);

    // Defensive: bearerAuth ALWAYS sets userId for paths that reach here.
    // Skip emission if absent so we never produce anonymous metrics (D-05).
    const userId = c.get("userId") as number | undefined;
    if (userId == null) return;

    const status = c.res.status;
    try {
      trackFn(userId, "api_request", {
        route: c.req.path,
        method: c.req.method,
        status,
        duration_ms,
        status_class: statusClass(status),
      });
    } catch (err) {
      // Analytics failure must NEVER break a real request. Phase 103 D-10
      // guarantees trackEvent itself is null-guarded; this catch protects
      // against any future SDK throw.
      console.error(
        "[metrics] api_request emit failed (non-fatal):",
        err instanceof Error ? err.message : err,
      );
    }
  };
}

/** Production singleton — what index.ts mounts. */
export const metricsMiddleware: MiddlewareHandler = createMetricsMiddleware();
