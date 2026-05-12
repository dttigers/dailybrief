---
phase: 127
plan: 06
subsystem: vigil-pwa
tags:
  - GUARD-03
  - error-ux
  - locked-enum
  - extension-additivity
requires:
  - 127-03 (Plan 03 AUDIO_SESSION_TOO_LONG sits AFTER the Phase 126 four extension entries; Plan 06 appends after it — Wave 2 ordering)
  - 126-07 (D-04 ERROR_CODE_MAP additivity authority; LOCKED 9-key block + resolveApiError surface)
provides:
  - DAILY_AI_BUDGET_EXCEEDED locked-enum extension key (ERROR_CODE_MAP)
  - GUARD-127-CODE-MAP-BUDGET-EXTENSION pin test
affects:
  - vigil-core Plan 05.1 (downstream consumer — emits HTTP 429 + this code; this plan ships the PWA half of the user-visible loop)
tech-stack:
  added: []
  patterns:
    - locked-enum extension (Phase 126 D-04 additivity)
    - verbatim-copy pin via vitest expect.toBe (T-127-03-G mitigation)
    - undefined-CTA assertion to defend against drift (T-127-03-H mitigation)
key-files:
  created: []
  modified:
    - vigil-pwa/src/lib/api-error-codes.ts (+13 lines — one EXTENSION entry + locked-rationale comment block)
    - vigil-pwa/src/lib/api-error-codes.test.ts (+16 lines — one it() pin test mirroring AUDIO analog)
decisions:
  - "Place new EXTENSION entry immediately after AUDIO_SESSION_TOO_LONG to preserve Plan 03's edit byte-for-byte and keep both Phase 127 extensions adjacent for code locality"
  - "Test block placed adjacent to GUARD-127-CODE-MAP-AUDIO-EXTENSION (same rationale — Phase 127 extensions co-located in the test file)"
  - "Used verbatim `expect.toBe(literal)` for the message and `expect.toBeUndefined()` for ctaLabel/ctaHref — pairs source + test as a single drift-resistant lock (T-127-03-G + T-127-03-H)"
metrics:
  duration: ~10m
  completed: 2026-05-12T05:14:52Z
  tasks_completed: 1
  files_modified: 2
  commits: 1
---

# Phase 127 Plan 06: GUARD-03 PWA ERROR_CODE_MAP Extension Summary

## One-liner

Append `DAILY_AI_BUDGET_EXCEEDED` to `vigil-pwa/src/lib/api-error-codes.ts` ERROR_CODE_MAP EXTENSION block with verbatim D-03.5 copy and no CTA, plus a `GUARD-127-CODE-MAP-BUDGET-EXTENSION` pin test mirroring Plan 03's audio analog — closing the user-visible half of GUARD-03 so vigil-core's eventual 429 + code (Plan 05.1) renders friendly retry-tomorrow copy in the PWA.

## What Was Done

**Task 1: Append `DAILY_AI_BUDGET_EXCEEDED` to PWA ERROR_CODE_MAP EXTENSION block + add pin test** — commit `214b24e0`

TDD cycle:

- **RED** — added the `GUARD-127-CODE-MAP-BUDGET-EXTENSION` it-block first. Vitest reported `expected { …(14) } to have property "DAILY_AI_BUDGET_EXCEEDED"`. 1 failed / 7 passed (Phase 126 LOCKED 9-key, Plan 03 AUDIO, 5 resolver tests all stayed green).
- **GREEN** — added the `DAILY_AI_BUDGET_EXCEEDED` entry immediately AFTER Plan 03's `AUDIO_SESSION_TOO_LONG` entry, BEFORE the ERROR_CODE_MAP closing `}`. Under a fresh `// ── EXTENSION (Phase 127 GUARD-03 — D-04 additivity) ──` sub-block marker. Verbatim copy: `"You've hit today's AI processing limit. Capture still works — AI features resume at midnight UTC."` (curly apostrophe + em-dash byte-for-byte from CONTEXT D-03.5). No `ctaLabel` / `ctaHref` fields. Vitest: 8 passed / 0 failed.
- **REFACTOR** — none needed; the new entry mirrors the AUDIO analog body verbatim with only the message string differing.

Wave 2 ordering preserved: Plan 03's AUDIO_SESSION_TOO_LONG entry and its `GUARD-127-CODE-MAP-AUDIO-EXTENSION` test both byte-identical post-commit (`git diff HEAD~1` shows ONLY insertions, no modifications to existing lines).

LOCKED 9-key block (api-error-codes.ts lines 84-117 pre-Plan-06) byte-identical post-commit. Verified via `git diff HEAD~1 -- vigil-pwa/src/lib/api-error-codes.ts | grep '^[+-]'` — only added lines visible, none of the 9 LOCKED entries appear in the diff.

## Files

| File | Change | Reason |
|------|--------|--------|
| `vigil-pwa/src/lib/api-error-codes.ts` | EDIT (+13 lines) | New `DAILY_AI_BUDGET_EXCEEDED` EXTENSION entry + locked-rationale comment |
| `vigil-pwa/src/lib/api-error-codes.test.ts` | EDIT (+16 lines) | New `GUARD-127-CODE-MAP-BUDGET-EXTENSION` it-block pin test |

## Verification

