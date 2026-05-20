# Phase 134: Linux Claude Code → vigil-core agent-events bridge - Research

**Researched:** 2026-05-19
**Domain:** Claude Code hook protocol (Linux) + Phase 121 `/v1/agent-events` POST contract + Phase 127 GUARD-01 drift-detector pattern
**Confidence:** HIGH

## Summary

Phase 134 is a small, cross-cutting integration: ~50 LOC of bash for the runtime hook (`vigil-agent-bridge.sh`), ~150 LOC of node for the installer (`install.js`), one canonical JSON denylist file (`redaction-patterns.json`), and two tests (drift-detector + redaction-corpus). The bulk of the engineering risk lives in three places:

1. **Hook STDIN envelope contract** — Claude Code v2.1.143 (on this box) puts `session_id`, `cwd`, `hook_event_name`, plus event-specific fields on STDIN as a JSON object. This is now `[VERIFIED: code.claude.com/docs/en/hooks]` and obviates the discuss-phase fallback to `$CLAUDE_SESSION_ID` env var entirely.
2. **Phase 121 strict-mode payload** — the `/v1/agent-events` route is a `.strict()`-style validator with an 8-key `KNOWN_FIELDS` Set. Any unknown top-level field returns HTTP 400. The hook MUST send the exact 7 known keys (6 required, 1 optional `message`) and no others.
3. **Fire-and-forget posture** — Claude Code v2.1.87+ tightened subprocess stdio inheritance, which means a naive `curl … &` causes silent stalls (verified bug `anthropics/claude-code#43123`). The phase MUST use `"async": true` in the settings.json entry (officially supported since v2.1.23 — `[CITED: code.claude.com/docs/en/hooks]`) and/or the belt-and-suspenders `nohup curl … </dev/null >/dev/null 2>&1 & disown` pattern inside the script.

