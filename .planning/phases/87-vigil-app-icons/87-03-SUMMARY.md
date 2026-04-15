---
phase: 87-vigil-app-icons
plan: 03
subsystem: infra
tags: [macos, app-bundle, plist, codesign, icons, install-script, doctor]

# Dependency graph
requires:
  - phase: 87-vigil-app-icons
    provides: brand/mac/AppIcon.icns master file (Plan 87-01)
  - phase: 83-menubar-only
    provides: LSUIElement=true Dock-less plist baseline (must preserve)
provides:
  - DailyBriefMonitor.app bundle now ships with Vigil-branded AppIcon.icns
  - install.sh plist heredoc declares CFBundleIconFile=AppIcon
  - install.sh copies AppIcon.icns into Resources/ before codesign --deep (signature covers icon)
  - dailybrief-doctor.sh validates icon presence + plist key (D-10 regression guard)
  - LSUIElement=true preserved — Dock-less behavior intact (SC-5 regression guard held)
affects: [future-mac-bundle-changes, install-script-modifications, doctor-extensions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-built brand asset (.icns) committed in repo, copied into bundle at install time"
    - "Icon copy ordered BEFORE codesign --deep so signature covers Resources/"
    - "Doctor script validates both file presence AND plist key match"

key-files:
  created: []
  modified:
    - Scripts/install.sh
    - Scripts/dailybrief-doctor.sh

key-decisions:
  - "Icon copy placed between plist heredoc close and codesign block to ensure signature coverage"
  - "install.sh hard-fails (exit 1) if brand/mac/AppIcon.icns is missing — explicit Plan 87-01 dependency"
  - "Doctor check increments DRIFT_COUNT on failure rather than soft-warn — surfaces regressions in CI/local exit code"
  - "CFBundleIconFile uses bare 'AppIcon' (no .icns extension) per Launch Services convention"

patterns-established:
  - "Brand-asset-into-bundle: commit pre-built artifact, install script copies + signs in single pass"
  - "Doctor regression guard: any plist-controlled bundle property gets a corresponding doctor check"

requirements-completed: []

# Metrics
duration: ~10min (execute) + human-verify wait
completed: 2026-04-15
---

# Phase 87 Plan 03: Wire Vigil AppIcon into DailyBriefMonitor.app Summary

**install.sh now ships a Vigil-branded, still-Dock-less, codesign-valid DailyBriefMonitor.app bundle, with a doctor regression guard preventing silent icon drift.**

## Performance

- **Duration:** ~10 min execution + human-verify pause
- **Started:** 2026-04-15T15:26Z (Task 1 commit)
- **Completed:** 2026-04-15 (Task 3 user-approved)
- **Tasks:** 3 (2 auto + 1 human-verify)
- **Files modified:** 2

## Accomplishments
- Added `CFBundleIconFile=AppIcon` to the install.sh plist heredoc without disturbing the Phase 83 `LSUIElement=true` block
- Wired AppIcon.icns copy step (with Plan 87-01 prerequisite hard-fail) BEFORE codesign --deep so the icon resource is covered by the bundle signature
- Extended dailybrief-doctor.sh with a Phase 87 regression guard that validates both the on-disk .icns and the plist key, contributing to DRIFT_COUNT on failure
- Human-verified: Finder displays the Vigil teal diamond+V icon for `~/.local/bin/DailyBriefMonitor.app`; Dock-less behavior preserved (no Dock tile after launch)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update install.sh plist template + AppIcon.icns copy step** — `2f3b8d6` (feat)
2. **Task 2: Add AppIcon.icns presence check to dailybrief-doctor.sh** — `50f3fe2` (feat)
3. **Task 3: Human-verify Finder icon + Dock-less regression** — no code commit (checkpoint, user-approved)

**Plan metadata:** to be appended after this commit (docs)

## Files Created/Modified

- `Scripts/install.sh` — added 2-line `CFBundleIconFile`/`<string>AppIcon</string>` plist block; added 9-line AppIcon.icns copy block (with prerequisite check) between plist heredoc and codesign
- `Scripts/dailybrief-doctor.sh` — added 22-line "Vigil AppIcon.icns presence check" section before the DRIFT_COUNT exit logic; failure increments DRIFT_COUNT

### Exact diff — Scripts/install.sh

```diff
@@ -116,6 +116,8 @@ cat > "$MONITOR_APP/Contents/Info.plist" <<INFOPLIST
     <string>1</string>
     <key>CFBundleShortVersionString</key>
     <string>2.4</string>
+    <key>CFBundleIconFile</key>
+    <string>AppIcon</string>
     <key>LSUIElement</key>
     <true/>
     <key>LSMinimumSystemVersion</key>
@@ -128,6 +130,15 @@ cat > "$MONITOR_APP/Contents/Info.plist" <<INFOPLIST
 </plist>
 INFOPLIST

+# Copy pre-built AppIcon.icns into bundle Resources (Phase 87 D-06/D-07).
+# Must happen BEFORE codesign --deep so signature covers the icon resource.
+if [[ ! -f "$REPO_DIR/brand/mac/AppIcon.icns" ]]; then
+    echo "ERROR: brand/mac/AppIcon.icns missing. Run Plan 87-01 first." >&2
+    exit 1
+fi
+cp -f "$REPO_DIR/brand/mac/AppIcon.icns" "$MONITOR_RESOURCES/AppIcon.icns"
+echo "  AppIcon.icns installed to bundle Resources."
+
 # Sign the .app bundle (signs the entire bundle including binary).
```

### Exact diff — Scripts/dailybrief-doctor.sh

```diff
@@ -225,6 +225,28 @@ fi

 echo ""

+# ----------------------------------------------------------------------------
+# AppIcon.icns presence check (Phase 87 D-10)
+# ----------------------------------------------------------------------------
+echo "Vigil AppIcon.icns presence check:"
+MONITOR_ICON="$HOME/.local/bin/DailyBriefMonitor.app/Contents/Resources/AppIcon.icns"
+PLIST_ICON_KEY=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIconFile" \
+    "$HOME/.local/bin/DailyBriefMonitor.app/Contents/Info.plist" 2>/dev/null || echo "")
+
+if [[ -s "$MONITOR_ICON" && "$PLIST_ICON_KEY" == "AppIcon" ]]; then
+    echo "  ✓ AppIcon.icns present ($(stat -f%z "$MONITOR_ICON") bytes) and plist references AppIcon"
+else
+    echo "  ✗ AppIcon.icns missing or plist CFBundleIconFile not set"
+    ...
+    DRIFT_COUNT=$((DRIFT_COUNT + 1))
+fi
+echo ""
+
 # ----------------------------------------------------------------------------
 # Exit logic (D-10, D-11)
```

## Decisions Made
- **Copy-before-codesign ordering:** placed AppIcon.icns copy between the plist heredoc and the `codesign --deep` block. Reversing this would leave the icon outside the signed payload and Gatekeeper would reject the bundle on first launch. Documented inline as a comment to prevent future re-ordering.
- **Hard-fail on missing master:** install.sh exits 1 if `brand/mac/AppIcon.icns` is absent, with a pointer to Plan 87-01. This makes the Plan 87-01 → 87-03 dependency explicit at runtime rather than producing a silently icon-less bundle.
- **Doctor failure contributes to DRIFT_COUNT:** rather than a soft warning, the icon check increments `DRIFT_COUNT` so a missing icon causes `dailybrief-doctor.sh` to exit non-zero — surfaces drift in any CI/cron usage.

## Deviations from Plan

None — plan executed exactly as written. Both auto tasks matched the specified diffs; the human-verify checkpoint received "approved" with both Finder icon display and Dock-less regression confirmed.

## Issues Encountered

None. Verification on the installed bundle returned:
- `PlistBuddy :CFBundleIconFile` → `AppIcon`
- `PlistBuddy :LSUIElement` → `true` (regression guard held)
- `codesign --verify` → valid on disk
- doctor → `✓ AppIcon.icns present (97990 bytes) and plist references AppIcon`

## User Setup Required

None — no external service configuration required. The .icns asset is committed in `brand/mac/` from Plan 87-01; future installs are self-contained.

## Verification Results (Task 3 — human-verify)

- **Finder icon (SC-4):** ✅ Vigil teal diamond+V displayed for `~/.local/bin/DailyBriefMonitor.app`
- **Dock-less behavior (SC-5 regression guard):** ✅ No Dock tile after launch; menu bar icon functional
- **Doctor check (D-10):** ✅ `✓ AppIcon.icns present` reported
- **User signal:** "approved"

## Next Phase Readiness

- SC-4, SC-5 closed at both script and human-verified levels — Mac branding track of Phase 87 complete
- Phase 87 ready for phase-level verification once all three plans are summarized
- No blockers; future Mac bundle changes need only preserve the copy-before-codesign ordering and the LSUIElement key

---
*Phase: 87-vigil-app-icons*
*Completed: 2026-04-15*
