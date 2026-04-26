---
phase: 114
requirement: EXT-02
status: verified
source:
  - 114-VALIDATION.md
  - 114-CONTEXT.md
  - 114-RESEARCH.md
created: 2026-04-26
tested_by: jamesonmorrill1@gmail.com
rebuild_sha: 1076fa7364d64079cecb4251a7991be83bd98f0c
rebuild_time: 2026-04-26T16:24:51Z
tested_on: 2026-04-26
sc1_status: PASS
sc2_status: PASS
sc3_status: PASS
sc4_status: PASS
sc5_status: PASS
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

- [x] Safari extension still enabled after Safari quit+reopen (Pitfall 1 — Safari aggressively caches; full quit is required).
- [x] Popup opens with empty textarea, focus on textarea (SC#1).
- [x] "Include page URL" checkbox visible, UNCHECKED by default (SC#2 + D-07).
- [x] "Cmd+Enter to capture" shortcut hint visible (SC#3 visual).
- [x] ⌘+Enter submits the capture without clicking the button (SC#3 functional).
- [x] Success area renders "Analyzing..." then transitions to "✓ Captured!" + category-badge pill within 5 seconds (SC#4 success path D-09).
- [ ] If category never arrives in 5 seconds: success area renders "✓ Captured!" with NO badge, then closes (SC#4 timeout path D-10) — note this in observed if hit.
- [x] Second test: checked-checkbox capture has `\n\n${title}: ${url}` appended in the resulting thought (SC#2 + D-06 verbatim format).

### Observed

- Run timestamp: 2026-04-26T18:12 UTC (immediately after Phase 113 UAT closeout, same iMac session)
- Safari version: current (macOS Sequoia 24.6.0 default Safari, per system config)
- macOS version: Darwin 24.6.0 (Sequoia)
- Popup opened: [x] yes — clicked Vigil Capture toolbar icon after Safari ⌘Q + reopen
- Textarea empty + focused: [x] yes — no auto-prefill, cursor visible in textarea
- Checkbox default unchecked: [x] yes
- "Cmd+Enter to capture" hint visible: [x] yes
- ⌘+Enter submitted (no mouse click): [x] yes — typed `phase 114 uat smoke test`, ⌘+Enter, popup advanced
- Time from submit to category-badge appearing (seconds): <5s (D-09 success path — SC#4 timeout path D-10 not exercised in this run)
- Category-badge text rendered: yes — observed during smoke test (specific category text not transcribed, but the colored pill rendered as expected per D-09)
- Second test: URL appended in thought body: [x] yes — DB confirms thought id=625, content_len=59:
  ```
  url append test
  
  Hacker News: https://news.ycombinator.com/
  ```
  Verbatim D-06 format `\n\n${tab.title}: ${tab.url}` (the two newlines are preserved at the data layer; PWA's display layer collapses them due to a separate, pre-existing `whitespace-pre-line` omission in `vigil-pwa/src/components/ThoughtRow.tsx:399` — captured as a v3.7 todo, NOT a Phase 114 issue).

**Result:** [x] PASS  [ ] FAIL  [ ] DEFERRED

> ### Notable findings during SC#5 testing
>
> **PWA thought-display whitespace collapse** — Phase 114's URL append D-06 stores
> the verbatim `\n\n${title}: ${url}` format correctly at the database layer
> (DB confirms 2 newlines, content_len=59 chars for thought id=625). However,
> the PWA's `ThoughtRow.tsx:399` renders `{thought.content}` inside a `<p>` tag
> without a `whitespace-pre-line` Tailwind class, so the browser's default
> HTML whitespace-collapse rules turn the two newlines into a single space
> visually. **This is NOT a Phase 114 bug** — the contract is "popup.js appends
> the verbatim format on submit", and that's exactly what landed in the DB.
> The display issue predates Phase 114 (Phase 50/53 era component) and affects
> any multi-line thought equally (Chrome extension, voice transcripts,
> multi-paragraph notes). Captured as a one-line v3.7 fix in
> `.planning/todos/pending/2026-04-26-thoughtrow-collapses-newlines.md` (commit
> `9c55649`).

---

## Sign-off

Complete after both SC sections are filled in.

- [x] SC#3 PASS — Plan 01 SUMMARY captured `metaKey: true` empirically; probe code reverted from popup.js.
- [x] SC#5 PASS — Safari restart preserved extension; all four quick-capture parity behaviors (empty textarea, checkbox, Cmd+Enter, triage badge) verified live on physical Mac hardware.
- [x] No regressions in Phase 107 behaviors: container app launches, extension remains enabled across Safari quit+reopen (Pitfall 1 verified). Optional reboot-then-reopen smoke not re-run this session (Phase 107's own UAT already covered the reboot persistence, and the rebuilt `.app` carries forward Phase 107's `SMAppService.mainApp.register()` wiring per CODE_SIGN_STYLE = Automatic at pbxproj lines 433/468/505/547).
- [x] Status updated to `verified` in this file's frontmatter.
- [ ] Phase 114 closure committed (pending — this commit).

Any failures: open a fix branch, document the failure mode below, and re-execute the affected SC after the fix lands. Per D-05, an SC#3 probe failure (metaKey: false or no event fires) requires a stop+replan, not a silent fallback.

Any deferred items: log to `.planning/phases/114-safari-extension-quick-capture-parity/deferred-items.md` with rationale.

## Gaps

# No gaps until user runs the tests. Format matches 113-HUMAN-UAT.md when entries land.