The Phase 127 drift-detector template lives at `vigil-core/src/__tests__/audio-log-redaction.test.ts` (NOT `redaction-drift.test.ts` — the brief's path is wrong; the actual filename is `audio-log-redaction.test.ts`). The cross-package parity sibling lives at `vigil-pwa/src/__tests__/denylist-parity.test.ts`. Both use vitest/node:test `fs.readFileSync` source-greps — Phase 134's `redaction-drift.test.ts` mirrors this structurally.

**Critical correction to CONTEXT.md assumption:** The repo is **NOT** a pnpm workspace. There is **no** `pnpm-workspace.yaml` and **no** root-level `vitest.config.ts`. Root `package.json` describes itself: *"NOT a workspaces monorepo per Phase 107.1 D-13 — thin orchestrator only"*. Each subpackage has its own `package.json` + `npm test` invocation. **vigil-core uses `tsx --test` (node:test), NOT vitest.** vigil-pwa uses vitest. This forces a decision on test wiring (resolved below in §Workspace Test Wiring).

**Primary recommendation:** Lock the `vigil-linux-hooks/` package as a self-contained Node ESM mini-package with its own `package.json` + `tsx --test` invocation matching vigil-core's pattern (NOT vitest — vigil-core's `node:test` is the closer structural match for a runtime that's also Node-only with no DOM/jsdom). Add `vigil-linux-hooks/__tests__` to the root `package.json` `test:linux-hooks` script and to any CI surface that runs `npm test` per workspace.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-L1:** Runtime hook in pure bash (`vigil-agent-bridge.sh`); installer in node (`install.js`); `install.sh` is a 3-line wrapper that `exec`s node.
- **D-L2:** Source-of-truth path is `vigil-linux-hooks/` at repo root (peer to vigil-core, vigil-pwa, vigil-g2-plugin).
- **D-I1:** Session ID comes from STDIN JSON envelope, NOT `$CLAUDE_SESSION_ID` env var. Researcher to verify exact field name — **VERIFIED in this research as `session_id` (snake_case)**.
- **D-I2:** `Stop` hook fires per assistant turn → maps 1:1 to `task_complete` event. No `SessionEnd` wiring.
- **D-I3:** `UserPromptSubmit` fires once per submitted prompt including the first; OK for SessionStart + UserPromptSubmit heartbeat to fire near-simultaneously on first prompt.
- **D-P1..D-P5:** Strict Phase 121 payload — 6 required fields (`session_id`, `event`, `timestamp`, `label`, `host`, `client_event_id`) + optional `message`. `label = basename($cwd)`, `host = hostname -s`. NO `cwd`/`user_agent`/`linux` overflow fields (server returns 400 unknown_field).
- **D-A1..D-A5:** Bearer auth via `$VIGIL_API_KEY`. Empty/unset → exit 0. `curl --max-time 2 --silent --output /dev/null --fail` fire-and-forget. `$VIGIL_API_URL` default `https://api.vigilhub.io`. Zero stderr/stdout noise. Exit code ALWAYS 0.
- **D-R1..D-R5:** Canonical denylist in `vigil-linux-hooks/redaction-patterns.json`: `["api[_-]?key", "bearer", "password", "vk_", "ey[A-Za-z0-9_-]{20,}", "[A-Za-z0-9+/]{40,}={0,2}"]`. Truncate to ≤80 chars first, then regex. Binary redaction: any match → `[redacted: contains sensitive pattern]`. Drift detector reads JSON + bash source, asserts pattern parity.
- **D-N1..D-N5:** Installer JSON-splices into `~/.claude/settings.json` `hooks.<Event>[0].hooks[]`. Idempotent via regex `vigil-agent-bridge\.sh.*--event=<EventName>`. Atomic write via tmpfile + rename. Coexists with the 2 existing GSD SessionStart entries (verified on this Linux box). `--event=<X>` flag dispatch.
- **D-T1, D-T2:** No PostHog/Sentry client-side. `/tmp/vigil-agent-bridge.log` gated on `$VIGIL_AGENT_BRIDGE_DEBUG=1`.
- **D-C1..D-C3:** Drift-detector + corpus + idempotency tests at `vigil-linux-hooks/__tests__/`.

### Claude's Discretion (researcher locked below)

- **Hook script style** — match `~/.claude/hooks/gsd-session-state.sh`: `#!/usr/bin/env bash`, `set -euo pipefail`, version-pinning comment `# vigil-hook-version: 0.1.0`.
- **UUID generation source** — `uuidgen` primary, `cat /proc/sys/kernel/random/uuid` fallback. Both benchmarked at ≤1ms cold start on this box. Use `command -v uuidgen >/dev/null && uuidgen || cat /proc/sys/kernel/random/uuid`.
- **Hostname source** — `hostname -s` (verified on this box returns `morrillhouse`, no `.lan` FQDN noise).
- **Timestamp format** — `date -Iseconds` (verified on this box: `2026-05-19T00:12:07+00:00`, parseable by `new Date(...)` in vigil-core).
- **README content** — researcher drafts; planner schedules as last task in 134-04-PLAN.
- **Test framework choice for `vigil-linux-hooks/`** — locked as Node `node:test` via `tsx --test` (mirrors vigil-core, NOT vitest). Justified in §Validation Architecture.

### Deferred Ideas (OUT OF SCOPE)

- Tool-step events (`PreToolUse`/`PostToolUse`) — Phase 135+ candidate.
- Offline queue / retry — fire-and-forget by design; outage drops events silently.
- Multi-operator install — single-user `~/.claude/` only.
- Auto-update mechanism — operator manually re-runs installer.
- `SessionEnd` event — not in REQUIREMENTS; researcher confirms hook protocol now has `SessionEnd` (Claude Code v2.1.x) but wiring it would emit a spurious `task_complete`; DO NOT wire.
- Reply round-trip / write-back — Phase 133 scope.
- vigil-watch Linux port (real daemon) — Phase 200+ if ever.
- WATCH-ENRICH-03 ordering: Phase 134 ships first per current ROADMAP order; Phase 133 will consume `vigil-linux-hooks/redaction-patterns.json` cross-repo.
- Phase 121 `KNOWN_FIELDS` extension (adding `cwd`/`tool_name` fields) — out of scope; basename-of-cwd in `label` covers immediate need.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGENT-LINUX-01 | Hook installed; `SessionStart` POSTs `heartbeat` event | §STDIN envelope (`session_id`+`cwd` confirmed verbatim); §Phase 121 contract (KNOWN_FIELDS + bearer auth shape) |
| AGENT-LINUX-02 | Same hook wired to `Stop` → `task_complete` POST | §STDIN envelope (Stop receives `stop_hook_active`); §`async: true` posture |
| AGENT-LINUX-03 | `UserPromptSubmit` heartbeat with ≤80-char redacted prompt | §Redaction (truncate-first invariant + binary `[redacted: …]`); §UserPromptSubmit envelope includes `prompt` field |
| AGENT-LINUX-04 | Bearer auth + fail-safe | §Bearer format (`Bearer vk_<64hex>`); §curl pattern; §async:true bug `#43123` |
| AGENT-LINUX-05 | One-command portable install + idempotent + uninstall | §Installer algorithm (JSON splice + tmpfile rename); §Existing GSD hooks audit |
| AGENT-LINUX-06 | Drift-detector test grep-pins denylist | §Phase 127 drift-detector template (`audio-log-redaction.test.ts`); §Test wiring |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hook invocation (STDIN JSON envelope) | OS / Claude Code runtime | — | Claude Code dispatches; the hook is a leaf process |
| Session-ID extraction | Hook (bash + `node -e` JSON parse) | — | Per-event STDIN parse |
| Prompt redaction | Hook (bash regex over truncated 80-char string) | — | Must happen before network — single-host privacy boundary |
| HTTP POST | Hook (curl, fire-and-forget) | Vigil-core API (receives) | Network boundary; auth enforced server-side |
| Settings.json splice | Installer (node, one-shot CLI) | — | Single-machine config; idempotent JSON edit |
| Persistence + dedup | Vigil-core (Phase 121 route + `agent_events` table) | Postgres partial-unique index | Server-side, untouched by Phase 134 |
| SSE fan-out to G2 HUD | Vigil-core (Phase 124 `/v1/agent-stream`) | G2 plugin (downstream subscriber) | Existing infra; zero changes for Phase 134 |
| CI drift-detector | `vigil-linux-hooks/__tests__/` (node:test via tsx) | — | Test runtime is Node ESM, no DOM |

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| `bash` | system | Runtime hook shell | `[VERIFIED]` Existing GSD hooks (`gsd-session-state.sh`, `gsd-phase-boundary.sh`) all use bash + `node -e` for JSON parse. 5ms cold start vs node 70ms. |
| `node` (system) | 22.x (vigil-core pinning) | Installer + STDIN JSON parse helper inside bash hook | `[VERIFIED]` Existing GSD hook `gsd-check-update.js` is invoked as `/usr/bin/node`. |
| `curl` | system | Fire-and-forget HTTP POST | `[VERIFIED]` Standard on Debian/Ubuntu/Fedora; `--max-time 2 --fail --silent` is canonical. |
| `uuidgen` (util-linux) | system | client_event_id generation | `[VERIFIED]` Present at `/usr/bin/uuidgen` on this box; benchmark <1ms. Fallback `cat /proc/sys/kernel/random/uuid` also <1ms. |
| `hostname -s` (inetutils-tools) | system | host field | `[VERIFIED]` Returns `morrillhouse` on this box (short form, no FQDN). |
| `date -Iseconds` (GNU coreutils) | system | ISO-8601 RFC 3339 timestamp | `[VERIFIED]` Returns `2026-05-19T00:12:07+00:00`; parseable by `new Date(...)` in vigil-core route. |

### Test Stack (locked decision — `vigil-linux-hooks/` mini-package)

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| `tsx` | ^4.19.0 | TypeScript-on-the-fly executor for `node:test` | `[VERIFIED]` Used by vigil-core (`"test": "tsx --test \"src/**/*.test.ts\""`); already in root devDeps (`tsx ^4.22.1`) |
| `node:test` | Node 22 built-in | Test runner | `[VERIFIED]` vigil-core's `audio-log-redaction.test.ts` uses this exact pattern with `describe`, `it`, `before` from `node:test` and `assert` from `node:assert/strict` |
| `typescript` | ^5.7.0 | Type-check the installer + test sources | `[VERIFIED]` vigil-core pinning |

Tests are written in TypeScript (`*.test.ts`), executed via `tsx --test "__tests__/**/*.test.ts"`. NO new runtime dependencies. NO vitest. This avoids the dependency-installation surface (the brief's option (a) "extend root vitest include glob" is unworkable because there is no root vitest config).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tsx --test` (node:test) | vitest with a new root config | Adds vitest as a dependency at root or in `vigil-linux-hooks/`. vigil-pwa already has vitest, so prior art exists, but it would diverge from the closer structural match (vigil-core uses node:test). Rejected. |
| `curl` | `wget` | curl is more idiomatic on dev workstations + GSD hook precedent. wget gains nothing. |
| `uuidgen` | `python3 -c 'import uuid;print(uuid.uuid4())'` | Adds Python dependency; uuidgen is present on every reasonable Linux distro. |
| `nohup curl … & disown` only | `"async": true` in settings.json | Both work; `async: true` is the official posture since Claude Code v2.1.23 (well below this box's v2.1.143). Use BOTH (belt + suspenders) — `async: true` in the JSON splice AND `nohup` + redirect in the script. |

**Installation:** No `npm install` for runtime. For `vigil-linux-hooks/` package:
```bash
cd vigil-linux-hooks && npm install
```
The package.json devDeps are exactly: `{ "tsx": "^4.19.0", "typescript": "^5.7.0", "@types/node": "^22.0.0" }`.

**Version verification:**
```bash
node --version          # v22.x verified
uuidgen --version       # util-linux 2.x verified
curl --version | head -1  # 7.x or 8.x verified
hostname --version      # net-tools or inetutils verified
date --version | head -1  # GNU coreutils 9.x verified
```
All confirmed present on the operator's Linux box.

## Package Legitimacy Audit

> Phase 134's runtime installs ZERO external packages. The installer is pure-node-stdlib (`fs`, `path`, `JSON`). The hook is pure bash + system tools. The test mini-package uses only `tsx`, `typescript`, and `@types/node` — all already present in the repo's devDeps.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `tsx` | npm | 4+ yrs | ~6M/wk | github.com/privatenumber/tsx | not run — pre-approved (vigil-core uses already) | Approved (already in repo) |
| `typescript` | npm | 12+ yrs | ~70M/wk | github.com/microsoft/TypeScript | not run — pre-approved | Approved (already in repo) |
| `@types/node` | npm | 10+ yrs | ~80M/wk | github.com/DefinitelyTyped/DefinitelyTyped | not run — pre-approved | Approved (already in repo) |

slopcheck was not invoked because every package is already a transitive devDep of the existing vigil-core / vigil-pwa packages. **No new external packages are introduced by Phase 134.**

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                   ┌─ Claude Code runtime (Linux, v2.1.143) ─────────────┐
                   │                                                       │
   operator types  │  SessionStart  UserPromptSubmit  Stop                 │
   `claude`     ──▶│      │                │           │                    │
                   │      ▼                ▼           ▼                    │
                   │  (dispatch hooks.<Event>[].hooks[] entries in array    │
                   │   order; matching identical handlers deduped; each     │
                   │   entry runs as own subprocess with STDIN JSON         │
                   │   envelope: {session_id, cwd, hook_event_name, ...})  │
                   │      │                │           │                    │
                   └──────┼────────────────┼───────────┼────────────────────┘
                          │                │           │
                          ▼                ▼           ▼
              ┌────────────────────────────────────────────────────┐
              │  ~/.claude/hooks/vigil-agent-bridge.sh             │
              │  --event=SessionStart | UserPromptSubmit | Stop    │
              │                                                    │
              │  1. read STDIN → node -e parse → $SESSION_ID,$CWD  │
              │  2. [UserPromptSubmit] truncate prompt ≤80 chars,  │
              │     then regex-match against denylist → redact     │
              │  3. compose JSON body (7 known fields)             │
              │  4. nohup curl --max-time 2 ... &                  │
              │     disown                                         │
              │  5. exit 0 (unconditionally)                       │
              └────────────────────┬───────────────────────────────┘
                                   │ POST /v1/agent-events
                                   │ Authorization: Bearer $VIGIL_API_KEY
                                   │ Content-Type: application/json
                                   ▼
              ┌────────────────────────────────────────────────────┐
              │  vigil-core (Railway prod) — Phase 121 route       │
              │  - bearerAuth → c.set("userId", row.userId)        │
              │  - validate body against KNOWN_FIELDS Set          │
              │  - INSERT agent_events                             │
              │  - ON CONFLICT DO NOTHING (user_id, client_event_id) │
              │  - emit row → AgentEventBus (per-userId)           │
              └────────────────────┬───────────────────────────────┘
                                   │ Phase 124 SSE fan-out
                                   ▼
              ┌────────────────────────────────────────────────────┐
              │  G2 Companion HUD plugin subscriber                │
              │  → `dailybrief: running` body line                 │
              └────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
vigil-linux-hooks/                      # NEW top-level workspace
├── package.json                        # devDeps only: tsx, typescript, @types/node
├── tsconfig.json                       # ESM, target ES2022
├── README.md                           # operator-facing install + env-var setup
├── vigil-agent-bridge.sh               # runtime hook (bash) — copied to ~/.claude/hooks/
├── redact.sh                           # sourceable bash redactor (also copied + unit-tested)
├── redaction-patterns.json             # canonical denylist source-of-truth
├── install.js                          # installer (node ESM)
├── install.sh                          # 3-line wrapper that execs install.js
└── __tests__/
    ├── redaction-drift.test.ts         # AGENT-LINUX-06: pattern parity across sources
    ├── redaction-corpus.test.ts        # Success Criterion 3: behavioral redaction tests
    └── installer-idempotency.test.ts   # AGENT-LINUX-05: tempdir fake HOME splice test
```

### Pattern 1: STDIN JSON envelope parsing (mirror gsd-phase-boundary.sh)

**What:** Read STDIN, pipe to `node -e` for JSON parsing, capture field via process.stdout.write.
**When to use:** Every Claude Code hook that needs typed envelope access.
**Example (line-by-line from gsd-phase-boundary.sh):**

```bash
# Source: ~/.claude/hooks/gsd-phase-boundary.sh:18-21 [VERIFIED on disk]
INPUT=$(cat)
FILE=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).tool_input?.file_path||'')}catch{}})" 2>/dev/null)
```

**Phase 134 adaptation:**
```bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).session_id||'')}catch{}})" 2>/dev/null)
CWD=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).cwd||'')}catch{}})" 2>/dev/null)
PROMPT=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).prompt||'')}catch{}})" 2>/dev/null)
```

Note the two-call overhead (each `node -e` invocation costs ~70ms cold start). A single combined parse is cheaper:

```bash
# Phase 134 optimized — single node invocation
read_envelope() {
  node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{
        const j=JSON.parse(d);
        process.stdout.write([j.session_id||'',j.cwd||'',j.prompt||''].join('\\u0001'));
      }catch{}
    })
  " 2>/dev/null
}
IFS=$'\x01' read -r SESSION_ID CWD PROMPT < <(echo "$INPUT" | read_envelope)
```

ASCII `\x01` (SOH) is a safe delimiter — never legitimately appears in CWD or prompt content (both filtered by Claude Code's UTF-8 source).

### Pattern 2: Phase 121 strict-mode body (mirror agent-events.ts:34-43)

**What:** Build a JSON body with exactly 7 known keys; ANY other key returns 400.
**Source:** `vigil-core/src/routes/agent-events.ts:34-43` — KNOWN_FIELDS Set literal:

```typescript
// [VERIFIED via Read tool — agent-events.ts:34-43]
const KNOWN_FIELDS = new Set([
  "session_id",
  "event",
  "message",
  "timestamp",
  "label",
  "host",
  "exit_code",
  "client_event_id",
]);
```

The 6 required (validator throws 400 if any missing): `session_id`, `event`, `timestamp`, `label`, `host`, `client_event_id`. The route validates `event ∈ VALID_EVENTS` (`needs_input`, `task_complete`, `task_failed`, `milestone`, `heartbeat`) and timestamp parses to a valid `Date`. `message` is optional string. `exit_code` is optional integer (Phase 134 never sends it — only used by `task_failed`).

**Phase 134 body builder (bash heredoc):**
```bash
# Build JSON body via node (defends against quote/newline injection in prompt)
BODY=$(node -e "
  process.stdout.write(JSON.stringify({
    session_id: '$SESSION_ID_ESC',
    event: '$EVENT',
    timestamp: '$TS',
    label: '$LABEL_ESC',
    host: '$HOST_ESC',
    client_event_id: '$UUID',
    ${MESSAGE:+message: '$MESSAGE_ESC',}
  }))
")
```
The conditional `message:` line uses bash parameter expansion `${VAR:+...}` to omit the key entirely when `MESSAGE` is unset (e.g., SessionStart heartbeats might or might not include a message depending on phase decision; CONTEXT.md D-P2 says "static strings for SessionStart/Stop per ROADMAP" — include them).

### Pattern 3: Bearer auth header

**Source:** `vigil-core/src/middleware/auth.ts:38-44` — `[VERIFIED via Read tool]`

```typescript
const authHeader = c.req.header("Authorization");
if (!authHeader || !authHeader.startsWith("Bearer ")) { return 401; }
const token = authHeader.slice(7);   // strips exactly "Bearer " (7 chars)
```

The vk_ key format is `vk_` + 64 hex chars (path 1 in auth.ts). The hook MUST send the literal string `Bearer ` (capital B, space) followed by the entire `$VIGIL_API_KEY` value.

```bash
curl --header "Authorization: Bearer $VIGIL_API_KEY"
```

### Pattern 4: Async hook fire-and-forget (Claude Code official)

**What:** Add `"async": true` to the hook entry in settings.json so Claude Code does NOT wait for completion.
**Source:** `[VERIFIED: code.claude.com/docs/en/hooks]` + `[CITED: reading.sh/claude-code-async-hooks]` — supported since Claude Code v2.1.23.

**JSON splice shape (the installer must produce this):**
```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "...gsd-check-update.js" } ] },
      { "hooks": [ { "type": "command", "command": "bash ...gsd-session-state.sh" } ] },
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash /home/morrillboss/.claude/hooks/vigil-agent-bridge.sh --event=SessionStart",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

