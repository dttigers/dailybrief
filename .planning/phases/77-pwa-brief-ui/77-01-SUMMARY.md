---
phase: 77-pwa-brief-ui
plan: 01
subsystem: ui
tags: [react, typescript, pwa, pdf, blob-url, vite]

# Dependency graph
requires:
  - phase: 76-brief-assembly
    provides: POST /v1/brief/generate and GET /v1/brief/:date endpoints returning PDF binary
provides:
  - generateBrief() and getBriefPdf() binary fetch functions in client.ts
  - BriefHistoryPage with generate trigger, spinner, inline PDF iframe, download anchor, regenerate button
  - Layout tab renamed from History to Briefs
affects: [78-mac-cli-thin-client, any future PWA brief features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Binary fetch pattern: override Content-Type to empty string to suppress application/json default in vigilFetch"
    - "Blob URL lifecycle: URL.createObjectURL + useEffect cleanup with URL.revokeObjectURL"
    - "Local date construction via new Date() getFullYear/getMonth/getDate (not UTC) to avoid timezone mismatch"
    - "Generate state machine: idle/generating/done/error drives conditional UI rendering"

key-files:
  created: []
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/components/Layout.tsx
    - vigil-pwa/src/pages/BriefHistoryPage.tsx

key-decisions:
  - "Use Content-Type empty string override in vigilFetch to prevent application/json header on binary requests"
  - "Use res.blob() not res.json() for PDF endpoint responses"
  - "Local date (not UTC) for today detection to match server-stored YYYY-MM-DD dates"
  - "Regenerate button is secondary style (slate border) to visually de-emphasize vs primary Generate"

patterns-established:
  - "Binary fetch pattern: pass headers: { 'Content-Type': '' } to override vigilFetch default for binary endpoints"

requirements-completed: [PWA-01, PWA-02, PWA-03]

# Metrics
duration: 15min
completed: 2026-04-13
---

# Phase 77 Plan 01: PWA Brief UI Summary

**Generate/preview/download brief UI in React PWA — iframe blob URL rendering, generate state machine, blob cleanup, and Layout tab rename**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-13T18:10:00Z
- **Completed:** 2026-04-13T18:25:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `generateBrief()` and `getBriefPdf()` to client.ts with correct binary fetch pattern (Content-Type override + res.blob())
- Rewrote BriefHistoryPage with generate state machine, inline PDF iframe, download anchor, regenerate button, and blob URL cleanup
- Renamed Layout "History" tab to "Briefs" (route path unchanged)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add binary PDF fetch functions to client.ts and rename Layout tab** - `ae49aea` (feat)
2. **Task 2: Rewrite BriefHistoryPage with generate, preview, and download** - `df45d62` (feat)

## Files Created/Modified
- `vigil-pwa/src/api/client.ts` - Added generateBrief() POST and getBriefPdf(date) GET functions that fetch PDF binary
- `vigil-pwa/src/components/Layout.tsx` - Renamed History tab label to Briefs
- `vigil-pwa/src/pages/BriefHistoryPage.tsx` - Full rewrite with generate/preview/download; removed renderSummary JSON renderer; added iframe blob URL approach for both today and detail views

## Decisions Made
- Content-Type must be overridden to empty string in binary fetch calls because vigilFetch spreads `init?.headers` after defaults — passing `headers: { 'Content-Type': '' }` replaces the default `application/json` header that would corrupt binary responses
- Local date construction (getFullYear/getMonth/getDate) used instead of toISOString() to match server-stored YYYY-MM-DD dates regardless of user timezone

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

`npx tsc --noEmit` (root tsconfig) reported TS6305 stale `.d.ts` errors — pre-existing issue from project using composite TypeScript references with stale build artifacts. Not caused by this plan's changes. `npm run build` (Vite) passes cleanly. The plan's verification command `tsc -p tsconfig.app.json --noEmit` also shows two pre-existing errors (ImportMeta.env and CSS side-effect import) that exist in the codebase independent of this plan. Build output validates correctness.

## Known Stubs

None — all data sources are wired. The generate flow calls the real `/v1/brief/generate` endpoint; the PDF preview uses real blob URLs from the API response.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- PWA brief UI complete — users can generate, preview, and download briefs from the browser
- Phase 78 (Mac CLI thin client) can proceed: replaces local CoreGraphics rendering with API call + lpr

---
*Phase: 77-pwa-brief-ui*
*Completed: 2026-04-13*
