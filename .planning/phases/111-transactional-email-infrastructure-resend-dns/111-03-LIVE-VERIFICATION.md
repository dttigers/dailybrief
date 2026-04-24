---
phase: 111
plan: 03
status: complete
started: 2026-04-24
completed: 2026-04-24
updated: 2026-04-24
---

# Plan 111-03 — Live email verification log

## Railway env set

Timestamp: `2026-04-24T17:08Z` (user confirmed via health-check curl timestamp)

Variables added to the **vigil-core** Railway service:

| Variable name | Source | Notes |
|---|---|---|
| `RESEND_API_KEY` | Generated at https://resend.com/api-keys — scoped: Sending access, Domain: vigilhub.io | Value NOT committed here — stored in 1Password + Railway Variables only (per memory `project_secret_drift.md` — avoid key sprawl) |
| `VIGIL_APP_BASE_URL` | Literal `https://app.vigilhub.io` (CONTEXT D-06) | Public URL — safe to log |

## Post-deploy health check

```
$ curl -sS https://api.vigilhub.io/v1/health
{"status":"ok","timestamp":"2026-04-24T17:08:54.496Z","version":"0.1.0","database":"connected"}
```

HTTP 200. Database connected. Railway redeploy after env var injection completed successfully. No regression from adding `RESEND_API_KEY` + `VIGIL_APP_BASE_URL` to the environment.

## Smoke send

Executed `2026-04-24T17:12:57Z` from the iMac dev machine (`~/Desktop/Local AI/dailybrief/vigil-core`) via `npx tsx scripts/smoke-test-email.ts jamesonmorrill1@gmail.com` with `RESEND_API_KEY` + `VIGIL_APP_BASE_URL=https://app.vigilhub.io` exported in the shell.

Stdout:

```
[smoke] Origin (from VIGIL_APP_BASE_URL env, fallback https://app.vigilhub.io): https://app.vigilhub.io
[smoke] Sending password-reset email to jamesonmorrill1@gmail.com
[smoke] Reset URL (will appear verbatim in email body): https://app.vigilhub.io/auth/reset?token=smoke-test-1777050777894
[smoke] Result: {"status":"sent","id":"c787e114-193a-4bbb-9c7a-b98610cf7724"}
[smoke] SUCCESS — Resend message id: c787e114-193a-4bbb-9c7a-b98610cf7724
[smoke] Cross-reference at https://resend.com/emails/c787e114-193a-4bbb-9c7a-b98610cf7724
```

- Resend message id: `c787e114-193a-4bbb-9c7a-b98610cf7724`
- Reset URL (sent): `https://app.vigilhub.io/auth/reset?token=smoke-test-1777050777894`
- Origin confirmed honored by `VIGIL_APP_BASE_URL` env read (not the hardcoded fallback).
- Exit code: 0

`RESEND_API_KEY` unset from shell immediately after. No key committed or logged.

## Gmail auth headers

Email delivered to **Inbox** (not Spam, not Promotions, not Updates) at Apr 24, 11:12 AM local (1 min 1 sec after send). From `noreply@vigilhub.io`, subject `Reset your Vigil password`.

Copied from Gmail "Show original" — `ARC-Authentication-Results` block:

```
dkim=pass header.i=@vigilhub.io header.s=resend header.b=Q94VetAz;
dkim=pass header.i=@amazonses.com header.s=224i4yxa5dv7c2xz3womw6peuasteono header.b=gWR9+obk;
spf=pass (google.com: domain of 0100019dc07afbf3-36d4f737-904a-416a-9a1f-67c495271c38-000000@send.vigilhub.io designates 54.240.9.25 as permitted sender) smtp.mailfrom=0100019dc07afbf3-36d4f737-904a-416a-9a1f-67c495271c38-000000@send.vigilhub.io;
dmarc=pass (p=NONE sp=NONE di...)
```

All three auth checks PASS:
- **DKIM PASS** (root `@vigilhub.io`, selector `resend`) — our `resend._domainkey` TXT validated against the DKIM signature.
- **DKIM PASS** (bonus, `@amazonses.com`) — the underlying SES transport is ALSO DKIM-signed; double-authenticated.
- **SPF PASS** — envelope-from `...@send.vigilhub.io` aligned against the `send.` subdomain SPF TXT authorizing `include:amazonses.com`; resolving IP `54.240.9.25` is a permitted sender.
- **DMARC PASS** — DKIM alignment with the root `@vigilhub.io` header.from means DMARC aligns via DKIM (which is sufficient); policy `p=NONE` means no enforcement is requested — report-only posture.

## CTA href (raw source)

From Gmail raw source (quoted-printable decoded — `=3D` → `=` and soft line breaks removed):

```html
<a href="https://app.vigilhub.io/auth/reset?token=smoke-test-1777050777894" style="display: inline-block; background: #1D9E75; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: 600;">Set new password</a>
```

**The href is VERBATIM** the URL printed by the smoke script — starts with `https://app.vigilhub.io/auth/reset?token=smoke-test-` with the exact epoch token `1777050777894` we sent. No `link.resend.com` rewrite, no `r/` redirect, no `track.` subdomain. T-111-09 mitigation verified empirically:
- No tracking subdomain configured in Resend → no URL rewriting happens.
- Apple Mail pre-fetch cannot consume single-use tokens because the pre-fetched URL IS the reset URL, not a redirect.

Inline styling `#1D9E75` confirms Vigil teal brand color (per D-09 + memory `reference_brand_guidelines.md`) renders correctly in Gmail.

## Resend dashboard delivery

Message `c787e114-193a-4bbb-9c7a-b98610cf7724` viewable at `https://resend.com/emails/c787e114-193a-4bbb-9c7a-b98610cf7724`. Gmail delivery timestamp (`Received:` header) was `Fri, 24 Apr 2026 10:12:59 -0700` — delivered within ~2 seconds of send. End-to-end live flow verified.
