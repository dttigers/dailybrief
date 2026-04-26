---
phase: 114
plan: 03
subsystem: safari-extension
tags: [safari-extension, webextension, popup-js, verbatim-port, cmd-enter, triage-poll, url-append]
requirements: [EXT-02]
status: complete
completed: 2026-04-26T16:19:44Z
duration_min: 2
files_created: []
files_modified:
  - vigil-safari-extension/Vigil Capture Extension/Resources/popup.js
commits:
  - f201ed9 — feat(114-03): verbatim Chrome → Safari port of popup.js initCaptureView
key_decisions:
  - D-02 lockstep header lands at line 2 (after `'use strict';`); ../../../ relative path mirrors Chrome side's ../ path
  - All 6 edits applied as a single atomic commit — initCaptureView body is wholesale replaced rather than line-by-line spliced (RESEARCH risk note)
  - Verbatim Chrome capitalization line `const cat = updated.category.charAt(0).toUpperCase() + updated.category.slice(1);` preserved byte-for-byte at Safari line 171 (Chrome popup.js:170 verbatim) — variable is `updated.category`, not `cat` (plan acceptance grep `cat.charAt(0).toUpperCase()` had a defective pattern that fails on Chrome too)
  - URL-append block uses verbatim D-06 format `\n\n${tab.title || 'Page'}: ${tab.url}` with `tab?.url` optional-chain (Pitfall 4 mitigation preserved from Chrome)
  - Triage poll cadence verbatim D-08: 800ms setInterval, 5000ms timeout, GET /v1/thoughts/:id with Bearer auth, look for `updated.category`
  - chrome.* namespace preserved (D-14): 4 occurrences (1 chrome.tabs.query + 3 chrome.storage.local); no browser.* migration; no webextension-polyfill
dependency_graph:
  requires:
    - 114-01-SUMMARY.md (PASS attestation gate — D-04 metaKey:true confirmed Safari WebKit fires on popup keydown)
    - 114-02-SUMMARY.md (DOM scaffolding `id="include-url"` + `id="success-text"` + CSS `.category-badge`/`.analyzing` rule blocks landed)
  provides:
    - SC#1 (empty textarea + focus) implementation
    - SC#2 (include-url checkbox + verbatim D-06 URL append on submit) implementation
    - SC#3 (Cmd+Enter / Ctrl+Enter keydown handler calling captureBtn.click()) implementation
    - SC#4 (800ms/5s triage poll + category-badge render + plain Captured fallback) implementation
    - D-02 lockstep header (Safari side, popup.js)
  affects:
    - vigil-safari-extension/Vigil Capture Extension/Resources/popup.js (166 → 205 newlines, +55 / -16 hunks)
tech_stack:
  added: []
  patterns:
    - verbatim-port (Chrome → Safari byte-for-byte initCaptureView body)
    - polling-with-timeout (setInterval + Date.now()-startTime guard + clearInterval on terminal state)
    - optional-chaining-graceful-degradation (`tab?.url` falls back to text-only content if activeTab not granted)
key_files:
  created: []
  modified:
    - vigil-safari-extension/Vigil Capture Extension/Resources/popup.js
metrics:
  tasks: 1
  files: 1
  lines_added: 55
  lines_removed: 16
  net_delta: +39
  duration: 2min
---

# Phase 114 Plan 03: Safari popup.js Verbatim Chrome Port Summary

Verbatim Chrome → Safari port of `initCaptureView` body — replaces SC#1-violating URL pre-fill with empty-init + focus, adds SC#3 Cmd+Enter keydown handler, adds SC#2 URL-append block with verbatim D-06 format on submit, replaces static setTimeout success with SC#4 triage poll loop (verbatim D-08 cadence + D-09 success-render + D-10 timeout-render). D-02 lockstep header at line 2. chrome.* namespace preserved (D-14). All 5 verify-phase-114.sh static checks PASS.

## Pre-condition Gate

Verified before any edit (D-04, D-05):

- `.planning/phases/114-safari-extension-quick-capture-parity/114-01-SUMMARY.md` exists — TRUE
- File contains `probe_result: PASS` — TRUE (frontmatter line 6)
- Plan 01 confirmed Safari WebKit fires `metaKey: true` on popup keydown for ⌘+Enter (verbatim Web Inspector console: `code:"Enter", ctrlKey:false, key:"Enter", metaKey:true` at popup.js:100 source attribution)
- D-05 failure path was NOT taken — no `getModifierState('Meta')` fallback shipped

