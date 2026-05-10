# Phase 125: Quiet mode + remaining polish riders + plugin v0.3.0 ship + portfolio demo - Research

**Researched:** 2026-05-10
**Domain:** v3.8 milestone close-out (SSE quiet-mode pipeline + SDK source-dive spike + helper-with-test + ship gate)
**Confidence:** HIGH (most decisions validated against live code; SEED-005 spike pre-resolved here)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** PWA toggle → Vigil Core → SSE pipeline. SDK has NO Focus API (verified). iOS Shortcut path is OUT (Phase 85 blocker).
- **D-02:** Dedicated `quiet_mode_changed` SSE event with `{enabled, since}`. Plugin holds module-level `quietMode` ref. Filter at HUD-write time, NOT at SSE-receive time — events still update `agent_sessions` cache.
- **D-03:** Synthetic state-bootstrap `quiet_mode_changed` frame is FIRST frame after auth on every SSE connect, BEFORE Last-Event-ID replay.
- **D-04:** Server-side suppression queue keyed by `(userId, sessionId, eventType)`, last-of-each-kind only. Stored as `Map<userId, Map<sessionId, Map<eventType, AgentEventRow>>>`. On `quiet_mode → false`, replays held set in chronological `event_timestamp` order, then clears. Allowlist HARD-LOCKED: `{ needs_input, task_failed }`.
- **D-05:** PWA Settings → new G2 Plugin section, optimistic toggle + rollback toast (Phase 116 CAL-01 / SPORTS-01 pattern). Server persistence: new `users.quiet_mode boolean default false` + optional `users.quiet_mode_since timestamptz`.
- **D-06:** 60-min SDK source-dive spike for SEED-005 ListContainerProperty bubble flag. Found → flag flip + hardware retest. Not found → footer-hint "tap×2 to exit" + REQUIREMENTS.md amendment. **(Pre-resolved in this research — see SEED-005 SDK Source-Dive Spike section. Branch: NOT FOUND.)**
- **D-07:** Atomic commit per branch — spike commit separate from implementation commit.
- **D-08:** Amend AGENT-DEMO-01 single-tap → double-tap. Cascade to PROJECT.md, ROADMAP.md SC #5, v3.8 spec.
- **D-09:** Real hardware single-shot 60s recording (phone screen-record). Wallclock checkpoint per `feedback_wallclock_checkpoint_exempt`.
- **D-10:** Shot list — 0:00–0:10 VS Code start, 0:10–0:25 walk away, 0:25–0:35 needs_input banner, 0:35–0:45 double-tap ack, 0:45–0:60 task_complete toast.
- **D-11:** Ship sequence (strict): bump `app.json` 0.2.0 → 0.3.0 → `npm run package:ehpk` → hardware retest (wallclock) → upload to dashboard.
- **D-12:** SEED-008 ships `createDedupedDeviceStatusListener` helper + unit test ONLY. Plugin does NOT subscribe to `bridge.onDeviceStatusChanged` this phase.

### Claude's Discretion

- Plan-wave structure (Wave 1 parallel, Wave 2 spike-gated, Wave 3 docs+ship-prep, Wave 4 wallclock).
- Suppression-queue eviction strategy (implicit Map.set overwrite — bounded ≤ 25 rows/user).
- Demo clip storage location (default: `~/Library/CloudStorage/iCloud Drive/Vigil/portfolio/2026-05-vigil-v3.8-demo.mp4`).
- Even Hub Preview field strategy (live captures only — escalate to operator if dashboard demands composites).
- Optional `🌙` / `Q` HUD header glyph during quiet mode (not blocking).

### Deferred Ideas (OUT OF SCOPE)

