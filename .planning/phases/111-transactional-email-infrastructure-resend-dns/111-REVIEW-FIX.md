---
phase: 111-transactional-email-infrastructure-resend-dns
fixed_at: 2026-04-24T00:00:00Z
review_path: .planning/phases/111-transactional-email-infrastructure-resend-dns/111-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 111: Code Review Fix Report

**Fixed at:** 2026-04-24T00:00:00Z
**Source review:** `.planning/phases/111-transactional-email-infrastructure-resend-dns/111-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 2
- Fixed: 2
- Skipped: 0

Info findings (IN-01..IN-04) were out of scope for this iteration per
`fix_scope: critical_warning` and were left untouched.

## Fixed Issues

### WR-01: Unescaped URL interpolation in HTML email templates

**Files modified:**
- `vigil-core/src/services/email-service.ts`
- `vigil-core/src/services/email-service.test.ts`

**Commit:** `4ddc385`

**Applied fix:**
- Added `escapeHtmlAttr(s: string): string` helper alongside `hashRecipient`,
  encoding the five HTML-significant characters: `&`, `<`, `>`, `"`, `'`
  (`&` first to avoid double-encoding subsequent entity ampersands).
- Both `sendPasswordResetEmail` and `sendEmailVerificationEmail` now compute
  `const safeUrl = escapeHtmlAttr(resetUrl|verifyUrl)` once per call and
  interpolate `safeUrl` into BOTH the `href="..."` attribute slot AND the
  visible-text `<p>` slot (the visible `<p>` would still parse `<` as a tag
  start, so escaping is required there too).
- Plaintext (`text/plain`) bodies continue to use the raw URL — `text/plain`
  is not HTML-parsed, and copy-paste workflows expect verbatim URLs.
- Added 2 tests:
  - `sendPasswordResetEmail HTML-escapes the reset URL in both href and visible-text slots (WR-01 — defensive XSS guard)`
  - `sendEmailVerificationEmail HTML-escapes the verify URL in both href and visible-text slots (WR-01 — defensive XSS guard)`
  Each test injects a malicious URL containing `"`, `<`, `>`, `&` plus a
  `<script>` / `<img onerror>` payload and asserts:
  1. The raw unescaped URL does NOT appear verbatim in `args.html`.
  2. No live `<script>` / `<img>` tag survives in the rendered HTML.
  3. All four HTML entities (`&quot;`, `&lt;`, `&gt;`, `&amp;`) are present.
  4. The plaintext body still contains the raw URL verbatim.
- Existing test "embeds the reset URL verbatim in the HTML href" continues to
  pass — its test URL contains only alphanumeric + `/?=:.` characters which
  are identity-mapped by the escaper.

### WR-02: `result.data?.id ?? ""` accepts `{ data: null, error: null }` as "sent"

**Files modified:**
- `vigil-core/src/services/email-service.ts`
- `vigil-core/src/services/email-service.test.ts`

**Commit:** `c46ecd9`

**Applied fix:**
- Replaced `return { status: "sent", id: result.data?.id ?? "" };` with an
  explicit empty-id guard: when `result.data?.id` is missing or empty,
  return `{ status: "failed", error: "Resend returned no message id" }`.
- The new branch routes through the same observability path as other
  failures: `console.error` + `captureFn(null, new Error(errMsg), { email_type, to_hash })`
  — no `resend_error_name` field (since there is no error object). PII
  handling is identical to other failure paths (D-12 SHA-256 hash).
- Added 1 test:
  - `sendPasswordResetEmail returns failed when Resend returns { data: null, error: null } — degenerate path (WR-02)`
  Asserts `result.status === "failed"`, the error message includes
  `"no message id"`, `captureException` is called with a hex-prefix
  `to_hash` context field, and the raw email never appears in any context
  value.

## Skipped Issues

None — all in-scope findings were fixed cleanly.

## Verification

After each fix:
- `cd vigil-core && npx tsx --test src/services/email-service.test.ts`
  - Baseline: 10 / 10 passing
  - After WR-01: 12 / 12 passing (added 2 tests)
  - After WR-02: 13 / 13 passing (added 1 test)
- `cd vigil-core && npx tsc --noEmit`
  - Clean (no errors) at every checkpoint

## Notes for Verifier

- Logic-bug risk for WR-02 is low: the new guard is structurally identical to
  the existing `result.error` branch directly above it (same captureFn
  signature, same PII-hash + email_type context). No new control flow.
- The escaper in WR-01 deliberately uses the conservative 5-character set
  (`& < > " '`); single-quote encoding is included so the same helper is safe
  if a future template ever switches to single-quoted attributes.
- Out-of-scope Info findings (IN-01 double-cast comment, IN-02 split combined
  test, IN-03 verify-mode in smoke harness, IN-04 CLI email regex) remain
  open — none are blocking and all are tracked in `111-REVIEW.md`.

---

_Fixed: 2026-04-24T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
