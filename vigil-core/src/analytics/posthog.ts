// vigil-core/src/analytics/posthog.ts
// D-10 / D-12 / D-14 / D-15 — Phase 103 Plan 01.
// Source-of-truth pattern: 103-RESEARCH.md §Pattern 1 + §Complete module example.
// Verified against posthog-node@5.29.2 types.d.ts + client.d.ts.
//
// D-14: The ONLY public API is redactEvent / trackEvent / captureException /
// shutdownPosthog. Call sites MUST NOT import { posthog } directly — the
// singleton export exists only for test setup assertions.

import { PostHog, type EventMessage } from "posthog-node";

// ── D-12: Sensitive-route allowlist (routes whose request_body must be stripped) ──
// Literal Set<string> — exact path match. Paths are what Hono's c.req.path reports.
const SENSITIVE_ROUTES = new Set<string>([
  "/v1/chat",
  "/v1/process-photo",
  "/v1/process-audio",
  "/v1/thoughts",
  "/v1/therapy",
  "/v1/insights",
]);

/**
 * D-12: Pure redactor. Runs inside the SDK's before_send hook before any
 * network call. Returning null drops the event; returning the input unchanged
 * emits as-is; returning a new object emits the modified shape.
 *
 * Strips `request_body` and `headers` from event properties when the `route`
 * property matches the sensitive allowlist. Preserves route, method,
 * status_code, user id, and stack trace (everything else in properties).
 *
 * Exported for unit testing in posthog.test.ts — call sites should never use it.
 */
export function redactEvent(event: EventMessage | null): EventMessage | null {
  if (!event) return event;
  const props = (event.properties ?? {}) as Record<string, unknown>;
  const route = props["route"];
  if (typeof route === "string" && SENSITIVE_ROUTES.has(route)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { request_body: _body, headers: _headers, ...rest } = props;
    return { ...event, properties: rest };
  }
  return event;
}

// ── D-10: Key-absence gate. No environment-flag coupling. ────────────────────
// Local dev: POSTHOG_API_KEY unset → singleton is null → wrappers no-op.
// Railway prod: POSTHOG_API_KEY set → singleton is a real PostHog client.
const apiKey = process.env["POSTHOG_API_KEY"];

export const posthog: PostHog | null = apiKey
  ? new PostHog(apiKey, {
      host: "https://us.i.posthog.com",
      // D-13 autocapture — registers uncaught/unhandled handlers at construction.
      enableExceptionAutocapture: true,
      // D-12 — snake_case per posthog-node v5.29.2 types (Pitfall 2 in RESEARCH.md).
      before_send: redactEvent,
      // flushAt / flushInterval — SDK defaults (20 events / 10s) per CONTEXT.md discretion.
    })
  : null;

// ── D-14: Public wrapper API — the ONLY import path for call sites. ──────────

/**
 * Capture a product event. No-op when posthog singleton is null (D-10 gate).
 * Properties MUST be enums/booleans/numbers only — never user-generated strings
 * (STATE.md locked decision enforced at call sites by code review, not here).
 */
export function trackEvent(
  userId: number | string,
  event: string,
  properties: Record<string, string | number | boolean | null | undefined> = {},
): void {
  posthog?.capture({
    distinctId: String(userId),
    event,
    properties,
  });
}

/**
 * Capture an exception. No-op when posthog singleton is null (D-10 gate).
 * Normalizes non-Error throws (strings, objects) to Error instances so the SDK
 * always gets a proper stack trace. D-13 uses this from app.onError.
 */
export function captureException(
  userId: number | string | null,
  err: unknown,
  context: Record<string, string | number | boolean | undefined> = {},
): void {
  const error = err instanceof Error ? err : new Error(String(err));
  posthog?.captureException(
    error,
    userId == null ? "anonymous" : String(userId),
    context,
  );
}

/**
 * D-15: Flush buffered events to PostHog and tear down timers. MUST be awaited
 * as the FIRST await in each signal handler (SIGTERM/SIGINT) — wiring lives in
 * Plan 04 (index.ts). No-op when singleton is null.
 */
export async function shutdownPosthog(): Promise<void> {
  await posthog?.shutdown();
}
