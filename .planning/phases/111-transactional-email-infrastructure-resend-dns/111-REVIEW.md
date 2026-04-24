---
phase: 111-transactional-email-infrastructure-resend-dns
reviewed: 2026-04-24T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - vigil-core/src/services/email-service.ts
  - vigil-core/src/services/email-service.test.ts
  - vigil-core/scripts/smoke-test-email.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 111: Code Review Report

**Reviewed:** 2026-04-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Phase 111 delivers a tightly-scoped Resend SDK wrapper (`email-service.ts`), a TDD
test suite covering the full happy/error/skip matrix (`email-service.test.ts`),
and a single-shot manual smoke harness (`smoke-test-email.ts`). The module
faithfully mirrors the `posthog.ts` lazy null-init template, explicit-null DI
seam, and `this`-binding-safe arrow-valued wrapper pattern called out in the
phase context — those intentional design choices were verified and are not
flagged.

No critical (security / crash / auth-bypass) issues found. The two warnings
concern latent correctness edges that are not triggered by current callers but
would surface the moment a future caller deviates from the expected input
shape:

1. Unescaped URL interpolation inside the HTML `href` and visible-text slots
   (currently safe because AUTH-10/AUTH-11 callers generate URLs from
   `crypto.randomBytes()` + a trusted origin, but the module itself does not
   enforce that contract).
