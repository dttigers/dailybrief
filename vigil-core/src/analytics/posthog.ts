// vigil-core/src/analytics/posthog.ts
// D-10 / D-12 / D-14 / D-15 — Phase 103 Plan 01.
// Source-of-truth pattern: 103-RESEARCH.md §Pattern 1 + §Complete module example.
// Verified against posthog-node@5.29.2 types.d.ts + client.d.ts.
//
// D-14: The ONLY public API is redactEvent / trackEvent / identifyUser /
// captureException / shutdownPosthog. Call sites MUST NOT import { posthog }
// directly — the singleton export exists only for test setup assertions.

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

// ── D-01..D-04: Property-name denylist for trackEvent runtime guard ──────────
// The locked v3.5 rule: PostHog event properties MUST be enums/booleans/numbers
// only — never user-generated string content. Type signatures intend this; the
// runtime check enforces it. Any property whose NAME (case-sensitive) is in this
// Set is silently dropped from the emitted event, and a `posthog_property_blocked`
// meta-event is captured so leak attempts surface in PostHog itself (D-02).
//
// Exported for tests and to make the rule grep-visible.
// Easy to extend — add a string, no type changes needed.
export const BLOCKED_PROPERTY_NAMES = new Set<string>([
  "content",
  "body",
  "text",
  "message",
  "description",
  "title",
  "note",
  "transcript",
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
 * Capture a product event. No-op when posthog singleton is null (Phase 103 D-10 gate).
 * D-01..D-04: Properties whose NAME is in BLOCKED_PROPERTY_NAMES are dropped silently
 * (case-sensitive match). For each dropped property, a `posthog_property_blocked`
 * meta-event is emitted with {event_name, property_name}. The user's event still emits
 * with the surviving allowed properties — drop-the-property, not drop-the-event (D-02).
 * Signature unchanged from Phase 103 (D-03) — zero call-site churn.
 *
 * Phase 105 WR-01 fix: the entire body is wrapped in try/catch so analytics
 * failure NEVER breaks a real request. Previously this guarantee lived only in
 * metricsMiddleware; centralizing here means every direct call site (thoughts,
 * process-photo, brief-generate, chat) inherits the contract without each
 * having to wrap on its own. The posthog-node SDK currently swallows capture
 * errors internally, so this catch is defense-in-depth against future SDK
 * regressions or malformed-property validation throws.
 */
export function trackEvent(
  userId: number | string,
  event: string,
  properties: Record<string, string | number | boolean | null | undefined> = {},
): void {
  try {
    // Partition properties into (allowed, blocked) in one pass.
    const allowed: Record<string, string | number | boolean | null | undefined> = {};
    const blocked: string[] = [];
    for (const key of Object.keys(properties)) {
      if (BLOCKED_PROPERTY_NAMES.has(key)) {
        blocked.push(key);
      } else {
        allowed[key] = properties[key];
      }
    }

    // D-02: Emit one meta-event per blocked property name. These fire BEFORE the
    // user's event so a downstream PostHog consumer always sees the canary first.
    // No-op if posthog === null (D-10 gate).
    for (const blockedName of blocked) {
      posthog?.capture({
        distinctId: String(userId),
        event: "posthog_property_blocked",
        properties: {
          event_name: event,
          property_name: blockedName,
        },
      });
    }

    // D-02: User's event still emits with surviving properties (drop the bad
    // property, not the entire event). Even if `allowed` is empty, the event
    // itself is still useful — `thought_created` with no props beats no event.
    posthog?.capture({
      distinctId: String(userId),
      event,
      properties: allowed,
    });
  } catch (err) {
    // WR-01: analytics failure must NEVER break a real request. All four direct
    // call sites (thoughts.ts, process-photo.ts, brief-generate.ts, chat.ts)
    // invoke trackEvent AFTER transactionally committing user work — a throw
    // here would surface as a 5xx and prompt client-side retry, creating
    // duplicate thought/brief/chat records. Log and swallow.
    console.error(
      "[posthog] trackEvent failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Set person properties for an authenticated user. No-op when posthog singleton
 * is null (Phase 103 D-10 gate). Wraps `posthog.identify` so route call sites
 * stay wrapper-only (Phase 103 D-14 — no direct singleton imports outside this
 * module). Plan 03 calls this from /v1/me on every successful response so the
 * PostHog person record stays fresh (D-09: email + createdAt).
 *
 * Properties are wrapped in `$set` explicitly. The posthog-node SDK autowraps
 * flat properties into `$set` via a destructure in client.js, but that
 * indirection is fragile — if the caller ever happens to pass a property named
 * `$set`, `$set_once`, or `$anon_distinct_id`, it would hijack the destructure
 * and silently drop the real person properties. Explicit `$set` avoids that
 * footgun and matches the "advanced" JSDoc example in posthog-node's types.
 */
export function identifyUser(
  userId: number | string,
  properties: Record<string, string | number | boolean | null | undefined> = {},
): void {
  posthog?.identify({
    distinctId: String(userId),
    properties: { $set: properties },
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
