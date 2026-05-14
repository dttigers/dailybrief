---
phase: 128b
slug: g2-reply-01-write-back-path-spike
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-14
---

# Phase 128b — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> **Spike phase note:** This phase produces a verdict, not a feature. The "test framework" is the mechanical D-V1 four-step gate from CONTEXT.md applied to each per-path probe (D-V4 mechanical computation). There is no conventional pytest/jest framework in scope — empirical-or-worthless per D-T3.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Mechanical 4-step gate (CONTEXT D-V1) + max-aggregation (D-V4). Per-path mini-verdict by checklist; overall by `MAX(PASS > DEGRADE > FAIL > INCONCLUSIVE)`. |
| **Config file** | `128b-CONTEXT.md` §`<decisions>` D-V1 / D-V2 / D-V3 / D-V4 — the verdict rubric. |
| **Quick run command** | `bash .planning/spikes/128b-write-back/pathX-*.sh` (per-path probe, ~30 min – 2h each) |
| **Full suite command** | Sequential B → A → D per D-O1 ordering. Path E regression: `bash .planning/spikes/001-tmux-write-back-128b/L4-needs-input-pause.sh`. |
| **Estimated runtime** | Path B ~30 min · Path A ~2h · Path D ~1h · Path E rerun ~80s. Total per-path empirical wallclock ≤ 4h (well inside CONTEXT D-O4 cap). |

---

## Sampling Rate

