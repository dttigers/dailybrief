# Phase 107: Safari Extension Persistence - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the Vigil Capture Safari extension stay enabled across macOS reboots without the user having to manually re-toggle it in Safari → Settings → Extensions. Achieved by registering the container app as a user-visible Login Item via `SMAppService.mainApp.register()` and flipping the container app to LSUIElement (accessory) mode so it never shows a window on launch.

**Explicitly out of scope** (per REQUIREMENTS.md §"Safari App Store submission" row): App Store submission, App Review, provisioning profile changes, distribution outside the current dev-signed build. This phase is the pragmatic Login-Item fix, not the store-signing work — that's a future milestone.

</domain>

<decisions>
## Implementation Decisions

### Window suppression

- **D-01:** Use `LSUIElement=true` in `vigil-safari-extension/Vigil Capture/Info.plist` to flip the container app to accessory mode. No Dock icon, no menu bar, no window on launch — ever. User reaches the app's UI only via Safari → Extensions → Vigil Capture → "Open preferences" button, which already triggers `ViewController.loadFileURL(Main.html)` via the existing flow in [ViewController.swift:46-54](../../../vigil-safari-extension/Vigil%20Capture/ViewController.swift#L46-L54).

### Registration call & idempotency

- **D-02:** Call `SMAppService.mainApp.register()` from `AppDelegate.applicationDidFinishLaunching(_:)`, replacing the current stub at [AppDelegate.swift:13-15](../../../vigil-safari-extension/Vigil%20Capture/AppDelegate.swift#L13-L15).
- **D-03:** **Status-guarded** — read `SMAppService.mainApp.status` first; only call `register()` if status is NOT `.enabled`. Keeps logs clean on every boot (no redundant upsert log lines) and gives a natural hook for the status pill in D-05.

### Failure handling & UX feedback

- **D-04:** **Status pill in ViewController / Main.html.** Extend the existing Main.html status UI (which today calls `show(state.isEnabled, hasPermission)` via [ViewController.swift:36-41](../../../vigil-safari-extension/Vigil%20Capture/ViewController.swift#L36-L41)) to also render `persistence: registered / failed / not-registered` alongside the extension-enabled state. Non-intrusive — user only sees it if they open the app via Safari prefs.
- **D-05:** **One-time first-launch NSAlert.** On the very first launch after install (detected via a UserDefaults boolean flag set after the alert is dismissed), show a single `NSAlert`: "Vigil Capture is installed. The extension will stay enabled across reboots." LSUIElement apps can show alerts when they are the active process. Gives the user clear proof that the one-time manual launch succeeded, without leaving any permanent UI.

### Hardware verification stance

- **D-06:** **Human-UAT pattern (matches Phase 104).** Phase 107 ships as complete once automated checks pass. The reboot-dependent SC#1 ("verified on physical hardware after full macOS restart") is persisted into `107-HUMAN-UAT.md` as a pending UAT item that surfaces in `/gsd-progress` until the user actually reboots and confirms. Avoids the 106-05 hardware-block stall.
- **D-07:** **Automated check set** that constitutes phase-complete (planner to formalize exact assertions):
  - `LSUIElement` key is present and `true` in container `Info.plist`
  - `AppDelegate.applicationDidFinishLaunching` contains the `SMAppService.mainApp.register()` call with status-guard
  - After a fresh `xcodebuild` + first-launch of the `.app`, `SMAppService.mainApp.status` reads `.enabled`
  - No visible window appears during first launch (manual check — but captured in automated build-and-launch script output)
  - Safari extension state (via `SFSafariExtensionManager.getStateOfSafariExtension`) reads `isEnabled: true` after a Safari restart (non-reboot proxy)

### Claude's Discretion

- Exact UserDefaults key name for the first-launch flag — planner picks (e.g., `vigil.firstLaunchAlertShown`).
- Exact error message text on `register()` failure pill — planner drafts, aligned with Vigil voice (concise, non-apologetic).
- Whether to log `register()` failures to `os_log` in addition to the pill — planner decides; recommended yes for debuggability.
- Whether to emit a PostHog/observability event for `register()` outcome — planner decides based on whether vigil-core observability bridge exists in the Safari container app bundle (likely no — it's not wired today).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 107: Safari Extension Persistence" (L319, L335-343) — goal, success criteria, no-deps status
- `.planning/REQUIREMENTS.md` §EXT-01 (L46) — acceptance text
- `.planning/REQUIREMENTS.md` §"Safari App Store submission" (L82) — scope exclusion: no App Review work in this phase
- `.planning/REQUIREMENTS.md` §EXT-01 traceability row (L104) — status: pending → phase 107

### Code integration points
- `vigil-safari-extension/Vigil Capture/AppDelegate.swift` (L13-L15) — stub `applicationDidFinishLaunching`; this is where D-02 `register()` lands
- `vigil-safari-extension/Vigil Capture/Info.plist` — where D-01 `LSUIElement=true` key is added
- `vigil-safari-extension/Vigil Capture/ViewController.swift` (L12, L28-L43, L45-L55) — existing bundle-ID wiring, Safari-state readback, and "Open preferences" terminate flow; D-04 status pill extends this
- `vigil-safari-extension/Vigil Capture/Base.lproj/Main.html` + `Resources/Script.js` — the web view content that renders the status UI; D-04 extends `show(...)` or adds a sibling renderer
- `vigil-safari-extension/Vigil Capture.xcodeproj/project.pbxproj` — `CODE_SIGN_STYLE = Automatic` already set (L433, L467, L503, L544); SMAppService requires signed code — no project.pbxproj changes expected for signing

### External (Apple documentation — planner/researcher should fetch current versions)
- `SMAppService.mainApp` — https://developer.apple.com/documentation/servicemanagement/smappservice (enum `.mainApp`, `register()`, `unregister()`, `status`)
- `LSUIElement` — https://developer.apple.com/documentation/bundleresources/information_property_list/lsuielement
- `SFSafariExtensionManager.getStateOfSafariExtension` — https://developer.apple.com/documentation/safariservices/sfsafariextensionmanager (already used in ViewController.swift:29 — no new API surface here)

### Prior-phase precedent
- `.planning/phases/104-pwa-auth-ui-browser-observability/104-CONTEXT.md` — Phase 104 established the "complete, all SCs human-verified" acceptance pattern that D-06 follows. Plan 104-03 summary line in STATE.md captures the exact shape: "Phase 104 complete, all 5 success criteria human-verified".

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets

- **ViewController.swift status readback** — Already calls `SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier:)` and bridges `isEnabled` to Main.html via `webView.evaluateJavaScript("show(...)")`. D-04's persistence pill reuses this exact bridge — add a second parameter to `show()` or a sibling call like `showPersistence(...)`.
- **Main.html / Script.js status UI** — Existing UI element renders extension-enabled state. D-04 adds a sibling pill rendering persistence state.
- **Bundle identifiers** — `io.vigilhub.extension` (container) and `io.vigilhub.extension.Extension` (extension) are already wired in [ViewController.swift:12](../../../vigil-safari-extension/Vigil%20Capture/ViewController.swift#L12) and project.pbxproj.
- **Open-preferences + terminate flow** — [ViewController.swift:45-55](../../../vigil-safari-extension/Vigil%20Capture/ViewController.swift#L45-L55) handles "open Safari prefs then quit." Compatible with LSUIElement — no change needed.

### Established patterns

- **Automatic code signing** — `CODE_SIGN_STYLE = Automatic` across both targets. SMAppService.mainApp requires signed code; automatic signing satisfies this for dev builds.
- **Storyboard-based window** — Main.storyboard defines the container window. Under LSUIElement=true this window never actually shows, but keeping the storyboard avoids an Info.plist + project.pbxproj refactor. No storyboard changes required.
- **No entitlements file today** — SMAppService.mainApp does NOT require a dedicated entitlement, so we can keep the current no-entitlements posture. (Note for planner: if `register()` fails in practice with a sandbox error, adding a minimal `.entitlements` file becomes a Plan N+1 branch.)

### Integration points

- **AppDelegate.applicationDidFinishLaunching** — single integration hook. All new code lands here plus one Info.plist edit plus Main.html/Script.js sibling. No changes to the extension .appex bundle.
- **UserDefaults key namespace** — no existing Vigil-specific keys in the Safari container app today; planner picks a reverse-DNS key under `io.vigilhub.extension.*` or simpler (`vigil.firstLaunchAlertShown`).

</code_context>

<specifics>
## Specific Ideas

- Phase 104 pattern reference: phase ships complete on automated checks, HUMAN-UAT.md carries the reboot-required item. User confirmed this explicitly during discussion — wants to avoid the 106-05 stall shape where a hardware dependency blocks the entire phase.
- "Non-apologetic, concise" Vigil voice applies to any user-facing copy (NSAlert body, pill text). No "Oops!", no emoji. Confirmed alignment with Vigil brand guidelines (see user memory).

</specifics>

<deferred>
## Deferred Ideas

- **NSStatusItem menu bar entry** — considered for "how does user reach the app" but rejected in favor of Safari-prefs-button flow (simpler, zero new UI surface). If a future phase wants always-accessible status, add a menu bar extra there.
- **Explicit "Disable persistence" toggle in ViewController** — considered as part of idempotency (Q3 option 3) but rejected; rely on System Settings → Login Items for user-initiated unregister, since that's the macOS-native path. Revisit if users confuse persistence state with extension-enabled state.
- **Observability event for register() outcome** — flagged as Claude's Discretion; deferred unless vigil-core observability bridge gets wired into the Safari container in a future phase.
- **.entitlements file** — not needed for SMAppService.mainApp today. Revisit only if `register()` fails with a sandbox error on real install.
- **App Store submission / distribution** — explicit scope exclusion per REQUIREMENTS.md L82; belongs in its own milestone.

</deferred>

---

*Phase: 107-safari-extension-persistence*
*Context gathered: 2026-04-20*
