---
phase: 114
requirement: EXT-02
status: ship-with-uat-pending
source:
  - 114-VALIDATION.md
  - 114-CONTEXT.md
  - 114-RESEARCH.md
created: 2026-04-26
tested_by: jamesonmorrill1@gmail.com
rebuild_sha: 1076fa7364d64079cecb4251a7991be83bd98f0c
rebuild_time: 2026-04-26T16:24:51Z
tested_on: <date — fill in when UAT is executed>
---

# Phase 114 — Human UAT (EXT-02)

End-to-end live verification of the Safari extension quick-capture parity port
on physical Mac hardware. Run AFTER Plan 04's `xcodebuild clean build` +
`codesign --verify --deep --strict` exits 0 and the rebuilt `.app` is launched
once to refresh the Safari extension binding.

This file is a lab notebook — fill in observed values during the run, tick each
checkbox, and update frontmatter `status: verified` when sign-off is complete.

---

## Pre-flight

- [x] Plans 01-04 merged to main.
- [x] Plan 04 final `xcodebuild clean build` exited 0 (record SHA + UTC time in frontmatter).
- [x] `codesign --verify --deep --strict --verbose=2 <APP>` exited 0 for both `.app` and `.appex`.
- [x] Rebuilt `.app` was opened once via Finder or `open` to refresh Safari's extension binding.
- [ ] Safari fully quit (⌘Q, not just close window) and reopened — Pitfall 1 from 114-RESEARCH.md.
- [ ] Vigil Capture extension shows enabled in Safari → Settings → Extensions.

---

## SC#3 — Cmd+Enter empirical probe attestation (FROM PLAN 01 SUMMARY)

Source: 114-VALIDATION.md Manual-Only row 1 / ROADMAP SC#3 / D-03.

> Verifies that: WebKit fires `metaKey: true` on a popup keydown when ⌘+Enter
> is pressed in the textarea — which is the empirical bar D-03/D-04 set
> BEFORE any Safari port code lands. Plan 01's throwaway probe captures the
> observed event shape verbatim from Web Inspector console; this row is
> filled in with the Plan 01 SUMMARY content as part of phase ship-out.

### Steps (already executed by Plan 01)

1. Apply Plan 01 probe (`console.log('[probe]', { key, metaKey, ctrlKey, code })` in keydown listener).
2. `xcodebuild clean build` (D-16).
3. `open <APP>` to refresh Safari's extension binding; quit Safari fully; reopen Safari.
4. Click Vigil Capture toolbar icon to open popup.
5. Right-click inside popup body → Inspect Element (Pitfall 2 — direct Develop menu closes the popup).
6. Click into textarea; press ⌘+Enter.
7. Read Web Inspector console output verbatim.
8. Revert probe code in same Plan 01 (commit-and-revert pair).
9. Record exact console line in Plan 01 SUMMARY.md.

### Assertions

- [x] Plan 01 SUMMARY.md exists at `.planning/phases/114-safari-extension-quick-capture-parity/114-01-SUMMARY.md`.
- [x] Plan 01 SUMMARY.md contains the verbatim console log line from the probe run.
- [x] The recorded log line shows `metaKey: true` when ⌘+Enter was pressed (D-04 success bar).
- [x] No `[probe]` string remains in `vigil-safari-extension/Vigil Capture Extension/Resources/popup.js` after the revert (proves D-03 commit-and-revert closure).

### Observed (paste from Plan 01 SUMMARY)

- Date/time of probe run: 2026-04-26T16:08:32Z
- Console log line (verbatim): `[probe] keydown { code: "Enter", ctrlKey: false, key: "Enter", metaKey: true }` (sourced from popup.js:100; right-click → Inspect Element workaround per Pitfall 2)
- metaKey value observed: true
- ctrlKey value observed: false
- key value observed: Enter
- Probe revert commit SHA: 559c010 (`559c0109430110afb98dd7a6c387dd04725d0933` — `revert(114-01): remove throwaway Cmd+Enter probe (D-03 closure)`)

**Result:** [x] PASS  [ ] FAIL  [ ] DEFERRED

Source: `.planning/phases/114-safari-extension-quick-capture-parity/114-01-SUMMARY.md` (probe_result: PASS in frontmatter; verbatim Web Inspector console output captured at lines 26-32; commit-and-revert pair `9f4f475` → `559c010` produces net-zero diff on popup.js).

---

## SC#5 — Safari restart on physical Mac hardware: rebuilt extension still works

Source: 114-VALIDATION.md Manual-Only row 2 / ROADMAP SC#5 / D-12.