- iOS Shortcut → `/v1/quiet-mode` mirror (Phase 85 blocker).
- Quiet-hours auto-toggle (time-window rule).
- Cross-device DND propagation (Mac app + PWA UI honoring quiet mode).
- Single-tap (`CLICK_EVENT`) and long-press (`LONG_PRESS_EVENT`) variants — stays in SEED-011 dormant.
- Live `onDeviceStatusChanged` subscription (helper ships, subscriber doesn't).
- Per-event-type allowlist config (boolean only for v3.8).
- Even Hub Preview composites (memory `project_even_hub_preview_field`).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGENT-HUD-03 | Quiet mode: only `needs_input` / `task_failed` reach HUD; others queue silently and surface on toggle-off | PWA→Core→SSE pipeline (D-01..D-04); HUD filter at companion.ts rebuild boundary; ackBanner-style replay on toggle-off |
| G2-POLISH-05 | Swipe-out-of-list works on real G2 hardware (or amended to documented exit) | SDK source-dive **pre-resolved as NOT FOUND** — fallback footer-hint + REQUIREMENTS.md amendment |
| G2-POLISH-08 | Device-status events with `connectType: "none"` debounced or deduped | Pure helper `createDedupedDeviceStatusListener` + unit test, no live subscription (D-12) |
| G2-PLUGIN-01 | `vigil.ehpk` v0.3.0 packed and resubmitted to Even Hub developer portal | `app.json` bump → `npm run package:ehpk` → hardware retest → upload (D-11 strict order) |
| AGENT-DEMO-01 | 60s portfolio demo flow recordable; **wording amendment single-tap → double-tap** is part of scope | D-08 cascade across REQUIREMENTS.md / PROJECT.md / ROADMAP.md / v3.8 spec; real hardware single-shot |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` file exists at the repo root. Project conventions extracted from existing code patterns:

- **Bearer-auth dispatcher placement:** new `/v1/*` routes mount AFTER `app.use("/v1/*", bearerAuth)` at `vigil-core/src/index.ts:140`. Mounting before would create a silent auth bypass (load-bearing comment at agent-events / agent-stream mount sites).
- **userId source rule:** ALWAYS `c.get("userId") as number`. NEVER read from request body. Phase 121 cross-user-isolation lock pins this.
- **Drizzle migration shape:** `ADD COLUMN IF NOT EXISTS` + idempotent backfill + (optional) SET NOT NULL. Re-run safe.
- **Optimistic toggle PUT pattern:** 400ms debounced, `lastSavedRef.current` rollback target, `showToast({ variant: 'error', body: ... })`. Modeled in `SettingsPage.tsx` lines 588–614 and 616–632.
- **Auto-applied migrations:** Railway Dockerfile CMD chain runs `node dist/db/migrate.js` BEFORE the server starts (`vigil-core/Dockerfile:18`). New migration files in `vigil-core/drizzle/` auto-apply on Railway deploy.
- **Plugin tests:** `tsx --test` runs `src/**/*.test.ts`. Pure helpers go in `vigil-g2-plugin/src/lib/` with co-located `*.test.ts` next to the file or under `__tests__/`.
- **No sim-only ships** (memory `project_g2_tap_expand_broken`): every tap or list-bubble change must hardware-retest before SDK pack.

## Summary

Phase 125 is largely a code-and-config phase with one operator-wallclock segment (hardware retest + ship + demo recording). Every architecture decision is locked in CONTEXT.md and validated here against live code. The single remaining unknown — the SEED-005 SDK bubble-flag question — is **resolved by this research** (TypeScript surface inspected; no flag exists), letting the planner skip the spike-and-branch and go straight to the documented-exit fallback.

**Primary recommendation:** Plan four waves. Wave 1 (parallel, all six independent code threads), Wave 2 (already-resolved SEED-005 fallback — pure docs/footer-hint), Wave 3 (SDK validate + version bump + REQUIREMENTS / PROJECT / ROADMAP / v3.8-spec text amendments), Wave 4 (operator wallclock — hardware retest, store upload, 60s recording). The spike commit from D-07 captures this research's negative finding so the audit trail still exists; the planner does NOT need to allocate a spike task.

The five workstreams interleave well because their critical dependencies are all in Wave 1: vigil-core (column + endpoint + suppression queue + SSE event) → vigil-pwa (toggle UI) → plugin (handler + filter + helper). All can be implemented and unit-tested in parallel because they communicate over typed contracts (`{enabled, since}` payload + `users.quiet_mode` column shape + helper signature). E2E validation only happens at Wave 4 hardware retest.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `users.quiet_mode` column + migration | Database | — | Per-user truth, survives Railway restart (D-05 explicit); migration auto-applies via Dockerfile CMD chain |
| `GET/PUT /v1/quiet-mode` endpoint | API / Backend | — | Bearer-gated, userId-scoped (mirror of /v1/calendar/selections) |
| Suppression queue (held events during DND) | API / Backend (in-process state) | Database (replay source on cold start, optional) | In-memory `Map` per D-04; no need to persist (toggle-off replay is the only consumer) |
| `quiet_mode_changed` SSE emit | API / Backend (vigil-core SSE handler) | — | Adjacent to existing `agent-event` write at `agent-stream.ts:67–119` |
| Synthetic state-bootstrap frame on connect | API / Backend | — | First frame after auth, BEFORE Phase 1 replay loop (D-03) |
| PWA Quiet-mode toggle UI | Frontend Server (Vite SPA) | API / Backend (PUT) | Mirrors CAL-01 / SPORTS-01 row in `SettingsPage.tsx`; PUT with optimistic + rollback |
| Plugin module-level `quietMode` ref | Browser / Client (WKWebView) | — | Sub-app state; plugin owns its own event filter |
| Plugin HUD-write filter | Browser / Client (WKWebView) | — | Filter at `companion.ts` rebuild boundary, post `applyAgentEvent` cache update |
| `createDedupedDeviceStatusListener` helper | Browser / Client (WKWebView) | — | Pure function in `src/lib/`; no consumer this phase |
| `vigil.ehpk` v0.3.0 pack | CDN / Static (Even Hub developer portal) | — | Manual upload via store dashboard; submission artifact |
| 60s portfolio demo recording | Operator (wallclock) | — | Phone screen-recording on real hardware; not auto-executable |

## Standard Stack

### Core (already installed; this phase adds ZERO new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | ^4.7.0 | HTTP routing on vigil-core | Already mounted (`vigil-core/src/index.ts`); `streamSSE` from `hono/streaming` is the SSE primitive |
| `hono/streaming` | (peer with hono) | SSE writer (`event:`/`data:`/`id:`) | Used by Phase 124 `agent-stream.ts` — same primitive emits new `quiet_mode_changed` event type |
| drizzle-orm | ^0.45.2 | Postgres typed DSL | Schema source-of-truth at `vigil-core/src/db/schema.ts`; migration generation via `drizzle-kit generate` |
| drizzle-kit | ^0.31.10 | Migration generator | `db:generate` script generates next-numbered SQL file from schema diff |
| postgres-js | ^3.4.9 | Postgres driver | Connection at `vigil-core/src/db/connection.ts` |
| `node:events.EventEmitter` | (Node 20 stdlib) | Per-userId pub/sub bus | Already wired (`vigil-core/src/lib/agent-events-bus.ts`); suppression queue hooks alongside |
| React + TypeScript (vigil-pwa) | (existing) | PWA Settings UI | `SettingsPage.tsx` is React; toggle is a controlled checkbox |
| `@evenrealities/even_hub_sdk` | ^0.0.9 | G2 plugin SDK | Already vendored — `min_sdk_version: 0.0.7` in `app.json` (verify Phase 124 didn't introduce a 0.0.8+-only API) |
| `tsx --test` | ^4.19.0 | Plugin unit-test runner | `vigil-g2-plugin/package.json` test script: `tsx --test "src/**/*.test.ts"` |

[VERIFIED: file inspection of vigil-core/package.json + vigil-g2-plugin/package.json + node_modules]

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-router` v7 | (vigil-pwa) | SPA routing | No new routes — toggle is on existing `/settings` page |
| `useToast` hook | (vigil-pwa) | Toast notifications | Rollback error toast on PUT failure (mirror Phase 116 SPORTS-01 D-21) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory suppression `Map` | Postgres `held_agent_events` table | DB persistence survives vigil-core restart, but D-04 doesn't require it (DND-off replay is the only consumer; if vigil-core restarts during DND the connect-bootstrap frame announces `enabled: true` and the user just stops seeing events anyway — no UX regression). Rejected: complexity not justified. |
| Drizzle migration | `db:push` (schema sync) | `db:push` is dev-only — never run on Railway; production uses `db:migrate-prod` via the Dockerfile CMD. Rejected. |
| Per-event-type allowlist column | Boolean `quiet_mode` column | CONTEXT.md says boolean only — keep door open to allowlist column later by NOT introducing per-event-type config in v3.8. |
| Reuse `app_settings` table for quiet_mode | New `users.quiet_mode` column | `app_settings` is k/v string-typed; `quiet_mode` is a boolean with potential future hot-path read at SSE delivery time (per-event check). Direct column wins on type safety + zero JOIN. CONTEXT D-05 specifies the column. |

**Installation:**
No new packages. Phase delivers via:
- 1× new Drizzle migration file (auto-numbered: `0019_add_users_quiet_mode.sql`)
- 1× new vigil-core route module (`src/routes/quiet-mode.ts`)
- 1× new vigil-core lib module (`src/lib/quiet-mode-suppression.ts`)
- 1× modification to `vigil-core/src/routes/agent-stream.ts` (synthetic frame + event emit)
- 1× new vigil-pwa API client export (`getQuietMode` / `setQuietMode`)
- 1× modification to `vigil-pwa/src/pages/SettingsPage.tsx` (new G2 Plugin section)
- 1× new vigil-g2-plugin lib module (`src/lib/deduped-device-status.ts` + `.test.ts`)
- 1× modification to `vigil-g2-plugin/src/lib/sse-client.ts` (new event type)
- 1× modification to `vigil-g2-plugin/src/screens/companion.ts` (HUD-write filter)
- 1× modification to `vigil-g2-plugin/src/screens/work-orders.ts` (footer hint already present — verify text matches D-06 fallback)
- 1× modification to `vigil-g2-plugin/app.json` (version bump)
- 4× docs amendments (REQUIREMENTS.md / PROJECT.md / ROADMAP.md / v3.8 spec)

**Version verification:** No new packages; existing versions are pinned in committed lockfiles.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  USER ACTION: PWA Settings → "Quiet mode" toggle                             │
└──────────────┬───────────────────────────────────────────────────────────────┘
               │
               ▼
        ┌──────────────────────────────────┐
        │ vigil-pwa SettingsPage.tsx       │
        │  - optimistic local state flip   │
        │  - 400ms debounced PUT           │
        │  - rollback toast on error       │
        └──────────────┬───────────────────┘
                       │ PUT /v1/quiet-mode  { enabled: true }
                       ▼
        ┌──────────────────────────────────┐
        │ vigil-core/src/routes/           │
        │   quiet-mode.ts (NEW)            │
        │  - bearerAuth → c.get("userId")  │
        │  - UPDATE users SET quiet_mode...│
        │  - bus.emitQuietMode(userId, ...) │  ◄─ also: flush suppression on enabled→false
        └──────────────┬───────────────────┘
                       │ emit
                       ▼
        ┌──────────────────────────────────┐
        │ vigil-core/src/lib/              │       ┌──────────────────────────────┐
        │   agent-events-bus.ts            │       │ vigil-core/src/lib/          │
        │  - per-userId EventEmitter       │       │   quiet-mode-suppression.ts  │
        │  - new event name "quiet"        │◄──────┤  Map<userId, Map<sessionId,  │
        │                                  │       │       Map<eventType, row>>>  │
        └──────────────┬───────────────────┘       └──────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────┐
        │ vigil-core/src/routes/           │
        │   agent-stream.ts (MODIFIED)     │
        │  Phase 0: emit synthetic         │
        │    quiet_mode_changed frame      │   ◄── BEFORE Last-Event-ID replay (D-03)
        │  Phase 1: Last-Event-ID replay   │
        │  Phase 2: bus.on("event", ...)   │   ◄── on emit: if quiet AND not allowlisted,
        │  Phase 2b: bus.on("quiet", ...)  │       store in suppression Map; else write SSE
        │  Phase 3: 25s keepalive ping     │
        └──────────────┬───────────────────┘
                       │ SSE event: quiet_mode_changed | agent-event | ping
                       ▼
        ┌──────────────────────────────────┐
        │ vigil-g2-plugin/src/lib/         │
        │   sse-client.ts (MODIFIED)       │
        │  parseFrame → dispatch on        │
        │    event: line:                  │
        │   - "agent-event" → existing     │
        │   - "quiet_mode_changed" → NEW   │  ◄── new onQuietMode callback in opts
        │   - "ping" → drop                │
        └──────────────┬───────────────────┘
                       │ onEvent / onQuietMode
                       ▼
        ┌──────────────────────────────────┐       ┌──────────────────────────────┐
        │ vigil-g2-plugin/src/main.ts      │       │ companion.ts (MODIFIED)      │
        │  - applyAgentEvent (cache only)  │──────►│  buildContainers checks       │
        │  - setQuietMode(quietMode)       │       │  isQuietMode() → if active   │
        │  - rebuildCurrentScreen          │       │   AND event ∉ allowlist:     │
        └──────────────────────────────────┘       │   render previous frame      │
                                                   │  (stale-render filter)       │
                                                   └──────────────────────────────┘

PARALLEL TRACK ── SEED-008 helper (no consumer this phase):
        ┌──────────────────────────────────┐
        │ vigil-g2-plugin/src/lib/         │
        │   deduped-device-status.ts (NEW) │
        │  pure function:                  │
        │   (cb) => (status) =>            │
        │     if status.connectType ===    │
        │     lastSeen, drop; else cb      │
        └──────────────────────────────────┘
                       ▲
                       │ unit test only (5×"none" → 1 call)

PARALLEL TRACK ── G2-POLISH-05 (resolved here as NOT FOUND):
        ┌──────────────────────────────────┐
        │ work-orders.ts:53 footer text    │
        │  ALREADY READS '() double-tap to │
        │  exit' — verify exact match      │
        │  with spec-locked wording        │
        └──────────────────────────────────┘
```

### Recommended Project Structure (deltas from current)

```
vigil-core/
├── src/
│   ├── routes/
│   │   ├── quiet-mode.ts          # NEW — GET/PUT /v1/quiet-mode
│   │   └── agent-stream.ts        # MODIFIED — synthetic frame + bus.onQuiet wire
│   ├── lib/
│   │   ├── agent-events-bus.ts    # MODIFIED — add emitQuiet/onQuiet methods
│   │   └── quiet-mode-suppression.ts  # NEW — held-events Map + replay-on-flush
│   └── db/
│       └── schema.ts              # MODIFIED — users.quietMode + users.quietModeSince
├── drizzle/
│   └── 0019_add_users_quiet_mode.sql  # NEW — migration

vigil-pwa/
├── src/
│   ├── api/
│   │   └── client.ts              # MODIFIED — getQuietMode / setQuietMode helpers
│   └── pages/
│       └── SettingsPage.tsx       # MODIFIED — new "G2 Plugin" section + toggle row

vigil-g2-plugin/
├── app.json                       # MODIFIED — version 0.2.0 → 0.3.0
├── src/
│   ├── lib/
│   │   ├── sse-client.ts          # MODIFIED — quiet_mode_changed dispatch branch
│   │   ├── deduped-device-status.ts       # NEW — D-12 pure helper
│   │   └── deduped-device-status.test.ts  # NEW — 5×"none" → 1 call assertion
│   ├── main.ts                    # MODIFIED — wire onQuietMode → setQuietMode
│   └── screens/
│       ├── companion.ts           # MODIFIED — quietMode filter at buildContainers
│       └── work-orders.ts         # VERIFY — footer text matches D-06 fallback wording
```

### Pattern 1: Drizzle migration with idempotent backfill

**What:** Each migration is `ADD COLUMN IF NOT EXISTS` + (optional) `UPDATE WHERE IS NULL` backfill + (optional) `SET NOT NULL`. Re-run safe per `0017_users_email_verified_at.sql` and `0015_add_password_changed_at.sql` precedents.

**When to use:** Any new column on an existing table.

**Example:**
```sql
-- 0019_add_users_quiet_mode.sql (NEW)
-- Phase 125 (AGENT-HUD-03 / D-05): users.quiet_mode boolean for HUD DND filter.
-- D-05 explicit: "default false" — no backfill needed beyond the column DEFAULT.
-- Optional users.quiet_mode_since timestamptz carries the {since: ISO} payload
-- emitted on quiet_mode_changed SSE frames. NULL when quiet_mode = false.
--
-- Re-run safe: ADD COLUMN IF NOT EXISTS is idempotent.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "quiet_mode" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "quiet_mode_since" timestamp with time zone;
```

[VERIFIED: drizzle/0017_users_email_verified_at.sql + drizzle/0015_add_password_changed_at.sql precedents]

The migration auto-applies on Railway because `vigil-core/Dockerfile:18` runs `node dist/db/migrate.js && node dist/index.js` as the container CMD. No manual ops step. [VERIFIED: vigil-core/Dockerfile read directly]

### Pattern 2: Hono GET/PUT route with userId from bearerAuth

**What:** Mirror `vigil-core/src/routes/calendar.ts` (CAL-01) — small router, `c.get("userId") as number`, JSON body validation in-handler (codebase eschews zod for manual validation per `agent-events.ts` precedent).

**When to use:** Any new bearer-gated endpoint.

**Example:**
```typescript
// vigil-core/src/routes/quiet-mode.ts (NEW)
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema.js";
import { suppressionQueue } from "../lib/quiet-mode-suppression.js";
import { bus } from "../lib/agent-events-bus.js";

export interface QuietModeDeps {
  dbAvailable: boolean;
  dbGet: (userId: number) => Promise<{ enabled: boolean; since: Date | null }>;
  dbSet: (userId: number, enabled: boolean, since: Date | null) => Promise<void>;
}

export function createQuietModeRouter(deps: QuietModeDeps): Hono {
  const router = new Hono();

  router.get("/quiet-mode", async (c) => {
    if (!deps.dbAvailable) return c.json({ error: "db_unavailable" }, 503);
    const userId = c.get("userId") as number;
    const { enabled, since } = await deps.dbGet(userId);
    return c.json({ enabled, since: since?.toISOString() ?? null });
  });

  router.put("/quiet-mode", async (c) => {
    if (!deps.dbAvailable) return c.json({ error: "db_unavailable" }, 503);
    const userId = c.get("userId") as number;
    let body: unknown;
    try { body = await c.req.json(); } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const enabled = (body as { enabled?: unknown } | null)?.enabled;
    if (typeof enabled !== "boolean") {
      return c.json({ error: "invalid_payload", message: "enabled must be a boolean" }, 400);
    }
    const since = enabled ? new Date() : null;
    await deps.dbSet(userId, enabled, since);
    // Emit on SSE bus + flush suppression queue if turning off
    bus.emitQuiet(userId, { enabled, since: since?.toISOString() ?? null });
    if (!enabled) {
      const held = suppressionQueue.flush(userId);
      // bus emits each held row — agent-stream handler will deliver via SSE
      for (const row of held) bus.emit(userId, row);
    }
    return c.json({ ok: true });
  });

  return router;
}

export const quietMode$Route = createQuietModeRouter({
  get dbAvailable() { return !!db; },
  dbGet: async (userId) => {
    if (!db) throw new Error("Database not available");
    const rows = await db
      .select({ enabled: users.quietMode, since: users.quietModeSince })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0] ?? { enabled: false, since: null };
  },
  dbSet: async (userId, enabled, since) => {
    if (!db) throw new Error("Database not available");
    await db
      .update(users)
      .set({ quietMode: enabled, quietModeSince: since })
      .where(eq(users.id, userId));
  },
});
export { quietMode$Route as quietMode };
```
[VERIFIED: pattern extracted from `vigil-core/src/routes/calendar.ts` + `vigil-core/src/routes/agent-events.ts` factory shape]

Mount point in `vigil-core/src/index.ts` (after the bearerAuth dispatcher at line 140, alongside line 222):
```typescript
import { quietMode } from "./routes/quiet-mode.js";  // add to imports near line 44
// ...
app.route("/v1", quietMode);  // add after line 222 (alongside agentStream)
```

### Pattern 3: Suppression queue (D-04)

**What:** In-memory `Map<number, Map<string, Map<string, AgentEventRow>>>` keyed `(userId, sessionId, eventType)`. Last-of-each-kind via implicit `Map.set` overwrite. Flushed in `event_timestamp` ascending order.

**When to use:** When SSE delivery should be deferred but cache update should not be.

**Example:**
```typescript
// vigil-core/src/lib/quiet-mode-suppression.ts (NEW)
import type { DrizzleAgentEvent } from "../db/types.js";

