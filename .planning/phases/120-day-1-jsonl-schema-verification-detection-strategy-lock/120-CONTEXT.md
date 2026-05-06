# Phase 120: Day-1 JSONL schema verification + detection-strategy lock - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify the assumed Claude Code JSONL schema against reality, then lock the
detection strategy — either confirming the v3.8 spec's mapping table verbatim,
spec-correcting individual rows, or escalating to a documented fallback path
(notification observation / VS Code extension / process inspection).

This is a **non-coding verification phase**. Deliverable is a Day-1 findings
document committed to a newly-created `vigil-watch` repo README, plus a raw
JSONL excerpt appendix grounding every claim in the document. No daemon code,
no API code, no plugin code lands in this phase.

The verification gate is load-bearing: Phase 122 (vigil-watch core) and
Phase 123 (vigil-watch shell) both plan against whatever this phase locks.
If a fallback path is selected here, those downstream phase goals shift.

</domain>

<decisions>
## Implementation Decisions

### Verification Source (Area 1)
- **D-01:** Use both the existing on-disk JSONL corpus AND one short scripted
  session. Mine `~/.claude/projects/` (4+ JSONL files for this dailybrief
  project alone, including this very session) for natural variance, then run
  one controlled session to fill scenarios the corpus doesn't naturally cover.
- **D-02:** Scripted portion is **1 session covering 5 scenarios in sequence**:
  (a) tool approval prompt, (b) successful tool result, (c) errored tool
  result (forced), (d) ≥60s idle to trigger heartbeat threshold observation,
  (e) clean session end. No multi-session repetition required for Phase 120
  goals — Phase 122 will exercise restart/offset replay separately.

### vigil-watch Repo Timing (Area 2)
- **D-03:** Create `github.com/dttigers/vigil-watch` in Phase 120. README is
  the canonical home for the Day-1 findings document. Strict reading of the
  v3.8 spec ("findings committed to vigil-watch repo README before any
  production-mapping code is written") — no `.planning/`-first-then-port
  intermediate. Phase 122 inherits a real repo with a real README.
- **D-04:** Repo is **public, MIT-licensed**. Matches v3.8 spec
  (`Swift Package, MIT`) and aligns with vigil-core / G2 plugin's existing
  public footprint. Future portfolio value. No secrets at risk: `vk_` keys
  live in user's local `~/.config/vigil/watch.toml`, not the repo.

### Findings Document Scope (Area 3)
- **D-05:** Findings doc is **minimal main + raw appendix**:
  1. Confirmed/corrected 8-row mapping table (one row per assumed JSONL line
     type from spec §"Expected JSONL line types").
  2. Explicit answers to the 4 spec-flagged questions: how tool approval
     prompts appear in JSONL, what fields indicate "awaiting input," how
     session end is signaled, structure of an errored tool result.
  3. Verdict: **proceed-as-spec** | **spec-correct-and-proceed** |
     **fallback-path-N** with rationale.
  4. Raw JSONL excerpts appendix — actual lines that grounded each answer,
     so future agents can audit reasoning without re-running the verification.
- **D-06:** Fallback rule is **pragmatic, not strict**: only escalate to a
  fallback path if observed JSONL fundamentally lacks signal for one or more
  of the 5 Vigil event types (`needs_input`, `task_complete`, `task_failed`,
  `milestone`, `heartbeat`). Field-name renames or restructured payloads do
  NOT trigger fallback — they trigger spec-correction in the findings doc and
  the JSONL approach proceeds. Matches user's "pragmatic defaults" style.

### Multi-Mac Coverage (Area 4)
- **D-07:** Verify on **iMac (Morrill House) only** for Phase 120. iMac is
  where Claude Code in VS Code is used daily — that's the corpus and the
  scripted session. Assume Claude Code's JSONL schema is host-independent
  (same binary, same file format). MacBook Pro re-verification is deferred
  to Phase 122/123 install-time, where the daemon is being deployed there
  anyway and divergence would be caught by the synthetic `vigil-watch test`
  round-trip.

### Claude's Discretion
- Exact JSONL excerpt selection for the appendix (which lines best illustrate
  each answer) — choose for clarity and minimum redundancy.
- Findings document file name within the repo: README.md vs FINDINGS.md vs
  README + dedicated section. Default to **README.md** as canonical landing
  page since the repo is brand-new and has no other content yet; if the
  document grows past a screen, factor a `FINDINGS.md` link out.
- Whether to include schema-version metadata (Claude Code's own version, VS
  Code extension version) in findings — include if trivially observable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v3.8 Milestone Spec (load-bearing for entire milestone)
- `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` — full milestone spec.
  Phase 120 verifies §"vigil-watch Daemon → Day-1 verification gate (BLOCKING)"
  and §"Expected JSONL line types (assumed — verify Day 1)" against reality.
- `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` §"Fallback strategies" —
  documents the 3 fallback paths in priority order if JSONL approach fails.

### Phase 120 Requirements
- `.planning/REQUIREMENTS.md` — VERIFY-01 (verification gate requirement).
- `.planning/ROADMAP.md` §"Phase 120" — 4 success criteria items the
  verification log + findings doc must satisfy.

### Live verification corpus (read at execution time)
- `~/.claude/projects/-Users-jamesonmorrill-Desktop-Local-AI-dailybrief/*.jsonl`
  — primary corpus on iMac. 4+ JSONL files at discuss time, including the
  active session.
- Other `~/.claude/projects/*/` directories — secondary corpus (cross-project
  schema consistency check if useful).

### Project context
- `.planning/PROJECT.md` — Vigil project context, key decisions table.
- `.planning/STATE.md` — current milestone state, deferred items.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **None directly** — Phase 120 produces no code. The `vigil-watch` repo is
  brand-new in this phase and contains only README + .gitignore + LICENSE
  after Phase 120 completes.
- **Pattern reference:** `vigil-core` repo's structure (root README + ADRs
  in `docs/`) is a useful shape template for the new `vigil-watch` repo,
  even though Phase 120 only writes README.

