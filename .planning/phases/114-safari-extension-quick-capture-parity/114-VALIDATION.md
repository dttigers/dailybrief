---
phase: 114
slug: safari-extension-quick-capture-parity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 114 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Shell assertions (`grep`, `codesign`, `xcodebuild`) — Phase 107 pattern |
| **Config file** | None — Wave 0 (Plan 00) creates `scripts/verify-phase-114.sh` |
| **Quick run command** | `bash scripts/verify-phase-114.sh --static` |
| **Full suite command** | `bash scripts/verify-phase-114.sh` |
| **Estimated runtime** | ~5s static / ~30–60s full (xcodebuild clean build dominates) |

The Xcode project has no test target (`xcodebuild -list` shows no Vigil Capture Tests). Phase 107 took the same shell-assertions-only path; Phase 114 follows it.

---

## Sampling Rate

- **After every task commit:** Run `bash scripts/verify-phase-114.sh --static`
- **After every plan wave:** Run `bash scripts/verify-phase-114.sh`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds (xcodebuild clean build path)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 114-00-01 | 00 | 0 | EXT-02 | — | Wave 0 verify script created | infra | `test -x scripts/verify-phase-114.sh` | ❌ W0 | ⬜ pending |
| 114-01-01 | 01 | 1 | EXT-02 (SC#3) | — | Cmd+Enter `metaKey` truthy in WebKit popup keydown event | manual probe | Plan 01 SUMMARY.md captures observed event shape (metaKey/ctrlKey/key) verbatim from Web Inspector console | ❌ W0 | ⬜ pending |
| 114-01-02 | 01 | 1 | EXT-02 (SC#3) | — | Probe code reverted from popup.js | static (grep) | `! grep -F '[probe]' "vigil-safari-extension/Vigil Capture Extension/Resources/popup.js"` exits 0 | ❌ W0 | ⬜ pending |
| 114-02-01 | 02 | 2 | EXT-02 (SC#1) | — | popup.html has checkbox + shortcut hint + dynamic span | static (grep) | `grep 'id="include-url"' "vigil-safari-extension/Vigil Capture Extension/Resources/popup.html"` AND `grep 'shortcut-hint' "...popup.html"` AND `grep 'id="success-text"' "...popup.html"` | ❌ W0 | ⬜ pending |
| 114-02-02 | 02 | 2 | EXT-02 (SC#4) | — | popup.css has `.url-toggle`, `.category-badge`, `.shortcut-hint`, `.analyzing` rules | static (grep) | `grep -F '.url-toggle' "vigil-safari-extension/Vigil Capture Extension/Resources/popup.css"` AND `grep -F '.category-badge' "...popup.css"` AND `grep -F '.shortcut-hint' "...popup.css"` AND `grep -F '.analyzing' "...popup.css"` | ❌ W0 | ⬜ pending |
| 114-03-01 | 03 | 2 | EXT-02 (SC#1) | A2 (silent fallback if `tab.url` empty) | popup.js does NOT auto-prefill textarea with title/URL; focuses textarea | static (grep) | `! grep -E 'contentInput\.value\s*=\s*.\$\{' "...popup.js"` AND `grep -F 'contentInput.focus()' "...popup.js"` | ❌ W0 | ⬜ pending |
| 114-03-02 | 03 | 2 | EXT-02 (SC#2) | T1 (XSS via injected category — server enum-bounded `[VERIFIED]`) | URL append uses verbatim Chrome format on submit when checked | static (grep) | `grep -F 'document.getElementById("include-url")' "...popup.js"` AND `grep -E 'tab\.title\s*\\\|\\\|\s*.Page.' "...popup.js"` | ❌ W0 | ⬜ pending |
| 114-03-03 | 03 | 2 | EXT-02 (SC#3) | — | Cmd+Enter keydown handler bound; calls captureBtn.click() | static (grep) | `grep -E 'e\.metaKey\s*\\\|\\\|\s*e\.ctrlKey' "...popup.js"` AND `grep -F 'captureBtn.click()' "...popup.js"` | ❌ W0 | ⬜ pending |
| 114-03-04 | 03 | 2 | EXT-02 (SC#4) | — | Triage poll: 800ms setInterval, 5s timeout, GET `/v1/thoughts/:id`, render category-badge | static (grep) | `grep -F 'setInterval' "...popup.js"` AND `grep -F '800' "...popup.js"` AND `grep -E 'Date\.now\(\) - startTime > 5000' "...popup.js"` AND `grep -F 'category-badge' "...popup.js"` | ❌ W0 | ⬜ pending |
| 114-03-05 | 03 | 2 | EXT-02 | — | D-02 lockstep header comment present in all 6 popup files (3 Chrome + 3 Safari) | static (grep) | `grep -lF 'Keep in lockstep' "vigil-extension/popup.html" "vigil-extension/popup.js" "vigil-extension/popup.css" "vigil-safari-extension/Vigil Capture Extension/Resources/popup.html" "vigil-safari-extension/Vigil Capture Extension/Resources/popup.js" "vigil-safari-extension/Vigil Capture Extension/Resources/popup.css"` returns 6 paths | ❌ W0 | ⬜ pending |
| 114-04-01 | 04 | 3 | EXT-02 (SC#5) | — | xcodebuild clean build of Vigil Capture exits 0 | runtime | `xcodebuild clean build -project "vigil-safari-extension/Vigil Capture.xcodeproj" -scheme "Vigil Capture" -configuration Debug -quiet` exits 0 | ❌ W0 | ⬜ pending |
| 114-04-02 | 04 | 3 | EXT-02 (SC#5) | — | codesign --verify --deep --strict on rebuilt `.app` exits 0 (D-15) | runtime | `codesign --verify --deep --strict --verbose=2 <BUILT_APP_PATH>` exits 0 | ❌ W0 | ⬜ pending |
| 114-04-03 | 04 | 3 | EXT-02 (SC#5) | — | codesign --verify on embedded `.appex` exits 0 | runtime | `codesign --verify --deep --strict --verbose=2 <BUILT_APP_PATH>/Contents/PlugIns/Vigil\ Capture\ Extension.appex` exits 0 | ❌ W0 | ⬜ pending |
| 114-04-04 | 04 | 3 | EXT-02 (SC#5) | — | 114-HUMAN-UAT.md scaffolds Safari restart + popup smoke per Phase 107/113 precedent | static (file) | `test -f .planning/phases/114-safari-extension-quick-capture-parity/114-HUMAN-UAT.md` AND `grep -F 'SC#5' .../114-HUMAN-UAT.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/verify-phase-114.sh` — covers SC#1, SC#2, SC#3 (static handler grep), SC#4, SC#5 (xcodebuild + codesign verify)
- [ ] `.planning/phases/114-safari-extension-quick-capture-parity/114-HUMAN-UAT.md` — Phase 107/113-style hardware UAT for SC#3 probe outcome and SC#5 (Safari restart, popup smoke)
- [ ] No new test framework — shell + xcodebuild + codesign already on iMac

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cmd+Enter actually submits in Safari popup (probe) | EXT-02 (SC#3) | "Verified empirically before any implementation" is load-bearing in SC#3. Web Inspector shows `metaKey: true` on the keydown event — must be observed once on real WebKit, then frozen as a SUMMARY.md attestation in Plan 01. | (1) Apply Plan 01 probe (`console.log('[probe]', { metaKey, ctrlKey, key })` in keydown listener). (2) `xcodebuild clean build`. (3) Click toolbar icon to open popup. (4) Right-click inside popup → Inspect Element. (5) Press ⌘+Enter in textarea. (6) Read console: `metaKey: true` → pass. Paste line into Plan 01 SUMMARY.md. (7) Revert probe code in same plan. |
| Safari restart + popup still works | EXT-02 (SC#5) | Hardware-dependent — only physical Mac with installed `.app` can restart Safari and open the rebuilt extension. Phase 107/113 precedent: HUMAN-UAT.md row, ship phase with this row open, mark ✓ after user reboots. | See `114-HUMAN-UAT.md`: relaunch Safari, verify Vigil Capture toolbar icon present, click → popup opens, type "test", press ⌘+Enter, observe ✓ Captured + category badge. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (Plan 00 → script + HUMAN-UAT scaffold)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (every popup edit is grep-checkable)
- [ ] Wave 0 covers all MISSING references (verify script + HUMAN-UAT.md)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter (after Plan 00 lands)

**Approval:** pending
