# Phase 114: Safari Extension Quick-Capture Parity - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Bring the Safari extension popup ([vigil-safari-extension/Vigil Capture Extension/Resources/](../../../vigil-safari-extension/Vigil%20Capture%20Extension/Resources/)) to Chrome Phase 94 quick-capture feature parity:

1. Empty freeform textarea (no auto-prefill of tab title/URL), focus on textarea
2. "Include page URL" checkbox that appends current tab URL+title on submit when checked
3. Cmd+Enter keyboard shortcut submits — verified empirically in Safari **before** any implementation code
4. Triage feedback badge after capture (poll `GET /v1/thoughts/:id` up to 5s for `category`, replace static "Captured!" with `✓ Captured! [Category]`)
5. Re-sign extension via Xcode rebuild, `spctl --assess` passes, extension survives Safari restart on physical Mac hardware

The line-level diff between Chrome's [vigil-extension/popup.{html,js,css}](../../../vigil-extension/) and Safari's current popup files is small and self-contained. This is a near-direct port with one explicit empirical gate (SC#3).

**Out of scope** (deferred to v3.7):
- EXT-03: JWT migration off hardcoded `vk_` bearer tokens
- AUTH-12/13/14: email-change, sign-out-all-sessions, passkeys

</domain>

<decisions>
## Implementation Decisions

### Code-share strategy

- **D-01:** Keep Chrome and Safari popup files as **duplicate copies**. No symlinks, no shared `ext-shared/` dir, no build-time copy step. The two trees are ~200 lines each; lockstep is maintained by hand. Solo-dev velocity > infra purity for v3.6.
- **D-02:** Add a one-line header comment to all 6 popup files (3 Chrome + 3 Safari): `// Keep in lockstep with ../vigil-extension/popup.{html,js,css}` (and reverse on Chrome side). Cheap drift reminder — no tooling, no CI.

### Cmd+Enter empirical gate (SC#3)

- **D-03:** **Plan 01 = throwaway probe**, ahead of any real implementation:
  - Add a temporary `keydown` logger to current `vigil-safari-extension/Vigil Capture Extension/Resources/popup.js` that logs `event.metaKey`, `event.ctrlKey`, `event.key` to extension console
  - `xcodebuild` rebuild → open extension popup in Safari → user presses ⌘+Enter → observes log
  - Revert probe code (commit revert in same Plan 01)
  - **Plan 01 SUMMARY.md** captures observed event shape verbatim
  - Plans 02+ are blocked until Plan 01 passes
- **D-04:** **Probe success bar:** `metaKey: true` fires when ⌘ is held during the keydown. The Chrome handler keys off `e.metaKey || e.ctrlKey`; if Safari fires `metaKey` truthy on ⌘+Enter, parity port is unblocked. (Newline-suppression, popup-chrome-conflict, and Ctrl+Enter are explicitly NOT gating concerns — they're non-blockers.)
- **D-05:** **Probe failure path = stop + replan.** No silent autopilot fallback. If `metaKey` doesn't fire, Plan 01 SUMMARY.md records the failure mode and the phase pauses. User then decides: (a) accept a different shortcut, (b) drop SC#3, or (c) investigate WebKit-specific event handling. No `e.getModifierState('Meta')` fallback shipped without explicit go-ahead.

### URL append format (SC#2)

- **D-06:** **Verbatim Chrome format:** when checkbox is checked, append `\n\n${tab.title || 'Page'}: ${tab.url}` to content on submit. Triage classifier server-side has been seeing this exact format from Chrome since Phase 94 — zero regression risk on category accuracy.
- **D-07:** Default checkbox state = **unchecked**. Chrome parity. No persistence across popup opens (every popup open starts unchecked). Quick-capture is text-first; URL is opt-in per capture.

### Triage badge UX (SC#4)

- **D-08:** **Polling cadence verbatim from Chrome:** 800ms `setInterval`, 5s overall timeout, `GET /v1/thoughts/:id` per poll, look for `updated.category` in response body.
- **D-09:** **Success path:** when `category` field appears, clear interval, render `<span class="checkmark">✓</span> Captured! <span class="category-badge">${Capitalize(category)}</span>`, then `setTimeout(window.close, 1500)`. Capitalization = `cat.charAt(0).toUpperCase() + cat.slice(1)` (Chrome line 170).
- **D-10:** **Timeout path (5s, no category):** render plain `<span class="checkmark">✓</span> Captured!` (no badge), then `setTimeout(window.close, 1500)`. Match Chrome behavior at [popup.js:157-159](../../../vigil-extension/popup.js#L157-L159).
- **D-11:** **Badge styling = verbatim Chrome CSS.** Copy `.category-badge`, `.analyzing`, `.shortcut-hint`, and `.url-toggle` rules from [vigil-extension/popup.css](../../../vigil-extension/popup.css) into Safari popup.css. Vigil teal `#1D9E75` brand color, no tuning.

### Carry-forward from prior phases (applied without re-asking)

- **D-12:** Hardware-dependent SC#5 (re-sign + `spctl --assess` + Safari-restart-on-physical-Mac) → captured in `114-HUMAN-UAT.md` following the Phase 107 + Phase 113 precedent. Phase ships when code/automated SCs pass; SC#5 stays open as a UAT item that surfaces in `/gsd-progress` until you reboot/restart and confirm.
- **D-13:** **Re-sign = `xcodebuild` rebuild only.** Phase 107 already wired automatic code signing in [vigil-safari-extension/Vigil Capture.xcodeproj/project.pbxproj](../../../vigil-safari-extension/Vigil%20Capture.xcodeproj/project.pbxproj) (`CODE_SIGN_STYLE = Automatic`). Rebuilding the `.app` re-signs the extension `.appex` automatically. No separate `codesign` step.
- **D-14:** **`chrome.*` namespace stays.** Current Safari popup.js already uses `chrome.tabs.query` and `chrome.storage.local.get` and works (see [popup.js:86, 159](../../../vigil-safari-extension/Vigil%20Capture%20Extension/Resources/popup.js)). No `browser.*` migration. Out of scope.

### SC#5 reword — codesign instead of spctl (added 2026-04-26 from RESEARCH.md Open Q1)

- **D-15:** **SC#5 verifies via `codesign --verify --deep --strict`, NOT `spctl --assess`.** Phase 114 RESEARCH.md empirically verified that `spctl --assess --type execute|install|open` **rejects** Apple Development-signed builds by design — only Developer ID + notarization passes Gatekeeper. Local development signing (Phase 107's automatic-signing path) cannot satisfy `spctl`. ROADMAP.md SC#5 reworded accordingly: re-sign via `xcodebuild`, then `codesign --verify --deep --strict /path/to/Vigil Capture.app` exits 0. `spctl --assess` deferred to a future phase (v3.7+, likely tied to TestFlight/distribution work where Developer ID + notarization are in scope anyway).
- **D-16:** **`xcodebuild clean build` (not just `build`) for Plan 01 throwaway probe and Plan 04 final rebuild.** RESEARCH.md Open Q2 — clean rebuild eliminates `Resources/*` staleness bugs at ~30s cost. Worth it for the load-bearing probe (D-03) and the final UAT artifact.

### Claude's Discretion

- Exact Plan numbering / split (e.g., whether HTML + CSS is one plan or two; whether the throwaway probe revert lives in Plan 01 or extends to Plan 02; whether re-sign verification is its own plan).
- Whether to add a `scripts/verify-phase-114.sh` following the Phase 107.3 precedent (probably yes — it can grep `popup.js` for the keydown handler, grep `popup.html` for the checkbox `id="include-url"`, run `spctl --assess` on the rebuilt `.app`).
- Exact wording of the header comment in D-02.
- Exact log format inside the throwaway probe (e.g., `console.log({metaKey, ctrlKey, key})` vs `console.log('keydown', e.metaKey, e.ctrlKey, e.key)`).
- Whether to wrap the `keydown` listener registration to remove the listener if the popup re-renders (probably no — popup is single-shot per open).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 114: Safari Extension Quick-Capture Parity" — goal, 5 success criteria, no-deps status
- `.planning/REQUIREMENTS.md` §EXT-02 — acceptance text: "Safari extension popup offers Chrome Phase 94 quick-capture parity — freeform text input, optional 'Include page URL' checkbox, Cmd+Enter, triage feedback badge — verified working on physical Mac hardware"

### Chrome reference (source-of-truth for parity)
- `vigil-extension/popup.html` (47 lines) — checkbox at line 35, shortcut hint at line 37, dynamic `<span id="success-text">` at line 40
- `vigil-extension/popup.js` (205 lines) — empty textarea init [popup.js:86-88](../../../vigil-extension/popup.js#L86-L88), keydown handler [popup.js:91-96](../../../vigil-extension/popup.js#L91-L96), URL append [popup.js:107-115](../../../vigil-extension/popup.js#L107-L115), triage poll [popup.js:152-176](../../../vigil-extension/popup.js#L152-L176)
- `vigil-extension/popup.css` — `.url-toggle`, `.category-badge`, `.shortcut-hint`, `.analyzing` rules at the end of the file (visible in diff: 37 lines unique to Chrome side)
- `vigil-extension/manifest.json` — Chrome MV3 manifest (host_permissions, activeTab, storage)

### Safari edit targets
- `vigil-safari-extension/Vigil Capture Extension/Resources/popup.html` (45 lines) — needs checkbox label, shortcut hint, dynamic success span
- `vigil-safari-extension/Vigil Capture Extension/Resources/popup.js` (167 lines) — needs URL prefill removed, keydown handler added, triage poll added
- `vigil-safari-extension/Vigil Capture Extension/Resources/popup.css` — needs the 4 missing CSS rule sets
- `vigil-safari-extension/Vigil Capture Extension/Resources/manifest.json` — Safari MV3 manifest (no changes expected)

### Safari container app context (Phase 107 work — don't break)
- `vigil-safari-extension/Vigil Capture/AppDelegate.swift` — `SMAppService.mainApp.register()` with status guard (Phase 107 D-02/D-03)
- `vigil-safari-extension/Vigil Capture/Info.plist` — `LSUIElement = true` (Phase 107 D-01)
- `vigil-safari-extension/Vigil Capture/ViewController.swift` — bundle-ID wiring + status pill renderer (Phase 107 D-04)
- `vigil-safari-extension/Vigil Capture.xcodeproj/project.pbxproj` — `CODE_SIGN_STYLE = Automatic` already set across both targets

### Server endpoints (no changes — already exist)
- `vigil-core/src/routes/thoughts.ts` — `POST /v1/thoughts` accepts `{content, source: 'text'}`, fires server-side auto-triage
- `vigil-core/src/routes/thoughts.ts` — `GET /v1/thoughts/:id` returns `{ ..., category, ... }` once triage completes

### Prior-phase precedent
- `.planning/phases/107-safari-extension-persistence/107-CONTEXT.md` — established Safari extension Xcode-automatic-signing pattern + HUMAN-UAT.md pattern for hardware-dependent SCs (D-06)
- `.planning/milestones/v3.2-phases/94-browser-extension-quick-capture/94-CONTEXT.md` — original Chrome quick-capture decisions (D-01 through D-13). Phase 114 is the Safari port of those exact decisions.
- `.planning/phases/113-verify-email-on-signup/113-HUMAN-UAT.md` — current example of HUMAN-UAT pattern shape

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets

- **Chrome popup.js as port reference** — 100% of the JS logic for the new behaviors is already written and proven in [vigil-extension/popup.js](../../../vigil-extension/popup.js). Port = adopt the file structure, adjust only what's Safari-specific (probably nothing).
- **Existing Safari popup.js scaffolding** — view management (`showView`), API key validation against `/v1/summary`, settings button flow, error/success display, `chrome.*` namespace usage are all already in place. The Phase 114 port replaces the `initCaptureView` body and adds two CSS classes' worth of HTML — it does NOT rewrite the file.
- **Phase 107 signing pipeline** — `xcodebuild` rebuilds the entire `.app` bundle including the embedded `.appex` extension. Re-sign happens automatically. No new entitlements, no new build settings.
- **chrome.tabs.query and chrome.storage.local** — already wired and working in current Safari popup ([popup.js:86, 159](../../../vigil-safari-extension/Vigil%20Capture%20Extension/Resources/popup.js)). The new URL-checkbox path uses the same `chrome.tabs.query` call already there.

### Established patterns

- **Verbatim parity over inspiration** — every triage/format/style decision in this discussion landed on "match Chrome verbatim". The implementation pattern is "git diff Chrome popup.X against Safari popup.X, apply the diff." Don't re-derive logic.
- **Hardware-dependent SCs → HUMAN-UAT.md** — Phase 107 set this. SC#5 fits exactly (re-sign verification + Safari restart on physical hardware).
- **Throwaway probe in Plan 01** — uncommon pattern for this project, but SC#3's "before any implementation" wording is load-bearing. Plan 01 commit-and-revert pair is the cleanest way to honor it without leaving probe code in the tree.
- **Vigil teal `#1D9E75`** — already brand-locked across PWA, Mac app, and Chrome extension. Reuse Chrome's `.category-badge { color: #1D9E75; ... }` verbatim.

### Integration points

- **No server-side changes.** Phase 113 already shipped `/v1/auth/me`, but this phase doesn't touch that. Bearer auth via stored `vk_` API key continues exactly as today (EXT-03 deferred to v3.7).
- **No Xcode project changes.** Bundle IDs, entitlements, signing config all carry over from Phase 107.
- **No new permissions.** `activeTab` + `storage` from current manifest cover everything (chrome.tabs.query for URL, chrome.storage.local for API key).
- **Single integration touchpoint per file:** popup.html (checkbox + shortcut hint + dynamic span), popup.css (4 new CSS rule sets), popup.js (replace `initCaptureView` body).

</code_context>

<specifics>
## Specific Ideas

- **"Verbatim Chrome" repeated 4×** across URL format, polling cadence, timeout fallback, badge CSS. User wants line-for-line parity, not "inspired by." Implementation pattern: copy-and-adapt, not re-derive.
- **Probe-then-implement gate is load-bearing.** SC#3's "before any implementation code is written" is intentional. The throwaway probe is a trust-but-verify check on WebKit's `metaKey` event behavior. Don't skip it. Don't fold it into a later plan. Don't ship a `getModifierState` fallback without explicit user buy-in if probe fails.
- **Solo-dev velocity > infra purity** — code-share decision (D-01) explicitly chose duplicates over symlinks/build-step. Don't propose `ext-shared/` infrastructure during planning; it's deferred.

</specifics>

<deferred>
## Deferred Ideas

- **Single-source `ext-shared/` directory + copy step** — candidate for v3.7. Likely couples with EXT-03 (Chrome + Safari extension migration off hardcoded `vk_` bearer to PWA JWT) since both extensions will need synchronized auth-flow changes at that point.
- **`browser.*` namespace migration** — current `chrome.*` works in Safari WebExtension runtime. No need to migrate. Capture in v3.7 backlog only if a real incompatibility surfaces.
- **`scripts/verify-phase-114.sh`** — Claude's Discretion to include in this phase's plan, but if dropped, can be a v3.7 cleanup task tied to whatever consolidates per-phase verify scripts across the project.
- **Persistent checkbox state via `chrome.storage.local`** — explicitly not built (D-07 chose unchecked-on-every-open). Capture as a v3.7 UX nicety only if the unchecked default proves annoying in daily use.

### Reviewed Todos (not folded)

None — no pending todos matched Phase 114.

</deferred>

---

*Phase: 114-safari-extension-quick-capture-parity*
*Context gathered: 2026-04-25*
