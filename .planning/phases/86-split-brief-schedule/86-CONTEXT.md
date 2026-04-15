# Phase 86: Split Brief Schedule — Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Decouple daily-brief generation (server responsibility) from printing (Mac-only responsibility). Two independent schedules run in their own contexts:

- **Generate** — in-process node-cron inside vigil-core wakes each minute, checks `now (in user's timezone) == generate-schedule hour/minute`, and fires `POST /v1/brief/generate` equivalent internally. The brief is stored under **today's date** in the user's TZ.
- **Print** — Mac menubar `BriefScheduler` (already in place) fires at the configured print time and invokes the `DailyBrief` CLI, which pulls today's brief from the server and `lpr`s it. No local generation.

Scope is limited to: new `generate-schedule` + `user-timezone` settings endpoints, an in-process generate cron, a 7-day retention sweep, a pull-only mode for the `DailyBrief` CLI, a staleness signal in the menubar, PWA Settings UI with two schedule cards, and the doctor check extension.

Out of scope: migrating the existing `print-schedule` row, changing the PWA "Generate Now" button, editing `BriefScheduler.swift`'s timer logic (already correct from Phase 83), email delivery (v3.1+), multi-brief-per-day.

</domain>

<decisions>
## Implementation Decisions

### Generate cron timing
- **D-01:** Dawn model — cron fires at user-configured early-morning time, and the generated brief's storage key is **today's date** in the user's timezone (not tomorrow's). `storage_key` format: `YYYY-MM-DD` (unchanged from Phase 76 D-06).
- **D-02:** In-process scheduler inside the vigil-core Node process. A minute-tick loop (setInterval or node-cron) computes `now` in the configured `user-timezone`, compares to `generate-schedule.{hour,minute}`, and triggers generation when they match AND `generate-schedule.enabled` is true.
- **D-03:** Dedupe — before firing, check whether a brief row for today already exists with a recent `updatedAt` (e.g. within the last 10 minutes). Skip if so. This prevents double-generation across restarts, DST transitions, or any scheduler drift.
- **D-04:** Missed fires are not backfilled. If the server was asleep/restarting at 04:00, the brief simply won't exist until the user manually "Generate Now"s or waits for tomorrow. Briefs are regenerable — acceptable loss.
- **D-05:** Default values for new settings:
  - `generate-schedule` = `{ hour: 4, minute: 0, enabled: true }`
  - `user-timezone` = `"America/New_York"` (fallback; PWA should offer to auto-fill from browser)
  - `print-schedule` unchanged: `{ hour: 6, minute: 0, enabled: true }`

### Schedule config shape
- **D-06:** Three separate `app_settings` rows, not one combined row. No migration of the existing `print-schedule` row.
  - `print-schedule` → `{ hour, minute, enabled }` (existing, untouched)
  - `generate-schedule` → `{ hour, minute, enabled }` (new)
  - `user-timezone` → `"America/New_York"` (plain IANA string, stored as JSON string value)
- **D-07:** Three endpoint pairs, each mirroring the Phase 83 DI-factory pattern in `vigil-core/src/routes/settings.ts`:
  - `GET/PUT /v1/settings/print-schedule` (existing — untouched)
  - `GET/PUT /v1/settings/generate-schedule` (new)
  - `GET/PUT /v1/settings/timezone` (new)
- **D-08:** Timezone validation on PUT — must parse via `Intl.DateTimeFormat(tz).resolvedOptions().timeZone` round-trip (or equivalent). Reject invalid IANA names with 400 `{ error: "invalid_timezone" }`.
- **D-09:** Generate-schedule PUT reuses the same 0-23 / 0-59 / boolean validators as print-schedule. 400 `{ error: "invalid_input" }` on violation.

### PWA Settings UI
- **D-10:** Two schedule cards on the existing settings screen, plus a timezone picker:
  - Card 1: **Auto-generate** — hour/minute/enabled, with subtitle "Server generates your brief daily at this time".
  - Card 2: **Auto-print** — hour/minute/enabled, with subtitle "Mac prints the latest brief at this time (macOS only)".
  - Timezone: dropdown or autocomplete (IANA names). PWA should prefill from `Intl.DateTimeFormat().resolvedOptions().timeZone` on first load if `user-timezone` is unset.
- **D-11:** Claude's discretion on card layout — reuse the existing PrintSchedule card component from Phase 83 if straightforward (extract into a reusable `ScheduleCard` taking label + endpoint), otherwise duplicate.

