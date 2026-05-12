# Even Realities `everything-evenhub` Skill Findings — v3.9 Scope-Shaping

**Source:** `github.com/even-realities/everything-evenhub` cloned to `/tmp/everything-evenhub` on 2026-05-11
**Plugin version:** Skills targeting `@evenrealities/even_hub_sdk` **v0.0.10** (newer than v0.0.9 referenced in v3.8 work)
**Skills read:** `handle-input/SKILL.md`, `device-features/SKILL.md`, `background-state/SKILL.md`, `sdk-reference/SKILL.md`
**Skills NOT read (lower priority — read at phase-plan time):** `glasses-ui`, `design-guidelines`, `quickstart`, `template`, `build-and-deploy`, `test-with-simulator`, `simulator-automation`, `font-measurement`, `cli-reference`

**Why this file exists:** I launched 4 parallel research agents for v3.9 but did NOT seed them with `hub.evenrealities.com/docs/AI-tooling/claude code/`. Operator flagged the gap. Pulling skills directly from GitHub corrects the research before REQUIREMENTS.md commits.

---

## What the SDK Officially Exposes (and What It Doesn't)

### Hardware events (`handle-input/SKILL.md`)

**Canonical `OsEventTypeList` enum — ALL gestures the SDK supports:**

| Value | Name | Gesture | Field on EvenHubEvent |
|-------|------|---------|------------------------|
| 0 | `CLICK_EVENT` | Single press | `sysEvent.eventType` (or `listEvent` on list containers) |
| 1 | `SCROLL_TOP_EVENT` | Swipe up | `textEvent.eventType` (text containers only) |
| 2 | `SCROLL_BOTTOM_EVENT` | Swipe down | `textEvent.eventType` (text containers only) |
| 3 | `DOUBLE_CLICK_EVENT` | Double press | `sysEvent.eventType` |
| 4 | `FOREGROUND_ENTER_EVENT` | App resumed | `sysEvent.eventType` |
| 5 | `FOREGROUND_EXIT_EVENT` | App backgrounded | `sysEvent.eventType` |
| 6 | `ABNORMAL_EXIT_EVENT` | Disconnect | `sysEvent.eventType` |
| 7 | `SYSTEM_EXIT_EVENT` | User confirmed exit dialog | `sysEvent.eventType` |
| 8 | `IMU_DATA_REPORT` | IMU sample | `sysEvent.eventType` + `sysEvent.imuData` |

**Critical gestures NOT in the canonical enum (do not exist; cannot be polyfilled):**
- Long-press (no `LONG_PRESS_EVENT`)
- Triple-tap
- Pinch / multi-finger
- Voice wake-word

**Protobuf zero-omission gotcha (handle-input/SKILL.md:91-99):**

> "Any field with a zero/default value (`0`, `false`, empty string) will be `undefined`, not the zero value. This affects: `sysEvent.eventType` — single click is `0`, but arrives as `undefined`; `listEvent.currentSelectItemIndex` — first item is `0`, but arrives as `undefined`. **Always use nullish coalescing**: `event.sysEvent.eventType ?? 0`."

**This is the load-bearing detail.** Phase 124 D-08 narrowed the three-tap promise to DOUBLE_CLICK-only after "single-tap and long-press not reliably plumbed on hardware." The canonical docs strongly suggest:
- **Long-press doesn't exist** (correct deferral — SEED-011 stays deferred forever)
- **Single-tap DOES exist** — likely Vigil's Companion HUD code missed the `?? 0` nullish guard, treating `eventType === undefined` as "no event" when it should treat it as `CLICK_EVENT`. **Worth a focused re-investigation in v3.9 before declaring single-tap dead.**

### Lifecycle events (`handle-input/SKILL.md:174-181`)

Four canonical lifecycle events plugins should handle:

| Event | When | Vigil Use |
|-------|------|-----------|
| `FOREGROUND_ENTER_EVENT` (4) | App resumed | Re-render current state; resume timers/IMU |
| `FOREGROUND_EXIT_EVENT` (5) | App backgrounded | Flush state to `setLocalStorage`; pause timers |
| `ABNORMAL_EXIT_EVENT` (6) | Unexpected disconnect | Stop hardware (`audioControl(false)`, `imuControl(false)`); unsubscribe |
| `SYSTEM_EXIT_EVENT` (7) | User confirmed exit | Same cleanup as ABNORMAL_EXIT |

