# Phase 128b: G2-REPLY-01 write-back path spike - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 128b-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-14
**Phase:** 128b-g2-reply-01-write-back-path-spike
**Areas discussed:** test target, candidate ordering, round-trip definition, spike code location + privilege model depth (plus operator note on Companion HUD local-network constraint)

**Mode:** `--auto`-style discussion. User pre-authorized "work without stopping for clarifying questions" — gray areas were resolved with recommended defaults grounded in Phase 127 guardrails + Phase 127.5 verdict + Phase 128a sister-spike precedent + empirical `claude --help` surface probe + JSONL corpus inspection (`~/.claude/projects/-home-morrillboss-dev-dailybrief/`). All four areas were selected by the user via the gray-area picker; defaults locked in CONTEXT.md.

---

## Area 1 — Test target ("what counts as a Claude Code session")

| Option | Description | Selected |
|--------|-------------|----------|
| Live `claude` REPL on operator's Mac mid-task | Real workflow, highest credibility — but reproducible mid-task state is harder to stage | ✓ (D-T1 primary; D-T4 specifies dev workstation Linux, not operator Mac — OS-agnostic at this layer) |
| Fresh disposable `claude` in a tmux pane | Clean state, safer to test; but a fresh session is trivially injectable and proves little about the production case | ✓ (D-T2 — secondary probe per path that PASSes D-T1; D-Specifics — tmux wrapper for clobber-protection) |
| Synthetic stub mocking JSONL/stdin surface | Fastest, lowest credibility | REJECTED (D-T3) |

**User's choice:** Selected all four gray areas via multiSelect. Test target resolved to: primary = real interactive `claude` session mid-turn (D-T1); secondary = fresh disposable session for paths that PASS the primary (D-T2); synthetic stubs rejected (D-T3); test machine = this Linux dev workstation, NOT operator Mac (D-T4 — spike question is OS-agnostic; vigil-watch is not cloned locally and is NOT needed for the spike; Phase 133 productionizes on macOS).

**Notes:** Real JSONL session corpus is available at `~/.claude/projects/-home-morrillboss-dev-dailybrief/` (D-T5 + code_context.reusable_assets). Spike Path A operates on a copy from this corpus. Clobber-protection: stamp target session ID at spike-start, refuse to write to spike-runner's own session.

---

## Area 2 — Candidate ordering + cheap-elimination strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Order by cheapest-wallclock-first (SDK → MCP → JSONL → FIFO) | ~30 min for path B, escalating to ~3-4h for path C; first PASS short-circuits | ✓ (D-O1 + D-O2 stop-on-first-PASS) |
| Order by likelihood-of-production-PASS-first (JSONL → FIFO → MCP → SDK) | Tests the most-likely-to-PASS path first; if it BLOCKs the spike fails fast | REJECTED — likelihood ranking is itself the spike's question; can't pre-rank |
| Test all 4 paths regardless of intermediate results | Cleanest verdict; maximum wallclock | REJECTED (D-O2 short-circuit; D-O4 per-path cap) |

**User's choice:** Cheapest-wallclock-first with short-circuit on first PASS (D-O1, D-O2). Three-BLOCK short-circuit also added (D-O3) — if first three paths all FAIL, don't bother with path 4. Per-path wallclock cap = 3 hours (D-O4); over-cap paths get marked `INCONCLUSIVE`.

**Notes:** Empirical `claude --help` probe (2026-05-14) confirmed paths B (`-p --input-format stream-json`) and D (`--mcp-config`) have first-class CLI flags; paths A (JSONL append) and C (FIFO) are unofficial / OS-side workarounds. This informs the test-order rationale captured in D-O1's per-path notes.

---

## Area 3 — Round-trip definition (what counts as PASS)

| Option | Description | Selected |
|--------|-------------|----------|
| String reaches input buffer only | Weakest gate; doesn't prove the operator's actual problem is solved | REJECTED |
| Session processes the string as a user turn | Mid-strength; doesn't catch state-corruption | REJECTED |
| Four-step round-trip (writer → buffer → user-turn → response → session-continues-60s) | Strongest gate; matches operator's actual ambient-loop closure | ✓ (D-V1) |
| Same four-step gate but only on fresh session | Production-viable with caveats | DEGRADE path (D-V2) |

