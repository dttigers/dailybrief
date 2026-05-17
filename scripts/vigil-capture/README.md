# vigil-capture — macOS LaunchAgent for Polaris screenshot ingest

**Phase:** 129.1 Plan 04 (SCAP-03 + SCAP-04). Requires the vigil-core
endpoint shipped in plan 129.1-03 (`POST /v1/captures/screenshot`).

## Overview

A small TypeScript daemon that watches `~/vigil-captures/` for new PNG/JPG
files, base64-encodes each one, and POSTs it to vigil-core's
`/v1/captures/screenshot` endpoint. On a successful (`2xx`) response the
file is moved to `~/vigil-captures/processed/<ts>-<workOrderId>.<ext>`; on
any failure (HTTP non-2xx or thrown error) the file is moved to
`~/vigil-captures/failed/<ts>-<filename>` and a `.err` sidecar records the
status code or error message.

The daemon is registered as a LaunchAgent (`com.jamesonmorrill.vigilcapture`)
with `KeepAlive` so macOS restarts it automatically after crashes, sleep/wake
cycles, or login. The daemon is operator-only (single-user scope per
DECISION-F) — no hotkey, no popup, just drop a file in a folder.

## Prerequisites

1. **macOS 14+ (Sonoma)** — LaunchAgent + `launchctl bootstrap gui/<UID>`
   syntax.
2. **Node 20+** at `/usr/local/bin/node` (or `/opt/homebrew/bin/node` —
   if so, edit `LaunchAgent/com.jamesonmorrill.vigilcapture.plist` before
   installing).
3. **Vigil API key in macOS Keychain.** Store via:

   ```sh
   security add-generic-password -s vigil-api-key -a "$USER" -w '<your-vigil-api-key>' -U
   ```

   The daemon reads this on every event — rotation takes effect immediately
   on the next screenshot, with no daemon restart needed.

## Install

From the repo root:

```sh
cd scripts/vigil-capture
npm install
npm run build
node dist/cli.js install
```

The `install` subcommand is idempotent and:

- Creates `~/vigil-captures/{processed,failed}/` with mode `0700` (operator-only).
- Copies `LaunchAgent/com.jamesonmorrill.vigilcapture.plist` to
  `~/Library/LaunchAgents/`.
- Runs `launchctl bootout gui/$UID …` (ignoring "not loaded" errors).
- Runs `launchctl bootstrap gui/$UID …`.
- Verifies the agent is loaded via `launchctl print`.

Re-running `vigil-capture install` is safe — bootout-then-bootstrap is the
canonical idempotent pattern.

## Daily usage

1. Set macOS screenshot save location to `~/vigil-captures/`:
   - System Settings → Screenshots → "Save to" → `~/vigil-captures/`.
   - **OR** drop screenshots there manually with `Cmd+Shift+4` then move.
2. The daemon picks up the new PNG/JPG within ~500ms of the OS finishing
   the write (chokidar's `awaitWriteFinish` blocks until the file is stable).
3. Watch the log briefly:

   ```sh
   vigil-capture tail
   ```

   Look for `[OK] <filename> → CS<7-digits>` on success.

## Pause / resume

To pause the daemon (e.g. while debugging a noisy week):

```sh
launchctl unload ~/Library/LaunchAgents/com.jamesonmorrill.vigilcapture.plist
```

To resume:

```sh
launchctl load ~/Library/LaunchAgents/com.jamesonmorrill.vigilcapture.plist
```

On resume the daemon runs a one-shot **orphan scan** of `~/vigil-captures/`
root — any PNG/JPG that landed while paused gets processed sequentially.

## Tail logs

```sh
vigil-capture tail
# or
tail -f ~/Library/Logs/vigil-capture.log
```

Errors go to `~/Library/Logs/vigil-capture.error.log`. Per-file failure
detail lives in `~/vigil-captures/failed/<ts>-<filename>.err`.

## Key rotation

If the Vigil API key changes (rotation, leak, new operator), update the
Keychain entry and the next screenshot picks up the new key automatically:

```sh
security add-generic-password -s vigil-api-key -a "$USER" -w '<new-key>' -U
```

The `-U` flag updates the existing entry rather than creating a duplicate.
No daemon restart needed — `getApiKey()` reads per-call (no caching).

## Status / uninstall

```sh
vigil-capture status      # launchctl print gui/<UID>/com.jamesonmorrill.vigilcapture
vigil-capture uninstall   # bootout + remove plist; preserves ~/vigil-captures/
```

`uninstall` deliberately leaves `~/vigil-captures/` in place — the operator
may still want to inspect `processed/` history or `failed/` debugging info.

## Edge cases & troubleshooting

- **Multi-file drops** (e.g. drag-and-drop a folder of 10 screenshots) are
  processed sequentially. At single-operator volume (≤50/day) this gives
  natural backpressure and is fine.
- **Daemon crash** leaves files in the root of `~/vigil-captures/`. On
  restart the orphan-scan picks them up before chokidar starts the live
  watcher. No data loss.
- **iCloud `.icloud` stubs** (placeholder files for files not yet downloaded)
  are skipped via the SKIP_PATTERNS filter.
- **macOS in-flight screenshots** (`.tmp.<something>` mid-write files) are
  skipped via the same filter; `awaitWriteFinish` is a second line of defense.
- **Dotfiles** (`.DS_Store`) are skipped.
- **Failed file inspection**: `cat ~/vigil-captures/failed/<ts>-<file>.err`
  shows the HTTP status + response body or the error message.
- **Daemon not starting**: `vigil-capture status` and check
  `~/Library/Logs/vigil-capture.error.log` for stack traces. Common causes:
  Keychain entry missing (`security find-generic-password -s vigil-api-key -w`
  must return a string), node not at `/usr/local/bin/node`, or vigil-core
  unreachable (DNS / network / dead deploy).
- **Empty case_number from vision** (`HTTP 422`): the screenshot doesn't look
  like a Polaris case page to Claude vision. Re-take a tighter shot of the
  case-detail card. The `.err` sidecar records the exact response body.
- **Key rotation not picked up**: confirm `security find-generic-password
  -s vigil-api-key -w` returns the new key. If it returns the old key, the
  Keychain entry was duplicated — list with `security find-generic-password
  -s vigil-api-key -a "$USER" -g` and delete dupes.

## File layout

```
scripts/vigil-capture/
├── package.json             ← @dailybrief/vigil-capture@0.1.0
├── tsconfig.json
├── src/
│   ├── watcher.ts           ← chokidar daemon + processFile + orphan scan
│   ├── watcher.test.ts      ← 7 node:test cases (mock fetch + tmpdir fs)
│   └── cli.ts               ← install / uninstall / status / tail
├── dist/                    ← compiled JS (npm run build)
└── README.md                ← (you are here)

LaunchAgent/
└── com.jamesonmorrill.vigilcapture.plist  ← LaunchAgent definition
```

## Security model

- **API key NEVER in plist** — Keychain-only (T-129.1-16 mitigation).
- **Capture directory mode 0700** — operator-only read/write
  (T-129.1-17 mitigation).
- **userId derived server-side** from the Bearer token's owner — daemon
  cannot spoof another user's identity (T-129.1-09 mitigation at vigil-core).
- **`LimitLoadToSessionType: Aqua`** — daemon only runs in the operator's
  login session, never headless / over SSH.
- **clientCaptureId is UUID v4** — server-side dedup (SVCNOW-04) prevents
  replay double-writes within the same userId.

See plan 129.1-04 `<threat_model>` for the full STRIDE register.
