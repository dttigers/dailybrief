---
phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
plan: 05
subsystem: roadmap
tags: [phase-124, roadmap, scope, sc-narrowing, deferred, g2-plugin, sdk-constraint]

# Dependency graph
requires:
  - phase: 124 (Plans 01-04 prior)
    provides: Phase 124 D-08 caveat surfacing the SDK reality (CLICK_EVENT sim-only, LONG_PRESS_EVENT absent)
provides:
  - ROADMAP.md Phase 124 SC #2 wording aligned with shipping behavior (DOUBLE_CLICK only, context-sensitive)
  - SEED-011 capturing the deferred original three-tap-variant spec with three explicit re-activation triggers
affects: [124-verify-phase, 125-plan-breakdown, future-G2-SDK-upgrade-evaluation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Operator-amendment / SEED-deferral pattern for SDK-constraint-driven scope narrowing (mirrors Phase 119 / SEED-003 for structurally unsatisfiable conditions, applied to G2 SDK gaps instead of DMARC volume)"

key-files:
  created:
    - .planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md
  modified:
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md  # AGENT-HUD-02 description sync (Rule 2 deviation)

key-decisions:
  - "Narrow ROADMAP SC #2 instead of punting the entire criterion to Phase 125 — narrowed wording still covers the user-visible double-tap behavior shipped in Plans 06-08, so verify-phase has a structurally reachable gate without losing the AGENT-HUD-02 acceptance signal entirely."
  - "Adopt SEED-011 frontmatter shape (seed_id/title/discovered/related_phases/related_memories) prescribed in the plan rather than the legacy id/planted/planted_during/trigger_when shape used by SEED-001..010 — the plan locks the new shape and operator can normalize across SEEDs in a future cleanup phase if desired."
  - "Reword the SC #2 lead-in from sentence-start 'Double-tap' to mid-sentence 'On the temple, double-tap is context-sensitive' to satisfy the case-sensitive `grep -F 'double-tap is context-sensitive'` acceptance gate while preserving D-08 semantics verbatim."

patterns-established:
  - "Pattern — D-08 SDK-constraint narrowing: when planner-time research surfaces a structurally unmet ROADMAP SC, ship a doc-only plan that (1) narrows the SC to current SDK reality + (2) lands a SEED preserving the original spec + re-activation triggers. Avoids both silent abandonment and forcing synthetic conditions."
  - "Pattern — case-sensitive grep verifications: when an acceptance criterion's grep is case-sensitive (`grep -F`) and conflicts with sentence-start capitalization rules, reposition the load-bearing phrase mid-sentence rather than relaxing the verification."

requirements-completed: [AGENT-HUD-02]

# Metrics
duration: 2min
completed: 2026-05-10
---

# Phase 124 Plan 05: AGENT-HUD-02 SC #2 narrowed-to-D-08-reality Summary

**ROADMAP Phase 124 SC #2 narrowed from three-tap promise (single-tap clears / double-tap cycles / long-press dismisses) to context-sensitive DOUBLE_CLICK overload (banner-ack → cycle-session → jump-home), with SEED-011 preserving the deferred single-tap and long-press variants for re-activation if the G2 SDK ever exposes them reliably.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-10T01:12:19Z
- **Completed:** 2026-05-10T01:14:28Z
- **Tasks:** 2 / 2
- **Files modified:** 3 (2 modified, 1 created — REQUIREMENTS.md added via Rule 2 deviation)

## Accomplishments

- **Phase 124 verify-phase gate is now structurally reachable for SC #2.** The pre-edit wording promised behaviors (`CLICK_EVENT` single-tap, `LONG_PRESS_EVENT` long-press) that the G2 SDK does not reliably expose on hardware; verify-phase would have failed not because the implementation regressed but because the contract was unmet by physics.
- **SEED-011 lands as the structural memory of the original three-variant spec** with three explicit re-activation conditions, mirroring the Phase 119 / SEED-003 deferral pattern for structurally unsatisfiable conditions. Future SDK upgrades or hardware retests have a documented decision path to revive the punted behaviors.
- **No code changed.** Documentation-only plan — ROADMAP.md SC #2 + new SEED file. SC #1, #3, #4, #5 untouched. Plans 06-08 in the same phase already only ship `DOUBLE_CLICK` per Plan 03's navigation.ts work, so no downstream plan needs editing to match the narrowed contract.

## Task Commits

Each task was committed atomically:

1. **Task 1: Narrow ROADMAP.md Phase 124 SC #2 wording** — `da762d8` (docs)
2. **Task 2: Create SEED-011 capturing deferred single-tap/long-press behaviors** — `9bf8064` (docs)

**Plan metadata commit (final, includes SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md):** _pending after this file is written_

## Files Created/Modified

- `.planning/ROADMAP.md` — Phase 124 SC #2 wording replaced (single line, line 456). New text describes context-sensitive DOUBLE_CLICK behavior, names the SDK constraints (CLICK_EVENT sim-only via Phase 45 retro; LONG_PRESS_EVENT absent from `OsEventTypeList`), and references SEED-011 inline. SC #1, #3, #4, #5 unchanged (verified via Read offset 453-461 spot-check).
- `.planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md` — NEW (90 lines). Frontmatter: `seed_id: SEED-011`, `status: dormant`, `discovered: 2026-05-09`, `discovered_in: Phase 124`, `related_phases: [124, 125]`, `related_memories: [project_g2_tap_expand_broken]`. Sections: What is deferred (verbatim original three-variant list), Why deferred (CLICK_EVENT / LONG_PRESS_EVENT / Phase 45 / SEED-005 / SEED-006 pattern), Re-activation triggers (3 numbered conditions), Implementation notes when re-activated (tap-to-behavior map + companion.ts/navigation.ts surfaces + ROADMAP/REQUIREMENTS update notes), Original wording preserved (verbatim pre-edit ROADMAP SC #2), References (CONTEXT.md D-08, RESEARCH.md Open Questions §1, Phase 45 retro memory, SDK type defs path).
- `.planning/REQUIREMENTS.md` — AGENT-HUD-02 description (line 35) updated from the original three-tap-variant promise to the narrowed context-sensitive double-tap wording with explicit SEED-011 pointer. Checkbox remains `[x]` (marked complete via `requirements mark-complete` in this plan). AGENT-HUD-01, AGENT-HUD-03 untouched. Traceability table row for AGENT-HUD-02 unchanged. Rule 2 deviation — required to keep `[x]`-marked requirement consistent with shipped behavior.

## Decisions Made

See `key-decisions` in frontmatter — three documented this plan:

1. **Narrow rather than punt the entire SC** — preserves verify-phase signal coverage for the actually-shipped double-tap behavior.
2. **Adopt the plan's prescribed SEED frontmatter shape** (`seed_id`/`title`/etc.) rather than the legacy SEED-001..010 shape (`id`/`planted`/`trigger_when`/`scope`). Plan content is the source of truth here; cross-SEED frontmatter normalization is out-of-scope.
3. **Reword "Double-tap" → "On the temple, double-tap is context-sensitive"** mid-sentence to satisfy the case-sensitive grep acceptance gate without weakening the verification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mid-sentence reposition of "double-tap is context-sensitive" to satisfy case-sensitive grep**

- **Found during:** Task 1 verification step
- **Issue:** Plan's interfaces block locked the new SC #2 sentence to begin "Double-tap on the temple is context-sensitive..." (capital D, sentence-start). The plan's automated verify command was `grep -n "double-tap is context-sensitive"` (case-sensitive lowercase). The case-sensitive grep would not match the prescribed text — plan-internal contradiction.
- **Fix:** Repositioned the load-bearing phrase mid-sentence: `"...persistent banner appear on the temple HUD. On the temple, double-tap is context-sensitive (per Phase 124 D-08): ..."` — same semantic content, same reference to D-08, same context-sensitive behavior list, but the lowercase phrase now appears verbatim and the grep passes.
- **Files modified:** `.planning/ROADMAP.md` (the same single SC #2 line edited twice — first attempt + correction, all within Task 1, only one final edit committed)
- **Verification:** All four Task 1 grep checks pass (`double-tap is context-sensitive` exit 0, `SEED-011` exit 0, `CLICK_EVENT.*sim-only` exit 0, old wording absent exit 1).
- **Committed in:** `da762d8` (Task 1 single commit; the in-flight first revision was overwritten by Edit before staging — git only sees the final form)

**2. [Rule 2 - Missing Critical] Sync REQUIREMENTS.md AGENT-HUD-02 description to narrowed SC #2**

- **Found during:** Post-task state verification — `requirements mark-complete AGENT-HUD-02` flipped the checkbox to `[x]`, but the requirement's prose description still asserted the original three-tap-variant promise (single-tap clears + double-tap cycles + long-press dismisses).
- **Issue:** A `[x]`-marked requirement whose description does NOT match the shipped behavior is a self-contradicting state and re-introduces the same T-124-05-01 (Repudiation) risk the plan is trying to mitigate via SEED-011. Future-maintainer reading just REQUIREMENTS.md would see both the legacy wording and the `[x]` mark and conclude all three variants ship.
- **Fix:** Replaced the AGENT-HUD-02 description with the same context-sensitive double-tap wording from the narrowed SC #2 + an explicit pointer to SEED-011 for the deferred original spec. The sentence now matches ROADMAP.md SC #2 verbatim semantics.
- **Files modified:** `.planning/REQUIREMENTS.md` (single line, AGENT-HUD-02 entry only — AGENT-HUD-01, AGENT-HUD-03 untouched).
- **Verification:** `grep -E "AGENT-HUD-02" .planning/REQUIREMENTS.md` shows the new wording on line 35; checkbox remains `[x]`; traceability row on line 96 unchanged.
- **Committed in:** _final metadata commit_ (rolled into the SUMMARY+STATE+ROADMAP+REQUIREMENTS commit per execute-plan.md final_commit step).

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** No scope creep. Both deviations preserve 100% of D-08 semantics, all SDK-constraint citations, and the SEED-011 reference. Deviation 1 was strictly a wording reposition to reconcile a plan-internal contradiction; Deviation 2 mirrors the same narrowed wording into REQUIREMENTS.md so the `[x]`-marked requirement isn't self-contradicting (T-124-05-01 mitigation extended).

## Issues Encountered

None beyond the deviation above.

## Threat Surface Scan

No new security-relevant surface introduced — documentation-only plan touches `.planning/ROADMAP.md` and adds `.planning/seeds/SEED-011-*.md`. Neither file is referenced from runtime code paths; no network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. All threat-register items in the plan (T-124-05-01 Repudiation: future maintainer can't reconstruct why SC #2 was narrowed; T-124-05-02 Tampering: wrong line edited) mitigated via the SEED's "Original wording preserved" section + the unique-line `old_string` requirement of the Edit tool.

## Self-Check: PASSED

**Created files exist:**
- `.planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md` — FOUND
- `.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-05-SUMMARY.md` — FOUND (this file)

**Commits exist on `main`:**
- `da762d8` — FOUND (`docs(124-05): narrow Phase 124 SC #2 to D-08 SDK reality`)
- `9bf8064` — FOUND (`docs(124-05): land SEED-011 capturing deferred G2 single-tap/long-press tap variants`)

**Acceptance grep checks (run live, all pass):**
- `grep -F "double-tap is context-sensitive" .planning/ROADMAP.md` — exit 0
- `grep -n "SEED-011" .planning/ROADMAP.md` — exit 0
- `grep -nE "CLICK_EVENT.*sim-only" .planning/ROADMAP.md` — exit 0
- `grep -F "single-tap clears the banner; double-tap cycles" .planning/ROADMAP.md` — exit 1 (old wording absent, expected)
- `test -f .planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md` — exit 0
- `grep -nE '1\.\s*\*\*Single-tap\*\*' .planning/seeds/SEED-011-*.md` — exit 0
- `grep "project_g2_tap_expand_broken" .planning/seeds/SEED-011-*.md` — exit 0

## Next Phase Readiness

- **Phase 124 verify-phase**: SC #2 gate is now reachable. Plans 06-08 (Companion screen + double-tap navigation wiring) match the narrowed contract.
- **Phase 124 closure dependencies**: Plan 04 D-14 byte-identical PNG comparison (operator GUI run) and Plan 03 24h soak (Phase 123 carry-forward) remain pending — neither blocks Plan 05.
- **Phase 125 plan-breakdown**: SEED-011 should be referenced if Phase 125 considers folding any SDK-version bump that exposes `LONG_PRESS_EVENT` or fixes `CLICK_EVENT` hardware-reliability — re-activation trigger #1 and #2 in the SEED point directly at the unblock conditions.
- **Future G2 SDK upgrade evaluation**: discovering `LONG_PRESS_EVENT` in `OsEventTypeList` of a future `@evenrealities/even_hub_sdk` release is the cleanest re-activation signal — re-read SEED-011 §"Implementation notes when re-activated" before authoring the revival phase.

---
*Phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish*
*Completed: 2026-05-10*
