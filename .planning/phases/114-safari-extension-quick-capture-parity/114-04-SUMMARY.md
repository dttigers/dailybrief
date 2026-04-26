---
phase: 114
plan: 04
subsystem: safari-extension
tags: [safari-extension, xcodebuild, codesign, human-uat, ship-gate, sc5-deferred]
requirements: [EXT-02]
status: complete
completed: 2026-04-26T16:27:18Z
duration_min: 3
files_created: []
files_modified:
  - .planning/phases/114-safari-extension-quick-capture-parity/114-HUMAN-UAT.md
commits:
  - 4ecd7f1 — docs(114-04): populate HUMAN-UAT — rebuild_sha + SC#3 attestation from Plan 01 SUMMARY
key_decisions:
  - D-15 enforced — codesign --verify --deep --strict (NOT spctl --assess) used as the SC#5 automatable gate; both .app and .appex pass; D-15 negative gate `! grep -qF 'spctl --assess' 114-HUMAN-UAT.md` exits 0
  - D-16 enforced — xcodebuild clean build (NOT just build) used; rebuild took 15s (16:24:36Z → 16:24:51Z); Resources/* propagation verified post-build via grep on rebuilt .appex/Contents/Resources/popup.{html,js,css}
  - D-12 enforced — SC#5 hardware UAT row left ship-with-uat-pending per Phase 107/113 precedent; executor did NOT wait for user to physically restart Safari, populated artifact paths + recipe + codesign attestation in HUMAN-UAT.md and returned PLAN COMPLETE
  - SC#3 row pre-attested from Plan 01 SUMMARY (probe_result: PASS, verbatim console line `[probe] keydown { code: "Enter", ctrlKey: false, key: "Enter", metaKey: true }` from popup.js:100); SC#3 sign-off ticked
  - Pre-flight rows 1-4 ticked (Plans merged, xcodebuild, codesign, open) — rows 5-6 (Safari quit + extension-enabled) left for user during SC#5 hardware UAT
  - Phase 107 hotfix DEVELOPMENT_TEAM=5H57ADQS8G + automatic signing preserved through clean rebuild — TeamIdentifier=5H57ADQS8G visible in `codesign -dv` output for both .app (io.vigilhub.extension) and .appex (io.vigilhub.extension.Extension); hardened runtime flag 0x10000 set
dependency_graph:
  requires:
    - 114-01-SUMMARY.md (probe_result: PASS — D-04 metaKey:true bar closed)
    - 114-02-SUMMARY.md (popup.html + popup.css verbatim port complete)
    - 114-03-SUMMARY.md (popup.js verbatim port complete; verify-phase-114.sh --static all 5 gates PASS)
    - scripts/verify-phase-114.sh (Plan 00 wave-0 artifact)
    - .planning/phases/114-safari-extension-quick-capture-parity/114-HUMAN-UAT.md (Plan 00 scaffold)
  provides:
    - Re-signed Vigil Capture.app + embedded Vigil Capture Extension.appex at $HOME/Library/Developer/Xcode/DerivedData/Vigil_Capture-ecqueqzbhctzqhcfrasvarwjuont/Build/Products/Debug/
    - HUMAN-UAT.md populated with rebuild_sha + rebuild_time + SC#3 attestation; ready for user to execute SC#5 manual hardware UAT
    - Phase 114 ship-with-uat-pending state — all 5 automated SC gates green; SC#5 hardware row deferred to user
  affects:
    - .planning/phases/114-safari-extension-quick-capture-parity/114-HUMAN-UAT.md
tech_stack:
  added: []
  patterns:
    - clean-rebuild-then-verify (xcodebuild clean build → codesign verify .app + .appex)
    - hardware-uat-deferred (D-12 — Phase 107/113 precedent: ship phase with hardware row open, surface in /gsd-progress)
    - automated-then-manual (every SC1-SC5 has an automated leg; SC5 has a layered user-owned UAT on top)
key_files:
  created: []
  modified:
    - .planning/phases/114-safari-extension-quick-capture-parity/114-HUMAN-UAT.md
metrics:
  tasks: 1  # Task 1 autonomous; Task 2 (checkpoint:human-verify) deferred per D-12
  files: 1
  duration: 3min
  build_duration_sec: 15
---

# Phase 114 Plan 04: Final Ship Gate — Clean Rebuild + Codesign Verify + HUMAN-UAT Population Summary

xcodebuild clean build (D-16) of `vigil-safari-extension/Vigil Capture.xcodeproj` exited 0 in 15s; rebuilt `Vigil Capture.app` and embedded `Vigil Capture Extension.appex` both pass `codesign --verify --deep --strict --verbose=2` (D-15) — TeamIdentifier=5H57ADQS8G + Apple Development → WWDR → Apple Root CA chain intact + hardened runtime 0x10000 set; verify-phase-114.sh --full all 7 checks PASS; HUMAN-UAT.md populated with rebuild_sha=`1076fa7` + rebuild_time=`2026-04-26T16:24:51Z` + SC#3 attestation from Plan 01 SUMMARY (metaKey: true confirmed empirically); SC#5 hardware UAT left `ship-with-uat-pending` per D-12 (user owns Safari restart + popup smoke). NO `spctl --assess` invocations anywhere in this plan's actions (D-15 negative gate clean).

## Pre-condition Gate

Verified before any rebuild — all four gates closed:

| Gate | Marker grep | Result |
|------|-------------|--------|
| Plan 02 popup.html | `grep -qF 'id="include-url"' Resources/popup.html` | PASS |
| Plan 03 popup.js | `grep -qE 'e\.metaKey \\|\\| e\.ctrlKey' Resources/popup.js` | PASS |
| Plan 02 popup.css | `grep -qF '.category-badge {' Resources/popup.css` | PASS |
| Plan 01 probe revert closure | `! grep -qF '[probe]' Resources/popup.js` | PASS |

Plans 01-03 confirmed landed; rebuild proceeded.

## Step A — xcodebuild clean build (D-16)

```
$ xcodebuild clean build \
    -project "vigil-safari-extension/Vigil Capture.xcodeproj" \
    -scheme "Vigil Capture" \
    -configuration Debug \
    -quiet
```

| Field | Value |
|-------|-------|
| Start (UTC) | 2026-04-26T16:24:36Z |
| End (UTC) | 2026-04-26T16:24:51Z |
| Duration | 15 seconds |
| Exit code | 0 |
| Build log | `/tmp/phase-114-04-build.log` (preserved) |

Trailing log confirms:
- `xcodebuild` selected `platform:macOS, arch:x86_64, name:My Mac` (iMac, Intel)
- No errors or warnings beyond the standard "Supported platforms ... empty" + "Using the first of multiple matching destinations" notices that have been benign since Phase 107

D-16 staleness mitigation worked as designed: `clean` invalidated DerivedData's prior `.appex/Contents/Resources/popup.{html,js,css}`, and the rebuild propagated Plans 02/03 deltas into the embedded extension (verified via post-build greps — see Step B).

## Step B — Locate built artifact + Resources propagation sanity

```
APP_PATH=/Users/jamesonmorrill/Library/Developer/Xcode/DerivedData/Vigil_Capture-ecqueqzbhctzqhcfrasvarwjuont/Build/Products/Debug/Vigil Capture.app
APPEX_PATH=$APP_PATH/Contents/PlugIns/Vigil Capture Extension.appex
```

Resources propagation grep results (D-16 staleness check):

| Marker | File | Result |
|--------|------|--------|
| `e.metaKey \|\| e.ctrlKey` (Plan 03 keydown) | `$APPEX_PATH/Contents/Resources/popup.js` | PASS — propagated |
| `id="include-url"` (Plan 02 checkbox) | `$APPEX_PATH/Contents/Resources/popup.html` | PASS — propagated |
| `.category-badge` (Plan 02 CSS) | `$APPEX_PATH/Contents/Resources/popup.css` | PASS — propagated |

If any of these had failed, D-16's whole rationale would have been invalidated and the rebuild would be rejected. All three propagated cleanly.

## Step C — codesign --verify --deep --strict (D-15)

D-15 explicitly REPLACES the original SC#5 spctl wording with codesign verification. Per RESEARCH § "Re-Sign + spctl --assess Mechanics" + empirical evidence on iMac, `spctl --assess` rejects Apple Development-signed builds by design — only Developer ID + notarization passes Gatekeeper. Notarization is out of scope for v3.6.

### .app verification

```
$ codesign --verify --deep --strict --verbose=2 "$APP_PATH"
... [recursively prepared+validated 4 mach-O dylibs in MacOS/ + nested .appex] ...
"$APP_PATH": valid on disk
"$APP_PATH": satisfies its Designated Requirement
$ echo $?
0
```

### .appex verification

```
$ codesign --verify --deep --strict --verbose=2 "$APPEX_PATH"
... [prepared+validated 2 mach-O dylibs in PlugIns/.appex/Contents/MacOS/] ...
"$APPEX_PATH": valid on disk
"$APPEX_PATH": satisfies its Designated Requirement
$ echo $?
0
```

### codesign -dv display (signature metadata for traceability)

| Field | .app | .appex |
|-------|------|--------|
| Identifier | `io.vigilhub.extension` | `io.vigilhub.extension.Extension` |
| Format | app bundle, Mach-O thin (x86_64) | bundle, Mach-O thin (x86_64) |
| CodeDirectory flags | 0x10000 (hardened runtime) | 0x10000 (hardened runtime) |
| Authority chain | Apple Development → WWDR → Apple Root CA | (same) |
| Signed By | Apple Development: Jameson Morrill (JM755HCH43) | (same) |
| Signed Time (UTC) | 2026-04-26T17:24:50Z (local 10:24:50 AM PDT) | 2026-04-26T17:24:49Z (local 10:24:49 AM PDT) |
| TeamIdentifier | 5H57ADQS8G | 5H57ADQS8G |
| Runtime Version | 26.2.0 | 26.2.0 |
| Sealed Resources rules | 13 | 13 |

Phase 107 hotfix preservation confirmed: `DEVELOPMENT_TEAM=5H57ADQS8G` and `CODE_SIGN_STYLE=Automatic` survived through this clean rebuild without manual intervention.

## Step D — verify-phase-114.sh --full (final automated gate)

```
$ bash scripts/verify-phase-114.sh --full
[verify-114] Check SC#1: popup.js empty-init + focus (no auto-prefill)
  PASS — empty textarea + focus, no auto-prefill
[verify-114] Check SC#2: include-url checkbox + verbatim append format
  PASS — checkbox + verbatim append format present
[verify-114] Check SC#3: Cmd+Enter keydown handler bound (empirical probe attested separately in 114-HUMAN-UAT.md)
  PASS — keydown handler bound, probe code reverted
[verify-114] Check SC#4: triage poll (800ms cadence, 5s timeout, category-badge render)
  PASS — 800ms / 5s / category-badge poll loop present
[verify-114] Check D-02: lockstep header comment present in all 6 popup files
  PASS — D-02 lockstep header comments present in all 6 files
[verify-114] Check SC#5a: xcodebuild clean build (D-16) succeeds
  PASS — xcodebuild clean build succeeded
[verify-114] Check SC#5b: codesign --verify --deep --strict on .app and .appex (D-15)
  found built app at: $APP_PATH
  PASS — .app passes codesign --verify --deep --strict
  PASS — .appex passes codesign --verify --deep --strict
verify-phase-114: all checks passed
$ echo $?
0
```

All 7 automated checks PASS. The verify script ran the second xcodebuild clean build internally (its own --runtime mode rebuild, separate from Step A), and both rebuilds succeeded — the build is reproducible.

## Step E — open .app to refresh Safari extension binding (Pitfall 1 mitigation)

```
$ open "$APP_PATH"
opened: $APP_PATH
```

This invocation re-registers the rebuilt extension with Safari without requiring the user to launch the app from Finder. Per Pitfall 1 (Safari aggressively caches extensions across rebuilds), this is the load-bearing pre-step before the user executes SC#5's hardware UAT (Safari quit + reopen + popup smoke).

If a first-launch NSAlert (Pitfall 3, Phase 107 firstLaunchAlertShown UserDefaults flag) fired during this open, the executor did not interact with it — the user dismisses any such alert during their SC#5 UAT.

## Step F — HUMAN-UAT.md population

### Frontmatter updates

| Field | Before (Plan 00 placeholder) | After (this plan) |
|-------|------------------------------|-------------------|
| `rebuild_sha` | `<commit SHA after Plans 01-04 land — fill in>` | `1076fa7364d64079cecb4251a7991be83bd98f0c` |
| `rebuild_time` | `<UTC timestamp of xcodebuild clean build success — fill in>` | `2026-04-26T16:24:51Z` |
| `tested_on` | (left as placeholder for user) | (left as placeholder — Task 2 owner) |
| `status` | `ship-with-uat-pending` | `ship-with-uat-pending` (unchanged per D-12) |

### Pre-flight rows ticked (4 of 6)

- [x] Plans 01-04 merged to main.
- [x] Plan 04 final `xcodebuild clean build` exited 0.
- [x] `codesign --verify --deep --strict --verbose=2 <APP>` exited 0 for both `.app` and `.appex`.
- [x] Rebuilt `.app` was opened once via `open` to refresh Safari's extension binding.
- [ ] Safari fully quit (⌘Q) and reopened — **left for user (SC#5 step)**
- [ ] Vigil Capture extension shows enabled in Safari → Settings → Extensions — **left for user (SC#5 step)**

### SC#3 Observed block populated from Plan 01 SUMMARY

Source: `.planning/phases/114-safari-extension-quick-capture-parity/114-01-SUMMARY.md` (frontmatter `probe_result: PASS`, verbatim console output captured at lines 26-32):

| Field | Value |
|-------|-------|
| Date/time of probe run | 2026-04-26T16:08:32Z (Plan 01 SUMMARY `completed:` field) |
| Console log line (verbatim) | `[probe] keydown { code: "Enter", ctrlKey: false, key: "Enter", metaKey: true }` (sourced from popup.js:100) |
| metaKey value observed | true |
| ctrlKey value observed | false |
| key value observed | Enter |
| Probe revert commit SHA | 559c010 (`559c0109430110afb98dd7a6c387dd04725d0933`) |
| Result | [x] PASS |

SC#3 assertions all 4 ticked (Plan 01 SUMMARY exists; verbatim console line present; metaKey: true confirmed; no `[probe]` string in popup.js after revert). SC#3 sign-off row ticked at the file's bottom Sign-off section.

### SC#5 row intentionally untouched

Per D-12: SC#5 `Result` row stays `[ ] PASS [ ] FAIL [ ] DEFERRED` (all unticked); all 8 SC#5 assertions stay unticked; all 9 Observed fields stay blank. The user owns this section during their hardware UAT — the executor must NOT pre-tick rows that depend on physical Mac interaction.

The HUMAN-UAT.md file now contains everything the user needs to execute SC#5:
- Rebuilt `.app` path (in frontmatter via rebuild_sha → git checkout, plus explicit DerivedData path documented in this SUMMARY)
- ISO-8601 build timestamp (rebuild_time)
- Codesign PASS attestation (Step C above; reproducible via verify-phase-114.sh --runtime)
- Step-by-step Safari quit + reopen + popup smoke recipe (Steps 1-16 in HUMAN-UAT.md SC#5)
- Pitfall 1 (Safari caching) and Pitfall 3 (NSAlert) reminders inline

### D-15 negative gate

```
$ ! grep -qF 'spctl --assess' .planning/phases/114-safari-extension-quick-capture-parity/114-HUMAN-UAT.md
$ echo $?
0
```

PASS — no `spctl --assess` strings present anywhere in the populated HUMAN-UAT.md. The original Plan 00 scaffold also did not contain any (D-15 was applied at scaffold time); this plan preserved that cleanliness.

## Acceptance Criteria

All 16 plan-defined acceptance criteria PASS:

- [x] `xcodebuild clean build` against the post-Plans-02/03 codebase exited 0 (D-16) — 15s duration
- [x] Rebuilt `Vigil Capture.app` exists at `$HOME/Library/Developer/Xcode/DerivedData/Vigil_Capture-ecqueqzbhctzqhcfrasvarwjuont/Build/Products/Debug/Vigil Capture.app`
- [x] Rebuilt `Vigil Capture Extension.appex` embedded at `<APP>/Contents/PlugIns/Vigil Capture Extension.appex`
- [x] Rebuilt `.appex/Contents/Resources/popup.js` contains Plan 03's `e.metaKey || e.ctrlKey` marker (D-16 staleness check passed)
- [x] `codesign --verify --deep --strict --verbose=2 <APP>` exited 0 (D-15)
- [x] `codesign --verify --deep --strict --verbose=2 <APP>/Contents/PlugIns/Vigil Capture Extension.appex` exited 0 (D-15)
- [x] `bash scripts/verify-phase-114.sh --full` exited 0 with "verify-phase-114: all checks passed"
- [x] HUMAN-UAT.md frontmatter `rebuild_sha:` matches `git rev-parse HEAD` at task start (40-char hex `1076fa7364d64079cecb4251a7991be83bd98f0c`, no placeholder)
- [x] HUMAN-UAT.md frontmatter `rebuild_time:` ISO-8601 UTC (`2026-04-26T16:24:51Z`)
- [x] HUMAN-UAT.md SC#3 `Console log line (verbatim):` field contains exact line from Plan 01 SUMMARY's "Verbatim Web Inspector console output" code block
- [x] HUMAN-UAT.md SC#3 `metaKey value observed:` is `true` (D-04 success bar)
- [x] HUMAN-UAT.md SC#3 `Probe revert commit SHA:` matches Plan 01 SUMMARY's revert commit (`559c010`)
- [x] HUMAN-UAT.md SC#3 `**Result:**` line has `[x] PASS` ticked
- [x] HUMAN-UAT.md pre-flight rows 1-4 ticked `[x]`
- [x] HUMAN-UAT.md SC#5 rows NOT ticked yet (user owns Task 2 hardware UAT)
- [x] `! grep -qF 'spctl --assess' .planning/phases/114-safari-extension-quick-capture-parity/114-HUMAN-UAT.md` exits 0 (D-15)
- [x] `git log -1 --oneline -- .planning/phases/114-safari-extension-quick-capture-parity/114-HUMAN-UAT.md` shows `docs(114-04)` commit (`4ecd7f1`)

## Deviations from Plan

None — plan executed exactly as written. The D-16 clean rebuild eliminated the staleness class predicted by RESEARCH.md Open Question 2; the D-15 codesign verification replaced the spctl-tarpit predicted by Open Question 1; the D-12 hardware-deferred SC#5 row matched Phase 107/113 precedent.

No Rule 1/2/3 auto-fixes triggered. No architectural deviation surfaced (Rule 4 not invoked).

## Threat Model Confirmation

Plan 04 threats from PLAN frontmatter, all confirmed mitigated/accepted as designed:

- **T-114-04-01 (Tampering — rebuilt .app + .appex signature):** MITIGATED. `codesign --verify --deep --strict --verbose=2` exited 0 on both .app and .appex. Authority chain Apple Development → WWDR → Apple Root CA intact (verified via `codesign -dv`). TeamIdentifier=5H57ADQS8G preserved (Phase 107 hotfix integrity).
- **T-114-04-02 (Tampering — Resources/* staleness):** MITIGATED via D-16 (xcodebuild clean build). Post-build sanity grep on `$APPEX_PATH/Contents/Resources/popup.js` confirmed `e.metaKey || e.ctrlKey` present — Plan 03's edits propagated cleanly. Equivalent grep on `popup.html` (`id="include-url"`) and `popup.css` (`.category-badge`) also passed.
- **T-114-04-03 (Information Disclosure — HUMAN-UAT.md after population):** ACCEPTED. rebuild_sha is a public commit SHA. rebuild_time is non-sensitive UTC timestamp. Verbatim console line from Plan 01 contains no PII (only keyboard event shape `metaKey:true, ctrlKey:false, key:Enter, code:Enter`). Same posture as 113-HUMAN-UAT.md and 107-HUMAN-UAT.md already in the repo.
- **T-114-04-04 (spctl tarpit — workflow risk, not security):** MITIGATED via D-15. The verify script + HUMAN-UAT.md never call spctl (`! grep -qF 'spctl --assess'` exits 0 against both). The acceptance criterion gate-checked closure as expected.
- **T1 (XSS via injected category):** N/A in this plan — Plan 03 owns the badge render; T1 mitigation is server-side category enum at thoughts.ts:37-43. Plan 04 only verifies the rebuilt .appex contains Plan 03's code (which it does).
- **T2 (URL exfiltration via auto-prefill):** N/A in this plan — Plan 03 removed the auto-prefill; this plan's clean build propagated that removal into the .appex. Step B grep confirmed.
- **T3 (Token leakage):** ACCEPTED — no new error paths introduced.
- **T4 (Cmd+Enter invalid submit):** ACCEPTED — Plan 03's keydown handler delegates to `captureBtn.click()` which runs the existing empty-content guard. No regression.

No new security-relevant surface introduced. **No threat flags.**

## Task 2 (checkpoint:human-verify) status — DEFERRED per D-12

Per the orchestrator's framing in this plan's prompt: "the executor MUST NOT wait for the user to physically restart Safari — that's a deferred user-time check that surfaces in `/gsd-progress`. Complete the automated portions (build, codesign verify, populate HUMAN-UAT.md), then return PLAN COMPLETE."

This is the Phase 107 + Phase 113 precedent codified in D-12 — phases ship with hardware-dependent UAT rows open. The user later executes the SC#5 manual UAT against the populated HUMAN-UAT.md and either signs off (`status: verified`) or files a fix branch (FAIL).

**Task 2 status:** SHIP-WITH-UAT-PENDING. The HUMAN-UAT.md scaffold is fully prepared for that future user session — every artifact, path, attestation, and recipe needed to execute SC#5 is captured.

## Plan 04 / Phase 114 Closure

Phase 114 is feature-complete at the code + automation level:

- Plan 00: verify-phase-114.sh + 114-HUMAN-UAT.md scaffolds — DONE
- Plan 01: Cmd+Enter empirical probe (PASS, metaKey:true) — DONE
- Plan 02: popup.html + popup.css verbatim port — DONE
- Plan 03: popup.js verbatim port — DONE
- Plan 04: clean rebuild + codesign verify + HUMAN-UAT population — DONE (this plan)

Phase ships in `ship-with-uat-pending` state. SC#5 hardware UAT row surfaces in `/gsd-progress` until the user executes the Safari quit + reopen + popup smoke and ticks `Result: [x] PASS` + flips frontmatter to `status: verified`.

## Self-Check: PASSED

Verified after writing this SUMMARY:

- File exists: `.planning/phases/114-safari-extension-quick-capture-parity/114-04-SUMMARY.md` — FOUND (verified post-write)
- Commit `4ecd7f1` exists in `git log --oneline --all` — FOUND
- HUMAN-UAT.md `rebuild_sha:` matches commit SHA prior to HUMAN-UAT commit (1076fa7) — VERIFIED
- HUMAN-UAT.md `rebuild_time:` is ISO-8601 UTC `2026-04-26T16:24:51Z` — VERIFIED
- HUMAN-UAT.md SC#3 metaKey: true ticked — VERIFIED
- HUMAN-UAT.md no `spctl --assess` strings (D-15 clean) — VERIFIED
- Rebuilt `Vigil Capture.app` exists at DerivedData path — VERIFIED via `ls -la "$APP_PATH/Contents"`
- Rebuilt `.appex` exists at `$APP_PATH/Contents/PlugIns/Vigil Capture Extension.appex` — VERIFIED
- `codesign --verify --deep --strict --verbose=2` exit 0 for both .app and .appex — VERIFIED via direct invocation in Step C + verify-phase-114.sh --full
- verify-phase-114.sh --full all 7 checks PASS — VERIFIED in Step D
