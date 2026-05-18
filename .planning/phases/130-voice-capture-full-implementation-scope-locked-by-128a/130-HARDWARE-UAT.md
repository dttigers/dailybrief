---
phase: 130-voice-capture-full-implementation-scope-locked-by-128a
plan: 07
runbook_source: 130-07-PLAN.md
operator: Jameson Morrill
operator_email: jamesonmorrill1@gmail.com
status: partial
started: 2026-05-18T21:20:35Z
updated: 2026-05-18T21:20:35Z
resume_signal: do NOT mark Plan 07 complete until all 7 UAT lines have a result of PASS or FAIL (with notes)
loom_waived: true
loom_waived_reason: G2 lenses are not screen-mirrorable per [feedback_loom_waived_g2_not_screen_mirrorable] auto-memory; portfolio artifacts are console-log timing screenshot + PWA dashboard render screenshot
---

# Phase 130 Hardware UAT — Operator Runbook

> Operator-only verification log for Phase 130 (VOICE-02..08 + production migration 0023). All seven UAT lines below MUST be filled in with timestamps + pass/fail + supporting evidence before Plan 07 can be marked complete and Phase 130 closed in ROADMAP.md.
>
> Authoring rules:
> - Replace `[pending]` with `PASS` / `FAIL` / `BLOCKED` after running the line.
> - Paste timestamps in `YYYY-MM-DDTHH:MM:SSZ` (UTC) or operator-local with timezone.
> - Paste raw psql / DevTools / stopwatch output verbatim where requested.
> - Attach screenshots as relative paths under `.planning/phases/130-voice-capture-full-implementation-scope-locked-by-128a/screenshots/` (operator creates the directory).
> - DO NOT dump `railway variables` output — use `railway variables get DATABASE_URL` per [Railway variables leak] auto-memory.
> - If a UAT line FAILS, capture root-cause hypothesis under `notes:` and surface as a Phase 130 follow-up gap.

---

## Pre-flight checklist

- [ ] Plans 130-01..130-06 all green (`130-0{1..6}-SUMMARY.md` exist; full test suite passes locally)
- [ ] Operator on workstation with Railway production credentials available
- [ ] G2-tethered iPhone charged + Even Hub portal accessible
- [ ] Dev laptop browser logged into vigil-pwa dashboard (NOT the iPhone — VOICE-06 acceptance is cross-device)
- [ ] PostHog dashboard access available for VOICE-08 event-key inspection

---

## UAT Line 1 — Production migration 0023 applied to Railway DB (operator wallclock)

**Source:** Plan 130-07 Task 1, `must_haves.truths[0]`
**Requirement:** VOICE-05 (productionization gate; per `[feedback_wallclock_checkpoint_exempt]` operator-only)
**Type:** human-action (production secrets are operator-scoped — Claude cannot execute)

**Truth to verify:** Operator confirms `cd vigil-core && npm run db:migrate-prod` succeeded against Railway production DB (operator wallclock — per `[feedback_wallclock_checkpoint_exempt]` auto-memory).

**Steps:**

1. From operator dev laptop: `cd vigil-core && DATABASE_URL=$RAILWAY_PROD_DATABASE_URL npm run db:migrate-prod` (or Railway CLI / dashboard equivalent — operator picks).
2. Verify table columns:
   ```bash
   psql $RAILWAY_PROD_DATABASE_URL -c "\d voice_captures"
   ```
   Expected: 6 columns — `id`, `user_id`, `thought_id`, `client_capture_id`, `queued_at`, `retry_count`.
3. Verify partial unique index:
   ```bash
   psql $RAILWAY_PROD_DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE tablename='voice_captures';"
   ```
   Expected output contains `uq_voice_captures_user_client_capture_id`.
4. Re-run migrator to confirm no work remaining:
   ```bash
   cd vigil-core && DATABASE_URL=$RAILWAY_PROD_DATABASE_URL npm run db:migrate-prod
   ```
   Expected: `drizzle-kit migrate` reports no migrations pending.

**Result:** PASS

**Wallclock timestamp:** 2026-05-18T21:20:35Z (UTC) — initial apply + idempotency re-run both completed by this timestamp

