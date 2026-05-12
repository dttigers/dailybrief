# Phase 127: Pre-spike guardrails - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** `--auto` (autonomous discuss — all gray areas resolved with recommended defaults; user said "work without stopping for clarifying questions")

> **CORRECTIONS (2026-05-11, post-research):** Two decisions below are empirically wrong and the plans deliberately deviate from this CONTEXT — see 127-RESEARCH.md Pitfalls 1 + 2 for the live verification.
>
> - **D-04.2 is OBSOLETE.** The four "drift" columns (notes, last_change_at, last_change_summary, archived_at) ARE ALREADY migrated via `vigil-core/drizzle/0013_work_orders_drift_repair.sql` (shipped 2026-04-22). GUARD-04 is re-scoped from "write `0020_reconcile_work_orders_107_1.sql`" → "ship `migration-drift.test.ts` drift detector + STATE.md Phase 107.1 cleanup." Slot `0020` is now used by GUARD-03's `ai_usage_daily` migration.
> - **D-04.3 is OBSOLETE.** `drizzle-kit generate --dry` is not a real flag in `drizzle-kit@^0.31.10`. The actual verification: run plain `drizzle-kit generate` and grep stdout for `/No schema changes, nothing to migrate/i` (sentinel string verified live).
>
> Plans 05 + 07 implement the corrected scope. ROADMAP.md and Plan 07 frontmatter reflect it.

<domain>
## Phase Boundary

Lock three **structural** safety rails before any v3.9 feature code lands, plus reconcile the Phase 107.1 `work_orders` schema drift so the first v3.9 migration is clean.

The four guards are gates, not features. Phase 127 succeeds when:

1. **GUARD-01 — Audio-in-logs leakage prevention**: no PCM payload can reach any log sink (`console.*`, Sentry, PostHog), and a drift-detector test fails CI if a future call site re-introduces the pattern.
2. **GUARD-02 — Runaway audio session cap**: server hard-rejects >60s single G2 audio blob; G2 plugin has an always-fires `audioControl(false)` cleanup wrapper on every documented exit path.
3. **GUARD-03 — Cross-feature AI-cost ceiling**: per-user daily AI spend watermark blocks `ai_cache regenerate` + `/v1/chat` + voice transcription at a single chokepoint; PWA renders a friendly retry-tomorrow UX via the locked-enum `ERROR_CODE_MAP`.
4. **GUARD-04 — Schema reconciliation**: `drizzle-kit generate --dry` produces zero pending changes by writing the missing migration for the 4 `work_orders` columns that exist in `schema.ts` but were never migrated.

**Not in scope** — no feature code, no voice ingest endpoint logic, no G2-side voice gestures, no cache invalidation hook, no per-user budget overrides, no per-user TZ rollover, no voice_sessions table for chunked uploads. Every one of those belongs in a later v3.9 phase that will *use* these guardrails.

</domain>

<decisions>
## Implementation Decisions

### GUARD-01 — Audio PCM log redaction

- **D-01.1 Source-of-truth denylist** — Extend the existing exported `BLOCKED_PROPERTY_NAMES` Set in `vigil-core/src/analytics/posthog.ts:32` with audio-PCM property names: `audioPcm`, `audio_pcm`, `pcm`, `audio`, `audioBuffer`, `audio_buffer`. ONE set, shared by PostHog and Sentry. Reason: D-14 in posthog.ts:6-8 forbids direct singleton imports but explicitly permits Set export "for tests and to make the rule grep-visible" — the same exception applies to a sibling redactor.

- **D-01.2 Sentry `beforeSend` hook** — Add a `beforeSend(event)` callback to `Sentry.init({...})` in `vigil-core/src/lib/sentry.ts:81-87`. The callback imports `BLOCKED_PROPERTY_NAMES` from `../analytics/posthog` and recursively strips matching keys from `event.extra`, `event.contexts`, and `event.breadcrumbs[].data`. Mirrors the PostHog `before_send: redactEvent` pattern (posthog.ts:54-64, posthog.ts:77). Implementation is a small pure function `redactSentryEvent(event)` exported for unit testing, like its PostHog cousin.

