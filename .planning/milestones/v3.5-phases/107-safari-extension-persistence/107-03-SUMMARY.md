---
phase: 107-safari-extension-persistence
plan: 03
subsystem: ui
tags: [safari-extension, webkit, wkwebview, smappservice, servicemanagement, html, css, javascript, swift, macos, persistence-pill]

# Dependency graph
requires:
  - phase: 107-00
    provides: "Scripts/verify-phase-107.sh --static gate — Plan 03 must keep Checks 1-4 green (no regression to Plan 02's gains)"
  - phase: 107-01
    provides: "LSUIElement=true in Vigil Capture Info.plist — Open Question Q1 flags that WKWebView.didFinish may behave differently under LSUIElement; Plan 04 runtime UAT will confirm the pill renders"
provides:
  - "Persistence pill D-04 UI surface: four <p class=\"persistence-*\"> elements in Main.html (enabled / not-registered / requires-approval / failed)"
  - "showPersistence(state) JS function in Script.js — spread-remove + template-literal class add with silent guard on unknown states"
  - "Five CSS visibility rules in Style.css — default-hide + four per-state hide-others (mirrors existing .state-on/.state-off negative-selector pattern)"
  - "SMAppService status -> JS bridge in ViewController.swift: private persistenceStateString() helper + webView.evaluateJavaScript(\"showPersistence('...')\") called from webView(_:didFinish:) after the existing Safari-state show() call"
