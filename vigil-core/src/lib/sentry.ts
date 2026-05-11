// vigil-core/src/lib/sentry.ts
// Phase 126 (AUTH-126-04 / Plan 126-03): Sentry server-side wrapper.
//
// Sibling of `vigil-core/src/analytics/posthog.ts`. Both wrap a third-party
// error sink with init-once + key-absence no-op. PostHog stays — Sentry is
// ADDITIVE: Plan 06 wires the app.onError handler at index.ts:252-260 to call
// BOTH captureToSentry() and captureException() (PostHog) so a single error
// fans out to both backends.
//
// Mount-order contract (load-bearing — Plan 06 drift detector enforces):
//   initSentry() MUST be called BEFORE `new Hono()` in index.ts.
//   Sentry's recommended init pattern requires the SDK be active before any
//   instrumented library or app handler imports, so import-time exceptions
//   are captured. The mount-order drift detector in src/__tests__/mount-order.test.ts
//   pins this via source.indexOf("initSentry()") < source.indexOf("new Hono()").
//
// Env-gate behavior (D-04 / RESEARCH §AUTH-126-04):
//   SENTRY_DSN unset  → initSentry() no-ops silently (local dev shape — mirrors
//                       analytics/posthog.ts:69-80 POSTHOG_API_KEY null-singleton).
//                       Subsequent captureToSentry() calls also no-op.
//   SENTRY_DSN set    → Sentry.init({dsn, environment, tracesSampleRate: 0}).
//                       The internal `initialized` flag flips to true; capture
//                       helpers route through Sentry.withScope.
//
// Sentry v10 API note (RESEARCH §R9):
//   Sentry v8+ removed the legacy Hub API and deprecated the pre-v8
//   per-call scope-configuration helper. This module uses
//   Sentry.withScope((scope) => ...) — the canonical v10 functional API.
//   DO NOT reintroduce the deprecated pre-v8 surface (see RESEARCH §R9).
//
// Property-name denylist awareness (Phase 103 D-01..D-04 carryforward — R12):
//   Sentry context object keys (passed as the third arg to captureToSentry)
//   MUST avoid the Phase 103 PostHog `BLOCKED_PROPERTY_NAMES` set:
//     content, body, text, message, description, title, note, transcript
//   Callers should use `route`, `method`, `userId`-shaped context instead.
//   The existing PostHog `app.onError` call site at index.ts:255-258 already
//   uses `{route, method}` shape — Plan 06 mirrors the same context object
//   into captureToSentry. This file's drift-detector test (sentry.test.ts —
//   AUTH-126-SENTRY-PROPNAMES) asserts at least one of `route`/`method` is
//   mentioned in this source so future planners cannot silently regress to the
//   denylisted shape.
//
// Bearer / PII leak defenses (RESEARCH §Security Domain — T-126-03-01):
//   Sentry.init() is called with `sendDefaultPii: false` (the v10 default).
//   We do NOT enable the optional HTTP breadcrumb capture with headers, and
//   we do NOT call Sentry.flush() per-capture (the SDK batches internally;
//   fire-and-forget is the correct shape for captureException).

import * as Sentry from "@sentry/node";

// Module-scope mutable state. Mirrors analytics/posthog.ts's `apiKey` + null
// singleton pair, but inverted: PostHog uses an immutable null-or-client export
// (eager-singleton); Sentry uses a function-call boot (initSentry) because the
// SDK must be active BEFORE any other module imports run for v10 auto-init
// integrations to attach. The boolean flag lets captureToSentry no-op
// idempotently when init never ran (DSN unset) or when capture is called
// before init (defense-in-depth — should not happen if mount-order holds, but
// a misordered import in a future phase would surface as silent no-op instead
// of a crash). T-126-03-05 (Tampering of initialized flag) is `accept` —
// module-scope mutable state is intentional for test-time reset semantics.
let initialized = false;

/**
 * Initialize the Sentry SDK if `SENTRY_DSN` is set. Idempotent — safe to call
 * multiple times (re-init flips internal Sentry state but does not throw).
 *
 * MUST be called BEFORE `new Hono()` in `vigil-core/src/index.ts` (mount-order
 * contract — Plan 06 drift detector pins this position).
 *
 * Local dev: `SENTRY_DSN` is unset → this function returns silently and
 * `captureToSentry` calls become no-ops. No console output, no warnings —
 * matches the analytics/posthog.ts key-absence shape so local dev boots clean.
 *
 * Railway prod: `SENTRY_DSN` is set in Railway env → `Sentry.init` runs with
 * `tracesSampleRate: 0` (errors-only, no performance tracing — keeps us under
 * the 5k events/mo Developer-tier quota per CONTEXT.md additional_context).
 */
export function initSentry(): void {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: 0,
    // sendDefaultPii defaults to false in v10 — DO NOT override to true
    // (T-126-03-01 Bearer-leak mitigation).
  });
  initialized = true;
}

/**
 * Capture an exception to Sentry. No-op when `initialized` is false (DSN unset
 * or init never called). Normalizes non-Error throws (strings, plain objects)
 * to Error instances so the SDK always receives a proper stack trace —
 * mirrors `analytics/posthog.ts:181-192` `captureException` signature and
 * behavior verbatim so Plan 06's app.onError handler can call BOTH wrappers
 * with the same args.
 *
 * Context object naming (R12 / Phase 103 carryforward):
 *   Prefer `{route: string, method: string, userId?: number|string}` shape.
 *   Do NOT pass user-content fields named `body`/`content`/`message`/`text`/
 *   `description`/`title`/`note`/`transcript` — these are on the Phase 103
 *   `BLOCKED_PROPERTY_NAMES` denylist and would leak user-generated content
 *   into Sentry. The existing index.ts:255-258 PostHog call site already
 *   uses the safe `{route, method}` shape; Plan 06 reuses it verbatim.
 */
export function captureToSentry(
  userId: number | string | null,
  err: unknown,
  context: Record<string, string | number | boolean | undefined> = {},
): void {
  if (!initialized) return;
  const error = err instanceof Error ? err : new Error(String(err));
  Sentry.withScope((scope) => {
    if (userId !== null) scope.setUser({ id: String(userId) });
    scope.setContext("request", context);
    Sentry.captureException(error);
  });
}
