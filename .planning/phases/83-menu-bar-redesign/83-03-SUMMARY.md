---
phase: 83-menu-bar-redesign
plan: 03
subsystem: pwa
tags: [react, vite, typescript, settings, print-schedule, api-client]

# Dependency graph
requires:
  - 83-01  # GET/PUT /v1/settings/print-schedule API endpoints
provides:
  - getPrintSchedule() and setPrintSchedule() API client functions in vigil-pwa/src/api/client.ts
  - PrintSchedule interface exported from vigil-pwa/src/api/client.ts
  - Print Schedule card section in SettingsPage.tsx (time picker + enabled toggle + Save button)
affects:
  - vigil-pwa/src/pages/SettingsPage.tsx

# Tech tracking
tech-stack:
  added: []
  patterns:
    - vigilFetch wrapper pattern for new API client functions (mirrors getGoogleStatus/disconnectGoogle)
    - Shared banner state reuse — Print Schedule save outcome uses the same setBanner as Google OAuth
    - Native <input type="time"> for cross-platform time selection without a date-picker library

key-files:
  created: []
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/api/client.test.ts
    - vigil-pwa/src/pages/SettingsPage.tsx

key-decisions:
  - "Reused existing banner/setBanner state from Google card — no second banner state needed, auto-dismiss already wired"
  - "PrintSchedule imported as value (not import type) to stay consistent with existing import style in this file"
  - "scheduleLoading initialised true so the card shows Loading... on first paint rather than a flash of defaults"

# Metrics
duration: 15min
completed: 2026-04-14
---

# Phase 83 Plan 03: Print Schedule PWA Settings UI Summary

**PrintSchedule API client functions + Print Schedule card in SettingsPage — native time picker, enabled toggle, save with success/error banner**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-04-14
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

### PrintSchedule interface + API client functions (`vigil-pwa/src/api/client.ts`)

```typescript
export interface PrintSchedule { hour: number; minute: number; enabled: boolean }

export async function getPrintSchedule(): Promise<PrintSchedule>
// GET /v1/settings/print-schedule — throws on non-2xx

export async function setPrintSchedule(s: PrintSchedule): Promise<void>
// PUT /v1/settings/print-schedule with JSON body — throws on non-2xx
```

Both functions follow the exact `vigilFetch` pattern used by `getGoogleStatus` and `disconnectGoogle` directly above them.

### Print Schedule card (`vigil-pwa/src/pages/SettingsPage.tsx`)

- Loads schedule on mount via `getPrintSchedule()` — shows "Loading..." while in flight, falls back to defaults `{ hour: 6, minute: 0, enabled: true }` on error
- `<input type="time">` renders as native OS time picker; value serialised from `hour`/`minute` via `padStart(2,'0')` and parsed back via `split(':').map(Number)` with `!isNaN` guard (T-83-10 mitigation)
- Enabled checkbox (`<input type="checkbox">`) with `accent-teal-500` to match brand
- Save button calls `setPrintSchedule(schedule)`, shows "Print schedule saved" success banner or error banner via the shared `setBanner` state; 5-second auto-dismiss already handled by the existing `useEffect`
- Card markup matches Google card: `bg-gray-900 border border-gray-900/40 rounded-lg p-5 mt-4`

### Tests (`vigil-pwa/src/api/client.test.ts`)

5 new tests covering:
1. `getPrintSchedule` returns parsed body on 200
2. `getPrintSchedule` throws on non-2xx (500)
3. `getPrintSchedule` sends GET to correct URL with bearer auth
4. `setPrintSchedule` sends PUT with correct JSON body and bearer auth
5. `setPrintSchedule` throws on non-2xx (400)

All 10 tests in the file pass (5 pre-existing Google tests + 5 new PrintSchedule tests).

## Task Commits

1. **Task 1: getPrintSchedule + setPrintSchedule + tests** — `991bdbf` (combined with card below)
2. **Task 2: Print Schedule card in SettingsPage** — `991bdbf` (feat)

## Build Status

- `npx vite build` — clean build, 308.76 kB bundle
- 10/10 vitest tests passing (5 pre-existing Google tests + 5 new PrintSchedule tests)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — `getPrintSchedule` is wired to the live API endpoint from Plan 01; no hardcoded values flow to the UI.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced by this plan.

---
*Phase: 83-menu-bar-redesign*
*Completed: 2026-04-14*