const ALLOWLIST = new Set(["needs_input", "task_failed"]);

const heldByUser = new Map<
  number,
  Map<string, Map<string, DrizzleAgentEvent>>
>();

export const suppressionQueue = {
  /** Returns true if event was suppressed (and stored), false if it should pass through. */
  shouldSuppress(userId: number, isQuiet: boolean, row: DrizzleAgentEvent): boolean {
    if (!isQuiet) return false;
    if (ALLOWLIST.has(row.event)) return false;
    let bySession = heldByUser.get(userId);
    if (!bySession) {
      bySession = new Map();
      heldByUser.set(userId, bySession);
    }
    let byEventType = bySession.get(row.sessionId);
    if (!byEventType) {
      byEventType = new Map();
      bySession.set(row.sessionId, byEventType);
    }
    byEventType.set(row.event, row); // last-of-each-kind via overwrite
    return true;
  },

  /** Flush + clear. Returns held rows in ascending event_timestamp order. */
  flush(userId: number): DrizzleAgentEvent[] {
    const bySession = heldByUser.get(userId);
    if (!bySession) return [];
    const out: DrizzleAgentEvent[] = [];
    for (const byEventType of bySession.values()) {
      for (const row of byEventType.values()) out.push(row);
    }
    out.sort((a, b) => a.eventTimestamp.getTime() - b.eventTimestamp.getTime());
    heldByUser.delete(userId);
    return out;
  },

  // Test hooks
  _size(userId: number): number {
    const bySession = heldByUser.get(userId);
    if (!bySession) return 0;
    let n = 0;
    for (const m of bySession.values()) n += m.size;
    return n;
  },
  _clearAll(): void { heldByUser.clear(); },
};
```
[CITED: D-04 spec from CONTEXT.md]

### Pattern 4: SSE event-type dispatch in plugin shim

**What:** The shim already parses `event:` line and dispatches by name (currently `agent-event` and `ping`). Adding `quiet_mode_changed` is a new branch in the same loop.

**When to use:** Adding any new SSE event type from vigil-core.

**Example:**
```typescript
// vigil-g2-plugin/src/lib/sse-client.ts — line 130 currently reads:
//   if (parsed.event === "agent-event" && parsed.id) {
//     safeWriteStorage(storage, STORAGE_KEY, parsed.id)
//     opts.onEvent(parsed.id, parsed.data)
//   }
//
// MODIFIED:
if (parsed.event === "agent-event" && parsed.id) {
  safeWriteStorage(storage, STORAGE_KEY, parsed.id)
  opts.onEvent(parsed.id, parsed.data)
} else if (parsed.event === "quiet_mode_changed") {
  opts.onQuietMode?.(parsed.data)  // data is JSON: {enabled, since}
}
```
And add to `SseClientOptions`:
```typescript
export interface SseClientOptions {
  url: string
  apiKey: string
  onEvent: EventCallback
  onQuietMode?: (data: string) => void  // NEW
  onStateChange?: StateCallback
  storage?: Pick<Storage, "getItem" | "setItem">
  fetchFn?: typeof fetch
  sleepFn?: (ms: number) => Promise<void>
}
```
[VERIFIED: line 130 of vigil-g2-plugin/src/lib/sse-client.ts]

### Pattern 5: HUD-write quiet-mode filter

**What:** Filter at `companion.ts` `buildContainers()` — when quiet AND current banner-eligible event is not in allowlist, render the previous frame (NOT the new one). The cache update via `applyAgentEvent` still happens; only the visible HUD changes.

**Why filter at HUD-write rather than at SSE-receive (per D-02):** Server-side suppression already prevents non-allowlist events from arriving over SSE during quiet mode. The plugin-side filter is **defensive defense-in-depth** — covers the gap during the synthetic-frame window if a server-side bug ever lets an event slip through.

**Example:**
```typescript
// companion.ts — module-level state (alongside line 59):
let quietMode = false

