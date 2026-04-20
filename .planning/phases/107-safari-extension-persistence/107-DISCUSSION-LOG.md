# Phase 107: Safari Extension Persistence - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 107-safari-extension-persistence
**Areas discussed:** Window suppression, Register failure handling, Idempotency & unregister, Hardware verification plan, First-launch UX

---

## Gray area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Window suppression | LSUIElement vs close-on-launch vs first-run-only | ✓ |
| Register failure handling | Status pill / silent / NSAlert | ✓ |
| Idempotency & unregister | Status-guarded / unconditional / unregister-UI | ✓ |
| Hardware verification plan | Block / human-UAT / proxy test | ✓ |

User selected all four offered gray areas.

---

## Window suppression

| Option | Description | Selected |
|--------|-------------|----------|
| LSUIElement=true | Info.plist flag flips to accessory mode. No Dock/menu bar/window. Simplest. Reach UI via Safari prefs → Vigil Capture → Open preferences. | ✓ |
| Close window on launch | Keep Dock icon + menu bar, close storyboard window in applicationDidFinishLaunching. User can click Dock to re-open. | |
| First-run-only visible | Show window first launch only (confirm registration), hide subsequent launches via UserDefaults flag. | |

**User's choice:** LSUIElement=true (Recommended)
**Notes:** Accepts the tradeoff that Spotlight won't activate a running instance normally; reaching the UI goes through Safari → Extensions → Vigil Capture → "Open preferences", which the existing ViewController flow already handles.

---

## Register failure handling

| Option | Description | Selected |
|--------|-------------|----------|
| Status pill in ViewController | Extend Main.html status UI to also show `persistence: registered / failed`. Non-intrusive, honest. | ✓ |
| Silent log only | NSLog / os_log only. User never knows persistence broke. Risk: blame Safari on next reboot. | |
| NSAlert on failure | Pop modal alert on register() throw. Unmistakable but clashes with LSUIElement. | |

**User's choice:** Status pill in ViewController (Recommended)
**Notes:** Reuses the existing SFSafariExtensionManager → WKWebView.evaluateJavaScript bridge in ViewController.swift:36-41.

---

## Idempotency

| Option | Description | Selected |
|--------|-------------|----------|
| Status-guarded | Check SMAppService.mainApp.status first; call register() only if not .enabled. Clean logs. | ✓ |
| Unconditional every launch | Call register() every applicationDidFinishLaunching. Simplest. Redundant log lines. | |
| Unconditional + explicit unregister UI | Add "Disable persistence" button to ViewController. More UI surface. | |

**User's choice:** Status-guarded (Recommended)
**Notes:** Provides a natural hook for the status pill from Q2 (the status check result feeds directly into pill state).

---

## Hardware verification plan

| Option | Description | Selected |
|--------|-------------|----------|
| Human-UAT like Phase 104 | Phase ships complete on automated checks; HUMAN-UAT.md carries reboot verification until physically confirmed. | ✓ |
| Block phase until reboot-confirmed | Phase stays incomplete until physical reboot verification. Safest. Blocks milestone close on reboot schedule. | |
| Proxy test (SMAppService.status poll) | Skip real reboot; trust .enabled == would persist. Weakest guarantee. | |

**User's choice:** Human-UAT like Phase 104 (Recommended)
**Notes:** Explicit reference to avoiding the 106-05 hardware-block stall pattern just hit in the prior phase.

---

## First-launch UX (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| One-time NSAlert | First launch only (UserDefaults flag): "Vigil Capture is installed. The extension will stay enabled across reboots." | ✓ |
| Silent — trust Safari prefs flow | No first-launch UI. User confirms via opening Safari prefs and reading pill. | |
| NSUserNotification banner | Less intrusive. Risks being missed under Do Not Disturb; requires notification entitlement. | |

**User's choice:** One-time NSAlert (Recommended)
**Notes:** Accepts that LSUIElement apps can show alerts when they are the active process. Gives clear first-launch confirmation without leaving permanent UI.

---

## Claude's Discretion

- Exact UserDefaults key name for the first-launch flag
- Exact error message text for the persistence-failed pill
- Whether to also log register() failures to os_log (recommended yes for debuggability)
- Whether to emit observability event for register() outcome (pending vigil-core bridge availability in Safari container)

## Deferred Ideas

- NSStatusItem menu bar entry — rejected in favor of Safari-prefs-button flow
- Explicit "Disable persistence" toggle in ViewController — rejected; rely on System Settings → Login Items
- Observability event for register() outcome — deferred unless vigil-core bridge gets wired into Safari container later
- `.entitlements` file — not needed today; revisit only if register() fails with sandbox error
- App Store submission / distribution — explicit scope exclusion, future milestone
