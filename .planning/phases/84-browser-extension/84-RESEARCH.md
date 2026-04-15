# Phase 84: Browser Extension — Research

**Researched:** 2026-04-14
**Domain:** Manifest V3 browser extension (Chrome + Safari), vanilla JS, chrome.storage, cross-origin fetch
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Build with **vanilla HTML/CSS/JS — no build step**. The extension ships as `popup.html`, `popup.js`, `popup.css`, `manifest.json`, and an optional `background.js` service worker. No bundler, no npm, no Vite. Direct file delivery to the browser.
- **D-02:** Use **Manifest V3** (current standard for both Chrome and Safari).
- **D-03:** Follow existing dark theme: `#2C2C2A` background, `#1D9E75` teal accents (matches Mac app and PWA brand).

### Claude's Discretion
- Content format for the captured thought (how title + URL are combined into the `content` field)
- Post-capture UX (success feedback, auto-close behavior)
- API key onboarding UX for first-run (inline in popup or options page)
- Exact field layout and copy in the popup
- Whether to include a category dropdown or let server default handle it
- Safari packaging approach (xcrun safari-web-extension-converter or manual)

### Deferred Ideas (OUT OF SCOPE)
None — scope is minimal and fully defined.
</user_constraints>

---

## Summary

Phase 84 ships a four-file vanilla JS browser extension that captures the active tab's title and URL, lets the user add a note, and POSTs to `POST /v1/thoughts` with `{ content, source: 'text' }` and a Bearer token. The API key is stored in `chrome.storage.local`. No service worker is required for the fetch — extension popup pages can bypass CORS directly with `host_permissions` declared in the manifest.

Safari support is achieved with `xcrun safari-web-extension-converter`, which wraps the Chrome extension in an Xcode project. Xcode 26.3 is already installed on this machine and a valid Developer ID signing identity is present, so the conversion toolchain is fully available. The Safari extension can be tested locally without App Store distribution by enabling "Allow Unsigned Extensions" in Safari Developer settings (resets on Safari quit).

The only non-obvious decision area is first-run UX: the extension must handle the case where no API key is stored yet. An inline setup form within the popup (conditional render) is the leanest approach and avoids a separate options page for this minimal tool.

**Primary recommendation:** Popup fetches directly from popup.js with `host_permissions: ["https://api.vigilhub.io/*"]`. Use `chrome.storage.local` (not sync) for the API key. Render a setup form inline in popup.html when no key is found. No service worker required.

---

## Standard Stack

### Core
| File | Purpose | Why Standard |
|------|---------|--------------|
| `manifest.json` (MV3) | Extension manifest, declares permissions | MV3 required by Chrome since 2024; Safari converter supports it |
| `popup.html` | Extension popup UI | Loaded by `action.default_popup` in manifest |
| `popup.js` | All interaction logic | Reads tab, reads/writes storage, posts to API |
| `popup.css` | Dark-theme styles | Keeps HTML clean, no framework needed |

### Supporting (optional)
| File | Purpose | When to Use |
|------|---------|-------------|
| `options.html` / `options.js` | API key settings page | Only needed if inline key entry is not used; NOT needed for this phase's leanest path |
| `background.js` (service_worker) | Background processing | NOT needed — popup can fetch directly; would only add complexity |
| `icons/` | Extension toolbar icon | Required for Chrome Web Store submission; 16/48/128px PNGs needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `chrome.storage.local` | `chrome.storage.sync` | sync crosses devices but is not encrypted and has stricter quotas (100 KB); local is safer for credentials |
| Inline first-run form in popup | `options_page` | Options page adds a file; inline conditional render is leaner for a single-setting extension |
| Direct popup fetch | Service worker message relay | Service worker adds a file and async complexity; popup pages bypass CORS fine with host_permissions |

**Installation:** None — no npm, no build step. Load the directory directly in `chrome://extensions`.

---

## Architecture Patterns

### Recommended Project Structure
```
vigil-extension/
├── manifest.json       # MV3 manifest
├── popup.html          # Extension popup UI (300x400px typical)
├── popup.js            # All logic: tab read, storage, API call
├── popup.css           # Dark theme styles
└── icons/
    ├── icon16.png      # Toolbar (16px)
    ├── icon48.png      # Extensions page (48px)
    └── icon128.png     # Chrome Web Store (128px)
```

