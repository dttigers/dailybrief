# Phase 134: Linux Claude Code → vigil-core agent-events bridge — Pattern Map

**Mapped:** 2026-05-19
**Files analyzed:** 13 new (zero modified — pure greenfield client-side phase)
**Analogs found:** 13 / 13 (all files have a strong codebase analog)

---

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `vigil-linux-hooks/vigil-agent-bridge.sh` | runtime hook (bash) | event-driven → request-response | `~/.claude/hooks/gsd-session-state.sh` + `~/.claude/hooks/gsd-phase-boundary.sh` | exact (style + STDIN parse) |
| `vigil-linux-hooks/redact.sh` | sourceable bash function | transform (truncate + regex) | `vigil-core/src/analytics/posthog.ts:38-55` (denylist Set) + bash `[[ =~ ]]` idiom | role-match (denylist mechanics; bash idiom is canonical) |
| `vigil-linux-hooks/redaction-patterns.json` | canonical config data | static config | `vigil-core/src/db/migrations/0018_*.sql` (canonical source-of-truth file pattern) | role-match (pattern source file) |
| `vigil-linux-hooks/install.js` | installer (node ESM CLI) | file I/O (JSON read → mutate → atomic rename) | `~/.claude/hooks/gsd-check-update.js` (node-from-bash + `fs`/`path`/`os` stdlib) | role-match (node CLI from `~/.claude/hooks/`); algorithm itself is canonical to this research |
| `vigil-linux-hooks/install.sh` | 3-line bash wrapper | exec passthrough | `~/.claude/hooks/gsd-session-state.sh` lines 1-2 (shebang + `set` flags) | role-match (bash idiom) |
| `vigil-linux-hooks/package.json` | mini-package manifest | static config | `vigil-core/package.json` (lines 1-9 — `"type":"module"`, `"test": "tsx --test ..."`, tsx devDep) | exact |
| `vigil-linux-hooks/__tests__/body-builder.test.ts` | unit test (node:test) | request-response (build JSON body, assert shape) | `vigil-core/src/__tests__/audio-log-redaction.test.ts:63-75` (node:test imports + before/ROOT pattern) | exact |
| `vigil-linux-hooks/__tests__/redaction-corpus.test.ts` | unit test (node:test, table-driven) | transform validation | `vigil-core/src/__tests__/audio-log-redaction.test.ts:212-303` (describe/it + per-case asserts) | exact (structural mirror) |
| `vigil-linux-hooks/__tests__/redaction-drift.test.ts` | drift detector (source-grep) | static file read + regex assert | `vigil-core/src/__tests__/audio-log-redaction.test.ts:212-230` (Rail 1 pattern parity) + `vigil-pwa/src/__tests__/denylist-parity.test.ts:30-73` (cross-workspace `readOrThrow`) | exact (Phase 127 GUARD-01 template — directly applicable) |
| `vigil-linux-hooks/__tests__/fail-safe.test.ts` | integration test (subprocess spawn) | process I/O (spawn hook with STDIN, assert exit + stderr) | `vigil-core/src/__tests__/migration-drift.test.ts:37-75` (node:test + `execSync` + env override + assertion on captured output) | role-match (the only `execSync` test in vigil-core; idiom transfers cleanly) |
| `vigil-linux-hooks/__tests__/installer-idempotency.test.ts` | integration test (tempdir + subprocess) | file I/O + process I/O | `vigil-core/src/services/brief-assembly-service.test.ts:1-99` (`mkdtempSync` + `beforeEach`/`afterEach` cleanup) + `migration-drift.test.ts:37-75` (`execSync` env override) | role-match (combination of two existing patterns) |
| `vigil-linux-hooks/__tests__/fixtures/settings.json` | fixture data file | static config | `~/.claude/settings.json` (real on-box shape, captured via Read) | exact (mirror the real shape verbatim) |
| `vigil-linux-hooks/README.md` | operator install doc | documentation | (no existing operator README in repo for hooks; researcher drafts; no analog needed) | none (greenfield) |

---

## Pattern Assignments

### 1. `vigil-linux-hooks/vigil-agent-bridge.sh` (runtime hook, bash)

**Role:** Reads STDIN JSON envelope from Claude Code, dispatches on `--event=<X>` flag, builds Phase 121 body, POSTs fire-and-forget.

**Primary analog:** `~/.claude/hooks/gsd-session-state.sh` (style + node-JSON output) + `~/.claude/hooks/gsd-phase-boundary.sh` (STDIN parse).

**Top-of-file boilerplate** (mirror gsd-session-state.sh:1-3 verbatim, swap version):
```bash
#!/usr/bin/env bash
# vigil-hook-version: 0.1.0
# vigil-agent-bridge.sh — SessionStart/UserPromptSubmit/Stop hook for vigil-core
# Posts one /v1/agent-events event per Claude Code hook invocation. Fire-and-forget.
```
> Note: do NOT add `set -euo pipefail`. Phase 134 Pitfall 6 (RESEARCH §Common Pitfalls) — bash `[[ =~ ]]` returns non-zero on no-match, which `set -e` treats as a fatal error. Use explicit `command || true` chains and exit-code swallowing instead. (gsd-session-state.sh and gsd-phase-boundary.sh notably also do NOT use `set -euo pipefail` despite the version comment style — the GSD hooks instead rely on `if`-gated checks; mirror that.)

