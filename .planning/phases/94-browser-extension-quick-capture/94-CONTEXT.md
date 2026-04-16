# Phase 94: Browser Extension Quick-Capture - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the browser extension capture UX: category feedback after triage, optional URL inclusion, keyboard shortcut, Safari build verification.

</domain>

<decisions>
## Implementation Decisions

### Category Feedback
- **D-01:** After capture succeeds, popup shows "Analyzing..." while waiting for triage (~2-3s)
- **D-02:** Once triage returns, display the category as a badge (e.g., "Task", "Therapy") before auto-closing
- **D-03:** Auto-close after showing category for ~1.5s (total: capture → analyzing → category badge → close)
- **D-04:** If triage fails or times out (5s), show "Captured!" without category and close normally

### URL Capture
- **D-05:** Checkbox below the text input: "Include page URL"
- **D-06:** When checked, append current tab's title + URL to the thought content on submit
- **D-07:** Checkbox unchecked by default (text-first capture, matches Mac quick capture)

### Submit Shortcut
- **D-08:** Cmd+Enter (Mac) / Ctrl+Enter (Windows) submits the capture form
- **D-09:** Plain Enter allows multiline typing in the textarea

### Already Completed (this session, pre-phase)
- **D-10:** Extension popup is freeform text (URL auto-prefill removed)
- **D-11:** POST /v1/thoughts has server-side auto-triage (tags + therapyClassification)
- **D-12:** Chrome extension works end-to-end

### Safari Build
- **D-13:** Verify Safari extension builds and works. If Safari requires a containing app wrapper, document the gap and defer to v3.3.

</decisions>

<canonical_refs>
## Canonical References

### Existing code
- `vigil-extension/popup.js` — current capture flow (lines 79-146)
- `vigil-extension/popup.html` — popup layout
- `vigil-extension/manifest.json` — Chrome manifest
- `vigil-core/src/routes/thoughts.ts` — POST /thoughts with auto-triage
- `vigil-core/src/routes/triage.ts` — triage endpoint (for understanding response shape)

</canonical_refs>

<code_context>
## Existing Code Insights

### Current Extension Flow
- popup.js initCaptureView: empty textarea, Capture button
- On submit: POST /v1/thoughts, show "Captured!", auto-close after 1.5s
- No triage feedback, no URL option, no keyboard shortcut for capture

### Integration Points
- After POST /thoughts returns (201), call GET /v1/triage or POST /v1/triage with the content to get category
- Or: poll the thought (GET /v1/thoughts/:id) after a short delay to get the server-side auto-triage result
- chrome.tabs.query for current tab URL/title (already used in prior version)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

- Safari extension persistence (background scripts, containing app) — deferred to v3.3

</deferred>

---

*Phase: 94-browser-extension-quick-capture*
*Context gathered: 2026-04-16*
