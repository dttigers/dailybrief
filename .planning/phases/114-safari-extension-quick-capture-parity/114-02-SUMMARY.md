---
phase: 114
plan: 02
subsystem: safari-extension
tags: [safari-extension, webextension, popup-html, popup-css, verbatim-port]
requirements: [EXT-02]
status: complete
completed: 2026-04-26T16:13:41Z
duration_min: 2
files_created: []
files_modified:
  - vigil-safari-extension/Vigil Capture Extension/Resources/popup.html
  - vigil-safari-extension/Vigil Capture Extension/Resources/popup.css
commits:
  - 5ec89b3 — feat(114-02): port Chrome popup.html scaffolding to Safari (D-02/D-06/D-07)
  - cda0f5f — feat(114-02): port Chrome popup.css verbatim D-11 rule blocks to Safari
key_decisions:
  - D-02 header lands at line 2 of popup.html (after DOCTYPE — Pitfall 6 quirks-mode mitigation) and line 1 of popup.css; ../../../ relative path mirrors Chrome side's ../ path
  - D-07 default-unchecked checkbox (no `checked` attribute on `<input id="include-url">`); no chrome.storage.local persistence — every popup open starts unchecked
  - D-11 byte-for-byte CSS parity verified via `diff <(sed -n '161,196p' Chrome) <(sed -n '161,196p' Safari)` — empty diff confirms verbatim port
  - Vigil teal #1D9E75 preserved across .url-toggle accent-color, .category-badge color/background-tint
dependency_graph:
  requires:
    - 114-01-SUMMARY.md (PASS attestation gate — D-04 metaKey:true confirmed)
  provides:
    - DOM scaffolding (id="include-url", id="success-text") for Plan 03 popup.js
    - CSS classes (.category-badge, .analyzing, .shortcut-hint, .url-toggle) for Plan 03's innerHTML render
  affects:
    - vigil-safari-extension/Vigil Capture Extension/Resources/popup.html
    - vigil-safari-extension/Vigil Capture Extension/Resources/popup.css
tech_stack:
  added: []
  patterns:
    - verbatim-port (Chrome → Safari byte-for-byte)
    - lockstep-header-comment (D-01/D-02 hand-maintained drift reminder)
key_files:
  created: []
  modified:
    - vigil-safari-extension/Vigil Capture Extension/Resources/popup.html
    - vigil-safari-extension/Vigil Capture Extension/Resources/popup.css
metrics:
  tasks: 2
  files: 2
  lines_added: 42  # popup.html: +4 / popup.css: +38
  duration: 2min
---

# Phase 114 Plan 02: Safari popup.html + popup.css Verbatim Port Summary

Verbatim Chrome → Safari port of popup.html structural deltas (checkbox + shortcut hint + dynamic success span) and popup.css rule appends (`.url-toggle`, `.category-badge`, `.shortcut-hint`, `.analyzing`); D-02 lockstep header comments added on both files; byte-for-byte parity with Chrome reference confirmed via `diff` on appended rule block lines 161-196.

## Pre-condition Gate

Verified before any edit (D-04):

- `.planning/phases/114-safari-extension-quick-capture-parity/114-01-SUMMARY.md` exists — TRUE
- File contains `probe_result: PASS` — TRUE (frontmatter line 6)
- Plan 01 confirmed Safari WebKit fires `metaKey: true` on popup keydown for ⌘+Enter
- Verbatim Web Inspector console output captured at Plan 01 SUMMARY.md lines 23-32

Pre-condition gate **CLOSED** — Plan 02 cleared to proceed.

## Edits Applied

### popup.html (4 edits — lines reference post-edit file)

