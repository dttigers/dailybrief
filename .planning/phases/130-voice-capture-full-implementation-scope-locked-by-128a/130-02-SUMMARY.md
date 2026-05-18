---
phase: 130
plan: 02
subsystem: voice-capture
tags: [voice-transcribe, openai, dedup, migration-0023, error-taxonomy, sse-shim, VOICE-05]
dependency_graph:
  requires:
    - "Phase 130 Plan 01 — clean spike-removal baseline (no /v1/voice/transcribe route mounted)"
    - "Phase 127 guardrails (audio-session-guard, ai-budget, audio-cap) — D-C3 carry-forward"
    - "Phase 128a SPIKE-DECISION PASS — locks gpt-4o-mini-transcribe (D-U2)"
  provides:
    - "POST /v1/voice/transcribe production route — bearerAuth + email-verified + AI-budget + 60s cap + dedup + OpenAI transcribe + thought insert + triage"
    - "voice_captures dedup table + composite partial unique index (Plans 03-05 consume the table)"
    - "Three locked-enum error classes funneled through app.onError (504/502/503)"
    - "withOpenAIBudgetTracking duration-based accumulator wired against the existing $0.50/user/day cap"
    - "bus.emitThoughtCreated SHIM call site (Plan 03 wires the listener triple + agent-stream SSE subscriber)"
  affects:
    - "vigil-core/src/index.ts (route mount + app.onError translation table — 4 new branches)"
    - "vigil-core/src/db/schema.ts (voiceCaptures table export)"
    - "vigil-core/drizzle/ (migration 0023 + snapshot + journal entry)"
    - "vigil-core/src/analytics/posthog.ts (SENSITIVE_ROUTES extension)"
    - "vigil-core/src/lib/agent-events-bus.ts (emitThoughtCreated SHIM, channel constant)"
    - "vigil-core/src/lib/ai-budget.ts (withOpenAIBudgetTracking + OPENAI_TRANSCRIBE_PRICE_PER_SEC)"
tech_stack:
  added: []
  patterns:
    - "DI factory + production singleton (mirror captures-screenshot.ts:155-165)"
    - "Strict call order (requireAiBudget → body → cap → dedup → transcribe → INSERT → emit) per RESEARCH Pitfall 3"
    - "AbortController 30s timeout + error funneling (AbortError → Timeout, status 429 / /quota/i → Quota, rest → ProviderDown)"
    - "Hand-crafted migration SQL with IF NOT EXISTS + partial unique WHERE clause (Drizzle uniqueIndex cannot express WHERE)"
    - "withOpenAIBudgetTracking — duration-based accumulator distinct from token-based withBudgetTracking"
key_files:
  created:
    - "vigil-core/drizzle/0023_voice_capture_dedup.sql"
    - "vigil-core/drizzle/meta/0023_snapshot.json"
    - "vigil-core/src/routes/voice-transcribe.ts"
    - "vigil-core/src/routes/voice-errors.ts"
    - "vigil-core/src/ai/transcribe.ts"
    - "vigil-core/src/routes/__tests__/voice-transcribe.test.ts"
  modified:
    - "vigil-core/src/db/schema.ts"
    - "vigil-core/src/index.ts"
    - "vigil-core/src/lib/ai-budget.ts"
    - "vigil-core/src/lib/ai-budget.test.ts"
    - "vigil-core/src/lib/agent-events-bus.ts"
    - "vigil-core/src/analytics/posthog.ts"
    - "vigil-core/src/__tests__/app-on-error.test.ts"
    - "vigil-core/drizzle/meta/_journal.json"
