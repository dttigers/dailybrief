---
phase: 129-lifecycle-restore-servicenow-popup
plan: 10
closes_gap: GAP-129-G
operator: Jameson Morrill
started: 2026-05-16
completed: 2026-05-16
status: closed
identified_hypothesis: H4-NONE_OF_ABOVE  # buildInitialContainer dispatch table incomplete
---

# Phase 129 Plan 10 — GAP-129-G Diagnostic Log

This document is the operator-completed evidence log for diagnosing why
G2-LIFECYCLE-02 (screen-state restore across iPhone Even Hub force-quit) lands
on HOME on real hardware instead of the screen the operator was on before
force-quit. Phase 1 (this checkpoint) is the operator-run diagnostic that
identifies WHICH of three hypotheses (H1 storage-write, H2 restore-read, H3
launch-source-misclassification) is the actual root cause.

The fix in Phase 2 is CONDITIONAL on the hypothesis identified here.

## Hardware Setup

Fill in before running the diagnostic.

| Field | Value |
|-------|-------|
| iPhone model | (e.g., iPhone 15 Pro) |
| iOS version | (e.g., 26.1) |
| Even Hub app version | (e.g., 0.0.9 — check Settings → About in the Even Hub app) |
| G2 firmware version | (e.g., 1.7.x — check the Even Hub app's device info) |
| macOS version (Web Inspector host) | (e.g., 26.0) |
| Safari version (Web Inspector) | (e.g., 26.0) |
| Sideload host | (e.g., `morrillhouse` — the `TAILSCALE_HOST` env that the dev-sideload script uses) |
| Plugin build commit | (`git rev-parse --short HEAD` at the time of sideload — should be the commit containing the diagnostic instrumentation from Plan 129-10 Task 1) |

## Diagnostic Procedure

The instrumentation added in Plan 129-10 Task 1 emits three distinct log lines
into the Even Hub WebView console. The operator captures each via Safari Web
Inspector and pastes the verbatim console output into the "Captured Evidence"
section below.

### Step 1 — Build + sideload the instrumented plugin

On the macOS dev host (the same host that has Safari + iTerm + the repo
checkout — the Tailscale host the iPhone reaches over LAN):

```bash
cd vigil-g2-plugin
npm run sideload
```

This runs `tsc && vite build`, packs `vigil.ehpk`, and serves it over
`http://${TAILSCALE_HOST}:7771/vigil.ehpk` with a terminal QR code. The Even
Hub app on iPhone scans the QR to download + install the .ehpk. On success,
the Even Hub app shows the Vigil plugin in its sideload section.

If the build fails before serving the QR code, STOP — the instrumented source
has a compile error. Report back with the tsc error message; do not proceed to
the hardware run.

### Step 2 — Enable Web Inspector on iPhone

1. iPhone: **Settings → Safari → Advanced → Web Inspector** → ON.
2. Plug iPhone into macOS via USB cable (Web Inspector requires the USB link;
   wireless debugging is unreliable across force-quit cycles).
3. iPhone: open Even Hub app, foreground it. The Vigil plugin should be the
   sideloaded entry in Even Hub's plugin list.
4. Tap into the Vigil plugin so the WebView is alive on the iPhone screen.

### Step 3 — Attach Safari Web Inspector to the Even Hub WebView

1. macOS Safari: **Develop menu → [iPhone name (Jameson's iPhone)] → [Even Hub WebView entry]**.
   - If the **Develop** menu isn't visible: Safari → Settings → Advanced → "Show features
     for web developers" → ON.
   - The Even Hub WebView entry's title may show as the Vigil plugin's `<title>`
     element from `vigil-g2-plugin/index.html` or as a generic "Even Hub" label.
2. Web Inspector opens. Switch to the **Console** tab.
3. Sanity-check the attachment: you should see the existing `[vigil-g2]
   navigated to: …` lines fire as the plugin renders the carousel. If you do
   NOT see any console output, the attachment is wrong — re-check the Develop
   menu submenu and confirm you picked the Even Hub's WebView (not Safari's
   own browser tabs).

### Step 4 — Capture the H1-write log (pre-force-quit)

1. On the G2 glasses (or via the iPhone Even Hub plugin preview), navigate
   the carousel to **WORK_ORDERS** (a non-HOME, non-parameterized screen —
   the minimum-fidelity seed for restore).
   - Optional, full-fidelity: with Plan 129-09's DOUBLE_CLICK gesture
     shipped, ALSO double-click on a list item to enter TASK_DETAIL. That
     exercises the parameterized-args restore path too.
2. In the Web Inspector Console, the navigation should fire a console line
   matching the prefix:
   ```
   [diag GAP-129-G H1-write] vigil:v3:lastScreen {"screen":"work-orders","savedAt":1736...}
   ```
   (For TASK_DETAIL it will additionally include `"args":{"id":<number>}`.)
3. **Copy that entire line verbatim** into the "Captured Evidence —
   H1-write (pre-force-quit)" fenced block below. Optionally take a
   screenshot of the Inspector console.

If you do NOT see the H1-write line firing on navigation, that is itself an
H1 sub-finding ("write site never fires") — record what you observed.

### Step 5 — Force-quit Even Hub

1. iPhone: swipe up → swipe Even Hub off the app switcher.
2. Web Inspector disconnects (the WebView process died with the host app).
3. Wait ~30 seconds (per the UAT Scenario 1 cadence — emulates a real
   between-uses gap). This is well within the 30-minute TTL_MS so restore
   should be eligible.

### Step 6 — Re-open Even Hub + re-attach Web Inspector

1. iPhone: open Even Hub app from the home screen.
2. Tap into the Vigil plugin so the WebView re-spawns.
3. macOS Safari: **Develop menu → [iPhone] → [Even Hub WebView]**. The menu
   refreshes; pick the new WebView entry. (You may need to wait 1-2 seconds
   for the menu to update after the WebView spawns.)
4. Web Inspector re-opens; Console tab.
5. The plugin's init code fires immediately on WebView load. You should see
   (in order):
   - `[diag GAP-129-G H3-source] <source-string>` — what the SDK pushed as the launch source.
   - `[diag GAP-129-G H2-read] { source: <source-string>, raw: <stored-string-or-null>, parsed: <parsed-object-or-null> }` — what bridge.getLocalStorage returned.
   - `[diag GAP-129-G H2-read] resolved restore: <screen-name>` — what pickRestoredScreen returned (or absent if H2-read found nothing).
   - Standard `[vigil-g2] navigated to: <screen>` line — where the plugin actually landed.

   For the `'glassesMenu'` source case, the H2-read lines are skipped entirely
   (D-10 invariant: glassesMenu bypasses restore). If you see no H2-read line
   at all, that is itself evidence of H3.

6. **Copy each line verbatim** into the "Captured Evidence — relaunch
   (post-force-quit)" fenced blocks below.

### Step 7 — Record where the plugin actually landed

After all the diagnostic lines fire, the plugin renders some screen. Note
which: HOME (the bug) / WORK_ORDERS (the fix worked — but it shouldn't have
worked pre-fix, so this would be unexpected) / TASK_DETAIL (likewise).

## Captured Evidence

Paste the verbatim Web Inspector console lines into the fenced blocks below.

### Pre-force-quit — H1-write

```
[diag GAP-129-G H1-write] – "vigil:v3:lastScreen" – "{\"screen\":\"work-orders\",\"savedAt\":1778959457279}"
```

Write fires as expected; payload shape correct.

### Post-force-quit relaunch — H3-source

```
[diag GAP-129-G H3-source] – "appMenu"
```

Source is `appMenu` — non-glassesMenu, so D-10 guard does NOT short-circuit. H3 ruled out.

### Post-force-quit relaunch — H2-read

```
[diag GAP-129-G H2-read] – {source: "appMenu", raw: "{\"screen\":\"work-orders\",\"savedAt\":1778959823191}", windowRaw: null, parsed: {screen: "work-orders", savedAt: 1778959823191}}
[diag GAP-129-G H2-read] resolved restore: – "work-orders"
```

All three downstream conditions PASS:
- `raw` is non-null → `bridge.getLocalStorage` correctly returned the persisted value across force-quit (H1 ruled out — the bridge persistence WORKS).
- `parsed.screen` is `"work-orders"` → JSON shape correct (no parse error).
- `resolved restore: "work-orders"` → `pickRestoredScreen` accepted the payload (TTL still fresh, screen string passes the type guard) and returned the expected screen.

H2 sub-causes A/B/C all ruled out. **`pickInitialScreen` returns `"work-orders"` correctly.**

The `windowRaw: null` field (added as control channel) confirms prototype mode has separate bridge storage vs. WebView's `window.localStorage`. Not load-bearing for the bug; just a structural observation about the prototype runtime.

### Final landing

```
Landed on: home  ← the bug (should have been work-orders given pickInitialScreen returned "work-orders" — but the plugin still painted HOME)
```

This is the smoking gun for hypothesis **H4 (none of H1/H2/H3 — buildInitialContainer dispatch table is incomplete)**:
- `pickInitialScreen` returned the right screen.
- The bridge persisted the value across force-quit.
- The launch source was classified correctly.
- BUT the plugin still rendered HOME.

The bug must live BETWEEN `pickInitialScreen`'s return and the WebView paint — specifically in `main.ts:buildInitialContainer`, whose switch statement only handled `HOME` + `COMPANION` and silently fell through to HOME for every other screen via `default: buildHomeScreen(...)`.

## Identified Hypothesis

Match the evidence above against the criteria below; set the
`identified_hypothesis` frontmatter field to one of H1 / H2 / H3 / NONE_OF_ABOVE.

- **H1 (storage-write):** H1-write log line shows the write fired with a
  well-formed payload, BUT post-relaunch H2-read shows `raw: null` (or
  `raw: ''` empty string) — meaning the iOS Even Hub WebView did NOT persist
  the localStorage value across the force-quit. The write happened in memory;
  the disk-flush either never occurred or the WebView's storage backing is
  in-memory only.

- **H2 (restore-read):** H1-write log line shows the write fired AND the
  post-relaunch H2-read shows a non-null `raw` value matching the pre-quit
  payload — BUT one of the downstream conditions failed:
  - `parsed` is null or wrong-shape → JSON corruption / unexpected encoding.
  - `parsed.screen` is correct but `resolved restore: home` → pickRestoredScreen
    rejected the payload (most likely the TTL check fired — but with a 30s
    gap that's also a clock-skew bug; alternatively the screen string didn't
    pass the typeof === 'string' && length > 0 guard).
  - `parsed` is correct, `resolved restore: <real-screen>` fires, BUT the plugin
    still lands on HOME → control-flow bug between launch-source-helpers.ts
    return and main.ts buildInitialContainer.

- **H3 (launch-source-misclassification):** H3-source log line shows
  `source: glassesMenu` even though the operator clearly launched Even Hub
  from the iPhone home screen (not by tapping the glasses menu in the Even
  Hub UI). The D-10 invariant in launch-source-helpers.ts intentionally
  bypasses the restore branch when source === 'glassesMenu', so a
  misclassification here causes restore to never run. (If H2-read lines are
  ABSENT entirely — not "null raw" but no line at all — that's the
  smoking-gun signature of H3, because the H2-read instrumentation lives
  inside the `if (source !== 'glassesMenu')` branch.)

- **NONE_OF_ABOVE:** evidence doesn't match any of the three. Record what
  was actually observed; Phase 2 will require a new hypothesis pass.

## Fix Plan

**Identified Hypothesis: H4 — incomplete dispatch table in `buildInitialContainer`** (Plan 129-10 PLAN.md `<interfaces>` block called this case `NONE_OF_ABOVE`; we name it H4 here for clarity).

Pre-fix `main.ts:buildInitialContainer` (lines 261-278):

```typescript
async function buildInitialContainer(screen: ScreenName): Promise<...> {
  switch (screen) {
    case Screen.COMPANION: { return buildCompanionScreen() }
    case Screen.HOME:
    default: {                        // ← every other screen falls through here
      const summary = await fetchSummary()
      return buildHomeScreen(summary)   //    ALWAYS builds HOME
    }
  }
}
```

`pickInitialScreen` returns the correct screen name (e.g. `"work-orders"`) on cold-start restore, but the cold-start render path's switch only handled `HOME` + `COMPANION`. Every other screen (WORK_ORDERS, AFFIRMATION, VOICE_SPIKE, TASK_DETAIL) hit the `default:` and built HOME — silently dropping the restore choice.

**Fix:** Reuse navigation.ts's `buildScreen` dispatch (which already handles every screen for in-session `navigateTo`). Export `buildScreen`; have `buildInitialContainer` call it for non-HOME/non-COMPANION screens and convert the resulting `RebuildPageContainer` → `CreateStartUpPageContainer` (identical field shape — `containerTotalNum`, `textObject`, `listObject`, `imageObject`).

Post-fix:

```typescript
async function buildInitialContainer(screen: ScreenName): Promise<CreateStartUpPageContainer> {
  if (screen === Screen.COMPANION) return buildCompanionScreen()
  if (screen === Screen.HOME) {
    const summary = await fetchSummary()
    return buildHomeScreen(summary)
  }
  // Phase 129 GAP-129-G fix: route every other screen through buildScreen
  const rebuild = await buildScreen(screen)
  return new CreateStartUpPageContainer({
    containerTotalNum: rebuild.containerTotalNum,
    textObject: rebuild.textObject,
    listObject: rebuild.listObject,
    imageObject: rebuild.imageObject,
  })
}
```

**TASK_DETAIL cold-start note:** `pickInitialScreen` returns only the screen name; args (the task id) aren't threaded through. `buildScreen(TASK_DETAIL)` renders the empty TASK_DETAIL frame (`getLastFetchedTasks()` is empty on cold start). A follow-up plan can thread args for full-fidelity TASK_DETAIL cold-start restore (D-07 fetch-by-id + 404 → parent), but the in-session restore path (`restoreScreenFn` via `onBackgroundRestore`) handles this correctly.

**Regression coverage:** 3 source-level drift tests in `vigil-g2-plugin/src/__tests__/main.test.ts`:
1. `buildInitialContainer` calls `buildScreen(screen)` + wraps as `CreateStartUpPageContainer`.
2. No `default: buildHomeScreen(...)` fallthrough (the pre-fix anti-pattern).
3. `navigation.ts` exports `buildScreen`; `main.ts` imports it.

## Phase 1 Sign-Off

| Field | Value |
|-------|-------|
| Operator | Jameson Morrill |
| Timestamp (Phase 1 complete) | 2026-05-16T19:32Z |
| Identified hypothesis | H4 — `buildInitialContainer` dispatch table incomplete (classified as NONE_OF_ABOVE per plan; named H4 retroactively) |
| Ready for Phase 2? | yes — fix identified, scope is small (one switch → if/if/buildScreen-dispatch) |

## Phase 3 Validation

**Hardware-validated 2026-05-16T19:35Z (after Phase 2 fix shipped via Vite hot-reload).**

Procedure: operator navigated to WORK_ORDERS, force-quit Even Hub, re-opened. Observed:
- `pickInitialScreen` returned `"work-orders"` (confirmed via H2-read log line — same as pre-fix evidence).
- Plugin landed on **WORK_ORDERS list** (not HOME).
- First event after init was `containerID: 5, containerName: "wo-list"` — the WORK_ORDERS list container.

Operator quoted confirmation: "it landed on work-orders".

**PASS.** GAP-129-G closed.

## Phase 4 Cleanup

**Completed 2026-05-16T19:40Z.**

Removed in cleanup commit:
- `vigil-g2-plugin/src/lib/diag-persist.ts` (entire file deleted)
- `main.ts`: `import { appendDiagTrail, dumpDiagTrail }` + `dumpDiagTrail()` + `appendDiagTrail('MODULE-LOAD', ...)` + `appendDiagTrail('H3-source', ...)` + `console.log('[diag GAP-129-G H3-source]', source)`
- `navigation.ts`: `import { appendDiagTrail }` + `appendDiagTrail('H1-write (...)', ...)` calls + `console.log('[diag GAP-129-G H1-write]', ...)` calls + `window.localStorage.setItem(...)` control-channel writes (× 2 sites)
- `launch-source-helpers.ts`: `import { appendDiagTrail }` + all H2-read `console.log` + `appendDiagTrail` calls + the `windowRaw` capture + the `no-bridge` / `parse-error` / `outer-error` log variants

Cleanup verification: `grep -rn 'diag GAP-129-G\|appendDiagTrail\|dumpDiagTrail\|diag-persist' vigil-g2-plugin/src/` returns zero matches. `tsc --noEmit` passes. The 3 GAP-129-G regression tests in `main.test.ts` still pass.

The actual FIX (the `buildInitialContainer` change + `buildScreen` export) is preserved — only the temporary diagnostic instrumentation was removed.
