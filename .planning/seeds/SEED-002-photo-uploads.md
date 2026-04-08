---
id: SEED-002
status: dormant
planted: 2026-04-07
planted_during: Between milestones (post v2.2, pre v2.3)
trigger_when: Milestone scope touches capture pipeline, dashboard media handling, image processing, or photo/image UX
scope: Medium
---

# SEED-002: Photo uploads — in-depth discussion needed before scoping

## Why This Matters

User flagged photo uploads as a distinct concern separate from the v2.3 feature batch (launch UX, project grouping, chat persistence, bug fixes). The explicit ask was: "question about photo uploads may need separate in-depth text" — meaning the current photo upload flow has enough unresolved design questions that it warrants its own focused discussion rather than being bundled into an existing phase.

What's unclear right now (to be explored during discussion):
- What specifically is wrong or missing with the current photo flow?
- Is this about ingestion (how photos enter Vigil), organization (how they're tagged/grouped), presentation (how they appear on dashboard), or AI processing (what the AI does with images)?
- Does this overlap with the existing image folder watcher, or is it a different capture path?
- How does this intersect with the G2 glasses (which have a camera permission in the plugin manifest)?

The seed exists to make sure this conversation happens before any phase *assumes* it knows the answer.

## When to Surface

**Trigger:** Milestone planning that touches any of:
- Capture pipeline (ingestion of text/voice/image/other)
- Dashboard media display or organization
- Image-related AI processing (description, OCR, object detection)
- G2 glasses camera integration
- Folder watching for images
- Any "photo" or "image" keyword in milestone scope

This seed should be presented during `/gsd-new-milestone` before requirements/roadmap generation so the discussion can shape what phases get created.

## Scope Estimate

**Medium** — likely 1–2 phases once the design questions are answered. Could grow to a full milestone if the discussion reveals the photo pipeline needs rearchitecting (e.g., if current image ingestion is considered fundamentally wrong). Could shrink to a quick task if it turns out to be a small UX fix.

The Medium estimate reflects uncertainty, not complexity.

## Breadcrumbs

Current photo/image touchpoints in the codebase — places the discussion will need to reference:

- [Sources/DailyBriefMonitor/Dashboard/DashboardView.swift:51-56](Sources/DailyBriefMonitor/Dashboard/DashboardView.swift#L51-L56) — "Import Image" menu action, `viewModel.canImportImage` gate
- [Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift](Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift) — `importImage()` method and state
- [Sources/DailyBriefMonitor/Settings/SettingsView.swift:459-470](Sources/DailyBriefMonitor/Settings/SettingsView.swift#L459-L470) — Image Folder watch configuration (`.jpg, .png, .gif, .webp`)
- [Sources/JarvisCore/Services/APIAIServices.swift](Sources/JarvisCore/Services/APIAIServices.swift) — AI services that likely handle image description
- [.planning/phases/05-voice-image-capture/](.planning/phases/05-voice-image-capture/) — original image capture phase (3 plans)
- [.planning/phases/09-folder-watching/](.planning/phases/09-folder-watching/) — folder watcher implementation (currently has active bug — see /gsd-debug session)
- [.planning/phases/20-folder-watcher-manual-triage/](.planning/phases/20-folder-watcher-manual-triage/) — manual triage flow for watched folders
- [vigil-g2-plugin/app.json](vigil-g2-plugin/app.json) — G2 plugin currently does NOT request camera permission (only `network`); a future glasses-camera ingestion path would require adding it

## Notes

- Planted 2026-04-07 while working on v2.2 shipping + v2.3 planning.
- Planted alongside SEED-001 (stores admin UI for wide release).
- Do NOT pre-scope this seed. The whole point is that the user wants to write up the problem themselves before the AI proposes solutions. When this surfaces during /gsd-new-milestone, the first action should be to ask the user for their write-up, not to generate options.
- Related active bug: folder watch is enabled with correct folders but not auto-importing or deleting (reported same session). If that bug affects the image folder specifically, the fix may overlap with this seed's scope.