// Mutator (called from main.ts onQuietMode):
export function setQuietMode(next: boolean): void {
  quietMode = next
}

export function isQuietMode(): boolean {
  return quietMode
}

// applyAgentEvent — UNCHANGED. Cache always updates.
// computeBodyLines — banner overlay branch (line 307):
if (banner && !(quietMode && !ALLOWLIST.has(banner.type))) {
  // render banner as before
}
// Where ALLOWLIST = new Set(['needs_input', 'task_failed'])
```
**Note:** Server-side suppression is the primary mechanism (D-04). Plugin-side check is belt-and-suspenders.

### Anti-Patterns to Avoid

- **Filtering at SSE-receive (in `applyAgentEvent`):** Would skip cache update, so cycling sessions on Companion would show stale state. CONTEXT D-02 explicit — filter at HUD-write only.
- **Forgetting to gate emit on `isNew`:** `agent-events.ts` line 249 already gates `bus.emit` on `isNew` (Phase 121 dedupe). Suppression queue MUST also gate — otherwise a retry POST suppresses the same event twice and the held Map gets the same row written twice (harmless, but wasted work).
- **Embedding `quietMode` on every agent_events frame (rejected in D-02):** Fails when no events flow during the quiet window — exactly when the state matters.
- **30s REST poll for quiet-mode state (rejected in D-02):** 30s lag on toggle defeats glanceability.
- **Replaying with `now()` timestamp on flush:** Per CONTEXT `<specifics>` — preserve original `event_timestamp` so plugin's relative-time renderings stay truthful (`task_complete 14m ago`, not `task_complete just now`).
- **Hand-rolling event-type tagged unions in SSE shim:** The `event:` line IS the discriminator; the shim parses it; just add a branch.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE event-name dispatch in plugin | Custom event-router with type tags in `data` | `parsed.event` line discriminator already in `parseFrame` | The shim is already correct shape — just add a branch |
| Per-userId pub/sub | New EventEmitter wrapper | `vigil-core/src/lib/agent-events-bus.ts` (extend with `emitQuiet/onQuiet`) | Already wired and tested |
| Drizzle migration generation | Manual SQL editing | `npm run db:generate` | drizzle-kit reads schema.ts diff and emits the SQL — guarantees migration matches schema |
| PWA optimistic toggle | New abstraction | Phase 116 SPORTS-01 D-21 pattern (`SettingsPage.tsx:616–632`) | Tested pattern with rollback toast; copy-paste-and-rename |
| Bearer authentication | Manual JWT parsing | `bearerAuth` middleware mounted at `index.ts:140` | One source of truth; mounting after the dispatcher inherits the gate |
| 60s SDK source-dive spike | New investigation | This research already inspected the SDK type defs | See "SEED-005 SDK Source-Dive Spike" — flag does not exist; planner skips spike, goes straight to fallback |

**Key insight:** This phase is almost entirely composition of existing patterns. The new code is glue between Phase 116 (PWA toggle pattern), Phase 121 (per-userId DB scoping), and Phase 124 (SSE shim + EventEmitter bus). Resist the urge to introduce new abstractions.

## Runtime State Inventory

This phase introduces NEW runtime state but does not rename or migrate existing state. Audited for completeness:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | NEW: `users.quiet_mode boolean default false` + NEW: `users.quiet_mode_since timestamptz NULL`. Existing rows backfilled implicitly by `DEFAULT false` (no UPDATE needed). | Drizzle migration `0019_add_users_quiet_mode.sql` (auto-applies on Railway) |
| Live service config | None — Even Hub developer portal store dashboard receives a NEW build but no config rename | Upload `vigil.ehpk` v0.3.0 (manual via dashboard); screenshot acknowledgment |
| OS-registered state | None — no launchd / pm2 / Task Scheduler entry references this phase's surfaces | None |
| Secrets/env vars | None — all auth via existing JWT bearer; no new env vars introduced. `VITE_API_KEY` (PWA) and bearer header in plugin are unchanged. | None |
| Build artifacts | NEW: `vigil-g2-plugin/dist/` produced by `npm run build:prod`; NEW: `vigil-g2-plugin/vigil.ehpk` produced by `npm run pack`. Both regenerate from source — clean before pack to ensure no stale artifacts. | Run `rm -rf vigil-g2-plugin/dist vigil-g2-plugin/vigil.ehpk` before `npm run package:ehpk` (or trust Vite's clean-on-build) |

**Nothing found in remaining categories** — Verified by grep against `~/Library/LaunchAgents/`, `vigil-core/.env*`, and `vigil-g2-plugin/scripts/*.mjs`.

## Common Pitfalls

### Pitfall 1: Synthetic frame ordering race
**What goes wrong:** A `task_complete` agent-event arrives via SSE replay BEFORE the synthetic `quiet_mode_changed` frame, surfaces on HUD despite DND being on.
**Why it happens:** D-03 specifies the synthetic frame is FIRST after auth. If the implementation puts it AFTER the `dbReplayMissed` loop in `agent-stream.ts`, the loop emits replayed events first.
**How to avoid:** In `agent-stream.ts:67–80`, write the synthetic frame as Phase 0 before the existing Phase 1 replay loop:
```typescript
return streamSSE(c, async (stream) => {
  // Phase 0 (NEW) — synthetic state-bootstrap frame
  const { enabled, since } = await deps.dbGetQuietMode(userId);
  await stream.writeSSE({
    event: "quiet_mode_changed",
    data: JSON.stringify({ enabled, since: since?.toISOString() ?? null }),
  });

  // Phase 1: Last-Event-ID replay (UNCHANGED, lines 67–80)
  if (resumeFrom !== null) { /* ... */ }
  // ...
});
```
**Warning signs:** `task_complete` toast briefly appears on HUD after reconnect during quiet mode; user reports "the toggle isn't sticky."

### Pitfall 2: Suppression-queue suppress-once flush-twice
**What goes wrong:** A retry POST to `/v1/agent-events` lands during quiet mode. First POST: `isNew=true`, `bus.emit` fires, suppression Map.set stores. Second POST: `isNew=false`, `bus.emit` does NOT fire (correctly per agent-events.ts:249). Suppression Map is unchanged. **No bug.** But if a future refactor moves suppression check before the `isNew` gate, dup retries will write the same row twice (last-write-wins still produces correct held row, but wastes one write).
**Why it happens:** Easy to invert the gate while refactoring.
**How to avoid:** Suppression check is a side effect of `bus.emit` — it lives INSIDE `agent-stream.ts`'s `bus.on(userId, listener)` callback, not inside `agent-events.ts`. Therefore the dedupe gate at `agent-events.ts:249` already protects it.
**Warning signs:** Drizzle log shows duplicate inserts.

### Pitfall 3: Filter at SSE-receive instead of HUD-write
**What goes wrong:** Plugin filters in `applyAgentEvent`, NOT at `buildContainers`. Cache misses the update. User cycles sessions, sees stale `running` state because the latest event was suppressed from the cache.
**Why it happens:** Tempting to "shortcut" the filter — rejected fast events are also fast non-rebuilds.
**How to avoid:** Filter at HUD-write boundary (per D-02). `applyAgentEvent` always updates cache. Module-level `quietMode` ref is the only state the rebuild path checks.
**Warning signs:** Banner reappears on cycle-back to a session that should have been suppressed.

### Pitfall 4: Map ordering vs event_timestamp ordering on flush
**What goes wrong:** ES Maps preserve insertion order, NOT timestamp order. If a user's `needs_input` arrives at T+1, then `task_complete` at T+0 (clock skew), then `milestone` at T+2, the held Map iterates in insertion order [T+1, T+0, T+2], breaking the chronological-replay requirement.
**Why it happens:** Suppression doesn't see clock skew; assumes monotonic arrival.
**How to avoid:** `flush()` MUST sort by `event_timestamp` ASC before returning. See pattern code above — `out.sort((a, b) => a.eventTimestamp.getTime() - b.eventTimestamp.getTime())`.
**Warning signs:** Replay-on-toggle-off shows events out of order.

### Pitfall 5: `containerName ≤ 16 chars` violation in any new UI
**What goes wrong:** Any new TextContainerProperty / ListContainerProperty added to the plugin needs `containerName: string` ≤ 16 characters. SDK rejects packs that violate.
**Why it happens:** Easy to miss when iterating quickly.
**How to avoid:** This phase introduces NO new G2 UI containers (all changes are to existing screens — companion.ts and work-orders.ts). The footer-hint update modifies existing `wo-footer` (8 chars). Verified safe.
**Warning signs:** `npm run package:ehpk` fails with SDK validation error.

### Pitfall 6: `min_sdk_version` regression
**What goes wrong:** `app.json` `min_sdk_version: "0.0.7"` is a contract — the plugin promises to work on SDK ≥ 0.0.7. If Phase 124 used a 0.0.8+-only API, the contract is broken on 0.0.7 hosts.
**Why it happens:** SDK upgrades are silent — contract drift is invisible.
**How to avoid:** Verify in plan that Companion HUD uses only APIs available in 0.0.7. Phase 124 SSE shim uses `bridge.onLaunchSource` (added in 0.0.8 per README changelog "Added launch source push/listening support"). **This means `min_sdk_version` SHOULD bump to `0.0.8` in this phase's `app.json` change**, not stay at 0.0.7. **Flag for planner.**
**Warning signs:** Plugin fails on a user with SDK 0.0.7.

### Pitfall 7: Demo single-shot fragility
**What goes wrong:** 60s recording requires real `needs_input` to fire reliably within 0:25–0:35. If the test prompt doesn't always trigger one, multiple takes burn time.
**Why it happens:** Claude Code's `needs_input` detection is regex-based on output — not deterministic.
**How to avoid:** Pre-stage a prompt known to reliably fire `needs_input` (e.g., a prompt that asks Claude to confirm a dangerous git operation). Test 2× before recording. Wallclock checkpoint per `feedback_wallclock_checkpoint_exempt`.
**Warning signs:** First 3 takes don't get `needs_input` to fire — pause and investigate the prompt.

### Pitfall 8: Even Hub Preview field rejection (memory `project_even_hub_preview_field`)
**What goes wrong:** v0.2.0 was rejected because Preview field had composited mockups instead of live captures. v0.3.0 needs to follow the policy.
**Why it happens:** Easy to repeat a habit.
**How to avoid:** Live captures only. If dashboard requires content beyond live captures, escalate to operator BEFORE submit (per CONTEXT `Claude's Discretion`).
**Warning signs:** Submission rejected with "preview field" feedback.