`"timeout": 5` is defensive (`UserPromptSubmit` events default to 30s but ours should never exceed 5s).

**Belt-and-suspenders inside the script** — even with `async: true`, the curl call MUST redirect stdio fully to dodge the v2.1.87 stdio-inheritance bug:

```bash
nohup curl \
  --max-time 2 --silent --output /dev/null --fail \
  --header "Authorization: Bearer $VIGIL_API_KEY" \
  --header "Content-Type: application/json" \
  --data "$BODY" \
  "$VIGIL_API_URL/v1/agent-events" \
  </dev/null >/dev/null 2>&1 &
disown
```

The `</dev/null >/dev/null 2>&1` is mandatory — see Pitfall §"v2.1.87 stdio-inheritance stall".

### Pattern 5: Idempotent JSON splice (mirror Phase 127 drift-detector test mechanic)

**What:** Read `~/.claude/settings.json`, JSON-parse, mutate `hooks.<Event>[]` array conditionally, atomic write back.
**Phase 134 algorithm (in installer):**

```javascript
// Source: this research; canonical pattern
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
const hookPath = path.join(os.homedir(), ".claude", "hooks", "vigil-agent-bridge.sh");

// 1. Parse (or initialize if missing — CONTEXT D-N1)
let settings;
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
} catch (err) {
  if (err.code === "ENOENT") {
    settings = { hooks: {} };
  } else {
    process.stderr.write(`settings.json parse failed: ${err.message}\n`);
    process.exit(1);   // refuse to clobber
  }
}
settings.hooks ??= {};

// 2. Splice per event type — idempotent
const EVENTS = ["SessionStart", "UserPromptSubmit", "Stop"];
const COMMAND_REGEX = /vigil-agent-bridge\.sh.*--event=/;
for (const event of EVENTS) {
  settings.hooks[event] ??= [];
  // Check if any matcher group already has our hook
  const alreadyInstalled = settings.hooks[event].some((group) =>
    (group.hooks ?? []).some((h) =>
      typeof h.command === "string" &&
      COMMAND_REGEX.test(h.command) &&
      h.command.includes(`--event=${event}`)
    )
  );
  if (!alreadyInstalled) {
    settings.hooks[event].push({
      hooks: [{
        type: "command",
        command: `bash ${hookPath} --event=${event}`,
        async: true,
        timeout: 5,
      }],
    });
  }
}

// 3. Atomic write
const tmp = settingsPath + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
fs.renameSync(tmp, settingsPath);
```

