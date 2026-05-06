# Phase 119: DMARC quarantine ramp - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Land the runbook + ramp action that, when triggered by the existing 2026-05-06 auto-eval routine (`trig_01RZLcj1jpxvDQAwnFmUG9d9`) producing a green PASS determination, advances the `_dmarc.vigilhub.io` Cloudflare TXT record from `p=none` to `p=quarantine` — preserving all other tags — and verifies post-ramp that legitimate Vigil mail (verify-email and forgot-password flows) still reaches Gmail Inbox with `dmarc=pass` headers.

**Out of scope:**
- The auto-eval gate logic itself — already lives in `trig_01RZLcj1jpxvDQAwnFmUG9d9`; do NOT create a new routine.
- Final `p=quarantine → p=reject` ramp — explicitly deferred to v3.8+ after ≥30 days clean quarantine telemetry.
- `adkim=s`, `sp=quarantine`, `ruf=`, or any other tag changes — minimal flip only.
- Cloudflare API tooling, `CF_API_TOKEN` provisioning, or scripted DNS automation — manual dashboard edit.
- Phase 118 test-user cleanup (separate phase, already shipped).

</domain>

<decisions>
## Implementation Decisions

### Ramp Aggressiveness

- **D-01:** Single-step ramp to `p=quarantine` with NO `pct` tag (defaults to 100%). The existing auto-eval routine already enforces ≥7 days clean rua reports + ≥3 days verify-email production volume + ≥50 sends/day before firing green; this evidence bar IS the safety sample. A staged `pct=10 → pct=100` ramp would duplicate that gate and double operator burden + extend timeline.

### Tag Set

- **D-02:** Minimal flip only. Final TXT value: `v=DMARC1; p=quarantine; rua=mailto:jamesonmorrill1@gmail.com`. Every other tag preserved. Rationale:
  - ROADMAP.md SC #2 literally specifies "other tags preserved" — anything else is scope creep
  - `adkim=s` is a separate hardening decision that should ride its own evidence (do rua reports show subdomain misalignment?). Bundling policy advance + alignment tightening means a delivery regression has two suspects
  - `sp=quarantine` is precautionary for subdomains that don't exist yet — pure YAGNI
  - Both candidate additions belong in v3.8+ alongside the `p=reject` final ramp

### Execution Surface

- **D-03:** Manual Cloudflare dashboard edit. NO `CF_API_TOKEN`, NO scripted DNS tooling, NO `flarectl` install. Rationale:
  - One record, one time, one direction (or one rollback). The next DNS edit is v3.8+ and gated on ≥30 days telemetry — not a repeating workflow.
  - Scripting introduces a new secret surface that triggers the Anthropic-key-sprawl drift pattern (see `memory/project_secret_drift.md`).
  - Phase 111 set the original `_dmarc` TXT via dashboard — staying consistent reduces forensic load later.
  - The auto-PR from `trig_01RZLcj1jpxvDQAwnFmUG9d9` is the **paper trail** (commit + diff in git); the dashboard edit is the **physical action** (verified post-hoc by `dig`). Two channels, both human-auditable.

### Runbook + Artifact Format

