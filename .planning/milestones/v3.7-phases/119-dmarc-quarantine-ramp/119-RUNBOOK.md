# Phase 119 Runbook — DMARC Quarantine Ramp

**Operator:** `jamesonmorrill@<host>` _(operator fills in at ramp time)_
**Date:** `2026-05-06 (or later — fires on or after auto-eval PASS)`
**Cloudflare zone:** `vigilhub.io`
**DNS record:** `_dmarc.vigilhub.io` (TXT)
**Gate routine:** `trig_01RZLcj1jpxvDQAwnFmUG9d9` (existing — DO NOT duplicate)
**Requirement:** OPS-02 (REQUIREMENTS.md line 23)
**Roadmap:** ROADMAP.md "Phase 119: DMARC quarantine ramp" (line 461)

---

## Section 1 — Pre-ramp state (snapshot block)

```bash
dig TXT _dmarc.vigilhub.io +short
# Expected pre-ramp output (captured 2026-05-01):
# "v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com"
```

**Re-snapshot at ramp time:** Immediately before the dashboard edit, re-run the `dig` command and paste the verbatim output below this line. This captures the exact pre-state for the ramp record (drift detection — if pre-state already differs from `p=none`, ABORT and investigate before touching the dashboard).

```text
# Operator paste verbatim re-snapshot here (at ramp time):
#
#
```

If the re-snapshot does NOT match the captured 2026-05-01 value verbatim, STOP. Investigate via Cloudflare audit log or `git log` of this file before proceeding to Section 2.

---

## Section 2 — Cloudflare dashboard locator + click-path

Manual edit only — per D-03, no Cloudflare API token, no scripted DNS automation, no Cloudflare CLI install. The auto-PR from `trig_01RZLcj1jpxvDQAwnFmUG9d9` is the paper trail; this dashboard edit is the physical action verified post-hoc by `dig`.

1. Login: open `https://dash.cloudflare.com/`
2. Zone selector: click `vigilhub.io`
3. Sidebar: `DNS` → `Records`
4. Record filter: search `_dmarc` (TXT) — there is exactly one `_dmarc` TXT record at apex
5. Click `Edit` on that row
6. In the `Content` field, replace the existing string verbatim with the new TXT value (Section 3)
7. Leave `Type` (TXT), `Name` (`_dmarc`), `TTL` (Auto), `Proxy status` (DNS only) unchanged
8. Click `Save`

---

## Section 3 — Exact before/after values

| When | TXT value |
|------|-----------|
| Before (current) | `v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com` |
| After (target — PASS branch) | `v=DMARC1; p=quarantine; rua=mailto:jamesonmorrill1@gmail.com` |

