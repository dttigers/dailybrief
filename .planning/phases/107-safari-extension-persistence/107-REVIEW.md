---
phase: 107-safari-extension-persistence
reviewed: 2026-04-20T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - Scripts/verify-phase-107.sh
  - vigil-safari-extension/Vigil Capture/AppDelegate.swift
  - vigil-safari-extension/Vigil Capture/Base.lproj/Main.storyboard
  - vigil-safari-extension/Vigil Capture/Info.plist
  - vigil-safari-extension/Vigil Capture/Resources/Base.lproj/Main.html
  - vigil-safari-extension/Vigil Capture/Resources/Script.js
  - vigil-safari-extension/Vigil Capture/Resources/Style.css
  - vigil-safari-extension/Vigil Capture/ViewController.swift
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 107: Code Review Report

**Reviewed:** 2026-04-20
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 107 delivers the macOS Safari Web Extension container hardened for persistence (SMAppService login-item registration) and for LSUIElement accessory-mode correctness (gated storyboard-window suppression). The code is small, tightly scoped, and the design decisions locked in discuss (LSUIElement=true, `visibleAtLaunch=NO`, `shouldRevealWindow` gate, 120s uptime heuristic, explicit `NSApp.activate` before `runModal()`) are faithfully implemented.

No critical (security, crash-on-common-path, data-loss) issues were found. Three warnings relate to unhardened failure paths and one fragile runtime-verify matcher that can produce false passes. Five info-level items cover template-leftover TODOs, force-unwraps, and minor DX/robustness polish. None block merge on their own, but WR-01 (sfltool prefix-match) is worth fixing before treating Check 6 as an authoritative persistence signal.

## Warnings

### WR-01: `sfltool dumpbtm` grep can match the Safari extension instead of the container

**File:** `Scripts/verify-phase-107.sh:131`
**Issue:** The runtime persistence check greps `sfltool dumpbtm` output for `io.vigilhub.extension`, then pipes `grep -B5` context into a second `grep` for `Disposition:.*enabled`. Two correctness problems:

1. `io.vigilhub.extension` is a **prefix** of the Safari extension's bundle ID `io.vigilhub.extension.Extension` (see `ViewController.swift:14`). So the first grep matches **both** the container's and the extension's dumpbtm records. Because `sfltool` typically emits multiple BTM entries for a single app's login-item + helpers, the 5-line `-B` window from one record can bleed into the `Disposition:` line of an unrelated record.
2. Even without the prefix issue, `grep -B5 X | grep Y` does not require `X` and `Y` to be in the **same record** — they just need to appear within 5 lines of each other anywhere in the spliced output. That weakens the assertion.