- **After every task commit:** N/A for empirical probes — the probe transcript IS the test result. For markdown-authoring tasks (SPIKE-DECISION, MEASUREMENTS), commit-on-write.
- **After every plan wave:** Single wave per phase (sequential per D-O1 ordering). No cross-wave validation needed.
- **Before `/gsd-verify-work`:** All 4 G2-REPLY-01 success criteria green in `128b-SPIKE-DECISION.md`.
- **Max feedback latency:** Per-path probe completes within its wallclock cap (D-O4: 3h per path).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD-01-01 | 01 | 1 | G2-REPLY-01 (criterion 1: Path B empirical) | — (spike scope; threats are 5-string allowlist per D-A2) | Path B writer process runs without leaking secrets to logs (GUARD-01 / D-G1) | empirical-probe | `bash .planning/spikes/128b-write-back/pathB-stream-json.sh` | ❌ W0 (script doesn't exist yet) | ⬜ pending |
| TBD-02-01 | 02 | 1 | G2-REPLY-01 (criterion 1: Path A empirical) | — | Path A writer process refuses to write to `$CLAUDE_SESSION_ID` (D-T5 clobber-protect) | empirical-probe | `bash .planning/spikes/128b-write-back/pathA-jsonl-append.sh` | ❌ W0 | ⬜ pending |
| TBD-03-01 | 03 | 1 | G2-REPLY-01 (criterion 1: Path D analytical + probe) | — | MCP server scaffold isolated to `.planning/spikes/128b-write-back/` (tossable) | empirical-probe + analytical | `bash .planning/spikes/128b-write-back/pathD-mcp-probe.sh` | ❌ W0 | ⬜ pending |
| TBD-04-01 | 04 | 1 | G2-REPLY-01 (criterion 3: PoC round-trip evidence) | — | Path E reproduces spike 001 evidence on current env | regression | `bash .planning/spikes/001-tmux-write-back-128b/L4-needs-input-pause.sh` | ✅ exists | ⬜ pending |
| TBD-05-01 | 05 | 1 | G2-REPLY-01 (criterion 1+2+3+4: verdict + per-path table + privilege sketch + scope-lock) | — | Verdict file is mechanically computed per D-V4; not subjectively edited (D-V1 invariant) | markdown-authoring | (manual: verdict at TOP of `128b-SPIKE-DECISION.md`, per D-V4 ordering) | ❌ W0 | ⬜ pending |
| TBD-06-01 | 06 | 1 | G2-REPLY-01 (criterion 1 evidence consolidation) | — | All per-path transcripts redacted per GUARD-01 (D-G1) | markdown-authoring | (manual: `128b-MEASUREMENTS.md` aggregates probe outputs) | ❌ W0 | ⬜ pending |
| TBD-07-01 | 07 | 1 | C-1 wallclock | — | Live `claude` session is in tmux-wrapped disposable pane (D-T5) | operator-wallclock | N/A — operator runs probe paths live | ❌ W0 | ⬜ pending |
| TBD-08-01 | 08 | 1 | C-2 wallclock (60s portfolio Loom) | — | Loom shows the writer-process invocation + the active claude session responding | operator-wallclock | N/A — operator records | ❌ W0 | ⬜ pending |

*Task IDs are TBD until planner writes the PLAN.md files. Plan numbering preserves the per-path → consolidation → wallclock ordering from RESEARCH.md.*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.planning/spikes/128b-write-back/` — NEW directory per CONTEXT D-A1 (separate from spike 001's `001-tmux-write-back-128b/` to preserve CONTEXT-verbatim compliance; RESEARCH §"Open Questions" 1 recommends create-new)
- [ ] `.planning/spikes/128b-write-back/README.md` — points to phase artifacts + spike 001 cross-link
- [ ] `.planning/spikes/128b-write-back/pathA-jsonl-append.sh` — Path A probe (Bash; operates on a COPY of a real `.jsonl` session from `~/.claude/projects/-home-morrillboss-dev-dailybrief/`)
- [ ] `.planning/spikes/128b-write-back/pathB-stream-json.sh` — Path B probe (cheapest; ~30 min wallclock)
- [ ] `.planning/spikes/128b-write-back/pathD-mcp-probe.sh` + `pathD-mcp-server.mjs` — Path D probe (~30 LOC MCP stub via `@modelcontextprotocol/sdk` ad-hoc install)
- [ ] All probe scripts MUST have the TOSSABLE header per CONTEXT D-A1 + spike CONVENTIONS.md
- [ ] All probe scripts MUST use unique tmux session names (`spike-128b-pathX-$$`) for D-T5 clobber-protection
- [ ] All probe scripts MUST use the false-positive-resistant sentinel pattern (per spike 001's CONVENTIONS.md)

*No framework install needed — `tmux`, `bash`, `claude`, and `node` are already on host.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live operator-driven `claude` interactive session reaches `needs_input` pause | C-1 (D-T1) | Per `[feedback_wallclock_checkpoint_exempt]` memory — `--auto` cannot drive a live operator workstation session | Operator runs `claude` in tmux pane on Ubuntu dev box, drives to permission prompt, then in separate shell runs probe script |
| 60s portfolio Loom recorded | C-2 (success criterion 3 proxy) | Operator-only; demonstrates the round-trip visually | Mirror Phase 128a Loom shape: 5s gesture close-up + 5s wide shot + 10s HUD reaction + 15s session reaction + 25s split-screen replay. For 128b PASS, wide shot = writer-process invocation + active claude session responding in another pane. |
| Mechanical verdict computation discipline | D-V4 invariant | Author must NOT subjectively decide verdict at write-up; it's computed by max-aggregation | Authoring task instructions explicitly forbid editing verdict after first write (D-V1 precedent — Phase 128a); re-test contradictions open Phase 128b.1 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify (per-path probe scripts) OR Wave 0 dependencies marked
- [ ] Sampling continuity: spike has 4 empirical paths sampled, no 3-consecutive analytical-only tasks
- [ ] Wave 0 covers all MISSING references (spike directory + probe scripts + markdown stubs)
- [ ] No watch-mode flags (spike probes are one-shot)
- [ ] Feedback latency: per-path probe ≤ D-O4 wallclock cap (3h)
- [ ] `nyquist_compliant: true` set in frontmatter once all tasks have empirical or wallclock verification

**Approval:** pending
