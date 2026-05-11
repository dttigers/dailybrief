---
id: SEED-015
status: dormant
planted: 2026-05-10
planted_during: v3.8 verifying / post-hardware-test
trigger_when: v3.9 milestone planning AND operator wants Quiet Mode to "just work"; OR any phase that touches PWA SettingsPage, vigil-core /v1/quiet-mode endpoint, or iOS-specific integration
scope: Medium
---

# SEED-015: Auto-detect iPhone Focus / DND state for Quiet Mode

## Why This Matters

Phase 125 shipped Quiet Mode (AGENT-HUD-03) with a **manual PWA toggle**
only: `getQuietMode` / `setQuietMode` calls a vigil-core endpoint that
broadcasts a `quiet_mode_changed` SSE frame to subscribed G2 plugins,
which then suppresses `heartbeat` / `task_complete` / `milestone` events
(allowlist: `needs_input` + `task_failed` per UI-SPEC §"What Quiet Mode Suppresses").

The framing has always been "iPhone Focus = quiet glasses." But the
PWA-side trigger never landed. Verified 2026-05-10 by grepping
`vigil-pwa/src/`: no Focus listeners, no `prefers-reduced-motion`
coupling, no `visibilitychange` quiet-mode wiring. The only path is the
manual toggle in [SettingsPage.tsx:362-380](../../vigil-pwa/src/pages/SettingsPage.tsx).

**The operator's framing (2026-05-10):** "we only tested dnd from pwa
settings, not iphone focus changes."

The promise of ambient AI is that the user doesn't have to think about
modes. Reaching for the PWA every time Focus changes defeats the point —
especially because the user already configured Focus for the *same
intent* (deep work, asleep, etc.).

## When to Surface

This seed wakes up when:

- v3.9 milestone planning starts AND iOS ergonomics are on the table
- A phase touches `SettingsPage`, `quiet-mode-service` in vigil-core, or
  the iOS-specific PWA layer (PWA install, notification permissions, etc.)
- A "Vigil knows when I'm head-down" thread appears in operator capture

## Constraints (the hard part)

**iOS does NOT expose Focus / DND state to a PWA via any web API.** The
following are all unavailable to a PWA-installed-as-home-screen app:

- No `navigator.focusState` or equivalent
- `prefers-reduced-motion` is independent of Focus (and doesn't track DND)
- `visibilitychange` fires when the PWA backgrounds, NOT when Focus
  toggles while the PWA is open
- iOS Focus Filters require a native app extension (App Extensions are
  not available to PWAs)
- iOS Shortcuts CAN read and react to Focus, but a PWA cannot invoke
  Shortcuts and Shortcuts cannot communicate with a running PWA directly

This means option (a) "the PWA listens for Focus" is structurally
impossible. The viable paths are all *outside* the PWA.

## Three viable paths (rank by ergonomics)

### Path 1: iOS Shortcut automation hits vigil-core directly (RECOMMENDED)

User creates two iOS Shortcuts automations:

- "When Focus turns ON for any of {Work, Sleep, Personal}" → call
  `PUT https://api.vigilhub.io/v1/quiet-mode` with `{enabled: true}` +
  bearer token in header
- "When Focus turns OFF" → call same endpoint with `{enabled: false}`

No PWA changes required. vigil-core already exposes the endpoint.
Documentation lives in the Vigil docs (or a Shortcuts gallery export
distributed via the PWA). Bearer token comes from the existing
"Generate API key for automation" flow (which doesn't exist yet —
that's the actual scope of this seed).

**Pros:**
- Works today, no platform constraints
- User maintains their own automation (transparent, debuggable)
- Survives PWA updates / reinstalls

**Cons:**
- Requires user to set up the Shortcut once
- Bearer token in Shortcut → if device is compromised, attacker can
  spam quiet-mode toggle (low-impact attack surface)

### Path 2: Native iOS companion app (Even Hub plugin-side)

Even Hub's iOS app DOES have access to Focus (via Intents framework /
Focus Filters). If the Even app exposed a Focus-state webhook to plugins,
the G2 plugin could subscribe and call vigil-core itself.

**Pros:**
- Zero user setup
- Tight integration

**Cons:**
- Requires Even Realities API support that doesn't exist (see SEED-012
  re: widget API watcher) — blocked on platform-side work
- Doesn't generalize to non-G2 clients

### Path 3: PWA polls some side-channel

E.g., user grants Calendar access, PWA checks for an "ALL DAY FOCUS"
event tag the user puts in their calendar. Hacky, fragile, ignore unless
the others fail.

## Concrete Scope (if v3.9 picks it up)

1. **vigil-core:** confirm `PUT /v1/quiet-mode` endpoint accepts a
   bearer token that's distinct from the operator's main session token,
   so a Shortcut can hold a less-privileged token. New scope: API-key
   issuance flow with `quiet_mode_write` scope only.
2. **Vigil docs / PWA:** ship a one-click "Download Shortcut" button on
   SettingsPage. The Shortcut is pre-baked with the user's API key
   already filled in (rendered server-side or via a deep link).
3. **Verification:** flip Focus on the operator's iPhone, watch
   vigil-core logs for the Shortcut's PUT, watch the G2 plugin's HUD
   for the SSE → suppression behavior.

## Related Memory & Files

- `vigil-pwa/src/pages/SettingsPage.tsx:362-380` — current Quiet Mode toggle UI
- `vigil-g2-plugin/src/screens/companion.ts:71-76` — QUIET_BANNER_ALLOWLIST + setQuietMode wiring
- Phase 125 AGENT-HUD-03 + D-02 + D-04 — original spec
- SEED-012 — Even Hub widget API watcher (Path 2 prerequisite)
- Memory `project_g2_companion_doubletap_hardware_verified` — Path 1 doesn't depend on this, but confirms the SSE → plugin pipeline works

## Why dormant, not active

v3.8 just shipped. The PWA toggle path works. The "Focus auto-detect"
framing is aspirational and was always going to be a v3.9+ concern
once basic Quiet Mode was proven. This seed exists to ensure the gap
isn't forgotten when v3.9 planning starts, AND to capture the
non-obvious platform constraint (no PWA → Focus API on iOS) so the next
agent doesn't waste a research cycle discovering that fact.
