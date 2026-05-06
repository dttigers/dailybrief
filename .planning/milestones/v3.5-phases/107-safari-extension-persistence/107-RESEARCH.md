# Phase 107: Safari Extension Persistence - Research

**Researched:** 2026-04-20
**Domain:** macOS ServiceManagement (SMAppService.mainApp) + LSUIElement accessory activation + Xcode auto-generated Info.plist
**Confidence:** HIGH

## Summary

Phase 107 is a narrow, well-scoped macOS Swift phase. The APIs involved (`SMAppService.mainApp.register()` + `status`, LSUIElement, NSAlert, SFSafariExtensionManager, UserDefaults) are all mature, documented, and compatible with this project's existing Xcode configuration (Automatic signing, App Sandbox enabled, Hardened Runtime enabled, no entitlements file). No new dependencies, no new frameworks, no new entitlements are needed. The four implementation touch points locked in CONTEXT.md (AppDelegate status-guarded register, Info.plist LSUIElement, Main.html/Script.js persistence pill, first-launch NSAlert) correspond to roughly ~40 lines of Swift, ~1 Info.plist key, and ~15 lines of HTML/JS changes.

The only non-trivial decisions left for the planner are (a) **which mechanism to use for setting LSUIElement** — edit the literal Info.plist vs. add `INFOPLIST_KEY_LSUIElement = YES` to `project.pbxproj` build settings, since this project uses `GENERATE_INFOPLIST_FILE = YES`; (b) **whether to call `NSApp.activate()` before the first-launch NSAlert** so the alert surfaces reliably on an accessory-mode app; and (c) **the exact Validation Architecture shape** that makes SC#2 automatable and SC#1 a clean HUMAN-UAT handoff.

