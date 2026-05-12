# Phase 127: Pre-spike guardrails - Research

**Researched:** 2026-05-11
**Domain:** Cross-cutting structural safety rails — log redaction, audio session caps, AI cost watermarking, schema reconciliation
**Confidence:** HIGH (all decisions verified against source files at the line numbers cited in CONTEXT.md; external APIs verified against current vendor docs)

## Summary

Phase 127 lands four structural guardrails before any v3.9 feature code touches the codebase. CONTEXT.md is unusually decision-rich — every gray area got resolved during `--auto` discuss. The research below VERIFIES those decisions against the codebase and external APIs, and surfaces gotchas that would derail the plan if not caught at planning time.

**Three confirming findings:**
1. Sentry `beforeSend(event, hint) => event | null` signature is correct (Sentry v10 `@sentry/node@10.52.0` and `@sentry/react@10.52.0` confirmed in `package.json`).
2. Anthropic SDK `messages.create()` response carries `usage.input_tokens` + `usage.output_tokens` as integers — CONTEXT D-03.3 token-counting math will work as designed.
3. The four documented G2 audio-cleanup exit events (`ABNORMAL_EXIT_EVENT`, `SYSTEM_EXIT_EVENT`, `beforeunload`, `setBackgroundState`) all exist verbatim in `.planning/research/EVEN-SKILLS.md`.

**Two corrective findings that the planner MUST address (full detail in Risks/Landmines):**

1. **`drizzle-kit generate --dry` IS NOT A SUPPORTED FLAG.** Verified live against the project's pinned `drizzle-kit@^0.31.10`: `npx drizzle-kit generate --help` enumerates only `--config / --dialect / --driver / --casing / --schema / --out / --name / --breakpoints / --custom / --prefix`. No `--dry` / `--dry-run`. The feature is an open enhancement request (GH issue #5059, opened Nov 2025, no PR, no timeline). CONTEXT D-04.3 + REQUIREMENTS GUARD-04 + ROADMAP §"Phase 127 Success Criterion #4" all reference this nonexistent flag verbatim. **The plan needs a real verification mechanism** — see GUARD-04 Technical Approach below.

2. **The Phase 107.1 work_orders drift IS ALREADY MIGRATED.** All four "drift" columns (`notes`, `last_change_at`, `last_change_summary`, `archived_at`) exist verbatim in `vigil-core/drizzle/0013_work_orders_drift_repair.sql:6-12` (already shipped — file is from the 107.1/107.2/107.3 insert that closed v3.5). The latest snapshot `vigil-core/drizzle/meta/0019_snapshot.json:1707-1738` records all four columns present, and running `npx drizzle-kit generate` against current HEAD reports verbatim **"No schema changes, nothing to migrate 😴"**. STATE.md:389 still calls the drift "carried" because the docs blocker-tracking was never updated when 0013 shipped. **GUARD-04's success criterion is already structurally satisfied** — the plan should formalize that with a verification test, not write a new migration.

**Primary recommendation:** Land GUARD-01/02/03 as designed in CONTEXT.md. Re-scope GUARD-04 from "write `0020_reconcile_work_orders_107_1.sql`" → "ship a drift-detector test that runs `drizzle-kit generate` (no `--dry` flag), parses stdout for the literal `No schema changes, nothing to migrate` sentinel, fails CI if absent, and document that the 107.1 carry-over was already resolved by `0013`. Update STATE.md:389 to reflect."

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**GUARD-01 — Audio PCM log redaction**
- D-01.1 — Extend `BLOCKED_PROPERTY_NAMES` Set in `vigil-core/src/analytics/posthog.ts:32` with `audioPcm`, `audio_pcm`, `pcm`, `audio`, `audioBuffer`, `audio_buffer`. ONE set, shared by PostHog and Sentry.
- D-01.2 — Add a `beforeSend(event)` hook to `Sentry.init({...})` in `vigil-core/src/lib/sentry.ts:81-87`. Import `BLOCKED_PROPERTY_NAMES` from `../analytics/posthog`. Recursively strip matching keys from `event.extra`, `event.contexts`, and `event.breadcrumbs[].data`. Pure function `redactSentryEvent(event)` exported for unit testing.
- D-01.3 — Do NOT wrap `console.*`. Use a source-grep drift detector instead.
- D-01.4 — New test `vigil-core/src/__tests__/audio-log-redaction.test.ts` pins (1) the six audio keys are in `BLOCKED_PROPERTY_NAMES` (literal Set assertion), (2) `Sentry.init` registers `beforeSend` (`indexOf("beforeSend")` source-string test), (3) source-grep `vigil-core/src/{routes,lib,ai,middleware}/**/*.ts` (excluding tests + denylist source) for `/console\.(log|info|warn|error|debug)[^)]*(audio|pcm)/i`.
- D-01.5 — Apply same `beforeSend` redactor in `vigil-pwa` Sentry init.

**GUARD-02 — Audio session runaway cap**
- D-02.1 — `MAX_PCM_BYTES = 60s × 16_000 Hz × 2 bytes = 1_920_000`. Base64 cap ≈ `2_560_000` chars. Ship constant + `assertAudioSessionWithinCap(b64)` in `vigil-core/src/lib/audio-cap.ts`. Phase 130's `/v1/voice/transcribe` calls it first.
- D-02.2 — NO `voice_sessions` table in Phase 127.
- D-02.3 — Ship `vigil-g2-plugin/src/lib/audio-session-guard.ts` (NEW). Exports `safeAudioControl(on: boolean)`. On first `true` call per process lifetime, idempotently registers cleanup hooks on all four exit events: `ABNORMAL_EXIT_EVENT`, `SYSTEM_EXIT_EVENT`, `window.addEventListener("beforeunload", …)`, and `setBackgroundState` callback.
- D-02.4 — Add `AUDIO_SESSION_TOO_LONG` to `ERROR_CODE_MAP` (api-error-codes.ts:119 EXTENSION block). Copy: `"Recording is too long. Voice clips must be 60 seconds or less."` HTTP 413.

**GUARD-03 — Per-user daily AI cost watermark**
- D-03.1 — New table `ai_usage_daily(user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, usage_date date NOT NULL, usd_estimate numeric(10,4) NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, usage_date))` + `idx_ai_usage_daily_date`. Composite PK is the W-01 pattern.
- D-03.2 — `VIGIL_DAILY_AI_BUDGET_USD` default `0.50` USD/user/day. Single global env override.
- D-03.3 — Wrap every Anthropic SDK call in `vigil-core/src/ai/client.ts` with `withBudgetTracking(userId, fn)`. Read `response.usage.input_tokens` + `output_tokens`. Hard-code Claude Sonnet 4 prices: input $3/1M, output $15/1M. Token-counting failures are non-fatal (telemetry, not gating).
- D-03.4 — `requireAiBudget(userId)` helper in `vigil-core/src/lib/ai-budget.ts`. Called at TOP of `/v1/chat`, `/v1/process-audio` handlers (after `bearerAuth`, before any AI work). NOT middleware — it reads `c.get("userId")`. Throws `DailyBudgetExceededError` if today's row ≥ cap.
- D-03.5 — Add `DAILY_AI_BUDGET_EXCEEDED` to `ERROR_CODE_MAP` EXTENSION block. HTTP 429. Copy: `"You've hit today's AI processing limit. Capture still works — AI features resume at midnight UTC."`
- D-03.6 — UTC 00:00 rollover, driven by `usage_date = CURRENT_DATE`. No cron.
- D-03.7 — Add `ai_usage_daily` to `vigil-core/src/__tests__/cross-user-isolation.test.ts` grep allowlist.

**GUARD-04 — Schema reconciliation (Phase 107.1 fix)**
- D-04.1 — Write the missing migration; NOT a `git revert`. `vigil-core/src/routes/work-orders.ts` actively reads/writes the four columns.
- D-04.2 — `vigil-core/drizzle/0020_reconcile_work_orders_107_1.sql` hand-crafted with `ADD COLUMN IF NOT EXISTS`. Column types match `schema.ts:275-279`.
- D-04.3 — Verification: `pnpm drizzle-kit generate --dry` produces zero pending changes. Second drift-detector test `vigil-core/src/__tests__/migration-drift.test.ts` shells the command and parses output.
- D-04.4 — `0020` is next sequential; v3.9 feature migrations (e.g., `ai_usage_daily`) land at `0021+`.

### Claude's Discretion

Per CONTEXT.md: "None remaining — every gray area got a concrete decision. Plan-phase has authority on:"
- Test file layout (single test file per guard vs combined `guardrails.test.ts`).
- Whether `ai_usage_daily` accumulator INSERT is fire-and-forget or awaited (default: awaited).
- Exact wording of error messages (CONTEXT copy is the recommended default).

### Deferred Ideas (OUT OF SCOPE)

- Per-user-overridable AI budget caps (`users.daily_ai_budget_usd` column) — future paid-tier work.
- Per-user-timezone budget rollover — Phase 127 ships UTC global.
- Server-side `voice_sessions` table for chunked uploads — Phase 130 territory, contingent on VOICE-01 verdict.
- SSE fan-out of budget-exceeded events — optional polish.
- `work_orders.case_number` PK widening to `(user_id, case_number)` — pre-existing gap, future schema-hardening phase.
- Structured logger module — v3.10+ ergonomics.
- Audit-trail PostHog event on each 429 — deferred for one-step-at-a-time discipline.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (from REQUIREMENTS.md:16-19) | Research Support |
|----|------------------------------------------|------------------|
| GUARD-01 | Audio PCM data is redacted at every logging boundary — `console.*`, Sentry (`beforeSend`), PostHog (`BLOCKED_PROPERTY_NAMES`) — with a drift-detector test pinning the patterns. | `BLOCKED_PROPERTY_NAMES` already exported at posthog.ts:32 (8 keys); extension is additive. Sentry v10 `beforeSend(event, hint) => event \| null` signature confirmed. `redactEvent` precedent at posthog.ts:54-64 to mirror. Drift-detector pattern proven at `mount-order.test.ts`. |
| GUARD-02 | Server-side hard cap on single G2 audio session (≤60s); idempotent unconditional `audioControl(false)` on every plugin exit path (`ABNORMAL_EXIT_EVENT`, `SYSTEM_EXIT_EVENT`, `beforeunload`). | Even SDK PCM format locked at 16 kHz × 16-bit × mono = 32 KB/s (EVEN-SKILLS.md:116-118). All four exit events documented in EVEN-SKILLS.md:46-66 (`OsEventTypeList.ABNORMAL_EXIT_EVENT=6`, `SYSTEM_EXIT_EVENT=7`) and §"Background state" (`setBackgroundState`). `MAX_AUDIO_B64_CHARS` precedent at `process-audio.ts:58-62`. |
| GUARD-03 | Per-user daily AI-cost watermark with locked-enum `DAILY_AI_BUDGET_EXCEEDED` (extends Phase 126 `ERROR_CODE_MAP`); blocks ai_cache regenerate + chat + voice transcription when exceeded. | Anthropic SDK `response.usage.input_tokens / output_tokens` shape verified (vendor docs). Single chokepoint at `vigil-core/src/ai/client.ts` (only `getAIClient()` + 3 wrappers — clean wrap target). `app.onError` chokepoint at `index.ts:265-280`. `ERROR_CODE_MAP` EXTENSION block at `api-error-codes.ts:119`. W-01 composite PK precedent at `schema.ts:255` (work_order_statuses). |
| GUARD-04 | Schema reconciliation — `drizzle-kit generate --dry` is clean before any v3.9 migration; Phase 107.1 stale `work_orders` columns either land via migration or are removed from `schema.ts`. | **Already satisfied structurally** — see "Two corrective findings" in Summary. The four columns are in `0013_work_orders_drift_repair.sql` and `meta/0019_snapshot.json`. `drizzle-kit generate` against current HEAD prints `No schema changes, nothing to migrate 😴` (verified live). The `--dry` flag does not exist in drizzle-kit. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