### Pitfall 9: VERIFIED.md staleness blocks `package:ehpk`
**What goes wrong:** `vigil-g2-plugin/scripts/check-verified.mjs` reads `.planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md` and exits 1 if older than 24h.
**Why it happens:** The script was wired in Phase 106 but the path is hard-coded.
**How to avoid:** Either (a) refresh VERIFIED.md in Phase 106's directory with current timestamp before Wave 3 ship-prep, or (b) update `check-verified.mjs` to point at Phase 125's VERIFICATION.md once that exists. Option (a) is lower-risk and matches existing convention.
**Warning signs:** `npm run package:ehpk` fails with "VERIFIED.md is Nh old (max 24h)".

[VERIFIED: vigil-g2-plugin/scripts/check-verified.mjs read directly]

## Code Examples

### Example A — `users` schema delta

```typescript
// vigil-core/src/db/schema.ts — additions to existing users table block (line 27–55):
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true })
      .notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    // Phase 125 (AGENT-HUD-03 / D-05): per-user HUD DND filter state.
    // Default false — every user starts non-quiet. NULL since column when off.
    quietMode: boolean("quiet_mode").notNull().default(false),
    quietModeSince: timestamp("quiet_mode_since", { withTimezone: true }),
  },
  (table) => [uniqueIndex("uq_users_email").on(table.email)],
);
```
After editing schema.ts, run:
```bash
cd vigil-core
npm run db:generate    # generates 0019_*.sql
git add drizzle/0019_*.sql src/db/schema.ts
```

### Example B — bus extension for quiet-mode events

```typescript
// vigil-core/src/lib/agent-events-bus.ts — additions:
const EVENT_NAME = "event" as const;
const QUIET_NAME = "quiet" as const;  // NEW

export class AgentEventBus {
  // ... existing emit / on / off (UNCHANGED)

  // Phase 125 (AGENT-HUD-03 / D-02): quiet_mode_changed fan-out.
  emitQuiet(userId: number, payload: { enabled: boolean; since: string | null }): void {
    const emitter = emitters.get(userId);
    if (!emitter) return;
    emitter.emit(QUIET_NAME, payload);
  }

  onQuiet(userId: number, listener: (p: { enabled: boolean; since: string | null }) => void): void {
    getOrCreate(userId).on(QUIET_NAME, listener);
  }

  offQuiet(userId: number, listener: (p: { enabled: boolean; since: string | null }) => void): void {
    const emitter = emitters.get(userId);
    if (!emitter) return;
    emitter.off(QUIET_NAME, listener);
    if (emitter.listenerCount(EVENT_NAME) === 0 && emitter.listenerCount(QUIET_NAME) === 0) {
      emitters.delete(userId);
    }
  }
}
```

### Example C — agent-stream.ts modification (Phase 0 + listener wiring)

```typescript
// vigil-core/src/routes/agent-stream.ts — modifications inside streamSSE callback:

return streamSSE(c, async (stream) => {
  // Phase 0 (NEW per D-03): synthetic state-bootstrap frame BEFORE replay.
  const quiet = await deps.dbGetQuietMode(userId);
  await stream.writeSSE({
    event: "quiet_mode_changed",
    data: JSON.stringify({ enabled: quiet.enabled, since: quiet.since?.toISOString() ?? null }),
  });

  // Phase 1: Last-Event-ID replay (UNCHANGED — but now only emit if NOT suppressed)
  if (resumeFrom !== null) {
    const cutoff = new Date(Date.now() - REPLAY_WINDOW_MS);
    const missed = await deps.dbReplayMissed(userId, resumeFrom, cutoff);
    for (const row of missed) {
      if (stream.aborted || stream.closed) return;
      // NEW: filter replays through suppression rule too
      if (suppressionQueue.shouldSuppress(userId, quiet.enabled, row)) continue;
      await stream.writeSSE({
        event: "agent-event",
        id: String(row.id),
        data: JSON.stringify(row),
      });
    }
  }

  // Phase 2: Live attach — quiet-mode-aware listener.
  let isQuiet = quiet.enabled;
  const eventListener = (row: DrizzleAgentEvent) => {
    if (stream.aborted || stream.closed) return;
    if (suppressionQueue.shouldSuppress(userId, isQuiet, row)) return;
    void stream.writeSSE({
      event: "agent-event",
      id: String(row.id),
      data: JSON.stringify(row),
    });
  };
  const quietListener = (p: { enabled: boolean; since: string | null }) => {
    if (stream.aborted || stream.closed) return;
    isQuiet = p.enabled;
    void stream.writeSSE({
      event: "quiet_mode_changed",
      data: JSON.stringify(p),
    });
    // Note: actual flush is done in /v1/quiet-mode PUT handler — not here.
    // The bus emits each held row as a normal "event", which falls through
    // to eventListener above. By then isQuiet is already false locally.
  };
  deps.bus.on(userId, eventListener);
  deps.bus.onQuiet(userId, quietListener);

  // Phase 3: keepalive (UNCHANGED, lines 100–104)

  // Phase 4: cleanup
  stream.onAbort(() => {
    clearInterval(keepalive);
    deps.bus.off(userId, eventListener);
    deps.bus.offQuiet(userId, quietListener);
  });

  // Phase 5: hold open (UNCHANGED)
});
```
[VERIFIED: agent-stream.ts read line-by-line]