- **D-04:** Single `119-RUNBOOK.md` committed to phase directory before 2026-05-06 (so the operator has a checklist ready when the gate fires). NO separate `RUN-LOG.txt` — there is no script execution to capture, and the few `dig` outputs fit cleanly inline.

  **Runbook contents (pinning so planner doesn't have to derive):**
  1. Pre-ramp `dig TXT _dmarc.vigilhub.io +short` snapshot pasted verbatim
  2. Cloudflare zone (`vigilhub.io`) + record locator (`_dmarc` TXT) + dashboard URL pattern
  3. Exact before/after TXT values (per D-02)
  4. Edit click-path step-by-step
  5. Post-ramp `dig` (verify propagation; note observed TTL)
  6. Two-path smoke: trigger one verify-email AND one forgot-password against prod, capture raw Gmail headers showing `dmarc=pass` (per D-05)
  7. Rollback procedure (per D-06)
  8. PASS / FAIL / DEFERRED branch annotations (covers SC #1 and SC #3)

  The auto-PR from `trig_01RZLcj1jpxvDQAwnFmUG9d9` appends post-ramp evidence (dig snapshots, Gmail headers, ramp timestamp) into the same runbook file when the operator merges it.

### Failure Detection + Rollback

- **D-05:** Self-detect via two-path smoke at ramp time + passive rua monitoring. NO new routines. Rationale:
  - `p=quarantine` is reversible (spam folder, not bounce). DMARC is self-reporting by design — `rua=` already streams weekly aggregate reports to `jamesonmorrill1@gmail.com`.
  - A new 7-day post-ramp watcher would re-implement the rua-parsing logic `trig_01RZLcj1jpxvDQAwnFmUG9d9` already runs; memory `project_seed_003_dmarc_routine.md` explicitly warns against duplication.
  - "Manual notice only" is the actual risk path (D-21-style silent mail-flow regressions); the two-path smoke + ongoing rua eliminates it.

  **Two-path smoke definition (must pass before phase can close):**
  - Trigger one verify-email send against prod, fetch raw Gmail headers, confirm `dmarc=pass`
  - Trigger one forgot-password send against prod, fetch raw Gmail headers, confirm `dmarc=pass`
  - Rationale for two paths: covers alignment differences between the two `email-service.ts` call sites

- **D-06:** Explicit rollback trigger criteria captured in runbook so future-self doesn't re-derive under pressure:
  1. Either smoke send shows `dmarc=fail` or `dmarc=quarantine` in Gmail headers → rollback immediately, before phase closes
  2. Within 14 days post-ramp, any rua report shows non-zero `disposition=quarantine` on legit Vigil-origin mail (DKIM=pass + SPF=pass but quarantined) → rollback
  3. User-reported "I never got my verify email / reset link" + Gmail spam folder confirms quarantine → rollback

  **Rollback action:** Cloudflare dashboard → revert TXT to `v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com` → `dig` confirm propagation → log in runbook with reason and timestamp. Same path as ramp, in reverse.

### Claude's Discretion

- Exact Markdown structure of `119-RUNBOOK.md` (heading hierarchy, table vs bullet list for before/after values) — implementation detail
- Whether Cloudflare zone ID and record ID are pre-filled in the runbook or captured at ramp time — operator preference
- Whether the "PASS branch" / "DEFERRED branch" annotations are at the top of the runbook or in a final section
- Exact wording of the auto-PR template body (the routine writes this; phase only commits the static runbook)

### Folded Todos

None — `gsd-tools todo match-phase 119` returned 0 matches.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 119: DMARC quarantine ramp" (line 461) — 4 success criteria; `## Phase Details` section is currently outside the milestone-extraction window because of the dual-`🚧` heading layout (v3.7 + v3.5 both in progress) — read by direct line.
- `.planning/REQUIREMENTS.md` §"OPS-02" (line 23) — full requirement language with gate conditions
- `.planning/REQUIREMENTS.md` exclusions table (line 48) — confirms `p=quarantine → p=reject` is v3.8+

### Seed + routine context
- `.planning/seeds/SEED-003-tighten-dmarc-to-quarantine.md` — original ramp plan (note: predates the 5-06 auto-eval routine; D-01 supersedes its `pct=10` advice based on the gate's evidence bar)
- `memory/project_seed_003_dmarc_routine.md` (Claude memory) — routine `trig_01RZLcj1jpxvDQAwnFmUG9d9` config; do NOT duplicate; disabled twin `trig_01C6xJq2s9Jdujm3vGecifoY` should be ignored

### Prior DNS + email infrastructure
- `.planning/milestones/v3.6-ROADMAP.md` §"Phase 111: Transactional Email Infrastructure (Resend + DNS)" — original DMARC TXT record provisioning. Phase 111 directory (`.planning/phases/111-transactional-email-infrastructure-resend-dns/`) was archived during v3.6 close — content lives only in milestone file.
- `.planning/research/STACK.md` line 121 — DNS record table; note STACK.md shows `p=reject; adkim=s` aspirational target, but live record is `p=none` (verified via `dig` 2026-05-01). STACK.md is forward-looking research, not current state.
- `.planning/research/PITFALLS.md` lines 378, 381, 536 — original DMARC pre-ship checklist (verifies the framework but not Phase 119-specific)

### Pattern reference
- `.planning/phases/118-production-test-user-cleanup/118-CONTEXT.md` D-04 — runbook artifact pattern (Phase 119 deliberately drops the `RUN-LOG.txt` half because there's no script log to capture; see D-04 above)
- `memory/project_secret_drift.md` — the Anthropic key sprawl lesson that drove D-03's "no `CF_API_TOKEN`" decision

### External tooling
- `dig TXT _dmarc.vigilhub.io +short` — verification command; current value (2026-05-01): `"v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com"`
- Cloudflare dashboard — `vigilhub.io` zone, `_dmarc` TXT record (locator captured at ramp time)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **None applicable.** Phase 119 is a DNS edit + runbook; no source code touches the deploy bundle.
- The `vigil-core/scripts/` smoke-test files (`smoke-test-email.ts`, `smoke-test-verify-email.ts`, `smoke-test-forgot-password.ts`) already exist and can be invoked as the smoke trigger in D-05 — operator does NOT need to write new test code, just runs the existing scripts and reads Gmail headers.

### Established Patterns

- **Phase 118 runbook pattern** (`118-RUNBOOK.md` markdown checklist) — Phase 119 follows the same shape, dropping the `.txt` log half since there's no script execution to capture (per D-04).
- **`p=none` day-1 + ramp-later** pattern from Phase 111 D-02 — Phase 119 IS that ramp.
- **Memory-driven decision pattern** — D-03 explicitly leans on the Anthropic key sprawl memory to reject scripted DNS automation. Continuing to let drift-prevention instincts shape ops decisions.

### Integration Points

- No PWA / monitor / G2-plugin / vigil-core source changes. Phase is `.planning/` artifacts + Cloudflare DNS state.
- No deploy trigger. Push-on-deploy-targets won't fire spuriously since no source bundle is touched.
- The auto-PR from `trig_01RZLcj1jpxvDQAwnFmUG9d9` will be the only commit that lands in the repo as part of the ramp — the runbook itself lands in a separate phase-prep commit before 2026-05-06.

</code_context>

<specifics>
## Specific Ideas

- The 5-06 auto-eval routine is load-bearing infrastructure, not a one-off scheduled task — its existence is what justifies D-01 (single-step `pct=100`). The user's "check existing routines before creating" feedback (`memory/feedback_check_existing_routines.md`) directly applies; Phase 119 is the textbook case where ignoring an existing routine would lead to duplication.
- The two-path smoke (D-05) — verify-email AND forgot-password — is deliberately wider than ROADMAP SC #4 ("the next verify-email or forgot-password mail"). The phase reads "or" as an example, not a prescription; both flows go through the same Resend send path but emit from different `email-service.ts` call sites, so testing one would miss alignment regressions specific to the other.
- The runbook lands BEFORE 2026-05-06 (when the routine fires) so the operator has a ready checklist the moment the auto-PR appears. Don't wait until ramp day to write it.
- Drift-prevention instinct (Phase 102 lesson) shaped D-03 directly: a `CF_API_TOKEN` would join the existing key-sprawl pattern (config.json + .env + plist + Railway). For one record edit, the cost-benefit is upside down.

</specifics>

<deferred>
## Deferred Ideas

- **`p=quarantine → p=reject` final ramp** — explicit v3.8+ scope per ROADMAP.md exclusions table; gated on ≥30 days clean quarantine telemetry from rua reports.
- **`adkim=s` strict alignment** — STACK.md research originally targeted this. Belongs in v3.8+ alongside `p=reject`, riding evidence from rua reports that show whether SPF subdomain misalignment actually occurs in practice.
- **`sp=quarantine` subdomain policy** — precautionary for subdomains that don't exist yet. Defer until first subdomain mail flow lands.
- **`ruf=mailto:...` forensic per-failure reports** — most orgs skip; aggregate rua usually enough signal. Reconsider only if a quarantine incident makes per-failure forensics necessary.
- **Scripted DNS automation (`vigil-core/scripts/dmarc-ramp.ts` or similar)** — defer until there's a real ROI argument (multiple records, frequent edits). Same deferral pattern as Phase 118's "generalized user-deletion tooling."
- **`pct=10 → pct=100` staged ramp** — superseded by D-01; the existing 5-06 routine's evidence bar already provides the safety sample SEED-003 originally allocated to `pct=10`.

### Reviewed Todos (not folded)

No todos surfaced — `gsd-tools todo match-phase 119` returned 0 matches.

</deferred>

---

*Phase: 119-dmarc-quarantine-ramp*
*Context gathered: 2026-05-01*
