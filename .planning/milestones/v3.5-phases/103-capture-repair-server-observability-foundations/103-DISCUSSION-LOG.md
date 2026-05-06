# Phase 103: Capture Repair & Server Observability Foundations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 103-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 103-capture-repair-server-observability-foundations
**Areas discussed:** CAP-01 HEIC fix location, CAP-02 triage contract, PostHog safety posture, /v1/me response shape

---

## CAP-01 HEIC fix location

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side via sharp | Add HEIC to VALID_MEDIA_TYPES; convert to JPEG with sharp before Claude. One fix covers Mac folder watcher + future clients. Adds ~3MB dep + ~50ms. | ✓ |
| Mac-side CoreGraphics restore | Re-verify/restore HEIC→JPEG in APIImageDescriptionService.swift before upload. Keeps server thin; requires Mac re-deploy; non-Mac clients still break. | |
| Both — server canonical, Mac best-effort | Server accepts HEIC + converts; Mac also converts when available. Belt + suspenders. | |

**User's choice:** Server-side via sharp.
**Notes:** Matches research SUMMARY.md recommendation; single fix covers every client including the browser extension future.

| Option | Description | Selected |
|--------|-------------|----------|
| Log + skip (current behavior) | iCloud guards already handle this — keep the existing skip-with-log. | ✓ |
| Log + menu-bar error badge | Surface the skip in the DailyBriefMonitor menu bar error state. | |
| Retry N times then give up | For flaky iCloud path status, retry 3x with backoff before skipping. | |

**User's choice:** Log + skip (current behavior).
**Notes:** Existing guards are correctly implemented per research; no UX change warranted.

| Option | Description | Selected |
|--------|-------------|----------|
| Reject with 413 (current behavior) | Keep the existing 5MB guard. HEIC typically shrinks after conversion; 413 is the right signal. | ✓ |
| Downscale to fit before Claude | Convert + downscale via sharp if over cap. Hides a silent quality hit. | |

**User's choice:** Reject with 413.
**Notes:** No silent quality compromise; planner can revisit if it fires in real use.

---

## CAP-02 triage contract

| Option | Description | Selected |
|--------|-------------|----------|
| Sync — block until triage completes | Response body contains thought with category already populated. Matches success criterion verbatim. +2-4s latency. | ✓ |
| Async fire-and-forget (match /process-audio) | Return 201 immediately with null category; triage runs in background. Client polls. | |
| Sync with async fallback | Try triage with short timeout. Succeeds → with category. Times out → null category + fire-and-forget. | |

**User's choice:** Sync — block until triage completes.
**Notes:** Success criterion #2 ("returns a thought with a non-null category field") literally requires sync. 30s request timeout has budget.

| Option | Description | Selected |
|--------|-------------|----------|
| Return 201 with null category (graceful) | Thought is already in DB — don't lose it. User can manually re-triage. | ✓ |
| Return 502 but keep the row | Signal failure loudly. Row stays in DB; client must handle 502. | |
| Roll back the insert on triage failure | Delete the thought row if triage fails. Clean response; risks data loss. | |

**User's choice:** Return 201 with null category.
**Notes:** Consistent with v3.5 "capture never silently fails" theme.

| Option | Description | Selected |
|--------|-------------|----------|
| Triage each thought independently | N triage calls in parallel via Promise.all. Latency = slowest, not sum. | ✓ |
| Triage once, apply category to all | Single triage call on concatenated text. Cheaper but wrong. | |
| Skip triage for multi-thought, sync for single | Only block when N=1. Inconsistent contract. | |

**User's choice:** Triage each thought independently.
**Notes:** Matches existing thoughts.ts auto-triage shape per thought.

| Option | Description | Selected |
|--------|-------------|----------|
| Leave /thoughts POST as-is (fire-and-forget) | Text capture stays low-latency; only /process-photo changes. | ✓ |
| Change /thoughts POST to sync too | Consistency; but breaks quick-capture UX and is scope creep. | |