### Example D — `createDedupedDeviceStatusListener` helper + test

```typescript
// vigil-g2-plugin/src/lib/deduped-device-status.ts (NEW)
import type { DeviceStatus, DeviceConnectType } from '@evenrealities/even_hub_sdk'

/**
 * Phase 125 (G2-POLISH-08 / D-12): dedupe consecutive device-status events
 * with the same connectType. Defends against SDK noise (HARDWARE-DIVERGENCE.md
 * Divergence 6 — repeated `connectType: "none"` emissions).
 *
 * Returns a wrapped callback that fires the inner callback only when
 * status.connectType differs from the last-seen value.
 *
 * D-12: helper ships in v3.8 with no live consumer. First consumer (likely
 * a "glasses disconnected" indicator separate from the SSE-network offline
 * indicator) is a v3.9+ candidate.
 */
export function createDedupedDeviceStatusListener(
  callback: (status: DeviceStatus) => void,
): (status: DeviceStatus) => void {
  let lastSeenConnectType: DeviceConnectType | null = null
  return (status: DeviceStatus) => {
    if (status.connectType === lastSeenConnectType) return
    lastSeenConnectType = status.connectType
    callback(status)
  }
}
```

```typescript
// vigil-g2-plugin/src/lib/deduped-device-status.test.ts (NEW)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDedupedDeviceStatusListener } from './deduped-device-status.ts'
import { DeviceConnectType } from '@evenrealities/even_hub_sdk'
import type { DeviceStatus } from '@evenrealities/even_hub_sdk'

function makeStatus(connectType: DeviceConnectType): DeviceStatus {
  return { sn: 'TEST', connectType } as DeviceStatus
}

test('createDedupedDeviceStatusListener — 5×"none" fires once', () => {
  const calls: DeviceConnectType[] = []
  const listener = createDedupedDeviceStatusListener((s) => calls.push(s.connectType))
  for (let i = 0; i < 5; i++) listener(makeStatus(DeviceConnectType.None))
  assert.deepEqual(calls, [DeviceConnectType.None])
})

test('createDedupedDeviceStatusListener — change fires; consecutive same is deduped', () => {
  const calls: DeviceConnectType[] = []
  const listener = createDedupedDeviceStatusListener((s) => calls.push(s.connectType))
  listener(makeStatus(DeviceConnectType.None))
  listener(makeStatus(DeviceConnectType.None))
  listener(makeStatus(DeviceConnectType.Connecting))
  listener(makeStatus(DeviceConnectType.Connected))
  listener(makeStatus(DeviceConnectType.Connected))
  listener(makeStatus(DeviceConnectType.Disconnected))
  assert.deepEqual(calls, [
    DeviceConnectType.None,
    DeviceConnectType.Connecting,
    DeviceConnectType.Connected,
    DeviceConnectType.Disconnected,
  ])
})

test('createDedupedDeviceStatusListener — first call always fires (lastSeen starts null)', () => {
  const calls: DeviceConnectType[] = []
  const listener = createDedupedDeviceStatusListener((s) => calls.push(s.connectType))
  listener(makeStatus(DeviceConnectType.Connected))
  assert.deepEqual(calls, [DeviceConnectType.Connected])
})
```
[VERIFIED: DeviceConnectType + DeviceStatus type defs at index.d.ts:104–168; tsx --test pattern from package.json:14]

### Example E — PWA Settings G2 Plugin section

```tsx
// vigil-pwa/src/pages/SettingsPage.tsx — new section (mirror SPORTS-01 placement):

// Add to state declarations alongside line 130:
const [quietMode, setQuietModeState] = useState<boolean>(false)
const [quietModeStatus, setQuietModeStatus] = useState<'loading' | 'ok' | 'error'>('loading')
const lastSavedQuietModeRef = useRef<boolean>(false)
const quietModeSaveTimerRef = useRef<number | null>(null)

// Add to mount effect (alongside loadCalendars):
useEffect(() => {
  void (async () => {
    try {
      const { enabled } = await getQuietMode()
      setQuietModeState(enabled)
      lastSavedQuietModeRef.current = enabled
      setQuietModeStatus('ok')
    } catch {
      setQuietModeStatus('error')
    }
  })()
}, [])

// Handler — modeled on handleCalendarToggle (line 588):
function handleQuietModeToggle() {
  const previous = quietMode
  const next = !previous
  setQuietModeState(next)  // optimistic

  if (quietModeSaveTimerRef.current !== null) {
    window.clearTimeout(quietModeSaveTimerRef.current)
  }
  quietModeSaveTimerRef.current = window.setTimeout(async () => {
    quietModeSaveTimerRef.current = null
    try {
      await setQuietMode(next)
      lastSavedQuietModeRef.current = next
    } catch {
      setQuietModeState(lastSavedQuietModeRef.current)
      showToast({ variant: 'error', body: "Couldn't save Quiet mode — try again" })
    }
  }, 400)
}

// Render — new section after Sports section, before final closing </div>:
<section className="bg-gray-900 border border-gray-900/40 rounded-lg p-5 mb-4">
  <h2 className="text-lg font-medium">G2 Plugin</h2>
  <p className="text-gray-400 text-sm mt-2">
    Vigil's HUD on your G2 glasses.
  </p>
  <div className="mt-4 flex items-center justify-between">
    <div>
      <p className="text-sm">Quiet mode</p>
      <p className="text-xs text-gray-400">
        Only show <span className="font-mono">needs_input</span> and <span className="font-mono">task_failed</span>.
        Everything else queues silently.
      </p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={quietMode}
      onClick={handleQuietModeToggle}
      disabled={quietModeStatus !== 'ok'}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        quietMode ? 'bg-teal-600' : 'bg-gray-600'
      } ${quietModeStatus !== 'ok' ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          quietMode ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
</section>
```

```typescript
// vigil-pwa/src/api/client.ts — additions:
export interface QuietModeResult {
  enabled: boolean
  since: string | null
}

export async function getQuietMode(): Promise<QuietModeResult> {
  const res = await vigilFetch('/v1/quiet-mode')
  if (!res.ok) throw new Error(`Failed to fetch quiet mode: ${res.status}`)
  return (await res.json()) as QuietModeResult
}

export async function setQuietMode(enabled: boolean): Promise<void> {
  const res = await vigilFetch('/v1/quiet-mode', {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
  if (!res.ok) throw new Error(`Failed to save quiet mode: ${res.status}`)
}
```
[VERIFIED: pattern from SettingsPage.tsx:588–614 + 616–632; api/client.ts:818–824]

## SEED-005 SDK Source-Dive Spike (Pre-Resolved)

**This research executes the spike per CONTEXT D-06 so the planner does not need to allocate it.** Branch result: **NOT FOUND.** Plan should go straight to the documented-exit fallback (footer-hint + REQUIREMENTS.md amendment).

### Method

Inspected:

1. `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts` lines 280–355 (`ListItemContainerProperty` and `ListContainerProperty` class definitions).
2. `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/README.md` (full file, English version).
3. `grep -n -i "bubble\|propagat\|capture" dist/index.d.ts` — full SDK surface scan.
4. `grep -n "List_ItemEvent" dist/index.d.ts` — list-event payload structure.

### Findings

**`ListContainerProperty` field set (lines 322–354):**
```
xPosition, yPosition, width, height,
borderWidth, borderColor, borderRadius, paddingLength,
containerID, containerName,
itemContainer (ListItemContainerProperty),
isEventCapture: number  // (0 or 1)
```
**`ListItemContainerProperty` field set (lines 299–316):**
```
itemCount, itemWidth, isItemSelectBorderEn, itemName
```

**`isEventCapture` semantics (README lines 161, 399, 877):**
> "On a page, only one container can handle events at the end."
> "When creating multiple containers, **exactly one** container must have `isEventCapture=1` (all others must be `0`)"

This is a SINGLE-OWNER routing flag, NOT a bubble flag. Events route to the one container that has `isEventCapture: 1`. There is no "bubble out to parent" semantics.

**No fields named:** `bubbleEvents`, `propagate`, `propagateEvents`, `passEventsThrough`, `eventCaptureMode`, `parentEventBubble`, `delegate`, `forwardScroll`, etc.