### Mac CLI pull-only mode
- **D-12:** The `DailyBrief` CLI invoked with no args becomes **pull-only**:
  1. Compute `today` as `YYYY-MM-DD` in local TZ.
  2. `GET /v1/brief/:today` with bearer auth.
  3. On 200: write PDF to `~/Documents/DailyBrief/daily_sheet_YYYY-MM-DD.pdf`, `lpr` it, log "DailyBrief complete", exit 0.
  4. On 404: log "No brief for today", exit **2** (new staleness code).
  5. On other error: log error, exit 1.
- **D-13:** No auto-generate fallback from the CLI. The server cron is the single source of truth for brief generation. If today's brief is missing, the user deals with it via PWA "Generate Now" or waits for tomorrow. This keeps the split clean and makes staleness observable.
- **D-14:** CoreGraphics rendering / `/v1/brief/generate` POST code path inside `DailyBrief` is **removed** in this phase (it was added in Phase 78 as a thin-client wrapper; it's now dead since the CLI no longer generates).
- **D-15:** Manual "Print Now" in the menubar calls the same pull-only flow (`StatusChecker.runNow()` runs the `DailyBrief` binary — no change to the Swift side except removing the generate code path). If 404, the menubar surfaces "No brief today".
- **D-16:** PWA "Generate Now" button is **unchanged** — still POSTs `/v1/brief/generate` for off-schedule generation. Not a Mac CLI concern.

### Menubar staleness signal
- **D-17:** `StatusChecker` reads `lastExitCode` after each CLI run. Exit code 2 is the staleness sentinel.
- **D-18:** Menubar header states (Claude's discretion on exact copy/icons, but roughly):
  - Success: `"Last: HH:MM [PASS] | Next: <time>"`
  - Staleness: `"No brief today ⚠ | Next: <time>"` (red or warning tint; next-run time still visible)
  - Print/other error: `"Print failed ⚠ | Next: <time>"`
- **D-19:** No retry loop. The CLI fires on schedule and that's it. If the user wants to retry, they click "Print Now".

### 7-day retention
- **D-20:** Retention sweep runs **inline in the generate cron**, immediately after a successful generate. Cutoff: `today_in_tz - 7 days`.
- **D-21:** Authoritative time column is `briefs.date` (not filesystem mtime). DELETE rows where `date < cutoff`, then `fs.unlink` any matching storage files. Both deletions are best-effort — errors logged, not thrown.
- **D-22:** No separate cleanup cron. No lazy on-read sweep. Generate cron is the sole purger.

### Doctor check
- **D-23:** Existing Check 6 (from Phase 83-04) is **extended**, not duplicated. It becomes: "Settings endpoints reachable — GET of print-schedule, generate-schedule, and timezone each returns 200 with `VIGIL_API_KEY`". A single PASS/FAIL; partial failures still mark allPass=false with a message naming which endpoint failed.

### Claude's Discretion
- Exact node-cron vs setInterval implementation (D-02) — either works; prefer whatever minimizes dependency surface.
- Dedupe window length in D-03 (suggested 10 minutes; pick what seems sane).
- Exact menubar copy/iconography for staleness vs error states (D-18).
- Whether to extract a shared `ScheduleCard` component or duplicate the Phase 83 one (D-11).
- Timezone dropdown data source — hardcoded list of common IANA names vs `Intl.supportedValuesOf('timeZone')`.
- How to wire the in-process scheduler to the existing Hono app startup (e.g. in `index.ts` after route registration, with graceful shutdown on SIGTERM for Fluid Compute / Railway restarts).
- Logging/observability for generate cron runs (success/fail/skipped-dedupe).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing settings plumbing (Phase 83)
- `vigil-core/src/routes/settings.ts` — `createSettingsRouter` DI factory pattern. New routes must mirror this exactly.
- `vigil-core/src/routes/settings.test.ts` — PS-01 through PS-06 test pattern. New endpoints need equivalent coverage.
- `vigil-core/src/db/schema.ts` — `appSettings` table (text PK + jsonb value + updated_at). No schema change needed.
- `vigil-core/drizzle/0009_add_app_settings.sql` — migration that created the table.

### Existing brief assembly + storage (Phase 76)
- `vigil-core/src/routes/brief.ts` — `POST /v1/brief/generate` (to be invoked internally by cron), `GET /v1/brief/:date` (Mac CLI pull target).
- `.planning/phases/76-brief-assembly-endpoint/76-CONTEXT.md` — D-05 (Railway filesystem storage), D-06 (date-based storage_key, one-per-day, overwrite semantics).
- `vigil-core/src/db/schema.ts` — `briefs` table (id, date, summary, pdfFilename/storage_key, …). Retention sweep targets this table.

### Mac CLI (Phase 78) + scheduler (Phase 83)
- `Sources/DailyBrief/DailyBrief.swift` — entry point, `doctor` command (Check 6 lives here, line ~607).
- `Sources/DailyBrief/Services/` — API client that currently POSTs `/v1/brief/generate`. Needs to be reduced to a GET-only flow.
- `Sources/DailyBriefMonitor/BriefScheduler.swift` — unchanged. `reschedule(hour:minute:enabled:)` already wires print-schedule from API on launch.
- `Sources/DailyBriefMonitor/StatusChecker.swift` — `runNow()` invokes `DailyBrief` binary, reads `lastExitCode`. Staleness signal rides on exit code 2.
- `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` — `.task` modifier on `MenuBarView` fetches print-schedule. No new fetch needed (server cron owns generate timing; Mac doesn't need to know it).

### PWA Settings
- `vigil-pwa/src/` — existing Phase 83-02 Print Schedule card. Look for `PrintScheduleCard` (or equivalent) to understand the pattern for the new Generate card.
- `vigil-pwa/src/api/client.ts` — API client with `getPrintSchedule`/`putPrintSchedule` methods. Add `getGenerateSchedule`, `putGenerateSchedule`, `getTimezone`, `putTimezone`.

### Prior phase decisions
- `.planning/phases/76-brief-assembly-endpoint/76-CONTEXT.md` — D-05, D-06 (storage), D-08 (no request body for generate).
- `.planning/phases/83-menu-bar-redesign/83-01-SUMMARY.md` — key-value app_settings pattern; DI factory pattern.
- `.planning/phases/83-menu-bar-redesign/83-04-SUMMARY.md` — Doctor Check 6 location and shape; existing `.task` fetch pattern.

### Requirements
- `.planning/ROADMAP.md` — Phase 86 success criteria SC-1 through SC-7 define acceptance.
- `.planning/REQUIREMENTS.md` — BRIEF-01..04 (existing, satisfied); this phase adds behavior on top.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **DI factory + tests** — `createSettingsRouter(deps?)` in `vigil-core/src/routes/settings.ts` is the template. New routes slot in identically.
- **Schema** — `appSettings` pgTable needs zero changes; new rows are just new keys.
- **Brief generation** — `POST /v1/brief/generate` internals can be invoked directly from the cron (import the service, don't self-HTTP).
- **Brief retrieval** — `GET /v1/brief/:date` already returns the stored PDF; Mac CLI targets it as-is.
- **Scheduler Swift side** — `BriefScheduler` + `.task` fetch + doctor Check 6 — all already in place. Phase 86 does not touch `BriefScheduler.swift`.

### Established Patterns
- Hono routes: factory → singleton → `app.route("/v1", …)` in `vigil-core/src/index.ts`.
- Drizzle `onConflictDoUpdate` for single-row key-value settings (see settings.ts).
- node-test + `tsx --test` for unit tests (project convention; NOT plain `node --test`).
- Graceful shutdown — vigil-core must handle SIGTERM cleanly (Railway). A new in-process scheduler needs to be clear()ed on shutdown.

### Integration Points
- Scheduler boot: `vigil-core/src/index.ts` after route registration, before `serve()`. Needs DB handle to read settings and invoke brief generation.
- PWA Settings screen: existing file(s) that render `PrintScheduleCard` — add Generate card and Timezone picker alongside.
- Mac CLI entry: `Sources/DailyBrief/DailyBrief.swift` — strip the generate path, keep HTTP fetch of `/v1/brief/:today` + lpr.

### Risks / Watchouts
- **DST transitions** — a minute-tick scheduler using `now_in_tz` should naturally handle spring-forward/fall-back without firing twice. Dedupe in D-03 is the belt-and-suspenders.
- **Railway cold start** — if service is asleep at 04:00, the tick is missed. See D-04.
- **Tight buffer** — default generate 04:00 → print 06:00 is 2 hours. If generation is slow (e.g. Claude affirmation timeout, calendar reauth), print may hit 404. Staleness behavior (D-17..D-19) is the intended response; this is acceptable for v3.0.
- **Multi-instance deploys** — Railway may run 1 instance (confirmed). If scale-out ever happens, two schedulers would double-fire. Not a Phase 86 concern but worth a comment in the scheduler file.

</code_context>

<specifics>
## Specific Ideas

- User explicitly wants the "No brief today" state surfaced in the menubar (not hidden / not auto-retried). Visibility over convenience.
- User wants the PWA "Generate Now" button to remain untouched — the split is about *scheduling*, not about removing manual control.
- User prefers extending existing Doctor Check 6 over adding granular checks, keeping the doctor output compact.

</specifics>

<deferred>
## Deferred Ideas

None surfaced during discussion. Known v3.1+ items adjacent to this phase (email delivery, auto-reauth Google Calendar on token failure) remain in REQUIREMENTS.md "Future Requirements".

</deferred>

---

*Phase: 86-split-brief-schedule*
*Context gathered: 2026-04-15*