**User's choice:** Leave /thoughts POST as-is.
**Notes:** Scope-tight to CAP-02.

---

## PostHog safety posture

| Option | Description | Selected |
|--------|-------------|----------|
| Key-absence gate (no-op shim when POSTHOG_API_KEY unset) | Dev .env has no key → shim returns silently. Simplest, hardest to bypass. | ✓ |
| NODE_ENV === 'production' gate | Init only when NODE_ENV exactly 'production'. | |
| Both (belt + suspenders) | Require both key AND NODE_ENV==='production'. | |

**User's choice:** Key-absence gate.
**Notes:** Matches research recommendation. NODE_ENV coupling unneeded.

| Option | Description | Selected |
|--------|-------------|----------|
| Production-only key for v3.5 | Single PostHog project, one Railway-env API key, no dev/staging keys. | ✓ |
| Production + dedicated dev project | Separate PostHog project for dev sessions. | |

**User's choice:** Production-only key.
**Notes:** No need for dev project at solo-dev scale.

| Option | Description | Selected |
|--------|-------------|----------|
| before_send hook strips bodies + sensitive headers | posthog-node before_send filter scrubs request.body on sensitive routes. Keeps route + status + stack. | ✓ |
| Route-level exclude | app.onError skips posthog.captureException for sensitive routes. Loses error visibility. | |
| Trust PostHog SOC2 — no redaction | Ship default. Contradicts PROJECT.md privacy posture. | |

**User's choice:** before_send hook.
**Notes:** Ships protection as part of the singleton — impossible to forget.

| Option | Description | Selected |
|--------|-------------|----------|
| app.onError in index.ts + captureException + 500 JSON | Single chokepoint for all unhandled route throws. | ✓ |
| app.onError + also wrap process.on('uncaughtException') | Both handlers. Potentially redundant with posthog-node enableExceptionAutocapture. | |

**User's choice:** app.onError in index.ts only.
**Notes:** posthog-node enableExceptionAutocapture already covers process-level events.

---

## /v1/me response shape

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: { userId, email } | Exactly the success criterion. Extending later is non-breaking. | ✓ |
| Extended: { userId, email, createdAt, role } | More info for future settings UI. YAGNI for v3.5. | |
| Full user row minus passwordHash | Maximum info; widens contract. | |

**User's choice:** Minimal.
**Notes:** Phase 104 only needs userId + email for posthog.identify() + header.

| Option | Description | Selected |
|--------|-------------|----------|
| Both JWT and vk_ keys | Use existing bearerAuth three-path. JWT → user lookup. vk_ → seed user. | ✓ |
| JWT only | Reject vk_-authenticated callers. | |

**User's choice:** Both JWT and vk_ keys.
**Notes:** Reuses Phase 102 seed-user backcompat — no new auth code.

| Option | Description | Selected |
|--------|-------------|----------|
| 401 with 'invalid_user' | Treat like expired auth; client re-authenticates. | ✓ |
| 404 with 'user_not_found' | Technically correct. | |
| 500 — this shouldn't happen | Surface as server error. | |

**User's choice:** 401 with 'invalid_user'.
**Notes:** Most actionable for PWA; triggers re-auth flow cleanly.

---

## Claude's Discretion

- Exact sharp conversion params (quality, output format details)
- posthog-node flushAt/flushInterval/captureMode tuning
- /v1/me route file location (routes/me.ts vs fold into routes/auth.ts)
- before_send hook implementation details
- Test coverage strategy for shim vs real-client paths

## Deferred Ideas

- Extended /v1/me fields (createdAt, role, display name)
- Dev-dedicated PostHog project
- Pre-downscale HEIC above 5 MB
- Menu-bar error badge for skipped non-iCloud HEIC
- /process-audio sync triage parity
- /thoughts sync triage parity (explicitly rejected in D-08)
- Mac-side CoreGraphics HEIC restoration (explicitly rejected in D-02)
