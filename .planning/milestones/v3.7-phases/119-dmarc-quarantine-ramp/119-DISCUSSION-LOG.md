# Phase 119: DMARC quarantine ramp - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-01
**Phase:** 119-dmarc-quarantine-ramp
**Areas discussed:** Ramp aggressiveness, Tag set, Execution surface, Runbook + artifact format, Failure detection + rollback

---

## Ramp aggressiveness

| Option | Description | Selected |
|--------|-------------|----------|
| pct=100 (full ramp, single step) | Set p=quarantine with no pct tag (defaults to 100%). Trusts the auto-eval gate's 7+ days clean + 3+ days volume threshold as sufficient evidence. One commit, one verification, phase closes when post-ramp Gmail dmarc=pass header confirmed. | ✓ |
| pct=10 first, then pct=100 after 7d | Two-stage ramp per SEED-003 original plan. Adds belt-and-suspenders but doubles the operator burden + extends phase timeline + needs a second routine to fire the bump. | |
| pct=50 first, then pct=100 after 3d | Middle ground: faster than pct=10 but still samples real impact. Less defensible than either extreme — not really sampling, not really committing. | |

**User's choice:** pct=100 (full ramp, single step)
**Notes:** The existing 5-06 auto-eval routine already enforces ≥7 days clean rua + ≥3 days verify-email volume + ≥50 sends/day. That gate IS the safety sample SEED-003 originally allocated to pct=10.

---

## Tag set

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: just flip p=none → p=quarantine, preserve everything else | Final value: `v=DMARC1; p=quarantine; rua=mailto:jamesonmorrill1@gmail.com`. Smallest-surface change. | ✓ |
| Add adkim=s (strict alignment) at the same time | STACK.md research originally targeted `adkim=s`. Ramping policy + tightening alignment in one step changes two variables simultaneously. | |
| Add sp=quarantine (subdomain policy) | Applies the same policy to subdomains. Vigil currently has zero subdomains sending mail. | |

**User's choice:** "recommendations?" → Claude recommended Minimal flip; user accepted by proceeding.
**Notes:** ROADMAP SC #2 explicitly says "other tags preserved" — minimal flip honors the success criterion verbatim. `adkim=s` and `sp=quarantine` are legitimate hardening ideas but belong in v3.8+ alongside `p=reject`, where there's evidence on what to tune.

---

## Execution surface (manual vs scripted)

| Option | Description | Selected |
|--------|-------------|----------|
| Manual Cloudflare dashboard edit, runbook documents the click-path | Operator logs into Cloudflare, edits the TXT record, saves. Zero new infra (no CF_API_TOKEN). | ✓ |
| Scripted via Cloudflare API + token in 1Password/Railway | `vigil-core/scripts/dmarc-ramp.ts` with --dry-run/--commit gate (mirrors Phase 118 pattern). Reproducible, but introduces a new secret. | |
| Scripted via `flarectl` or `cf` CLI — no permanent token | Use a short-lived API token, run flarectl/cf locally, then revoke. Adds tooling install. | |

**User's choice:** "thoughts?" → Claude recommended Manual; user accepted by proceeding.
**Notes:** One record, one time. Scripting introduces a new secret surface (`CF_API_TOKEN`) that triggers the Anthropic-key-sprawl drift pattern. Auto-PR from the routine is the paper trail; dashboard edit is the physical action — two channels, both human-auditable.

---

## Runbook + artifact format

| Option | Description | Selected |
|--------|-------------|----------|
| 119-RUNBOOK.md only — routine's auto-PR carries the actual ramp commit | Phase 119 commits the runbook NOW. The auto-PR lands the dig before/after + Gmail headers + post-ramp smoke. | ✓ |
| Phase 118-style: 119-RUNBOOK.md + 119-RUN-LOG.txt | Mirror Phase 118 exactly: markdown checklist + verbatim log file. | |
| Single inline "Notes / Constraints" addendum to ROADMAP.md — no phase artifacts | Treat this as too small for a phase directory. | |

**User's choice:** "recommendations?" → Claude recommended runbook only; user accepted by proceeding.
**Notes:** No script execution to capture, so a `RUN-LOG.txt` would just hold ~3 lines of dig output that fits cleanly inline. The runbook lands BEFORE 2026-05-06 so the operator has a ready checklist when the auto-PR appears.

---

## Failure detection + rollback

| Option | Description | Selected |
|--------|-------------|----------|
| Self-detect: post-ramp smoke must pass before phase closes; no ongoing watcher | The runbook smoke (SC #4) is the gate. Existing rua aggregate report covers tail risk. | ✓ |
| Schedule a 7-day post-ramp watcher routine | New remote routine fires 7 days post-ramp. | |
| Manual: no scheduled check — user notices dropped mail | Risky — silent mail-flow regressions are not always self-evident. | |

**User's choice:** "is self detect the right course?" → After Claude's reasoning (p=quarantine is reversible; rua reports already streaming weekly; new watcher would duplicate the 5-06 routine which memory explicitly forbids), user accepted self-detect.
**Notes:** Refined into structural form: two-path smoke (verify-email AND forgot-password, not just one) + explicit rollback trigger criteria captured in the runbook so future-self doesn't re-derive under pressure. No new routines.

---

## Claude's Discretion

- Exact Markdown structure of `119-RUNBOOK.md` (heading hierarchy, table vs bullet list)
- Whether Cloudflare zone ID and record ID are pre-filled in the runbook or captured at ramp time
- Whether PASS / DEFERRED branch annotations are at the top of the runbook or in a final section
- Exact wording of the auto-PR template body

## Deferred Ideas

- `p=quarantine → p=reject` final ramp (v3.8+, gated on ≥30 days clean quarantine telemetry)
- `adkim=s` strict alignment (v3.8+, ride evidence from rua reports)
- `sp=quarantine` subdomain policy (defer until first subdomain mail flow)
- `ruf=mailto:...` forensic reports (reconsider only if a quarantine incident requires per-failure forensics)
- Scripted DNS automation (defer until ROI argument exists — multiple records, frequent edits)
- `pct=10 → pct=100` staged ramp (superseded by D-01)
