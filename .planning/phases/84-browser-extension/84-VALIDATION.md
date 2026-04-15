---
phase: 84
slug: browser-extension
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 84 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser testing — no unit test runner (vanilla JS, no build step) |
| **Config file** | None |
| **Quick run command** | Load unpacked in `chrome://extensions`, click extension icon |
| **Full suite command** | Manual test checklist below |
| **Estimated runtime** | ~10 minutes manual |

---

## Sampling Rate

- **After every task commit:** Load unpacked in Chrome, verify the task's acceptance criteria manually
- **After every plan wave:** Run the full manual checklist below
- **Before `/gsd-verify-work`:** Full checklist must be green in both Chrome and Safari

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | How to Verify | Status |
|---------|------|------|-------------|-----------|---------------|--------|
| T-84-01 | 84-01 | 1 | Extension loads | Manual | `chrome://extensions` > Load unpacked > no errors | ○ |
| T-84-02 | 84-01 | 1 | First-run setup | Manual | Clear storage, reopen popup — setup form shown | ○ |
| T-84-03 | 84-01 | 1 | API key stored | Manual | DevTools console: `chrome.storage.local.get(null, console.log)` | ○ |
| T-84-04 | 84-01 | 1 | Tab pre-fill | Manual | Navigate to page, open popup — title+URL present | ○ |
| T-84-05 | 84-01 | 1 | Capture POST | Manual | Network tab shows POST /v1/thoughts with 201 | ○ |
| T-84-06 | 84-01 | 1 | Success feedback | Manual | Confirmation shown after 201 | ○ |
| T-84-07 | 84-02 | 2 | Safari loads | Manual | xcrun convert + Allow Unsigned + icon appears | ○ |
| T-84-08 | 84-02 | 2 | Safari capture | Manual | Same POST flow in Safari, 201 response | ○ |

---

## Full Manual Test Checklist

### Chrome
- [ ] `chrome://extensions` > Load unpacked `vigil-extension/` — extension appears, no errors
- [ ] First-run: `chrome.storage.local.clear()` in DevTools → reopen popup → setup form shown
- [ ] Enter valid API key → Save → switches to capture form
- [ ] Enter invalid key → Save → error shown, stays on setup form
- [ ] Navigate to any page → open popup → title+URL pre-filled in textarea
- [ ] Edit note → click Capture → Network tab shows `POST https://api.vigilhub.io/v1/thoughts`, status 201
- [ ] Response body contains `{ id, content, source: "text" }`
- [ ] Success feedback visible in popup after capture
- [ ] Storage contains key: `chrome.storage.local.get(null, console.log)` → `vigil_api_key` present

### Safari
- [ ] `xcrun safari-web-extension-converter vigil-extension/` completes without error
- [ ] Xcode project builds without error
- [ ] Safari Settings > Developer > Allow Unsigned Extensions → extension icon appears in toolbar
- [ ] Same capture flow works — 201 response, thought in Vigil

---

## chrome.storage DevTools Snippets

```javascript
// Inspect all stored values (run in popup DevTools console)
chrome.storage.local.get(null, console.log)

// Clear for first-run testing
chrome.storage.local.clear()

// Manually set a key for testing
chrome.storage.local.set({ vigil_api_key: 'your-key-here' })
```

Open popup DevTools: right-click extension icon → Inspect Popup
