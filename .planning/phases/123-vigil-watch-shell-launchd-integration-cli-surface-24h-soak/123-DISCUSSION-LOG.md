# Phase 123: vigil-watch shell — launchd integration + CLI surface + 24h soak - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak
**Areas discussed:** Install layout, Status IPC, Tail semantics, 24h soak gate

---

## Install layout (binary + log + plist paths)

| Option | Description | Selected |
|--------|-------------|----------|
| ~/.local/bin + ~/Library/Logs/Vigil/ | Copy release binary to ~/.local/bin/vigil-watch (DailyBriefMonitor pattern). Plist points stdout/stderr at ~/Library/Logs/Vigil/watch.{out,err} (durable across reboots). Install is idempotent: bootout+replace+bootstrap. | ✓ |
| In-place .build/release + ~/Library/Logs/Vigil/ | Plist points directly at /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/.build/release/vigil-watch — zero copy. Risk: Desktop path is unstable. | |
| /usr/local/bin + /tmp logs | System-wide install (sudo), logs to /tmp wiped on reboot. | |
| ~/.local/bin + /tmp logs | Binary copy good, but tmp logs incompatible with overnight crash debugging. | |

**User's choice:** Recommended option (~/.local/bin + ~/Library/Logs/Vigil/, idempotent install).
**Notes:** Mirrors the working DailyBriefMonitor plist already on this Mac. Supersedes Phase 122 CONTEXT's tentative /tmp/ note.

---

## Status IPC — how `status` knows queue depth + last-event timestamp

| Option | Description | Selected |
|--------|-------------|----------|
| State-file IPC on the 1Hz tick | Daemon writes runtime-state.json on existing 1Hz evaluation tick (atomic temp+rename, reuses StateStore.swift pattern). Stale by max 1s. ~30 lines of additive daemon code. | ✓ |
| Unix domain socket query | Daemon listens on a control.sock; status connects + queries. Always-fresh data. ~150 lines, new failure surface. | |
| launchctl print + log heuristics | Zero daemon changes. No queue depth — loses the most useful debugging metric. | |

**User's choice:** Recommended option (state-file IPC on 1Hz tick).
**Notes:** State file lives at ~/Library/Application Support/vigil-watch/runtime-state.json (alongside Phase 122's offsets.json). Falls back to launchctl print if the file is missing or older than 5 seconds.

---

## `tail` semantics — re-parse vs log-filter

| Option | Description | Selected |
|--------|-------------|----------|
| Filter the launchd log file | tail -f ~/Library/Logs/Vigil/watch.out \| jq filter on session_id. Shows what the daemon ACTUALLY emitted. Zero daemon changes. Limitation: requires daemon to be running. | ✓ |
| Re-parse live JSONL independently | Spins up a parallel parser. Works without daemon. But duplicates parser logic and shows hypothetical events, not actual emissions. | |
| Both modes (auto-detect) | Try launchd-log first, fall back to re-parse. Best UX, most code. Overkill for a debug tool. | |

**User's choice:** Recommended option (filter the launchd log file).
**Notes:** Phase 122 stdout is already NDJSON with session_id field; no daemon changes needed. `jq` is a soft dependency — install command warns (non-fatal) if missing.

---

## 24h soak gate rigor

| Option | Description | Selected |
|--------|-------------|----------|
| Scripted sampler + assertion script | Sibling launchd agent (com.morrillholdings.vigil.watch.sampler) fires every 5 min, appends `ts,pid,rss,etime` CSV row. End-of-soak script enforces max(rss)<30MB, uptime≥24h, no pid changes, agent_events count > 0. | ✓ |
| One-shot end-of-soak summary | A 7th `vigil-watch soak-summary` subcommand (beyond ROADMAP's 6) does a single ps snapshot + log line count. Catches only end state. | |
| Ad-hoc observation | Run overnight, eyeball next day. No artifacts. | |

**User's choice:** Recommended option (scripted sampler + assertion script).
**Notes:** Sampler plist installs/uninstalls in lockstep with the main daemon. soak-check.sh lives in vigil-watch repo (not dailybrief). Verification gate is the script returning exit 0 over the soak CSV.

---

## Claude's Discretion

- **`vigil-watch test` shape:** Reserved sessionId `_vigil_test_<unix-timestamp>` + `heartbeat` event type (least-noisy classification, no HUD banner trigger). Prints HTTP status + body. Exit 0 iff 2xx.
- **`vigil-watch run` foreground behavior:** Default foreground (matches Phase 122). `--verbose` enables stderr human-readable lifecycle logs; without `--verbose`, only NDJSON to stdout (pipe-friendly).
- **CLI library:** `apple/swift-argument-parser` (Phase 122 Package.swift comment reserved this).
- **plist generation:** Embedded Swift multi-line string with placeholder substitution; not a separate template file.
- **EnvironmentVariables in plist:** PATH only; VIGIL_API_KEY relies on launchd inheriting user session env. Smoke test required during planning; if inheritance is unreliable, fallback is baking the key into the plist (already accepts plain-text storage in watch.toml).
- **`vigil-watch uninstall` semantics:** bootout (ignore errors) → delete plists → keep log + Application Support data. Idempotent.
- **Crash-loop protection:** Use launchd's default ThrottleInterval (10s); no override.

## Deferred Ideas

- Log rotation for ~/Library/Logs/Vigil/watch.{out,err} — defer until 24h soak shows volume problem.
- `vigil-watch logs` subcommand (7th) — defer until tail+jq UX proves clunky.
- `uninstall --force` flag — defer until uninstall has irreversible side effects.
- Soak metric expansion (pcpu, vsz) — defer until CPU drift becomes a concern.
- Per-launchd env-var inheritance smoke (planning-time investigation, not deferred-to-future-phase).
