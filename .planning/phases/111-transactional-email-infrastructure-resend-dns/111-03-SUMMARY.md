---
phase: 111
plan: 03
status: complete
started: 2026-04-24
completed: 2026-04-24
requirements:
  - EMAIL-01
---

# Plan 111-03 — Live email verification (SUMMARY)

## Outcome

End-to-end transactional email flow verified live. Resend sent a real password-reset email from `noreply@vigilhub.io` to `jamesonmorrill1@gmail.com`, arrived in Gmail Inbox within ~2 seconds, passed DKIM + SPF + DMARC, and preserved the reset URL verbatim (no tracking rewrite). Phase 112 (forgot-password) can now safely import `sendPasswordResetEmail` with confidence that the transport works.

All 5 Phase 111 Success Criteria satisfied. See `111-03-LIVE-VERIFICATION.md` for full evidence.

## What shipped

| Artifact | Purpose |
|---|---|
| `vigil-core/scripts/smoke-test-email.ts` | Reusable one-shot smoke — reads `VIGIL_APP_BASE_URL` from env, sends one reset email via `sendPasswordResetEmail`, prints result + message id. Not wired into CI. |
| `.planning/phases/111-.../111-03-LIVE-VERIFICATION.md` | Log of Railway env setup, post-deploy health check, smoke send stdout, Gmail auth headers, verbatim CTA href, Resend dashboard delivery confirmation. |
| Railway env vars (`RESEND_API_KEY`, `VIGIL_APP_BASE_URL`) on vigil-core service | Production runtime configuration. Key stored in 1Password + Railway only — not in local `.env` or any committed file. |

## Live send evidence

- Resend message id: `c787e114-193a-4bbb-9c7a-b98610cf7724`
- Gmail `Received:` timestamp: `Fri, 24 Apr 2026 10:12:59 -0700`
- Auth: `dkim=pass` (vigilhub.io selector `resend` + bonus amazonses.com) / `spf=pass` (send.vigilhub.io) / `dmarc=pass` (via DKIM alignment, p=NONE)
- CTA href (decoded from quoted-printable): `https://app.vigilhub.io/auth/reset?token=smoke-test-1777050777894` — verbatim, no tracking rewrite.
- Teal brand color `#1D9E75` rendered in Gmail.

## Gotchas + deviations

### 1. Plan-spec env-fallback used `??` but acceptance criteria required empty-string fallback behavior

Plan 03 Task 2 literal script: `const origin = process.env["VIGIL_APP_BASE_URL"] ?? "https://app.vigilhub.io";`

Nullish coalescing (`??`) only falls back on `undefined`/`null`. But the plan's own acceptance-criteria command uses inline env `VIGIL_APP_BASE_URL= npx tsx ...` which sets the var to an **empty string** in the child process, not undefined. Empty string passes through `??` unchanged → `origin === ""` → fallback never engages → the plan's own acceptance criterion can't pass with its own literal script.

**Resolution:** Changed `??` to `||` so empty-string triggers fallback same as unset. Both runs (empty var AND set-to-localhost) now behave per plan intent:
- `VIGIL_APP_BASE_URL=` → origin is `https://app.vigilhub.io` (fallback)
- `VIGIL_APP_BASE_URL=http://localhost:5173` → origin is `http://localhost:5173` (env read)

### 2. Plan acceptance criterion "`grep -cE 'https://app.vigilhub.io' returns exactly 1`" is inconsistent with plan's own literal script

The plan's literal script contains `https://app.vigilhub.io` in THREE places: the JSDoc comment header ("falls back to https://app.vigilhub.io"), the fallback string literal, and the `[smoke] Origin (...)` log message. The plan's acceptance criterion demanding "exactly 1" would fail against the plan's own script. The intent ("don't hardcode the URL in the reset URL template string") is satisfied — `testUrl` uses `${origin}` interpolation, not a hardcoded URL. Deviation accepted; passing 3 occurrences is correct.

## Success Criteria (Phase 111 final)

| SC# | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Manual test email lands in Gmail inbox (not Spam) | ✓ PASS | Gmail screenshot shows "Inbox - Google", email delivered <60s |
| 2 | dig + Resend dashboard verified | ✓ PASS | Plan 01 SUMMARY — all 4 records green in Resend, dig confirms resolution |
| 3 | Verbatim href in raw source (no click tracking) | ✓ PASS | Gmail raw source — `<a href="https://app.vigilhub.io/auth/reset?token=smoke-test-1777050777894">` |
| 4 | Boots with `RESEND_API_KEY` unset | ✓ PASS | Plan 02 SUMMARY — cold-call smoke returns `{"status":"skipped_no_key"}` |
| 5 | `RESEND_API_KEY` in Railway + commented in `.env.example` | ✓ PASS | Railway Variables (this plan) + `vigil-core/.env.example` RESEND_API_KEY block (Plan 02) |

## Phase verdict

✓ All 5 Success Criteria PASS. EMAIL-01 requirement satisfied. Phase 111 ready to mark complete; Phase 112 (forgot-password) unblocked.
