# Phase 108: work_order_statuses userId Scoping + Isolation Test — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 108-work-order-statuses-userid-scoping-isolation-test
**Areas discussed:** Backfill source, Schema PK shape, W-02 test fixture, D-23 guardrail cleanup + adjacent scope check

---

## Backfill source for existing status rows

| Option | Description | Selected |
|--------|-------------|----------|
| Backfill all to seed user (Phase 102 pattern) | Matches the pattern used for 11 other tables in 0012_multi_user_foundation.sql. Simple, predictable, reuses vigil.seed_email session var. | ✓ |
| Infer via JOIN work_orders ON caseNumber | Each status inherits userId of matching work_order row. Adds migration complexity and a NULL-fallback path for orphaned statuses. | |
| Truncate work_order_statuses before ADD COLUMN | Wipe the table, ADD COLUMN NOT NULL + FK in one shot. Destructive — user loses in-progress status marks. | |

**User's choice:** Backfill all to seed user (Phase 102 pattern)
**Notes:** Production is still seed-user-only; JOIN-based inference would buy nothing real and add two failure modes (orphan statuses, NULL fallback path).

---

## Schema: composite PK vs surrogate key

| Option | Description | Selected |
|--------|-------------|----------|
| Composite PK (userId, caseNumber) | Drop caseNumber-only PK, add composite PK using drizzle primaryKey helper. onConflictDoUpdate.target points at both columns. Simplest. | ✓ |
| id serial PK + uniqueIndex(userId, caseNumber) | Add surrogate id PK, keep caseNumber as regular column, add uniqueIndex. More defensive for future FK references. | |
| Keep caseNumber PK + add unique(userId, caseNumber) | Not viable — caseNumber-alone PK blocks User B from ever having a status on a caseNumber User A already has. Ruled out. | |

**User's choice:** Composite PK (userId, caseNumber)
**Notes:** Nothing FKs into work_order_statuses, so surrogate key offers no current benefit. Composite PK is the cleanest expression of the invariant "one status per user per case."

---

## W-02 PDF isolation test fixture shape

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: A-only on a date, B queries, expect 404 | Directly matches roadmap success criterion #5. One scenario, one assertion, proves the leak path. | ✓ |
| Defense-in-depth: same-date + different-date | Both users have briefs on same date with distinct bytes. Cover '404 when only A has it' and 'each gets own bytes on shared date.' Stronger but 2-3x code. | |
| Happy-path only: both-have-briefs-same-date | Skip the 404 case; only verify byte-level isolation. Lighter but misses the 'no cross-user-404' invariant the roadmap explicitly calls out. | |

**User's choice:** Minimal: A-only on a date, B queries, expect 404
**Notes:** The 404 assertion alone is sufficient to prove the (briefs.userId = userId) filter is applied; byte-comparison adds test complexity without catching additional bug classes.

---

## D-23 guardrail cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Invert and re-cite as Phase 108 decision | Rewrite migrate.test.ts:130 it() block to assert user_id DOES exist with NOT NULL + FK. Update comment at line 13 to cite Phase 108 reversal. | ✓ |
| Delete the D-23 assertion entirely | Remove the test and D-23 comment. Loses the 'this table IS scoped' regression guard. | |
| Leave it and let it fail post-migration | Don't touch it — failure becomes the signal that D-23 is reversed. Ruled out (intentionally failing tests are anti-signal). | |

**User's choice:** Invert and re-cite as Phase 108 decision
**Notes:** Preserves regression guard (future refactor that accidentally drops user_id still fails the test). Preserves D-23 audit trail across phases for readability.

---

## Adjacent scope: work_orders.caseNumber sole-PK bug

| Option | Description | Selected |
|--------|-------------|----------|
| Out of scope — capture as deferred idea | W-01 is explicitly work_order_statuses. Folding in work_orders doubles blast radius; seed-user-only prod means zero live collision risk today. | ✓ |
| Fold into Phase 108 — same migration file | Expand migration to also convert work_orders.caseNumber PK. Doubles blast radius. | |
| Separate phase right after — 108.1 | Defer but slot as 108.1 in v3.6 to avoid kicking the can. | |

**User's choice:** Out of scope — capture as deferred idea
**Notes:** Logged in CONTEXT.md deferred section. Candidate for v3.7 requirement (e.g., "W-04: work_orders composite PK") or a Phase 108.1 insert if a second user starts syncing before v3.6 wraps.

---

## Claude's Discretion

- Exact migration SQL wording (drizzle-kit generation vs. hand-written)
- Test block name and inline comment wording for the new W-02 it()
- Whether `dbSelectFn` gains a userId parameter vs. becomes a new method (`dbSelectFnForUser`)
- Plan decomposition: one PLAN.md vs. migration/routes/test split — planner's call

## Deferred Ideas

- `work_orders.caseNumber` sole-PK cross-user collision — adjacent bug class, captured for v3.7 or Phase 108.1
