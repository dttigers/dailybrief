---
seed_id: SEED-012
title: Convert Vigil G2 plugin to Even Hub Dashboard Widget when widget API ships
status: dormant
discovered: 2026-05-10
discovered_in: Phase 125 (post-submission session)
related_phases: [124, 125]
related_memories: [project_vigil_pivot, project_cross_platform_vision]
trigger_when: Even Hub developer portal documentation adds "Dashboard widgets" or "Dashboard layouts" API surfaces, OR Even Realities publicly announces widget developer access, OR operator receives early-access invite
scope: Medium
---

# SEED-012 — Convert Vigil to Even Hub Dashboard Widget when API ships

## Why this matters

The current Vigil G2 plugin (shipped v0.3.6 to Even Hub store 2026-05-10)
is a **plugin** — it runs only when the user selects it via the iPhone
Even App tile or the glasses-side menu. When the user closes the plugin
or switches to another, Vigil stops surfacing. The HUD experience is
NOT ambient by default — it's opt-in per session.

Operator's ambient-AI vision (per memory `project_vigil_pivot` and
`project_cross_platform_vision`) requires Vigil to be **always
visible** on the glasses when the user looks up — like a status bar
widget, not a foreground app. That's exactly what Even Hub calls a
**Dashboard widget**.

Per https://hub.evenrealities.com/docs/getting-started/overview as of
2026-05-10:

> The platform is actively expanding to include Dashboard widgets and
> Dashboard layouts.

These are explicitly on Even's published roadmap but **NOT yet available
to third-party developers**. No public timeline.

### The load-bearing reason: heads-up display lifecycle

The Even Realities default dashboard implements a **heads-up display
lifecycle** that plugins fundamentally cannot replicate:

- Detect when the user **looks up** (head tilts toward the HUD)
- **Light the display** with content for ~3 seconds
- **Dim out / power down** the display after no activity
- **Re-wake on new event** or next look-up

This is a firmware/OS-level behavior baked into the G2 + Even App. The
plugin SDK (`@evenrealities/even_hub_sdk@0.0.9`) confirms — verified
live in this session — that **no plugin-level primitive exposes any
of these capabilities**. The full plugin surface is:

- `createStartUpPageContainer` / `rebuildPageContainer` — render content
  (display stays lit while content is rendered; no dim hook)
- `shutDownPageContainer(exitMode)` — close the plugin entirely
  (`exitMode=0` immediate, `exitMode=1` confirm prompt). User must
  manually relaunch via glasses menu — defeats ambient.
- `imuControl(isOpen, reportFrq)` — turn IMU events on/off; can detect
  head motion but doesn't gate the display backlight.
- **No `dim` / `sleep` / `wake` / `autoHide` / `displayDuration` /
  `ttl` exposed anywhere in `dist/index.d.ts`.**