**Canonical exit pattern (handle-input/SKILL.md:155-164):**

```typescript
if (eventType === 3) { // DOUBLE_CLICK_EVENT
  bridge.shutDownPageContainer(1)  // mode 1 = show system confirmation dialog
  return
}
```

**Vigil alignment check:** Phase 125 G2-POLISH-05 "documented exit gesture DOUBLE_CLICK → home" landed this verbatim. ✓

**Do NOT clean up resources BEFORE `shutDownPageContainer(1)` returns** — user might cancel. Clean up in the `ABNORMAL_EXIT_EVENT` / `SYSTEM_EXIT_EVENT` handler.

### Background state (`background-state/SKILL.md`)

**This is a SDK primitive distinct from `setLocalStorage`.** Background state survives the host's `Headless WebView migration` strategy:

> "**`inactive`** — host snapshots current JS state via `window.__getStateSnapshot()`. **`paused`** — host creates a new `HeadlessInAppWebView`, loads the same plugin URL, and calls `window.__restoreState(snapshot)`. **Background** — the headless WebView runs invisibly, continuing to push frames to the glasses. **`resumed`** — snapshot injected into the foreground WebView before it wakes up."

**API:**
```typescript
import { setBackgroundState, onBackgroundRestore } from '@evenrealities/even_hub_sdk'

setBackgroundState('myKey', () => ({ ...myState }))      // module init time
onBackgroundRestore('myKey', (saved) => {                 // module init time
  const s = saved as typeof myState
  myState = { ...myState, ...s }
})
```

**Rules:**
- Same string key in both calls
- Plain JSON-serializable object only (no class instances, no `Map`, no `Set`, no `Date`)
- Register at module init time — NOT inside event handlers
- Snapshot must be a **copy** (`{ ...state }`), not a live reference
- Restorer must **reassign** the live variable

### Persistence (`device-features/SKILL.md:117-142`)

`setLocalStorage` / `getLocalStorage` survive plugin re-launches, but the file calls out a critical platform reality:

> "The Even App WebView is a Flutter WebView. **Browser IndexedDB and browser `localStorage` do NOT reliably persist across app restarts** in this environment — data saved there can be lost when the user closes and reopens the app. Use `bridge.setLocalStorage` / `bridge.getLocalStorage` for all user state."

For large content, chunk across keys (CHUNK_SIZE = 50_000 chars, key suffix `_n` for chunk count, `_i` for each chunk).

### Audio capture (`device-features/SKILL.md:16-38`)

```typescript
// Prerequisite: createStartUpPageContainer must succeed first
await bridge.audioControl(true)

const unsubscribe = bridge.onEvenHubEvent(event => {
  if (event.audioEvent) {
    const pcm = event.audioEvent.audioPcm // Uint8Array
  }
})

await bridge.audioControl(false)
unsubscribe()
```

**Format (locked):** "PCM, 16 kHz sample rate, signed 16-bit little-endian, mono channel."

**At 16kHz × 16-bit × mono:** 32,000 bytes/sec = 32 KB/s.

### Device status (`device-features/SKILL.md:88-99`)

```typescript
const unsubscribe = bridge.onDeviceStatusChanged(status => {
  status.batteryLevel  // 0-100
  status.isWearing     // boolean
  status.isCharging
  status.isInCase
  status.isConnected() // helper
})
```

**Vigil alignment check:** Phase 125 G2-POLISH-08 (debounce `connectType:"none"` spam) already uses this. Battery/wearing not yet surfaced anywhere — **opportunity for HUD-CLARITY** (free additional ambient signal alongside SEED-016 Gap 1 staleness timestamp).

### SDK escape hatch (`sdk-reference/SKILL.md:84`)

```typescript
bridge.callEvenApp(method, params?): Promise<any>
// Low-level direct call to native bridge method.
// Use when higher-level methods aren't available.
```