**Invocation (canonical Phase 118 pattern, D-01 invariant preserved — no DATABASE_URL on disk):**
```bash
cd vigil-core && railway run --service Postgres -- bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npm run db:migrate-prod'
```

**Migrator output (initial apply):**
```text
> vigil-core@0.2.0 db:migrate-prod
> node dist/db/migrate.js

[migrate] Running migrations...
{
  severity_local: 'NOTICE',
  severity: 'NOTICE',
  code: '42P06',
  message: 'schema "drizzle" already exists, skipping',
  file: 'schemacmds.c',
  line: '132',
  routine: 'CreateSchemaCommand'
}
{
  severity_local: 'NOTICE',
  severity: 'NOTICE',
  code: '42P07',
  message: 'relation "__drizzle_migrations" already exists, skipping',
  file: 'parse_utilcmd.c',
  line: '208',
  routine: 'transformCreateStmt'
}
[migrate] Migrations complete
```
(Notices are expected — the `drizzle` schema + `__drizzle_migrations` tracking table exist from prior migrations; this is the standard Drizzle migrator pattern.)

**Migrator output (idempotency re-run):**
```text
[migrate] Migrations complete
```
(Same NOTICE block; no new SQL executed — migrator detects 0023 already journaled in `__drizzle_migrations`.)

**`\d voice_captures` raw output:**
```text
                                          Table "public.voice_captures"
      Column       |           Type           | Collation | Nullable |                  Default                   
-------------------+--------------------------+-----------+----------+--------------------------------------------
 id                | integer                  |           | not null | nextval('voice_captures_id_seq'::regclass)
 user_id           | integer                  |           | not null | 
 thought_id        | integer                  |           |          | 
 client_capture_id | text                     |           | not null | 
 queued_at         | timestamp with time zone |           | not null | now()
 retry_count       | integer                  |           | not null | 0
Indexes:
    "voice_captures_pkey" PRIMARY KEY, btree (id)
    "uq_voice_captures_user_client_capture_id" UNIQUE, btree (user_id, client_capture_id) WHERE client_capture_id IS NOT NULL
Foreign-key constraints:
    "voice_captures_thought_id_fkey" FOREIGN KEY (thought_id) REFERENCES thoughts(id) ON DELETE SET NULL
    "voice_captures_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

**`pg_indexes` raw output (extracted from `\d voice_captures` Indexes section):**
```text
voice_captures_pkey                          PRIMARY KEY, btree (id)
uq_voice_captures_user_client_capture_id     UNIQUE, btree (user_id, client_capture_id) WHERE client_capture_id IS NOT NULL
```

**Acceptance criteria — all PASS:**
- ✓ 6 columns present: `id`, `user_id`, `thought_id`, `client_capture_id`, `queued_at`, `retry_count`
- ✓ Partial unique index `uq_voice_captures_user_client_capture_id` present on `(user_id, client_capture_id) WHERE client_capture_id IS NOT NULL`
- ✓ FK `voice_captures_user_id_fkey` → `users(id) ON DELETE CASCADE`
- ✓ FK `voice_captures_thought_id_fkey` → `thoughts(id) ON DELETE SET NULL`
- ✓ Idempotency re-run reports `[migrate] Migrations complete` with no new SQL executed

**Notes:** Executed by Claude on operator's behalf at explicit operator request. Operator's Railway CLI was pre-linked to `vigil-core` project (`Project ID: e9d47f40-406a-4c47-8745-081e28195c72`, env `production`). D-01 invariant (no `DATABASE_URL` written to local disk) preserved via `railway run --service Postgres -- bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" ...'` remap pattern from Phase 118 runbook. No `railway variables` dump performed per `[Railway variables leak]` auto-memory.

---

## UAT Line 2 — G2 plugin packed + installed on G2-tethered iPhone via Even Hub portal

**Source:** Plan 130-07 Task 2 pre-flight, `must_haves.truths[1]`
**Requirement:** Pre-flight (gates the remaining six lines below)
**Type:** human-verify (operator-only — sideload step)

**Truth to verify:** Operator confirms G2 plugin packed + installed on G2-tethered iPhone via Even Hub portal.

**Steps:**

