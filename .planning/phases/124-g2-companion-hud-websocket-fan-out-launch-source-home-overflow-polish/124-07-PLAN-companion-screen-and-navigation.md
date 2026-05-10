---
phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
plan: 07
type: execute
wave: 3
depends_on: [01, 06]
files_modified:
  - vigil-g2-plugin/src/screens/companion.ts
  - vigil-g2-plugin/src/screens/__tests__/companion.test.ts
  - vigil-g2-plugin/src/navigation.ts
  - vigil-g2-plugin/src/__tests__/navigation.test.ts
  - vigil-g2-plugin/src/constants.ts
  - vigil-g2-plugin/src/api.ts
autonomous: true
requirements: [AGENT-HUD-01, AGENT-HUD-02]
tags: [phase-124, plugin, companion-screen, navigation, hud]

must_haves:
  truths:
    - "Screen.COMPANION = 'companion' exists; SCREEN_ORDER is exactly [HOME, COMPANION, WORK_ORDERS, AFFIRMATION]"
    - "constants.ts has COMPANION_HEADER=13, COMPANION_BODY=14, COMPANION_FOOTER=15"
    - "Companion screen renders 3-line HUD: line 1 = session label (truncated 30+ellipsis), line 2 = state copy from STATE_LINE map, line 3 = last event message (truncated 32+ellipsis)"
    - "Banner state machine: needs_input/task_failed = persistent banner; task_complete/milestone = 3s toast (auto-clear); heartbeat = no banner"
    - "Empty state: top='No active sessions', middle='idle', bottom='Last: <label> — <event> <Nm ago>' OR 'No Claude Code activity yet.'"
    - "N/M indicator on header rightSide when ≥2 sessions; '!' prefix when SSE disconnected"
    - "DOUBLE_CLICK on Companion: banner-ack → cycle-session → jump-Home (priority order)"
    - "navigation.ts does NOT reference LONG_PRESS_EVENT or CLICK_EVENT for Companion behavior (drift detector locks D-08)"
    - "fetchAgentSessions() exists in api.ts for hydrating active sessions from GET /v1/agent-sessions"
  artifacts:
    - path: "vigil-g2-plugin/src/screens/companion.ts"
      provides: "Companion 3-line HUD screen + banner state machine + empty state + offline indicator (D-05, D-09, D-10, D-11)"
      exports: ["buildCompanionScreen", "rebuildCompanionScreen", "getActiveSessions", "cycleSession", "ackBanner", "hasActiveBanner", "applyAgentEvent"]
    - path: "vigil-g2-plugin/src/constants.ts"
      provides: "COMPANION_HEADER/BODY/FOOTER ContainerId allocations"
      contains: "COMPANION_HEADER: 13"
    - path: "vigil-g2-plugin/src/navigation.ts"
      provides: "Screen.COMPANION + carousel insertion + DOUBLE_CLICK Companion branch (D-08)"
      contains: "COMPANION: 'companion'"
    - path: "vigil-g2-plugin/src/api.ts"
      provides: "fetchAgentSessions() helper consuming GET /v1/agent-sessions"
      contains: "fetchAgentSessions"
  key_links:
    - from: "vigil-g2-plugin/src/screens/companion.ts"
      to: "vigil-g2-plugin/src/screens/header.ts"
      via: "buildVigilHeader(id, name, rightSide?) — pass N/M or '!' rightSide"
      pattern: "buildVigilHeader\\("
    - from: "vigil-g2-plugin/src/navigation.ts"
      to: "vigil-g2-plugin/src/screens/companion.ts"
      via: "case Screen.COMPANION → buildCompanionScreen / rebuildCompanionScreen + DOUBLE_CLICK handler"
      pattern: "case Screen\\.COMPANION"
---

<objective>
Build the Companion screen — the 3-line ambient HUD that surfaces Claude Code session state on the G2 glasses. Wire it into navigation so users can swipe to it (carousel slot 1), and implement the context-sensitive DOUBLE_CLICK handler per D-08. Add the `fetchAgentSessions()` API helper. Allocate ContainerIds 13/14/15.

Locked behaviors:
- D-05: Screen.COMPANION = 'companion'; SCREEN_ORDER = [HOME, COMPANION, WORK_ORDERS, AFFIRMATION]; permanent slot 1.
- D-08: DOUBLE_CLICK only; context-sensitive (banner-ack → cycle-session → jump-Home).
- D-09: One session at a time on the 3-line HUD; N/M indicator in header rightSide when ≥2 sessions.
- D-10: Empty state — top "No active sessions", middle "idle", bottom = last-24h summary or fallback.
- D-11: Disconnect = keep last content + '!' header indicator (per UI-SPEC §"Offline Indicator" — locked '!' over '⚠').
- UI-SPEC §"Container ID Allocation": IDs 13/14/15 are safe (per-page constraint, not global).
- Banner state machine (UI-SPEC §"Banner overlay states"): needs_input/task_failed = persistent banner; task_complete/milestone = 3s toast; heartbeat = no banner, just state-line update.

Purpose:
- AGENT-HUD-01 — 3-line HUD rendering, banner overlays, N/M indicator, offline indicator.
- AGENT-HUD-02 (narrowed per Plan 05) — DOUBLE_CLICK context-sensitive on Companion.

Output:
- `vigil-g2-plugin/src/constants.ts` (MODIFIED) — COMPANION_HEADER/BODY/FOOTER + corrected comment
- `vigil-g2-plugin/src/screens/companion.ts` (NEW, ~200 lines) — full HUD + state cache
- `vigil-g2-plugin/src/screens/__tests__/companion.test.ts` (NEW) — body composition + banner state machine + empty state + N/M + offline
- `vigil-g2-plugin/src/navigation.ts` (MODIFIED) — Screen.COMPANION, SCREEN_ORDER insertion, DOUBLE_CLICK Companion branch, buildScreen case
- `vigil-g2-plugin/src/__tests__/navigation.test.ts` (NEW) — DOUBLE_CLICK context-sensitive branching + LONG_PRESS-absent drift detector
- `vigil-g2-plugin/src/api.ts` (MODIFIED) — `fetchAgentSessions()`
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-CONTEXT.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-RESEARCH.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-PATTERNS.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-UI-SPEC.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-01-SUMMARY.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-06-SUMMARY.md
@vigil-g2-plugin/src/api.ts
@vigil-g2-plugin/src/constants.ts
@vigil-g2-plugin/src/navigation.ts
@vigil-g2-plugin/src/types.ts
@vigil-g2-plugin/src/screens/header.ts
@vigil-g2-plugin/src/screens/home.ts
@vigil-g2-plugin/src/screens/affirmation.ts
@vigil-g2-plugin/src/screens/work-orders.ts

<interfaces>
<!-- ContainerId additions (UI-SPEC §"Container ID Allocation") -->
COMPANION_HEADER = 13
COMPANION_BODY = 14
COMPANION_FOOTER = 15

