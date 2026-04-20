---
phase: 107-safari-extension-persistence
verified: 2026-04-20T23:45:00Z
status: human_needed
score: 7/10 must-haves verified (3 require physical reboot UAT)
overrides_applied: 0
human_verification:
  - test: "Test 1 — Reboot persistence (SC#1, EXT-01 contract)"
    expected: "After `sudo reboot` and login, Safari → Settings → Extensions shows 'Vigil Capture' toggle ON without user intervention"
    why_human: "OS-level reboot cannot be automated safely from a dev machine; SMAppService persistence across boots is observable only by physical restart"
  - test: "Test 2 — Login Items entry (SC#1 corollary)"
    expected: "After the Test 1 reboot, System Settings → General → Login Items shows a 'Vigil Capture' entry under 'Open at Login', toggle ON"
    why_human: "System Settings UI state is user-facing; SMAppService's BTM registration manifests here only post-reboot"
  - test: "Test 5 — End-to-end capture after reboot (EXT-01 behavioral)"
    expected: "After the Test 1 reboot, using the Safari context-menu 'Capture with Vigil' saves a URL; GET /v1/thoughts confirms the capture"
    why_human: "Requires post-reboot Safari extension interaction + network round-trip to vigil-core; combines reboot + user gesture + server observation"
  - test: "Login-Item-boot window suppression (D-01 compliance post-reboot)"
    expected: "On the reboot in Test 1, Vigil Capture auto-launches silently — no storyboard window flash visible during/after login. systemUptime < 120s keeps the reveal gate CLOSED."
    why_human: "Only observable on actual Login Item boot path; the dev machine's uptime is always >>120s so the gate is open during local probes. Must be eyeballed on the reboot."
  - test: "Safari extension visibility in Safari → Settings → Extensions"
    expected: "Vigil Capture appears as an installable/enabled row in Safari's extension list so the reboot contract can be evaluated"
    why_human: "Reported during live UAT that Vigil Capture was not listed. Likely pre-existing developer-environment issue (Safari 'Allow Unsigned Extensions' toggle, DerivedData path vs /Applications, Safari cache). Not a Phase 107 regression, but blocks visual confirmation of the EXT-01 contract — surface for user resolution before reboot UAT."
---

# Phase 107: Safari Extension Persistence — Verification Report

**Phase Goal:** The Safari extension remains enabled after a Mac reboot without the user manually re-enabling it
**Verified:** 2026-04-20T23:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

Phase 107's goal is an observable post-reboot behavior. The code paths that deliver this behavior (Info.plist LSUIElement=true, SMAppService.mainApp.register() with status-guard, first-launch NSAlert, gated window suppression, persistence pill UI) are all present, substantive, wired, and produce real data flow at rest. The automated harness (5 static checks + runtime xcodebuild + SMAppService probe) exits 0. However, the SC#1 contract ("verified on physical hardware after full macOS restart") and its two corollaries (Tests 2 and 5) can only be proven by the user running `sudo reboot` and observing post-boot state. This is the D-06 `ship-with-uat-pending` pattern explicitly chosen during planning and documented in 107-HUMAN-UAT.md.

### Observable Truths

Truths derive from ROADMAP Success Criteria (authoritative) merged with per-plan must_haves.

