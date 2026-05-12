# Phase 127: Pre-spike guardrails - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-11
**Phase:** 127-pre-spike-guardrails
**Areas discussed:** GUARD-01 audio redaction, GUARD-02 audio session cap, GUARD-03 AI cost watermark, GUARD-04 schema reconciliation
**Mode:** `--auto` (user authorized "work without stopping for clarifying questions"; Claude auto-selected recommended option for every gray area)

---

## GUARD-01 — Audio PCM log redaction

| Option | Description | Selected |
|--------|-------------|----------|
| Extend `BLOCKED_PROPERTY_NAMES` denylist + add Sentry `beforeSend` hook + source-grep drift detector | Single source-of-truth Set in `posthog.ts:32`; Sentry imports it; CI greps `console.*(audio\|pcm)` patterns | ✓ |
| Wrap `console.*` globally with a redacting proxy | Catches everything but adds runtime ceremony to all log paths | |
| New structured logger module replacing `console.*` | Cleanest long-term, but huge scope; v3.10 ergonomics work | |

**Auto-selection rationale:** Reuses Phase 103's `BLOCKED_PROPERTY_NAMES` + Phase 126's Sentry init seam — minimal new surface area, maximum drift protection. Console wrap was rejected because Vigil's PII path already routes through Sentry/PostHog; a wrap adds zero new protection. Structured-logger swap is out of scope.

**Notes:**
- Audio property names added: `audioPcm`, `audio_pcm`, `pcm`, `audio`, `audioBuffer`, `audio_buffer`.
- Sentry side currently has NO `beforeSend` (sentry.ts:81-87 only sets `dsn`/`environment`/`tracesSampleRate`); this is the gap GUARD-01 plugs.
- PWA Sentry init (Phase 126 Plan 09) needs the same symmetric `beforeSend` — split into core + pwa subtasks during plan-phase.

---

## GUARD-02 — Audio session runaway cap

| Option | Description | Selected |
|--------|-------------|----------|
| Byte-size cap at `/v1/voice/transcribe` ingress + G2 plugin `safeAudioControl` wrapper | Reject `> 1_920_000` decoded PCM bytes (60s × 16 kHz × 2 B); cleanup wrapper fires `audioControl(false)` on ABNORMAL_EXIT/SYSTEM_EXIT/beforeunload/setBackgroundState | ✓ |
| Server-side `voice_sessions` table tracking openedAt + wall-clock 60s window | Necessary for streaming/chunked uploads; overkill for the locked single-blob format | |
| Client-side timer-only enforcement | Trusts the client; server has no backstop if plugin is compromised | |

**Auto-selection rationale:** The Even SDK format is locked at PCM 16 kHz × 16-bit LE × mono per `.planning/research/EVEN-SKILLS.md`, which makes ONE utterance = ONE POST. Bytes math equals the time math. The byte cap IS the session cap. `voice_sessions` table is deferred to Phase 130 if VOICE-01 spike returns DEGRADE with a chunked path.

**Notes:**
- New module `vigil-g2-plugin/src/lib/audio-session-guard.ts` lands in Phase 127 with zero callers; Phase 130 VOICE-02 hooks it.
- Server return code: HTTP 413 (Payload Too Large) + `code: "AUDIO_SESSION_TOO_LONG"`. PWA `ERROR_CODE_MAP` extension key added.

---

## GUARD-03 — Per-user daily AI cost watermark

| Option | Description | Selected |
|--------|-------------|----------|
| New `ai_usage_daily` table (composite PK `user_id + usage_date`) + `withBudgetTracking` wrap at `ai/client.ts` + `requireAiBudget(userId)` pre-flight | Atomic row-write; single AI chokepoint; pre-flight at each AI route; HTTP 429 + locked-enum code | ✓ |
| JSON blob in `app_settings` keyed by user | Re-uses existing table; JSON-merge write hot-loop under voice + chat traffic | |
| Per-request middleware (no separate table; deny based on rolling token window in memory) | Lost on restart; doesn't survive multi-instance Railway scaling | |
| Workspace-level Anthropic cap only (no per-user) | Already exists at $500/mo; one chatty user can still burn the whole monthly budget in a day | |

**Auto-selection rationale:** Table + chokepoint wrapper is the smallest correct design. Row-level `INSERT … ON CONFLICT DO UPDATE` is atomic and cheap. Workspace cap stacks below as the absolute backstop.

**Notes:**
- Default cap: `$0.50/user/day` via `VIGIL_DAILY_AI_BUDGET_USD` env (operator-tunable without redeploy).
- Token-cost telemetry failures are non-fatal (log + skip accumulation; never fail user request).
- Reset semantics: UTC 00:00 global, driven by `usage_date = CURRENT_DATE` (no cron).
- New PWA `ERROR_CODE_MAP` extension key: `DAILY_AI_BUDGET_EXCEEDED` ("You've hit today's AI processing limit. Capture still works — AI features resume at midnight UTC.").
- `app.onError` at `vigil-core/src/index.ts:252-260` translates `DailyBudgetExceededError` → 429 + code.
- W-01 grep test gets `ai_usage_daily` row added.

---

## GUARD-04 — Schema reconciliation (Phase 107.1 fix)

| Option | Description | Selected |
|--------|-------------|----------|
| Write missing migration `0020_reconcile_work_orders_107_1.sql` adding the 4 drift columns to prod | The 4 columns are ACTIVELY read/written in `vigil-core/src/routes/work-orders.ts:108-231`; revert would break archive/unarchive in production | ✓ |
| `git revert` the schema.ts additions and remove the column references from routes | Would break shipped archive/unarchive features; user-visible regression | |
| Drop the columns in prod via migration AND remove from code | Even more destructive; same regression | |

**Auto-selection rationale:** Scout finding made this unambiguous — the "drift" is one-way (schema.ts has them, drizzle/ doesn't), and the code uses them. Path is forced: write the missing migration.

**Notes:**
- Migration is hand-crafted SQL with `IF NOT EXISTS` guards (Phase 121 Plan 01 + Phase 125 Plan 02 locks).
- Column types match `schema.ts:275-279` byte-for-byte: `text NOT NULL DEFAULT ''` for `notes`, `timestamptz` for `last_change_at` / `archived_at`, `text` for `last_change_summary`.
- Verification: `pnpm drizzle-kit generate --dry` produces zero pending changes (the Phase 127 success criterion verbatim).
- A second drift-detector test (`migration-drift.test.ts`) shells the same command in CI.
- All v3.9 feature migrations (including GUARD-03's `ai_usage_daily` at `0021`) MUST land AFTER `0020`.

---

## Claude's Discretion

Plan-phase has authority on:
- Test-file layout — one file per guard vs single `guardrails.test.ts` (lean toward one-per-guard for grep-ability).
- `withBudgetTracking` INSERT — awaited vs fire-and-forget (recommended: awaited; the row-write is fast and a missed accumulation defeats the cap).
- Exact wording of PWA error-copy strings (the recommended defaults are in CONTEXT.md decisions; PWA team can tune voice/tone).

## Deferred Ideas

- Per-user-overridable AI budget caps (today: single global env)
- Per-user-TZ budget rollover (today: UTC 00:00 global)
- Server-side `voice_sessions` table for chunked uploads (Phase 130 if 128a spike returns DEGRADE)
- SSE fan-out of budget-exceeded events for pre-emptive PWA UX greying
- `work_orders.case_number` PK widening to `(user_id, case_number)` — pre-existing cross-user-isolation gap surfaced during scout
- Structured logger module replacing `console.*` ad-hoc usage
- PostHog audit-trail event on each 429-budget-exceeded (event-name only, no body)
