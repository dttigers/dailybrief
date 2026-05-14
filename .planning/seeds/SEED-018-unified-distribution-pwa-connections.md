---
id: SEED-018
status: dormant
planted: 2026-05-14
planted_during: Phase 128a/128b exploration — surfaced when designing Ubuntu tmux-bridge as Path E for 128b write-back, which forced clarity on cross-device distribution
trigger_when: v3.10+ milestone planning AND product moves toward serving non-operator users; OR any phase that ships a new native install (Ubuntu daemon, second Mac app, etc.); OR the operator hits onboarding friction explaining "you also need to install X on Y"
scope: Medium
---

# SEED-018: Unified distribution — PWA Connections page + monorepo + one operator token

## The use case (operator framing, 2026-05-14)

> "Somebody would need to download and install all three things? It can't be 'packaged' because of the different OSes, right?"

Right — but the *appearance* of one product across four surfaces is solvable without forcing them into one binary. The architectural reality is hard-walled by hardware (G2 glasses can't run a Mac app; Ubuntu can't draw a HUD). The *user experience* of installation, auth, and connection-status doesn't have to mirror that reality.

The seed: invest in three connective tissues that make the four-surface architecture feel like one product.

## The three investments

### 1. PWA Connections page

The PWA already exists and is the universal entry point — every Vigil user starts there (zero install, browser-based). Add a **Connections** page (or merge into existing Settings) that:

- Detects which native surfaces are connected (G2 plugin, Mac Companion, Ubuntu tmux-bridge) by polling for recent heartbeats in `agent_events` per surface-type.
- Shows ✓/✗ per surface with last-seen timestamps.
- Offers one-click download links for missing pieces (`.dmg` for Mac, `install.sh` for Ubuntu, Even Hub deep-link for G2).
- Surfaces capability tiers: "Without the Mac Companion you won't get HUD reflections; without the tmux-bridge G2 replies won't reach Claude Code."
- Mints + displays the operator token (long-lived, scope-restricted, revocable from the same page).

Pattern reference: Notion's "Connections" tab in Settings; Linear's "Connected apps" in Workspace settings. The web app is the hub; native binaries are surface-upgrades discovered from inside it.

### 2. Monorepo with shared types

Four surfaces currently live as conceptually-separate repos (`vigil-core`, `vigil-pwa`, `vigil-g2-plugin`, `vigil-watch`, plus a future `vigil-tmux-bridge`). Each ships independently. Each re-derives event shapes (`NeedsInputEvent`, `AgentReplyEvent`, etc.) from `vigil-core`'s route handlers.

Consolidate into a monorepo with:

```
vigil/
├── packages/
│   ├── shared/              ← TS types, event-shape constants, allowlists
│   ├── core/                ← vigil-core (Railway deploy)
│   ├── pwa/                 ← vigil-pwa (Cloudflare Pages or similar)
│   ├── g2-plugin/           ← vigil-g2-plugin (Even Hub bundle)
│   ├── mac-companion/       ← vigil-watch, renamed (see SEED-018b candidate)
│   └── tmux-bridge/         ← new Ubuntu daemon (planted by 128b Path E)
├── apps/onboarding/         ← optional: a "first-launch detector" PWA route
└── release.yaml             ← one tag → all surfaces build
```

Shared types pin contracts at the source. The 5-string reply allowlist (`yes`/`no`/`continue`/`abort`/`defer`) is a constant in `packages/shared/`, imported by core, the bridge, and the G2 plugin — drift-detector tests pin the import (G2-REPLY-04 success criterion uses this exact mechanism).

### 3. One operator token across all surfaces

Today the operator authenticates the PWA via password; the G2 plugin via Even Hub OAuth; vigil-watch via a separate token; vigil-tmux-bridge will need its own. Four auth flows for one user.

Consolidate to: one token, minted in the PWA after login, displayed once on the Connections page. Each native install pastes the token during setup. The token is scoped to a user-id + surface-type so revocation is granular ("revoke just the Ubuntu bridge" without invalidating the Mac Companion).

This also makes the "what does an unknown user get" boundary cleaner (cf. the unknown-user-profile incident motivating 128b Path E architecture):

- PWA-only user gets a PWA token. Cannot reach Mac Companion, Ubuntu daemon, or G2 — those installs require running an installer on hardware the user owns.
- The harder install *becomes* the access boundary, accidentally but usefully.

## Why dormant, not active

- The product is currently operator-pre-product. The four-surface install story bites WHEN a second user is onboarded. Today it's a "you also need to..." conversation; that scales to N=1 but not N=10.
- vigil-core already issues per-user tokens via `vk_…` bearer auth — the consolidation work is real (token-scope refactor, monorepo migration) but additive, not foundational.
- The trigger is the first time an operator-adjacent user (friend, colleague, paid customer) tries to install Vigil and asks "where do I get the Mac app?" — that's the moment this SEED activates.

## Constraints & dependencies

- Monorepo migration is a significant lift if done all-at-once. Two-step strategy: start the `packages/shared/` package alongside the existing repos (typescript path-alias trick), prove the shared-types pattern works, then fold the surface repos in one at a time.
- The Connections page is the smallest scope and highest leverage — could ship as a single PWA route without any monorepo or token work. That's the first phase if this SEED activates.
- One-token scope refactor touches vigil-core auth middleware (`bearerAuth`, `requireVE`). Existing token-issue endpoints in `vigil-core/src/routes/auth.ts` and `vigil-core/src/lib/sentry.ts` need surface-type field added.
- The naming question: vigil-watch's role shrunk in this conversation (Mac-side write-back evaporated; replaced by Ubuntu tmux-bridge). Renaming vigil-watch to `vigil-mac-companion` clarifies the architecture and would land naturally during a monorepo consolidation pass.

## When to surface

Wakes up when:

- v3.10+ milestone planning AND product moves toward serving non-operator users (friends, paid customers, internal team).
- Any phase ships a new native install (the Ubuntu tmux-bridge from 128b Path E is the canonical first trigger — this SEED was planted while designing it).
- Operator hits the "you also need to install X on Y" friction for the third time.
- The unknown-user-profile incident pattern recurs (signup on vigil-core by someone the operator didn't intend to grant access to) — the SEED's "harder install = access boundary" framing is part of the response.

## Related Memory & Files

- `.planning/research/SURFACE-MAP.md` — the device-to-component reference doc this SEED is the future-investment counterpart to.
- `.planning/spikes/001-tmux-write-back-128b/` — the empirical spike that motivated this seed (Ubuntu tmux-bridge as the 5th install surface).
- `.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-CONTEXT.md` — Path E (`tmux send-keys`) implementation that creates the Ubuntu install surface.
- `vigil-core/src/routes/auth.ts` — existing token-issuance; would need surface-type scoping for investment 3.
- `vigil-core/src/lib/agent-events-bus.ts` — existing per-user event bus; basis for the Connections-page surface-detection (poll for recent heartbeats per surface-type).
- Memory `[unknown_user_profile_incident_2026-05]` if captured — the security framing that makes "harder install = access boundary" a positive feature, not a bug.
- The recent `60a97b7 docs(readme): add end-user Download / Install section` commit — first step toward unified install docs; Connections page is the in-app continuation.
- The existing `25fa33a fix(dist): enable hardened runtime; abort notarize.sh on Invalid status` work — proves the macOS distribution pipeline already exists for vigil-watch / DailyBriefMonitor.app; investment is *consolidation*, not net-new packaging infrastructure.
