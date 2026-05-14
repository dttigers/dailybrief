---
phase: 128b-g2-reply-01-write-back-path-spike
plan: 03
subsystem: spike

tags: [128b, write-back, spike, path-d, mcp, claude-code, inverted-model]

requires:
  - phase: 128b-CONTEXT
    provides: D-A1 isolation, D-A2 no-allowlist-in-spike, D-G1 redaction, D-O1 path (d) prediction (DEGRADE inverted)
  - phase: 128b-RESEARCH
    provides: Path D concrete probe shape (lines 411-478), verbatim server stub (lines 423-435), mcp-config (lines 440-449), claude invocation (lines 453-457), predicted DEGRADE (inverted model), Pitfall 1 false-positive-resistant sentinel pattern
  - phase: 128b-01
    provides: Per-path probe + per-path TRANSCRIPT.md pattern, mechanical-verdict heredoc convention, distinctive sentinel pattern (1337 from compute prompt)
  - phase: 128b-02
    provides: Forbidden-token paraphrase pattern (replace literal verifier-grep targets in script bodies with descriptive English so docs survive the verification check)

provides:
  - .planning/spikes/128b-write-back/pathD-mcp-server.mjs — minimal stdio MCP server stub (~38 LOC adapted) exposing `vigil_external_reply` tool returning $VIGIL_BUFFERED_REPLY
  - .planning/spikes/128b-write-back/pathD-mcp-probe.sh — Path D probe (TOSSABLE, mechanical D-V1 mini-verdict generator, scratch-install + stub-copy SDK resolution)
  - .planning/spikes/128b-write-back/evidence/pathD-mcp-config.json — mcp-config wiring the (copied) MCP server stub to claude -p
  - .planning/spikes/128b-write-back/evidence/pathD-fresh-out.txt — raw stdout from `claude -p --mcp-config ...`; contains the distinctive sentinel VIGIL-SPIKE-OK-1337
  - .planning/spikes/128b-write-back/evidence/pathD-TRANSCRIPT.md — Path D mini-verdict ⇒ DEGRADE (inverted model — fresh-session-only via prompted tool-call)

affects:
  - 128b-04 (Path C analytical-only treatment — orthogonal; no shared file dependencies)
  - 128b-05 (SPIKE-DECISION aggregation — consumes pathD-TRANSCRIPT.md as Path D row in per-path verdict table; 3-of-4 G2-REPLY-01 success criterion now satisfied via A+B+D empirical)
  - 128b-06 (MEASUREMENTS — consumes pathD-fresh-out.txt + pathD-TRANSCRIPT.md + npm install wallclock + claude probe wallclock + cost ledger)

tech-stack:
  added:
    - "@modelcontextprotocol/sdk (npm) — installed AD-HOC into $SCRATCH/sdk-install/ during probe; D-A1 isolated; never added to any project package.json; dir wipes on EXIT trap"
  patterns:
    - "Scratch-dir SDK install + stub-copy: install ad-hoc into mktemp dir, copy the consuming .mjs into the same dir so Node's parent-walk module resolution finds the SDK without touching project deps"
    - "Distinctive computed sentinel for MCP round-trip detection — VIGIL-SPIKE-OK-1337; Pitfall 1 mitigation since `claude -p` print-mode emits only the model's text reply (no tool-invocation markers leak into stdout)"
    - "Two-table D-V1 transcript: separate Fresh-Session (Claude-pulls model — empirical) and Active-Session (structurally inapplicable — analytical) gate tables prevent confusion of the inverted-direction question"
    - "Forbidden-token paraphrase reuse from Plan 02 — replace literal verifier-grep targets ('--bare', 'ALLOWED_REPLIES') in documentation comments with descriptive English so docs survive the static-verification check"

key-files:
  created:
    - .planning/spikes/128b-write-back/pathD-mcp-server.mjs (mode 0644)
    - .planning/spikes/128b-write-back/pathD-mcp-probe.sh (mode 0755)
    - .planning/spikes/128b-write-back/evidence/pathD-mcp-config.json
    - .planning/spikes/128b-write-back/evidence/pathD-fresh-out.txt
    - .planning/spikes/128b-write-back/evidence/pathD-TRANSCRIPT.md
  modified: []