Only the `p=` tag changes from `none` to `quarantine`. All other tags are preserved per D-02. There is NO percent-sample tag — defaults to 100% per D-01 (the auto-eval routine's evidence bar — ≥7 days clean rua + ≥3 days verify-email volume + ≥50 sends/day — IS the safety sample). There is NO strict DKIM alignment tag, NO subdomain policy tag, NO forensic-report tag — explicitly deferred to v3.8+ per CONTEXT.md `<deferred>`.

---

## Section 4 — Post-ramp `dig` verification

```bash
# Wait ~30s for Cloudflare propagation, then:
dig TXT _dmarc.vigilhub.io +short
# Expected output:
# "v=DMARC1; p=quarantine; rua=mailto:jamesonmorrill1@gmail.com"
```

```text
# Operator paste verbatim post-ramp dig output here:
#
#
# Observed TTL (Cloudflare default is `Auto` ≈ 300s — verify live):
#
```

If the post-ramp `dig` output does NOT contain the literal substring `p=quarantine`, the ramp is incomplete — DO NOT proceed to Section 5. Return to Section 2 and re-verify the dashboard edit (look for whitespace drift, accidental quote characters, or browser autocomplete).

---

## Section 5 — Two-path smoke (D-05)

Both legs MUST pass `dmarc=pass` in raw Gmail headers before the phase can close (covers ROADMAP SC #4). The two paths exist because verify-email and forgot-password emit from different `email-service.ts` call sites — testing one would miss alignment regressions specific to the other.

### Leg A — forgot-password real send

```bash
cd vigil-core
npx tsx scripts/smoke-test-forgot-password.ts jamesonmorrill1@gmail.com
```

Then in Gmail:
1. Open the latest "Reset your Vigil password" email
2. Three-dots menu → `Show original`
3. Search the raw headers for the line beginning with `Authentication-Results:`
4. Confirm it contains the substring `dmarc=pass`
5. Paste the relevant `Authentication-Results:` lines verbatim below

```text
# Operator paste Authentication-Results header verbatim (Leg A — forgot-password):
#
#
```

### Leg B — verify-email real send (`POST /v1/auth/resend-verification`)

`vigil-core/scripts/smoke-test-verify-email.ts` is DB-token-only and does NOT actually send mail. For Leg B, the runbook drives a real send through `POST /v1/auth/resend-verification` against prod for the seed user.

```bash
# Acquire a fresh JWT for the seed user — exact command depends on local auth tooling.
# One acceptable form (mirrors smoke-test-email.ts pattern):
JWT=$(curl -s -X POST https://api.vigilhub.io/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"jamesonmorrill1@gmail.com","password":"<seed-password>"}' \
  | jq -r .token)
# Trigger a real resend-verification send:
curl -i -X POST https://api.vigilhub.io/v1/auth/resend-verification \
  -H "Authorization: Bearer $JWT"
# Expect HTTP 200 + ok:true. The endpoint sends asynchronously (background) — wait ~10s.
```

Then in Gmail:
1. Open the latest "Verify your Vigil email" message
2. Three-dots menu → `Show original`
3. Confirm the `Authentication-Results:` header contains `dmarc=pass`
4. Paste verbatim below

```text
# Operator paste Authentication-Results header verbatim (Leg B — verify-email resend):
#
#
```

If either leg shows `dmarc=fail`, `dmarc=quarantine`, or anything other than `dmarc=pass` — that is rollback trigger #1 (D-06). Jump to Section 7 immediately.

---

## Section 6 — PASS / FAIL / DEFERRED branch annotations

This is where the auto-PR from `trig_01RZLcj1jpxvDQAwnFmUG9d9` appends evidence on the routine's determination. Three sub-headings cover ROADMAP SC #1, #2, and #3 respectively.

### PASS branch (covers ROADMAP SC #1 + #2)

> Auto-eval routine fired YYYY-MM-DD, ≥7 days clean rua, ≥3 days verify-email volume, no DKIM/SPF failures from legit Vigil mail. Ramp executed Sections 1-5 above. Both smoke legs `dmarc=pass`. Phase closes.

```text
# Operator (or auto-PR) paste evidence here:
# - Auto-eval fire date:
# - rua clean window (start → end):
# - verify-email volume window (start → end):
# - Ramp timestamp (post-Section 4 dig):
# - Smoke Leg A result:
# - Smoke Leg B result:
```

### FAIL branch (covers ROADMAP SC #3)

> Auto-eval routine fired YYYY-MM-DD, gate FAILED because <reason: e.g., rua report shows DKIM=fail on M sends from legit origin / verify-email volume below 3 days / aggregate report missing for N consecutive days>. Ramp does NOT fire. Re-eval scheduled for YYYY-MM-DD (typically +7 days).

```text
# Operator (or auto-PR) paste deferral reason here:
# - Auto-eval fire date:
# - Failing criterion:
# - Specific evidence (rua excerpt, volume count, etc.):
# - Re-eval date:
```

### DEFERRED branch

> Auto-eval routine fired 2026-05-06. Gate DEFERRED — 0 of 3 conditions confirmed met.
> No DNS edit performed. Re-eval scheduled 2026-05-20 (+14 days, full DMARC cycle).

```text
# Auto-eval fire date: 2026-05-06
# Criteria met: none confirmed
# Criteria below threshold / unverifiable:
#   C1 (≥7 consecutive rua reports): NOT MET — only 4 Google reports received
#       (2026-04-24, -25, -26, -28); gap on 2026-04-27; 8-day silence 2026-04-29
#       through 2026-05-05; XML content unreadable via Gmail MCP (attachment-only).
#   C2 (≥3 days verify-email production traffic): CANNOT CONFIRM — no Resend
#       dashboard access, Railway CLI unavailable; DMARC silence is strong negative
#       signal; manual UAT (2026-04-26, ~3-4 emails) excluded per seed conditions.
#   C3 (≥50 sends/day in most recent report): CANNOT CONFIRM — XML unreadable;
#       very likely NOT MET given sparse report count and 8-day rua silence.
# Self-reschedule date: 2026-05-20
# Checkpoint: .planning/seeds/SEED-003-checkpoint-2026-05-06.md
```

### Operator amendment — accepted as steady state (2026-05-06)

> Operator: jamesonmorrill1@gmail.com. After reviewing the routine's 0-of-3
> determination, the underlying signal (8-day rua silence since 2026-04-29)
> is not a transient gate failure — it reflects vigilhub.io's actual
> production scale. At single-user volume, receivers don't emit daily
> aggregate reports often enough to satisfy a ≥7-day clean window, and they
> won't until sustained signup traffic materializes. The DMARC ramp gate as
> designed is structurally gated on growth that hasn't happened yet.
>
> **Decision:** `p=none` is accepted as the steady-state DMARC posture for
> v3.7 closeout. Phase 119 closes on this amendment, NOT on a future ramp.
> ROADMAP SC #1 / #2 (PASS-branch criteria) are formally waived; SC #3
> (FAIL/DEFERRED branch documented) is satisfied by this section.

```text
# Amendment date: 2026-05-06
# Steady-state TXT value (no change from pre-ramp):
#   v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com
# What's preserved:
#   - rua aggregate monitoring continues (zero cost, zero deploy risk)
#   - Gate routine trig_01RZLcj1jpxvDQAwnFmUG9d9 remains scheduled
#     (next fire 2026-05-20, abandonment window opens 2026-05-24)
#   - Cloudflare TXT record: UNTOUCHED
#   - Section 7 rollback procedure: not applicable (no ramp to roll back)
# What's released:
#   - v3.7 milestone close is unblocked — Phase 119 terminates here
#   - Operator no longer waits on rua volume to accumulate
```

### Re-activation conditions

The ramp is not abandoned, only deferred to a meaningful trigger. Reopen
this runbook (or supersede it via a new phase) if ANY of the following
hold:

1. **Volume materializes.** rua aggregate reports resume daily flow with
   ≥50 sends/day for ≥7 consecutive days — the original SEED-003
   threshold. Re-arm `trig_01RZLcj1jpxvDQAwnFmUG9d9` and re-execute
   Sections 1-5 above.
2. **Spoofing observed.** A rua report shows `disposition=none` records
   with `dkim=fail` AND `spf=fail` from a non-Vigil source IP, indicating
   active spoofing of `@vigilhub.io`. At that point `p=quarantine` becomes
   user-protective rather than theoretical, and Sections 1-5 execute under
   incident response (faster than the SEED-003 evidence bar).
3. **Compliance requirement.** A future enterprise deal, regulatory
   posture, or downstream receiver (Gmail bulk-sender requirements,
   Microsoft tenant policies, etc.) mandates `p=quarantine` or stronger.
   At that point cost/benefit shifts and the ramp executes regardless of
   organic volume.

### What this amendment does NOT do

- It does NOT delete the gate routine. The routine continues to fire on
  its existing schedule; if conditions ever spontaneously resolve, the
  routine will open a PR and the operator can reconsider.
- It does NOT modify the Cloudflare DNS record. `_dmarc.vigilhub.io` stays
  at `p=none`. No dashboard touch.
- It does NOT close SEED-003. The seed remains dormant — its trigger
  conditions are still well-formed; only the v3.7 deadline is being
  released.
- It does NOT preclude tightening to `p=quarantine` later. It simply
  releases v3.7 from waiting on a precondition that is not load-bearing
  at current scale.

---

## Section 7 — Rollback (D-06)

### Three rollback trigger criteria (verbatim from D-06)

1. Either smoke leg (Section 5) shows `dmarc=fail` or `dmarc=quarantine` in Gmail headers → rollback immediately, before phase closes.
2. Within 14 days post-ramp, any rua aggregate report shows non-zero `disposition=quarantine` on legit Vigil-origin mail (DKIM=pass + SPF=pass but quarantined) → rollback.
3. User-reported "I never got my verify email / reset link" + Gmail spam folder confirms quarantine → rollback.

### Rollback action (manual, mirrors ramp in reverse)

1. Cloudflare dashboard → `vigilhub.io` zone → DNS → Records → `_dmarc` (TXT) → Edit
2. Replace `Content` with: `v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com`
3. Save
4. Wait ~30s, then verify:

```bash
dig TXT _dmarc.vigilhub.io +short
# Expected:
# "v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com"
```

5. Log timestamp + reason + which trigger fired (1, 2, or 3) below:

```text
# Operator paste rollback record here:
# - Timestamp (UTC):
# - Trigger fired (1 / 2 / 3):
# - Reason / evidence:
# - Post-rollback dig output:
```

6. Re-run the two-path smoke (Section 5) to confirm legitimate mail flows again — both legs MUST show `dmarc=pass` post-rollback. This is the same expectation as pre-ramp, since `p=none` does not affect disposition; the smoke pass confirms the rollback restored monitoring-only state cleanly.
7. Open a follow-up todo via `/gsd-add-todo` to capture root-cause investigation BEFORE any future re-ramp attempt. Do not re-attempt the ramp without resolving the trigger condition first.

---

## Section 8 — Cross-References

- **Requirement:** [REQUIREMENTS.md OPS-02](../../REQUIREMENTS.md)
- **Roadmap:** [ROADMAP.md "Phase 119: DMARC quarantine ramp"](../../ROADMAP.md)
- **Decisions:** [119-CONTEXT.md D-01 through D-06](./119-CONTEXT.md)
- **Seed:** [SEED-003-tighten-dmarc-to-quarantine.md](../../seeds/SEED-003-tighten-dmarc-to-quarantine.md) — original ramp plan; D-01 supersedes its 10-percent-sample advice based on the 5-06 routine's evidence bar
- **Gate routine:** `trig_01RZLcj1jpxvDQAwnFmUG9d9` (memory `project_seed_003_dmarc_routine.md`) — DO NOT duplicate
- **Drift-prevention precedent:** memory `project_secret_drift.md` (drove D-03 — no Cloudflare API token, no scripted DNS tooling)
- **Pattern reference:** [118-RUNBOOK.md](../118-production-test-user-cleanup/118-RUNBOOK.md) — D-04 runbook artifact format
