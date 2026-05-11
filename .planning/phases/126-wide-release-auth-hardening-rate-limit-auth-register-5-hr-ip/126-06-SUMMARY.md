---
phase: 126
plan: 06
type: execute
status: complete
completed: 2026-05-11
files_modified:
  - vigil-core/src/index.ts
  - vigil-core/src/__tests__/mount-order.test.ts
commits:
  - "feat(126-06): wire Sentry init + email-verify middleware + onError sink in index.ts"
  - "test(126-06): use lastIndexOf in mount-order detector to avoid import-line false-pass"
  - "docs(126-06): complete index.ts integration plan SUMMARY"
requirements: [AUTH-126-03, AUTH-126-04]
---

# Plan 126-06 — Sentry init + email-verify middleware + onError sink

## What Shipped

Three additive edits to `vigil-core/src/index.ts` (one Task 1 commit), composing Plans 03 (Sentry helper) and 04 (email-verify middleware) into the running app. Wave 0 mount-order drift detector transitions RED → GREEN.

### Diff Stats

```
vigil-core/src/index.ts            | +21 -0  (3 insertions: 2 imports + initSentry call + middleware mount + captureToSentry sibling in onError; no deletions)
vigil-core/src/__tests__/mount-order.test.ts | +6 -2  (indexOf → lastIndexOf in two detectors; comment explaining why)
```

### Edit 1 — Sentry init BEFORE Hono construction (R1 / AUTH-126-04 / D-04)

- Added `import { initSentry, captureToSentry } from "./lib/sentry.js";` alongside the `./analytics/posthog.js` import block.
- Inserted `initSentry();` on its own line AFTER the JWT_SECRET / CORS env-gate guards and BEFORE `export const app = new Hono();`.
- Comment above the call references AUTH-126-04 / D-04 + R1 mount-order constraint.

**Source-position lock:** `source.indexOf("initSentry()") < source.indexOf("new Hono()")` — `init<hono: true`.

### Edit 2 — Mount `requireVerifiedEmailWithGrace` between bearerAuth dispatcher and protected routes (AUTH-126-03 / D-02)

- Added `import { requireVerifiedEmailWithGrace } from "./middleware/require-verified-email.js";` alongside existing middleware imports.
- Inserted `app.use("/v1/*", requireVerifiedEmailWithGrace);` immediately after the bearerAuth dispatcher closure (`return bearerAuth(c, next);`) and before the first protected `app.route("/v1", ...)` mount cluster.
- Comment block mirrors Phase 124/125 mount-order convention (AUTH-126-03 / D-02).

**Source-position lock:** `source.lastIndexOf("requireVerifiedEmailWithGrace") > source.indexOf("return bearerAuth(c, next)")` — `verify>bearer: true`.

### Edit 3 — Extend `app.onError` to fire Sentry sibling (AUTH-126-04 / R12 / D-04)

- ADDED `captureToSentry(userId, err, { route: c.req.path, method: c.req.method });` IMMEDIATELY AFTER the existing PostHog `captureException(...)` call.
- DID NOT remove or modify the existing PostHog call (CONTEXT line 138 — coexistence preserved).
- Context object shape `{ route, method }` mirrors PostHog call site exactly (Phase 103 BLOCKED_PROPERTY_NAMES denylist compliance — R12).

**Acceptance grep counts:**
- `initSentry()` → 1 ✓
- `captureToSentry(` → 1 ✓
- `captureException(` → 1 ✓ (PostHog preserved)
- `requireVerifiedEmailWithGrace` → 2 ✓ (import + mount)

## Verification

```text
$ cd vigil-core && npx tsx --test src/__tests__/mount-order.test.ts
✔ AUTH-126-MOUNT-SENTRY-BEFORE-HONO: initSentry() must precede `new Hono()` so import-time errors are captured
✔ AUTH-126-MOUNT-VERIFY-AFTER-BEARER: requireVerifiedEmailWithGrace must mount AFTER the bearerAuth dispatcher so c.get('userId') is set
✔ AUTH-126-MOUNT-VERIFY-BEFORE-PROTECTED: requireVerifiedEmailWithGrace must mount BEFORE the first protected route registration
tests 3 / pass 3 / fail 0

$ cd vigil-core && npx tsx --test src/lib/sentry.test.ts src/middleware/require-verified-email.test.ts
tests 13 / pass 13 / fail 0 (full Plans 03+04 regression suite)

$ cd vigil-core && npx tsc --noEmit
(clean — no new type errors)
```

## Decisions / Deviations

- **Deviation D-06-01 (Rule 2 corrective):** `mount-order.test.ts` AUTH-126-MOUNT-VERIFY-* detectors used `indexOf("requireVerifiedEmailWithGrace")` in the Wave 0 RED stub. After this plan adds the symbol's first occurrence as a top-of-file import line, `indexOf` would match line 46 (import) instead of the mount site at line 178, silently false-passing the BEFORE-PROTECTED detector if a future edit moved the mount site. Switched both detectors to `lastIndexOf` — the mount site is necessarily the last occurrence in the file. Inline comment above each detector documents why. `mount-order.test.ts` was not listed in plan `files_modified`, but the fix is in-scope for closing the Wave 0 contract correctly. Mirrors the Phase 126 Plan 01 + Plan 03 comment-vs-grep reconciliation precedent.
- **Decision:** All three edits landed in a single Task 1 commit per the plan's single-task structure. Test-detector improvement landed in its own `test(126-06)` commit for traceability. SUMMARY in `docs(126-06)`. feat → test → docs order matches the Phase 126 Plan 05 convention.

## Lessons Learned

- Wave 0 RED-by-construction detectors that grep for a symbol need to anticipate the symbol's import-line presence after the plan adds it. `lastIndexOf` is the safer default when the structural anchor is the LAST occurrence (mount sites are always last; imports always first).

## Anchor

Server side of Phase 126 complete — bearer-auth-guarded /v1/* routes now inherit the 24h-grace email-verify gate, and any unhandled Hono error fans out to both PostHog (existing analytics sink) AND Sentry (new error-tracking sink). PWA side (Plans 09 + 10) renders client UX (Sentry init in main.tsx, Turnstile widget on AuthPage signup) against this server contract.

## Cross-Plan Impact

- **Plan 09** (vigil-pwa Sentry): mirrors this plan's `initSentry()` placement constraint on the client — Sentry.init must precede `ReactDOM.createRoot(...).render()` so React-construction errors are captured. Independent file (vigil-pwa/src/main.tsx); no shared edit.
- **Plan 10** (Turnstile widget): renders signup-mode CAPTCHA challenge. Token is what hits the `/v1/auth/register` Turnstile gate landed in Plan 05. No dependency on this plan beyond the global server contract.
- **Plan 11** (Anthropic spend-cap operator todo): waits on all server + PWA plans landing first.
