---
phase: 111-transactional-email-infrastructure-resend-dns
verified: 2026-04-24T18:05:00Z
status: passed
score: 18/18 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
requirements_satisfied:
  - EMAIL-01
known_deviations_honored:
  - "Resend SDK v6.12.2 dropped per-send click_tracking/open_tracking — tests assert ABSENCE on payload; mitigation T-111-09 relocated to domain level (no tracking subdomain configured)"
  - "No tracking subdomain in Resend dashboard → tracking off at runtime (confirmed empirically by verbatim CTA href in Gmail raw source)"
  - "D-03 SPF value (root-level Resend SPF) NOT applied — Resend's current setup pattern uses `send.` subdomain; root SPF stays iCloud-only. Zero collision with Apple iCloud+ custom email domain."
  - "D-01 DKIM CNAME rewritten as DKIM TXT at resend._domainkey (Resend emits inline-key TXT in current setup pattern). Gray-cloud proxy check (T-111-03) no longer applies to TXT records."
  - "Plan 03 script uses `||` not `??` for env fallback (empty-string handling). Documented in 111-03-SUMMARY.md."
  - "Plan 03 acceptance criterion `grep exactly 1 for https://app.vigilhub.io` is plan-spec bug — actual script has 3 legitimate occurrences (comment, fallback literal, log). Intent (no hardcoded URL in reset-URL template) met via `${origin}` interpolation."
---

# Phase 111: Transactional Email Infrastructure (Resend + DNS) — Verification Report

**Phase Goal:** Vigil can send authenticated, deliverable email from `noreply@vigilhub.io` via Resend, with DNS fully verified and link tracking disabled
**Verified:** 2026-04-24T18:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

The phase goal is fully achieved. A real password-reset email was sent from `noreply@vigilhub.io` via Resend to `jamesonmorrill1@gmail.com`, landed in Gmail Inbox within ~2 seconds, passed DKIM + SPF + DMARC authentication (confirmed via "Show original" raw headers), and preserved the reset URL verbatim in the CTA href (no click-tracking rewrite). DNS records are live at Cloudflare and verified in the Resend dashboard. The vigil-core module boots safely with `RESEND_API_KEY` unset via lazy null-init, matching the posthog.ts pattern. `RESEND_API_KEY` and `VIGIL_APP_BASE_URL` are injected into Railway prod; local `.env.example` documents both with commented guidance.

## Observable Truths

### Plan 02 — Autonomous Code (vigil-core/src/services/email-service.ts + tests)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | vigil-core boots successfully with RESEND_API_KEY unset — no startup crash | ✓ VERIFIED | `grep -c 'RESEND_API_KEY' vigil-core/src/index.ts` = **0**. Plan 02 SUMMARY logs boot-without-key smoke output: `Vigil Core API running on 0.0.0.0:3001` + `grep -c 'FATAL' /tmp/vigil-boot.log` = 0. |
| 2   | `sendPasswordResetEmail(to, url)` returns `{ status: 'skipped_no_key' }` when RESEND_API_KEY absent | ✓ VERIFIED | Test "sendPasswordResetEmail returns skipped_no_key when RESEND_API_KEY is unset (resendClient=null)" PASSED. Implementation: email-service.ts line 116-118 (`if (client === null) return { status: "skipped_no_key" }`). |
| 3   | All 10 email-service tests pass | ✓ VERIFIED | Ran `cd vigil-core && npx tsx --test src/services/email-service.test.ts` — output: `tests 10 / pass 10 / fail 0 / duration_ms 510.23`. |
| 4   | `grep -c 'this.doSend' vigil-core/src/services/email-service.ts` returns 0 (closure-not-method footgun guard) | ✓ VERIFIED | `grep -c 'this.doSend' vigil-core/src/services/email-service.ts` = **0**. doSend is a local arrow constant (line 109) closed over lexically; wrappers are arrow-valued. |
| 5   | Reset URL embedded verbatim in HTML href — no URL rewriting | ✓ VERIFIED | email-service.ts line 172: `<a href="${resetUrl}" ...>`. Test "sendPasswordResetEmail embeds the reset URL verbatim in the HTML href — no click-tracking domain rewriting" PASSED, with explicit negative regex guards against `track./click./r/` rewrites. |
| 6   | PII hashing (to_hash via SHA-256) for captureException context | ✓ VERIFIED | email-service.ts line 58-64 defines `hashRecipient()` using `crypto.createHash("sha256").digest("hex").slice(0, 16)`. Test "sendPasswordResetEmail on failure calls captureException with a HASHED to-address, not the raw email (D-12)" PASSED. |
| 7   | `grep -c 'noreply@vigilhub.io' vigil-core/src/services/email-service.ts` >= 1 | ✓ VERIFIED | Returns **5** (header comment + send payload + 3 doc references). |
| 8   | `grep -c '#1D9E75' vigil-core/src/services/email-service.ts` >= 1 (Vigil teal) | ✓ VERIFIED | Returns **2** (CTA button + URL-echo color in both reset and verify templates). |