| Edit | Action | Line(s) | Source |
|------|--------|---------|--------|
| 1 | Insert D-02 lockstep header comment | line 2 (after DOCTYPE) | New (mirrors Chrome popup.html line 2 with `../../../` reversed path) |
| 2 | Insert `<label class="url-toggle">` row | line 36 | Verbatim from Chrome popup.html line 36 |
| 3 | Insert `<div class="shortcut-hint">` row | line 38 | Verbatim from Chrome popup.html line 38 |
| 4 | Replace `<span class="checkmark">&#10003;</span> Captured!` with `<span id="success-text"></span>` | line 41 | Verbatim from Chrome popup.html line 41 |

**Pitfall 6 mitigation:** DOCTYPE remains exactly at line 1; D-02 comment follows at line 2 — no quirks-mode regression.

**D-07 enforcement:** Checkbox `<input type="checkbox" id="include-url">` has NO `checked` attribute; default state is unchecked. Verified via grep `! grep -qE 'id="include-url"[^>]*checked'`.

### popup.css (2 edits)

| Edit | Action | Line(s) | Source |
|------|--------|---------|--------|
| 1 | Insert D-02 lockstep header comment | line 1 (pushed `* {` to line 2) | New (mirrors Chrome popup.css line 1 with `../../../` reversed path) |
| 2 | Append 4 verbatim Chrome rule blocks (`.url-toggle`, `.url-toggle input[type="checkbox"]`, `.category-badge`, `.shortcut-hint`, `.analyzing`) plus separator blank line | lines 160-196 | Verbatim from Chrome popup.css lines 160-196 |

**D-11 byte-for-byte parity verified:**

```
$ diff <(sed -n '161,196p' "vigil-extension/popup.css") \
       <(sed -n '161,196p' "vigil-safari-extension/Vigil Capture Extension/Resources/popup.css")
(empty output — byte-identical)
```

## Line Counts

| File | Before | After | Delta | Chrome reference parity |
|------|--------|-------|-------|------------------------|
| `vigil-safari-extension/Vigil Capture Extension/Resources/popup.html` | 44 (newlines) | 47 (newlines) | +3 (D-02 header + checkbox + shortcut hint; success-text is in-place replacement) | Matches Chrome popup.html (47 newlines) |
| `vigil-safari-extension/Vigil Capture Extension/Resources/popup.css` | 158 (newlines) | 196 (newlines) | +38 (D-02 header + separator blank + 4 rule blocks = 1 + 1 + 36) | Matches Chrome popup.css (196 newlines) |

Note: `wc -l` counts newline characters per POSIX. Editor view shows lines 48 / 197 due to last-line-trailing-newline display convention. Both Chrome and Safari are byte-aligned.

## Acceptance Criteria

### Task 1 (popup.html)
- [x] DOCTYPE preserved at line 1 (`head -1 popup.html | grep -qF '<!DOCTYPE html>'` — PASS)
- [x] D-02 header at line 2 (PASS)
- [x] `id="include-url"` checkbox present (PASS)
- [x] `type="checkbox" id="include-url"` (input is a checkbox, not text/radio) (PASS)
- [x] `<label class="url-toggle">` matches Chrome (PASS)
- [x] "Include page URL" visible label text (PASS)
- [x] `class="shortcut-hint">Cmd+Enter to capture` (PASS)
- [x] `id="success-text"` dynamic span scaffold (PASS)
- [x] Old static `class="checkmark">&#10003;</span> Captured!` removed (PASS — negative grep)
- [x] D-07: no `checked` attribute on `id="include-url"` (PASS — negative grep)
- [x] `class="view"` count = 2 (both setup-view + capture-view preserved) (PASS)
- [x] `id="setup-view"` count = 1 (setup-view block intact) (PASS)
- [x] `id="api-key-input"` count = 1 (no accidental edits to setup view) (PASS)