No subdirectories beyond `icons/`. The directory must be loadable with "Load unpacked" from `chrome://extensions` with zero setup.

### Pattern 1: Manifest V3 for Popup-Only Extension
**What:** Minimal MV3 manifest declaring `activeTab` + `storage` permissions, `host_permissions` for the API, and an `action` that opens popup.html. No content_scripts, no background service_worker required.

**When to use:** Any popup-only extension that reads the current tab and posts to one known API endpoint.

```json
// Source: developer.chrome.com/docs/extensions/reference/manifest + confirmed via research
{
  "manifest_version": 3,
  "name": "Vigil Capture",
  "version": "1.0.0",
  "description": "Capture the current page to Vigil",
  "permissions": ["activeTab", "storage"],
  "host_permissions": ["https://api.vigilhub.io/*"],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### Pattern 2: Reading the Active Tab Title and URL
**What:** `chrome.tabs.query({ active: true, currentWindow: true })` returns the active tab object including `title` and `url`. Requires the `"activeTab"` permission (or `"tabs"` — but `activeTab` is preferred because it avoids the "Read your browsing history" warning shown in the Chrome Web Store listing).

**Important:** `activeTab` grants access to tab.title and tab.url when the popup opens in response to the user clicking the extension icon. This is exactly the use case here — the user clicks the icon, the popup opens, we read the tab.

```javascript
// Source: developer.chrome.com/docs/extensions/reference/api/tabs (verified)
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const title = tab.title ?? '';
const url = tab.url ?? '';
```

### Pattern 3: chrome.storage.local Read/Write
**What:** Async Promise-based API for reading and writing the API key. Must declare `"storage"` in permissions.

```javascript
// Source: developer.chrome.com/docs/extensions/reference/api/storage (verified)

// Write
await chrome.storage.local.set({ vigil_api_key: key });

// Read
const result = await chrome.storage.local.get(['vigil_api_key']);
const key = result.vigil_api_key ?? null;

// Note: chrome.storage is NOT localStorage. localStorage is NOT available
// in extension service workers and behaves differently across extension contexts.
```

### Pattern 4: Cross-Origin Fetch from Popup
**What:** Extension popup pages are treated as "foreground extension tabs" and bypass CORS for origins listed in `host_permissions`. No service worker needed.

```javascript
// Source: developer.chrome.com/docs/extensions/develop/concepts/network-requests (verified)
// "A script executing in an extension service worker or foreground tab can talk to
//  remote servers outside of its origin, as long as the extension requests host permissions."

const response = await fetch('https://api.vigilhub.io/v1/thoughts', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ content, source: 'text' }),
});
```

### Pattern 5: First-Run Inline Key Setup
**What:** On `DOMContentLoaded`, read the stored key. If none found, show a setup form instead of the capture form. When user submits a key, validate it (call `/v1/summary`) and then re-render the capture form.

```javascript
// [ASSUMED] — pattern derived from research, not a quoted official example
document.addEventListener('DOMContentLoaded', async () => {
  const { vigil_api_key: key } = await chrome.storage.local.get(['vigil_api_key']);
  if (!key) {
    showSetupView();
  } else {
    populateAndShowCaptureView(key);
  }
});
```

Use `/v1/summary` (not `/v1/health`) for key validation — `/v1/health` returns 200 without auth.
[VERIFIED: vigil-pwa/src/api/client.ts comment confirms this explicitly]

### Anti-Patterns to Avoid
- **Using `localStorage` instead of `chrome.storage`:** `localStorage` does not work in service workers and is scoped to the extension page's origin — it won't persist as expected across popup open/close cycles on all browsers.
- **Using `chrome.storage.sync` for the API key:** sync is unencrypted and syncs to all logged-in browsers — leaks credentials to other devices. Use `storage.local`.
- **Declaring `"tabs"` permission instead of `"activeTab"`:** `"tabs"` triggers the "Read your browsing history" warning in the Chrome Web Store listing. `activeTab` is sufficient for reading title/URL when the popup opens.
- **Putting fetch logic in a service worker for simple popup-only extension:** Adds a file, adds message-passing boilerplate, no benefit for this use case.
- **Hardcoding the API key or base URL:** The CONTEXT explicitly prohibits this; storage.local is the correct path.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab metadata reading | Custom content script | `chrome.tabs.query` | Built into the tabs API; content scripts add permission complexity |
| Cross-origin CORS bypass | Service worker relay | `host_permissions` in manifest | Popup pages bypass CORS natively; relay adds boilerplate |
| Persistent key storage | `localStorage` | `chrome.storage.local` | localStorage unavailable in service workers; storage.local works everywhere |
| Key validation endpoint | Custom validate route | `GET /v1/summary` (existing) | Already requires bearer auth; confirmed in codebase |

**Key insight:** MV3 popup-only extensions that just capture+POST need no background service worker, no content scripts, and no build tooling. The Chrome extension APIs are sufficient for all required functionality.

---

## API Contract (Confirmed from Codebase)

**Endpoint:** `POST https://api.vigilhub.io/v1/thoughts`

