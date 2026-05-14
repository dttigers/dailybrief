# Vigil Surface Map

**Captured:** 2026-05-14
**Triggered by:** Phase 128b architecture clarification — operator asked "vigil-watch / tmux session / g2 plugin... they are all kind of the same thing, am I completely off the mark?"

**Purpose:** Document the device-to-component mapping so future phases (and future readers) don't have to re-derive *why* Vigil is split into multiple deployables. This is a reference doc, not a roadmap.

---

## TL;DR

Vigil is **one product** across **five surfaces**. The split is forced by **where the code physically has to run**, not by design preference. Each surface runs on a different device with no choice — hardware physics makes the split inevitable.

Operator's instinct that "they're kind of the same thing" is correct at the **product** level. The split is correct at the **deployable** level. Both views are simultaneously true.

---

## The surface map

| Surface | Device | Runtime | Role | Distribution | Forced by |
|---------|--------|---------|------|--------------|-----------|
| **vigil-pwa** | Phone or any browser | React PWA | Universal entry — daily brief, chat, notes, settings, **Connections page** | Open `vigil.app` URL; "Add to Home Screen" → iOS app icon | Cross-platform reach; zero-install onboarding |
| **vigil-g2-plugin** | Even Realities G2 glasses | Even Hub plugin runtime (constrained TS) | HUD render + button gesture capture (single-press, DOUBLE_CLICK) | Install via Even Hub iPhone app; you publish bundle, Even distributes | Only the glasses can draw the HUD and read their own button events |
| **vigil-watch** *(today)* / **vigil-mac-companion** *(proposed rename)* | macOS Mac | Swift daemon + AppKit/SwiftUI shell | Companion HUD on Mac screen + G2 hardware-event relay to iPhone Hub. **Note:** the write-back-to-Claude-Code role evaporated 2026-05-14 — see "Recent architecture shift" below. | `.dmg` → drag to /Applications; hardened + notarized (pipeline exists per commit `25fa33a`) | Has to run on the operator's Mac to render Companion HUD on the Mac screen and pair to iPhone via BT/Continuity |
| **vigil-tmux-bridge** *(new, not yet built)* | Ubuntu dev server | Bash/Node daemon + systemd unit | Consume vigil-core's `agent_stream` SSE outbound; on `needs_reply` events with allowlisted strings, run `tmux send-keys` against the local tmux socket to deliver the reply to the running Claude Code session | `curl -fsSL vigil.app/install/tmux-bridge.sh \| sh` → ~100 LOC daemon + systemd unit | Has to be co-located with the tmux socket Claude Code runs in (same uid, local IPC, `0700` socket) |
| **vigil-core** | Railway (cloud) | Hono/TypeScript/Drizzle on Node | Multi-device shared brain — REST routes, SSE fan-out, Postgres, AI integration, OAuth, auth | Not user-installable; you deploy | Single shared surface every other surface authenticates against; needs internet-public addressability |

Plus the supporting iPhone-side surface that operates entirely outside Vigil's codebase:

| Surface | Device | Runtime | Role | Notes |
|---------|--------|---------|------|-------|
| **Even Hub** (third-party) | iPhone | Even Realities iOS app | Bridges G2 ↔ phone via BT; runs the G2 plugin sandbox; forwards G2 events to vigil-watch via local network | Operator installs from App Store; out of Vigil's distribution control |

---

## Why the split is forced (not chosen)

If you tried to collapse Vigil into one process, you hit hard walls:

| Hypothetical | Wall |
|--------------|------|
| One app **on the G2 glasses** | Cannot reach Ubuntu tmux socket (no network stack for IPC; severely constrained runtime; no persistent TLS). |
| One app **on the Mac** | Cannot draw the HUD on G2 glasses (no path to G2 display except via Even Hub on iPhone). Cannot reach Ubuntu tmux socket without network/SSH exposure (the operator's trust posture rules this out, per the unknown-user-profile incident motivating Path E architecture). |
| One app **on Ubuntu** | Cannot render a HUD on G2 glasses; cannot pair to BT G2 hardware (no display, no BT stack, headless server). |
| One app **on Railway** | Cannot be trusted with the operator's local tmux socket (across the internet, multi-tenant, public attack surface). Cannot draw a Mac HUD or G2 HUD. |

Same constraint as Apple Watch + iPhone + Mac: one product, per-device installs are unavoidable.

---

## Recent architecture shift (2026-05-14)

A meaningful re-allocation of responsibilities surfaced during Phase 128b spike work and the operator's move to a remote Ubuntu dev server:

### Before
- **vigil-watch** (Mac): owned write-back to Claude Code via a local Mac tmux session.
- **Mac**: hosted both the Claude Code dev environment AND the write-back daemon.
- **Constraint**: vigil-core ↔ vigil-watch was local-network-bound (D-N1 in 128b CONTEXT).

### After
- **Claude Code dev environment** moves to **Ubuntu server** (operator personal infra; not publicly exposed).
- **vigil-tmux-bridge** (new, Ubuntu daemon): owns write-back. Consumes vigil-core's `agent_stream` SSE outbound (no inbound port exposure on Ubuntu); runs `tmux send-keys` locally.
- **vigil-watch** (Mac): shrinks to **presentation-only** — Companion HUD on Mac screen, G2 event relay. The "watch" name is now slightly misleading because the write-back-detection role evaporated. Rename to `vigil-mac-companion` is a candidate cleanup (see SEED-018).
- **Local-network constraint** on the write-back path disappears (replaced by outbound HTTPS from Ubuntu to Railway; the remaining local-network leg is G2 ↔ vigil-core, unchanged).

### Why the shift is good for trust posture
- vigil-core on Railway is multi-tenant; the unknown-user-profile incident (2026-05) showed signup is publicly reachable. If Railway is compromised, attacker can SSE-emit allowlisted-string replies — bounded blast radius (5 strings: `yes`/`no`/`continue`/`abort`/`defer`).
- Ubuntu is single-tenant, no inbound exposure, only outbound HTTPS to vigil-core. Privileged surface (the tmux socket) is never publicly reachable.
- The harder install (Ubuntu daemon) becomes the access boundary: only people with Ubuntu hardware + the operator-token-paste step get write-back capability. PWA-tier users (incl. unknown signups) cannot.

---

## What CAN be unified across surfaces

Even with five deployables, you can have one product:

- **Monorepo** with `packages/shared/` for TypeScript types — `NeedsInputEvent`, `AgentReplyEvent`, the 5-string reply allowlist constant defined once. Drift-detector tests pin imports.
- **One operator token** minted in the PWA, pasted into each native install. Surface-type-scoped so revocation is granular.
- **One release tag → all surfaces build** via release.yaml.
- **PWA Connections page**: detects which surfaces are connected (poll `agent_events` for recent heartbeats per surface-type), shows ✓/✗, offers one-click downloads for missing pieces. This is what makes five installers *feel* like one product. (Tracked as SEED-018.)
- **One product brand and one mental model**:
  - g2-plugin = sensor + display
  - vigil-watch (`vigil-mac-companion`) = local-network amplifier + Mac-screen presentation
  - vigil-tmux-bridge = effector (write-back)
  - vigil-core = state + sync brain
  - vigil-pwa = main UI

---

## What CANNOT be unified

- A single `.exe`/`.dmg`/`.pkg` that installs all surfaces. Hardware boundaries forbid it. Even Apple Continuity (all-Apple, tightly integrated) requires separate per-device installs.
- A single auth flow that grants access to all surfaces without per-device install steps. The native installs ARE the access boundary; that's actually a feature, not a bug.
- A single in-process call graph. Every cross-surface interaction is over the wire (SSE, HTTPS, BT, local TCP/Unix socket).

---

## Implications for future phases

### For Phase 128b (G2-REPLY write-back path spike)
- Path E (`tmux send-keys`, validated in spike 001) lives in `vigil-tmux-bridge` (Ubuntu), NOT in vigil-watch (Mac). This is a clarification, not a re-scope — 128b's CONTEXT correctly leaves the writer-process location unspecified (D-A3: writer-process invoked directly, no vigil-core route in 128b scope).
- Phase 133 (G2-REPLY productionization) will need to instantiate `vigil-tmux-bridge` — this is the first time Vigil ships a Linux-target deployable. Operator's existing macOS-signing pipeline (`25fa33a`) doesn't apply; new install script + systemd unit.

### For Phase 130 (voice capture)
- Voice capture is a G2-side concern → vigil-g2-plugin owns the PCM stream + upload to vigil-core. No new surface needed. vigil-watch may need to render voice-status overlay on Mac (per Phase 128a outputs).

### For SEED-016 (Companion HUD clarity)
- vigil-watch's renamed scope (`vigil-mac-companion` if SEED-018 activates) does NOT change SEED-016's three gaps — those are still presentation-layer concerns on the Mac surface.

### For SEED-018 (unified distribution)
- The PWA Connections page + monorepo + unified token investments are what turn this five-surface architecture into a coherent product story when serving non-operator users. Triggers documented in SEED-018.

---

## Related artifacts

- `.planning/research/ARCHITECTURE.md` — milestone-scoped (v3.9) architecture delta; this doc is the **all-time / structural** view.
- `.planning/spikes/001-tmux-write-back-128b/README.md` — the spike that surfaced the Ubuntu tmux-bridge surface.
- `.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-CONTEXT.md` — the phase scope that the spike validates Path E against.
- `.planning/seeds/SEED-018-unified-distribution-pwa-connections.md` — future investment in the unified-product-feel.
- `.planning/seeds/SEED-016-companion-hud-away-from-desk-clarity.md` — Mac Companion presentation gaps; lives at the same surface (vigil-watch → `vigil-mac-companion`).
- `.planning/PROJECT.md` — the existing 5-client architecture diagram; this doc extends it with the new Ubuntu tmux-bridge surface and the post-2026-05-14 role shift.