1. Pack plugin: `cd vigil-g2-plugin && npm run pack` (or whatever the plugin-pack command is — see `vigil-g2-plugin/package.json`).
2. Note the output `.ehpk` path + size.
3. Open Even Hub portal app on operator's iPhone.
4. Sideload the packed plugin → confirm install succeeds with no portal errors.
5. Confirm plugin appears in the carousel on G2 hardware (operator swipes to verify).

**Result:** PARTIAL — pack PASS; sideload pending operator

**Pack invocation:**
```bash
cd vigil-g2-plugin && npm run build && npm run pack
```

**Build output:**
```text
> vigil-g2-plugin@0.0.0 build
> tsc && vite build

vite v8.0.3 building client environment for production...
✓ 23 modules transformed.
dist/index.html                 3.46 kB │ gzip:  1.34 kB
dist/assets/index-Dztg-UQ2.js  82.63 kB │ gzip: 31.10 kB
✓ built in 69ms
```

**Pack output:**
```text
> vigil-g2-plugin@0.0.0 pack
> evenhub pack app.json dist -o vigil.ehpk

Successfully packed vigil.ehpk (34753 bytes)
```

**Pack timestamp (final, v0.3.8):** 2026-05-18T21:32:15Z
**Initial pack timestamp (v0.3.7 — superseded):** 2026-05-18T21:22:23Z
**.ehpk file size:** 34751 bytes (~34 KiB) — final v0.3.8 build
**.ehpk absolute path:** `/home/morrillboss/dev/dailybrief/vigil-g2-plugin/vigil.ehpk`
**Plugin name / version (from app.json):** Vigil 0.3.8 (bumped from 0.3.7 in commit `96ac69e` — Even Hub live = 0.3.6, so 0.3.8 leapfrogs the superseded 0.3.7 beta)
**evenhub CLI version:** 0.1.13

**Sideload timestamp:** [pending — operator-only via Even Hub portal app on iPhone]

**Carousel confirmation:** [pending — operator swipes G2 to verify VOICE screen at slot 2 between Companion and Tasks]

**Notes:** Build + pack executed by Claude at explicit operator request. Sideload step remains operator-only (Even Hub portal lives on iPhone). Operator transfers `vigil.ehpk` to iPhone (AirDrop / iCloud Drive / Files share), opens Even Hub portal, sideloads, and confirms install. Plugin includes the production VOICE screen at carousel slot 2 (post-Phase-130 implementation: Companion → VOICE → Tasks → Work Orders).

---

## UAT Line 3 — VOICE-06 round-trip ≤ 8 s (operator wallclock stopwatch)

**Source:** Plan 130-07 Task 2 round-trip, `must_haves.truths[2]`
**Requirement:** VOICE-06 (8-second user-perceived round-trip — cross-device, NOT measurable in CI)
**Type:** human-verify

**Truth to verify:** Operator wallclock-measures DOUBLE_CLICK stop → PWA dashboard row visible ≤ 8 s on dev laptop browser (VOICE-06 acceptance criterion).

**Methodology (per 130-CONTEXT.md "8-s acceptance test methodology" specifics):**
- Measurement starts at `DOUBLE_CLICK_EVENT (stop)` on G2.
- Measurement ends when the transcribed thought row is VISIBLY rendered on the PWA dashboard (dev laptop browser, NOT iPhone — cross-device per D-X1).
- Expected floor: `stop→HTTP_ms (~1.88 s spike median) + SSE_propagation (~50 ms) + React render (~16 ms) ≈ 2 s`. Pass = ≤ 8 s.

**Steps:**

1. On G2: swipe to the production VOICE screen (carousel position: after Companion, before Tasks per 130-CONTEXT specifics).
2. DOUBLE_CLICK → confirm stateLine flips to `[REC 0:00]` with m:ss timer ticking.
3. Speak a short test utterance (≤ 3 s).
4. Start stopwatch.
5. DOUBLE_CLICK to stop → confirm state flow `[UPLOADING…]` → `[DONE]` → `[IDLE]`.
6. STOP stopwatch the instant the transcribed thought row appears on the PWA dashboard browser.
7. Capture screenshot of dashboard row + browser DevTools console-log timing.

**Result:** [pending]

**Stopwatch reading (seconds):** [pending]

