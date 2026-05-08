---
phase: 122
slug: vigil-watch-core-watcher-parser-emitter-config
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 122 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 122-RESEARCH.md `## Validation Architecture` section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | XCTest (Swift Package Manager built-in) |
| **Config file** | `Package.swift` (test target declaration) |
| **Quick run command** | `swift test --filter <suite>` |
| **Full suite command** | `swift test` |
| **Estimated runtime** | ~30 seconds (unit tests only); integration tests pull live HTTP |

**Working directory:** `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/` (separate Swift Package — not the dailybrief monorepo).

---

## Sampling Rate

- **After every task commit:** Run `swift test --filter <relevant suite>` (target the suite for the file just modified)
- **After every plan wave:** Run `swift test` (full XCTest suite)
- **Before `/gsd-verify-work`:** Full suite must be green AND a smoke run against live `vigil-core` POST endpoint completes 1 round-trip
- **Max feedback latency:** 30 seconds (full suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _populated by planner during Step 8_ | _01..NN_ | _1..M_ | _AGENT-WATCH-XX_ | _T-122-XX or —_ | _e.g., "bearer token never logged"_ | _unit / integration / manual_ | _swift test --filter ..._ | _❌ W0_ | _⬜ pending_ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 lands before any feature work because the Swift Package itself does not yet exist. All entries are MISSING from the current repo state (`/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/` has only `README.md`, `LICENSE`, and `verification-log/`).

- [ ] `Package.swift` — manifest declaring `VigilWatch` library, `vigil-watch` executable, `VigilWatchTests` test target, platforms `[.macOS(.v14)]` (iMac runs latest macOS; MBP must also support per memory), Swift tools version 5.10+ (or 6.0)
- [ ] `Sources/VigilWatch/` — empty directory placeholder so SPM doesn't error
- [ ] `Sources/vigil-watch/main.swift` — minimal `@main` stub
- [ ] `Tests/VigilWatchTests/` — XCTest scaffolding so `swift test` exits 0 before any feature work
- [ ] `Tests/VigilWatchTests/Fixtures/` — JSONL sample lines copied from `vigil-watch/verification-log/` (read-only test fixtures grounded in Phase 120's verification corpus)

*Without Wave 0, no per-task automated test can exist (the framework target itself is MISSING).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end live Claude Code session emits `needs_input` | AGENT-WATCH-01 | Requires real Claude Code interaction; FSEventStream against live `~/.claude/projects/` cannot be replayed in CI | Run `vigil-watch` in foreground, open VS Code with Claude Code, trigger a tool that requires approval, observe stdout NDJSON `event=needs_input` line within 10s gap window |
| Restart-replay produces zero duplicate rows | AGENT-WATCH-02, SC #3 | Requires live Postgres + sequential daemon runs; partial-unique-index dedupe is the assertion | Run daemon for 2 min during active session, kill, restart, query `SELECT count(*) FROM agent_events WHERE session_id=...` — count should equal pre-kill count |
| Network-disconnect → 90s offline → reconnect drains queue in <5s | AGENT-WATCH-03, SC #4 | Cannot simulate full network stack reliably in unit test; real macOS interface flapping has different timing than mock | `sudo ifconfig en0 down` while daemon running with active session, wait 90s, `sudo ifconfig en0 up`, count events POSTed within next 5s |
| SIGTERM drains within 5s deadline | AGENT-WATCH-03, SC #4 | Real signal delivery + dispatch shutdown order is OS-level; XCTest can't observe wall-clock without flakiness | `time kill -TERM <pid>` — daemon must exit cleanly within 5.5s |
| `watch.toml` first-run create with documented defaults | AGENT-WATCH-06, SC #5 | Filesystem state mutation in `~/.config/vigil/`; XCTest with tmpdir would shadow the real path | `rm -f ~/.config/vigil/watch.toml`, run daemon for 1s, kill, inspect file contents — must contain commented defaults for all 5 keys |
| `VIGIL_API_KEY` env var fallback when `api_key` blank | AGENT-WATCH-06, SC #5 | Same env-var pollution risk as above | Blank `api_key` in toml, set `VIGIL_API_KEY=test`, run daemon, observe POST `Authorization: Bearer test` in stderr log |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (Package.swift, test target, fixtures)
- [ ] No watch-mode flags (XCTest doesn't support watch; `swift test` is one-shot)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
