# Phase 128b: G2-REPLY-01 write-back path spike — Research

**Researched:** 2026-05-14
**Domain:** Programmatic input injection into a live Claude Code TTY session (IPC + writer-process methodology)
**Confidence:** HIGH (CONTEXT.md decisions are locked; spike 001 empirical evidence preserved; surface probes confirmed on this workstation)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Copied verbatim from `128b-CONTEXT.md` `<decisions>`:

- **D-T1** — Primary test target: a REAL operator-driven interactive `claude` session, mid-turn (`needs_input`-like pause). Fresh `claude -p` sessions prove nothing about the production case.
- **D-T2** — Secondary probe per path that PASSes D-T1: fresh `claude -p` session. A path that FAILs active-session but PASSes fresh-session is a DEGRADE signal.
- **D-T3** — Synthetic stub REJECTED. Mocking JSONL/stdin would let any path PASS trivially.
- **D-T4** — Test machine: this Linux dev workstation (`/home/morrillboss/dev/dailybrief`), NOT operator's macOS Mac. Spike question is OS-agnostic at the abstraction layer.
- **D-T5** — Real Claude Code JSONL session corpus is available at `~/.claude/projects/-home-morrillboss-dev-dailybrief/`. Spike MUST NOT alter the live spike-runner session (clobber-protect by stamping target session ID at spike-start).
- **D-O1** — Test order (cheapest first): (b) SDK stream-json → (d) MCP → (a) JSONL append → (c) named-pipe/FIFO.
- **D-O2** — Stop-on-first-PASS short-circuit. Remaining paths marked "not tested — first PASS sufficient."
- **D-O3** — Stop-on-three-BLOCKS short-circuit. If first three paths in D-O1 order all BLOCK, skip path 4.
- **D-O4** — Per-path wallclock cap = 3 hours. Over-cap paths are marked `INCONCLUSIVE`.
- **D-V1** — PASS gate (four-step round-trip, ALL FOUR required): (1) reply originates from a non-TTY writer; (2) reaches input channel; (3) processed as next user turn (Claude responds); (4) session continues healthy ≥60s. Active-session AND fresh-session both pass ⇒ PASS. Scope-locks Phase 133 to full G2-REPLY-02..04.
- **D-V2** — DEGRADE gate: fresh-session-only PASS, OR landing-but-requires-Enter, OR partial cleanup. Scope-locks Phase 133 to G2-REPLY-05 banner-ack-only.
- **D-V3** — BLOCK gate: all 3+ tested paths FAIL, OR works only with unsafe primitives (ptrace, kernel fd injection), OR state-corruption observed. Adds three SEED-003-style re-activation conditions.
- **D-V4** — Verdict computed mechanically: per-path mini-verdict by 4-step gate; overall = `MAX(PASS > DEGRADE > FAIL > INCONCLUSIVE)`. Verdict written at TOP of `128b-SPIKE-DECISION.md`, NOT editable (Phase 128a precedent).
- **D-A1** — Spike code lives under `.planning/spikes/128b-write-back/` (NEW directory). NOT in `vigil-core/src/routes/` or `vigil-g2-plugin/scripts/`.
- **D-A2** — Privilege/allowlist model SKETCHED IN MARKDOWN, NOT implemented in spike code. 5-string allowlist (`yes`/`no`/`continue`/`abort`/`defer`) appears only in `128b-SPIKE-DECISION.md` pseudo-code.
- **D-A3** — `POST /v1/agent-replies` vigil-core route NOT in 128b scope. Writer-process invoked DIRECTLY (curl/CLI/env). The spike's question is the "writer → session" half, NOT "G2 → server → writer."
- **D-A4** — Spike artifacts: `128b-CONTEXT.md`, `128b-DISCUSSION-LOG.md`, `128b-RESEARCH.md`, `128b-NN-PLAN.md`, `128b-SPIKE-DECISION.md`, `128b-MEASUREMENTS.md`, `60s-demo.mp4`.
- **D-G1** — GUARD-01 redaction applies: spike's `console.log` MUST avoid naming vars `secret`/`token`/`auth`/`bearer`/`apiKey`.
- **D-G2** — GUARD-02 audio cap N/A.
- **D-G3** — GUARD-03 budget watermark N/A (≤20 short prompts, ~$0.10 against operator's personal Claude Max auth).
- **D-G4** — Existing `agent_events_bus` plumbing is referential, NOT modified.
- **D-N1** — Companion HUD currently local-network only. Out of 128b scope but flagged for Phase 133 productionization UX.

### Claude's Discretion

- Exact writer-process language per path (Bash one-liner vs Node script vs Python) — researcher/planner pick per path idioms.
- Exact log format for per-path measurement transcripts — must satisfy D-G1.
- Whether to attempt path 4 (FIFO) if first 3 produce clear verdict — short-circuit by default.
- Live test session: operator-driven `claude` OR tmux-wrapped disposable — default tmux-wrapped for clobber-protection.
- Exact pseudo-code shape for the privilege-model sketch — researcher/planner pick; only the 5-string allowlist constant is fixed.
- Drift-detector tests explicitly SKIPPED (Phase 133 scope).

### Deferred Ideas (OUT OF SCOPE)

- `POST /v1/agent-replies` vigil-core route → Phase 133.
- vigil-watch Swift daemon changes → Phase 133.
- Reply-mode UX on G2 (DOUBLE_CLICK enter → cycle 5 prefabs → DOUBLE_CLICK send) → Phase 133.
- Reply-mode watchdog auto-exit (G2-REPLY-04) → Phase 133.
- `agent_banner_acked` + `agent_reply_sent` SSE event types → Phase 133.
- Drift-detector test for 5-string allowlist (G2-REPLY-04) → Phase 133.
- Multi-platform support (Windows / non-macOS) → out of milestone scope.
- Local-network constraint resolution for Companion HUD (D-N1) → Phase 133 or v3.10.
- MCP server-as-prompter UX (Claude pulls vs Vigil pushes) → v3.10+ if DEGRADE.
- Per-session reply rate-limiting / cooldown → Phase 133.
- Audit log of all replies sent → Phase 133.
- vigil-watch local clone NOT needed for spike.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| G2-REPLY-01 | Empirically prove or rule out programmatic input injection into an active Claude Code session via at least 3 of: (a) JSONL append + IPC, (b) `@anthropic-ai/claude-code` SDK hook, (c) named-pipe to operator TTY, (d) MCP server hook. Output: `128b-SPIKE-DECISION.md` with PASS / DEGRADE / BLOCK verdict. | Spike 001 (`.planning/spikes/001-tmux-write-back-128b/`) already PASSed Path E (tmux send-keys) empirically; per-path methodologies for A/B/D detailed below; criteria-mapping table makes the "at least 3 of 4" letter-of-the-law requirement explicit (Path E satisfies criterion 3 but NOT criterion 1's "(a)/(b)/(c)/(d)" enumeration — so A + B + (C or D) must still be empirically tested). |

</phase_requirements>

## Summary

The phase's core question — "can any non-TTY writer process inject a reply into a live Claude Code session?" — was **answered YES on 2026-05-14** by spike 001 (`.planning/spikes/001-tmux-write-back-128b/`) via a **5th path not enumerated in the original CONTEXT**: `tmux send-keys` (Path E). The full D-V1 four-step PASS gate completed in 77s wallclock with preserved evidence (`evidence/L4-permission-pause-snapshot.txt`, `evidence/L4-health-check-snapshot.txt`, `evidence/L4-tool-output-marker.txt`).

This collapses the phase shape. The overall verdict is mechanically `PASS` per D-V4 regardless of A/B/C/D outcomes (Path E alone PASSes the four-step gate; `MAX(PASS, …)` = PASS). What the plan still must produce is the empirical record for paths A/B/(C or D) to satisfy the letter-of-the-law G2-REPLY-01 success criterion ("at least 3 of (a)/(b)/(c)/(d)"). Path E does not satisfy that criterion as a substitute for the enumerated 4 — but it does fully satisfy success criterion 3 (working PoC round-trip) on its own.

**Primary recommendation:** The plan should be structured as a confirm-and-frame exercise, not a discovery exercise. Spend wallclock on the cheap predictive tests (Path B fresh-session PASS, Path A active-session BLOCK confirmation) to satisfy the "3 of 4" enumeration, document Path D analytically with a tiny MCP probe, document Path C as "structurally superseded by Path E" without empirical testing (D-O3 stop-on-three-BLOCKs spirit + D-O4 wallclock cap discipline), and treat Path E as the primary verdict driver. Total estimated wallclock: 2-3 hours for the empirical sweep + 1 hour write-up + operator wallclock for the 60s Loom (C-2).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Writer process invocation (curl / CLI / env) | OS / shell | — | D-A3 — invoked directly, no vigil-core route in 128b scope. |
| Live Claude Code session | OS / TTY (in tmux pane per D-T1 + D-Specifics) | — | Spike code does NOT touch vigil-core / vigil-g2-plugin / vigil-watch (CONTEXT `code_context.integration_points`). |
| JSONL session state (Path A target) | OS / filesystem (`~/.claude/projects/`) | Claude Code process | Claude Code owns the read path; the spike treats the file as a target surface only. |
| Stream-json input (Path B target) | Claude Code subprocess stdin | OS / pipe | `claude -p --input-format stream-json` is a fresh subprocess, not the active session. |
| MCP tool surface (Path D target) | Claude Code MCP runtime | Local stdio server | Tool calls are Claude-initiated; injection model is inverted ("Claude pulls"). |
| tmux pty (Path E target — already validated) | tmux server (operator-uid IPC) | Claude Code's pane pty | Spike 001 verified — tmux server owns the pty fd; no ptrace / elevation. |
| Privilege model + 5-string allowlist | Markdown sketch only (D-A2) | — | Phase 133 productionizes; spike never implements. |
| Phase 133 future writer-process deployable | **Ubuntu daemon (`vigil-tmux-bridge`)** per SURFACE-MAP.md 2026-05-14 shift | — | NOT vigil-watch (Mac). Co-located with the tmux socket (`0700` to operator). |

## Standard Stack

### Core (already present on this workstation — no installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tmux` | 3.4 (`/usr/bin/tmux`) | Path E primary; pty IPC for any TTY-reading interactive program | Verified 2026-05-14 surface probe. Same binary semantics on macOS (`brew install tmux`). Battle-tested userspace launcher. |
| `claude` | 2.1.141 (`~/.local/bin/claude`) | Test target; surface for all 4 paths + Path E | Already authed via operator's Claude Max OAuth. Do NOT use `--bare` (strips OAuth/keychain — Spike 001 Iteration 2). |
| `bash` | host | Writer-process language for paths A / E + harness for B / D | POSIX; identical surface on Linux + macOS. |
| `jq` | host | JSONL row construction for Path A | Standard for shell-side JSON build. |
| `mkfifo` | host (Linux/macOS) | Path C primitive | POSIX; available on both target OSes. |

### Supporting (ad-hoc, NOT into project deps)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@modelcontextprotocol/sdk` (Node) | ad-hoc in `.planning/spikes/128b-write-back/` only | Path D probe — minimal stdio MCP server stub (~30 LOC) | Only if Path D is empirically tested. CONTEXT recommends analytical-only treatment; the probe should remain ≤30 minutes wallclock. Do NOT install into `vigil-core/` or `vigil-g2-plugin/`. |
| Python 3 | host | Optional writer-process language for Path B / B-variant | If a TS/Node writer would balloon Path B wallclock; both are acceptable per CONTEXT Discretion. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tmux send-keys` (Path E) | GNU screen / Zellij | tmux is the established convention on operator's machines + already verified by spike 001. No reason to introduce a second multiplexer. |
| `claude -p --input-format stream-json` (Path B) | `claude -p` text-input (single shot) | Stream-json is the canonical advertised streaming surface; the text-input single-shot is fundamentally fresh-session-only and proves less than stream-json. Use stream-json per CONTEXT D-O1. |
| Bash writer for Path A | Node `fs.appendFile` + signal | Bash is simpler and matches CONTEXT Discretion default. Node only adds value if we wanted async signal+watch — for a one-shot probe, bash is sufficient. |

**Installation:** No new package installs required for the spike. The MCP server stub (if Path D is empirically tested) lives in `.planning/spikes/128b-write-back/` and uses `npx --package @modelcontextprotocol/sdk -- ...` ad-hoc invocation, NOT a `package.json` dependency add. `[VERIFIED: 2026-05-14 surface probe — tmux 3.4, claude 2.1.141 on this workstation]`

**Version verification:** Not applicable — the spike consumes the operator's installed CLI surface, not a frozen library version. Surface probes performed 2026-05-14 are sufficient.

## Architecture Patterns

### System Architecture Diagram

The spike's data flow (one-shot, per path):

```
                ┌──────────────────────────────────┐
                │  Writer process (non-TTY)        │
                │  Bash heredoc / Node script /    │
                │  curl-style — invoked DIRECTLY   │
                │  (D-A3: no vigil-core route)     │
                └────────────────┬─────────────────┘
                                 │
                                 │ {reply: "yes"}
                                 │ (one of 5 allowlisted strings)
                                 ▼
   ┌─────────────────────────────────────────────────────────┐
   │                  Per-path injection surface              │
   ├──────────┬──────────┬──────────┬──────────┬─────────────┤
   │ Path A   │ Path B   │ Path C   │ Path D   │ Path E ★    │
   │ JSONL    │ stdin    │ FIFO/    │ MCP tool │ tmux        │
   │ append   │ stream-  │ proc-fd  │ result   │ send-keys   │
   │ + signal │ json     │          │          │ (validated) │
   └─────┬────┴─────┬────┴─────┬────┴─────┬────┴──────┬──────┘
         │          │          │          │           │
         ▼          ▼          ▼          ▼           ▼
   ┌─────────────────────────────────────────────────────────┐
   │     Live `claude` interactive session                   │
   │     (in tmux pane per D-T1 + D-Specifics)               │
   │     Mid-turn, paused on `needs_input` permission dialog │
   └─────────────────────────────┬───────────────────────────┘
                                 │
                                 │ Round-trip observability:
                                 │ tmux capture-pane snapshots
                                 │ session JSONL inspection
                                 │ marker file on disk
                                 ▼
   ┌─────────────────────────────────────────────────────────┐
   │  Per-path mini-verdict (D-V1 four-step gate, mechanical)│
   │  PASS / DEGRADE / FAIL / INCONCLUSIVE                   │
   └─────────────────────────────┬───────────────────────────┘
                                 │
                                 ▼
   ┌─────────────────────────────────────────────────────────┐
   │  Overall verdict = MAX(per-path)                        │
   │  PASS > DEGRADE > FAIL > INCONCLUSIVE                   │
   │  Written at TOP of 128b-SPIKE-DECISION.md (non-editable)│
   └─────────────────────────────────────────────────────────┘

   ★ Path E was empirically PASSed by spike 001 on 2026-05-14.
     Overall verdict therefore mechanically resolves to PASS
     regardless of A/B/C/D outcomes (D-V4 max rule).
```

### Recommended Project Structure (decision required — see "Open Questions §1")

```
.planning/
├── phases/128b-g2-reply-01-write-back-path-spike/
│   ├── 128b-CONTEXT.md                 (locked)
│   ├── 128b-DISCUSSION-LOG.md          (locked)
│   ├── 128b-RESEARCH.md                (this file)
│   ├── 128b-NN-PLAN.md                 (next — planner output)
│   ├── 128b-SPIKE-DECISION.md          (verdict at TOP + per-path table)
│   ├── 128b-MEASUREMENTS.md            (per-path wallclock + transcripts)
│   └── 60s-demo.mp4                    (success criterion proxy)
├── spikes/
│   ├── 001-tmux-write-back-128b/       (existing — Path E artifacts)
│   │   ├── README.md
│   │   ├── L1-...sh, L2-...sh, L3-...sh, L4-...sh
│   │   └── evidence/
│   │       ├── L3-claude-response-snapshot.txt
│   │       ├── L4-permission-pause-snapshot.txt
│   │       ├── L4-health-check-snapshot.txt
│   │       └── L4-tool-output-marker.txt
│   └── 128b-write-back/                ★ NEW per D-A1
│       ├── README.md                   (brief — points to phase artifacts)
│       ├── pathA-jsonl-append.sh       (Path A probe)
│       ├── pathB-stream-json.sh        (Path B probe)
│       ├── pathD-mcp-probe.sh + .mjs   (Path D probe — only if testing)
│       └── evidence/
│           ├── pathA-...txt
│           ├── pathB-...txt
│           └── pathD-...txt
```

### Pattern 1: Layered investigation (per spike CONVENTIONS.md)

**What:** Each path's probe is a separable bash script with a numbered/named layer. Risk-order: cheapest sanity first, most expensive last.
**When to use:** Every per-path probe in this spike.
**Example:**

```bash
#!/usr/bin/env bash
# PHASE 128b SPIKE — TOSSABLE. Phase 133 owns G2-REPLY productionization;
# this file is spike-only and SHOULD BE DELETED after the verdict is committed.
set -euo pipefail

SESSION="spike-128b-pathB-$$"
SCRATCH=$(mktemp -d -t spike-128b-pathB-XXXXXX)
trap 'tmux kill-session -t "$SESSION" 2>/dev/null || true' EXIT

# ... probe logic ...
```

`[CITED: .planning/spikes/CONVENTIONS.md §"Tossable headers" + §"Clobber-protection"]`

### Pattern 2: Mechanical verdict computation (Phase 128a D-V1 precedent)

**What:** Each per-path mini-verdict is computed by mechanically checking the D-V1 four-step gate against the empirical run. The author does NOT decide at write-up time.
**When to use:** Every entry in the `128b-SPIKE-DECISION.md` per-path table.
**Example:**

```markdown
| Path | Step 1: writer originates | Step 2: reaches input | Step 3: processed as user-turn | Step 4: session healthy ≥60s | Verdict |
|------|---------------------------|-----------------------|--------------------------------|------------------------------|---------|
| A    | ✓                         | ✓                     | ✗ (file appended; not re-read) | ✗ (no continuation observed) | FAIL    |
| B    | ✓                         | ✓ (fresh)             | ✓ (fresh)                      | ✓ (fresh)                    | DEGRADE (fresh-only) |
| C    | — (not empirically tested)| —                     | —                              | —                            | INCONCLUSIVE (covered analytically by Path E) |
| D    | ✓                         | ✓                     | ✗ (Claude pulls, not pushes)   | ✓                            | DEGRADE (inverted model) |
| E ★  | ✓                         | ✓                     | ✓                              | ✓                            | PASS    |
```

`[CITED: 128b-CONTEXT.md D-V4 + Phase 128a D-V1 precedent]`

### Pattern 3: False-positive-resistant sentinels

**What:** Use a sentinel computed by the model (whose value does NOT appear in the prompt). Snapshot pane content at the moment of detection — TUI re-renders erase evidence.
**When to use:** Every Claude-output observation step in any path.
**Example:**

```bash
PROMPT="Compute seven multiplied by one hundred ninety-one. Reply with only the resulting integer."
EXPECTED="1337"
# (NOT included in PROMPT text)

for i in $(seq 1 30); do
  sleep 1
  CAP=$(tmux capture-pane -p -t "$SESSION")
  if echo "$CAP" | grep -q "$EXPECTED"; then
    echo "$CAP" > "$SCRATCH/at-detection.txt"
    break
  fi
done
```

`[CITED: .planning/spikes/CONVENTIONS.md §"False-positive-resistant sentinels" + §"Snapshot at moment of detection"]`

### Anti-Patterns to Avoid

- **Sentinel in prompt text:** Spike 001 Iteration 1 false-positive — `grep -q "$SENTINEL"` matched the echoed prompt, not Claude's reply. Always compute the sentinel; never quote it in the prompt.
- **`claude --bare` for auth-needed paths:** Strips OAuth/keychain; requires `ANTHROPIC_API_KEY`. Operator's Claude Max account auths via OAuth. Spike 001 Iteration 2 — drop `--bare`.
- **End-of-run scrollback dumps:** Claude's TUI alt-screen re-renders erase responses; capture at the moment of detection.
- **Touching the live spike-runner session:** Per D-T5, clobber-protect by stamping target session ID at spike-start. Refuse to write if it equals `$CLAUDE_SESSION_ID` if set. Use unique tmux session names (`spike-128b-<L>-$$`).
- **Synthetic mocks for JSONL/stdin/MCP:** Per D-T3, mocks let any path PASS trivially. Spike is empirical or worthless.
- **Implementing the 5-string allowlist in spike code:** Per D-A2, allowlist is markdown sketch ONLY. Drift-detector tests are explicitly skipped (Phase 133 G2-REPLY-04 scope).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Userspace pty IPC for write-back | Custom launcher that owns Claude's stdin FD | `tmux send-keys` (Path E — already validated) | tmux is a battle-tested, pre-existing, user-uid launcher with a `0700` socket. No ptrace, no elevation, no custom code. The operator already uses tmux. |
| Per-session reply rate-limiting in the spike | Custom debouncer | Markdown sketch only (D-A2) | Phase 133 productionization concern; rate-limiting is in `code_context.integration_points` deferred items. |
| The 5-string allowlist enforcement | Live regex/validator in spike scripts | Markdown pseudo-code only | Phase 133 G2-REPLY-04 implements + pins via drift-detector. Doing it in throwaway code triples wallclock with zero verdict change. |
| MCP server boilerplate | Hand-rolled stdio JSON-RPC parser | `npx --package @modelcontextprotocol/sdk -- ...` (ad-hoc) | Spike 001 reference + CONTEXT line 177: ~30 LOC stub. Do NOT add to a `package.json`. |
| Claude Code session ID lookup | Custom file-scanning logic | `~/.claude/projects/-home-morrillboss-dev-dailybrief/*.jsonl` corpus (6 sessions present) | Real session JSONL files are available; spike Path A operates on a copy (D-T5). |
| Cross-platform abstraction (Linux ↔ macOS) | Per-OS shims in the spike | None — document portability concern in verdict only | D-T4: spike runs on Linux; Phase 133 productionizes on Ubuntu (per SURFACE-MAP.md 2026-05-14 shift), NOT macOS. macOS portability is documented in verdict, not coded. |

**Key insight:** Every "don't hand-roll" item is a Phase 133 concern. The spike's only job is to produce a verdict and the per-path empirical record. Anything beyond that triples wallclock without changing the verdict.

## Path-by-Path Methodology

> The four paths from CONTEXT D-O1 (b/d/a/c ordering) plus the spike-001-validated Path E. Each entry includes: (1) what to do; (2) cheapest concrete command; (3) predicted verdict; (4) what evidence to capture; (5) when to bail.

### Path B — `claude -p --input-format stream-json` *(test first per D-O1, cheapest)*

**What it tests:** Whether stream-json input to a fresh `claude -p` subprocess produces a clean response (i.e., the canonical SDK streaming surface works at all), AND whether stream-json can be re-routed into an interactive session mid-turn (almost certainly NO — `-p` is single-shot by design).

**Concrete probe:**

```bash
#!/usr/bin/env bash
# PHASE 128b SPIKE — TOSSABLE. Path B (SDK stream-json).
set -euo pipefail
SCRATCH=$(mktemp -d -t spike-128b-B-XXXXXX)

# B.1 — fresh session: pipe a stream-json user message in, observe stream-json out.
printf '%s\n' '{"type":"user","message":{"role":"user","content":"Compute seven multiplied by one hundred ninety-one. Reply with only the resulting integer."}}' \
  | claude -p --input-format stream-json --output-format stream-json --model haiku \
  > "$SCRATCH/B1-fresh-out.jsonl" 2> "$SCRATCH/B1-fresh-err.txt"

# B.2 — fresh session sanity: confirm `1337` appears in any 'assistant'/'result' stream-json row.
grep -E '1337' "$SCRATCH/B1-fresh-out.jsonl" && echo "B.1 fresh PASS" || echo "B.1 fresh FAIL"

# B.3 — active session attempt: there is NO documented way to feed stream-json into a
# running interactive session. The `-p` flag is explicitly single-shot. Document this
# in MEASUREMENTS as a NEGATIVE finding (per CONTEXT D-V3: confusing fresh-PASS with
# active-PASS would be a verdict error).
```

**Predicted verdict:** **PASS (fresh) / FAIL (active-session)** → per D-V2 = **DEGRADE overall** (fresh-session-only is the DEGRADE pattern).

**Cross-reference to D-V1/V2/V3:** The fresh-session round-trip passes all four D-V1 steps. The active-session test cannot even reach D-V1 step 2 ("reaches input channel") — `-p` is print-and-exit, there is no input channel on an already-running interactive session. This is the textbook D-V2 case: "Round-trip works ONLY on fresh `claude -p` sessions, NOT mid-interactive-session."

**Evidence to capture:** `B1-fresh-out.jsonl` (full stream-json transcript with `1337` present), `B1-fresh-err.txt` (any auth/permission errors).

**Wallclock estimate:** 30 minutes. **Bail condition:** if 30 min exceeded, the path is INCONCLUSIVE — but this is unlikely; the surface is well-documented (`--help` confirms 2026-05-14).

**Why test this:** CONTEXT D-O1 predicts DEGRADE here, and confirming the prediction empirically is cheap. The "3 of 4" success criterion is satisfied in part by recording this finding. Also it generates the first stream-json sample we have — useful for any future reference docs.

`[CITED: 128b-CONTEXT.md D-O1 path (b) — "Likely PASSes for fresh sessions; the active-session question is whether stdin is re-readable mid-interactive (it almost certainly is NOT — `-p` is print-and-exit). Probable verdict: PASS fresh-session / FAIL active-session / DEGRADE overall if no other path PASSes."]` `[VERIFIED: claude --help 2026-05-14 surface probe — confirms `-p`, `--input-format stream-json`, `--output-format stream-json`]`

### Path A — JSONL append + IPC *(test second)*

**What it tests:** Whether appending a `user`-role row to `~/.claude/projects/{cwd-esc}/{session-id}.jsonl` and signaling (SIGUSR1 / `--resume`) causes a running interactive `claude` to pick up the new turn.

**Concrete probe:**

```bash
#!/usr/bin/env bash
# PHASE 128b SPIKE — TOSSABLE. Path A (JSONL append + IPC).
set -euo pipefail
SESSION="spike-128b-A-$$"
SCRATCH=$(mktemp -d -t spike-128b-A-XXXXXX)
trap 'tmux kill-session -t "$SESSION" 2>/dev/null || true' EXIT

# A.1 — clobber-protect: pick a session ID from the corpus that is NOT the active
# spike-runner session ($CLAUDE_SESSION_ID if set).
PROJDIR="$HOME/.claude/projects/-home-morrillboss-dev-dailybrief"
TARGET_SID=""
for f in "$PROJDIR"/*.jsonl; do
  SID=$(basename "$f" .jsonl)
  [ "${CLAUDE_SESSION_ID:-}" = "$SID" ] && continue
  TARGET_SID="$SID"; break
done
[ -n "$TARGET_SID" ] || { echo "no safe session ID" >&2; exit 1; }

# A.2 — copy the target session to a scratch projects dir; spike operates on the copy.
COPYDIR="$SCRATCH/proj"
mkdir -p "$COPYDIR"
cp "$PROJDIR/$TARGET_SID.jsonl" "$COPYDIR/"

# A.3 — start `claude --resume <sid>` in a tmux pane, give it 8s to settle, then
# append a {"type":"user","message":{"role":"user","content":"<sentinel>"}} row.
# Observe whether the running claude reads the appended row (it almost certainly
# does NOT — claude reads JSONL only at startup/resume, not via inotify).
tmux new-session -d -s "$SESSION" -x 240 -y 60 \
  "cd '$COPYDIR' && claude --resume '$TARGET_SID' --model haiku"

sleep 8

# A.4 — append a user row. Use a non-prompt-echoed sentinel:
APPEND='{"type":"user","message":{"role":"user","content":"Compute seven multiplied by one hundred ninety-one. Reply with only the resulting integer."}}'
echo "$APPEND" >> "$COPYDIR/$TARGET_SID.jsonl"

# A.5 — try SIGUSR1 (common Unix re-read signal); fallback: do nothing and observe.
CLAUDE_PID=$(pgrep -f "claude --resume $TARGET_SID" | head -1 || true)
[ -n "$CLAUDE_PID" ] && kill -USR1 "$CLAUDE_PID" 2>/dev/null || true

# A.6 — poll pane content for `1337`; bail at 30s if not seen.
DETECTED=0
for i in $(seq 1 30); do
  sleep 1
  CAP=$(tmux capture-pane -p -t "$SESSION")
  if echo "$CAP" | grep -q "1337"; then
    echo "$CAP" > "$SCRATCH/A-at-detection.txt"
    DETECTED=1; break
  fi
done
echo "A verdict: $([ $DETECTED -eq 1 ] && echo PASS-active || echo FAIL-active)"
```

**Predicted verdict:** **FAIL active-session** (file append is invisible to a running TUI process) → per D-V3 first bullet candidate, but only if it's the third+ BLOCK. As a single-path FAIL with Path E PASS already in hand, this contributes a `FAIL` mini-verdict but does NOT change the overall PASS.

**Cross-reference to D-V1/V2/V3:** Step 1 (originate) and step 2 (reaches the file, which is the input channel candidate) both pass. Step 3 (processed as user turn) is the failure point — Claude Code does not re-read JSONL mid-session. This matches CONTEXT D-O1 path (a): "does the running interactive `claude` process re-read the JSONL mid-session, or only at startup? Likely NO mid-session re-read, in which case Path A is BLOCK unless paired with a session-restart."

**Evidence to capture:** `A-at-detection.txt` if PASS (unexpected), OR `A-final-pane.txt` + `A-jsonl-after.txt` (post-append file state) if FAIL. Also capture whether SIGUSR1 caused a process crash (would be a D-V3 state-corruption signal).

**Wallclock estimate:** 1-2 hours including fresh-session secondary test. **Bail condition:** if no signal mechanism produces a re-read in 90 minutes, declare FAIL and move on. Do NOT try `ptrace`-based hot reload (CONTEXT D-V3 "unsafe primitives" — would BLOCK, not PASS).

**Why test this:** CONTEXT D-O1 predicts BLOCK; confirming empirically that no signal causes a re-read is the verdict's strongest support for "JSONL is not a viable production path." It also gives Phase 133 a documented reason to NOT pursue a JSONL-watch architecture.

`[CITED: 128b-CONTEXT.md D-O1 path (a) + D-T5 + code_context.reusable_assets — JSONL corpus]` `[VERIFIED: 6 .jsonl session files present at ~/.claude/projects/-home-morrillboss-dev-dailybrief/ 2026-05-14]`

### Path D — MCP server hook *(test third — analytical+probe)*

**What it tests:** Whether an MCP server registered via `--mcp-config` can deliver a queued reply to Claude when Claude proactively calls a tool — i.e., the **inverted-direction** "Claude pulls, Vigil pushes-buffered" model.

**Concrete probe (minimal — keep ≤ 30 min):**

```bash
#!/usr/bin/env bash
# PHASE 128b SPIKE — TOSSABLE. Path D (MCP probe).
set -euo pipefail
SCRATCH=$(mktemp -d -t spike-128b-D-XXXXXX)

# D.1 — minimal MCP stdio server (~30 LOC) exposes `vigil_external_reply` tool
# returning a buffered string.
cat > "$SCRATCH/mcp-server.mjs" <<'EOF'
#!/usr/bin/env node
// PHASE 128b SPIKE — TOSSABLE.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
const server = new Server({ name: 'vigil-spike', version: '0.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler({ method: 'tools/list' }, async () => ({
  tools: [{ name: 'vigil_external_reply', description: 'Returns the buffered external reply', inputSchema: { type: 'object', properties: {} } }],
}));
server.setRequestHandler({ method: 'tools/call' }, async (req) => ({
  content: [{ type: 'text', text: process.env.VIGIL_BUFFERED_REPLY ?? 'no-reply' }],
}));
await server.connect(new StdioServerTransport());
EOF

# D.2 — mcp-config JSON pointing at the stub server.
cat > "$SCRATCH/mcp-config.json" <<EOF
{
  "mcpServers": {
    "vigil-spike": {
      "command": "node",
      "args": ["$SCRATCH/mcp-server.mjs"],
      "env": {"VIGIL_BUFFERED_REPLY": "yes"}
    }
  }
}
EOF

# D.3 — try to use it via `claude -p` (fresh session) — easiest credibility test.
# Prompt asks Claude to use the tool; observe whether stdout shows the tool result.
claude -p --mcp-config "$SCRATCH/mcp-config.json" --strict-mcp-config \
  --allowedTools "mcp__vigil-spike__vigil_external_reply" \
  --model haiku \
  "Use the vigil_external_reply tool and print exactly what it returned." \
  > "$SCRATCH/D-fresh-out.txt" 2>&1 || true

grep -E "yes" "$SCRATCH/D-fresh-out.txt" && echo "D.fresh PASS" || echo "D.fresh FAIL"

# D.4 — active-session attempt: MCP servers are registered at session start, not
# attached to a running session. There is no documented way to inject a tool result
# into a running session without the model first calling the tool. Document this
# as ANALYTICAL: the model owns the call decision; Vigil cannot force a tool call
# mid-turn from outside the process.
```

**Predicted verdict:** **DEGRADE** (inverted model — works for fresh sessions where Claude is prompted to use the tool, but cannot interrupt a running session). Per D-V2: "Round-trip works ONLY on fresh `claude -p` sessions, NOT mid-interactive-session." MCP fits the same bucket as Path B for the same reason: no mid-session entry point.

**Cross-reference to D-V1/V2/V3:** Steps 1-4 all pass IF the model decides to call the tool. The model deciding to call the tool is not within Vigil's control — it's Claude's planning surface. CONTEXT lines 42 + 222 already flag this: "MCP tools are tools Claude CALLS, not channels that PUSH to Claude. The injection model is inverted." The interesting variant (the v3.10+ Deferred Idea) is "Claude pulls from a vigil_check_external_reply tool when it's about to ask the operator" — but that requires Claude to be prompt-conditioned to call the tool before every `needs_input`, which is not the round-trip the spike is testing.

**Evidence to capture:** `D-fresh-out.txt`, `mcp-server.mjs`, `mcp-config.json`. Note: the MCP stub does NOT need to be checked in; the README in `.planning/spikes/128b-write-back/` documents the version + hash, and the verdict cites the empirical run.

**Wallclock estimate:** 30-60 minutes (including npm install of `@modelcontextprotocol/sdk` ad-hoc in the spike dir — DO NOT add to project `package.json`). **Bail condition:** if MCP SDK install or stdio handshake fails in 60 min, mark INCONCLUSIVE and lean on the analytical-only treatment.

**Why test this:** Gives the verdict a documented "MCP is the right pattern for Claude-pulls, but wrong for Vigil-pushes-mid-session" framing — useful for v3.10+ deferred consideration (CONTEXT line 222) and avoids re-investigation later.

`[CITED: 128b-CONTEXT.md D-O1 path (d) + lines 42 + 222 + canonical_refs §"Claude Code surface"]` `[VERIFIED: claude --help 2026-05-14 — confirms --mcp-config, --strict-mcp-config, --allowedTools, --allow-dangerously-skip-permissions, --permission-mode]`

### Path C — Named-pipe / FIFO to operator TTY *(NOT empirically tested — analytical only)*

**What it tests (analytically):** Whether `mkfifo` + launching `claude` with stdin redirected from the FIFO (c1), or writing to `/proc/<claude-pid>/fd/0` directly (c2), can deliver a reply to a running session.

**RESOLVED:** **Skip empirical testing. Document analytically as "structurally superseded by Path E."**

**Rationale:**
1. CONTEXT D-O3 short-circuits to overall BLOCK if first three paths all BLOCK. We expect A=FAIL, B=DEGRADE, D=DEGRADE — so the three-BLOCK short-circuit does NOT trigger, but Path C's expected verdict (DEGRADE c1 / FAIL c2) doesn't change the overall PASS verdict from Path E.
2. **Path E is structurally a clean refinement of Path C** (per spike 001 README §"Position vs. the 4 enumerated 128b paths"): "the tmux server is a *general-purpose, pre-existing, well-tested* launcher that owns the pty FD. Vigil doesn't have to invent the launcher (C1) or escalate privileges (C2)."
3. CONTEXT D-O4 per-path wallclock cap = 3 hours; Path C is CONTEXT-estimated at 3-4 hours. Per D-O4, that's mark-as-INCONCLUSIVE territory anyway.
4. The "3 of 4" success criterion is satisfiable with A + B + D empirical + Path E (which exceeds "3 of 4" by adding a 5th).

**Counter-recommendation (if planner disagrees):** A 30-minute c1-only test (just `mkfifo` + `cat <FIFO> | claude` — no `/proc/<pid>/fd/0`) would close the loop. Skip c2 entirely (ptrace = D-V3 unsafe-primitive BLOCK).

**Predicted verdict (analytical):** **DEGRADE** for c1 (requires Vigil to OWN the launcher — same constraint as Path E, but with a clunkier IPC) / **BLOCK** for c2 (ptrace = unsafe primitive per D-V3).

**Evidence to capture if planner opts to test:** Just the FIFO+claude `<` launch transcript + a single reply-injection attempt. Do NOT pursue `/proc/<pid>/fd/0`.

`[CITED: 128b-CONTEXT.md D-O1 path (c) + D-O4 + D-V3 + spike 001 README "Position vs. the 4 enumerated 128b paths"]`

### Path E — `tmux send-keys` *(empirically VALIDATED — spike 001, 2026-05-14)*

**What it tested:** Given a live interactive `claude` session in a tmux pane, paused on a `needs_input` permission dialog, can a non-TTY writer process inject a keystroke that Claude processes as the operator's reply?

**Result:** **PASS (all four D-V1 steps).** Full transcript: spike 001 README + `evidence/L4-permission-pause-snapshot.txt` + `evidence/L4-health-check-snapshot.txt` + `evidence/L4-tool-output-marker.txt`.

**Mechanism (verified):** `tmux send-keys -t <session> <reply> Enter` sends keystrokes to the target pane's pty. The tmux server (running as the operator's user, socket `0700`) writes to the pty fd it already owns. No ptrace, no `/proc/<pid>/fd/0`, no preflight FD redirect, no elevation.

**Surfaced constraint (not a blocker, but document):** Claude Code must be launched **inside a tmux pane** for this path to work. Phase 133 productionization needs a `vigil-claude` launcher wrapper (or equivalent) that wraps `claude` in a uniquely-named tmux session. If the operator launches `claude` directly (no tmux), vigil-tmux-bridge degrades to G2-REPLY-05 banner-ack-only for that session.

**Per-D-V1 mapping (from spike 001 README §"Results"):**

1. ✓ Reply originates from a separate non-TTY writer (bash script outside the tmux pane).
2. ✓ String reaches input channel (verified via `tmux capture-pane` showing dialog state change + gated tool actually executing).
3. ✓ Claude processes string as next user turn (verified by Bash tool producing its output file with unique marker `L4-TOOL-RAN-91284096` — only possible after permission was granted via injected Enter).
4. ✓ Session continues healthy ≥60s (verified by health probe `13 * 17` returning `221` after 60s idle).

**Latency (measured):** ~10s for Claude to plan a Bash invocation and surface the permission dialog; <1s for the tool to actually run after the dialog is dismissed. Total spike L4 wallclock: 77s end-to-end.

**Cost (measured):** L1+L2: $0; L3: ~$0.005; L4: ~$0.01. Total <$0.02. Well within Claude Max plan. `[VERIFIED: spike 001 README §Cost]`

**For 128b artifacts:** Path E enters the `128b-SPIKE-DECISION.md` per-path table as a 5th row (★ marker), with citation back to `.planning/spikes/001-tmux-write-back-128b/README.md` and the evidence files. The verdict-at-TOP of `128b-SPIKE-DECISION.md` is `**VERDICT: PASS**` driven by Path E.

`[VERIFIED: .planning/spikes/001-tmux-write-back-128b/README.md frontmatter `verdict: VALIDATED` + 4 preserved evidence files]`

## Per-Path Predicted-Verdict Summary

| Path | Test priority | Test mode | Predicted per-path verdict | Driving D-* clause | Wallclock estimate |
|------|--------------|-----------|----------------------------|---------------------|--------------------|
| **E** ★ | already done | empirical (spike 001) | **PASS** (all 4 D-V1 steps) | D-V1 | 0 (done) |
| **B** | 1st in plan | empirical (fresh + active) | **DEGRADE** (fresh-only) | D-V2 bullet 1 | 30 min |
| **A** | 2nd in plan | empirical (active-session) | **FAIL** (no mid-session re-read) | D-V3 candidate | 60-90 min |
| **D** | 3rd in plan | empirical (fresh probe) + analytical | **DEGRADE** (inverted model) | D-V2 bullet 1 | 30-60 min |
| **C** | NOT TESTED | analytical only (deferred to Phase 133 / v3.10) | INCONCLUSIVE (covered by Path E) | D-O4 cap + spike-001 "structural refinement" | 0 (skipped) |

**Overall verdict (mechanical per D-V4):** `MAX(PASS, FAIL, DEGRADE, DEGRADE, INCONCLUSIVE) = **PASS**`.

## Criteria Mapping — G2-REPLY-01 Success Criterion Letter-of-the-Law

> CONTEXT 128b §Phase Boundary lists 4 success criteria. The phase requirement G2-REPLY-01 (REQUIREMENTS.md line 44) says "at least 3 of: (a)/(b)/(c)/(d)". This table makes the satisfaction model explicit so the planner doesn't accidentally believe Path E alone satisfies criterion 1.

| Success criterion | Source | Satisfied by | Notes |
|-------------------|--------|--------------|-------|
| 1. `128b-SPIKE-DECISION.md` records empirical results for at least 3 of (a)/(b)/(c)/(d) | CONTEXT §Phase Boundary + REQUIREMENTS G2-REPLY-01 | Paths A + B + D empirically tested (3 of 4, exceeds the bar). C documented analytically as "covered by Path E." Path E ★ documented but does NOT substitute for (a)/(b)/(c)/(d) — it's a 5th. | The planner MUST ensure A, B, D each get an empirical run row in the per-path table. C can be a "not tested — see Path E" row. |
| 2. Decision file resolves to exactly one verdict — PASS / DEGRADE / BLOCK | CONTEXT §Phase Boundary | Mechanical via D-V4 max rule. Path E PASS ⇒ overall PASS. | Verdict at TOP of 128b-SPIKE-DECISION.md, non-editable. |
| 3. If PASS — working PoC round-trip exists (the four-step D-V1 round-trip) | CONTEXT §Phase Boundary | Path E (spike 001 L4) — full 4-step round-trip with preserved evidence. | The 60s portfolio Loom (C-2 wallclock checkpoint) replays this empirically. |
| 4. Privilege model sketched in markdown pseudo-code | CONTEXT §Phase Boundary + D-A2 | Spike 001 README §"Privilege & portability sketch" already contains a complete TypeScript pseudo-code sketch (CONTEXT D-A2-compliant). Plan should reference + lightly adapt this. | The planner does NOT need to re-derive the sketch — copy from spike 001 README lines 182-218. |

## Phase 133 Scope-Lock Implications (per D-V1 PASS path)

Per CONTEXT D-V1: "Active-session test passes AND fresh-session test passes ⇒ PASS. Scope-locks Phase 133 to full G2-REPLY-02..04 (DOUBLE_CLICK enter reply mode → cycle 5 prefabs → DOUBLE_CLICK send → reply lands)."

The 128b-SPIKE-DECISION.md Phase 133 scope-lock section MUST explicitly state:

### 1. Writer-process implementation lives in `vigil-tmux-bridge` (Ubuntu daemon), NOT vigil-watch (Mac)

This is the 2026-05-14 architecture shift documented in `.planning/research/SURFACE-MAP.md` §"Recent architecture shift (2026-05-14)" — copy verbatim into the Phase 133 scope-lock section:

> ### Before
> - **vigil-watch** (Mac): owned write-back to Claude Code via a local Mac tmux session.
> - **Mac**: hosted both the Claude Code dev environment AND the write-back daemon.
> - **Constraint**: vigil-core ↔ vigil-watch was local-network-bound (D-N1 in 128b CONTEXT).
>
> ### After
> - **Claude Code dev environment** moves to **Ubuntu server** (operator personal infra; not publicly exposed).
> - **vigil-tmux-bridge** (new, Ubuntu daemon): owns write-back. Consumes vigil-core's `agent_stream` SSE outbound (no inbound port exposure on Ubuntu); runs `tmux send-keys` locally.
> - **vigil-watch** (Mac): shrinks to **presentation-only** — Companion HUD on Mac screen, G2 event relay. The "watch" name is now slightly misleading because the write-back-detection role evaporated. Rename to `vigil-mac-companion` is a candidate cleanup (see SEED-018).
> - **Local-network constraint** on the write-back path disappears (replaced by outbound HTTPS from Ubuntu to Railway; the remaining local-network leg is G2 ↔ vigil-core, unchanged).

This is **not a re-scope** of Phase 128b (CONTEXT correctly leaves writer-process location unspecified at D-A3). It is a **handoff clarification** for Phase 133 planning. The spike code itself runs on this Linux workstation per D-T4 and exercises the same primitive (`tmux send-keys`) that `vigil-tmux-bridge` will use in production.

### 2. Trust-posture rationale (Path E architecture is intentional, not incidental)

Per the unknown-user-profile incident (2026-05-14, vigil-core has had unknown signups), `vigil-tmux-bridge` MUST be a **pull-based consumer** of `agent_stream` SSE outbound — never an inbound-exposed daemon. Document in Phase 133 scope-lock:

- Ubuntu is single-tenant, no inbound exposure, only outbound HTTPS to vigil-core.
- The privileged surface (the tmux socket, 0700 to operator) is never publicly reachable.
- If vigil-core (Railway) is compromised, attacker can SSE-emit allowlisted-string replies — **bounded blast radius = 5 strings** (`yes`/`no`/`continue`/`abort`/`defer`).
- The harder install (Ubuntu daemon) becomes the access boundary: only people with Ubuntu hardware + the operator-token-paste step get write-back capability. PWA-tier users (incl. unknown signups) cannot.

The 5-string allowlist drift-detector test (Phase 133 G2-REPLY-04 success criterion) pins this trust model at the source-of-truth call site.

### 3. Operator workflow target — Ubuntu, not Mac

As of 2026-05-14 the operator is moving the dev environment to a remote Ubuntu server. The "live Claude Code session" the spike validates against IS the Ubuntu tmux. Phase 133 productionizes against:

- `claude` running inside a `vigil-claude` launcher wrapper that wraps the session in a uniquely-named tmux pane (`vigil-claude-<timestamp>` prefix).
- `vigil-tmux-bridge` (systemd unit on Ubuntu) consumes `GET /v1/agent-stream` outbound, filters for `needs_reply` events with allowlisted strings, runs `tmux send-keys -t "$VIGIL_TMUX_SESSION" "$ALLOWLISTED_REPLY" Enter`.
- vigil-watch (Mac) sees `agent_reply_sent` echo back through SSE and renders confirmation banner on the Companion HUD.

The Mac is no longer in the write-path. The Mac is presentation-only.

### 4. Launcher wrapper UX surface (NOT in 128b scope, flag for Phase 133)

If operator launches `claude` directly (no tmux), `vigil-tmux-bridge` cannot reach the input channel. Phase 133 must:
- Detect non-wrapped sessions (e.g., absence of `VIGIL_TMUX_SESSION` env in the running claude's process tree).
- Surface a user-facing "Launch Claude Code via `vigil-claude` to enable G2 replies" warning.
- Gracefully degrade to G2-REPLY-05 banner-ack-only for that session.

### 5. Companion HUD local-network constraint (D-N1 carry-forward)

CONTEXT D-N1 noted the Companion HUD currently requires local network. Per the 2026-05-14 shift, this constraint **changes shape** — the Mac-side Companion HUD still needs local network for G2 ↔ vigil-core, but the write-back path (Ubuntu → tmux) is no longer local-network-bound. Phase 133 surfaces the remaining local-network constraint (G2 ↔ vigil-core leg) in the operator UX.

## Trust-Model Asymmetry — INBOUND vs OUTBOUND Injection

> Important: 128b is OUTBOUND injection (Vigil writing TO Claude Code). PITFALLS.md §"Pitfall 6 — Prompt injection via captured thoughts in chat context" addresses INBOUND injection (adversarial content getting into Vigil's chat context). These are different threat models; do not confuse them in the verdict.

| Direction | Where adversary controls | Threat | Defense |
|-----------|--------------------------|--------|---------|
| **INBOUND** (Pitfall 6) | Captured thoughts content (voice, popup, scrape) | Claude follows injected instructions inside thought context | `<thought>` delimiters + tag-breakout sanitization + injection-heuristic flag + token-budget cap. Defense pattern is **content wrapping**. |
| **OUTBOUND** (this phase) | Replies from G2 → Vigil → Claude Code session | If Vigil is compromised, attacker can drive arbitrary commands into operator's dev environment | 5-string allowlist at the source-of-truth call site (`yes`/`no`/`continue`/`abort`/`defer`) + writer-process drops privileges + tmux socket is `0700` to operator. Defense pattern is **string-set restriction**. |

**Document this asymmetry in the verdict's "Phase 133 scope-lock implications" section** so reviewers don't confuse the two patterns. CHAT-CTX-02's `<thought>` delimiter pattern does NOT apply here — wrapping a 5-string reply in delimiters adds nothing; the defense is that there are ONLY 5 strings, full stop.

`[CITED: .planning/research/PITFALLS.md §"Pitfall 6" lines 167-194 + 128b-CONTEXT.md canonical_refs §"Research outputs"]`

## What CANNOT Be Answered in This Phase (D-A3 scope reduction)

Per CONTEXT D-A3, the spike's question is the "writer → session" half. The following are NOT part of 128b and the verdict should explicitly flag them as Phase 133 carry-forward:

| Concern | Why deferred | Phase 133 surface |
|---------|--------------|-------------------|
| `POST /v1/agent-replies` vigil-core route | "If the writer half BLOCKs, the server half is moot." (CONTEXT D-A3) | G2-REPLY-03 endpoint. |
| `agent_banner_acked` + `agent_reply_sent` SSE event types | Server plumbing; spike doesn't emit | G2-REPLY-02/03/04. |
| G2 reply-mode UX (DOUBLE_CLICK → cycle 5 prefabs → DOUBLE_CLICK) | G2-side, not writer-side | G2-REPLY-02/03. |
| Reply-mode watchdog 30s auto-exit | G2-side UX | G2-REPLY-04. |
| 5-string allowlist drift-detector test pinning | Spike sketches in markdown only; Phase 133 implements + pins at call site | G2-REPLY-04. |
| Cross-platform abstraction (Linux ↔ macOS pty/tmux semantics) | Spike runs Linux only per D-T4 | Document portability in verdict; PROD on Ubuntu per SURFACE-MAP. |
| Per-session reply rate-limiting / audit log | Production hardening | Phase 133. |
| Launcher-wrapper UX (`vigil-claude`) | Not invented yet | Phase 133 onboarding surface. |
| Local-network constraint resolution (D-N1) | Companion HUD UX | Phase 133 or v3.10. |
| vigil-watch ↔ vigil-tmux-bridge rename (`vigil-mac-companion`) | Naming cleanup, not write-back concern | SEED-018 + Phase 133 candidate. |

## Runtime State Inventory

> Phase 128b is a spike, not a rename/refactor/migration. The spike creates a NEW directory (`.planning/spikes/128b-write-back/`) and writes per-phase artifacts. It does NOT modify existing data, services, OS-registered state, secrets, or build artifacts. This inventory is included for completeness per the research checklist:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — spike does NOT modify Claude Code JSONL corpus (operates on copies under `mktemp -d` per D-T5 clobber-protection). | None |
| Live service config | None — spike does NOT modify vigil-core, vigil-g2-plugin, or any live service config (D-G4 + integration_points). | None |
| OS-registered state | None — spike does NOT register launchd / systemd / cron / scheduled tasks. The tmux sessions it spawns are ephemeral (`spike-128b-<L>-$$`) and killed on trap-cleanup. | None |
| Secrets/env vars | `ANTHROPIC_API_KEY` is NOT used (spike uses operator's Claude Max OAuth, NOT `--bare`). `OPENAI_API_KEY` is N/A (no transcription in this spike). No new env vars introduced. | None |
| Build artifacts | None — spike does NOT alter `vigil-core/dist/`, `vigil-g2-plugin/dist/`, or any compiled output. Ad-hoc MCP SDK is `npx`-loaded into `.planning/spikes/128b-write-back/` if needed, NEVER added to a project `package.json`. | None |

**Nothing found in any category — verified by inspection of CONTEXT `code_context.integration_points` (THIS SPIKE TOUCHES NONE) + D-A1 (separate spike dir) + D-G4 (existing plumbing is referential).**

## Common Pitfalls

### Pitfall 1: False-positive sentinel matching prompt text
**What goes wrong:** `grep -q "$SENTINEL"` matches the echoed prompt in the pane, not Claude's response. Mini-verdict erroneously reads PASS.
**Why it happens:** TUI pane displays the user prompt AND Claude's reply together; both are in `tmux capture-pane` output.
**How to avoid:** Use a computed sentinel that does NOT appear in prompt text. Example: prompt asks "Compute seven multiplied by one hundred ninety-one" → grep for `1337` (a digit string the English-words prompt cannot contain). `[CITED: spike 001 README §"Iteration 1: L3 false positive"]`
**Warning signs:** Sentinel value appears in prompt text. Two different paths produce identical PASS evidence (suggests echo-match).

### Pitfall 2: Claude TUI alt-screen erases evidence
**What goes wrong:** End-of-run scrollback dumps lose Claude's response because the TUI re-renders before cleanup.
**Why it happens:** Claude Code's TUI uses the alt-screen / scroll-region. `tmux capture-pane -p` captures the current display, not the scrollback.
**How to avoid:** Snapshot the pane the instant a sentinel is grep-detected. Preserve the at-detection file into `.planning/spikes/128b-write-back/evidence/` BEFORE the trap-cleanup. `[CITED: spike 001 README §"Iteration 1" + .planning/spikes/CONVENTIONS.md §"Snapshot at moment of detection"]`
**Warning signs:** Scrollback dumps are empty or contain only the spinner UI. Re-running the same probe gives different evidence.

### Pitfall 3: `claude --bare` strips OAuth/keychain
**What goes wrong:** Spike script uses `--bare` for "minimal startup overhead"; Claude responds with "Not logged in · Please run /login".
**Why it happens:** `--bare` requires `ANTHROPIC_API_KEY` or apiKeyHelper. Operator's Claude Max account auths via OAuth.
**How to avoid:** Drop `--bare`. Accept the ~3-5s full Claude Code startup. Use `--model haiku` for cost control. `[CITED: spike 001 README §"Iteration 2"]`
**Warning signs:** Probe exits early with "Not logged in" or "API key required."

### Pitfall 4: Touching the live spike-runner Claude Code session
**What goes wrong:** Spike script writes to the JSONL file of the active Claude Code session running the spike itself, corrupting state.
**Why it happens:** No clobber-protection — script picks a session ID without checking `$CLAUDE_SESSION_ID`.
**How to avoid:** D-T5 clobber-protection: stamp target session ID at spike-start; refuse to write if it equals `$CLAUDE_SESSION_ID` (if set). Always use a copy under `mktemp -d` for Path A. Always use unique tmux session names `spike-128b-<L>-$$` for live test sessions. `[CITED: 128b-CONTEXT.md D-T5 + spike 001 README §"What to Expect" + CONVENTIONS.md §"Clobber-protection"]`
**Warning signs:** Spike-runner's own Claude Code session shows unexplained turns or errors mid-spike.

### Pitfall 5: Verdict-author bias at write-up time
**What goes wrong:** Author sees PASS-ish empirical result and writes "PASS overall" without applying the four-step gate to each step.
**Why it happens:** Cognitive shortcut — "it kind of worked, so PASS."
**How to avoid:** D-V4 mechanical computation. Each per-path row in the table has 4 separate columns for D-V1 steps 1-4. Each column gets ✓ or ✗ independently. The mini-verdict is computed from the column pattern, not chosen by the author. `[CITED: 128b-CONTEXT.md D-V4 + Phase 128a D-V1 precedent]`
**Warning signs:** Verdict cell filled in BEFORE the 4 step cells. Verdict reads "mostly PASS" or "PASS with caveats" (not a valid D-V4 output — must be exactly one of PASS / DEGRADE / FAIL / INCONCLUSIVE per path; PASS / DEGRADE / BLOCK overall).

### Pitfall 6: Confusing fresh-session PASS with active-session PASS
**What goes wrong:** Path B PASSes fresh-session; author records "Path B PASS" without noting active-session FAIL → overall verdict skips DEGRADE and lands PASS unjustified.
**Why it happens:** Path B's fresh-session PASS is trivial; the active-session test is the real signal.
**How to avoid:** D-V1 PASS requires BOTH active-session AND fresh-session PASS. D-V2 explicitly lists "Round-trip works ONLY on fresh `claude -p` sessions" as the DEGRADE case. The per-path table MUST distinguish fresh vs active. `[CITED: 128b-CONTEXT.md D-V1 + D-V2 + D-T1 + D-T2]`
**Warning signs:** Per-path verdict cell reads PASS but the row's active-session column is empty or ✗.

### Pitfall 7: Hand-rolling the 5-string allowlist in spike code
**What goes wrong:** Spike script implements `ALLOWED_REPLIES = ['yes',...]` checks before each send-keys; balloons wallclock.
**Why it happens:** Author confuses spike's verdict-question ("does the path work?") with production-question ("does the production-shape work?").
**How to avoid:** D-A2 — allowlist is **markdown sketch only**. Phase 133 G2-REPLY-04 implements + pins via drift-detector. Spike code can hardcode `yes` as the only test string; that's sufficient. `[CITED: 128b-CONTEXT.md D-A2]`
**Warning signs:** Spike script contains `ALLOWED_REPLIES` constant. Spike scope creeps to "test all 5 strings per path."

### Pitfall 8: Logging-side secret leak in per-path transcripts
**What goes wrong:** Spike script logs session IDs / PIDs / process names with variable names like `token`, `auth`, `apiKey` → trips a hypothetical future log scanner.
**Why it happens:** D-G1 redaction applies even to spike logs.
**How to avoid:** D-G1 — avoid naming local vars `secret`/`token`/`auth`/`bearer`/`apiKey` etc. Use `sessionId`, `pid`, `procName` (descriptive, not blocked-property-name). `[CITED: 128b-CONTEXT.md D-G1 + vigil-core/src/analytics/posthog.ts:32 BLOCKED_PROPERTY_NAMES]`
**Warning signs:** Spike `.sh` files contain variable assignments to `TOKEN=` or `AUTH=` etc.

## Code Examples

Verified patterns. Sources cited inline.

### Tossable header
```bash
#!/usr/bin/env bash
# PHASE 128b SPIKE — TOSSABLE. Phase 133 owns G2-REPLY productionization;
# this file is spike-only and SHOULD BE DELETED after the verdict is committed.
set -euo pipefail
```
`[CITED: .planning/spikes/CONVENTIONS.md §"Tossable headers" + 128b-CONTEXT.md code_context "Established Patterns"]`

### Clobber-protected tmux session spawn
```bash
SESSION="spike-128b-pathB-$$"
SCRATCH=$(mktemp -d -t spike-128b-pathB-XXXXXX)
trap 'tmux kill-session -t "$SESSION" 2>/dev/null || true; rm -rf "$SCRATCH"' EXIT

tmux new-session -d -s "$SESSION" -x 240 -y 60 \
  "cd '$SCRATCH' && claude --model haiku"
```
`[CITED: spike 001 L4 script + CONVENTIONS.md §"Clobber-protection"]`

### Snapshot-at-detection loop
```bash
DETECTED=0
for i in $(seq 1 30); do
  sleep 1
  CAP=$(tmux capture-pane -p -t "$SESSION")
  if echo "$CAP" | grep -q "$EXPECTED"; then
    echo "$CAP" > "$SCRATCH/at-detection.txt"
    DETECTED=1
    break
  fi
done
```
`[CITED: spike 001 L3/L4 scripts + CONVENTIONS.md §"Snapshot at moment of detection"]`

### 5-string allowlist pseudo-code (markdown sketch — D-A2)

Use this verbatim or lightly adapted in `128b-SPIKE-DECISION.md`. The spike 001 README §"Privilege & portability sketch" already provides a complete TypeScript form; the planner should reference it rather than re-derive:

```typescript
// PSEUDO-CODE — Phase 133 productionizes (G2-REPLY-04).
// NOT implemented in spike code (CONTEXT D-A2).
const ALLOWED_REPLIES = ['yes', 'no', 'continue', 'abort', 'defer'] as const;
type Reply = typeof ALLOWED_REPLIES[number];

interface TmuxTarget {
  socketPath: string;   // /tmp/tmux-$UID/default on Linux; $TMPDIR/tmux-$UID/default on macOS
  sessionName: string;  // unique per-Claude-Code launch (e.g., "vigil-claude-1715712345")
}

function inject(target: TmuxTarget, reply: Reply): void {
  // 1. Allowlist gate — drift-detector test pins this at the call site (Phase 133 G2-REPLY-04).
  if (!ALLOWED_REPLIES.includes(reply)) {
    throw new Error(`disallowed reply: ${reply}`);
  }
  // 2. Privilege drop — already running as operator's user; tmux socket is 0700.
  //    NO setuid, NO ptrace, NO root.
  // 3. Send the reply text + Enter. tmux send-keys accepts the literal string;
  //    the 5 allowlisted strings are all alphanumeric — no shell-injection surface.
  spawnSync('tmux', [
    '-S', target.socketPath,
    'send-keys',
    '-t', target.sessionName,
    reply,
    'Enter',
  ], { stdio: 'inherit' });
}
```

`[VERIFIED: spike 001 README §"Privilege & portability sketch (D-A2 — markdown only)" lines 182-218]` — the planner does NOT need to re-derive this.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| "Invent a write-back primitive (named-pipe / proc-fd / JSONL re-read)" | "Use `tmux send-keys` — a 30-year-old, battle-tested userspace pty IPC" | 2026-05-14 (spike 001 PASS) | Eliminates need for custom launcher (C1) or privilege-escalating proc-fd write (C2). Path E is structurally a clean refinement of Path C. |
| Phase 128b CONTEXT enumerated 4 paths only (a/b/c/d) | Phase 128b RESEARCH enumerates 5 paths (a/b/c/d/E ★) | 2026-05-14 (this document) | CONTEXT remains the authoritative scope; RESEARCH adds Path E as a 5th. Letter-of-the-law success criterion still requires "at least 3 of (a)/(b)/(c)/(d)" — Path E does NOT substitute. |
| Mac vigil-watch owns write-back | Ubuntu `vigil-tmux-bridge` (new daemon) owns write-back | 2026-05-14 (SURFACE-MAP.md "Recent architecture shift") | vigil-watch (Mac) shrinks to presentation-only; rename to `vigil-mac-companion` is a SEED-018 candidate. |
| Local-network constraint on write-back path | Outbound HTTPS from Ubuntu to Railway | 2026-05-14 (SURFACE-MAP.md) | D-N1 constraint changes shape — Mac Companion HUD still needs local network for G2 ↔ vigil-core, but write-back path (Ubuntu → tmux) is no longer local-network-bound. |
| Push-based write-back architecture (Railway pushes inbound to operator daemon) | Pull-based (Ubuntu daemon consumes outbound SSE) | 2026-05-14 (unknown-user-profile incident) | Single-tenant Ubuntu, no inbound exposure. Bounded blast radius if Railway is compromised. |

**Deprecated/outdated:**
- "Spike code in vigil-core/src/routes/ (like 128a)" — superseded by D-A1 (write-back is OS-side concern, not vigil-core route).
- "vigil-watch as write-back daemon" — superseded by 2026-05-14 architecture shift (Ubuntu `vigil-tmux-bridge`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Path A (JSONL append + IPC) will FAIL active-session test because Claude Code reads JSONL only at startup/resume, not via inotify/SIGUSR1 | Path A methodology, Predicted-Verdict Summary | Risk LOW. If Path A surprises with PASS, Path A would be a 2nd viable production path — verdict still PASS (D-V4 max), just richer Phase 133 options. Verdict is robust. |
| A2 | Path B (stream-json) cannot inject into an already-running interactive `claude` session because `-p` is print-and-exit | Path B methodology, Predicted-Verdict Summary | Risk LOW. `claude --help` confirms `-p` is single-shot; no documented re-attach surface. If wrong, Path B becomes a viable production alternative; verdict unchanged. |
| A3 | Path D (MCP) is structurally inverted — model decides tool calls, Vigil cannot force a call mid-turn | Path D methodology, Predicted-Verdict Summary | Risk MEDIUM. If a future Claude Code version exposes a "force tool call" surface or a server-side tool-result inbox, Path D becomes viable. This is the v3.10+ Deferred Idea per CONTEXT line 222. Verdict unchanged for 128b. |
| A4 | Path C (named-pipe c1) is "structurally superseded by Path E" and does not need empirical testing | Path C methodology recommendation | Risk LOW. CONTEXT D-O4 wallclock cap already permits skipping. The planner can override and add a 30-min c1 probe; this would not change the verdict but would close the empirical loop on (c). |
| A5 | The 2026-05-14 architecture shift (Ubuntu vigil-tmux-bridge replaces Mac vigil-watch as write-back daemon) is current and not contradicted by post-2026-05-14 operator decisions | Phase 133 scope-lock implications §1 | Risk LOW — sourced from SURFACE-MAP.md captured 2026-05-14 (same day as spike 001). If operator's plans evolve before Phase 133, the verdict's Phase 133 scope-lock section must be updated; spike's PASS verdict on Path E itself does NOT depend on the deployment target. |
| A6 | The 5-string allowlist (`yes`/`no`/`continue`/`abort`/`defer`) is the locked authoritative set per G2-REPLY-04 | Code Examples §"5-string allowlist pseudo-code" | Risk MINIMAL — confirmed verbatim in REQUIREMENTS.md G2-REPLY-04 line 47 + CONTEXT D-A2 + spike 001 README. |
| A7 | The operator's existing `claude` install (`/home/morrillboss/.local/bin/claude` 2.1.141) is the same version used for spike 001 and will be used for the planned A/B/D probes | Standard Stack | Risk MINIMAL — verified 2026-05-14 surface probe; spike 001 used 2.1.141. Version drift between now and execution is possible but unlikely to break path semantics for the probes planned. |
| A8 | The MCP stub probe (Path D) can be run via `npx --package @modelcontextprotocol/sdk -- ...` ad-hoc without adding to a project package.json | Standard Stack §Supporting | Risk LOW — standard npm pattern. If the package name has shifted or the stdio transport import path has changed, the probe needs a 5-minute adjustment; the analytical conclusion (inverted model) holds regardless. |
| A9 | Path E's `tmux send-keys` semantics are identical on Ubuntu and macOS (the empirical test ran on Linux, production target is Ubuntu) | Phase 133 scope-lock §3 | Risk LOW — tmux 3.4 is POSIX; socket location differs (`/tmp/tmux-$UID` Linux vs `$TMPDIR/tmux-$UID` macOS) but `-S socket` flag handles this. Spike 001 README §"Iteration 5" already researched this. |

**Most of these assumptions are LOW-risk because Path E's PASS verdict is mechanically dominant per D-V4.** Even if every A/B/C/D prediction is wrong, the overall verdict stays PASS. The assumptions matter for the per-path table's accuracy and the verdict's defensibility, not for the overall PASS/DEGRADE/BLOCK outcome.

## Open Questions (RESOLVED)

### 1. Spike code directory — extend existing `001-tmux-write-back-128b/` or create new `128b-write-back/`?

**What we know:**
- CONTEXT D-A1 specifies `.planning/spikes/128b-write-back/` (a NEW directory).
- Spike 001 already exists at `.planning/spikes/001-tmux-write-back-128b/` and contains the validated Path E artifacts + evidence.

**What's unclear:** Should paths A/B/D probe scripts live in `001-tmux-write-back-128b/` (extending the existing dir) or in `128b-write-back/` (per CONTEXT D-A1)?

**RESOLVED:** **Create `.planning/spikes/128b-write-back/` per CONTEXT D-A1 and keep paths A/B/D probes there. Leave `001-tmux-write-back-128b/` untouched as the validated Path E reference.**

Rationale: (a) honors CONTEXT D-A1 verbatim; (b) the existing spike-001 directory follows the new MANIFEST convention (`001-`/`002-` numbered prefix) whereas D-A1's name follows the older `<phase>-<topic>/` convention — both can coexist; (c) the new dir has a clear purpose ("complete the A/B/D empirical record for the verdict") distinct from spike 001's purpose ("validate Path E"); (d) cross-link both from `128b-SPIKE-DECISION.md` per-path table.

`128b-write-back/README.md` should be brief and explicitly cite spike 001 for Path E.

### 2. Whether to empirically probe Path C (c1 only — FIFO + stdin redirect)

**What we know:**
- CONTEXT D-O1 estimates Path C at 3-4 hours; D-O4 caps at 3 hours.
- Spike 001 §"Position vs. the 4 enumerated 128b paths" frames Path C as "structurally a setup Vigil would have to invent" — and Path E uses tmux as that pre-existing invented launcher.

**What's unclear:** Does the "3 of 4" success criterion benefit from a 30-min Path C c1-only probe (analogous to Path D's 30-min probe)?

**RESOLVED:** **No empirical probe for Path C.** A 30-min c1 probe would conclude "yes, you can launch `claude` with stdin from a FIFO and write to the FIFO" — but that's already obvious from Unix semantics and adds no information beyond what spike 001's Path E framing covers. The verdict's per-path table marks Path C as "INCONCLUSIVE — covered analytically by Path E (structural refinement)" with a citation. This satisfies the "3 of 4" criterion via A + B + D + E.

**If planner disagrees,** budget 30 min for a c1 probe (mkfifo + `cat <FIFO> | claude -p ...`) and skip c2 entirely (ptrace = unsafe-primitive BLOCK per D-V3).

### 3. Whether the 60s Loom (C-2 wallclock checkpoint) should re-record from-scratch or reference spike 001's L4 evidence

**What we know:**
- CONTEXT §Phase Boundary success criterion 3 requires "a working proof-of-concept round-trip" demonstrated via a 60s portfolio Loom.
- Spike 001's L4 has full transcript evidence (`evidence/L4-permission-pause-snapshot.txt` + `evidence/L4-health-check-snapshot.txt` + `evidence/L4-tool-output-marker.txt`) — but no video.

**What's unclear:** Should the operator re-record the Path E round-trip in a 60s Loom, or assemble the Loom from the existing terminal transcripts?

**RESOLVED:** **Re-record live.** The Phase 128a precedent treats the Loom as a portfolio artifact (5s gesture → 5s wide → 10s reaction → 15s session → 25s replay). Path E's round-trip is fast enough (77s wallclock) that a real-time recording fits cleanly. Operator-driven; cannot be `--auto`-executed (C-2 per CONTEXT).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `tmux` | Path E primary; harness for A/B/D | ✓ | 3.4 (`/usr/bin/tmux`) | — |
| `claude` CLI | Test target (all paths) | ✓ | 2.1.141 (`~/.local/bin/claude`) | — |
| Claude Max OAuth | `claude` auth (no `--bare`) | ✓ | active per spike 001 L4 evidence ("Welcome back Jameson Morrill!") | — |
| `bash` | Writer-process language | ✓ | host | — |
| `jq` | JSONL row construction | ✓ (assumed — Vigil project uses jq throughout) | host | — |
| `mkfifo` | Path C (if empirically probed) | ✓ | POSIX util | — |
| Node.js | Path D MCP stub | ✓ (assumed — Vigil project uses Node) | host | If missing, skip Path D empirical probe; lean on analytical-only treatment. |
| `@modelcontextprotocol/sdk` (npm) | Path D MCP stub | ✗ (not in project deps) | will install ad-hoc via `npx` | If npm install fails in spike scope, fall back to a hand-rolled 30-LOC stdio JSON-RPC stub. |
| Real Claude Code JSONL corpus | Path A target file | ✓ | 6 sessions at `~/.claude/projects/-home-morrillboss-dev-dailybrief/` | — |
| Ubuntu target (for Phase 133) | Phase 133 productionization (NOT 128b) | N/A — 128b runs on this Linux workstation per D-T4 | — | N/A |
| macOS target (for Phase 133 backup) | Phase 133 may also touch macOS (vigil-watch presentation-only) | N/A | — | N/A |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:**
- `@modelcontextprotocol/sdk` npm package — fall back to hand-rolled stdio JSON-RPC stub (~30 LOC) if `npx` install fails. The verdict's analytical conclusion (inverted model) holds regardless.

## Validation Architecture

> Phase 128b is a SPIKE — its primary artifact is a verdict, not a feature implementation. The "validation framework" for this phase is the **D-V1 four-step gate** applied mechanically (D-V4) to each per-path probe. There is NO conventional unit-test/Jest/pytest framework in scope; the spike is empirical-or-worthless (D-T3).

### "Test" Framework
| Property | Value |
|----------|-------|
| Framework | Mechanical 4-step gate (CONTEXT D-V1) + max-aggregation (D-V4). Per-path mini-verdict computed by checklist; overall by `MAX(PASS > DEGRADE > FAIL > INCONCLUSIVE)`. |
| Config file | `128b-CONTEXT.md` D-V1 / D-V2 / D-V3 / D-V4 — these are the rubric. |
| Quick run command | `bash .planning/spikes/128b-write-back/pathX-...sh` (per-path probe, ~30 min – 2h) |
| Full suite command | Run path probes B → A → D in order (D-O1 cheapest-first); also Path E is re-runnable via `bash .planning/spikes/001-tmux-write-back-128b/L4-needs-input-pause.sh` if regression-checking. |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| G2-REPLY-01 (criterion 1: at least 3 of (a)/(b)/(c)/(d)) | Empirical record per path | Per-path bash probe | `bash .planning/spikes/128b-write-back/pathA-jsonl-append.sh` + `pathB-stream-json.sh` + `pathD-mcp-probe.sh` | ❌ Plan-time creation |
| G2-REPLY-01 (criterion 2: PASS/DEGRADE/BLOCK verdict) | Mechanical verdict via D-V4 | Markdown checklist | (no automated command — verdict written into `128b-SPIKE-DECISION.md` by spike author) | ❌ Plan-time creation |
| G2-REPLY-01 (criterion 3: working PoC if PASS) | Four-step round-trip evidence | Empirical (spike 001 L4 already PASSed) | `bash .planning/spikes/001-tmux-write-back-128b/L4-needs-input-pause.sh` | ✅ exists; preserves evidence under `001-tmux-write-back-128b/evidence/` |
| G2-REPLY-01 (criterion 4: privilege model sketched) | Markdown pseudo-code | (no automated command — markdown only per D-A2) | (none) | ❌ Plan-time creation in `128b-SPIKE-DECISION.md`; reference spike 001 README §"Privilege & portability sketch" |

### Sampling Rate
- **Per task commit:** N/A — this spike's "tasks" are per-path empirical probes, each one-shot and observed live. The probe transcript IS the test result.
- **Per wave merge:** N/A — single wave (sequential per D-O1 ordering).
- **Phase gate:** All 4 success criteria green in `128b-SPIKE-DECISION.md` before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `.planning/spikes/128b-write-back/` — NEW directory (per D-A1) — Plan-time creation.
- [ ] `.planning/spikes/128b-write-back/README.md` — points to phase artifacts.
- [ ] `.planning/spikes/128b-write-back/pathA-jsonl-append.sh` — Path A probe.
- [ ] `.planning/spikes/128b-write-back/pathB-stream-json.sh` — Path B probe.
- [ ] `.planning/spikes/128b-write-back/pathD-mcp-probe.sh` + `.planning/spikes/128b-write-back/mcp-server.mjs` — Path D probe (optional per Pitfall 7 risk).
- [ ] `128b-SPIKE-DECISION.md` — verdict at TOP, per-path table, privilege-model sketch, Phase 133 scope-lock.
- [ ] `128b-MEASUREMENTS.md` — per-path wallclock + transcripts + cost.
- [ ] `60s-demo.mp4` — operator wallclock checkpoint C-2.

*(No framework install needed — `tmux` + `bash` + `claude` are already on the host.)*

## Security Domain

> Trust posture is a load-bearing concern for the OUTBOUND injection direction this phase opens up. The 5-string allowlist + privilege-drop + tmux-socket-permissions stack is the structural defense.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Spike uses operator's existing Claude Max OAuth; no new auth surface introduced. Phase 133 productionization uses the existing `bearerAuth` middleware. |
| V3 Session Management | no | Spike does not create or terminate user sessions on vigil-core. |
| V4 Access Control | yes | The "writer process drops privileges before injection" requirement (CONTEXT §Phase Boundary success criterion 4) is the access-control gate. **Spike sketches in markdown; Phase 133 G2-REPLY-04 implements + pins.** |
| V5 Input Validation | yes | The 5-string allowlist (`yes`/`no`/`continue`/`abort`/`defer`) IS the input validation surface for the OUTBOUND-injection direction. Spike sketches; Phase 133 implements via drift-detector test at the source-of-truth call site. |
| V6 Cryptography | no | No new crypto surface in this spike. |

### Known Threat Patterns for {Claude Code write-back stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Compromise of vigil-core (Railway) → attacker emits arbitrary strings via SSE → reach operator's Claude Code session | Spoofing / Elevation of Privilege | 5-string allowlist enforced at writer-process (Phase 133); bounded blast radius. Defense-in-depth: tmux socket is `0700` to operator (single-tenant); Ubuntu daemon is outbound-only (no inbound port). |
| Compromise of Ubuntu daemon (vigil-tmux-bridge) → attacker has direct tmux socket access → arbitrary keystrokes into operator's terminal | Tampering | Daemon runs as operator user (no privilege escalation possible above operator's own scope). Drift-detector test pins the allowlist (Phase 133 G2-REPLY-04). Audit log of all replies sent (Phase 133 deferred). |
| Spike-time clobber of operator's live Claude Code session | Tampering | D-T5 clobber-protection: stamp target session ID at spike-start; refuse to write if equals `$CLAUDE_SESSION_ID`. Use unique tmux session names `spike-128b-<L>-$$`. |
| Spike-time secret leak in transcripts | Information Disclosure | D-G1 redaction: avoid `secret`/`token`/`auth`/`bearer`/`apiKey` variable names in spike logs. |
| INBOUND prompt injection (Pitfall 6 — adversarial content captured into thoughts → injected into chat) | Tampering | Different threat model (CHAT-CTX-02 scope). Document the asymmetry; do not conflate with OUTBOUND defense. |
| Path E launcher-detection bypass (operator launches `claude` directly, no tmux wrapper) | Denial of Service (reply doesn't land) | Phase 133 detects via `VIGIL_TMUX_SESSION` env absence; degrades to G2-REPLY-05 banner-ack-only for that session. |

## Sources

### Primary (HIGH confidence — used as canonical)

- `.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-CONTEXT.md` — locked decisions (D-T1..D-N1). Verbatim authority for all User Constraints.
- `.planning/spikes/001-tmux-write-back-128b/README.md` — Path E validation; full investigation trail; D-V1 four-step gate mapping; privilege & portability sketch.
- `.planning/spikes/001-tmux-write-back-128b/evidence/L4-permission-pause-snapshot.txt` — empirical evidence of `needs_input` permission dialog dismissal via tmux.
- `.planning/spikes/001-tmux-write-back-128b/evidence/L4-health-check-snapshot.txt` — empirical evidence of full round-trip + 60s health probe (showing `● 221`).
- `.planning/spikes/001-tmux-write-back-128b/evidence/L4-tool-output-marker.txt` — unique marker proving Bash tool actually executed after permission granted.
- `.planning/research/SURFACE-MAP.md` §"Recent architecture shift (2026-05-14)" — Ubuntu vigil-tmux-bridge takes over from Mac vigil-watch.
- `.planning/REQUIREMENTS.md` lines 42-48 — G2-REPLY-01..05 verbatim.
- `.planning/ROADMAP.md` lines 415-426 — Phase 128b goal + 4 success criteria.
- `.planning/spikes/CONVENTIONS.md` — spike patterns established during spike 001 (tossable headers, clobber-protection, false-positive-resistant sentinels, snapshot-at-detection, evidence preservation).
- `.planning/spikes/MANIFEST.md` — current spike landscape; lists spike 001 with VALIDATED verdict.
- 2026-05-14 surface probes — `tmux -V` → 3.4, `claude --version` → 2.1.141, `claude --help` confirming `-p / --input-format stream-json / --output-format stream-json / --mcp-config / --strict-mcp-config / --allowedTools / --resume / --continue`. JSONL corpus directory listing confirming 6 `.jsonl` files.

### Secondary (MEDIUM confidence — cross-verified)

- `.planning/phases/128a-voice-01-pcm-feasibility-spike/128a-CONTEXT.md` — sister-spike methodology source for tossable code, mechanical verdict computation, 60s portfolio Loom, MEASUREMENTS+SPIKE-DECISION two-artifact shape, operator wallclock checkpoints.
- `.planning/research/PITFALLS.md` §"Pitfall 6" lines 167-194 — INBOUND prompt-injection threat model (cited for the asymmetry argument; 128b is OUTBOUND).
- `.planning/research/ARCHITECTURE.md` — `agent-events-bus`, `agent_events`, `agent_stream` plumbing references for Phase 133 carry-forward (NOT modified by 128b per D-G4).
- `.planning/seeds/SEED-018-unified-distribution-pwa-connections.md` — provides the structural rationale for why `vigil-tmux-bridge` becoming a new install surface is a feature-not-bug (the harder install IS the access boundary).
- `.planning/STATE.md` — confirms milestone v3.9 status, Phase 128b "not started," Phase 128a in awaiting-operator state.

### Tertiary (LOW confidence — single-source / unverified)

- *(None — every claim in this RESEARCH.md is either CITED from a primary source or tagged `[ASSUMED]` in the Assumptions Log.)*

## Metadata

**Confidence breakdown:**
- User Constraints: HIGH — verbatim from CONTEXT.md.
- Path E methodology + verdict: HIGH — empirical, four pieces of preserved evidence, fully reproducible script.
- Path A/B/D predicted verdicts: MEDIUM-HIGH — grounded in CONTEXT D-O1 predictions + claude --help surface probe + spike 001 framing; pending empirical confirmation.
- Path C analytical treatment: HIGH — Path E is a structural refinement; CONTEXT D-O4 cap supports skipping.
- Phase 133 scope-lock (Ubuntu vigil-tmux-bridge): HIGH — sourced from SURFACE-MAP.md captured 2026-05-14 (same day as spike 001).
- Trust posture (unknown-user-profile incident → pull-based architecture): HIGH — operator-surfaced, documented verbatim in SURFACE-MAP.md.
- Pitfalls 1-8: HIGH — every pitfall has either spike 001 empirical citation or CONTEXT clause citation.
- Open Questions: MEDIUM — three genuinely unresolved planner decisions (spike dir location, Path C empirical depth, Loom recording approach).

**Research date:** 2026-05-14
**Valid until:** 2026-06-13 (30 days — stable domain; the spike methodology + tmux + claude semantics are well-grounded; recent architecture shift is locked in SURFACE-MAP.md).

---

*Phase: 128b-g2-reply-01-write-back-path-spike*
*Research output: this document*
*Next: gsd-planner consumes RESEARCH.md → produces `128b-NN-PLAN.md`*
