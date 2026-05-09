---
phase: 123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak
status: pending
created: 2026-05-09
---

# Phase 123 — Verification Artifact

> Lives in dailybrief/.planning/. Operator-driven; populated as gates clear.

## AGENT-WATCH-04 — install/uninstall + plist round-trip

| Gate | Method | Status | Evidence |
|------|--------|--------|----------|
| `vigil-watch install` writes both plists, mode 0600 | manual | pending | `ls -la ~/Library/LaunchAgents/com.morrillholdings.vigil.watch*.plist` shows `-rw-------` |
| `launchctl print gui/$UID/com.morrillholdings.vigil.watch` shows `state = running` | manual | pending | _paste output here after install_ |
| `launchctl print gui/$UID/com.morrillholdings.vigil.watch.sampler` reports a valid daemon | manual | pending | _paste output here after install_ |
| `vigil-watch uninstall` removes both plists | manual | pending | `[ ! -f ~/Library/LaunchAgents/com.morrillholdings.vigil.watch.plist ] && [ ! -f ~/Library/LaunchAgents/com.morrillholdings.vigil.watch.sampler.plist ]` |
| Post-Mac-reboot daemon auto-resume (SC #3) | manual | pending | After install + reboot + login, `time vigil-watch test` returns HTTP 2xx within 30s |

## AGENT-WATCH-05 — 6 CLI subcommands

| Gate | Method | Status | Evidence |
|------|--------|--------|----------|
| `vigil-watch run` boots daemon foreground | unit + manual | pending | RunSubcommandTests pass; `vigil-watch run --verbose` against active Claude Code session emits NDJSON to stdout |
| `vigil-watch tail <session-id>` filters NDJSON | unit + manual | pending | TailSubcommandTests pass; live `vigil-watch tail <real-sid>` shows that session's events |
| `vigil-watch test` POSTs synthetic event | unit + manual | pending | TestSubcommandTests pass; `VIGIL_API_KEY=... vigil-watch test` returns HTTP 2xx |
| `vigil-watch status` 3-state output | unit + manual | pending | StatusSubcommandTests pass; running daemon → RUNNING; killed daemon → NOT RUNNING; uninstalled → NOT INSTALLED |

## AGENT-WATCH-07 — 24h unattended soak (D-10 operator-driven)

**Gate:** `bash scripts/soak-check.sh ~/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv` exits 0.

**Operator procedure** (per D-10):
1. `cd "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch" && swift build -c release`
2. `swift run vigil-watch install` (starts both daemon + sampler)
3. Live for ≥24h with normal Claude Code use.
4. `bash scripts/soak-check.sh ~/Library/Logs/Vigil/soak-$(date -u +%Y-%m-%d).csv`

**Status:** pending

**Soak run started:** _<UTC timestamp>_
**Soak run ended:**   _<UTC timestamp>_

**soak-check.sh output (paste verbatim once gate passes):**

```
max RSS:      <KB>
unique PIDs:  <count>
uptime span:  <s>s (<h>h <m>m)
samples:      <count>
Core sessions: <count>

PHASE 123 SOAK GATE: PASSED
```

## Cross-cutting

| Item | Status |
|------|--------|
| Phase 122 carry-forward `testDaemonStartsAndStopsWithoutCrash` SIGSEGV flake — manifested in production? | pending — answered by single-PID assertion from soak-check.sh; if multi-PID, was triggered |
| Phase 122 carry-forward empty `session_id` parser drop rate over 24h | pending — count from `~/Library/Logs/Vigil/watch.err` after 24h soak |

## Verification sign-off

- [ ] All AGENT-WATCH-04 gates pending → green
- [ ] All AGENT-WATCH-05 gates pending → green
- [ ] AGENT-WATCH-07 soak gate pending → PASSED with summary table pasted above
- [ ] Cross-cutting items resolved
- [ ] STATE.md updated to mark Phase 123 complete

**Approval:** pending operator