**Full SDK grep for bubble/propagate/capture-related terms:**
```
345: isEventCapture?: number;  (ListContainerProperty)
372: isEventCapture?: number;  (TextContainerProperty)
877: "Event capture flag (0 or 1). On a page, only one container can handle events at the end."
```
No additional matches. The SDK has no bubbling primitive.

**JS bundle is obfuscated** (variable names like `_0x322276`, `_0x4f8a94`) so a behavioral trace through the compiled JS would require de-obfuscation. The TypeScript surface is the authoritative public contract. If a hidden flag existed, it would be in the type defs (or it would be a private implementation detail not exposed to plugins).

### Decision

**Spike returns empty.** Per D-06 fallback branch:

1. Plugin already shows `() double-tap to exit` in `work-orders.ts:53` footer (verified line-by-line). **Verify this matches the spec-locked wording from D-06**: spec says "tap×2 to exit". The current text uses Unicode `()` to denote the touchpad gesture symbol (matches affirmation.ts:53 convention `() double-tap to exit`). **Recommend keeping current text** — it's already on-screen, accurate, and consistent with the rest of the plugin.
2. Amend REQUIREMENTS.md G2-POLISH-05 wording from "Swipe-out-of-list navigation works on real G2 hardware; list-container SCROLL events propagate correctly" to "List screens have a documented exit gesture (DOUBLE_CLICK → home) with on-screen hint; SDK SCROLL bubble limit acknowledged in SEED-005 follow-up."
3. Plan commits the spike finding (THIS RESEARCH FILE serves as the artifact) separately from the wording amendment — D-07 atomic-commit-per-branch.

### Open follow-up

If a future SDK release exposes a bubble flag, the only remaining work is: set the flag on `WORK_ORDERS` `wo-list` ListContainerProperty (line 87–98 of work-orders.ts), wire SCROLL_TOP / SCROLL_BOTTOM in `handleNavEvent`, hardware retest. Reverting the REQUIREMENTS.md amendment is one commit. Cheap to undo.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Spec assumed iOS Focus state read via Even SDK | PWA toggle → Vigil Core → SSE pipeline | Phase 125 discuss-phase 2026-05-10 (D-01) | Wording-honest implementation; SDK does not expose Focus state |
| Demo wording "single-tap to acknowledge" | "double-tap to acknowledge" | Phase 125 discuss-phase 2026-05-10 (D-08) | Matches Phase 124 / SEED-011 / hardware reality |
| `list-container SCROLL bubbles` (assumed) | Documented exit via DOUBLE_CLICK + footer hint | Phase 125 spike pre-resolved 2026-05-10 (D-06 fallback branch) | SDK provides no bubble flag; exit gesture is the v3.8 ship |