**Not a Claude Code write-back path.** This dispatches to Even Hub host methods only.

### Canvas constraints (`sdk-reference/SKILL.md:457-465`)

| Property | Value |
|----------|-------|
| Resolution | 576 × 288 px |
| Colour depth | 4-bit greyscale (16 shades) |
| Coordinate origin | (0, 0) top-left |
| Max containers | 12 total / 8 text / 4 image |
| Container name max | 16 characters (verbatim Phase 106 G2-02 lesson) |

**No animations, no font control, no text alignment control, no per-item list styling, no programmatic scroll position, no background colors, no speaker, no camera.**

---

## v3.9 Scope-Shaping Implications

### G2-ACTION (mark tasks complete from G2) — gesture allocation question RESOLVED

**Previous concern:** DOUBLE_CLICK is overloaded (exit-to-home on most screens; banner-ack/cycle-session/home on Companion). Single-tap + long-press unreliable. No clean gesture for "mark complete."

**Corrected plan:**
- On WORK_ORDERS **list container**: single-press already fires `listEvent.currentSelectItemIndex` — that's the natural "select item" gesture. Map single-press = select; second single-press on same item = mark complete (with 1-second debounce + visible "tap again to complete" hint); double-press = exit (canonical, preserved).
- On Companion HUD **text container**: single-press fires `sysEvent.eventType === undefined ?? 0 === 0`. Could mean "ack banner" or "no-op"; needs UX call but the **gesture is available**.
- Drop the "two-step DOUBLE_CLICK" pattern proposed in earlier scope draft — single-press is the right primitive.
- **Pre-phase task:** re-investigate Phase 124 D-08's single-tap finding. Check `vigil-g2-plugin/src/screens/companion.ts` handler for `event.sysEvent.eventType ?? 0` vs `event.sysEvent.eventType === 0` and `event.listEvent.currentSelectItemIndex ?? 0` vs strict equality. Hypothesis: missing nullish coalesce, not hardware.

### G2-LIFECYCLE-01 (last-viewed screen restore) — scope EXPANDS

**Previous plan (SEED-009):** Use `bridge.setLocalStorage('vigil:lastScreen', ...)` only.

**Corrected plan:** BOTH SDK primitives needed:
- `setBackgroundState('vigil-companion-state', () => ({...}))` — survives background→foreground migration (within same plugin session)
- `setLocalStorage('vigil:v3:lastScreen', ...)` — survives plugin re-launch / iPhone app force-quit

**New scope addition (free win):** while wiring `setBackgroundState` for the lifecycle restore, ALSO register the AgentEventBus cache and Companion HUD active-session/banner state for background-state. Currently the HUD likely empties on phone backgrounding (Phase 125 plan-08 noted hydrate side-effect ordering). This is a parallel infra win, not scope creep — same module-init code path.

**Hidden cost:** Phase 124 D-14 PNG-equality baseline may need rebuild if any state-restore path changes the initial HUD render frame.

### VOICE-01 spike — scope SHRINKS

**Closed unknowns:**
- PCM format: **16 kHz × 16-bit LE × mono = 32 KB/s** (locked)
- API surface: `audioControl(true|false)` + `audioEvent.audioPcm: Uint8Array` (verbatim)
- Prerequisite: `createStartUpPageContainer` must succeed first
- Cleanup: must `audioControl(false)` + `unsubscribe()` on every exit path (`ABNORMAL_EXIT`, `SYSTEM_EXIT`, `beforeunload`)
- No speaker → recording confirmation visual-only (LED-style indicator in HUD)

**Remaining unknowns (still need spike):**
- Chunk size of each `audioEvent` fire (every N ms? every M bytes? variable?)
- End-to-end latency from mic-open to transcribed text on PWA
- Battery drain delta (baseline vs 1h continuous + 1h push-to-record)
- Drop-out modes (BLE quality, distance from phone, "no audio packets for N seconds" detection)
- Cleanup robustness (does `audioControl(false)` truly close the mic? Can it leak in `ABNORMAL_EXIT`?)

Spike can be **shorter** than the original 1-2 day plan — 1 day likely sufficient.

