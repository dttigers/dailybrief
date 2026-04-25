---
phase: 112
phase_name: forgot-password-email-flow
session_date: 2026-04-24
mode: express_path
duration: ~5 minutes
locked_by: user (single-message lock-all-recommendations)
---

# Phase 112 — Discussion Log

## Session shape

User invoked `/gsd-discuss-phase 112` immediately after completing Phase 111 (~10 min between sessions). The phase has heavy upstream context — Phase 110 (AUTH-09 password_changed_at gate) and Phase 111 (EMAIL-01 Resend transport) just shipped. ROADMAP success criteria + REQUIREMENTS.md AUTH-10 already pinned 5 of the 9 typical "decisions" needed for a password reset flow:

- Endpoints (POST /v1/auth/forgot-password + POST /v1/auth/reset-password)
- Always-200 enumeration safety
- 1-hour TTL, single-use, SHA-256 token hashing
- No auto-login, redirect to /auth on reset success
- password_changed_at bump as the JWT-invalidation mechanism

This left a tighter set of gray areas than usual.

## Pre-flight: phase-directory scaffold gap

`gsd-tools find-phase 112` returned `found: false` because the directory didn't exist on disk yet. Roadmap had Phase 112 listed but the workflow's init relies on directory presence. Created `.planning/phases/112-forgot-password-email-flow/` manually before continuing — this is a known seam for new phases (the workflow's later steps `mkdir -p` if needed, but the early `phase_found` check exits before reaching them).

## Gray areas presented

5 actually-decision-shaped questions:

| ID | Decision | Recommendation given | User lock |
|---|---|---|---|
| G-01 | Rate limit on `/forgot-password` (per-email? per-IP? both? window?) | Both per-email AND per-IP, 5/hour | Locked (A) |
| G-02 | Timing-attack mitigation for enumeration safety | Dummy argon2 hash on miss | Locked (A) |
| G-03 | Token reuse on second forgot-password request | Invalidate prior unused tokens, issue new ("most recent wins") | Locked (A) |
| G-04 | password_reset_tokens schema + the `type` column for Phase 113 reuse | Full DDL given inline | Locked (A) |
| G-05 | PWA error UX on invalid/expired/used token | Single generic bucket: "This link is no longer valid" | Locked (A) |

Three paths offered:
- **A — Lock all 5 with my recommendations** (fastest)
- **B — Deep-dive a subset, default the rest**
- **C — Walk through all 5 one by one**

User picked **A** in a single character — express path lock-all.

## Reasoning preserved per decision

### G-01: 5/hour per-email AND per-IP

- Per-IP catches: attacker spamming arbitrary emails to burn Resend free-tier quota.
- Per-email catches: attacker spamming a known-good email to weaponize the user's mailbox / phishing pretext.
- 5/hour: gentle for legit fat-fingers (one accidental misclick doesn't lock real user); tight enough to make abuse uneconomical.
- Phase 113 (AUTH-11) spec calls for 3/hour on resend-verification. 5 vs 3 is a slight tightening for AUTH-10's higher-stakes flow (password reset > email verify in attacker-value terms) — keeps both axes within the same order of magnitude.

### G-02: Dummy argon2 hash on miss

- SC#1 says "approximate response time" — not constant-time, just "doesn't trivially leak".
- argon2 verify is ~100-200ms; running a verify against a synthesized hash on miss matches that wall-clock cost.
- Cost: every miss now spends ~150ms CPU. At single-user scale this is fine. Trip wire: revisit if endpoint sees > a few hundred req/day.
- Not constant-time — left explicit in CONTEXT so future-us doesn't claim more than we shipped.

### G-03: "Most recent link wins"

- Single active token per (user, type) pair = simpler mental model for the user (only one valid link in their inbox).
- Single active token = simpler invariant for tests (no "which of N tokens won the race?" ambiguity).
- Implementation: bulk UPDATE-set-used_at-on-prior-unused before inserting new. One extra SQL roundtrip; negligible.

### G-04: Schema with `type` CHECK column up front

- `type` constraint allows `('password_reset', 'email_verify')` — Phase 113 reuses this table without re-doing the migration.
- token_hash UNIQUE index is the lookup key; SERIAL PK is just the row identifier.
- ON DELETE CASCADE on user_id FK = no orphan rows when users get deleted.
- Atomic `UPDATE ... RETURNING user_id WHERE token_hash = $1 AND type = $2 AND used_at IS NULL AND expires_at > now()` is the single SQL statement that satisfies SC#3 (single-use, expiry-aware, type-scoped).

### G-05: Single generic error bucket

- Avoids the info-leak: "expired" vs "used" vs "never existed" all reveal something different about an attacker's probing.
- Simpler frontend state machine: one error UI, one CTA ("request a new link").
- Encourages user to start fresh rather than diagnose ("what does 'used' mean? did someone else click my link??").

## Items NOT discussed (scope-creep guard)

- 2FA / TOTP overlay on reset flow — out of scope for AUTH-10
- Admin-side force-reset (admin clicks "reset for user X") — out of scope, not in v3.6
- Confirmation email after successful reset — Phase 110 deferred the equivalent for change-password; same call here. Captured under Deferred Ideas.

## Output

CONTEXT.md captures 21 decisions (D-01..D-21) across schema, two endpoints, three PWA pages, and email content reuse. All five gray areas locked. Ready for `/gsd-plan-phase 112`.
