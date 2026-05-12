// ─────────────────────────────────────────────────────────────────────────────
// AUTH-126-05 / D-04 — PWA-side error-code → user-facing UX lookup table.
//
// Purpose
//   Server `/auth/*` (and AUTH-126-03 middleware) responses now include a
//   stable `code: string` alongside the human-readable `error: string`. The
//   PWA renders friendly copy + optional next-step CTAs by looking up the
//   code in `ERROR_CODE_MAP`; this replaces the pre-Phase-126 pattern of
//   collapsing every 4xx into a generic message (the bug that triggered
//   Phase 126, observed when a family signup hit a 403 allowlist rejection
//   and the PWA showed "Invalid email or password").
//
// LOCKED enum semantics (CONTEXT D-04)
//   The 9 LOCKED keys below MUST stay in ERROR_CODE_MAP forever. Planners
//   may ADD new codes (forward-compat); they MUST NOT REMOVE locked codes.
//   The Wave 0 test `AUTH-126-CODE-MAP-LOCKED-ENUM` in
//   `api-error-codes.test.ts` enforces this at CI time:
//     CAPTCHA_FAILED, RATE_LIMITED, REG_NOT_ALLOWED, INVALID_EMAIL_FORMAT,
//     PASSWORD_TOO_SHORT, PASSWORD_TOO_LONG, EMAIL_TAKEN, EMAIL_NOT_VERIFIED,
//     INVALID_CREDENTIALS.
//   These mirror vigil-core `auth.ts` emissions and the EMAIL_NOT_VERIFIED
//   middleware (Phase 126 Plan 04).
//
// Phase 126 extension codes (D-04 additivity)
//   - INVALID_REQUEST          — missing/malformed required fields (400)
//   - INVALID_JSON             — body wasn't valid JSON (400)
//   - SERVER_NOT_CONFIGURED    — server missing required env (e.g. captcha
//                                secret); user-facing "temporarily unavailable"
//   - INVALID_TOKEN_SUBJECT    — Plan 04 middleware emits this when JWT
//                                validates but the user row is missing from
//                                the DB (structurally-broken-session). This
//                                is DISTINCT from INVALID_CREDENTIALS, which
//                                is reserved login-only per D-04. Conflating
//                                the two would surface "Invalid email or
//                                password" to a user whose session is broken
//                                — T-126-04-07 mitigation, also
//                                T-126-07-06 on this plan.
//
// Resolution order (resolveApiError)
//   1. If `body.code` is a key in ERROR_CODE_MAP → return the mapped UX.
//   2. Else, if `body.error` is a non-empty string → return `{message: body.error}`
//      (forward-compat: a server-added code that the PWA doesn't yet know
//      about still surfaces the human-readable backend string instead of
//      a generic fallback).
//   3. Else (null/undefined/empty body, or body with neither field) →
//      return `{message: fallback}`.
//
// Downstream consumers
//   Plan 10 (`vigil-pwa/src/pages/AuthPage.tsx`) calls `resolveApiError` at
//   every 4xx response handler. Plan 09 (Sentry init) is independent.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shape of a user-facing error UX entry.
 *
 * @property message - Required user-facing copy. Short, action-oriented.
 * @property ctaLabel - Optional next-step button/link label.
 * @property ctaHref - Optional next-step destination (relative path,
 *                     in-page anchor like `#login`, or `mailto:` URL).
 *                     Absolute external URLs are intentionally NOT used
 *                     today (T-126-07-02 disposition: source-controlled,
 *                     PR review catches future drift).
 */
export interface ApiErrorUx {
  message: string
  ctaLabel?: string
  ctaHref?: string
}

/**
 * Locked-enum + extension lookup table.
 *
 * Adding a code:
 *   1. Ship the server emission first.
 *   2. Add the key here with a short user-facing message.
 *   3. If the user has a clear next step, add ctaLabel + ctaHref.
 *
 * Removing a code:
 *   FORBIDDEN for the 9 LOCKED keys (D-04 lock; Wave 0 test will fail).
 *   For extension codes: only if the server has stopped emitting them
 *   AND no consumer relies on the mapped UX.
 */