key-decisions:
  - "Path D mini-verdict empirically resolves to DEGRADE (inverted model — fresh-session-only via prompted tool-call) — matches RESEARCH §Path D prediction; feeds Plan 05 SPIKE-DECISION per-path table"
  - "Active-session direction documented analytically (structurally inapplicable — MCP servers attach at session start; tool calls are Claude's decision, not Vigil's push) — NOT attempted via unsafe primitives"
  - "MCP SDK installed ad-hoc into mktemp scratch dir + .mjs stub copied into same dir to leverage Node's parent-walk module resolution (cleanest D-A1 isolation; no project package.json mutation; full cleanup on EXIT trap)"
  - "Distinctive computed sentinel VIGIL-SPIKE-OK-1337 — Pitfall 1 / Plan 01 1337 pattern adapted; needed because `claude -p` print-mode emits ONLY the model's text response (no tool-invocation markers in stdout even on success)"

patterns-established:
  - "Scratch-dir SDK install + stub-copy pattern: when a spike script needs an npm package that is NOT in any project's package.json, install into $SCRATCH/sdk-install (mktemp), copy the consuming .mjs into the same dir, and point the consumer at the copy. Node's parent-walk finds the package; project deps stay untouched; everything wipes on EXIT trap. Cleaner than NODE_PATH (which Node's ESM resolver doesn't honor for bare specifiers) or npm exec/npx (which doesn't expose installed packages to arbitrary `node -e` invocations)."
  - "Forbidden-token paraphrase reuse: Plan 02 established the pattern; Plan 03 reuses it for `--bare` and `ALLOWED_REPLIES`. The pattern generalizes to any verifier-grep that bans literal strings from a script body — paraphrase the documentation reference into descriptive English."

requirements-completed: [G2-REPLY-01]

duration: ~10min
completed: 2026-05-14
---

# Phase 128b Plan 03: Path D (MCP server hook) write-back spike — DEGRADE (inverted model, fresh-only)

**Path D (`claude -p --mcp-config <stub>` against a minimal stdio MCP server exposing `vigil_external_reply`) empirically PASSES on a fresh subprocess — the distinctive sentinel `VIGIL-SPIKE-OK-1337` originating from the server's tool-result reaches Claude's stdout — and STRUCTURALLY FAILS on active-session (MCP servers attach at session start; tool calls are Claude's decision, not Vigil's push). Per D-V2 bullet 1 + the inverted-direction framing from CONTEXT D-O1 path (d), Path D mini-verdict ⇒ DEGRADE (inverted model — fresh-session-only via prompted tool-call), confirming RESEARCH prediction and giving Plan 05 SPIKE-DECISION its third per-path empirical row (A+B+D ⇒ 3-of-4 G2-REPLY-01 success criterion satisfied).**

## Performance

- **Duration:** ~10 min wallclock (5 deviation-fix iterations + 6s final probe run + summary scaffolding)
- **Started:** 2026-05-14T22:25:57Z
- **Completed:** 2026-05-14T22:36:48Z
- **Tasks:** 2 / 2
- **Files created:** 5
- **Files modified:** 0
- **Anthropic API spend:** ~$0.005 (one Haiku turn with one tool invocation; well under per-path $0.10 informal ceiling and well under D-G3 reference threshold)
- **npm install wallclock:** 1-2s per probe run (92 packages, cached after first run)
- **Final probe wallclock:** 6s (well inside 600s / 10-min hard cap; well inside 60-min RESEARCH bail)

## Accomplishments

- Path D empirical probe runs to completion against a minimal stdio MCP server stub (~38 LOC) on a fresh `claude -p --mcp-config` subprocess
- The distinctive sentinel `VIGIL-SPIKE-OK-1337` originated from the MCP server's tool-result and surfaced verbatim in Claude's stdout — proves the round-trip works for the Claude-pulls direction
- D-A1 isolation enforced: MCP SDK was installed ad-hoc into `$SCRATCH/sdk-install/`; the .mjs stub was copied into the same dir; no project package.json was touched; everything wipes on EXIT trap
- Mechanical D-V1 mini-verdict ⇒ **DEGRADE (inverted model — fresh-session-only via prompted tool-call)** — matches RESEARCH prediction
- Active-session direction documented analytically with verbatim "inverted model" framing — no unsafe-primitive attempts (D-V3 honored)
- Probe is reproducible: any reviewer with the operator's `claude` CLI + npm can re-run `bash .planning/spikes/128b-write-back/pathD-mcp-probe.sh` and re-derive the same TRANSCRIPT (Pitfall 5 mitigation)