**STDIN JSON parse pattern** (mirror gsd-phase-boundary.sh:18-21 — line-for-line):
```bash
# Source: ~/.claude/hooks/gsd-phase-boundary.sh:18-21 [VERIFIED on disk]
INPUT=$(cat)
FILE=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).tool_input?.file_path||'')}catch{}})" 2>/dev/null)
```

**Phase 134 adaptation** (replace `tool_input?.file_path` with the three fields we need; either three calls or a single combined parse with `\x01` delimiter per RESEARCH §Pattern 1):
```bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).session_id||'')}catch{}})" 2>/dev/null)
CWD=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).cwd||'')}catch{}})" 2>/dev/null)
PROMPT=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).prompt||'')}catch{}})" 2>/dev/null)
```

**Body builder + curl POST pattern** (canonical to this research — RESEARCH §Code Examples lines 501-533; pass content via `process.env` to defeat shell-quote injection):
```bash
emit_event() {
  local event="$1"
  local message="${2:-}"
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

**Exit posture** (mirror gsd-session-state.sh:59 + gsd-phase-boundary.sh:47):
```bash
exit 0
```
> Final line of file is unconditional `exit 0` (CONTEXT D-A5).

**Adaptation notes:**
- Swap GSD opt-in gate (gsd-session-state.sh:9-15) for **unconditional execution** — install IS the consent (CONTEXT §"Established Patterns").
- Add `[ -z "${VIGIL_API_KEY:-}" ] && exit 0` near the top — silent no-op when API key unset (CONTEXT D-A1).
- Add `--event=<X>` flag parse near the top: `EVENT_TYPE="${1#--event=}"` (CONTEXT D-N4) → `case` dispatch to per-event handlers.
- Add `[ -n "$PROMPT" ]` guard before redaction (UserPromptSubmit only); SessionStart/Stop use static message strings (RESEARCH Open Question 1 recommendation: `"session started"` and `"turn complete"`).
- All `[[ =~ ]]` regex calls MUST be wrapped in `if … then … fi` to avoid `set -e` interaction (RESEARCH Pitfall 6 — also why we skip `set -e` entirely).
- Source `redact.sh` near top: `source "$(dirname "$0")/redact.sh"`.
- Optional debug log gated on `$VIGIL_AGENT_BRIDGE_DEBUG=1` (CONTEXT D-T2) → `/tmp/vigil-agent-bridge.log`, NEVER stderr.

---

### 2. `vigil-linux-hooks/redact.sh` (sourceable bash function)

**Role:** Truncate prompt to ≤80 chars, then regex-match against denylist patterns from `redaction-patterns.json`. Match → emit literal `[redacted: contains sensitive pattern]`; clean → emit truncated content (CONTEXT D-R2/D-R3).

**Primary analog:** `vigil-core/src/analytics/posthog.ts:38-55` (denylist Set structure — same drift-detector semantics; we mirror the *role*, not the language).

**Pattern-loading idiom** (canonical to this research; mirrors gsd-session-state.sh:11 `node -e` JSON parse):
```bash
# Load canonical denylist from JSON file (single source of truth — drift detector pins parity)
_VIGIL_PATTERNS_FILE="$(dirname "${BASH_SOURCE[0]}")/redaction-patterns.json"
load_patterns() {
  node -e "
    const fs = require('fs');
    try {
      const j = JSON.parse(fs.readFileSync(process.env.PFILE, 'utf8'));
      process.stdout.write((j.patterns || []).join('\\u0001'));
    } catch {}
  " 2>/dev/null
}
```

**Truncate-then-redact function** (canonical; mirrors WATCH-ENRICH-03 spec lock + CONTEXT D-R2):
```bash
redact_prompt() {
  local input="$1"
  local max_len="${VIGIL_MAX_PROMPT_LEN:-80}"
  # Truncate FIRST — bounds regex-scan cost to constant time
  local truncated="${input:0:$max_len}"
  local patterns; patterns="$(PFILE="$_VIGIL_PATTERNS_FILE" load_patterns)"
  local IFS=$'\x01'
  for pat in $patterns; do
    if [[ "$truncated" =~ $pat ]]; then
      printf '%s' "[redacted: contains sensitive pattern]"
      return 0
    fi
  done
  printf '%s' "$truncated"
}
```

**Adaptation notes:**
- The `if [[ … =~ … ]]; then` form is load-bearing — RESEARCH Pitfall 6 (no-match → bash `[[ =~ ]]` returns 1; under `set -e` this kills the script; wrapping in `if` exempts the test).
- ASCII `\x01` (SOH) is the canonical safe delimiter inside the `node -e` → bash IFS handoff (RESEARCH §Pattern 1).
- The `redact.sh` file MUST contain a verbatim source comment string `# patterns loaded from: redaction-patterns.json` — the drift detector greps for this (PATTERN ASSIGNMENT 9 Rail 2).

---

### 3. `vigil-linux-hooks/redaction-patterns.json` (canonical denylist source)

**Role:** Single source of truth for the WATCH-ENRICH-03 pattern set. Read by `redact.sh` at runtime AND by the drift detector at test time AND (eventually) by Phase 133 vigil-watch's Swift parser.

**Primary analog:** There is no perfect file-level analog; the role is comparable to `vigil-core/src/analytics/posthog.ts`'s `BLOCKED_PROPERTY_NAMES` Set (a canonical denylist with cross-workspace parity).

**Canonical content** (verbatim per CONTEXT D-R1, with the JWT-threshold lowering from RESEARCH Pitfall 4):
```json
{
  "patterns": [
    "api[_-]?key",
    "bearer",
    "password",
    "vk_",
    "ey[A-Za-z0-9_-]{10,}",
    "[A-Za-z0-9+/]{40,}={0,2}"
  ],
  "max_length": 80
}
```