**Pass condition:** ≤ 8.0 s

**Screenshot — PWA dashboard row visible:** [pending — path under screenshots/]

**Screenshot — DevTools console-log timing:** [pending — path under screenshots/]

**Transcribed thought content (first 80 chars):** [pending]

**Notes:** [pending]

---

## UAT Line 4 — Recording m:ss timer survives carousel swipe (VOICE-03)

**Source:** Plan 130-07 Task 2 VOICE-03, `must_haves.truths[3]`
**Requirement:** VOICE-03 (recording indicator survives screen changes per D-S3 cross-screen state)
**Type:** human-verify

**Truth to verify:** Operator confirms recording m:ss timer survives carousel swipe (VOICE-03).

**Steps:**

1. On G2: swipe to VOICE screen.
2. DOUBLE_CLICK to start recording → confirm `[REC 0:00]` with ticking m:ss timer.
3. Mid-recording, swipe LEFT to Companion screen.
4. Confirm m:ss timer is STILL ticking on Companion HUD (cross-screen state per D-S3).
5. Swipe BACK to VOICE screen.
6. Confirm `[REC m:ss]` continues from the same timer (not reset to 0:00).
7. DOUBLE_CLICK to stop and complete the cycle cleanly.

**Result:** [pending]

**Timer value mid-swipe (Companion HUD):** [pending — e.g., `0:04`]

**Timer value after swipe-back (VOICE):** [pending — should be ≥ Companion reading]

**Notes:** [pending]

---

## UAT Line 5 — `[NO MIC]` body line surfaces after Even Hub permission revocation (VOICE-02 Run 4 §5)

**Source:** Plan 130-07 Task 2 [NO MIC] surface, `must_haves.truths[4]`
**Requirement:** VOICE-02 (Run 4 §5 hardening — `[NO MIC]` distinguishable from `[ERR]`)
**Type:** human-verify

**Truth to verify:** Operator confirms `[NO MIC]` body line appears after revoking `g2-microphone` in Even Hub (VOICE-02 Run 4 §5).

**Steps:**

1. In the Even Hub portal app on iPhone, revoke `g2-microphone` permission for the Vigil plugin.
2. On G2: swipe to VOICE screen, DOUBLE_CLICK.
3. Confirm body line 1 shows `[NO MIC]` (NOT `[ERR]`).
4. Confirm body line 2 reads EXACTLY `enable mic in Hub` (verbatim per 130-CONTEXT specifics; NOT `retry — tap to dismiss`).
5. Re-grant `g2-microphone` permission in Even Hub.
6. On G2: DOUBLE_CLICK again → confirm state returns to `[REC 0:00]` normally.

**Result:** [pending]

**Body line 1 string (verbatim):** [pending]

**Body line 2 string (verbatim):** [pending]

**Recovery DOUBLE_CLICK result:** [pending — should be `[REC 0:00]`]

**Notes:** [pending]

---

## UAT Line 6 — Airplane-mode queue drain (VOICE-07)

**Source:** Plan 130-07 Task 2 VOICE-07, `must_haves.truths[5]`
**Requirement:** VOICE-07 (offline queue depth indicator + 6-step backoff drain)
**Type:** human-verify

**Truth to verify:** Operator confirms airplane-mode toggle: 2 recordings produce queue depth = 2 on HUD; disabling airplane mode drains queue to 0 (VOICE-07).

**Steps:**

1. On iPhone: enable airplane mode (cellular + Wi-Fi off).
2. On G2: record 2 short utterances back-to-back (DOUBLE_CLICK → speak → DOUBLE_CLICK; repeat).
3. Confirm Companion HUD body line 3 reads `syncing 2 voice captures…` (queue depth substring).
4. Capture screenshot of HUD with queue indicator at depth 2.
5. Disable airplane mode on iPhone.
6. Wait through backoff schedule as needed (1 s → 2 s → 4 s → 8 s → 16 s → 30 s per D-O1).
7. Confirm HUD body line 3 drains: `syncing 2 voice captures…` → `syncing 1 voice captures…` → (hidden when queue depth = 0).
8. Capture screenshot of HUD after drain (queue indicator hidden or `syncing 0`).
9. Confirm both transcripts appear on PWA dashboard.

