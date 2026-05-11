---
phase: 126
plan: 02
subsystem: vigil-core
tags: [auth, captcha, turnstile, cloudflare, di-seam, wave-1, fail-closed, drift-detector, AUTH-126-02]
requires:
  - phase-126/plan-01-wave-0-scaffolds (RED test pins the surface this plan satisfies)
  - phase-113/di-seam-pattern (__setXForTest / __resetXForTest at module scope, mirrors auth.ts:27-39)
  - phase-117/source-content-drift-detector (siteverify URL literal pin)
provides:
  - vigil-core/src/lib/turnstile.ts — verifyTurnstileToken(token, remoteIp) + DI seam pair + SITEVERIFY_URL literal anchor
  - exported symbols: verifyTurnstileToken, __setVerifyTurnstileTokenForTest, __resetVerifyTurnstileTokenForTest, TurnstileResult
affects:
  - vigil-core/src/lib/turnstile.test.ts — flipped from RED (module not found) to GREEN (5/5 cases pass)
tech-stack:
  added: []
  patterns:
    - "Native fetch + AbortController(5s) — zero new npm deps (Node 18+ baseline)"
    - "DI seam pair at module scope (Phase 113 convention) mirroring auth.ts:27-39 verbatim shape"
    - "Two-seam disambiguation via JSDoc cross-reference (this helper's seam vs Plan 05's auth.ts-level seam — intentionally NOT identically named to prevent double-stubbing)"
    - "Fail-closed everywhere: network errors propagate, missing env throws synchronously, success:false returns ok:false (per CONTEXT D-01)"
    - "Hyphenated 'error-codes' key access (R4) — never camelCased; tests + JSDoc + drift detector all lock this"
key-files:
  created:
    - vigil-core/src/lib/turnstile.ts
  modified: []
decisions:
  - "Native fetch over library: chosen per RESEARCH §Library Decisions §1 — Cloudflare's HTTP API is the contract, no canonical npm wrapper exists, and direct fetch gives precise control over the 5s AbortController timeout. Zero new dependencies in vigil-core/package.json."
  - "Fail-closed (D-01): network/timeout errors propagate (helper does NOT catch); caller in Plan 05 will map to 503. success:false returns {ok:false} so caller maps to 400 CAPTCHA_FAILED. Missing TURNSTILE_SECRET_KEY throws synchronously — deploy-time misconfig, not runtime fail-open."
  - "DI seam disambiguation: this module exports __setVerifyTurnstileTokenForTest (unit tests of THIS helper). Plan 05 will introduce a separately-named __setRegisterTurnstileFnForTest seam in auth.ts (route-level integration tests that bypass this helper entirely). Both seams cross-referenced in JSDoc; intentionally NOT identically named to prevent future maintainers from accidentally double-stubbing."
metrics:
  duration: 6m
  completed: 2026-05-11
  lines_of_turnstile_ts: 131
  test_count_green: 5
  task_count: 1
  file_count: 1
---

# Phase 126 Plan 02: Turnstile Server-Side Helper Summary

Landed `vigil-core/src/lib/turnstile.ts` — a 131-line, zero-dependency Cloudflare Turnstile siteverify wrapper that satisfies Wave 0's RED test contract. AUTH-126-02 is now half-done; Plan 05 will wire the call site in `/auth/register` AND introduce a separately-named `__setRegisterTurnstileFnForTest` seam for route-level tests.

## What Shipped

### Task 1 — verifyTurnstileToken helper (commit a095f38)

One new file, three exported symbols + one type, zero npm dependency changes:

| Symbol | Kind | Purpose |
|--------|------|---------|
| `verifyTurnstileToken(token, remoteIp)` | exported const | Public entry point. Indirects through DI seam (Phase 113 pattern). Real impl POSTs to siteverify with 5s `AbortController` timeout. Returns `{ok, errorCodes}` or throws on network/timeout/missing-secret. |
| `__setVerifyTurnstileTokenForTest(fn)` | exported function | DI seam setter. Unit tests of this helper inject stubs to avoid live Cloudflare calls. |
| `__resetVerifyTurnstileTokenForTest()` | exported function | DI seam resetter. Restores the real implementation between tests. |
| `TurnstileResult` | exported interface | `{ ok: boolean; errorCodes: string[] }`. |

### Failure-mode policy (CONTEXT D-01 — locked, no fail-open)