### Plan 01 — DNS + Resend Domain Verification

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 9   | `dig TXT resend._domainkey.vigilhub.io +short` returns the p=MIG... DKIM public key | ✓ VERIFIED | Live dig output: `"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDVXjVd+cfTApthvQ2Em94xrhDhCdQzFssdQ1Ih6pID8G2OByQ2whDsn6U/Kn+Qapoi/SXmWTMI+OOludnU/Vp/hhrQC4S+ODCHmn8MF4QoHgrWhqjLIB/sPjtglH1YulXJ7shKGpbaqR7Sjos/Pw/UDhhlMYC0WvwhlnyqXfJlQQIDAQAB"` |
| 10  | `dig TXT send.vigilhub.io +short` returns `"v=spf1 include:amazonses.com ~all"` | ✓ VERIFIED | Live dig output: `"v=spf1 include:amazonses.com ~all"` (exact match). |
| 11  | `dig MX send.vigilhub.io +short` returns `10 feedback-smtp.us-east-1.amazonses.com.` | ✓ VERIFIED | Live dig output: `10 feedback-smtp.us-east-1.amazonses.com.` (exact match). |
| 12  | `dig TXT _dmarc.vigilhub.io +short` returns the verbatim D-02 DMARC value | ✓ VERIFIED | Live dig output: `"v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com"` (exact match). |
| 13  | Root SPF still iCloud only — sanity: contains `include:icloud.com ~all`, no resend/amazonses | ✓ VERIFIED | Live dig output: `"v=spf1 include:icloud.com ~all"` + `"apple-domain=xonBtKK6HtswTnF6"`. Zero collision with Apple iCloud+ custom email domain. |

