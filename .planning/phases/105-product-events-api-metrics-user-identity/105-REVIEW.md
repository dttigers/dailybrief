---
phase: 105-product-events-api-metrics-user-identity
reviewed: 2026-04-19T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - vigil-core/src/analytics/posthog.ts
  - vigil-core/src/analytics/posthog.test.ts
  - vigil-core/src/middleware/metrics.ts
  - vigil-core/src/middleware/metrics.test.ts
  - vigil-core/src/index.ts
  - vigil-core/src/routes/thoughts.ts
  - vigil-core/src/routes/process-photo.ts
  - vigil-core/src/routes/brief-generate.ts
  - vigil-core/src/routes/chat.ts
  - vigil-core/src/routes/me.ts
  - vigil-core/src/routes/me.test.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 105: Code Review Report

**Reviewed:** 2026-04-19
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 105 wires PostHog product events, a per-route `api_request` metrics middleware, and `identifyUser` propagation from `/v1/me`. The implementation is tight overall: the existing Phase 103 null-guard (`posthog?.`) and the wrapper-only call pattern (no direct `posthog` imports outside `analytics/posthog.ts`) are honored throughout, and the `BLOCKED_PROPERTY_NAMES` denylist keeps the attack surface narrow. Tests exercise every design decision from the plan (D-05..D-08 for metrics, D-09..D-11 for identify, D-15 for funnel events).

Two warnings cover real defense-in-depth gaps:

1. Four direct `trackEvent` call sites lack the try/catch that `metricsMiddleware` uses — a future SDK regression could turn an analytics throw into a user-facing 5xx.
2. `metricsMiddleware` is registered in `index.ts` *after* `googleAuth`, so `/v1/auth/google` initiation is silently un-measured.

Info items are smaller: asymmetric property-denylist between `trackEvent`/`identifyUser`, spy-type drift in tests, and a narrow observability gap for thrown-error responses.

No critical issues. No secrets, injection vectors, or auth regressions.

## Warnings

### WR-01: Direct `trackEvent` call sites are not wrapped in try/catch

**File:** `vigil-core/src/routes/thoughts.ts:308`, `vigil-core/src/routes/process-photo.ts:471`, `vigil-core/src/routes/brief-generate.ts:110`, `vigil-core/src/routes/chat.ts:111`

**Issue:** `metricsMiddleware` explicitly wraps `trackFn` in try/catch with the comment "Analytics failure must NEVER break a real request" (`metrics.ts:73-81`). The four direct call sites in the capture-funnel routes do not apply the same guard. If `trackEvent` ever throws (e.g., a future `posthog-node` upgrade removes the internal swallow, or a malformed property trips SDK validation), the thrown error propagates:

- `thoughts.ts:308` — inside the outer try (line 271), hits the catch on line 343 → `500 "Create failed"` even though the thought row was already committed.
- `process-photo.ts:471` — NO surrounding try; propagates to Hono's `app.onError` → `500 Internal server error` even though thought rows were inserted.
- `brief-generate.ts:110` — inside the outer try (line 54), hits the catch on line 126 → `500 "Brief generation failed"` even though the PDF was transactionally committed.
- `chat.ts:111` — inside the outer try (line 99), hits the catch on line 119 → `502 {message}` even though Claude returned a valid response.

