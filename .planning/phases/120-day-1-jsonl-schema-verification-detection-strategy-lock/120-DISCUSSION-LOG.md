# Phase 120: Day-1 JSONL schema verification + detection-strategy lock - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 120-day-1-jsonl-schema-verification-detection-strategy-lock
**Areas discussed:** Verification source, vigil-watch repo timing, Findings document scope, Multi-Mac coverage

---

## Verification Source

### Q1.1 — Where to observe JSONL schema?

| Option | Description | Selected |
|--------|-------------|----------|
| Both — corpus + scripted | Mine existing `~/.claude/projects/` corpus, then run one short scripted session to fill gaps | ✓ |
| Corpus only | Grep through existing JSONL files; some line types may not appear naturally | |
| Fresh scripted session only | Clean Claude Code session triggering each scenario in order | |

**User's choice:** Both — corpus + scripted (Recommended)
**Notes:** Matches user's "investigate to root cause" debugging style. Cheap natural variance from corpus + controlled scripted scenarios for edge cases.

### Q1.2 — Coverage of scripted portion?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 session, 5 scenarios | Single scripted session: approval, success, error, idle/heartbeat, clean stop | ✓ |
| 3 sessions × 5 scenarios | Repeat 3× to confirm session_id stability and lock heartbeat threshold empirically | |
| Open-ended — stop when 4 spec questions answered | No fixed count; observation depth determines stopping point | |

**User's choice:** 1 session, 5 scenarios (Recommended)
**Notes:** Multi-session restart/offset stability is Phase 122's job. Phase 120 only needs to confirm core mapping.

---

## vigil-watch Repo Timing

### Q2.1 — When created, where do findings live?

| Option | Description | Selected |
|--------|-------------|----------|
| Create repo in Phase 120, README is canonical | Strict reading of spec; Phase 122 inherits a real repo | ✓ |
| Findings to .planning/, repo created in Phase 122 | Defers GitHub work until there's actual code | |
| Both — .planning/ + copy to repo | Two locations to keep in sync; drift risk | |

**User's choice:** Create repo in Phase 120, README is canonical (Recommended)
**Notes:** Honors spec wording literally ("committed to vigil-watch repo README before any production-mapping code"). ~5 min GitHub setup is acceptable cost for canonical traceability.

### Q2.2 — Repo visibility / license?

| Option | Description | Selected |
|--------|-------------|----------|
| Public, MIT | Matches spec; aligns with vigil-core / G2 plugin public footprint | ✓ |
| Private, MIT | Flip to public at milestone close; safer if README needs lockdown | |
| Defer to repo-creation moment | Decide at repo-init time inside execute-phase | |

**User's choice:** Public, MIT (Recommended)
**Notes:** No secrets at risk — `vk_` keys live in user's local config, not the repo.

---

## Findings Document Scope

### Q3.1 — How comprehensive is the Day-1 findings doc?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal + raw appendix | 8-row mapping + 4 spec answers + verdict + raw JSONL excerpts grounding each claim | ✓ |
| Minimal only | Mapping + answers + verdict; no appendix; future agents can't audit reasoning | |
| Expanded catalog | Document every observed line type and field, even ones not currently mapped | |

**User's choice:** Minimal + raw appendix (Recommended)
**Notes:** Raw appendix preserves auditability without bloating the main doc. Avoids rotting risk of cataloging line types not currently used.

### Q3.2 — Threshold for selecting a fallback path?

| Option | Description | Selected |
|--------|-------------|----------|
| Pragmatic: fallback only if events not derivable | If observed JSONL can derive all 5 events even with renamed fields → spec-correct and proceed | ✓ |
| Strict: any spec divergence triggers fallback evaluation | Field-name mismatches force documented fallback evaluation | |
| Deferred — decide at observation time | No pre-committed rule; less predictable for downstream phases | |

**User's choice:** Pragmatic: fallback only if events not derivable (Recommended)
**Notes:** Matches "pragmatic defaults > best practices when shipping today" feedback. Avoids unnecessary scope shift on cosmetic schema differences.

---

## Multi-Mac Coverage

### Q4.1 — Which Mac(s) for Phase 120 verification?

| Option | Description | Selected |
|--------|-------------|----------|
| Primary Mac only — iMac | iMac (Morrill House) is where Claude Code in VS Code is used daily | ✓ |
| Both Macs in Phase 120 | Lock cross-machine consistency now; adds setup overhead | |
| Primary + spot-check sample from MacBook Pro | Full verify on iMac; visually diff one MacBook Pro JSONL | |

**User's choice:** Primary Mac only — iMac (Recommended)
**Notes:** Claude Code is the same binary across Macs; schema is reasonably assumed host-independent. MacBook Pro re-verification deferred to Phase 122/123 install-time, where `vigil-watch test` round-trip naturally catches divergence.

---

## Claude's Discretion

- Exact JSONL excerpt selection for the appendix (which lines best illustrate each spec answer).
- Findings document file name within the repo: defaulted to `README.md` as canonical landing page since the repo is brand-new; factor out to `FINDINGS.md` only if the document grows past a screen.
- Whether to include schema-version metadata (Claude Code version, VS Code extension version) — include if trivially observable.

## Deferred Ideas

- **Cross-Mac verification on MacBook Pro** — deferred to Phase 122/123 install-time.
- **Multi-session restart / offset stability check** — deferred to Phase 122, where offsets.json is being implemented.
- **Schema-version metadata capture** — Claude's discretion; not required for verdict.
- **Expanded line-type catalog (every observed type, even unmapped)** — deferred. Run follow-up cataloging if Phase 122/123 needs to expand event scope.
