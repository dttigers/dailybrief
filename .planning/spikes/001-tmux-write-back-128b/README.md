---
spike: 001
name: tmux-write-back-128b
type: standard
validates: "Given an active interactive `claude` session running inside tmux, when a separate non-TTY writer invokes `tmux send-keys -t <session> <reply> Enter`, then Claude processes the reply as the next user turn AND the session continues healthy for ≥60s (128b D-V1 four-step PASS gate)."
verdict: VALIDATED
related: [phase-128b]
tags: [128b, write-back, tmux, claude-code, ipc, needs-input, g2-reply]
---

# Spike 001: tmux send-keys as Claude Code write-back primitive (Path E)

## What This Validates

Phase 128b enumerates 4 candidate write-back paths (A=JSONL append, B=`claude -p` stream-json, C=named-pipe/FIFO to TTY, D=MCP server). This spike validates a **5th path not in the original enumeration**: `tmux send-keys` — a userspace IPC to the tmux server that delivers keystrokes to a pane's pseudo-TTY exactly as if typed by a human.

**Given**: an interactive `claude` session running inside a tmux pane, mid-conversation, paused on a `needs_input` permission dialog.
**When**: a separate non-TTY writer process invokes `tmux send-keys -t <session-name> Enter` from outside the pane.
**Then**: Claude processes the keystroke as the operator's reply, the permission is granted, the gated tool executes, AND the session continues healthy for ≥60 seconds.

This is the **exact** G2-REPLY-01 scenario from Phase 128b: operator walked away, `needs_input` banner fired, can a reply from a non-TTY writer (eventually vigil-watch / a G2 reply) land?

## Research

### Surface check (probed 2026-05-14)

| Tool | Version | Notes |
|------|---------|-------|
| `tmux` | 3.4 (`/usr/bin/tmux`) | POSIX; identical surface on macOS |
| `claude` | 2.1.141 (`~/.local/bin/claude`) | Interactive TUI + `-p` print mode |
| tmux socket | `/tmp/tmux-1000/default` (Linux); `$TMPDIR/tmux-$UID/default` (macOS) | mode `0700`, user-only |

### How `tmux send-keys` works

`tmux send-keys -t <target-pane> key ...` instructs the tmux server to inject each argument into the target pane's pty. Each argument is interpreted as a key-name (`Enter`, `C-d`, `Up`) or, if unrecognised, as a literal string sent character-by-character. The pane's foreground process reads exactly the same byte stream it would have read from a real keyboard. No ptrace, no `/proc/<pid>/fd/0` write, no preflight FD redirect — just an IPC message to the tmux server, which is already authorised to write to the pty it owns.

### Position vs. the 4 enumerated 128b paths

| Path | Mid-session? | Privilege class | Mechanism |
|------|--------------|-----------------|-----------|
| A — JSONL append + IPC | Likely **no** (CLI re-reads only at startup) | User-space file write | File mutation + signal |
| B — `claude -p` stream-json | **No** (`-p` is single-shot) | User-space pipe write | stdin of fresh process |
| C — Named-pipe / FIFO to TTY | Yes, but **requires pre-launch FIFO redirect** OR `ptrace` | Kernel/elevated (ptrace) OR launcher-owned | Direct write to pty / fd |
| D — MCP server hook | "Claude pulls, Vigil pushes" — inverted | User-space MCP tool | Claude calls tool, tool returns reply |
| **E — tmux send-keys** (this spike) | **Yes** | **User-space IPC to tmux server (no elevation)** | tmux server writes to pty it already owns |

Path E is structurally a clean refinement of Path C: the tmux server is a *general-purpose, pre-existing, well-tested* launcher that owns the pty FD. Vigil doesn't have to invent the launcher (C1) or escalate privileges (C2). The constraint: Claude Code must be launched **inside a tmux pane**. This is a deliberate UX (per-session pane = per-session name = per-session write surface).

### Auth gotcha

`claude --bare` strips OAuth/keychain reads and requires `ANTHROPIC_API_KEY`. The operator's normal `claude` auth path uses OAuth (Claude Max). The spike runs without `--bare`.

## How to Run

```bash
# Layered investigation — each script is a separable test.
bash .planning/spikes/001-tmux-write-back-128b/L1-sanity-cat.sh        # ~2s, $0
bash .planning/spikes/001-tmux-write-back-128b/L2-python-repl.sh       # ~3s, $0
bash .planning/spikes/001-tmux-write-back-128b/L3-claude-basic.sh      # ~10s, ~$0.005
bash .planning/spikes/001-tmux-write-back-128b/L4-needs-input-pause.sh # ~80s, ~$0.01
```