export const ERROR_CODE_MAP: Record<string, ApiErrorUx> = {
  // ── LOCKED (CONTEXT D-04) — verbatim copy from RESEARCH §AUTH-126-05 lines 504-512 ──
  CAPTCHA_FAILED: {
    message: "Please complete the captcha and try again.",
  },
  RATE_LIMITED: {
    message: "Too many attempts. Please wait an hour and try again.",
  },
  REG_NOT_ALLOWED: {
    message: "Sign-up isn't open to this email address yet. Contact Vigil to request access.",
    ctaLabel: "Contact",
    ctaHref: "mailto:hello@vigilhub.io",
  },
  INVALID_EMAIL_FORMAT: {
    message: "That doesn't look like a valid email address.",
  },
  PASSWORD_TOO_SHORT: {
    message: "Password must be at least 12 characters.",
  },
  PASSWORD_TOO_LONG: {
    message: "Password must be 128 characters or fewer.",
  },
  EMAIL_TAKEN: {
    message: "An account with this email already exists.",
    ctaLabel: "Sign in instead",
    ctaHref: "#login",
  },
  EMAIL_NOT_VERIFIED: {
    message: "Please verify your email to continue using Vigil.",
    ctaLabel: "Resend verification",
    ctaHref: "/settings",
  },
  INVALID_CREDENTIALS: {
    message: "Invalid email or password. Please try again.",
  },

  // ── EXTENSION (Phase 126; D-04 additivity grants this authority) ──
  INVALID_REQUEST: {
    message: "Please fill out all required fields and try again.",
  },
  INVALID_JSON: {
    message: "Something went wrong sending your request. Please refresh and try again.",
  },
  SERVER_NOT_CONFIGURED: {
    message: "Sign-up is temporarily unavailable. Please try again shortly.",
  },
  INVALID_TOKEN_SUBJECT: {
    // Plan 04 middleware (`requireVerifiedEmailWithGrace`) emits this when a JWT
    // validates but the user row is missing from the DB. The user's session is
    // structurally broken — they need to sign in fresh. Distinct from
    // INVALID_CREDENTIALS (login-only-generic-401 per D-04 lock).
    message: "Session expired — please sign in again.",
    ctaLabel: "Sign in",
    ctaHref: "/auth",
  },

  // ── EXTENSION (Phase 127 GUARD-02 — D-04 additivity) ──
  // vigil-core /v1/voice/transcribe (Phase 130) returns HTTP 413 + this code
  // when `assertAudioSessionWithinCap` rejects a base64 payload exceeding
  // 2_560_000 chars (~60s of 16 kHz × 16-bit LE × mono PCM). Verbatim copy
  // pinned by GUARD-127-CODE-MAP-AUDIO-EXTENSION test (CONTEXT D-02.4).
  // No CTA — the user just needs to retry with a shorter recording.
  AUDIO_SESSION_TOO_LONG: {
    message: "Recording is too long. Voice clips must be 60 seconds or less.",
  },

  // ── EXTENSION (Phase 127 GUARD-03 — D-04 additivity) ──
  // vigil-core (Plan 05.1) throws DailyBudgetExceededError when the per-user
  // daily AI usd_estimate accumulator (ai_usage_daily, PK (user_id, usage_date))
  // hits VIGIL_DAILY_AI_BUDGET_USD (default 0.50). `app.onError` translates
  // the throw to HTTP 429 + {code: "DAILY_AI_BUDGET_EXCEEDED"}. Verbatim copy
  // pinned by GUARD-127-CODE-MAP-BUDGET-EXTENSION test (CONTEXT D-03.5).
  // No CTA — the message itself communicates the workaround ("Capture still
  // works") and the reset time ("midnight UTC"); a CTA would invite users to
  // click their way through a cap they can't actually unlock from the PWA.
  DAILY_AI_BUDGET_EXCEEDED: {
    message: "You've hit today's AI processing limit. Capture still works — AI features resume at midnight UTC.",
  },
}

/**
 * Resolve a server error response body to a user-facing UX entry.
 *
 * @param body - The parsed JSON body of a 4xx/5xx response, or `null`/`undefined`
 *               if the body was not JSON. Caller is responsible for
 *               `await res.json().catch(() => null)`-style parsing.
 * @param fallback - Generic user-facing copy to show when the body has neither
 *                   a known `code` nor a usable `error` string.
 * @returns An `ApiErrorUx` ready to render. Always returns a non-empty message.
 */
export function resolveApiError(
  body: { error?: string; code?: string } | null | undefined,
  fallback: string,
): ApiErrorUx {
  // 1. Known code → mapped UX.
  if (body?.code && Object.prototype.hasOwnProperty.call(ERROR_CODE_MAP, body.code)) {
    return ERROR_CODE_MAP[body.code]!
  }
  // 2. Unknown code (or missing) with a usable backend string → forward-compat passthrough.
  if (typeof body?.error === "string" && body.error.length > 0) {
    return { message: body.error }
  }
  // 3. Nothing useful → fallback.
  return { message: fallback }
}
