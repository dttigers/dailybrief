---
phase: 130-voice-capture-full-implementation-scope-locked-by-128a
plan: 07
type: execute
status: complete
subsystem: hardware-uat
tags: [voice-capture, hardware-uat, g2-plugin, railway-prod, even-hub]
duration_minutes: 71
task_count: 2
tasks_complete: 2
deviations: 3-surfaced-gaps-resolved-+-4-followups-captured

requires:
  - phase: 130-01
    provides: spike-removal-baseline
  - phase: 130-02
    provides: production-voice-transcribe-route-+-migration-0023
  - phase: 130-03
    provides: sse-thought-created-multiplex-+-pwa-subscriber
  - phase: 130-04
    provides: g2-voice-screen-+-wav-encoder-+-safeAudioControl-promise-boolean
  - phase: 130-05
    provides: offline-queue-+-telemetry-+-companion-hud-line-3
  - phase: 130-06
    provides: drift-detectors-locked-in-ci

provides:
  - operator-attested-pass-on-all-7-uat-lines
  - voice-02-no-mic-disambiguation-validated-on-real-hardware
  - voice-03-cross-screen-state-validated-on-real-hardware
  - voice-04-wav-encoder-validated-via-successful-transcription-against-openai
  - voice-05-voice-captures-dedup-table-applied-to-railway-prod
  - voice-06-cross-device-round-trip-validated-sub-second-perceived
  - voice-07-offline-queue-drain-validated-on-real-hardware-via-airplane-mode
  - voice-08-posthog-safe-key-only-telemetry-validated
  - 4-follow-up-gaps-captured-with-fix-paths

affects:
  - phase-131+ (any future phase touching vigil-g2-plugin)
  - phase-133-reply-ux (depends on stable voice capture for context)

tech-stack:
  added: []
  patterns:
    - "Operator hardware UAT runbook with attempt-by-attempt diagnostic chain"
    - "GAP-followup capture in UAT runbook for post-phase scheduling"

key-files:
  created:
    - .planning/phases/130-voice-capture-full-implementation-scope-locked-by-128a/130-HARDWARE-UAT.md
    - .planning/phases/130-voice-capture-full-implementation-scope-locked-by-128a/130-07-SUMMARY.md
    - vigil-g2-plugin/.env.production.local (operator workstation, gitignored)
  modified:
    - vigil-g2-plugin/app.json (version 0.3.7 → 0.3.8 → 0.3.9)
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Hardware UAT PASS gated on operator wallclock + qualitative observation, not formal stopwatch — 'felt instant' (sub-1s perceived) is unambiguously below the 8s VOICE-06 threshold and matches the CONTEXT ~2s round-trip floor estimate"
  - "Phase 130 closes COMPLETE despite 4 follow-up gaps surfaced (3 hardware-UAT environment gaps + 1 ergonomic gap) — none block VOICE-02..08 acceptance criteria; all are workflow improvements scheduled separately"

patterns-established:
  - "Diagnostic chain: surface deploy state + env-var presence + cache state in order. Each gap built on the prior fix — first 41 commits unpushed, then empty VITE_API_KEY, then Even Hub same-version cache"
  - "Operator-attested batch sign-off acceptable when all 7 UAT lines + side observation are explicitly addressed in writing"

threats-mitigated:
  - id: T-130-07 (no new threats in this plan — operator wallclock verification only)
    in: 130-HARDWARE-UAT.md
    type: operator-driven-verification
    proves: existing-Plans-02/04/06-mitigations-hold-on-real-hardware
---

# 130-07 — Operator Hardware UAT (Plan Summary)

## Goal

Close the VOICE-06 8-second user-perceived round-trip acceptance criterion (cross-device, NOT measurable in CI) and the manual-only verifications from `130-VALIDATION.md` (recording-indicator-survives-swipe, `[NO MIC]` surface disambiguation from `[ERR]`, airplane-mode queue drain). Output: `130-HARDWARE-UAT.md` operator runbook with timestamps + qualitative/quantitative results + pass/fail per UAT line.

## What was built

This plan is a CHECKPOINT plan — no production code. The deliverable is operator-driven verification of the Phase 130 voice-capture stack against Railway production on real hardware (G2-tethered iPhone + dev laptop browser).