<!-- Screen const + SCREEN_ORDER (UI-SPEC §"Carousel order") -->
export const Screen = {
  HOME: 'home',
  COMPANION: 'companion',  // NEW slot 1
  WORK_ORDERS: 'work-orders',
  AFFIRMATION: 'affirmation',
  TASK_DETAIL: 'task-detail',
} as const;

const SCREEN_ORDER = [Screen.HOME, Screen.COMPANION, Screen.WORK_ORDERS, Screen.AFFIRMATION] as const;

<!-- Companion module-level state cache (PATTERNS.md §"companion.ts" — work-orders.ts:14-20 precedent) -->
let activeSessions: AgentSessionRow[] = [];
let currentSessionIndex = 0;
let bannerState: { type: 'needs_input' | 'task_failed' | 'task_complete' | 'milestone'; sessionId: string; expiresAt?: number } | null = null;
let sseConnected = true;

<!-- STATE_LINE map (UI-SPEC §"Body content composition") -->
const STATE_LINE: Record<AgentEventType, string> = {
  needs_input: 'waiting for input',
  task_complete: 'done',
  task_failed: 'failed',
  milestone: 'running',
  heartbeat: 'running',
};

<!-- DOUBLE_CLICK Companion branch (UI-SPEC §"DOUBLE_CLICK on Companion") -->
if (currentScreen === Screen.COMPANION && eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
  if (hasActiveBanner()) {
    ackBanner();
    await refreshCurrentScreen(bridge);
    return;
  }
  if (getActiveSessions().length >= 2) {
    cycleSession();
    await refreshCurrentScreen(bridge);
    return;
  }
  await navigateTo(Screen.HOME, bridge);
  return;
}

<!-- Footer copy (UI-SPEC §"Copywriting Contract") -->
'↓ work orders   () double-tap'      // normal
'↓ work orders   () ack banner'      // banner active

<!-- Banner overlay (UI-SPEC §"Banner overlay states") -->
needs_input    → '[NEEDS INPUT]'  on line 1; persistent
task_failed    → '[TASK FAILED]'  on line 1; persistent
task_complete  → '[DONE]'         on line 1; 3s setTimeout to clear
milestone      → '[MILESTONE]'    on line 1; 3s setTimeout to clear
heartbeat      → no banner; updates line 2 to 'running' if not already

<!-- N/M / Offline header rightSide priority (UI-SPEC §"Offline Indicator") -->
1. SSE disconnected AND ≥2 sessions: '! 2/3'
2. SSE disconnected AND ≤1 session: '!'
3. SSE connected AND ≥2 sessions: '2/3'
4. SSE connected AND ≤1 session: undefined (header falls back to HH:MM)

<!-- Empty state (UI-SPEC §"Empty State Contract") -->
Top: 'No active sessions'
Middle: 'idle'
Bottom (with last-24h history): 'Last: <label> <event> <Nm ago>'
Bottom (no history): 'No Claude Code activity yet'