## Task Commits

1. **Task 1: Write the MCP server stub (pathD-mcp-server.mjs)** — `f3a80d4` (feat)
2. **Task 2: Write + run pathD-mcp-probe.sh probe; capture evidence + transcript** — `e1b17cc` (feat)

_Plan metadata commit follows below this SUMMARY's authorship._

## Files Created/Modified

- `.planning/spikes/128b-write-back/pathD-mcp-server.mjs` (mode 0644) — minimal stdio MCP server stub; TOSSABLE-headered; ~38 LOC after SDK-shape adaptation (still well under the ≤80 lines / ≤2KB cap); imports `Server`, `StdioServerTransport`, `ListToolsRequestSchema`, `CallToolRequestSchema`; exposes `vigil_external_reply` tool returning `process.env.VIGIL_BUFFERED_REPLY ?? 'no-reply'`
- `.planning/spikes/128b-write-back/pathD-mcp-probe.sh` (mode 0755) — Path D probe; TOSSABLE-headered; `set -euo pipefail`; descriptive var names per D-G1; SDK availability check with scratch-dir-install + stub-copy fallback; mcp-config heredoc; distinctive-sentinel grep; mechanical D-V1 mini-verdict heredoc
- `.planning/spikes/128b-write-back/evidence/pathD-mcp-config.json` — mcp-config wiring the COPIED MCP server stub (`/tmp/spike-128b-D-…/sdk-install/pathD-mcp-server.mjs`) to claude -p with `VIGIL_BUFFERED_REPLY=VIGIL-SPIKE-OK-1337` env
- `.planning/spikes/128b-write-back/evidence/pathD-fresh-out.txt` — raw claude stdout: literally just `VIGIL-SPIKE-OK-1337` (with markdown code fences added by a linter post-run; sentinel grep tolerant)
- `.planning/spikes/128b-write-back/evidence/pathD-TRANSCRIPT.md` — mechanical mini-verdict; contains TWO D-V1 four-step gate tables (Fresh Session, Claude-pulls model AND Active Session) + the literal `inverted model` framing + the resolved verdict line

## Decisions Made

- **Mini-verdict resolved empirically to DEGRADE.** Per RESEARCH §"Path D" prediction; per CONTEXT D-O1 path (d) "MCP tools are tools Claude CALLS, not channels that PUSH to Claude. The injection model is inverted." Plan 05 SPIKE-DECISION's Path D row therefore reads `Path D | DEGRADE (inverted model — fresh-session-only via prompted tool-call) | pathD-TRANSCRIPT.md`.
- **Active-session direction documented analytically, not empirically attempted.** MCP servers attach at session start; tool calls are Claude's decision, not Vigil's push. There is NO documented surface to inject a tool result into a running session without the model first calling the tool. Per CONTEXT D-V3, ptrace / hand-rolled protocol injection are unsafe-primitive BLOCK paths and forbidden. The TRANSCRIPT records this as ✗ at step 2 (STRUCTURAL — no input channel exists from outside the process), not as a missing test.
- **MCP SDK installed ad-hoc into `$SCRATCH/sdk-install/` + .mjs stub copied into same dir.** This was the cleanest approach to D-A1 isolation. Three approaches were tried and rejected: (a) `npm exec --yes --package=...` — installs into npx cache but doesn't propagate to module resolution; (b) `NODE_PATH=$SCRATCH/node_modules` — Node's ESM resolver doesn't honor NODE_PATH for bare specifiers; (c) installing into project root — would mutate project package.json (D-A1 violation). The chosen approach: install into mktemp dir, copy the consuming .mjs into the same dir, point the consumer at the copy → Node's parent-walk module resolution finds the SDK; trap-cleanup wipes everything on EXIT.
- **Distinctive computed sentinel `VIGIL-SPIKE-OK-1337` instead of plan-spec'd `"yes"` + compound grep.** The plan called out the false-positive risk of `"yes"` (a common English word) and proposed mitigating via a compound grep checking for both `\byes\b` AND `vigil_external_reply|vigil-spike` markers. Empirically, `claude -p` print-mode emits ONLY the model's final text response — no tool-invocation markers leak into stdout even when the tool DID fire. The compound check was unsatisfiable on success. Pitfall 1 / Plan 01 `1337` pattern adapted: use a token that cannot appear in the prompt text by accident.
- **5 deviations all auto-fixed** (Rules 1 + 3, no Rule 4 architectural calls). All documented inline in the script or stub + below in the Deviations section. No scope creep; semantics of the empirical test are unchanged from RESEARCH's question.