affects: [107-04-runtime-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive Safari-container prefs UI: match the existing .state-on/.state-off/.state-unknown negative-selector pattern when adding new pill states — keeps CSS mental model consistent and future-proofs new states (just add a body.new-state rule + four per-sibling hides)"
    - "JS showPersistence() uses classes.includes guard with template-literal class add — unknown state strings silently no-op (graceful degradation: body ends up in no persistence class, CSS hides all four pills)"
    - "Single evaluateJavaScript call per navigation for each pill — both show() and showPersistence() fire from the same DispatchQueue.main.async block inside SFSafariExtensionManager's async callback, so the UI updates atomically"
    - "@unknown default -> \"failed\" — conservative mapping; if Apple adds a new SMAppService.Status case in a future OS, the pill shows \"failed\" rather than silently hiding"

key-files:
  created: []
  modified:
    - "vigil-safari-extension/Vigil Capture/Resources/Base.lproj/Main.html (+6 lines: four persistence-* <p> elements, id=\"persistence\" on the enabled anchor)"
    - "vigil-safari-extension/Vigil Capture/Resources/Script.js (+14 lines: showPersistence(state) function inserted before openPreferences)"
    - "vigil-safari-extension/Vigil Capture/Resources/Style.css (+23 lines: five persistence-* visibility rules — 1 default-hide + 4 per-state hide-others)"
    - "vigil-safari-extension/Vigil Capture/ViewController.swift (+19 lines net: import ServiceManagement, persistenceStateString() helper, showPersistence JS bridge call in webView(_:didFinish:))"

key-decisions:
  - "No color/background styling on pills — inherited -apple-system-short-body matches the existing state-* pills; users distinguish states via text content alone (minimalism over decoration per CONTEXT §specifics). A follow-up plan can add brand teal #1D9E75 for the enabled state if real-world UX calls for it."
  - "showPersistence guard uses classes.includes rather than switch/map — unknown state strings silently no-op (all pills hidden) rather than logging to console. Console.log was omitted to match the file's production-grade minimalism (no debug artifacts shipped)."
  - "ViewController calls SMAppService.mainApp.status from inside the existing DispatchQueue.main.async block instead of hopping to a new queue — property read is synchronous and non-blocking; an extra hop would only add latency."
  - "Bridge call placed in webView(_:didFinish:) rather than viewDidAppear — matches the existing show() call site for symmetry; also ensures the HTML is actually loaded before we push state into it. RESEARCH Open Question Q1 flagged a risk that didFinish may not fire under LSUIElement; Plan 04's launch probe + HUMAN-UAT will catch any regression, and the fallback (viewDidAppear) is a one-line move if needed."

patterns-established:
  - "Safari container prefs extension pattern: to add a new status pill (any status vocabulary, not just persistence), mirror exactly (a) four classed <p> in Main.html, (b) showX() function with spread-remove + template-literal add in Script.js, (c) five CSS rules (1 default-hide + N per-state) in Style.css, (d) Swift helper returning an enum-mapped string + evaluateJavaScript call in webView(_:didFinish:)."
  - "@unknown default branches in SMAppService / SFSafariExtensionManager switches should map to a user-visible \"failed\" string rather than fall through silently — future OS Status additions get a visible signal in the UI instead of a mystery blank pill."

requirements-completed: []  # EXT-01 is gated by Plan 04 human UAT (physical reboot + pill visual verification); Plan 03 delivers the pill surface but does not complete the requirement

# Metrics
duration: 2m 18s
completed: 2026-04-20
---

# Phase 107 Plan 03: Persistence Pill (D-04) Summary

**Four-file additive surgical diff wires the D-04 persistence pill into the Safari container app's prefs webview — Main.html gets four persistence-* <p> elements, Script.js gets showPersistence(state), Style.css gets default-hide + four per-state hide-others rules, ViewController.swift gets import ServiceManagement + persistenceStateString() helper + evaluateJavaScript call; xcodebuild Debug clean; verify-phase-107.sh --static still exits 0.**

## Performance

- **Duration:** 2m 18s (1776712078 -> 1776712216)
- **Started:** 2026-04-20T19:07:58Z
- **Completed:** 2026-04-20T19:10:16Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments

- `Main.html` now contains four persistence-* pills rendered after the existing extension-state pills and before the Quit button — `persistence-enabled` (with `id="persistence"` anchor), `persistence-not-registered`, `persistence-requires-approval`, `persistence-failed`. Curly apostrophes preserved across the file. `&rsaquo;` used for the System Settings chevron (CSP-safe).
- `Script.js` gained a `showPersistence(state)` function inserted before `openPreferences()`. It accepts one of four state strings, clears all four persistence-* classes via `document.body.classList.remove(...classes)`, and conditionally adds `persistence-${state}` via template literal if the state is in the allowlist. Unknown states silently no-op (graceful degradation).
- `Style.css` appended with five new rules (1 default-hide + 4 per-state hide-others) mirroring the existing `body:not(.state-on, .state-off) :is(...)` negative-selector pattern at L31-41. No color/background styling — pills inherit the native body font, users distinguish states by text content alone.
- `ViewController.swift` now imports ServiceManagement, adds a private `persistenceStateString()` helper that switches over all four `SMAppService.Status` cases (`.enabled`, `.notRegistered`/`.notFound`, `.requiresApproval`, `@unknown default`) and returns one of four pill state strings. `webView(_:didFinish:)` pushes the result into the webview via `evaluateJavaScript("showPersistence('\(persistence)')")` inside the same DispatchQueue.main.async block as the existing Safari-state `show()` call.
- `xcodebuild build -project "Vigil Capture.xcodeproj" -scheme "Vigil Capture" -configuration Debug -quiet` exits 0 — ServiceManagement auto-links on `import` (RESEARCH A1 confirmed from Plan 02).
- `bash Scripts/verify-phase-107.sh --static` exits 0 — all 4 static checks remain green. Plan 03 is purely additive; no regression.
- Zero new files, zero new frameworks linked, zero pbxproj edits — surgical scope exactly per plan.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add persistence pill <p> elements to Main.html** — `592ed93` (feat)
2. **Task 2: Add showPersistence(state) function to Script.js** — `f4f5bb8` (feat)
3. **Task 3: Add persistence-* CSS visibility rules to Style.css** — `757420c` (feat)
4. **Task 4: Wire SMAppService status read + showPersistence JS bridge in ViewController.swift** — `d77e5e7` (feat)

**Plan metadata commit:** created after this SUMMARY.md lands, captures SUMMARY + STATE + ROADMAP updates.

## Files Created/Modified

- `vigil-safari-extension/Vigil Capture/Resources/Base.lproj/Main.html` — +6 insertions. Four persistence-* `<p>` elements between the existing `.state-off` paragraph and the `.open-preferences` button. `id="persistence"` on the `.persistence-enabled` anchor paragraph only; the other three are hidden by CSS until their class is active.
- `vigil-safari-extension/Vigil Capture/Resources/Script.js` — +14 insertions. `showPersistence(state)` function inserted before `openPreferences()`; `show()` and `openPreferences()` + the click handler untouched.
- `vigil-safari-extension/Vigil Capture/Resources/Style.css` — +23 insertions. Five new rules appended after `button { font-size: 1em; }`. Existing `.state-on`/`.state-off`/`.state-unknown` rules at L31-41 untouched.
- `vigil-safari-extension/Vigil Capture/ViewController.swift` — +19 insertions net. `import ServiceManagement` added after `import WebKit`. `persistenceStateString()` private helper inserted between `webView(_:didFinish:)` and `userContentController(_:didReceive:)`. `webView(_:didFinish:)` extended with two new lines: `let persistence = self.persistenceStateString()` and `webView.evaluateJavaScript("showPersistence('\(persistence)')")`.

## ViewController.swift Final Diff (d77e5e7 vs parent)

```diff
@@ -8,6 +8,7 @@
 import Cocoa
 import SafariServices
 import WebKit
+import ServiceManagement

 let extensionBundleIdentifier = "io.vigilhub.extension.Extension"

@@ -37,10 +38,28 @@
                 } else {
                     webView.evaluateJavaScript("show(\(state.isEnabled), false)")
                 }
+                // D-04: push live SMAppService persistence status to the pill.
+                let persistence = self.persistenceStateString()
+                webView.evaluateJavaScript("showPersistence('\(persistence)')")
             }
         }
     }

+    /// Maps the live SMAppService.mainApp.status to one of four pill state strings
+    /// that Script.js's showPersistence() understands.
+    private func persistenceStateString() -> String {
+        switch SMAppService.mainApp.status {
+        case .enabled:
+            return "enabled"
+        case .notRegistered, .notFound:
+            return "not-registered"
+        case .requiresApproval:
+            return "requires-approval"
+        @unknown default:
+            return "failed"
+        }
+    }
+
     func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
```

## xcodebuild Observations

- Exit code: `0` after Task 4
- Only warning emitted is the standard destination-selection notice (pre-existing scheme noise inherited from prior phases; not introduced by Plan 03):
  - `IDERunDestination: Supported platforms for the buildables in the current scheme is empty`
  - `Using the first of multiple matching destinations: { platform:macOS, arch:x86_64, id:6302B276..., name:My Mac }`
- No ServiceManagement linker errors — Xcode 26.3 auto-links on `import ServiceManagement` (confirmed again; AppDelegate.swift already did the same in Plan 02)
- No deprecation warnings. `persistenceStateString()` reads a property; no deprecated API touched.
- No new ViewController.swift-introduced warnings.

## verify-phase-107.sh --static Output (post-Task 4)

```
[verify-107] Check 1: LSUIElement=true in container Info.plist
  PASS — LSUIElement is true
[verify-107] Check 2: Container target effective MACOSX_DEPLOYMENT_TARGET >= 13.0
  PASS — found MACOSX_DEPLOYMENT_TARGET >= 13 in project.pbxproj
[verify-107] Check 3: AppDelegate.swift has SMAppService.mainApp.register() with status-guard
  PASS — register() and .status both present
[verify-107] Check 4: AppDelegate.swift has first-launch NSAlert guarded by UserDefaults flag
  PASS — first-launch NSAlert pattern present
verify-phase-107: all checks passed
```

Exit code: `0`. Plan 03 is additive — no regression.

## Open Question Q1: Does WKWebView.didFinish fire under LSUIElement=true?

**Status:** unverified — defers to Plan 04 runtime UAT.

The plan context (RESEARCH §Open Questions Q1) flagged this as a risk: under `LSUIElement=true` (added in Plan 01), the container app launches as an accessory process. If `WKWebView`'s `didFinish` navigation delegate never fires in that lifecycle, the entire bridge (both `show()` and `showPersistence()`) is inert even though the Swift and JS sides are wired correctly.

**What's wired today:** Every grep-level and compile-level check passes. The code will execute if didFinish fires. xcodebuild produces a clean binary. No static harness can validate the runtime delivery.

**What Plan 04 will verify (via 107-HUMAN-UAT.md):**
- Pill visually renders when the user clicks "Open preferences" from Safari > Extensions
- Pill text matches one of the four state strings (enabled / not-registered / requires-approval / failed)
- Reboot test: after reboot, pill should read "enabled" (confirms SMAppService registration stuck)

**Fallback (if didFinish does NOT fire under LSUIElement):** move both `evaluateJavaScript` calls from `webView(_:didFinish:)` to a one-shot call in `viewDidAppear()` or to a WKScriptMessageHandler-driven round-trip. One-line edit. Out of scope for Plan 03 — documented here so the fix is predictable when Plan 04 human UAT reports back.

No security impact either way — worst case is a blank pill, not a data leak.

## Threat Flags

None. Plan 03's four-file diff introduces:
- No new network endpoints
- No new auth or authorization surface
- No new file system access
- No new schema changes
- No new data crossing a trust boundary

The single evaluateJavaScript call's injected value is a hard-coded lowercase-dash string returned from a Swift switch over a fixed enum — no user data, no remote data, no dynamic content. Every string in the switch is one of `"enabled"`, `"not-registered"`, `"requires-approval"`, `"failed"` — no quotes, no backslashes, safe under single-quote JS escape. Covered explicitly in threat register T-107-03-01 (mitigate, ASVS L1 compliant). Other threats (T-107-03-02 through T-107-03-05) were accepted in the plan — no code change re-opens them.

## Decisions Made

1. **No color/background styling on pills** — the spec in RESEARCH §Pattern 4 says "mirror the existing .state-on/.state-off/.state-unknown pattern", which is text-only. Users distinguish states by reading the copy; adding colored dots or backgrounds is a future UX decision (Vigil teal #1D9E75 for enabled would be brand-aligned) that belongs in its own plan. Keeps Plan 03 surgical.
2. **`classes.includes` guard over `switch`** — a switch over state strings would duplicate the allowlist and require an `else { /* unknown */ }` branch. The includes guard keeps the source-of-truth (the classes array) in one place.
3. **`evaluateJavaScript` inside the existing main-queue block, not a new hop** — `SMAppService.mainApp.status` is a synchronous property access; hopping to a new async queue would only add latency. The main-queue block already holds the webView reference and is guaranteed to run after the Safari-state callback.
4. **Pill inserted before the button, after state-* paragraphs** — Visual flow matches spec (persistence confirmation reads naturally below the state indicator), and placing the pill before the button preserves the existing click handler wiring (`document.querySelector("button.open-preferences")` still finds the right element; the button is still the last focusable element, so keyboard navigation is unchanged).

## Deviations from Plan

**None — plan executed exactly as written.**

All four tasks landed per the plan's canonical code blocks verbatim. xcodebuild clean first try, static harness clean first try, no Rule 1-3 auto-fixes triggered. No architectural change surfaced. No auth gates.

## Issues Encountered

None. Four clean commits, one xcodebuild, one harness run.

## User Setup Required

None for this plan. Physical verification of the pill rendering (SC#1 — pill visible after reboot with correct state; ties to HUMAN-UAT's "1. Reboot persistence" test) is gated through Plan 04. When Plan 04 lands:

1. Install Vigil Capture via Xcode (or from a built .app)
2. Open Safari > Settings > Extensions > click "Open preferences"
3. Container prefs window should render with:
   - Existing extension-state pill (on / off / unknown)
   - NEW persistence pill reading one of: "Login item active..." / "Login item not registered..." / "Login item needs approval..." / "Login item registration failed..."
4. Reboot
5. Re-open preferences — persistence pill should read "Login item active..." confirming the registration survived

If the persistence pill does NOT render (Open Question Q1 materializes), the Plan 04 probe will catch it and a follow-up patch moves the `evaluateJavaScript` calls from `webView(_:didFinish:)` to `viewDidAppear()`. One-line change; not in scope here.

## Next Phase Readiness

- **Plan 04 (runtime UAT)** unblocked — the full prefs UI (extension-state pill + new persistence pill) is wired, xcodebuild Debug clean, ready for the `--runtime` harness mode (Checks 5 + 6) and the physical reboot test
- **Plan 05 (entitlements fallback)** remains on standby — only invoked if Plan 04 runtime Check 6 fails (`sfltool dumpbtm` / `launchctl` find no `io.vigilhub.extension` row per RESEARCH Pitfall 4/5)
- **Open Question Q1 resolution** — carried into Plan 04's HUMAN-UAT as "does the persistence pill actually render?" If NO, the fallback patch is documented above
- Pre-existing dirty-tree files (`vigil-pwa/src/index.css` modifications, `vigil-pwa/.env.local.bak` untracked) were deliberately NOT staged in Plan 03 commits (scope boundary rule — pre-existing state not caused by this plan's work); they continue to carry forward for future cleanup
- No blockers or concerns carried forward from Plan 03

## Self-Check: PASSED

- FOUND: `.planning/phases/107-safari-extension-persistence/107-03-SUMMARY.md` (this file)
- FOUND: `vigil-safari-extension/Vigil Capture/Resources/Base.lproj/Main.html` (modified — 4 persistence-* pills, id="persistence" present)
- FOUND: `vigil-safari-extension/Vigil Capture/Resources/Script.js` (modified — showPersistence function at line 18)
- FOUND: `vigil-safari-extension/Vigil Capture/Resources/Style.css` (modified — 5 persistence-* visibility rules appended)
- FOUND: `vigil-safari-extension/Vigil Capture/ViewController.swift` (modified — import ServiceManagement, persistenceStateString, showPersistence bridge)
- FOUND: commit `592ed93` (Task 1: Main.html pills)
- FOUND: commit `f4f5bb8` (Task 2: Script.js showPersistence)
- FOUND: commit `757420c` (Task 3: Style.css rules)
- FOUND: commit `d77e5e7` (Task 4: ViewController.swift wiring)
- xcodebuild Debug exits 0
- Scripts/verify-phase-107.sh --static exits 0 (all 4 checks green — no regression)
- No new untracked generated files introduced by Plan 03 tasks

---
*Phase: 107-safari-extension-persistence*
*Completed: 2026-04-20*
