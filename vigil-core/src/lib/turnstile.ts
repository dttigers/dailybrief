/**
 * Phase 126 (AUTH-126-02 / D-01): Cloudflare Turnstile server-side verification.
 *
 * Calls the Cloudflare siteverify endpoint (URL pinned in SITEVERIFY_URL
 * below) with the server-only TURNSTILE_SECRET_KEY + the client-submitted
 * token, and returns a normalized {ok, errorCodes} result.
 *
 * Failure-mode policy (CONTEXT D-01 — explicit NO fail-open):
 *   - success: false  → returned as {ok:false, errorCodes:[...]} so the route
 *                       handler maps to 400 CAPTCHA_FAILED.
 *   - network/timeout → fetch throws; this helper does NOT catch. Caller is
 *                       responsible for translating to 503 (NOT 200) so bot
 *                       defense holds during a Cloudflare outage.
 *   - missing TURNSTILE_SECRET_KEY → throws synchronously. This is a deploy-
 *                       time misconfiguration, NOT a runtime fail-open path.
 *   - non-2xx HTTP    → returned as {ok:false, errorCodes:["http-<status>"]}
 *                       so the caller can still see the wire status.
 *
 * Drift-detector anchors (Phase 117 fs.readFileSync convention):
 *   - AUTH-126-TURNSTILE-URL: SITEVERIFY_URL literal pinned in source.
 *   - R4 lock: response key is HYPHENATED ("error-codes"), NEVER camelCased.
 *
 * DI seam scope: __setVerifyTurnstileTokenForTest / __resetVerifyTurnstileTokenForTest below
 *   are for UNIT TESTS of THIS helper only (turnstile.test.ts). Route-level integration
 *   tests of /auth/register MUST use auth.ts's separately-named seam
 *   __setRegisterTurnstileFnForTest (Plan 05), which bypasses this helper entirely via
 *   the auth.ts-level indirection. Do NOT rename the seams to match — distinct names
 *   prevent future maintainers from accidentally double-stubbing.
 *
 * Seam shape mirrors `auth.ts:27-39` (Phase 113 convention). Tests injecting
 * via `__setVerifyTurnstileTokenForTest` MUST observe the patched fn through
 * the exported `verifyTurnstileToken`, never through `realVerifyTurnstileToken`
 * directly — Phase 113 seam semantics.
 *
 * NEVER LOG: TURNSTILE_SECRET_KEY only flows into the fetch body — never log
 * the secret, the raw token, or `req.body` from a caller. Phase 103 PostHog
 * BLOCKED_PROPERTY_NAMES guidance (R12) applies: do NOT include `body`,
 * `content`, `message`, or `token` keys in Sentry context surfaced from
 * helpers that consume Turnstile inputs.
 *
 * Runtime requirement: Node 18+ for native `fetch` + `AbortController`. No
 * new npm dependency. vigil-core already targets Node 18+ (see existing
 * usage in services/email-service.ts).
 */

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const SITEVERIFY_TIMEOUT_MS = 5000;

/** Normalized result returned by `verifyTurnstileToken`. */
export interface TurnstileResult {
  ok: boolean;
  errorCodes: string[];
}

/**
 * Real implementation. Production singleton routes through this; tests can
 * inject a stub via `__setVerifyTurnstileTokenForTest`.
 *
 * @param token    Turnstile response token from the client widget.
 * @param remoteIp Client IP from the request (recommended by Cloudflare).
 *                 Pass `null` if unavailable; the field is omitted from the
 *                 siteverify body in that case.
 *
 * @throws Error("TURNSTILE_SECRET_KEY not set") if the env var is missing.
 * @throws Whatever `fetch` throws on network failure or abort timeout. The
 *         caller MUST map these to 503 (D-01: no fail-open).
 */
async function realVerifyTurnstileToken(
  token: string,
  remoteIp: string | null,
): Promise<TurnstileResult> {
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  if (!secret) throw new Error("TURNSTILE_SECRET_KEY not set");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SITEVERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, errorCodes: [`http-${res.status}`] };
    const data = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };
    return {
      ok: data.success === true,
      errorCodes: data["error-codes"] ?? [],
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── DI seam (Phase 113 convention, mirrors auth.ts:27-39 verbatim shape) ───
//
// The exported `verifyTurnstileToken` indirects through `verifyTurnstileTokenFn`
// so unit tests can swap the implementation without touching globalThis.fetch
// in every test. This seam is for THIS helper's tests only — route-level
// tests of /auth/register use auth.ts's separately-named
// `__setRegisterTurnstileFnForTest` seam (Plan 05), which bypasses this
// helper entirely. The two seams are intentionally NOT identically named.
let verifyTurnstileTokenFn = realVerifyTurnstileToken;

/**
 * Public entry point. Routes through the DI seam so tests can stub the
 * implementation via `__setVerifyTurnstileTokenForTest`. The wire-level
 * `realVerifyTurnstileToken` is intentionally not exported.
 */
export const verifyTurnstileToken: typeof realVerifyTurnstileToken = (
  ...args
) => verifyTurnstileTokenFn(...args);

export function __setVerifyTurnstileTokenForTest(
  fn: typeof realVerifyTurnstileToken,
): void {
  verifyTurnstileTokenFn = fn;
}

export function __resetVerifyTurnstileTokenForTest(): void {
  verifyTurnstileTokenFn = realVerifyTurnstileToken;
}
