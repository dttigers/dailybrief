---
id: SEED-009
status: dormant
planted: 2026-05-05
planted_during: v3.7 milestone (post Phase 119-01, awaiting DMARC auto-eval gate 2026-05-06)
trigger_when: v3.8+ milestone planning that includes G2 plugin work OR launch-state-restoration UX work OR a real user reports "I always have to navigate back to where I was"
scope: Small
---

# SEED-009: G2 plugin should restore last-viewed screen / scroll position on re-launch

## Why This Matters

The Even Hub SDK exposes `bridge.setLocalStorage(key, value)` and
`bridge.getLocalStorage(key)` with **App-side persistence** — survives
plugin re-launches, iPhone-app backgrounding, and even iPhone-app
force-quit (storage lives in the Even App, not the WebView).

Vigil currently doesn't use this. Every plugin launch lands on the home
carousel screen, regardless of where the user was when they last opened
Vigil. Combined with the platform constraint that the iPhone app's
WebView is destroyed on app close (see this conversation's discussion of
plugin lifecycle), users who context-switch through their day will
re-open Vigil 3-10 times daily and have to re-navigate every time.

Concrete restoration candidates:

- **Last carousel screen** (home / work-orders / affirmation / task-detail) —
  re-open lands on the same screen
- **Last work-orders scroll position** — re-open the work-orders list
  scrolled to the same task they were reading
- **Last task-detail focus** — if user was reading task ID 42, re-open
  jumps directly to that task

Tension: this can also be **wrong**. If the user was reading work-order
"Replace MOP-7 in Aisle 3" yesterday morning, and they re-launch Vigil
this afternoon, do they want to land on that stale task or on today's
fresh brief? Probably the latter. So restoration needs a **TTL** or a
**date-window** check (e.g., restore-last-position only if last-launch
was within 30 minutes; otherwise default to home).

## When to Surface

**Trigger:** v3.8+ milestone planning that includes G2 plugin work, OR
launch-state-restoration UX work, OR a real user reports "I always have
to navigate back to where I was."

This seed should be presented during `/gsd-new-milestone` when the
milestone scope matches any of these conditions:
- Theme includes "G2 hardware polish" or similar
- Launch-flow UX is being touched (echoes SEED-006 territory)
- A user complains about lost context between launches

Pairs naturally with **SEED-006** (glasses-menu launch source) — both
shape what happens at the moment of plugin launch. Worth scoping
together.

## Scope Estimate

**Small** — A few hours. Three concrete tasks:

- Wire `bridge.setLocalStorage` calls into navigation state changes
  (`navigation.ts` carousel-advance + scroll-position events)
- Wire `bridge.getLocalStorage` read at launch into initial render in
  `main.ts`
- Define + implement TTL gate (suggested: 30 min) so stale restoration
  defaults back to home

## Anti-scope

This is **NOT** about syncing state across multiple G2 devices, multiple
plugin instances, or to/from vigil-core. Local-only. If state-sync ever
matters, that's a different seed.

## Breadcrumbs

Related code and decisions in the current codebase:

- `vigil-g2-plugin/src/navigation.ts` — carousel state machine
- `vigil-g2-plugin/src/main.ts` — initial render after bridge resolves
- `node_modules/@evenrealities/even_hub_sdk/README.md` — `setLocalStorage` / `getLocalStorage` API docs

## Notes

No UAT evidence yet — purely speculative based on platform-lifecycle
constraints discussed in this session. Worth gut-checking against actual
daily-use friction once the user has been wearing G2 with v0.2.0 for a
few days. May turn out to be a non-problem, in which case this seed dies
gracefully.
