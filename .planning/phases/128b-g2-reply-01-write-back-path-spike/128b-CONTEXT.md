# Phase 128b: G2-REPLY-01 write-back path spike - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning
**Mode:** `--auto`-style (user authorized "work without stopping for clarifying questions"; gray areas resolved with recommended defaults grounded in Phase 127 guardrail outputs + Phase 127.5 hardware-verified gesture verdict + Phase 128a sister-spike precedent + empirical `claude --help` surface probe)

<domain>
## Phase Boundary

**Empirically prove or rule out a programmatic-input injection path into an active Claude Code session.** The Even SDK exposes ZERO write-back primitives — Vigil must invent the path. This is a SPIKE, not a feature build; the writer process exists only to answer "does any path work cleanly enough for production?"

Phase 128b succeeds when:

1. **`128b-SPIKE-DECISION.md`** records empirical results for **at least 3 of the 4 candidate paths** (per G2-REPLY-01 success criterion):
   - **(a) JSONL append + IPC** — append a `user`-role row to `~/.claude/projects/{cwd-esc}/{session-id}.jsonl` and signal Claude Code to re-read.
   - **(b) `@anthropic-ai/claude-code` SDK hook** — `claude -p --input-format stream-json --output-format stream-json` (the canonical SDK streaming surface confirmed by 2026-05-14 `claude --help` probe).
   - **(c) Named-pipe / FIFO to operator TTY** — write to the FD Claude Code's terminal is reading from (Unix-only, but matches the operator-Mac shape).
   - **(d) MCP server hook** — register an MCP server that exposes a tool which can prompt or inject content into the running session (`--mcp-config` surface confirmed by `claude --help` probe).
2. **Decision file resolves to exactly one verdict** — `PASS` / `DEGRADE` / `BLOCK` — against the thresholds locked in D-V1..D-V3 below.
3. **If PASS** — a working proof-of-concept round-trip exists: the string `yes` originating from a non-TTY writer process **reaches the active Claude Code session, is processed as the next user turn, AND Claude responds to it as if typed** (the four-step round-trip in D-V1 — not just "string in buffer").
4. **Privilege model is sketched** — pseudo-code or short prose in `128b-SPIKE-DECISION.md` showing: writer process drops privileges before injection; prefab-allowlist (`yes` / `no` / `continue` / `abort` / `defer` — five strings, locked by G2-REPLY-04) is the only string surface that reaches the input channel. Sketch only — not implemented in spike code (D-A2 below).

**Not in scope** — the G2-side gesture-to-POST UX, the `POST /v1/agent-replies` vigil-core route, the `<thought>` injection-defense pattern from CHAT-CTX-02, the writer-process production hardening, multi-platform support (Linux/Windows/macOS), session-lifecycle handling beyond a single round-trip, retry/backoff for failed writes, the recording LED indicator, and any vigil-watch Swift changes. All of those belong to Phase 133 (G2-REPLY-02..05 productionization). The spike's job is to answer "which path works" — not "ship the writer."

</domain>

<decisions>
## Implementation Decisions

### Test target — what counts as "a Claude Code session"