All scripts are POSIX bash, no dependencies beyond `tmux` and `claude` (both already on PATH).

## What to Expect

- L1: `cat` running in a tmux pane receives the string `hello-from-tmux-send-keys` via send-keys, writes it to a file.
- L2: a `python3 -i` REPL in a tmux pane evaluates `print('MAGIC...-' + str(7*191))` and prints `MAGIC...-1337` in the pane.
- L3: a fresh interactive `claude --model haiku` session in a tmux pane receives the prompt "Compute seven multiplied by one hundred ninety-one..." and Claude prints `1337` (a digit string that does NOT appear in the prompt — false-positive-resistant).
- L4: an interactive `claude` session reaches the Bash-tool permission dialog (the `needs_input` pause), the dialog is dismissed via `tmux send-keys Enter`, the gated `echo` runs and writes a unique marker to disk, then 60s later a follow-up health probe succeeds.

## Observability

Each script:
1. Spawns a uniquely-named tmux session (`spike-128b-L{N}-$$`) to guarantee no collision with the spike-runner's session (D-T5 clobber-protection).
2. Captures pane content via `tmux capture-pane -p -t <session>` at multiple checkpoints.
3. Snapshots the pane the instant a match is detected (preserves evidence against subsequent TUI re-renders).
4. Saves transcripts under `/tmp/spike-128b-L{N}-XXXXXX/` for postmortem.
5. Calls `tmux kill-session` on exit (trap-cleanup).

Preserved evidence under `.planning/spikes/001-tmux-write-back-128b/evidence/`:
- `L3-claude-response-snapshot.txt` — pane state showing prompt + Claude's `● 1337` response
- `L4-permission-pause-snapshot.txt` — pane state at the `needs_input` permission dialog (3-option Yes/Yes-allow/No)
- `L4-health-check-snapshot.txt` — full round-trip transcript: prompt → tool invocation → tool ran → `DONE` → +60s health probe → `● 221`
- `L4-tool-output-marker.txt` — the unique marker (`L4-TOOL-RAN-91284096`) written to disk by the Bash tool, proving the tool actually executed after permission was granted via tmux

## Investigation Trail

### Iteration 1: L3 false positive (caught and corrected)

**Tried**: Asked Claude to "Reply with exactly the literal string 'L3-PONG-$$' and nothing else." Detected the sentinel `L3-PONG-340926` in pane capture.

**Revealed**: The sentinel was in the *prompt text I sent* — so the `grep -q "$SENTINEL"` matched the echoed prompt, NOT Claude's response. Classic spike false positive. Verdict on Iteration 1 was invalid.

**Corrected**: Redesigned the test to use a *computed* sentinel that does not appear in the prompt — "Compute seven multiplied by one hundred ninety-one" → grep for `1337` (a digit string that the English-words prompt cannot contain). Also added an at-detection snapshot so evidence is preserved across TUI re-renders.

### Iteration 2: `--bare` flag removed claudes' auth surface

**Tried**: Launched `claude --bare --model haiku` (intending to minimize hooks/plugin/memory startup overhead).

**Revealed**: `--bare` strips OAuth and keychain auth; requires `ANTHROPIC_API_KEY` or apiKeyHelper. The operator's Claude Max account auths via OAuth, so `--bare` returned "Not logged in · Please run /login".

**Corrected**: Dropped `--bare`. The full Claude Code startup (with hooks, plugins, auto-memory) is ~3–5s in this environment — acceptable for the spike.

### Iteration 3: workspace-trust dialog turned out to be free signal

**Tried**: Spawned `claude` in a fresh `/tmp/spike-...` cwd.

**Revealed**: Claude renders a "Quick safety check: Is this a project you created or one you trust?" dialog before the TUI input prompt is reached. This *is itself* a `needs_input` pause — one the spike was supposed to test later.

**Corrected**: Used it as Test 0 — dismissed the workspace-trust dialog via `tmux send-keys Enter`, then proceeded. L3 and L4 both demonstrate dialog dismissal via tmux. L4 dismisses TWO dialogs (workspace-trust + Bash permission).

### Iteration 4: L4 full D-V1 four-step gate

**Tried**: Prompt asked Claude to "Run the bash command: echo '$MARKER' > '$SCRATCH/tool.out'." This triggered Claude's permission dialog (default permission-mode, fresh cwd, fresh project).