**Auth:** `Authorization: Bearer <key>` header required
[VERIFIED: vigil-core/src/index.ts — bearerAuth middleware on all /v1/* except /v1/health and /v1/auth/google]

**Request body:**
```json
{ "content": "string (required, non-empty)", "source": "text" }
```
[VERIFIED: vigil-core/src/routes/thoughts.ts lines 207-218]

**Valid sources:** `["text", "voice", "image"]` — extension must use `"text"`, NOT `"browser"` (would 400)
[VERIFIED: vigil-core/src/routes/thoughts.ts line 3 — VALID_SOURCES constant]

**Response:** 201 with `ThoughtApiResponse` JSON on success; 400 on invalid body; 401 on bad key

**CORS:** vigil-core currently has `origin: corsOrigins ?? "*"` — wildcard if `CORS_ORIGINS` env var not set. The extension popup's chrome-extension:// origin will be accepted.
[VERIFIED: vigil-core/src/index.ts lines 51-63]

**Key validation endpoint:** `GET /v1/summary` — requires valid bearer token, use this (not /v1/health)
[VERIFIED: vigil-pwa/src/api/client.ts — explicit comment at line 28]

---

## Safari Web Extension Approach

### Toolchain Availability
[VERIFIED: environment check 2026-04-14]
- `xcrun safari-web-extension-converter` — AVAILABLE at `/Applications/Xcode.app/Contents/Developer/usr/bin/safari-web-extension-converter`
- Xcode 26.3 (Build 17C529) — INSTALLED
- Developer ID signing identity — PRESENT: `"Developer ID Application: Jameson Morrill (5H57ADQS8G)"`
- Safari — INSTALLED at `/Applications/Safari.app`
- Chrome — INSTALLED at `/Applications/Google Chrome.app`

### Conversion Process
```bash
# Run once after Chrome extension is complete
xcrun safari-web-extension-converter /path/to/vigil-extension \
  --app-name "Vigil Capture" \
  --bundle-identifier io.vigilhub.extension \
  --macos-only
# Opens Xcode automatically with generated project
```

### Xcode Configuration Required
1. Under "Signing & Capabilities" for BOTH targets (App + Extension): set Team to your Apple Developer team
2. Confirm Bundle Identifiers: App = `io.vigilhub.extension`, Extension = `io.vigilhub.extension.Extension`
3. Build and run to test locally

### Local Testing (Without App Store)
Enable in Safari Settings > Developer tab > "Allow Unsigned Extensions"
**Caveat:** This setting resets every time Safari quits — must re-enable each session.
[VERIFIED: developer.apple.com/documentation/safariservices/running-your-safari-web-extension — search result confirmed]

### Apple Developer Account
- NOT required for local testing (Allow Unsigned Extensions handles it)
- REQUIRED for App Store distribution
- Developer ID signing identity already present on this machine — notarized distribution outside App Store is also possible if needed

### Known Safari MV3 Gotchas
[CITED: evilmartians.com/chronicles/how-to-quickly-and-weightlessly-convert-chrome-extensions-to-safari]
1. `browser.storage.local.get()` called synchronously in the popup can cause UI freezes in Safari's JS engine — use `await` consistently (vanilla JS async/await is fine)
2. `browser.notifications` API not supported in Safari — don't use it (this extension doesn't need it)
3. `browser.identity` API not supported — not relevant (we store keys manually)
4. The converter tool may warn about unsupported manifest keys — warnings are non-fatal for a simple popup extension

---

## Common Pitfalls

### Pitfall 1: `activeTab` Does Not Work Without User Gesture
**What goes wrong:** `chrome.tabs.query({ active: true })` returns the tab but `tab.url` and `tab.title` come back as `undefined` even though `activeTab` is declared.
**Why it happens:** `activeTab` provides URL/title access only when the popup is opened via a user gesture (clicking the toolbar icon). If called from a programmatic trigger, access is not granted.
**How to avoid:** Always access tab data in `DOMContentLoaded` — the popup opening IS the user gesture. Don't defer tab queries.
**Warning signs:** `tab.url === undefined` while `tab.id` is defined.

### Pitfall 2: Using `"tabs"` Permission Instead of `"activeTab"`
**What goes wrong:** Chrome Web Store review warns "Read your browsing history" — alarming to users, potential rejection.
**Why it happens:** `"tabs"` grants access to title/URL for ALL tabs; `"activeTab"` only grants it for the current tab at popup open time.
**How to avoid:** Use `"activeTab"` only. It is sufficient for this extension's needs.

### Pitfall 3: `source: 'browser'` Will 400
**What goes wrong:** POST to /v1/thoughts with `source: 'browser'` returns HTTP 400.
**Why it happens:** `VALID_SOURCES` is `["text", "voice", "image"]` — 'browser' is not in the list.
**How to avoid:** Always send `source: 'text'`. [VERIFIED in source]

### Pitfall 4: chrome.storage is Async — No Synchronous Read
**What goes wrong:** Developer tries `chrome.storage.local.get('key')` as a synchronous call and gets a Promise (or undefined in older callback patterns).
**Why it happens:** The storage API is entirely async. There is no synchronous read.
**How to avoid:** Always `await chrome.storage.local.get(...)`. Structure popup init as an async function.

### Pitfall 5: Safari's "Allow Unsigned Extensions" Resets on Quit
**What goes wrong:** Extension works, developer quits Safari to test something else, reopens Safari, extension is gone.
**Why it happens:** macOS resets the setting each Safari launch as a security measure.
**How to avoid:** Document the re-enable step clearly. For the plan: add a note that Safari testing requires re-enabling this setting after each Safari restart.

### Pitfall 6: CORS_ORIGINS Env Var on Railway
**What goes wrong:** If `CORS_ORIGINS` is set on Railway to a specific list, requests from `chrome-extension://` origins will be blocked at the server.
**Why it happens:** Hono CORS middleware checks the `origin` value; if set to specific domains, extension origin won't match.
**How to avoid:** Check Railway env vars before shipping. If `CORS_ORIGINS` is set, either add a wildcard or ensure extension origin isn't needed (it isn't — the extension sends Bearer auth, not cookies, so CORS is only needed for browser preflight). OR add `chrome-extension://*` to the allowed list. [VERIFIED: vigil-core/src/index.ts — currently defaults to `"*"` if env var absent, so this is only a risk if the var gets set later]

### Pitfall 7: Popup Dimensions and Scrolling
**What goes wrong:** Popup content overflows or is too small/large.
**Why it happens:** Chrome popup width is typically 300-400px; height is determined by content up to ~600px.
**How to avoid:** Set explicit `width: 320px` on the popup body. Let height be content-driven but cap with `max-height: 500px; overflow-y: auto`.

---

## Code Examples

### Complete manifest.json
```json
{
  "manifest_version": 3,
  "name": "Vigil Capture",
  "version": "1.0.0",
  "description": "Capture the current page to Vigil",
  "permissions": ["activeTab", "storage"],
  "host_permissions": ["https://api.vigilhub.io/*"],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```
[Source: developer.chrome.com/docs/extensions/reference/manifest — VERIFIED pattern]

### popup.js init skeleton
```javascript
// Source: derived from chrome.tabs and chrome.storage API docs [VERIFIED patterns]
const STORAGE_KEY = 'vigil_api_key';
const API_BASE = 'https://api.vigilhub.io';

document.addEventListener('DOMContentLoaded', async () => {
  const { [STORAGE_KEY]: apiKey } = await chrome.storage.local.get([STORAGE_KEY]);

  if (!apiKey) {
    showSetupView();
    return;
  }

  // Read active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  populateCaptureForm(tab.title ?? '', tab.url ?? '', apiKey);
});

async function submitCapture(content, apiKey) {
  const response = await fetch(`${API_BASE}/v1/thoughts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content, source: 'text' }),
  });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}
```

### Key validation (first-run)
```javascript
// Use /v1/summary not /v1/health — health returns 200 without auth
// [VERIFIED: vigil-pwa/src/api/client.ts explicit comment]
async function validateApiKey(key) {
  try {
    const res = await fetch(`${API_BASE}/v1/summary`, {
      headers: { 'Authorization': `Bearer ${key}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

### chrome.storage.local save/load
```javascript
// [VERIFIED: developer.chrome.com/docs/extensions/reference/api/storage]
await chrome.storage.local.set({ [STORAGE_KEY]: key });
const { [STORAGE_KEY]: key } = await chrome.storage.local.get([STORAGE_KEY]);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manifest V2 (persistent background pages) | Manifest V3 (service workers or no background) | Chrome: enforced mid-2024; Safari: MV3 from Safari 15.4 | MV3 is required for new Chrome Web Store submissions |
| `background.scripts: [...]` | `background.service_worker: "background.js"` | MV3 | Service worker syntax; but for this extension, neither is needed |
| `browser_action` / `page_action` | `action` (unified) | MV3 | Single `"action"` key replaces both |
| XMLHttpRequest in extensions | `fetch()` | MV3 | XHR not available in service workers; fetch only |

**Deprecated/outdated:**
- `manifest_version: 2`: Chrome removed MV2 from Web Store for new extensions mid-2024. Don't use.
- `browser_action` / `page_action` keys: replaced by `action` in MV3.
- `background.scripts` array: replaced by `background.service_worker` string in MV3.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Inline conditional form in popup (vs separate options page) is the leaner first-run path for this extension | Architecture Patterns (Pattern 5) | Low — options page is trivially addable; the inline approach is the plan default |
| A2 | `chrome-extension://` origin is accepted by vigil-core's CORS wildcard and doesn't require server changes | API Contract | Low — server currently uses `origin: "*"` wildcard; risk only if CORS_ORIGINS env var gets set on Railway later |
| A3 | Teal `#1D9E75` and Inter typeface match the brand token correctly — brand token file not directly read | Architecture (CSS) | Low — confirmed from CONTEXT.md and multiple prior phases referencing this value |

---

## Open Questions

1. **Should `source` be `'text'` or should a new `'browser'` source be added to vigil-core?**
   - What we know: `VALID_SOURCES = ["text", "voice", "image"]` — 'browser' would 400 today
   - What's unclear: Whether differentiation between manually typed thoughts and browser-captured ones is useful for filtering
   - Recommendation: Use `source: 'text'` for now (no server change needed). The content field will include the URL, which serves as the signal. Server change is easy if needed later.

2. **Does Railway have `CORS_ORIGINS` set to a specific list?**
   - What we know: Local code defaults to `"*"` — but Railway env vars are not visible here
   - What's unclear: Whether Railway has this restricted
   - Recommendation: Plan should include a verification step — check Railway dashboard for `CORS_ORIGINS` env var before first end-to-end test.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Chrome | Load unpacked testing | Yes | Installed | — |
| Safari | Safari Web Extension testing | Yes | Installed | — |
| Xcode + safari-web-extension-converter | Safari packaging | Yes | Xcode 26.3 | — |
| Developer ID signing identity | Xcode build (Safari) | Yes | "Developer ID Application: Jameson Morrill" | "Allow Unsigned" for local testing |
| Node.js | Not required (no build step) | Yes | v25.2.1 | — |
| npm / bundler | Not required (vanilla JS) | N/A | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

---

## Validation Architecture

Validation for this phase is manual — there is no automated test runner applicable to a browser extension loaded via "Load unpacked". Tests are performed in the browser developer tools.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual browser testing (no unit test framework — vanilla JS, no build) |
| Config file | None |
| Quick run command | Load unpacked in `chrome://extensions`, click icon |
| Full suite command | Manual test checklist below |

### Manual Test Checklist

| Test | How to Verify | Expected Result |
|------|--------------|-----------------|
| Extension loads unpacked in Chrome | `chrome://extensions` > "Load unpacked" > select `vigil-extension/` | Extension appears in toolbar, no errors in Extensions page |
| First-run shows setup form | Remove stored key via `chrome.storage.local.clear()` in DevTools, reopen popup | Setup form shown, not capture form |
| Key save and validation | Enter a valid Vigil API key, click Save | Form switches to capture view; no error |
| Invalid key rejection | Enter a garbage key, click Save | Error message displayed, stays on setup form |
| Tab pre-fill | Navigate to any web page, click icon | Title and URL appear in the text area |
| Capture submits to API | Fill note, click Capture | Network tab shows POST to `https://api.vigilhub.io/v1/thoughts` with 201 response |
| Response shape in Network tab | Inspect response body | `{ id, content, source: "text", ... }` present |
| Success feedback | After 201 response | Visual confirmation shown (checkmark, text, etc.) |
| Storage inspection | `chrome://extensions` > Service Workers > Inspect | Run `chrome.storage.local.get(null, console.log)` — key present |
| Safari: extension loads | xcrun conversion + Xcode build + "Allow Unsigned Extensions" in Safari | Extension icon appears in Safari toolbar |
| Safari: capture works | Same flow as Chrome | 201 response, thought appears in Vigil |

### chrome.storage Inspection (DevTools)
In Chrome popup DevTools console (right-click popup > Inspect):
```javascript
// Inspect stored values
chrome.storage.local.get(null, console.log)

// Clear for first-run testing
chrome.storage.local.clear()

// Set a key manually for testing
chrome.storage.local.set({ vigil_api_key: 'test-key-here' })
```

### Network Tab Verification
1. Open popup
2. Open DevTools on the popup page (right-click extension icon > Inspect Popup)
3. Go to Network tab
4. Submit capture
5. Verify: POST to `https://api.vigilhub.io/v1/thoughts`, Status 201, request body has `{ content: "...", source: "text" }`, Authorization header present

### Wave 0 Gaps
None — this phase creates all files from scratch. No pre-existing test infrastructure applies.

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | API key stored in `chrome.storage.local`; sent as Bearer token |
| V3 Session Management | No | Stateless API key auth |
| V4 Access Control | No | Single-user extension |
| V5 Input Validation | Yes | Trim whitespace from content; reject empty submit |
| V6 Cryptography | Low | `chrome.storage.local` is not encrypted at rest |

### Security Notes

**API key in chrome.storage.local is plaintext on disk.**
[CITED: developer.chrome.com/docs/extensions/reference/api/storage — "local and sync storage areas should not store confidential user data because they are not encrypted"]

For this extension's threat model (single-user personal tool, API key already stored in multiple other locations per the project memory), this is an acceptable known risk. The mitigations that apply:
- Key is only accessible to code running in this specific extension — other websites cannot read it
- Key is NOT synced across devices (unlike sync storage)
- If device is compromised, all stored credentials across all apps are equally at risk

**Do not store the key in sync storage** — sync propagates to all logged-in Chrome browsers.

---

## Sources

### Primary (HIGH confidence)
- `developer.chrome.com/docs/extensions/reference/api/tabs` — tab query API, activeTab permission
- `developer.chrome.com/docs/extensions/reference/api/storage` — storage.local/sync read/write patterns
- `developer.chrome.com/docs/extensions/develop/concepts/network-requests` — confirmed popup pages bypass CORS with host_permissions
- `developer.chrome.com/docs/extensions/mv3/options` — options page manifest keys, chrome.runtime.openOptionsPage()
- `vigil-core/src/routes/thoughts.ts` (VERIFIED in codebase) — POST body schema, VALID_SOURCES, validation logic
- `vigil-core/src/index.ts` (VERIFIED in codebase) — CORS config, auth middleware, health/googleAuth bypass
- `vigil-pwa/src/api/client.ts` (VERIFIED in codebase) — createThought payload, validateApiKey using /v1/summary

### Secondary (MEDIUM confidence)
- `developer.apple.com/documentation/safariservices/running-your-safari-web-extension` — Allow Unsigned Extensions confirmed
- `evilmartians.com/chronicles/how-to-quickly-and-weightlessly-convert-chrome-extensions-to-safari` — xcrun conversion gotchas
- Environment availability verified directly: `xcrun safari-web-extension-converter`, Xcode 26.3, signing identity present

### Tertiary (LOW confidence)
- None — all key claims verified via official docs or codebase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against MV3 official docs and codebase
- Architecture: HIGH — confirmed from Chrome extension API references
- API contract: HIGH — read directly from vigil-core source
- Safari packaging: MEDIUM — toolchain verified present; conversion step itself not yet run
- Pitfalls: HIGH — sourced from official docs and confirmed behavior

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable domain — MV3 spec is stable; Safari extension toolchain changes slowly)