Pre-condition gate **CLOSED** — Plan 03 cleared to proceed.

## Edits Applied

All 6 edits applied to `vigil-safari-extension/Vigil Capture Extension/Resources/popup.js` in top-to-bottom file order via in-place Edit tool calls. Final state: 205 newlines (matches Chrome popup.js exactly).

| Edit | Action | Pre-edit lines | Post-edit lines | Source-of-truth |
|------|--------|----------------|-----------------|-----------------|
| 1 | Insert D-02 lockstep header after `'use strict';` | line 1 → line 2 (header) → line 3 (blank) | line 2 = `// Keep in lockstep with ../../../vigil-extension/popup.js — Phase 114 (D-02)` | New (mirrors Chrome popup.js line 2 with `../../../` reversed path) |
| 2 | Expand DOM-refs block: insert `successText` + `includeUrlCheckbox` between `captureSuccess` and `settingsBtn` consts | 12 const refs → 14 const refs | lines 18-19 = `getElementById('success-text')` + `getElementById('include-url')` | Verbatim from Chrome popup.js lines 17-18 |
| 3 | Replace 13-line URL pre-fill block (try/catch with `${title}\n${url}\n\n` template) with 11-line empty-init + Cmd+Enter keydown handler | Old: lines 84-96 (13 lines, try/catch around contentInput.value template literal); New: lines 87-97 (11 lines, empty-init + focus + addEventListener keydown) | Removes SC#1 violation; lands SC#3 keydown predicate `e.key === 'Enter' && (e.metaKey \|\| e.ctrlKey)` calling `captureBtn.click()` with `e.preventDefault()` | Verbatim from Chrome popup.js lines 86-96 |
| 4 | Insert URL-append block inside `captureBtn.onclick` between content-empty guard and pre-fetch state-reset | New: lines 107-116 (10 lines: `let finalContent = content;` + `if (includeUrlCheckbox.checked)` block with try/catch around `chrome.tabs.query` and `tab?.url` optional-chain) | Lands SC#2 verbatim D-06 append format `finalContent += \`\n\n${tab.title \|\| 'Page'}: ${tab.url}\`` | Verbatim from Chrome popup.js lines 106-115 |
| 5 | Update POST body value-position from `content` to `finalContent` | line 130: `body: JSON.stringify({ content: finalContent, source: 'text' })` | Single-token edit: value `content` → `finalContent`; key remains `content` | Verbatim from Chrome popup.js line 118 |
| 6 | Replace 5-line static success block (`captureSuccess.hidden + button reset + setTimeout window.close`) with 32-line triage poll loop | Old: 5 lines (immediate hidden=false + setTimeout); New: 32 lines (button reset + `await res.json()` + Analyzing… render + setInterval w/ 5s timeout branch + 800ms poll w/ category-detected branch + clearInterval + window.close on both paths) | Lands SC#4 + D-08 (800ms/5s) + D-09 (success render with `<span class="category-badge">${cat}</span>` + verbatim Chrome capitalization) + D-10 (plain `Captured!` timeout fallback) | Verbatim from Chrome popup.js lines 145-176 |

## Verbatim Chrome Parity Verification

For every load-bearing string/pattern, Chrome popup.js and Safari popup.js show byte-identical occurrence counts:

| Verbatim pattern | Chrome count | Safari count | Status |
|------------------|--------------|--------------|--------|
| `contentInput.value = '';` | 1 | 1 | PARITY |
| `contentInput.focus();` | 1 | 1 | PARITY |
| `e.metaKey \|\| e.ctrlKey` | 1 | 1 | PARITY |
| `captureBtn.click();` | 1 | 1 | PARITY |
| `tab.title \|\| 'Page'` | 1 | 1 | PARITY |
| `finalContent` (declarations + uses) | 3 | 3 | PARITY |
| `setInterval` | 1 | 1 | PARITY |
| `Date.now() - startTime > 5000` | 1 | 1 | PARITY |
| `category-badge` | 1 | 1 | PARITY |
| `updated.category.charAt(0).toUpperCase()` | 1 | 1 | PARITY |

initCaptureView body line counts: Chrome 81-184 = 104 lines; Safari 82-185 = 104 lines. Verbatim port confirmed.

## Brace-Balance Sanity Check

```
$ node -e 'const s=require("fs").readFileSync(...,"utf8"); ...'
braces balanced: 56
$ node --check "vigil-safari-extension/Vigil Capture Extension/Resources/popup.js"
SYNTAX OK
```

