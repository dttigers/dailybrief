# Requirements — v3.8 Claude Code Companion

**Milestone:** v3.8 Claude Code Companion
**Started:** 2026-05-06
**Spec reference:** [`.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md`](./v3.8-CLAUDE-CODE-COMPANION-SPEC.md)
**Goal:** Use the Even Realities G2 glasses as an ambient notification + status layer for long-running Claude Code sessions, plus fold in 4 hardware-UAT-evidenced G2 polish fixes.

---

## v3.8 Requirements

### Verification gate

- [ ] **VERIFY-01**: Day-1 verification confirms actual `~/.claude/projects/<id>/<sid>.jsonl` schema in a live Claude Code VS Code session, documents the observed line-type mapping, and either confirms the spec's assumed mapping or selects a documented fallback path (notification observation / VS Code extension / process inspection). Findings written to `vigil-watch` repo README before any production-mapping code is written.

### vigil-watch daemon (Swift, macOS)

- [x] **AGENT-WATCH-01**: User can run `vigil-watch daemon` and the process observes `~/.claude/projects/` recursively via `FSEventStream`, debouncing rapid-fire writes per file.
- [x] **AGENT-WATCH-02**: Daemon parses each new JSONL line, emits the 5 Vigil event types per detection rules (`needs_input` debounced 30s/session, `task_failed` deduped per session, `milestone` once per pattern per session, `heartbeat` after ≥60s silence, `task_complete`/`task_failed` precedence rule), and persists per-file byte offsets to `~/Library/Application Support/vigil-watch/offsets.json` so daemon restarts don't replay history.
- [x] **AGENT-WATCH-03**: Daemon POSTs events to `${api_url}/v1/agent-events` with bearer auth, retry/backoff, in-memory queue (max 100) for offline buffering, and 5-second drain on `SIGTERM`.
- [x] **AGENT-WATCH-04**: User can `vigil-watch install` to write `~/Library/LaunchAgents/com.morrillholdings.vigil.watch.plist` and `launchctl bootstrap` it (RunAtLoad + KeepAlive); `vigil-watch uninstall` cleanly removes the plist and unloads the agent. (Phase 123 Plans 01, 02, 04 — Install body lands plist files at mode 0600, bootstraps both daemon + sampler labels via `launchctl bootstrap gui/$UID`; Uninstall reverses idempotently)
- [x] **AGENT-WATCH-05**: User can run `vigil-watch run --verbose` (foreground), `vigil-watch tail <session-id>` (parsed events without posting), `vigil-watch test` (synthetic event to verify Core connectivity), and `vigil-watch status` (daemon state, queue depth, last event timestamp) for debugging. (Phase 123 Plans 01, 02, 03, 04 — all 6 subcommand bodies real after Plan 04; Status reads runtime-state.json via Plan 02's writer contract)
- [x] **AGENT-WATCH-06**: Daemon reads `~/.config/vigil/watch.toml` on startup with defaults created on first run (api_url, api_key falling back to `VIGIL_API_KEY`, heartbeat_seconds, needs_input_debounce_seconds, milestone_patterns, projects_dir override, host_label).
- [ ] **AGENT-WATCH-07**: Daemon runs unattended for 24 consecutive hours on the user's local Mac without crashing and stays under 30MB resident memory.

### Vigil Core agent-events API

- [x] **AGENT-API-01**: User can `POST /v1/agent-events` with bearer auth and have the event persisted to a new `agent_events` table scoped per `userId`. Cross-user isolation: a request from userA cannot read or write events for userB. Mirror SCHED-01 fan-out pattern.
- [x] **AGENT-API-02**: User can `GET /v1/agent-sessions` and receive the list of currently-tracked sessions plus their last known event/state, filtered to the caller's `userId`.
- [x] **AGENT-API-03**: Vigil Core fans out new agent events as an `agent-event` type on the existing `/v1/agent-stream` WebSocket channel (no new connection needed from clients), filtered per `userId` of the subscribed connection.

### G2 Companion HUD (plugin v0.3.0)

- [x] **AGENT-HUD-01**: User can open the Companion view from the Vigil plugin tile in the Even Realities app and see a 3-line HUD (top: session label truncated; middle: state `idle` / `running` / `waiting` / `done`; bottom: last event message, scrolling if too long).
- [x] **AGENT-HUD-02**: On the temple, double-tap is context-sensitive (per Phase 124 D-08): if a banner is displayed, double-tap acks the banner; else if ≥2 active sessions, double-tap cycles to the next session; else, double-tap navigates Home. Single-tap (`CLICK_EVENT`) and long-press (`LONG_PRESS_EVENT`) are NOT plumbed reliably on G2 hardware in v3.8 — original three-variant spec deferred via `.planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md` (Phase 124 Plan 05).
- [ ] **AGENT-HUD-03**: When the user's iOS device is in Focus / Do Not Disturb mode (state exposed via Even SDK), only `needs_input` and `task_failed` events surface to the HUD. Other events queue silently and surface on next non-DND state change.

### Plugin ship

- [ ] **G2-PLUGIN-01**: `vigil.ehpk` built at version 0.3.0 with the new Companion HUD screen, polish riders folded in, and resubmitted to the Even Hub developer portal store dashboard.

### Demo + portfolio

- [ ] **AGENT-DEMO-01**: Full demo flow (start a Claude Code session in VS Code, walk away from keyboard, receive a `needs_input` tap on the temple, single-tap to acknowledge) is recordable in under 60 seconds for portfolio use.

### G2 polish riders (from v3.5 hardware UAT)

- [ ] **G2-POLISH-05**: Swipe-out-of-list navigation works on real G2 hardware; list-container SCROLL events propagate correctly so the user can exit a list view via swipe (not only via DOUBLE_CLICK → home). Resolves SEED-005, hardware regression first observed in Phase 45 hardware UAT.
- [x] **G2-POLISH-06**: Glasses-menu launch source is distinguishable from app-menu launch source via `onLaunchSource` registration (so the plugin can differentiate `glassesMenu` vs `appMenu` entry points). Resolves SEED-006.
- [ ] **G2-POLISH-07**: Home body content fits within the 210px container without overflow or auto-scroll inconsistency between captures. Resolves SEED-007.
- [ ] **G2-POLISH-08**: Device-status events with `connectType: "none"` are debounced or deduped so the event stream does not spam during transient connection states. Resolves SEED-008.

---

## Future Requirements (deferred from this milestone)

- **SEED-009 (→ v3.9)**: Local-storage for last-viewed screen / scroll position (lifecycle UX, Small)
- **SEED-010 (→ v3.9 anchor candidate)**: Voice capture from G2 via SDK `audioControl` + `audioEvent` PCM stream (Large)
- **999.1 (backlog)**: Restore Ubiquity entitlement for iCloud photo download
- **999.2 (backlog)**: CaptureBar multi-line input support (paste-side newline preservation)

## Out of Scope (explicit exclusions for v3.8)

- **Voice replies to Claude Code from the glasses** — adds audio capture, transcription, and round-trip latency. Save for v3.9.
- **Showing code diffs or terminal output on the HUD** — screen is too small; the whole point is glanceable ambient awareness.
- **Multi-user UI surfaces** — single-user end-to-end. Backend stays per-`userId` for structural future-proofing only.
- **Cross-Mac event deduplication** — if the same Claude Code session hypothetically ran on both Macs, each daemon emits independently. Out of scope.
- **Notarization, code signing, App Store distribution of `vigil-watch`** — local builds on each Mac for personal use; deferred until someone else needs to run it.
- **Linux or Windows support for `vigil-watch`** — macOS-only. Vigil Core stays platform-neutral.
- **GUI on the Mac for vigil-watch** — even a menu bar item. The HUD on the glasses is the UI. Defer to a future `vigil-mac` project.
- **Sending input or commands back to Claude Code** — vigil-watch is a read-only observer.
- **Touching the JSONL files** — vigil-watch is read-only on disk.
- **Phase 80 ServiceNow API** — still blocked on IT token. Carried forward.
- **Phase 85 iOS Shortcut** — still blocked on Shortcuts.app bugs. Carried forward.

---

## Traceability

Filled by `gsd-roadmapper` on 2026-05-06 after roadmap creation. 20/20 v3.8 requirements mapped to exactly one phase. Plans column populated by `/gsd-plan-phase` runs.

| REQ-ID | Phase | Plan(s) |
|--------|-------|---------|
| VERIFY-01 | Phase 120 | TBD |
| AGENT-API-01 | Phase 121 | 121-01, 121-02, 121-03, 121-04, 121-05 |
| AGENT-API-02 | Phase 121 | 121-02, 121-03, 121-04, 121-05 |
| AGENT-WATCH-01 | Phase 122 | 122-00, 122-08, 122-09 |
| AGENT-WATCH-02 | Phase 122 | 122-00, 122-01, 122-02, 122-05, 122-06, 122-07, 122-08, 122-09 |
| AGENT-WATCH-03 | Phase 122 | 122-00, 122-01, 122-04, 122-09 |
| AGENT-WATCH-06 | Phase 122 | 122-00, 122-03, 122-09 |
| AGENT-WATCH-04 | Phase 123 | 123-01, 123-02, 123-04 |
| AGENT-WATCH-05 | Phase 123 | 123-01, 123-02, 123-03, 123-04 |
| AGENT-WATCH-07 | Phase 123 | 123-04, 123-05 |
| AGENT-API-03 | Phase 124 | 124-02, 124-03, 124-06, 124-08, 124-09 |
| AGENT-HUD-01 | Phase 124 | 124-01, 124-06, 124-07, 124-08, 124-09 |
| AGENT-HUD-02 | Phase 124 | 124-01, 124-05, 124-07, 124-09 |
| G2-POLISH-06 | Phase 124 | 124-01, 124-08, 124-09 |
| G2-POLISH-07 | Phase 124 | 124-01, 124-04, 124-09 |
| AGENT-HUD-03 | Phase 125 | TBD |
| G2-POLISH-05 | Phase 125 | TBD |
| G2-POLISH-08 | Phase 125 | TBD |
| G2-PLUGIN-01 | Phase 125 | TBD |
| AGENT-DEMO-01 | Phase 125 | TBD |
