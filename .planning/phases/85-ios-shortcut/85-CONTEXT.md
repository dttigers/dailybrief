---
phase: 85-ios-shortcut
type: context
depends_on: [79, 84]
---

# Phase 85: iOS Shortcut — CONTEXT

## Goal (from ROADMAP)

A shareable iOS Shortcut that accepts share-sheet input (text, URL, or selected content) and posts it to Vigil as a thought. Distributed as a `.shortcut` file — no App Store required.

Success criteria:
1. Shortcut appears in iOS share sheet from any app
2. Accepts text and URL input types; POSTs to `/v1/thoughts`
3. Shows success/failure notification
4. API key and base URL are configurable inside the Shortcut (no hardcoded values)
5. Distributable as a `.shortcut` file link

## What's already decided (locked by upstream phases)

| Decision | Value | Locked by |
|---|---|---|
| Endpoint | `POST https://api.vigilhub.io/v1/thoughts` | vigil-core |
| Auth | `Authorization: Bearer {api_key}` | vigil-core |
| Payload shape | `{"content": "...", "source": "text"}` | vigil-core VALID_SOURCES |
| Content template | `{title}\n{url}\n\n{note}` when title+URL available; raw text otherwise | Phase 84 browser extension precedent |
| API base | `https://api.vigilhub.io` (user-configurable in shortcut) | Phase 84 |

Do NOT use `source: "browser"` — server rejects with 400. Valid sources are only `text`, `voice`, `image`.

## Decisions from discuss

### D-01 — API key + base URL storage

**Decision:** Two `Text` actions at the top of the Shortcut, one for `api_key`, one for `base_url`. Set as named variables via `Set Variable`. User edits once before first use.

**Rationale:** Simplest authoring experience. Shortcuts has no true per-install secure storage — "Ask for Input" doesn't persist across runs. Text-at-top matches what Shortcuts power users expect, and the user already accepts API key sprawl (per project memory: key lives in multiple config locations).

**Caveat:** If the user shares the `.shortcut` file with their key filled in, the recipient inherits the key. Install instructions MUST tell the user to blank the key text action before re-sharing. README should call this out.

### D-02 — Content format

**Decision:** Match the browser extension format.

```
{title}
{url}

{optional note typed by user}
```

When the share-sheet input is:
- **Safari webpage / URL + title:** use full template (title, URL, blank line, user note)
- **Plain text / selection:** post the text as-is, no title/URL lines
- **URL only (no title):** URL on line 1, blank, then note

User is prompted for a note with "Ask for Input" — empty note is allowed (just skip the blank line + note).

**Rationale:** Consistency with Chrome/Safari capture flow. User's cognitive model is "capture the thing I'm looking at + my reaction to it", identical across clients.

### D-03 — Distribution: BOTH iCloud link and committed file

**Decision:**
- Export `Vigil Capture.shortcut` from Shortcuts.app and commit to `vigil-ios-shortcut/`
- Also publish via Shortcuts.app → Share → Copy iCloud Link; put the URL in `vigil-ios-shortcut/README.md`
- Recipients can install either way (iCloud link = one tap; file = download + open)

**Rationale:** Redundancy at near-zero cost. Committed file survives iCloud policy changes. iCloud link is the polished install path for non-technical users.

### D-04 — Repo artifact layout

**Decision:** New top-level directory `vigil-ios-shortcut/` containing:
- `Vigil Capture.shortcut` — exported binary from Shortcuts.app
- `README.md` — install steps, iCloud link, "blank the key before sharing" warning, screenshots
- `screenshots/` — images of the Shortcut's action chain (for future edits without opening Shortcuts app)

**Rationale:** Matches `vigil-extension/` and `vigil-safari-extension/` naming convention. Keeps artifact + docs co-located.

### D-05 — Accepted share-sheet input types

**Decision (pragmatic default, not explicitly asked):** Configure the Shortcut to accept `URLs`, `Text`, and `Safari web pages`. Exclude images/files in v1 — capture API's image/voice sources would need different handling and are out of scope here.

**Rationale:** Covers the three common capture moments: "this article", "this tweet/selection", "this random bit of text I copied". Matches what phase 84's browser extension does. Image/voice capture is deferred.

### D-06 — UX: success / failure / empty guards

**Decision (pragmatic defaults):**
- **Success (HTTP 2xx):** `Show Notification` — "Captured to Vigil". No banner/haptic beyond iOS default.
- **Failure (non-2xx or network error):** `Show Notification` — "Vigil capture failed: HTTP {status_code}" or "Vigil capture failed: network error" — so the user can triage (401 vs 500 vs offline).
- **Empty content guard:** If resolved content is empty (user shared nothing + didn't type a note), `Show Notification` — "Nothing to capture" and exit without hitting the API.

**Rationale:** Matches the browser extension's error disclosure. "Show in the notification enough that the user can decide whether to reopen" — don't swallow errors.

## Reusable assets from prior phases

- **Phase 84 browser extension popup.js** — reference implementation for payload shape and content format. The Shortcut should produce the same JSON body (`{content, source: "text"}`) and the same Bearer header.
- **Phase 79 OAuth / token flow** — NOT needed. Shortcut uses user-pasted API key only; no OAuth.
- **vigil-core `/v1/thoughts` route** — unchanged contract; Shortcut just becomes another client.

## What the Plan needs to address

1. Author the Shortcut in Shortcuts.app (manual, user-driven) — list of actions in sequence
2. Export and commit `.shortcut` file + iCloud link
3. Write README with install instructions + screenshots
4. Human verification: install on iPhone, share from Safari/Notes/Messages, confirm capture in Vigil

This is largely a human-in-the-loop phase — most "tasks" are instructions for the user to execute in Shortcuts.app. The assistant's role is: prepare the step-by-step authoring guide, review the exported artifact, write the README, commit.

## Out of scope (deferred)

- iOS Shortcuts that capture images/voice (would need `source: "image"` or `"voice"` + multipart upload semantics — separate phase)
- iOS widget / Lock Screen button (deferred to a future iOS-native phase)
- iPadOS-specific integrations (same Shortcut should work; no special handling)
- Per-install secure key storage (Data Jar, Keychain via Scriptable) — keeps phase simple

## Notes for researcher / planner

- No web research needed for Shortcuts.app — Apple's action catalog is the ground truth. If researching, point at the official Shortcuts user guide and the `shortcuts://` URL scheme docs (for iCloud link format).
- Build the plan as a numbered sequence of Shortcuts-actions the user must add, in order. The plan is the authoring recipe — not executable code.
- One sensitive detail: the `Get Contents of URL` action in Shortcuts has distinct Method/Headers/Request Body configuration screens. The plan should name each setting precisely (method=POST, headers=Authorization+Content-Type, request body=JSON with content+source).
