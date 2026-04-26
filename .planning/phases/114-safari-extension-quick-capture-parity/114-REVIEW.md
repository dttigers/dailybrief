---
phase: 114-safari-extension-quick-capture-parity
reviewed: 2026-04-25T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - scripts/verify-phase-114.sh
  - vigil-extension/popup.html
  - vigil-extension/popup.js
  - vigil-extension/popup.css
  - vigil-safari-extension/Vigil Capture Extension/Resources/popup.html
  - vigil-safari-extension/Vigil Capture Extension/Resources/popup.js
  - vigil-safari-extension/Vigil Capture Extension/Resources/popup.css
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 114: Code Review Report

**Reviewed:** 2026-04-25
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 114 is a verbatim line-for-line port of the Chrome quick-capture popup (Phase 94) to the Safari WebExtension. The port itself is high quality:

- **Lockstep parity confirmed:** `diff` between Chrome and Safari `popup.{html,js,css}` shows the only difference is the D-02 lockstep header path direction. Every other byte matches.
- **All four negative gates honored:**
  - D-05: No `getModifierState` reference anywhere in either popup.js
  - D-14: No `browser.*` namespace migration; `chrome.*` preserved as required
  - D-15: `verify-phase-114.sh` uses `codesign --verify --deep --strict` (no `spctl --assess`)
  - D-16: Build invocation is `xcodebuild clean build` (line 175), not bare `build`
- **D-02 lockstep header comments** present in all 6 popup files (Chrome + Safari), with reciprocal paths.
- **Server contract for SC#4 triage badge** is enum-bounded server-side per RESEARCH.md, so the `innerHTML` interpolation of `category` at popup.js:172 is safe (out-of-scope per phase context).
- **No injection risk in the URL append path:** `tab.title` / `tab.url` flow only into `JSON.stringify` for the POST body (popup.js:113→130), never into `innerHTML`.

The only non-trivial finding is in `verify-phase-114.sh`: the `find ... | head -1` strategy for locating the freshly built `.app` can pick a stale build under DerivedData if multiple builds exist. Three minor info items round out the review (weak grep cadence check, regex consistency, and a pre-existing verbatim-Chrome listener-accumulation pattern on the settings round-trip flow that is explicitly out of scope per D-11).

No critical issues. Phase ships clean once the warning below is resolved or accepted.

## Warnings

### WR-01: verify-phase-114.sh picks a potentially stale `.app` from DerivedData

