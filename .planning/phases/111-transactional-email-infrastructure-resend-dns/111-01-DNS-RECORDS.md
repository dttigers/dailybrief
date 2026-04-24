---
phase: 111
plan: 01
status: in_progress
started: 2026-04-24
updated: 2026-04-24
---

# Plan 111-01 — DNS records verification log

## Context: existing DNS state (pre-change)

`vigilhub.io` has Apple iCloud+ custom email domain configured. Records observed before any Plan 01 changes:

```
$ dig TXT vigilhub.io +short
"v=spf1 include:icloud.com ~all"
"apple-domain=xonBtKK6HtswTnF6"

$ dig TXT _dmarc.vigilhub.io +short
(empty)

$ dig MX vigilhub.io +short
10 mx02.mail.icloud.com.
10 mx01.mail.icloud.com.

$ dig CNAME sig1._domainkey.vigilhub.io +short
sig1.dkim.vigilhub.io.at.icloudmailadmin.com.
```

## Deviation from Plan 01 decisions D-01, D-02, D-03 — Resend setup pattern changed

Plan 01 was written against an older Resend setup that placed all records at the root domain:
- DKIM CNAME at `resend._domainkey.vigilhub.io` → Resend-owned target
- SPF TXT at root `vigilhub.io` → `v=spf1 include:_spf.resend.com -all`
- DMARC TXT at root `_dmarc.vigilhub.io`

Resend's current setup pattern (observed in dashboard 2026-04-24) uses a dedicated **`send.`** subdomain for the envelope From / SPF / MX, with DKIM still signing the root domain. This is the deliverability-recommended pattern — keeps Vigil's transactional sending reputation isolated and eliminates the iCloud SPF collision.

**Actual records Resend emitted:**

| # | Type | Name | Content | Why |
|---|---|---|---|---|
| 1 | TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDVXjVd+cfTApthvQ2Em94xrhDhCdQzFssdQ1Ih6pID8G2OByQ2whDsn6U/Kn+Qapoi/SXmWTMI+OOludnU/Vp/hhrQC4S+ODCHmn8MF4QoHgrWhqjLIB/sPjtglH1YulXJ7shKGpbaqR7Sjos/Pw/UDhhlMYC0WvwhlnyqXfJlQQIDAQAB` | DKIM public key — signs `From: @vigilhub.io` so root domain aligns for DMARC |
| 2 | TXT | `send` | `v=spf1 include:amazonses.com ~all` | SPF at `send.vigilhub.io` (subdomain only) — authorizes Resend's AWS SES backend |
| 3 | MX | `send` (priority 10) | `feedback-smtp.us-east-1.amazonses.com` | Bounce / complaint return-path to Resend's SES handler |
| 4 | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com` | Overrides Resend's default (which lacks rua=) per CONTEXT D-02 verbatim |

**Implications vs. original Plan 01:**

1. **No SPF merge needed at root.** iCloud's existing `v=spf1 include:icloud.com ~all` at the root stays UNCHANGED. Resend uses `send.vigilhub.io` for SPF instead. The SPF merge options (A `~all` vs B `-all`) that were being discussed become moot — we don't touch the root SPF at all.
2. **No gray-cloud DKIM concern.** DKIM is now a TXT record (not CNAME), and Cloudflare cannot proxy TXT records. Threat T-111-03 (proxied DKIM CNAME resolving to Cloudflare edge IPs) no longer applies.
3. **DMARC value override.** Resend's default DMARC omits `rua=`. We override with the D-02 verbatim value so DMARC reports flow to `jamesonmorrill1@gmail.com`.
4. **Sending / From address unchanged.** Plan 02's hardcoded `from: "noreply@vigilhub.io"` still works because DKIM signs the root domain (`vigilhub.io`), so DMARC alignment passes via DKIM alignment even though SPF technical check resolves against `send.vigilhub.io`.

## DKIM CNAME target (from Resend)

N/A — Resend's current pattern uses a DKIM TXT at `resend._domainkey` with the public key inline, not a CNAME pointing to a Resend-owned target. See table above for the exact TXT value captured from the Resend dashboard.

## dig verification

Run at `2026-04-24T16:49:44Z` from the project dev machine (1.1.1.1 / 8.8.8.8 resolvers, Cloudflare authoritative):