### Established Patterns
- **Findings-doc-before-code pattern:** Mirrors how W-01/W-02 cross-user
  isolation tests in v3.6 Phase 108 locked structural guarantees before
  daemon code. Phase 120 locks the detection strategy structurally before
  Phase 122 implements it.
- **Public repo + MIT default:** Matches `vigil-core` and `vigil-g2-plugin`
  posture. No deviation needed.

### Integration Points
- **Phase 121 input:** if Phase 120 selects a fallback path, the event
  payload contract in spec §"Event payload contract" may diverge — Phase 121
  reads Phase 120's verdict before locking the `POST /v1/agent-events`
  schema.
- **Phase 122/123 input:** the watcher/parser/emitter implementation reads
  Phase 120's locked mapping table verbatim. If verdict is `fallback-path-N`,
  the entire `Watcher` actor in §"Internal architecture" may be replaced by
  a Notification Center observer (Fallback A), VS Code extension hook
  (Fallback B), or process inspector (Fallback C).

</code_context>

<specifics>
## Specific Ideas

- User explicitly noted the existing `~/.claude/projects/` corpus when scoping
  the verification source — large natural sample (months of real Claude Code
  usage) is the cheaper signal; scripted session fills the controlled gaps.
  Honor that ordering: corpus mining first, scripted session second.
- README as canonical findings home (not a separate FINDINGS.md) keeps the
  v3.8 spec's wording ("committed to vigil-watch repo README") literal.
- "Pragmatic, not strict" fallback rule: don't escalate to a fallback path
  just because Claude Code renamed a field — only when the JSONL genuinely
  can't carry the signal for one of the 5 Vigil events.

</specifics>

<deferred>
## Deferred Ideas

- **Cross-Mac verification (MacBook Pro)** — deferred to Phase 122/123
  install-time on MacBook Pro, where divergence would be caught by the
  `vigil-watch test` synthetic round-trip. Not worth the context-switch
  cost during Phase 120.
- **Multi-session restart / offset stability check** — deferred to Phase 122,
  where the offsets.json mechanism is being implemented and tested anyway.
  Phase 120 only needs to confirm session_id is stable per-session, not
  across daemon restarts.
- **Schema-version metadata capture** — Claude's discretion to include if
  trivially observable; not a hard requirement for Phase 120's verdict.
- **Expanded line-type catalog (every observed type, even unmapped)** —
  deferred. If Phase 122/123 finds need to expand event scope, run a
  follow-up cataloging pass then. Avoids rotting documentation now.

</deferred>

---

*Phase: 120-day-1-jsonl-schema-verification-detection-strategy-lock*
*Context gathered: 2026-05-06*