decisions:
  - "D-U2/D-U3/D-U4 enforced verbatim — OpenAI gpt-4o-mini-transcribe, JSON-base64 endpoint shape, voice_captures sibling table"
  - "Migration 0023 hand-crafted (Drizzle generate + rename pattern): journal+snapshot from drizzle-kit generate, SQL replaced with our IF NOT EXISTS + partial unique WHERE version, tag renamed from 0023_eminent_mephistopheles → 0023_voice_capture_dedup"
  - "D-E1 locked-enum codes literal: VOICE_TRANSCRIBE_TIMEOUT (504), VOICE_TRANSCRIBE_PROVIDER_DOWN (502), VOICE_TRANSCRIBE_QUOTA (503)"
  - "Gray Area #5 — 30s OpenAI timeout (16× spike p95 headroom)"
  - "bus.emitThoughtCreated lands as SHIM in this plan (channel constant + emit-only method); Plan 03 promotes to full triple + three-channel cleanup gate"
  - "withOpenAIBudgetTracking is a distinct helper, NOT a generalization of withBudgetTracking — OpenAI duration-based vs Anthropic token-based pricing requires different call shapes (RESEARCH Anti-Patterns §'Using withBudgetTracking for OpenAI without adapting the accumulator')"
  - "Rule 2 deviation — app-on-error.test.ts drift-detector mirror extended to cover 4 new branches (AudioSessionTooLongError + 3 VOICE_TRANSCRIBE_*); maintains regression coverage for the production translation table"
metrics:
  duration_minutes: 21
  completed_date: "2026-05-18"
  tasks_completed: 3
  files_created: 6
  files_modified: 8
  lines_changed: ~750
---

# Phase 130 Plan 02: Voice Transcribe Production Route Summary

**One-liner:** Production `POST /v1/voice/transcribe` with bearerAuth + email-verified + per-user AI-budget + 60s audio cap + clientCaptureId dedup + OpenAI gpt-4o-mini-transcribe (30s AbortController, locked-enum 504/502/503 error funneling) + thoughts insert (`source='g2_voice'`) + voice_captures dedup row + bus.emitThoughtCreated SHIM + fire-and-forget triage.

## What Shipped

Plan 02 closes VOICE-05 server-side and lands the VOICE-06 D-E1 locked-enum error taxonomy. The G2 plugin (Plans 04-05), the SSE listener triple (Plan 03), and the PWA error-codes extension (Plan 03) all hang off the contracts established here.

### Task 1 — Wave 0 RED tests (commit `cf579d4`)

Two test files authored:

| File | Purpose | Tests |
|---|---|---|
| `vigil-core/src/routes/__tests__/voice-transcribe.test.ts` | Route + dedup + error funneling | 9 (T1 happy, T2 dedup, T3-5 transcribe errors, T6 budget, T7 audio-cap, T8 missing-id, T9 no-auth) |
| `vigil-core/src/lib/ai-budget.test.ts` (extended) | withOpenAIBudgetTracking duration-based accumulator | 3 (A round-trip, B idempotent retry, C accumulator non-fatal) |

All 12 tests RED at task end — `voice-transcribe.ts`, `voice-errors.ts`, `transcribeWav`, `withOpenAIBudgetTracking`, and `voiceCaptures` schema export did NOT exist.

### Task 2 — Migration 0023 + voiceCaptures schema (commit `6e370b5`)

`vigil-core/drizzle/0023_voice_capture_dedup.sql`:

```sql
CREATE TABLE IF NOT EXISTS "voice_captures" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "thought_id" integer REFERENCES "thoughts"("id") ON DELETE SET NULL,
  "client_capture_id" text NOT NULL,
  "queued_at" timestamptz NOT NULL DEFAULT now(),
  "retry_count" integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_voice_captures_user_client_capture_id"
  ON "voice_captures" ("user_id", "client_capture_id")
  WHERE "client_capture_id" IS NOT NULL;
```