**Result:** [pending]

**Queue depth screenshot (depth = 2):** [pending — path under screenshots/]

**Post-drain screenshot (depth = 0 / hidden):** [pending — path under screenshots/]

**PWA confirmation — both transcripts visible:** [pending — YES / NO]

**Backoff observation — time from network-on to drain start:** [pending — approximate seconds]

**Notes:** [pending]

---

## UAT Line 7 — Portfolio screenshots captured (Loom waived)

**Source:** Plan 130-07 Task 2 portfolio close-out, `must_haves.truths[6]`
**Requirement:** Phase 130 close-out portfolio artifacts (Loom WAIVED per `[feedback_loom_waived_g2_not_screen_mirrorable]` auto-memory)
**Type:** human-verify

**Truth to verify:** Operator captures console-log timing screenshot + PWA dashboard render screenshot (Loom waived per `[feedback_loom_waived_g2_not_screen_mirrorable]` auto-memory).

**Steps:**

1. Confirm screenshots captured in UAT Line 3 are present at their declared paths.
2. Optionally capture additional portfolio frames (HUD `syncing N voice captures` indicator close-up, `[NO MIC]` state on G2 lens — if camera-capturable from outside the lens).
3. Loom is NOT required for Phase 130 close (G2 lenses not screen-mirrorable).

**Result:** [pending]

**Console-log timing screenshot (from Line 3):** [pending — path under screenshots/]

**PWA dashboard render screenshot (from Line 3):** [pending — path under screenshots/]

**Additional portfolio frames:** [pending — list paths or `none`]

**Notes:** [pending]

---

## VOICE-08 PostHog telemetry sanity (separate inspection, not part of the 7 truths)

> Plan 130-07 acceptance criteria require PostHog event-key inspection. This is recorded here for completeness even though it is not one of the 7 `must_haves.truths` lines.

**Steps:**

1. In PostHog dashboard, filter `voice_capture_completed` events from the last 1 hour.
2. Open one event; expand `properties`.
3. Confirm property keys present: `stop_to_http_ms`, `chunks`, `bytes`, `retry_count`, `transcript_chars`.
4. Confirm NO property keys named `audio`, `audioPcm`, `pcm`, `audio_pcm` (D-D2 redaction pin).
5. If any drop-out fired, inspect `voice_capture_dropout` event → confirm only `gap_ms` and `recording_id` keys.

**Result:** [pending]

**Event-properties screenshot or paste:**
```json
[paste properties here]
```

**No-audio* / no-pcm* keys confirmation:** [pending — YES / NO]

**Notes:** [pending]

---

## D-D3 sanity check (negative path — operator best-effort)

> Plan 130-07 mentions a negative-path sanity check for `safeAudioControl` cleanup. Record only if operator has time; not a hard gate.

**Steps:**

1. On G2: DOUBLE_CLICK to start recording.
2. Force-quit G2 plugin mid-recording (swipe out of app or close iPhone Even Hub).
3. Re-open plugin.
4. Confirm `safeAudioControl(false, bridge)` cleanup hooks fired (no orphan `audioControl(true)` left over; phone microphone is NOT still active per device-level indicator).

**Result:** [pending]

**Notes:** [pending]

---

## Operator Sign-off

- [ ] All 7 UAT lines have a `Result:` value other than `[pending]`
- [ ] VOICE-06 stopwatch reading ≤ 8.0 s recorded in Line 3
- [ ] `[NO MIC]` body line 2 string `enable mic in Hub` recorded verbatim in Line 5
- [ ] Queue depth indicator screenshots attached in Line 6 (depth = 2 + post-drain)
- [ ] PostHog event-key inspection confirms no `audio*` / `pcm*` keys leaked
- [ ] Portfolio screenshots attached (Loom waived — not required)

**Operator signature:** [pending]
**Sign-off timestamp:** [pending]

**Resume signal for orchestrator:** When all checkboxes above are checked + signed, re-run `/gsd:execute-phase 130 --wave 5` (or manual continuation). The orchestrator will inspect this file, author `130-07-SUMMARY.md`, advance STATE.md, mark Plan 07 complete in ROADMAP.md, and run phase verification.
