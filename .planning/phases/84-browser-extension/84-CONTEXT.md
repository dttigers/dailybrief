# Phase 84: Browser Extension - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship a browser extension for Chrome and Safari that lets the user capture the current page title, URL, and an optional note to Vigil via `POST /v1/thoughts`. Popup only — no background scraping, no content scripts beyond reading the active tab. API key stored in extension storage (not hardcoded). No new server endpoints needed.

</domain>

<decisions>
## Implementation Decisions

### UI Tech Stack
- **D-01:** Build with **vanilla HTML/CSS/JS — no build step**. The extension ships as `popup.html`, `popup.js`, `popup.css`, `manifest.json`, and an optional `background.js` service worker. No bundler, no npm, no Vite. Direct file delivery to the browser.
- **D-02:** Use **Manifest V3** (current standard for both Chrome and Safari).
- **D-03:** Follow existing dark theme: `#2C2C2A` background, `#1D9E75` teal accents (matches Mac app and PWA brand).

### Claude's Discretion
- Content format for the captured thought (e.g., how title + URL are combined into the `content` field)
- Post-capture UX (success feedback, auto-close behavior)
- API key onboarding UX for first-run (inline in popup or options page)
- Exact field layout and copy in the popup
- Whether to include a category dropdown or let server default handle it
- Safari packaging approach (xcrun safari-web-extension-converter or manual)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vigil Capture API
- `vigil-pwa/src/api/client.ts` — `createThought(content)` shows the POST /v1/thoughts payload shape: `{ content, source: 'text' }`. Extension must replicate this directly (no shared code — vanilla JS).

### Brand
- `.planning/phases/80.1-pwa-brand-token-foundation/` — Teal `#1D9E75`, dark background `#2C2C2A`, Inter typeface. Extension popup should follow same visual language.

### Roadmap Phase Definition
- `.planning/ROADMAP.md` §Phase 84 — Success criteria (popup pre-fill, POST /v1/thoughts, storage.sync API key, Chrome + Safari).

</canonical_refs>

<specifics>
## Specific Ideas

- No build step is the explicit preference — the extension directory should be loadable in `chrome://extensions` with "Load unpacked" immediately, with zero setup
- Lean and minimal — this is a quick-capture tool, not a mini-app

</specifics>

<deferred>
## Deferred Ideas

None — scope is minimal and fully defined.

</deferred>

---

*Phase: 84-browser-extension*
*Context gathered: 2026-04-15*