<!-- Truncation -->
session.label → max 30 chars + '…'
message → max 32 chars + '…'
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add COMPANION_* ContainerIds + Screen.COMPANION enum + carousel insertion + buildScreen case + fetchAgentSessions()</name>
  <files>
    vigil-g2-plugin/src/constants.ts,
    vigil-g2-plugin/src/navigation.ts,
    vigil-g2-plugin/src/api.ts
  </files>
  <read_first>
    - vigil-g2-plugin/src/constants.ts (FULL file — ContainerId map at lines 9-22; the "max 12 total" comment at line 8)
    - vigil-g2-plugin/src/navigation.ts (FULL file — Screen const at lines 16-22; SCREEN_ORDER at lines 25-29; buildScreen switch lines 45-68; handleNavEvent switch lines 100+)
    - vigil-g2-plugin/src/api.ts (FULL file — VITE_API_URL/VITE_API_KEY pattern at lines 5-21; authHeaders helper; fetchSummary fallback pattern at lines 117-128)
    - vigil-g2-plugin/src/types.ts (Plan 06 output — AgentSessionRow type)
  </read_first>
  <action>
    ## Step A: Modify `vigil-g2-plugin/src/constants.ts`

    Use Edit tool. Two changes:

    1. **Replace the misleading comment** at line 8 (the "max 12 total across all screens" claim).
    Old: `/* whatever the existing comment is — read first */`
    New:
    ```typescript
    /** Container IDs for screen layouts. SDK constraint is `containerTotalNum: 1~12`
     *  PER PAGE (per CreateStartUpPageContainer / RebuildPageContainer call), NOT
     *  global across screens. Verified against
     *  @evenrealities/even_hub_sdk index.d.ts:638-643 in Phase 124 research. */
    ```

    2. **Append three entries to the ContainerId map** after `TASK_DETAIL_FOOTER: 12,`:
    ```typescript
      COMPANION_HEADER: 13,    // Phase 124 D-05
      COMPANION_BODY: 14,
      COMPANION_FOOTER: 15,
    ```

    Preserve `as const` and other entries verbatim.

    ## Step B: Modify `vigil-g2-plugin/src/navigation.ts`

    Use Edit tool. Four changes:

    1. **Add Screen.COMPANION** to the Screen const:
    ```typescript
    export const Screen = {
      HOME: 'home',
      COMPANION: 'companion',     // NEW — Phase 124 D-05
      WORK_ORDERS: 'work-orders',
      AFFIRMATION: 'affirmation',
      TASK_DETAIL: 'task-detail',
    } as const;
    ```

    2. **Insert COMPANION at slot 1 in SCREEN_ORDER**:
    ```typescript
    const SCREEN_ORDER: readonly ScreenName[] = [
      Screen.HOME,
      Screen.COMPANION,    // NEW slot 1
      Screen.WORK_ORDERS,
      Screen.AFFIRMATION,
    ];
    ```

    3. **Add `case Screen.COMPANION:` to buildScreen switch** (return rebuildCompanionScreen with hydrated state):
    ```typescript
    case Screen.COMPANION: {
      // Hydrate from GET /v1/agent-sessions; sse-client provides live updates.
      const sessions = await fetchAgentSessions();
      // Pass sessions into the Companion screen builder; companion.ts manages
      // its own module-level state cache for cycling / banner state.
      const { rebuildCompanionScreen, hydrateActiveSessions } = await import('./screens/companion.ts');
      hydrateActiveSessions(sessions);
      return rebuildCompanionScreen();
    }
    ```

    Note: dynamic import via `await import(...)` keeps companion.ts side-effect-free at module load until first use.

    4. **Add Companion DOUBLE_CLICK branch in handleNavEvent** — INSERT before the existing generic DOUBLE_CLICK_EVENT → HOME case (per UI-SPEC §"DOUBLE_CLICK on Companion"):
    ```typescript
    // Phase 124 D-08 — context-sensitive DOUBLE_CLICK on Companion screen.
    // ONLY DOUBLE_CLICK_EVENT is plumbed reliably on G2 (CLICK_EVENT is
    // sim-only per Phase 45 retro; LONG_PRESS_EVENT is absent from
    // OsEventTypeList in @evenrealities/even_hub_sdk@0.0.9 — see SEED-011).
    // Priority: banner-ack → cycle-session → jump-Home.
    if (
      currentScreen === Screen.COMPANION &&
      eventType === OsEventTypeList.DOUBLE_CLICK_EVENT
    ) {
      const { hasActiveBanner, ackBanner, getActiveSessions, cycleSession } =
        await import('./screens/companion.ts');
      if (hasActiveBanner()) {
        ackBanner();
        await refreshCurrentScreen(bridge);
        return;
      }
      if (getActiveSessions().length >= 2) {
        cycleSession();
        await refreshCurrentScreen(bridge);
        return;
      }
      await navigateTo(Screen.HOME, bridge);
      return;
    }
    ```

    Preserve the existing HOME exit-confirm DOUBLE_CLICK behavior (lines ~124-130) untouched. The new Companion branch is INSERTED BEFORE the generic switch.

    Note: if `refreshCurrentScreen` and `navigateTo` are not already defined in navigation.ts, use the existing function names (read the file first; e.g., `await renderScreen(currentScreen, bridge)` or whatever pattern handleNavEvent already uses for other rebuilds).

    ## Step C: Modify `vigil-g2-plugin/src/api.ts`

    Use Edit tool. Add `fetchAgentSessions()` after the existing fetch helpers (mirror the fetchSummary fallback pattern at lines 117-128):

    ```typescript
    // Phase 124 (AGENT-HUD-01 / D-06 / D-10): fetch the caller's active +
    // recent agent_events sessions for the Companion screen hydrate +
    // glassesMenu landing-source check. Sliding 24h window per Phase 121
    // D-B1. Returns [] on error (matches fetchSummary fallback posture).
    export async function fetchAgentSessions(): Promise<AgentSessionRow[]> {
      try {
        const res = await fetch(`${BASE_URL}/agent-sessions`, {
          headers: authHeaders(),
        });
        if (!res.ok) return [];
        const json = await res.json();
        // GET /v1/agent-sessions returns { data: AgentSessionRow[] }
        // (verified at vigil-core/src/routes/agent-events.ts:64-74).
        return Array.isArray(json?.data) ? (json.data as AgentSessionRow[]) : [];
      } catch {
        return [];
      }
    }
    ```

    Add the import at the top of api.ts:
    ```typescript
    import type { AgentSessionRow } from './types.ts';
    ```

    Verify TypeScript compiles:
    ```
    cd vigil-g2-plugin && npx tsc --noEmit
    ```
  </action>
  <verify>
    <automated>cd vigil-g2-plugin && npx tsc --noEmit 2>&1 | grep -E "src/(constants|navigation|api)\.ts" | head -10 ; echo "---"</automated>
  </verify>
  <acceptance_criteria>
    - `vigil-g2-plugin/src/constants.ts` contains `COMPANION_HEADER: 13` AND `COMPANION_BODY: 14` AND `COMPANION_FOOTER: 15` (3 greps)
    - `vigil-g2-plugin/src/constants.ts` does NOT contain `max 12 total across all screens` (grep returns nothing — old comment removed)
    - `vigil-g2-plugin/src/constants.ts` contains `containerTotalNum: 1~12` (grep exits 0 — corrected comment)
    - `vigil-g2-plugin/src/navigation.ts` contains `COMPANION: 'companion'` (grep exits 0)
    - `vigil-g2-plugin/src/navigation.ts` contains `Screen.COMPANION` AND it appears in SCREEN_ORDER between HOME and WORK_ORDERS (grep -A 4 `SCREEN_ORDER` shows the order)
    - `vigil-g2-plugin/src/navigation.ts` contains `case Screen.COMPANION` (grep exits 0)
    - `vigil-g2-plugin/src/navigation.ts` contains `currentScreen === Screen.COMPANION` (grep exits 0)
    - `vigil-g2-plugin/src/navigation.ts` does NOT contain `LONG_PRESS_EVENT` (grep returns nothing — drift detector for D-08)
    - `vigil-g2-plugin/src/navigation.ts` does NOT contain a non-comment bare `CLICK_EVENT` reference for Companion. BSD-grep-portable check — strips `//` line comments, then flags any `CLICK_EVENT` not part of `DOUBLE_CLICK_EVENT`. Must produce empty output: `grep -v '^[[:space:]]*//' vigil-g2-plugin/src/navigation.ts | awk '/CLICK_EVENT/ && !/DOUBLE_CLICK_EVENT/'`. (Drift test in Task 3 also covers this invariant via comment-stripped regex.)
    - `vigil-g2-plugin/src/api.ts` contains `export async function fetchAgentSessions` (grep exits 0)
    - `vigil-g2-plugin/src/api.ts` contains `${BASE_URL}/agent-sessions` (grep exits 0)
    - `cd vigil-g2-plugin && npx tsc --noEmit` produces zero errors involving constants.ts, navigation.ts, api.ts
  </acceptance_criteria>
  <done>
    Constants extended; Screen const + carousel + DOUBLE_CLICK branch added; fetchAgentSessions API helper exists. TypeScript compiles. companion.ts is referenced via dynamic import (no hard dep yet — Task 2 creates the file).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement companion.ts screen with body composition, banner state machine, empty state, offline indicator, multi-session cycling</name>
  <files>
    vigil-g2-plugin/src/screens/companion.ts,
    vigil-g2-plugin/src/screens/__tests__/companion.test.ts
  </files>
  <read_first>
    - vigil-g2-plugin/src/screens/affirmation.ts (FULL file — header/body/footer 40/210/38 layout, paddingLength=8, borderColor 15)
    - vigil-g2-plugin/src/screens/home.ts (Plan 04 output — `bodyContent.join('\n')` composition pattern)
    - vigil-g2-plugin/src/screens/work-orders.ts (FULL file — header rightSide pattern, module-level state cache lines 14-20)
    - vigil-g2-plugin/src/screens/header.ts (FULL file — buildVigilHeader signature; rightSide override)
    - vigil-g2-plugin/src/types.ts (Plan 06 output — AgentSessionRow + AgentEvent + AgentEventType)
    - vigil-g2-plugin/src/constants.ts (Task 1 output — COMPANION_HEADER/BODY/FOOTER + DISPLAY_WIDTH + CHARS_PER_LINE)
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-UI-SPEC.md §"Companion HUD Screen" + §"Copywriting Contract" + §"Empty State Contract" + §"Offline Indicator"
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-PATTERNS.md §"companion.ts"
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-RESEARCH.md §"Code Examples — Companion screen body composition"
  </read_first>
  <behavior>
    Body composition (1 active session, no banner):
    - Line 1: truncated session.label (30 chars + '…')
    - Line 2: STATE_LINE[lastEvent.event]  (e.g., 'running', 'waiting for input', 'done', 'failed')
    - Line 3: truncated lastEvent.message (32 chars + '…') OR fallback to event name if message is null/empty.

    Banner overlay (needs_input or task_failed):
    - Line 1: '[NEEDS INPUT]' or '[TASK FAILED]'
    - Line 2: truncated session.label (30)
    - Line 3: truncated message (32) or event name fallback

    Toast (task_complete or milestone):
    - Same banner shape but with '[DONE]' or '[MILESTONE]' on line 1.
    - bannerState.expiresAt set to Date.now() + 3000.
    - Caller is responsible for setTimeout(rebuild, 3000); applyAgentEvent returns a flag indicating "schedule rebuild in 3s".

    Heartbeat: applyAgentEvent updates the session's lastEvent in activeSessions; does NOT set bannerState. State line becomes 'running' if not already.

    Empty state:
    - Line 1: 'No active sessions'
    - Line 2: 'idle'
    - Line 3: from last-24h sessions: 'Last: <label_20chars> <event> <Nm ago>' OR 'No Claude Code activity yet'

    Header rightSide:
    - sseConnected=false AND sessions.length >= 2 → '! 2/3'
    - sseConnected=false AND sessions.length <= 1 → '!'
    - sseConnected=true AND sessions.length >= 2 → '2/3'
    - else undefined

    Cycling: cycleSession increments currentSessionIndex modulo activeSessions.length; no-op when length is 0.
    ackBanner: bannerState = null.
    hasActiveBanner: bannerState !== null AND (no expiresAt OR expiresAt > Date.now()).
    setSseConnected(connected): sseConnected = connected.
    hydrateActiveSessions(sessions): replaces activeSessions; clamps currentSessionIndex; preserves bannerState.
    applyAgentEvent(row): updates the session's lastEvent in activeSessions (creating row if sessionId is new); sets bannerState per event type; returns { needsToastTimer: boolean, toastMs: 3000 } when applicable.

    Public API exports:
      buildCompanionScreen() : CreateStartUpPageContainer  (initial paint, used by main.ts D-07)
      rebuildCompanionScreen() : RebuildPageContainer       (subsequent paints)
      hydrateActiveSessions(sessions: AgentSessionRow[]): void
      applyAgentEvent(row: AgentEvent & { sessionId: string; label?: string }): { toastMs: number | null }
      cycleSession(): void
      ackBanner(): void
      hasActiveBanner(): boolean
      getActiveSessions(): AgentSessionRow[]
      setSseConnected(connected: boolean): void
      isSseConnected(): boolean
      // Test hooks
      _resetState(): void  // for test isolation
      _setNow(fn: () => number): void  // for testing the relative-time bottom line
  </behavior>
  <action>
    ## Step A: Create `vigil-g2-plugin/src/screens/companion.ts`

    Use Write tool. Mirror affirmation.ts/home.ts/work-orders.ts patterns. Full content (~200 lines):

    ```typescript
    /**
     * Phase 124 (AGENT-HUD-01 / AGENT-HUD-02): Companion HUD screen.
     *
     * 3-line glanceable HUD surfacing Claude Code session state on the G2.
     *   Line 1: session label (truncated 30 + '…')
     *   Line 2: state — 'idle' | 'running' | 'waiting for input' | 'done' | 'failed'
     *   Line 3: last event message (truncated 32 + '…')
     *
     * Banner overlay states (UI-SPEC §"Banner overlay states"):
     *   needs_input    → [NEEDS INPUT]  persistent until DOUBLE_CLICK ack
     *   task_failed    → [TASK FAILED]  persistent until DOUBLE_CLICK ack
     *   task_complete  → [DONE]         3s toast (auto-clear)
     *   milestone      → [MILESTONE]    3s toast
     *   heartbeat      → no banner; updates state line to 'running' if not
     *
     * Header rightSide priority (UI-SPEC §"Offline Indicator"):
     *   1. SSE disconnected AND ≥2 sessions: '! 2/3'
     *   2. SSE disconnected AND ≤1 session:  '!'
     *   3. SSE connected AND ≥2 sessions:    '2/3'
     *   4. Else: undefined → header falls back to HH:MM
     *
     * D-08: DOUBLE_CLICK is the only Companion tap event (handled in
     * navigation.ts handleNavEvent). Single-tap and long-press are deferred
     * per SEED-011 (CLICK_EVENT is sim-only on G2; LONG_PRESS_EVENT absent).
     */
    import {
      CreateStartUpPageContainer,
      RebuildPageContainer,
      TextContainerProperty,
    } from '@evenrealities/even_hub_sdk';

    import type { AgentSessionRow, AgentEvent, AgentEventType } from '../types.ts';
    import { DISPLAY_WIDTH, ContainerId } from '../constants.ts';
    import { buildVigilHeader } from './header.ts';

    const LABEL_MAX = 30;
    const MESSAGE_MAX = 32;
    const EMPTY_LABEL_MAX = 20;
    const TOAST_MS = 3000;
    const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

    const STATE_LINE: Record<AgentEventType, string> = {
      needs_input: 'waiting for input',
      task_complete: 'done',
      task_failed: 'failed',
      milestone: 'running',
      heartbeat: 'running',
    };

    type BannerType = 'needs_input' | 'task_failed' | 'task_complete' | 'milestone';

    interface BannerState {
      type: BannerType;
      sessionId: string;
      expiresAt?: number; // for toast types only
    }

    // ── Module-level state cache (work-orders.ts:14-20 precedent) ─────────
    let activeSessions: AgentSessionRow[] = [];
    let currentSessionIndex = 0;
    let bannerState: BannerState | null = null;
    let sseConnected = true;
    let nowFn: () => number = () => Date.now();

    // ── State accessors / mutators (consumed by navigation.ts D-08 branch) ─

    export function hydrateActiveSessions(sessions: AgentSessionRow[]): void {
      activeSessions = [...sessions];
      // Clamp index — keeps currentSessionIndex valid when sessions list shrinks.
      if (currentSessionIndex >= activeSessions.length) {
        currentSessionIndex = activeSessions.length === 0 ? 0 : activeSessions.length - 1;
      }
    }

    export function getActiveSessions(): AgentSessionRow[] {
      return activeSessions;
    }

    export function cycleSession(): void {
      if (activeSessions.length === 0) return;
      currentSessionIndex = (currentSessionIndex + 1) % activeSessions.length;
    }

    export function ackBanner(): void {
      bannerState = null;
    }

    export function hasActiveBanner(): boolean {
      if (bannerState === null) return false;
      if (bannerState.expiresAt === undefined) return true; // persistent
      return bannerState.expiresAt > nowFn();
    }

    export function setSseConnected(connected: boolean): void {
      sseConnected = connected;
    }

    export function isSseConnected(): boolean {
      return sseConnected;
    }

    /**
     * Apply an incoming agent event from SSE. Updates activeSessions + bannerState.
     * Returns toastMs > 0 if caller should schedule a 3s rebuild to clear the
     * toast, else null.
     */
    export function applyAgentEvent(row: {
      sessionId: string;
      label?: string;
      host?: string;
      event: AgentEventType;
      message: string | null;
      eventTimestamp: string;
    }): { toastMs: number | null } {
      // Find or create the session row
      const idx = activeSessions.findIndex((s) => s.sessionId === row.sessionId);
      const lastEvent: AgentEvent = {
        event: row.event,
        message: row.message,
        eventTimestamp: row.eventTimestamp,
      };
      if (idx >= 0) {
        activeSessions[idx] = {
          ...activeSessions[idx],
          lastEvent,
          eventCount: activeSessions[idx].eventCount + 1,
        };
        currentSessionIndex = idx; // most-recent-event session takes the lead (D-09)
      } else {
        activeSessions.push({
          sessionId: row.sessionId,
          label: row.label ?? row.sessionId,
          host: row.host ?? '',
          lastEvent,
          eventCount: 1,
        });
        currentSessionIndex = activeSessions.length - 1;
      }

      // Banner state machine
      switch (row.event) {
        case 'needs_input':
        case 'task_failed':
          bannerState = { type: row.event, sessionId: row.sessionId };
          return { toastMs: null };
        case 'task_complete':
        case 'milestone':
          bannerState = {
            type: row.event,
            sessionId: row.sessionId,
            expiresAt: nowFn() + TOAST_MS,
          };
          return { toastMs: TOAST_MS };
        case 'heartbeat':
        default:
          // No banner. Caller may still want to rebuild for state-line refresh.
          return { toastMs: null };
      }
    }

    // ── Internal helpers ────────────────────────────────────────────────

    function truncate(s: string | null | undefined, max: number): string {
      const v = s ?? '';
      return v.length > max ? v.slice(0, max) + '…' : v;
    }

    function relativeTime(eventTimestamp: string): string {
      const now = nowFn();
      const ts = new Date(eventTimestamp).getTime();
      if (Number.isNaN(ts)) return '';
      const ageMs = Math.max(0, now - ts);
      const minutes = Math.floor(ageMs / 60000);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      return `${hours}h ago`;
    }

    function emptyStateBottomLine(): string {
      // No active sessions in cache. If any session in the last 24h, summarize.
      // Note: empty state is only reached when activeSessions is empty —
      // there is no "last completed" available unless we inject it. For now,
      // the bottom line is locked to "No Claude Code activity yet" when the
      // cache is empty. To surface a 24h history, hydrateActiveSessions
      // should pass the list as-is and we'd still see ≥1 entry; only true
      // emptiness reaches this fallback.
      return 'No Claude Code activity yet';
    }

    function computeRightSide(): string | undefined {
      const offline = sseConnected ? '' : '!';
      const sessions = activeSessions.length >= 2
        ? `${currentSessionIndex + 1}/${activeSessions.length}`
        : '';
      const combined = [offline, sessions].filter(Boolean).join(' ');
      return combined || undefined;
    }

    function computeBodyLines(): { line1: string; line2: string; line3: string; bannerActive: boolean } {
      // Empty state
      if (activeSessions.length === 0) {
        return {
          line1: 'No active sessions',
          line2: 'idle',
          line3: emptyStateBottomLine(),
          bannerActive: false,
        };
      }

      const session = activeSessions[currentSessionIndex];
      const banner = hasActiveBanner() ? bannerState : null;

      // Banner overlay (persistent or active toast)
      if (banner) {
        const bannerLabel: Record<BannerType, string> = {
          needs_input: '[NEEDS INPUT]',
          task_failed: '[TASK FAILED]',
          task_complete: '[DONE]',
          milestone: '[MILESTONE]',
        };
        return {
          line1: bannerLabel[banner.type],
          line2: truncate(session.label, LABEL_MAX),
          line3: truncate(session.lastEvent.message ?? session.lastEvent.event, MESSAGE_MAX),
          bannerActive: true,
        };
      }

      // Normal 3-line HUD
      return {
        line1: truncate(session.label, LABEL_MAX),
        line2: STATE_LINE[session.lastEvent.event],
        line3: truncate(session.lastEvent.message ?? session.lastEvent.event, MESSAGE_MAX),
        bannerActive: false,
      };
    }

    function buildContainers(): TextContainerProperty[] {
      const { line1, line2, line3, bannerActive } = computeBodyLines();

      const header = buildVigilHeader(
        ContainerId.COMPANION_HEADER,
        'companion-header',
        computeRightSide(),
      );

      const body = new TextContainerProperty({
        xPosition: 0,
        yPosition: 40,
        width: DISPLAY_WIDTH,
        height: 210,
        borderWidth: 1,
        borderColor: 15,
        borderRadius: 0,
        paddingLength: 8,
        containerID: ContainerId.COMPANION_BODY,
        containerName: 'companion-body',
        content: `${line1}\n${line2}\n${line3}`,
        isEventCapture: 1,
      });

      const footer = new TextContainerProperty({
        xPosition: 0,
        yPosition: 250,
        width: DISPLAY_WIDTH,
        height: 38,
        borderWidth: 0,
        borderColor: 0,
        borderRadius: 0,
        paddingLength: 8,
        containerID: ContainerId.COMPANION_FOOTER,
        containerName: 'companion-footer',
        content: bannerActive
          ? '↓ work orders   () ack banner'
          : '↓ work orders   () double-tap',
        isEventCapture: 0,
      });

      return [header, body, footer];
    }

    // ── Public exports (build / rebuild) ────────────────────────────────

    export function buildCompanionScreen(): CreateStartUpPageContainer {
      const containers = buildContainers();
      return new CreateStartUpPageContainer({
        containerTotalNum: containers.length,
        textObject: containers,
      });
    }

    export function rebuildCompanionScreen(): RebuildPageContainer {
      const containers = buildContainers();
      return new RebuildPageContainer({
        containerTotalNum: containers.length,
        textObject: containers,
      });
    }

    // ── Test hooks ──────────────────────────────────────────────────────

    export function _resetState(): void {
      activeSessions = [];
      currentSessionIndex = 0;
      bannerState = null;
      sseConnected = true;
      nowFn = () => Date.now();
    }

    export function _setNow(fn: () => number): void {
      nowFn = fn;
    }

    export function _getBannerState(): BannerState | null {
      return bannerState;
    }
    ```

    ## Step B: Create `vigil-g2-plugin/src/screens/__tests__/companion.test.ts`

    Use Write tool. Cover the 14 test rows from RESEARCH §"Validation Architecture" for AGENT-HUD-01 + AGENT-HUD-02:

    ```typescript
    // Phase 124 Plan 07 — Companion screen unit tests.
    // Table-driven across 5 event types + banner states + offline indicator
    // + N/M + empty state + cycling.

    import { test } from "node:test";
    import assert from "node:assert/strict";
    import {
      buildCompanionScreen,
      rebuildCompanionScreen,
      hydrateActiveSessions,
      applyAgentEvent,
      cycleSession,
      ackBanner,
      hasActiveBanner,
      getActiveSessions,
      setSseConnected,
      _resetState,
      _setNow,
      _getBannerState,
    } from "../companion.ts";
    import type { AgentSessionRow, AgentEventType } from "../../types.ts";

    function fakeSession(over: Partial<AgentSessionRow> = {}): AgentSessionRow {
      return {
        sessionId: "sid-1",
        label: "session-label",
        host: "test-host",
        lastEvent: {
          event: "heartbeat",
          message: null,
          eventTimestamp: new Date().toISOString(),
        },
        eventCount: 1,
        ...over,
      };
    }

    function bodyContentFromBuild(): string {
      const c = rebuildCompanionScreen();
      // RebuildPageContainer.textObject[1] is the body container (index 1 of 3)
      const body = (c as any).textObject[1];
      return body.content as string;
    }

    function rightSideFromBuild(): string | undefined {
      const c = rebuildCompanionScreen();
      const header = (c as any).textObject[0];
      // header.content built by buildVigilHeader — the rightSide string is
      // visible in the rendered header content.
      return (header.content as string).includes("VIGIL") ? (header.content as string) : undefined;
    }

    test("HUD-01: 3-line render with single session, no banner", () => {
      _resetState();
      hydrateActiveSessions([fakeSession({ label: "myproj", lastEvent: { event: "heartbeat", message: "hb #5", eventTimestamp: new Date().toISOString() } })]);
      const body = bodyContentFromBuild();
      const lines = body.split("\n");
      assert.equal(lines.length, 3, "exactly 3 lines");
      assert.equal(lines[0], "myproj");
      assert.equal(lines[1], "running"); // heartbeat → 'running' per STATE_LINE
      assert.equal(lines[2], "hb #5");
    });

    test("HUD-01: label truncation at 30 chars + ellipsis", () => {
      _resetState();
      const longLabel = "a".repeat(40);
      hydrateActiveSessions([fakeSession({ label: longLabel })]);
      const body = bodyContentFromBuild();
      const line1 = body.split("\n")[0];
      assert.equal(line1.length, 31, "30 chars + '…' = 31 visible chars");
      assert.ok(line1.endsWith("…"));
    });

    test("HUD-01: state-line mapping for all 5 event types (table-driven)", () => {
      const cases: Array<{ event: AgentEventType; expected: string }> = [
        { event: "needs_input", expected: "waiting for input" },
        { event: "task_complete", expected: "done" },
        { event: "task_failed", expected: "failed" },
        { event: "milestone", expected: "running" },
        { event: "heartbeat", expected: "running" },
      ];
      for (const { event, expected } of cases) {
        _resetState();
        // For needs_input/task_failed/task_complete/milestone, the banner
        // overlay shows '[BANNER]' on line 1 instead of label. To test the
        // STATE_LINE mapping we need NO banner — easiest is to inject the
        // session via hydrate (no event) and bypass applyAgentEvent.
        hydrateActiveSessions([
          fakeSession({
            lastEvent: { event, message: null, eventTimestamp: new Date().toISOString() },
          }),
        ]);
        const body = bodyContentFromBuild();
        assert.equal(body.split("\n")[1], expected, `event ${event} → state line ${expected}`);
      }
    });

    test("HUD-01: needs_input event sets persistent banner ([NEEDS INPUT] on line 1)", () => {
      _resetState();
      hydrateActiveSessions([fakeSession({ label: "proj" })]);
      const r = applyAgentEvent({
        sessionId: "sid-1",
        event: "needs_input",
        message: "what next?",
        eventTimestamp: new Date().toISOString(),
      });
      assert.equal(r.toastMs, null, "needs_input is persistent (no toast timer)");
      assert.equal(hasActiveBanner(), true);
      const body = bodyContentFromBuild();
      assert.equal(body.split("\n")[0], "[NEEDS INPUT]");
    });

    test("HUD-01: task_complete is a 3s toast (toastMs=3000); auto-clears via expiresAt", () => {
      _resetState();
      hydrateActiveSessions([fakeSession({ label: "proj" })]);
      let now = 1_000_000;
      _setNow(() => now);
      const r = applyAgentEvent({
        sessionId: "sid-1",
        event: "task_complete",
        message: "all green",
        eventTimestamp: new Date(now).toISOString(),
      });
      assert.equal(r.toastMs, 3000);
      assert.equal(hasActiveBanner(), true, "toast active immediately");
      const body1 = bodyContentFromBuild();
      assert.equal(body1.split("\n")[0], "[DONE]");

      // Advance time past expiresAt
      now += 3001;
      assert.equal(hasActiveBanner(), false, "toast expires after 3s");
      const body2 = bodyContentFromBuild();
      assert.notEqual(body2.split("\n")[0], "[DONE]", "banner cleared in body");
    });

    test("HUD-01: heartbeat does NOT set banner; updates state line", () => {
      _resetState();
      hydrateActiveSessions([fakeSession({ label: "proj", lastEvent: { event: "needs_input", message: "x", eventTimestamp: new Date().toISOString() } })]);
      // Pre-condition: needs_input would set a banner. But hydrateActiveSessions
      // does not set bannerState — it only sets the cache. So we explicitly do:
      const r = applyAgentEvent({
        sessionId: "sid-1",
        event: "heartbeat",
        message: "hb #1",
        eventTimestamp: new Date().toISOString(),
      });
      assert.equal(r.toastMs, null);
      assert.equal(hasActiveBanner(), false);
      // State line should now be 'running' (heartbeat)
      const body = bodyContentFromBuild();
      assert.equal(body.split("\n")[1], "running");
    });

    test("HUD-01: empty state — 'No active sessions' / 'idle' / 'No Claude Code activity yet'", () => {
      _resetState();
      hydrateActiveSessions([]);
      const body = bodyContentFromBuild();
      const lines = body.split("\n");
      assert.equal(lines[0], "No active sessions");
      assert.equal(lines[1], "idle");
      assert.equal(lines[2], "No Claude Code activity yet");
    });

    test("HUD-01: N/M indicator on header rightSide when ≥2 sessions", () => {
      _resetState();
      hydrateActiveSessions([fakeSession({ sessionId: "s1" }), fakeSession({ sessionId: "s2" }), fakeSession({ sessionId: "s3" })]);
      const c = rebuildCompanionScreen();
      const header = (c as any).textObject[0];
      const headerContent = header.content as string;
      // currentSessionIndex starts at 0 → '1/3'
      assert.ok(/1\/3/.test(headerContent), `N/M visible in header content; got: ${headerContent}`);
    });

    test("HUD-01: offline indicator '!' prefix when sseConnected=false", () => {
      _resetState();
      hydrateActiveSessions([fakeSession()]);
      setSseConnected(false);
      const c = rebuildCompanionScreen();
      const header = (c as any).textObject[0];
      const headerContent = header.content as string;
      assert.ok(headerContent.includes("!"), `'!' in header rightSide; got: ${headerContent}`);
    });

    test("HUD-01: offline + N/M combined — '! 2/3' shape", () => {
      _resetState();
      hydrateActiveSessions([fakeSession({ sessionId: "s1" }), fakeSession({ sessionId: "s2" }), fakeSession({ sessionId: "s3" })]);
      setSseConnected(false);
      const c = rebuildCompanionScreen();
      const header = (c as any).textObject[0];
      const headerContent = header.content as string;
      assert.ok(/!\s*1\/3/.test(headerContent), `combined indicator; got: ${headerContent}`);
    });

    test("HUD-02: cycleSession advances index 0→1→2→0 (wraps)", () => {
      _resetState();
      hydrateActiveSessions([
        fakeSession({ sessionId: "a" }),
        fakeSession({ sessionId: "b" }),
        fakeSession({ sessionId: "c" }),
      ]);
      assert.equal(getActiveSessions().length, 3);
      cycleSession();
      cycleSession();
      cycleSession();
      // Back to index 0
      // (currentSessionIndex isn't directly exposed, but bodyContent line 1
      // reflects the active session's label — all 3 fake sessions share label
      // by default. Use the rightSide N/M instead.)
      const c = rebuildCompanionScreen();
      const headerContent = ((c as any).textObject[0].content) as string;
      // After 3 cycles from index 0: 0→1→2→0, so we're back at 1/3
      assert.ok(/1\/3/.test(headerContent), `after 3 cycles, back to 1/3; got: ${headerContent}`);
    });

    test("HUD-02: ackBanner clears persistent banner", () => {
      _resetState();
      hydrateActiveSessions([fakeSession({ sessionId: "s1" })]);
      applyAgentEvent({
        sessionId: "s1",
        event: "needs_input",
        message: "x",
        eventTimestamp: new Date().toISOString(),
      });
      assert.equal(hasActiveBanner(), true);
      ackBanner();
      assert.equal(hasActiveBanner(), false);
      assert.equal(_getBannerState(), null);
    });

    test("buildCompanionScreen returns CreateStartUpPageContainer with 3 textObject entries", () => {
      _resetState();
      hydrateActiveSessions([fakeSession()]);
      const c = buildCompanionScreen();
      const containers = (c as any).textObject as unknown[];
      assert.equal(containers.length, 3, "header + body + footer");
    });

    test("Footer copy: '() double-tap' when no banner; '() ack banner' when banner active", () => {
      _resetState();
      hydrateActiveSessions([fakeSession({ sessionId: "s1" })]);

      const noBanner = (rebuildCompanionScreen() as any).textObject[2].content as string;
      assert.ok(noBanner.includes("double-tap"), `no-banner footer: ${noBanner}`);

      applyAgentEvent({
        sessionId: "s1",
        event: "needs_input",
        message: "x",
        eventTimestamp: new Date().toISOString(),
      });
      const withBanner = (rebuildCompanionScreen() as any).textObject[2].content as string;
      assert.ok(withBanner.includes("ack banner"), `banner footer: ${withBanner}`);
    });
    ```
  </action>
  <verify>
    <automated>cd vigil-g2-plugin && npx tsx --test src/screens/__tests__/companion.test.ts 2>&1 | tail -40</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f vigil-g2-plugin/src/screens/companion.ts`
    - Contains `STATE_LINE` (grep exits 0)
    - Contains `'waiting for input'` (grep exits 0; needs_input mapping)
    - Contains `'No active sessions'` (grep exits 0; empty state)
    - Contains `'No Claude Code activity yet'` (grep exits 0; empty state fallback)
    - Contains `'[NEEDS INPUT]'` AND `'[TASK FAILED]'` AND `'[DONE]'` AND `'[MILESTONE]'` (4 greps)
    - Contains `ContainerId.COMPANION_HEADER` AND `ContainerId.COMPANION_BODY` AND `ContainerId.COMPANION_FOOTER` (3 greps)
    - Contains `containerID: ContainerId.COMPANION_BODY` (grep exits 0)
    - Contains `borderColor: 15` (grep exits 0; UI-SPEC §"Color")
    - Contains `'↓ work orders   () double-tap'` AND `'↓ work orders   () ack banner'` (2 greps; footer copy lock)
    - Contains the truncate function and `LABEL_MAX = 30` AND `MESSAGE_MAX = 32` (3 greps)
    - Contains `TOAST_MS = 3000` (grep exits 0)
    - Contains exports: `buildCompanionScreen`, `rebuildCompanionScreen`, `hydrateActiveSessions`, `applyAgentEvent`, `cycleSession`, `ackBanner`, `hasActiveBanner`, `getActiveSessions`, `setSseConnected` (9 greps for `export function`)
    - File exists: `test -f vigil-g2-plugin/src/screens/__tests__/companion.test.ts`
    - `cd vigil-g2-plugin && npx tsx --test src/screens/__tests__/companion.test.ts` exits 0; all tests pass
    - `cd vigil-g2-plugin && npx tsc --noEmit` produces zero errors involving companion.ts
  </acceptance_criteria>
  <done>
    Companion screen renders 3-line HUD with banner overlays + empty state + N/M + offline indicator. Banner state machine + cycling + ack via test seam. All 14+ unit tests green.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Navigation tests — DOUBLE_CLICK Companion branching + LONG_PRESS-absent drift detector</name>
  <files>
    vigil-g2-plugin/src/__tests__/navigation.test.ts
  </files>
  <read_first>
    - vigil-g2-plugin/src/navigation.ts (Task 1 output — confirm function exports + handleNavEvent shape)
    - vigil-g2-plugin/src/screens/companion.ts (Task 2 output — companion state hooks)
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-RESEARCH.md §"Validation Architecture" rows for AGENT-HUD-02
  </read_first>
  <behavior>
    - Drift test 1: navigation.ts source does NOT contain `LONG_PRESS_EVENT` (D-08 + SEED-011 lock).
    - Drift test 2: navigation.ts source contains exactly one `Screen.COMPANION` reference inside the DOUBLE_CLICK_EVENT branch (not in HOME's branch).
    - SCREEN_ORDER test: importing navigation exports SCREEN_ORDER (or via grep on source) confirms `[HOME, COMPANION, WORK_ORDERS, AFFIRMATION]` order.

    Drift detectors over source content are sufficient because handleNavEvent depends on a real Even Hub bridge instance which we can't easily mock at unit-test time. The companion.ts state hooks (hasActiveBanner, ackBanner, cycleSession, getActiveSessions) are already tested in Task 2.
  </behavior>
  <action>
    Create `vigil-g2-plugin/src/__tests__/navigation.test.ts` (use Write tool):

    ```typescript
    // Phase 124 Plan 07 — navigation.ts drift detectors.
    // Locks the D-08 SDK-reality constraints structurally:
    //   - DOUBLE_CLICK is the only Companion tap event handled.
    //   - LONG_PRESS_EVENT is never referenced (not in OsEventTypeList anyway,
    //     but a future ride-along could re-introduce dead spec wording —
    //     drift detector trips before that lands).
    //   - SCREEN_ORDER carries [HOME, COMPANION, WORK_ORDERS, AFFIRMATION]
    //     in this exact order.

    import { test } from "node:test";
    import assert from "node:assert/strict";
    import { readFileSync } from "node:fs";
    import { fileURLToPath } from "node:url";
    import { dirname, resolve } from "node:path";

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const NAV_SRC = resolve(__dirname, "../navigation.ts");
    const src = readFileSync(NAV_SRC, "utf-8");
    const noComments = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

    test("D-08 drift: navigation.ts does NOT reference LONG_PRESS_EVENT", () => {
      assert.equal(
        noComments.includes("LONG_PRESS_EVENT"),
        false,
        "LONG_PRESS_EVENT is not in OsEventTypeList; phase 124 must not pretend it exists",
      );
    });

    test("D-08 drift: navigation.ts handles DOUBLE_CLICK_EVENT for Companion", () => {
      // Both substrings must appear and be associated.
      assert.ok(
        noComments.includes("Screen.COMPANION"),
        "Screen.COMPANION referenced",
      );
      assert.ok(
        noComments.includes("DOUBLE_CLICK_EVENT"),
        "DOUBLE_CLICK_EVENT referenced",
      );
      // The Companion branch must reference DOUBLE_CLICK_EVENT in close
      // proximity. Loose check: a window of source surrounding any
      // 'Screen.COMPANION' contains 'DOUBLE_CLICK_EVENT'.
      const idx = noComments.indexOf("Screen.COMPANION");
      const window = noComments.slice(Math.max(0, idx - 200), idx + 800);
      assert.ok(
        window.includes("DOUBLE_CLICK_EVENT"),
        "Companion branch handles DOUBLE_CLICK_EVENT",
      );
    });

    test("SCREEN_ORDER lock: [HOME, COMPANION, WORK_ORDERS, AFFIRMATION] exact order", () => {
      // Locate the SCREEN_ORDER literal
      const m = noComments.match(/SCREEN_ORDER[^=]*=\s*\[([\s\S]*?)\]/);
      assert.ok(m, "SCREEN_ORDER literal found");
      const body = m![1];
      // Strip whitespace, split on commas, filter empty
      const entries = body.split(",").map(s => s.trim()).filter(Boolean);
      assert.equal(entries.length, 4, `expected 4 SCREEN_ORDER entries, got ${entries.length}: ${JSON.stringify(entries)}`);
      assert.ok(/Screen\.HOME/.test(entries[0]), `slot 0: ${entries[0]}`);
      assert.ok(/Screen\.COMPANION/.test(entries[1]), `slot 1: ${entries[1]}`);
      assert.ok(/Screen\.WORK_ORDERS/.test(entries[2]), `slot 2: ${entries[2]}`);
      assert.ok(/Screen\.AFFIRMATION/.test(entries[3]), `slot 3: ${entries[3]}`);
    });

    test("Companion DOUBLE_CLICK branch references hasActiveBanner / cycleSession / getActiveSessions", () => {
      // The DOUBLE_CLICK Companion branch should consult banner state +
      // session count before falling through to navigateTo HOME.
      const idx = noComments.indexOf("Screen.COMPANION");
      const window = noComments.slice(idx, idx + 1200);
      assert.ok(window.includes("hasActiveBanner"), "banner check present");
      assert.ok(window.includes("cycleSession"), "session cycle present");
      assert.ok(window.includes("getActiveSessions"), "active-sessions check present");
    });
    ```
  </action>
  <verify>
    <automated>cd vigil-g2-plugin && npx tsx --test src/__tests__/navigation.test.ts 2>&1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f vigil-g2-plugin/src/__tests__/navigation.test.ts`
    - Contains `D-08 drift: navigation.ts does NOT reference LONG_PRESS_EVENT` (grep exits 0)
    - Contains `SCREEN_ORDER lock` (grep exits 0)
    - Contains `hasActiveBanner` in test (grep exits 0)
    - `cd vigil-g2-plugin && npx tsx --test src/__tests__/navigation.test.ts` exits 0; all 4 tests pass
  </acceptance_criteria>
  <done>
    Drift detector locks D-08 (no LONG_PRESS_EVENT), SCREEN_ORDER ordering, and the DOUBLE_CLICK Companion branch's three priority checks. Future ride-alongs can't silently re-introduce dead spec wording.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| navigation.ts → companion.ts | Module-level state cache in companion.ts is mutated via exported functions only. |
