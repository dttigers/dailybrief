// ── Phase 126 Wave 0 — RED-by-default scaffold (AUTH-126-05 / D-04 / Plan 126-07) ─
// Pins the public surface of vigil-pwa/src/lib/api-error-codes.ts BEFORE Wave 1
// (Plan 126-07) creates the production module. Until then every test below
// fails at module resolution. That is the intended RED state. Wave 1 must
// land the production module to turn this file GREEN.
//
// Test cases:
//   - AUTH-126-CODE-MAP-CAPTCHA: CAPTCHA_FAILED → mapped message ('captcha')
//   - AUTH-126-CODE-MAP-RATE-LIMITED: RATE_LIMITED → mapped message ('too many')
//   - AUTH-126-CODE-MAP-REG-NOT-ALLOWED: REG_NOT_ALLOWED → message + ctaLabel + ctaHref
//   - AUTH-126-CODE-MAP-UNKNOWN-FALLS-BACK-RAW: unknown code → body.error string
//   - AUTH-126-CODE-MAP-EMPTY-FALLS-BACK-DEFAULT: {} or null → fallback string
//   - locked-enum case: all 9 LOCKED keys present (CONTEXT D-04)
//
// LOCKED enum (CONTEXT D-04): planner may ADD codes, may NOT remove from this 9-tuple:
//   CAPTCHA_FAILED, RATE_LIMITED, REG_NOT_ALLOWED, INVALID_EMAIL_FORMAT,
//   PASSWORD_TOO_SHORT, PASSWORD_TOO_LONG, EMAIL_TAKEN, EMAIL_NOT_VERIFIED,
//   INVALID_CREDENTIALS.
//
// Run: cd vigil-pwa && npx vitest run src/lib/api-error-codes.test.ts
// -----------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'

// The `./api-error-codes` module does NOT exist yet — Plan 126-07 creates it.
// This import failure IS the Wave 0 RED signal for this file.
import { resolveApiError, ERROR_CODE_MAP } from './api-error-codes'

