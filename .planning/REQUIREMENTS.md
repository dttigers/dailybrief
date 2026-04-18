# Requirements: Vigil

**Defined:** 2026-04-17
**Core Value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.

## v3.4 Requirements

Requirements for Multi-User Foundation & PWA Polish. Each maps to roadmap phases.

### Brief Reliability

- [x] **BRIEF-01**: User can view previously generated briefs in the PWA brief history (PDFs survive Railway redeploys)

### PWA Editing

- [x] **EDIT-01**: User can edit a thought without the 30s auto-refresh overwriting in-progress changes

### Context Menu

- [x] **CTX-01**: User can right-click a thought row to open a context menu (desktop)
- [x] **CTX-02**: User can long-press a thought row to open a context menu (iOS/mobile)
- [x] **CTX-03**: User can delete a thought from the context menu
- [x] **CTX-04**: User can move a thought to a different category from the context menu
- [x] **CTX-05**: User can enter edit mode from the context menu
- [x] **CTX-06**: User can re-triage a thought from the context menu
- [x] **CTX-07**: User can add a thought to a project from the context menu

### Multi-User Foundation

- [x] **AUTH-01**: System has a users table with email, hashed password, and profile fields
- [ ] **AUTH-02**: User can register with email and password (API endpoint)
- [x] **AUTH-03**: User can log in and receive a JWT token (API endpoint)
- [x] **AUTH-04**: All data tables have userId foreign keys with existing data backfilled to seed user
- [ ] **AUTH-05**: All API routes scope data queries to the authenticated user's userId

## Future Requirements

### Multi-User UX

- **AUTH-06**: User can register and log in from the PWA (login/register screens)
- **AUTH-07**: User can manage their profile and change password from the PWA
- **AUTH-08**: Admin can invite new users via email

### Carry-Forward (Blocked)

- **EXT-01**: Persistent Safari extension (survives restarts without re-enabling)
- **IOS-01**: iOS Shortcut quick-capture (blocked by Shortcuts.app bugs)
- **WO-01**: ServiceNow API work order source (blocked on IT token)

## Out of Scope

| Feature | Reason |
|---------|--------|
| PWA login/register UI | Backend-only foundation for v3.4; UI deferred to next milestone |
| Multi-user G2 plugin auth | G2 plugin will continue using bearer tokens for now |
| Role-based access control | Single role (user) sufficient; admin roles deferred |
| OAuth/SSO login | Email/password sufficient for initial multi-user; OAuth later |
| Real-time collaboration | Users have separate data; no shared editing needed |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BRIEF-01 | Phase 99 | Complete |
| EDIT-01 | Phase 100 | Complete |
| CTX-01 | Phase 101 | Complete |
| CTX-02 | Phase 101 | Complete |
| CTX-03 | Phase 101 | Complete |
| CTX-04 | Phase 101 | Complete |
| CTX-05 | Phase 101 | Complete |
| CTX-06 | Phase 101 | Complete |
| CTX-07 | Phase 101 | Complete |
| AUTH-01 | Phase 102 | Complete |
| AUTH-02 | Phase 102 | Pending |
| AUTH-03 | Phase 102 | Complete |
| AUTH-04 | Phase 102 | Complete |
| AUTH-05 | Phase 102 | Pending |

**Coverage:**
- v3.4 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-04-17*
*Last updated: 2026-04-17 after roadmap creation*