```
$ dig TXT resend._domainkey.vigilhub.io +short
"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDVXjVd+cfTApthvQ2Em94xrhDhCdQzFssdQ1Ih6pID8G2OByQ2whDsn6U/Kn+Qapoi/SXmWTMI+OOludnU/Vp/hhrQC4S+ODCHmn8MF4QoHgrWhqjLIB/sPjtglH1YulXJ7shKGpbaqR7Sjos/Pw/UDhhlMYC0WvwhlnyqXfJlQQIDAQAB"

$ dig TXT send.vigilhub.io +short
"v=spf1 include:amazonses.com ~all"

$ dig MX send.vigilhub.io +short
10 feedback-smtp.us-east-1.amazonses.com.

$ dig TXT _dmarc.vigilhub.io +short
"v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com"

# Sanity check — root SPF is untouched (iCloud only, Resend isolated to send. subdomain)
$ dig TXT vigilhub.io +short
"v=spf1 include:icloud.com ~all"
"apple-domain=xonBtKK6HtswTnF6"
```

All 4 Resend records resolve correctly. Root SPF untouched — iCloud personal email unaffected.

## Resend verified

**Domain status: Verified** — confirmed in Resend dashboard (`https://resend.com/domains/vigilhub.io`) at `2026-04-24T17:52:00Z` (Apr 24, 10:52 AM Pacific).

Dashboard "Domain Events" timeline:
- Domain added — Apr 24, 10:39 AM
- DNS verified — Apr 24, 10:51 AM
- Domain verified — Apr 24, 10:52 AM

Region: North Virginia (us-east-1) — matches the `send.` MX host (`feedback-smtp.us-east-1.amazonses.com`).

All 4 records show green "Verified" status in the dashboard Records tab:
- DKIM (TXT `resend._domainkey`) — ✓ Verified
- MX (`send` → `feedback-smtp.us-east-1.amazonses.com`, priority 10) — ✓ Verified
- SPF (TXT `send` → `v=spf1 include:amazonses.com ~all`) — ✓ Verified
- DMARC (TXT `_dmarc`) — the Resend UI shows its expected value `v=DMARC1; p=none;` but the actual DNS record (confirmed by dig above) is our override `v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com`. Resend accepted this as compatible — `p=none` is the load-bearing assertion for its check; the extra `rua=` tag is additive and non-breaking.

Resend banner: _"Domain verified: Your domain is ready to send emails."_

## Resend domain-level tracking (replaces Plan 02's removed per-send click_tracking)

**Status: off by default — no tracking subdomain configured.** Verified via Resend dashboard at 2026-04-24.

Resend SDK v6.12.2 removed per-send `click_tracking` / `open_tracking` options. Mitigation T-111-09 (Apple Mail pre-fetch breaking single-use reset tokens) relocates from code-level to domain-level.

What we found in the Resend UI:
- The `vigilhub.io` domain Configuration tab routes to `/domains/<id>/tracking` which is a **"New tracking subdomain" form**, not an edit-existing-settings page.
- No tracking subdomain exists on `vigilhub.io`. Resend's model is opt-in: tracking only applies when you create a tracking subdomain (e.g. `links.vigilhub.io`) and check "Enable click tracking" / "Enable open tracking" in that form.
- The form's click-tracking checkbox appears pre-checked as a **form default for future opt-in**, but no submission was made (the "Add domain" button was never clicked), so no tracking config was persisted.
- Account Settings has no separate tracking toggle (confirmed by human operator).

Net behavior: `emails.send(...)` payloads from vigil-core do NOT include `click_tracking` / `open_tracking` fields (asserted by `email-service.test.ts` — grep for "payload must NOT include click_tracking"), AND no domain-level tracking subdomain rewrites URLs on Resend's side. The `<a href>` in delivered email HTML should be the verbatim URL passed in.

**Empirical verification deferred to Plan 03 Task 3** — acceptance criterion requires the Gmail raw-source `<a href>` to start with `https://app.vigilhub.io/auth/reset?token=smoke-test-` with NO intermediate `link.resend.com` / `track.` / `r.resend.com` tracking domain. If that check fails we revisit tracking settings before marking phase complete.