### Plan 03 — Live Send + Railway Env

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 14  | SC#1: email landed in Gmail Inbox (not Spam) — DKIM=PASS + SPF=PASS + DMARC=PASS | ✓ VERIFIED | 111-03-LIVE-VERIFICATION.md §Gmail auth headers pastes ARC-Authentication-Results block with `dkim=pass header.i=@vigilhub.io header.s=resend`, `spf=pass ... smtp.mailfrom=...@send.vigilhub.io`, `dmarc=pass`. `grep -cE "dkim=pass|spf=pass|dmarc=pass"` = 4 (bonus dkim pass from amazonses.com). Email delivered 11:12 AM Pacific, Resend message id `c787e114-193a-4bbb-9c7a-b98610cf7724`. |
| 15  | SC#3: verbatim href confirmed — `app.vigilhub.io/auth/reset` matches in LIVE-VERIFICATION.md; §CTA href section empirically free of tracking-domain rewriting | ✓ VERIFIED | `grep 'app.vigilhub.io/auth/reset' 111-03-LIVE-VERIFICATION.md` matches at lines 41, 48, 78, 81. The actual decoded raw-source href (line 78) is `<a href="https://app.vigilhub.io/auth/reset?token=smoke-test-1777050777894" ...>` — verbatim, no `link.resend.com`/`r.resend.com`/`track.` prefix. **Documentation phrasing note:** line 81 contains the strings "link.resend.com", "r/", "track." as part of an explicit NEGATIVE prose assertion ("No `link.resend.com` rewrite, no `r/` redirect, no `track.` subdomain") — this is empirical evidence of absence, not a real rewrite. Intent of SC#3 is fully satisfied by the verbatim href on line 78. |
| 16  | SC#5: `grep -c 'RESEND_API_KEY' vigil-core/.env.example` >= 1 (commented block exists) | ✓ VERIFIED | Returns **2** (in-comment reference + the `RESEND_API_KEY=` blank assignment at line 76). Phase 107.1 comment-block convention preserved. |
| 17  | Smoke script exercises env-read wiring (not hardcoded): `grep -c 'process.env\["VIGIL_APP_BASE_URL"\]' vigil-core/scripts/smoke-test-email.ts` = 1 | ✓ VERIFIED | Returns **1** at line 21: `const origin = process.env["VIGIL_APP_BASE_URL"] || "https://app.vigilhub.io";`. Live smoke stdout in 111-03-LIVE-VERIFICATION.md confirmed env read: `Origin (from VIGIL_APP_BASE_URL env, fallback https://app.vigilhub.io): https://app.vigilhub.io`. |
| 18  | RESEND_API_KEY + VIGIL_APP_BASE_URL set in Railway Variables; Railway deploy healthy | ✓ VERIFIED | 111-03-LIVE-VERIFICATION.md §Railway env set: both variable NAMES listed at 2026-04-24T17:08Z. §Post-deploy health check: `curl https://api.vigilhub.io/v1/health` → `{"status":"ok",..."database":"connected"}` (HTTP 200). The live send in §Smoke send (using the exported RESEND_API_KEY) returned `{"status":"sent","id":"c787e114-..."}` — independent proof the key reached Resend's API successfully. No `re_` substring in VERIFICATION.md (secret hygiene upheld). |

**Score:** 18/18 truths verified

## Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `vigil-core/src/services/email-service.ts` | Typed wrappers + lazy null-init singleton (>= 150 lines) | ✓ VERIFIED | 245 lines. 7 top-level exports: `sendEmail`, `sendPasswordResetEmail`, `sendEmailVerificationEmail`, `createEmailService`, `EmailSendResult`, `EmailServiceDeps`, `resend` (singleton). Closure-bound arrows, no `this` usage. |
| `vigil-core/src/services/email-service.test.ts` | 10 node:test blocks covering full contract (>= 180 lines) | ✓ VERIFIED | 408 lines. All 10 blocks PASS (confirmed via live `npx tsx --test` run). Includes explicit guards against `click_tracking`/`open_tracking` keys on payload (SDK v6 regression guard). |
| `vigil-core/scripts/smoke-test-email.ts` | One-shot reusable smoke harness (>= 20 lines) | ✓ VERIFIED | 47 lines. Reads `VIGIL_APP_BASE_URL` from env (line 21), imports `sendPasswordResetEmail` from service module, prints result JSON + Resend message id, exits 0/1 appropriately. |
| `vigil-core/.env.example` | RESEND_API_KEY + VIGIL_APP_BASE_URL commented blocks | ✓ VERIFIED | Lines 70-84 contain both new blocks following Phase 107.1 comment-block convention. RESEND_API_KEY= blank; VIGIL_APP_BASE_URL=http://localhost:5173. |
| `vigil-core/src/index.ts` | No FATAL gate for RESEND_API_KEY | ✓ VERIFIED | `grep -c 'RESEND_API_KEY' vigil-core/src/index.ts` = 0. Zero references — graceful degradation confined to email-service module per D-10. |
| `.planning/phases/111-.../111-01-DNS-RECORDS.md` | dig outputs + Resend verification timestamp + deviation writeup | ✓ VERIFIED | Contains all 4 dig outputs (DKIM TXT, SPF TXT @send, MX @send, DMARC TXT), root SPF sanity check, Resend verified timestamp (2026-04-24T17:52:00Z), and the iCloud+ coexistence deviation section. |
| `.planning/phases/111-.../111-03-LIVE-VERIFICATION.md` | Live send evidence | ✓ VERIFIED | Four sections present: Railway env set, Post-deploy health check, Smoke send, Gmail auth headers, CTA href (raw source), Resend dashboard delivery. No `re_` secret leak. Resend message id `c787e114-193a-4bbb-9c7a-b98610cf7724` is non-secret metadata. |
| `vigil-core/package.json` | resend SDK pinned | ✓ VERIFIED (implied) | Plan 02 SUMMARY pins `resend@^6.12.2`. Tests running against the installed SDK confirm dependency resolution. |

## Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `email-service.ts` | `../analytics/posthog.ts` | `import { captureException as realCaptureException }` | ✓ WIRED | Line 20 of email-service.ts. Used at lines 104-105 (factory DI fallback) and 138, 150 (doSend failure paths). |
| `email-service.ts` | `process.env.RESEND_API_KEY` | `const apiKey = process.env["RESEND_API_KEY"]` + `apiKey ? new Resend(apiKey) : null` | ✓ WIRED | Line 49-50. Exact shape-mirror of posthog.ts lazy null-init. |
| `smoke-test-email.ts` | `email-service.ts` | `import { sendPasswordResetEmail } from "../src/services/email-service.js"` | ✓ WIRED | Line 10. Live-invoked at line 27 (`await sendPasswordResetEmail(to, testUrl)`). Confirmed end-to-end by 2026-04-24 live send returning `{"status":"sent","id":"c787e114-..."}`. |
| `smoke-test-email.ts` | `process.env.VIGIL_APP_BASE_URL` | `process.env["VIGIL_APP_BASE_URL"] \|\| "https://app.vigilhub.io"` | ✓ WIRED | Line 21. Fallback logic uses `\|\|` (not `??`) to handle empty-string env correctly — documented deviation from plan literal. |
| Railway env | vigil-core runtime `process.env.RESEND_API_KEY` | Railway Variables → container env at boot | ✓ WIRED | Live send on 2026-04-24T17:12Z succeeded with `"status":"sent"` — independent, non-simulated proof the key reaches runtime. |
| Cloudflare DNS | Resend domain verification | SPF TXT (send), DKIM TXT (resend._domainkey), MX (send), DMARC TXT (_dmarc) | ✓ WIRED | All 4 records resolve via public dig; Resend dashboard shows "Verified" for vigilhub.io at 2026-04-24T17:52:00Z. Gmail auth headers show DKIM+SPF+DMARC all PASS on the live delivery. |

## Data-Flow Trace (Level 4)

N/A for this phase — email-service is a service module, not a rendered UI. Its data flow is verified end-to-end by the live send: Railway env → Resend SDK singleton → Resend API → AWS SES → Gmail SMTP ingest → inbox placement + raw-source auth headers. All six hops verified empirically in 111-03-LIVE-VERIFICATION.md.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| email-service tests pass | `cd vigil-core && npx tsx --test src/services/email-service.test.ts` | `tests 10 / pass 10 / fail 0 / duration_ms 510.23` | ✓ PASS |
| DKIM TXT resolves | `dig TXT resend._domainkey.vigilhub.io +short` | Returns full `p=MIGf...` public key | ✓ PASS |
| SPF at send subdomain | `dig TXT send.vigilhub.io +short` | `"v=spf1 include:amazonses.com ~all"` | ✓ PASS |
| MX at send subdomain | `dig MX send.vigilhub.io +short` | `10 feedback-smtp.us-east-1.amazonses.com.` | ✓ PASS |
| DMARC at root | `dig TXT _dmarc.vigilhub.io +short` | `"v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com"` | ✓ PASS |
| Root SPF untouched (iCloud isolated) | `dig TXT vigilhub.io +short` | `"v=spf1 include:icloud.com ~all"` + apple-domain (no resend/amazonses) | ✓ PASS |
| No FATAL gate for RESEND_API_KEY | `grep -c 'RESEND_API_KEY' vigil-core/src/index.ts` | 0 | ✓ PASS |
| Closure-not-method footgun guard | `grep -c 'this.doSend' vigil-core/src/services/email-service.ts` | 0 | ✓ PASS |
| Railway post-deploy health | `curl -sS https://api.vigilhub.io/v1/health` (from 111-03-LIVE-VERIFICATION.md) | `{"status":"ok",..."database":"connected"}` (HTTP 200) | ✓ PASS |
| Live send returns sent | `npx tsx scripts/smoke-test-email.ts jamesonmorrill1@gmail.com` (with real key) | `{"status":"sent","id":"c787e114-193a-4bbb-9c7a-b98610cf7724"}` exit 0 | ✓ PASS |