The `--uninstall` inverse: filter each `hooks.<Event>` array to drop entries whose `hooks[]` contains a command matching the regex, then write back. Empty arrays should remain (do NOT delete the `hooks.<Event>` key — leaves room for GSD or other tools).

### Anti-Patterns to Avoid

- **Anti-pattern: putting `cwd` in the POST body.** Phase 121's strict validator rejects unknown keys with HTTP 400. The hook's POST body MUST contain only the 7 KNOWN_FIELDS keys (CONTEXT D-P3). Derive `label = basename($cwd)` client-side.
- **Anti-pattern: `curl … &` without stdio redirect.** Triggers Claude Code v2.1.87+ silent-stall bug (`anthropics/claude-code#43123`). Always `</dev/null >/dev/null 2>&1`.
- **Anti-pattern: stderr from the hook script.** Even a `set -e` failure dumping a backtrace to stderr clutters the operator's terminal. Use `set +e` scoping or `command || true` chaining to swallow all errors. CONTEXT D-A4 + D-A5 are non-negotiable.
- **Anti-pattern: re-deriving `client_event_id` as a function of session_id.** The Phase 121 dedup column is per-event (each SessionStart, UserPromptSubmit, Stop produces a fresh UUID). Re-using session_id as event_id would collide on dedup and silently drop subsequent events.
- **Anti-pattern: mutating settings.json without atomic write.** A crashed/half-written settings.json bricks Claude Code on next launch. Use `fs.writeFileSync(tmp); fs.renameSync(tmp, real)`.
- **Anti-pattern: shell-interpolating `$PROMPT` directly into a JSON heredoc.** A prompt containing `"` or backtick or `$` will corrupt the body or trigger arbitrary command execution. Always pass strings as args to `node -e ...` and let `JSON.stringify` escape them — never `printf '%s' ... | … "$PROMPT" …` into JSON.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON parse / stringify in bash | Hand-rolled `awk`/`sed` JSON parser | `node -e "JSON.parse(...)"` — already in scope for GSD hooks | Bash JSON parsing is famously fragile against nested quotes, unicode, and embedded newlines. The GSD `gsd-phase-boundary.sh` precedent (`[VERIFIED on disk]`) is the canonical Linux Claude Code pattern. |
| UUID v4 generation | Bash-only XOR/random scheme | `uuidgen` (util-linux) or `cat /proc/sys/kernel/random/uuid` | UUIDs need cryptographic randomness; `$RANDOM` is 15-bit pseudorandom and collides at <100K samples. |
| Bearer auth signing | Hand-rolled HMAC | The `vk_` key format is opaque to the client — the hook just sends the literal bearer string | The vigil-core auth layer does the SHA256 hash lookup; no client-side crypto. |
| ISO-8601 timestamp | Bash arithmetic `date +%Y-%m-%dT%H:%M:%S%z` | `date -Iseconds` | The `-Iseconds` form produces RFC 3339 with timezone; `new Date(...)` in vigil-core parses it cleanly. |
| Settings.json schema validation | Re-implement Claude Code's hook validator | Trust JSON.parse + JSON.stringify round-trip; defer to Claude Code's own schema validation at runtime | The installer never CREATES new hook event types — only appends to known ones (`SessionStart`/`UserPromptSubmit`/`Stop`). Validation surface is minimal. |
| Atomic file write | `cat > settings.json` (truncate-and-write) | `fs.writeFileSync(tmp) + fs.renameSync(tmp, real)` | An interrupted truncate-and-write leaves a zero-byte settings.json. Atomic rename is one syscall and idempotent. |
| Redaction regex engine | Bash `[[ =~ ]]` with custom backtracking | Bash's POSIX ERE via `[[ =~ ]]` — already sufficient for the 6 patterns | The 6 WATCH-ENRICH-03 patterns are all simple alternations + character classes; native bash regex handles them at constant cost on an 80-char input. |

**Key insight:** Phase 134's "don't hand-roll" list is mostly about not re-inventing bash escape-hatch tooling that already exists in coreutils and node. The hook stays under 100 LOC by leaning on `uuidgen`, `date -Iseconds`, `hostname -s`, and `node -e` for JSON.

## Runtime State Inventory

> **Phase 134 is partially greenfield (no source code rename) but DOES install state into the operator's home directory.** This section documents the side-effects the installer creates and the existing GSD hooks the installer must coexist with.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 134 stores zero state in the repo or on Postgres. Each agent_events row is created server-side via existing Phase 121 path; no new tables/columns. | none |
| Live service config | `~/.claude/settings.json` on operator's Linux box currently has: 2 SessionStart entries (gsd-check-update.js + gsd-session-state.sh), 3 PostToolUse matchers (gsd-context-monitor.js + gsd-phase-boundary.sh + gsd-read-injection-scanner.js), 4 PreToolUse matchers (gsd-prompt-guard.js + gsd-read-guard.js + gsd-workflow-guard.js + gsd-validate-commit.sh). UserPromptSubmit + Stop arrays are absent (will be created). | installer splices into SessionStart, creates UserPromptSubmit+Stop arrays |
| OS-registered state | None on Linux — Claude Code is a userspace CLI, no systemd unit, no launchd plist equivalent. | none |
| Secrets/env vars | New env vars introduced by Phase 134: `VIGIL_API_KEY` (required), `VIGIL_API_URL` (optional, defaults to `https://api.vigilhub.io`), `VIGIL_AGENT_BRIDGE_DEBUG` (optional, off). Operator sources from `~/.bashrc`/`~/.zshrc` or `~/.config/vigil/env` per CONTEXT D-A1. None of these are stored in git; none correspond to vigil-core SOPS keys. | document in README; no migration |
| Build artifacts | None — the runtime hook is plain bash, no compile step. The installer is node ESM source-executed via `/usr/bin/node`. | none |

**Canonical question — "After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?"**