- **D-01.3 `console.*` strategy — drift detector, not wrapper** — Do NOT wrap `console.*`. Vigil's prod path already routes through Sentry/PostHog and the existing structured logger; wrapping `console` would just add ceremony. Instead, ship a source-grep drift-detector test (D-01.4) that fails CI if any new call site introduces an `audio`/`pcm`-named local variable into a logger call.

- **D-01.4 Drift detector** — New test `vigil-core/src/__tests__/audio-log-redaction.test.ts` pins all three rails:
  1. Asserts `BLOCKED_PROPERTY_NAMES` contains exactly the six audio keys from D-01.1 (literal Set assertion — Phase 103 D-04 lock pattern).
  2. Asserts `Sentry.init` call in `sentry.ts` registers `beforeSend` (source-string `indexOf("beforeSend")` test, mirrors Phase 126 `mount-order.test.ts` pattern).
  3. Greps `vigil-core/src/{routes,lib,ai,middleware}/**/*.ts` (excluding test files + the denylist source-of-truth files) for the regex `/console\.(log|info|warn|error|debug)[^)]*(audio|pcm)/i` and fails on any match.

- **D-01.5 PWA-side audit** — `vigil-pwa/src` also has Sentry init (Phase 126 Plan 09). Apply the same `beforeSend` redactor there; the audio keys never legitimately appear in PWA telemetry, so the test there is just "BLOCKED_PROPERTY_NAMES of audio keys + `beforeSend` registered."

### GUARD-02 — Audio session runaway cap

- **D-02.1 Server hard cap, measured in decoded PCM bytes** — Compute `MAX_PCM_BYTES = 60s × 16_000 Hz × 2 bytes = 1_920_000` (the canonical Even SDK format is locked PCM 16 kHz × 16-bit LE × mono per `.planning/research/EVEN-SKILLS.md`). Equivalent base64 cap is `Math.ceil(1_920_000 × 4 / 3) ≈ 2_560_000` chars. Phase 127 ships the constant + a `assertAudioSessionWithinCap(b64)` helper in `vigil-core/src/lib/audio-cap.ts`. Phase 130's `/v1/voice/transcribe` route calls it first thing inside the handler. Mirrors the existing `MAX_AUDIO_B64_CHARS = 10 MB` pattern at `vigil-core/src/routes/process-audio.ts:58-62`.

- **D-02.2 No `voice_sessions` table** — Phase 127 does NOT add a server-side session-lifetime tracker. The locked Even SDK format is "one utterance = one POST" (32 KB/s × 60s = single sub-3 MB request), so the byte-size cap at ingress IS the session cap. A streaming/chunked design would need `voice_sessions(userId, sessionId, openedAt)`, but that's a Phase 130 decision contingent on VOICE-01 spike outcome (PASS vs DEGRADE). Note in deferred.

- **D-02.3 G2 plugin cleanup wrapper** — Ship `vigil-g2-plugin/src/lib/audio-session-guard.ts` (NEW). Exports `safeAudioControl(on: boolean)` which:
  1. Calls SDK `audioControl(on)`.
  2. On the first `true` call in a process lifetime, idempotently registers cleanup hooks that ALWAYS call `audioControl(false)`:
     - `osEvent.eventType === ABNORMAL_EXIT_EVENT` listener
     - `osEvent.eventType === SYSTEM_EXIT_EVENT` listener
     - `window.addEventListener("beforeunload", …)`
     - `setBackgroundState` callback (Even SDK Headless WebView replay path — see `.planning/research/EVEN-SKILLS.md` re: G2-LIFECYCLE-01..03)
  3. Cleanup callback is idempotent (sets `audioControl(false)` even if already off).

  Phase 130 VOICE-02..04 hooks `safeAudioControl` instead of the raw SDK. Phase 127 ships the module + a unit test asserting cleanup fires on all four exit events; voice route code lives in Phase 130.

