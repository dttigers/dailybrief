---
phase: 125
plan: 10
status: complete
type: wallclock
autonomous: false
operator: jamesonmorrill
submitted_at: 2026-05-10T21:43:00Z
build_version: 0.3.6
build_size_bytes: 31107
build_sha256: 2d3671b0139fccff91e9df228d8c23cffe520a85a701b3a8ec8239b3f5bfbda6
review_status: in-review
---

# Plan 125-10 — Even Hub developer portal store submission

> Wallclock checkpoint per memory `feedback_wallclock_checkpoint_exempt`.
> Operator manual upload via Even Hub developer portal web dashboard.

## Outcome

`vigil.ehpk` v0.3.6 submitted to Even Hub developer portal store
dashboard at **2026-05-10 3:43 PM local (21:43 UTC)**. Dashboard
acknowledged submission and moved the build into "In review / Awaiting
review" state. Build tagged "Beta" with a 1-person beta group (operator).

## Submission contents

- **Plugin artifact:** `vigil-g2-plugin/vigil.ehpk`
- **Version:** 0.3.6
- **Size:** 31107 bytes (31.1 KB per dashboard)
- **SHA256:** `2d3671b0139fccff91e9df228d8c23cffe520a85a701b3a8ec8239b3f5bfbda6`
- **min_sdk_version:** 0.0.8 (per Plan 08 + Phase 124 D-07 onLaunchSource)

## Changelog text (uploaded)

> v0.3.6 — Claude Code Companion + reviewer fix
>
> • New Companion HUD screen: 3-line ambient view of Claude Code session
>   state (label / state / last event); double-tap acks needs_input + task_failed
> • Quiet mode: PWA toggle filters non-urgent events from glasses; queued
>   events replay on toggle-off
> • Polish: shortened container names (SDK strict <16 char limit on hardware);
>   CORS allows Even App loopback Origin for SSE streams
> • Brand splash on iPhone WebView (addresses prior review feedback re
>   blank-screen rejection)

## Preview screenshot strategy

Existing v0.2.0 Preview slots retained (Home / Affirmation / Work Orders)
— reviewer had accepted those at v0.2.0. The v0.2.0 rejection was about
the iPhone WebView (blank), not the Preview slots. Companion screenshot
fixture (`DEMO_AGENT_SESSIONS`) was added to api.ts for future capture
but not used for this submission.

iPhone splash screenshot attached to review notes so reviewer can verify
the blank-screen fix without sideloading.

## Evidence

- `artifacts/iphone-splash-2026-05-10.png` — live iPhone WebView showing
  the v0.3.6 brand splash with "Connected" status dot
- `artifacts/even-hub-submission-2026-05-10.png` — dashboard
  acknowledgment screenshot (Build details view: v0.3.6, Submitted →
  In review, 8 minutes ago at time of capture)

## Pre-submission defects fixed this session (all already committed)

| # | Defect | Commit |
|---|--------|--------|
| 1 | Companion missing from carousel on G2 — container-name length | `1118d0b` |
| 2 | Dynamic import of companion.ts in navigation.ts (defense-in-depth) | `e448e3d` |
| 3 | SSE blocked by CORS preflight — Even App loopback Origin | `f7cb74a` |
| 4 | Blank iPhone WebView (prior review rejection point) | `d0c7ea6` |
| 5 | Debug instrumentation stripped before production ship | `9febb9a` |
| 6 | Companion fixture added to SCREENSHOT_MODE (for future use) | `7b34206` |

## Review outcome

**Pending** — Even Hub review queue. Per memory `project_g2_ux_issues`
+ Phase 106 history, prior v0.2.0 rejection feedback arrived 5 days
post-submission. Operator monitors dashboard for response.

## Plan 11 status

**DEFERRED.** Operator opted to put 60-second portfolio demo recording
on pause at end of 2026-05-10 session. Plan 11 skeleton manifest
(`artifacts/demo-clip-manifest.md`) remains ready for backfill when
recording happens. Phase 125 closes with `approved-with-deferrals`
status — same pattern as Phase 124.