**File:** `scripts/verify-phase-114.sh:193`
**Issue:** The `find ... -name 'Vigil Capture.app' -type d ... | head -1` strategy returns the first match in unspecified traversal order — not necessarily the `.app` produced by the `xcodebuild clean build` that just ran in `check_sc5_xcodebuild` (line 175). If a stale Debug build, an old archive, or a parallel scheme variant (e.g., a leftover from a previous Xcode version's DerivedData layout) exists under `~/Library/Developer/Xcode/DerivedData`, `head -1` may pick that one.

This means SC#5b can pass `codesign --verify --deep --strict` against a stale `.app` even if the just-rebuilt `.app` has a signing problem. False-positive verification is the worst class of verify-script bug — it makes the gate a no-op without any visible failure.

The risk is low in practice (a fresh `xcodebuild clean build` updates the canonical Build/Products/Debug path), but the script does not make that ordering guarantee explicit.

**Fix:** Sort by modification time so the freshest build wins, and cross-check the `Info.plist` bundle ID to confirm we have the right product:

```bash
app_path="$(find "$HOME/Library/Developer/Xcode/DerivedData" -maxdepth 6 -name 'Vigil Capture.app' -type d -print0 2>/dev/null \
  | xargs -0 stat -f '%m %N' 2>/dev/null \
  | sort -rn \
  | head -1 \
  | cut -d' ' -f2-)"

if [[ -z "$app_path" ]]; then
  red "  FAIL — no built 'Vigil Capture.app' found under DerivedData; run --runtime after Check SC#5a"
  FAIL=1
  return
fi

# Sanity: confirm bundle ID matches the project (defends against picking a stale unrelated build)
local bundle_id
bundle_id="$(plutil -extract CFBundleIdentifier raw "$app_path/Contents/Info.plist" 2>/dev/null || echo '')"
if [[ "$bundle_id" != "io.vigilhub.extension" ]]; then
  red "  FAIL — picked .app has unexpected bundle ID: '$bundle_id' (expected io.vigilhub.extension)"
  FAIL=1
  return
fi
```

Alternative (simpler, no `stat` parsing): use `xcodebuild -showBuildSettings` to read `BUILT_PRODUCTS_DIR` directly from the project rather than searching DerivedData. That is the canonical way to locate the just-built artifact and side-steps the staleness problem entirely.

## Info

### IN-01: Weak grep check for 800ms poll cadence

**File:** `scripts/verify-phase-114.sh:110`
**Issue:** `grep -qF "800"` matches the literal string `800` anywhere in popup.js. It would match a comment like `// previously 8000ms`, an unrelated `8001`, a phone number, etc. The intent is to verify the `setInterval(..., 800);` cadence (popup.js:177).
**Fix:** Tighten the regex to anchor to the actual call site:
```bash
if ! grep -qE "}, 800\);" "$SAFARI_JS"; then
  red "  FAIL — popup.js missing 800ms poll cadence: }, 800);"
  FAIL=1
  return
fi
```

### IN-02: Inconsistent grep flags — `-qE` used for non-regex patterns

**File:** `scripts/verify-phase-114.sh:33,44,78,105`
**Issue:** Several checks use `grep -qE` (extended regex) for patterns that contain no regex metacharacters (e.g., line 33: `"contentInput\.value = '';"` — only the dot is a metachar, and even there it's escaped). This works but is inconsistent: line 38 and 60 use `-qF` (fixed string) for similar checks. Mixing flags makes it harder to scan the script for "what kind of match is this."
**Fix:** Standardize: use `-qF` when the pattern is a literal string, `-qE` only when alternation, anchors, or character classes are actually needed. For example, line 33 could become:
```bash
if ! grep -qF "contentInput.value = '';" "$SAFARI_JS"; then
```
Cosmetic only — no functional bug.

### IN-03: Multi-attach risk on `keydown` listener if user re-enters settings flow

**File:** `vigil-safari-extension/Vigil Capture Extension/Resources/popup.js:92` (and Chrome `vigil-extension/popup.js:92` — verbatim parity)
**Issue:** `initCaptureView` is called both on `DOMContentLoaded` (line 203) and after `saveKeyBtn` click (line 70). Each call attaches a new `contentInput.addEventListener('keydown', ...)` handler. If the user opens settings (`settingsBtn` click → `showView(setupView)` at line 192), pastes a new key, and saves, `initCaptureView` runs a second time on the same DOM context, registering a second keydown handler. ⌘+Enter then calls `captureBtn.click()` twice. Because the click handler at line 99 short-circuits on `captureBtn.disabled`, the second invocation is a no-op while the first POST is in flight — but it is still a code smell and a real edge case.

**This is intentional verbatim Chrome parity** (D-11) and is identical in `vigil-extension/popup.js` from Phase 94. Flagging as informational only because it exists in both branches and "verbatim Chrome match was an explicit user decision" per phase context. Mentioning here so the next person to touch the lockstep pair is aware of the latent issue and can fix it in both places at once if/when the settings-roundtrip UX is revisited.

**Fix (deferred):** When/if Phase 94's quick-capture is refactored, attach the keydown handler outside `initCaptureView` (at module top-level after DOM refs resolve), or use a tracked listener reference and `removeEventListener` before re-attach. Not in scope for Phase 114.

---

_Reviewed: 2026-04-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
