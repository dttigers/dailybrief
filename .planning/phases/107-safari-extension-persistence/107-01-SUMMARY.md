---
phase: 107-safari-extension-persistence
plan: 01
subsystem: infra
tags: [safari-extension, lsuielement, info-plist, appkit, macos, plist, smappservice-prereq]

# Dependency graph
requires:
  - phase: 107-00
    provides: "verify-phase-107.sh static check harness — Check 1 (LSUIElement) gated RED pre-implementation"
provides:
  - "LSUIElement=true declaration in Vigil Capture container Info.plist — accessory-mode activation policy"
  - "D-01 prerequisite satisfied for Plan 02 silent SMAppService.mainApp.register() call at login"
  - "D-01 prerequisite satisfied for Plan 03 prefs UI rendering only on explicit user action from Safari"
affects: [107-02-app-delegate-register, 107-03-prefs-window, 107-04-human-uat-safari-persistence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Literal Info.plist edit (not INFOPLIST_KEY_LSUIElement build setting) — chosen for git-diff visibility per RESEARCH Alternatives Considered"

key-files:
  created: []
  modified:
    - "vigil-safari-extension/Vigil Capture/Info.plist (+2 lines: <key>LSUIElement</key> / <true/>)"

key-decisions:
  - "Edit literal Info.plist instead of adding INFOPLIST_KEY_LSUIElement to project.pbxproj — keeps the LSUIElement flip visible in git diff and decouples UX policy from build config"
  - "Preserve tab indentation (existing file used tabs, not 4-space per plan prose) — matches Xcode default and avoids mixed-whitespace churn"
  - "Do not touch Main.storyboard or INFOPLIST_KEY_NSMainStoryboardFile — storyboard continues to instantiate ViewController for Plan 03 prefs WKWebView bridge (RESEARCH Pitfall 2)"

patterns-established:
  - "Accessory-mode Safari container: LSUIElement=true + inherited MACOSX_DEPLOYMENT_TARGET=15.7 (>=13.0) — ready for SMAppService.mainApp.register() without Dock/menu-bar/window-flash artifacts"

requirements-completed: []  # EXT-01 satisfaction requires Plans 02+03+04; this plan contributes the activation-policy prerequisite only

# Metrics
duration: 2m 1s
completed: 2026-04-20
---

# Phase 107 Plan 01: LSUIElement Accessory-Mode Container Summary

**Flipped Vigil Capture container app to LSUIElement=true accessory-mode activation policy — two-line Info.plist edit unlocks silent SMAppService.register() in Plan 02 with zero Swift/pbxproj changes**

## Performance

- **Duration:** 2m 1s
- **Started:** 2026-04-20T18:55:12Z
- **Completed:** 2026-04-20T18:57:13Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `<key>LSUIElement</key><true/>` inside the existing `<dict>` in `vigil-safari-extension/Vigil Capture/Info.plist` (net +2 lines, 8→10)
- `plutil -lint` validates OK; `plutil -extract LSUIElement raw` returns `true`; existing `SFSafariWebExtensionConverterVersion=26.3` preserved
- `xcodebuild build -project "Vigil Capture.xcodeproj" -scheme "Vigil Capture" -configuration Debug -quiet` exits 0 — Info.plist change is non-breaking
- Static verify script `Scripts/verify-phase-107.sh --static` advances Check 1 (LSUIElement) and Check 2 (deployment target) to PASS; Checks 3 + 4 (AppDelegate register() + first-launch NSAlert) remain FAIL as expected, pending Plan 02

## Task Commits

Each task was committed atomically:

1. **Task 1: Add LSUIElement=true to container Info.plist** — `44610e9` (feat)

**Plan metadata:** [final commit hash recorded after this SUMMARY is written] (docs: complete plan)

## Files Created/Modified

- `vigil-safari-extension/Vigil Capture/Info.plist` — added LSUIElement=true key; declares accessory-mode activation policy for the Safari container app so AppKit suppresses the Dock icon, menu bar, and launch window (storyboard + ViewController remain wired; WKWebView bridge still works when the user opens prefs from Safari)

## Exact Diff

```diff
@@ -3,5 +3,7 @@
 <plist version="1.0">
 <dict>
 	<key>SFSafariWebExtensionConverterVersion</key>
 	<string>26.3</string>
+	<key>LSUIElement</key>
+	<true/>
 </dict>
 </plist>
```

## plutil Verification Output

```
$ plutil -lint "vigil-safari-extension/Vigil Capture/Info.plist"
vigil-safari-extension/Vigil Capture/Info.plist: OK

$ plutil -extract LSUIElement raw "vigil-safari-extension/Vigil Capture/Info.plist"
true

$ plutil -extract SFSafariWebExtensionConverterVersion raw "vigil-safari-extension/Vigil Capture/Info.plist"
26.3

$ grep -c '<key>' "vigil-safari-extension/Vigil Capture/Info.plist"
2

$ wc -l "vigil-safari-extension/Vigil Capture/Info.plist"
10 vigil-safari-extension/Vigil Capture/Info.plist
```

## xcodebuild Observations

- Exit code: `0`
- Only warning emitted is the standard destination-selection notice: `IDERunDestination: Supported platforms for the buildables in the current scheme is empty` / `Using the first of multiple matching destinations: { platform:macOS, arch:x86_64, id:6302B276..., name:My Mac }`. Pre-existing noise, unrelated to the Info.plist edit.
- No Info.plist-related warnings. No pbxproj-synthesized-key conflicts. GENERATE_INFOPLIST_FILE=YES continues to merge the 2 literal keys with the synthesized CFBundleDisplayName / NSMainStoryboardFile / NSPrincipalClass.

## verify-phase-107.sh --static Check State After Plan 01

| Check | Description | State | Notes |
|---|---|---|---|
| 1 | LSUIElement=true in container Info.plist | PASS (green) | Delivered by this plan |
| 2 | Container target effective MACOSX_DEPLOYMENT_TARGET >= 13.0 | PASS (green) | Inherited project-level 15.7; no edit needed |
| 3 | AppDelegate.swift has `SMAppService.mainApp.register()` with status guard | FAIL (red) | Pending Plan 02 — expected |
| 4 | AppDelegate.swift has first-launch `NSAlert` guarded by UserDefaults flag | FAIL (red) | Pending Plan 02 — expected |
| 5 | Runtime reboot/login-item persistence (SC#1) | unreachable | `--runtime` mode; pending Plan 04 human UAT |
| 6 | Runtime no-window-flash on login (SC#2) | unreachable | `--runtime` mode; pending Plan 04 human UAT |

Exit code for `--static`: 1 (as intended — Checks 3 and 4 remain RED until Plan 02 lands). Plan 01 scope is fully green.

## Collateral-Change Guards (confirmed empty)

- `git diff --stat "vigil-safari-extension/Vigil Capture.xcodeproj/project.pbxproj"` → empty (no pbxproj edits)
- `find vigil-safari-extension -name '*.entitlements'` → empty (no .entitlements file created; LSUIElement does not require one per RESEARCH Pitfall 5)
- No changes to Main.storyboard, ViewController.swift, AppDelegate.swift, or SafariWebExtension keys (Pitfall 2 preserved)

## Decisions Made

None beyond the three logged in `key-decisions` above (literal Info.plist edit, tab indentation preserved, storyboard untouched). All were already anticipated in the plan and RESEARCH.

## Deviations from Plan

None — plan executed exactly as written. Existing dirty-tree files (`vigil-pwa/src/index.css`, `vigil-pwa/.env.local.bak`) were pre-existing before Plan 01 started and deliberately not staged in the Task 1 commit (per scope-boundary rule — not caused by this task's work).

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required for this plan. Runtime verification of SC#1 (survives reboot) and SC#2 (no window flash) is gated through Plan 04 human UAT, not this plan.

## Next Phase Readiness

- Plan 02 (AppDelegate `SMAppService.mainApp.register()` + first-launch NSAlert) is unblocked — the container app will now launch silently once register() runs at login
- Deployment target already satisfies the macOS 13+ SMAppService requirement (project-level 15.7 inherited by container target)
- verify-phase-107.sh static harness is positioned to flip Checks 3+4 green once Plan 02 lands
- No blockers or concerns carried forward from Plan 01

## Self-Check: PASSED

- FOUND: `.planning/phases/107-safari-extension-persistence/107-01-SUMMARY.md` (this file)
- FOUND: `vigil-safari-extension/Vigil Capture/Info.plist` (modified, LSUIElement=true confirmed via plutil)
- FOUND: commit `44610e9` (`feat(107-01): add LSUIElement=true to Vigil Capture Info.plist`)

---
*Phase: 107-safari-extension-persistence*
*Completed: 2026-04-20*
