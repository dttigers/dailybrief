# Phase 114: Safari Extension Quick-Capture Parity - Research

**Researched:** 2026-04-25
**Domain:** Safari WebExtension popup port (HTML/JS/CSS) + Xcode automatic-signing rebuild + WebKit `metaKey` empirical probe
**Confidence:** HIGH (port mechanics are concrete; one load-bearing risk surfaced for SC#5 — see Open Question #1)

## Summary

Phase 114 is a near-direct port of the Chrome Phase 94 quick-capture popup into the Safari WebExtension's `Resources/popup.{html,js,css}` files. CONTEXT.md is unusually prescriptive — D-01 through D-14 lock the code-share strategy, the `metaKey` probe gate, every URL/poll/render string, and the re-sign mechanic. The planner's job is mechanical: produce a line-level diff plan, not re-derive design.

Three things this research confirmed empirically:

1. **`xcodebuild` on this machine works end-to-end** with the existing automatic-signing config (Apple Development cert, team `5H57ADQS8G`). The Phase 107 hotfix at `project.pbxproj:435/470/508/550` made this turnkey. Rebuild is a single command and re-signs the embedded `.appex` automatically. `[VERIFIED]`
2. **`spctl --assess` will REJECT the rebuild** under the standard `--type execute|install|open` modes, because Apple Development-signed builds (which is what we ship locally) are gatekeeper-rejected by design — only Developer ID + notarization passes. SC#5's "spctl --assess passes" wording is incompatible with the project's actual signing posture. **This is a load-bearing planner risk** — see Open Question #1. `[VERIFIED via spctl on existing Debug build]`
3. **Web Inspector for popup contents requires "Allow Unsigned Extensions" + popup-stays-open trick** — clicking outside the popup (e.g., into the inspector window) closes the popup. Standard workaround: right-click inside popup → Inspect Element. The Plan 01 probe needs an explicit "how to view the console output" sub-step. `[CITED: Apple Developer Forums + WebKit bug history]`

**Primary recommendation:** Execute the port exactly as CONTEXT.md prescribes. Plan 01 is a single throwaway-probe commit-and-revert pair gated on observable `metaKey: true` in the Web Inspector console. Plans 02/03/04 implement the popup HTML/CSS/JS deltas. Plan 05 (re-sign + UAT) treats SC#5 as a HUMAN-UAT.md item using `codesign --verify` (not `spctl --assess`) as the load-bearing automatable check, and surfaces the spctl-vs-Developer-ID gap to the user before phase completion.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Code-share strategy**

- **D-01:** Keep Chrome and Safari popup files as **duplicate copies**. No symlinks, no shared `ext-shared/` dir, no build-time copy step. The two trees are ~200 lines each; lockstep is maintained by hand. Solo-dev velocity > infra purity for v3.6.
- **D-02:** Add a one-line header comment to all 6 popup files (3 Chrome + 3 Safari): `// Keep in lockstep with ../vigil-extension/popup.{html,js,css}` (and reverse on Chrome side). Cheap drift reminder — no tooling, no CI.

**Cmd+Enter empirical gate (SC#3)**

- **D-03:** **Plan 01 = throwaway probe**, ahead of any real implementation:
  - Add a temporary `keydown` logger to current `vigil-safari-extension/Vigil Capture Extension/Resources/popup.js` that logs `event.metaKey`, `event.ctrlKey`, `event.key` to extension console
  - `xcodebuild` rebuild → open extension popup in Safari → user presses ⌘+Enter → observes log
  - Revert probe code (commit revert in same Plan 01)
  - **Plan 01 SUMMARY.md** captures observed event shape verbatim
  - Plans 02+ are blocked until Plan 01 passes
- **D-04:** **Probe success bar:** `metaKey: true` fires when ⌘ is held during the keydown. The Chrome handler keys off `e.metaKey || e.ctrlKey`; if Safari fires `metaKey` truthy on ⌘+Enter, parity port is unblocked. (Newline-suppression, popup-chrome-conflict, and Ctrl+Enter are explicitly NOT gating concerns — they're non-blockers.)
- **D-05:** **Probe failure path = stop + replan.** No silent autopilot fallback. If `metaKey` doesn't fire, Plan 01 SUMMARY.md records the failure mode and the phase pauses. User then decides: (a) accept a different shortcut, (b) drop SC#3, or (c) investigate WebKit-specific event handling. No `e.getModifierState('Meta')` fallback shipped without explicit go-ahead.

**URL append format (SC#2)**

- **D-06:** **Verbatim Chrome format:** when checkbox is checked, append `\n\n${tab.title || 'Page'}: ${tab.url}` to content on submit. Triage classifier server-side has been seeing this exact format from Chrome since Phase 94 — zero regression risk on category accuracy.
- **D-07:** Default checkbox state = **unchecked**. Chrome parity. No persistence across popup opens (every popup open starts unchecked). Quick-capture is text-first; URL is opt-in per capture.

**Triage badge UX (SC#4)**

- **D-08:** **Polling cadence verbatim from Chrome:** 800ms `setInterval`, 5s overall timeout, `GET /v1/thoughts/:id` per poll, look for `updated.category` in response body.
- **D-09:** **Success path:** when `category` field appears, clear interval, render `<span class="checkmark">✓</span> Captured! <span class="category-badge">${Capitalize(category)}</span>`, then `setTimeout(window.close, 1500)`. Capitalization = `cat.charAt(0).toUpperCase() + cat.slice(1)` (Chrome line 170).
- **D-10:** **Timeout path (5s, no category):** render plain `<span class="checkmark">✓</span> Captured!` (no badge), then `setTimeout(window.close, 1500)`. Match Chrome behavior at popup.js:157-159.
- **D-11:** **Badge styling = verbatim Chrome CSS.** Copy `.category-badge`, `.analyzing`, `.shortcut-hint`, and `.url-toggle` rules from `vigil-extension/popup.css` into Safari popup.css. Vigil teal `#1D9E75` brand color, no tuning.

**Carry-forward from prior phases (applied without re-asking)**

- **D-12:** Hardware-dependent SC#5 (re-sign + `spctl --assess` + Safari-restart-on-physical-Mac) → captured in `114-HUMAN-UAT.md` following the Phase 107 + Phase 113 precedent. Phase ships when code/automated SCs pass; SC#5 stays open as a UAT item that surfaces in `/gsd-progress` until you reboot/restart and confirm.
- **D-13:** **Re-sign = `xcodebuild` rebuild only.** Phase 107 already wired automatic code signing (`CODE_SIGN_STYLE = Automatic`). Rebuilding the `.app` re-signs the extension `.appex` automatically. No separate `codesign` step.
- **D-14:** **`chrome.*` namespace stays.** Current Safari popup.js already uses `chrome.tabs.query` and `chrome.storage.local.get` and works. No `browser.*` migration. Out of scope.

### Claude's Discretion

- Exact Plan numbering / split (e.g., whether HTML + CSS is one plan or two; whether the throwaway probe revert lives in Plan 01 or extends to Plan 02; whether re-sign verification is its own plan).
- Whether to add a `scripts/verify-phase-114.sh` following the Phase 107.3 precedent (probably yes — it can grep `popup.js` for the keydown handler, grep `popup.html` for the checkbox `id="include-url"`, run `spctl --assess` on the rebuilt `.app`).
- Exact wording of the header comment in D-02.
- Exact log format inside the throwaway probe (e.g., `console.log({metaKey, ctrlKey, key})` vs `console.log('keydown', e.metaKey, e.ctrlKey, e.key)`).
- Whether to wrap the `keydown` listener registration to remove the listener if the popup re-renders (probably no — popup is single-shot per open).

### Deferred Ideas (OUT OF SCOPE)

- **Single-source `ext-shared/` directory + copy step** — candidate for v3.7. Likely couples with EXT-03 (Chrome + Safari extension migration off hardcoded `vk_` bearer to PWA JWT) since both extensions will need synchronized auth-flow changes at that point.
- **`browser.*` namespace migration** — current `chrome.*` works in Safari WebExtension runtime. No need to migrate. Capture in v3.7 backlog only if a real incompatibility surfaces.
- **`scripts/verify-phase-114.sh`** — Claude's Discretion to include in this phase's plan, but if dropped, can be a v3.7 cleanup task tied to whatever consolidates per-phase verify scripts across the project.
- **Persistent checkbox state via `chrome.storage.local`** — explicitly not built (D-07 chose unchecked-on-every-open). Capture as a v3.7 UX nicety only if the unchecked default proves annoying in daily use.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXT-02 | "The Safari extension popup offers Chrome Phase 94 quick-capture parity — freeform text input (pre-filled empty, not with URL), optional 'Include page URL' checkbox, Cmd+Enter keyboard shortcut to submit, and a triage feedback badge displaying the AI-assigned category after submit — verified working on physical Mac hardware" | This document's `## Concrete Diff Inventory` lists every line that changes in the 3 Safari popup files. `## Cmd+Enter Empirical Probe Mechanics` covers the SC#3 probe. `## Re-Sign + spctl --assess Mechanics` covers SC#5 with one critical caveat (Open Q1). `## Triage Poll Endpoint Shape` confirms the server contract for SC#4. `## Validation Architecture` maps every SC to a runnable check. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` does not exist in this repository. Project guidelines are codified in `.planning/STATE.md`, `.planning/REQUIREMENTS.md`, and prior-phase decision logs.

## Standard Stack

This phase ships **no new dependencies**. Every library/tool is already in the tree from Phase 107 or earlier.

| Tool | Version | Purpose | Status |
|------|---------|---------|--------|
| Xcode | 26.3 (Build 17C529) | Build & re-sign the `.app` + embedded `.appex` | `[VERIFIED: xcodebuild -version on iMac]` |
| `xcodebuild` CLI | bundled with Xcode 26.3 | Headless rebuild from CI/scripts | `[VERIFIED]` |
| `codesign` | macOS system tool | Verify the extension `.appex` signature post-rebuild | `[VERIFIED]` |
| `spctl` | macOS system tool | Gatekeeper assessment (with caveat — see Open Q1) | `[VERIFIED]` |
| `plutil` | macOS system tool | Inspect Info.plist (used by Phase 107 verify script as precedent) | `[VERIFIED]` |
| WebExtension `chrome.*` API | Safari 18.x runtime | `chrome.tabs.query`, `chrome.storage.local.get` — already used by current Safari popup at popup.js:86,159 | `[VERIFIED]` |

**Installation:** None. Phase 107 already provisioned the toolchain.

## Architecture Patterns

### Recommended Code Layout (no change — port-only)

```
vigil-safari-extension/
├── Vigil Capture Extension/
│   └── Resources/
│       ├── popup.html        ← edit (checkbox + shortcut hint + dynamic span)
│       ├── popup.js          ← edit (replace initCaptureView body, add keydown handler)
│       ├── popup.css         ← edit (append 4 CSS rule sets)
│       └── manifest.json     ← NO change (already MV3 with activeTab+storage)
└── Vigil Capture/
    ├── AppDelegate.swift     ← NO change (Phase 107)
    ├── Info.plist            ← NO change (Phase 107: LSUIElement=true)
    ├── ViewController.swift  ← NO change (Phase 107)
    └── Vigil Capture.xcodeproj/
        └── project.pbxproj   ← NO change (Phase 107: CODE_SIGN_STYLE=Automatic, DEVELOPMENT_TEAM=5H57ADQS8G)
```

### Pattern 1: Verbatim port — copy-not-derive
**What:** Apply Chrome `popup.{html,js,css}` deltas to Safari files line-for-line.
**When to use:** Every code change in this phase.
**Example (verbatim):** the `cat.charAt(0).toUpperCase() + cat.slice(1)` capitalization at Chrome `popup.js:170` lands in Safari popup.js at the equivalent post-port line. No improvements, no refactors.

### Pattern 2: Throwaway-probe gate (Plan 01 only)
**What:** Single commit adds a temporary `keydown` logger to current Safari popup.js, then a follow-up commit reverts it. SUMMARY.md captures the observed event shape between commits. No probe code lives in main after Plan 01.
**When to use:** Once, only for SC#3.
**Why this pattern:** The phase brief reads "verified empirically … BEFORE any implementation code is written." Folding the probe into a later plan or skipping the revert violates the verbatim wording.

### Pattern 3: Hardware-dependent UAT carved into HUMAN-UAT.md
**What:** SC#5 (re-sign + Safari-restart-on-physical-Mac) ships as a checklist in `114-HUMAN-UAT.md` per Phase 107/113 precedent. Code/static-grep SCs gate phase completion; UAT stays open until user manually verifies.
**When to use:** Any SC that requires physical reboot, real keystrokes in Safari, or code-signing assessment that can't be fully automated.

### Anti-Patterns to Avoid
- **Improving the port mid-flight.** D-06/D-08/D-09/D-10/D-11 all say "verbatim Chrome." Don't tweak the URL format ("Title — URL" instead of "Title: URL"), don't change the 800ms cadence to 600ms "for snappier UX," don't recolor the badge.
- **Folding the probe into the implementation plan.** D-03 wording is load-bearing: probe → revert → SUMMARY → THEN implement. Folding violates SC#3 intent.
- **Replacing `chrome.*` with `browser.*`.** D-14 is explicit. Current Safari extension uses `chrome.*`, it works, polyfills add a dep for zero benefit (also called out in REQUIREMENTS.md "Out of Scope").
- **Reading `chrome.storage.local` for checkbox state.** D-07 — unchecked on every popup open, no persistence.

## Concrete Diff Inventory

This is the planner's primary input. Every change in this phase fits in this table.

### Diff 1: `vigil-safari-extension/Vigil Capture Extension/Resources/popup.html`

Current Safari file: 44 lines. Chrome reference: 46 lines. Net delta: +2 lines.

| Source line in Chrome | What lands in Safari | Action |
|----------------------|----------------------|--------|
| Chrome popup.html:35 | `<label class="url-toggle"><input type="checkbox" id="include-url"> Include page URL</label>` | **Insert** between current Safari line 34 (`</div>` closing form-group) and line 35 (`<button id="capture-btn"...`) |
| Chrome popup.html:37 | `<div class="shortcut-hint">Cmd+Enter to capture</div>` | **Insert** between current Safari line 35 (`<button id="capture-btn"...`) and line 36 (`<div id="capture-error"...`) |
| Chrome popup.html:40 | `<span id="success-text"></span>` | **Replace** current Safari line 38 (`<span class="checkmark">&#10003;</span> Captured!`) — the static text becomes a dynamic span the JS writes into |
| (Header comment) | `<!-- Keep in lockstep with ../../../vigil-extension/popup.html -->` | **Insert** as line 2 (right after `<!DOCTYPE html>`) per D-02. Mirror in Chrome with reversed path. |

### Diff 2: `vigil-safari-extension/Vigil Capture Extension/Resources/popup.js`

Current Safari file: 166 lines. Chrome reference: 204 lines. Net delta: +38 lines (replace `initCaptureView` body, add DOM ref, add keydown handler, add poll loop, add URL append).

**Lines to REMOVE (Safari current behavior that contradicts SC#1):**

| Safari current lines | What it does | Why it must go |
|--------------------|--------------|----------------|
| popup.js:84-92 | `chrome.tabs.query` reads tab.title + tab.url and PRE-FILLS textarea with `${title}\n${url}\n\n` | SC#1 says empty textarea, no auto-prefill. Replace with `contentInput.value = ''; contentInput.focus();` matching Chrome popup.js:86-88. |

**Lines to ADD (Chrome behaviors not yet in Safari):**

| Chrome source | What lands in Safari | Insertion point |
|--------------|----------------------|-----------------|
| Chrome popup.js:18 | `const includeUrlCheckbox = document.getElementById('include-url');` | After current Safari popup.js:16 (`const captureSuccess = ...`) — needs to land BEFORE line 17 (`const settingsBtn`) so the DOM-refs block stays grouped. |
| Chrome popup.js:91-96 | The `keydown` handler block: `contentInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey \|\| e.ctrlKey)) { e.preventDefault(); captureBtn.click(); } });` | Inside `initCaptureView`, immediately after the new empty-init + focus pair (Chrome line 88). |
| Chrome popup.js:107-115 | URL-append block: declare `let finalContent = content;` then `if (includeUrlCheckbox.checked) { try { const [tab] = await chrome.tabs.query({...}); if (tab?.url) finalContent += \`\\n\\n${tab.title \|\| 'Page'}: ${tab.url}\`; } catch { /* ignore */ } }` | Replace current Safari popup.js:99 (`const content = contentInput.value.trim();` stays; the body just before the fetch becomes the URL-append block). |
| Chrome popup.js:118 (POST body) | `body: JSON.stringify({ content: finalContent, source: 'text' })` | Replace current Safari popup.js:118 (`content: content` → `content: finalContent`). |
| Chrome popup.js:149-176 | Triage poll loop replacing the static `setTimeout(() => window.close(), 1500)` at current Safari popup.js:138. Includes `successText.innerHTML = '<span class="analyzing">Analyzing...</span>'`, the 800ms `setInterval`, the `Date.now() - startTime > 5000` timeout branch, the `category`-detected success branch with the badge render. | Replace current Safari popup.js:134-138 (the 4 lines from `captureSuccess.hidden = false;` through `setTimeout(...)`) with Chrome's expanded version. |
| (Header comment) | `// Keep in lockstep with ../../../vigil-extension/popup.js — Phase 114 port (D-02)` | Insert after current line 1 (`'use strict';`). Mirror in Chrome popup.js with reversed path. |
| (DOM ref) | `const successText = document.getElementById('success-text');` | After the `captureSuccess` ref. The new dynamic `<span id="success-text">` from the HTML diff feeds this. |

**Risk note:** the diff is mechanical but not trivial — `initCaptureView`'s body is rewritten, not patched. The planner should write Plans as "replace `initCaptureView` body verbatim from Chrome popup.js:81-184" rather than line-by-line splice instructions.

### Diff 3: `vigil-safari-extension/Vigil Capture Extension/Resources/popup.css`

Current Safari file: 158 lines. Chrome reference: 195 lines. Net delta: +37 lines.

**Lines to APPEND** (Chrome's CSS file ends with these 4 rule blocks not present in Safari):

| Chrome source lines | Rule | Purpose |
|--------------------|------|---------|
| Chrome popup.css:160-173 | `.url-toggle { ... }` + `.url-toggle input[type="checkbox"] { accent-color: #1D9E75; }` | Style the new "Include page URL" checkbox row |
| Chrome popup.css:175-183 | `.category-badge { ... }` (rounded pill, teal `#1D9E75` background tint, white text) | The triage badge after success |
| Chrome popup.css:185-190 | `.shortcut-hint { font-size: 11px; color: #666; text-align: center; margin-top: 4px; }` | The "Cmd+Enter to capture" footer |
| Chrome popup.css:192-195 | `.analyzing { color: #999; font-size: 13px; }` | The pre-poll-success "Analyzing..." text |

**No changes** to lines 1-158 of Safari popup.css. This is purely additive.

**Header comment per D-02:** Insert `/* Keep in lockstep with ../../../vigil-extension/popup.css — Phase 114 port (D-02) */` as line 1.

### Diff 4: Chrome side (D-02 lockstep header comments only)

| File | Line | Insert |
|------|------|--------|
| `vigil-extension/popup.html` | 2 (after `<!DOCTYPE html>`) | `<!-- Keep in lockstep with ../vigil-safari-extension/Vigil Capture Extension/Resources/popup.html -->` |
| `vigil-extension/popup.js` | 2 (after `'use strict';`) | `// Keep in lockstep with ../vigil-safari-extension/Vigil Capture Extension/Resources/popup.js — Phase 114 (D-02)` |
| `vigil-extension/popup.css` | 1 | `/* Keep in lockstep with ../vigil-safari-extension/Vigil Capture Extension/Resources/popup.css — Phase 114 (D-02) */` |

### Files NOT touched

- `manifest.json` (both sides) — already MV3 with `activeTab` + `storage`. No new permissions needed.
- `vigil-safari-extension/Vigil Capture/AppDelegate.swift`, `Info.plist`, `ViewController.swift`, `Main.html`, `Style.css` — Phase 107 territory, no overlap.
- `vigil-safari-extension/Vigil Capture.xcodeproj/project.pbxproj` — `CODE_SIGN_STYLE = Automatic` and `DEVELOPMENT_TEAM = 5H57ADQS8G` already present at lines 433/468/505/547 and 435/470/508/550 respectively. `[VERIFIED 2026-04-25]`
- `vigil-core/src/routes/thoughts.ts` — server endpoints unchanged (see § Triage Poll Endpoint Shape).

## Cmd+Enter Empirical Probe Mechanics (D-03 / SC#3)

The probe is the only step in this phase that requires a human at the iMac with Safari open. Concrete recipe:

### Step 1: Add the temporary logger

Edit `vigil-safari-extension/Vigil Capture Extension/Resources/popup.js`. Inside the existing `initCaptureView` function (current Safari popup.js:79-146), add the following block immediately after the existing `contentInput.focus();` call (current line 90 or 95 depending on which try-branch we're in):

```javascript
// PHASE 114 PROBE — REVERT BEFORE IMPLEMENTATION (D-03/D-04)
contentInput.addEventListener('keydown', (e) => {
  console.log('[probe] keydown', { key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, code: e.code });
});
```

Commit message: `probe(114): temporary keydown logger for SC#3 Cmd+Enter empirical gate`

### Step 2: Rebuild the `.app`

```bash
xcodebuild build \
  -project "vigil-safari-extension/Vigil Capture.xcodeproj" \
  -scheme "Vigil Capture" \
  -configuration Debug \
  -quiet
```

`[VERIFIED 2026-04-25]` — this exact invocation works on the iMac and produces a fresh `.app` at `~/Library/Developer/Xcode/DerivedData/Vigil_Capture-*/Build/Products/Debug/Vigil Capture.app`. The embedded `.appex` is automatically re-signed with the Apple Development cert (TeamIdentifier=5H57ADQS8G).

### Step 3: Replace the running extension

Safari caches extensions aggressively. To pick up the rebuild:

1. **First launch the rebuilt `.app` once** (`open` it from Finder or `open "$(find ~/Library/Developer/Xcode/DerivedData -name 'Vigil Capture.app' -type d | head -1)"`). This re-registers the extension with Safari.
2. **Quit Safari fully** (Safari menu → Quit Safari, not just close window). `[CITED: Phase 107 RESEARCH common pitfall]`
3. Re-open Safari → Settings → Extensions → confirm "Vigil Capture" is still enabled (Phase 107 persistence carries the state).
4. Click the Vigil Capture toolbar icon to open the popup.

### Step 4: Open Web Inspector for the popup (the tricky part)

Safari popups close as soon as focus shifts to another window. The standard recipe `[CITED: Apple Developer Forums - Safari Extension debugging]`:

1. **Enable Develop menu first** (one-time setup): Safari → Settings → Advanced → "Show Develop menu in menu bar"
2. **Enable "Allow Unsigned Extensions"** if not already (the Apple Development cert ought to satisfy Safari's signed-by-Apple check — Phase 107 confirmed Safari accepts this build without the toggle, but the toggle has been needed historically when the cert chain doesn't validate). If the popup never opens or the icon is grayed out, check this toggle.
3. **Open the popup** by clicking the toolbar icon.
4. **Right-click inside the popup** body (any non-input area) → choose "Inspect Element". This opens Web Inspector docked to the popup. Critical: this is the only way to keep both windows alive — Develop → Show Web Inspector targets the active tab, not the popup, and shifting focus would close the popup.
5. The Web Inspector's Console tab is now ready.

### Step 5: Press Cmd+Enter and read the log

With the popup focused (click into the textarea first), press ⌘+Enter. The console should print:

```
[probe] keydown {key: "Enter", metaKey: true, ctrlKey: false, code: "Enter"}
```

**Probe pass criterion (D-04):** the log line contains `metaKey: true` when ⌘ is held during the keydown.
**Probe fail criterion (D-05):** anything else — `metaKey: false`, no log line at all (event never fires), `keydown` fires for other keys but not Enter, etc. Stop and replan.

### Step 6: Revert the probe

```bash
git revert <probe commit SHA>
```

Or hand-edit popup.js to remove the probe block, then commit:
```
revert(114): remove keydown probe — observed metaKey:true confirmed (D-03 closure)
```

Capture the observed event shape verbatim in `114-01-SUMMARY.md`.

### Probe gotchas

- **Popup auto-closes when devtools opens** if you use the Develop menu. **Workaround:** right-click → Inspect Element from inside the popup. `[CITED: Apple Developer Forums + Mozilla Discourse]`
- **`keydown` on `contentInput` vs document.** Chrome registers on `contentInput` (popup.js:91). Safari should be the same — listening on the textarea is fine, no need to bind to document. Verbatim port covers it.
- **WebKit Mac `metaKey` quirk only affects keyup, not keydown.** `[CITED: WebKit bug 165004 + Electron issue 5188]` — the well-documented "metaKey not on keyup" bug doesn't matter here because we listen on keydown. Confidence HIGH that the probe will pass.
- **First-launch NSAlert** from Phase 107 fires once after a fresh rebuild that hasn't been opened yet. Dismiss it before clicking the Safari toolbar icon. Phase 107 HUMAN-UAT.md Test 3 covers this. The probe doesn't interact with the alert, but planner should note this in Plan 01 so a human running the probe doesn't get confused.
- **`xcodebuild` may take 30-60s on first run after a clean DerivedData**, but ≤10s on incremental rebuilds since this phase only changes `Resources/*` files. The `.appex` Resources copy step is fast — `[ASSUMED]` based on Phase 107 build observations; see Open Question #2.

## Re-Sign + spctl --assess Mechanics (D-13 / SC#5)

### What works

The `xcodebuild` rebuild command in Step 2 above re-signs the entire `.app` bundle including the embedded `.appex`. The signature is:

- **Identifier:** `io.vigilhub.extension` (container) and `io.vigilhub.extension.Extension` (the `.appex`)
- **Authority chain:** Apple Development → WWDR → Apple Root CA `[VERIFIED 2026-04-25 via codesign -dv on existing build]`
- **TeamIdentifier:** `5H57ADQS8G`
- **Hardened runtime flag:** `0x10000` (set)

`codesign --verify --verbose` passes cleanly on this build:

```
$ codesign --verify --verbose "$APP"
… valid on disk
… satisfies its Designated Requirement
```

### What doesn't work — and why SC#5 wording is risky

`spctl --assess` is **stricter** than `codesign --verify`. It enforces Gatekeeper policy, which by default rejects anything not signed with **Developer ID** (the distribution-identity cert family) AND notarized. Apple Development certs (which is what Phase 107 set up for local-dev signing) get rejected:

```
$ spctl --assess --type execute -vvv "$APP"
$APP: rejected
origin=Apple Development: Jameson Morrill (JM755HCH43)
```

`[VERIFIED 2026-04-25 — empirical probe on existing Debug build at DerivedData/Vigil_Capture-*/Build/Products/Debug/Vigil Capture.app]`

The same rejection occurs for `--type install` and `--type open` (with or without `--context primary-signature`).

**SC#5 reads:** "The updated extension is re-signed with Xcode and `spctl --assess` passes; the extension remains functional after Safari is restarted."

**This is incompatible with the project's actual signing posture.** The team did not set up a Developer ID cert + notarization flow for the Safari extension (Phase 107 explicitly used Apple Development for the team-provisioned profile). Notarization would require: (a) a paid Apple Developer Program membership covering Developer ID, (b) `codesign --options runtime`, (c) `xcrun notarytool submit` with credentials, (d) `xcrun stapler staple`, (e) wait for Apple notary service. None of that is in scope for v3.6.

**See Open Question #1** for the planner's options.

### What CAN be automated for SC#5 (recommendation)

Given local-only deployment, the load-bearing checks are:

1. `xcodebuild build` returns exit 0
2. `codesign --verify --verbose <APP>` returns 0 — confirms the rebuild signed cleanly
3. `codesign --verify --verbose <APP>/Contents/PlugIns/Vigil Capture Extension.appex` returns 0 — confirms the embedded extension also re-signed
4. `codesign -dv <APP>/Contents/PlugIns/Vigil Capture Extension.appex` shows non-empty `TeamIdentifier=5H57ADQS8G` (Phase 107 hotfix preservation)
5. **HUMAN-UAT.md** holds the Safari-restart + popup-still-works check

Recommend the planner replace the SC#5 spctl phrasing with `codesign --verify` in `114-VALIDATION.md` and document the spctl/Developer-ID gap in Plan 01 SUMMARY.md or a `114-DECISIONS.md` deltapatch — **but only after the user explicitly confirms** (this is a CONTEXT.md re-write, which the researcher should not do unilaterally per the GSD workflow).

## Triage Poll Endpoint Shape

### `POST /v1/thoughts` (the create call)

`vigil-core/src/routes/thoughts.ts:268-347` — `[VERIFIED via direct read 2026-04-25]`:

- Accepts `{ content: string, source: 'text' }` (also voice/image, not relevant here)
- Returns 201 with full `ThoughtApiResponse` shape including `id`
- **At line 315**: if `category` was not provided in the request body AND the AI client is available, fires a fire-and-forget async triage:
  ```typescript
  (async () => {
    try {
      const raw = await callClaude({ system: TRIAGE_SYSTEM_PROMPT, userMessage: thoughtContent, maxTokens: 200 });
      const result = parseAIJson<TriageResult>(raw);
      await db.update(thoughtsTable)
        .set({ category: result.category, confidence: result.confidence, ... })
        .where(and(eq(thoughtsTable.id, thoughtId), eq(thoughtsTable.userId, userId)));
    } catch (err) {
      console.error("[vigil-core] Auto-triage failed (non-fatal):", err);
    }
  })();
  ```
- Triage runs independently of the HTTP response — the response returns BEFORE category is set.

### `GET /v1/thoughts/:id` (the poll target)

`vigil-core/src/routes/thoughts.ts:238-265` — `[VERIFIED]`:

- Returns 200 with `toResponse(rows[0])` shape (line 260)
- `toResponse` maps the row to `ThoughtApiResponse` which **always includes `category: string | null`** (line 70: `category: row.category`)
- Before triage completes: `category: null`
- After triage completes: `category: "task" | "therapy" | "idea" | "reflection" | "project"`
- If classification fails (Claude error): the row is never updated, `category` stays null forever — but the GET endpoint still returns **200 with `category: null`**, NOT a 404. Confirmed by reading the catch block at line 336-338 (errors are logged, not propagated).

### Latency budget

The Chrome handler (popup.js:152-176) polls at 800ms intervals with a 5000ms hard timeout — so it allows up to ~6 polls. `[ASSUMED]` calibrated against an average Claude triage latency of ~1-3s. The 5s timeout is generous; the typical successful poll completes in 1-2 iterations. If the Claude API is having a bad day or is offline, the timeout path renders plain "✓ Captured!" with no badge, then closes — which is exactly the same UX as a successful capture without category. No regression risk.

**The 5s/800ms cadence is verbatim Chrome (D-08); no tuning needed.**

### Why this matters for SC#4

SC#4 reads: "After a successful capture, a triage feedback badge appears showing the AI-assigned category (polling up to 5 seconds); the static 'Captured!' text is replaced with the dynamic badge."

The server contract supports this exactly:
- POST returns immediately → poll loop kicks off
- GET returns 200 + `category: null` while triage is in flight → continue polling
- GET returns 200 + `category: "task"` (etc.) once triage completes → render badge, close popup
- Timeout (no category in 5s) → plain "Captured!" + close

`[VERIFIED]` end-to-end via the route source. No server-side changes needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Re-sign the `.appex` | A separate `codesign` invocation | `xcodebuild build` (D-13) | Re-signing the container `.app` automatically re-signs all embedded `.appex` plug-ins via the Resources copy phase. The Apple-Development-signed Phase 107 setup already covers this. |
| Cross-browser keyboard event normalization | A `getModifierState('Meta')` fallback | Plain `e.metaKey \|\| e.ctrlKey` (Chrome popup.js:92, verbatim port) | Phase 94 already proved this works in Chrome. WebKit fires `metaKey: true` on keydown when ⌘ is held — the WebKit keyup quirk doesn't affect keydown handlers. D-05 explicitly forbids the fallback without user buy-in. |
| Single-source code dedup between Chrome + Safari | `ext-shared/` + build-time copy step | Hand-maintained duplicates with the D-02 header comment | D-01 — solo-dev velocity > infra purity. ~200 lines × 2 trees is sustainable; lockstep is enforced by the comment + the next phase's diff. |
| Persist checkbox state across popup opens | `chrome.storage.local.set({ includeUrl: true })` | Default unchecked every open (D-07) | Quick-capture is text-first; the URL is opt-in per capture. Persistence adds complexity for a feature the user can flip in 50ms. Deferred to v3.7. |
| Browser-namespace polyfill | `webextension-polyfill` package | `chrome.*` direct (D-14, REQUIREMENTS Out-of-Scope) | Safari WebExtensions runtime supports `chrome.*` directly. Polyfill adds a dep for zero benefit. |
| Triage classification request | A dedicated `/v1/triage` POST | Read `category` from `GET /v1/thoughts/:id` after the create call | Server already auto-triages on POST (thoughts.ts:315). Separate triage call would be redundant + double the API surface. |

## Common Pitfalls

### Pitfall 1: Safari aggressively caches extensions across rebuilds
**What goes wrong:** `xcodebuild` produces a fresh `.app`, but Safari shows old behavior — popup HTML is stale, button text is stale, etc.
**Why:** Safari binds the extension to a specific `.appex` bundle path resolved at extension-enable time. A new `.appex` at the same DerivedData path may not be picked up until Safari re-resolves.
**How to avoid:** After every `xcodebuild build`, (a) `open <APP>` to re-register, (b) **fully quit Safari** (⌘Q, not close window), (c) reopen Safari. Phase 107 RESEARCH calls this out and the verify script includes a check for the registration state.
**Warning sign:** popup looks identical to before the rebuild. Quitting Safari resolves it 100% of the time.

### Pitfall 2: Web Inspector closes the popup the moment focus shifts
**What goes wrong:** Plan 01 probe: developer presses ⌘+Enter, the popup closes before they can see the console log, and they think the probe failed.
**Why:** Safari extension popups are auto-dismissed on blur (focus loss). Develop menu → Show Web Inspector opens a separate window → focus shifts → popup closes.
**How to avoid:** Right-click inside the popup → "Inspect Element". This opens the inspector without unfocusing the popup. `[CITED]`
**Warning sign:** popup vanishes when developer alt-tabs or clicks the menu bar.

### Pitfall 3: First-launch NSAlert appears after rebuild
**What goes wrong:** Developer rebuilds during the probe, opens the rebuilt `.app`, and a "Vigil Capture is installed" NSAlert appears unexpectedly, blocking interaction.
**Why:** Phase 107 added a first-launch NSAlert gated by `UserDefaults` flag `io.vigilhub.extension.firstLaunchAlertShown`. A clean DerivedData wipes the flag. Some `xcodebuild clean` commands also reset it.
**How to avoid:** Just dismiss the alert when it appears. It only fires once per UserDefaults flag state — subsequent launches are silent.
**Warning sign:** Alert with "Vigil Capture is installed" + "The extension will stay enabled across reboots."

### Pitfall 4: `chrome.tabs.query` returns empty array if user hasn't granted activeTab to that origin
**What goes wrong:** SC#2 — checkbox checked, but the URL doesn't get appended.
**Why:** Safari's MV3 `activeTab` permission is per-origin and granted on first interaction with the toolbar icon for that page. If the user navigated to a new domain and hasn't clicked the icon yet, `chrome.tabs.query` may return a tab with `tab.url === undefined`. `[CITED: Apple Developer Forums]`
**How to avoid:** The Chrome popup.js:111 already has `if (tab?.url) { ... }` — the optional chaining handles this gracefully. Verbatim port preserves it. The capture POST still succeeds with the user's text-only content; the URL just silently isn't appended.
**Warning sign:** UAT Test reports "checkbox checked but no URL in the captured thought." Cross-check whether the page is on a domain the user has previously activated for the extension.

### Pitfall 5: `spctl --assess` rejection mistaken for a build break
**What goes wrong:** Plan 05 verify script runs `spctl --assess`, gets "rejected", and fails the phase.
**Why:** Apple Development-signed builds are by-design rejected by Gatekeeper. See § Re-Sign + spctl --assess Mechanics above.
**How to avoid:** Use `codesign --verify --verbose` as the load-bearing automated check; surface SC#5's spctl wording to the user via Open Question #1 BEFORE writing the verify script.
**Warning sign:** verify script exits 1 immediately after a successful `xcodebuild`.

### Pitfall 6: Header comment in popup.html breaks DOCTYPE order
**What goes wrong:** Inserting `<!-- Keep in lockstep -->` at line 1 (before `<!DOCTYPE html>`) silently downgrades the page to quirks mode.
**Why:** HTML5 requires DOCTYPE to be the very first thing in the document.
**How to avoid:** Insert the comment at line 2, after `<!DOCTYPE html>`. The Diff Inventory above specifies this.
**Warning sign:** popup CSS layout breaks subtly (margins, font rendering different from Chrome).

## Code Examples

Verified patterns from the Chrome reference (these become the Safari port verbatim).

### Empty-init + focus (SC#1)

```javascript
// Source: vigil-extension/popup.js:86-88 (Chrome reference)
// Start with empty input — matches Mac quick capture behavior
contentInput.value = '';
contentInput.focus();
```

### Cmd+Enter handler (SC#3)

```javascript
// Source: vigil-extension/popup.js:91-96 (Chrome reference)
// Cmd+Enter (Mac) / Ctrl+Enter (Windows) submits the capture form
contentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    captureBtn.click();
  }
});
```

### URL append on submit (SC#2 / D-06)

```javascript
// Source: vigil-extension/popup.js:107-115 (Chrome reference)
// Build final content with optional URL
let finalContent = content;
if (includeUrlCheckbox.checked) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      finalContent += `\n\n${tab.title || 'Page'}: ${tab.url}`;
    }
  } catch { /* activeTab not available — send content without URL */ }
}
```

### Triage poll loop (SC#4 / D-08-D-10)

```javascript
// Source: vigil-extension/popup.js:152-176 (Chrome reference)
// Show success area with triage polling
const thought = await res.json();
captureSuccess.hidden = false;
successText.innerHTML = '<span class="analyzing">Analyzing...</span>';

const startTime = Date.now();
const pollInterval = setInterval(async () => {
  if (Date.now() - startTime > 5000) {
    clearInterval(pollInterval);
    successText.innerHTML = '<span class="checkmark">&#10003;</span> Captured!';
    setTimeout(() => window.close(), 1500);
    return;
  }
  try {
    const pollRes = await fetch(`${API_BASE}/v1/thoughts/${thought.id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (pollRes.ok) {
      const updated = await pollRes.json();
      if (updated.category) {
        clearInterval(pollInterval);
        const cat = updated.category.charAt(0).toUpperCase() + updated.category.slice(1);
        successText.innerHTML = `<span class="checkmark">&#10003;</span> Captured! <span class="category-badge">${cat}</span>`;
        setTimeout(() => window.close(), 1500);
      }
    }
  } catch { /* ignore poll errors — timeout will handle */ }
}, 800);
```

### CSS rules to append (D-11)

```css
/* Source: vigil-extension/popup.css:160-195 (Chrome reference) */
.url-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #999;
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
}

.url-toggle input[type="checkbox"] {
  accent-color: #1D9E75;
}

.category-badge {
  display: inline-block;
  background: rgba(29, 158, 117, 0.15);
  color: #1D9E75;
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 500;
}

.shortcut-hint {
  font-size: 11px;
  color: #666;
  text-align: center;
  margin-top: 4px;
}

.analyzing {
  color: #999;
  font-size: 13px;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Safari extension auto-prefilling URL on popup open | Empty textarea + opt-in URL checkbox | Phase 94 (Chrome, 2026-04-16); Phase 114 ports to Safari | Quick-capture becomes text-first; URL is opt-in. Matches Mac CLI quick-capture UX. |
| Static "Captured!" success text | Dynamic triage badge with category | Phase 94 (Chrome) | User sees AI category within 1-2s of capture; reinforces trust in classification accuracy. |
| `webextension-polyfill` for Safari | Native `chrome.*` namespace | Apple Safari 14+ (already shipped) | Drops a dep; D-14 codifies. |

**Deprecated/outdated:** None — this phase is purely additive parity.

## Runtime State Inventory

This is a code-only port. No runtime state migration is required. Explicitly answering each category:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `chrome.storage.local` `vigil_api_key` already exists from Phase 107 and is preserved. No new keys, no rename, no schema change. | None |
| Live service config | None — vigil-core API endpoints unchanged. No Resend templates, no Railway env vars, no DNS records. | None |
| OS-registered state | None — Phase 107's `SMAppService.mainApp.register()` registration with bundle ID `io.vigilhub.extension` is unchanged. Login Item entry persists. | None |
| Secrets/env vars | None — `VIGIL_API_BASE` and `vk_*` bearer token env are read by vigil-core only, not the extension. Safari extension reads its own API_BASE constant in popup.js (`https://api.vigilhub.io`) — verbatim port preserves. | None |
| Build artifacts | One — Xcode DerivedData `Vigil_Capture-*/Build/Products/Debug/Vigil Capture.app` is what `spctl/codesign` operate on. After Plans 02/03/04 land, the rebuild produces a fresh `.app`. The OLD pre-Phase-114 `.app` at the same path will get overwritten cleanly — no orphan artifacts. **However**: Safari may need a full quit to forget the old extension binding (Pitfall 1). | Quit Safari fully after rebuild (already in HUMAN-UAT precedent) |

**Verified by:** direct file read + `xcodebuild -list` + `codesign -dv` on the existing build (2026-04-25).

## Environment Availability

Required tooling (all already verified present on iMac dev machine, 2026-04-25):

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Xcode | Plan 01 probe rebuild + Plan 04/05 final rebuild | ✓ | 26.3 (Build 17C529) | — |
| `xcodebuild` CLI | Same as Xcode | ✓ | bundled | — |
| `codesign` | Verify script post-rebuild | ✓ | system tool | — |
| `spctl` | (Conditional — see Open Q1) | ✓ | system tool | Use `codesign --verify` instead if user accepts SC#5 reword |
| `plutil` | (Optional) Plan 05 verify-script Info.plist parity check | ✓ | system tool | `defaults read` |
| Safari with Develop menu enabled | Plan 01 probe console viewing | ✓ (already enabled per Phase 107 work) | system | — |
| Apple Development cert (Team 5H57ADQS8G) | xcodebuild signing | ✓ (provisioned Phase 107) | — | — |
| Physical Mac with Safari | UAT (HUMAN-UAT.md SC#5) | ✓ (iMac is the target) | — | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — but see Open Q1 about whether `spctl --assess` is the right check at all.

## Validation Architecture

**Workflow setting:** `.planning/config.json` does not set `workflow.nyquist_validation` to `false`. Treat as enabled. Section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Shell assertions (`grep`, `plutil`, `codesign`, `xcodebuild`) — same pattern as Phase 107 |
| Config file | None — Plan 00 (Wave 0) creates `scripts/verify-phase-114.sh` |
| Quick run command | `bash scripts/verify-phase-114.sh --static` |
| Full suite command | `bash scripts/verify-phase-114.sh` (full = static + runtime) |

The Xcode project has no test target (`xcodebuild -list` shows only schemes Vigil Capture, no Vigil Capture Tests). `[VERIFIED 2026-04-25]` Phase 107 took the same shell-assertions-only path; Phase 114 follows it.

### Phase Requirements → Test Map

| SC | Behavior | Test Type | Automated Command | File Exists? |
|----|----------|-----------|-------------------|--------------|
| SC#1 | Popup opens with empty textarea + focus | static (grep) | `grep -E "contentInput\\.value = '';" "vigil-safari-extension/Vigil Capture Extension/Resources/popup.js"` AND `grep "contentInput.focus()" ...popup.js` AND **negative** grep: `! grep -E "contentInput\\.value = .\\$\\{title\\}" ...popup.js` | ❌ Wave 0 |
| SC#2 | Include-URL checkbox appends `\n\n${title}: ${url}` | static (grep) | `grep 'id="include-url"' "vigil-safari-extension/Vigil Capture Extension/Resources/popup.html"` AND `grep -F 'finalContent += \`\\n\\n${tab.title \|\| ' "vigil-safari-extension/Vigil Capture Extension/Resources/popup.js"` | ❌ Wave 0 |
| SC#3 | Cmd+Enter submits | **manual probe (Plan 01)** + static grep for handler | Plan 01 SUMMARY.md captures empirical observation; static check: `grep -E "e\\.metaKey \\|\\| e\\.ctrlKey" "...popup.js"` AND `grep -E "captureBtn\\.click\\(\\)" "...popup.js"` | ❌ Wave 0 (probe is Plan 01; revert is part of same plan) |
| SC#4 | Triage badge after capture (poll up to 5s) | static (grep) | `grep "category-badge" "...popup.js"` AND `grep "setInterval" "...popup.js"` AND `grep "Date.now() - startTime > 5000" "...popup.js"` AND `grep "800" "...popup.js"` | ❌ Wave 0 |
| SC#5 | Re-sign + Safari restart | **partial-automated** + HUMAN-UAT | `xcodebuild build -project "vigil-safari-extension/Vigil Capture.xcodeproj" -scheme "Vigil Capture" -configuration Debug -quiet` (exit 0) AND `codesign --verify --verbose <APP>` (exit 0) AND `codesign --verify --verbose <APP>/Contents/PlugIns/Vigil\\ Capture\\ Extension.appex` (exit 0). Safari restart + popup-still-works = `114-HUMAN-UAT.md` (Phase 107 precedent). **`spctl --assess` is NOT a viable automated gate** — see Open Q1. | ❌ Wave 0 — needs user decision on Open Q1 first |

### Sampling Rate
- **Per task commit:** `bash scripts/verify-phase-114.sh --static` (~5s — pure grep)
- **Per plan merge:** `bash scripts/verify-phase-114.sh` (full = static + xcodebuild + codesign verify, ~30-60s)
- **Phase gate:** Full suite green + Plan 01 SUMMARY.md probe-pass attestation + 114-HUMAN-UAT.md SC#5 row marked ship-with-uat-pending

### Wave 0 Gaps
- [ ] `scripts/verify-phase-114.sh` — covers SC#1, SC#2, SC#3 (static handler grep), SC#4, SC#5 (xcodebuild + codesign verify)
- [ ] `114-VALIDATION.md` — maps each SC to verify-script check, calls out SC#3 manual-probe gate, calls out SC#5 → HUMAN-UAT carryforward
- [ ] `114-HUMAN-UAT.md` — Phase 107/113-style checklist for SC#3 probe outcome (paste console log) + SC#5 (Safari restart, click toolbar icon, type, ⌘+Enter, observe badge)
- [ ] **Resolution of Open Q1** before writing the verify script — the script's SC#5 check shape depends on user's pick

*(Test framework install: none needed; shell + xcodebuild + codesign already on iMac.)*

## Security Domain

`security_enforcement` is not explicitly disabled in `.planning/config.json`. Treat as enabled. Section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing `vk_*` bearer auth (Phase 38), no change. EXT-03 deferred to v3.7. |
| V3 Session Management | no | Extension has no session; bearer is the only credential. |
| V4 Access Control | yes | `chrome.tabs.query` requires `activeTab` permission (already in manifest); per-origin grant happens at first toolbar-icon click. No change. |
| V5 Input Validation | yes | `content` is trimmed in popup.js (current line 99); server validates `source ∈ {text,voice,image}` and non-empty `content` (thoughts.ts:277-285). No change. |
| V6 Cryptography | no | No crypto in popup; bearer is opaque token in transit over HTTPS only. |

### Known Threat Patterns for Safari WebExtension popup port

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via injected category text in badge | Tampering | Capitalized category is `cat.charAt(0).toUpperCase() + cat.slice(1)` — but `cat` itself comes from server response. Server limits category to enum (`task`/`therapy`/`idea`/`reflection`/`project`) at thoughts.ts:37-43 — `[VERIFIED]` so the `innerHTML` interpolation is safe. **No mitigation change.** |
| URL exfiltration via auto-prefill | Information Disclosure | SC#1 explicitly removes auto-prefill — URL only appended on opt-in. **D-07 codifies.** |
| Token leakage in error messages | Information Disclosure | Existing `captureError.textContent` shows generic HTTP status; never logs/displays the bearer. **No change.** |
| Cmd+Enter triggers unintended submit while textarea has invalid content | (UX, not security) | `captureBtn.click()` invokes the existing handler which calls `content.trim() === ''` check at popup.js:99. **No change.** |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `xcodebuild` incremental rebuild after only `Resources/*` file changes is fast (~5-15s) | Cmd+Enter Empirical Probe Mechanics — Step 2 | Plan time estimate slips by ~30s per rebuild; minor, doesn't affect correctness. |
| A2 | `chrome.tabs.query({active: true, currentWindow: true})` reliably returns `[tab]` with `tab.url` populated in Safari WebExtensions when the user has previously activated the extension on that origin | Pitfall 4 + Diff 2 URL append | If wrong: SC#2 fails on first activation per origin. Mitigation: existing `if (tab?.url)` guard means failure is silent (no URL appended) rather than crashing. Verbatim port preserves behavior. |
| A3 | Safari popup destroys the JS context when closed (so the in-flight `setInterval` is GC'd if the popup auto-closes during the 5s poll) | Common Pitfalls / Triage Poll | If wrong (interval keeps firing in a zombie context): no user-visible bug because the popup is gone, but a memory leak per popup-open. Verbatim Chrome port — Phase 94 didn't observe this in production for 9 days, so confidence is high. |
| A4 | `codesign --verify` is an acceptable substitute for `spctl --assess` as the SC#5 automatable gate, given the project's local-only Apple Development signing posture | Re-Sign + spctl --assess Mechanics + Open Q1 | If user picks "stick with spctl": the verify script will permanently fail SC#5 and the phase can't ship without notarization (unscoped work). **This is the load-bearing risk.** |
| A5 | The first-launch NSAlert from Phase 107 doesn't interfere with the Plan 01 keydown probe | Probe Gotchas | If wrong: developer gets confused by an alert mid-probe. Mitigation: dismiss alert before clicking toolbar icon. Documented in Plan 01 plan body. |
| A6 | The Web Inspector "right-click → Inspect Element from inside popup" workaround works in Safari 18.x on macOS 15.7.5 | Pitfall 2 + Probe Step 4 | If wrong: developer can't see console output during probe. Fallbacks: (a) write `metaKey` to a textarea visible in the popup itself, (b) write to `chrome.storage.local` and read post-popup-close. Both are inferior but executable. |

## Open Questions (RESOLVED)

> Resolution recorded 2026-04-26 during /gsd-plan-phase. All three questions answered before plan generation.

### Open Question 1 (LOAD-BEARING): SC#5 wording vs. project signing posture — RESOLVED via CONTEXT.md D-15

**What we know:**
- SC#5 says "spctl --assess passes."
- The project ships with Apple Development cert (Team 5H57ADQS8G), set up by Phase 107 hotfix for local dev.
- `spctl --assess --type {execute,install,open}` empirically rejects Apple Development-signed builds (`[VERIFIED 2026-04-25 on existing Debug build]`). Only Developer ID + notarized builds pass.
- Notarization (`xcrun notarytool` + Developer ID cert + stapler) is unscoped for v3.6.

**What's unclear:**
- Did the user mean `codesign --verify` when they wrote `spctl --assess` in the SC? (Likely — Phase 107 used `codesign --verify` as the actual signature-correctness check, and `spctl` was named without empirical verification.)
- Or do they want notarization in scope? (Unlikely — REQUIREMENTS.md explicitly defers extension distribution work to v3.7 EXT-03.)

**Recommendation for the planner:**
1. **Surface this to the user before writing Plan 05.** Frame as: "SC#5 says `spctl --assess passes`, but the project's Apple Development signing posture means `spctl --assess` will reject by design. Two options: (a) reword SC#5 to use `codesign --verify` as the load-bearing local check, or (b) add Developer ID + notarization to v3.6 scope. Recommend (a)."
2. If user picks (a): `114-VALIDATION.md` and `scripts/verify-phase-114.sh` use `codesign --verify --verbose` for both `<APP>` and `<APP>/Contents/PlugIns/Vigil Capture Extension.appex`. Document the rationale in 114-CONTEXT.md as a D-15 deltapatch.
3. If user picks (b): scope explosion — Plan 05 grows to include notarization plumbing. Likely deferred to a 114.1 phase.

### Open Question 2: Does `xcodebuild` reliably copy `Resources/*` changes into the `.appex` on incremental builds? — RESOLVED via CONTEXT.md D-16

**What we know:**
- `xcodebuild build` is the documented Phase 107 mechanic; the Phase 107 verify script depends on it producing an updated `.app`.
- Xcode's "Copy Files" build phase typically picks up changed `Resources/*` files automatically.

**What's unclear:**
- Is there a corner case where `xcodebuild build` (without `clean`) sees mtime-newer popup.js but doesn't propagate to the `.appex`? `[ASSUMED no based on Phase 107 RESEARCH; not empirically tested for this phase]`
- If yes: probe Step 2 silently uses stale popup.js, probe Step 5 reads no `[probe]` log, developer thinks `metaKey` doesn't fire.

**Recommendation:**
- Plan 01 should include a guarded "sanity probe" before the real keydown probe: insert `console.log('[BUILD]', new Date().toISOString())` at popup.js top, rebuild, open popup, confirm the timestamp is fresh. If yes → real probe. If no → `xcodebuild clean build` and retry.
- Or: just always use `xcodebuild clean build` for Plan 01 and Plan 05's final build. Adds ~30s but eliminates the entire class of staleness bugs.

### Open Question 3: Should the D-02 lockstep header comment go in popup.html before or after `<!DOCTYPE html>`? — RESOLVED via Diff Inventory (line 2, after DOCTYPE)

**What we know:**
- HTML5 mandates DOCTYPE first. Comments before DOCTYPE trigger quirks mode.

**What's unclear:**
- Tooling impact: does any linter or validation we use care?

**Recommendation:** Insert at line 2 (after DOCTYPE). The Diff Inventory specifies this explicitly. Fork-safe answer — codified.

## Sources

### Primary (HIGH confidence)
- Direct read: `vigil-extension/popup.{html,js,css}` (Chrome reference, source-of-truth) — 2026-04-25
- Direct read: `vigil-safari-extension/Vigil Capture Extension/Resources/popup.{html,js,css,manifest.json}` (port target) — 2026-04-25
- Direct read: `vigil-core/src/routes/thoughts.ts` (server contract for SC#4 poll) — 2026-04-25
- Direct read: `vigil-safari-extension/Vigil Capture.xcodeproj/project.pbxproj` (signing config verification) — 2026-04-25
- Empirical: `xcodebuild -version`, `spctl --assess --type {execute,install,open}`, `codesign --verify`, `codesign -dv` on existing Debug build — 2026-04-25 on iMac
- Direct read: `.planning/phases/107-safari-extension-persistence/107-RESEARCH.md` (Phase 107 toolchain + verify-script precedent)
- Direct read: `.planning/phases/107-safari-extension-persistence/107-HUMAN-UAT.md` (HUMAN-UAT format precedent)
- Direct read: `.planning/phases/113-verify-email-on-signup/113-HUMAN-UAT.md` (HUMAN-UAT format precedent — current example)
- Direct read: `scripts/verify-phase-107.sh` (verify-script structure precedent)

### Secondary (MEDIUM confidence)
- [Apple Developer Forums: tabs.query only returns tabs with permitted urls](https://developer.apple.com/forums/thread/660646) — confirms `chrome.tabs.query({active: true, currentWindow: true})` works in Safari WebExtensions, with permission-grant nuance
- [Apple Developer Documentation: Troubleshooting your Safari web extension](https://developer.apple.com/documentation/safariservices/safari_web_extensions/troubleshooting_your_safari_web_extension)
- [Mozilla Discourse: How is everyone debugging WebExtension popups](https://discourse.mozilla.org/t/how-is-everyone-debugging-webextension-popups-in-firefox-68/41095) — confirms the popup-closes-on-focus-shift pattern is cross-browser; right-click → Inspect Element is the standard workaround
- [Reflect.run: Guide to Safari Developer Tools](https://reflect.run/articles/guide-to-safari-developer-tools/) — confirms Develop menu + Web Inspector docking for Safari 18.x

### Tertiary (LOW confidence)
- [WebKit Bug 165004: keydown/keyup event order on macOS](https://bugs.webkit.org/show_bug.cgi?id=165004) — historical context for WebKit keyup-on-meta quirk, doesn't apply to keydown handlers
- [Electron issue 5188: keyup event not firing on OS X when Meta key is pressed](https://github.com/electron/electron/issues/5188) — same quirk family; not relevant to keydown

## Metadata

**Confidence breakdown:**
- Diff inventory: HIGH — direct file reads, line counts verified, every change traced to a Chrome source line
- Probe mechanics: HIGH — `xcodebuild`, `codesign`, `spctl` all empirically tested on iMac; only the keystroke observation is the human-in-the-loop step (which is the whole point of D-03)
- Re-sign + spctl: HIGH that `xcodebuild` re-signs cleanly; HIGH that `spctl --assess` rejects (empirically verified); MEDIUM that the planner should reword SC#5 (depends on user — Open Q1)
- Server contract for SC#4: HIGH — direct route read, fire-and-forget triage observed at thoughts.ts:315
- Pitfalls: HIGH for the four signing/inspector/Safari-quit ones (cited + Phase 107 precedent); MEDIUM for #6 DOCTYPE (general HTML5 knowledge)
- Validation Architecture: HIGH — pattern lifted directly from Phase 107
- Security: HIGH — server-side category enum is the load-bearing XSS guard, verified at thoughts.ts:37-43

**Research date:** 2026-04-25
**Valid until:** 2026-05-25 (30 days — Safari WebExtension runtime + macOS toolchain are stable; Apple Developer cert renewal cycle is the only thing that could invalidate this, and the team cert isn't expiring soon)
