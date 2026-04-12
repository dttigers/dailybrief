# Requirements: Vigil — v2.5 Dashboard Everywhere

**Defined:** 2026-04-12
**Core Value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.

## v2.5 Requirements

### PWA Foundation

- [ ] **PWA-01**: User can access the Vigil dashboard at app.vigilhub.io from any browser and authenticate with their Vigil API key
- [ ] **PWA-02**: The PWA is responsive and usable on phone, tablet, and desktop screen sizes
- [ ] **PWA-03**: User can install the PWA to their home screen ("Add to Home Screen") and it launches as a standalone app
- [ ] **PWA-04**: The PWA shows an offline indicator when network is unavailable

### Thoughts

- [ ] **THOUGHT-01**: User can view all thoughts with category filtering (same categories as Mac dashboard)
- [ ] **THOUGHT-02**: User can search thoughts by text content
- [ ] **THOUGHT-03**: User can capture a new text thought from the PWA
- [ ] **THOUGHT-04**: User can edit an existing thought's content inline

### Work Orders

- [ ] **WO-01**: User can view all work orders with their current status (open/in-progress/done) and AI priority ranking
- [ ] **WO-02**: User can mark a work order as complete, in-progress, or reopen it from the dashboard, and the change persists so it doesn't reprint
- [ ] **WO-03**: Work order status changes from the PWA are reflected in the next daily brief PDF

### Projects

- [ ] **PROJ-01**: User can view all projects and see thoughts assigned to each
- [ ] **PROJ-02**: User can assign or unassign a thought to a project from the PWA

### Documentation

- [ ] **DOC-01**: A README.md exists at the repo root with project description, architecture overview, setup instructions, and feature summary

## Future Requirements

### PWA Enhancements

- **PWA-F01**: Voice capture via Web Speech API
- **PWA-F02**: Photo upload with smart photo pipeline
- **PWA-F03**: Push notifications for new work orders
- **PWA-F04**: Offline read access with service worker caching

### Cross-Platform

- **XP-01**: WebXR mode for Android XR headsets
- **XP-02**: Native Android XR app (Kotlin/Jetpack XR SDK)

### Work Orders

- **WO-F01**: ServiceNow API integration replacing IMAP source (blocked on IT token)
- **WO-F02**: Work order → project linkage

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native iOS/Android app | PWA covers cross-platform; native only if PWA proves insufficient |
| Replace Mac SwiftUI dashboard | PWA runs alongside it; deprecation is gradual, not v2.5 |
| ServiceNow API integration | Blocked on IT for API token; work orders stay IMAP-sourced |
| Multi-user auth | Single-user system; API key auth sufficient |
| Real-time sync / WebSocket | Polling on refresh sufficient for single user |
| Photo upload from PWA | Requires backend changes for multipart upload; defer to PWA-F02 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PWA-01 | Phase 63 | Not started |
| PWA-02 | Phase 63 | Not started |
| PWA-03 | Phase 63 | Not started |
| PWA-04 | Phase 63 | Not started |
| THOUGHT-01 | Phase 64 | Not started |
| THOUGHT-02 | Phase 64 | Not started |
| THOUGHT-03 | Phase 64 | Not started |
| THOUGHT-04 | Phase 64 | Not started |
| WO-02 | Phase 65 | Not started |
| WO-03 | Phase 65 | Not started |
| WO-01 | Phase 66 | Not started |
| PROJ-01 | Phase 67 | Not started |
| PROJ-02 | Phase 67 | Not started |
| DOC-01 | Phase 68 | Not started |

**Coverage:**
- v2.5 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 — traceability filled after roadmap creation*