**Deprecated/outdated:**
- Roadmap SC #1 wording ("DND state honored on HUD via Even SDK") — replaced by PWA-toggle pipeline per D-01.
- v3.8 spec line 235 ("Honor iOS Focus state via Even SDK") — superseded by the PWA→Core→SSE pipeline (D-01..D-04).
- v3.8 spec lines 229–233 ("Single tap on temple: acknowledge … Long press: dismiss") — narrowed to DOUBLE_CLICK only per Phase 124 D-08 + SEED-011.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `app.json` `min_sdk_version` should bump 0.0.7 → 0.0.8 because Phase 124 added launch-source detection (added in 0.0.8 per README changelog) | Pitfall 6 | LOW — if 0.0.7 hosts can't load 0.0.8 plugins, users on old SDK silently fail to install. Planner should verify `bridge.onLaunchSource` is the only 0.0.8+-only API touched in Phase 124, and bump accordingly |
| A2 | `vigil-g2-plugin/scripts/check-verified.mjs` will need a refreshed VERIFIED.md (under Phase 106's directory) before `npm run package:ehpk` succeeds | Pitfall 9 | MEDIUM — if missed, ship blocks at Wave 3. Fix is one timestamp edit. Recommend planner allocates a "refresh VERIFIED.md" task before pack |
| A3 | Demo recording can reliably trigger `needs_input` via a pre-staged prompt (e.g., dangerous git operation) | Pitfall 7 | MEDIUM — if no prompt reliably fires, recording takes 5+ takes. Operator wallclock; not auto-executable |
| A4 | Even Hub developer portal accepts live captures only for the Preview field per memory `project_even_hub_preview_field` | Pitfall 8 | LOW — if dashboard demands composites despite policy, escalate to operator (not Claude's call) |
| A5 | The Phase 116 SPORTS-01 D-21 optimistic-toggle pattern translates directly to the boolean Quiet-mode toggle | Pattern 5 + Example E | LOW — pattern is well-tested; only the payload shape differs |

## Open Questions

1. **Should the HUD show a visible quiet-mode glyph?**
   - What we know: CONTEXT.md `<specifics>` calls out `🌙` or `Q` in the header rightSide as an option ("saves the user wondering whether the HUD is silent because nothing's happening or because DND is on").
   - What's unclear: Whether the user wants this UX. Marked as planner / UI-spec discretion in CONTEXT.md.
   - Recommendation: Plan as a 1-line addition in `companion.ts` `computeRightSide()` — branch on `isQuietMode()`. Single Q/moon glyph. Keep it small. If user disagrees, revert the one line.

2. **Should the PWA section also surface "since" timestamp?**
   - What we know: The `since` payload exists in `quiet_mode_changed` and DB column.
   - What's unclear: Whether the PWA UI shows "Quiet mode on since 14:32".
   - Recommendation: NOT in v3.8. Keep the toggle minimal. Surface `since` later if user requests.

3. **Should the suppression queue be persistent across vigil-core restarts?**
   - What we know: Railway's auto-deploy on every push restarts the container; in-memory state evaporates.
   - What's unclear: If a user is in DND for an hour and vigil-core restarts mid-window, the held events are lost; toggle-off shows nothing.
   - Recommendation: NOT in v3.8 (D-04 explicit: in-memory). Cost: rare, single-user. Future replacement (Postgres `held_agent_events` table) is straightforward; gates on user request.

4. **Should the synthetic frame use a separate `event:` name from live toggles?**
   - What we know: D-03 says synthetic frame uses `quiet_mode_changed` (same as live).
   - What's unclear: Whether the plugin needs to distinguish "this is the bootstrap state" from "this is a fresh user toggle" (e.g., to suppress a "Quiet mode just enabled" toast UX that would otherwise fire on every reconnect).
   - Recommendation: Single event name (per D-03). Plugin uses idempotent `setQuietMode(next)` — applying the same state twice is a no-op. No toast UX in v3.8 anyway.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 20.x | vigil-core, vigil-pwa, vigil-g2-plugin builds | ✓ | 20.x | — |
| Postgres (Railway) | `users.quiet_mode` migration + persistence | ✓ | (Railway managed) | — |
| `npm` package manager | All builds | ✓ | (bundled with Node) | — |
| `tsx` | vigil-core dev + vigil-g2-plugin tests | ✓ | ^4.19.0 (in package.json) | — |
| `drizzle-kit` | Migration generation | ✓ | ^0.31.10 (in package.json) | — |
| Vite | vigil-pwa + vigil-g2-plugin builds | ✓ | (in package.json) | — |
| `evenhub` CLI | `npm run pack` (vigil.ehpk) | ⚠ Unverified | — | None — must verify via `which evenhub` or vendored bin path before Wave 3 |
| Real Even Realities G2 hardware | Wave 4 retest + demo recording | ✓ (operator) | firmware 2.2.0.28 per CONTEXT | — |
| iPhone with Even App installed | Wave 4 retest + demo recording | ✓ (operator) | (Even App version per Even Hub release) | — |
| VS Code with Claude Code | Wave 4 demo (active session for `needs_input` to fire) | ✓ (operator) | — | — |
| Phone screen-recording capability | Wave 4 demo recording | ✓ (operator) — iOS native | — | — |
| `iCloud Drive/Vigil/portfolio/` directory | Demo clip storage (CONTEXT discretion) | ✓ (operator-side) | — | Save locally and upload to drive separately |

**Missing dependencies with no fallback:**
- `evenhub` CLI binary used by `package.json:10 "pack"` script. Path is unverified — could be a global install, a vendored bin, or a homebrew formula. Planner must include a "verify `evenhub` CLI present" task in Wave 3 ship-prep (just `which evenhub || echo MISSING`). If missing, install path is whatever Even Realities documents (likely `npm install -g @evenrealities/cli` — but this is unverified).

**Missing dependencies with fallback:**
- None — all other deps are present.

[VERIFIED: ran `find` for vite/drizzle configs; checked package.json scripts; checked Dockerfile]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (vigil-core) | `tsx --test` (Node 20 built-in test runner via tsx loader) |
| Framework (vigil-pwa) | (no test config detected — verify in Wave 0) |
| Framework (vigil-g2-plugin) | `tsx --test` (Node 20 built-in) |
| Config file | None (no jest.config / vitest.config detected) — `tsx --test "src/**/*.test.ts"` per package.json:14 |
| Quick run command (vigil-core) | `cd vigil-core && npm test` |
| Quick run command (vigil-g2-plugin) | `cd vigil-g2-plugin && npm test` |
| Full suite | All three repos: `(cd vigil-core && npm test) && (cd vigil-pwa && npm test) && (cd vigil-g2-plugin && npm test)` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGENT-HUD-03 | `users.quiet_mode` column persists; `GET /v1/quiet-mode` returns `{enabled, since}` | unit | `cd vigil-core && tsx --test src/routes/quiet-mode.test.ts` | Wave 0 (NEW file) |
| AGENT-HUD-03 | `PUT /v1/quiet-mode` writes column + emits SSE + flushes suppression on disable | integration | `cd vigil-core && tsx --test src/routes/quiet-mode.test.ts` | Wave 0 |
| AGENT-HUD-03 | Suppression Map keyed `(userId, sessionId, eventType)` last-of-each-kind, sorted on flush | unit | `cd vigil-core && tsx --test src/lib/quiet-mode-suppression.test.ts` | Wave 0 (NEW file) |
| AGENT-HUD-03 | `bus.emitQuiet` / `bus.onQuiet` fan-out per-userId; isolation invariant holds | unit | `cd vigil-core && tsx --test src/lib/agent-events-bus.test.ts` (extend existing) | Existing file extended |
| AGENT-HUD-03 | SSE shim dispatches `quiet_mode_changed` event-type to `onQuietMode` callback | unit | `cd vigil-g2-plugin && tsx --test src/lib/sse-client.test.ts` (extend) | Existing file extended |
| AGENT-HUD-03 | `companion.ts` `setQuietMode` toggles ref; `buildContainers` filters non-allowlist banners | unit | `cd vigil-g2-plugin && tsx --test src/screens/companion.test.ts` (extend) | Existing file extended |
| AGENT-HUD-03 | E2E hardware: PWA toggle → HUD suppresses → toggle off → replay arrives in order | manual-only (wallclock) | (operator on real G2) | Wave 4 |
| G2-POLISH-05 | Footer hint reads "() double-tap to exit" on work-orders | unit (rendering) | grep work-orders.ts content for exact string | Existing file unchanged |
| G2-POLISH-05 | REQUIREMENTS.md G2-POLISH-05 wording amended | docs grep | `grep "documented exit gesture" .planning/REQUIREMENTS.md` | Wave 3 docs amendment |
| G2-POLISH-08 | Pure helper dedupes consecutive same-`connectType` calls | unit | `cd vigil-g2-plugin && tsx --test src/lib/deduped-device-status.test.ts` | Wave 0 (NEW file) |
| G2-PLUGIN-01 | `app.json` version === "0.3.0" | unit (file content) | grep `"version": "0.3.0"` `vigil-g2-plugin/app.json` | Existing file modified |
| G2-PLUGIN-01 | `npm run package:ehpk` produces `vigil.ehpk` artifact | shell smoke | `cd vigil-g2-plugin && npm run package:ehpk && ls vigil.ehpk` | After VERIFIED.md refresh |
| G2-PLUGIN-01 | Even Hub portal upload acknowledged | manual-only (wallclock) | screenshot dashboard, save to `artifacts/` | Wave 4 |
| AGENT-DEMO-01 | Wording amended single-tap → double-tap | docs grep | `grep "double-tap to acknowledge" .planning/REQUIREMENTS.md .planning/PROJECT.md .planning/ROADMAP.md .planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` | Wave 3 docs amendment |
| AGENT-DEMO-01 | 60s demo clip captured | manual-only (wallclock) | clip saved to iCloud path | Wave 4 |

### Sampling Rate
- **Per task commit:** `cd <repo> && npm test` for the repo touched (typically < 10s for vigil-core, < 5s for plugin).
- **Per wave merge:** All three repo test suites pass.
- **Phase gate:** Full suite green + hardware retest VERIFICATION.md filed before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `vigil-core/src/routes/quiet-mode.test.ts` — covers AGENT-HUD-03 endpoint contract
- [ ] `vigil-core/src/lib/quiet-mode-suppression.test.ts` — covers AGENT-HUD-03 suppression queue (Map shape, allowlist, flush ordering)
- [ ] `vigil-core/src/lib/agent-events-bus.test.ts` — EXTEND existing for `emitQuiet/onQuiet/offQuiet` + isolation invariant
- [ ] `vigil-core/src/routes/agent-stream.test.ts` — EXTEND existing for synthetic-frame ordering (Phase 0 BEFORE Phase 1) + Last-Event-ID replay through suppression filter
- [ ] `vigil-g2-plugin/src/lib/deduped-device-status.test.ts` — covers G2-POLISH-08 helper
- [ ] `vigil-g2-plugin/src/lib/sse-client.test.ts` — EXTEND existing for `quiet_mode_changed` event-type dispatch
- [ ] `vigil-g2-plugin/src/screens/companion.test.ts` — EXTEND existing for `setQuietMode` mutator + filter (verify `companion.test.ts` exists; if not, create)
- [ ] Refresh `vigil-g2-plugin/.planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md` Verified line BEFORE Wave 3 ship-prep (else `package:ehpk` fails)

## Sources

### Primary (HIGH confidence)
- `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts` — full SDK type surface (lines 100–168 DeviceStatus / DeviceConnectType, lines 280–355 ListContainerProperty, lines 707–717 OsEventTypeList, line 1242 onDeviceStatusChanged)
- `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/README.md` — SDK API contract + `isEventCapture` semantics (lines 161, 399, 877)
- `vigil-core/src/index.ts` — bearer-auth dispatcher + route mount sequence (line 140 dispatcher; lines 214–222 agent-events / agent-stream)
- `vigil-core/src/routes/agent-stream.ts` — Phase 124 SSE handler shape (lines 67–119 streamSSE callback)
- `vigil-core/src/routes/agent-events.ts` — POST handler dedupe gate (line 249 `isNew` check before bus.emit)
- `vigil-core/src/lib/agent-events-bus.ts` — per-userId EventEmitter pattern
- `vigil-core/src/db/schema.ts` (lines 25–55) — users table baseline
- `vigil-core/drizzle/0017_users_email_verified_at.sql` + `0015_add_password_changed_at.sql` — migration template
- `vigil-core/Dockerfile:18` — auto-applied migrations on Railway deploy
- `vigil-core/src/routes/calendar.ts` — GET/PUT route mirror
- `vigil-core/src/routes/settings.ts` — Hono router factory + app_settings precedent
- `vigil-pwa/src/pages/SettingsPage.tsx` (lines 588–614 + 616–632) — optimistic toggle + rollback toast
- `vigil-pwa/src/api/client.ts` (lines 818–824) — PUT helper pattern
- `vigil-g2-plugin/src/lib/sse-client.ts` (line 130) — event-type dispatch site
- `vigil-g2-plugin/src/screens/companion.ts` — HUD-write boundary + module-level state pattern
- `vigil-g2-plugin/src/screens/work-orders.ts` (line 53) — footer text already reads `() double-tap to exit`
- `vigil-g2-plugin/src/navigation.ts` (lines 174–197) — DOUBLE_CLICK → home pattern
- `vigil-g2-plugin/scripts/check-verified.mjs` — VERIFIED.md staleness gate
- `vigil-g2-plugin/package.json` (line 14) — `tsx --test` runner
- `vigil-g2-plugin/app.json` — version + min_sdk_version contract
- `.planning/phases/124-…/124-CONTEXT.md` — D-08 DOUBLE_CLICK narrowing context
- `.planning/seeds/SEED-005`, `SEED-008`, `SEED-011` — seed background

### Secondary (MEDIUM confidence)
- SDK README changelog "0.0.8 (highlights) — Added launch source push/listening support" — basis for `min_sdk_version` bump assumption (A1)

### Tertiary (LOW confidence)
- `evenhub` CLI install path — unverified, requires Wave 3 verification step

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version verified against committed package.json files; no new packages.
- Architecture: HIGH — every contract validated against live code (SSE handler, bus, schema, settings router, plugin shim).
- Pitfalls: HIGH — Pitfalls 1, 4, 9 are direct reads of code; Pitfall 6 (min_sdk_version) is MEDIUM (depends on tracing Phase 124's exact API surface vs. SDK 0.0.8 changelog).
- SEED-005 spike result: HIGH — TypeScript type defs are the authoritative public surface; the absence of a bubble flag is verified by exhaustive grep.
- Validation architecture: HIGH — test frameworks verified by reading package.json scripts.

**Research date:** 2026-05-10
**Valid until:** 2026-05-20 (10 days for SDK ecosystem; quicker if `@evenrealities/even_hub_sdk` releases a 0.0.10+ that exposes new APIs)

## RESEARCH COMPLETE