This means plugins keep the G2 display **lit 100% of the time** while
active (verified live 2026-05-10 — operator reported "vigil is live
even in background, but display on 100% of the time"). There is no way
within the plugin contract to achieve the heads-up "show briefly, dim,
wake on event" experience users expect from native G2 dashboard
content. The plugin-layer workarounds (`shutDownPageContainer` after
N seconds idle / render-blank-container / IMU-driven render gating)
are all flawed: each either prevents re-wake on new events, drains the
display backlight identically, or adds non-trivial battery cost.

Therefore: **heads-up display participation is not an enhancement but
a fundamental capability gap.** The widget conversion isn't just "make
Vigil always-visible" — it's "make Vigil play nicely with the G2's
power and display lifecycle." Without widget access, Vigil cannot ship
the polished version of its core value prop (ambient, glanceable AI
that respects user attention + battery).

## When to surface

Re-evaluate this SEED if **any** of the following becomes true:

1. Even Hub developer portal documentation adds a "Dashboard widgets"
   or "Dashboard layouts" section with developer-facing API.
2. Even Realities publicly announces widget developer access (via
   newsletter, dev portal banner, 9to5google / Digital Trends coverage,
   social media).
3. Operator receives early-access invitation (perhaps from the email
   drafted alongside this SEED — see operator outreach note below).
4. Plugin SDK package `@evenrealities/even_hub_sdk` ships a new minor
   version exposing widget primitives in its type defs.

Periodic doc-check routine recommended (every 1-2 weeks) — see
operator note below.

## Scope estimate

**Medium** — A phase or two. The conversion would NOT rewrite the
backend:

- vigil-watch (daemon) — unchanged
- vigil-core agent_events API + suppression queue + Quiet mode — unchanged
- Server-side SSE delivery — likely unchanged or trivially adapted

What WOULD change:

- Plugin shape: from `@evenrealities/even_hub_sdk` plugin → widget API
  primitives (whatever Even ships)
- HUD render path: from `CreateStartUpPageContainer` /
  `RebuildPageContainer` (full-screen text containers) → widget render
  primitives (likely smaller "card" containers that compose with other
  widgets on a shared dashboard layout)
- Navigation: the carousel (Home / Companion / Work Orders /
  Affirmation) collapses into ONE widget that's always-visible — or
  splits into N widgets that each occupy a fixed slot on the dashboard.
  Decision depends on what the widget API supports.
- Tap interaction: double-tap on Companion banner-ack — may need to
  redesign for widget context (taps may target the whole dashboard or a
  specific widget, depending on Even's UX choice)
- Build/pack: probably a different evenhub CLI subcommand
  (`evenhub pack-widget` vs `evenhub pack`)
- App.json / manifest: declare widget capability instead of plugin

The agent_events trust contract, SSE delivery, Quiet mode toggle, and
all the Phase 121–125 work carry over unchanged. The plugin shape
becomes the legacy fallback for users on older Even App versions.

## Breadcrumbs

- `vigil-g2-plugin/` — current plugin codebase to fork
- `vigil-g2-plugin/app.json` — declares `package_id` /
  `min_sdk_version`; widget version likely needs new manifest fields
- `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts`
  — type defs to watch for new widget exports (currently
  `OsEventTypeList`, `TextContainerProperty`, `ListContainerProperty`,
  `CreateStartUpPageContainer`, `RebuildPageContainer` — widget primitives
  TBD)
- `vigil-g2-plugin/src/screens/companion.ts` — Companion HUD render
  logic; primary candidate for widget conversion (most ambient-relevant
  screen)
- `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` — the original ambient
  framing that motivates the widget conversion

## Operator outreach (one-time)

Draft email to Even Realities (`software@evenrealities.com`) drafted
2026-05-10 alongside this SEED. Saved at:
`.planning/seeds/SEED-012-outreach-email.md`

Email asks about widget API timeline + early-access interest. Operator
sends manually when ready.

## Periodic check routine

Scheduled remote agent (routine) created 2026-05-10 — fires every 2
weeks against:
- https://hub.evenrealities.com/docs/getting-started/overview
- Even Hub changelog / announcements page (if findable)
- `@evenrealities/even_hub_sdk` npm package version diff

Routine pings operator + auto-files a follow-up SEED note when widget
mentions appear in any of those sources.

## References

- Even Hub Documentation Overview (as of 2026-05-10):
  https://hub.evenrealities.com/docs/getting-started/overview
  ("actively expanding to include Dashboard widgets and Dashboard layouts")
- 9to5Google 2026-03-26 — Even Hub launch coverage:
  https://9to5google.com/2026/03/26/even-realities-even-hub-apps-and-better-conversate-mode/
- Phase 125 closing context (2026-05-10) — operator session that
  identified the plugin-vs-widget distinction during post-submission
  Q&A about "is there a way to replace the dashboard with Vigil"
- Memory `project_cross_platform_vision` — thin-client + fat-API
  philosophy that supports easy plugin-to-widget conversion