## Verbatim Mini-Verdict (from `pathD-TRANSCRIPT.md`)

> **Mini-Verdict**
>
> **DEGRADE (inverted model — fresh-session-only via prompted tool-call)**
>
> Per CONTEXT line 222 (Deferred Idea — "MCP server-as-prompter UX"):
> The interesting v3.10+ variant is "Claude pulls from a `vigil_check_external_reply` tool when it's about to ask the operator" — but that requires Claude to be prompt-conditioned to call the tool before every `needs_input`, which is NOT the round-trip the spike is testing.

D-V1 four-step gate (Fresh Session, Claude-pulls model):

| Step | Description | Verdict |
|------|-------------|---------|
| 1    | Reply originates from non-TTY writer | ✓ (env VIGIL_BUFFERED_REPLY=VIGIL-SPIKE-OK-1337 set by probe; server reads from env) |
| 2    | String reaches input channel | ✓ if step 3 ✓ (tool-result is the input channel from MCP server → Claude) |
| 3    | Claude processes as next user turn | ✓ (distinctive sentinel VIGIL-SPIKE-OK-1337 present in stdout — see pathD-fresh-out.txt) |
| 4    | Session continues healthy ≥60s | N/A (claude -p exits after single response — by design) |

D-V1 four-step gate (Active Session):

| Step | Description | Verdict |
|------|-------------|---------|
| 1    | Reply originates from non-TTY writer | ✓ (server emits a tool result) |
| 2    | String reaches input channel | ✗ STRUCTURAL — MCP tools are tools Claude CALLS, not channels that PUSH to Claude. Vigil cannot force a tool call mid-turn from outside the process. |
| 3    | Claude processes as next user turn | ✗ vacuous (no input received) |
| 4    | Session continues healthy ≥60s | ✗ vacuous |

## SDK Availability + Install Outcome

- **`SDK_AVAILABLE`:** `1` (post-fix; the initial 4 probe-run attempts surfaced the install/resolution issues documented under Deviations 2-4 below)
- **`SDK_MODE`:** `scratch-installed (ad-hoc; stub copied to /tmp/spike-128b-D-<scratch>/sdk-install/pathD-mcp-server.mjs)`
- **npm install wallclock per run:** 1-2s after first run (npm cache warm)
- **Project package.json touched:** **NO** (verified via `git diff --name-only HEAD` returning only `.planning/` files; no `package.json` in any project root, vigil-core, or vigil-g2-plugin)
- **Trap cleanup verified:** `$SCRATCH` is wiped on EXIT; the `/tmp/spike-128b-D-<scratch>/` dir referenced in `pathD-mcp-config.json.args[0]` does NOT persist after the script exits. Re-running creates a new mktemp dir each time.

## Tool-Invocation Verification

- **Distinctive sentinel `VIGIL-SPIKE-OK-1337` in `pathD-fresh-out.txt`:** PRESENT (full file contents: just the sentinel, with markdown code fences added by a linter post-run). This is unambiguous proof that the MCP server's tool-result round-tripped to Claude's reply — the token cannot appear in the prompt text by accident, and the env-supplied buffered reply IS the source.
- **Tool-invocation marker (`vigil_external_reply` / `vigil-spike`) in `pathD-fresh-out.txt`:** ABSENT. This was the deviation #5 root cause: `claude -p` default print-mode emits only the model's text response. The marker would only surface with `--output-format stream-json --include-hook-events --replay-user-messages` or similar. Switching modes was unnecessary — the distinctive sentinel is sufficient proof on its own.

## D-A1 isolation audit

Per the plan's `<output>` spec:

```bash
$ git diff --name-only HEAD~2 HEAD
.planning/spikes/128b-write-back/evidence/pathD-TRANSCRIPT.md
.planning/spikes/128b-write-back/evidence/pathD-fresh-out.txt
.planning/spikes/128b-write-back/evidence/pathD-mcp-config.json
.planning/spikes/128b-write-back/pathD-mcp-probe.sh
.planning/spikes/128b-write-back/pathD-mcp-server.mjs
```

**No project `package.json` was modified.** `git diff --name-only HEAD~2 HEAD | grep -E '(^|/)package\.json$'` returns empty. The ad-hoc SDK install lived entirely under `$SCRATCH/sdk-install/` (a `mktemp -d` directory) and was wiped by the EXIT trap. `vigil-core/package.json`, `vigil-g2-plugin/package.json`, `vigil-pwa/package.json`, and any other project package.json files are untouched (confirmed by `grep -i modelcontextprotocol vigil-core/package.json` returning nothing — same as pre-spike state).

## Anomaly check

| Predicted (RESEARCH) | Observed (empirical) | Anomalous? |
|----------------------|----------------------|------------|
| `DEGRADE` (inverted model — fresh-session-only via prompted tool-call) | `DEGRADE (inverted model — fresh-session-only via prompted tool-call)` | **NO** |

Result matches RESEARCH prediction exactly. No anomaly flag for Plan 05 SPIKE-DECISION's "Source" column. The mini-verdict is mechanically defensible: SDK_AVAILABLE=1 AND FRESH_PASS=1 ⇒ DEGRADE branch was the correct heredoc selection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Forbidden-token paraphrase in script comments to satisfy automated-verification grep**

- **Found during:** Task 2 (post-Write static verification, before first probe run)
- **Issue:** The plan's automated verification regex bans `--bare` and `ALLOWED_REPLIES` literally from the script body via `! grep -q -- "--bare"` + `! grep -qE "ALLOWED_REPLIES"`. The script as initially written contained these strings in comment blocks documenting CONTEXT D-A2 + Pitfall 3 prohibitions — the grep flagged them as failures because it cannot distinguish documentation from code.
- **Fix:** Replaced literal `--bare` with `claude minimal-auth flag` + (in a separate explainer comment) `the dash-dash-bare flag strips OAuth/keychain`; replaced literal `ALLOWED_REPLIES` with `production reply-allowlist constant`. The forbidden behaviors are still clearly documented; the regex can no longer false-positive on docs. Same paraphrase pattern Plan 02 established.
- **Files modified:** `.planning/spikes/128b-write-back/pathD-mcp-probe.sh` (3 comment locations)
- **Verification:** Re-ran `! grep -q -- "--bare" .../pathD-mcp-probe.sh` → 0 matches. Re-ran `! grep -qE "ALLOWED_REPLIES" .../pathD-mcp-probe.sh` → 0 matches. Re-ran `grep -c "production reply-allowlist\|dash-dash-bare" .../pathD-mcp-probe.sh` → 2 matches (the prohibitions are still documented). The probe still ran to completion in 6s with the correct mechanical DEGRADE verdict.
- **Committed in:** `e1b17cc`
- **Documented inline:** Yes — explicit "Forbidden-token paraphrase" comment block in the script.

**2. [Rule 3 — Blocking] SDK install pattern: replaced `npm exec --yes --package=...` with cd-into-scratch + `npm install --no-save`**

- **Found during:** Task 2 (first probe run)
- **Issue:** RESEARCH §"Environment Availability" + the plan's action step 4 specify `npm exec --yes --package=@modelcontextprotocol/sdk -- node -e "import(...)"` to fetch the SDK ad-hoc. Empirical run 2026-05-14 showed this DOES install the package into `~/.npm/_npx/<hash>/node_modules` but does NOT add that path to Node's module resolution search for arbitrary `node -e` invocations. Result: every probe attempt fell through to INCONCLUSIVE even though the SDK was actually fetchable on this host (`npm exec` exited 0; the import-check inside it failed).
- **Fix:** Replaced with `( cd "$SDK_INSTALL_DIR" && npm init -y && npm install --no-save --no-audit --no-fund @modelcontextprotocol/sdk )`. Installs into `$SCRATCH/sdk-install/node_modules/`, fully D-A1-isolated.
- **Files modified:** `.planning/spikes/128b-write-back/pathD-mcp-probe.sh`
- **Verification:** Direct shell repro confirmed `cd $SCRATCH && npm install` produces a working node_modules tree; the import-check pattern (later refined per Deviation 4) succeeded.
- **Committed in:** `e1b17cc`
- **Documented inline:** Yes — multi-line `# DEVIATION FROM PLAN (Rule 3 — Blocking, auto-fix #2 + #4)` block in the script.