No `CLAUDE.md` exists at the repo root. Project conventions are sourced from `.planning/research/ARCHITECTURE.md` "Load-bearing invariants" (lines 54-61) and CONTEXT.md canonical_refs.

The cross-cutting structural rules below are derived from those sources and from existing source files; the planner must honor them:

1. **`bearerAuth` dispatcher mounts at `vigil-core/src/index.ts:166`** — every protected route mount must come AFTER. New helpers that read `c.get("userId")` go INSIDE handlers, not as middleware (this is exactly the GUARD-03 `requireAiBudget` shape).
2. **`userId` is ALWAYS `c.get("userId")`, NEVER from body/query.** Every new query: `eq(table.userId, userId)` in WHERE; every insert: `.userId = userId`.
3. **Drizzle migrations are hand-crafted SQL with `ADD COLUMN IF NOT EXISTS`** for Railway partial-fail-on-restart safety. Sequential numeric prefix. `drizzle-kit generate` output is NEVER committed verbatim.
4. **Test files use `node:test` + `node:assert/strict` for vigil-core** (mount-order.test.ts, sentry.test.ts, posthog.test.ts). PWA uses Vitest (api-error-codes.test.ts).
5. **`BLOCKED_PROPERTY_NAMES` is the single source of truth for log denylists** — both PostHog and Sentry import it. Do not fork.
6. **`ERROR_CODE_MAP` LOCKED block (api-error-codes.ts:84-117) is frozen forever** — new codes go in EXTENSION block (lines 119+) per Phase 126 D-04 lock.
7. **No `console.*` wrapper, no structured-logger module** — drift-detector grep is the safety mechanism for stray `console.log(audio…)` calls.
8. **Anthropic SDK calls flow through `vigil-core/src/ai/client.ts`** — three exported wrappers (`callClaude`, `callClaudeConversation`, `callClaudeMultimodal`) plus the `getAIClient()` accessor. `process-audio.ts` uses `getAIClient()!` directly for `ai.beta.files.upload` + `ai.beta.messages.create` (verified at `process-audio.ts:82-115`); the wrapper must cover this path too.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| GUARD-01 PostHog denylist | API / Backend (`vigil-core/src/analytics/posthog.ts`) | Browser / PWA (`vigil-pwa/src/analytics/posthog.ts`) | The Set is exported from the backend file (D-14 explicit allowance: "Exported for tests and to make the rule grep-visible"). PWA Sentry init imports a copy or re-asserts the same list via test parity. Phase 127 chooses single-source via `vigil-core` export consumed by both runtimes if module-resolution permits; otherwise duplicate-with-test-parity (decision deferred to planner). |
| GUARD-01 Sentry `beforeSend` redactor | API / Backend (`vigil-core/src/lib/sentry.ts`) + Browser (`vigil-pwa/src/main.tsx`) | — | Both Sentry runtimes need the hook. The redactor is a pure function; ship in `vigil-core/src/lib/sentry.ts` (Node) and `vigil-pwa/src/lib/sentry-redact.ts` (Browser). |
| GUARD-01 console drift detector | CI test (`vigil-core/src/__tests__/audio-log-redaction.test.ts`) | — | Source-grep test runs at CI time; no runtime code. |
| GUARD-02 server byte cap | API / Backend (`vigil-core/src/lib/audio-cap.ts`) | — | Hard reject at HTTP ingress before any decode. |
| GUARD-02 G2 cleanup wrapper | G2 Plugin / Client (`vigil-g2-plugin/src/lib/audio-session-guard.ts`) | — | Cleanup hooks must register inside the plugin runtime where the SDK and `window` live. Server can never enforce mic-close. |
| GUARD-02 PWA error UX | Browser / PWA (`vigil-pwa/src/lib/api-error-codes.ts`) | — | Locked-enum extension is PWA-only state. |
| GUARD-03 storage layer | Database / Storage (Postgres via Drizzle) | — | New `ai_usage_daily` table; composite PK `(user_id, usage_date)`. |
| GUARD-03 token accounting | API / Backend (`vigil-core/src/ai/client.ts` + `vigil-core/src/lib/ai-budget.ts`) | — | Anthropic SDK chokepoint lives in `ai/client.ts`; the budget helper queries the new table. |
| GUARD-03 pre-flight enforcement | API / Backend (route handlers: chat, process-audio, future voice/transcribe) | — | In-handler call (NOT middleware) because it needs `c.get("userId")`. |
| GUARD-03 PWA error UX | Browser / PWA (`vigil-pwa/src/lib/api-error-codes.ts`) | — | Locked-enum extension is PWA-only state. |
| GUARD-04 migration | Database / Storage (`vigil-core/drizzle/`) | — | **Already shipped in `0013_work_orders_drift_repair.sql`** — Phase 127 ships a verification test only. |
| GUARD-04 drift-detector test | CI test (`vigil-core/src/__tests__/migration-drift.test.ts`) | — | Shells `drizzle-kit generate` (no flag) and asserts the stdout `No schema changes, nothing to migrate` sentinel. |

## Standard Stack

### Core (verified versions from `vigil-core/package.json` / `vigil-pwa/package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@sentry/node` | `^10.52.0` | Server-side Sentry SDK | Already shipped in v3.8 Phase 126; v10 `beforeSend(event, hint) => event \| null` API |
| `@sentry/react` | `^10.52.0` | Browser-side Sentry SDK | Already shipped in v3.8 Phase 126 |
| `@anthropic-ai/sdk` | `^0.88.0` | Anthropic Claude SDK | Single chokepoint at `vigil-core/src/ai/client.ts`; `messages.create()` response carries `usage.input_tokens` + `usage.output_tokens` |
| `posthog-node` | (5.29.2 per posthog.ts:4 comment) | Server-side PostHog | `before_send: redactEvent` hook precedent at posthog.ts:77 |
| `drizzle-orm` | `^0.45.2` | Postgres ORM | `eq(...)` + `and(...)` query builders for W-01 scoping |
| `drizzle-kit` | `^0.31.10` | Migration tooling | **No `--dry` flag** — see Pitfall 1 |
| `hono` | (existing) | Web framework | `c.get("userId")` after bearerAuth; `app.onError` chokepoint |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:test` | built-in | vigil-core test runner | All `vigil-core/src/**/*.test.ts` and `__tests__/*.test.ts` |
| `node:assert/strict` | built-in | vigil-core assertions | Pair with `node:test` |
| Vitest | (existing) | vigil-pwa test runner | All `vigil-pwa/src/**/*.test.ts` |
| `pg` | (transitive via drizzle) | Postgres driver | `INSERT … ON CONFLICT (user_id, usage_date) DO UPDATE` for `ai_usage_daily` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure-function `redactSentryEvent` exported for unit testing | Inline arrow inside `Sentry.init({beforeSend: (e) => …})` | Inline is shorter but unverifiable — mirroring the `redactEvent` pure-function pattern from posthog.ts:54-64 keeps the unit test viable (lock decision) |
| New `ai_usage_daily` table | JSON column on `users` | CONTEXT D-03.1 rejects this: JSON-merge update is a write hot-loop; row-level `ON CONFLICT … DO UPDATE` is atomic and cheap |
| Pre-flight `requireAiBudget` helper inside each handler | Hono middleware mounted before AI routes | CONTEXT D-03.4 chose in-handler explicitly because middleware would need `c.get("userId")` populated, which means it must mount after bearerAuth anyway, and a per-route middleware fragment is harder to reason about than a one-line call at the top of each handler |
| Drift-detector test that shells `drizzle-kit generate` | Hash-compare `schema.ts` against latest `meta/<N>_snapshot.json` columns | Shell-out is the simpler implementation; the sentinel string `No schema changes, nothing to migrate 😴` is stable across drizzle-kit minor versions (verified live, see Pitfall 1) |

**Installation:** All packages already installed. No new dependencies.

**Version verification:** Done. Versions read live from `package.json` 2026-05-11; no remote verification needed because Phase 127 ships zero new dependencies.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  WRITE-PATH (every AI call protected by GUARD-03)                            │
│                                                                              │
│  Client request → bearerAuth (index.ts:166) → route handler                  │
│                                                    ↓                         │
│                                          requireAiBudget(userId)             │
│                                            (vigil-core/src/lib/              │
│                                             ai-budget.ts)                    │
│                                                    ↓                         │
│                                       SELECT ai_usage_daily                  │
│                                       WHERE user_id=$1                       │
│                                         AND usage_date=CURRENT_DATE          │
│                                                    ↓                         │
│                                  IF usd_estimate >= cap:                     │
│                                    throw DailyBudgetExceededError            │
│                                  ELSE: continue                              │
│                                                    ↓                         │
│                                       withBudgetTracking(userId, fn)         │
│                                       (wraps client.messages.create          │
│                                        in vigil-core/src/ai/client.ts)       │
│                                                    ↓                         │
│                                       Anthropic SDK call                     │
│                                                    ↓                         │
│                                       response.usage.input/output_tokens     │
│                                                    ↓                         │
│                                       INSERT … ON CONFLICT (user_id,         │
│                                         usage_date) DO UPDATE                │
│                                         SET usd_estimate = ... + EXCLUDED... │
│                                                                              │
│  ERROR PATH: DailyBudgetExceededError                                        │
│    → app.onError (index.ts:265-280)                                          │
│    → IF err instanceof DailyBudgetExceededError:                             │
│        return c.json({error,code:"DAILY_AI_BUDGET_EXCEEDED"}, 429)           │
│        (BEFORE captureToSentry — don't sink a deliberate 429)                │
│    → ELSE: existing Sentry+PostHog sink branch                               │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  LOG-PATH (GUARD-01 redaction at every sink)                                 │
│                                                                              │
│  Any code path                                                               │
│    │                                                                         │
│    ├─ console.log/error  →  (no wrapper; CI drift detector greps for         │
│    │                         "console.*(audio|pcm)" pattern in source)       │
│    │                                                                         │
│    ├─ trackEvent(...)    →  posthog.ts:100  →  filter properties keys        │
│    │                                            against BLOCKED_PROPERTY_    │
│    │                                            NAMES Set (14 keys after     │
│    │                                            Phase 127: 8 existing +      │
│    │                                            6 audio)                     │
│    │                                                                         │
│    └─ Sentry.captureException(...) auto-routed to:                           │
│           Sentry.init({beforeSend: redactSentryEvent})                       │
│              ↓                                                               │
│           redactSentryEvent(event):                                          │
│             recursively strip keys ∈ BLOCKED_PROPERTY_NAMES                  │
│             from event.extra, event.contexts, event.breadcrumbs[].data       │
│              ↓                                                               │
│           sanitized event → Sentry servers                                   │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  AUDIO-PATH (GUARD-02 cap + cleanup)                                         │
│                                                                              │
│  G2 plugin                                                                   │
│    safeAudioControl(true)                                                    │
│      ├─ idempotently registers cleanup on FIRST call:                        │
│      │     • onEvenHubEvent: if osEvent.eventType === ABNORMAL_EXIT_EVENT(6) │
│      │     • onEvenHubEvent: if osEvent.eventType === SYSTEM_EXIT_EVENT(7)   │
│      │     • window.addEventListener("beforeunload", cleanup)                │
│      │     • setBackgroundState("vigil-audio-guard", () => ({active:true})) │
│      │       + onBackgroundRestore → cleanup if active was true              │
│      └─ calls SDK audioControl(true)                                         │
│            ↓                                                                 │
│      [recording happens; PCM frames stream via audioEvent]                   │
│            ↓                                                                 │
│      cleanup callback fires (any path) → SDK audioControl(false)             │
│                                                                              │
│  Phase 130 voice route                                                       │
│    POST /v1/voice/transcribe (body: {audio: base64WAV})                      │
│      ↓                                                                       │
│    assertAudioSessionWithinCap(body.audio)                                   │
│      (vigil-core/src/lib/audio-cap.ts)                                       │
│      IF body.audio.length > 2_560_000:                                       │
│        return c.json({code:"AUDIO_SESSION_TOO_LONG"}, 413)                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (additions only)

```
vigil-core/
├── drizzle/
│   └── 0020_add_ai_usage_daily.sql                NEW — GUARD-03 storage
│   (NOTE: NOT 0020_reconcile_work_orders_107_1.sql per CONTEXT D-04.2 —
│    that drift was already migrated in 0013; see Risks/Landmines)
├── src/
│   ├── __tests__/
│   │   ├── audio-log-redaction.test.ts            NEW — GUARD-01 three-rail pin
│   │   └── migration-drift.test.ts                NEW — GUARD-04 drift detector
│   ├── ai/
│   │   └── client.ts                              EDIT — wrap with withBudgetTracking
│   ├── analytics/
│   │   ├── posthog.ts                             EDIT — extend BLOCKED_PROPERTY_NAMES
│   │   └── posthog.test.ts                        EDIT — bump size assertion 8→14
│   ├── db/
│   │   └── schema.ts                              EDIT — add aiUsageDaily table export
│   ├── lib/
│   │   ├── audio-cap.ts                           NEW — assertAudioSessionWithinCap
│   │   ├── ai-budget.ts                           NEW — requireAiBudget + DailyBudgetExceededError + price constants
│   │   ├── sentry.ts                              EDIT — add beforeSend / redactSentryEvent
│   │   └── sentry.test.ts                         EDIT — add beforeSend pin test
│   ├── routes/
│   │   ├── chat.ts                                EDIT — call requireAiBudget at handler top
│   │   └── process-audio.ts                       EDIT — call requireAiBudget at handler top
│   └── index.ts                                   EDIT — app.onError DailyBudgetExceededError branch

