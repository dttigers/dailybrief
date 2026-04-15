---
phase: 86-split-brief-schedule
plan: 03
subsystem: vigil-pwa/settings
tags: [pwa, react, settings, schedule, timezone]
requirements: [SC-2, SC-6]
dependency_graph:
  requires:
    - vigil-pwa/src/api/client.ts (PrintSchedule type + vigilFetch)
    - vigil-pwa/src/pages/SettingsPage.tsx (Phase 81 Google card layout)
    - vigil-core /v1/settings/generate-schedule + /v1/settings/timezone (Phase 86-01)
  provides:
    - ScheduleCard reusable component
    - 4 new api/client.ts functions (getGenerateSchedule, setGenerateSchedule, getTimezone, setTimezone)
    - TimezoneResponse interface
    - PWA Settings UI with two schedules + timezone picker
  affects:
    - Phase 86-04 (Mac CLI pull-only mode — reads print-schedule from server, user configures here)
    - Phase 86-05 (menubar staleness — reads generate-schedule cadence, user configures here)
tech_stack:
  added: []
  patterns:
    - "Props-driven ScheduleCard with load/save function injection (same pattern reused twice)"
    - "Intl.DateTimeFormat().resolvedOptions().timeZone for browser-IANA autofill on default server value (D-10)"
    - "Intl.supportedValuesOf('timeZone') with hardcoded fallback list for datalist options"
    - "Banner-based save feedback via injected onSaved/onError callbacks — no state lift required"
key_files:
  created:
    - vigil-pwa/src/components/ScheduleCard.tsx
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/pages/SettingsPage.tsx
decisions:
  - "Defaults live at call site (Auto-generate 04:00, Auto-print 06:00) not inside ScheduleCard — keeps component pure"
  - "Timezone autofill only when server returns default America/New_York (D-10) — do not clobber user-chosen values"
  - "Timezone input is plain <input type=\"text\" list=\"tz-list\"> with datalist — no dropdown dep; user can still type arbitrary IANA and server validates (T-86-11)"
  - "Intl.supportedValuesOf gated via runtime typeof check + fallback list (Safari < 15.4 lacked it; current PWA targets have it but fallback keeps things safe)"
metrics:
  duration: "~8 min"
  completed_date: "2026-04-15"
  tasks: 2
  files_modified: 2
  files_created: 1
---

# Phase 86 Plan 03: PWA Settings UI (two ScheduleCards + timezone picker) — Summary

**One-liner:** Extracted a reusable `ScheduleCard` component and rewired the PWA Settings page to render two independent schedules (Auto-generate + Auto-print) plus an IANA timezone picker with browser-based autofill — consuming the four new client methods against Phase 86-01's server endpoints.

## What Shipped

1. **`vigil-pwa/src/components/ScheduleCard.tsx`** — new reusable component. Props: `title`, `subtitle`, `loadFn`, `saveFn`, `onSaved?`, `onError?`, `defaultSchedule`. Internally owns `schedule`/`loading`/`saving` state, renders `<input type="time">` + enabled checkbox + Save button inside the same gray-900 section shell as the rest of Settings.
2. **`vigil-pwa/src/api/client.ts`** — four new exports appended after `setPrintSchedule`:
   - `getGenerateSchedule() => Promise<PrintSchedule>`
   - `setGenerateSchedule(s) => Promise<void>`
   - `getTimezone() => Promise<string>` (unwraps `{ timezone }`)
   - `setTimezone(tz) => Promise<void>` (surfaces `invalid_timezone` → "Invalid timezone")
   - `TimezoneResponse { timezone: string }` interface
3. **`vigil-pwa/src/pages/SettingsPage.tsx`** — rewritten to:
   - Render `<ScheduleCard>` twice (Auto-generate / Auto-print)
   - Add a Timezone `<section>` with `<input type="text" list="tz-list">` + `<datalist>` populated from `Intl.supportedValuesOf('timeZone')` or a 9-entry fallback
   - Autofill browser timezone when server returns default `America/New_York` (D-10)
   - Preserve the existing Google card + OAuth callback banner handling unchanged
   - Remove the inline print-schedule block and its state (`schedule`, `scheduleLoading`, `scheduleSaving`, `handleTimeChange`, `handleEnabledChange`, `handleScheduleSave`)

## Exported Signatures

```typescript
// vigil-pwa/src/api/client.ts
export interface TimezoneResponse { timezone: string }
export async function getGenerateSchedule(): Promise<PrintSchedule>
export async function setGenerateSchedule(s: PrintSchedule): Promise<void>
export async function getTimezone(): Promise<string>
export async function setTimezone(timezone: string): Promise<void>
```

```typescript
// vigil-pwa/src/components/ScheduleCard.tsx
interface ScheduleCardProps {
  title: string
  subtitle: string
  loadFn: () => Promise<PrintSchedule>
  saveFn: (s: PrintSchedule) => Promise<void>
  onSaved?: (msg: string) => void
  onError?: (msg: string) => void
  defaultSchedule: PrintSchedule
}
export function ScheduleCard(props: ScheduleCardProps): JSX.Element
```

