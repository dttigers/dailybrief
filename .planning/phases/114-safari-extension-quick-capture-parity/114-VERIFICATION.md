---
phase: 114-safari-extension-quick-capture-parity
verified: 2026-04-25T00:00:00Z
status: human_needed
score: 4/5 must-haves verified (SC#5 hardware UAT row deferred per D-12)
overrides_applied: 0
human_verification:
  - test: "SC#5 — Safari restart on physical Mac hardware: rebuilt extension still works"
    expected: "After ⌘Q + reopen Safari, Vigil Capture extension still enabled; popup opens with empty textarea + focus; checkbox unchecked by default; Cmd+Enter hint visible; ⌘+Enter submits; success area renders Analyzing... → ✓ Captured! + category-badge within 5s; second test with Include-page-URL checked appends `\\n\\n${title}: ${url}` to thought body."
    why_human: "Requires physical Mac hardware (per D-12 ship-with-uat-pending precedent established by Phase 107). Static + runtime gates (xcodebuild clean build, codesign --verify --deep --strict on .app + .appex) are GREEN; only the live Safari-restart-on-hardware leg remains. Verified codesign exit 0 on both .app and .appex during this verification run."
---

# Phase 114: Safari Extension Quick-Capture Parity Verification Report

**Phase Goal:** The Safari extension popup offers the same quick-capture experience as the Chrome Phase 94 extension — freeform text, URL checkbox, Cmd+Enter, and triage feedback badge.

**Verified:** 2026-04-25
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| #   | Truth                                                                                                                                                                                                                                                                                  | Status                          | Evidence                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The Safari popup opens with an empty freeform textarea (no auto-prefill of tab title or URL) and focus is on the textarea                                                                                                                                                              | ✓ VERIFIED                      | popup.js:88 `contentInput.value = '';` + popup.js:89 `contentInput.focus();`. Negative grep on `contentInput.value = \`${title}` returns no matches — pre-Plan-03 prefill block fully removed. |
| 2   | The "Include page URL" checkbox appends the current tab's URL to the capture content when checked at submit time                                                                                                                                                                       | ✓ VERIFIED                      | popup.html:36 `<label class="url-toggle"><input type="checkbox" id="include-url"> Include page URL</label>` (no `checked` attr per D-07). popup.js:113 `finalContent += \`\n\n${tab.title || 'Page'}: ${tab.url}\`` verbatim D-06 format. |
| 3   | Cmd+Enter submits the capture without requiring a mouse click — verified empirically in Safari popup before any implementation code is written                                                                                                                                         | ✓ VERIFIED                      | popup.js:93 `if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); captureBtn.click(); }`. Empirical attestation in 114-01-SUMMARY.md frontmatter `probe_result: PASS` with verbatim Web Inspector console line `[probe] keydown { code: "Enter", ctrlKey: false, key: "Enter", metaKey: true }`. |
| 4   | After a successful capture, a triage feedback badge appears showing the AI-assigned category (polling up to 5 seconds); the static "Captured!" text is replaced with the dynamic badge                                                                                                | ✓ VERIFIED                      | popup.js:156 `setInterval(...)` + line 157 `Date.now() - startTime > 5000` + line 177 `}, 800)` + line 172 `successText.innerHTML = \`...Captured! <span class="category-badge">${cat}</span>\``. CSS rules at popup.css:161/176/186/193 (`.url-toggle`, `.category-badge`, `.shortcut-hint`, `.analyzing`). |
| 5   | The updated extension is re-signed via `xcodebuild` and `codesign --verify --deep --strict` passes on the rebuilt `.app`; the extension remains functional after Safari is restarted on physical Mac hardware (`spctl --assess` deferred — requires Developer ID + notarization)      | ⚠️ PARTIAL — automated PASS, hardware UAT pending | **Automated leg PASS:** Re-verified during this run — `codesign --verify --deep --strict` exit 0 on both `Vigil Capture.app` and embedded `Vigil Capture Extension.appex` at `~/Library/Developer/Xcode/DerivedData/Vigil_Capture-ecqueqzbhctzqhcfrasvarwjuont/Build/Products/Debug/`. `verify-phase-114.sh --full` exits 0 (all 7 checks PASS). Embedded popup.js carries Plan 03 marker. **Hardware UAT pending:** SC#5 row in 114-HUMAN-UAT.md left `ship-with-uat-pending` per D-12 (Phase 107/113 precedent). Routed to human_verification section below. |

**Score:** 4/5 truths fully verified; 1 truth (SC#5) automated portion verified, hardware portion routed to human verification per D-12.

### Required Artifacts

| Artifact                                                                                  | Expected                                                                              | Status     | Details                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vigil-safari-extension/Vigil Capture Extension/Resources/popup.html`                     | D-02 header line 2; checkbox `id="include-url"`; shortcut-hint div; `id="success-text"` span | ✓ VERIFIED | 47 lines (matches Chrome popup.html). DOCTYPE preserved at line 1 (Pitfall 6 mitigation). All 4 required markers present.                                                          |
| `vigil-safari-extension/Vigil Capture Extension/Resources/popup.js`                       | D-02 header line 2; empty-init; Cmd+Enter handler; URL append; triage poll loop       | ✓ VERIFIED | 205 lines (matches Chrome popup.js). Brace-balanced. No `[probe]`, no `PHASE 114 PROBE`, no `getModifierState`, no `browser.*`. 4 `chrome.*` occurrences (D-14 preserved).        |
| `vigil-safari-extension/Vigil Capture Extension/Resources/popup.css`                      | D-02 header line 1; 4 verbatim Chrome rule blocks                                     | ✓ VERIFIED | 196 lines (matches Chrome popup.css). `.url-toggle` (line 161), `.category-badge` (line 176), `.shortcut-hint` (line 186), `.analyzing` (line 193). Vigil teal `#1D9E75` preserved. |
| `vigil-extension/popup.html`, `popup.js`, `popup.css` (Chrome lockstep mirror)            | D-02 header in each                                                                   | ✓ VERIFIED | Each contains `Keep in lockstep with ../vigil-safari-extension/...` at line 1 (css) or line 2 (html/js).                                                                          |
| `scripts/verify-phase-114.sh`                                                             | --static / --runtime / --full mode dispatch; SC#1-SC#5 + D-02 checks                  | ✓ VERIFIED | Re-run during this verification: `--static` PASS (5 groups), `--full` PASS (7 checks). Contains `codesign --verify --deep --strict` and `xcodebuild clean build`; no `spctl --assess`. |
| `.planning/phases/114-safari-extension-quick-capture-parity/114-HUMAN-UAT.md`             | ship-with-uat-pending; SC#3 PASS attested; SC#5 awaiting hardware test                | ✓ VERIFIED | rebuild_sha=`1076fa7364d64079cecb4251a7991be83bd98f0c`, rebuild_time=`2026-04-26T16:24:51Z`, SC#3 Result=`[x] PASS`, SC#5 Result unticked.                                          |
| `.planning/phases/114-safari-extension-quick-capture-parity/114-01-SUMMARY.md`            | probe_result: PASS with verbatim console line                                         | ✓ VERIFIED | `probe_result: PASS` in frontmatter. Verbatim line `[probe] keydown { code: "Enter", ctrlKey: false, key: "Enter", metaKey: true }`. Probe-add `9f4f475` + revert `559c010` produce net-zero diff. |
| Rebuilt `Vigil Capture.app` + `Vigil Capture Extension.appex`                             | codesign verify exit 0; Apple Development cert chain; TeamIdentifier 5H57ADQS8G       | ✓ VERIFIED | Re-verified during this run — codesign exit 0 on both. Embedded `popup.js` propagated Plan 03 keydown handler.                                                                    |

### Key Link Verification

| From                                              | To                                                            | Via                                                                                       | Status     | Details                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| popup.js initCaptureView keydown handler          | popup.html textarea + captureBtn                              | `contentInput.addEventListener('keydown', ...)` → `captureBtn.click()`                    | ✓ WIRED    | popup.js:91-97 binds keydown to contentInput (DOM ref:8); calls captureBtn.click() (DOM ref:11) — both refs derive from popup.html `id="content-input"` and `id="capture-btn"`. |
| popup.js URL-append block                         | popup.html `<input id="include-url">`                         | `getElementById('include-url').checked`                                                   | ✓ WIRED    | popup.js:19 `includeUrlCheckbox = document.getElementById('include-url')`; popup.js:109 `if (includeUrlCheckbox.checked)`; popup.html:36 element present.                |
| popup.js triage poll innerHTML render             | popup.css `.category-badge` + `.analyzing`                    | `successText.innerHTML` interpolation with class names                                    | ✓ WIRED    | popup.js:151 `successText.innerHTML = '<span class="analyzing">Analyzing...</span>'`; popup.js:172 renders `<span class="category-badge">${cat}</span>`. CSS rules present at popup.css:176/193. |
| popup.js GET /v1/thoughts/:id                     | vigil-core thoughts.ts auto-triage                            | fetch with Bearer apiKey, poll every 800ms                                                | ✓ WIRED    | popup.js:164 `fetch(\`${API_BASE}/v1/thoughts/${thought.id}\`, { headers: { 'Authorization': \`Bearer ${apiKey}\` } })`; clearInterval on terminal state.                       |
| Chrome popup.{html,js,css}                        | Safari popup.{html,js,css}                                    | D-02 lockstep header comments                                                             | ✓ WIRED    | All 6 popup files contain `Keep in lockstep with` header at line 1 (css) or line 2 (html/js); Chrome→Safari path is `../vigil-safari-extension/...`, Safari→Chrome path is `../../../vigil-extension/...`. |
| scripts/verify-phase-114.sh                       | popup.{html,js,css} markers + xcodebuild + codesign           | grep static checks + runtime build + sign verify                                          | ✓ WIRED    | `--full` exits 0 with all 7 checks PASS during this verification run.                                                                                 |

### Data-Flow Trace (Level 4)

| Artifact   | Data Variable           | Source                                                      | Produces Real Data | Status      |
| ---------- | ----------------------- | ----------------------------------------------------------- | ------------------ | ----------- |
| popup.js   | `finalContent`          | `contentInput.value.trim()` + optional `chrome.tabs.query`  | Yes                | ✓ FLOWING   |
| popup.js   | `thought` (POST result) | `await res.json()` from POST `/v1/thoughts`                 | Yes                | ✓ FLOWING   |
| popup.js   | `updated.category`      | GET `/v1/thoughts/${thought.id}` polled every 800ms         | Yes                | ✓ FLOWING   |
| popup.js   | `cat` (badge text)      | `updated.category.charAt(0).toUpperCase() + ...slice(1)`    | Yes                | ✓ FLOWING   |

### Behavioral Spot-Checks

| Behavior                                            | Command                                                                    | Result                                                              | Status        |
| --------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------- |
| Static gate suite                                   | `bash scripts/verify-phase-114.sh --static`                                | exit 0; all 5 check groups PASS                                     | ✓ PASS        |
| Full gate suite (static + runtime)                  | `bash scripts/verify-phase-114.sh --full`                                  | exit 0; all 7 checks PASS (SC#1-#4 + D-02 + SC#5a build + SC#5b sign) | ✓ PASS        |
| codesign verify .app                                | `codesign --verify --deep --strict "$APP_PATH"`                            | exit 0; "valid on disk; satisfies its Designated Requirement"        | ✓ PASS        |
| codesign verify .appex                              | `codesign --verify --deep --strict "$APP_PATH/Contents/PlugIns/...appex"` | exit 0; "valid on disk; satisfies its Designated Requirement"        | ✓ PASS        |
| Plan 03 marker propagated to .appex                 | `grep -E 'e\.metaKey \|\| e\.ctrlKey' "$APPEX/.../popup.js"`              | Match found at embedded popup.js                                     | ✓ PASS        |
| End-to-end live capture (POST + poll + badge)       | Click extension popup → type → Cmd+Enter → see badge                       | (requires Safari + active vigil-core)                               | ? SKIP → human |
| Safari survives ⌘Q + reopen with extension enabled  | Quit Safari → reopen → Settings → Extensions                               | (requires Safari + physical Mac)                                    | ? SKIP → human |

### Requirements Coverage

| Requirement | Source Plan(s)                          | Description                                                                                       | Status       | Evidence                                                                                                                                                                                                                                                                                          |
| ----------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXT-02      | 114-00, 114-01, 114-02, 114-03, 114-04 | Safari extension popup offers Chrome Phase 94 quick-capture parity (freeform, checkbox, Cmd+Enter, badge), verified working on physical Mac hardware | ⚠️ PARTIAL   | Code-level parity VERIFIED (SCs 1-4 + automated leg of SC5). Hardware UAT row open per D-12 → counts as `ship-with-uat-pending` not `complete`. REQUIREMENTS.md:96 already lists EXT-02 status as `Complete`; this verifier flags that the hardware UAT row in 114-HUMAN-UAT.md remains `[ ]` PASS. |

**Cross-reference check:** REQUIREMENTS.md:36 ties EXT-02 to "verified working on physical Mac hardware". REQUIREMENTS.md:96 already marks EXT-02 as Complete. All 5 plan files (114-00 through 114-04) include `requirements: [EXT-02]` in their frontmatter. No orphaned requirement IDs.

### Anti-Patterns Found

| File          | Line | Pattern              | Severity | Impact                                                                                                                       |
| ------------- | ---- | -------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| popup.js      | —    | `[probe]` string     | (none)   | Negative grep verifies the probe code from Plan 01 is fully reverted; commit-and-revert pair `9f4f475`→`559c010` produces net-zero diff. |
| popup.js      | —    | `PHASE 114 PROBE`    | (none)   | Sentinel comment also reverted.                                                                                              |
| popup.js      | —    | `getModifierState`   | (none)   | D-05 honored — no silent fallback shipped without explicit user buy-in.                                                       |
| popup.js      | —    | `browser.*`          | (none)   | D-14 honored — `chrome.*` namespace preserved (4 occurrences: 1 chrome.tabs.query + 3 chrome.storage.local).                  |
| HUMAN-UAT.md  | —    | `spctl --assess`     | (none)   | D-15 honored — codesign --verify is the SC#5 gate, not spctl.                                                                 |

No anti-patterns detected. All negative-grep guards from the plans pass.

### Human Verification Required

#### 1. SC#5 — Safari restart on physical Mac hardware: rebuilt extension still works

**Test:** Per `.planning/phases/114-safari-extension-quick-capture-parity/114-HUMAN-UAT.md` SC#5 section (Steps 1-16):

1. Quit Safari fully (⌘Q, not just close window).
2. Reopen Safari.
3. Safari → Settings → Extensions; confirm "Vigil Capture" is ON.
4. Click Vigil Capture toolbar icon — popup opens.
5. Confirm: textarea EMPTY + focused (SC#1).
6. Confirm: "Include page URL" checkbox visible, UNCHECKED by default (SC#2 + D-07).
7. Confirm: "Cmd+Enter to capture" hint visible below Capture button (SC#3 visual).
8. Type "phase 114 uat smoke test"; press ⌘+Enter (no mouse click).
9. Observe: Capturing... → Analyzing... → ✓ Captured! + category-badge pill within 5s.
10. Auto-close after ~1.5s.
11. Second test: navigate to https://news.ycombinator.com, click toolbar, type "url append test", CHECK the Include-page-URL checkbox, click Capture, then GET /v1/thoughts and confirm body has `\n\n${title}: ${url}` appended (verbatim D-06 format).

**Expected:** All 8 SC#5 assertions in 114-HUMAN-UAT.md PASS. `Result: [x] PASS` ticked. Frontmatter `status:` flips from `ship-with-uat-pending` to `verified`. Sign-off rows ticked.

**Why human:** Requires physical Mac hardware + live Safari runtime + live vigil-core API. Per **D-12 ship-with-uat-pending** (Phase 107/113 precedent), the phase ships at the code/automation level with this row open; the orchestrator deliberately chose not to gate phase closure on the user's session. The automated legs are GREEN: `xcodebuild clean build` exit 0, `codesign --verify --deep --strict` exit 0 on both `.app` and `.appex` (re-verified during this verification run), `verify-phase-114.sh --full` exit 0.

### Gaps Summary

**No code-level gaps.** All four behavioral SCs (1-4) are implemented in popup.{html,js,css} with verbatim Chrome parity per D-06/D-08/D-09/D-10/D-11. Empirical attestation for SC#3 (`metaKey: true` observed in WebKit) is captured in 114-01-SUMMARY.md. The throwaway probe code from Plan 01 is fully reverted (negative greps for `[probe]`, `PHASE 114 PROBE`, `getModifierState` all return zero matches). D-02 lockstep headers are present in all 6 popup files (3 Chrome + 3 Safari). D-14 `chrome.*` namespace preserved. D-15 codesign-not-spctl honored. D-16 xcodebuild-clean-build honored.

**SC#5 hardware UAT row** is the only remaining gate, intentionally deferred per **D-12 (ship-with-uat-pending)** — established by Phase 107 and reinforced by Phase 113. The codesign automated leg of SC#5 PASSES (re-verified during this run). The phase ships at the code/automation level; the user owns the Safari-restart-on-hardware leg in their next session via 114-HUMAN-UAT.md SC#5.

**Status: human_needed** — phase is shippable per **D-12** but cannot be marked `passed` while the SC#5 hardware UAT row is unticked.

### verify-phase-114.sh --full Output (re-run during this verification)

```
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
  found built app at: /Users/jamesonmorrill/Library/Developer/Xcode/DerivedData/Vigil_Capture-ecqueqzbhctzqhcfrasvarwjuont/Build/Products/Debug/Vigil Capture.app
  PASS — .app passes codesign --verify --deep --strict
  PASS — .appex passes codesign --verify --deep --strict
verify-phase-114: all checks passed
```

---

_Verified: 2026-04-25_
_Verifier: Claude (gsd-verifier)_
