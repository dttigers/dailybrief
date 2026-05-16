# Phase 129 UAT Runbook

**Phase:** 129-lifecycle-restore-servicenow-popup
**Authored:** 2026-05-15
**Operator:** Jameson Morrill
**Hardware required:** G2 glasses + iPhone Even Hub app, macOS with Safari + Xcode, Chrome browser, live ServiceNow Polaris instance

---

## Purpose

This runbook validates all 5 Phase 129 ROADMAP success criteria on real hardware. Claude cannot self-verify any of these — each scenario requires physical devices, a live ServiceNow page, or a Safari extension installed on macOS. Run scenarios IN ORDER. Record results in `129-UAT-RESULTS.md` after each run.

## Before You Begin

Prerequisites to verify before starting:
1. G2 glasses are charged and paired to Even Hub on iPhone.
2. Even Hub app is installed on iPhone and you have an active Vigil session configured.
3. Chrome browser has the Vigil extension loaded (unpacked via `chrome://extensions` → Load unpacked, pointing at `vigil-extension/`).
4. macOS machine with Xcode is available (for Scenario 5 only).
5. You have access to a live `*.service-now.com/*` Polaris case page (any case, any instance).
6. PWA work-orders list is accessible at your Vigil dashboard URL.

---

## Pre-condition for Scenarios 1, 1b, 2, 3 — G2 task entities + entry gesture

**Note on G2 task entities:** The G2 plugin's `WORK_ORDERS` list screen displays your open
thought-tasks (sourced from `/v1/brief` → `openTasks` → the `thoughts` table where
`taskStatus IN ('open', 'inProgress')`). These are user-captured thought-tasks like
"review the Q3 report", **NOT** the ServiceNow work_orders captured via the extension popup.
If you have no open thought-tasks, create one via PWA capture before running Scenarios 1, 1b.
See 129-CONTEXT.md `<terminology_note>` and 129-RESEARCH.md Probe 7 for the full distinction.

**Note on G2 entry gestures:** On real G2 hardware, the temple-touchpad DOUBLE_CLICK is the
only reliably-plumbed input gesture for entering TASK_DETAIL from the WORK_ORDERS list
(per plan 129-09's gap-closure wiring; the WORK_ORDERS-list DOUBLE_CLICK carve-out routes to
TASK_DETAIL instead of the default HOME). CLICK_EVENT is sim-only per the Phase 45 retro.

**Reminder:** Scenarios 4, 4b, 4c, 5, 6 are SVCNOW-side and operate on real ServiceNow
work_orders rows (the Drizzle `work_orders` table) via the extension popup → `/v1/work-orders/sync`
route. They are unaffected by the G2 task vs work-order distinction above.

---

## Scenario 1 — G2 Force-Quit-iPhone Restore

**Requirements:** G2-LIFECYCLE-02 | ROADMAP Success Criterion 1

**Hardware:** G2 glasses + iPhone Even Hub app

