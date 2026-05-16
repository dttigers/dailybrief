---
phase: 129-lifecycle-restore-servicenow-popup
plan: 10
closes_gap: GAP-129-G
operator: Jameson Morrill
started: 2026-05-16
completed:
status: phase-1-instrumented-awaiting-hardware-run
identified_hypothesis: # H1 | H2 | H3 | NONE_OF_ABOVE — operator fills after hardware run
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
# Paste the [diag GAP-129-G H1-write] line here.
# Example shape:
# [diag GAP-129-G H1-write] vigil:v3:lastScreen {"screen":"work-orders","savedAt":1736864123456}
```

### Post-force-quit relaunch — H3-source

```
# Paste the [diag GAP-129-G H3-source] line here.
# Example shape:
# [diag GAP-129-G H3-source] appMenu
```

### Post-force-quit relaunch — H2-read

```
# Paste the [diag GAP-129-G H2-read] line(s) here.
# Example shapes:
# [diag GAP-129-G H2-read] {source: 'appMenu', raw: '{"screen":"work-orders","savedAt":1736864123456}', parsed: {screen: 'work-orders', savedAt: 1736864123456}}
# [diag GAP-129-G H2-read] resolved restore: work-orders
#
# OR (the null case):
# [diag GAP-129-G H2-read] {source: 'appMenu', raw: null, parsed: null}
#
# OR (the parse-error case):
# [diag GAP-129-G H2-read parse-error] {source: 'appMenu', raw: 'garbage', error: 'SyntaxError: Unexpected token g in JSON at position 0'}
#
# OR (the outer-error case — bridge.getLocalStorage itself threw):
# [diag GAP-129-G H2-read outer-error] {source: 'appMenu', error: '...'}
#
# OR (no H2-read line at all, because source === 'glassesMenu' bypassed the branch):
# (no line — record this as "absent — D-10 short-circuit fired")
```

### Final landing

```
# Where the plugin actually landed (HOME / WORK_ORDERS / TASK_DETAIL / other).
# Example:
# Landed on: home  ← the bug (should have been work-orders given the pre-force-quit nav)
```

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

Operator (or Claude post-checkpoint) fills this in based on the identified
hypothesis. Reference the H1/H2/H3 sub-options in the Plan 129-10 PLAN.md
`<interfaces>` block.

(empty until Phase 1 sign-off)

## Phase 1 Sign-Off

| Field | Value |
|-------|-------|
| Operator | |
| Timestamp (Phase 1 complete) | |
| Identified hypothesis | |
| Ready for Phase 2? | |

## Phase 3 Validation

(empty until after Phase 2 fix lands; operator re-runs the diagnostic with
the fix in place)

## Phase 4 Cleanup

(empty until after Phase 3 validates the fix; cleanup task removes the
diagnostic console.logs)