| Condition | Helper behavior | Caller responsibility (Plan 05) |
|-----------|-----------------|--------------------------------|
| `success: true` | returns `{ok:true, errorCodes:[]}` | continue to allowlist check |
| `success: false` | returns `{ok:false, errorCodes:[...]}` | return 400 `CAPTCHA_FAILED` |
| non-2xx HTTP | returns `{ok:false, errorCodes:["http-<status>"]}` | return 400 `CAPTCHA_FAILED` (or 503 — caller decides) |
| `fetch` rejects (network/DNS/timeout) | throws (does NOT catch) | return 503 (NEVER fail-open per D-01) |
| `TURNSTILE_SECRET_KEY` unset | throws synchronously | return 503 — deploy-time misconfig |

### Test outcomes (Wave 0 RED → GREEN)

```
▶ verifyTurnstileToken (vigil-core/src/lib/turnstile.ts) — AUTH-126-02 / D-01
  ✔ AUTH-126-TURNSTILE-URL: turnstile.ts declares siteverify URL verbatim (drift detector)
  ✔ AUTH-126-TURNSTILE-OK: mocked siteverify success → {ok:true, errorCodes:[]}
  ✔ AUTH-126-TURNSTILE-FAIL: mocked siteverify failure → {ok:false, errorCodes:['invalid-input-response']}
  ✔ AUTH-126-TURNSTILE-NETWORK-THROWS: fetch rejects → helper throws (caller returns 503 per D-01)
  ✔ AUTH-126-TURNSTILE-MISSING-SECRET: TURNSTILE_SECRET_KEY unset → helper throws
ℹ tests 5  pass 5  fail 0
```

## Acceptance Criteria — Status

