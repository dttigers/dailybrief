---
phase: 129-lifecycle-restore-servicenow-popup
runbook: 129-UAT-RUNBOOK.md
operator: Jameson Morrill
started: 2026-05-15
paused: 2026-05-15
session_2_started: 2026-05-16
session_2_paused: 2026-05-16
status: session-2-paused-strategic-pivot
resume_signal: do NOT resume — pivot decision pending (see Pivot Decision section)
---

## Pivot Decision — 2026-05-16 (mid-Session-2)

**Operator triggered a strategic re-direction during Scenario 6** of the Session 2 close-out UAT.

### What's changing

1. **The ServiceNow assisted-capture extension (Chrome + Safari) reverts to Phase 84 thought-capture (generic page capture).** The popup-with-CS#-prefill, CS# extraction regex, drift detection, MV3 service worker, content-script — all of it gets reverted. Single-product extension for all users, not ServiceNow-specific.

2. **A new operator-specific screenshot pipeline replaces the popup for Jameson's ServiceNow workflow:**
   - Operator screenshots a Polaris case page.
   - Mac-side capture (or vigil-core endpoint) routes the screenshot to Claude API for structured field extraction.
   - Extracted fields (Number, Store Account, Location, Assigned to, Equipment, Priority, Short Description, ...) POST to `/v1/work-orders/sync` (same backend; reuses migration 0021 + `dbInsertOrGet` dedup).
   - Higher-fidelity capture (16+ fields vs. popup's 3) at the cost of one extra tool-bar click (the screenshot trigger).

3. **A manual-create UI in the PWA work-orders list** lets all non-operator users create work orders by hand. Replaces the popup's role for everyone else (most of them don't use ServiceNow anyway).

### What stays from Phase 129 (independent of the pivot)

- Plan 129-08 production migration 0021 (`client_capture_id` column + partial unique index) — harmless either way; still used by the new pipeline for dedup.
- Plan 129-09 G2 DOUBLE_CLICK entry gesture — operator's G2 workflow, unaffected.
- Plan 129-10 G2 lifecycle restore fix (GAP-129-G) — operator's G2 workflow, unaffected. Hardware-validated.
- Plan 129-11 terminology cleanup — pure docs; the G2 task vs. ServiceNow work order distinction is still relevant.
- Plan 129-12 build-gate convention — pure process; still useful.

### What gets reverted in a new phase

- Plan 129-03 (SVCNOW popup + service worker + content-script).
- Plan 129-05 (Safari lock-step mirror of the above).
- Plan 129-07 (extension housekeeping: __tests__ relocation, setup-view restore, drift detection persistence).

### Session 2 progress retained (not lost)

