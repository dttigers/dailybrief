---
id: SEED-001
status: dormant
planted: 2026-04-07
planted_during: post-v2.2, during v2.3 scoping conversation
trigger_when: before any wide-release / non-personal distribution of Vigil, OR when a new store is added to Lin's Fresh Market that requires a code deploy to register (friction signal)
scope: medium
---

# SEED-001: Stores Admin UI — replace hardcoded Lin's Fresh Market store list

## Why This Matters

v2.3 "Lin's Ops" will treat the 6 active Lin's Fresh Market locations (+ Enoch under construction) as first-class entities — work orders belong to a store, recurring rules fan out across stores, store grouping in the dashboard UI. For personal-use simplicity, the store list will be **hardcoded** as an enum in the Swift models and vigil-core schema.

That's a deliberate tradeoff. It's fine now because:
- Vigil is a personal ops tool for one grocery-store ops engineer
- The Lin's Fresh Market location set is stable and small (7 locations)
- Code deploys are cheap (one user, one machine, push-to-Railway workflow)

It becomes painful the moment any of these change:
- **Another person wants to use Vigil** — maybe another ops engineer at Lin's, or the concept expands to other chains. Hardcoded stores means the app only works for one specific business.
- **Stores change meaningfully** — new locations open (Enoch goes live, another store joins), or locations close, or addresses change. Right now each of these requires a code edit + Swift rebuild + Mac binary reinstall + vigil-core deploy. Small individually, friction that compounds.
- **Vigil gets distributed or open-sourced** — hardcoded business names in a repo signal "this isn't for you" and limits who can try it.

## When to Surface

**Trigger:** Before any wide-release / non-personal distribution of Vigil, OR when a new Lin's Fresh Market store is added that requires a code deploy to register (the friction signal that tells you the hardcoded approach has started to cost you).

This seed should be presented during `/gsd-new-milestone` when the milestone scope matches any of:
- "multi-user" / "multi-tenant" anywhere in requirements
- "distribution" / "release" / "open source" / "beta"
- "settings" / "admin" / "configuration" milestones
- "onboarding" flows for new users
- Any mention of adding/removing Lin's store locations

## Scope Estimate

**Medium** — likely a phase or two:

- **Data model:** Promote stores from enum to first-class table in vigil-core (id, name, display_name, address, lat/long, active flag, created_at). Migration from hardcoded enum values. API endpoints for CRUD (list/create/update/deactivate).
- **Mac app Settings UI:** New tab or sub-section under Settings for "Stores" — list view with active/inactive toggle, add-store sheet with name + address, edit in place, soft-delete (set inactive, don't hard-delete because work orders may reference them).
- **Migration plan:** Existing work orders with store references stored as enum strings need to be re-linked to the new store UUIDs. Likely handled in a single migration script that seeds the current 7 stores and rewrites existing references.
- **G2 plugin:** If the G2 plugin surfaces store-aware data by v2.3, it may need to fetch stores from the API too (currently it wouldn't — G2 is read-only on briefs).

Not as heavy as a full milestone, but not trivial because the data model change touches the schema, API, Mac client, and potentially the plugin.

## Breadcrumbs

No code to reference yet — v2.3 hasn't been implemented. Once v2.3 ships, the breadcrumbs to track will be:

- `Sources/JarvisCore/Models/Store.swift` (or wherever the enum lands) — the hardcoded enum that needs replacing
- `vigil-core/src/db/schema.ts` — the schema location where `stores` table would be added
- `vigil-core/src/routes/stores.ts` — (new) CRUD endpoints
- `Sources/DailyBriefMonitor/Settings/` — where a Stores settings tab would be added
- Any work order schema field that references a store — the FK target to update
- Phase 51 (v2.3 "Stores as first-class entity") archive in `.planning/milestones/v2.3-ROADMAP.md` (will exist after v2.3 ships)

Check the v2.3 milestone archive for the exact data model shape that v2.3 ships with — the admin UI needs to be compatible with that shape (or migrate off it).

## Notes

Captured during the v2.3 scoping conversation 2026-04-07 after a long debugging session that uncovered several daily-driver bugs (PDF truncation, vigil-core JSON fence parser, Settings UI bearer wipe). The user explicitly chose "hardcore for now, but add as a future plan for wide release" when I asked whether to include a proper stores admin UI in v2.3 scope. This seed is the "future plan" artifact that choice produced.

The v2.3 milestone shape we agreed on (6 phases, Phases 51-56, "Lin's Ops"):
1. Phase 51: Stores as first-class entity (hardcoded enum version)
2. Phase 52: Dashboard CRUD + close-out
3. Phase 53: Store grouping & filtering UI
4. Phase 54: Voice → work order capture (trigger phrase + AI classifier)
5. Phase 55: Recurring work orders with fan-out
6. Phase 56: PDF insights fix + polish

This seed is specifically the evolution of Phase 51's hardcoded approach into a real admin system. Don't confuse it with Phase 51 itself — Phase 51 is the pragmatic v2.3 implementation, this seed is the eventual proper solution.

**If v2.3 ships and then you decide to also onboard another user or add a new store manually**, that's your trigger — pull this seed out and plan a small phase to migrate stores from enum to table.