vigil-pwa/
└── src/
    ├── lib/
    │   ├── api-error-codes.ts                     EDIT — add AUDIO_SESSION_TOO_LONG + DAILY_AI_BUDGET_EXCEEDED
    │   ├── api-error-codes.test.ts                EDIT — pin new EXTENSION keys
    │   └── sentry-redact.ts                       NEW — redactSentryEvent for PWA
    └── main.tsx                                   EDIT — add beforeSend to Sentry.init

vigil-g2-plugin/
└── src/
    ├── lib/
    │   ├── audio-session-guard.ts                 NEW — safeAudioControl wrapper
    │   └── audio-session-guard.test.ts            NEW — 4-exit-event cleanup assertions
    └── (no companion.ts / main.ts changes)
```

### Pattern 1: Sentry `beforeSend` Pure-Function + Init-Time Registration

**What:** Mirror the PostHog `before_send: redactEvent` precedent (posthog.ts:54-77) for Sentry.

**When to use:** GUARD-01.2 — only place to scrub event before it leaves the process.

**Example:**

```typescript
// Source: vigil-core/src/lib/sentry.ts (Phase 127 EDIT)
// API verified against Sentry JavaScript SDK v10 docs:
//   https://docs.sentry.io/platforms/javascript/guides/node/configuration/filtering/
//   https://develop.sentry.dev/sdk/foundations/client/hooks/

import * as Sentry from "@sentry/node";
import type { ErrorEvent, EventHint } from "@sentry/node";
import { BLOCKED_PROPERTY_NAMES } from "../analytics/posthog.js";

/** Strip BLOCKED_PROPERTY_NAMES keys from event.extra, event.contexts.*, and
 *  event.breadcrumbs[].data. Returns the mutated event (or null to drop). */
export function redactSentryEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  if (!event) return event;
  const stripFromBag = (bag: Record<string, unknown> | undefined) => {
    if (!bag) return;
    for (const key of Object.keys(bag)) {
      if (BLOCKED_PROPERTY_NAMES.has(key)) delete bag[key];
    }
  };
  stripFromBag(event.extra as Record<string, unknown> | undefined);
  if (event.contexts) {
    for (const ctxName of Object.keys(event.contexts)) {
      stripFromBag(event.contexts[ctxName] as Record<string, unknown> | undefined);
    }
  }
  if (Array.isArray(event.breadcrumbs)) {
    for (const bc of event.breadcrumbs) {
      stripFromBag(bc.data as Record<string, unknown> | undefined);
    }
  }
  return event;
}

