---
phase: 32-g2-scaffold-home
plan: 01
subsystem: ui
tags: [vite, typescript, even-hub-sdk, smart-glasses, g2]

# Dependency graph
requires:
  - phase: none
    provides: greenfield project
provides:
  - vigil-g2-plugin/ Vite+TS project scaffold
  - Even Hub SDK bridge initialization
  - Startup container rendering on G2 display
  - app.json plugin manifest
affects: [32-02, 33-g2-navigation]

# Tech tracking
tech-stack:
  added: [vite, @evenrealities/even_hub_sdk, @evenrealities/evenhub-cli, @evenrealities/evenhub-simulator]
  patterns: [Even Hub SDK bridge init pattern, TextContainerProperty construction, CreateStartUpPageContainer usage]

key-files:
  created: [vigil-g2-plugin/package.json, vigil-g2-plugin/tsconfig.json, vigil-g2-plugin/vite.config.ts, vigil-g2-plugin/index.html, vigil-g2-plugin/app.json, vigil-g2-plugin/src/main.ts]
  modified: []

key-decisions:
  - "Used ES2020 target per plan (template defaulted to ES2023)"
  - "Full-screen 576x288 text container for home screen startup"
  - "containerID 1, containerName 'home' as primary event capture container"

patterns-established:
  - "SDK init: waitForEvenAppBridge() -> create container -> createStartUpPageContainer()"
  - "TextContainerProperty constructed via class constructor with Partial<> data"
  - "Vite base './' for relative paths in packaged plugin"

# Metrics
duration: 4min
completed: 2026-04-04
---

# Plan 01: Scaffold + SDK Bridge Summary

**Vite+TS project with Even Hub SDK bridge initialization and startup container rendering on Even G2 display**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-04
- **Completed:** 2026-04-04
- **Tasks:** 2
- **Files created:** 8

## Accomplishments
- Scaffolded vigil-g2-plugin/ as sibling to vigil-core/ with Vite vanilla-ts template
- Installed Even Hub SDK, CLI tools, and simulator globally
- Cleaned template boilerplate and configured tsconfig, vite.config, app.json manifest
- Implemented SDK bridge init with full-screen startup text container showing Vigil branding

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Vite + TypeScript project with Even Hub SDK** - `3fa2404` (feat)
2. **Task 2: Initialize SDK bridge and render minimal startup container** - `e879c3c` (feat)

## Files Created/Modified
- `vigil-g2-plugin/package.json` - Project manifest with SDK dependency
- `vigil-g2-plugin/tsconfig.json` - TypeScript config (ES2020, strict, bundler resolution)
- `vigil-g2-plugin/vite.config.ts` - Vite config with relative base path
- `vigil-g2-plugin/index.html` - Minimal HTML shell with app mount point
- `vigil-g2-plugin/app.json` - Even Hub plugin descriptor manifest
- `vigil-g2-plugin/src/main.ts` - SDK bridge init + startup container with Vigil branding

## Decisions Made
- Used ES2020 target as plan specified (Vite template defaulted to ES2023)
- Full-screen 576x288 container covers entire G2 display for home screen
- No event listeners added per plan instructions (Phase 33 handles navigation)

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Project builds cleanly with `npm run build`
- SDK bridge initializes and renders startup container
- Ready for Plan 02: home screen content with mock data

---
*Phase: 32-g2-scaffold-home*
*Completed: 2026-04-04*
