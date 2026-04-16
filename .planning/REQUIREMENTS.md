# Requirements — Milestone v3.2 Freshness & Capture Parity

**Goal:** Keep Vigil's daily picture accurate by aging out stale data, and bring non-Mac users to capture parity via the browser extension.

**Principles:**
- No hard deletes — aging is view/scope only; data remains in DB for search + Chat
- Wednesday is the weekly rollover anchor (ADHD clean-slate rhythm)
- Capture parity across Mac, PWA, and browser extension

---

## v3.2 Requirements

### Thought Rollover (weekly view freshness)

- [x] **ROLLOVER-01**: User sees only thoughts from the current week (Wed–Tue) in the Thoughts tab by default
- [x] **ROLLOVER-02**: User can access thoughts from any prior week via full-text search
- [x] **ROLLOVER-03**: Chat queries have access to all historical thoughts regardless of the rollover window (for context)
- [x] **ROLLOVER-04**: Rollover boundary is Wednesday 00:00 in the user's configured timezone

### Analysis Scope (7-day window)

- [x] **SCOPE-01**: Insights generation only considers thoughts from the last 7 days
- [x] **SCOPE-02**: Therapy pattern recognition only considers thoughts from the last 7 days
- [x] **SCOPE-03**: Therapy session prep only considers thoughts from the last 7 days
- [ ] **SCOPE-04**: Daily brief PDF only includes thoughts from the last 7 days (fixes stale OCR noise)

### Persistence (server-side caching for expensive AI pages)

- [x] **PERSIST-01**: Insights results persist server-side; revisits show last generation instantly with a "Regenerate" button
- [x] **PERSIST-02**: Therapy patterns persist server-side with explicit regenerate
- [x] **PERSIST-03**: Therapy session prep persists server-side with explicit regenerate
- [ ] **PERSIST-04**: Chat auto-resumes the most recently active session when the PWA is reopened

### Tasks Tab Filtering

- [ ] **TASKS-01**: Tasks tab defaults to showing Open tasks only
- [ ] **TASKS-02**: User can toggle the Tasks tab view between Open, Done, and All
- [ ] **TASKS-03**: Selected filter persists per-device (localStorage) for snappy UX; server holds last-set value as the default for a new device's first visit

### Work Order Archive

- [ ] **WO-01**: Gmail-imported work orders auto-archive 7 days after import
- [ ] **WO-02**: Completed work orders (any source) auto-archive 7 days after completion
- [ ] **WO-03**: Manually-entered work orders never auto-archive (user owns lifecycle)
- [ ] **WO-04**: User can view archived work orders via a "Show archived" toggle in the Work Orders view
- [ ] **WO-05**: User can unarchive a work order from the archived view
- [ ] **WO-06**: User can bulk-clear all archived work orders (permanent delete with confirmation)

### Brief PDF Cleanup

- [ ] **BRIEF-01**: Daily brief PDF no longer contains a duplicate Tasks section on Page 1 (OCR-noise source removed)
- [ ] **BRIEF-02**: Affirmation section moves to the bottom of Page 1
- [ ] **BRIEF-03**: Remaining Page 2+ content reflows up to fill the freed space
- [ ] **BRIEF-04**: Daily brief PDF respects the 7-day thought window (SCOPE-04)

### Browser Extension Quick-Capture

- [ ] **EXT-01**: Extension popup accepts freeform thought text (not just page URL)
- [ ] **EXT-02**: Captured thoughts POST to `/v1/thoughts` and trigger server-side auto-triage
- [ ] **EXT-03**: Extension shows categorization result after triage completes (success feedback)
- [ ] **EXT-04**: Extension works in both Chrome and Safari (preserves v3.1 cross-browser coverage)
- [ ] **EXT-05**: Legacy page-URL capture is preserved as a one-click option within the new popup

### UAT Debt

- [ ] **UAT-01**: Phase 81 UAT Test 8 (iOS PWA standalone OAuth real-device) passes on live Railway deployment

---

## Future Requirements (deferred)

- iOS Shortcut capture — held; revisit after Shortcuts.app bugs resolve or pivot to PWA share target (Phase 85 deferred indefinitely)
- Gmail Server Service & Work Order Extraction — blocked on ServiceNow API token from IT (Phase 80)
- Configurable rollover window (not just Wed–Tue) — simplicity wins for v3.2
- Configurable analysis window (not just 7 days) — lock to 7d for v3.2
- Retention hard-delete policy — no hard deletes in v3.2

---

## Out of Scope

- **Hard deletes of thoughts** — Aging is view/scope only. Data stays searchable for lookback value.
- **Native iOS app** — Browser extension + PWA cover non-Mac capture. Mobile native blocked by no Apple Developer Program account.
- **Cross-timezone sync for rollover** — Rollover anchors to user's single configured timezone (existing setting).
- **Archived Work Order hard-delete** — Archive is hide-only; user can always unarchive.
- **Extension-side triage** — All AI work happens server-side; extension stays dumb.

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| ROLLOVER-01 | Phase 88 | Complete |
| ROLLOVER-02 | Phase 88 | Complete |
| ROLLOVER-03 | Phase 88 | Complete |
| ROLLOVER-04 | Phase 88 | Complete |
| SCOPE-01 | Phase 89 | Complete |
| SCOPE-02 | Phase 89 | Complete |
| SCOPE-03 | Phase 89 | Complete |
| SCOPE-04 | Phase 93 | Pending |
| PERSIST-01 | Phase 90 | Complete |
| PERSIST-02 | Phase 90 | Complete |
| PERSIST-03 | Phase 90 | Complete |
| PERSIST-04 | Phase 90 | Pending |
| TASKS-01 | Phase 91 | Pending |
| TASKS-02 | Phase 91 | Pending |
| TASKS-03 | Phase 91 | Pending |
| WO-01 | Phase 92 | Pending |
| WO-02 | Phase 92 | Pending |
| WO-03 | Phase 92 | Pending |
| WO-04 | Phase 92 | Pending |
| WO-05 | Phase 92 | Pending |
| WO-06 | Phase 92 | Pending |
| BRIEF-01 | Phase 93 | Pending |
| BRIEF-02 | Phase 93 | Pending |
| BRIEF-03 | Phase 93 | Pending |
| BRIEF-04 | Phase 93 | Pending |
| EXT-01 | Phase 94 | Pending |
| EXT-02 | Phase 94 | Pending |
| EXT-03 | Phase 94 | Pending |
| EXT-04 | Phase 94 | Pending |
| EXT-05 | Phase 94 | Pending |
| UAT-01 | Phase 95 | Pending |

**Coverage:** 30/30 requirements mapped. No orphans.