### Prerequisite state
- Even Hub is open and connected to G2 glasses.
- Navigate to a specific TASK_DETAIL screen for any of your open thought-tasks (the entries on the WORK_ORDERS list are sourced from your `/v1/brief` openTasks — thought-tasks, NOT ServiceNow work orders). To enter TASK_DETAIL on hardware, focus the WORK_ORDERS list, then DOUBLE_CLICK the temple touchpad (per plan 129-09's gesture wiring). Confirm the task title / id is visible on the G2 glasses display.

### Steps
1. On the G2 glasses display, confirm you are on the TASK_DETAIL screen for task id N (note the id).
2. On iPhone, open the iOS app switcher (swipe up from bottom or double-press home button depending on iPhone model).
3. Find the Even Hub app card in the app switcher and swipe it upward to force-quit it completely.
4. Wait 30 seconds.
5. Re-open Even Hub from the iPhone home screen (tap the app icon).
6. Wait for the plugin to reconnect to G2 glasses (usually 5–10 seconds).
7. Observe which screen appears on the G2 glasses display.

### Expected behavior
The G2 plugin lands on TASK_DETAIL for the SAME thought-task (same task id) you were on before force-quitting.

### Pass rule
**PASS:** G2 display shows TASK_DETAIL for the original task id (correct screen + correct entity).

**FAIL:** G2 display shows HOME screen, a different task, or an error state.

---

## Scenario 1b — TTL Expiry Boundary (30-min wall-clock)

**Requirements:** G2-LIFECYCLE-02 + D-05 | ROADMAP Success Criterion 1 (boundary case)

**Hardware:** G2 glasses + iPhone Even Hub app

**Note:** This scenario requires waiting 31 minutes. If this is impractical during your UAT session, mark it "DEFERRED — long-wait scenario" in `129-UAT-RESULTS.md`. This does NOT block phase close-out.

### Prerequisite state
- Even Hub is open and connected to G2 glasses.
- Navigate to any TASK_DETAIL screen on G2 (DOUBLE_CLICK on the WORK_ORDERS list to enter the focused thought-task's detail screen — see the pre-condition section above).

### Steps
1. On G2 display, confirm you are on TASK_DETAIL for some thought-task.
2. Force-quit Even Hub on iPhone (same as Scenario 1 steps 2–3).
3. Wait **31 minutes** (1 minute past the 30-minute TTL).
4. Re-open Even Hub from the iPhone home screen.
5. Wait for plugin reconnect.
6. Observe which screen appears on G2 display.

### Expected behavior
The G2 plugin lands on HOME screen. The 30-minute TTL has expired (per D-05), so the stored last-viewed screen is discarded and the plugin falls back to the natural home state.

### Pass rule
**PASS:** G2 display shows HOME screen (TTL expired correctly).

**FAIL:** G2 display shows the restored TASK_DETAIL (TTL was not enforced — stored state survived past its expiry).

---

## Scenario 2 — Phone-Background to Foreground Companion HUD Cache

**Requirements:** G2-LIFECYCLE-01 | ROADMAP Success Criterion 2 (D-11)

**Hardware:** G2 glasses + iPhone Even Hub app

### Prerequisite state
- Even Hub is open in the foreground on iPhone.
- You have at least one active Claude Code session visible in the Companion HUD (session card is displayed).
- Note the session name / identifier so you can confirm it reappears.

### Steps
1. With Even Hub open and a Claude Code session card visible in the Companion HUD, note the session details.
2. Swipe Even Hub to the phone background (press the iPhone home button, or swipe up to go to home screen — do NOT force-quit).
3. Wait 60 seconds.
4. Return Even Hub to the foreground by tapping its icon or selecting it from the app switcher.
5. Immediately observe the Companion HUD.

### Expected behavior
The SAME session card appears immediately when Even Hub returns to the foreground. There should be no flash of empty state and no re-fetch shimmer / loading spinner. The HUD restores from the `setBackgroundState` snapshot rather than re-fetching from the server.

### Pass rule
**PASS:** Session card appears immediately (within ~200ms) with no empty state visible between foreground-return and content render.

**FAIL:** Empty state or loading spinner visible for more than ~200ms after returning to foreground. (This indicates the `setBackgroundState`/`onBackgroundRestore` companion HUD cache path is not working.)

---

## Scenario 3 — Glasses-Menu Launch Precedence (Phase 124 Invariant)

**Requirements:** G2-LIFECYCLE-03 | ROADMAP Success Criterion 3 (D-10)

**Hardware:** G2 glasses

### Prerequisite state
- G2 glasses have the Vigil plugin installed.
- Even Hub is running but you have previously been on a non-HOME screen (e.g., TASK_DETAIL for one of your thought-tasks) so that a restore could theoretically fire.
- You know which screen the glasses-menu is configured to launch (typically HOME; note it if it has been customized).

### Steps
1. Ensure you were previously on a non-HOME screen (so `vigil:v3:lastScreen` has a non-HOME value stored).
2. From the G2 glasses hardware menu (glasses-side button / gesture that opens the app picker), select the Vigil plugin explicitly from the glasses menu — do NOT open it from the Even Hub iPhone app.
3. Observe which screen the Vigil plugin launches to on the G2 display.

### Expected behavior
The plugin launches to the screen configured in the glasses-menu selection (HOME, or whatever the operator-picked screen is from the glasses menu). It does NOT restore the previous last-viewed screen. The glassesMenu launch source takes precedence over any stored restore state per D-10 and the Phase 124 G2-POLISH-06 invariant.

### Pass rule
**PASS:** Plugin opens to the glasses-menu-selected screen (HOME or operator-configured screen), NOT the last-viewed screen from before.

**FAIL:** Plugin opens to the previously stored screen (TASK_DETAIL or similar), bypassing the glasses-menu launch intent. This indicates the `source === 'glassesMenu'` precedence guard is broken.

---

## Scenario 4 — Polaris CS# Extraction and Popup Pre-Fill

**Requirements:** SVCNOW-01 | ROADMAP Success Criterion 4 (part 1)

**Hardware:** Chrome browser + live ServiceNow Polaris case page

### Prerequisite state
- Chrome browser is open with the Vigil extension loaded (confirm extension icon is visible in the browser toolbar).
- You have access to a live `*.service-now.com/*` Polaris case page URL.

### Steps
1. Navigate to a live ServiceNow Polaris case page in Chrome (e.g., `https://yourcompany.service-now.com/now/cwf/agent/record/sn_customerservice_case/<sysid>`).
2. Confirm the Vigil extension icon in the browser toolbar is active (not greyed-out).
3. Open Chrome DevTools (F12 or Cmd+Option+I on macOS).
4. In the DevTools Console tab, run: `document.title`
5. **Record the exact string returned in `129-UAT-RESULTS.md`.** (This resolves RESEARCH Open Question 1 / Assumption A1 — the actual Polaris title format on your instance.)
6. Close DevTools.
7. Click the Vigil extension icon in the Chrome toolbar.
8. Observe the popup that opens.

### Expected behavior
The popup opens with a case-number header showing the CS# extracted from the `document.title` (e.g., `CS0353598`). The case number header text should be displayed at a larger font size than the description input field. The description textarea should be focused (cursor ready to type). The priority dropdown should default to a reasonable selection.

### Pass rule
**PASS:** Popup opens; the case number header shows the 7-digit CS# that matches the number in the `document.title` string you recorded. The CS# header is visually larger than the description input.

**FAIL:** Popup shows "No case# detected" (extraction regex mismatch — the actual title format differs from `/\bCS\d{7}\b/`); or popup shows a wrong CS# number; or popup fails to open at all.

**If FAIL on CS# extraction:** Record the exact `document.title` string from Step 5. A follow-up plan will update the `extractCaseNumber` regex in `popup-helpers.js`. This is treated as a conditional pass — phase is complete pending that one-line fix.

---

## Scenario 4b — Multi-Tab POST Race (Operator Friction Acceptance)

**Requirements:** SVCNOW-04 | ROADMAP Success Criterion 4 (part 2, D-12)

**Hardware:** Chrome browser + live ServiceNow Polaris case page

**Note:** This scenario tests the expected behavior when two popup submissions come from two different tabs with different `client_capture_id` values. Expect TWO rows in the PWA (one per tab) — this is correct. The deduplication via `client_capture_id` prevents duplicate-of-self (same popup submitted twice), not cross-tab submissions with different IDs.

### Prerequisite state
- Chrome with Vigil extension loaded.
- Same Polaris case page open in TWO Chrome tabs.
- PWA work-orders list is accessible.

### Steps
1. In Chrome Tab 1, navigate to the Polaris case page.
2. In Chrome Tab 2, navigate to the same Polaris case page.
3. In Tab 1, click the Vigil extension icon.
4. In the popup for Tab 1, type description: `RACE-A`
5. Click Send. (Do NOT wait for the popup to close — proceed immediately to Tab 2.)
6. In Tab 2, click the Vigil extension icon.
7. In the popup for Tab 2, type description: `RACE-B`
8. Click Send.
9. Open the PWA work-orders list and refresh.

### Expected behavior
Two work-order rows appear in the PWA list — one with description `RACE-A` and one with description `RACE-B`. No duplicate rows exist (no two rows with the same description text). Each tab generated its own unique `client_capture_id`, so both submissions are accepted.

### Pass rule
**PASS:** PWA shows exactly two rows for the case number — `RACE-A` and `RACE-B`. No duplicates of either description.

**FAIL:** PWA shows four rows (two `RACE-A` + two `RACE-B`) — indicates `client_capture_id` deduplication is not working. Or PWA shows one row — indicates one submission was incorrectly rejected.

---

## Scenario 4c — Retry-Storm Idempotency (Strict Dedup)

**Requirements:** SVCNOW-04 strict | ROADMAP Success Criterion 4 (idempotency)

**Hardware:** Chrome browser + live ServiceNow Polaris case page + Chrome DevTools network throttle

### Prerequisite state
- Chrome with Vigil extension loaded.
- A Polaris case page open in Chrome.
- Chrome DevTools Network tab accessible.

### Steps
1. Navigate to a Polaris case page in Chrome.
2. Click the Vigil extension icon to open the popup.
3. Type a description: `IDEMPOTENCY-TEST`
4. Open Chrome DevTools, go to the Network tab.
5. Set network condition to **Offline** (Network tab → throttle dropdown → Offline).
6. Click the Send button in the Vigil popup.
7. Observe the popup — it should stay open with an inline error message (per D-04: non-200 response keeps popup open).
8. In Chrome DevTools, set network back to **No throttling** (or any Online condition).
9. **WITHOUT reloading or closing the popup**, click Send again.
10. Wait for the popup to close.
11. Open the PWA work-orders list and check for the case number.

### Expected behavior
The popup closes on the second Send (HTTP 200 returned). The PWA shows exactly ONE row with description `IDEMPOTENCY-TEST`. The second submission used the same `client_capture_id` (popup was not reloaded, so UUID was preserved), triggering the partial unique index constraint on `(user_id, client_capture_id)` and returning a 200 with deduplication (not a 409 error).

### Pass rule
**PASS:** Popup closes on retry; exactly one row in PWA for the case number with description `IDEMPOTENCY-TEST`.

**FAIL:** Two rows appear in PWA (dedup index not enforced); or popup does not close on retry (server returned non-200 on duplicate); or popup closes prematurely during the offline step (close-on-200-only rule violated).

---

## Scenario 5 — Safari Extension Parity Smoke Test

**Requirements:** SVCNOW-05 | ROADMAP Success Criterion 5 (Phase 114 EXT-02)

**Hardware:** macOS machine with Xcode + Safari browser

### Prerequisite state
- macOS machine with Xcode installed.
- `vigil-safari-extension/Vigil Capture Extension.xcodeproj` is available.

### Xcode Setup Step (REQUIRED before build — from 129-05 SUMMARY)
**This is a manual operator step that cannot be automated from a Linux dev box.**

1. Open `vigil-safari-extension/Vigil Capture Extension.xcodeproj` in Xcode.
2. In the Project navigator, select the `Vigil Capture Extension` target.
3. Go to the **Build Phases** tab.
4. Under **Copy Bundle Resources**, verify that all three new files are listed:
   - `background.js`
   - `content-script.js`
   - `popup-helpers.js`
5. If any of these are missing, click the `+` button under Copy Bundle Resources and add them from `vigil-safari-extension/Vigil Capture Extension/Resources/`.
6. Run `Product → Clean Build Folder` (Shift+Cmd+K), then build (Cmd+B).
7. Install/enable the Safari extension: Safari → Settings → Extensions → enable "Vigil Capture".
8. **Note in `129-UAT-RESULTS.md`** whether the Xcode Copy Bundle Resources step was needed (files were missing) or not (files were already present from a prior build).

### Steps
1. After completing the Xcode setup step above, open Safari.
2. Navigate to the same Polaris case page used in Scenario 4 (or any `*.service-now.com/*` case page).
3. Confirm the Vigil extension toolbar icon is active (not greyed-out) on the ServiceNow page.
4. Click the Vigil extension icon.
5. Observe the popup UI.
6. Fill in the description field and select a priority.
7. Click Send (or use Cmd+Enter).
8. Check the PWA work-orders list for the new row.

### Expected behavior
The Safari popup looks identical to the Chrome popup: case-number header (larger text), description textarea (autofocused), priority dropdown, Send button. The submission creates a row in the PWA work-orders list. No JS console errors in the Safari Web Extension background.

### Pass rule
**PASS:** Safari popup UI is visually identical to Chrome popup; submission creates a PWA row; no runtime JS errors in the extension.

**FAIL (visual divergence):** Safari popup renders differently from Chrome — missing fields, wrong layout, wrong styling.

**FAIL (JS error):** Runtime error in Safari extension console — likely `chrome.action.disable()` API shim incompatibility per RESEARCH Assumption A2. If this occurs, log the exact error message and reproduction steps in `129-UAT-RESULTS.md`. A follow-up plan will apply the one-line shim: `(globalThis.browser?.action ?? chrome.action).disable(tabId)`. Do NOT pre-emptively diverge from the Chrome-parity file.

**FAIL (submit):** Popup fails to POST to the API, or row does not appear in PWA.

---

## Scenario 6 — Title Drift Banner (CS# Changed Mid-Flight)

**Requirements:** SVCNOW-02 | ROADMAP-adjacent (drift UX)

**Hardware:** Chrome browser + live ServiceNow Polaris case page

### Prerequisite state
- Chrome with Vigil extension loaded.
- A Polaris case page for Case X open in Chrome.
- A second Polaris case page for Case Y (different CS#) accessible via navigation (e.g., you can click to it from the same SN tab).

### Steps
1. Navigate to Polaris Case X in Chrome.
2. Click the Vigil extension icon to open the popup. Confirm it shows CS# X in the header.
3. **Do NOT close the popup.**
4. Click back in the ServiceNow browser tab (the popup stays open in front).
5. In the ServiceNow tab, navigate to a different case (Case Y) — this triggers a Polaris `pushState` navigation that changes `document.title` to a different CS# (CS# Y).
6. Switch focus back to the popup window.
7. Observe the popup.

### Expected behavior
A yellow drift banner appears in the popup reading approximately "CS# changed — reopen popup" (or similar warning text). The original CS# X shown in the header does NOT auto-update to CS# Y. The popup is frozen on CS# X (intentional — the operator's intent was captured at open time) while the banner alerts them that the underlying page has drifted.

### Pass rule
**PASS:** Yellow drift banner (or similarly prominent warning) appears in the popup after navigating to Case Y.

**FAIL:** No banner appears and CS# appears unchanged — operator would be unaware the page title drifted. **OR** the popup auto-updates to CS# Y silently (masks the drift — worse than no banner).

---

## After Running All Scenarios

Fill in `129-UAT-RESULTS.md` with the following for each scenario:

```
## Scenario N: [PASS | FAIL | DEFERRED]

- **Timestamp:** YYYY-MM-DD HH:MM local time
- **Observed behavior:** One sentence describing what actually happened.
- **Notes:** Any deviations, edge cases, or follow-up items.
```

**Additional required entries in `129-UAT-RESULTS.md`:**

- **Scenario 4 — Polaris `document.title` string:** Paste the exact string from Chrome DevTools Console (`document.title`). This resolves RESEARCH Open Question 1 / Assumption A1 and either confirms the `/\bCS\d{7}\b/` extraction regex or documents the corrected form needed.
- **Scenario 5 — Xcode Copy Bundle Resources:** Note whether the manual Xcode step was required (files missing from build phase) or not.
- **If any FAIL:** Do NOT type "approved". Type the specific scenario number(s) that failed and a one-line description. The orchestrator will route failing scenarios through `/gsd:plan-phase --gaps` for closure.
- **If ALL PASS:** Type "approved".

### Edge-case policy

| Scenario | Policy |
|----------|--------|
| Scenario 1b (31-min TTL) | DEFERRED if waiting 31 min is impractical. Does NOT block phase close-out. |
| Scenario 4 (CS# extraction fails) | Conditional pass — record actual `document.title`; a one-line regex follow-up plan is sufficient. |
| Scenario 5 (Safari `chrome.action` shim) | Log error + reproduction steps; do NOT patch the lock-step file mid-UAT. Follow-up plan applies shim to BOTH Chrome and Safari in lock-step. |