describe('resolveApiError + ERROR_CODE_MAP — AUTH-126-05 / D-04', () => {
  it('AUTH-126-CODE-MAP-CAPTCHA: resolveApiError({code:CAPTCHA_FAILED}).message includes "captcha" (case-insensitive)', () => {
    const ux = resolveApiError({ error: 'raw', code: 'CAPTCHA_FAILED' }, 'fallback')
    expect(ux.message.toLowerCase()).toContain('captcha')
  })

  it('AUTH-126-CODE-MAP-RATE-LIMITED: resolveApiError({code:RATE_LIMITED}).message includes "too many" (case-insensitive)', () => {
    const ux = resolveApiError({ error: 'raw', code: 'RATE_LIMITED' }, 'fallback')
    expect(ux.message.toLowerCase()).toContain('too many')
  })

  it('AUTH-126-CODE-MAP-REG-NOT-ALLOWED: REG_NOT_ALLOWED maps to {message, ctaLabel, ctaHref}', () => {
    const ux = resolveApiError({ error: 'raw', code: 'REG_NOT_ALLOWED' }, 'fallback')
    expect(typeof ux.message).toBe('string')
    expect(ux.message.length).toBeGreaterThan(0)
    expect(typeof ux.ctaLabel).toBe('string')
    expect(ux.ctaLabel!.length).toBeGreaterThan(0)
    expect(typeof ux.ctaHref).toBe('string')
    expect(ux.ctaHref!.length).toBeGreaterThan(0)
  })

  it('AUTH-126-CODE-MAP-UNKNOWN-FALLS-BACK-RAW: unknown code → body.error string (forward-compat for new server codes)', () => {
    const ux = resolveApiError({ error: 'raw error', code: 'UNKNOWN_CODE' }, 'fb')
    expect(ux.message).toBe('raw error')
  })

  it('AUTH-126-CODE-MAP-EMPTY-FALLS-BACK-DEFAULT: {} or null → fallback string', () => {
    expect(resolveApiError({}, 'fb').message).toBe('fb')
    expect(resolveApiError(null, 'fb').message).toBe('fb')
    expect(resolveApiError(undefined, 'fb').message).toBe('fb')
  })

  it('AUTH-126-CODE-MAP-LOCKED-ENUM: ERROR_CODE_MAP contains all 9 LOCKED keys (D-04 lock)', () => {
    const LOCKED_KEYS = [
      'CAPTCHA_FAILED',
      'RATE_LIMITED',
      'REG_NOT_ALLOWED',
      'INVALID_EMAIL_FORMAT',
      'PASSWORD_TOO_SHORT',
      'PASSWORD_TOO_LONG',
      'EMAIL_TAKEN',
      'EMAIL_NOT_VERIFIED',
      'INVALID_CREDENTIALS',
    ] as const
    for (const key of LOCKED_KEYS) {
      expect(ERROR_CODE_MAP, `ERROR_CODE_MAP must contain LOCKED key "${key}" — D-04 enum lock`).toHaveProperty(key)
      const entry = ERROR_CODE_MAP[key]
      expect(typeof entry.message, `ERROR_CODE_MAP["${key}"].message must be a string`).toBe('string')
      expect(entry.message.length).toBeGreaterThan(0)
    }
  })

  it('GUARD-127-CODE-MAP-AUDIO-EXTENSION: AUDIO_SESSION_TOO_LONG present in EXTENSION block with locked copy + no CTA (D-02.4)', () => {
    // CONTEXT D-02.4 verbatim copy lock — server returns HTTP 413 + code on
    // base64 payloads > 2_560_000 chars; PWA renders this string. Future
    // copy tuning requires updating this test alongside the source.
    expect(ERROR_CODE_MAP, 'ERROR_CODE_MAP must contain Phase 127 GUARD-02 key "AUDIO_SESSION_TOO_LONG"').toHaveProperty('AUDIO_SESSION_TOO_LONG')
    const entry = ERROR_CODE_MAP['AUDIO_SESSION_TOO_LONG']!
    expect(entry.message).toBe('Recording is too long. Voice clips must be 60 seconds or less.')
    // CONTEXT D-02.4: no CTA — operator can't act their way out of "clip is too long",
    // they just need to retry with a shorter recording.
    expect(entry.ctaLabel).toBeUndefined()
    expect(entry.ctaHref).toBeUndefined()
  })

  it('GUARD-127-CODE-MAP-BUDGET-EXTENSION: DAILY_AI_BUDGET_EXCEEDED present in EXTENSION block with locked copy + no CTA (D-03.5)', () => {
    // CONTEXT D-03.5 verbatim copy lock — vigil-core throws DailyBudgetExceededError
    // when usd_estimate >= VIGIL_DAILY_AI_BUDGET_USD; app.onError translates to
    // HTTP 429 + {code: "DAILY_AI_BUDGET_EXCEEDED"}; PWA renders this string.
    // Future copy tuning requires updating this test alongside the source.
    expect(ERROR_CODE_MAP, 'ERROR_CODE_MAP must contain Phase 127 GUARD-03 key "DAILY_AI_BUDGET_EXCEEDED"').toHaveProperty('DAILY_AI_BUDGET_EXCEEDED')
    const entry = ERROR_CODE_MAP['DAILY_AI_BUDGET_EXCEEDED']!
    expect(entry.message).toBe("You've hit today's AI processing limit. Capture still works — AI features resume at midnight UTC.")
    // CONTEXT D-03.5: no CTA — user can't act their way out of a daily-budget
    // ceiling; the message itself communicates the workaround (capture still
    // works) and the reset time (midnight UTC). T-127-03-H disposition: any
    // future CTA addition surfaces here as a test failure.
    expect(entry.ctaLabel).toBeUndefined()
    expect(entry.ctaHref).toBeUndefined()
  })
})