- **D-02.4 New PWA error code (LOCKED-enum extension)** — Add `AUDIO_SESSION_TOO_LONG` to `vigil-pwa/src/lib/api-error-codes.ts:83` `ERROR_CODE_MAP`. UX copy: `"Recording is too long. Voice clips must be 60 seconds or less."` No CTA. Server returns HTTP 413 with `{error: "Audio session exceeds 60s cap", code: "AUDIO_SESSION_TOO_LONG"}`. Reason for 413 (not 400): mirrors the canonical "payload too large" semantics already used by Hono `bodyLimit` middleware.

### GUARD-03 — Per-user daily AI cost watermark

- **D-03.1 Storage** — New table `ai_usage_daily`:
  ```sql
  CREATE TABLE ai_usage_daily (
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    usage_date date NOT NULL,
    usd_estimate numeric(10,4) NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, usage_date)
  );
  CREATE INDEX idx_ai_usage_daily_date ON ai_usage_daily (usage_date);
  ```
  Composite PK `(user_id, usage_date)` is the W-01 cross-user-isolation pattern (Phase 121 lock). Daily rollover happens naturally by `usage_date` key — no cron, no nightly job. Reason for new table (not `app_settings` JSON): JSON-merge update would be a write hot-loop under voice ingest + chat traffic; row-level `INSERT … ON CONFLICT … DO UPDATE` is cheaper and atomic.

- **D-03.2 Cap default** — `0.50` USD per user per day. Env override: `VIGIL_DAILY_AI_BUDGET_USD` (default `0.50`). Phase 127 ships a single global default; per-user overrides deferred. Rationale: $0.50/day = $15/mo/user worst case — well under the $500/mo prod Anthropic cap (Phase 126) divided by realistic user count, and high enough that legitimate users (a few chats + insight regens) never hit it. Operator can raise per Railway env without redeploy.