- Scenario 1 — PASS (WORK_ORDERS restore; hardware-validated via 129-10). Closes ROADMAP Success Criterion 1.
- Scenario 1b — DEFERRED-LONG-WAIT (31-min TTL, sim-side covered).
- Scenario 2 — DEFERRED-NOT-BLOCKING (prototype-mode bridge limitation; sim-side covered).
- Scenario 3 — DEFERRED-NOT-BLOCKING (sim-side covered).
- Scenario 4 — PASS (CS# extraction; re-confirmed via Scenario 8).
- Scenario 7 — PASS (GAP-129-A confirmed closed: Chrome unpacked load succeeds).
- Scenario 8 — PASS (GAP-129-B confirmed closed: setup-view + Save + D-03 close).
- Scenario 4b, 4c, 5, 6 — UNTESTED, but **superseded by the pivot**: the extension changes that 4b/4c/6 were designed to validate are about to be reverted; Scenario 5 (Safari parity smoke) becomes moot when the parity target reverts.

### Decisions captured

- **Motivation:** Popup workflow is too high-friction in real ServiceNow usage. Typing description + priority + Send for every case is slower than screenshot.
- **Architecture:** vigil-core endpoint receives the screenshot, calls Claude API, writes to `work_orders`. Operator-specific pipeline. Manual-create UI in PWA covers all other users.
- **Scope:** Single-user pipeline for Jameson; manual-create UI for everyone. NOT a multi-tenant generalized screenshot system.

### Next steps (in priority order)

1. Close Phase 129 as PARTIAL-COMPLETE with the G2-side and infrastructure work captured (5 plans complete; 4 extension plans get superseded).
2. Spin up a new phase covering: (a) revert the SVCNOW extension changes, (b) build the screenshot pipeline endpoint, (c) build the PWA manual-create UI.
3. Mark SVCNOW-01..05 requirements as superseded; new requirements for the screenshot pipeline + manual-create UI need authoring.

---

## Session 2 — 2026-05-16 (Gap Closure Re-run)

### GAP Closure Status (post-session-2)

| Gap       | Resolution Plan | Session-2 Status | Notes                                                              |
|-----------|-----------------|------------------|--------------------------------------------------------------------|
| GAP-129-A | 129-07 Task 1   | CLOSED           | Scenario 7 PASS — Chrome unpacked load succeeds without __tests__ error |
| GAP-129-B | 129-07 Task 2   | CLOSED           | Scenario 8 PASS — setup-view + save → svcnow-view + D-03 close (with DevTools detached) |
| GAP-129-C | 129-08          | CLOSED           | 129-08-DEPLOY-LOG.md status: no-op + dedup probe pair synced:1/synced:0 confirms SVCNOW-04 on prod |
| GAP-129-D | 129-07 Task 3   | (pending)        | Verified by Scenario 6                                             |
| GAP-129-E | 129-11          | CLOSED           | Doc-only fix; 129-11 SUMMARY documents the CONTEXT/RESEARCH/RUNBOOK terminology cleanup |
| GAP-129-F | 129-09          | (pending)        | Verified by Scenario 1 setup (DOUBLE_CLICK enters TASK_DETAIL)     |
| GAP-129-G | 129-10          | CLOSED           | 129-10-DIAGNOSTIC-LOG.md Phase 3 validation PASS; hardware-confirmed "lands on work-orders" |
| GAP-129-H | 129-12          | CLOSED           | Build-gate convention shipped in 129-12-SUMMARY.md; rule documented |

(Status values: CLOSED / RE-OPENED / DEFERRED / BLOCKED / (pending) until the corresponding scenario runs.)

### Scenario Results

#### Scenario 1: PASS (WORK_ORDERS flavor — "1a degraded")

- **Timestamp:** 2026-05-16T19:35:00Z
- **Tested flavor:** WORK_ORDERS list cold-start restore (degraded vs. the runbook's strict TASK_DETAIL form — see "Notes" below).
- **Observed behavior:** Operator navigated to WORK_ORDERS list, force-quit Even Hub, waited ~30s, re-opened Even Hub. Plugin landed on WORK_ORDERS list (not HOME). H2-read evidence in 129-10-DIAGNOSTIC-LOG.md shows `pickInitialScreen` returned `"work-orders"` and the post-129-10 `buildInitialContainer` fix routed it through `buildScreen` → `CreateStartUpPageContainer` correctly.
- **Notes:** Scenario as-written tests TASK_DETAIL with entity-id restoration. The 129-10 fix closes the cold-start dispatch bug (any non-HOME/non-COMPANION screen restores correctly), but the full-fidelity TASK_DETAIL form has a known limitation: `pickInitialScreen` returns only the screen name, args (the task id) are not threaded through. On cold-start, TASK_DETAIL renders the empty TASK_DETAIL frame because `getLastFetchedTasks()` is empty pre-init. **Decision:** record Scenario 1 PASS for the WORK_ORDERS-restore form (matches ROADMAP "last-viewed screen" criterion at the screen-name level) and log full-fidelity TASK_DETAIL cold-start restore as a deferred future enhancement (not a Phase 129 blocker — the in-session `restoreScreenFn` path via `onBackgroundRestore` handles this correctly, only the cold-start path is limited).

#### Scenario 1b: DEFERRED-LONG-WAIT

- **Timestamp:** 2026-05-16T19:36:00Z
- **Observed behavior:** Not run — requires 31-min wall-clock wait between force-quit and relaunch to exercise TTL expiry.
- **Notes:** Per the runbook's edge-case policy: "DEFERRED if waiting 31 min is impractical. Does NOT block phase close-out." TTL gate logic is exercised by sim-side unit tests in `vigil-g2-plugin/src/lib/__tests__/screen-state-restore.test.ts` (TTL boundary cases covered). Hardware re-test deferred to a future session if it becomes load-bearing.

#### Scenario 2: DEFERRED-NOT-BLOCKING (sim-side covered)

- **Timestamp:** 2026-05-16T19:36:30Z
- **Observed behavior:** Not run on hardware in Session 2. Prototype-mode runtime (used for the 129-10 diagnostic) explicitly disables `setBackgroundState` / `onBackgroundRestore` — the runtime emits a `[screen-state-restore] Dev preview bridge — setBackgroundState/onBackgroundRestore unavailable` warning. Running this scenario strictly would require switching to sideload mode (build + pack + Even Hub's distinct Sideload entry).
- **Notes:** D-11 Companion HUD cache fold + G2-LIFECYCLE-01 wiring is covered by sim-side unit tests:
  - `vigil-g2-plugin/src/__tests__/main.test.ts` — `D-129 drift: setBackgroundState registration at MODULE SCOPE (before init)` (verifies the registration is wired) — PASS.
  - `vigil-g2-plugin/src/lib/__tests__/screen-state-restore.test.ts` — D-11 companion HUD cache contract + screen-state restore contract — PASS.
  - 129-02-SUMMARY.md documents the registration paths.
  The hardware in-session foreground→background→foreground path is best validated when packaging an .ehpk for store resubmit (sideload exercises real `setBackgroundState`). Deferred-not-blocking for Phase 129 close; revisit before next G2 plugin release.

#### Scenario 7: PASS (GAP-129-A confirmed closed)

- **Timestamp:** 2026-05-16T19:40:00Z
- **Observed behavior:** Chrome accepted Load unpacked of `vigil-extension/` directory. Extension card appears in `chrome://extensions`; action icon visible in toolbar. No reserved-prefix dialog (the pre-129-07 `Cannot load extension with file or directory name __tests__` error did NOT fire).
- **Notes:** GAP-129-A closed by 129-07 Task 1 (moved `__tests__/` directory outside the extension bundle). Operator confirmation: "pass".

#### Scenario 8: PASS (GAP-129-B confirmed closed)

- **Timestamp:** 2026-05-16T20:15:00Z
- **Observed behavior:**
  - **Action 1 (setup-view rendering):** With `chrome.storage.local` empty (confirmed via console `chrome.storage.local.get(null)` → `{}`), clicking the Vigil extension icon on a ServiceNow Polaris page rendered the setup-view (password-style input + Save button). Operator quote: "pop up waiting for api".
  - **Action 2 (save → svcnow-view transition):** Operator typed Vigil API key, clicked Save. Setup-view disappeared, svcnow-view appeared with the page's CS# in the header and description textarea focused.
  - **Action 3 (send → HTTP 200 → D-03 close + PWA row):** Operator typed test description, clicked Send. Work order arrived in PWA work-orders list (confirms HTTP 200 server-side). Popup auto-closed (D-03) on the SECOND attempt after closing DevTools — the first Send while DevTools was attached did NOT close the popup (Chrome behavior — DevTools attached suppresses `window.close()`). After closing DevTools, repeat Send auto-closed correctly.
- **Notes:** GAP-129-B closed by 129-07 Task 2 (inline setup-view + Save handler + svcnow-view transition). D-03 close-on-200 behavior also confirmed (with DevTools detached). Operator confirmation: "it auto-closed".
- **DevTools D-03 caveat:** When DevTools is attached to the popup, `window.close()` is silently suppressed by Chrome. Documented here for future debug sessions — if D-03 ever appears to fail, check DevTools attachment first.
- **Sync prerequisite resolved:** Initial test on Mac showed pre-129-07 popup.html (no setup-view, "logged out" degraded state). Mac checkout `~/Desktop/Local AI/dailybrey` was stale — `git pull --rebase origin main` brought it up to date with the 30 commits pushed from morrillhouse. Reload extension picked up the post-129-07 `popup.html` + `popup.js`.

#### Scenario 4: PASS (re-confirmed, implicitly verified by Scenario 8)

- **Timestamp:** 2026-05-16T20:15:30Z
- **Observed behavior:** Scenario 8 Action 2 confirmed CS# extraction works end-to-end: svcnow-view rendered with the Polaris page's CS# in the header (which is exactly Scenario 4's PASS rule). Session 1 (2026-05-15) had already PASS'd Scenario 4 with `CS0361233 | Case | ServiceNow` title-shape verification; that finding stands.
- **Notes:** ROADMAP Open Question 1 / RESEARCH Assumption A1 resolved — the `/\bCS\d{7}\b/` extraction regex correctly handles the live Polaris title format. SVCNOW-01 confirmed on hardware in two distinct sessions.

#### Scenario 3: DEFERRED-NOT-BLOCKING (sim-side covered)

- **Timestamp:** 2026-05-16T19:36:45Z
- **Observed behavior:** Not run on hardware in Session 2. Glasses-menu launch precedence requires explicitly opening the Vigil plugin from the G2 hardware-side menu (button + gesture on the glasses themselves), not the iPhone Even Hub plugin list. Same prototype-vs-sideload concern as Scenario 2.
- **Notes:** D-10 glassesMenu precedence is covered by sim-side unit tests:
  - `vigil-g2-plugin/src/__tests__/main.test.ts` — `D-129: pickInitialScreen with glassesMenu source bypasses restore (D-10)` — PASS (asserts `pickInitialScreen('glassesMenu', ...)` returns HOME/COMPANION based on active-session check without consulting `bridge.getLocalStorage`).
  - 129-10 Phase 1 diagnostic confirmed the SDK's `onLaunchSource` push fires correctly in prototype mode (`H3-source: "appMenu"`); the glassesMenu-classification path uses the same SDK push path with a different source string. No code path divergence between modes.
  Deferred-not-blocking for Phase 129 close; revisit before next G2 plugin release.

---

## Session Summary (paused 2026-05-15)

| Scenario | Status | Blocking Gap |
|----------|--------|--------------|
| 4 — Polaris CS# extraction | PASS | (regex confirmed against `CS0361233 \| Case \| ServiceNow`) |
| 4b — Multi-tab POST race | BLOCKED | GAP-129-C (prod missing migration 0021) |
| 4c — Retry-storm idempotency | BLOCKED | GAP-129-C |
| 6 — Title drift banner | FAIL | GAP-129-D (full-reload kills content-script state) |
| 1 — G2 force-quit restore (degraded) | **FAIL** | GAP-129-G (restore broken at screen-name level on hardware) |
| 1b — TTL boundary | DEFERRED | depends on GAP-129-G fix + 31-min wait |
| 2 — HUD background cache | DEFERRED | session-end pause; different code path (`setBackgroundState`/`onBackgroundRestore`), worth re-testing fresh |
| 3 — Glasses-menu precedence | DEFERRED | inconclusive while GAP-129-G keeps everything falling to HOME; revisit after fix |
| 5 — Safari parity smoke | DEFERRED | Xcode Copy Bundle Resources step + Safari install pending |

## Gaps Inventory (for `/gsd:plan-phase 129 --gaps`)

| Gap | Severity | One-line |
|-----|----------|----------|
| GAP-129-A | medium | `__tests__` folder blocks Chrome unpacked load — move tests outside `vigil-extension/` |
| GAP-129-B | high | API-key entry UI removed without replacement — restore inline setup view |
| GAP-129-C | high | Production missing migration 0021 — `dbInsertOrGet` 500s on `client_capture_id` column absence |
| GAP-129-D | medium | SVCNOW-02 drift detector loses state on full-reload — persist `lastCaseNumber` to `chrome.storage.session` |
| GAP-129-E | medium | Runbook/RESEARCH conflate `work_orders` with thought-task `openTasks` — terminology + rename |
| GAP-129-F | high | No hardware-validated entry gesture for TASK_DETAIL — wire context-sensitive DOUBLE_CLICK on WORK_ORDERS list |
| GAP-129-G | high | G2-LIFECYCLE-02 broken on hardware (lands on HOME after force-quit) — diagnose write/read/source-detection |
| GAP-129-H | high | Plan 129-02 build-breakers — `main.ts` called `navigateTo` without importing it (3 call sites in `restoreScreenFn`), `launch-source-helpers.ts` imported unused `TTL_MS`. Executor's test suite didn't exercise the restore code path so `tsc` failures were invisible. Fixed in-session 2026-05-16 during dev-sideload setup on morrillhouse. **Process gap:** plan must require a clean `npm run build` (full tsc) before SUMMARY.md, not just plan-scoped tests. |

Cosmetic also-rans (not formal gaps, but worth noting):
- PWA unarchive succeeds (HTTP 200) but UI doesn't refresh — `useWorkOrders.unarchive` only `console.error`s on failure, no optimistic update either. Surfaced as a usability irritant during Route A diagnosis.

## Suggested Next Actions

1. **`/gsd:plan-phase 129 --gaps`** — turns the 7 gaps above into a gap-closure plan set.
2. Hardware re-engagement needed for scenarios 1b, 2, 3, 5 after at least GAP-129-G is fixed.
3. Production deploy of migration 0021 should precede any retest of 4b / 4c.
4. Safari side (Scenario 5) is independent of the G2 fixes — can be tested in parallel once the Xcode Copy Bundle Resources step is done.



# Phase 129 UAT Results

## Polaris `document.title` Empirical Capture (RESEARCH Open Question 1 / Assumption A1)

**Observed string:** `"CS0361233 | Case | ServiceNow"`

**Regex check:** `/\bCS\d{7}\b/` against the above → matches `CS0361233`. The assumed format holds on this ServiceNow instance — Polaris uses `<CS#> | Case | ServiceNow` with pipe separators. **No regex change needed.** Assumption A1 confirmed.

---

## Findings Captured During Setup (pre-Scenario gaps)

These were discovered while preparing the iMac/Chrome environment for UAT — they apply to the Phase 129 extension build and need closure regardless of scenario pass/fail.

### GAP-129-A: `__tests__` folder blocks Chrome unpacked-extension load

**Severity:** medium (blocks first-time install on every Chrome instance until manually deleted)

**Observed:** Chrome refused to load `vigil-extension/` as an unpacked extension because `vigil-extension/__tests__/` exists. Chrome reserves any file/folder name starting with `_` for system use and rejects the entire extension when one is present.

**Root cause:** Plan 129-03 placed `popup-helpers.test.ts` at `vigil-extension/__tests__/popup-helpers.test.ts`. Plan 129-05 placed `parity.test.ts` at the same location. Both are inside the extension load root.

**Workaround applied for UAT:** `rm -rf vigil-extension/__tests__` on the iMac working tree.

**Proper fix (follow-up plan):** Move all extension tests to a sibling directory outside the loaded extension root — e.g. `vigil-extension-tests/` or `tests/extension/` at the repo root. Update vitest config and any imports accordingly. Lock-step the change with the Safari side (`vigil-safari-extension/...` does not have this problem because Safari's Web Extension build is driven by Xcode, not unpacked-load).

### GAP-129-B: API key entry UI removed without replacement

**Severity:** high (first-time-install regression — extension is unusable until the operator runs DevTools JS manually)

**Observed:** New SVCNOW popup shows "No API key configured. Set your Vigil API key in extension storage." and the Send button is disabled. There is no UI to enter the key — the operator must open DevTools on the popup, run `chrome.storage.local.set({ vigil_api_key: '...' })`, then re-open the popup.

**Root cause:** Phase 84's popup.js had an inline setup view (`api-key-input` field + `save-key-btn` button + `validateApiKey()` flow). Plan 129-03's "replace popup.html/css/js" wholesale removed that setup view when adopting the SVCNOW-only design (D-02 — capture-thought UI is gone).

**Workaround applied for UAT:** Operator pasted the key via `chrome.storage.local.set(...)` in popup DevTools console.

**Proper fix (follow-up plan):** Restore an inline setup view in the SVCNOW popup — same pattern as Phase 84: a setup `<div>` with an api-key input + save button shown when `vigil_api_key` is absent in storage, replaced by the SVCNOW form when the key is present. Lock-step into the Safari port. Storage key name stays `vigil_api_key` (unchanged).

---

## Scenarios

### Scenario 4 — Polaris CS# Extraction and Popup Pre-Fill

**Status:** PASS
**Timestamp:** 2026-05-15 (UAT session, real-time)
**Hardware:** Chrome on iMac, live ServiceNow Polaris case page

**Observed behavior:** After loading the v1.1.0 extension and configuring `vigil_api_key`, the popup opens on a Polaris case page and shows `CS0361233` extracted from `document.title` (`"CS0361233 | Case | ServiceNow"`). CS# header renders at the larger header font, description textarea autofocuses on open, priority dropdown is present with a default selection, Send button is rendered.

**Notes:**
- Title format matches the assumed `/\bCS\d{7}\b/` regex — no extraction regex change needed.
- Setup gaps GAP-129-A (`__tests__` folder) and GAP-129-B (no API-key entry UI) discovered during environment prep; both worked around for the UAT session. See "Findings Captured During Setup" above.

### Scenario 4b — Multi-Tab POST Race

**Status:** BLOCKED
**Timestamp:** 2026-05-15
**Blocked by:** GAP-129-C (production server returns HTTP 500 on `/v1/work-orders/sync`)

**Observed behavior:** Popup fires the POST correctly (fetch reaches `https://api.vigilhub.io/v1/work-orders/sync` with `clientCaptureId`, `caseNumber`, `shortDescription`, `priority` in the payload), but server returns HTTP 500 with body `{"error":"Internal server error"}`. Popup correctly stays open and shows the inline error per D-04 — the client-side path works. Cannot validate cross-tab dedup behavior without a working server endpoint.

### Scenario 4c — Retry-Storm Idempotency

**Status:** BLOCKED
**Timestamp:** 2026-05-15
**Blocked by:** Same as 4b — GAP-129-C.

### Scenario 1 — G2 Force-Quit-iPhone Restore (degraded, screen-name level only)

**Status:** FAIL
**Timestamp:** 2026-05-15
**Hardware:** G2 glasses + iPhone Even Hub

**What was tested (degraded vs. runbook):** Because GAP-129-F blocks reaching TASK_DETAIL on hardware, the test was downgraded to validate restore at the screen-name level only — operator stays on the WORK_ORDERS list (no entity), force-quits Even Hub, waits 30s, re-opens. Expected G2 to land on WORK_ORDERS list. Actual: G2 landed on HOME.

**Observed behavior:** Plugin restored to HOME after force-quit + relaunch, not to the WORK_ORDERS list the operator was on before. Implementation of G2-LIFECYCLE-02 (screen state restore) does not work on real hardware even for non-parameterized screens.

**Root-cause hypotheses (need follow-up investigation):**
1. **Storage write hypothesis:** `bridge.setLocalStorage` writes to `vigil-screen-state` in `screen-state-restore.ts` may not actually persist across iOS app force-quit on Even Hub. RESEARCH likely assumed write-through to disk via the SDK; this may not hold. **Diagnostic:** attach Safari Web Inspector to the Even Hub WebView and inspect localStorage before and after a force-quit cycle.
2. **Restore-read hypothesis:** Read returns null/undefined on relaunch (storage cleared, or wrong key) and the fallback path lands on HOME. **Diagnostic:** add temporary console.log in `restoreScreenFn` to print what `bridge.getLocalStorage('vigil-screen-state')` returns at startup.
3. **Launch-source-misclassification hypothesis:** Per D-10, `source === 'glassesMenu'` precedence bypasses restore. If the iPhone-relaunch path is being classified as `glassesMenu` (rather than the "cold-start from iPhone" case the runbook implies), restore is intentionally skipped. **Diagnostic:** inspect the launch source string returned by the SDK at relaunch time.

### GAP-129-G: G2-LIFECYCLE-02 screen-state restore does not work on hardware

**Severity:** high (the primary deliverable of plan 129-02 — restoring last-viewed screen across force-quit — does not function on real Even Hub + G2 hardware, even for non-parameterized screens)

**Observed:** See Scenario 1 (degraded) above.

**Resolution plan (follow-up):**
- Attach Safari Web Inspector to the Even Hub WebView on iPhone to instrument the actual storage and launch-source values at runtime.
- Determine which of the three hypotheses is correct, then fix:
  - Storage not persisting → use a different SDK API or move to a host-side persistence channel.
  - Restore-read returning null → fix the read path (key mismatch, JSON parse failure, etc.).
  - Launch-source misclassification → broaden the cold-start branch and tighten the glassesMenu precedence guard.
- Re-run Scenarios 1, 1b at full fidelity after GAP-129-F is also closed (to validate entity rehydration path).

### Scenario 6 — Title Drift Banner

**Status:** FAIL
**Timestamp:** 2026-05-15
**Hardware:** Chrome on iMac, live ServiceNow Polaris case page

**Observed behavior:** Popup was kept alive with DevTools attached (Chrome's persist-on-debug trick). With the popup open and showing `CS0361233`, the operator navigated to a different case in the SN tab. The popup's drift banner did NOT appear and the header CS# did NOT update. Only after closing and re-opening the popup did the new CS# appear in the header — confirming the popup-side `onMessage` listener / DOM-update path works fine, but the **content-script `TITLE_DRIFT` message never reached the popup**.

**Root cause (confirmed via operator):** Polaris case-link navigation triggers a **full page reload**. The content-script is re-injected fresh on every page load, so the new instance's `lastCaseNumber` initializes from the new (already-changed) `document.title` — it never sees the prior case number, never detects drift, never fires `TITLE_DRIFT`. The RESEARCH assumption that Polaris is a pushState SPA does NOT hold for case-to-case navigation on this instance.

**Fix (follow-up plan):** Persist `lastCaseNumber` to `chrome.storage.session` (volatile, per-browser-session, MV3-native) at every detected case-number change. On content-script init, before initializing `lastCaseNumber` from the current title, read the stored value first. If it exists AND differs from the current title's CS#, the new content-script instance immediately fires `TITLE_DRIFT { from: stored, to: current }` so any open popup gets the warning. Then update storage with the new value. Lock-step the change into the Safari port (`vigil-safari-extension/Vigil Capture Extension/Resources/content-script.js`).

### GAP-129-D: SVCNOW-02 title-drift detection broken (Scenario 6 FAIL)

**Severity:** medium (drift UX missing; popup never silently masks the drift — it just doesn't warn)

**Observed:** See Scenario 6.

**Resolution plan (follow-up):** Investigate the actual SN navigation pattern in DevTools (full reload vs. pushState, and whether `<title>` element is replaced). Then apply the appropriate fix from the hypotheses above. Lock-step the fix into the Safari port.

### GAP-129-F: No hardware-validated G2 input gesture to enter TASK_DETAIL screen

**Severity:** high (the restored screen path is correctly implemented but unreachable through normal user interaction on real G2 hardware — the entire G2-LIFECYCLE-02 restore-to-TASK_DETAIL acceptance can't be exercised by an operator)

**Observed during Scenario 1 setup:** With G2 plugin showing the work-orders (open-tasks) list, operator reports the only available action is "exit from that list." No gesture on real G2 hardware enters a specific task's detail screen.

**Code inspection confirmed:**
- `vigil-g2-plugin/src/main.ts:316` wires `OsEventTypeList.CLICK_EVENT` on a list item to `navigateToTaskDetail()`.
- `vigil-g2-plugin/src/navigation.ts:248-249` comments explicitly state "ONLY DOUBLE_CLICK_EVENT is plumbed reliably on G2 (CLICK_EVENT is sim-only per Phase 45 retro)". The Phase 45 wire was kept in the codebase for sim/test fidelity but never re-validated on hardware in a follow-up phase.
- `handleNavEvent` for the WORK_ORDERS screen only handles SCROLL_TOP (prev), SCROLL_BOTTOM (next), DOUBLE_CLICK (HOME). No hardware gesture enters TASK_DETAIL.

**Implication for Phase 129:** `restoreScreenFn` in `main.ts:99-130` correctly re-fetches the task entity and calls `navigateToTaskDetail(taskIdx, bridge)` during restore. That code IS correct. But because there's no entry gesture, the operator can never get into TASK_DETAIL in the first place to set up the precondition for the restore test. The first time `navigateToTaskDetail` could ever fire on hardware is during a restore — and there is no way to seed the storage state that triggers that restore.

**Resolution plan (follow-up):**
- Phase 127.5's G2-input gesture audit verdict needs to be revisited; if no single-press equivalent exists, a context-sensitive DOUBLE_CLICK on WORK_ORDERS list (similar to Phase 124 D-08 on COMPANION) should be added that opens the currently-focused (top-of-list or first-visible) task's detail screen. Phase 124's COMPANION D-08 pattern is the template.
- After that gesture is wired and verified on hardware, re-run Scenario 1 (full restore-to-TASK_DETAIL flow).

### GAP-129-E: Phase 129 runbook conflates ServiceNow work_orders with thought-task openTasks

**Severity:** medium (terminology + scenario design issue; the implementation correctly uses thought-task IDs, but the runbook tells the operator to navigate to "WORK_ORDER_DETAIL" via case numbers — those screens are populated by thought-tasks, not work_orders)

**Observed during UAT setup for Scenario 1:** Operator's account had no "active work orders" visible on G2. Investigation revealed that:
- `/v1/brief` (the G2 plugin's data source) builds `openTasks` from `thoughts` table (taskStatus IN ('open','inProgress')) — NOT from `work_orders` table.
- `vigil-g2-plugin/src/screens/work-orders.ts` and `navigation.ts` use `task.id` (thought ID), confirmed by 129-02 executor's flagged deviation.
- `work_orders` rows (from Gmail import / extension `/sync`) appear in the PWA work-orders page but never in the G2 plugin.

**Root cause:** Phase 129's RESEARCH.md and runbook Scenario 1 description use "WORK_ORDER_DETAIL" and "work order" language that implies the G2 screen shows ServiceNow work_orders. The G2 plugin actually shows thought-tasks. The implementation followed the data shape correctly; only the runbook copy is wrong.

**Resolution plan (follow-up):**
- Update 129-UAT-RUNBOOK.md Scenario 1, 1b descriptions to use "task" terminology that reflects what G2 actually displays (e.g. "task detail screen" not "WORK_ORDER_DETAIL").
- Audit 129-CONTEXT.md, 129-RESEARCH.md for the same conflation and either correct, or add a clarifying note that "G2 work orders screen" is a misnomer for what is really an open-tasks view sourced from `thoughts`.
- Consider renaming `vigil-g2-plugin/src/screens/work-orders.ts` to `tasks.ts` in a follow-up phase to remove the persistent naming confusion (the executor's flagged deviation called this out; we shipped without fixing the file name).

### GAP-129-C: Production server returns HTTP 500 on `/v1/work-orders/sync`

**Severity:** high (blocks server-side validation of SVCNOW-04 dedup behavior; production may be down entirely)

**Observed:** From the iMac, Chrome popup POSTs to `https://api.vigilhub.io/v1/work-orders/sync` with a well-formed body (`clientCaptureId`, `caseNumber`, `shortDescription`, `priority`). Server returns HTTP 500, body `{"error":"Internal server error"}`. Client-side flow (D-04 inline error, popup stays open) works correctly.

**Root cause (confirmed via DevTools probe during UAT):** Production has Phase 129's NEW `work-orders.ts` deployed (`createWorkOrdersRoute` DI factory with `dbInsertOrGet` for the clientCaptureId branch) but production DB has NOT had migration `0021_add_work_orders_client_capture_id.sql` applied. The new `dbInsertOrGet` query references the `client_capture_id` column which doesn't exist in production → throws → handler returns HTTP 500 with generic `{"error":"Internal server error"}`. Confirmed by POST-ing the same body without the `clientCaptureId` field — request returned HTTP 200 because the legacy `dbUpsertLegacy` path is reached and uses only existing columns.

**Resolution plan (follow-up):**
- Apply migration `0021_add_work_orders_client_capture_id.sql` to production DB.
- Re-run Scenarios 4b and 4c post-migration to validate the new dedup behavior on the real server.
- (Process gap: Plan 129-01 only specified migration of the local dev DB. Future schema-changing plans should explicitly include a "production deploy" task — or the deploy pipeline should gate code rollout on migration parity.)