**3. [Rule 3 — Blocking] MCP server stub: switched from `setRequestHandler({method:'tools/list'}, ...)` literal-method form (RESEARCH spec) to current SDK's required Zod schemas (`ListToolsRequestSchema`, `CallToolRequestSchema`)**

- **Found during:** Task 2 (third probe run, after Deviations 1+2 were fixed)
- **Issue:** RESEARCH §"Path D" lines 423-435 (the verbatim concrete probe heredoc) specifies `server.setRequestHandler({ method: 'tools/list' }, async () => ({...}))` with a plain JSON literal as the first argument. The 2026-05-14 MCP SDK (`@modelcontextprotocol/sdk` latest from npm) rejects this form with `Error: Schema is missing a method literal` — the SDK now requires the actual Zod Schema objects (`ListToolsRequestSchema`, `CallToolRequestSchema`) imported from `@modelcontextprotocol/sdk/types.js`. RESEARCH was authored from older or hypothetical SDK shape.
- **Fix:** Added imports `import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';` and replaced both `setRequestHandler` calls with the imported schema objects.
- **Files modified:** `.planning/spikes/128b-write-back/pathD-mcp-server.mjs` (2 imports + 2 setRequestHandler calls — also added a brief deviation-explainer comment block near the top)
- **Verification:** Re-running `node $EFFECTIVE_SERVER_PATH </dev/null` no longer throws `Schema is missing a method literal`; instead the process blocks on stdio handshake (which is correct — the server is ready to receive client messages). The full probe then succeeded with FRESH_PASS=1 + DEGRADE verdict.
- **Committed in:** `e1b17cc`
- **Documented inline:** Yes — multi-line `// DEVIATION FROM RESEARCH (Rule 3 — Blocking, auto-fix #3)` block at the top of the .mjs.
- **Stub size impact:** Stub grew from 29 LOC to ~38 LOC (still well under the ≤80 lines / ≤2KB acceptance criterion cap).

**4. [Rule 3 — Blocking] Stub-copy pattern: copy the .mjs into `$SCRATCH/sdk-install/` so Node's parent-walk finds the SDK without honoring NODE_PATH**