- **D-03.3 Token → USD estimate at the AI client** — `vigil-core/src/ai/client.ts` is the single chokepoint for Anthropic SDK calls (`client.messages.create`, `client.beta.files.upload`). Wrap every call to: (a) record `inputTokens × INPUT_PRICE + outputTokens × OUTPUT_PRICE` from the response's `usage` field, (b) `INSERT … ON CONFLICT (user_id, usage_date) DO UPDATE SET usd_estimate = usd_estimate + EXCLUDED.usd_estimate` to accumulate. Price constants hard-coded:
  - Claude Sonnet 4: input $3 / 1M, output $15 / 1M
  - Audio (beta.files for `/v1/process-audio` + `/v1/voice/transcribe`): same input price (audio tokens billed as input per Anthropic's audio billing)

  Wrapper signature `withBudgetTracking(userId, fn)` so call sites stay clean. **Failure mode**: token-counting failures are non-fatal — log + skip accumulation rather than fail the user request (telemetry, not gating).

- **D-03.4 Enforcement chokepoint — pre-flight check helper** — New helper `requireAiBudget(userId): Promise<void>` in `vigil-core/src/lib/ai-budget.ts`:
  1. Read today's `ai_usage_daily.usd_estimate` for `userId` (`SELECT … WHERE user_id = $1 AND usage_date = CURRENT_DATE`).
  2. If `usd_estimate >= VIGIL_DAILY_AI_BUDGET_USD`, throw `DailyBudgetExceededError`.
  3. Else return. (No reservation/lock — burst over by ≤1 request is acceptable; it's a watermark, not a hard semaphore.)

  Called at the TOP of these route handlers (after `bearerAuth`, before any AI work):
  - `POST /v1/chat` — `vigil-core/src/routes/chat.ts`
  - `POST /v1/process-audio` — `vigil-core/src/routes/process-audio.ts`
  - `POST /v1/voice/transcribe` — added in Phase 130 (the route doesn't exist yet, but the helper is wired so 130 only adds the route)
  - `regenerateAiCache(userId, types)` helper — wherever it gets factored in Phase 131 INSIGHTS-FRESH-01 (today the ai_cache writes are scattered; 131 will consolidate). Phase 127's job is to land the helper, not the consolidation.

  The `app.onError` handler at `vigil-core/src/index.ts:252-260` catches `DailyBudgetExceededError` and returns HTTP 429 with `{error: "Daily AI budget exceeded", code: "DAILY_AI_BUDGET_EXCEEDED"}`.

- **D-03.5 PWA error code (LOCKED-enum extension)** — Add `DAILY_AI_BUDGET_EXCEEDED` to `ERROR_CODE_MAP` (api-error-codes.ts:83) as a Phase 127 extension key. UX copy: `"You've hit today's AI processing limit. Capture still works — AI features resume at midnight UTC."` No CTA. Test pins the key exists.

- **D-03.6 Reset semantics** — Daily rollover at UTC 00:00 (single global). Driven structurally by `usage_date = CURRENT_DATE` — no cron. Per-user-TZ rollover deferred. Rationale: capture (the user's core daily loop) is never blocked — only AI features are. A user crossing the cap at 11pm local sees AI back online by their morning regardless of TZ math.

- **D-03.7 Cross-user-isolation grep** — Add `ai_usage_daily` to `vigil-core/src/__tests__/cross-user-isolation.test.ts` (W-01 grep pattern, v3.6 precedent). Every query must filter `eq(table.userId, userId)`.

### GUARD-04 — Schema reconciliation (Phase 107.1 fix)

- **D-04.1 Path chosen: write the missing migration. NOT a `git revert`.** — Critical finding during scout: `vigil-core/src/routes/work-orders.ts` ACTIVELY reads/writes all four "drifted" columns at lines 108, 134, 140, 162, 165-167, 192, 195, 207, 231 (archive/unarchive/listing endpoints). Removing them from `schema.ts` would break production. The "drift" is one-way — `schema.ts:275-279` has them, `drizzle/` has no migration. This is a **missing migration**, not "stale schema additions."

- **D-04.2 Migration file** — `vigil-core/drizzle/0020_reconcile_work_orders_107_1.sql` (hand-crafted, NOT drizzle-kit auto-output — Phase 121 Plan 01 lock). Content:
  ```sql
  -- Phase 127 GUARD-04 — reconcile Phase 107.1 schema drift.
  -- These four columns have lived in src/db/schema.ts since 107.1 (2026-XX-XX)
  -- and are actively used by src/routes/work-orders.ts (archive/unarchive),
  -- but the migration was never written. Add with IF NOT EXISTS to survive
  -- Railway partial-fail-on-restart re-runs (Phase 125 Plan 02 pattern).
  ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
  ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS last_change_at timestamptz;
  ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS last_change_summary text;
  ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;
  ```
  Column types match `schema.ts:275-279` byte-for-byte.

- **D-04.3 Acceptance gate** — Phase 127 verification runs `pnpm drizzle-kit generate --dry` and asserts zero pending changes. This single check satisfies the success criterion verbatim. A second drift-detector test `vigil-core/src/__tests__/migration-drift.test.ts` shells `drizzle-kit generate --dry` and parses the output; CI fails if any pending changes appear.

- **D-04.4 Migration ordering note** — `0020` is the next sequential file (latest is `0019_add_users_quiet_mode.sql`). Migrations 0021+ (the actual v3.9 feature migrations — `ai_usage_daily` for GUARD-03, voice-related work for Phase 130) MUST land AFTER 0020. The plan-phase task graph must enforce this.

### Claude's Discretion

None remaining — every gray area got a concrete decision. Plan-phase has authority on:
- Test file layout (single test file per guard, or one combined `guardrails.test.ts`)
- Whether `ai_usage_daily` accumulator INSERT is fire-and-forget or awaited (defaulting to awaited; the row-write is fast, and a missed accumulation defeats the cap)
- Exact wording of error messages (the copy above is the recommended default; PWA can tune)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements
- `.planning/ROADMAP.md` §"Phase 127: Pre-spike guardrails" — goal + 4 success criteria
- `.planning/REQUIREMENTS.md` §"Phase 0 — Guardrails" — GUARD-01..04 verbatim
- `.planning/research/SUMMARY.md` — cross-feature cost amplification rationale (why GUARD-03 is a v3.9 prereq, not a v3.10 polish)
- `.planning/research/PITFALLS.md` §High-Severity Pitfall 7 — Phase 107.1 `work_orders` schema drift (GUARD-04 root cause)
- `.planning/research/PITFALLS.md` §Pitfalls 8/12/16 — voice cost amplification (GUARD-03 motivation)
- `.planning/research/ARCHITECTURE.md` §"Load-bearing invariants v3.9 work MUST preserve" — mount-order contract (bearerAuth at line 166), Drizzle hand-crafted SQL pattern, SSE bus singleton, `userId` always from `c.get("userId")`
- `.planning/research/EVEN-SKILLS.md` — canonical Even SDK format lock (PCM 16 kHz × 16-bit LE × mono = 32 KB/s) drives GUARD-02 byte math

### GUARD-01 — Audio log redaction
- `vigil-core/src/analytics/posthog.ts:32` — `BLOCKED_PROPERTY_NAMES` source-of-truth Set (extend, don't duplicate)
- `vigil-core/src/analytics/posthog.ts:54-77` — `redactEvent` + `before_send` registration pattern (mirror for Sentry)
- `vigil-core/src/lib/sentry.ts:78-89` — current `initSentry` body (add `beforeSend` here; R12 awareness already documented at lines 31-41)
- `vigil-core/src/__tests__/mount-order.test.ts` (referenced from sentry.ts:14) — drift-detector test pattern to reuse
- `vigil-core/src/analytics/posthog.test.ts:91-117` — `BLOCKED_PROPERTY_NAMES` denylist literal test pattern

### GUARD-02 — Audio session cap
- `vigil-core/src/routes/process-audio.ts:58-62` — existing `MAX_AUDIO_B64_CHARS` size-guard pattern to mirror
- `.planning/research/EVEN-SKILLS.md` — PCM byte math + `audioControl` API surface
- `vigil-g2-plugin/src/screens/companion.ts` — current G2 plugin screen (the cleanup wrapper lives in `vigil-g2-plugin/src/lib/` so screens import it; no companion.ts changes in Phase 127)

### GUARD-03 — AI cost watermark
- `vigil-pwa/src/lib/api-error-codes.ts:83` — `ERROR_CODE_MAP` (extend with `DAILY_AI_BUDGET_EXCEEDED` + `AUDIO_SESSION_TOO_LONG`); D-04 additivity contract
- `vigil-pwa/src/lib/api-error-codes.test.ts:61-78` — `AUTH-126-CODE-MAP-LOCKED-ENUM` test pattern (Phase 127 extension keys get analogous pin tests)
- `vigil-core/src/ai/client.ts` — Anthropic SDK call chokepoint (wrap with `withBudgetTracking`)
- `vigil-core/src/index.ts:252-260` — `app.onError` handler (translate `DailyBudgetExceededError` → 429 + code)
- `vigil-core/src/middleware/require-verified-email.ts:56,186` — `ERROR_CODE_MAP` integration precedent
- `vigil-core/src/__tests__/cross-user-isolation.test.ts` (W-01/W-02 grep) — add `ai_usage_daily` row to the grep allowlist

### GUARD-04 — Schema reconcile
- `vigil-core/src/db/schema.ts:262-282` — `workOrders` table with the 4 drift columns (lines 275-279)
- `vigil-core/src/routes/work-orders.ts:108-231` — proof that the drift columns are LIVE in prod (rules out `git revert`)
- `vigil-core/drizzle/0019_add_users_quiet_mode.sql` — most recent migration; 0020 is next
- `vigil-core/drizzle/0013_work_orders_drift_repair.sql` — prior `work_orders` drift-repair precedent (file name pattern, hand-crafted SQL)
- `vigil-core/drizzle.config.ts` — drizzle-kit config; the `generate --dry` verification gate runs against it

### Cross-cutting
- `.planning/PROJECT.md` §"Current Milestone: v3.9 Voice & Companion Polish" — milestone scope, ServiceNow note, deferred items
- `.planning/STATE.md` — v3.9 phase sequence (127 → 127.5 → 128a/b → 129 → 130 → …)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`BLOCKED_PROPERTY_NAMES` Set** (`vigil-core/src/analytics/posthog.ts:32`) — already exported, already locked-enum-tested (`posthog.test.ts:91-117`). GUARD-01 extends it with 6 audio keys and adds a sibling test asserting the audio keys are present. Sentry imports the Set; no duplicate denylist.

- **`redactEvent` pattern** (`posthog.ts:54-64`) — pure function registered as PostHog `before_send`. GUARD-01 ships an analogous `redactSentryEvent(event)` in `sentry.ts` registered as Sentry `beforeSend`. Same shape, recursive over `event.extra` + `event.contexts` instead of flat properties.

- **`MAX_AUDIO_B64_CHARS` size-guard** (`process-audio.ts:58-62`) — exact pattern GUARD-02 mirrors for the 60s PCM cap. Different constant (~2.56 MB vs 10 MB) but identical control flow.

- **`ERROR_CODE_MAP` extension-additivity** (`api-error-codes.ts:73-138`, lines 119-137 are the EXTENSION block) — Phase 126 D-04 grants authority to ADD codes. GUARD-02 adds `AUDIO_SESSION_TOO_LONG`; GUARD-03 adds `DAILY_AI_BUDGET_EXCEEDED`. Both go in the EXTENSION block, not the LOCKED block.

- **`app.onError` handler** (`vigil-core/src/index.ts:252-260`) — already exists from Phase 126; calls `captureToSentry` + `captureException`. GUARD-03 adds a `DailyBudgetExceededError` branch that returns 429 with the locked code BEFORE the generic Sentry sink (don't sink a deliberate 429 as an error).

- **Drizzle migration idiom** — hand-crafted SQL with `IF NOT EXISTS` (Phase 121 Plan 01 + Phase 125 Plan 02 locks). GUARD-04's `0020_reconcile_work_orders_107_1.sql` follows verbatim.

- **W-01 cross-user-isolation grep test** (`cross-user-isolation.test.ts`) — Phase 121 D-D2 / Phase 125 T-125-01/02 carryforward. GUARD-03's new `ai_usage_daily` table gets added to the grep allowlist; every query must include `eq(aiUsageDaily.userId, userId)`.

### Established Patterns

- **Single source of truth for denylists** — `BLOCKED_PROPERTY_NAMES` is shared; do NOT fork a Sentry-specific list. Drift detector pins the audio keys are present.

- **Mount-order contract** — `app.use("/v1/*", bearerAuth)` at index.ts:166 must precede every protected route mount. GUARD-03's `requireAiBudget(userId)` is called INSIDE the handler (it needs `c.get("userId")`), not as middleware — sidesteps mount-order entirely.

- **Source-grep drift detectors** (`mount-order.test.ts` pattern) — Phase 127 ships three of these:
  - `audio-log-redaction.test.ts` — GUARD-01
  - `migration-drift.test.ts` — GUARD-04
  - (Existing test patterns cover GUARD-02 + GUARD-03 via behavioral assertions)

- **Locked-enum extension** — `ERROR_CODE_MAP` extension block grows; LOCKED 9 keys never change (api-error-codes.ts:84-117). New keys land in the EXTENSION block (line 119+).

- **Hand-crafted Drizzle SQL** — `drizzle-kit generate` is NEVER committed verbatim (Phase 121 Plan 01 finding); hand-crafted `0020_*.sql` with `IF NOT EXISTS`.

### Integration Points

- **GUARD-01 → Sentry init** — `vigil-core/src/lib/sentry.ts:81-87` (`Sentry.init` body) gains a `beforeSend` field. Same change in `vigil-pwa` Sentry init (Phase 126 Plan 09 — needs symmetric scout in plan-phase).

- **GUARD-02 → `vigil-g2-plugin/src/lib/audio-session-guard.ts`** (NEW) — module is created in Phase 127 but has zero callers until Phase 130 VOICE-02 wires it. Phase 127's unit test proves the cleanup hooks fire on all four documented exit events; Phase 130 inherits the guarantee.

- **GUARD-03 → AI client** — `vigil-core/src/ai/client.ts` is the SINGLE chokepoint for Anthropic SDK calls. Every Anthropic invocation goes through `withBudgetTracking(userId, () => client.messages.create(…))`. Route handlers gate with `requireAiBudget(userId)` BEFORE invoking the helper.

- **GUARD-03 → `app.onError`** — `vigil-core/src/index.ts:252-260` translates `DailyBudgetExceededError` to HTTP 429 with `{code: "DAILY_AI_BUDGET_EXCEEDED"}`.

- **GUARD-04 → next migration** — `0020_reconcile_work_orders_107_1.sql` lands BEFORE any other v3.9 migration. GUARD-03's `ai_usage_daily` is `0021`.

### Surprises / Risks Found During Scout

- **`work_orders.case_number` is PK alone, not `(user_id, case_number)`** (`schema.ts:263`). This violates the W-01 cross-user-isolation pattern for multi-user. Same-case-number across users would collide. Pre-existing, NOT Phase 127's fix — but flag for a future schema-hardening phase. Phase 127 reconciles columns only, not PK shape.

- **No structured logger module exists today** — all PII-sensitive logging routes through Sentry/PostHog. GUARD-01's "no `console.*` wrapper" decision is consistent with the codebase; the drift detector is the actual safety mechanism for stray `console.log(audio…)` calls.

- **`vigil-pwa` also needs the audio-key denylist** (Phase 126 added PWA-side Sentry). Plan-phase should split GUARD-01 into core + pwa subtasks so the symmetric `beforeSend` isn't forgotten.

</code_context>

<specifics>
## Specific Ideas

- **Phase 0 audit (locked 2026-05-11)** — operator decided 30-min code review of `companion.ts` + `main.ts` event handlers precedes G2-ACTION + G2-REPLY scope locks. That audit is **Phase 127.5**, NOT Phase 127. Phase 127 stays purely structural/server-side + a single G2 plugin module file (the cleanup wrapper); no event-handler audit work.

- **Anthropic spend cap precedent** — Phase 126 set workspace-level $500/mo prod / $20/mo dev caps at the Anthropic console (RUNBOOK.md:214). GUARD-03 layers a per-user-daily cap INSIDE Vigil so a single user can't burn the whole monthly cap on chat + voice in one day. The two caps stack: workspace cap is the absolute backstop; per-user-daily is the fair-use guardrail.

- **Voice cost amplification math** — Anthropic audio billing per `.planning/research/PITFALLS.md` §12: a 60s clip at the Anthropic audio rate adds up; combined with INSIGHTS-FRESH auto-regen + chat context expansion, a single chatty user could burn $5+/day without a watermark. $0.50/day cap leaves headroom for ~6-8 insight regens + 10-20 chat turns + 30-40 voice clips before tripping.

</specifics>

<deferred>
## Deferred Ideas

- **Per-user-overridable AI budget caps** — today, `VIGIL_DAILY_AI_BUDGET_USD` is a single global env. Per-user overrides (e.g., a `users.daily_ai_budget_usd` column) deferred. Roadmap candidate when paid tiers exist.

- **Per-user-timezone budget rollover** — today, UTC 00:00 global. Per-user TZ rollover deferred (would need `users.timezone` column wired into the date-key query). Cosmetic for v3.9.

- **Server-side `voice_sessions` table** for streaming/chunked uploads — only needed if VOICE-01 spike (Phase 128a) returns DEGRADE with a chunked path. Phase 130 territory.

- **SSE fan-out of budget-exceeded events** — would let the PWA pre-emptively grey out AI buttons before the next request fails. Optional polish; out of scope for Phase 127.

- **`work_orders.case_number` PK widening to `(user_id, case_number)`** — pre-existing cross-user-isolation gap surfaced during scout. NOT introduced by Phase 127, NOT fixed by Phase 127. Future schema-hardening phase.

- **Structured logger module** — would replace ad-hoc `console.*` usage. Today's drift-detector grep covers the audio-key risk; a real logger is a v3.10+ ergonomics improvement.

- **Audit-trail of budget-exceeded events** — log each 429 to PostHog (event name only, no `userId` body content) so operator can see which users hit the cap. Easy to add; deferred for one-step-at-a-time discipline.

</deferred>

---

*Phase: 127-pre-spike-guardrails*
*Context gathered: 2026-05-11*
*Mode: --auto (autonomous discuss; user authorized "work without stopping for clarifying questions")*