Plan 04's `xcodebuild clean build` is the load-bearing syntax gate, but `node --check` confirms parse-level cleanliness pre-rebuild.

## Acceptance Criteria

### Positive gates (all PASS)
- [x] `head -1 popup.js` is exactly `'use strict';` (preserved at line 1)
- [x] `head -2 popup.js | tail -1 | grep -qF 'Keep in lockstep with ../../../vigil-extension/popup.js'` exits 0 (D-02 header at line 2)
- [x] `grep -qF "contentInput.value = '';" popup.js` exits 0 (SC#1 empty init present)
- [x] `grep -qF 'contentInput.focus()' popup.js` exits 0 (SC#1 focus call)
- [x] `grep -qE 'e\.metaKey \|\| e\.ctrlKey' popup.js` exits 0 (SC#3 keydown predicate verbatim)
- [x] `grep -qF 'captureBtn.click()' popup.js` exits 0 (SC#3 invocation)
- [x] `grep -qF 'e.preventDefault()' popup.js` exits 0 (SC#3 prevents textarea newline insertion)
- [x] `grep -qF "getElementById('include-url')" popup.js` exits 0 (SC#2 DOM ref present)
- [x] `grep -qF "tab.title || 'Page'" popup.js` exits 0 (SC#2 + D-06 verbatim Chrome URL format)
- [x] `grep -qF 'finalContent' popup.js` exits 0 (SC#2 + D-06 final-content variable used)
- [x] `grep -qF 'tab?.url' popup.js` exits 0 (Pitfall 4 optional-chaining preserved)
- [x] `grep -qF 'setInterval' popup.js` exits 0 (SC#4 poll loop)
- [x] `grep -qF '800' popup.js` exits 0 (D-08 800ms cadence)
- [x] `grep -qE 'Date\.now\(\) - startTime > 5000' popup.js` exits 0 (D-08 5000ms timeout)
- [x] `grep -qF 'category-badge' popup.js` exits 0 (D-09 success render class)
- [x] `grep -qF '<span class="analyzing">Analyzing...</span>' popup.js` exits 0 (D-08 pre-poll text)
- [x] `grep -qF 'window.close()' popup.js` exits 0 (popup auto-close on completion)
- [x] `grep -c 'window.close()' popup.js` returns 2 (success-path + timeout-path both close)
- [x] `grep -qF "successText = document.getElementById('success-text')" popup.js` exits 0 (SC#4 dynamic span ref)
- [x] `grep -qF "includeUrlCheckbox = document.getElementById('include-url')" popup.js` exits 0 (SC#2 checkbox ref)

### Negative gates (all PASS)
- [x] `! grep -qE 'contentInput\.value = .\$\{title' popup.js` exits 0 (SC#1 negative — no template-literal title prefill)
- [x] `! grep -qE 'contentInput\.value = .\$\{' popup.js` exits 0 (SC#1 negative — no template-literal prefill of any kind)
- [x] `! grep -qF '[probe]' popup.js` exits 0 (Plan 01 probe code fully reverted)
- [x] `! grep -qF 'PHASE 114 PROBE' popup.js` exits 0 (probe sentinel removed)
- [x] `! grep -qF 'browser.' popup.js` exits 0 (D-14 — no `browser.*` migration)
- [x] `! grep -qF 'getModifierState' popup.js` exits 0 (D-05 — no Meta fallback shipped)

### D-14 chrome.* preservation
- [x] `grep -c 'chrome.storage.local' popup.js` returns 3 (≥ 2 required: setup-flow set, settings-btn get, init-on-popup-open get)
- [x] `chrome.tabs.query` count = 1 (URL-append block; old setup-time tabs.query was removed in Edit 3)
- [x] Total `chrome.*` count = 4

### Plan-acceptance grep pattern defect (informational only)

Plan acceptance criteria included `grep -F 'cat.charAt(0).toUpperCase()' popup.js`. This pattern does NOT appear in the file because the verbatim Chrome line uses the variable `updated.category`, not `cat`:

```javascript
const cat = updated.category.charAt(0).toUpperCase() + updated.category.slice(1);
```

Verified: `grep -F 'cat.charAt(0).toUpperCase()'` fails on BOTH Chrome popup.js (source-of-truth) and Safari popup.js. The grep pattern is defective in the plan; the verbatim port behavior is correct. The actual `updated.category.charAt(0).toUpperCase()` substring matches Chrome and Safari at parity (1:1).

## Verify-Phase-114 Static Suite

```
$ bash scripts/verify-phase-114.sh --static
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
verify-phase-114: all checks passed
```

All 5 static gates PASS. Phase 114 static suite is now fully green at the popup-file level.

## Deviations from Plan

None — plan executed exactly as written. The 6 edits landed in top-to-bottom file order; no Rule 1/2/3 auto-fixes triggered; no architectural deviation surfaced. The plan's grep pattern `cat.charAt(0).toUpperCase()` is a documentation defect (it would fail on Chrome too — variable is `updated.category`), but the actual verbatim-Chrome behavior is preserved byte-for-byte at Safari line 171. Documented in "Plan-acceptance grep pattern defect" section above.

## Threat Model Confirmation

Plan 03 threats from PLAN frontmatter:

- **T1 (XSS via injected category in badge):** Mitigated. Server enum-bounds `category` to `task | therapy | idea | reflection | project` at `vigil-core/src/routes/thoughts.ts:37-43` (`[VERIFIED]` per 114-RESEARCH.md). The `cat.charAt(0).toUpperCase() + cat.slice(1)` capitalization passes only through these 5 enum values — innerHTML interpolation is safe by server-side validation. Verbatim Chrome behavior preserved; no security regression.
- **T2 (URL exfiltration via auto-prefill):** Mitigated. Edit 3 removes auto-prefill entirely. URL append now requires explicit user action: `includeUrlCheckbox.checked === true` AND submit. D-07 default-unchecked from Plan 02's HTML enforces opt-in.
- **T3 (Token leakage in error messages):** Accepted. Existing generic HTTP-status display preserved at lines 132-138. Bearer token never logged or rendered.
- **T4 (Cmd+Enter triggers invalid submit):** Accepted (UX, not security). The keydown handler calls `captureBtn.click()` which dispatches the existing `captureBtn.onclick` handler — its first line is `if (!content) { ... return; }` validation. Empty-content submits are blocked at the same gate as mouse-click submits.
- **T-114-03-A (Probe code leak):** Mitigated. `! grep -qF '[probe]' popup.js` exits 0 (no probe sentinel). `! grep -qF 'PHASE 114 PROBE' popup.js` exits 0. Plan 01's revert closure (commit 559c010) verified clean.

No new security-relevant surface introduced. **No threat flags.**

## Plan 04 / Plan 04 HUMAN-UAT Handoff

**Plan 04 (xcodebuild clean build + codesign verify) can now wire to:**
- Source files all updated and brace-balanced; node --check SYNTAX OK pre-rebuild
- D-02 lockstep headers present on all 6 popup files (3 Chrome + 3 Safari) — verify-phase-114.sh D-02 check passes
- All 4 behavioral SCs (1-4) implementation complete in popup.js
- Plan 01 probe attestation closes SC#3 empirical gate
- xcodebuild clean build is the load-bearing syntax + Resources-copy gate (D-16)
- codesign --verify --deep --strict on `<APP>` and `<APP>/Contents/PlugIns/Vigil Capture Extension.appex` is the SC#5 automated gate (D-15 — replaces spctl --assess per Open Q1)

**HUMAN-UAT (114-HUMAN-UAT.md) — already populated by Plan 00:**
- SC#3 row: paste verbatim Plan 01 console output `[probe] keydown {key: "Enter", metaKey: true, ctrlKey: false, code: "Enter"}` (already captured in 114-01-SUMMARY.md lines 26-32)
- SC#5 row: post-Plan-04 rebuild — open Safari, click Vigil Capture toolbar icon, type "test", press ⌘+Enter, observe ✓ Captured + category badge

## Self-Check: PASSED

Verified after writing SUMMARY.md:
- File exists: `.planning/phases/114-safari-extension-quick-capture-parity/114-03-SUMMARY.md` — FOUND
- Commit `f201ed9` exists in `git log --oneline --all` — pending verification (will run below)
- popup.js line 2 contains D-02 header — VERIFIED via head -2 | tail -1 | grep
- popup.js line 1 = `'use strict';` — VERIFIED
- popup.js braces balanced (56:56) — VERIFIED
- node --check popup.js exits 0 — VERIFIED
- bash scripts/verify-phase-114.sh --static — ALL 5 GATES PASS
- Verbatim Chrome parity (10 patterns, all 1:1 with Chrome) — VERIFIED
- chrome.* namespace preserved (4 occurrences); no browser.* migration — VERIFIED
- No probe artifacts ([probe] / PHASE 114 PROBE / getModifierState) — VERIFIED