export function initSentry(): void {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: 0,
    beforeSend: redactSentryEvent,  // ← Phase 127 GUARD-01.2 addition
  });
  initialized = true;
}
```

### Pattern 2: In-Handler Pre-Flight (NOT Middleware) for `c.get("userId")`-Dependent Gates

**What:** `requireAiBudget(userId)` is called at the TOP of each AI route handler (after bearerAuth has set `userId`), NOT as middleware. Mirrors the precedent that `app.use("/v1/*", bearerAuth)` is the only middleware that mounts before per-route auth handlers; any subsequent gate that NEEDS `userId` either mounts after bearerAuth as middleware (e.g., `requireVerifiedEmailWithGrace` at index.ts:181) OR runs in-handler.

**When to use:** GUARD-03.4 — the budget check fires only for AI-touching routes (chat, process-audio, future voice/transcribe, future regenerate-ai-cache). A `/v1/*` middleware would gate non-AI routes too, which is incorrect.

**Example:**

```typescript
// Source: vigil-core/src/lib/ai-budget.ts (Phase 127 NEW)
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { aiUsageDaily } from "../db/schema.js";

export class DailyBudgetExceededError extends Error {
  readonly code = "DAILY_AI_BUDGET_EXCEEDED" as const;
  constructor(public readonly userId: number, public readonly usdEstimate: number) {
    super(`Daily AI budget exceeded for user ${userId} (${usdEstimate} USD)`);
    this.name = "DailyBudgetExceededError";
  }
}

const DEFAULT_CAP_USD = 0.50;

function readCapUsd(): number {
  const env = process.env["VIGIL_DAILY_AI_BUDGET_USD"];
  const parsed = env ? Number.parseFloat(env) : DEFAULT_CAP_USD;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CAP_USD;
}

export async function requireAiBudget(userId: number): Promise<void> {
  if (!db) return;  // local-dev no-DB shape; AI calls already 503 elsewhere
  const cap = readCapUsd();
  const rows = await db
    .select({ usd: aiUsageDaily.usdEstimate })
    .from(aiUsageDaily)
    .where(and(
      eq(aiUsageDaily.userId, userId),
      sql`${aiUsageDaily.usageDate} = CURRENT_DATE`,
    ));
  const current = rows[0]?.usd ? Number(rows[0].usd) : 0;
  if (current >= cap) throw new DailyBudgetExceededError(userId, current);
}
```

Then at the top of each AI route handler:

```typescript
// vigil-core/src/routes/chat.ts (Phase 127 EDIT — exact site)
chat.post("/chat", async (c) => {
  const userId = c.get("userId");
  await requireAiBudget(userId);   // ← Phase 127 GUARD-03.4 — throws → app.onError → 429
  // …existing logic…
});
```

### Pattern 3: `INSERT … ON CONFLICT … DO UPDATE` for atomic accumulator

**What:** `withBudgetTracking(userId, fn)` records token spend atomically without read-modify-write races.

**When to use:** GUARD-03.3 inside `vigil-core/src/ai/client.ts` wrapper.

**Example:**

```typescript
// Source: vigil-core/src/ai/client.ts (Phase 127 EDIT — wrapping every messages.create)
// Anthropic SDK response.usage shape:
//   https://docs.anthropic.com/en/api/messages
//     "usage": { "input_tokens": 30, "output_tokens": 309 }

const INPUT_PRICE_PER_TOKEN = 3 / 1_000_000;   // $3 per 1M input tokens (Sonnet 4)
const OUTPUT_PRICE_PER_TOKEN = 15 / 1_000_000; // $15 per 1M output tokens (Sonnet 4)

export async function withBudgetTracking<T extends { usage?: { input_tokens?: number; output_tokens?: number } }>(
  userId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const response = await fn();
  try {
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const usd = inputTokens * INPUT_PRICE_PER_TOKEN + outputTokens * OUTPUT_PRICE_PER_TOKEN;
    if (usd > 0 && db) {
      await db.execute(sql`
        INSERT INTO ai_usage_daily (user_id, usage_date, usd_estimate, updated_at)
        VALUES (${userId}, CURRENT_DATE, ${usd}, NOW())
        ON CONFLICT (user_id, usage_date) DO UPDATE
          SET usd_estimate = ai_usage_daily.usd_estimate + EXCLUDED.usd_estimate,
              updated_at = NOW()
      `);
    }
  } catch (err) {
    // D-03.3 failure mode: telemetry, not gating. Log and continue.
    console.error("[vigil-core] withBudgetTracking accumulator failed (non-fatal):", err);
  }
  return response;
}
```

### Pattern 4: Source-Grep Drift Detector

**What:** Read source files at test time, regex-match against forbidden patterns, fail CI on any match.

**When to use:** GUARD-01.4 console.* check; GUARD-04 migration-drift sentinel parse. Existing precedent at `vigil-core/src/__tests__/mount-order.test.ts`.

**Example:**

```typescript
// Source: vigil-core/src/__tests__/audio-log-redaction.test.ts (Phase 127 NEW)
// Mirrors mount-order.test.ts pattern (fs.readFileSync source-content drift)

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(here, "..");

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) files.push(full);
  }
  return files;
}

describe("GUARD-01 audio log redaction — three rails pinned", () => {
  it("BLOCKED_PROPERTY_NAMES contains all six audio keys", async () => {
    const { BLOCKED_PROPERTY_NAMES } = await import("../analytics/posthog.js");
    for (const k of ["audioPcm","audio_pcm","pcm","audio","audioBuffer","audio_buffer"]) {
      assert.ok(BLOCKED_PROPERTY_NAMES.has(k), `must contain "${k}"`);
    }
  });

  it("sentry.ts Sentry.init() block registers beforeSend", () => {
    const src = readFileSync(join(ROOT, "lib", "sentry.ts"), "utf8");
    // Naive but load-bearing: confirm "beforeSend" appears inside Sentry.init body.
    const initIdx = src.indexOf("Sentry.init({");
    const closeIdx = src.indexOf("});", initIdx);
    assert.ok(initIdx !== -1 && closeIdx !== -1, "Sentry.init({...}) block not found");
    assert.match(src.slice(initIdx, closeIdx), /\bbeforeSend\b/,
      "Sentry.init must register beforeSend — GUARD-01.2");
  });

  it("no console.* call site references audio/pcm in routes|lib|ai|middleware", () => {
    const scanDirs = ["routes","lib","ai","middleware"].map((d) => join(ROOT, d));
    const denylistSources = new Set([
      join(ROOT, "analytics", "posthog.ts"),  // contains "audio" as literal denylist entry
      join(ROOT, "lib", "audio-cap.ts"),       // GUARD-02 module legitimately mentions audio
      join(ROOT, "lib", "ai-budget.ts"),       // unrelated; safe
    ]);
    const offenders: string[] = [];
    for (const dir of scanDirs) {
      for (const file of walk(dir)) {
        if (denylistSources.has(file)) continue;
        const src = readFileSync(file, "utf8");
        // Match console.LEVEL(... audio|pcm ...) on a single line
        if (/console\.(log|info|warn|error|debug)[^)\n]*(audio|pcm)/i.test(src)) {
          offenders.push(file);
        }
      }
    }
    assert.deepEqual(offenders, [],
      `GUARD-01.4 drift: console.* call referencing audio/pcm in:\n  ${offenders.join("\n  ")}`);
  });
});
```

### Anti-Patterns to Avoid

- **Anti-pattern: Forking the denylist Set for Sentry.** Phase 127's whole point is ONE source of truth. Import from `vigil-core/src/analytics/posthog.ts`. A future test counts size; forking guarantees drift.
- **Anti-pattern: Awaiting the accumulator INSERT inside the hot request path with a `throw`-on-failure shape.** CONTEXT D-03.3 made the call: token-counting is non-fatal. Catch and log; never crash a successful user request because the analytics row didn't write.
- **Anti-pattern: `Sentry.init` beforeSend that mutates and returns the *same* mutated event reference but also re-throws on internal errors.** A throw in `beforeSend` is silently caught by the SDK but loses the event entirely. Wrap the body in try/catch; on error, return the original event unchanged (better to ship a non-redacted event than no event).
- **Anti-pattern: Using `drizzle-kit push` as the apply path for the `ai_usage_daily` migration.** `drizzle-kit push` bypasses the `drizzle/` migrations folder entirely and synchronously diffs schema → DB. Phase 127 must use the project's normal apply path: hand-crafted `.sql` file → `db:migrate-prod` (`node dist/db/migrate.js` per `vigil-core/package.json`). The `db:push` script in package.json is for local-dev scratch use only.
- **Anti-pattern: Catching `DailyBudgetExceededError` inside the route handler and translating to JSON there.** The whole `app.onError` chokepoint pattern (index.ts:265-280) exists so route handlers don't have to know about HTTP status codes for cross-cutting errors. Throw; let `app.onError` translate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PCM denylist scrubbing | Custom regex over event JSON | The existing `BLOCKED_PROPERTY_NAMES` Set + a recursive key-walker | The Set is already locked-enum tested at posthog.test.ts:91-117; the recursive walker mirrors `redactEvent` (posthog.ts:54-64) for a 10-line implementation |
| Sentry event sanitization | Sidecar middleware that intercepts Sentry network requests | Sentry's `beforeSend` hook | Sentry SDK v10 supports `beforeSend(event, hint) => event \| null` natively; the SDK guarantees it runs synchronously before any network I/O |
| Token cost estimation | Manual `tiktoken`-style token counting after the fact | Anthropic SDK `response.usage.input_tokens` + `output_tokens` | Anthropic returns exact billing-grade token counts in every response — no client-side estimation needed |
| Atomic per-day accumulator | Read-modify-write with optimistic concurrency | Postgres `INSERT … ON CONFLICT (user_id, usage_date) DO UPDATE SET usd_estimate = ai_usage_daily.usd_estimate + EXCLUDED.usd_estimate` | Postgres `ON CONFLICT … DO UPDATE` is atomic at the row level; mirrors Phase 121 W-01 W-02 composite-unique-index precedent |
| G2 audio cleanup state machine | Plugin-side "is mic open?" reconciliation tracking | Idempotent `audioControl(false)` on every exit path | EVEN-SKILLS.md:66 verbatim: "Do NOT clean up resources BEFORE shutDownPageContainer(1) returns"; idempotent close in handlers is the canonical SDK shape |
| Detecting "schema drift" | Hash-compare `src/db/schema.ts` vs Drizzle snapshot JSON | Shell `drizzle-kit generate` (NO flag) and parse stdout for `No schema changes, nothing to migrate 😴` sentinel | The flag the CONTEXT.md references doesn't exist (see Pitfall 1); drizzle-kit's own no-change branch emits this stable sentinel string (verified live against `drizzle-kit@0.31.10`) |
| Drift-detector tooling | New CI infrastructure | `node:test` + `fs.readFileSync` + regex (existing `mount-order.test.ts` pattern) | The pattern is already established and CI-integrated; no new framework needed |

**Key insight:** Phase 127's discipline is "extend existing patterns, don't invent." The three guards each have a precedent in v3.5-v3.8 (PostHog denylist for GUARD-01, `MAX_AUDIO_B64_CHARS` for GUARD-02, locked-enum `ERROR_CODE_MAP` extension for GUARD-03). GUARD-04 is the odd one out because its premise (drift exists) is wrong — but the verification pattern (drift-detector test) IS one we already have.

## Runtime State Inventory

This phase ships pure code/schema additions — no rename, no refactor, no migration of pre-existing data. The `ai_usage_daily` table is brand-new with zero historical rows. Nevertheless, completing the inventory explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by grep. No existing column/table is being renamed. `ai_usage_daily` is greenfield with no backfill. | None |
| Live service config | Sentry DSN (Railway env `SENTRY_DSN`) — already configured for Phase 126; no change to value, only the SDK's `beforeSend` registration | None — `beforeSend` is a code-level change; Sentry-side dashboard requires no update |
| OS-registered state | None — Phase 127 does not register any system service, launchd plist, Task Scheduler entry, pm2 process, or cron job | None |
| Secrets/env vars | NEW env var: `VIGIL_DAILY_AI_BUDGET_USD` (optional override; default 0.50 hard-coded). NEW operational dependency: Railway env needs documentation update (`.env.example`, `dailybrief-doctor.sh` per memory `project_secret_drift`) | Add to `.env.example`; update `dailybrief-doctor.sh` drift-detection list |
| Build artifacts | `vigil-core/drizzle/meta/_journal.json` will gain an entry for `0020_*.sql` after migration generation; `meta/0020_snapshot.json` snapshot also gets written. Hand-craft both per Phase 121 idiom or run `drizzle-kit generate` and accept its meta-folder output (the SQL itself is hand-edited but the meta IS auto-generated) | Inspect `meta/0020_snapshot.json` for unexpected diffs before commit |

## Common Pitfalls

### Pitfall 1 — `drizzle-kit generate --dry` is a nonexistent flag

**What goes wrong:** GUARD-04 success criterion in CONTEXT D-04.3, REQUIREMENTS GUARD-04, and ROADMAP §"Phase 127 #4" all reference `drizzle-kit generate --dry`. The flag does not exist in `drizzle-kit@^0.31.10` (the version pinned in `vigil-core/package.json`). The `--help` output enumerates only `--config / --dialect / --driver / --casing / --schema / --out / --name / --breakpoints / --custom / --prefix`. A CI test that shells `drizzle-kit generate --dry` will fail with "unknown flag" or be silently ignored by Cobra-style CLI argument parsing (depending on version).

**Why it happens:** The flag is an open feature request — GH issue `drizzle-team/drizzle-orm#5059` titled "Add `drizzle-kit` command to evaluate changes between migrations and schema in CI", opened Nov 2025, no PR, no implementation timeline as of 2026-05-11. The discussion mentions a one-off Discord conversation about "dry run may not work well as resolution is interactive" — the team has not committed to shipping it.

**How to avoid:**

- **Use `drizzle-kit generate` (no flag) instead.** Verified live: against the current `vigil-core/` schema with all 19 migrations applied, the command prints to stdout:
  ```
  No schema changes, nothing to migrate 😴
  ```
  and creates ZERO new files in `drizzle/`. This is dry-by-default-when-no-changes. The CI test parses stdout for the literal sentinel string; presence = clean, absence = drift.

- **The 😴 emoji is part of the verified sentinel.** Verified live with `drizzle-kit@0.31.10` 2026-05-11. If a future minor version changes the wording, the test must be updated. Pin the drizzle-kit version range tightly OR fall back to a regex like `/No schema changes/i` (slightly weaker but version-resilient).

- **Alternative verification:** parse the exit code (0 on no-change vs 0 on change-with-file-written — same exit code; the SQL file presence is the differential signal). Acceptable fallback: snapshot `ls drizzle/*.sql | wc -l` before and after, fail if delta != 0.

**Warning signs:**

- A plan task that runs `pnpm drizzle-kit generate --dry` verbatim from CONTEXT.md.
- CI logs show a drizzle-kit error like `Error: unknown flag --dry` or `unknown command "--dry"`.
- A test that reports "drift-clean" even when `schema.ts` diverges from migrations (because the unknown flag short-circuited the run).

---

### Pitfall 2 — Phase 107.1 `work_orders` drift is already migrated; writing `0020_reconcile_work_orders_107_1.sql` would either no-op or duplicate

**What goes wrong:** CONTEXT D-04.1 / D-04.2 instruct the planner to write a new migration adding `notes`, `last_change_at`, `last_change_summary`, `archived_at` to `work_orders` "because they exist in `schema.ts:275-279` but were never migrated." This premise is incorrect.

**Verification trail:**

- `vigil-core/drizzle/0013_work_orders_drift_repair.sql:6-12` already contains the four `ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS …` statements. File header verbatim: *"Phase 107.1 gap repair: add schema.ts columns missing from prior migrations."*
- `vigil-core/drizzle/meta/0013_snapshot.json:1379-1410` records all four columns.
- `vigil-core/drizzle/meta/0019_snapshot.json:1707-1738` (latest snapshot, on HEAD as of 2026-05-11) records all four columns.
- Running `npx drizzle-kit generate` against the current `vigil-core/` reports `No schema changes, nothing to migrate 😴` (verified live 2026-05-11).
- ROADMAP.md:308: "Phase 107.1: Local dev environment with Postgres + hot reload (7/7 plans, INSERTED) — **completed 2026-04-22**".

**Why the docs say otherwise:** `STATE.md:389` under "Carried into v3.8" still lists "Phase 107.1 work_orders schema drift — columns notes/archived_at/last_change_at/last_change_summary defined in schema.ts but never migrated". This blocker entry was authored before 0013 shipped (or shipped concurrently) and never got cleaned up. PITFALLS.md §7 also propagates the stale framing. The CONTEXT.md `--auto` run picked up the stale framing and locked it into the plan-of-record without re-verifying.

**How to avoid:**

- **Re-scope GUARD-04 from "write the missing migration" to "ship a drift-detector test that proves the drift is gone, and clean up the stale docs."** The success criterion ("zero pending changes") is already satisfied structurally — Phase 127's plan should formalize that with a CI test that fails if it ever drifts again, plus a STATE.md update.
- **DO NOT write `0020_reconcile_work_orders_107_1.sql`.** If you do, drizzle-kit will see schema parity and produce a no-op migration (or worse, you hand-craft duplicate `ADD COLUMN IF NOT EXISTS` statements that succeed idempotently in production but pollute the journal). The naming would also lie about what the migration does.
- **The `0020` slot is free for GUARD-03 (`ai_usage_daily`).** CONTEXT D-04.4 reserves `0020` for the work_orders fix and `0021` for `ai_usage_daily`. Drop the work_orders migration; `0020` becomes `ai_usage_daily`. (Or pick `0020_add_ai_usage_daily.sql` to keep the naming clear.)

**Warning signs:**

- A plan task creating `0020_reconcile_work_orders_107_1.sql` with `ADD COLUMN IF NOT EXISTS` for the four columns.
- A `psql` verification that says "column already exists" (which the `IF NOT EXISTS` masks, but the row in `__drizzle_migrations` would still get a new entry — clutter).
- A migration-drift test that PASSES on a fresh checkout (it would, regardless — the columns are already there).

---

### Pitfall 3 — Sentry `beforeSend` mutate-and-return shape must be defensive

**What goes wrong:** Naive `beforeSend` implementations throw on unexpected event shapes (e.g., `event.contexts` being a string instead of an object), or return `undefined` instead of `event | null`. Per the Sentry SDK contract (verified via [Sentry filtering docs](https://docs.sentry.io/platforms/javascript/guides/node/configuration/filtering/)): returning the modified event sends it; returning `null` discards it; throwing or returning `undefined` is undefined-behavior in older SDKs (some treat it as drop, some as send-unchanged).

**Why it happens:** Sentry's event types have evolved across major versions. Server-side `errno`/`syscall`/`code` properties on `event.contexts.os` etc. can be primitives, not objects. A walker that assumes `Record<string, unknown>` throws on `typeof event.contexts.os === "string"`.

**How to avoid:**

- **Type-guard each bag before iterating.** `if (typeof bag !== "object" || bag === null) return;`
- **Wrap the whole body in try/catch.** On error: log, return the original event unchanged. A non-redacted event is better than no event (Sentry is for visibility; defense-in-depth means PII filtering happens at the *source* boundaries too — PostHog denylist, source-grep drift detector — so a `beforeSend` bypass is not a complete failure).
- **Return type annotation: `ErrorEvent | null`.** Forces TypeScript to catch accidental `undefined` returns.
- **Unit test the four shapes:** valid event, event with primitive `contexts.os`, event with no `extra`, event with circular `breadcrumbs[].data` (rare but possible from auto-instrumented HTTP breadcrumbs).

**Warning signs:**

- Sentry dashboard shows 0 events after deploy (the `beforeSend` is silently dropping everything).
- vigil-core stderr shows `TypeError: Cannot read properties of undefined (reading 'X')` near Sentry capture call sites.

---

### Pitfall 4 — `getAIClient()!` direct use in `process-audio.ts` bypasses `withBudgetTracking`

**What goes wrong:** `vigil-core/src/routes/process-audio.ts:82-115` calls `ai.beta.files.upload({file})` and `ai.beta.messages.create({…})` directly on the Anthropic client (`ai = getAIClient()!`), NOT through the three `callClaude*` wrappers in `vigil-core/src/ai/client.ts`. If GUARD-03's `withBudgetTracking` wraps only the three named wrappers, the audio transcription path's token spend is invisible to the accumulator — silently uncapped.

**Why it happens:** `process-audio.ts` exists because `beta.files` was a one-off integration (Phase 99-era) that didn't fit the conversation/multimodal wrapper shape. The three wrappers in `client.ts` cover `messages.create` for text/conversation/multimodal cases; the audio file-upload case is structurally different (it's TWO SDK calls: `files.upload` + `beta.messages.create` with a file reference).

**How to avoid:**

- **Wrap at the `getAIClient()` boundary instead of per-method.** Option A: have `getAIClient()` return a Proxy that intercepts `messages.create` and `beta.messages.create` calls, applying `withBudgetTracking` automatically. Cleaner but Proxy debugging is harder.
- **Option B (recommended): refactor `process-audio.ts` to use a new `callClaudeFile(...)` wrapper in `ai/client.ts` that goes through `withBudgetTracking`.** Adds 30 lines to `ai/client.ts`, keeps the per-method wrapping shape consistent.
- **Option C: ship a separate `withBudgetTracking` call wrapping the `beta.messages.create` block in `process-audio.ts:93-115` directly.** Simplest but creates a second integration site that future audio routes (e.g., Phase 130's `/v1/voice/transcribe`) must also remember to wrap. The drift-detector test pattern can pin it.
- **Recommended:** Option B + add a drift-detector test asserting every `await ai.messages.create` and `await ai.beta.messages.create` call site in `vigil-core/src/routes/**` is inside a `withBudgetTracking(...)` block (regex over source).

**Warning signs:**

- `ai_usage_daily.usd_estimate` rows show only text-chat costs; voice transcription captures show zero spend even when user hammers `/v1/process-audio`.
- A code-search for `ai.beta.messages.create` in `vigil-core/src/routes/` returns hits NOT wrapped in `withBudgetTracking`.

---

### Pitfall 5 — `app.onError` Sentry-sink branch must NOT capture `DailyBudgetExceededError`

**What goes wrong:** `vigil-core/src/index.ts:265-280` currently runs `captureException(userId, err, …)` (PostHog) AND `captureToSentry(userId, err, …)` for every unhandled error. If `DailyBudgetExceededError` is treated as a normal error, every 429 becomes a Sentry event — burning the 5k events/mo Sentry quota and creating dashboard noise for a deliberate business-rule rejection.

**Why it happens:** `app.onError` is a chokepoint by design — it catches everything. Without an explicit branch, deliberate-rejection errors get sunk too.

**How to avoid:**

- **Add an early `if (err instanceof DailyBudgetExceededError)` branch BEFORE the captureException/captureToSentry calls.** Return the 429 + locked-enum code and `return c.json(...)` to short-circuit. Mirrors the existing branch shape (note that there's currently no special-case branch at index.ts:265-280; this is a NEW pattern to establish).
- **The branch order matters:** budget-exceeded check FIRST, then unconditional sink for other errors. Don't put it after the sink calls (they'd already fire).
- **Add a unit test** that throws `DailyBudgetExceededError` through `app.onError` and asserts (a) response is 429 with `code: "DAILY_AI_BUDGET_EXCEEDED"`, (b) the Sentry/PostHog capture functions were not called. Mock both wrappers; assert call count = 0.

**Warning signs:**

- Sentry dashboard shows hundreds of `DailyBudgetExceededError` events.
- PostHog `$exception` events flooded with budget rejections.
- Sentry quota exhausted in the first month of v3.9.

---

### Pitfall 6 — `BLOCKED_PROPERTY_NAMES.size` literal assertion in posthog.test.ts must be updated

**What goes wrong:** `vigil-core/src/analytics/posthog.test.ts:103` asserts `BLOCKED_PROPERTY_NAMES.size === expected.size` against an `expected` Set of literally 8 keys (lines 93-102). GUARD-01.1 extends the Set to 14 keys. The existing test will fail with `8 != 14`, blocking CI.

**Why it happens:** The Phase 103 lock test was written with a hard-coded size for maximum drift detection — adding keys ALWAYS requires updating the test, which is the intended discipline.

**How to avoid:**

- **The plan must include an explicit task to update `posthog.test.ts:93-117` `expected` Set:** add the six audio keys (`audioPcm`, `audio_pcm`, `pcm`, `audio`, `audioBuffer`, `audio_buffer`) to the literal Set, bringing size to 14.
- **Document the original 8 keys are the LOCKED-as-of-Phase-103 baseline** (case sensitive: `content / body / text / message / description / title / note / transcript`) and the 6 audio keys are the Phase 127 EXTENSION. The test should arguably grow a `LOCKED_KEYS` vs `EXTENSION_KEYS` distinction the way `ERROR_CODE_MAP` does, but that's a refactor; the minimum viable change is just to enlarge the expected Set.
- **A separate test** `audio-log-redaction.test.ts` (per GUARD-01.4) asserts the 6 audio keys specifically are present — that's the additivity assertion. The size-equality test is the LOCKED-shape assertion. Both should pass after Phase 127.

**Warning signs:**

- CI shows `posthog.test.ts:103 AssertionError: 8 != 14` after Phase 127's posthog.ts edit lands.

---

### Pitfall 7 — `setBackgroundState` Headless-WebView replay only fires if `audioControl(true)` is active at snapshot time

**What goes wrong:** GUARD-02.3 lists `setBackgroundState` as the fourth cleanup hook. But `setBackgroundState` works by snapshotting JS state at backgrounding and replaying it in a new Headless WebView (EVEN-SKILLS.md §"Background state", lines 68-90). The replay restores state but does NOT automatically fire event listeners — including the `audioControl(false)` cleanup callback.

The intent of using `setBackgroundState` here is: if the plugin gets snapshotted with mic open, the restore handler (`onBackgroundRestore`) should detect "mic was active" and explicitly call `audioControl(false)` in the new WebView. This is the "Headless WebView replay path" referenced in CONTEXT D-02.3.

**Why it happens:** `setBackgroundState` is a state-persistence primitive, not a lifecycle callback. The plugin author has to wire the restore handler manually to do the cleanup.

**How to avoid:**

- **The `safeAudioControl` module must register BOTH `setBackgroundState` AND `onBackgroundRestore`:**
  ```typescript
  // vigil-g2-plugin/src/lib/audio-session-guard.ts (Phase 127 NEW)
  let audioActive = false;
  setBackgroundState("vigil-audio-guard", () => ({ audioActive }));
  onBackgroundRestore("vigil-audio-guard", (saved: unknown) => {
    const s = saved as { audioActive?: boolean };
    if (s.audioActive) {
      // Snapshot captured mic open — restore handler closes it defensively
      bridge.audioControl(false).catch(() => { /* idempotent close */ });
      audioActive = false;
    }
  });
  ```
- **Add EVEN-SKILLS.md §"Background state" rules to the unit test:** the snapshot callback must return a plain JSON-serializable object (no class instances, no `Map`, no `Set`, no `Date`); the restore must reassign live state, not mutate the snapshot.
- **The unit test for GUARD-02.3 must simulate all four exit paths individually:** (1) emit `osEvent.eventType === 6` → assert `audioControl(false)` called; (2) emit `osEvent.eventType === 7` → assert; (3) dispatch `window.dispatchEvent(new Event("beforeunload"))` → assert; (4) call the snapshot callback to capture `audioActive=true`, then call the restore handler with that snapshot → assert cleanup fired. Four independent it-blocks.

**Warning signs:**

- Unit test stubs all four exit events but only assert the cleanup runs once (multiplexed/shared); a regression that breaks one path goes unnoticed.
- The `onBackgroundRestore` handler is missing; only `setBackgroundState` is registered.
- The Even SDK is mocked in a way that the Headless WebView replay can't be simulated.

---

### Pitfall 8 — `audioControl(false)` is idempotent but is it actually best-effort on hardware?

**What goes wrong:** PITFALLS.md §2 calls out: "If `audioControl(false)` is similarly best-effort, the close path can silently fail." Phase 124 D-08 already proved that some G2 SDK events aren't reliably plumbed. Phase 127 ships the cleanup wrapper but cannot verify it works on real hardware — that verification belongs in Phase 128a (VOICE-01 spike, success criterion #4 in ROADMAP.md:388: "audioControl(false) cleanup is verified to fire on every documented exit path (no zombie microphone sessions after 5 force-quit cycles)").

**Why it happens:** Phase 127 is a code-only phase; hardware verification belongs in the spike phase. But shipping the cleanup wrapper without a hardware check creates false confidence.

**How to avoid:**

- **The GUARD-02 unit test asserts the cleanup CALLBACKS fire on mocked exit events, not that the SDK actually closes the mic.** That's the right boundary — the test verifies our wiring, not the SDK's correctness.
- **Document the hardware-dependent assertion as a Phase 128a spike acceptance criterion** in the Phase 127 plan (no action in 127; just a forward reference). The spike will physically reboot/force-quit and observe whether the mic LED on G2 stays on.
- **The server-side byte cap (D-02.1) is the structural backstop** for any plugin-side failure: even if the mic stays open and PCM streams forever, vigil-core rejects any single POST > 2_560_000 base64 chars. The plugin is treated as untrusted per PITFALLS.md §2.

**Warning signs:**

- No documented Phase 128a task that physically force-quits the plugin and checks for zombie mic.
- Phase 127 unit tests assert the SDK's `audioControl(false)` was *successful*, not just *called* (out-of-scope).

---

### Pitfall 9 — `ai_usage_daily.usd_estimate numeric(10,4)` vs JS number rounding

**What goes wrong:** `numeric(10,4)` Postgres column stores up to 4 decimal places (e.g., `0.0001` = ten-thousandth USD = micro-USD precision). JS `Number` (IEEE-754 double) is lossless for these values, but the Anthropic SDK returns integer token counts; the math `inputTokens * 3 / 1_000_000 + outputTokens * 15 / 1_000_000` produces values like `0.000003` (for a tiny call), which `numeric(10,4)` rounds to `0.0000`. Many small requests then accumulate as $0 forever.

**Why it happens:** The CONTEXT D-03.1 schema specifies `numeric(10,4)`; the math at fractional rates produces sub-cent values that get rounded down.

**How to avoid:**

- **Use `numeric(12,6)` or wider.** Six decimals = micro-cents = 0.0001 cents. A 100-token request at $3/1M = $0.0003 = 0.03 cents — captured at 6 decimals, lost at 4.
- **OR** accumulate in tokens, convert to USD at read time. Storing raw `input_tokens_sum bigint` and `output_tokens_sum bigint` lets the cap check compute on-the-fly: `if (in_sum * 3 + out_sum * 15 >= cap_usd * 1_000_000) reject`. This is more precise and shields against future price changes (price is a constant outside the DB).
- **Recommended (smaller delta from CONTEXT):** keep `usd_estimate numeric(12,6)` (bump precision from 4 → 6), document the rationale in the migration SQL comment.

**Warning signs:**

- After deploy, `SELECT * FROM ai_usage_daily WHERE usd_estimate = 0 AND updated_at > '2026-05-11'` returns rows (i.e., users had AI calls but their day-totals are stuck at zero).
- The accumulator INSERT logs no errors but the read-path always sees zero.

---

### Pitfall 10 — Drift-detector test that shells `drizzle-kit generate` is slow and requires DATABASE_URL

**What goes wrong:** `drizzle-kit generate` reads `drizzle.config.ts`, which references `process.env.DATABASE_URL`. In CI without a Postgres available, the command may exit with a connection error before reaching the no-change branch. Also, the command takes ~1-3 seconds to spin up — running it inside `node:test` adds noticeable latency.

**Why it happens:** `drizzle-kit generate` is a CLI tool, not a library; invoking it from a test means shelling out and waiting for it to boot Node, load `drizzle.config.ts`, parse `schema.ts`, and compare against snapshots.

**How to avoid:**

- **Verified live: `DATABASE_URL=postgres://noop@localhost/noop npx drizzle-kit generate` succeeds and prints `No schema changes, nothing to migrate 😴` WITHOUT requiring an actual reachable database.** drizzle-kit only uses `dbCredentials.url` for the `migrate` / `studio` / `introspect` subcommands; `generate` operates entirely off `schema.ts` + `drizzle/meta/*.json`. So a fake DATABASE_URL satisfies the config load.
- **Set a generous test timeout (10s).** Use `it("...", { timeout: 10_000 }, async () => { ... })` per node:test API.
- **Cache the result across describe blocks** — run `drizzle-kit generate` once in `before()`, share output across assertions.