Effect: Check 6 can report PASS even when the container itself is not actually registered (e.g., if the extension is enabled but the container's SMAppService.register() silently failed). Silent false-pass on a persistence proxy is the one thing this check exists to catch.

**Fix:** Anchor to a word boundary and the exact container bundle ID, and re-group context extraction using `awk` on record boundaries:

```bash
# Replace line 131 with a stricter match — container bundle ID is the
# LoginItems plist identifier emitted by SMAppService.mainApp (the *app*,
# not the extension). Confirm the actual string with `sfltool dumpbtm`
# post-launch; if it's still `io.vigilhub.extension`, match it exactly
# with a terminating whitespace/newline:
if sfltool dumpbtm 2>/dev/null \
   | awk '/^[[:space:]]*Identifier:[[:space:]]*io\.vigilhub\.extension[[:space:]]*$/,/^$/' \
   | grep -qi 'Disposition:.*enabled'; then
    found=1
```

If dumpbtm emits the container under a different identifier (common: the team-prefixed form, or the app's CFBundleIdentifier rather than the Safari extension's), update the `awk` anchor to match that exact string and document the observed identifier in a comment so the check can't silently degrade on future OS versions.

---

### WR-02: `message.body as! String` force-cast crashes on malformed WKScriptMessage

**File:** `vigil-safari-extension/Vigil Capture/ViewController.swift:77`
**Issue:** `if (message.body as! String != "open-preferences")` unconditionally force-casts `message.body` (type `Any`) to `String`. If any future JS code posts a non-string to the `controller` handler (e.g., `postMessage({action: "open-preferences"})`, `postMessage(42)`, or a bugged serialization), the container process crashes with `SIGABRT` on cast failure. WKWebView message bodies are trusted here because Script.js owns the only producer, but this is still a needless crash-on-typo footgun and the kind of thing that bites on the first refactor of Script.js.

**Fix:**

```swift
func userContentController(_ userContentController: WKUserContentController,
                           didReceive message: WKScriptMessage) {
    guard let command = message.body as? String, command == "open-preferences" else {
        return
    }
    SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
        DispatchQueue.main.async {
            NSApplication.shared.terminate(nil)
        }
    }
}
```

Bonus: also drop the stray semicolon on line 78 (`return;`) — Swift style, harmless but noisy.

---

### WR-03: `SFSafariApplication.showPreferencesForExtension` error is silently discarded

**File:** `vigil-safari-extension/Vigil Capture/ViewController.swift:81-85`
**Issue:** The completion handler captures `error` but never inspects it — it just terminates the app unconditionally. If Safari preferences fail to open (Safari not installed, containing-app not code-signed, macOS version mismatch, sandbox violation), the user sees the app quit with no feedback and no recovery path. Since the button UX promises "Quit and Open Safari Extensions Preferences…", silent quit-on-failure violates the button contract.

**Fix:** Log the error (at minimum) and consider surfacing it to the user before terminating, or keep the app running so the user can retry:

```swift
SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
    if let error = error {
        os_log("showPreferencesForExtension failed: %{public}@",
               type: .error, String(describing: error))
    }
    DispatchQueue.main.async {
        NSApplication.shared.terminate(nil)
    }
}
```

At minimum the os_log restores diagnosability; a follow-up can decide whether to NSAlert or suppress the terminate on error.

## Info

### IN-01: Template-leftover TODO in error path

**File:** `vigil-safari-extension/Vigil Capture/ViewController.swift:33-34`
**Issue:** The `// Insert code to inform the user that something went wrong.` comment and empty return are Apple's Safari Web Extension template boilerplate. The container currently swallows `SFSafariExtensionManager.getStateOfSafariExtension` failures silently, which means the state pill stays in `state-unknown` with no diagnostic. Not a bug (the pill default is accurate: "state unknown"), but worth either logging via `os_log` or deleting the TODO so it stops signaling "incomplete."
**Fix:** Log and remove the comment:
```swift
guard let state = state, error == nil else {
    os_log("getStateOfSafariExtension failed: %{public}@",
           type: .error, String(describing: error))
    return
}
```

---

### IN-02: Force-unwraps on bundle resource loading

**File:** `vigil-safari-extension/Vigil Capture/ViewController.swift:27`
**Issue:** `Bundle.main.url(forResource: "Main", withExtension: "html")!` and `Bundle.main.resourceURL!` both force-unwrap. A misconfigured Copy Bundle Resources phase or a rename of `Main.html` would turn a build-time warning into a runtime crash on launch. This is template-standard code and fail-fast is arguably correct here (the app can't do anything useful without Main.html), but a clearer `fatalError` with a message would aid diagnosis.
**Fix (optional):**
```swift
guard let url = Bundle.main.url(forResource: "Main", withExtension: "html"),
      let resourceURL = Bundle.main.resourceURL else {
    fatalError("Main.html or resourceURL missing from bundle — check Copy Bundle Resources phase")
}
self.webView.loadFileURL(url, allowingReadAccessTo: resourceURL)
```

---

### IN-03: Invalid persistence state silently hides the pill instead of showing a safe fallback

**File:** `vigil-safari-extension/Vigil Capture/Resources/Script.js:18-30`
**Issue:** `showPersistence(state)` validates `state` against the known class list. If JS is called with an unknown value (refactor typo, future state added on the Swift side without the JS side), the body ends up with no `persistence-*` class and all four `<p>` elements are hidden by the CSS default rule (`Style.css:49-52`). The pill silently disappears with no console warning — makes regression debugging painful.
**Fix:**
```js
function showPersistence(state) {
    const classes = [
        'persistence-enabled',
        'persistence-not-registered',
        'persistence-requires-approval',
        'persistence-failed'
    ];
    document.body.classList.remove(...classes);
    const target = `persistence-${state}`;
    if (classes.includes(target)) {
        document.body.classList.add(target);
    } else {
        console.warn(`showPersistence: unknown state "${state}", falling back to persistence-failed`);
        document.body.classList.add('persistence-failed');
    }
}
```

---

### IN-04: `find … | head -1` picks arbitrary DerivedData build on multi-worktree machines

**File:** `Scripts/verify-phase-107.sh:116`
**Issue:** `find "$HOME/Library/Developer/Xcode/DerivedData" -maxdepth 6 -name 'Vigil Capture.app' -type d | head -1` returns whatever the filesystem yields first. On machines with multiple worktrees (the MacBook Pro second dev machine, or any CI runner that's cached builds), this can pick a stale `.app` and test against pre-Phase-107 behavior, masking failures.
**Fix:** Sort by mtime and pick the newest, or require Check 5 (xcodebuild) to produce the path via `-derivedDataPath`:
```bash
app_path="$(find "$HOME/Library/Developer/Xcode/DerivedData" -maxdepth 6 \
    -name 'Vigil Capture.app' -type d -print0 2>/dev/null \
    | xargs -0 stat -f '%m %N' 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2-)"
```
Or better: pipe Check 5's xcodebuild to a dedicated `-derivedDataPath /tmp/vigil-107-dd` and reference that explicitly in Check 6.

---

### IN-05: Regression-guard grep `-B1` is fragile against legitimate multi-line refactors

**File:** `Scripts/verify-phase-107.sh:83-87`
**Issue:** The regression guard asserts that the line **immediately** before `makeKeyAndOrderFront(nil)` contains `shouldRevealWindow`. That currently holds because the guard is a single-line `if let delegate = NSApp.delegate as? AppDelegate, delegate.shouldRevealWindow {`. A harmless reformat to:
```swift
if let delegate = NSApp.delegate as? AppDelegate,
   delegate.shouldRevealWindow {
    webView.window?.makeKeyAndOrderFront(nil)
}
```
would push `shouldRevealWindow` two lines above the call and flip this check to FAIL even though the gate is still present and correct. Per phase_context this fragility is accepted, but widening the context or switching to a multiline regex would reduce the false-positive rate on reformatting:
**Fix (optional):**
```bash
if ! grep -B5 'makeKeyAndOrderFront(nil)' "$viewcontroller" | grep -q 'shouldRevealWindow'; then
```
5 lines of lookback tolerates reasonable multi-line gate refactors without admitting unconditional re-show (you'd need 5+ intervening lines to hide an unrelated gate).

---

_Reviewed: 2026-04-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
