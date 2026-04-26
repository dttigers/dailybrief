---
id: SEED-003
status: dormant
planted: 2026-04-26
planted_during: v3.6 milestone (Phase 113 ship-day)
trigger_when: ≥7 consecutive daily DMARC aggregate reports show 100% DKIM+SPF pass with zero `disposition` actions, AND Phase 113's verify-email flow has accumulated ≥3 days of real production traffic
scope: Small
---

# SEED-003: Tighten DMARC from p=none to p=quarantine (eventually p=reject)

## Why This Matters

Phase 111 (transactional email infrastructure — Resend + Cloudflare DNS) shipped
DMARC at `p=none` by design. From [111-CONTEXT.md](../phases/111-transactional-email-infrastructure-resend-dns/111-CONTEXT.md) D-02:

> DMARC policy day 1 is `p=none` with aggregate reporting to `jamesonmorrill1@gmail.com`.
> Full value: `v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com`. Observe-only
> for 1-2 weeks of real sends; tighten to `p=quarantine` later once DKIM+SPF auth is
> consistently passing in the rua reports. Not a day-1 lock-in to `p=reject` — that's
> a future hardening phase if ever.

The first DMARC aggregate report from Google arrived 2026-04-26 covering a 24h
window: 2 sends, both DKIM ✓ + SPF ✓ + disposition: none. Pre-Phase-113 send
volume is too sparse to draw conclusions — verify-email goes live today and will
generate real transactional volume that exercises Resend → SES → recipient inbox
end-to-end. The trigger conditions below ensure the policy ramp has both
**duration** (sustained clean reports, not a 1-day fluke) and **volume** (enough
sends to surface any edge-case alignment failures).

Why the ramp matters: `p=none` is monitoring-only. A spammer spoofing
`@vigilhub.io` today would not be quarantined or rejected — recipient mail
servers see the DMARC record but take no action. This is fine while we're
still validating that legitimate Resend traffic aligns cleanly. But it leaves
the domain reputation exposed if any third party decides to spoof it. Tightening
to `p=quarantine` (then eventually `p=reject`) is the standard email-hygiene
hardening path, and it costs ~1 commit to do.

## When to Surface

**Trigger:** ≥7 consecutive daily DMARC aggregate reports show 100% DKIM+SPF
pass with zero `disposition` actions, AND Phase 113's verify-email flow has
accumulated ≥3 days of real production traffic.

This seed should be presented during `/gsd-new-milestone` when:
- The new milestone touches transactional email, DNS hardening, or domain reputation
- v3.7+ planning happens after early-May 2026 (gives the observation window
  enough runway)
- Volume metrics in the DMARC reports exceed ~50 sends/day (signals real usage)

**Practical:** open the inbox folder where DMARC aggregate reports land
(`noreply-dmarc-support@google.com` and similar from other receivers) about
once a week. If 7 consecutive daily reports are clean AND verify-email has
been live for 3+ days, this seed is ripe.

## Scope Estimate

**Small** — single-commit change. Per Phase 111 deferred-ideas: "Not a phase of
its own; can be done as a single-commit change once the data is in."

**The work:**
1. Edit Cloudflare DNS → `_dmarc.vigilhub.io` TXT record (find current record
   in [111-01-DNS-RECORDS.md](../phases/111-transactional-email-infrastructure-resend-dns/111-01-DNS-RECORDS.md))
2. Change `p=none` → `p=quarantine; pct=10` (start with 10% sample to limit
   blast radius if alignment quietly breaks under new load)
3. Wait 7 days. If reports still clean: bump to `pct=100`.
4. Wait another 7 days. If still clean: ramp to `p=reject`.

Optional: add `ruf=mailto:...` for forensic per-failure reports. Most
organizations skip this — aggregate reports are usually enough signal.

## Breadcrumbs

Related code and decisions:
- `.planning/phases/111-transactional-email-infrastructure-resend-dns/111-CONTEXT.md` — D-02 (DMARC `p=none` day-1 decision + ramp plan)
- `.planning/phases/111-transactional-email-infrastructure-resend-dns/111-01-DNS-RECORDS.md` — actual TXT record values committed to Cloudflare DNS
- `.planning/phases/111-transactional-email-infrastructure-resend-dns/111-01-PLAN.md` — DNS provisioning plan (where the `_dmarc` TXT was first set)
- Cloudflare zone: `vigilhub.io` (the domain registrar where the TXT record lives)
- Resend dashboard: domain verification status under `vigilhub.io` — should remain green throughout the ramp

## Notes

- The first aggregate report (2026-04-26, 24h window) showed only 2 sends because
  Phase 113 had not yet shipped. Subsequent reports will be much larger as
  verify-email + resend-rate-limit testing exercise the full flow.
- The `pct` parameter is the safety net — if `p=quarantine; pct=10` causes
  unexpected delivery problems, only 10% of mail is affected and the issue
  surfaces in time to roll back.
- DNS TTL on the `_dmarc` record affects rollback speed. Check 111-01-DNS-RECORDS.md
  for the configured TTL before ramping.
- This is not coupled to EXT-03 (Chrome+Safari extension JWT migration) or
  ServiceNow API pivot — purely an email-deliverability hardening item.