2. A nullish-coalesce on `result.data?.id` that accepts `{ data: null,
   error: null }` from Resend as `status: "sent"` with an empty `id`, which
   downstream consumers (including the smoke test's log line) treat as a valid
   message id.

Info items are test-hygiene and future-proofing nudges, not defects.

## Warnings

### WR-01: Unescaped URL interpolation in HTML email templates

**File:** `vigil-core/src/services/email-service.ts:172, 174, 200, 202`
**Issue:** `resetUrl` and `verifyUrl` are interpolated directly into
`href="${resetUrl}"` and into a visible `<p>` body without HTML-escaping. If a
future caller (or a mis-constructed URL path) ever passes a URL containing a
`"`, `<`, `>`, or `&` character, it will either break out of the href
attribute or render malformed HTML. Current AUTH-10/AUTH-11 callers build URLs
as `${origin}/auth/reset?token=${hex}` with hex-only tokens and a trusted
origin, so the bug is latent — but the module publicly accepts `resetUrl:
string` with no validator, and the defensive contract belongs here, not at the
call site.

This is one seam away from stored-XSS-via-email (a reviewer or preview pane
rendering the HTML could execute) if a future caller ever derived the URL from
user input. Worth fixing now while the surface is tiny.

**Fix:** Add a minimal HTML-attribute escaper and apply it at every
interpolation point:

```ts
// Near the top of email-service.ts, alongside hashRecipient:
function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Then in each template:
const safeUrl = escapeHtmlAttr(resetUrl);
const html = `...<a href="${safeUrl}" ...>Set new password</a>...
              <p ...>${safeUrl}</p>...`;
```

Escaping both the `href` value and the visible-text copy keeps the two
renderings in sync and defeats the common injection vectors.

### WR-02: `result.data?.id ?? ""` accepts `{ data: null, error: null }` as "sent"

**File:** `vigil-core/src/services/email-service.ts:146`
**Issue:** `return { status: "sent", id: result.data?.id ?? "" };` — when the
Resend SDK ever returns `{ data: null, error: null }` (undocumented but not
type-forbidden, since both fields are `T | null` on `ResendResult`), this
branch emits `{ status: "sent", id: "" }`. Downstream consumers interpret
"sent" as success-with-a-real-id:

- `smoke-test-email.ts:32` logs `https://resend.com/emails/${result.id}` →
  yields the broken URL `https://resend.com/emails/`.
- Future routes (AUTH-10/AUTH-11 call sites in Phase 112) will likely store or
  log the id; an empty string sneaks through `typeof id === "string"` guards.

The more honest mapping: `{ data: null, error: null }` is "the SDK gave us
something we don't understand," which is indistinguishable from a failure and
should surface as such. This also lets a future SDK regression (API contract
drift) be caught on first occurrence instead of producing silent empty ids.

**Fix:** Require a real id for the "sent" branch; treat missing id as failure.

```ts
if (result.error) {
  // ...existing failed branch...
}

const id = result.data?.id;
if (!id) {
  const errMsg = "Resend returned no id and no error";
  console.error("[email-service] send succeeded with no id:", type, result);
  captureFn(null, new Error(errMsg), {
    email_type: type,
    to_hash: hashRecipient(to),
  });
  return { status: "failed", error: errMsg };
}
return { status: "sent", id };
```

Add a matching test:

```ts
test("sendPasswordResetEmail returns failed when Resend returns neither data.id nor error", async () => {
  const client: MockClient = {
    captured: null,
    emails: {
      send: async (args: SendArgs) => {
        client.captured = args;
        return { data: null, error: null };
      },
    },
  };
  const service = createEmailService({
    resendClient: client as unknown as EmailServiceDeps["resendClient"],
  });
  const r = await service.sendPasswordResetEmail(
    "user@example.com",
    "https://app.vigilhub.io/auth/reset?token=abc",
  );
  assert.equal(r.status, "failed");
});
```

## Info

### IN-01: Double-cast `client as unknown as { emails: { send: ... } }` erases real SDK types at the call site

**File:** `vigil-core/src/services/email-service.ts:125-127`
**Issue:** The `await (client as unknown as {...}).emails.send(...)` double-cast
bypasses the real `Resend` type. That's convenient for the test seam but means
a future breaking change in the Resend SDK payload (e.g., `to` field renamed,
required field added) would compile silently and fail at runtime. The factory
already narrows `client` to `Resend | null` by declaration, so the cast is
only needed because `ResendResult` is a local narrower shape than the SDK's
`CreateEmailResponse`.

**Fix:** Either (a) drop the cast and let TypeScript check the real
`client.emails.send(...)` signature, then narrow the response with a type
guard; or (b) add a one-line comment documenting exactly what the cast is
working around. Option (a) is stronger; option (b) is zero-risk.

```ts
// (b) minimum change:
// Cast to a narrowed shape because ResendResult is our local union; the real
// SDK's CreateEmailResponse is a superset. Remove this cast if/when resend@7
// ships a narrower return type.
```

### IN-02: Combined multi-case test reduces isolation

**File:** `vigil-core/src/services/email-service.test.ts:354-407`
**Issue:** The `sendEmailVerificationEmail parallels ...` test bundles three
independent scenarios (skipped_no_key, sent, failed+hashed PII) into one
`test()` block using `{ ... }` scoping. If Case A's assertion fails, Cases B
and C never run, and the failure message only names the top-level test. For
the password-reset path these are separate tests (lines 144-352). For
consistency and isolation, split the verification path the same way.

**Fix:** Extract each case into its own `test()` — match the structure used
for `sendPasswordResetEmail`.

### IN-03: `smoke-test-email.ts` does not exercise `sendEmailVerificationEmail`

**File:** `vigil-core/scripts/smoke-test-email.ts:10, 27`
**Issue:** The smoke harness only imports and invokes `sendPasswordResetEmail`.
The verification wrapper is structurally identical and covered by unit tests,
but an end-to-end smoke verifying a real Resend domain+DKIM+SPF run never
touches its template. If the verification template ever drifts (different
font, missing text part, DKIM-breaking header), the issue won't surface until
a real verify-email flow fires in production.

**Fix:** Add an optional `--verify` flag (or a second script
`smoke-test-email-verify.ts`) that calls `sendEmailVerificationEmail` with the
same CLI arg. One extra block, ~10 lines. Non-blocking.

```ts
// Example: accept a mode flag.
const mode = process.argv[3] === "verify" ? "verify" : "reset";
const result =
  mode === "verify"
    ? await sendEmailVerificationEmail(to, testUrl)
    : await sendPasswordResetEmail(to, testUrl);
```

### IN-04: CLI arg validation is truthy-only

**File:** `vigil-core/scripts/smoke-test-email.ts:13-17`
**Issue:** `if (!to)` catches missing arg but not malformed ones (e.g.,
`"not-an-email"`, leading whitespace, or a URL mistakenly pasted). Resend will
reject these with a useful error, so the smoke test still exits non-zero and
prints the failure — but a cheap regex guard would save a round-trip.

**Fix:** Add a minimal format check before calling Resend:

```ts
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
  console.error(`[smoke] Argument must look like an email: got "${to}"`);
  process.exit(2);
}
```

Not worth blocking on — this is a developer-operated tool, and the failure
mode is already loud.

---

_Reviewed: 2026-04-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