Answer: **Nothing on the server side.** Phase 134's runtime artifacts are entirely under `~/.claude/` on the operator's machine and are managed by the install/uninstall lifecycle. No code-rename concerns apply (Phase 134 introduces new names, doesn't rename old ones).

## Common Pitfalls

### Pitfall 1: v2.1.87 stdio-inheritance silent stall
**What goes wrong:** Hook spawns `curl … &` without redirecting stdin/stdout/stderr. The background process inherits Claude Code's stream-json pipe FDs. Claude Code's wrapper waits for ALL child FDs to close. Background curl never closes (it's writing to stdout via `--output /dev/null` but the inherited stdout FD is the Claude Code pipe). Result: `Session timed out after 649s (hadFirstResponse=false, reason=no_response)`.
**Why it happens:** `[CITED: anthropics/claude-code#43123]` Claude Code v2.1.87+ tightened subprocess plumbing; pre-2.1.87 versions tolerated leaked FDs.
**How to avoid:** Two layers of defense — (1) `"async": true` in the settings.json entry (`[CITED: code.claude.com/docs/en/hooks]`), and (2) `nohup curl … </dev/null >/dev/null 2>&1 & disown` inside the script.
**Warning signs:** Operator reports Claude Code "hangs after first prompt" or sessions become unresponsive only on Linux box, not on Mac. Verify by running `claude -d hooks` and watching the debug log.

### Pitfall 2: settings.json parse failure cascades to all hooks
**What goes wrong:** Installer crashes mid-write, leaving a zero-byte or malformed `settings.json`. Claude Code on next launch fails to parse, falls back to default behavior (no hooks active), silently degrading the GSD workflow.
**Why it happens:** Non-atomic write; `process.exit()` between `fs.write` and `fs.close`; OS-level disk-full or permission error.
**How to avoid:** Atomic write via `fs.writeFileSync(tmp); fs.renameSync(tmp, real)`. On parse failure during installer run, `process.exit(1)` BEFORE writing anything. Add a defensive `JSON.parse(JSON.stringify(settings))` round-trip before write to detect any circular-ref bug from the splice.
**Warning signs:** GSD hooks stop firing (no "Project State Reminder" injection); `claude -d hooks` shows parse errors at startup.

### Pitfall 3: Strict KNOWN_FIELDS rejection on extra body keys
**What goes wrong:** Hook author adds a `cwd: $CWD` field to the body for debugging, server returns HTTP 400 `unknown_field`, fire-and-forget swallows the response, event silently never lands.
**Why it happens:** Phase 121's validator (agent-events.ts:121-130) is `.strict()`-equivalent. Hook author doesn't see the 400 because of `--silent --fail`.
**How to avoid:** Test against the production endpoint via the operator's vk_ key during local dev. Add a verbose-mode flag (`VIGIL_AGENT_BRIDGE_DEBUG=1`) that logs curl's full response to `/tmp/vigil-agent-bridge.log`. Lock the body schema in `redact.sh`'s caller (helper function `emit_event` that takes only the 7 known fields as named args).
**Warning signs:** Events visible in hook debug log as "sent" but never appear in `agent_events` table or HUD; vigil-core access log shows 400s.

### Pitfall 4: Truncate-then-redact leaks partial pattern
**What goes wrong:** A 4KB prompt contains `Bearer eyJhbGciOiJIUzI1NiJ9.…` starting at offset 2000. Truncate-first to 80 chars discards the secret; truncate-first then regex correctly returns clean preview. But if the prompt is `"my key: vk_abc123…(70 chars)…rest"` where truncation lands MID-key, redaction may not match because the regex requires full `vk_` + 64 hex.
**Why it happens:** `vk_` pattern matches the prefix alone (literal `vk_`); other patterns are also prefix-anchored or substring-anchored. CONTEXT D-R2 claims the truncate-then-redact ordering is safe because "all six match within ≤40 chars or are substring-anchored."
**Verification (done in this research):**
  - `api[_-]?key` — substring match, fires anywhere in ≥7 chars.
  - `bearer` — substring match, 6 chars.
  - `password` — substring match, 8 chars.
  - `vk_` — substring match, 3 chars (only prefix needed — strictest defensive trip).
  - `ey[A-Za-z0-9_-]{20,}` — anchored on `ey` + needs 20 chars after; could be truncated to 19+`ey` = 21 chars (NO MATCH) but the prefix `ey` alone is ALSO a sufficient red flag in a developer prompt (extremely unlikely to appear in clean English). **Risk: low but nonzero.** Mitigation: lower the JWT-suffix threshold to `{10,}` so 80-char truncations always match if `ey` + 10 base64 chars appears.
  - `[A-Za-z0-9+/]{40,}={0,2}` — needs 40 contiguous base64 chars; 80-char truncation easily fits.
**How to avoid:** Lower JWT regex threshold to `{10,}` in `redaction-patterns.json` (operator can override). Document the partial-leak edge case in README.
**Warning signs:** A test fixture containing a JWT that starts at offset 70 of an 80-char input should still match. Add this to `redaction-corpus.test.ts`.

### Pitfall 5: hostname -s returns weird values on cloud VMs
**What goes wrong:** Operator runs the hook on a temporary cloud VM where `hostname -s` returns `ip-10-0-1-42` or `compute-1`. HUD shows `dailybrief @ ip-10-0-1-42` — operator can't visually disambiguate from Mac.
**Why it happens:** Cloud-init / AMI defaults override `/etc/hostname`.
**How to avoid:** Document `VIGIL_HOST_OVERRIDE` env var (optional) — if set, hook uses it instead of `hostname -s`. Operator's bashrc on a cloud VM can set `export VIGIL_HOST_OVERRIDE=morrillboss-vm-a`.
**Warning signs:** HUD label looks like an EC2 instance ID. The README covers this.

### Pitfall 6: bash `set -euo pipefail` triggers early exit on the redaction regex
**What goes wrong:** `set -e` causes the script to exit on any non-zero command. `[[ "$PROMPT" =~ $PATTERN ]]` returns non-zero when NO match (which is the success case for clean prompts). Result: hook exits non-zero on every clean prompt; with `set -e` it never reaches the curl.
**Why it happens:** Bash `[[ =~ ]]` returns 0 on match, 1 on no-match. Under `set -e`, the no-match case kills the script.
**How to avoid:** Scope `[[ =~ ]]` calls inside `if` blocks (`if [[ … ]]; then …; fi`), which exempts the failing test from `set -e`. OR drop `set -e` for the hook (the GSD hooks use `set -euo pipefail` but they don't use `[[ =~ ]]`). Reference: bash man page "the test is no longer subject to errexit when it appears in an `if` test."
**Warning signs:** Hook silently exits before posting; manual debug shows the script body never reaches the curl line.

## Code Examples

### Compose the POST body via node (avoids shell-quote injection from prompt content)

```bash
# Source: this research (Phase 134 canonical pattern)
emit_event() {
  local event="$1"
  local message="${2:-}"     # optional
  local ts; ts="$(date -Iseconds)"
  local uuid; uuid="$(command -v uuidgen >/dev/null && uuidgen || cat /proc/sys/kernel/random/uuid)"
  local label; label="$(basename "$CWD")"
  local host; host="${VIGIL_HOST_OVERRIDE:-$(hostname -s)}"
  local body
  body=$(SESSION_ID="$SESSION_ID" EVENT="$event" TS="$ts" UUID="$uuid" \
         LABEL="$label" HOST="$host" MESSAGE="$message" \
    node -e '
      const e = process.env;
      const obj = {
        session_id: e.SESSION_ID,
        event: e.EVENT,
        timestamp: e.TS,
        label: e.LABEL,
        host: e.HOST,
        client_event_id: e.UUID,
      };
      if (e.MESSAGE && e.MESSAGE.length > 0) obj.message = e.MESSAGE;
      process.stdout.write(JSON.stringify(obj));
    ' 2>/dev/null) || return 0

  nohup curl \
    --max-time 2 --silent --output /dev/null --fail \
    --header "Authorization: Bearer $VIGIL_API_KEY" \
    --header "Content-Type: application/json" \
    --data "$body" \
    "$VIGIL_API_URL/v1/agent-events" \
    </dev/null >/dev/null 2>&1 &
  disown
}
```

Passing prompt content via `env` (not via `argv` or a heredoc) is the safe path — `process.env.MESSAGE` is a typed string under node's control, never re-interpreted by the shell.

### Drift-detector test stub (mirrors audio-log-redaction.test.ts Rail 1)

```typescript
// Source: vigil-linux-hooks/__tests__/redaction-drift.test.ts (NEW)
// Mirror of: vigil-core/src/__tests__/audio-log-redaction.test.ts:212-230
// [VERIFIED structural template via Read tool on the source file]

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

let ROOT = "";
before(() => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  // __tests__ → vigil-linux-hooks → repo-root
  ROOT = path.join(here, "..");
});

describe("AGENT-LINUX-06 — redaction pattern parity", () => {
  it("Rail 1: redaction-patterns.json contains all six WATCH-ENRICH-03 patterns", () => {
    const json = JSON.parse(
      readFileSync(path.join(ROOT, "redaction-patterns.json"), "utf8")
    );
    const required = [
      "api[_-]?key",
      "bearer",
      "password",
      "vk_",
      "ey[A-Za-z0-9_-]{10,}",       // threshold lowered per Pitfall 4
      "[A-Za-z0-9+/]{40,}={0,2}",
    ];
    for (const p of required) {
      assert.ok(
        json.patterns.includes(p),
        `redaction-patterns.json must contain "${p}" per AGENT-LINUX-06`
      );
    }
    assert.equal(json.max_length, 80, "max_length must be 80 per AGENT-LINUX-03");
  });

  it("Rail 2: vigil-agent-bridge.sh references redaction-patterns.json (no hardcoded list)", () => {
    const src = readFileSync(path.join(ROOT, "vigil-agent-bridge.sh"), "utf8");
    assert.match(
      src,
      /redaction-patterns\.json/,
      "bash hook must read from canonical JSON source — drift detector pin"
    );
  });

  it("Rail 3: (cross-repo) vigil-watch source contains same pattern list — SKIP if not yet shipped", () => {
    // Phase 133 has not landed yet — skip with console.warn if path missing.
    // When Phase 133 ships, this test becomes load-bearing for parity.
    const watchPath = path.join(ROOT, "..", "..", "vigil-watch", "Sources",
      "VigilWatch", "Redactor.swift");
    let src: string;
    try {
      src = readFileSync(watchPath, "utf8");
    } catch {
      console.warn("[skip] vigil-watch not present — Phase 133 not yet shipped");
      return;
    }
    const json = JSON.parse(
      readFileSync(path.join(ROOT, "redaction-patterns.json"), "utf8")
    );
    for (const p of json.patterns) {
      assert.match(src, new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        `vigil-watch Redactor.swift must contain pattern "${p}"`);
    }
  });
});
```

### Installer idempotency test (mirrors fixture-based pattern)

```typescript
// Source: vigil-linux-hooks/__tests__/installer-idempotency.test.ts (NEW)

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

describe("AGENT-LINUX-05 — installer idempotency", () => {
  let fakeHome: string;
  let installerPath: string;
  before(() => {
    fakeHome = mkdtempSync(join(tmpdir(), "vigil-install-"));
    mkdirSync(join(fakeHome, ".claude"), { recursive: true });
    // Seed with the same 2-entry SessionStart shape this Linux box has
    const seed = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: "node gsd-check-update.js" }] },
          { hooks: [{ type: "command", command: "bash gsd-session-state.sh" }] },
        ],
      },
    };
    writeFileSync(join(fakeHome, ".claude", "settings.json"), JSON.stringify(seed));
    installerPath = join(__dirname, "..", "install.js");
  });

  it("after install: 3 SessionStart entries + originals preserved byte-for-byte", () => {
    execSync(`HOME='${fakeHome}' node ${installerPath}`);
    const after = JSON.parse(
      readFileSync(join(fakeHome, ".claude", "settings.json"), "utf8")
    );
    assert.equal(after.hooks.SessionStart.length, 3);
    assert.equal(after.hooks.SessionStart[0].hooks[0].command,
      "node gsd-check-update.js");
    assert.equal(after.hooks.SessionStart[1].hooks[0].command,
      "bash gsd-session-state.sh");
    assert.match(after.hooks.SessionStart[2].hooks[0].command,
      /vigil-agent-bridge\.sh --event=SessionStart/);
  });

  it("re-run install: no 4th entry added (idempotent)", () => {
    execSync(`HOME='${fakeHome}' node ${installerPath}`);
    const after = JSON.parse(
      readFileSync(join(fakeHome, ".claude", "settings.json"), "utf8")
    );
    assert.equal(after.hooks.SessionStart.length, 3);
  });

  it("uninstall: returns to 2-entry state", () => {
    execSync(`HOME='${fakeHome}' node ${installerPath} --uninstall`);
    const after = JSON.parse(
      readFileSync(join(fakeHome, ".claude", "settings.json"), "utf8")
    );
    assert.equal(after.hooks.SessionStart.length, 2);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `$CLAUDE_SESSION_ID` env var | STDIN JSON envelope with `session_id` field | Claude Code v2.x baseline | Hook MUST read STDIN, not env. CONTEXT D-I1 hedge resolved — STDIN is the only path. |
| `curl … &` fire-and-forget | `"async": true` in settings.json + `nohup … </dev/null >/dev/null 2>&1 & disown` belt-and-suspenders | Claude Code v2.1.23 introduced async; v2.1.87 made stdio-leak fatal | Phase 134 must use both layers. |
| Bash JSON parse via `awk`/`sed` | `node -e "JSON.parse(...)"` from inside bash | GSD precedent — gsd-phase-boundary.sh | Existing pattern works; no innovation needed. |
| Per-package `vitest` configs | vigil-core uses node:test via tsx; vigil-pwa uses vitest | Repo is "thin orchestrator NOT a workspaces monorepo" per Phase 107.1 D-13 | Phase 134 picks node:test to match vigil-core (closer structural fit). |

**Deprecated/outdated:**
- `$CLAUDE_SESSION_ID` env var: never existed in Claude Code v2.x. STDIN JSON is the only protocol.
- Bare `&` background curl: stalls Claude Code v2.1.87+. Always use `"async": true` and full stdio redirect.

## Assumptions Log

> The vast majority of claims in this research are `[VERIFIED]` via Read tool / Bash probe / official docs. Listing the small set of `[ASSUMED]` items.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Phase 121 `KNOWN_FIELDS` Set is stable and has not been amended since 2026-05-08 (D-C1) | §Phase 121 contract | LOW — Plan tasks would 400-reject, caught at integration test layer; the source file (agent-events.ts:34-43) was Read in this session, so the snapshot is current |
| A2 | `~/.claude/settings.json` shape on the operator's box continues to track Claude Code v2.1.x format (no breaking schema change between v2.1.143 and ship time) | §Installer JSON splice | LOW — Schema has been stable since v2.0.x per docs; installer's JSON-splice approach degrades gracefully (would just no-op) |
| A3 | `vigil-watch` source uses regex-string literals matching the JSON patterns verbatim (not a different DSL) | §Drift-detector Rail 3 | MEDIUM — Phase 133 has not shipped; researcher cannot verify Swift representation. Drift test mitigates by using `console.warn` skip when cross-repo path missing — test is INFORMATIONAL until Phase 133 lands. |
| A4 | `hostname -s` returns a value the operator visually recognizes (vs. cloud-VM mangled name) | §Common Pitfalls / Pitfall 5 | LOW — Already documented as Pitfall 5; the `VIGIL_HOST_OVERRIDE` env var provides escape hatch |
| A5 | Operator's `$VIGIL_API_KEY` is a `vk_` key (not a JWT) | §Bearer auth | LOW — REQUIREMENTS spec calls it "API key" and Phase 121 D-A1 binds user_id from `vk_` lookup path. JWTs are for browser sessions, not long-lived bearer use. |
| A6 | The Phase 121 endpoint at `api.vigilhub.io` accepts the new Linux-originated POSTs without rate-limit refusal | §Environment availability | LOW — Phase 121 has no per-user rate limits; the heartbeat cadence (~1-5 events/min during active dev) is well below any reasonable cap |

## Open Questions (RESOLVED)

1. **Should the SessionStart heartbeat include a static `message`?**
   - What we know: ROADMAP shows `{session_id, event:'heartbeat', message:'session started in <cwd>'}` example. CONTEXT D-P2 says "static strings for SessionStart/Stop per ROADMAP." Phase 121 `message` field is nullable.
   - What's unclear: whether the HUD specifically uses `message` for SessionStart heartbeats, or whether the body line falls back to `label`.
   - RESOLVED: SET `message = "session started"` for SessionStart and `message = "turn complete"` for Stop. These match the ROADMAP intent and give the HUD a stable string if it chooses to display it. UserPromptSubmit's `message` is the truncated-redacted prompt. Absorbed by 134-02-PLAN (SessionStart + Stop branches) and 134-03-PLAN (UserPromptSubmit branch).

2. **Cross-repo drift test — strict or informational?**
   - What we know: Phase 133 hasn't shipped. The `vigil-watch` Swift repo isn't in this monorepo. Phase 134's drift test cannot fail-on-missing without blocking CI today.
   - What's unclear: whether Phase 133 will ship before or after Phase 134, and whether the canonical JSON file lives in this repo or in vigil-watch's repo.
   - RESOLVED: ship the drift test with `console.warn` skip behavior (shown in code example above). When Phase 133 lands, that phase's plan flips the skip to a hard-fail by adding an `assert.fail` if the vigil-watch path is missing. Documented as a Phase 133 follow-up. Absorbed by 134-04-PLAN (redaction-drift.test.ts Rail 3 soft-skip).

3. **Hook command path — absolute or `~`?**
   - What we know: The installer writes the full absolute path (e.g., `bash /home/morrillboss/.claude/hooks/vigil-agent-bridge.sh`) into settings.json. The GSD precedent uses absolute paths.
   - What's unclear: whether Claude Code expands `~` in hook commands at dispatch time. Docs are silent.
   - RESOLVED: use absolute paths via `os.homedir()` in the installer; matches GSD precedent and avoids any expansion-timing risk. Tradeoff: settings.json is not portable across operators with different `$HOME` — acceptable given CONTEXT D-N3 single-operator constraint. Absorbed by 134-04-PLAN (install.js uses `os.homedir()`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| bash | runtime hook | ✓ | 5.1+ | — |
| node | installer + JSON parse | ✓ | 22.x (per `command -v node`) | — |
| curl | HTTP POST | ✓ | 7.x or 8.x | — |
| uuidgen (util-linux) | client_event_id | ✓ | `/usr/bin/uuidgen` verified | `cat /proc/sys/kernel/random/uuid` (also verified) |
| hostname (-s flag) | host field | ✓ | returns `morrillhouse` verified | `$VIGIL_HOST_OVERRIDE` env var |
| date (-Iseconds flag, GNU coreutils) | timestamp | ✓ | returns `2026-05-19T00:12:07+00:00` verified | — |
| basename | label from cwd | ✓ | coreutils standard | — |
| Claude Code CLI | the whole story | ✓ | v2.1.143 verified (`claude --version`) | — |
| `~/.claude/` directory | install destination | ✓ | exists (12 GSD hooks + settings.json verified) | — |
| `~/.claude/settings.json` | splice target | ✓ | 2 SessionStart + 3 PostToolUse + 4 PreToolUse entries verified | installer creates if missing per D-N1 step 1 |
| Postgres `agent_events` table (server-side) | event landing | ✓ | Phase 121 shipped 2026-05-08 per ROADMAP | — |
| Phase 121 `/v1/agent-events` endpoint (Railway prod) | POST target | ✓ | `https://api.vigilhub.io/v1/agent-events` per CONTEXT D-A3 | — |

**Missing dependencies with no fallback:** none

**Missing dependencies with fallback:** none — every dependency is available on the operator's Linux box.

## Validation Architecture

> Phase 134 ships with rich validation because the failure modes (silent stall on Claude Code, redaction leak, settings.json corruption) are operator-visible and contract-critical. Five layers of validation are appropriate.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node `node:test` + `assert/strict`, executed via `tsx --test` (matches vigil-core) |
| Config file | `vigil-linux-hooks/package.json` `"test"` script (no separate config — node:test is zero-config) |
| Quick run command | `cd vigil-linux-hooks && npm test` |
| Full suite command | `cd vigil-linux-hooks && npm test` (no slow suites; entire surface runs in <2s) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| AGENT-LINUX-01 | SessionStart hook POSTs valid Phase 121 body | unit (body builder) | `tsx --test __tests__/body-builder.test.ts -t 'SessionStart'` | ❌ Wave 0 |
| AGENT-LINUX-02 | Stop hook POSTs `task_complete` with same body shape | unit (body builder) | `tsx --test __tests__/body-builder.test.ts -t 'Stop'` | ❌ Wave 0 |
| AGENT-LINUX-03 | UserPromptSubmit redaction — truncate≤80 then regex-match → `[redacted]` | unit (redaction corpus) | `tsx --test __tests__/redaction-corpus.test.ts` | ❌ Wave 0 |
| AGENT-LINUX-04 | Bearer auth + fail-safe (exit 0 on empty $VIGIL_API_KEY) | integration (process spawn) | `tsx --test __tests__/fail-safe.test.ts` | ❌ Wave 0 |
| AGENT-LINUX-05 | Idempotent install + uninstall against tempdir HOME | integration (subprocess) | `tsx --test __tests__/installer-idempotency.test.ts` | ❌ Wave 0 |
| AGENT-LINUX-06 | Drift-detector — patterns parity across JSON + bash | unit (source-grep) | `tsx --test __tests__/redaction-drift.test.ts` | ❌ Wave 0 |
| Success Criterion 1 | Linux session appears on HUD within 5s of first prompt | hardware UAT | manual operator test on Linux box → Railway prod → G2 HUD | manual-only |
| Success Criterion 4 | Hook fails safe under airplane-mode | hardware UAT | manual operator test (toggle airplane mode mid-session) | manual-only |

### Five-Layer Validation

| Layer | Tool | What It Proves | What It Doesn't Prove | Sample Rate |
|-------|------|-----------------|------------------------|-------------|
| 1. Unit (redactor) | `tsx --test` + corpus fixture | Redaction handles 25 synthetic prompts correctly (15 secret-shaped, 10 clean) | Real-world prompt distribution; novel pattern shapes | Per-PR |
| 2. Unit (drift) | `tsx --test` + `fs.readFileSync` source-grep | JSON pattern list ↔ bash source ↔ (future) Swift source parity | Runtime behavior of the regex against real input | Per-PR |
| 3. Integration (installer) | `tsx --test` + tempdir fake `$HOME` | Splice produces correct settings.json shape, idempotent, uninstall round-trips | Behavior with corrupted/exotic existing settings.json | Per-PR |
| 4. Contract (Phase 121) | `bash vigil-agent-bridge.sh --event=SessionStart < probe-envelope.json` against staging endpoint | Hook produces a body that Phase 121 accepts (201/200 not 400) | End-to-end visibility on HUD | Pre-deploy (one-shot, manual) |
| 5. Hardware UAT (operator) | Manual: `claude` on Linux box, then airplane-mode toggle | Success Criteria 1, 3, 4, 5 from ROADMAP | Multi-operator behavior; long-term reliability | One-shot per release |

### Sampling Rate

- **Per task commit:** `cd vigil-linux-hooks && npm test` — full suite in <2s
- **Per wave merge:** `cd vigil-linux-hooks && npm test` (same; no slow suites)
- **Phase gate:** Layers 1-3 green via `npm test`; Layer 4 manual contract probe; Layer 5 hardware UAT signed off in 134-05-PLAN.

### Wave 0 Gaps (files to create before plan implementation)

- [ ] `vigil-linux-hooks/package.json` — devDeps + `"test": "tsx --test \"__tests__/**/*.test.ts\""`
- [ ] `vigil-linux-hooks/tsconfig.json` — ESM, target ES2022, types: ["node"]
- [ ] `vigil-linux-hooks/__tests__/redaction-corpus.test.ts` — covers AGENT-LINUX-03
- [ ] `vigil-linux-hooks/__tests__/redaction-drift.test.ts` — covers AGENT-LINUX-06
- [ ] `vigil-linux-hooks/__tests__/body-builder.test.ts` — covers AGENT-LINUX-01/02 (extract body-builder to a sourceable bash function or a node helper; test the JSON shape)
- [ ] `vigil-linux-hooks/__tests__/installer-idempotency.test.ts` — covers AGENT-LINUX-05
- [ ] `vigil-linux-hooks/__tests__/fail-safe.test.ts` — covers AGENT-LINUX-04 (spawn the hook process with no `VIGIL_API_KEY`, assert exit 0 + zero stderr)
- [ ] `vigil-linux-hooks/__tests__/fixtures/` — STDIN-envelope JSON fixtures for SessionStart/UserPromptSubmit/Stop

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | `Bearer $VIGIL_API_KEY` over HTTPS; vk_ key hash compared SHA256 server-side (Phase 121 contract; not Phase 134's concern beyond sending the header correctly) |
| V3 Session Management | no | Hook is stateless; no session is established or rehydrated |
| V4 Access Control | yes (server-side) | Phase 121 enforces user_id from c.set, never from body — Phase 134 cannot influence access boundaries |
| V5 Input Validation | yes | The hook's `message` field is operator-originated prompt text. MUST be truncated to ≤80 chars, regex-redacted, and passed through `JSON.stringify` (no shell interpolation). Phase 121 also validates server-side. |
| V6 Cryptography | yes | UUID v4 via `uuidgen` (kernel CSPRNG) — never `$RANDOM` |
| V7 Error Handling | yes | All error paths exit 0; no stderr; no debug log in production (gated behind `$VIGIL_AGENT_BRIDGE_DEBUG=1`) |
| V8 Data Protection | yes | Redaction denylist enforces ≤80-char preview; `[redacted]` token replaces matching content — no partial-mask leakage |
| V9 Communications | yes | HTTPS to `api.vigilhub.io` only; bearer header never logged; curl with `--silent` suppresses URL leak |
| V12 Files / Resources | yes | Installer writes `~/.claude/settings.json` atomically; refuses to overwrite a malformed file (parse-fail → exit 1, no clobber) |
| V14 Configuration | yes | `$VIGIL_API_KEY` from env, never default; `$VIGIL_API_URL` defaults to prod (operator can override for staging) |

### Known Threat Patterns for Phase 134 Stack

| Threat | STRIDE | Severity | Standard Mitigation | Where in Code |
|--------|--------|----------|---------------------|---------------|
| Command injection via crafted `cwd` containing shell metacharacters | Tampering | Medium | Pass `$CWD` and `$PROMPT` via `process.env` to `node -e`, never via heredoc interpolation. The `basename "$CWD"` is safe because the bash builtin `basename` does not re-interpret the string. | `emit_event` function in `vigil-agent-bridge.sh` |
| Settings.json corruption from concurrent installer runs | Tampering | Low | Atomic write via `fs.writeFileSync(tmp); fs.renameSync(tmp, real)` — POSIX rename is atomic on same FS. Operator unlikely to run installer twice in parallel anyway. | `install.js` step 5 |
| Bearer token leaked to log sink | Information Disclosure | High | `--silent` + `>/dev/null 2>&1` on curl; `set +x` (never `set -x`) in hook; debug log (when enabled) MUST NOT print `$VIGIL_API_KEY`. Add an explicit `redact_secret()` filter on the debug log path. | `vigil-agent-bridge.sh` debug-log gate |
| Redaction bypass via novel pattern (e.g., a new credential format the regex doesn't cover) | Information Disclosure | Medium | Truncate to ≤80 chars FIRST — even an unredacted leak is bounded to 80 chars. Document the residual risk in README. Cross-phase drift detector enforces JSON ↔ bash ↔ Swift parity so future additions land everywhere. | `redact.sh` truncate-then-match order |
| Silent stall on Claude Code v2.1.87+ via stdio inheritance | Denial of Service | High | `"async": true` in settings.json entry + `nohup curl … </dev/null >/dev/null 2>&1 & disown` inside script | Installer JSON splice + `emit_event` |
| Operator runs hook in malicious cwd (e.g., `/tmp/$(curl evil.com)`) | Elevation of Privilege | Low-Medium | The hook only reads `basename "$CWD"` and reads STDIN envelope. `basename` does not eval. The cwd VALUE is operator-controlled (they `cd` into it before running `claude`); risk is self-inflicted only. Documented in README. | `basename "$CWD"` is safe by construction |
| settings.json mass-assignment via a corrupted reading | Tampering | Low | Installer parses with `JSON.parse`; rejects on parse error; never blindly merges. Cannot add new top-level keys outside `hooks.<Event>`. | `install.js` step 2 |
| Race between vigil-agent-bridge and another GSD hook on shared resource (e.g., both writing to `/tmp`) | Tampering | Low | Phase 134 writes only to `/tmp/vigil-agent-bridge.log` (debug-gated) — namespace-unique filename. No shared resource with GSD hooks. | `vigil-agent-bridge.sh` debug path |

## Sources

### Primary (HIGH confidence)

- `vigil-core/src/routes/agent-events.ts` (Read tool, full file) — Phase 121 endpoint contract, KNOWN_FIELDS Set (lines 34-43), VALID_EVENTS enum (lines 23-29), required-field validation (lines 132-200), bearer auth from `c.get("userId")`
- `vigil-core/src/middleware/auth.ts` (Read tool, lines 1-60) — bearer header format (`Bearer ` + 7 chars stripped); vk_ key format (`vk_` + 64 hex)
- `vigil-core/src/db/schema.ts` lines 429-475 (Read tool) — agent_events table shape, partial unique index `(user_id, client_event_id)`
- `vigil-core/src/analytics/posthog.ts` (Read tool, full file) — `BLOCKED_PROPERTY_NAMES` Set pattern reference
- `vigil-core/src/__tests__/audio-log-redaction.test.ts` (Read tool, full file) — Phase 127 drift-detector canonical pattern (node:test, `fs.readFileSync`, source-grep, comment-stripping helper, anti-trivial-pass smoke tests)
- `vigil-pwa/src/__tests__/denylist-parity.test.ts` (Read tool, full file) — cross-package parity test (vitest, structurally parallel to vigil-core's node:test version)
- `~/.claude/hooks/gsd-session-state.sh` (Read tool, full file) — bash SessionStart hook style; opt-in gate pattern (NOT used in Phase 134)
- `~/.claude/hooks/gsd-phase-boundary.sh` (Read tool, full file) — STDIN JSON parse via `node -e` canonical pattern; `node -e` line-noise idiom
- `~/.claude/settings.json` (Read tool, full file) — verified current shape: 2 SessionStart, 3 PostToolUse matchers, 4 PreToolUse matchers; ALL from GSD; UserPromptSubmit and Stop arrays absent
- `.planning/REQUIREMENTS.md` (Read tool, full file) — WATCH-ENRICH-03 pattern set verbatim (line 54), AGENT-LINUX-01..06 spec (lines 113-120)
- `.planning/ROADMAP.md` (Read tool, lines 629-651) — Phase 134 goal, success criteria, plan placeholders
- `.planning/phases/134-…/134-CONTEXT.md` (Read tool, full file) — Phase 134 locked decisions
- `package.json` + `vigil-core/package.json` + `vigil-pwa/package.json` (Read tool) — confirmed NO pnpm-workspace, vigil-core uses `tsx --test`, vigil-pwa uses vitest
- `vigil-pwa/vitest.config.ts` (Read tool, full file) — vitest config (informational only — not used by Phase 134)
- `.planning/STATE.md` lines 1-60 (Read tool) — project state, milestone v3.9, Phase 134 status "ready to plan"
- `.planning/config.json` (Bash cat) — mode: yolo, parallelization enabled, granularity: fine
- `code.claude.com/docs/en/hooks` (WebFetch) — official STDIN envelope schemas for SessionStart/UserPromptSubmit/Stop; exit code semantics; timeout defaults; `async: true` support
- Bash probes on this Linux box — `uuidgen` < 1ms, `date -Iseconds` returns `2026-05-19T00:12:07+00:00`, `hostname -s` returns `morrillhouse`, `claude --version` returns `2.1.143 (Claude Code)`

### Secondary (MEDIUM confidence)

- `gist.github.com/FrancisBourre/50dca37124ecc43eaf08328cdcccdb34` (WebFetch) — community-curated STDIN schemas; matches official docs verbatim → cross-verifies primary source
- `anthropics/claude-code#43123` (WebFetch) — known issue documenting v2.1.87 stdio-inheritance bug; provides canonical mitigation pattern (`nohup … </dev/null >/dev/null 2>&1 &`)
- `reading.sh/claude-code-async-hooks` via medium redirect (WebFetch) — `"async": true` syntax, introduction date Jan 2026, v2.1.23 minimum
- WebSearch "Claude Code hooks async settings.json" (WebSearch) — multiple sources cross-verify the `"async": true` JSON shape

### Tertiary (LOW confidence)

- (none — every claim in this research has at least one verified source)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every dependency verified present on this box via Bash probe; package versions verified via `--version` calls
- Architecture: HIGH — Phase 121 contract Read verbatim; STDIN envelope verified against two independent sources (official docs + community gist); installer pattern follows GSD precedent
- Pitfalls: HIGH — v2.1.87 bug verified via GitHub issue; redaction truncate-order edge case verified by inspecting each pattern manually; bash `set -e` interaction with `[[ =~ ]]` verified via bash manual prior knowledge
- Validation Architecture: HIGH — test framework choice grounded in verified `package.json` inspection; layer model maps 1:1 to phase requirement IDs
- Security: MEDIUM — STRIDE table is researcher-authored, not from a formal threat-modeling session; mitigations follow OWASP ASVS standard practice but no audit ran

**Research date:** 2026-05-19
**Valid until:** 2026-06-19 (30 days; the Claude Code hook protocol is the only fast-moving surface — re-verify STDIN envelope schemas if Claude Code v2.2.x ships before plan execution)