`vigil-core/src/db/schema.ts` — appended the `voiceCaptures = pgTable("voice_captures", { ... })` export with matching columns + foreign keys. The partial WHERE clause on the unique index lives only in the migration SQL (Drizzle's `uniqueIndex` helper cannot express it — RESEARCH Anti-Patterns §"Drizzle-kit auto-generate for migration 0023").

Applied locally via `npm run db:migrate`. Second run is idempotent (`migrations applied successfully` with no SQL executed for tables/indexes that already exist).

Verified post-apply with `psql \d voice_captures`:
- 6 columns present (id, user_id, thought_id, client_capture_id, queued_at, retry_count)
- Two foreign keys present (user_id → users.id CASCADE, thought_id → thoughts.id SET NULL)
- Partial unique index `uq_voice_captures_user_client_capture_id` listed with `WHERE client_capture_id IS NOT NULL` predicate

**Migration journal handling:** `drizzle-kit generate` was run first to produce the journal entry + snapshot (it auto-named the migration `0023_eminent_mephistopheles`); the auto-generated SQL was then DELETED and replaced with our hand-crafted version, and the journal tag was renamed to `0023_voice_capture_dedup` for naming consistency with the convention in 0021/0022. The snapshot at `drizzle/meta/0023_snapshot.json` is auto-generated and matches the table shape — Drizzle's migrator uses the journal `tag` field to find the matching SQL file by basename, so the rename is safe.

### Task 3 — Production route + OpenAI helper + error classes + budget adapter (commit `5c4127f`)

**Six new/modified production files + 3 test files:**

`vigil-core/src/routes/voice-errors.ts` — three error classes mirroring `DailyBudgetExceededError` shape (locked `readonly code`, `name` set explicitly for cross-module `instanceof`):

```typescript
export class VoiceTranscribeTimeoutError extends Error {
  public readonly code = "VOICE_TRANSCRIBE_TIMEOUT" as const;
  constructor(message: string = "OpenAI transcription timed out after 30s") { ... }
}
// + VoiceTranscribeProviderDownError + VoiceTranscribeQuotaError
```

`vigil-core/src/ai/transcribe.ts`:
- `getTranscribeClient(): OpenAI | null` — lazy-init mirroring `ai/client.ts` (returns null when `OPENAI_API_KEY` unset; never crashes at module load).
- `transcribeWav(wav: Buffer): Promise<{text, durationMs}>`:
  - 30s `AbortController` timeout (RESEARCH Gray Area #5 — 16× spike p95 headroom).
  - Calls `ai.audio.transcriptions.create({ file: toFile(wav, "audio.wav", { type: "audio/wav" }), model: "gpt-4o-mini-transcribe" }, { signal })`.
  - Catches: `name === "AbortError"` OR `code === "ABORT_ERR"` → `VoiceTranscribeTimeoutError`; `status === 429` OR `/quota/i` → `VoiceTranscribeQuotaError`; otherwise → `VoiceTranscribeProviderDownError`.
  - `finally { clearTimeout }` to prevent leaked timers on early returns.

`vigil-core/src/lib/ai-budget.ts` — appended `withOpenAIBudgetTracking(userId, durationMs, fn)`:
- `OPENAI_TRANSCRIBE_PRICE_PER_SEC = 0.003 / 60` (locked).
- Runs `fn()` first, then accumulates `usd = (durationMs/1000) × rate` via the same `INSERT … ON CONFLICT (user_id, usage_date) DO UPDATE` shape as the Anthropic-side `withBudgetTracking`.
- Failure is non-fatal — `console.error("[vigil-core] withOpenAIBudgetTracking accumulator failed (non-fatal):", err)` matches the existing convention.
- Skips INSERT when `usd === 0 || !db` (avoids zero-impact writes / local-dev no-DB shape).

`vigil-core/src/lib/agent-events-bus.ts` — added `THOUGHT_CREATED_NAME = "thought-created"` channel constant + `emitThoughtCreated(userId, payload)` SHIM. No `on/off` triple yet — Plan 03 wires those plus extends the joint cleanup gate to three channels.

`vigil-core/src/routes/voice-transcribe.ts` — production route with DI factory:

```typescript
export function createVoiceTranscribeRoute(deps: Partial<VoiceTranscribeDeps> = {}): Hono { ... }
export const voiceTranscribe = createVoiceTranscribeRoute();
```

Strict call order per RESEARCH Pitfall 3 (DoS guard — never let body decode happen before cap check):

1. `userId = c.get("userId") as number` (T-130-02-S — never from body)
2. `await requireAiBudgetFn(userId)` — pre-flight throw on cap exceed (DailyBudgetExceededError → 429)
3. `await c.req.json()` — body parse + validate `{audio, clientCaptureId}` shape (400 on missing)
4. `assertAudioSessionWithinCap(audio)` — throws AudioSessionTooLongError → 413 on overcap base64
5. `SELECT voice_captures WHERE (userId, clientCaptureId) LIMIT 1` — dedup short-circuit BEFORE OpenAI call (cost guard). On hit, SELECT the existing thought and return `{ thoughtId, content }` with 200.
6. `Buffer.from(audio, "base64")` + `durationMs = (wav.length - 44) / 32` (estimate from PCM byte count) + `withOpenAIBudgetTracking(userId, durationMs, () => transcribeWavFn(wav))` — OpenAI call wrapped in duration-based accumulator
7. `INSERT thoughts { userId, content: text, source: "g2_voice", cloudKitRecordID }` returning
8. `INSERT voice_captures { userId, thoughtId, clientCaptureId }` (the dedup row)
9. `bus.emitThoughtCreated(userId, { thoughtId, content })` — AFTER db commit (Pitfall 6 — never inside a transaction)
10. `runTriageFn(userId, thoughtId, content)` — fire-and-forget (mirrors process-audio.ts:171-194)
11. `return c.json({ thoughtId, content }, 201)`

`vigil-core/src/index.ts`:
- Imported `voiceTranscribe` + mounted at `/v1` (after bearerAuth dispatcher + metricsMiddleware — silent-auth-bypass mitigation).
- Imported `AudioSessionTooLongError` + three `VoiceTranscribe*Error` classes.
- Extended `app.onError` translation table with 4 new branches:
  - `AudioSessionTooLongError` → 413 + `code: "AUDIO_SESSION_TOO_LONG"`
  - `VoiceTranscribeTimeoutError` → 504 + `code: "VOICE_TRANSCRIBE_TIMEOUT"`
  - `VoiceTranscribeProviderDownError` → 502 + `code: "VOICE_TRANSCRIBE_PROVIDER_DOWN"`
  - `VoiceTranscribeQuotaError` → 503 + `code: "VOICE_TRANSCRIBE_QUOTA"`
- All four branches ordered BEFORE the Sentry/PostHog sinks (Pitfall 5 — deliberate business-rule rejections must not burn Sentry quota).

`vigil-core/src/analytics/posthog.ts` — added `"/v1/voice/transcribe"` to `SENSITIVE_ROUTES`. `BLOCKED_PROPERTY_NAMES` already covers `audio`, `audioPcm`, `audio_pcm`, `pcm`, `audioBuffer`, `audio_buffer` from Phase 127 GUARD-01 — no addition needed.

`vigil-core/src/__tests__/app-on-error.test.ts` — extended drift-detector mirror to cover the 4 new branches. Added 4 new test cases (each asserts the typed error → locked-enum HTTP code + zero Sentry/PostHog sink calls).

## Verification Results

### Tests

```
voice-transcribe.test.ts       9/9   GREEN
ai-budget.test.ts (new A/B/C)  3/3   GREEN (pre-existing Test 6 documented in deferred-items.md)
app-on-error.test.ts           6/6   GREEN (2 existing + 4 new branches)
agent-events-bus.test.ts      12/12  GREEN (no regression from SHIM method)
agent-stream.test.ts          12/12  GREEN (no regression — fake bus doesn't need emitThoughtCreated)
captures-screenshot.test.ts   10/10  GREEN (no regression)
```

### Build

- `cd vigil-core && npx tsc --noEmit` → exit 0
- `cd vigil-core && npm run build` → exit 0 (tsc + tsc -p tsconfig.scripts.json both clean)
- `cd vigil-g2-plugin && npx tsc --noEmit` → exit 0
- vigil-pwa `tsc --noEmit` TS6305 errors are pre-existing build artifacts; not introduced by this plan (confirmed via `git stash` on pre-130-02 tree).

### Migration

```
$ cd vigil-core && npm run db:migrate  # first run
[✓] migrations applied successfully!

$ cd vigil-core && npm run db:migrate  # idempotent re-run
[✓] migrations applied successfully!  (no SQL run for IF NOT EXISTS branches)

$ psql $DATABASE_URL -c "\d voice_captures"
# 6 columns + 2 FKs + partial unique index present
```

### Acceptance Criteria (Plan 02)

All acceptance criteria from `<acceptance_criteria>` blocks verified:

- ✅ `voice-errors.ts` exports three error classes with locked `readonly code` literals (`VOICE_TRANSCRIBE_TIMEOUT/PROVIDER_DOWN/QUOTA`)
- ✅ `transcribe.ts` exports `transcribeWav` returning `Promise<{text, durationMs}>`, references `gpt-4o-mini-transcribe`, uses `AbortController` with `30_000` ms timeout
- ✅ `voice-transcribe.ts` contains the literals `bus.emitThoughtCreated(`, `withOpenAIBudgetTracking(`, `source: "g2_voice"`
- ✅ `ai-budget.ts` exports `withOpenAIBudgetTracking` AND contains `0.003 / 60` rate constant
- ✅ `index.ts` contains `voiceTranscribe` import + `app.route("/v1", voiceTranscribe)` mount
- ✅ `index.ts` has the three new `app.onError` branches for VoiceTranscribe*Error → 504/502/503
- ✅ `posthog.ts` SENSITIVE_ROUTES contains `"/v1/voice/transcribe"`
- ✅ `cd vigil-core && npm test -- --test-name-pattern="voice-transcribe"` — 9/9 pass (exit 0)
- ✅ `cd vigil-core && npm test -- --test-name-pattern="ai-budget"` — 14/15 pass; the 1 failure is the pre-existing Test 6 ("secondary assertion") documented as deferred Issue #3.
- ✅ Migration 0023 applied locally; voice_captures table + partial unique index present
- ✅ Both `npm run db:migrate` invocations exit 0 (idempotent)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Migration journal handling required `drizzle-kit generate` first**

- **Found during:** Task 2 — initial `npm run db:migrate` was a no-op even though our hand-crafted SQL was in place
- **Issue:** The Drizzle migrator only runs migration SQL files registered in `drizzle/meta/_journal.json`. A bare `0023_voice_capture_dedup.sql` placed in the directory is not enough — the migrator looks up `entries[].tag` and reads that filename. The plan's `<read_first>` block said "do NOT use drizzle-kit generate" but the journal entry still needed to exist for the migrator to find our SQL.
- **Fix:** Ran `npm run db:generate` to create the journal entry + snapshot file (it auto-named the migration `0023_eminent_mephistopheles`). Then DELETED the auto-generated SQL and put our hand-crafted version in `0023_voice_capture_dedup.sql`. Renamed the journal `tag` from `0023_eminent_mephistopheles` → `0023_voice_capture_dedup` for naming consistency. The snapshot itself is auto-generated and tracks the table shape — our hand-crafted SQL produces a table that matches the snapshot, so this is consistent.
- **Files modified:** `vigil-core/drizzle/meta/_journal.json` (tag renamed), `vigil-core/drizzle/meta/0023_snapshot.json` (auto-generated)
- **Commit:** `6e370b5`

**2. [Rule 2 - drift-detector hygiene] Extended `app-on-error.test.ts` to mirror new branches**

- **Found during:** Task 3 verification
- **Issue:** The Phase 127 Plan 05.1b test file `vigil-core/src/__tests__/app-on-error.test.ts` is a regression net for the Pitfall 5 lock ("DailyBudgetExceededError must NOT sink to Sentry/PostHog"). Its `buildTestApp` body is an EXACT MIRROR of the production `app.onError` handler. Adding 4 new production branches (1 audio-cap + 3 voice-transcribe) without updating the mirror would silently weaken the regression net — the mirror would still pass even if the production branches were reordered/removed.
- **Fix:** Added 4 new throw-routes (one per error class) + extended the mirror's `testApp.onError` body to include the 4 new translation branches + added 4 new test cases asserting `<typed throw → locked-enum code + zero sink calls>` for each.
- **Files modified:** `vigil-core/src/__tests__/app-on-error.test.ts`
- **Commit:** `5c4127f`

## Deferred Issues

Tracked in `.planning/phases/130-voice-capture-full-implementation-scope-locked-by-128a/deferred-items.md`:

1. **Pre-existing ai-budget Test 6 ("secondary assertion") fails under `npm test`** — Added as deferred item #3. The Phase 127 Plan 05 Task 3 test assumes `DATABASE_URL` is set during the test run (which it is under `npm run dev` shape `tsx --env-file=.env`, but NOT under bare `npm test`). The production code's `if (usd > 0 && db)` short-circuit is correct (no-op when db is null); only the test's "FK error → console.error sentinel" assertion is conditional on db being bound. My new Test C uses the same shape but wraps the sentinel assertion in `if (process.env.DATABASE_URL)` to handle both shapes.
2. **vigil-core test runner does not terminate cleanly under npm test** — Carried forward from Plan 01.
3. **vigil-g2-plugin TTL_MS drift detector** — Carried forward from Plan 01.

## Authentication Gates

None — Plan 02 is server-only autonomous execution. The OpenAI API key is required for the route to ACTUALLY transcribe at runtime, but the production path's `getTranscribeClient()` returns null when unset and the route translates that into `VoiceTranscribeProviderDownError` → 502 (graceful degradation). Tests do not exercise the live OpenAI path — `transcribeWavFn` is mocked via the DI factory.

The production runtime gate is documented in CONTEXT canonical_refs:
> `[Anthropic key sprawl]` auto-memory — same pattern applies to OPENAI_API_KEY; secret is already set in Railway per 128a Plan 05 (Wallclock C-1 RESOLVED)

So the production rollout (Plan 07 hardware UAT) inherits a working OPENAI_API_KEY from 128a. No new operator action needed for this plan.

## Threat Flags

None — the threat surface introduced by this plan is fully covered by the plan's `<threat_model>` block:

- T-130-02-S (spoofing) — userId from middleware, NEVER body. Verified.
- T-130-02-T-1 (audio cap bypass) — `assertAudioSessionWithinCap` called on base64 string BEFORE `Buffer.from` decode. Verified by Test T7.
- T-130-02-T-2 (dedup race) — composite partial unique index on `(user_id, client_capture_id) WHERE NOT NULL`. Verified in psql output.
- T-130-02-I (cost leak) — `withOpenAIBudgetTracking` accumulates against ai_usage_daily; `requireAiBudget` pre-flight throws. Verified by Test T6.
- T-130-02-D (cost runaway) — three-layer gate (budget pre-flight + audio cap + duration-based accumulator). Verified.
- T-130-02-R (thought provenance) — every insert from this route has `source: "g2_voice"`. Verified by Test T1.
- T-130-02-SC (npm package install) — no new packages installed. Verified.

## Known Stubs

The `bus.emitThoughtCreated` SHIM is technically a stub call site — it emits to a channel with no listeners yet. This is INTENTIONAL per the plan's `<interfaces>` block:

> `bus.emitThoughtCreated does not exist yet — add a TEMPORARY shim method to agent-events-bus.ts that emits to a THOUGHT_CREATED_NAME = "thought-created" channel without yet adding the listener triple. Plan 03 then promotes this to the full emit/on/off + joint cleanup gate triple per PATTERNS.md lines 503-535.`

Plan 03 will:
1. Add `onThoughtCreated` / `offThoughtCreated` methods on `agent-events-bus.ts`
2. Update the joint listener-cleanup gate to check all three channels (`EVENT_NAME` + `QUIET_NAME` + `THOUGHT_CREATED_NAME`)
3. Extend `agent-stream.ts` SSE handler to multiplex `thought-created` frames
4. Add PWA SSE subscriber that dispatches `vigil:thought-created` window event → `useThoughts.ts:127` refetch

Until Plan 03 ships, `bus.emitThoughtCreated` is a no-op write to a dead channel — the route returns correctly, the dashboard simply does not auto-refresh on cross-device voice captures. This is acceptable for the Plan 02 acceptance gate (which is server-side only).

## Key Decisions Made

1. **Migration 0023 journal pattern** — generate first → replace SQL → rename tag. Documented under deviations #1 so future plans can avoid the same "why is my SQL not running" head-scratch.
2. **withOpenAIBudgetTracking is distinct from withBudgetTracking** — duration-based vs token-based pricing requires different call shapes. RESEARCH Anti-Patterns explicitly called this out. The two helpers share the same `INSERT … ON CONFLICT DO UPDATE` body but differ in the USD math.
3. **Error funneling via instanceof + app.onError** — three new error classes joined the existing translation table; the test mirror (app-on-error.test.ts) was extended to maintain drift coverage (Rule 2).
4. **bus.emitThoughtCreated SHIM-only** — emit method without listeners, channel constant without joint cleanup gate update. Plan 03 closes the loop without breaking changes here.

## Files Audit

**Created (6):**
- `vigil-core/drizzle/0023_voice_capture_dedup.sql`
- `vigil-core/drizzle/meta/0023_snapshot.json`
- `vigil-core/src/routes/voice-transcribe.ts` (~250 lines)
- `vigil-core/src/routes/voice-errors.ts` (~55 lines)
- `vigil-core/src/ai/transcribe.ts` (~110 lines)
- `vigil-core/src/routes/__tests__/voice-transcribe.test.ts` (~365 lines)

**Modified (8):**
- `vigil-core/src/db/schema.ts` (+~30 lines — voiceCaptures pgTable export)
- `vigil-core/src/index.ts` (+~25 lines — import block + route mount + 4 onError branches)
- `vigil-core/src/lib/ai-budget.ts` (+~60 lines — OPENAI_TRANSCRIBE_PRICE_PER_SEC + withOpenAIBudgetTracking)
- `vigil-core/src/lib/ai-budget.test.ts` (+~80 lines — withOpenAIBudgetTracking Tests A/B/C + adapter cast)
- `vigil-core/src/lib/agent-events-bus.ts` (+~25 lines — THOUGHT_CREATED_NAME constant + emitThoughtCreated SHIM)
- `vigil-core/src/analytics/posthog.ts` (+~7 lines — /v1/voice/transcribe in SENSITIVE_ROUTES + comment)
- `vigil-core/src/__tests__/app-on-error.test.ts` (+~85 lines — 4 new throw-routes + 4 mirror branches + 4 test cases)
- `vigil-core/drizzle/meta/_journal.json` (tag rename: `0023_eminent_mephistopheles` → `0023_voice_capture_dedup`)
- `.planning/phases/130-voice-capture-full-implementation-scope-locked-by-128a/deferred-items.md` (+~25 lines — Issue #3)

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | `cf579d4` | test(130-02) | Add failing tests for voice-transcribe + OpenAI budget adapter (Wave 0 RED) |
| 2 | `6e370b5` | feat(130-02) | Add voice_captures dedup table + migration 0023 |
| 3 | `5c4127f` | feat(130-02) | Land production voice-transcribe route + OpenAI helper + budget adapter |

## Next Plan

**Plan 03 — SSE fan-out + PWA subscriber + thought-created channel triple completion.** Per the plan's `<interfaces>` block:

- Promote `bus.emitThoughtCreated` SHIM to full triple (`onThoughtCreated` / `offThoughtCreated` added on `agent-events-bus.ts`)
- Update the joint listener-cleanup gate from two-channel (EVENT + QUIET) to three-channel (+ THOUGHT_CREATED)
- Extend `vigil-core/src/routes/agent-stream.ts` to multiplex `thought-created` SSE frames
- Add PWA SSE subscriber (extends existing `useAgentStream.ts` or inline) that dispatches `vigil:thought-created` window event → `useThoughts.ts:127` refetch
- Extend `vigil-pwa/src/lib/api-error-codes.ts` with the three locked-enum VOICE_TRANSCRIBE_* entries
- D8 round-trip test (`voice-transcribe-sse.test.ts`) — mock OpenAI + real SSE + assert PWA-side refetch within 500ms

VOICE-06's 8s cross-device round-trip becomes structurally achievable only after Plan 03 ships.

## Self-Check: PASSED

Verified post-write:
- All 6 created files: `FOUND` (via `test -f`)
- All 3 commits (`cf579d4`, `6e370b5`, `5c4127f`): `FOUND` in `git log`
- Migration 0023 applied locally (verified by `psql \d voice_captures`)
- Production route module loads cleanly (verified by `tsc --noEmit`)
- All targeted tests pass (12 of 12 new tests + 4 new app-on-error branches + zero regression in adjacent test files)