```
$ cd vigil-pwa && ./node_modules/.bin/vitest run src/lib/api-error-codes.test.ts
 ✓ src/lib/api-error-codes.test.ts (8 tests) 5ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

All 8 tests pass:

- 5 resolver behavior tests (AUTH-126-CODE-MAP-CAPTCHA, RATE-LIMITED, REG-NOT-ALLOWED, UNKNOWN-FALLS-BACK-RAW, EMPTY-FALLS-BACK-DEFAULT)
- AUTH-126-CODE-MAP-LOCKED-ENUM (Phase 126 LOCKED 9-key lock — still green)
- GUARD-127-CODE-MAP-AUDIO-EXTENSION (Plan 03's pin — still green)
- GUARD-127-CODE-MAP-BUDGET-EXTENSION (this plan's new pin — green)

Acceptance criteria grep counts (all === 1):

```
grep -c 'DAILY_AI_BUDGET_EXCEEDED:' vigil-pwa/src/lib/api-error-codes.ts                   → 1
grep -c "You've hit today's AI processing limit" vigil-pwa/src/lib/api-error-codes.ts      → 1
grep -c 'AUDIO_SESSION_TOO_LONG:' vigil-pwa/src/lib/api-error-codes.ts                     → 1
grep -c 'GUARD-127-CODE-MAP-BUDGET-EXTENSION' vigil-pwa/src/lib/api-error-codes.test.ts    → 1
grep -c 'GUARD-127-CODE-MAP-AUDIO-EXTENSION' vigil-pwa/src/lib/api-error-codes.test.ts     → 1
grep -c 'AUTH-126-CODE-MAP-LOCKED-ENUM' vigil-pwa/src/lib/api-error-codes.test.ts          → 1
```

## End-to-End Loop Now Closed

vigil-core (Plan 05.1 — future Wave) → `ai_usage_daily.usd_estimate >= VIGIL_DAILY_AI_BUDGET_USD` → `DailyBudgetExceededError` throw inside `requireAiBudget(userId)` → `app.onError` translates to HTTP 429 `{error: "Daily AI budget exceeded", code: "DAILY_AI_BUDGET_EXCEEDED"}` → PWA `resolveApiError(body, fallback)` looks up `body.code` → `ERROR_CODE_MAP.DAILY_AI_BUDGET_EXCEEDED` returns `{message: "You've hit today's AI processing limit. Capture still works — AI features resume at midnight UTC."}` → page renders the friendly copy. The user-visible half of T-127-03 mitigation is now live as soon as the vigil-core half ships.

## Manual Smoke (post-deploy)

Documented in `127-VALIDATION.md` row 3 — operator runs after vigil-core deploys Plan 05.1 + the GUARD-03 migration (Plan 04):

1. Set `VIGIL_DAILY_AI_BUDGET_USD=0.001` (local dev environment).
2. Trigger two chat requests at `POST /v1/chat`.
3. Expect: PWA renders verbatim copy `"You've hit today's AI processing limit. Capture still works — AI features resume at midnight UTC."` (no generic fallback).

Cannot be exercised today — Plan 05.1 vigil-core throw + Plan 04 migration ship in later waves of Phase 127. Pin test is the structural defense in the meantime.

## Decisions

1. **Append-after-AUDIO ordering (D-04 additivity, Wave 2 sequencing).** New EXTENSION entry sits AFTER Plan 03's `AUDIO_SESSION_TOO_LONG` and BEFORE the ERROR_CODE_MAP closing `}`. Result: zero diff overlap with Plan 03, both Phase 127 extensions adjacent in source.
2. **Co-located pin test (code locality).** `GUARD-127-CODE-MAP-BUDGET-EXTENSION` it-block placed immediately after `GUARD-127-CODE-MAP-AUDIO-EXTENSION` in the test file. Future readers see the Phase 127 extension family grouped.
3. **Verbatim copy + undefined-CTA double-lock (T-127-03-G + T-127-03-H mitigation).** Test uses `expect.toBe(literal)` for the message (single-character drift fails CI) and `expect.toBeUndefined()` for both `ctaLabel` and `ctaHref` (any future CTA addition fails CI). Source + test pair as one indivisible drift-resistant lock.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Disposition | How it was mitigated |
|-----------|-------------|---------------------|
| T-127-03 (DoS — user-visible UX half) | mitigate | EXTENSION entry shipped with verbatim copy that names the cause, the workaround, and the reset time — no generic fallback when vigil-core eventually emits 429. |
| T-127-03-G (Tampering — copy rewrite) | mitigate | `expect(entry.message).toBe("You've hit today's AI processing limit. Capture still works — AI features resume at midnight UTC.")` in the pin test fails on any character change. |
| T-127-03-H (Information Disclosure — CTA leak) | mitigate | `expect(entry.ctaLabel).toBeUndefined()` + `expect(entry.ctaHref).toBeUndefined()` blocks any future PR from sneaking a CTA into a 429-response surface without explicitly updating the test. |

## Self-Check: PASSED

- `vigil-pwa/src/lib/api-error-codes.ts` — exists (modified, contains `DAILY_AI_BUDGET_EXCEEDED:`)
- `vigil-pwa/src/lib/api-error-codes.test.ts` — exists (modified, contains `GUARD-127-CODE-MAP-BUDGET-EXTENSION`)
- `.planning/phases/127-pre-spike-guardrails/127-06-SUMMARY.md` — this file, written
- Commit `214b24e0` — present in `git log --oneline` (verified at write time)
- 8/8 vitest tests pass
- LOCKED 9-key block byte-identical (git diff confirms only additive changes)
- Plan 03's AUDIO_SESSION_TOO_LONG entry + test both untouched (grep counts === 1)
- Pre-existing dirty `.planning/research/*.md` files NOT staged in the task commit
