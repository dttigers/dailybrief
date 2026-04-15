---
phase: 84-browser-extension
plan: 02
subsystem: ui
tags: [safari-web-extension, xcode, xcrun-converter, macos, vigil-api]

requires:
  - phase: 84-01
    provides: vigil-extension/ Chrome MV3 source that the converter wraps
provides:
  - Safari Web Extension Xcode project at vigil-safari-extension/
  - macOS app (Vigil Capture.app) that registers the extension with Safari
  - Verified capture flow in Safari matching Chrome behavior
affects: [cross-platform-clients, mac-native-onboarding]

tech-stack:
  added: [xcode-swift-host-app, safari-web-extension]
  patterns: [xcrun-safari-web-extension-converter-with-copy-resources, ad-hoc-codesigned-debug-build]

key-files:
  created:
    - vigil-safari-extension/Vigil Capture.xcodeproj/
    - vigil-safari-extension/Vigil Capture/ (host app)
    - vigil-safari-extension/Vigil Capture Extension/ (appex with copied web-extension resources)
  modified:
    - vigil-safari-extension/Vigil Capture.xcodeproj/project.pbxproj (bundle ID fix)

key-decisions:
  - "Used --copy-resources so the Xcode project owns its own copy of the web-extension files (no fragile cross-directory symlink)"
  - "Fixed converter's bundle ID mismatch: app was io.vigilhub.Vigil-Capture (name-sanitized), extension was io.vigilhub.extension.Extension — not prefix-aligned. Set app to io.vigilhub.extension so the embedded appex validates"
  - "Ad-hoc codesigned Debug build is sufficient for local testing; real distribution would require Developer ID signing"

patterns-established:
  - "Safari conversion: run converter with --copy-resources + --no-open + --force, then verify app/appex bundle IDs are prefix-aligned before building"

requirements-completed: []

duration: ~8min
completed: 2026-04-14
---

# Phase 84 / Plan 02: Safari Web Extension

**xcrun-converter-generated Safari Web Extension Xcode project that builds clean on macOS and captures to Vigil from Safari's toolbar.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-04-14
- **Tasks:** 2 (1 auto + 1 human checkpoint)

## Accomplishments
- Safari Web Extension Xcode project generated at `vigil-safari-extension/`
- Xcode Debug build succeeds with ad-hoc codesigning (no Developer Team required for local use)
- Verified capture flow works in Safari — both Chrome and Safari now satisfy Phase 84 success criterion

## Task Commits

1. **Task 1: converter + xcodebuild** — `75f3093` (feat)
2. **Task 2: human checkpoint** — verified manually in Safari, user approved

## Files Created/Modified
- `vigil-safari-extension/Vigil Capture.xcodeproj/` — Xcode project
- `vigil-safari-extension/Vigil Capture/` — Swift host app (shows setup instructions when launched)
- `vigil-safari-extension/Vigil Capture Extension/` — appex containing copied vigil-extension/ resources

## Decisions Made
- Kept bundle ID as `io.vigilhub.extension` (app) / `io.vigilhub.extension.Extension` (appex) — aligned for embedded-binary validation.

## Deviations from Plan
**Fixed: converter-assigned app bundle ID did not prefix extension bundle ID**
- **Found during:** Task 1 xcodebuild
- **Issue:** Converter assigned app bundle ID `io.vigilhub.Vigil-Capture` (sanitized from app name, ignoring --bundle-identifier) while the extension kept `io.vigilhub.extension.Extension`. Build failed with `Embedded binary's bundle identifier is not prefixed with the parent app's bundle identifier.`
- **Fix:** `sed -i '' 's|io.vigilhub.Vigil-Capture|io.vigilhub.extension|g'` on `project.pbxproj`
- **Verification:** Next xcodebuild invocation reported BUILD SUCCEEDED
- **Committed in:** `75f3093`

**Plan-vs-reality adjustments:**
- Plan specified `--bundle-identifier io.vigilhub.extension` but the converter silently generated a different app bundle ID anyway. Next time: pass `--project-location` and inspect generated `project.pbxproj` bundle IDs before first build.
- Unsigned build (`CODE_SIGNING_ALLOWED=NO`) failed at ValidateEmbeddedBinary; `-allowProvisioningUpdates` with ad-hoc signing is what actually works on this machine.

## Issues Encountered
None beyond the bundle ID mismatch.

## User Setup Required
For each Safari session (macOS security measure):
1. Launch `Vigil Capture.app` once so Safari registers the extension.
2. Safari → Develop menu → **Allow Unsigned Extensions** (resets on Safari quit).
3. Safari → Settings → Extensions → enable **Vigil Capture**.

## Next Phase Readiness
- Chrome + Safari both verified — Phase 84 success criterion met.
- Future work (not in this phase): iOS Safari (`--ios-only`), Developer ID distribution signing, Mac App Store packaging.

---
*Phase: 84-browser-extension*
*Completed: 2026-04-14*