All 10 spot-checks PASS. The live-send behaviors (Railway health, smoke send) were executed by the human operator on 2026-04-24 and evidenced in 111-03-LIVE-VERIFICATION.md — not re-executed by the verifier since they require a production API key that should NOT be in the verifier's context (secret hygiene).

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| EMAIL-01 | 111-01, 111-02, 111-03 | "Vigil can send authenticated, deliverable email from noreply@vigilhub.io via Resend — DKIM + SPF + DMARC records live on vigilhub.io DNS, domain verified in Resend dashboard, link tracking disabled per-send to avoid Apple Mail pre-fetch consuming single-use tokens, RESEND_API_KEY on Railway, email-service module in vigil-core/src/services/ mirrors the dep-injected pattern used by other services" | ✓ SATISFIED | Every clause verified: DKIM (Truth #9), SPF (Truth #10, #11 MX), DMARC (Truth #12), domain verified in Resend (Plan 01 Resend Verified 17:52Z), link tracking disabled (Truth #15 — domain-level, no subdomain configured; tests #4 enforce absence), RESEND_API_KEY on Railway (Truth #18), email-service dep-injected factory pattern (Plan 02 createEmailService + singleton, matches calendar-service.ts). REQUIREMENTS.md line 30 still shows `[ ]` unchecked — downstream follow-up to mark it complete, not a gap. |

No orphaned requirements. REQUIREMENTS.md line 93 (`| EMAIL-01 | Phase 111 | Pending |`) mapping matches plan coverage exactly.

## ROADMAP Success Criteria Verification

| SC# | Criterion (verbatim from ROADMAP) | Status | Evidence |
| --- | --------------------------------- | ------ | -------- |
| 1 | A manual test email sent via Resend SDK from vigil-core lands in jamesonmorrill1@gmail.com inbox (not spam) — confirmed in Gmail UI | ✓ PASS | Live send 2026-04-24T17:12Z, delivered to Inbox ~2s later (Gmail `Received:` 10:12:59 Pacific). Evidenced in 111-03-LIVE-VERIFICATION.md §Gmail auth headers. |
| 2 | dig TXT _dmarc.vigilhub.io + DKIM record + Resend dashboard Verified | ✓ PASS | All three dig checks return expected values (verified live by this report); Resend dashboard Verified at 2026-04-24T17:52Z (Plan 01 SUMMARY). |
| 3 | Raw email source confirms href is verbatim app.vigilhub.io URL — not click-tracking domain | ✓ PASS | Gmail raw-source decoded href (LIVE-VERIFICATION.md line 78): `<a href="https://app.vigilhub.io/auth/reset?token=smoke-test-1777050777894" ...>`. No `link.resend.com`/`track.`/`r/` interpolation. Achieved via domain-level tracking-off (no tracking subdomain configured in Resend), since SDK v6 removed per-send flags. |
| 4 | vigil-core starts successfully with RESEND_API_KEY unset — lazy null-init | ✓ PASS | `grep -c 'RESEND_API_KEY' vigil-core/src/index.ts` = 0. Plan 02 Task 3 boot log: `Vigil Core API running on 0.0.0.0:3001` + 0 FATAL lines. Cold-call smoke returns `{"status":"skipped_no_key"}`. Note: SC#4 mentions "email endpoints return 503 if unconfigured" — no email endpoints exist in this phase (they ship in Phase 112); the runtime-level degradation (skipped_no_key) is in place and ready for Phase 112 routes to surface as 503 or enumeration-safe 200 per D-10. |
| 5 | RESEND_API_KEY set in Railway Variables and present in vigil-core/.env.example (commented out) | ✓ PASS | .env.example lines 70-76 contain the commented block + `RESEND_API_KEY=` blank. Railway Variables: 111-03-LIVE-VERIFICATION.md §Railway env set documents both variable names added at 2026-04-24T17:08Z; post-deploy curl returns 200 and the subsequent live send succeeded (independent runtime proof the key is plumbed). |

All 5 ROADMAP Success Criteria PASS.

## Anti-Patterns Scanned

| File | Anti-Pattern | Finding | Severity |
| ---- | ------------ | ------- | -------- |
| email-service.ts | TODO/FIXME/placeholder comments | None | — |
| email-service.ts | Empty returns / hardcoded empty arrays | None — both `html` and `text` templates are substantive; success path returns `result.data?.id ?? ""` only when SDK returns no id (defensive narrowing, not a stub) | — |
| email-service.ts | `this.doSend` footgun | 0 occurrences — closure-bound arrows used throughout | — |
| email-service.ts | Raw email in observability context | 0 occurrences — `to_hash` is used exclusively; enforced by test #9 | — |
| email-service.test.ts | console.log-only "implementations" | None — spies are assertion-targeted | — |
| smoke-test-email.ts | Hardcoded origin | 0 effective — `origin` is read from env; the string `https://app.vigilhub.io` appears 3 times (doc comment, fallback literal, log message) but never as the template substitution. Per known_deviations_honored #6. | Info |
| .env.example | Secret leak (real `re_` prefix key) | 0 occurrences | — |
| 111-03-LIVE-VERIFICATION.md | Secret leak (real `re_` prefix key) | 0 occurrences; only the non-secret Resend message id `c787e114-...` is recorded | — |

No blockers, no warnings. One informational note (smoke-test-email.ts has 3 legitimate `https://app.vigilhub.io` occurrences) — explicitly called out in the plan's SUMMARY as a plan-spec bug with documented rationale, not a real issue.

## Human Verification Required

None. The live send already happened on 2026-04-24T17:12Z and its evidence is recorded in 111-03-LIVE-VERIFICATION.md. All verification concerns that might normally require human testing (visual inbox placement, raw-source header inspection, Resend dashboard status) were performed by the human operator during Plan 03 execution and documented with copy-pasted evidence.

## Gaps Summary

No gaps. All 18 observable truths verified, all 8 artifacts present and substantive, all 6 key links wired, all 5 ROADMAP success criteria PASS, and EMAIL-01 requirement is satisfied end-to-end with live runtime evidence. The phase delivers exactly what its goal promised: authenticated, deliverable email from `noreply@vigilhub.io` via Resend with DNS fully verified and link tracking effectively disabled (achieved at the domain level due to Resend SDK v6 API changes — documented and compensated).

### Deviations Accepted (not gaps)

All 6 known deviations from the original plan were explicitly honored per the verification request:

1. **SDK v6 dropped per-send click_tracking/open_tracking** — tests rewritten to assert ABSENCE of those keys; mitigation T-111-09 relocated to domain level.
2. **No tracking subdomain configured in Resend** — runtime tracking is off by default (empirically verified by verbatim href in Gmail raw source). This replaces the original "toggle domain settings off" step.
3. **D-03 SPF value NOT applied at root** — Resend's current setup uses `send.` subdomain pattern; root stays iCloud-only, zero collision with Apple iCloud+ custom email.
4. **D-01 DKIM CNAME rewritten as DKIM TXT** — Resend's current pattern uses inline-key TXT at `resend._domainkey`. Gray-cloud concern (T-111-03) no longer applies since TXT records aren't Cloudflare-proxyable.
5. **Plan 03 smoke script uses `||` not `??`** — handles empty-string env correctly; the plan's own acceptance-criteria command emits `VIGIL_APP_BASE_URL=` which `??` doesn't treat as fallback-trigger.
6. **`grep -cE 'https://app.vigilhub.io' returns exactly 1`** is a plan-spec bug — script's 3 occurrences (comment, fallback, log) all serve distinct purposes; intent (no hardcoded URL in the reset-URL template) is satisfied by `${origin}` interpolation.

---

*Verified: 2026-04-24T18:05:00Z*
*Verifier: Claude (gsd-verifier)*