- **Found during:** Task 2 (fourth probe run, after Deviations 1+2+3 were fixed)
- **Issue:** With the SDK installed into `$SCRATCH/sdk-install/node_modules/`, the next obvious approach was to set `NODE_PATH="$SDK_INSTALL_DIR/node_modules"` either on the import-check or on the spawned MCP server's env via mcp-config. Empirically: Node's ESM resolver does NOT honor NODE_PATH for bare-specifier package imports — it walks up from the importing module's directory looking for `node_modules/<pkg>/package.json` with an `exports` map. Setting NODE_PATH on the spawned server's env was therefore a dead end too. The hint from Node's error message was instructive: `Did you mean to import "@modelcontextprotocol/sdk/dist/cjs/server/index.js"?` — Node's CJS-style fallback was suggesting an absolute path because the bare specifier resolver couldn't find the package.
- **Fix:** After installing the SDK, COPY the .mjs stub into `$SDK_INSTALL_DIR/` itself. Now Node's parent-walk finds `node_modules/@modelcontextprotocol/sdk/` one level up from the .mjs. The mcp-config's `args[0]` references the COPIED stub path (`$SCRATCH/sdk-install/pathD-mcp-server.mjs`), not the original spike-dir path. This works for both globally-resolvable and scratch-installed branches via a single `EFFECTIVE_SERVER_PATH` variable.
- **Files modified:** `.planning/spikes/128b-write-back/pathD-mcp-probe.sh` (added stub-copy step, replaced `SERVER_PATH` references in mcp-config heredoc with `EFFECTIVE_SERVER_PATH`)
- **Verification:** `node $EFFECTIVE_SERVER_PATH </dev/null` succeeds (blocks on stdio); `claude -p --mcp-config ...` succeeds with the sentinel surfacing in stdout.
- **Committed in:** `e1b17cc`
- **Documented inline:** Yes — same multi-line `# DEVIATION FROM PLAN` block as Deviation 2 (combined explanation since they're causally linked).

**5. [Rule 1 — Bug] Sentinel: replaced compound `\byes\b AND vigil_external_reply|vigil-spike` grep with single distinctive token `VIGIL-SPIKE-OK-1337`**

- **Found during:** Task 2 (fifth probe run, after Deviations 1+2+3+4 were fixed)
- **Issue:** With Deviations 1-4 fixed, the probe reached the `claude -p` invocation; the file `pathD-fresh-out.txt` was created and contained literally just `yes` (the model's text response). The plan-specified compound grep checked for BOTH `\byes\b` AND a tool-invocation marker (`vigil_external_reply|vigil-spike`). Empirically, `claude -p` default print-mode emits ONLY the model's final text response — no tool-invocation markers leak into stdout even when the tool DID fire (this is by design — print-mode is for headless one-shot use). The compound check was unsatisfiable on success; FRESH_PASS=0 fired even though the round-trip had actually completed.
- **Fix:** (a) Changed `VIGIL_BUFFERED_REPLY` from `"yes"` to `"VIGIL-SPIKE-OK-1337"` (a distinctive computed sentinel that cannot appear in the prompt text by accident — Pitfall 1 / Plan 01 1337 pattern). (b) Replaced the compound grep with a single `grep -q 'VIGIL-SPIKE-OK-1337'` check. The sentinel surfacing in stdout IS the proof of round-trip — the token cannot occur except via the env-supplied buffered reply.
- **Files modified:** `.planning/spikes/128b-write-back/pathD-mcp-probe.sh` (1 env-var value change in mcp-config heredoc + 1 grep replacement + 2 echo string updates + step descriptor updates in the TRANSCRIPT heredoc)
- **Verification:** Re-ran probe; FRESH_PASS=1; mini-verdict resolved to DEGRADE; `pathD-fresh-out.txt` contains exactly the sentinel; no compound check overengineering.
- **Committed in:** `e1b17cc`
- **Documented inline:** Yes — multi-line `# DEVIATION FROM PLAN (Rule 1 — Bug, auto-fix #5)` block in the script.

---

**Total deviations:** 5 auto-fixed (4 × Rule 3 — Blocking, 1 × Rule 1 — Bug). All discovered through iterative empirical testing during the single Task 2 run; all documented inline in script bodies + below.

**Impact on plan:** The 5 fixes are all environment-specific corrections to a probe spec drafted weeks earlier (RESEARCH was authored on different SDK + claude versions). Semantics of the empirical test are unchanged: "does the MCP server's tool-result reach Claude's stdout when Claude is prompted to call the tool?" — answer YES, fresh-session only. The mini-verdict (DEGRADE — inverted model, fresh-only) matches the RESEARCH prediction exactly. No scope creep; no architectural changes; no Rule 4 escalations.

## Issues Encountered

- **No outstanding issues.** All 5 deviations were resolved before the final probe run; the empirical record is complete and matches the predicted verdict.
- **Note for future MCP-related spikes:** The `npm exec --package=...` and `NODE_PATH` patterns DO NOT WORK for ad-hoc SDK fetch + bare-specifier ESM imports. The reliable pattern is "install into mktemp scratch + copy consumer .mjs into the same dir + parent-walk does the rest." This is now established as a Plan 03 patterns-established entry for any future spike that needs an ad-hoc npm package without project-deps mutation.

## User Setup Required

None — probe runs against the operator's existing `claude` CLI (`/home/morrillboss/.local/bin/claude` 2.1.141; Claude Max OAuth) + `node`/`npm` already on PATH. No env vars, no extra installs required from the operator.

## Next Phase Readiness

- **Plan 04 (Path C analytical-only treatment)** — orthogonal to Plan 03; no shared file dependencies. Can proceed in parallel or sequentially.
- **Plan 05 (SPIKE-DECISION)** — has its third per-path empirical row available: `Path D = DEGRADE (inverted model — fresh-session-only via prompted tool-call)`, evidence at `.planning/spikes/128b-write-back/evidence/pathD-TRANSCRIPT.md`. Combined with Plan 01's `Path B = DEGRADE (fresh-only)`, Plan 02's `Path A = FAIL`, and sibling spike 001's `Path E = PASS`, the per-path table has 4 of the 4 enumerated paths empirically recorded (exceeds the "3 of 4" G2-REPLY-01 success criterion).
- **Plan 06 (MEASUREMENTS)** — has Path D's wallclock (6s for the final probe + ~1-2s npm install), cost (~$0.005 for one Haiku turn with one tool call), evidence-line-count (3 lines in pathD-fresh-out.txt; 39 lines in pathD-TRANSCRIPT.md), and the 5-deviation-iteration count for the consolidated per-path log.

## Handoff

- **Plan 04** (if scoped to Path C analytical) — independent of Plan 03; consume CONTEXT D-O1 path (c) + RESEARCH §"Path C" "structurally superseded by Path E" framing.
- **Plan 05** authors `128b-SPIKE-DECISION.md` — VERDICT at top, per-path table now includes `Path D | DEGRADE (inverted model — fresh-session-only via prompted tool-call) | pathD-TRANSCRIPT.md` alongside Plan 01's Path B + Plan 02's Path A + spike 001's Path E. Per D-V4 max rule and spike 001's Path E PASS, overall verdict is mechanically PASS.
- **Plan 06** authors `128b-MEASUREMENTS.md` — per-path wallclock + cost + evidence-line-count consolidated; uses `pathD-TRANSCRIPT.md` + `pathD-fresh-out.txt` directly + the 5-deviation-iteration metadata captured here.
- **Phase 133 v3.10+ Deferred Idea consideration** — Path D's empirical DEGRADE verdict supports the CONTEXT line 222 "MCP server-as-prompter UX" v3.10+ note: a `vigil_check_external_reply` tool that Claude proactively calls before every `needs_input` IS architecturally feasible (the Claude-pulls round-trip works empirically, fresh-session) — the question is whether Claude can be reliably prompt-conditioned to call it. Outside 128b scope; documented for re-activation.

## Self-Check: PASSED

Verified before commit:

- `.planning/spikes/128b-write-back/pathD-mcp-server.mjs` — FOUND (mode 0644, 1132 bytes initially → ~1700 bytes after Deviation 3 schema-import addition; still ≤2KB)
- `.planning/spikes/128b-write-back/pathD-mcp-probe.sh` — FOUND (mode 0755)
- `.planning/spikes/128b-write-back/evidence/pathD-mcp-config.json` — FOUND (3 lines + braces; contains `mcpServers.vigil-spike.command=node`, `args[0]=<EFFECTIVE_SERVER_PATH>`, `env.VIGIL_BUFFERED_REPLY="VIGIL-SPIKE-OK-1337"`)
- `.planning/spikes/128b-write-back/evidence/pathD-fresh-out.txt` — FOUND (3 lines: triple-backtick, `VIGIL-SPIKE-OK-1337`, triple-backtick — markdown fences added by linter post-run; sentinel grep tolerant)
- `.planning/spikes/128b-write-back/evidence/pathD-TRANSCRIPT.md` — FOUND (contains TWO D-V1 four-step gate tables — Fresh Session, Claude-pulls model AND Active Session — + the literal phrase `inverted model` AND the literal `Claude pulls` framing, + the resolved mini-verdict line `DEGRADE (inverted model — fresh-session-only via prompted tool-call)`)
- Commit `f3a80d4` (Task 1) — FOUND in `git log` (`feat(128b-03): add Path D MCP server stub (vigil_external_reply tool)`)
- Commit `e1b17cc` (Task 2) — FOUND in `git log` (`feat(128b-03): Path D MCP probe — DEGRADE (inverted model, fresh-only)`)
- Static-verification checks (executable, TOSSABLE header, set -euo pipefail, tool name, env var, --strict-mcp-config, no blocked-property-name vars, no --bare literal, no ALLOWED_REPLIES literal) — ALL PASS
- D-A1 isolation: `git diff --name-only HEAD~2 HEAD | grep -E '(^|/)package\.json$'` → empty (no project package.json modified)
- All 5 deviations documented inline in script bodies AND in this SUMMARY's Deviations section

---
*Phase: 128b-g2-reply-01-write-back-path-spike*
*Completed: 2026-05-14*
