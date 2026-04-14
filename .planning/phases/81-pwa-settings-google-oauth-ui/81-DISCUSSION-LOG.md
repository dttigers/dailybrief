# Phase 81: PWA Settings & Google OAuth UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 81-pwa-settings-google-oauth-ui
**Areas discussed:** Settings page placement, Connection status display, OAuth flow trigger & callback UX, Settings page scope

---

## Settings Page Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Gear icon in header | Cog icon next to Sign Out button | ✓ |
| New tab in tab bar | Settings as 9th tab | |
| Replace Sign Out button | Gear replaces Sign Out; Sign Out moves into Settings | |

**User's choice:** Gear icon in header (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| /settings | Simple, standard | ✓ |
| /settings/integrations | Nested, room for future subpages | |

**User's choice:** /settings

| Option | Description | Selected |
|--------|-------------|----------|
| Red dot on gear icon when needs_auth | Attention signal | ✓ |
| No indicator | Minimal nav | |

**User's choice:** Yes — red dot on gear icon

---

## Connection Status Display

| Option | Description | Selected |
|--------|-------------|----------|
| Single card, per-scope rows | Google card with Calendar + Gmail rows | ✓ |
| Two separate cards | One per scope | |
| Single card, combined summary | Aggregate status only | |

**User's choice:** Single card, per-scope rows

| Option | Description | Selected |
|--------|-------------|----------|
| Same card, single Connect button | Card shell with Not connected state + scope fine print | ✓ |
| Minimal prompt + CTA | Headline + button only | |

**User's choice:** Same card, single Connect button

| Option | Description | Selected |
|--------|-------------|----------|
| Inline confirm | Disconnect → Confirm disconnect? / Cancel inline | ✓ |
| One click | Immediate disconnect | |
| Native confirm() dialog | Browser dialog | |

**User's choice:** Yes — inline confirm

---

## OAuth Flow Trigger & Callback UX

| Option | Description | Selected |
|--------|-------------|----------|
| Full-page redirect | window.location.href = /auth/google | ✓ |
| Popup window | window.open + postMessage | |

**User's choice:** Full-page redirect (iOS standalone PWA compatible)

| Option | Description | Selected |
|--------|-------------|----------|
| SettingsPage reads params + toast + clean URL | On-mount param handler, history.replaceState | ✓ |
| Separate /auth/google/callback PWA route | Dedicated callback route | |
| Silent refetch, no toast | No feedback moment | |

**User's choice:** SettingsPage reads + shows toast, cleans URL

| Option | Description | Selected |
|--------|-------------|----------|
| Update server to redirect to /settings | Supersedes Phase 79 D-07 redirect target | ✓ |
| Keep root redirect, forward from DashboardPage | Cross-page coordination | |

**User's choice:** Yes — update server to redirect to /settings

| Option | Description | Selected |
|--------|-------------|----------|
| Inline banner on SettingsPage | Styled like OfflineBanner, no new dep | ✓ |
| Add a toast library (sonner, react-hot-toast) | Full toast system | |
| Inline status text near button | Minimal | |

**User's choice:** Inline banner

| Option | Description | Selected |
|--------|-------------|----------|
| Same /auth/google URL for re-connect | Phase 79 D-09 forces prompt=consent every time | ✓ |
| Dedicated /auth/google/reauth endpoint | Separate server route | |

**User's choice:** Same /auth/google URL

---

## Settings Page Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Google integration card | Core phase deliverable | ✓ |
| Sign Out action in Settings | Move from header | |
| Vigil API key display/rotate | Masked key + replace button | |
| App info section | Version, API URL, clear cache | |

**User's multi-select:** Google integration card + "any others you think i need" (deferred to Claude)

| Option | Description | Selected |
|--------|-------------|----------|
| Google only | Ship lean, defer rest | ✓ |
| Add app info section | + About section | |
| Add all three | Full settings experience | |

**User's choice:** Yes, Google only (Recommended)
**Notes:** User deferred scope decision to Claude; Claude recommended Google-only based on ADHD-ship-today profile and that API key rotate + app info are separable concerns. User confirmed.

---

## Claude's Discretion

- Exact Tailwind styling, spacing, badge colors (follow existing dark theme)
- Loading skeletons vs spinners for status fetch
- React Query / SWR vs plain fetch — match other pages
- Error message copy beyond server-returned text
- Whether to show account email (depends on Phase 79 optional discretion item)
- Test structure
- Helper function vs inline `window.location.href` for OAuth redirect

## Deferred Ideas

- Vigil API key management on Settings
- App info / debug section (version, vigil-core URL, clear cache)
- Toast notification library
- Separate /auth/google/callback route in PWA
- Incremental / per-scope authorization (already rejected Phase 79)