**Warning signs:**

- CI test times out at the default 2s.
- Test fails with `Connection refused` from drizzle-kit trying to reach Postgres (only happens if `migrate` or `studio` was accidentally invoked instead of `generate`).

## Code Examples

See "Pattern 1-4" in the Architecture Patterns section above for the verified-pattern code examples. Each cites its source URL (Sentry filtering docs, Anthropic API docs, existing posthog.ts precedent, existing mount-order.test.ts precedent).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pre-v8 Sentry `Hub` API | `Sentry.withScope` + `Sentry.init({beforeSend})` | Sentry v8 release, v10 stabilized | Existing `vigil-core/src/lib/sentry.ts:25-29` already documents this (R9). GUARD-01.2 lands in the v10 idiom. |
| PostHog `before_send` snake_case (Phase 103) | Unchanged | — | Already correct. Phase 127 mirrors snake_case for PostHog and camelCase `beforeSend` for Sentry (per each SDK's convention). |
| Manual API key spend cap at the Anthropic console (Phase 126) | Per-user daily watermark INSIDE the app (Phase 127) | This phase | Workspace cap = absolute backstop ($500/mo prod, $20/mo dev). Per-user cap = fair-use guardrail (0.50/user/day). Two-cap-stacking pattern, both retained. |
| `MAX_AUDIO_B64_CHARS = 10 MB` for `/v1/process-audio` (Phase 99 era) | New `MAX_PCM_BYTES = 1_920_000` (≈2.56 MB base64) for `/v1/voice/transcribe` (Phase 130, helper landed in 127) | Phase 130 lands the route; Phase 127 lands the helper | The 10 MB cap stays for `/v1/process-audio` (different encoding, may be longer audio). The 2.56 MB cap is voice-specific. |

**Deprecated/outdated:**
- The "Phase 107.1 work_orders drift" framing in `STATE.md:389` and `PITFALLS.md` §7 paragraph 1. The drift was closed by `0013_work_orders_drift_repair.sql` (2026-04-22 per ROADMAP.md:308). Phase 127 should clean up these stale docs.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Claude Sonnet 4 pricing is $3/$15 per 1M input/output tokens (per CONTEXT D-03.3) [CITED: CONTEXT.md only — not re-verified against current Anthropic pricing page in this research session] | Pattern 3 / GUARD-03 cost math | Off-by-2× underestimates spend; users could burn through ~$1/day before tripping a $0.50 cap. Mitigation: prices are constants in code; an operator can adjust via a single-line edit + redeploy. Recommend the planner verify against `https://www.anthropic.com/pricing` at plan time. |
| A2 | The drizzle-kit no-change sentinel `No schema changes, nothing to migrate 😴` is stable across `drizzle-kit@0.31.x` minor versions [ASSUMED — verified live against 0.31.10 only] | Pitfall 1 / GUARD-04 verification | If a future drizzle-kit version changes the wording (e.g., drops the emoji, says "Schema in sync"), the migration-drift test silently passes when there IS drift. Mitigation: regex `/No schema changes/i` is more resilient. Pin the drizzle-kit minor version in package.json. |
| A3 | `process.env.VIGIL_DAILY_AI_BUDGET_USD` read at every `requireAiBudget` call (not cached) is acceptable performance [ASSUMED — Node env reads are cheap but the call is in the hot AI path] | Pattern 2 implementation | Negligible — `process.env` reads in Node are microsecond-class. Worth caching only if profiling shows >1% overhead. |
| A4 | `drizzle-kit generate` reads only `schema.ts` + `drizzle/meta/` without contacting the DB [VERIFIED live: succeeds with fake DATABASE_URL `postgres://noop@localhost/noop`] | Pitfall 10 | Already verified. |
| A5 | Sentry SDK v10's `beforeSend` runs synchronously before any network I/O; a slow `beforeSend` blocks the capture call site (but capture is fire-and-forget per `vigil-core/src/lib/sentry.ts:47` "fire-and-forget is the correct shape for captureException") [CITED: Sentry filtering docs + sentry.ts:47] | GUARD-01 perf | If `redactSentryEvent` is slow (e.g., huge breadcrumb arrays), the host request that triggered the exception is slowed. Mitigation: the redactor's recursive walk is O(keys) — for normal event shapes <50 keys, runtime is sub-millisecond. |
| A6 | The four `OsEventTypeList` enum integer values (`ABNORMAL_EXIT_EVENT=6`, `SYSTEM_EXIT_EVENT=7`) are stable across Even SDK versions [CITED: EVEN-SKILLS.md:18-29 against v0.0.10] | GUARD-02.3 cleanup wrapper | If the SDK renumbers, the listener doesn't fire. Mitigation: import the named enum constants from `@evenrealities/even_hub_sdk` instead of hard-coding integers. |
| A7 | `app.onError` ordering matters: an early `if (err instanceof DailyBudgetExceededError) return c.json(...)` must precede the captureException/captureToSentry calls [ASSUMED based on Hono's chain semantics — Hono's `app.onError` is a single handler, not a chain; early return short-circuits the function naturally] | Pitfall 5 | Standard JavaScript function-flow; no Hono-specific gotcha expected. |

**If this table feels long for a "structural rails" phase**, that's because two of the seven assumptions (A1, A2) are cost/correctness-critical and one (A6) is hardware-stability-critical. The remaining four are sanity checks.

## Open Questions

1. **Single-file vs split-file test layout for the three drift detectors**
   - What we know: CONTEXT.md leaves this to planner discretion. `mount-order.test.ts` set the precedent of one drift-detector per test file.
   - What's unclear: GUARD-01.4 specifies a SINGLE `audio-log-redaction.test.ts` with THREE assertions inside it. GUARD-04.3 specifies a SECOND file `migration-drift.test.ts`. That's two test files. The planner could collapse them into one `phase-127-guardrails.test.ts` for atomic CI behavior, OR keep two for blast-radius.
   - Recommendation: Keep two files. Test files-per-guard is the existing idiom; collapsing creates a "grab-bag test file" anti-pattern.

2. **Should `withBudgetTracking` accumulator INSERT be awaited or fire-and-forget?**
   - What we know: CONTEXT defers to planner. Default recommendation: awaited.
   - What's unclear: An awaited DB write inside the AI hot path adds ~5-20ms latency. The accumulator failure-mode is non-fatal (telemetry); so missing one row is acceptable. But if 1% of accumulators fail and accumulate budget under-counting, the cap drifts higher over time.
   - Recommendation: Awaited, with try/catch + log. Performance impact is sub-cost-budget noise.

3. **Should the PWA `BLOCKED_PROPERTY_NAMES` Set be imported from `vigil-core` or duplicated?**
   - What we know: CONTEXT D-01.5 says "Apply the same `beforeSend` redactor there" without specifying source-of-truth strategy.
   - What's unclear: `vigil-core` is a separate package; can `vigil-pwa` import from it? The repo structure is a monorepo, and `vigil-pwa/src/lib/api-error-codes.ts:50` references "Plan 09 (Sentry init) is independent" — suggesting PWA and core Sentry configs are intentionally decoupled.
   - Recommendation: Duplicate the Set in `vigil-pwa/src/analytics/posthog.ts` (which already exists with the 8 LOCKED keys per Phase 103), then add a CI test that asserts the two Sets are identical (read both files' source, parse the literals, compare). This is the same "drift-detector across files" pattern but applied to denylists.

4. **Should `users.timezone` exist for future per-user-TZ rollover?**
   - What we know: CONTEXT D-03.6 defers per-user-TZ. UTC global is fine for Phase 127.
   - What's unclear: When does per-user-TZ become required? Probably never — capture works regardless of cap state; AI features rolling over a few hours late is cosmetic.
   - Recommendation: Defer indefinitely. Document in `deferred-items.md` (not in `ai_usage_daily` schema comment).

5. **`drizzle-kit check` vs `drizzle-kit generate` for the migration-drift test**
   - What we know: `drizzle-kit check` exists (verified via `--help`); its purpose is "checks consistency of migrations folder" per the official docs.
   - What's unclear: Does `check` detect schema-vs-migration drift, or only intra-`drizzle/` consistency (i.e., journal vs snapshot files)? Need empirical verification.
   - Recommendation: Test both. If `check` detects schema drift, prefer it (faster, semantically clearer than parsing `generate` stdout). Fall back to `generate` if `check` only validates the migrations folder internally.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All test runs + drizzle-kit shell | ✓ | (project pinned) | — |
| `@sentry/node` | GUARD-01 server | ✓ | ^10.52.0 (already installed) | — |
| `@sentry/react` | GUARD-01 PWA | ✓ | ^10.52.0 (already installed) | — |
| `@anthropic-ai/sdk` | GUARD-03 token accounting | ✓ | ^0.88.0 (already installed) | — |
| `drizzle-kit` CLI | GUARD-04 drift detector | ✓ | ^0.31.10 (verified live: `drizzle-kit generate --help` succeeds) | — |
| `posthog-node` | GUARD-01 shared denylist | ✓ | (existing) | — |
| Postgres / DATABASE_URL | `drizzle-kit generate` in CI | Not required — drift detector works with fake URL `postgres://noop@localhost/noop` (verified live) | — | — |
| `@evenrealities/even_hub_sdk` | GUARD-02 G2 plugin cleanup wrapper | ✓ (v0.0.10 per EVEN-SKILLS.md) | 0.0.10 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

> This phase is dominated by drift-detector / source-grep tests + behavioral assertions on the cleanup wrapper + a `drizzle-kit generate` stdout-parse test. Nyquist signal-coverage framing: every guard has at least one test that fails CI if a future commit re-introduces the prevented pattern.

### Test Framework

| Property | Value |
|----------|-------|
| vigil-core framework | `node:test` + `node:assert/strict` (built-in) |
| vigil-pwa framework | Vitest (existing) |
| vigil-g2-plugin framework | `node:test` (per existing `vigil-g2-plugin/src/__tests__/*.test.ts`) |
| Config files | None for vigil-core; `vitest.config.ts` for PWA |
| Quick run command (vigil-core single file) | `cd vigil-core && npx tsx --test src/__tests__/audio-log-redaction.test.ts` |
| Quick run command (vigil-core all) | `cd vigil-core && npx tsx --test src/__tests__/*.test.ts src/**/*.test.ts` (note suite-hang risk per STATE.md:390 — run individual files) |
| Full suite command (vigil-pwa) | `cd vigil-pwa && pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GUARD-01 | `BLOCKED_PROPERTY_NAMES` contains all 6 audio keys | unit (Set membership) | `cd vigil-core && npx tsx --test src/__tests__/audio-log-redaction.test.ts` | ❌ Wave 0 |
| GUARD-01 | `BLOCKED_PROPERTY_NAMES.size === 14` (LOCKED 8 + EXTENSION 6) | unit (size assertion) | (same as above) + `cd vigil-core && npx tsx --test src/analytics/posthog.test.ts` | ❌ Wave 0 (existing test bumped from 8 → 14) |
| GUARD-01 | `Sentry.init({...})` body contains `beforeSend` symbol | drift-detector (source-grep) | `cd vigil-core && npx tsx --test src/__tests__/audio-log-redaction.test.ts` | ❌ Wave 0 |
| GUARD-01 | `redactSentryEvent` correctly strips `event.extra`, `event.contexts.*`, `event.breadcrumbs[].data` | unit (pure-function) | `cd vigil-core && npx tsx --test src/lib/sentry.test.ts` | ❌ Wave 0 (new it-blocks added to existing file) |
| GUARD-01 | No source file in `routes\|lib\|ai\|middleware` contains `console.*(audio\|pcm)` | drift-detector (source-grep) | `cd vigil-core && npx tsx --test src/__tests__/audio-log-redaction.test.ts` | ❌ Wave 0 |
| GUARD-01 | PWA Sentry init also registers `beforeSend` | unit (PWA-side) | `cd vigil-pwa && pnpm test src/main.test.tsx` (or new sentry-redact.test.ts) | ❌ Wave 0 |
| GUARD-02 | `assertAudioSessionWithinCap(b64)` rejects > 2_560_000 chars with 413 | unit | `cd vigil-core && npx tsx --test src/lib/audio-cap.test.ts` | ❌ Wave 0 |
| GUARD-02 | `safeAudioControl(true)` registers cleanup on first call; idempotent on subsequent calls | unit (G2-plugin) | `cd vigil-g2-plugin && npx tsx --test src/lib/audio-session-guard.test.ts` | ❌ Wave 0 |
| GUARD-02 | Cleanup fires on `osEvent.eventType === ABNORMAL_EXIT_EVENT` | unit (mocked SDK event) | (same as above, separate it-block) | ❌ Wave 0 |
| GUARD-02 | Cleanup fires on `osEvent.eventType === SYSTEM_EXIT_EVENT` | unit (mocked SDK event) | (same) | ❌ Wave 0 |
| GUARD-02 | Cleanup fires on `window.dispatchEvent(new Event("beforeunload"))` | unit (mocked DOM event) | (same) | ❌ Wave 0 |
| GUARD-02 | `onBackgroundRestore` cleanup fires when snapshot.audioActive === true | unit (mocked SDK restore) | (same) | ❌ Wave 0 |
| GUARD-02 | `AUDIO_SESSION_TOO_LONG` key exists in `ERROR_CODE_MAP` EXTENSION block | unit (Vitest pin) | `cd vigil-pwa && pnpm test src/lib/api-error-codes.test.ts` | ❌ Wave 0 (new it-block in existing file) |
| GUARD-03 | `ai_usage_daily` table exists with correct columns + PK | integration (Postgres) | manual `psql` or `db:migrate-prod` + integration test (deferred to plan) | ❌ Wave 0 |
| GUARD-03 | `requireAiBudget(userId)` reads `(user_id, usage_date=CURRENT_DATE)` row and throws if >= cap | unit (Drizzle + in-mem PG mock) | `cd vigil-core && npx tsx --test src/lib/ai-budget.test.ts` | ❌ Wave 0 |
| GUARD-03 | `withBudgetTracking(userId, fn)` accumulates `usd_estimate` after `messages.create` returns `usage` | unit (mocked SDK + db) | `cd vigil-core && npx tsx --test src/ai/client.test.ts` | ❌ Wave 0 |
| GUARD-03 | `app.onError` translates `DailyBudgetExceededError` to 429 + `code: "DAILY_AI_BUDGET_EXCEEDED"` AND does NOT call captureToSentry/captureException for it | unit (mocked Sentry/PostHog spies) | `cd vigil-core && npx tsx --test src/__tests__/app-on-error.test.ts` | ❌ Wave 0 |
| GUARD-03 | `DAILY_AI_BUDGET_EXCEEDED` key exists in `ERROR_CODE_MAP` EXTENSION block | unit (Vitest pin) | `cd vigil-pwa && pnpm test src/lib/api-error-codes.test.ts` | ❌ Wave 0 |
| GUARD-03 | `ai_usage_daily` queries in `requireAiBudget` filter by `eq(table.userId, userId)` | drift-detector (W-01 grep) | `cd vigil-core && npx tsx --test src/__tests__/cross-user-isolation.test.ts` | ✓ exists (extend allowlist) |
| GUARD-04 | `drizzle-kit generate` against current schema prints `No schema changes, nothing to migrate` | drift-detector (shell + stdout parse) | `cd vigil-core && npx tsx --test src/__tests__/migration-drift.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** Run the specific test file edited or created in that task.
- **Per wave merge:** Run the full vigil-core test directory: `cd vigil-core && find src -name "*.test.ts" -exec npx tsx --test {} +` (sequential per-file to dodge the suite-hang per STATE.md:390). Also `cd vigil-pwa && pnpm test`. Also `cd vigil-g2-plugin && npx tsx --test src/__tests__/*.test.ts src/lib/*.test.ts`.
- **Phase gate:** All four suites green BEFORE `/gsd-verify-work`. Plus `cd vigil-core && DATABASE_URL=postgres://noop@localhost/noop npx drizzle-kit generate` returns `No schema changes, nothing to migrate 😴` (verified manually as final sanity check).

### Wave 0 Gaps

- [ ] `vigil-core/src/__tests__/audio-log-redaction.test.ts` — covers GUARD-01 (three rails)
- [ ] `vigil-core/src/lib/sentry.test.ts` — extend with `beforeSend` registration + `redactSentryEvent` unit pin (file exists; add it-blocks)
- [ ] `vigil-core/src/analytics/posthog.test.ts` — extend `expected` Set from 8 → 14 keys (file exists; bump assertion)
- [ ] `vigil-core/src/lib/audio-cap.test.ts` — covers GUARD-02 server cap
- [ ] `vigil-core/src/lib/ai-budget.test.ts` — covers GUARD-03 budget helper + DailyBudgetExceededError
- [ ] `vigil-core/src/ai/client.test.ts` — covers GUARD-03 withBudgetTracking wrapper (new file; client.ts has no tests today)
- [ ] `vigil-core/src/__tests__/app-on-error.test.ts` — covers GUARD-03 app.onError 429 translation + no-Sentry-sink for budget errors
- [ ] `vigil-core/src/__tests__/migration-drift.test.ts` — covers GUARD-04 drift detector
- [ ] `vigil-core/src/__tests__/cross-user-isolation.test.ts` — extend W-01 grep allowlist with `ai_usage_daily` table
- [ ] `vigil-pwa/src/lib/api-error-codes.test.ts` — extend with two new EXTENSION key pins (`AUDIO_SESSION_TOO_LONG`, `DAILY_AI_BUDGET_EXCEEDED`)
- [ ] `vigil-pwa/src/lib/sentry-redact.test.ts` — covers GUARD-01.5 PWA-side redactor (or merge into main.test.tsx if one exists)
- [ ] `vigil-g2-plugin/src/lib/audio-session-guard.test.ts` — covers GUARD-02.3 (four exit events)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (existing) | `bearerAuth` dispatcher at `index.ts:166`; no Phase 127 change |
| V3 Session Management | yes (existing) | JWT-based; no Phase 127 change |
| V4 Access Control | yes | `requireAiBudget(userId)` is access-control-shaped (per-user rate limit / budget cap); `c.get("userId")` never trusts body/query (Phase 121 D-D2 lock); composite-PK `(user_id, usage_date)` is the W-01 cross-user-isolation pattern |
| V5 Input Validation | yes | `assertAudioSessionWithinCap(b64)` validates HTTP body size BEFORE any decode (defense-in-depth at HTTP ingress); `ERROR_CODE_MAP` LOCKED enum prevents arbitrary code injection from server errors |
| V6 Cryptography | no | Phase 127 ships no crypto |
| V7 Error Handling & Logging | **yes (primary)** | GUARD-01 is entirely V7-shaped: redaction at every log boundary, drift-detector for new offenders, separate redactor for each runtime (Node Sentry + Browser Sentry) |
| V8 Data Protection | yes | GUARD-01 redacts audio PCM (sensitive biometric data) before it can leave the process; GUARD-02 caps PCM payload size to prevent log-volume DoS; `sendDefaultPii: false` already set in Sentry init |
| V13 API & Web Service | yes | New HTTP 429 + 413 status codes with locked-enum codes (`DAILY_AI_BUDGET_EXCEEDED`, `AUDIO_SESSION_TOO_LONG`) match REST semantics; rate-limit-style budget cap is V13.2-flavored |

### Known Threat Patterns for vigil-core + vigil-pwa + vigil-g2-plugin stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Audio PCM leak to Sentry / PostHog | Information Disclosure | GUARD-01 redaction at three rails (denylist, beforeSend, drift detector) |
| Runaway G2 mic open → unsolicited audio capture | Information Disclosure + Privacy violation | GUARD-02 server cap + plugin watchdog (`safeAudioControl` cleanup on 4 exit events) |
| Single user burns workspace AI cap | Denial of Service (affecting other users via budget exhaustion) | GUARD-03 per-user daily watermark (defense in depth alongside Phase 126 workspace cap) |
| Cross-user data read via predictable PK | Elevation of Privilege (W-01) | Composite PK `(user_id, usage_date)` on `ai_usage_daily`; W-01 grep test |
| Schema drift → deploy ships unintended SQL | Tampering | GUARD-04 drift-detector test in CI |
| Budget-exceeded errors flooding Sentry | DoS of monitoring budget | Pitfall 5: app.onError branches on `DailyBudgetExceededError` BEFORE Sentry sink |
| `console.log(event)` smuggles audio bytes | Information Disclosure | GUARD-01.4 source-grep drift detector |
| Stale token-counting accumulator → budget cap drifts upward | Tampering (silent) | Pitfall 4: drift-detector pinning every `*.messages.create` is wrapped in `withBudgetTracking` |

## Sources

### Primary (HIGH confidence — verified live or against source files at exact line numbers cited in CONTEXT.md)

- `vigil-core/src/analytics/posthog.ts:32` — `BLOCKED_PROPERTY_NAMES` Set source-of-truth + D-14 export rationale at lines 6-8
- `vigil-core/src/analytics/posthog.ts:54-77` — `redactEvent` precedent for mirroring into Sentry
- `vigil-core/src/analytics/posthog.test.ts:91-117` — locked-enum Set size assertion (8 keys, Phase 127 bumps to 14)
- `vigil-core/src/lib/sentry.ts` (entire file) — `initSentry` body and the v10 `Sentry.withScope` canonical pattern at lines 78-89
- `vigil-core/src/lib/sentry.test.ts` (entire file) — existing test scaffold for Sentry; Phase 127 adds `beforeSend` pin
- `vigil-core/src/routes/process-audio.ts:58-62` — `MAX_AUDIO_B64_CHARS` precedent for GUARD-02 cap
- `vigil-core/src/routes/process-audio.ts:82-115` — direct `ai.beta.files.upload` + `ai.beta.messages.create` site (Pitfall 4 trigger)
- `vigil-core/src/ai/client.ts` (entire file) — Anthropic SDK chokepoint (4 exports, 3 wrappers + getter)
- `vigil-core/src/index.ts:166` — bearerAuth dispatcher mount site
- `vigil-core/src/index.ts:265-280` — `app.onError` handler (Sentry + PostHog dual-sink site)
- `vigil-core/src/db/schema.ts:262-282` — `workOrders` table (drift columns at 275-279 — already migrated)
- `vigil-core/src/routes/work-orders.ts:100-235` — proves drift columns are live in prod
- `vigil-core/drizzle/0013_work_orders_drift_repair.sql:6-12` — **the migration that closed the Phase 107.1 drift** (Pitfall 2 verification)
- `vigil-core/drizzle/0019_add_users_quiet_mode.sql` — latest migration (next slot is 0020)
- `vigil-core/drizzle/meta/0019_snapshot.json:1707-1738` — current snapshot proves all four drift columns are present
- `vigil-core/drizzle.config.ts` — config schema-only; no DB connection needed for `generate`
- `vigil-core/src/__tests__/mount-order.test.ts` (entire file) — drift-detector test pattern
- `vigil-pwa/src/lib/api-error-codes.ts:83-138` — LOCKED + EXTENSION block; the additivity contract
- `vigil-pwa/src/lib/api-error-codes.test.ts:61-78` — locked-enum pin test pattern
- `vigil-pwa/src/main.tsx:15-21` — current PWA Sentry init (Phase 127 adds `beforeSend`)
- `vigil-core/package.json` — `@sentry/node ^10.52.0`, `@anthropic-ai/sdk ^0.88.0`, `drizzle-kit ^0.31.10`, `drizzle-orm ^0.45.2`
- `vigil-pwa/package.json` — `@sentry/react ^10.52.0`
- `.planning/research/EVEN-SKILLS.md:46-90` — Even SDK exit events + setBackgroundState verbatim
- `.planning/research/EVEN-SKILLS.md:100-118` — Even SDK PCM format lock
- `.planning/research/PITFALLS.md:200-235` (§7) — schema drift pitfall (stale framing; see Pitfall 2)
- `.planning/research/PITFALLS.md:1-110` (§§1-3) — audio leak, runaway mic, cost amplification — direct motivations for GUARD-01/02/03
- `.planning/research/ARCHITECTURE.md:54-61` — load-bearing invariants v3.9 must preserve
- `.planning/REQUIREMENTS.md:16-19` — GUARD-01..04 verbatim
- `.planning/ROADMAP.md:358-367` — Phase 127 goal + success criteria
- `.planning/STATE.md:389` — stale "Phase 107.1 work_orders drift" entry (Pitfall 2)

### Secondary (MEDIUM confidence — official vendor docs)

- [Sentry — Filtering for Node.js](https://docs.sentry.io/platforms/javascript/guides/node/configuration/filtering/) — `beforeSend(event, hint) => event | null` signature + sanitization examples
- [Sentry — Developer Hooks docs](https://develop.sentry.dev/sdk/foundations/client/hooks/) — hint shape, return-null discard semantics
- [Anthropic — Messages API reference](https://docs.anthropic.com/en/api/messages) — `response.usage.input_tokens` / `output_tokens` shape
- [Drizzle — Generate command docs](https://orm.drizzle.team/docs/drizzle-kit-generate) — enumerates all generate flags (NO `--dry`); confirmed Pitfall 1
- [Drizzle issue #5059](https://github.com/drizzle-team/drizzle-orm/issues/5059) — `drizzle-kit ci` / `--diff` feature is open, no PR, no timeline; confirmed Pitfall 1

### Tertiary (Live verification)

- `cd vigil-core && DATABASE_URL=postgres://noop@localhost/noop npx drizzle-kit generate --name probe_dry` 2026-05-11 → stdout `No schema changes, nothing to migrate 😴`; zero new files in `drizzle/`
- `cd vigil-core && npx drizzle-kit generate --help` 2026-05-11 → flags enumerated; no `--dry`
- `cd vigil-core && npx drizzle-kit --help` 2026-05-11 → subcommands enumerated (`check` exists)
- `cd vigil-core && npx drizzle-kit check --help` 2026-05-11 → flags enumerated (`--config / --dialect / --out`)

## Metadata

**Confidence breakdown:**
- Standard stack — HIGH — all package versions read live from `package.json` 2026-05-11
- Architecture patterns — HIGH — all four patterns mirror existing source code at cited line numbers
- Pitfalls — HIGH — Pitfalls 1, 2, 10 verified live by running drizzle-kit commands; Pitfalls 3, 5, 6 verified against source line numbers; Pitfalls 4, 7, 8, 9 derived from CONTEXT.md + EVEN-SKILLS.md
- Validation architecture — HIGH — node:test pattern proven by `mount-order.test.ts`; PWA Vitest pattern proven by `api-error-codes.test.ts`
- Security domain — HIGH — STRIDE patterns match existing v3.8 threat-model awareness (sentry.ts:43-47 PII defenses)

**Research date:** 2026-05-11
**Valid until:** 2026-06-10 (30-day shelf life — stable stack, no fast-moving deps)

**Two corrective findings the planner MUST surface to the user before locking the plan:**
1. `drizzle-kit generate --dry` is fictional — use stdout-sentinel parsing of `drizzle-kit generate` (no flag) instead.
2. The Phase 107.1 `work_orders` drift was already migrated by `0013_work_orders_drift_repair.sql` (2026-04-22). GUARD-04 should be re-scoped to a drift-detector test + STATE.md cleanup, NOT a new `0020_reconcile_*` migration.
