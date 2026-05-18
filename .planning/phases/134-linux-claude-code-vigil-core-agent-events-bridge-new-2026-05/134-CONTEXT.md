# Phase 134: Linux Claude Code → vigil-core agent-events bridge (NEW 2026-05-18) - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning
**Mode:** `--auto` (autonomous discuss — user authorized "work without stopping for clarifying questions" for this session; gray areas resolved with recommended defaults grounded in Phase 121 `/v1/agent-events` contract + Phase 122 vigil-watch event-shape + Phase 127 GUARD-01 redaction precedent + STACK conventions + a read of the real `~/.claude/` environment on this Linux box)

<domain>
## Phase Boundary

**Ship Linux-side parity for the macOS `vigil-watch` daemon** so that Claude Code sessions running on a Linux dev workstation surface on the G2 Companion HUD alongside Mac sessions. Phase 134 is **deliberately lightweight** — no daemon, no FSEventStream-equivalent file watcher, no offline queue. Just three small Claude Code hook entry points (`SessionStart`, `UserPromptSubmit`, `Stop`) that POST one event each to the existing `POST /v1/agent-events` (Phase 121) endpoint, fire-and-forget, with a 2 s curl timeout and exit-0-on-anything-failing invariant.

Phase 134 succeeds when:

1. **Linux session visibility on HUD** — A fresh `claude` session on the Linux dev box (cwd `/home/<operator>/dev/dailybrief`) shows up on the G2 Companion HUD within 5 s of the first user prompt; session-count delta `0 → 1` and label derived from `cwd` basename (e.g., `dailybrief: running`).
2. **One-command install** — `bash install.sh` (or `node install.js` — see D-T1) installs the hook idempotently: re-running it does NOT duplicate entries in `~/.claude/settings.json`, and does NOT clobber existing GSD hooks (the Linux box already has `SessionStart`/`PostToolUse`/`PreToolUse` entries from the GSD install).
3. **Fail-safe** — Missing `VIGIL_API_KEY`, network failure, vigil-core 5xx, DNS unreachable, or `~/.claude/settings.json` corruption all result in hook exit 0 with NO stderr/stdout noise. Verified by toggling iPhone airplane mode mid-session and confirming Claude Code continues to function normally (Success Criterion 4 from ROADMAP).
4. **Privacy redaction** — `UserPromptSubmit` POST never carries any string containing the `WATCH-ENRICH-03` denylist patterns (`api[_-]?key`, `bearer`, `password`, `vk_`, JWT prefix `ey…`, ≥40-char base64-like blob). Unit-tested via a corpus of synthetic prompts.
5. **Clean uninstall** — `bash install.sh --uninstall` (or `node install.js --uninstall`) removes the three hook entries from `~/.claude/settings.json` cleanly, leaving all other GSD hooks untouched.
6. **Drift detector pinned** — A CI test in `vigil-core/src/__tests__/` (vitest) reads BOTH the hook script's redaction pattern set AND a canonical pattern source (D-R1 below), asserts byte-for-byte equality, and fails the build if either drifts.