Today this is latent (the `posthog?.` null-guard plus the SDK's non-throwing `.capture()` make a throw unlikely), but the middleware's comment acknowledges exactly this risk and the inconsistency is the wrong default. The symptom — thought saved but user sees 500 — is the worst kind of bug because the client will retry and create duplicates.

**Fix:** Either (a) wrap each call site in the same shape as `metrics.ts:65-82`, or (b) move the try/catch *inside* `trackEvent` so every caller inherits the guard. Option (b) is cheaper and centralizes the contract:

```typescript
// vigil-core/src/analytics/posthog.ts — inside trackEvent, wrapping both capture() calls
export function trackEvent(
  userId: number | string,
  event: string,
  properties: Record<string, string | number | boolean | null | undefined> = {},
): void {
  try {
    // ...existing partition + capture logic...
  } catch (err) {
    console.error(
      "[posthog] trackEvent failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }
}
```

Then `metrics.ts` can drop its own try/catch, and the four route call sites become safe without change.

### WR-02: `metricsMiddleware` is registered after `googleAuth`, silently dropping those routes from metrics

**File:** `vigil-core/src/index.ts:114` vs `vigil-core/src/index.ts:122`

**Issue:** Route registration order:
```
Line 114: app.route("/v1", googleAuth);          // /v1/auth/google (initiation)
Line 122: app.use("/v1/*", metricsMiddleware);   // registered AFTER googleAuth
Line 125+: app.route("/v1", summary); ...         // all other protected routes
```

In Hono, middleware added via `app.use(path, ...)` applies to routes *registered after* the `use()` call at the same mount point. Because `googleAuth` is mounted before `metricsMiddleware`, the authenticated `/v1/auth/google` initiation route will not emit `api_request` events. The comment on line 116-121 says the middleware runs "after bearerAuth dispatcher (line ~104) and AFTER googleAuth (above) so it sees only authenticated requests" — but this conflates *authentication ordering* with *route-registration ordering*. The intent is correct; the implementation drops one authenticated route.

This also means D-05's "public routes are intentionally not measured" is only accidentally true for the Google OAuth callback — it's public AND unmeasured, which matches the documented intent, but by the wrong mechanism.

**Fix:** Move `app.use("/v1/*", metricsMiddleware)` to *before* `app.route("/v1", googleAuth)` but *after* the bearerAuth dispatcher. The metrics middleware's internal `if (userId == null) return;` already handles public-route skipping correctly, so no D-05 regression.

```typescript
// index.ts — swap order
app.use("/v1/*", async (c, next) => {
  if (c.req.path === "/v1/health") return next();
  if (c.req.path === "/v1/auth/google/callback") return next();
  if (c.req.path === "/v1/auth/register") return next();
  if (c.req.path === "/v1/auth/login") return next();
  return bearerAuth(c, next);
});

// Phase 105 Plan 02 — mount BEFORE googleAuth so initiation is measured.
app.use("/v1/*", metricsMiddleware);

// Google OAuth routes — initiation behind bearer, callback exempted above.
app.route("/v1", googleAuth);

// Protected routes
app.route("/v1", summary);
// ...
```

## Info

### IN-01: `identifyUser` is not protected by `BLOCKED_PROPERTY_NAMES`

**File:** `vigil-core/src/analytics/posthog.ts:139-147`

**Issue:** `trackEvent` runs the property-name denylist (`BLOCKED_PROPERTY_NAMES` — `content`, `body`, `text`, `message`, `description`, `title`, `note`, `transcript`). `identifyUser` passes properties through raw:

```typescript
export function identifyUser(userId, properties = {}) {
  posthog?.identify({ distinctId: String(userId), properties });
}
```

Current Phase 105 usage (`email`, `createdAt`) is safe, but the asymmetry is surprising — if a future caller adds `title: user.jobTitle` to person properties, it will NOT be silently dropped. For person-record properties this is arguably the correct default (a person's `title` is legitimate metadata), but the module's docstring on line 26 says "PostHog event properties MUST be enums/booleans/numbers only — never user-generated string content" without distinguishing event properties from person properties.

**Fix:** Either document the intentional asymmetry in the `identifyUser` docstring, or apply the same denylist. Documenting is cheaper:

```typescript
/**
 * Set person properties for an authenticated user. ... (existing text) ...
 *
 * NOTE: Unlike trackEvent, identifyUser does NOT apply BLOCKED_PROPERTY_NAMES.
 * Person properties are long-lived profile fields (title, company, plan) where
 * "title" is legitimate metadata. Callers are responsible for not passing raw
 * user-generated content. As of Phase 105 the only call site (/v1/me) passes
 * email + createdAt, both of which are safe.
 */
```

### IN-02: Thrown-error responses bypass `api_request` emission

**File:** `vigil-core/src/middleware/metrics.ts:53-82`

**Issue:** `await next()` is awaited un-wrapped. If a downstream handler throws (rather than returning `c.json(err, 500)`), the code after `await next()` never runs and no `api_request` event is emitted. Hono's `app.onError` handler (`index.ts:155-163`) runs in a separate code path and captures to PostHog via `captureException`, so the error is not lost — but the `api_request` metric is. This creates a subtle observability gap:

- `return c.json({ error }, 500)` → `api_request` emitted with `status_class: "5xx"`
- `throw new Error(...)` → `$exception` event emitted, but no `api_request` event

Downstream PostHog dashboards that count 5xx via `api_request` events will under-count thrown errors. The test suite does not exercise this path (`buildAppWith` only returns via `c.json`).

**Fix (optional, low priority):** Wrap `next()` in try/finally so duration + emission always run:

```typescript
return async (c, next) => {
  const start = performance.now();
  let threw = false;
  try {
    await next();
  } catch (err) {
    threw = true;
    throw err; // preserve existing error propagation
  } finally {
    const duration_ms = Math.round(performance.now() - start);
    const userId = c.get("userId") as number | undefined;
    if (userId != null) {
      const status = threw ? 500 : c.res.status;
      try {
        trackFn(userId, "api_request", {
          route: c.req.path,
          method: c.req.method,
          status,
          duration_ms,
          status_class: statusClass(status),
        });
      } catch (err) {
        console.error("[metrics] api_request emit failed (non-fatal):", err);
      }
    }
  }
};
```

Accept as "Info" because the current behavior is not silent — `captureException` still reports the error — and adding the wrapper adds complexity. Flag for future iteration if dashboards show undercount.

### IN-03: Test spy signatures diverge from `typeof trackEvent` / `typeof identifyUser`

**File:** `vigil-core/src/middleware/metrics.test.ts:26`, `vigil-core/src/routes/me.test.ts:99`

**Issue:** The dep-injection pattern uses `typeof trackEvent` and `typeof identifyUser` as the spy type in production (`metrics.ts:52`, `me.ts:36-37`), but the test spies are less strict:

- `metrics.test.ts:26` — `(u, e, p) => {...}` with no parameter types. TypeScript infers `any`.
- `me.test.ts:99` — `(u: number | string, p?: Record<string, unknown>) => {...}`. `Record<string, unknown>` is broader than the real `Record<string, string | number | boolean | null | undefined>`.

TypeScript permits both via function-parameter contravariance, but the spy types no longer match the production contract. A test that works here could pass values (e.g., an object property) that the real `identifyUser` would reject at the type layer.

**Fix:** Tighten the spy types to match production:

```typescript
// me.test.ts:99
identifyFn: (u, p) => {
  opts.identifyCalls.push({ userId: u, properties: p ?? {} });
},
```

Letting inference pick up `typeof identifyUser` from `MeDeps.identifyFn` gives the spy the same contract as prod.

### IN-04: `posthog.test.ts:6` mutates `process.env` at module scope with an `await import()` below it

**File:** `vigil-core/src/analytics/posthog.test.ts:6-10`

**Issue:** Top-level `delete process.env["POSTHOG_API_KEY"]` is required for the D-10 null-guard path, and the dynamic `await import("./posthog.js")` captures that env state at evaluation time. This is intentional and documented. The subtle risk: if Node's test runner is ever invoked with `--experimental-vm-modules` or `isolateModules: true`, a second import of the module could re-read env after some unrelated test restored the key, silently flipping `posthog` from `null` to a real client and breaking the suite's no-throw guarantees.

This is not a defect today (the test runner uses a single module graph), and `metrics.test.ts:7` and `me.test.ts` follow the same pattern. Noted for maintenance.

**Fix:** None required. If test isolation changes in the future, freeze the env state explicitly:

```typescript
// posthog.test.ts
delete process.env["POSTHOG_API_KEY"];
Object.freeze(process.env); // optional defense if isolation semantics change
```

---

_Reviewed: 2026-04-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
