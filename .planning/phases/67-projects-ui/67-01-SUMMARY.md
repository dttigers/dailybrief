---
phase: 67-projects-ui
plan: "01"
subsystem: vigil-pwa
tags: [projects, ui, pwa, react, tailwind]
dependency_graph:
  requires: []
  provides: [projects-ui, project-assignment-ui]
  affects: [vigil-pwa/src/api/client.ts, vigil-pwa/src/App.tsx, vigil-pwa/src/components/Layout.tsx]
tech_stack:
  added: []
  patterns: [expandable-card, hook-with-parallel-fetch, assignment-dropdown]
key_files:
  created:
    - vigil-pwa/src/hooks/useProjects.ts
    - vigil-pwa/src/components/ProjectCard.tsx
    - vigil-pwa/src/components/ThoughtAssignmentRow.tsx
    - vigil-pwa/src/pages/ProjectsPage.tsx
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/components/Layout.tsx
    - vigil-pwa/src/App.tsx
decisions:
  - "projectId !== undefined check (not truthiness) in updateThought to allow null unassign"
  - "Promise.all for parallel per-project thought fetching — N+2 API calls acceptable for <20 projects"
  - "select defaultValue='' with onChange reset pattern for assign dropdown"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-12T20:36:56Z"
  tasks_completed: 2
  files_created: 4
  files_modified: 3
---

# Phase 67 Plan 01: Projects UI Summary

**One-liner:** Projects tab with expandable cards showing assigned thoughts, assign/unassign via dropdown using parallel-fetch useProjects hook.

## What Was Built

The Vigil PWA now has a fully functional Projects tab. Users can:

1. Navigate to the Projects tab (third tab in nav alongside Thoughts and Work Orders)
2. See all projects as expandable cards with name, thought count, and status badge
3. Click a card to expand and see all thoughts assigned to that project
4. Unassign a thought from a project via the "Unassign" button (persists via PUT /v1/thoughts/:id with projectId: null)
5. Assign an unassigned thought via a dropdown select inside the expanded card (persists via PUT /v1/thoughts/:id with projectId: N)

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | API functions, useProjects hook, routing/nav | 1c4f41f | client.ts, useProjects.ts, Layout.tsx, App.tsx |
| 2 | ProjectsPage, ProjectCard, ThoughtAssignmentRow | 6645e77 | ProjectsPage.tsx, ProjectCard.tsx, ThoughtAssignmentRow.tsx |

## Architecture Notes

**useProjects hook:** Fetches all projects first, then fires parallel `Promise.all` for per-project thoughts and unassigned thoughts — N+2 API calls total. Acceptable for expected project count (<20). On any assign/unassign action, calls `refetch()` to reload all data for consistency.

**updateThought projectId:** Uses `!== undefined` guard (not truthiness) so `projectId: null` correctly passes through to the request body as the unassign signal. `projectId: 0` would incorrectly be falsy otherwise.

**ProjectCard expand/collapse:** Local `useState(false)` — no global state needed. Description line always visible when present; truncated when collapsed.

**Assign dropdown:** Uses `defaultValue=""` + `onChange` pattern. After selection, `e.target.value = ''` resets the control to the placeholder without needing a controlled state variable.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All data flows through live API calls.

## Threat Flags

None. No new network endpoints or auth paths introduced in the PWA layer.

## Self-Check: PASSED

- vigil-pwa/src/hooks/useProjects.ts: FOUND
- vigil-pwa/src/components/ProjectCard.tsx: FOUND
- vigil-pwa/src/components/ThoughtAssignmentRow.tsx: FOUND
- vigil-pwa/src/pages/ProjectsPage.tsx: FOUND
- Commit 1c4f41f: FOUND
- Commit 6645e77: FOUND
- Vite build: PASSED (42 modules, zero errors)
