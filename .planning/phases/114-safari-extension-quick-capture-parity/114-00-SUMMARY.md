---
phase: 114-safari-extension-quick-capture-parity
plan: 00
subsystem: testing
tags: [safari-extension, webextension, verify-script, human-uat, codesign, xcodebuild, lockstep-comments]

# Dependency graph
requires:
  - phase: 107-safari-extension-persistence
    provides: scripts/verify-phase-107.sh shape (MODE dispatcher, red/green/info, FAIL accumulator) — lifted as canonical reference for verify-phase-114.sh
  - phase: 113-verify-email-on-signup
    provides: 113-HUMAN-UAT.md lab-notebook structure (frontmatter, SC sections, Steps/Assertions/Observed/Result) — mirrored verbatim with 114-specific fields
provides:
  - Wave 0 verification harness (scripts/verify-phase-114.sh) covering SC#1-SC#4 static + SC#5 runtime
  - HUMAN-UAT scaffold for SC#3 probe attestation + SC#5 Safari restart smoke
  - D-02 lockstep header comments on all 3 Chrome popup files (Safari side mirrored in Plans 02/03)
affects:
  - 114-01 (probe plan reads negative grep on [probe] string + populates SC#3 row in HUMAN-UAT.md)
  - 114-02 (HTML/CSS edits — script's SC#2/SC#4 grep checks are the contract)
  - 114-03 (JS edits — script's SC#1/SC#2/SC#3/SC#4 grep checks are the contract; mirrors D-02 header from Chrome side)
  - 114-04 (Plan 04 final rebuild — script's --runtime mode is the gate, codesign --verify --deep --strict per D-15)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-mode verify script: --static (grep) / --runtime (xcodebuild + codesign) / --full (both)"
    - "D-02 cross-tree lockstep header: human-readable comment in all 6 popup files reminds future edits to mirror"
    - "Negative grep guards as part of static checks: e.g. [probe] string MUST NOT appear after Plan 01 closes"
    - "ship-with-uat-pending HUMAN-UAT.md frontmatter status (Phase 107/113 carryforward) — phase ships at code level; UAT row gates final close"

key-files:
  created:
    - scripts/verify-phase-114.sh (executable, 260 lines)
    - .planning/phases/114-safari-extension-quick-capture-parity/114-HUMAN-UAT.md (155 lines, 31 checkboxes)
  modified:
    - vigil-extension/popup.html (+1 line — D-02 comment at line 2 after DOCTYPE)
    - vigil-extension/popup.js (+1 line — D-02 comment at line 2 after 'use strict';)
    - vigil-extension/popup.css (+1 line — D-02 comment at line 1)

key-decisions:
  - "verify-phase-114.sh uses codesign --verify --deep --strict (D-15), NOT spctl --assess (negative grep enforces)"
  - "verify-phase-114.sh uses xcodebuild clean build, NOT just xcodebuild build (D-16) — eliminates Resources/* staleness bugs"
  - "popup.html D-02 comment goes at line 2 (after DOCTYPE) per Pitfall 6 — comment-before-DOCTYPE downgrades to quirks mode"
  - "114-HUMAN-UAT.md frontmatter uses rebuild_sha/rebuild_time fields (replacing 113's deploy/deploy_time) since this is a local extension rebuild, not a Railway deploy"

patterns-established:
  - "Pre-implementation verify script that exits 1: --static fails on Wave 0 (intentional) and turns green incrementally as Plans 02/03 land. Plan 04 final --full pass is the phase gate."
  - "D-02 lockstep header naming convention: '<comment-marker> Keep in lockstep with <relative-path-to-counterpart> — Phase NNN (D-02)' across .html (HTML comment), .js (// line comment), .css (/* block comment */)"

requirements-completed: [EXT-02]

# Metrics
duration: 4min
completed: 2026-04-26
---

# Phase 114 Plan 00: Wave 0 Scaffold Summary

**Three-mode verify script (scripts/verify-phase-114.sh) + 114-HUMAN-UAT.md scaffold + D-02 lockstep header comments on Chrome popup files — the cross-tree parity foundation Plans 01-04 mirror to.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-26T15:52:09Z
- **Completed:** 2026-04-26T15:55:56Z
- **Tasks:** 3 (all type=auto, all autonomous)
- **Files modified:** 5 (2 created + 3 Chrome popup files comment-only edits)

## Accomplishments

- `scripts/verify-phase-114.sh` (executable) — 260-line bash harness implementing `--static` (SC#1-SC#4 + D-02 grep), `--runtime` (xcodebuild clean build + codesign --verify --deep --strict on .app and .appex), and `--full` (both) modes; bash -n syntax clean; exits 1 today as intended (Plans 02/03 not yet landed).
- `.planning/phases/114-safari-extension-quick-capture-parity/114-HUMAN-UAT.md` — 155-line lab-notebook with `status: ship-with-uat-pending`, SC#3 probe-attestation section (filled by Plan 01), SC#5 Safari-restart smoke section (filled by Plan 04 close), 31 checkboxes across pre-flight/assertions/observed/sign-off; frontmatter uses `rebuild_sha`/`rebuild_time` for local-extension traceability.
- D-02 lockstep header comments inserted at exact line positions in all 3 Chrome popup files (line 2 after DOCTYPE for popup.html, line 2 after `'use strict';` for popup.js, line 1 for popup.css). Each file grew by exactly +1 line with no other modifications. Plans 02/03 will mirror with reversed `../../../` relative path.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create scripts/verify-phase-114.sh with --static / --runtime / --full modes** — `23c0aad` (feat)
2. **Task 2: Create 114-HUMAN-UAT.md scaffold for SC#3 probe attestation + SC#5 hardware UAT** — `814e21d` (docs)
3. **Task 3: Add D-02 lockstep header comments to all 3 Chrome popup files** — `9762ae3` (feat)

## Files Created/Modified

- `scripts/verify-phase-114.sh` (created, +260, chmod +x) — Three-mode verify harness; D-15 codesign + D-16 xcodebuild clean build; negative grep guards for spctl --assess and `[probe]`.
- `.planning/phases/114-safari-extension-quick-capture-parity/114-HUMAN-UAT.md` (created, +155) — ship-with-uat-pending lab notebook for SC#3 + SC#5.
- `vigil-extension/popup.html` (modified, +1) — D-02 comment at line 2.
- `vigil-extension/popup.js` (modified, +1) — D-02 comment at line 2.
- `vigil-extension/popup.css` (modified, +1) — D-02 comment at line 1.

## Pre-Implementation Verify Script State

Running `bash scripts/verify-phase-114.sh --static` today:

| Check | Status | Why |
|-------|--------|-----|
| SC#1 (popup.js empty-init + focus, no auto-prefill) | FAIL (expected) | Safari popup.js still has Phase 107-era URL/title prefill at lines 84-92; Plan 03 removes |
| SC#2 (id="include-url" checkbox + verbatim Chrome format) | FAIL (expected) | Safari popup.html missing checkbox; Plan 02 adds |
| SC#3 (e.metaKey \|\| e.ctrlKey + captureBtn.click()) | FAIL (expected) | Safari popup.js has no keydown handler; Plan 03 adds |
| SC#4 (setInterval / 5000ms / category-badge / .url-toggle / .shortcut-hint / .analyzing) | FAIL (expected) | Safari popup.css and popup.js missing triage poll loop + 4 CSS rules; Plans 02/03 add |
| D-02 (Chrome side: 3 files) | PASS | This plan landed comments at line 2 (html/js) and line 1 (css) |
| D-02 (Safari side: 3 files) | FAIL (expected) | Plans 02/03 mirror with reversed `../../../` path |

`--runtime` mode is unreachable until Plan 04's final rebuild (xcodebuild clean build + codesign verify on the .app and .appex). All 3 Chrome-side D-02 grep checks now turn green; the Safari-side 3 turn green during Plans 02/03.

## Decisions Made

None — plan executed exactly as written. The 4 patterns (verify modes, D-02 header shape, codesign-not-spctl, xcodebuild clean) were all locked in CONTEXT.md (D-15, D-16) before this plan ran; this plan was a mechanical scaffold against the spec.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- **Filesystem case-insensitivity surfaced:** the prompt and PLAN both reference `scripts/verify-phase-114.sh` (lowercase), but the repo's existing `Scripts/` directory uses capital S (12 of 13 sibling scripts under `Scripts/`). On macOS APFS the path resolves identically; git tracked it as `Scripts/verify-phase-114.sh` matching the existing dir convention. `bash scripts/verify-phase-114.sh --static` works correctly. No fix needed — same de-facto pattern Phase 107 verify script established.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Wave 1 (Plan 01: throwaway probe) can start immediately. The probe code lands in `vigil-safari-extension/Vigil Capture Extension/Resources/popup.js`; the negative grep `! grep -F '[probe]' popup.js` in `scripts/verify-phase-114.sh check_sc3_cmd_enter_handler` enforces the revert before the phase ships.
- Plan 01 SUMMARY.md will paste verbatim console output into `114-HUMAN-UAT.md` SC#3 "Observed" section.
- Plans 02/03 (HTML/CSS/JS edits) close the SC#1, SC#2, SC#3, SC#4 grep checks and add the 3 Safari-side D-02 lockstep comments mirroring Plan 00's Chrome side.
- Plan 04 final `xcodebuild clean build` + `codesign --verify --deep --strict` closes `--runtime`. Then HUMAN-UAT row stays open as `ship-with-uat-pending` until user reboots Safari + verifies live on physical Mac.

## Self-Check: PASSED

Verified files exist on disk:

- FOUND: scripts/verify-phase-114.sh (executable; bash -n clean; D-15 + D-16 grep-checkable; spctl --assess absent)
- FOUND: .planning/phases/114-safari-extension-quick-capture-parity/114-HUMAN-UAT.md (status: ship-with-uat-pending; SC#3 + SC#5 sections; 31 checkboxes; metaKey: true wording present; codesign --verify --deep --strict wording present)
- FOUND: vigil-extension/popup.html line 2 = D-02 comment; line 1 = `<!DOCTYPE html>` preserved
- FOUND: vigil-extension/popup.js line 2 = D-02 comment; line 1 = `'use strict';` preserved
- FOUND: vigil-extension/popup.css line 1 = D-02 comment; line 2 = `* {` preserved

Verified commits exist in git:

- FOUND: 23c0aad — feat(114-00): add verify-phase-114.sh harness for Wave 0
- FOUND: 814e21d — docs(114-00): scaffold 114-HUMAN-UAT.md for SC#3 + SC#5 hardware UAT
- FOUND: 9762ae3 — feat(114-00): add D-02 lockstep header comments to Chrome popup files

---
*Phase: 114-safari-extension-quick-capture-parity*
*Completed: 2026-04-26*