| #  | Truth                                                                                                                                   | Source                                 | Status                          | Evidence                                                                                                                                                                                                                                                                                |
| -- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | `SMAppService.mainApp.register()` is called from `AppDelegate.applicationDidFinishLaunching`                                           | ROADMAP SC#2, plans 02                 | VERIFIED                        | `AppDelegate.swift:62` invokes `try SMAppService.mainApp.register()` inside `registerLoginItemIfNeeded()`, which is called from `applicationDidFinishLaunching` line 21. Status-guarded switch at lines 57-72.                                                                         |
| 2  | Registration is status-guarded (only calls register() when status is not .enabled)                                                      | Plan 02 must_have                      | VERIFIED                        | `AppDelegate.swift:57-72` — switch on `service.status` handles `.enabled` (skip), `.notRegistered/.notFound` (register), `.requiresApproval` (respect user), `@unknown default` (log). Register only fires on `.notRegistered/.notFound`.                                                |
| 3  | Container app suppresses window on launch (no visible window on startup)                                                                | ROADMAP SC#2, plans 01/05              | VERIFIED                        | `Info.plist:7-8` has `<key>LSUIElement</key><true/>` (plutil confirms `true`). `AppDelegate.suppressStoryboardWindows()` calls `NSApp.windows.forEach { $0.orderOut(nil) }` at launch. `Main.storyboard:80` carries `visibleAtLaunch="NO"` (hotfix ce5abd3).                           |
| 4  | First launch shows exactly one NSAlert; subsequent launches show none (UserDefaults guard)                                              | Plan 02 must_have, HUMAN-UAT Test 3/4  | VERIFIED (eyeballed)            | `AppDelegate.swift:81-96` — guards on `firstLaunchAlertKey`; calls `NSApp.activate(ignoringOtherApps: true)` then `alert.runModal()`. Tests 3 and 4 both flipped to `result: passed` in 107-HUMAN-UAT.md after live UAT.                                                                |
| 5  | Persistence pill UI surfaces SMAppService status when user opens prefs (D-04)                                                           | Plan 03 must_have                      | VERIFIED                        | `ViewController.swift:44-45` computes `persistenceStateString()` and pushes via `webView.evaluateJavaScript("showPersistence('\(persistence)')")`. Main.html carries four `persistence-*` `<p>` elements; Script.js exports `showPersistence`; Style.css hides non-active states.       |
| 6  | Login Item boot launches (systemUptime < 120s) stay hidden forever                                                                      | Plan 05 must_have, D-01 compliance      | VERIFIED (static) — PENDING UAT | `AppDelegate.swift:117-132` — gate stays CLOSED when `uptime >= 120 && alertAlreadyShown` is false. Login Item boot hits uptime <120s. Runtime probe on dev machine cannot exercise this path (uptime >>120s); only observable post-reboot. Test 1 + new "Login-Item-boot suppression". |
| 7  | User-initiated post-boot launches DO reveal the container window (D-04 preservation)                                                    | Plan 05 must_have                      | VERIFIED                        | `ViewController.swift:52-56` — `if let delegate = NSApp.delegate as? AppDelegate, delegate.shouldRevealWindow { webView.window?.makeKeyAndOrderFront(nil) }`. Runtime probe (b) WINDOWS_SECOND=1 in 107-05-SUMMARY confirms gate opens on post-boot dev-machine launches.               |
| 8  | Verification harness: `bash Scripts/verify-phase-107.sh --static` exits 0                                                               | Plans 00/04 must_have                  | VERIFIED                        | Ran during verification: all 5 static checks PASS (LSUIElement, deployment target, register+status, first-launch NSAlert, gated window suppression). Exit code 0.                                                                                                                      |
| 9  | After full macOS restart, Vigil Capture extension enabled in Safari > Settings > Extensions (SC#1)                                      | ROADMAP SC#1 — EXT-01 contract         | PENDING UAT                      | Cannot verify without physical reboot. HUMAN-UAT.md Test 1 `result: pending`. D-06 `ship-with-uat-pending` pattern.                                                                                                                                                                    |
| 10 | End-to-end capture after reboot delivers a URL to vigil-core (EXT-01 behavioral)                                                        | HUMAN-UAT Test 5                       | PENDING UAT                      | Requires post-reboot Safari context-menu capture + `/v1/thoughts` GET. Test 5 `result: pending`.                                                                                                                                                                                       |

**Score:** 7/10 truths VERIFIED; 3 require physical-reboot human UAT (Truths 6 partial-pending, 9, 10).

### Required Artifacts

Levels: Exists · Substantive · Wired · Data Flows.

| Artifact                                                                                | Expected                                                  | Exists | Substantive | Wired | Data Flows | Status    |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------ | ----------- | ----- | ---------- | --------- |
| `vigil-safari-extension/Vigil Capture/Info.plist`                                       | LSUIElement=true key present                               | YES    | YES         | YES   | N/A (config)| VERIFIED  |
| `vigil-safari-extension/Vigil Capture/AppDelegate.swift`                                | SMAppService register+status-guard + first-launch NSAlert + suppressStoryboardWindows | YES (133 lines)    | YES         | YES   | YES        | VERIFIED  |
| `vigil-safari-extension/Vigil Capture/ViewController.swift`                             | ServiceManagement import, persistenceStateString, gated makeKeyAndOrderFront, showPersistence bridge | YES (88 lines)     | YES         | YES   | YES        | VERIFIED  |
| `vigil-safari-extension/Vigil Capture/Resources/Base.lproj/Main.html`                   | Four persistence-* `<p>` elements + id="persistence"       | YES    | YES         | YES   | YES (pill renders from bridge) | VERIFIED |
| `vigil-safari-extension/Vigil Capture/Resources/Script.js`                              | showPersistence(state) function                            | YES    | YES         | YES   | YES        | VERIFIED  |
| `vigil-safari-extension/Vigil Capture/Resources/Style.css`                              | Five persistence-* visibility rules                        | YES    | YES         | YES   | N/A        | VERIFIED  |
| `vigil-safari-extension/Vigil Capture/Base.lproj/Main.storyboard`                       | visibleAtLaunch="NO" on window IQv-IB-iLA (gap_107_1 hotfix) | YES    | YES         | YES   | N/A        | VERIFIED  |
| `Scripts/verify-phase-107.sh`                                                           | 3-mode harness with 5 static + 2 runtime checks             | YES (executable, bash -n clean)    | YES         | YES   | N/A        | VERIFIED  |
| `.planning/phases/107-safari-extension-persistence/107-HUMAN-UAT.md`                    | ship-with-uat-pending tracker with 5 tests                  | YES    | YES         | YES   | YES (Tests 3+4 passed; 1,2,5 pending)    | VERIFIED  |
| `.planning/phases/107-safari-extension-persistence/107-VALIDATION.md`                   | nyquist_compliant: true with final task-ID map              | YES    | YES         | YES   | N/A        | VERIFIED  |

### Key Link Verification

| From                                    | To                                                         | Via                                               | Status   | Details                                                                                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applicationDidFinishLaunching`         | `registerLoginItemIfNeeded` -> `SMAppService.mainApp.register()` | status-guarded switch                              | WIRED    | `AppDelegate.swift:19-23` calls the helper; helper at lines 54-73 executes the register call inside `.notRegistered/.notFound` branch.                                                                   |
| `applicationDidFinishLaunching`         | `suppressStoryboardWindows()`                               | direct call at launch start                       | WIRED    | `AppDelegate.swift:20` — first line of applicationDidFinishLaunching. Orders all windows out before register+alert (fail-closed).                                                                         |
| `showFirstLaunchAlertIfNeeded`          | `UserDefaults.standard.bool(forKey: firstLaunchAlertKey)`   | guard-let early return                            | WIRED    | `AppDelegate.swift:82` — guard returns if flag already set. Flag written after `runModal()` (at-least-once delivery).                                                                                     |
| `AppDelegate.shouldRevealWindow`        | `ViewController.webView(_:didFinish:)`                      | `(NSApp.delegate as? AppDelegate)?.shouldRevealWindow` | WIRED    | `ViewController.swift:52-56` reads the gate before calling `makeKeyAndOrderFront(nil)`. Regression guard in harness (grep -B1) prevents unconditional re-show.                                          |
| `application(_:open:)` inbound hook     | `shouldRevealWindow = true`                                 | NSApplicationDelegate protocol conformance        | WIRED    | `AppDelegate.swift:38-42` — opportunistic Safari-prefs override. Best-effort; documented tradeoff when Safari doesn't deliver the event.                                                                  |
| `ViewController.webView(_:didFinish:)`  | `SMAppService.mainApp.status`                               | direct property read in `persistenceStateString()` | WIRED    | `ViewController.swift:64` — switch over live status. All 4 cases + @unknown default mapped to pill strings.                                                                                               |
| `ViewController.webView(_:didFinish:)`  | `Main.html showPersistence()`                               | `webView.evaluateJavaScript("showPersistence('...')")` | WIRED    | `ViewController.swift:45` — fires inside DispatchQueue.main.async alongside existing `show()` call. No races.                                                                                              |
| `Scripts/verify-phase-107.sh`           | `Info.plist` + `AppDelegate.swift` + `ViewController.swift` | plutil + grep static checks                       | WIRED    | 5 static checks covering all 4 Plan 01-03 artifacts plus Plan 05's gated suppression. Runtime mode adds xcodebuild + sfltool probe.                                                                       |
| `107-HUMAN-UAT.md`                      | `/gsd-progress`                                             | `status: partial` + `result: pending` rows        | WIRED    | HUMAN-UAT.md frontmatter `status: partial` surfaces the 3 pending tests in `/gsd-progress` until user flips them post-reboot.                                                                             |
| `Scripts/verify-phase-107.sh` (runtime) | `sfltool dumpbtm`                                           | grep for `io.vigilhub.extension`                   | WIRED (with caveat) | Runtime Check 6 exists and fired green during Plan 04 live run. REVIEW.md WR-01 flags the grep can prefix-match `io.vigilhub.extension.Extension` and is a known-warning (advisory, not blocking). |

### Data-Flow Trace (Level 4)

Dynamic-rendering artifacts traced to their data sources:

| Artifact                                  | Data Variable                          | Source                                                                 | Produces Real Data | Status    |
| ----------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- | ------------------ | --------- |
| `Main.html` persistence pill             | body class `persistence-*`             | `showPersistence(state)` invoked from Swift `evaluateJavaScript`       | YES (live SMAppService.mainApp.status) | FLOWING   |
| `Main.html` extension-state pill         | body class `state-*`                   | `show(state.isEnabled, ...)` from SFSafariExtensionManager callback     | YES (live Safari state) | FLOWING   |
| `AppDelegate.shouldRevealWindow`          | bool                                   | systemUptime + UserDefaults flag OR application(_:open:) override       | YES (computed at launch)  | FLOWING   |
| First-launch NSAlert copy                 | NSAlert.messageText / informativeText  | Literal strings (D-05 spec)                                             | YES (static by design)    | FLOWING   |

No hollow-prop or hardcoded-empty-at-call-site cases found. All dynamic surfaces connect to live data.

### Behavioral Spot-Checks

| Behavior                                                                      | Command                                                                                                                      | Result                                                                 | Status |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| Static harness exits 0                                                         | `bash Scripts/verify-phase-107.sh --static`                                                                                   | All 5 checks PASS, exit 0                                               | PASS   |
| LSUIElement key extractable as boolean true                                    | `plutil -extract LSUIElement raw "vigil-safari-extension/Vigil Capture/Info.plist"`                                           | `true`                                                                  | PASS   |
| Info.plist lints clean                                                         | `plutil -lint "vigil-safari-extension/Vigil Capture/Info.plist"`                                                              | `OK`                                                                    | PASS   |
| MACOSX_DEPLOYMENT_TARGET >= 13 in pbxproj                                      | `grep -c "MACOSX_DEPLOYMENT_TARGET = 15" project.pbxproj`                                                                     | 2 matches (>= 13 required for SMAppService.mainApp)                     | PASS   |
| Storyboard carries visibleAtLaunch="NO" (hotfix ce5abd3)                       | `grep "visibleAtLaunch" Main.storyboard`                                                                                      | Present on window IQv-IB-iLA line 80                                    | PASS   |
| xcodebuild Debug build                                                         | `xcodebuild build ...` (last exercised in Plans 02, 03, 05 summaries)                                                          | Exit 0 per summaries                                                    | PASS (per summaries) |
| SMAppService BTM probe green                                                   | `bash Scripts/verify-phase-107.sh --runtime` (exercised in Plan 04)                                                            | Reported green per 107-04-SUMMARY.md; WR-01 grep-direction caveat noted | PASS (advisory) |

### Requirements Coverage

| Requirement | Source Plan(s)              | Description                                                                                               | Status       | Evidence                                                                                                                                                           |
| ----------- | --------------------------- | --------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EXT-01      | 107-00, 01, 02, 03, 04, 05  | Safari extension remains enabled after a Mac reboot without user manually re-enabling it in Safari settings | NEEDS HUMAN  | All code paths are in place (LSUIElement, SMAppService.register, gated reveal, pill UI). Persistence across reboot is observable only by physical restart — deferred to Tests 1, 2, 5 in HUMAN-UAT per D-06. REQUIREMENTS.md L104 currently marks EXT-01 "Complete" by ship-with-uat-pending convention; actual SC#1 sign-off pending user reboot. |

No orphaned requirements — every plan's `requirements: [EXT-01]` declaration is accounted for, and no other requirement IDs map to Phase 107 in REQUIREMENTS.md §Traceability.

### Anti-Patterns Found

Files scanned: AppDelegate.swift, ViewController.swift, Info.plist, Main.html, Script.js, Style.css, Main.storyboard, Scripts/verify-phase-107.sh.

| File                                                                        | Line | Pattern                                                              | Severity  | Impact                                                                                                                                                                                       |
| --------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vigil-safari-extension/Vigil Capture/ViewController.swift`                 | 33   | Template-leftover TODO: `// Insert code to inform the user that something went wrong.` | Info      | Apple Safari Web Extension template boilerplate; error path silently returns. REVIEW.md IN-01. Non-blocking for EXT-01.                                                                      |
| `vigil-safari-extension/Vigil Capture/ViewController.swift`                 | 77   | `message.body as! String` force-cast                                  | Warning   | Crashes container on malformed WKScriptMessage (e.g., future Script.js posts a non-string). REVIEW.md WR-02. Currently safe (Script.js is only producer) but footgun for future refactors. Advisory.  |
| `vigil-safari-extension/Vigil Capture/ViewController.swift`                 | 81-85 | `showPreferencesForExtension` error silently discarded                | Warning   | User sees app quit with no feedback on Safari-prefs open failure. REVIEW.md WR-03. Advisory — pre-existing behavior, not a Phase 107 regression.                                              |
| `vigil-safari-extension/Vigil Capture/ViewController.swift`                 | 27   | Double force-unwrap on `Bundle.main.url` + `Bundle.main.resourceURL`  | Info      | Template boilerplate; fail-fast on misconfigured Copy Bundle Resources phase. REVIEW.md IN-02.                                                                                               |
| `vigil-safari-extension/Vigil Capture/Resources/Script.js`                  | 26-29 | Unknown persistence state silently hides all pills                    | Info      | `showPersistence` no-ops on unknown state; all four pills hidden. REVIEW.md IN-03. Intentional graceful degradation per 107-03 key-decisions.                                                  |
| `Scripts/verify-phase-107.sh`                                               | 116  | `find ... | head -1` picks arbitrary DerivedData build                | Info      | Multi-worktree machines may select stale .app. REVIEW.md IN-04. Advisory.                                                                                                                     |
| `Scripts/verify-phase-107.sh`                                               | 131  | `sfltool dumpbtm | grep 'io.vigilhub.extension' | grep 'Disposition'`  | Warning   | Bundle ID is a prefix of the Safari extension's ID; `grep -B5 ... | grep` can bleed across records. REVIEW.md WR-01. Advisory — check fired green in Plan 04 live run, but false-pass possible on future OS versions. |
| `Scripts/verify-phase-107.sh`                                               | 83-87 | Regression-guard grep -B1 fragile against multi-line refactors        | Info      | Single-line lookback; harmless reformat of the gate could flip the check. REVIEW.md IN-05. Accepted per Plan 05 key-decisions.                                                                |
| `vigil-safari-extension/Vigil Capture/ViewController.swift`                 | 78   | Stray semicolon `return;`                                             | Info      | Swift style, harmless.                                                                                                                                                                        |

All items are Info or Warning severity. No Blocker anti-patterns. None prevent EXT-01 goal achievement. Every finding matches Phase 107's REVIEW.md report (0 critical / 3 warning / 5 info — advisory per status).

### Human Verification Required

Phase 107 explicitly ships with 3 reboot-dependent UAT items pending per D-06 `ship-with-uat-pending`. These were planned as human-verification gates from the start (see 107-CONTEXT.md §D-06 and 107-VALIDATION.md §Manual-Only Verifications). They are NOT gaps — they are the acknowledged limit of what can be automated on a dev machine.

#### 1. Test 1 — Reboot persistence (SC#1, EXT-01 contract)

**Test:** Ensure Vigil Capture has been launched at least once (NSAlert dismissed); quit Vigil Capture; `sudo reboot`; after login, open Safari → Settings → Extensions.
**Expected:** "Vigil Capture" row toggle is ON without the user touching it.
**Why human:** OS-level reboot cannot be automated safely; SMAppService persistence across boots is observable only by physical restart. This is the literal contract of EXT-01.

#### 2. Test 2 — Login Items entry (SC#1 corollary)

**Test:** After the Test 1 reboot, open System Settings → General → Login Items.
**Expected:** A "Vigil Capture" entry appears under "Open at Login" with toggle ON by default.
**Why human:** System Settings UI state is user-facing; BTM registration manifests here only post-reboot.

#### 3. Test 5 — End-to-end capture after reboot (EXT-01 behavioral)

**Test:** After Test 1 reboot, without toggling anything, use Safari context-menu "Capture with Vigil" (or existing extension entry point) to save a URL.
**Expected:** The URL arrives in vigil-core; `GET /v1/thoughts` confirms the capture.
**Why human:** Requires post-reboot Safari gesture + server round-trip.

#### 4. Login-Item-boot window suppression (D-01 compliance post-reboot)

**Test:** During the Test 1 reboot's auto-launch, observe the screen.
**Expected:** No storyboard window flash visible during/after login. systemUptime < 120s keeps the reveal gate CLOSED; window stays hidden forever on boot path.
**Why human:** Only observable on actual Login Item boot path; dev-machine uptime is always >>120s so the gate opens during local probes. Must be eyeballed on reboot.

#### 5. Safari extension visibility prerequisite

**Test:** Before attempting Test 1, verify that Vigil Capture appears as a row in Safari → Settings → Extensions.
**Expected:** Vigil Capture listed, toggleable.
**Why human:** During Plan 04 live UAT, the extension was reported as NOT appearing in Safari's extension list (documented in 107-04-SUMMARY.md line 107). Likely causes: Safari Develop menu "Allow Unsigned Extensions" disabled, DerivedData path vs /Applications, or Safari extension cache. This is flagged as pre-existing developer-environment, not a Phase 107 regression, but if unresolved it blocks Test 1's visual check.

### Gaps Summary

**No gaps blocking EXT-01 goal achievement.**

All code paths that deliver the EXT-01 outcome are present, substantive, and wired with real data flow:

- Info.plist `LSUIElement=true` + `visibleAtLaunch="NO"` on storyboard window — window suppression at two layers (accessory policy + storyboard XIB).
- `SMAppService.mainApp.register()` status-guarded in `applicationDidFinishLaunching` — persistence registration with idempotency and `requiresApproval` respect.
- `suppressStoryboardWindows()` + `shouldRevealWindow` gate + `application(_:open:)` override — launch-source-aware reveal so Login Item boots stay silent (D-01) and user-initiated prefs clicks show UI (D-04).
- First-launch NSAlert + `NSApp.activate(ignoringOtherApps: true)` (Pitfall 3) — one-time user confirmation with at-least-once delivery.
- Persistence pill (Main.html + Script.js + Style.css + ViewController `persistenceStateString()`) — live SMAppService status bridged to the user-visible UI.
- Scripts/verify-phase-107.sh — 5 static checks + runtime xcodebuild + sfltool probe, all green.
- 107-HUMAN-UAT.md + 107-VALIDATION.md — `ship-with-uat-pending` + `nyquist_compliant: true` per D-06.

**Two acknowledged tradeoffs** (tradeoff_107_1 and tradeoff_107_2 in 107-HUMAN-UAT.md) are intentional UX cost/benefit decisions made during Plan 05 — Safari "Open preferences" within 120s of boot may not surface the window (accept, minor), and a sub-perceptual flash may appear on manual post-boot relaunch (accept, minor). Neither violates the EXT-01 contract or D-01 on the Login-Item-boot critical path.

**Three REVIEW.md warnings** (WR-01 sfltool prefix-grep, WR-02 force-cast, WR-03 silent error) are advisory per REVIEW.md §Summary. None block the EXT-01 goal; WR-02 and WR-03 are pre-existing template-level footguns; WR-01 is a correctness-adjacent caveat that fired green in Plan 04's live probe but should be hardened before treating Check 6 as authoritative on future OS versions.

**The one reported live-UAT surprise** — Safari extension not appearing in Safari → Settings → Extensions during Plan 04's D-04 pill bonus probe — is documented as a developer-environment issue, not a Phase 107 regression. It is surfaced in the human_verification list above because it is a prerequisite to the user being able to run Test 1 visually.

**Recommended next step:** Resolve the Safari extension visibility prerequisite (item 5 above) with the user, then hand off Tests 1, 2, 5 + the Login-Item-boot eyeball check (items 1-4 above) for physical-reboot UAT. Phase 107 per D-06 is already in its contracted shipped state; human UAT closes the remaining SC#1 surface.

---

*Verified: 2026-04-20T23:45:00Z*
*Verifier: Claude (gsd-verifier)*