- **D-T1 — Primary test target: a REAL operator-driven interactive `claude` session, mid-turn.** Reason: the entire problem G2-REPLY exists to solve is "operator walked away mid-task; `needs_input` banner fired; can a reply from G2 land?" Fresh `claude -p --input-format stream-json` sessions are trivially injectable (just pipe to stdin) and prove nothing about the production case. The spike author opens a normal `claude` session, runs to a `needs_input`-like pause (e.g., a permission prompt or a confirmation question), then attempts each of the 4 injection paths from a SEPARATE writer-process shell. PASS requires the live session to actually advance.
- **D-T2 — Secondary probe (per path that PASSes D-T1): fresh `claude -p` session.** If any path PASSes the active-session test, run a fresh-session smoke to confirm the path doesn't depend on accidental session state. If a path FAILS active-session but PASSes fresh-session, that's a DEGRADE signal (not BLOCK) — production may be able to constrain itself to fresh sessions per reply.
- **D-T3 — Synthetic stub is REJECTED.** Mocking the JSONL/stdin surface would let any of the 4 paths PASS trivially and produces zero signal about real Claude Code behavior. The spike is empirical or it's worthless.
- **D-T4 — Test machine: this dev workstation (Linux, `/home/morrillboss/dev/dailybrief`), NOT operator's macOS Mac.** Reason: the spike's question is OS-agnostic at the abstraction level (JSONL append / SDK stream-json / FIFO / MCP all exist on Linux). vigil-watch is a Swift macOS daemon and is NOT cloned locally — but the spike does NOT need vigil-watch. ANY writer process (Bash/Node/Python ad-hoc script) is sufficient. If a path PASSes on Linux but a macOS-specific concern is plausible (e.g., named-pipe permission semantics, code-signing of a daemon writing to TTY), document the concern in the verdict's "macOS-portability risks" section — but do NOT block the spike on cross-platform re-verification. Phase 133 productionizes on macOS.
- **D-T5 — Real Claude Code JSONL session corpus is available** at `~/.claude/projects/-home-morrillboss-dev-dailybrief/`. Multiple `.jsonl` files exist from this very project. Spike's JSONL-append test (Path A) operates on a real session ID from this corpus — no need to fabricate session state. Note: spike code MUST NOT alter the **current/live** Claude Code session that's running the spike itself (clobber-protect by stamping the writer's target session ID at spike-start and refusing to write if it equals `$CLAUDE_SESSION_ID` if set, or by spawning a separate disposable session via `claude` in a tmux/screen pane).

### Candidate ordering + cheap-elimination strategy

- **D-O1 — Test order (cheapest to most expensive wallclock):**
  1. **(b) SDK stream-json hook** — `claude -p --input-format stream-json --output-format stream-json` is the canonical advertised path. ~30 min: launch a session, pipe a `{"type":"user","message":...}` line, observe whether stdout produces a response. Likely PASSes for fresh sessions; the active-session question is whether stdin is re-readable mid-interactive (it almost certainly is NOT — `-p` is print-and-exit). Probable verdict: **PASS fresh-session / FAIL active-session / DEGRADE overall** if no other path PASSes.
  2. **(d) MCP server hook** — register a tiny MCP server (Node `@modelcontextprotocol/sdk` or a hand-rolled stdio server) that exposes a `vigil_external_reply` tool taking a `{reply: string}` arg. If Claude Code can be configured to auto-call the tool on `needs_input` (or the operator pre-registered an agent that listens for it), the reply round-trips. ~1-2h. Limitation: MCP tools are tools Claude CALLS, not channels that PUSH to Claude. The injection model is inverted; this likely DEGRADEs ("operator's MCP server can SURFACE a buffered reply when Claude asks, but cannot interrupt Claude when it's mid-tool").
  3. **(a) JSONL append + IPC** — append a `{"type":"user","content":"yes",...}` line to `{session-id}.jsonl`; signal Claude Code via SIGUSR1 / inotify trigger / `--resume <session-id>` from a fresh process. ~2-3h. Critical sub-question: does the running interactive `claude` process re-read the JSONL mid-session, or only at startup? Likely NO mid-session re-read, in which case Path A is BLOCK unless paired with a session-restart.
  4. **(c) Named-pipe / FIFO to operator TTY** — write to the FD of Claude Code's terminal. Two flavors: (c1) `mkfifo` and launch `claude` with stdin redirected from the FIFO; (c2) write to `/proc/<claude-pid>/fd/0` directly. (c1) requires changing how Claude Code is launched in the first place (acceptable for a launcher wrapper); (c2) requires `ptrace` privileges and is brittle. ~3-4h. Most likely to PASS for fresh-launched sessions (just stdin redirection), but the production shape would require Vigil to OWN how the operator launches Claude Code.
- **D-O2 — Stop-on-first-PASS short-circuit.** As soon as ONE path produces a confirmed 4-step active-session round-trip (D-V1), STOP and write the verdict. The remaining paths are marked "not tested — first PASS sufficient." G2-REPLY-01's "at least 3 of 4" success criterion is satisfied by recording the empirical results of paths 1-3 from the ordering (even if PASS lands on path 2, paths 1+2 + the documented decision-not-to-test paths 3+4 still produces a defensible verdict).
- **D-O3 — Stop-on-three-BLOCKS short-circuit.** If the first three paths in D-O1 order all produce BLOCK verdicts (no clean round-trip), short-circuit to overall BLOCK without attempting path 4. The empirical signal is sufficient; path 4 (named-pipe) is the lowest-likelihood-of-clean-PASS path and not worth the wallclock if 3 of 4 already failed.
- **D-O4 — Per-path wallclock cap.** No single path exceeds **3 hours** of investigation. If a path looks promising but exceeds the cap, mark it `INCONCLUSIVE` rather than continuing — the spike's job is to triage, not productionize. Phase 133 productionization gets unbounded wallclock.

### Round-trip definition — what counts as PASS

- **D-V1 — PASS gate (four-step round-trip, ALL FOUR required):**
  1. Reply string `yes` originates from a separate non-TTY writer process (Bash heredoc, Node script, etc.).
  2. The string reaches the target Claude Code session's input channel (verified by inspection — JSONL row added, stdin readable, MCP tool result received, etc.).
  3. Claude Code processes the string as the next user turn (verified by Claude responding to it — output stream shows acknowledgment OR session log shows new user-turn row).
  4. The Claude Code session continues to completion (does NOT crash, hang, or enter an error state for at least the next 60 seconds after the injected reply).
  - Active-session test passes AND fresh-session test passes ⇒ **PASS**. Scope-locks Phase 133 to full G2-REPLY-02..04 (DOUBLE_CLICK enter reply mode → cycle 5 prefabs → DOUBLE_CLICK send → reply lands).
- **D-V2 — DEGRADE gate (ANY of, but NOT in BLOCK range):**
  - Round-trip works ONLY on fresh `claude -p` sessions, NOT mid-interactive-session.
  - Round-trip works mid-session BUT requires operator to press ENTER once after injection (the string lands but doesn't auto-submit).
  - Round-trip works for fresh-session BUT cleanup is partial (session shows the injection but doesn't behave identically to typed input — e.g., missing user-turn id, hooks not firing, etc.).
  - DEGRADE scope-locks Phase 133 to **G2-REPLY-05: banner-ack-only** (DOUBLE_CLICK dismisses the `needs_input` banner locally + POSTs `agent_banner_acked` analytics; no write-back; G2-REPLY-02/03/04 retire). Document the specific DEGRADE rationale in `128b-SPIKE-DECISION.md`.
- **D-V3 — BLOCK gate (ANY of):**
  - All 3+ tested paths produce no observable round-trip (string never reaches session OR session crashes/hangs on injection).
  - Round-trip "works" only with unsafe primitives (e.g., `ptrace` requiring elevated permissions, kernel-level fd injection) that no production writer process can use safely.
  - The active-session test reveals state-corruption (e.g., injected user-turn appears but subsequent Claude responses reference the WRONG conversation state, indicating the JSONL persistence layer was confused).
  - BLOCK scope-locks Phase 133 to **G2-REPLY-05 banner-ack-only** AND adds an explicit "v3.10+ re-activation conditions" block to `128b-SPIKE-DECISION.md` per the SEED-003 DMARC pattern. Three example re-activation conditions: (i) `@anthropic-ai/claude-code` ships an explicit out-of-band-input API; (ii) Claude Code SDK exposes a session-handle that can be appended to via IPC; (iii) operator adopts a tmux-wrapped launcher that gives Vigil control of the stdin FD.
- **D-V4 — Verdict is mechanically computed.** The author does NOT decide at write-up time. Each tested path produces a per-path mini-verdict (PASS / DEGRADE / FAIL / INCONCLUSIVE) by mechanically applying the four-step gate. The overall verdict is: `MAX(per-path-verdict, ordered PASS > DEGRADE > FAIL > INCONCLUSIVE)`. The spike author writes the verdict at the TOP of `128b-SPIKE-DECISION.md` followed by the per-path table; the verdict is NOT editable once written (Phase 128a D-V1 precedent — if a re-test contradicts, open Phase 128b.1).

### Spike code location + privilege/allowlist model depth

- **D-A1 — Spike code lives under `.planning/spikes/128b-write-back/`** (NEW directory, ad-hoc TS/Bash/Python scripts). NOT in `vigil-core/src/routes/` and NOT in `vigil-g2-plugin/scripts/`. Reason: the 128a spike kept its code in `vigil-core/src/routes/voice-spike.ts` + `vigil-g2-plugin/scripts/voice-spike-page.html` because those locations were ALSO where Phase 130 productionization would live (so the spike scaffold is overwrite-in-place). The 128b write-back path is fundamentally an OS-side concern (file/pipe/IPC/MCP) — it does NOT belong in vigil-core routes, the G2 plugin, or any client surface. A separate `.planning/spikes/128b-write-back/` dir keeps the throwaway code out of the production tree entirely.
- **D-A2 — Privilege/allowlist model is SKETCHED IN MARKDOWN, not implemented in spike code.** Reason: the 5-string allowlist (`yes`/`no`/`continue`/`abort`/`defer`) is a one-line constant; the privilege-drop depends on the chosen path (named-pipe writes need different priv-drop than MCP); implementing both in throwaway spike code triples the wallclock without changing the verdict. The verdict is "does any path work cleanly?" — not "does the production-shape work cleanly?" Sketch in `128b-SPIKE-DECISION.md` with concrete pseudo-code per winning path:
  ```
  // Pseudo-code, NOT spike-implemented
  const ALLOWED_REPLIES = ['yes', 'no', 'continue', 'abort', 'defer'] as const;
  function inject(reply: typeof ALLOWED_REPLIES[number]) {
    if (!ALLOWED_REPLIES.includes(reply)) throw new Error('disallowed');
    dropPrivileges();  // path-specific: setuid / capability-drop / unshare
    // path-specific: appendJsonl(reply) | writeStreamJson(reply) | writeFifo(reply) | mcpResolve(reply)
  }
  ```
  Phase 133 implements this for real with drift-detector tests pinning the allowlist (G2-REPLY-04 success criterion).
- **D-A3 — `POST /v1/agent-replies` vigil-core route is NOT in 128b scope.** That route is Phase 133's surface (G2 plugin → vigil-core → writer-process → Claude Code session). 128b's writer-process is invoked DIRECTLY (curl-style, CLI args, env vars) — no vigil-core involvement. This is a deliberate scope reduction: the spike's question is the "writer → session" half of the round-trip, not the "G2 → server → writer" half. If the writer half BLOCKs, the server half is moot.
- **D-A4 — Spike artifacts (all under `.planning/phases/128b-g2-reply-01-write-back-path-spike/`):**
  - `128b-CONTEXT.md` (this file)
  - `128b-DISCUSSION-LOG.md` (auto-discuss audit)
  - `128b-RESEARCH.md` (gsd-phase-researcher output — uses canonical_refs below)
  - `128b-NN-PLAN.md` (gsd-planner output)
  - `128b-SPIKE-DECISION.md` (verdict at TOP + per-path table + privilege-model sketch + Phase 133 scope-lock implication)
  - `128b-MEASUREMENTS.md` (per-path wallclock log, observed Claude Code behavior, command transcripts; supports SPIKE-DECISION)
  - `60s-demo.mp4` (success-criterion proxy — short Loom demonstrating the round-trip OR documenting the failure mode; mirrors Phase 128a precedent)

### Phase 127 guardrail inheritance

- **D-G1 — GUARD-01 redaction applies to the spike's logs.** The 5 prefab replies are short and non-secret, but per-path command transcripts may include session IDs, fd numbers, or process names. Spike code's `console.log` calls MUST avoid naming local vars `secret`/`token`/`auth`/`bearer`/`apiKey` etc. — the existing `BLOCKED_PROPERTY_NAMES` Set extension precedent (`vigil-core/src/analytics/posthog.ts:32`) applies even though this spike doesn't go through PostHog. Drift-detector tests are OUT of scope (Phase 128a D-Discretion precedent — drift detectors are Phase 133 G2-REPLY-04 scope).
- **D-G2 — GUARD-02 audio cap N/A for this spike** (no audio path).
- **D-G3 — GUARD-03 budget watermark N/A for this spike.** Path B (SDK stream-json) DOES make Anthropic API calls under the hood — but the spike runs ≤20 short prompts total (~$0.10) against the operator's personal `claude` auth, not under a multi-user budget. Document the cost in `128b-MEASUREMENTS.md` for future reference.
- **D-G4 — Existing `agent_events_bus` plumbing is referential, not modified.** `vigil-core/src/lib/agent-events-bus.ts` + `vigil-core/src/routes/agent-events.ts` + `vigil-core/src/routes/agent-stream.ts` exist and ship the `needs_input` event type. Phase 133 will add `agent_banner_acked` (DEGRADE/BLOCK) and `agent_reply_sent` (PASS) event types — NOT this spike. Spike just confirms the round-trip is feasible.

### Companion HUD local-network constraint (operator note 2026-05-14)

- **D-N1 — The current Companion HUD only works when the operator is on the local network.** This means G2 ↔ vigil-core SSE plumbing requires local-network reachability (iPhone-tethered + Hub-foreground + same Wi-Fi as vigil-core's exposed surface). This is OUT OF SCOPE for 128b (the spike doesn't touch the G2 ↔ vigil-core path), but it has TWO implications:
  - The 60s portfolio Loom (success criterion #3) — if it demonstrates the END-TO-END flow from physical G2 → Mac, it requires the operator to be on the local network. ACCEPTABLE — the Loom is recorded at the operator's desk anyway. Spike author records the Loom from-G2-to-Mac on local network OR from-curl-to-Mac OFFline; either form satisfies the success criterion as long as the writer-process round-trip is demonstrated.
  - Phase 133 productionization MUST surface the local-network constraint in its operator UX (operator off-network → reply doesn't land → some user-facing signal). NOT this spike's job to fix, but worth flagging in `128b-SPIKE-DECISION.md` "Phase 133 scope-lock implications."

### Operator wallclock checkpoints

Per `[feedback_wallclock_checkpoint_exempt]` memory: the following steps are exempt from `--auto` execution and MUST appear as explicit wallclock checkpoints in PLAN.md:

- **C-1** — Live `claude` interactive session at the spike author's workstation (D-T1). Operator-driven; cannot be simulated.
- **C-2** — 60s portfolio Loom recording (success criterion proxy). Operator-only.

(Notably FEWER wallclock checkpoints than 128a — this spike is workstation-only, no G2 hardware, no battery delta, no Railway env, no Even Hub portal. The whole spike fits in 1 dev-machine day.)

### Claude's Discretion

- Exact writer-process language for each path (Bash one-liner vs Node script vs Python) — researcher/planner pick per path's idioms.
- Exact log format for the per-path measurement transcript — researcher/planner pick (must satisfy D-G1).
- Whether to attempt a 4th path (D-O1 path d, named-pipe) if the first 3 produce a clear PASS or BLOCK — short-circuit by default, but author can opt to test all 4 if wallclock permits and the verdict is borderline.
- Whether the live test session is operator-driven `claude` in this terminal OR a tmux-wrapped disposable session — both work; default to tmux-wrapped to protect the spike author's own working session (D-T5 clobber-protection).
- The exact pseudo-code shape for the privilege-model sketch — researcher/planner pick the verb and the per-path specifics; only the 5-string allowlist constant is fixed.
- Drift-detector tests for the spike scaffold are **explicitly skipped** (drift detectors are Phase 133 G2-REPLY-04 scope per REQUIREMENTS).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements
- `.planning/ROADMAP.md` §"Phase 128b: G2-REPLY-01 write-back path spike" — goal + 4 success criteria
- `.planning/REQUIREMENTS.md` §"G2-REPLY — Quick replies from glasses to Claude Code" lines 42-48 — G2-REPLY-01 verbatim + G2-REPLY-02..05 (downstream Phase 133 scope; spike author reads to understand what PASS/DEGRADE unlocks)
- `.planning/PROJECT.md` §"Current Milestone: v3.9 Voice & Companion Polish" — "Simple replies via G2 — close the ambient loop" rationale + "Second spike-first gate: G2-REPLY-SPIKE" framing

### Sister-spike precedent (load-bearing for spike methodology)
- `.planning/phases/128a-voice-01-pcm-feasibility-spike/128a-CONTEXT.md` — sister spike (VOICE-01). Pattern source for: tossable code with TOSSABLE header, mechanical verdict computation, 60s portfolio Loom, MEASUREMENTS.md + SPIKE-DECISION.md two-artifact shape, operator wallclock checkpoints, BLOCK→three-re-activation-conditions per SEED-003 DMARC pattern.

### Phase 127 guardrail outputs (load-bearing — spike INHERITS, does NOT modify)
- `.planning/phases/127-pre-spike-guardrails/127-CONTEXT.md` — full Phase 127 decisions; relevant section: D-01 (audio-PCM log redaction extends to spike logs per D-G1).
- `vigil-core/src/analytics/posthog.ts:32` — `BLOCKED_PROPERTY_NAMES` Set; spike's `console.log` calls MUST avoid naming reply-content vars after blocked keys.
- `vigil-core/src/lib/sentry.ts` (Phase 127 GUARD-01) — `beforeSend` redactor; spike's Sentry breadcrumbs MUST flow through this (if the spike emits any).

### Phase 127.5 audit verdict (load-bearing — gesture-grammar input)
- `.planning/phases/127.5-g2-input-gesture-audit/127.5-AUDIT.md` — REACTIVATE verdict for single-press; **but** plumbing patch deferred to Phase 133. Spike MUST assume DOUBLE_CLICK only for the eventual G2-side UX (which is OUT of 128b scope anyway).
- `[project_g2_companion_doubletap_hardware_verified]` (auto-memory) — 2026-05-10 live hardware test confirming Companion DOUBLE_CLICK_EVENT fires reliably.

### Existing agent-events + Claude Code session plumbing (reference / pattern source)
- `vigil-core/src/lib/agent-events-bus.ts` — `Map<userId, EventEmitter>` bus singleton (Phase 124). Phase 133 will add `agent_reply_sent` event type emitted from the writer-process callback; spike just confirms the round-trip is feasible.
- `vigil-core/src/routes/agent-events.ts` — `POST /v1/agent-events` idempotency + 5-event enum (line 21 has the CHECK constraint pin). Phase 133's `POST /v1/agent-replies` route will mirror this shape.
- `vigil-core/src/routes/agent-stream.ts` — `GET /v1/agent-stream` SSE fan-out + Last-Event-ID resume. Phase 133's reply-confirmation banner echoes through this same SSE channel.
- `vigil-g2-plugin/src/screens/companion.ts` — Companion HUD with DOUBLE_CLICK_EVENT handler. Phase 133's G2-REPLY-02 will extend this with reply-mode state machine; OUT of 128b scope.
- `~/.claude/projects/-home-morrillboss-dev-dailybrief/*.jsonl` — real Claude Code session JSONL corpus for this very project (multiple files present 2026-05-14). Spike Path A (JSONL append) operates on a copy of one of these.

### Claude Code surface (empirically probed 2026-05-14)
- `claude --help` output (Bash probe 2026-05-14) — confirms: `--print/-p`, `--input-format stream-json`, `--output-format stream-json`, `--replay-user-messages`, `--include-hook-events`, `--mcp-config`, `--resume <session-id>`, `--continue`. **These are the spike's primary API surface.** Path B (SDK stream-json) and Path D (MCP) both have first-class CLI flags; Paths A (JSONL append) and C (named-pipe) are unofficial / OS-side workarounds.
- Anthropic public docs — agent SDK / Claude Code documentation (researcher should fetch the latest at planning time; pin URLs in `128b-RESEARCH.md`). Particularly: any documentation of `--resume` semantics for re-reading session state, MCP server hook lifecycle, and stream-json input shape.

### Research outputs (cross-feature)
- `.planning/research/PITFALLS.md` §"Pitfall 6 — Prompt injection via captured thoughts in chat context" (lines 167-194) — adjacent concern (the INBOUND injection direction); 128b is the OUTBOUND injection direction (Vigil writing TO Claude Code, allowlisted to 5 strings) so the 5-string allowlist + privilege-drop is the structural defense. CHAT-CTX-02's `<thought>` delimiter pattern does NOT apply here (different problem shape).
- `.planning/research/ARCHITECTURE.md` §"agent_events + agent_stream" plumbing — reference for the eventual `agent_reply_sent` event type Phase 133 will add.

### Operator runbooks + memory references
- `[Wallclock checkpoints exempt from skip_checkpoints]` (auto-memory) — C-1..C-2 above are wallclock; `--auto` does NOT execute them.
- `[project_g2_companion_doubletap_hardware_verified]` (auto-memory) — 2026-05-10 hardware test confirming Companion DOUBLE_CLICK_EVENT fires reliably; informs Phase 133 G2-REPLY-02 gesture choice (NOT this spike's concern, but documented for downstream).
- vigil-watch lives at `github.com/dttigers/vigil-watch` (NOT cloned locally as of 2026-05-14) — Phase 133's writer-process candidate. 128b spike does NOT need vigil-watch; ANY writer process is sufficient.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (free wins for the spike)

- **Real Claude Code JSONL corpus** at `~/.claude/projects/-home-morrillboss-dev-dailybrief/` (≥3 `.jsonl` session files present 2026-05-14). Spike's Path A (JSONL append) copies one of these to a scratch dir and tests append+signal on the copy. NO need to fabricate session state.
- **`claude` CLI is installed** at `/home/morrillboss/.local/bin/claude` (probed 2026-05-14). Spike author can invoke `claude --resume <session-id>` / `claude -p --input-format stream-json` directly — no setup required.
- **MCP scaffold examples exist in the Vigil repo via `--mcp-config` precedent** (operator's own Claude Code setup, evidenced by `--mcp-config` being a real flag). Spike's Path D author can crib from any minimal MCP server stub (`@modelcontextprotocol/sdk` Node template) — ~30 LOC.
- **Operator's tmux/screen availability** — spike author can wrap a disposable `claude` session in a tmux pane to protect the spike-runner's own working session (D-T5 clobber-protection).
- **No new Vigil dependencies** — entire spike runs against existing `claude` CLI + standard Unix primitives (mkfifo, kill -USR1, jq, etc.). No `npm install`, no Drizzle migration, no Railway env.

### Established Patterns

- **Tossable spike code with TOSSABLE header** (Phase 128a D-A2 precedent — `// PHASE 128a SPIKE — TOSSABLE. Phase 130 owns hardening; this file is spike-only ...`). Adapt for 128b: `// PHASE 128b SPIKE — TOSSABLE. Phase 133 owns G2-REPLY productionization; this file is spike-only and SHOULD BE DELETED after the verdict is committed.`
- **Mechanical verdict computation** (Phase 128a D-V1 precedent). Each per-path mini-verdict is computed by mechanically checking the four-step PASS gate (D-V1) against the empirical run; overall verdict aggregates per the D-V4 max rule. NOT subjective at write-up time.
- **Operator wallclock as explicit PLAN.md task** (Phase 125 Plan 11 + Phase 127 Plan 05 + Phase 128a C-1..C-5 precedents). Spike's C-1..C-2 follow the same shape; `--auto` cannot execute them.
- **Verdict at TOP of SPIKE-DECISION.md** (Phase 128a D-V1 precedent). The first line of `128b-SPIKE-DECISION.md` MUST be `**VERDICT: PASS / DEGRADE / BLOCK**` with the specific evidence that drove the verdict cited immediately after.
- **BLOCK → three re-activation conditions** per SEED-003 DMARC pattern (Phase 119 + 128a D-BLOCK precedent). If 128b returns BLOCK, the verdict must list three explicit re-activation conditions for revisiting in v3.10+.

### Integration Points (THIS SPIKE TOUCHES NONE)

- The spike does NOT modify vigil-core (no new routes, no schema, no migrations).
- The spike does NOT modify vigil-g2-plugin (no new screens, no new event handlers).
- The spike does NOT modify vigil-watch (separate repo; not cloned locally).
- The spike does NOT modify vigil-pwa (no new error codes, no UI).
- The spike's ONLY output is the four verdict artifacts in `.planning/phases/128b-g2-reply-01-write-back-path-spike/` plus throwaway probe scripts in `.planning/spikes/128b-write-back/`.

This is the most isolated phase in v3.9 — almost all complexity is in the verdict shape and the per-path empirical methodology, not in code.

</code_context>

<specifics>
## Specific Ideas

- **"60s Loom" demonstration shape** — Mirror Phase 128a precedent (5s gesture close-up → 5s wide shot → 10s HUD reaction → 15s session reaction → 25s split-screen replay). For 128b PASS, the wide shot shows the writer-process invocation (terminal command) + the active `claude` session in another pane responding. For DEGRADE, the Loom shows the limitation (e.g., "works only on fresh sessions" caption with side-by-side fresh-vs-active demo). For BLOCK, the Loom is a 30-second failure-mode documentation, NOT a portfolio piece.
- **Spike author = single operator** — per D-T4 (Linux workstation, ad-hoc scripts). No second-operator dry-run.
- **Disposable test session pattern** — Open `tmux new -s spike-target`, run `claude` inside, run to a `needs_input`-like state (e.g., `claude` then ask it to do something that requires a permission prompt). In another shell, run the per-path writer. Observe behavior in the tmux pane. Document the outcome. Kill `tmux kill-session -t spike-target` between paths. Reproducible, isolated, doesn't touch the spike author's own working session.
- **Spike runs on `main` branch directly** (UNLIKE Phase 128a which used a feature branch). Reason: the spike touches zero in-tree code (only `.planning/` markdown + a `.planning/spikes/` throwaway dir). No feature branch needed; commits are documentation only.

</specifics>

<deferred>
## Deferred Ideas

- **`POST /v1/agent-replies` vigil-core route** — Phase 133 scope (G2-REPLY-03 endpoint). 128b spike's writer-process is invoked directly without this route.
- **vigil-watch Swift daemon changes** — Phase 133 scope. The spike's writer-process is throwaway; Phase 133 wires the winning path into vigil-watch (or replaces vigil-watch with a paired writer process if the winning path requires it).
- **Reply-mode UX on G2** (DOUBLE_CLICK enter → cycle 5 prefabs → DOUBLE_CLICK send) — Phase 133 scope (G2-REPLY-02/03). 128b proves the writer-half is feasible; G2-half is independent.
- **Reply-mode watchdog auto-exit after 30s** (G2-REPLY-04) — Phase 133 scope.
- **`agent_banner_acked` + `agent_reply_sent` SSE event types** — Phase 133 scope. 128b just confirms the round-trip is feasible.
- **Drift-detector test pinning the 5-string allowlist at the source-of-truth call site** (G2-REPLY-04 success criterion) — Phase 133 scope. Spike sketches the allowlist in markdown; Phase 133 implements + pins.
- **Multi-platform support** (Windows / non-macOS) — explicitly out of scope. Vigil's writer-process runs on the operator's Mac alongside `claude`; cross-platform is a v3.10+ concern.
- **Local-network constraint resolution** for Companion HUD (D-N1) — Phase 133 scope at earliest; possibly a separate v3.10 phase. Surfacing it here so it's not forgotten.
- **MCP server-as-prompter UX** — even if Path D (MCP) DEGRADEs, there's an interesting variant: an MCP server that buffers replies from G2 and exposes a `vigil_check_external_reply` tool that Claude CAN proactively call when it's about to ask the operator something. This is a "Claude pulls" model vs the "Vigil pushes" model the spike tests. Documented here for v3.10+ consideration if the spike returns DEGRADE on the push model.
- **Per-session reply rate-limiting / cooldown** — production concern; if PASS, Phase 133 needs to handle the "operator-fatigue-clicked 5 replies in 2 seconds, vigil-watch sends 5 `yes` strings" race. Out of 128b spike scope.
- **Audit log of all replies sent** — production concern; Phase 133.
- **No vigil-watch local clone needed** — explicitly noted: ANY writer process works for the spike. If a downstream phase wants vigil-watch local, that's its own scope.

</deferred>

---

*Phase: 128b-g2-reply-01-write-back-path-spike*
*Context gathered: 2026-05-14*
*Mode: --auto-style (autonomous discuss; user authorized "work without stopping for clarifying questions"; recommended defaults grounded in Phase 127 guardrails + Phase 127.5 verdict + Phase 128a sister-spike precedent + empirical `claude --help` surface probe + JSONL corpus inspection)*
