---
phase: 111
plan: 01
status: complete
started: 2026-04-24
completed: 2026-04-24
requirements:
  - EMAIL-01
---

# Plan 111-01 — DNS + Resend domain verification (SUMMARY)

## Outcome

`vigilhub.io` is a verified Resend sending domain as of `2026-04-24T17:52:00Z` (Apr 24, 10:52 AM Pacific). All 4 DNS records show green Verified status in the Resend dashboard. Success Criterion #2 (dig + Resend dashboard verified) satisfied.

## Records configured

| # | Type | Name | Content | Notes |
|---|------|------|---------|-------|
| 1 | TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDVXjVd+cfTApthvQ2Em94xrhDhCdQzFssdQ1Ih6pID8G2OByQ2whDsn6U/Kn+Qapoi/SXmWTMI+OOludnU/Vp/hhrQC4S+ODCHmn8MF4QoHgrWhqjLIB/sPjtglH1YulXJ7shKGpbaqR7Sjos/Pw/UDhhlMYC0WvwhlnyqXfJlQQIDAQAB` | DKIM public key — TXT (not CNAME as original plan assumed) |
| 2 | TXT | `send` | `v=spf1 include:amazonses.com ~all` | SPF at `send.vigilhub.io` subdomain |
| 3 | MX  | `send` (priority 10) | `feedback-smtp.us-east-1.amazonses.com` | Bounce/complaint feedback via AWS SES |
| 4 | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com` | Overrides Resend's default (added `rua=` per D-02) |

## dig verification (2026-04-24T16:49:44Z)

```
$ dig TXT resend._domainkey.vigilhub.io +short
"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDVXjVd+cfTApthvQ2Em94xrhDhCdQzFssdQ1Ih6pID8G2OByQ2whDsn6U/Kn+Qapoi/SXmWTMI+OOludnU/Vp/hhrQC4S+ODCHmn8MF4QoHgrWhqjLIB/sPjtglH1YulXJ7shKGpbaqR7Sjos/Pw/UDhhlMYC0WvwhlnyqXfJlQQIDAQAB"

$ dig TXT send.vigilhub.io +short
"v=spf1 include:amazonses.com ~all"

$ dig MX send.vigilhub.io +short
10 feedback-smtp.us-east-1.amazonses.com.

$ dig TXT _dmarc.vigilhub.io +short
"v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com"

# Root SPF untouched
$ dig TXT vigilhub.io +short
"v=spf1 include:icloud.com ~all"
"apple-domain=xonBtKK6HtswTnF6"
```

## Gotchas + deviations from plan

### 1. Apple iCloud+ custom email domain coexistence (not anticipated by Plan 01)

`vigilhub.io` already had Apple iCloud+ custom email configured (iCloud MX records, `v=spf1 include:icloud.com ~all` at root, Apple DKIM at `sig1._domainkey`). Plan 01 D-03 was written assuming Resend would be the only sender and prescribed `v=spf1 include:_spf.resend.com -all` at root — applying that literally would have erased iCloud authorization and broken personal email from `@vigilhub.io` addresses.

**Resolution:** Resend's current setup pattern isolates SPF/MX to a dedicated `send.` subdomain, eliminating the conflict entirely. iCloud root SPF stays 100% untouched. See `111-01-DNS-RECORDS.md` for the full deviation write-up vs. locked decisions D-01/D-02/D-03.

### 2. Resend setup pattern changed from Plan 01's assumption

Plan 01 assumed DKIM would be a CNAME pointing to a Resend-owned target (classic older pattern). Resend's dashboard now emits:
- **DKIM as a TXT** at `resend._domainkey` with the public key inline (not a CNAME).
- **SPF + MX at `send.` subdomain** (not root).
- **DMARC at root** (same as plan).

Downstream effects:
- Threat T-111-03 (proxied DKIM CNAME → Cloudflare edge IPs) no longer applies — TXT records cannot be proxied in Cloudflare. The gray-cloud checkpoint from Plan 01 Task 2 is moot.
- Plan 02's hardcoded `from: "noreply@vigilhub.io"` still works correctly — DKIM signs the root domain, so DMARC alignment passes via DKIM alignment even though SPF technical check resolves against `send.vigilhub.io`.

### 3. Click/open tracking relocation (from Plan 02 deviation)

Resend SDK v6.12.2 removed per-send `click_tracking`/`open_tracking` options. Plan 02 rewrote the test assertions to verify the *absence* of those keys on the send payload. Mitigation T-111-09 (Apple Mail pre-fetch breaking single-use reset tokens) now relocates to the Resend **domain-level** tracking toggles in the UI.

**Next action (pending before Plan 03 Task 3 live send):** toggle off click & open tracking at `https://resend.com/domains/vigilhub.io` → Configuration tab. Domain settings unlocked post-verification.

## Success Criteria (Plan 01 scope)

| ROADMAP SC# | Criterion | Status |
|---|---|---|
| 2 | `dig` + Resend dashboard verified | ✓ PASS — documented above |

Deferred to Plan 03:
- SC#1 (deliverability inbox test) — requires Plan 02 code (done) + Plan 01 DNS (done) + Railway env var
- RESEND_API_KEY generation (deferred to Plan 03 when first used)
