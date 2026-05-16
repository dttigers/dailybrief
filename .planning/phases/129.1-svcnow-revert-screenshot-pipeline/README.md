# Phase 129.1 — SVCNOW Revert + Screenshot Pipeline + PWA Manual-Create

**Status:** Not started — pivot direction captured 2026-05-16T20:30Z.
**Spawned by:** Mid-Session-2 pivot decision in [Phase 129 UAT-RESULTS.md](../129-lifecycle-restore-servicenow-popup/129-UAT-RESULTS.md) (search "Pivot Decision").
**Closes:** Reverts SVCNOW-01/02/03/05 (popup + Safari lock-step). Replaces with new requirements:
  - `SCAP-*` — operator screenshot capture pipeline
  - `WO-MANUAL-*` — PWA manual-create UI for work orders

## Pivot rationale (from 129-13-SUMMARY.md)

The ServiceNow assisted-capture popup is too high-friction in real Polaris usage. Typing description + priority + Send for every case is slower than screenshotting + extracting fields server-side. The operator surfaced this as a structural concern during Scenario 6 (drift-banner test) of Session 2 UAT.

## High-level scope (to be expanded via `/gsd:discuss-phase 129.1`)

### Plan 129.1-01 (planned) — Revert Chrome + Safari extension to Phase 84 baseline
Revert commits from Plans 129-03, 129-05, 129-07:
- `vigil-extension/popup.html`, `popup.css`, `popup.js` — back to Phase 84 thought-capture UI
- `vigil-extension/background.js` — remove the MV3 service worker that gates the action button per tab URL (D-01)
- `vigil-extension/content-script.js` — remove the SVCNOW-02 drift detector entirely
- `vigil-extension/manifest.json` — remove `*.service-now.com/*` host restriction; restore the Phase 84 generic capture target set
- `vigil-extension/popup-helpers.js` — delete (no longer needed)
- `vigil-extension/__tests__/` → `vigil-extension-tests/` move from 129-07 Task 1: KEEP (good housekeeping regardless)
- Lock-step the same reverts in `vigil-safari-extension/Vigil Capture Extension/Resources/`

### Plan 129.1-02 (planned) — vigil-core `POST /v1/captures/screenshot` endpoint
- New route: accepts multipart upload OR base64-image POST
- Calls Anthropic SDK (`claude-sonnet-4-6` or latest) with vision input + JSON schema for ServiceNow Polaris field extraction:
  - Number (CS#), Store Account, Location, Store Contact, Service, Trade, Maintenance Location, Maintenance Equipment, Maintenance Problem, Priority, Short Description, Assignment Group, Assigned To, Opened, State, After Hours, Time Worked, Resolution Code, Resolution Notes
- Maps extracted fields → `work_orders` columns; generates `client_capture_id` server-side; writes via existing `dbInsertOrGet` (preserves SVCNOW-04 dedup)
- Returns `{ workOrderId, fields: {...} }` to caller for confirmation / re-show in PWA

### Plan 129.1-03 (planned) — macOS launchd watcher + `~/vigil-captures/` folder
- launchd agent watches `~/vigil-captures/` (or `~/Pictures/Screenshots/` filtered for Polaris)
- On new file: validates it's an image, calls `POST /v1/captures/screenshot`, awaits response, logs result, moves file to `~/vigil-captures/processed/` or `~/vigil-captures/failed/`
- Alternative: macOS Shortcut tied to a hotkey for explicit-trigger captures (less ambient, more deterministic)

### Plan 129.1-04 (planned) — PWA manual-create UI for work orders
- New "Create work order" button in PWA work-orders list page
- Modal form with the same fields the screenshot pipeline extracts: case#, store, description, priority, etc.
- POSTs to existing `/v1/work-orders/sync` (same backend as the screenshot pipeline)
- Useful for: operator entries that don't have a Polaris screenshot, all non-operator users (who don't use ServiceNow)

## What Phase 129.1 preserves from Phase 129

- Migration 0021 `client_capture_id` column + partial unique index (in prod)
- `vigil-core/src/routes/work-orders.ts` `dbInsertOrGet` route (still the write path)
- `SVCNOW-04` requirement (mechanism-agnostic dedup primitive)
- All G2-side work (lifecycle restore fix, DOUBLE_CLICK gesture, terminology cleanup, build-gate convention)
- All Phase 129 documentation + UAT records as historical context

## Next action

Operator runs `/gsd:discuss-phase 129.1` to flesh out:
1. The exact new requirement IDs (SCAP-* + WO-MANUAL-*)
2. Confirm the macOS trigger mechanism (launchd watcher vs. Shortcut)
3. Confirm the vigil-core endpoint shape + auth surface
4. Confirm the PWA UI design + which work_orders fields the manual form exposes