**Adaptation notes:**
- The JWT threshold is lowered from CONTEXT D-R1's `{20,}` to `{10,}` per RESEARCH Pitfall 4 (truncation-then-redact partial-leak mitigation). Researcher's note is authoritative; planner MUST use `{10,}`.
- The drift detector (PATTERN ASSIGNMENT 9) asserts each of these six patterns appears verbatim — additions must land in three places simultaneously: this JSON, `vigil-agent-bridge.sh` (or the comment string referencing this JSON), and the test's `required` array.

---

### 4. `vigil-linux-hooks/install.js` (installer, node ESM)

**Role:** Idempotent JSON-splice of three hook entries into `~/.claude/settings.json`. Atomic write via tmpfile + rename. Supports `--uninstall` flag.

**Primary analog:** `~/.claude/hooks/gsd-check-update.js` (node-from-`~/.claude/hooks/` precedent; uses `fs`/`path`/`os` stdlib + CommonJS — but Phase 134's installer is ESM per CONTEXT D-L1 and the new package.json `"type":"module"`).

**Imports + path resolution boilerplate** (canonical; mirrors gsd-check-update.js:6-12 in CommonJS form, converted to ESM):
```javascript
// gsd-check-update.js:6-12 — CommonJS form [VERIFIED on disk]
//   const fs = require('fs');
//   const path = require('path');
//   const os = require('os');
//   const homeDir = os.homedir();
//
// Phase 134 install.js — ESM form (CONTEXT D-L1, package.json "type":"module"):
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
const hookDir = path.join(os.homedir(), ".claude", "hooks");
const hookPath = path.join(hookDir, "vigil-agent-bridge.sh");
```

**JSON splice + atomic write algorithm** (canonical to this research — RESEARCH §Pattern 5 lines 357-407 — lift verbatim):
```javascript
// 1. Parse (or initialize if missing — CONTEXT D-N1 step 1)
let settings;
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
} catch (err) {
  if (err.code === "ENOENT") {
    settings = { hooks: {} };
  } else {
    process.stderr.write(`settings.json parse failed: ${err.message}\n`);
    process.exit(1); // refuse to clobber
  }
}
settings.hooks ??= {};

// 2. Splice per event type — idempotent
const EVENTS = ["SessionStart", "UserPromptSubmit", "Stop"];
const COMMAND_REGEX = /vigil-agent-bridge\.sh.*--event=/;
for (const event of EVENTS) {
  settings.hooks[event] ??= [];
  const alreadyInstalled = settings.hooks[event].some((group) =>
    (group.hooks ?? []).some(
      (h) =>
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

// 3. Atomic write — tmpfile + rename (RESEARCH §Pitfall 2)
const tmp = settingsPath + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
fs.renameSync(tmp, settingsPath);
```

**Uninstall inverse** (canonical; CONTEXT D-N2):
```javascript
// Filter each hooks.<Event> array to drop entries whose hooks[] contains a
// command matching the regex. Preserve everything else byte-for-byte.
for (const event of EVENTS) {
  if (!settings.hooks[event]) continue;
  settings.hooks[event] = settings.hooks[event].filter((group) =>
    !(group.hooks ?? []).some(
      (h) => typeof h.command === "string" && COMMAND_REGEX.test(h.command)
    )
  );
  // Do NOT delete the hooks.<Event> key even if the array becomes empty —
  // leaves room for GSD or other tools (RESEARCH §Pattern 5 final note).
}
```

**Adaptation notes:**
- Use ESM (`import` syntax) — CONTEXT D-L1 says installer is node, and the package.json (PATTERN ASSIGNMENT 6) declares `"type":"module"`. The gsd-check-update.js precedent uses CommonJS only because it ships under `~/.claude/hooks/` where there is no package.json context.
- Add `process.argv.includes("--uninstall")` branch BEFORE the splice loop.
- After splice (install path only): copy `vigil-agent-bridge.sh`, `redact.sh`, `redaction-patterns.json` into `hookDir` via `fs.copyFileSync` + `fs.chmodSync(*.sh, 0o755)`.
- On uninstall: `fs.unlinkSync` the three copied files (use `try/catch` — file-may-be-missing is fine).
- Print exactly ONE line to stdout on success: `vigil-agent-bridge installed (3 hook entries). Set VIGIL_API_KEY to enable.` (CONTEXT D-N1 step 6) or `vigil-agent-bridge uninstalled.` (CONTEXT D-N2).
- NO stderr noise on the happy path. Parse-failure is the only legitimate stderr emit (CONTEXT D-N1 step 2).

---

### 5. `vigil-linux-hooks/install.sh` (3-line wrapper)

**Role:** Bash wrapper that `exec`s `install.js`. Lets operators run `bash install.sh` as REQUIREMENTS specifies.

**Primary analog:** Shebang + `set` flags from gsd-session-state.sh:1-3 (style only; the body is unique to this 3-line wrapper).

**Canonical content** (CONTEXT D-N5 — verbatim):
```bash
#!/usr/bin/env bash
set -euo pipefail
exec /usr/bin/node "$(dirname "$0")/install.js" "$@"
```

**Adaptation notes:**
- `set -euo pipefail` IS appropriate here because there's no `[[ =~ ]]` regex (Pitfall 6 only bites the runtime hook).
- Forward all CLI args via `"$@"` so `bash install.sh --uninstall` works.
- The `/usr/bin/node` path matches gsd-check-update.js's `#!/usr/bin/env node` convention (researcher locked `/usr/bin/node` rather than `node` to dodge PATH-shadowing on multi-runtime boxes — the GSD precedent works either way; pick `/usr/bin/node` per CONTEXT D-N5 verbatim).

---

### 6. `vigil-linux-hooks/package.json` (mini-package manifest)

**Role:** Self-contained Node ESM mini-package; devDeps for `tsx --test` execution.

**Primary analog:** `vigil-core/package.json:1-9, 42-51` (`"type":"module"`, `"test": "tsx --test \"src/**/*.test.ts\""`, tsx + typescript + @types/node devDeps).

**Top-of-file boilerplate** (mirror vigil-core/package.json:1-9 verbatim, adjust name + test glob):
```json
{
  "name": "vigil-linux-hooks",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "tsx --test \"__tests__/**/*.test.ts\""
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

**Adaptation notes:**
- The test glob is `"__tests__/**/*.test.ts"` (not `"src/**/*.test.ts"` like vigil-core) because the mini-package has no `src/` — tests live directly under `__tests__/`.
- `"private": true` because this is never published to npm.
- ZERO runtime dependencies. The installer uses only `node:fs`, `node:path`, `node:os`.
- versions taken verbatim from vigil-core/package.json (RESEARCH §Standard Stack: `tsx ^4.19.0`, `typescript ^5.7.0`, `@types/node ^22.0.0` — all already in the monorepo's existing devDeps).

---

### 7. `vigil-linux-hooks/__tests__/body-builder.test.ts` (unit test, node:test)

**Role:** Cover AGENT-LINUX-01/02. Extract the body-builder logic to a sourceable bash function (or a node helper), invoke it with known inputs, assert the resulting JSON shape matches Phase 121 KNOWN_FIELDS exactly.

**Primary analog:** `vigil-core/src/__tests__/audio-log-redaction.test.ts:63-75` (node:test imports + `before` block computing `ROOT`).

**Top-of-file boilerplate** (mirror audio-log-redaction.test.ts:63-75 — line-for-line):
```typescript
// Mirror of: vigil-core/src/__tests__/audio-log-redaction.test.ts:63-75
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

let ROOT = "";
before(() => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  // __tests__/body-builder.test.ts → vigil-linux-hooks/ is one level up
  ROOT = path.join(here, "..");
});
```

**Test structure** (mirror audio-log-redaction.test.ts:212-230 — Rail 1 pattern):
```typescript
describe("AGENT-LINUX-01/02 — body-builder produces Phase 121 KNOWN_FIELDS shape", () => {
  it("SessionStart heartbeat: required 6 fields + optional message present, no unknown fields", () => {
    // Invoke the body builder (either spawn `bash -c "source vigil-agent-bridge.sh; emit_event ..."`
    // OR refactor emit_event's JSON build to a small node helper that bash and the test both call).
    // Assert the JSON has exactly: session_id, event, timestamp, label, host, client_event_id, message.
    const body = JSON.parse(/* ... captured output ... */);
    const knownFields = new Set([
      "session_id", "event", "message", "timestamp",
      "label", "host", "exit_code", "client_event_id",
    ]);
    // Required:
    assert.equal(typeof body.session_id, "string");
    assert.equal(body.event, "heartbeat");
    assert.match(body.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.equal(typeof body.label, "string");
    assert.equal(typeof body.host, "string");
    assert.match(body.client_event_id, /^[0-9a-f-]{36}$/);
    // No unknown fields:
    for (const k of Object.keys(body)) {
      assert.ok(knownFields.has(k), `unknown field "${k}" would 400-reject server-side`);
    }
  });
  // Repeat for UserPromptSubmit (event: "heartbeat", message: redacted-truncated)
  // Repeat for Stop (event: "task_complete", message: "turn complete")
});
```

**Adaptation notes:**
- Phase 121 KNOWN_FIELDS reference: `vigil-core/src/routes/agent-events.ts:34-43` (8 keys; Phase 134 sends 7 — never `exit_code`).
- VALID_EVENTS reference: `vigil-core/src/routes/agent-events.ts:23-29` (5 events; Phase 134 emits only `heartbeat` + `task_complete`).
- Choose ONE of two test strategies per planner discretion:
  1. **Bash spawn:** `execSync('bash -c "set -a; source vigil-agent-bridge.sh; emit_event ..."', ...)` and capture the body via a debug-flag flush to a tempfile.
  2. **Refactor:** extract the `node -e` body-builder block to a small `body-builder.mjs` helper, call it from both `vigil-agent-bridge.sh` AND directly from the test. Cleaner; preferred.

---

### 8. `vigil-linux-hooks/__tests__/redaction-corpus.test.ts` (unit test, table-driven)

**Role:** Cover AGENT-LINUX-03 (Success Criterion 4 unit-test). ~15 synthetic prompts that DO match denylist patterns + ~10 clean prompts. Invoke `bash redact.sh`, assert redacted → `[redacted: …]`, clean → truncated content.

**Primary analog:** `vigil-core/src/__tests__/audio-log-redaction.test.ts:212-303` (describe/it + table of cases).

**Top-of-file boilerplate** (same as PATTERN ASSIGNMENT 7 — mirror audio-log-redaction.test.ts:63-75 imports + `before` block).

**Test corpus structure** (canonical to this research — table-driven, lift the cases verbatim from CONTEXT D-R5):
```typescript
describe("AGENT-LINUX-03 — redaction corpus (truncate≤80 then regex)", () => {
  const CASES_REDACT: Array<[string, string]> = [
    ["my API_KEY is sk-abc123 and more text here", "api[_-]?key match"],
    ["please use my api_key for auth", "api_key snake"],
    ["Bearer eyJhbGciOiJIUzI1NiJ9.abc.def", "bearer + JWT"],
    ["my password is hunter2", "password literal"],
    ["export VIGIL_API_KEY=vk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "vk_ prefix"],
    ["base64 payload: " + "A".repeat(50), "≥40-char base64 blob"],
    // ... etc., 15 secret-shaped fixtures total
  ];
  const CASES_CLEAN: Array<[string, string]> = [
    ["help me refactor this function", "plain dev prompt"],
    ["what's the weather like in Detroit", "plain English"],
    // ... etc., 10 clean fixtures total
  ];

  for (const [prompt, label] of CASES_REDACT) {
    it(`redacts: ${label}`, () => {
      const out = execSync(`bash -c "source ${ROOT}/redact.sh; redact_prompt '$0'" '${prompt.replace(/'/g, "'\\''")}'`).toString();
      assert.equal(out, "[redacted: contains sensitive pattern]");
    });
  }
  for (const [prompt, label] of CASES_CLEAN) {
    it(`passes clean: ${label}`, () => {
      const out = execSync(`bash -c "source ${ROOT}/redact.sh; redact_prompt '$0'" '${prompt.replace(/'/g, "'\\''")}'`).toString();
      assert.notEqual(out, "[redacted: contains sensitive pattern]");
      assert.ok(out.length <= 80, `clean prompt must be truncated to ≤80 chars; got ${out.length}`);
    });
  }
});
```

**Adaptation notes:**
- MUST include the RESEARCH Pitfall 4 edge case: a JWT starting at offset 70 of an 80-char input — verifies the `{10,}` threshold (not `{20,}`) catches truncated JWTs.
- Pass the prompt content via **single-quoted shell arg** with `'\''` escape; do NOT use `printf "%s"` heredoc into shell (RESEARCH §Anti-Patterns: shell-quote injection).
- Add `import { execSync } from "node:child_process";` to the imports.

---

### 9. `vigil-linux-hooks/__tests__/redaction-drift.test.ts` (drift detector, source-grep)

**Role:** Cover AGENT-LINUX-06. Read `redaction-patterns.json` + `vigil-agent-bridge.sh` (or `redact.sh`) source, assert byte-for-byte pattern parity. (Future) cross-repo Rail 3 for vigil-watch Swift source — currently a `console.warn` skip until Phase 133 ships.

**Primary analog:** `vigil-core/src/__tests__/audio-log-redaction.test.ts:212-230` (Rail 1 — Set-membership parity) + `vigil-pwa/src/__tests__/denylist-parity.test.ts:30-73` (`readOrThrow` cross-workspace error message + sorted-keys comparison).

**Top-of-file boilerplate** (same as PATTERN ASSIGNMENT 7).

**Rail 1: redaction-patterns.json contains all six WATCH-ENRICH-03 patterns** (canonical to this research — RESEARCH §Code Examples lines 558-578):
```typescript
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
      "ey[A-Za-z0-9_-]{10,}",        // threshold lowered per Pitfall 4
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
```

**Rail 2: bash hook source references the canonical JSON** (mirror audio-log-redaction.test.ts:280 pattern — source-grep for a literal string):
```typescript
  it("Rail 2: redact.sh references redaction-patterns.json (no hardcoded list)", () => {
    const src = readFileSync(path.join(ROOT, "redact.sh"), "utf8");
    assert.match(
      src,
      /redaction-patterns\.json/,
      "bash redactor must read from canonical JSON source — drift detector pin"
    );
  });
```

**Rail 3: cross-repo vigil-watch parity (deferred, skip-on-missing)** (RESEARCH §Code Examples lines 589-609 — lift verbatim; mirror denylist-parity.test.ts:31-45's `readOrThrow` error-message style but downgrade hard-fail to `console.warn` skip until Phase 133 ships):
```typescript
  it("Rail 3: (cross-repo) vigil-watch source contains same pattern list — SKIP if not yet shipped", () => {
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

**Adaptation notes:**
- Rail 2 of THIS test pins the canonical-source pattern by greping for the string `redaction-patterns.json` in `redact.sh`. The hook file MUST contain that literal substring (use as a comment if not as code reference).
- Rail 3 currently a soft skip; when Phase 133 lands, that phase's plan tightens this to a hard `assert.fail` (mirroring denylist-parity.test.ts:31-45's `readOrThrow` semantics). Document the flip in 134's README operator notes.
- Add anti-trivial-pass smoke test (mirror audio-log-redaction.test.ts:382-417 Pattern: "comment hygiene"): include an `it` block that asserts the test file itself references each pattern verbatim — guards against a future commit that removes a pattern from `required[]`.

---

### 10. `vigil-linux-hooks/__tests__/fail-safe.test.ts` (integration test, subprocess spawn)

**Role:** Cover AGENT-LINUX-04. Spawn `vigil-agent-bridge.sh` with various failure-mode envs (missing API key, unreachable URL, malformed STDIN, parse-fail), assert exit 0 + zero stderr in all paths.

**Primary analog:** `vigil-core/src/__tests__/migration-drift.test.ts:37-75` (the ONLY existing node:test in vigil-core that uses `execSync` with env override and asserts on captured output).

**Top-of-file boilerplate** (mirror migration-drift.test.ts:37-46 verbatim, adjust path):
```typescript
// Mirror of: vigil-core/src/__tests__/migration-drift.test.ts:37-46
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
// __tests__/fail-safe.test.ts → vigil-linux-hooks/ is one level up
const HOOKS_ROOT = join(here, "..");
```

**Per-case structure** (mirror migration-drift.test.ts:47-75 — env override + execSync + assertion on stderr/exit):
```typescript
describe("AGENT-LINUX-04 — fail-safe posture (exit 0 + zero stderr)", () => {
  it(
    "missing VIGIL_API_KEY: exits 0 with zero stderr",
    { timeout: 5_000 },
    () => {
      const env = { ...process.env, VIGIL_API_KEY: "" };
      const result = execSync(
        `printf '{"session_id":"abc","cwd":"/tmp"}' | bash ${HOOKS_ROOT}/vigil-agent-bridge.sh --event=SessionStart 2>&1; echo "exit=$?"`,
        { env, shell: "/bin/bash", encoding: "utf8" }
      );
      assert.match(result, /exit=0/, "hook must exit 0 on missing API key");
      assert.equal(result.replace(/exit=0\n?$/, "").trim(), "", "hook must emit zero stderr/stdout");
    }
  );

  it("unreachable VIGIL_API_URL: exits 0, no hang past 3s", { timeout: 5_000 }, () => {
    // ...
  });

  it("malformed STDIN JSON: exits 0", { timeout: 5_000 }, () => {
    // ...
  });
});
```

**Adaptation notes:**
- Use `{ timeout: 5_000 }` per-test option (mirror migration-drift.test.ts:50 — `{ timeout: 10_000 }`). The hook's intrinsic deadline is `curl --max-time 2`, so 5s is ample headroom.
- The `2>&1; echo "exit=$?"` trick captures stderr + stdout + exit code in one buffer — node:test's `execSync` throws on non-zero exit, so we MUST swallow it inline if we want to assert on it.
- For the "unreachable URL" test, set `VIGIL_API_URL=http://127.0.0.1:1` (port 1 always refuses) — curl exits non-zero in <100ms; the hook still exits 0.
- For the "malformed JSON" test, pipe `printf 'not json'` to the hook — the `node -e` parse silently catches, returns empty string; the hook still exits 0.

---

### 11. `vigil-linux-hooks/__tests__/installer-idempotency.test.ts` (integration test, tempdir + subprocess)

**Role:** Cover AGENT-LINUX-05. Tempdir fake `$HOME`, seed with fixture `settings.json` mirroring real Linux-box shape, run installer, assert correct splice + preservation + idempotency + uninstall round-trip.

**Primary analog:** `vigil-core/src/services/brief-assembly-service.test.ts:1-99` (`mkdtempSync` + `beforeEach`/`afterEach` cleanup pattern) + `vigil-core/src/__tests__/migration-drift.test.ts:37-75` (`execSync` with env override).

**Top-of-file boilerplate** (combine the two analogs — imports from both):
```typescript
// Mirrors: brief-assembly-service.test.ts:1-5 (mkdtempSync pattern)
//        + migration-drift.test.ts:37-46 (execSync + env override pattern)
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import {
  mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const HOOKS_ROOT = join(here, "..");
```

**Fixture seed + installer-run pattern** (canonical to this research — RESEARCH §Code Examples lines 622-672; combine brief-assembly's `mkdtempSync` setup with migration-drift's `execSync` env override):
```typescript
describe("AGENT-LINUX-05 — installer idempotency", () => {
  let fakeHome: string;
  before(() => {
    fakeHome = mkdtempSync(join(tmpdir(), "vigil-install-"));
    mkdirSync(join(fakeHome, ".claude"), { recursive: true });
    // Seed with fixture mirroring real Linux box shape (2 GSD SessionStart entries)
    const fixturePath = join(HOOKS_ROOT, "__tests__", "fixtures", "settings.json");
    copyFileSync(fixturePath, join(fakeHome, ".claude", "settings.json"));
  });

  after(() => {
    try { rmSync(fakeHome, { recursive: true, force: true }); } catch {}
  });

  it("after install: 3 SessionStart entries + originals preserved byte-for-byte", () => {
    execSync(`node ${HOOKS_ROOT}/install.js`, { env: { ...process.env, HOME: fakeHome } });
    const after = JSON.parse(
      readFileSync(join(fakeHome, ".claude", "settings.json"), "utf8")
    );
    assert.equal(after.hooks.SessionStart.length, 3);
    assert.equal(after.hooks.SessionStart[0].hooks[0].command, "node gsd-check-update.js");
    assert.equal(after.hooks.SessionStart[1].hooks[0].command, "bash gsd-session-state.sh");
    assert.match(after.hooks.SessionStart[2].hooks[0].command, /vigil-agent-bridge\.sh --event=SessionStart/);
  });

  it("re-run install: no 4th entry added (idempotent)", () => {
    execSync(`node ${HOOKS_ROOT}/install.js`, { env: { ...process.env, HOME: fakeHome } });
    const after = JSON.parse(
      readFileSync(join(fakeHome, ".claude", "settings.json"), "utf8")
    );
    assert.equal(after.hooks.SessionStart.length, 3);
  });

  it("uninstall: returns to 2-entry seed state", () => {
    execSync(`node ${HOOKS_ROOT}/install.js --uninstall`, { env: { ...process.env, HOME: fakeHome } });
    const after = JSON.parse(
      readFileSync(join(fakeHome, ".claude", "settings.json"), "utf8")
    );
    assert.equal(after.hooks.SessionStart.length, 2);
  });
});
```

**Adaptation notes:**
- Pass `HOME=$fakeHome` via `env` to `execSync` (mirror migration-drift.test.ts:53-58's pattern of injecting fake env vars). The installer's `os.homedir()` reads `$HOME` first.
- Use `before`/`after` lifecycle hooks at the suite level so the fixture seed runs once and the three `it` blocks share state (the sequence install → install → uninstall matters — each step's output is the next step's input). brief-assembly-service.test.ts uses `beforeEach`/`afterEach` for per-test isolation; this test deliberately uses `before`/`after` (suite-scoped) for stateful sequencing.
- Cleanup the tempdir in `after` (mirror brief-assembly-service.test.ts:96-98).
- Reference Phase 121 KNOWN_FIELDS for the asserted SessionStart entry's `command` shape: it MUST match `bash /path/to/vigil-agent-bridge.sh --event=SessionStart` (CONTEXT D-N1 step 3).

---

### 12. `vigil-linux-hooks/__tests__/fixtures/settings.json` (fixture data)

**Role:** Seed file for installer-idempotency.test.ts. Mirrors the real on-box shape (2 GSD SessionStart entries + 3 PostToolUse matchers + 4 PreToolUse matchers).

**Primary analog:** `~/.claude/settings.json` on the operator's Linux box (real shape, verified at research time per CONTEXT §"Local Linux Claude Code environment" and RESEARCH §Runtime State Inventory).

**Canonical content** (mirror RESEARCH §Code Examples lines 631-639 + on-box settings.json shape):
```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node gsd-check-update.js" }] },
      { "hooks": [{ "type": "command", "command": "bash gsd-session-state.sh" }] }
    ],
    "PostToolUse": [
      { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "node gsd-context-monitor.js" }] },
      { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "bash gsd-phase-boundary.sh" }] },
      { "matcher": "Read", "hooks": [{ "type": "command", "command": "node gsd-read-injection-scanner.js" }] }
    ],
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "node gsd-prompt-guard.js" }] },
      { "matcher": "Read", "hooks": [{ "type": "command", "command": "node gsd-read-guard.js" }] },
      { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "node gsd-workflow-guard.js" }] },
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "bash gsd-validate-commit.sh" }] }
    ]
  }
}
```

**Adaptation notes:**
- DO NOT include the operator's absolute paths (`/home/morrillboss/...`) in the fixture — use bare command names. The fixture is a test artifact and must be operator-agnostic.
- DO NOT include UserPromptSubmit or Stop arrays — they are ABSENT on the real box (RESEARCH §Runtime State Inventory). The installer-idempotency test specifically verifies that the installer correctly CREATES these arrays when missing (CONTEXT D-N1 step 3 implicit).
- This fixture is the canonical "before" state; installer-idempotency.test.ts diffs against it.

---

### 13. `vigil-linux-hooks/README.md` (operator install instructions)

**Role:** Operator-facing documentation: install command, env var setup (`VIGIL_API_KEY`, `VIGIL_API_URL`, `VIGIL_AGENT_BRIDGE_DEBUG`, `VIGIL_HOST_OVERRIDE`), troubleshooting, uninstall.

**Primary analog:** None in this repo (no existing operator-facing README for client hooks). Researcher drafts; planner schedules as last task in 134-04-PLAN per CONTEXT §"Claude's Discretion".

**Required content** (canonical to CONTEXT + RESEARCH):
- Install: `cd ~/dev/dailybrief && bash vigil-linux-hooks/install.sh`
- Set env: `export VIGIL_API_KEY=vk_…` in `~/.bashrc` or `~/.config/vigil/env`
- Verify: confirm 3 entries added to `~/.claude/settings.json` (no clobber of GSD entries)
- Optional env vars: `VIGIL_API_URL` (default `https://api.vigilhub.io`), `VIGIL_AGENT_BRIDGE_DEBUG=1` (writes `/tmp/vigil-agent-bridge.log`), `VIGIL_HOST_OVERRIDE` (cloud-VM hostname override — RESEARCH Pitfall 5)
- Troubleshooting: airplane-mode test (Success Criterion 4 — toggle and confirm Claude Code keeps working), debug-log path, vigil-core 400 inspection
- Uninstall: `bash vigil-linux-hooks/install.sh --uninstall`
- Phase 133 cross-repo coordination note: when vigil-watch's `Redactor.swift` lands, the Rail 3 drift detector flips from soft-skip to hard-fail (researcher's note from RESEARCH §Open Question 2)

---

## Shared Patterns

### A. Phase 121 KNOWN_FIELDS strict contract (load-bearing for ALL hook POSTs)

**Source:** `vigil-core/src/routes/agent-events.ts:34-43`
**Apply to:** `vigil-agent-bridge.sh` (body builder), `body-builder.test.ts` (assertion target)

```typescript
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

The server returns HTTP 400 `unknown_field` on ANY top-level key outside this set (agent-events.ts:121-130). Phase 134 sends exactly 7 of these (never `exit_code` — only used for `task_failed`). Adding ANY other key (`cwd`, `linux_distro`, `user_agent`, ...) requires a Phase-121 contract amendment.

### B. Bearer auth header format

**Source:** `vigil-core/src/middleware/auth.ts:38-44`
**Apply to:** `vigil-agent-bridge.sh` (curl header)

```typescript
const authHeader = c.req.header("Authorization");
if (!authHeader || !authHeader.startsWith("Bearer ")) { return 401; }
const token = authHeader.slice(7);   // strips exactly "Bearer " (7 chars)
```

Literal `Bearer ` (capital B, single space) + entire `$VIGIL_API_KEY` value. The `vk_` key format is `vk_` + 64 hex chars — opaque to the client.

### C. STDIN JSON parse via `node -e` (bash idiom)

**Source:** `~/.claude/hooks/gsd-phase-boundary.sh:18-21`
**Apply to:** `vigil-agent-bridge.sh` (every event handler)

```bash
INPUT=$(cat)
FIELD=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).<FIELD_NAME>||'')}catch{}})" 2>/dev/null)
```

Replace `<FIELD_NAME>` with `session_id`, `cwd`, `prompt`, etc. The trailing `2>/dev/null` is mandatory (CONTEXT D-A4). The `catch{}` swallows malformed JSON silently.

### D. Drift-detector source-grep (node:test + readFileSync)

**Source:** `vigil-core/src/__tests__/audio-log-redaction.test.ts:212-303` + `vigil-pwa/src/__tests__/denylist-parity.test.ts:30-73`
**Apply to:** `redaction-drift.test.ts`

Pattern: read source file → extract pattern literals → assert membership → repeat across multiple files (Rails). Include anti-trivial-pass smoke test (the test file itself references each pattern) to guard against a future commit that empties the `required[]` array.

### E. Fire-and-forget async hook (Claude Code v2.1.23+ + v2.1.87+ stdio bug)

**Source:** RESEARCH §Pattern 4 + §Pitfall 1 (`[CITED: code.claude.com/docs/en/hooks]` + `[CITED: anthropics/claude-code#43123]`)
**Apply to:** `install.js` (settings.json splice MUST include `"async": true, "timeout": 5`) + `vigil-agent-bridge.sh` (curl invocation MUST use `nohup … </dev/null >/dev/null 2>&1 & disown`)

Belt-and-suspenders: BOTH the settings.json `"async": true` AND the script's full stdio redirect are required. Missing either causes Claude Code v2.1.87+ to stall (`Session timed out after 649s`).

### F. Atomic file write via tmpfile + rename

**Source:** RESEARCH §Pattern 5 + §Pitfall 2 (canonical POSIX idiom)
**Apply to:** `install.js`

```javascript
const tmp = settingsPath + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
fs.renameSync(tmp, settingsPath);
```

Non-atomic `cat > settings.json` can leave a zero-byte file on crash, bricking Claude Code on next launch. POSIX `rename(2)` is atomic on the same filesystem.

### G. Test-suite top-of-file boilerplate (node:test + ROOT computation)

**Source:** `vigil-core/src/__tests__/audio-log-redaction.test.ts:63-75`
**Apply to:** ALL four `*.test.ts` files

```typescript
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

let ROOT = "";
before(() => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  // __tests__/<file>.test.ts → vigil-linux-hooks/ is one level up
  ROOT = path.join(here, "..");
});
```

Every Phase 134 test computes ROOT this way. Path: `__tests__/<file>.test.ts → ROOT (= vigil-linux-hooks/)` is ONE level up (NOT two — audio-log-redaction.test.ts sits at `src/__tests__/` so it climbs two; Phase 134's tests sit at `__tests__/` directly under the workspace root).

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `vigil-linux-hooks/README.md` | operator-facing install doc | No existing operator-facing README for hooks in this repo. Researcher drafts per CONTEXT §Claude's Discretion. |

(All other 12 files have at least a role-match analog.)

---

## Metadata

**Analog search scope:**
- `~/.claude/hooks/` — 12 GSD hook scripts (bash + node) — found 3 strong analogs
- `vigil-core/src/__tests__/` — 4 test files (all `tsx --test` / node:test) — found 3 strong analogs
- `vigil-pwa/src/__tests__/` — denylist-parity.test.ts (vitest, cross-workspace parity pattern) — found 1 strong analog (the `readOrThrow` error-message style)
- `vigil-core/src/routes/agent-events.ts` — Phase 121 contract (KNOWN_FIELDS Set, VALID_EVENTS enum) — load-bearing reference
- `vigil-core/src/middleware/auth.ts` — bearer auth header format — load-bearing reference
- `vigil-core/src/services/brief-assembly-service.test.ts` — `mkdtempSync` + `beforeEach/afterEach` cleanup — 1 strong analog
- `vigil-core/package.json` — `tsx --test` invocation + devDep versions — exact analog for mini-package package.json

**Files scanned:** ~25 (12 hooks + 4 vigil-core tests + 1 vigil-pwa test + 8 source files referenced for shared patterns)

**Pattern extraction date:** 2026-05-19

**Critical corrections to brief assumptions:**
- The Phase 127 drift-detector template lives at `vigil-core/src/__tests__/audio-log-redaction.test.ts` (the brief's filename is correct, not `redaction-drift.test.ts` — that's the NEW Phase 134 test file).
- Repo is NOT a pnpm workspace; vigil-core uses `tsx --test` (node:test), NOT vitest. The mini-package's `package.json` test script mirrors vigil-core's, not vigil-pwa's.
- JWT pattern threshold in `redaction-patterns.json` is `{10,}` (RESEARCH Pitfall 4 fix), not `{20,}` as in CONTEXT D-R1 — researcher's note is authoritative.
- The runtime hook does NOT use `set -euo pipefail` (Pitfall 6 — `[[ =~ ]]` no-match → exit 1 → fatal under `set -e`); use `if`-gated checks instead. This is a deliberate divergence from gsd-session-state.sh's style.