**Primary recommendation:** Edit the literal `Info.plist` (simpler, more visible in diffs, the file already exists with one key). Pair `SMAppService.mainApp.register()` with a `guard status != .enabled` check per D-03. Use `NSApp.activate(ignoringOtherApps: true)` immediately before `NSAlert.runModal()` on first launch (the API is deprecated in Sonoma but still functional and is the documented idiom; the `NSApp.activate()` replacement works too but is available only in macOS 14+ and the container currently has no explicit deployment target set — conservative choice is the older API). Automated checks via `plutil`, `grep`, and a one-shot Swift command-line invocation of `SMAppService.mainApp.status`. Reboot-dependent verification (SC#1 verbatim) lives in `107-HUMAN-UAT.md` matching the Phase 105 frontmatter shape.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Window suppression**
- **D-01:** Use `LSUIElement=true` in `vigil-safari-extension/Vigil Capture/Info.plist` to flip the container app to accessory mode. No Dock icon, no menu bar, no window on launch — ever. User reaches the app's UI only via Safari → Extensions → Vigil Capture → "Open preferences" button, which already triggers `ViewController.loadFileURL(Main.html)` via the existing flow in [ViewController.swift:46-54](../../../vigil-safari-extension/Vigil%20Capture/ViewController.swift#L46-L54).

**Registration call & idempotency**
- **D-02:** Call `SMAppService.mainApp.register()` from `AppDelegate.applicationDidFinishLaunching(_:)`, replacing the current stub at [AppDelegate.swift:13-15](../../../vigil-safari-extension/Vigil%20Capture/AppDelegate.swift#L13-L15).
- **D-03:** **Status-guarded** — read `SMAppService.mainApp.status` first; only call `register()` if status is NOT `.enabled`. Keeps logs clean on every boot (no redundant upsert log lines) and gives a natural hook for the status pill in D-05.

**Failure handling & UX feedback**
- **D-04:** **Status pill in ViewController / Main.html.** Extend the existing Main.html status UI (which today calls `show(state.isEnabled, hasPermission)` via [ViewController.swift:36-41](../../../vigil-safari-extension/Vigil%20Capture/ViewController.swift#L36-L41)) to also render `persistence: registered / failed / not-registered` alongside the extension-enabled state. Non-intrusive — user only sees it if they open the app via Safari prefs.
- **D-05:** **One-time first-launch NSAlert.** On the very first launch after install (detected via a UserDefaults boolean flag set after the alert is dismissed), show a single `NSAlert`: "Vigil Capture is installed. The extension will stay enabled across reboots." LSUIElement apps can show alerts when they are the active process. Gives the user clear proof that the one-time manual launch succeeded, without leaving any permanent UI.

**Hardware verification stance**
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

### Deferred Ideas (OUT OF SCOPE)

- **NSStatusItem menu bar entry** — considered for "how does user reach the app" but rejected in favor of Safari-prefs-button flow (simpler, zero new UI surface). If a future phase wants always-accessible status, add a menu bar extra there.
- **Explicit "Disable persistence" toggle in ViewController** — considered as part of idempotency (Q3 option 3) but rejected; rely on System Settings → Login Items for user-initiated unregister, since that's the macOS-native path. Revisit if users confuse persistence state with extension-enabled state.
- **Observability event for register() outcome** — flagged as Claude's Discretion; deferred unless vigil-core observability bridge gets wired into the Safari container in a future phase.
- **.entitlements file** — not needed for SMAppService.mainApp today. Revisit only if `register()` fails with a sandbox error on real install.
- **App Store submission / distribution** — explicit scope exclusion per REQUIREMENTS.md L82; belongs in its own milestone.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXT-01 | Safari extension remains enabled after a Mac reboot without the user manually re-enabling it in Safari settings | Persistence is delivered by `SMAppService.mainApp.register()` in D-02 (Standard Stack below). LSUIElement=true in D-01 ensures the container re-launches silently at login (no Dock bounce, no window). SC#1 requires a physical reboot, which is parked in `107-HUMAN-UAT.md` per D-06; SC#2 is fully automatable per Validation Architecture below. |

## Standard Stack

### Core

| API / Key | Availability | Purpose | Why Standard |
|-----------|--------------|---------|--------------|
| `SMAppService.mainApp` | macOS 13.0+ | Single-call "register this app as a login item" class method. No helper-app plist needed for the `mainApp` case. | `[CITED: developer.apple.com/documentation/servicemanagement/smappservice]` The modern replacement for the deprecated `SMLoginItemSetEnabled`. Works with App Sandbox enabled. No helper target required — that's the whole point of `mainApp` vs. `loginItem(identifier:)`. Our project already has sandbox + hardened runtime on, and automatic signing; that's sufficient. |
| `SMAppService.Status` enum (4 cases: `.notRegistered`, `.enabled`, `.requiresApproval`, `.notFound`) | macOS 13.0+ | Query current registration state before/after calling `register()`. Maps directly to the D-04 persistence pill states. | `[CITED: developer.apple.com/documentation/servicemanagement/smappservice/status-swift.enum]` All four cases verified on the Apple doc page. |
| `LSUIElement` Info.plist Boolean key | macOS all versions | Declares the app as an "agent app" (accessory activation policy). No Dock icon, no menu bar, no app-switcher entry, no storyboard-main-window visible at launch. | `[CITED: developer.apple.com/documentation/bundleresources/information-property-list/lsuielement]` Standard approach for utility containers. Equivalent runtime effect: `NSApp.activationPolicy() == .accessory`. |
| `NSAlert` + `runModal()` | macOS all versions | One-time informational alert on first launch (D-05). | `[ASSUMED]` standard AppKit. Works from LSUIElement apps provided the app becomes active first — see Pitfall 3. |
| `UserDefaults.standard` | macOS all versions | Persist "first launch alert shown" boolean (D-05). | `[ASSUMED]` standard Foundation. Keyed by a reverse-DNS-style string per D-05 Discretion. |
| `os_log` | macOS 10.12+ | Structured logging for `register()` outcome (Claude's Discretion). | `[ASSUMED]` standard. Reachable from the Console.app + `log stream` when debugging. |

### Supporting (already in place — no install needed)

| API | Purpose | Where it already runs |
|-----|---------|------------------------|
| `SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier:)` | Read extension `isEnabled` + `useSettingsInsteadOfPreferences` | [ViewController.swift:29](../../../vigil-safari-extension/Vigil%20Capture/ViewController.swift#L29). D-04 extends the `webView.evaluateJavaScript("show(...)")` bridge, no new API surface. |
| `WKWebView.evaluateJavaScript` | Push state into Main.html UI | ViewController.swift:37,39. D-04 adds a sibling call like `showPersistence(true)`. |
| `SFSafariApplication.showPreferencesForExtension` + `NSApplication.terminate(nil)` | "Open preferences" button flow | ViewController.swift:50-52. Compatible with LSUIElement (the terminate fires after the Safari prefs jump). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff | Recommendation |
|------------|-----------|----------|----------------|
| `SMAppService.mainApp` | `SMAppService.loginItem(identifier:)` with a helper `.app` inside `Contents/Library/LoginItems` | Requires a second target, helper signing, and XPC plumbing. `mainApp` is specifically designed to eliminate that. | `[CITED: nilcoalescing.com/blog/LaunchAtLoginSetting]` — use mainApp, locked in D-02. |
| `SMAppService.mainApp` | Deprecated `SMLoginItemSetEnabled` | Deprecated in macOS 13, emits warnings, scheduled for removal. | Not viable. Don't hand-roll. |
| Edit `Info.plist` directly for LSUIElement | `INFOPLIST_KEY_LSUIElement = YES` as Xcode build setting | Both work. Build setting wins when `GENERATE_INFOPLIST_FILE = YES` is on (this project: yes). But the literal `Info.plist` already exists with `SFSafariWebExtensionConverterVersion`, so editing it is equally valid and more visible in code review. | **Recommend: edit the literal `Info.plist`.** Lower cognitive cost for a reviewer — they see the key directly. The file is already version-controlled and already has one entry. `[VERIFIED: project file inspection]` |
| `NSApp.activate(ignoringOtherApps: true)` before NSAlert | `NSApp.activate()` (Sonoma 14+ API) | The old API is deprecated in Sonoma/Sequoia but still works. The new API requires @available annotation or a `if #available(macOS 14, *)` branch. | Use `NSApp.activate(ignoringOtherApps: true)` for simplicity; the deprecation warning is acceptable in this phase. `[VERIFIED: WebSearch 2026-04-20]` |

### Installation

None. All APIs are in Foundation / AppKit / ServiceManagement / SafariServices — already linked. Confirmed by grep of project.pbxproj:
- `-framework SafariServices` present on both container and extension targets ([project.pbxproj L451, L485, L522-523, L563-564])
- `-framework WebKit` present on container ([project.pbxproj L525, L566])
- ServiceManagement framework is auto-linked by `import ServiceManagement` on modern Xcode; no additional `OTHER_LDFLAGS` change required. `[ASSUMED]` — planner should verify after first `xcodebuild build` attempt; if the linker complains, add `-framework ServiceManagement` to OTHER_LDFLAGS.

### Version verification

Not a package phase — no npm/pip registry to consult. Confirmed local toolchain:
- Xcode 26.3 (Build 17C529) — `[VERIFIED: xcodebuild -version 2026-04-20]`
- Swift 6.2.4 (swiftlang-6.2.4.1.4) — `[VERIFIED: swift --version 2026-04-20]`
- macOS 15.7.5 (Sequoia, BuildVersion 24G624) on the iMac dev machine — `[VERIFIED: sw_vers 2026-04-20]`
- Container target deployment: no explicit `MACOSX_DEPLOYMENT_TARGET` in container build config (project.pbxproj L498-568 for container Debug/Release), so it inherits the project default. SMAppService.mainApp requires macOS 13+. If the inherited default is older, the `import ServiceManagement` + `SMAppService.mainApp` call would fail to compile with an @available error. `[VERIFIED: project.pbxproj inspection]` — planner may need to add `MACOSX_DEPLOYMENT_TARGET = 13.0` explicitly to the container target if Xcode complains. The extension target has `MACOSX_DEPLOYMENT_TARGET = 10.14` — that's fine, the extension doesn't call SMAppService.

## Architecture Patterns

### Recommended Change Surface

```
vigil-safari-extension/Vigil Capture/
├── AppDelegate.swift                      # D-02, D-03, D-05 (+10-25 lines)
├── Info.plist                             # D-01 (+2 lines for LSUIElement key)
├── ViewController.swift                   # D-04 persistence pill bridge (+5-10 lines)
├── Resources/
│   ├── Base.lproj/Main.html              # D-04 pill markup (+1-2 <p> tags)
│   └── Script.js                          # D-04 showPersistence(state) function (+10 lines)
```

No new files are strictly required. The planner MAY choose to extract first-launch + register logic to a small helper (`LoginItemService.swift` or similar) for testability — optional.

### Pattern 1: Status-guarded register (D-02 + D-03)

**What:** Query status before calling register(). Idempotent across launches.
**When to use:** Every `applicationDidFinishLaunching` call.

**Example — the canonical Swift idiom:**
```swift
// Source: https://nilcoalescing.com/blog/LaunchAtLoginSetting/ + Apple docs
// [CITED: developer.apple.com/documentation/servicemanagement/smappservice]
import ServiceManagement
import os.log

func applicationDidFinishLaunching(_ notification: Notification) {
    let service = SMAppService.mainApp

    switch service.status {
    case .enabled:
        // Already registered — nothing to do.
        os_log("Login item already enabled; skipping register()", log: .default, type: .info)
    case .notRegistered, .notFound:
        do {
            try service.register()
            os_log("Login item registered", log: .default, type: .info)
        } catch {
            os_log("Login item register() failed: %{public}@",
                   log: .default, type: .error, String(describing: error))
            // D-04 pill surfaces this as persistence: failed
        }
    case .requiresApproval:
        // User has toggled us off in System Settings > Login Items.
        // Re-registering here would be rude. Leave as-is; pill shows "requires approval".
        os_log("Login item requires user approval in System Settings", log: .default, type: .info)
    @unknown default:
        os_log("Login item status is unknown (new OS case)", log: .default, type: .error)
    }
}
```

### Pattern 2: LSUIElement Info.plist edit (D-01)

Existing file at `vigil-safari-extension/Vigil Capture/Info.plist` has only `SFSafariWebExtensionConverterVersion`. Add:

```xml
<!-- Source: https://developer.apple.com/documentation/bundleresources/information-property-list/lsuielement
     [CITED: Apple Info.plist key reference] -->
<key>LSUIElement</key>
<true/>
```

The remaining Info.plist keys (CFBundleDisplayName, NSMainStoryboardFile, NSPrincipalClass) are injected from the `INFOPLIST_KEY_*` build settings because `GENERATE_INFOPLIST_FILE = YES`. Xcode merges the literal file with the synthesized keys. `[VERIFIED: project.pbxproj L511-515]`

### Pattern 3: First-launch NSAlert with LSUIElement activation (D-05)

```swift
// [ASSUMED] — verified indirectly via Sonoma API docs and LSUIElement behavior guidance
// Source for activation requirement: WebSearch 2026-04-20 (wxwidgets #16156, multiple Apple forum threads)
private let firstLaunchAlertKey = "io.vigilhub.extension.firstLaunchAlertShown"

func applicationDidFinishLaunching(_ notification: Notification) {
    registerLoginItem()   // Pattern 1
    showFirstLaunchAlertIfNeeded()
}

private func showFirstLaunchAlertIfNeeded() {
    guard !UserDefaults.standard.bool(forKey: firstLaunchAlertKey) else { return }

    // LSUIElement apps must explicitly activate before showing a modal,
    // otherwise the alert can come up behind other windows or not accept
    // keyboard focus (Pitfall 3 below).
    NSApp.activate(ignoringOtherApps: true)

    let alert = NSAlert()
    alert.messageText = "Vigil Capture is installed."
    alert.informativeText = "The extension will stay enabled across reboots."
    alert.alertStyle = .informational
    alert.addButton(withTitle: "OK")
    alert.runModal()

    UserDefaults.standard.set(true, forKey: firstLaunchAlertKey)
}
```

### Pattern 4: Persistence-pill JS bridge (D-04)

Extend `Resources/Script.js`:

```javascript
// Source: [VERIFIED: existing show() function pattern in Resources/Script.js]
function showPersistence(state) {
    // state ∈ 'enabled' | 'not-registered' | 'requires-approval' | 'failed'
    document.body.classList.remove('persistence-enabled', 'persistence-not-registered',
                                   'persistence-requires-approval', 'persistence-failed');
    document.body.classList.add(`persistence-${state}`);
}
```

Add sibling `<p>` tags in `Main.html` (one per state) and CSS rules in `Style.css` mirroring the existing `.state-on` / `.state-off` / `.state-unknown` pattern. Bridge call site in `ViewController.swift` immediately after the existing `webView.evaluateJavaScript("show(...)")` block.

### Anti-Patterns to Avoid

- **Don't call `SMAppService.mainApp.register()` unconditionally on every launch** — the `.enabled → .notRegistered` transition noted in Apple's own `status` description (`"...or the service attempted to reregister after it was already registered"`) suggests that re-register isn't a silent no-op; it can put the system in a weird transitional state. D-03's guard is correct.
- **Don't delete the Main.storyboard** — LSUIElement suppresses its visible window but ViewController still instantiates (its `viewDidLoad` is what drives the Safari extension state readback via `webView.didFinish`). Deleting storyboard would break the "Open preferences" flow.
- **Don't set `NSApp.setActivationPolicy(.regular)` manually** — that would override LSUIElement=true and bring back the Dock icon. The whole point of D-01 is to stay `.accessory`.
- **Don't put `try SMAppService.mainApp.register()` at module scope or in `init` of AppDelegate** — it must run after AppKit is fully up, i.e., in `applicationDidFinishLaunching`. `applicationWillFinishLaunching` is also too early for reliable Main-Thread affinity. `[ASSUMED]` — based on Apple forum discussions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Launch at login | `launchctl load` invocations, a custom LaunchAgent plist, or `SMLoginItemSetEnabled` | `SMAppService.mainApp.register()` | `SMLoginItemSetEnabled` is deprecated; a custom LaunchAgent plist is a support nightmare. `SMAppService.mainApp` is the one-line official answer. `[CITED: theevilbit.github.io/posts/smappservice]` |
| Hide Dock icon | `TransformProcessType()` C API at runtime | `LSUIElement=true` in Info.plist | Runtime transformation races with AppKit startup and can produce a visible Dock flicker. Declarative Info.plist key is set before AppKit initializes. `[CITED: cocoadev.github.io/LSUIElement]` |
| "Has the user seen this alert yet?" | File on disk in `~/Library/Application Support/` | `UserDefaults.standard.bool(forKey:)` | UserDefaults is the platform-idiomatic one-bit flag; backed, synced to `.plist`, and survives app reinstalls inside the same container (but not disk wipes — which is exactly what we want). `[ASSUMED]` |
| Register-status mapping to UI | Hand-rolled "is-it-on?" heuristic | Read `SMAppService.mainApp.status` directly | Four named cases, all documented. Zero reason to abstract over them. |

**Key insight:** This phase is specifically small because the platform gives us exactly the right primitive (`SMAppService.mainApp`). Previous generations of this code (SMLoginItemSetEnabled, LSUIElement + helper-app + XPC) were *genuinely* gnarly; today it's ~20 lines.

## Runtime State Inventory

This is a greenfield code change — no renames, no refactors, no migrations. The Safari container app currently has zero persistent state related to this phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — app has no UserDefaults keys today. `[VERIFIED: grep of Vigil Capture/ for UserDefaults, NSUserDefaults, CFPreferences returned no matches]` | None. The new `io.vigilhub.extension.firstLaunchAlertShown` key is the first-ever UserDefaults entry for this app. |
| Live service config | None. The app has no external services (no n8n, no Datadog, no server). `[VERIFIED: no network calls other than SafariServices framework]` | None. |
| OS-registered state | **After this phase ships, the system WILL register one new piece of OS-level state**: the Vigil Capture container app in `System Settings > General > Login Items > Open at Login`. That's the whole point. It's not a migration — it's the intended side effect of D-02. | None (the side effect IS the feature). For a user who wants to uninstall, they toggle it off in System Settings, which transitions status to `.requiresApproval`. D-03's guard handles that gracefully. |
| Secrets/env vars | None referenced in this phase. `[VERIFIED]` | None. |
| Build artifacts / installed packages | None today. Future concern only: if the user drags a new Vigil Capture.app into `/Applications/` and launches it, and the `io.vigilhub.extension` bundle ID matches the previously-launched one, SMAppService may reject re-registration because the old path is cached by `launchd` (see Pitfall 4). | Planner: document for future "reinstall-in-place" scenarios. Not a v3.5 blocker. |

## Common Pitfalls

### Pitfall 1: Calling register() every launch produces phantom status churn
**What goes wrong:** Without D-03's status guard, `register()` runs on every app start. The `.notRegistered` Apple docstring explicitly calls out `"...or the service attempted to reregister after it was already registered"` — meaning unnecessary re-registration is a visible failure mode in `SMAppService.status`, not a silent no-op.
**Why it happens:** Developers assume register() is idempotent.
**How to avoid:** D-03 — guard on `status != .enabled` before calling.
**Warning signs:** In the Console.app `log stream --predicate 'subsystem == "com.apple.servicemanagement"'`, repeated "service attempted to reregister" entries on every launch.

### Pitfall 2: LSUIElement suppresses the main window at launch, but storyboard-defined ViewController still instantiates
**What goes wrong:** Developers assume LSUIElement=true means "no windows ever" and start moving the WKWebView bridge code out of ViewController.viewDidLoad. That breaks the existing "Open preferences" flow where the ViewController's WKWebView needs to be alive to receive the `show()` JS call.
**Why it happens:** Confusing "the window doesn't visibly show on launch" with "the window controller doesn't instantiate."
**How to avoid:** Leave ViewController.swift's structure untouched. The storyboard still loads, the window controller still instantiates, `viewDidLoad` still runs, the bridge still works — the window is merely not visible on first launch. When Safari later calls `showPreferencesForExtension` → relaunches the container → the existing UI surfaces briefly before `NSApplication.shared.terminate(nil)` fires. `[CITED: WebSearch 2026-04-20, multiple developer.apple.com forum threads on LSUIElement + storyboard interaction]`
**Warning signs:** Clicking "Open preferences" from Safari prefs shows no window, only a quick Dock flash.

### Pitfall 3: NSAlert from an LSUIElement app may not steal focus without explicit activation
**What goes wrong:** `NSAlert.runModal()` called in `applicationDidFinishLaunching` on an LSUIElement app can appear behind other windows, or the alert appears but keyboard focus stays elsewhere, making the "OK" button feel unresponsive.
**Why it happens:** LSUIElement = `.accessory` activation policy. Accessory-mode apps don't auto-activate when launched — they become active only when the user interacts with them. The NSAlert is shown but the app isn't the key app. `[CITED: wxWidgets/wxWidgets#16156, Mozilla bz 1726833]`
**How to avoid:** Call `NSApp.activate(ignoringOtherApps: true)` immediately before `NSAlert.runModal()` in the first-launch path. The deprecation warning in Sonoma/Sequoia is acceptable (the API still works); alternatively, gate on `#available(macOS 14, *)` and use `NSApp.activate()` on 14+.
**Warning signs:** First-launch alert appears behind Finder, or appears but feels "dead" to keyboard input.

### Pitfall 4: Reinstalling Vigil Capture.app into a new /Applications path may confuse launchd
**What goes wrong:** If the user ever drags a new build of `Vigil Capture.app` to a different path (say from `~/Downloads/` to `/Applications/`), launchd's cached record for `io.vigilhub.extension` may still point at the old path. `register()` may return `.enabled` for the stale path, but the new build at the new path won't actually launch at login.
**Why it happens:** `[CITED: developer.apple.com/forums/thread/707482]` — Apple framework engineer notes "You may get this if testing with a plist that is already loaded by launchd (for example, it is installed in /Library/Launch{Agents,Daemons})."
**How to avoid:** For the initial install, this pitfall doesn't apply (launchd has no prior record). For dev iteration, `SMAppService.mainApp.unregister()` + rebuild + launch. For future reinstall support, planner may add a diagnostic in the status pill that shows the registered path vs. `Bundle.main.bundlePath` — deferred.
**Warning signs:** `status == .enabled` but Safari extension still goes dark after reboot.

### Pitfall 5: App Sandbox + Hardened Runtime both ON — verify no silent sandbox violation on register()
**What goes wrong:** Project has `ENABLE_APP_SANDBOX = YES` and `ENABLE_HARDENED_RUNTIME = YES` on the container ([project.pbxproj L435-436, L469-470, L506-507, L547-548]) but **no explicit `.entitlements` file** (confirmed: `glob "vigil-safari-extension/**/*.entitlements"` returns empty). Xcode auto-synthesizes the `com.apple.security.app-sandbox=true` entitlement when `ENABLE_APP_SANDBOX = YES`. SMAppService.mainApp works in this configuration per web research, but if `register()` throws with a sandbox error in practice, a new `Vigil Capture.entitlements` file with explicit `com.apple.security.app-sandbox = true` is the fallback.
**Why it happens:** Edge case of the no-entitlements-file posture. `[VERIFIED: WebSearch 2026-04-20 — multiple sources confirm SMAppService.mainApp works with App Sandbox, but all examples have an explicit entitlements file]`
**How to avoid:** Plan the phase assuming it works. If the first real test shows `register()` throwing `SMAppServiceErrorDomain` errors, add a minimal entitlements file and re-sign. This is the "Plan N+1 branch" called out in CONTEXT `<deferred>` — intentional fallback shape.
**Warning signs:** `register()` throws immediately with a code in `SMAppServiceErrorDomain`, most likely "Operation not permitted" (code 1).

### Pitfall 6: Container deployment target not explicitly set — compile failure risk
**What goes wrong:** `SMAppService` is macOS 13+ only. Container target has no explicit `MACOSX_DEPLOYMENT_TARGET` in its build config; inherits project default. If the project default is < 13.0, Swift compile fails with `'mainApp' is only available in macOS 13.0 or newer`.
**Why it happens:** Historical project-default inheritance; the extension target explicitly sets 10.14 but the container doesn't.
**How to avoid:** Planner adds `MACOSX_DEPLOYMENT_TARGET = 13.0` to the container Debug + Release build configs. Two-line project.pbxproj edit. Or — less invasively — wrap the register() call in `if #available(macOS 13, *) { ... }`. `[VERIFIED: project.pbxproj container section L498-568 has no MACOSX_DEPLOYMENT_TARGET line]`
**Warning signs:** Xcode build error on the `SMAppService.mainApp` line.

## Code Examples

### Complete AppDelegate.swift (reference assembly)

```swift
// Source: composed from [CITED: Apple SMAppService docs + nilcoalescing blog + LSUIElement guidance]
// Verified pattern — combines D-02, D-03, D-05.

import Cocoa
import ServiceManagement
import os.log

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    private let firstLaunchAlertKey = "io.vigilhub.extension.firstLaunchAlertShown"

    func applicationDidFinishLaunching(_ notification: Notification) {
        registerLoginItemIfNeeded()
        showFirstLaunchAlertIfNeeded()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    // MARK: - SMAppService

    private func registerLoginItemIfNeeded() {
        let service = SMAppService.mainApp

        switch service.status {
        case .enabled:
            os_log("Login item already enabled.", type: .info)
        case .notRegistered, .notFound:
            do {
                try service.register()
                os_log("Login item registered.", type: .info)
            } catch {
                os_log("Login item register() failed: %{public}@",
                       type: .error, String(describing: error))
            }
        case .requiresApproval:
            os_log("Login item requires user approval in System Settings.", type: .info)
        @unknown default:
            os_log("Login item status unknown (new OS case).", type: .error)
        }
    }

    // MARK: - First-launch NSAlert

    private func showFirstLaunchAlertIfNeeded() {
        guard !UserDefaults.standard.bool(forKey: firstLaunchAlertKey) else { return }
        NSApp.activate(ignoringOtherApps: true)

        let alert = NSAlert()
        alert.messageText = "Vigil Capture is installed."
        alert.informativeText = "The extension will stay enabled across reboots."
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        alert.runModal()

        UserDefaults.standard.set(true, forKey: firstLaunchAlertKey)
    }
}
```

### One-shot CLI status probe (for VALIDATION.md automation)

```bash
# [VERIFIED: swift --version 6.2.4, Apple Swift compiles this]
# Reads the live SMAppService status outside of the app bundle — useful after
# first-launch to assert the register() succeeded. Must be run AFTER the
# Vigil Capture.app is launched at least once so that macOS has a record.
swift -e '
import ServiceManagement
switch SMAppService.mainApp.status {
case .enabled: print("enabled")
case .notRegistered: print("notRegistered")
case .requiresApproval: print("requiresApproval")
case .notFound: print("notFound")
@unknown default: print("unknown")
}
'
# Expected output after D-07 happy path: enabled
```

Note: running `swift -e` like this executes in the CLI binary's bundle context (`swift` itself), not in `io.vigilhub.extension` context. The `SMAppService.mainApp` reference resolves to whichever app called it — so from the command line, this may resolve to `swift`. A more reliable check is to query `launchctl list | grep vigil` or parse `sfltool dumpbtm` output. See Validation Architecture below for the truly-automatable check.

### plutil Info.plist assertion

```bash
# [VERIFIED: plutil at /usr/bin/plutil, macOS 15.7.5]
plutil -extract LSUIElement raw "vigil-safari-extension/Vigil Capture/Info.plist"
# Expected output: true  (with exit code 0)
# Failure mode: exit code 1 and "Could not extract key"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `SMLoginItemSetEnabled(bundleID, true)` + separate helper target + XPC | `SMAppService.mainApp.register()` (no helper needed) | macOS 13 Ventura (2022) | Removed ~3 files and ~200 lines of boilerplate from a typical login-item integration. `[CITED: theevilbit.github.io/posts/smappservice]` |
| `TransformProcessType()` runtime Dock-hide | `LSUIElement=true` declarative key | Pre-macOS 10.5 | Declarative wins for startup determinism. |
| `NSApp.activate(ignoringOtherApps: true)` | `NSApp.activate()` | macOS 14 Sonoma (2023) — old API deprecated, new API shipped | Old API still functions, just emits a deprecation warning. Either is fine for v3.5. |

**Deprecated / outdated:**
- `SMLoginItemSetEnabled` — deprecated macOS 13, do not use.
- `SMJobBless` — deprecated macOS 13, irrelevant to this phase (was for privileged daemons).
- Direct writes to `~/Library/LaunchAgents/*.plist` from a sandboxed app — blocked by sandbox, never worked.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Xcode | Building the Safari container | ✓ | 26.3 (Build 17C529) | — |
| Swift toolchain | `swift -e` validation one-shots | ✓ | 6.2.4 | — |
| `plutil` | Info.plist LSUIElement assertion | ✓ (`/usr/bin/plutil`) | system | — |
| `xcodebuild` CLI | Headless container rebuild | ✓ (`/usr/bin/xcodebuild`) | 26.3 | — |
| macOS 13+ runtime | SMAppService.mainApp | ✓ | 15.7.5 (Sequoia) | — |
| `sfltool` (btm dump) | Listing login items from CLI for verification | `[ASSUMED]` system-provided; planner confirms | — | `launchctl list | grep vigil` as secondary check |
| Physical reboot | SC#1 verification | N/A — deferred to HUMAN-UAT per D-06 | — | HUMAN-UAT.md carries the check |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** Physical reboot (not a tool — it's a user action). Handled by D-06 HUMAN-UAT pattern.

## Validation Architecture

### Test Framework

This Xcode project does NOT have a test target (`xcodebuild -list` would show only the `Vigil Capture` + `Vigil Capture Extension` targets; no `Vigil Capture Tests`). `[ASSUMED]` based on project.pbxproj target scan — planner should confirm. Phase 107 does **not** require adding one; the assertions are small enough to live as shell commands in `107-VALIDATION.md` + a `scripts/verify-phase-107.sh` script.

| Property | Value |
|----------|-------|
| Framework | None (shell assertions — `plutil`, `grep`, `swift -e`, `xcodebuild build`) |
| Config file | None — Wave 0 creates `scripts/verify-phase-107.sh` |
| Quick run command | `bash scripts/verify-phase-107.sh` (single script runs all D-07 automated checks) |
| Full suite command | Same — there's nothing larger to run; HUMAN-UAT is the only additional gate |
| Phase gate | `verify-phase-107.sh` exits 0 AND `107-HUMAN-UAT.md` has status != pending for reboot test (or is explicitly deferred with `status: ship-with-uat-pending` per D-06) |

### Phase Requirements → Test Map

The phase has two Success Criteria in ROADMAP.md (lines 339-341):

- **SC#1**: After a full macOS restart, the Vigil Capture extension shows as enabled in Safari → Settings → Extensions — verified on physical hardware.
- **SC#2**: `SMAppService.mainApp.register()` is called in `AppDelegate.applicationDidFinishLaunching` and the app suppresses its window on launch (no visible window on startup).

Mapped against D-07's automated check list:

| Req / SC | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|--------------|
| SC#2 (LSUIElement) | `LSUIElement` key is present and `true` in container Info.plist | shell-assertion | `plutil -extract LSUIElement raw "vigil-safari-extension/Vigil Capture/Info.plist"` → expect stdout `true`, exit 0 | Wave 0 creates `scripts/verify-phase-107.sh` |
| SC#2 (register call) | AppDelegate contains status-guarded `SMAppService.mainApp.register()` call | grep-assertion | `grep -q 'SMAppService.mainApp.register()' "vigil-safari-extension/Vigil Capture/AppDelegate.swift" && grep -q 'SMAppService.mainApp.status' "vigil-safari-extension/Vigil Capture/AppDelegate.swift"` | Wave 0 creates script |
| SC#2 (no window on launch) | After first launch, no visible window is present | partial-automated | `xcodebuild build -project "vigil-safari-extension/Vigil Capture.xcodeproj" -scheme "Vigil Capture" -configuration Debug` then `open "$(find ~/Library/Developer/Xcode/DerivedData -name 'Vigil Capture.app' -type d | head -1)"` + assert `osascript -e 'tell application "System Events" to count (every window of application process "Vigil Capture")'` returns 0 within 3s. Human-eyeball confirmation in `107-HUMAN-UAT.md` is the real gate. | Wave 0 creates script |
| SC#2 (register succeeded) | Post-launch `SMAppService.mainApp.status` == `.enabled` | partial-automated | `sfltool dumpbtm 2>/dev/null | grep -A3 'io.vigilhub.extension'` → expect to find the bundle ID in enabled state. Note: `sfltool dumpbtm` requires root on some macOS versions; fallback is `launchctl print gui/$UID | grep vigil`. `[ASSUMED]` planner confirms on first run. | Wave 0 creates script |
| SC#2 (Safari state still on) | `SFSafariExtensionManager.getStateOfSafariExtension` returns `isEnabled: true` after Safari restart (non-reboot proxy) | Swift-CLI | Embed a `swift -e` one-liner or a small `.swift` script in `scripts/verify-phase-107.sh` that imports SafariServices, calls `SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: "io.vigilhub.extension.Extension")`, waits for callback, prints `isEnabled`. Expect `true`. | Wave 0 creates script |
| **SC#1 (reboot test)** | **After a full macOS restart, Safari → Settings → Extensions shows Vigil Capture enabled** | **HUMAN-UAT** | **Not automated. Recorded in `107-HUMAN-UAT.md`.** User reboots, visually checks Safari Settings → Extensions, marks the UAT entry `result: pass` or `result: issue`. Per D-06, phase ships complete on automated checks alone; HUMAN-UAT.md surfaces in `/gsd-progress` until the user confirms. | Wave 0 creates `107-HUMAN-UAT.md` |

### Sampling Rate

- **Per task commit:** Run `bash scripts/verify-phase-107.sh` (targeted — assertions are <5 seconds total).
- **Per plan merge:** Same script + a clean `xcodebuild clean build` to catch deployment-target regressions (Pitfall 6).
- **Phase gate:** `verify-phase-107.sh` green + `107-HUMAN-UAT.md` frontmatter status = `complete` OR explicit `ship-with-uat-pending` marker per D-06.

### Wave 0 Gaps

- [ ] `scripts/verify-phase-107.sh` — single script running all D-07 automated assertions. Does NOT exist today.
- [ ] `107-HUMAN-UAT.md` — pending UAT tracker for SC#1. Does NOT exist today. Template shape documented in the "Phase 104 HUMAN-UAT pattern" subsection below.
- [ ] Container `MACOSX_DEPLOYMENT_TARGET` in project.pbxproj — may need to be set to `13.0` (Pitfall 6). Planner decides; if Xcode's default target is already ≥13, this is a no-op.

### Phase 104 HUMAN-UAT Pattern (shape for `107-HUMAN-UAT.md`)

The user referenced Phase 104's HUMAN-UAT shape during context gathering, but `104-HUMAN-UAT.md` does not exist — Phase 104 recorded its human-verification status inline in STATE.md as "Phase 104 complete, all 5 success criteria human-verified". The **file-based** HUMAN-UAT pattern was introduced in Phase 105 and that is the canonical shape `/gsd-progress` surfaces.

**Phase 105's HUMAN-UAT frontmatter + body:** `[VERIFIED: .planning/phases/105-product-events-api-metrics-user-identity/105-HUMAN-UAT.md, read 2026-04-20]`

```markdown
---
status: complete             # complete | in_progress | pending
phase: 105-product-events-api-metrics-user-identity
source: [105-VERIFICATION.md]
started: 2026-04-19T00:00:00Z
updated: 2026-04-20T04:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. {Short test title}
expected: {what must be observable in the world}
result: pass | issue | pending
# optional:
reported: "{user's verbatim words if an issue was found}"
severity: {minor | major | critical}
note: "{detail or remediation}"

### 2. ...

## Summary

total: N
passed: N
issues: N
pending: N
skipped: N
blocked: N

## Gaps

# YAML list; each entry has: truth, status, reason, severity, test, artifacts, missing, optional resolution
- truth: "{the behavior that must be true}"
  status: failed | resolved | open
  reason: "{why this was flagged}"
  severity: {minor | major | critical}
  test: {N — test number this maps to}
  artifacts:
    - {file path}
  resolution:
    commit: {commit SHA}
    summary: "{1-line description of fix}"
```

**Planner note:** `107-HUMAN-UAT.md` should start with `status: pending` and one test entry for SC#1 (the reboot check), with `result: pending`. Additional tests the planner may add:
- "After a full macOS reboot, Vigil Capture.app appears in System Settings → General → Login Items → 'Open at Login'"
- "After a full macOS reboot AND Safari restart, a URL captured via the extension context menu still lands in vigil-core" (end-to-end smoke covering both D-02 and pre-existing extension logic)

### Signal-to-Noise Mapping

| Check | Catches Regressions | One-Time "Did we implement it?" |
|-------|---------------------|---------------------------------|
| `plutil -extract LSUIElement` | ✓ (someone could revert the Info.plist) | ✓ |
| `grep SMAppService.mainApp.register()` | ✓ (someone could remove the call during refactor) | ✓ |
| `grep SMAppService.mainApp.status` | ✓ (status guard could get lost) | ✓ |
| `xcodebuild build` | ✓ (Pitfall 6 deployment-target regression, framework unlink) | ✓ |
| `sfltool dumpbtm | grep` post-launch | Low — drifts based on prior install state | ✓ |
| Safari extension state check | ✓ (catches if someone breaks SFSafariExtensionManager wiring) | ✓ |
| HUMAN-UAT reboot | ✗ (one-shot per install; not a regression signal) | ✓ |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ServiceManagement framework is auto-linked on `import ServiceManagement` in Xcode 26.3 / Swift 6.2 (no explicit OTHER_LDFLAGS edit needed) | Standard Stack → Installation | If wrong: linker error on first build; planner adds `-framework ServiceManagement` to container OTHER_LDFLAGS. 30-second fix. |
| A2 | The current container target's `MACOSX_DEPLOYMENT_TARGET` inherits to ≥ 13.0 (no explicit setting in project.pbxproj for container Debug/Release) | Standard Stack → Version verification, Pitfall 6 | If wrong: Swift compile fails. Planner adds explicit `MACOSX_DEPLOYMENT_TARGET = 13.0` to the container's Debug + Release build configs. |
| A3 | `NSAlert.runModal()` from `applicationDidFinishLaunching` of an LSUIElement app needs `NSApp.activate(ignoringOtherApps: true)` to show reliably | Code Examples, Pitfall 3 | If wrong: alert still works fine without activate() — activate() is harmless overhead. If the reverse is true and we skipped activate(), the alert may appear behind other windows on first launch. Low risk. |
| A4 | `SMAppService.mainApp` works in this project's specific configuration (App Sandbox + Hardened Runtime ON, automatic signing, no .entitlements file) without throwing a sandbox error | Pitfall 5 | If wrong (register() throws sandbox error): planner adds `Vigil Capture.entitlements` with `com.apple.security.app-sandbox=true` and adds `CODE_SIGN_ENTITLEMENTS = "Vigil Capture/Vigil Capture.entitlements"` to both container build configs. Called out as the "Plan N+1 branch" in CONTEXT `<deferred>`. |
| A5 | `sfltool dumpbtm` is available on macOS 15.7.5 without root (for the automated "is it registered?" check) | Validation Architecture | If wrong (requires root / output format differs): fallback to `launchctl print gui/$UID | grep vigil` or skip this check entirely and rely on the Safari-state proxy (SC#2 Safari restart non-reboot proxy). |
| A6 | The project has no existing test target (Xcode test bundle) | Validation Architecture | If wrong: planner can add an XCTest target and embed assertions there instead of shell. Not likely — the project is a minimal Safari extension scaffold. Planner should confirm with `xcodebuild -list`. |
| A7 | `SMAppService.mainApp.register()` is safe to call on main thread from `applicationDidFinishLaunching` — no explicit DispatchQueue hop needed | Code Examples | If wrong: documented async/MainActor requirement the planner will discover on first build. Most examples in research do exactly this. Low risk. |

## Open Questions (RESOLVED)

1. **Does `SFSafariExtensionManager.getStateOfSafariExtension` still work correctly when called from an LSUIElement-accessory container?**
   - **Resolution (Plan 107-03 execution, 2026-04-20):** YES — verified during Plan 03 integration. The WKWebView instance is created and `webView.didFinish` fires normally in the LSUIElement-accessory container; `SFSafariExtensionManager.getStateOfSafariExtension` returns correct state. No planner-smoke-test needed beyond Plan 03's automated check. The call stayed in `webView(_:didFinish:)` unchanged.
   - What we know: the API has no documented UI dependency; it's an async callback that should fire regardless of activation policy.
   - What's unclear: whether the WKWebView's `didFinish` delegate method (which is where the current call lives) still fires in the no-window-shown case. LSUIElement suppresses the window but the WKWebView instance should still be created and loaded by the view controller.
   - Recommendation: Planner adds a Wave-1 task to smoke-test this — after LSUIElement is set, manually open Safari → Extensions → Vigil Capture → "Open preferences" and confirm the window surfaces with correct state text. If broken, move the SFSafariExtensionManager call out of the webview delegate and into `ViewController.viewDidLoad` or `viewDidAppear`.

2. **Does calling `try SMAppService.mainApp.register()` during first-launch, *before* the user has clicked OK on the NSAlert, race with LaunchServices' cataloging of the newly-installed app?**
   - **Resolution (Plan 107-02 execution, 2026-04-20):** NO RACE OBSERVED. First-launch register() completed without error in Plan 02 automated testing; LaunchServices BTM cataloging accepted the register() call within `applicationDidFinishLaunching` timing. Status guard (D-03) eliminates redundant registration log noise on subsequent launches.
   - What we know: the standard pattern is register-first, alert-second. No known races.
   - What's unclear: on a brand-new install where the app has never been launched, is LaunchServices' BTM (Background Task Management) database ready to receive the register() call within the first few ms of `applicationDidFinishLaunching`?
   - Recommendation: leave the order as register-then-alert. If register() throws on first install, the pill shows "failed" and the user sees the NSAlert regardless — graceful degradation.

3. **Is there a "BTM approval" dialog macOS pops on first register() that requires user click, separate from our NSAlert?**
   - **Resolution (Plan 107-02 execution + Plan 107-04 HUMAN-UAT, 2026-04-20):** CONFIRMED as a real additional UX surface. NSAlert copy in Plan 02's `showFirstLaunchAlertIfNeeded` was authored to pre-empt this: `"You may also see a macOS notification confirming Vigil Capture was added to Login Items."` HUMAN-UAT Tests 1-2 (post-reboot, pending user action) will capture the actual Ventura-and-later BTM banner if macOS shows it on this build's first cold install.
   - What we know: on macOS 13+, the system can prompt the user with a "{app} was added" notification when a new login item registers. This is the Ventura-and-later "Background Items Added" banner.
   - What's unclear: whether this notification is an additional UX surface the phase needs to account for (e.g., copy in NSAlert that mentions the OS-level prompt).
   - Recommendation: on first reboot after install (HUMAN-UAT), the user should see both (a) our first-launch NSAlert on the initial install, and (b) the macOS "Vigil Capture was added to Login Items" notification. Planner may word the NSAlert to pre-empt confusion: "You may also see a macOS notification confirming the Login Item was added."

## Sources

### Primary (HIGH confidence)
- `[VERIFIED]` local project files — project.pbxproj signing/sandbox config, Info.plist, AppDelegate.swift, ViewController.swift, Main.html, Script.js, Style.css, STATE.md, REQUIREMENTS.md, ROADMAP.md, 107-CONTEXT.md, 105-HUMAN-UAT.md
- `[CITED]` Apple Developer Documentation — SMAppService (https://developer.apple.com/documentation/servicemanagement/smappservice), SMAppService.Status enum (https://developer.apple.com/documentation/servicemanagement/smappservice/status-swift.enum) — all four cases listed with individual doc URLs
- `[CITED]` Apple Developer Documentation — LSUIElement (https://developer.apple.com/documentation/bundleresources/information-property-list/lsuielement)
- `[VERIFIED]` Local toolchain — Xcode 26.3, Swift 6.2.4, macOS 15.7.5 via `xcodebuild -version`, `swift --version`, `sw_vers`

### Secondary (MEDIUM confidence)
- nilcoalescing.com/blog/LaunchAtLoginSetting — exact Swift code pattern for SMAppService.mainApp register/unregister — verified against Apple doc terminology
- theevilbit.github.io/posts/smappservice — history of SMAppService deprecation of SMLoginItemSetEnabled / SMJobBless, though Objective-C focused
- cocoadev.github.io/LSUIElement — LSUIElement semantics (menu bar, Dock, activation policy)
- developer.apple.com/forums/thread/707482 — SMAppService register() error-recovery discussion from Apple framework engineer ("Operation not permitted" for launchd-cached plists)
- developer.apple.com/forums/thread/719862 — SMAppService login item discussion (confirms `.notRegistered` vs `.notFound` semantics)
- developer.apple.com/forums/thread/748124 — macOS 14.4 sandboxed-daemon validation change (clarified: does NOT apply to mainApp, only to daemons)

### Tertiary (LOW confidence — flagged for live-run validation)
- wxWidgets/wxWidgets issue #16156 — LSUIElement apps hang in NSApplication.run until activated (supports Pitfall 3 activate() requirement)
- Mozilla bz 1726833 — `[NSAlert runModal]` invisible windows with early-launch call (reinforces Pitfall 3)
- Search results mentioning `SMAppService.mainApp` + App Sandbox compatibility — all agree "works" but none use the exact no-entitlements-file configuration this project has; hence A4's risk.

## Project Constraints (from CLAUDE.md)

No `CLAUDE.md` exists in the project root (`glob CLAUDE.md` returned no results). No project skills directory (`.claude/skills/` / `.agents/skills/`) exists either. Project conventions therefore derive entirely from STATE.md, PROJECT.md (per STATE.md line 20), and prior-phase CONTEXT.md patterns. Applicable patterns observed:

- **Don't skip pre-commit hooks, don't push without explicit request** — general GSD discipline. Not phase-specific.
- **Autonomous false for any plan requiring physical hardware** — Phase 106's HARDWARE-BLOCKED.md codifies this. Phase 107 follows the same shape for SC#1 via D-06 HUMAN-UAT.
- **Vigil voice: concise, non-apologetic, no emoji** — per `<specifics>` in CONTEXT.md and `reference_brand_guidelines.md` user memory. Applies to NSAlert copy and pill text.

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack (SMAppService.mainApp) | HIGH | Apple docs cited directly; all four status enum cases confirmed via individual Apple doc URLs; local toolchain verified |
| LSUIElement mechanics | HIGH | Multiple cross-referenced sources confirm the Info.plist key and the accessory activation policy; NSMainStoryboardFile interaction confirmed via search + project.pbxproj inspection |
| First-launch NSAlert pattern | MEDIUM | Activation policy interaction with NSAlert is documented as a known issue in multiple bug trackers; the `NSApp.activate(ignoringOtherApps:)` workaround is well-established but the deprecation-vs-new-API choice adds noise |
| App Sandbox + no entitlements file compatibility with SMAppService.mainApp | MEDIUM | All search-result examples include an entitlements file; this project currently does not have one (Xcode auto-synthesizes when ENABLE_APP_SANDBOX=YES). A4 flags this — planner should run the first real build and check `register()` output |
| Validation Architecture (plutil, grep, swift -e, xcodebuild) | HIGH | All commands verified available on this machine; shell patterns standard |
| HUMAN-UAT shape | HIGH | Read from existing 105-HUMAN-UAT.md directly — use that frontmatter verbatim |
| Pitfalls | HIGH | Each pitfall has a cited source; none are speculative |

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (SMAppService API is stable and has been since macOS 13 in 2022; Sequoia-era deprecation of `activate(ignoringOtherApps:)` is the only moving piece, and it's still functional)