### Task 2 (popup.css)
- [x] D-02 header at line 1 (PASS)
- [x] Universal selector `* {` preserved at line 2 (PASS)
- [x] `.url-toggle` rule + nested checkbox accent rule present (count ≥ 2) (PASS)
- [x] `.url-toggle input[type="checkbox"]` nested rule (PASS)
- [x] `accent-color: #1D9E75;` Vigil teal verbatim (PASS — D-11)
- [x] `.category-badge {` rule present (PASS)
- [x] `background: rgba(29, 158, 117, 0.15);` verbatim Chrome teal-tint (PASS)
- [x] `border-radius: 12px;` badge pill shape (PASS)
- [x] `.shortcut-hint {` rule present (PASS)
- [x] `font-size: 11px;` shortcut-hint sizing (PASS)
- [x] `.analyzing {` rule present (PASS)
- [x] `#1D9E75` count = 5 (≥ 4 required: focus-border + btn-primary + success-msg + url-toggle accent + category-badge color) (PASS)
- [x] Byte-for-byte diff against Chrome popup.css lines 161-196 = empty (PASS)

## Verify Script Status (Plan 02 scope only)

Running `bash scripts/verify-phase-114.sh --static` returns FAIL overall — but the failures are exclusively in popup.js territory (SC#1 auto-prefill removal, SC#2 JS-side getElementById, SC#3 keydown handler, SC#4 setInterval, D-02 popup.js header). Those are **Plan 03's scope**, not Plan 02's.

**Plan 02 scoped portions all PASS:**
- SC#2 HTML side: `id="include-url"` in popup.html — PASS
- SC#4 CSS side: `.url-toggle / .category-badge / .shortcut-hint / .analyzing` rules — PASS
- D-02 Safari popup.html + popup.css — PASS (2 of 6 D-02 files; Safari popup.js still missing until Plan 03)

Per the plan's `<verification>` block: "SC#1 + SC#3 still fail at the popup.js level (their JS-side checks are Plan 03's territory)." This is the expected post-Plan-02 state.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Confirmation

Plan 02 threats from PLAN frontmatter:

- **T-114-02-01 (Tampering — DOCTYPE preservation):** Mitigated. `head -1 popup.html | grep -qF '<!DOCTYPE html>'` exits 0 — no quirks-mode regression.
- **T-114-02-02 (Information Disclosure — checkbox default):** Accepted (D-07 default-unchecked enforced; URL append is Plan 03's runtime responsibility).
- **T1 (XSS via injected category):** CSS rule is purely visual (no `expression(...)`, no JS-exposed properties). XSS guard is server-side category enum at `vigil-core/src/routes/thoughts.ts:37-43`.
- **T2 / T3 / T4:** No new surface introduced by Plan 02; markup contains no auto-fill defaults (textarea has only `placeholder`, no `value`); error div remains empty markup.

No new security-relevant surface introduced. **No threat flags.**

## Plan 03 / Plan 04 Handoff

**Plan 03 (popup.js) can now wire to:**
- `document.getElementById('include-url')` — DOM node present (Task 1 Edit 2)
- `document.getElementById('success-text')` — DOM node present (Task 1 Edit 4)
- `.category-badge` class for badge innerHTML interpolation — CSS rule present (Task 2 Edit 2)
- `.analyzing` class for pre-poll-success "Analyzing..." text — CSS rule present (Task 2 Edit 2)

**Plan 04 (final rebuild + UAT):** No popup.html / popup.css regressions to revisit. xcodebuild Resources copy phase will pick up the +38-line CSS append and +3-line HTML deltas automatically.

## Self-Check: PASSED

Verified after writing SUMMARY.md:
- File exists: `.planning/phases/114-safari-extension-quick-capture-parity/114-02-SUMMARY.md` — FOUND
- Commit `5ec89b3` exists in `git log --oneline --all` — FOUND
- Commit `cda0f5f` exists in `git log --oneline --all` — FOUND
- popup.html line 2 contains D-02 header — FOUND
- popup.css line 1 contains D-02 header — FOUND
- popup.html contains `id="include-url"` — FOUND
- popup.css contains `.category-badge` — FOUND
- Byte-for-byte diff of D-11 rule blocks (Chrome lines 161-196 vs Safari lines 161-196) is empty — VERIFIED