### G2-REPLY-SPIKE — feasibility CONFIRMED unknown

The Even SDK exposes ZERO primitives for writing back to a Claude Code session. The 13 skills target G2 plugin authoring, not Claude Code IPC.

Spike must invent the write-back path independently. Candidates (unchanged from prior scope note):
1. **JSONL append + IPC** — likely no (Claude Code is the writer, not a reader of its own JSONL)
2. **Claude Code SDK hook** — `@anthropic-ai/claude-code` programmatic input API check
3. **Named-pipe to operator's TTY** — `claude` runs in a terminal; writer-to-stdin most-fragile-but-feasible
4. **MCP server hook** — out-of-spec for MCP design but worth checking

This stays a hard spike-gate. PASS / DEGRADE-to-banner-ack-only / BLOCK.

### HUD-CLARITY — new free signal

`onDeviceStatusChanged.batteryLevel + isWearing` is a free ambient signal we already subscribe to (Phase 125 G2-POLISH-08). Could surface on Companion HUD's footer line:

```
session: vigil-watch
state: running
last activity 4m ago · 🔋 73% · 👁
```

Adds zero new SDK calls. Worth folding into HUD-CLARITY phase alongside SEED-016 Gap 1 (staleness timestamp) and Gap 2 (possibly-stuck).

### WATCH-ENRICH-01/02/03 — unchanged

The Even SDK exposes nothing about Claude Code session state. WATCH-ENRICH still parses JSONL via vigil-watch + extends agent_events schema. The skills do NOT help here — they help authoring the G2-side render, but the data source is still vigil-watch's parser.

### Phase prerequisite — install everything-evenhub for G2 phases

Every v3.9 phase that touches `vigil-g2-plugin/src/**` should have a CONTEXT.md prerequisite: "Run `/plugin install even-realities/everything-evenhub` in this Claude Code session before plan authoring." Claude will then auto-invoke the right skill (`handle-input`, `device-features`, `background-state`, `glasses-ui`, etc.) when authoring code. Reduces phase-level SDK trivia briefing burden.

---

## What's NOT Resolved by This Research

The skills are **G2 plugin authoring** documentation. They do NOT cover:
- Claude Code session manipulation (G2-REPLY-SPIKE)
- vigil-watch JSONL parser internals
- ServiceNow Polaris (SVCNOW-01 — separate browser extension)
- iOS Shortcut Focus filter (QUIET-AUTO-01)
- Anthropic vs OpenAI transcription provider decision (VOICE-02..N)
- Cache invalidation patterns (INSIGHTS-FRESH-01)
- Chat context expansion (CHAT-CTX-01)
- Phase 107.1 stale `work_orders` schema drift (Pitfall 7)

Original 4 research files (STACK, FEATURES, ARCHITECTURE, PITFALLS) and SUMMARY remain authoritative for those buckets.

---

## Open Decisions for Operator Before REQUIREMENTS.md Lock

1. **Re-investigate Phase 124 D-08 single-tap claim?** SEED-011 deferred single-tap as "unreliable on hardware." Canonical docs strongly suggest the issue was code-side protobuf-zero handling, not hardware. A 30-min code audit of `companion.ts` event handler before scope-locking G2-ACTION + G2-REPLY would either (a) re-activate single-tap as a usable gesture, expanding the gesture palette, or (b) confirm hardware limit empirically. Recommendation: do it.

2. **Add `setBackgroundState` registration to existing Companion HUD as a quick-win?** Independent of v3.9 scope, the v3.8 Companion HUD likely loses state on phone-background returns. Could be a Phase 0 polish landing alongside the privacy-cost guardrails. Operator call.

3. **Decide whether to vendor the everything-evenhub skill files into Vigil for offline reference, or reference via GitHub URL only?** Vendoring locks the version (skills targeting SDK 0.0.10 specifically); URL-only is lower maintenance but version-drift-risk.

4. **`onLaunchSource` is documented to fire EXACTLY ONCE.** Phase 124 G2-POLISH-06 used it but we should drift-detect that the listener is registered EARLY (before first WebView paint) to avoid missing the event.