### Task 1 — Production migration 0023 applied to Railway (UAT Line 1)

Operator (via Claude on operator's behalf with explicit authorization) ran the canonical Phase 118 pattern:

```bash
cd vigil-core && railway run --service Postgres -- bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npm run db:migrate-prod'
```

D-01 invariant preserved (no `DATABASE_URL` written to local disk). `voice_captures` table + `uq_voice_captures_user_client_capture_id` partial unique index landed in prod. Idempotency confirmed via re-run.

**Wallclock:** 2026-05-18T21:20:35Z. **Commit:** `3e61c1c`.

### Task 2 — Hardware UAT on real G2 + iPhone + dev laptop (UAT Lines 2-7 + VOICE-08)

Operator drove the 7-line UAT runbook (see `130-HARDWARE-UAT.md`). All lines PASS via batch sign-off at **2026-05-18T22:32:27Z**.

## Diagnostic chain — UAT Line 3 burned 4 attempts

The VOICE-06 round-trip test surfaced THREE distinct gaps in sequence before the full pipeline lit up. Each gap was diagnosed live, fixed, and committed. The chain illustrates the operator/automation handoff hazards of running prod hardware UAT for the first time.

### Attempt 1 — 41 commits unpushed
- **Symptom:** `[ERR] retry-tap to dismiss` on G2; no relevant logs at Railway initially (operator was looking at gmail-workorders OAuth refresh failures instead)
- **Diagnosis:** `git log origin/main..HEAD` showed 41 commits including Plan 130-02 route commit `5c4127f`
- **Resolution:** `git push origin main` at 2026-05-18T21:42:04Z (commit `0ca690c` recorded the gap analysis)
- **Lesson saved:** `feedback-deploy-before-migrate-for-new-table-routes` — when a phase ships both a new route AND a migration, deploy code first then migrate (we did it in reverse — migration applied to prod DB before deploy went out, leaving the table with no caller).

### Attempt 2 — VITE_API_KEY empty in build env
- **Symptom:** `POST /v1/voice/transcribe → 401, 55ms` (route exists, auth rejects)
- **Diagnosis:**
  - `awk` showed `.env.production` has `VITE_API_KEY=` with `value_length=0`
  - `grep -c 'vk_' dist/assets/index-*.js` → 0 (no key inlined)
  - Built bundle contained only 2 long strings (`"Content-Type"`, `"modulepreload"`)
  - Asset hash invariant between `npm run build` and `npm run build:prod` — mode wasn't the issue; the env var itself was empty
- **Resolution:** Created gitignored `vigil-g2-plugin/.env.production.local`. Operator populated `VITE_API_KEY=vk_…`. Repacked.
- **First operator paste was the WRONG key.** Regenerated via `cd vigil-core && railway run --service Postgres -- bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npx tsx scripts/generate-key.ts --name "g2-plugin-v0.3.8" --email "jamesonmorrill1@gmail.com"'`. New key inserted into prod `api_keys` (row id=8, is_active=true). Operator updated `.env.production.local` with the correct value, rebuilt.
- **Lesson saved:** `feedback-g2-plugin-build-needs-local-env-override`.

### Attempt 3 — Even Hub silently kept cached same-version package
- **Symptom:** Same `401, 55ms` continued even after operator re-AirDropped + re-sideloaded the new `vigil.ehpk`
- **Diagnosis:** Ruled out prototype mode (dev server on :5175 had no `VITE_API_*` env, so its `localhost:3001` fallback would have failed before reaching Railway — incompatible with observed 401s). Confirmed Even Hub portal silently no-ops same-version sideloads.
- **Resolution:** Bumped `app.json` `version` 0.3.8 → 0.3.9 (commit `cbb911e`). Operator uninstalled existing 0.3.8 via Even Hub portal, then sideloaded 0.3.9.
- **Lesson saved:** `feedback-even-hub-bump-version-or-uninstall-first`.

### Attempt 4 — PASS

Voice round-trip "felt instant" per operator. Sub-1-second perceived from DOUBLE_CLICK-stop to PWA dashboard row visible. Well below the 8.0-second VOICE-06 threshold. **Commit `9cce1d4`** recorded UAT Line 3 PASS.

Lines 4-7 + VOICE-08 then PASS via operator batch sign-off (**commit `c07abd2`**).

## Acceptance criteria — closure

| Acceptance criterion | Status |
| --- | --- |
| Production migration 0023 applied (`\d voice_captures` 6 cols + partial unique index) | ✓ PASS (UAT Line 1) |
| G2 plugin packed + sideloaded via Even Hub | ✓ PASS (UAT Line 2, v0.3.9 via clean uninstall/reinstall) |
| VOICE-06 cross-device round-trip ≤ 8 s wallclock | ✓ PASS — "felt instant" qualitative (sub-1s perceived ≪ 8s) |
| VOICE-03 recording timer survives carousel swipe | ✓ PASS (UAT Line 4) |
| VOICE-02 `[NO MIC]` body line 2 reads `enable mic in Hub` verbatim | ✓ PASS (UAT Line 5) |
| VOICE-07 airplane-mode queue depth 2 + drain to 0, transcripts appear post-drain | ✓ PASS (UAT Line 6) |
| Portfolio screenshots (Loom waived) | ✓ PASS (UAT Line 7, optional captures) |
| VOICE-08 PostHog `voice_capture_completed` — only safe keys, no `audio*` / `pcm*` | ✓ PASS (operator-attested) |

## Follow-up gaps captured (out of scope for Phase 130 closure)

See `130-HARDWARE-UAT.md` "Phase 130 Follow-up Gaps" section. Summary:

1. **GAP-130-FU1 (Low):** `companion.ts:335` empty-state path (`activeSessions.length === 0`) bypasses `computeBodyLine3()` voice-queue priority ladder. Voice-queue indicator missed in no-active-sessions scenario.
2. **GAP-130-FU2 (Medium):** `vite.config.ts` lacks a production-build guard for empty `VITE_API_KEY`. Empty value silently produces a non-authenticating bundle.
3. **GAP-130-FU3 (Low):** No build-id surfaced in Companion HUD — operators can't verify which bundle is actually loaded on G2 (Even Hub cache visibility).
4. **GAP-130-FU4 (Medium):** Gmail OAuth refresh token expired on Railway prod (`gmail-workorders` service); ticker stuck logging `invalid_grant`. Surfaced incidentally in Railway logs during UAT. Separate from Phase 130 scope.

## Verification

- ✓ `130-HARDWARE-UAT.md` filed and committed with operator sign-off
- ✓ All 7 UAT truths recorded with non-`[pending]` Result values
- ✓ Frontmatter `status` advanced `partial → complete`
- ✓ Side observation (companion-idle) investigated and captured as GAP-130-FU1

## Deviations from plan

None of the plan tasks deviated. Three diagnostic gaps surfaced DURING task execution — each was resolved before continuing, and each gap's root cause + fix + lesson is documented in the UAT runbook and the GSD memory store for future Phase 13x cycles.

## Git history (Plan 07 only)

```text
c07abd2 docs(130-07): all 7 UAT lines + VOICE-08 PASS — Phase 130 hardware UAT complete
9cce1d4 docs(130-07): record UAT Line 3 PASS — VOICE-06 round-trip works E2E
6a9e7b3 docs(130-07): record UAT Line 3 attempt 3 — Even Hub same-version cache
cbb911e chore(130-07): bump plugin to 0.3.9 — force Even Hub replacement
1afaf4d docs(130-07): record UAT Line 3 attempt 2 gap — VITE_API_KEY empty in build env
0ca690c docs(130-07): record UAT Line 3 attempt 1 gap — 41 unpushed commits
0bb500d docs(130-07): record UAT Line 2 PASS — sideload complete
80e01c5 docs(130-07): record v0.3.8 repack in UAT Line 2
96ac69e chore(130-07): bump plugin version to 0.3.8 for Even Hub upload
3c84fdd docs(130-07): record UAT Line 2 pack PARTIAL — G2 plugin packed (sideload pending)
3e61c1c docs(130-07): record UAT Line 1 PASS — prod migration 0023 applied to Railway
2daf94a docs(130-07): scaffold operator hardware UAT runbook (awaiting operator)
```

Plus an out-of-Plan-07 commit on the api-keys table (key generation in prod): row id=8 `g2-plugin-v0.3.8` for `jamesonmorrill1@gmail.com`.