**Observed timing**:
- Spawn → workspace-trust dialog: ~1s
- Workspace-trust dismissed → TUI ready: <1s
- Tool prompt sent → permission dialog appeared: ~10s (Claude planning the Bash invocation)
- Permission dialog dismissed via tmux send-keys → tool actually ran: <1s
- Marker file present on disk: confirmed at +14s total wallclock
- +60s idle → health probe sent → Claude responded `221`: 3s response time
- Total wallclock: 77s

**Observed evidence** (preserved under `evidence/`):
- The exact 3-option permission dialog: `❯ 1. Yes / 2. Yes, and always allow access to spike-128b-L4-IzINGr/ from this project / 3. No`
- The full transcript: prompt → `● Bash(echo ... > tool.out)` → `⎿ (No output)` → `● DONE` → health probe → `● 221`
- The marker file `tool.out` containing exactly `L4-TOOL-RAN-91284096` (the unique marker passed in the prompt, written by Bash, proving the tool actually executed)

### Iteration 5: portability and privilege model (markdown only — D-A2)

**Researched (not implemented)**:
- tmux socket location: Linux = `/tmp/tmux-$UID/default`, macOS = `$TMPDIR/tmux-$UID/default`. Both `0700`, user-only.
- macOS portability: tmux is the same binary semantics; `tmux send-keys` works identically. No macOS-specific permission semantics (cf. accessibility / screen recording APIs) — tmux operates at the pty layer, not at the OS event layer.
- Privilege model: vigil-watch runs as the operator's user and reads/writes `~/Library/Application Support/Vigil/...`. The tmux socket is in the operator's `$TMPDIR` — same uid, same access. No setuid/elevation needed.
- Production launcher: operator's Claude Code launch wrapper (e.g., a `vigil-claude` shell function) does `tmux new-session -d -s "claude-$(date +%s)" "claude"` then attaches the operator to it. vigil-watch tracks the session name; `tmux send-keys -t "$SESSION" "$ALLOWLISTED_REPLY" Enter` is the entire writer surface.

## Results

### Verdict: VALIDATED (PATH E PASS for 128b D-V1)

| Layer | Test | Verdict | Wallclock |
|-------|------|---------|-----------|
| L1 | tmux send-keys → `cat` → file | ✓ PASS | <2s |
| L2 | tmux send-keys → python3 REPL → evaluated output | ✓ PASS | <3s |
| L3 | tmux send-keys → interactive `claude` → computed response (false-positive-resistant) | ✓ PASS | 4s |
| L4 | Full D-V1 four-step round-trip at `needs_input` permission dialog + 60s health probe | ✓ PASS | 77s |

**128b D-V1 four-step PASS gate, mapped:**

1. ✓ Reply string originates from a separate non-TTY writer process — bash script outside the tmux pane.
2. ✓ The string reaches the target Claude Code session's input channel — verified by `tmux capture-pane` showing the dialog state change and by the gated tool actually executing.
3. ✓ Claude processes the string as the next user turn — verified by the Bash tool producing its output file with the unique marker (only possible after permission was granted via the injected Enter).
4. ✓ The session continues to completion for ≥60 seconds — verified by the health probe `13 * 17` returning `221` after 60s of idle.

**Active-session test passes AND fresh-session test passes ⇒ PASS** (per 128b D-V1).

### Per-128b PASS implication

Per 128b D-V2: a PASS verdict "scope-locks Phase 133 to full G2-REPLY-02..04 (DOUBLE_CLICK enter reply mode → cycle 5 prefabs → DOUBLE_CLICK send → reply lands)".

If 128b's eventual plan adopts Path E (tmux send-keys), it can plausibly:
- Skip empirical testing of Path A (JSONL append) and Path C (FIFO/proc-fd) entirely per D-O2 stop-on-first-PASS short-circuit.
- Still document Path B (stream-json) as a "fresh-session-only fallback" per D-O1.
- Still document Path D (MCP) as the "Claude-pulls" alternative for the v3.10+ deferred case (per CONTEXT line 222).

### Surprises

- **The workspace-trust dialog is itself a perfect `needs_input` instance** — it gave us a free dialog-dismissal demonstration at the start of every claude launch. The spike incidentally validates tmux as a write-back for ANY blocking interactive prompt, not just Bash permission dialogs.
- **The TUI alt-screen behavior eats evidence** unless you snapshot at the moment of detection. L3's first run lost the actual response from the post-test scrollback dump because Claude's TUI re-rendered. Fix: snapshot the pane the instant a match is grep-detected.
- **Claude Code's permission dialog default option is "Yes" (1)**, so `tmux send-keys Enter` alone (no Down-arrow navigation) is sufficient to grant the typical permission. This makes the writer's logic trivial: send the Enter for "approve", or send `Right-Right-Enter` (or similar) for "deny" — both are within the safe character surface (no escape sequences, no shell injection risk).
- **Latency is fast**: ~10s for Claude to plan a Bash invocation and surface the permission dialog; <1s for the tool to actually run after the dialog is dismissed. Total round-trip from "writer sends Enter" to "tool has executed" is sub-second. Well within the G2-REPLY UX target.