**Not in scope:**
- WATCH-ENRICH-01/02/03/04 vigil-watch enrichments (Phase 133, separate Swift codebase).
- Offline queue / retry / backoff — Phase 134 is fire-and-forget; one curl-with-timeout per event. Network outages drop events silently. This matches the ROADMAP "lightweight approach" framing and the success criterion "MUST NOT block the Claude Code session."
- macOS parity (the Mac side is vigil-watch's job; Phase 134 is Linux-only).
- Reply round-trip / write-back (Phase 133 G2-REPLY).
- Per-tool / `PostToolUse` events — REQUIREMENTS lock the three hook event types (`SessionStart`, `UserPromptSubmit`, `Stop`); adding tool-step events would be Phase-135+ scope.
- Sentry / PostHog telemetry from the hook itself — the hook is silent; vigil-core observability already covers the receive side.
- Multi-operator support — this box is `morrillboss`'s personal Linux dev workstation; the install script reads `$VIGIL_API_KEY` from operator shell env and does NOT support multi-user `~/.claude/`.

</domain>

<decisions>
## Implementation Decisions

### Hook language + source layout

- **D-L1 — Pure bash for the runtime hook + node for the installer.** The runtime hook (`vigil-agent-bridge.sh`) is bash because:
  1. Claude Code hooks are bash-friendly (existing GSD hooks at `~/.claude/hooks/gsd-session-state.sh`, `gsd-phase-boundary.sh`, `gsd-validate-commit.sh` are all bash).
  2. The hook reads STDIN JSON (Claude Code hook protocol — see D-I1 below) — bash can pipe to `node -e` for JSON parse without standing up a long-lived node process. The 5 ms bash startup beats node's ~70 ms cold start for fire-and-forget POSTs.
  3. `curl` is the canonical fail-safe HTTP client on Linux; bash invokes it idiomatically with `--max-time 2 --silent --output /dev/null --fail` and the exit code is trivially swallowed.
  4. Bash regex via `[[ ... =~ ... ]]` handles the WATCH-ENRICH-03 denylist patterns natively.

  The **installer** (`install.js`, node) is the inverse trade-off — it must JSON-parse `~/.claude/settings.json`, splice three hook entries idempotently without clobbering GSD entries, and write atomically. Bash JSON manipulation is hostile; node's `JSON.parse`/`JSON.stringify` round-trip preserves field order well enough and matches the existing `gsd-check-update.js` pattern (`/usr/bin/node` invocation). The installer is interactive-friendly enough to invoke as `bash install.sh` which simply `exec`s `node install.js "$@"` — single entry point, dual implementation.

- **D-L2 — Source-of-truth path in this repo: `vigil-linux-hooks/`** (NEW top-level dir, peer to `vigil-core/`, `vigil-pwa/`, `vigil-g2-plugin/`). Rationale:
  - `tools/` and `scripts/` are too generic — the dir holds installable artifacts.
  - `vigil-watch/linux/` would falsely imply this is a port of the Swift daemon (it isn't — vigil-watch is a 30 MB-RSS file-watching daemon; this is a 50-line hook script with completely different mechanics).
  - The directory will contain: `vigil-agent-bridge.sh` (runtime hook), `install.js` (installer/uninstaller), `install.sh` (bash wrapper that execs node), `redact.sh` (sourceable bash function for the denylist filter — also unit-tested), `__tests__/` (vitest tests for redactor + installer JSON splicing), `README.md` (operator install instructions).
  - CI: the existing `vigil-core/` vitest test runner picks up `vigil-linux-hooks/__tests__/` if added to the project's `vitest.config.ts` `include` glob, OR `vigil-linux-hooks/` gets its own `package.json` + vitest config (researcher picks; preference is to extend the root-level test config to keep CI single-pipeline).

### Hook protocol — STDIN JSON, not env vars

- **D-I1 — Session ID comes from STDIN JSON, not `$CLAUDE_SESSION_ID`.** REQUIREMENTS line for AGENT-LINUX-01 hedges: "`$CLAUDE_SESSION_ID` or equivalent — verify in discuss-phase against actual hook env." Verified: the actual Claude Code hook protocol delivers a JSON envelope on STDIN. Existing GSD hooks (`gsd-phase-boundary.sh` line 23: `FILE=$(echo "$INPUT" | node -e "...JSON.parse(d).tool_input?.file_path...")`) demonstrate the canonical pattern. The session_id field name on the STDIN envelope MUST be verified by the researcher — likely `session_id` (snake_case, since the GSD hook output protocol uses `hookSpecificOutput.hookEventName: "SessionStart"` snake_case payload field names). If session_id is NOT in the STDIN envelope (researcher confirms via Claude Code docs + a one-shot probe hook), fall back to a stable per-session UUID generated in the hook on first invocation and cached in `/tmp/vigil-agent-bridge-session-<pid-of-claude>.id`. The probe takes ~5 minutes — researcher MUST do it before plan authoring.

- **D-I2 — Stop hook fires per assistant turn; that maps 1:1 to AGENT-LINUX-02.** Claude Code's `Stop` hook fires when an assistant turn ends (i.e., once per user prompt → response cycle). The ROADMAP wording "Each finished assistant turn creates one `task_complete` event" matches this exactly. The researcher confirms the hook does NOT fire on session exit (the SessionStart's `heartbeat` and the final Stop's `task_complete` are sufficient bookends; no `SessionEnd` event exists in REQUIREMENTS). If a `SessionEnd` hook exists, do NOT wire it — adding it would create a `task_complete` event that the HUD interprets as a turn-complete signal, which is semantically wrong for session shutdown.

- **D-I3 — UserPromptSubmit hook fires once per submitted prompt, including the very first prompt of a session.** This means the first prompt of a session generates BOTH a SessionStart heartbeat AND a UserPromptSubmit heartbeat. That's fine — the HUD shows latest event, both are `heartbeat`, no duplicate-session-creation risk because both share the same `session_id`. Researcher confirms ordering but the AGENT-LINUX-01/02/03 spec is intentionally redundant on the heartbeat front.

### `/v1/agent-events` payload contract (Phase 121 lockdown — MANDATORY)

Phase 121's `vigil-core/src/routes/agent-events.ts` REQUIRES six fields and STRICTLY rejects unknown ones. ROADMAP's example payload `{session_id, event, message, timestamp}` is INCOMPLETE — the server would 400. The hook MUST send all six required fields:

- **D-P1 — Required body fields:** `session_id` (string, from D-I1), `event` (one of `heartbeat`/`task_complete`/`task_failed`/`milestone`/`needs_input` — Phase 134 only uses the first two), `timestamp` (ISO-8601 string, `date -Iseconds` on Linux), `label` (string, `basename "$cwd"` — e.g., `dailybrief`), `host` (string, `hostname` command output), `client_event_id` (UUID v4 — `uuidgen` on Linux; the hook generates a fresh UUID per event for dedup-on-retry).
- **D-P2 — Optional body fields used:** `message` (≤80 chars for UserPromptSubmit per D-R2; static strings for SessionStart/Stop per ROADMAP). NOT used: `exit_code` (only meaningful for `task_failed`).
- **D-P3 — Strict-mode posture:** Phase 121's `KNOWN_FIELDS` Set rejects unknown top-level keys with HTTP 400. The hook MUST emit ONLY the 7 allowed fields (6 required + `message`). No `cwd` field, no `user_agent` field, no `linux` field — those would be 400-rejected. If a future use case needs more fields, that's a Phase-121 KNOWN_FIELDS extension that must land first.
- **D-P4 — `label` = cwd basename, `host` = `hostname` output.** Match vigil-watch's labeling convention (Phase 122 WATCH-ENRICH-01 will canonicalize this on the Mac side — currently uses `cwd` basename per ROADMAP "vigil-watch payload enrichment" line). For the operator, this produces HUD labels like `dailybrief: running` for the dailybrief repo, `vigil-pwa: running` if they `cd ~/dev/vigil-pwa && claude`, etc. `host` distinguishes Linux sessions from Mac sessions on the HUD — Linux box hostname plus Mac hostname plus iPhone-pair-host are visibly different strings.
- **D-P5 — `cwd` source.** The STDIN envelope likely includes `cwd` (researcher confirms). If not, the hook falls back to `pwd` (which IS the Claude Code session's cwd, per the way Claude Code invokes hooks — they inherit working directory). Test both paths.

### Auth + fail-safe (AGENT-LINUX-04)

- **D-A1 — Bearer auth via `$VIGIL_API_KEY`.** Hook reads `$VIGIL_API_KEY` directly. If empty/unset, hook exits 0 silently (no stderr). Operator sets via `.bashrc`/`.zshrc` or systemd user-env (researcher recommends a single canonical location in the README; preference: `~/.config/vigil/env` sourced from the operator's shell init — single file, gitignored, parallel to existing macOS `~/.vigil/credentials`).
- **D-A2 — curl invocation:** `curl --max-time 2 --silent --show-error --fail --header "Authorization: Bearer $VIGIL_API_KEY" --header "Content-Type: application/json" --data "$BODY" "$VIGIL_API_URL/v1/agent-events" >/dev/null 2>&1 &` then `disown` (fire-and-forget; no `wait`). The trailing `&` is load-bearing — without it, Claude Code's `Stop` hook would wait up to 2 s for the POST round-trip on every assistant turn, adding ~2 s latency to every turn boundary visible to the operator. Disown ensures curl is not killed when the hook exits.
- **D-A3 — `$VIGIL_API_URL` default:** `https://api.vigilhub.io` (production Railway service per Phase 121 deploy notes). Override via env var for local dev. The hook respects `$VIGIL_API_URL` if set, defaults to prod otherwise.
- **D-A4 — Zero log noise.** No `echo` / `printf` / `>&2` anywhere in the hook. Any debug logging gated behind `$VIGIL_AGENT_BRIDGE_DEBUG=1` env var (off by default; when on, logs to `/tmp/vigil-agent-bridge.log` — never stderr, so Claude Code's terminal stays clean).
- **D-A5 — Hook exit code is ALWAYS 0** (using `command || true` chains or `set +e` scope). Even malformed STDIN, missing required field, JSON parse error, curl invocation failure — every error path exits 0. The hook MUST NOT cause Claude Code to fail.

### Privacy redaction (AGENT-LINUX-03 + AGENT-LINUX-06)

- **D-R1 — Canonical denylist source-of-truth: `vigil-linux-hooks/redaction-patterns.json`** (NEW file, Phase 134 owns it). Format: `{"patterns": ["api[_-]?key", "bearer", "password", "vk_", "ey[A-Za-z0-9_-]{20,}", "[A-Za-z0-9+/]{40,}={0,2}"], "max_length": 80}`. The hook's `redact.sh` reads this JSON via `node -e "..."` at hook invocation time (researcher benchmarks the JSON parse cost — if it adds >50 ms to hook latency, hardcode patterns in the bash script and treat redaction-patterns.json as the test-side reference instead). The future Phase 133 WATCH-ENRICH-03 vigil-watch parser (Swift, separate repo) will load the SAME JSON file via `JSONDecoder` — making this file the cross-language canonical source.
- **D-R2 — Truncation order: truncate to ≤80 chars FIRST, then redact.** Rationale: redacting a 4 KB prompt to find one `bearer` substring is expensive; truncating to 80 chars first bounds the regex-scan cost to constant time. The truncation also matches WATCH-ENRICH-03's "≤80 chars" constraint. Researcher confirms whether the redaction-then-truncate ordering can leak a partial pattern that would have matched in full text — likely not for these specific patterns (all six match within ≤40 chars or are substring-anchored), but verify.
- **D-R3 — Empty-redaction posture.** When the truncated prompt matches ANY denylist pattern, the entire `message` field is replaced with the literal string `[redacted: contains sensitive pattern]` rather than masking the specific substring. Rationale: the HUD operator does NOT need to see the prompt content — they need to see "Claude is working on something" — so a binary "redacted vs. visible" signal is fine and avoids partial-leak edge cases. This is a STRICTER posture than vigil-watch's prospective Phase 133 surface, which may opt for substring-masking; if so, drift detector locks the patterns but NOT the post-match behavior.
- **D-R4 — Drift detector test** (`vigil-linux-hooks/__tests__/redaction-drift.test.ts`, vitest): reads `redaction-patterns.json`, reads `vigil-agent-bridge.sh` source, greps for each pattern string literal in the bash source, asserts every pattern appears verbatim. Also reads `vigil-core/src/lib/agent-prompt-redaction.ts` IF Phase 133 has landed (`fs.existsSync` guard — test skips with `console.warn` if Phase 133 hasn't shipped yet); when both exist, byte-for-byte asserts the pattern lists are equal. This satisfies AGENT-LINUX-06.
- **D-R5 — Synthetic redaction corpus** (`vigil-linux-hooks/__tests__/redaction-corpus.test.ts`): a vitest table of ~15 synthetic prompts that DO contain secret-shaped material (e.g., `"my API_KEY is sk-abc123…"`, `"Bearer eyJhbGci…"`, `"export VIGIL_API_KEY=vk_xxx"`, `"base64 payload: aGVsbG8gd29ybGQ…"`) plus ~10 that don't. Test invokes `bash redact.sh` against each, asserts redacted prompts emit `[redacted: …]` and clean prompts pass through truncated. Forms the Success-Criterion-3 unit-test from ROADMAP.

### Installer + uninstaller (AGENT-LINUX-05)

- **D-N1 — `install.js` algorithm:**
  1. Read `~/.claude/settings.json` (create with `{"hooks":{}}` if missing).
  2. Parse JSON. If parse fails, refuse to write (no clobber), print one error line to STDERR, exit 1.
  3. For each of the three event types (`SessionStart`, `UserPromptSubmit`, `Stop`), splice the entry:
     ```json
     { "type": "command", "command": "bash /home/<user>/.claude/hooks/vigil-agent-bridge.sh --event=SessionStart" }
     ```
     into `hooks.<EventName>[0].hooks[]` array. Idempotency check: if an entry with `command` matching the regex `vigil-agent-bridge\.sh.*--event=<EventName>` already exists, SKIP that splice. This means re-running the installer is a no-op.
  4. Copy `vigil-linux-hooks/vigil-agent-bridge.sh`, `redact.sh`, and `redaction-patterns.json` into `~/.claude/hooks/`. `chmod +x` on the `.sh` files.
  5. Atomic write of `settings.json` via `fs.writeFileSync(tmp, …); fs.renameSync(tmp, real)` to avoid corruption mid-write.
  6. Print one-line confirmation: `vigil-agent-bridge installed (3 hook entries). Set VIGIL_API_KEY to enable.`
- **D-N2 — `install.js --uninstall` algorithm:** inverse of D-N1. For each event type, filter `hooks.<EventName>[0].hooks[]` to drop entries matching the `vigil-agent-bridge` command regex. Remove the three copied files from `~/.claude/hooks/`. Print `vigil-agent-bridge uninstalled.`
- **D-N3 — Coexistence with existing GSD hooks** (CRITICAL — the Linux box has 4 SessionStart entries already from GSD): the installer MUST splice INTO the existing `hooks.SessionStart` array, NOT replace it. The current `settings.json` shape on this box:
  ```json
  "SessionStart": [
    { "hooks": [ { "type": "command", "command": "...gsd-check-update.js" } ] },
    { "hooks": [ { "type": "command", "command": "bash ...gsd-session-state.sh" } ] }
  ]
  ```
  Phase 134's splice ADDS a third matcher-group entry with our hook command. Researcher confirms whether Claude Code's hook protocol runs all matcher groups (it does — multiple entries per event fire in array order) — but the installer MUST NOT touch existing entries.
- **D-N4 — Per-event `--event=` flag dispatch** keeps a single hook script servicing all three event types. The hook's first action is `EVENT_TYPE="${1#--event=}"` (or arg parse), then a `case` statement dispatches to `emit_session_start`, `emit_user_prompt_submit`, `emit_stop`. Mirrors vigil-watch's per-event-type code path.
- **D-N5 — `install.sh` is a 3-line wrapper:** `#!/usr/bin/env bash` + `set -euo pipefail` + `exec /usr/bin/node "$(dirname "$0")/install.js" "$@"`. Lets operators run `bash install.sh` as REQUIREMENTS specifies (line 119) while keeping the real logic in node.

### Telemetry posture

- **D-T1 — No client-side telemetry from the hook.** PostHog/Sentry are NOT wired into the hook. Rationale: AGENT-LINUX-04's "log nothing on stdout/stderr that would clutter the operator's terminal" + the fire-and-forget posture together preclude any synchronous instrumentation. vigil-core already logs every successful `POST /v1/agent-events` via existing Phase 121 server-side observability; that's enough to answer "is the Linux hook firing?"
- **D-T2 — Optional debug log** at `/tmp/vigil-agent-bridge.log` gated on `$VIGIL_AGENT_BRIDGE_DEBUG=1` (D-A4) — operator-toggle for diagnosing install issues; never on in production.

### Drift detector + CI integration (AGENT-LINUX-06)

- **D-C1 — vitest at `vigil-linux-hooks/__tests__/`.** Add `vigil-linux-hooks/__tests__/**/*.test.ts` to the root or vigil-core vitest `include` glob (researcher picks; preference: root-level workspace test config so the existing `pnpm test` runs everything in one CI step).
- **D-C2 — Two test files** land in Phase 134:
  1. `redaction-drift.test.ts` (D-R4) — pattern-list parity across hook source + JSON + future vigil-watch source.
  2. `redaction-corpus.test.ts` (D-R5) — behavioral redaction against a synthetic prompt corpus.
- **D-C3 — Installer idempotency test** (`installer-idempotency.test.ts`): boots a tempdir fake `HOME`, writes a fixture `~/.claude/settings.json` matching the real Linux box shape (2 existing SessionStart entries), runs `install.js`, asserts the resulting `settings.json` (a) contains 3 SessionStart entries (2 original + 1 new), (b) preserves the 2 original entries byte-for-byte, (c) re-running `install.js` does NOT add a 4th entry, (d) `install.js --uninstall` returns the file to its 2-entry fixture state.

### Claude's Discretion

- **Hook script style** — line length, comment density, function naming. Researcher/planner follow the convention of `~/.claude/hooks/gsd-session-state.sh` (existing GSD bash hook): `set -euo pipefail` at top, `#!/usr/bin/env bash`, `# gsd-hook-version: X.Y.Z` comment for version pinning (mirror with `# vigil-hook-version: 0.1.0`).
- **UUID generation source** — `uuidgen` is preferred (present on every reasonable Linux distro including Debian/Ubuntu/Fedora; fall back to `cat /proc/sys/kernel/random/uuid` if missing). Researcher locks the fallback.
- **Hostname source** — `hostname -s` (short form, no FQDN) for HUD readability. Operator's machine name probably reads cleaner short than long (`morrillboss-linux` vs `morrillboss-linux.lan.morrill.io`).
- **Timestamp format** — `date -Iseconds` (ISO-8601 RFC 3339) is Phase 121's expected format; researcher verifies the `date` command supports `-Iseconds` on this box (it's GNU coreutils on Ubuntu/Debian — yes, it does).
- **README content** — operator-facing install instructions, env var setup, troubleshooting. Researcher writes it; planner schedules it as the last task in 134-04-PLAN.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 121 — `/v1/agent-events` endpoint contract (LOAD-BEARING)
- `vigil-core/src/routes/agent-events.ts` — Strict-mode KNOWN_FIELDS Set (line 34), VALID_EVENTS enum (line 23), required-field validation (lines 132-200), bearer-auth dispatcher (index.ts:135), composite dedup index (user_id, client_event_id). The hook payload MUST match this contract byte-for-byte.
- `vigil-core/src/db/schema.ts` lines 429-475 — `agent_events` table shape, partial unique index on `(user_id, client_event_id)`.
- `vigil-core/src/db/migrations/0018_*.sql` — Phase 121 migration; researcher reads to confirm column types if hook bodies need them.
- `.planning/phases/121-*/121-CONTEXT.md` — Phase 121 decisions D-A1..D-D2 (user_id always from auth context, never body; dedup composite scope).

### Phase 122 — vigil-watch event-shape canonical reference
- `.planning/phases/122-*/122-CONTEXT.md` — Mac-side event mapping. Phase 134 mirrors the `label` and `host` derivation conventions established there.
- vigil-watch GitHub repo (separate codebase — NOT in this monorepo) — `vigil-watch/Sources/VigilWatch/EventEmitter.swift` (or equivalent). Researcher checks the Mac-side `host` and `label` derivation to mirror exactly.

### Phase 127 — GUARD-01 redaction precedent
- `vigil-core/src/analytics/posthog.ts` lines 38-55 — `BLOCKED_PROPERTY_NAMES` Set; the property-name denylist pattern that drift detectors enforce parity against.
- `.planning/phases/127-*/127-CONTEXT.md` — Phase 127 D-01..D-04 redaction-drift detector design (test reads source files, greps for pattern strings, asserts byte-for-byte equality).
- `vigil-core/src/__tests__/redaction-drift.test.ts` (Phase 127 Plan 01) — pattern that AGENT-LINUX-06 mirrors structurally.
- `vigil-pwa/src/__tests__/denylist-parity.test.ts` (Phase 127 Plan 02) — cross-package parity assertion pattern.

### Phase 130 — `--auto` mode discussion precedent
- `.planning/phases/130-*/130-CONTEXT.md` — The operator's `--auto` posture pattern (recommended-defaults-with-rationale). Phase 134 follows the same structure.

### Phase 133 — WATCH-ENRICH-03 (PENDING; cross-phase coordination)
- `.planning/REQUIREMENTS.md` lines 53-55 — WATCH-ENRICH-02/03/04 spec. The denylist patterns Phase 134 grep-pins MUST match these verbatim. If Phase 133 ships AFTER Phase 134, Phase 134 lands the canonical `redaction-patterns.json` and Phase 133's vigil-watch parser is expected to consume it. If Phase 133 ships FIRST, Phase 134 mirrors. Operator decides ordering at plan time.

### Roadmap + requirements
- `.planning/ROADMAP.md` lines 629-651 — Phase 134 entry (goal, dependencies, success criteria, plan placeholders).
- `.planning/REQUIREMENTS.md` lines 113-120 — AGENT-LINUX-01..06 spec.
- `.planning/REQUIREMENTS.md` lines 200-204 — Traceability table (AGENT-LINUX rows pending).

### Local Linux Claude Code environment (verified at discuss time)
- `~/.claude/settings.json` on this box — current shape has 2 SessionStart entries, 3 PostToolUse matchers, 5 PreToolUse matchers, ALL from GSD. The installer MUST coexist with these.
- `~/.claude/hooks/gsd-session-state.sh` — bash hook style reference (STDIN-JSON parse via `node -e`, atomic JSON output via `process.stdout.write(JSON.stringify(…))`).
- `~/.claude/hooks/gsd-phase-boundary.sh` — PostToolUse hook example with STDIN `tool_input.file_path` parsing.

### Codebase orientation
- `.planning/codebase/STACK.md` — NOTE: stale (dated 2026-03-31, Swift-only); the current stack includes vigil-core (Node 22 / Hono / Drizzle / PostgreSQL), vigil-pwa (Vite / React), vigil-g2-plugin (Vite TS). Phase 134 adds vigil-linux-hooks (bash + node ESM) as a new top-level workspace.
- `.planning/codebase/STRUCTURE.md` — Workspace layout (researcher reads to confirm root-level `vigil-linux-hooks/` is consistent with existing peer layout).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`vigil-core/src/routes/agent-events.ts`** — POST handler is ready and Phase-121-tested with cross-user isolation pinned. Phase 134 adds ZERO server-side code (no new routes, no schema changes, no migrations). Pure client-side phase.
- **`vigil-core/src/lib/agent-events-bus.ts`** — already fans Phase 121 events to per-userId SSE subscribers (`/v1/agent-stream` Phase 124). Linux hook events will automatically surface on the G2 HUD via the existing SSE infra — no PWA / plugin changes needed for visibility.
- **`vigil-core/src/analytics/posthog.ts:38` `BLOCKED_PROPERTY_NAMES`** — pattern reference for how a denylist Set is exported, tested, and grep-pinned. Phase 134 mirrors structurally (but the Phase 134 list is regex-patterns-on-content, not property-name strings — different runtime semantics, same drift-detector mechanic).
- **`~/.claude/hooks/gsd-session-state.sh`** — bash hook style reference (`set` flags, STDIN JSON parse pattern, output JSON envelope, opt-in via config gate). The vigil hook will NOT use the opt-in gate (always-on if installed), but the bash style is otherwise mirrored.
- **`~/.claude/hooks/gsd-phase-boundary.sh`** — PostToolUse hook example demonstrating `INPUT=$(cat)` → `node -e "JSON.parse(d).tool_input?.field"` pipe. Phase 134 uses this exact pattern to extract `session_id` and `cwd` from the STDIN envelope.

### Established Patterns

- **Strict route shape (Phase 121 `KNOWN_FIELDS`)** — the server rejects unknown body fields. Hook payload must be schema-tight; no `cwd` or `linux_distro` overflow fields without a Phase 121 contract amendment.
- **Composite dedup `(user_id, client_event_id)`** — the hook generates one UUID v4 per event (NOT per session; each SessionStart, each UserPromptSubmit, each Stop produces a fresh UUID). Retries are NOT a thing in Phase 134 (fire-and-forget), so the UUID's role is degenerated to "give vigil-core a stable insert key" rather than "client-side retry safety."
- **Bearer auth via single env var** — `VIGIL_API_KEY` follows the same convention as vigil-watch (`VIGIL_API_KEY` env var read by the Swift daemon). Single var, single bearer prefix, never logged.
- **Fail-safe hook posture** — GSD hooks already follow exit-0-on-anything pattern with opt-in gates (`hooks.community` config). Vigil hook is exit-0 unconditionally (no opt-in gate — install IS the consent).
- **Drift-detector test pattern** (Phase 127 GUARD-01) — vitest reads source files, greps for pattern literals, asserts byte-for-byte equality across sources. AGENT-LINUX-06's drift detector is a structural copy of this pattern.

### Integration Points

- **`~/.claude/settings.json`** — installer splice point. Existing 2-entry SessionStart array (GSD) must be preserved; one new matcher-group entry appended.
- **`~/.claude/hooks/`** — runtime hook script copy destination. Coexists with the 12 existing GSD hook scripts.
- **`https://api.vigilhub.io/v1/agent-events`** — POST target (Phase 121 production endpoint).
- **`https://api.vigilhub.io/v1/agent-stream` → G2 plugin SSE subscriber** (Phase 124) — receive-side, downstream of Phase 134. Phase 134 events surface on the HUD automatically once they land in `agent_events`; no PWA/plugin code changes required to validate end-to-end visibility on the G2.
- **CI test runner** — root `pnpm test` (researcher confirms the workspace test wiring; preference: extend root vitest config to include `vigil-linux-hooks/__tests__/`).

</code_context>

<specifics>
## Specific Ideas

- **Operator's session label expectation:** when the operator runs `claude` from `/home/morrillboss/dev/dailybrief`, the HUD should show `dailybrief: running` — NOT `morrillboss/dev/dailybrief` (full path) and NOT a session UUID. The basename-of-cwd convention satisfies this.
- **Operator's host expectation:** the Linux box's short hostname (e.g., `morrillboss-linux` or whatever `hostname -s` returns). The HUD already disambiguates Mac vs. Linux sessions visually via the `host` field; no special icon/styling needed.
- **Trigger story:** "I'm doing dailybrief work on my Linux dev box, my Mac is shut, and my G2 HUD still shows what I'm doing." That's the entire UX promise. Phase 134 is the smallest possible patch that delivers it.
- **Operator install workflow:** `cd ~/dev/dailybrief && bash vigil-linux-hooks/install.sh` — one command, idempotent, with clear "set VIGIL_API_KEY to enable" guidance in the confirmation line.

</specifics>

<deferred>
## Deferred Ideas

### Not in Phase 134 (out of scope, future phases)

- **Tool-step events** — `PreToolUse`/`PostToolUse` hook entries that surface "Bash" / "Edit" / "Read" on the HUD body line. This is WATCH-ENRICH-02 for vigil-watch (Mac); Linux parity is a Phase-135+ candidate (LINUX-ENRICH-01..03 working title).
- **Offline queue / retry** — Phase 134 is fire-and-forget. If the operator works on Linux without internet for an hour, those events are lost. Adding an SQLite-backed offline queue to the hook would mirror Phase 130 D-O1 (voice-capture queue) but for agent-events. Future scope; tracked as LINUX-OFFLINE-01 candidate.
- **Multi-operator support** — current install assumes single Linux operator. If the box ever has multiple operators with separate `VIGIL_API_KEY` values, the installer would need a per-user mode. Not a real-world concern for this box; deferred indefinitely.
- **Auto-update mechanism** — like the GSD `gsd-check-update.js` hook. Phase 134's installer is one-shot; operator manually re-runs to pick up new versions. Future: a `vigil-agent-bridge --check-update` flag that compares the local version comment to a repo-side version manifest.
- **`SessionEnd` event** — Claude Code may add a SessionEnd hook in the future. If so, wiring it would let the HUD distinguish "session running" from "session fully exited." Not yet in the protocol; deferred.
- **Reply round-trip** — Phase 133 G2-REPLY explores write-back to Claude Code; Linux parity would mirror that. Out of scope for 134.
- **vigil-watch Linux port** — a "real" daemon that watches `~/.claude/projects/*.jsonl` files like the Swift daemon does on Mac. The hook approach is intentionally lighter; the daemon would be Phase-200+ if ever needed.

### Cross-phase coordination notes

- **WATCH-ENRICH-03 ordering with Phase 133.** If Phase 133 ships before Phase 134, the canonical `redaction-patterns.json` should live in `vigil-watch`-controlled space (researcher confirms — likely a separate repo). If Phase 134 ships first (current ROADMAP order suggests this), Phase 134 owns `vigil-linux-hooks/redaction-patterns.json` and Phase 133's vigil-watch parser is expected to consume it. Either way, the drift detector in BOTH phases reads the same file.
- **Phase 121 `KNOWN_FIELDS` extension** — if a future phase needs a hook to send `cwd` or `tool_name` fields, that requires a Phase-121 contract amendment (extend `KNOWN_FIELDS`, extend `agent_events` schema, add migration). Phase 134 deliberately does NOT push for this; the basename-of-cwd derivation in `label` covers the immediate need.

</deferred>

---

*Phase: 134-Linux-Claude-Code-vigil-core-agent-events-bridge*
*Context gathered: 2026-05-18*