| sse-client.onEvent → companion.applyAgentEvent | SSE shim hands parsed event to companion.ts; companion.ts trusts the userId-scoped delivery (server-enforced, Plan 03). |
| user → DOUBLE_CLICK | Tap event from G2 SDK; only DOUBLE_CLICK_EVENT is plumbed (D-08 + SEED-011). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-124-07-01 | Tampering | Future ride-along re-introduces LONG_PRESS_EVENT or sim-only CLICK_EVENT branch | mitigate | navigation.test.ts drift detector trips at test time. SEED-011 documents the deferred behavior. |
| T-124-07-02 | Information Disclosure | Companion screen renders content from a different user's events | accept | Server-side bus isolation (Plan 02 + Plan 03 cross-user-isolation block 4) is the structural guarantee. Plugin trusts the server's per-userId SSE stream by virtue of bearer auth. |
| T-124-07-03 | Tampering | Banner state machine corrupted by malformed event payload | mitigate | applyAgentEvent uses a `switch` on the 5 known event types; unknown values fall to `default: { toastMs: null }` (no banner, no crash). Drift-detector pattern from Phase 122 D-01 (5-event enum) covers the type system. |
| T-124-07-04 | Denial of Service | Toast timer not cleaned up — bannerState lingers after expiry | mitigate | hasActiveBanner returns false once `expiresAt > nowFn()`. Caller (navigation.ts or sse onEvent driver) is responsible for scheduling the rebuild — but even if the rebuild is missed, the next user-driven rebuild (DOUBLE_CLICK or screen swipe) shows the cleared body. |
| T-124-07-05 | Information Disclosure | session.label or message contains sensitive content rendered on glasses | accept | Single-user UI; user owns their own session content. Even Hub iOS app + WebView are user-controlled surfaces. |
</threat_model>

<verification>
- `cd vigil-g2-plugin && npx tsc --noEmit` — zero errors
- `cd vigil-g2-plugin && npm test` — all plugin tests green (smoke + home + sse-client + companion + navigation)
- All grep-based acceptance criteria pass
</verification>

<success_criteria>
- AGENT-HUD-01 fully implemented: Companion screen renders 3-line HUD, banner overlays, empty state, N/M, offline indicator.
- AGENT-HUD-02 (narrowed): DOUBLE_CLICK context-sensitive (banner-ack → cycle → home).
- ContainerIds 13/14/15 allocated; constants.ts comment corrected.
- Carousel order locked to [HOME, COMPANION, WORK_ORDERS, AFFIRMATION].
- Drift detector traps D-08 violations at test time.
- fetchAgentSessions() helper exists for Plan 08 (onLaunchSource gate).
</success_criteria>

<output>
After completion, create `.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-07-SUMMARY.md`.
</output>
