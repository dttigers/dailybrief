# vigil-linux-hooks

Linux Claude Code → vigil-core agent-events bridge. Surfaces Linux dev-box
Claude Code sessions on the G2 Companion HUD alongside Mac sessions.

Three hook entry points (`SessionStart`, `UserPromptSubmit`, `Stop`) POST one
event each to `https://api.vigilhub.io/v1/agent-events` (Phase 121), with a 2 s
curl timeout and fire-and-forget exit-0-on-anything-failing posture. No daemon,
no offline queue.

## Install

One command, idempotent, coexists with existing GSD hooks:

```bash
cd ~/dev/dailybrief && bash vigil-linux-hooks/install.sh
```

Expected confirmation:

```
vigil-agent-bridge installed (3 hook entries). Set VIGIL_API_KEY to enable.
```

The installer:

1. Reads `~/.claude/settings.json` (creates with `{"hooks":{}}` if missing).
2. Splices three matcher-group entries into `hooks.SessionStart`,
   `hooks.UserPromptSubmit`, `hooks.Stop`. Each spliced entry has
   `"async": true` + `"timeout": 5` (Claude Code v2.1.87+ stdio-stall
   mitigation — see Troubleshooting).
3. Copies `vigil-agent-bridge.sh`, `redact.sh`, and `redaction-patterns.json`
   into `~/.claude/hooks/`. `chmod 755` on the `.sh` files.
4. Atomically rewrites `settings.json` via `tmpfile + rename(2)` — a crashed
   install leaves either the pre-state or the post-state on disk, never a
   zero-byte file.

Re-running the installer is a no-op (idempotent). It will NOT touch existing
GSD entries or any other tool's hooks.

## Set environment variables

Add to `~/.bashrc`, `~/.zshrc`, or `~/.config/vigil/env`:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `VIGIL_API_KEY` | yes | _(unset)_ | Bearer token. `vk_` + 64 hex chars. Source from the vigil-core user dashboard. If unset, the hook silently exits 0 — no events posted, no errors. |
| `VIGIL_API_URL` | no | `https://api.vigilhub.io` | Override target for staging or local dev. |
| `VIGIL_AGENT_BRIDGE_DEBUG` | no | `0` | When `1`, writes one log line per event to `/tmp/vigil-agent-bridge.log`. Never logs to stderr/stdout (keeps the operator's terminal clean). The log NEVER contains `VIGIL_API_KEY`. |
| `VIGIL_HOST_OVERRIDE` | no | `hostname -s` | Override the HUD `host` field. Useful on cloud VMs where `hostname -s` returns `ip-10-0-1-42` or `compute-1` instead of a memorable name. |
| `VIGIL_MAX_PROMPT_LEN` | no | `80` | Truncation cap for the redacted prompt. The default matches WATCH-ENRICH-03; raise for debugging only. |

## Verify install

After install, three new entries exist in `~/.claude/settings.json`:

```bash
grep -c vigil-agent-bridge ~/.claude/settings.json
# → 3
```

The two existing GSD `SessionStart` entries (`gsd-check-update.js` +
`gsd-session-state.sh`) are preserved byte-for-byte. The `PostToolUse` and
`PreToolUse` GSD matcher groups are untouched.

## Troubleshooting

### Airplane-mode test (Success Criterion 4)

Toggle iPhone airplane mode mid-session. Claude Code should continue to
function normally with no stall and no error popup. Events posted while
offline are dropped silently (fire-and-forget; no offline queue).

If the session hangs after a hook event, check `~/.claude/settings.json` for
`"async": true` on the spliced entries — missing this triggers the Claude
Code v2.1.87+ stdio-inheritance stall
(`anthropics/claude-code#43123`). The installer always writes `async:true`;
this only happens if the file was hand-edited.

### Debug log

Enable `VIGIL_AGENT_BRIDGE_DEBUG=1` and tail `/tmp/vigil-agent-bridge.log`:

```bash
export VIGIL_AGENT_BRIDGE_DEBUG=1
tail -f /tmp/vigil-agent-bridge.log
```

Each line is `<timestamp> <event-type> <session-id>`. The log NEVER contains
`VIGIL_API_KEY` (T-134-A1 mitigation).

### 400 inspection

If events don't reach the HUD but the hook is firing (visible in the debug
log), the server may be rejecting the body. Manually probe:

```bash
curl -v -X POST \
  -H "Authorization: Bearer $VIGIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"session_id":"00000000-0000-4000-8000-000000000000","event":"heartbeat","timestamp":"2026-05-19T00:00:00Z","label":"dailybrief","host":"morrillboss","client_event_id":"00000000-0000-4000-8000-000000000001"}' \
  "$VIGIL_API_URL/v1/agent-events"
```

The Phase 121 endpoint is strict — unknown fields return HTTP 400. The hook
sends exactly 7 KNOWN_FIELDS keys (session_id, event, timestamp, label, host,
client_event_id, message); never `exit_code` (only meaningful for
`task_failed`).

## Uninstall

```bash
bash vigil-linux-hooks/install.sh --uninstall
```

Expected confirmation:

```
vigil-agent-bridge uninstalled.
```

Removes the three hook entries from `~/.claude/settings.json` AND the three
runtime files from `~/.claude/hooks/`. GSD entries and other matcher groups
are preserved byte-for-byte. The `hooks.UserPromptSubmit` and `hooks.Stop`
keys are retained as empty arrays (intentional — leaves room for other tools
to splice in later).

## Phase 133 cross-repo coordination

The drift detector (`__tests__/redaction-drift.test.ts`) currently soft-skips
its Rail 3 cross-repo assertion when `vigil-watch/Sources/VigilWatch/Redactor.swift`
is absent. When Phase 133 ships, the cross-repo plan will flip that skip to a
hard-fail to enforce byte-for-byte pattern parity across the Linux hook
(`redaction-patterns.json`) and the macOS daemon (`Redactor.swift`).