## Timezone Autofill Behavior (D-10)

On SettingsPage mount:

1. Call `getTimezone()` — server returns `"America/New_York"` by default.
2. Read `Intl.DateTimeFormat().resolvedOptions().timeZone` (browser native).
3. If server returned the default AND browser zone is different, seed the input with the browser zone (user must still click Save to persist).
4. Otherwise show whatever the server returned.

This means a first-run user in Europe/London sees their actual zone pre-filled; a user who already saved `Asia/Tokyo` sees exactly that value (browser detection is suppressed to avoid clobbering).

## Task Commits

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Add ScheduleCard component + generate-schedule/timezone client methods | `babe662` |
| 2 | Rewrite SettingsPage with two ScheduleCards + timezone picker | `8e78fe7` |

## Verification

- `cd vigil-pwa && npm run build` — ✅ clean (Vite 4.2, 311KB gz 92KB, 437ms)
- `grep -n "Auto-generate" vigil-pwa/src/pages/SettingsPage.tsx` — 2 hits (comment + JSX)
- `grep -n "Auto-print" vigil-pwa/src/pages/SettingsPage.tsx` — 2 hits (comment + JSX)
- `grep -c "ScheduleCard" vigil-pwa/src/pages/SettingsPage.tsx` — 5 (import + 2 JSX open tags + 2 JSX close)
- `grep -n ">Print Schedule<" vigil-pwa/src/pages/SettingsPage.tsx` — no hits (old heading removed)
- `grep -n "resolvedOptions" vigil-pwa/src/pages/SettingsPage.tsx` — 1 hit (D-10 autofill)
- `grep -n 'datalist id="tz-list"' vigil-pwa/src/pages/SettingsPage.tsx` — 1 hit (timezone picker)
- `grep -n "generateBrief\|brief/generate" vigil-pwa/src/pages/` — zero on SettingsPage (D-16 honored; calls live in BriefHistoryPage unchanged)

## Deviations from Plan

**1. [Rule 3 — Blocking] `node_modules` missing in vigil-pwa worktree**
- **Found during:** Task 1 verification (`npx tsc` fell back to global tsc that refuses to run)
- **Issue:** Fresh worktree without installed deps
- **Fix:** `npm install` in `vigil-pwa/`
- **Files modified:** none

**2. [Out of scope — Deferred] Pre-existing SettingsPage.test.tsx failure**
- **Found during:** Task 2 verification (ran vitest to confirm my changes didn't break anything)
- **Issue:** 1 of 6 tests fails — `expect(findByText(/invalid_state/i))` but SettingsPage maps `invalid_state` → "Connection attempt expired. Please try again." via `GOOGLE_ERROR_MESSAGES`. Raw code never appears in DOM.
- **Scope check:** Stashed all my changes and reran — failure reproduces on clean HEAD. Unrelated to plan 86-03.
- **Action:** Logged to `.planning/phases/86-split-brief-schedule/deferred-items.md`; did NOT fix (Scope Boundary rule — pre-existing failure in unrelated file).
- **Other 5 tests pass:** empty, connected, scope gap, disconnect, callback-success

**3. [Rule 2 — Minor adjustment] `Intl.supportedValuesOf` typing**
- **Found during:** Task 2 implementation
- **Issue:** Plan used `(Intl as any).supportedValuesOf` but the repo's tsconfig `strict: true` would tolerate it. Switched to a narrower `(Intl as unknown as { supportedValuesOf?: ... })` cast pattern to avoid `any` leak into the codebase.
- **Files modified:** SettingsPage.tsx (tzOptions computation)
- **Commit:** rolled into `8e78fe7`

No architectural deviations.

## Threat Surface Check

All threats in the plan's `<threat_model>` are mitigated as planned:

- **T-86-11 (Tampering):** Client shows server's `invalid_timezone` error via `setTimezone` reject path (see `'Invalid timezone' : \`Failed (${res.status})\`` in client.ts:562).
- **T-86-12 (XSS):** Timezone value + banner text flow through React children — auto-escaped. No `dangerouslySetInnerHTML` added.
- **T-86-13 (Info Disclosure):** Error surface is `Invalid timezone` / `Failed (N)` / `Failed to save timezone: <message>` — no stack traces.

No new threat surface introduced (no new network endpoints, no file access changes, no schema changes — this plan is a pure PWA UI consumer of existing Phase 86-01 endpoints).

## Self-Check: PASSED

- FOUND: `vigil-pwa/src/components/ScheduleCard.tsx`
- FOUND: `vigil-pwa/src/pages/SettingsPage.tsx` (modified)
- FOUND: `vigil-pwa/src/api/client.ts` (modified — 4 new exports + 1 new interface)
- FOUND commit `babe662` (Task 1 — ScheduleCard + client methods)
- FOUND commit `8e78fe7` (Task 2 — SettingsPage rewrite)
- `npm run build` in vigil-pwa exits 0 with no type errors
- All plan acceptance criteria verified via grep above