> Verifies that: after a Safari restart on physical Mac hardware (not just app
> relaunch), the rebuilt extension is still enabled and the new quick-capture
> popup behaviors (empty textarea, checkbox, Cmd+Enter, triage badge) all work
> end-to-end with the live vigil-core /v1/thoughts endpoint. Per D-15, the
> automatable codesign check (codesign --verify --deep --strict on .app +
> .appex) gates phase ship-out; this row gates UAT sign-off.

### Steps

1. Confirm pre-flight checks above are all ticked.
2. Quit Safari fully (⌘Q, not just close window).
3. Reopen Safari.
4. Open Safari → Settings → Extensions. Confirm "Vigil Capture" is enabled (toggle ON).
5. Click the Vigil Capture toolbar icon. Popup opens.
6. Observe: textarea is EMPTY (no auto-prefilled tab title or URL — SC#1).
7. Observe: focus is on the textarea (cursor blinks inside it — SC#1).
8. Observe: an "Include page URL" checkbox is visible, UNCHECKED by default (SC#2 + D-07).
9. Observe: a "Cmd+Enter to capture" hint is visible below the Capture button (SC#3 visual confirmation).
10. Type "phase 114 uat smoke test" in the textarea.
11. Press ⌘+Enter (do NOT click Capture).
12. Observe: button text briefly changes to "Capturing...", then success area appears with "Analyzing..." text.
13. Within 5 seconds, observe: success area updates to "✓ Captured!" + a category-badge pill (e.g. "Idea", "Task", "Reflection").
14. After ~1.5s, popup closes automatically.
15. In a second test, navigate to a real webpage (e.g. https://news.ycombinator.com), click the toolbar icon again, type "url append test", check the "Include page URL" checkbox, click Capture.
16. After capture, in PWA or curl: `GET /v1/thoughts` and confirm the most recent thought has BOTH the typed text AND the page URL appended in the format `\n\n${title}: ${url}` (verbatim Chrome format per D-06).

### Assertions

- [ ] Safari extension still enabled after Safari quit+reopen (Pitfall 1 — Safari aggressively caches; full quit is required).
- [ ] Popup opens with empty textarea, focus on textarea (SC#1).
- [ ] "Include page URL" checkbox visible, UNCHECKED by default (SC#2 + D-07).
- [ ] "Cmd+Enter to capture" shortcut hint visible (SC#3 visual).
- [ ] ⌘+Enter submits the capture without clicking the button (SC#3 functional).
- [ ] Success area renders "Analyzing..." then transitions to "✓ Captured!" + category-badge pill within 5 seconds (SC#4 success path D-09).
- [ ] If category never arrives in 5 seconds: success area renders "✓ Captured!" with NO badge, then closes (SC#4 timeout path D-10) — note this in observed if hit.
- [ ] Second test: checked-checkbox capture has `\n\n${title}: ${url}` appended in the resulting thought (SC#2 + D-06 verbatim format).

### Observed

- Safari version:
- macOS version:
- Popup opened: [ ] yes / [ ] no
- Textarea empty + focused: [ ] yes / [ ] no
- Checkbox default unchecked: [ ] yes / [ ] no
- "Cmd+Enter to capture" hint visible: [ ] yes / [ ] no
- ⌘+Enter submitted (no mouse click): [ ] yes / [ ] no
- Time from submit to category-badge appearing (seconds):
- Category-badge text rendered:
- Second test: URL appended in thought body: [ ] yes (paste excerpt) / [ ] no

**Result:** [ ] PASS  [ ] FAIL  [ ] DEFERRED

---

## Sign-off

Complete after both SC sections are filled in.

- [x] SC#3 PASS — Plan 01 SUMMARY captured `metaKey: true` empirically; probe code reverted from popup.js.
- [ ] SC#5 PASS — Safari restart preserved extension; all four quick-capture parity behaviors (empty textarea, checkbox, Cmd+Enter, triage badge) verified live on physical Mac hardware.
- [ ] No regressions in Phase 107 behaviors: extension still enabled across reboot, container app SMAppService.mainApp.register() still wired, persistence pill still renders.
- [ ] Status updated to `verified` in this file's frontmatter.
- [ ] Phase 114 closure committed.

Any failures: open a fix branch, document the failure mode below, and re-execute the affected SC after the fix lands. Per D-05, an SC#3 probe failure (metaKey: false or no event fires) requires a stop+replan, not a silent fallback.

Any deferred items: log to `.planning/phases/114-safari-extension-quick-capture-parity/deferred-items.md` with rationale.

## Gaps

# No gaps until user runs the tests. Format matches 113-HUMAN-UAT.md when entries land.