**User's choice:** Four-step round-trip (D-V1) is the PASS gate. Fresh-session-only is the DEGRADE gate (D-V2). State-corruption or unsafe-primitives-required is BLOCK (D-V3). Verdict computed mechanically (D-V4) — author does NOT decide at write-up time; per-path mini-verdicts aggregate via `MAX(PASS > DEGRADE > FAIL > INCONCLUSIVE)`.

**Notes:** DEGRADE scope-locks Phase 133 to G2-REPLY-05 (banner-ack-only); BLOCK adds three-re-activation-conditions per SEED-003 DMARC pattern. Verdict at TOP of `128b-SPIKE-DECISION.md`, non-editable (Phase 128a precedent).

---

## Area 4 — Spike code location + privilege/allowlist model depth

| Option | Description | Selected |
|--------|-------------|----------|
| In vigil-core/src/routes/ (like 128a) | Mirrors 128a's voice-spike.ts location; but 128b is NOT a vigil-core route | REJECTED — write-back path is an OS-side concern |
| In vigil-g2-plugin/scripts/ | Mirrors 128a's voice-spike-page.html; but spike doesn't touch G2 plugin | REJECTED — G2-side is out of scope |
| In a separate `.planning/spikes/128b-write-back/` dir | Throwaway scripts, isolated from production tree | ✓ (D-A1) |
| Implement privilege-drop + 5-string allowlist in spike code | Highest credibility, triples wallclock | REJECTED |
| Sketch privilege-drop + 5-string allowlist in markdown only | Faster, sufficient for verdict purposes (verdict is "does any path work", not "does production-shape work") | ✓ (D-A2) |

**User's choice:** Spike code in `.planning/spikes/128b-write-back/` (D-A1). Privilege/allowlist model sketched in `128b-SPIKE-DECISION.md` pseudo-code, NOT implemented in spike scripts (D-A2). `POST /v1/agent-replies` is Phase 133 scope, NOT 128b — spike's writer-process is invoked directly (D-A3). Artifacts in standard phase dir (D-A4).

**Notes:** The 5-string allowlist (`yes` / `no` / `continue` / `abort` / `defer`) is locked by G2-REPLY-04 in REQUIREMENTS.md and surfaces only in markdown sketch for the spike. Phase 133 implements + pins via drift-detector tests.

---

## Operator note (free-form addition during gray-area picker)

**User added:** "current companion only works when on local network"

**Captured as:** D-N1 in CONTEXT.md. The constraint is OUT of 128b scope (spike doesn't touch G2 ↔ vigil-core path), but documented for two reasons: (1) the 60s portfolio Loom is recorded at operator's desk so local-network is acceptable for the demo; (2) Phase 133's productionization MUST surface the local-network constraint in its operator UX. Flagged in CONTEXT.md `<deferred>` so Phase 133 doesn't lose the signal.

---

## Claude's Discretion

(Per D-Discretion in CONTEXT.md)

- Exact writer-process language per path (Bash / Node / Python) — researcher picks.
- Exact log format for per-path measurement transcripts — researcher picks (must satisfy D-G1 redaction).
- Whether to attempt path 4 (FIFO) if first 3 produce clear verdict — short-circuit by default.
- tmux-wrapped vs direct invocation for the live test session — default tmux for clobber-protection.
- Exact pseudo-code shape for the privilege-model sketch — researcher/planner picks; only the 5-string allowlist constant is fixed.
- Drift-detector tests explicitly SKIPPED (Phase 133 scope).

## Deferred Ideas

(All documented in CONTEXT.md `<deferred>`)

- `POST /v1/agent-replies` vigil-core route → Phase 133.
- vigil-watch Swift daemon changes → Phase 133.
- Reply-mode UX on G2 (DOUBLE_CLICK + cycle 5 prefabs) → Phase 133 (G2-REPLY-02/03).
- Reply-mode watchdog auto-exit (G2-REPLY-04) → Phase 133.
- `agent_banner_acked` + `agent_reply_sent` SSE event types → Phase 133.
- Drift-detector test for the 5-string allowlist (G2-REPLY-04) → Phase 133.
- Multi-platform support (Windows / non-macOS) → out of milestone scope.
- Local-network constraint resolution for Companion HUD (D-N1) → Phase 133 or v3.10.
- MCP server-as-prompter UX (Claude pulls vs Vigil pushes) → v3.10+ if DEGRADE.
- Per-session reply rate-limiting / cooldown → Phase 133.
- Audit log of all replies sent → Phase 133.
- vigil-watch local clone NOT needed for spike — explicitly noted.