### Surfaced constraint (not a blocker, but document for 128b plan)

- **Claude Code must be launched inside a tmux pane** for this path to work. This is a launcher-UX surface: operator launches `claude` via a `vigil-claude` wrapper (or aliases `claude` to `tmux new -As default-vigil 'claude'`). If the operator launches `claude` directly in iTerm/Terminal.app, vigil-watch cannot reach the input channel.
  - Phase 133 productionization MUST surface a "launch via wrapper / detect non-wrapped session" warning (NOT this spike's job).

### Privilege & portability sketch (D-A2 — markdown only)

```typescript
// PSEUDO-CODE — Phase 133 productionizes (G2-REPLY-04)
const ALLOWED_REPLIES = ['yes', 'no', 'continue', 'abort', 'defer'] as const;
type Reply = typeof ALLOWED_REPLIES[number];

interface TmuxTarget {
  socketPath: string;   // $TMPDIR/tmux-$UID/default on macOS, /tmp/tmux-$UID/default on Linux
  sessionName: string;  // unique per-Claude-Code launch (e.g., "vigil-claude-1715712345")
}

function inject(target: TmuxTarget, reply: Reply): void {
  // 1. Allowlist gate — drift-detector test pins this at the call site (G2-REPLY-04)
  if (!ALLOWED_REPLIES.includes(reply)) {
    throw new Error(`disallowed reply: ${reply}`);
  }

  // 2. Privilege drop — already running as operator's user; tmux socket
  // is 0700 to operator. NO setuid, NO ptrace, NO root.

  // 3. Send the reply text + Enter. Note: tmux send-keys accepts the literal
  // string as a single arg, no shell-injection surface for the 5 allowlisted
  // strings (all alphanumeric, no special chars).
  spawnSync('tmux', [
    '-S', target.socketPath,
    'send-keys',
    '-t', target.sessionName,
    reply,
    'Enter',
  ], { stdio: 'inherit' });
}

// 4. For dialog-only dismissal (banner-ack without a typed reply):
function dismissDialog(target: TmuxTarget, choice: 'accept' | 'deny'): void {
  // Default option is "Yes" (1); navigate to "No" (3) requires Down-Down
  const keys = choice === 'accept' ? ['Enter'] : ['Down', 'Down', 'Enter'];
  spawnSync('tmux', ['-S', target.socketPath, 'send-keys', '-t', target.sessionName, ...keys]);
}
```

Production hardening (Phase 133, NOT this spike):
- Session-discovery: `tmux list-sessions -S <socket> -F '#{session_name}'` to verify target exists before send-keys.
- Rate-limit: max 1 reply per `needs_input` event (track event-id in vigil-watch).
- Clobber-protect: refuse to send-keys to a session that doesn't match a known-managed prefix (e.g., `vigil-claude-*`).
- Audit log: append `{ts, session, reply, event_id}` to a redacted ledger.
- macOS-specific: tmux must be installed (`brew install tmux`); operator-facing onboarding documents this.

### Three Phase 133 implications

1. **Path E is the recommended primary path.** It satisfies D-V1 PASS, is user-space, requires no ptrace/elevation, and uses a battle-tested IPC. The 5-string allowlist is the only injection surface that reaches `tmux send-keys`.
2. **Launcher wrapper is required.** Phase 133's onboarding step is "operator launches Claude Code via `vigil-claude` (or equivalent)". If the operator launches Claude Code directly, vigil-watch should detect (e.g., by absence of `VIGIL_TMUX_SESSION` env in the running claude's process tree) and degrade to G2-REPLY-05 banner-ack-only for that session.
3. **Path E generalizes beyond Claude Code.** Any TTY-reading interactive program in a tmux pane is now a write-back target — including a future "select from list of open tmux sessions, drop into one live" UX (cf. the operator's framing question 2026-05-14 that motivated this spike). This is upside, not in scope for 128b.

### Cost

- L1 + L2: $0 (no Anthropic API calls)
- L3: ~$0.005 (1 Haiku turn)
- L4: ~$0.01 (2 Haiku turns + 1 tool call)
- Total: <$0.02. Well within the operator's Claude Max plan; documented for GUARD-03 reference (D-G3 N/A but documented anyway).