| Criterion | Status | Evidence |
|-----------|--------|----------|
| File `vigil-core/src/lib/turnstile.ts` exists | PASS | `[ -f ... ]` true; 131 lines |
| Literal siteverify URL appears verbatim (grep count == 1) | PASS | `grep -c "https://challenges.cloudflare.com/turnstile/v0/siteverify" → 1` (in `const SITEVERIFY_URL` only; JSDoc deliberately omits the literal so drift detector matches a single source-of-truth) |
| `__setVerifyTurnstileTokenForTest` exported | PASS | `grep -c → 5` (decl + JSDoc cross-refs + signature) |
| `__resetVerifyTurnstileTokenForTest` exported | PASS | `grep -c → 2` (JSDoc + decl) |
| JSDoc cross-refs Plan 05's `__setRegisterTurnstileFnForTest` ≥ 1 | PASS | `grep -c → 2` (header note + seam-section note) |
| Hyphenated `"error-codes"` access (not camelCased) | PASS | `grep -c '"error-codes"' → 3` (type annotation + index access + JSDoc R4 reference) |
| `verifyTurnstileTokenFn` non-comment count ≥ 2 | PASS | non-comment grep → 4 (decl + getter + setter + reset) |
| Wave 0 turnstile.test.ts exits 0 | PASS | 5/5 GREEN |
| `npx tsc --noEmit` clean for turnstile.ts | PASS | Zero errors attributable to turnstile.ts (the only remaining repo-wide errors are sentry.ts + require-verified-email.ts — Plan 01's other RED scaffolds, owned by Plans 03/04) |
| No new entry in vigil-core/package.json `dependencies` | PASS | dependencies block untouched; Node 18+ native fetch + AbortController suffice |

## Wave 1 → Wave 2 Handoff Anchors

**For Plan 05 (the auth.ts call-site wiring):**

- Import path: `import { verifyTurnstileToken } from "../lib/turnstile.js";`
- Call shape (from RESEARCH lines 281-298):
  ```typescript
  let captchaResult;
  try {
    captchaResult = await verifyTurnstileToken(turnstileToken, ip);
  } catch {
    return c.json({ error: "Captcha service unavailable, please retry", code: "CAPTCHA_FAILED" }, 503);
  }
  if (!captchaResult.ok) {
    return c.json({ error: "Captcha verification failed", code: "CAPTCHA_FAILED" }, 400);
  }
  ```
- **Plan 05 will wire the call site in auth.ts AND introduce a separately-named `__setRegisterTurnstileFnForTest` seam for route-level tests** (intentionally distinct from this module's `__setVerifyTurnstileTokenForTest` — JSDoc here documents the boundary; renaming to match would create the double-stub footgun called out in T-126-02-06).
- Drift detector AUTH-126-TURNSTILE-CALLSITE (Plan 05) will assert `/verifyTurnstileToken\(/` appears inside the `/auth/register` handler body — guards against silent helper deletion (CONTEXT D-01 test case #4).

**For env / deploy ops (out of scope here, tracked in Plan 11 ship-block):**
- Railway: set `TURNSTILE_SECRET_KEY` server-side only, never in PWA.
- Vercel: set `VITE_TURNSTILE_SITE_KEY` for the PWA build (Plan 06).

## Threat Surface

All `<threat_model>` rows from the plan (T-126-02-01 through T-126-02-06) remain mitigated by this commit:

| Threat | Disposition in this commit |
|--------|----------------------------|
| T-126-02-01 (success-injection spoofing) | mitigated — helper NEVER reads any client-side `success` field; always re-verifies via siteverify with the server-only secret |
| T-126-02-02 (token replay) | mitigated out-of-tree by Cloudflare (single-use semantics + challenge_ts + hostname) |
| T-126-02-03 (secret leak via stack traces / logs) | mitigated — secret only flows into fetch body; JSDoc warns NEVER LOG; Phase 103 BLOCKED_PROPERTY_NAMES (R12) cross-referenced |
| T-126-02-04 (Cloudflare outage DoS) | mitigated — 5s AbortController → throw → caller returns 503; no fail-open path exists in this module |
| T-126-02-05 (call-site silent disabling) | DEFERRED to Plan 05's AUTH-126-TURNSTILE-CALLSITE drift detector — this module is fully invoked when imported, so the helper itself cannot be silently disabled here |
| T-126-02-06 (seam-name collision footgun) | mitigated — JSDoc explicitly names Plan 05's `__setRegisterTurnstileFnForTest` and documents that the two seams are intentionally distinct; no maintainer can rename without seeing the warning |

No new threat flags introduced. No security-relevant surface added beyond what the plan's `<threat_model>` already enumerated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Removed siteverify URL literal from JSDoc to satisfy `grep -c == 1` acceptance**

- **Found during:** Task 1 verification (post-implementation grep check)
- **Issue:** My initial JSDoc header said "Calls https://challenges.cloudflare.com/turnstile/v0/siteverify with the server-only TURNSTILE_SECRET_KEY..." which made the literal appear TWICE in the file (once in JSDoc, once in `const SITEVERIFY_URL`). Plan acceptance line 146 requires `grep -c "https://challenges.cloudflare.com/turnstile/v0/siteverify" == 1` — a single-source-of-truth drift-detector contract.
- **Fix:** Rewrote the JSDoc header line from `"Calls https://challenges.cloudflare.com/turnstile/v0/siteverify with..."` to `"Calls the Cloudflare siteverify endpoint (URL pinned in SITEVERIFY_URL below) with..."`. The actual `const SITEVERIFY_URL = "https://..."` declaration remains the single literal source of truth; JSDoc cross-references it by symbol name instead.
- **Files modified:** `vigil-core/src/lib/turnstile.ts` (pre-commit; folded into the Task 1 commit)
- **Commit:** a095f38 (fix landed before staging)

Same shape as Plan 01's deviations — strict drift-detector contracts require executor discipline about where literals appear. Zero semantic change; the URL is still pinned at exactly one source location.

## Authentication Gates

None — this plan ships a helper module only. No live Cloudflare calls happen during test (all 5 tests use `globalThis.fetch` stubs). No deploy required; `TURNSTILE_SECRET_KEY` will be set on Railway as part of Plan 11 (operator wallclock todo).

## Known Stubs

None. The helper has a complete real implementation; the DI seam is a TEST-ONLY indirection (not a stub). The TURNSTILE_SECRET_KEY env var is intentionally not set in dev — production deploy (Plan 11) will set it; absent-secret is treated as a misconfiguration that throws.

## Self-Check: PASSED

**Files** — verified via `[ -f path ]`:

- FOUND: vigil-core/src/lib/turnstile.ts (131 lines)
- FOUND: .planning/phases/126-wide-release-auth-hardening-rate-limit-auth-register-5-hr-ip/126-02-SUMMARY.md (this file)

**Commits** — verified via `git log --oneline | grep`:

- FOUND: a095f38 — feat(126-02): implement verifyTurnstileToken helper (D-01, fail-closed)

**Test outcomes:**
- `npx tsx --test src/lib/turnstile.test.ts` → 5 pass / 0 fail (Wave 0 RED → GREEN ✓)
- `npx tsc --noEmit -p tsconfig.json` → zero errors attributable to turnstile.ts (remaining errors are sentry.test.ts + require-verified-email.test.ts, both Plan 01 RED scaffolds owned by Plans 03/04 — not regressions from this commit)

All success criteria satisfied:
- [x] turnstile.ts exists with verifyTurnstileToken + DI seam pair exported
- [x] Wave 0 turnstile.test.ts transitions from RED to GREEN (5/5)
- [x] No new npm dependency added to vigil-core (native fetch suffices on Node 18+)
- [x] Helper throws on missing TURNSTILE_SECRET_KEY and on fetch failure (fail-closed per D-01)
- [x] JSDoc disambiguates the two-seam boundary (this module's `__setVerifyTurnstileTokenForTest` vs Plan 05's `__setRegisterTurnstileFnForTest`)
