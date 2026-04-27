# Phase 115: Calendar source picker (+ ThoughtRow whitespace polish) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 115-calendar-source-picker-thoughtrow-polish
**Areas discussed:** Write endpoint shape, Settings UI placement & save UX, Empty / re-auth / error states, ThoughtRow polish scope

---

## Write endpoint shape

### Path naming reconciliation
| Option | Description | Selected |
|--------|-------------|----------|
| Keep /list, amend ROADMAP | Leave GET /v1/calendar/list; add new write at PUT /v1/calendar/selections; update ROADMAP SC#1 wording | ✓ |
| Rename to /calendars + alias | Add GET/PUT /v1/calendar/calendars as canonical, /list as deprecated alias | |
| Use one path for read+write | GET and PUT both at /v1/calendar/list (or /calendars), different shapes | |

**User's choice:** Keep /list, amend ROADMAP (Recommended)
**Notes:** Zero churn on shipped code; new write endpoint at PUT /v1/calendar/selections.

### Verb + body shape
| Option | Description | Selected |
|--------|-------------|----------|
| PUT replaces full array | PUT { selectedCalendarIds: string[] } overwrites server state; idempotent | ✓ |
| PATCH toggle one | PATCH { calendarId, selected: bool }; smaller payloads, more roundtrips | |
| PUT array only | Raw JSON array body (no envelope) | |

**User's choice:** PUT replaces full array (Recommended)
**Notes:** Matches the UI mental model — submit your full picked set.

### Validation against Google calendar list
| Option | Description | Selected |
|--------|-------------|----------|
| Accept any string | Trust the PWA; stale IDs naturally yield zero events | ✓ |
| Validate against /calendarList on save | Server fetches Google to reject unknown IDs; adds API roundtrip + failure mode | |
| Filter unknown silently | Server fetches and persists only the intersection | |

**User's choice:** Accept any string (Recommended)
**Notes:** No extra Google API call on save; matches existing 'empty = all' fallback semantics.

### Selection cap
| Option | Description | Selected |
|--------|-------------|----------|
| No cap | Whatever Google returns, the user can pick | ✓ |
| Cap at 50 | Defensive safety rail | |

**User's choice:** No cap (Recommended)

---

## Settings UI placement & save UX

### Placement
| Option | Description | Selected |
|--------|-------------|----------|
| Inside Google Account card | Calendars subsection beneath ScopeRow rows; visually nested with the connection it depends on | ✓ |
| New top-level Settings card | Separate card; more prominent but disconnected from Google connection | |
| Behind 'Configure' button + modal | Compact button + dialog; keeps Settings short | |

**User's choice:** Inside Google Account card (Recommended)

### List shape
| Option | Description | Selected |
|--------|-------------|----------|
| Checkbox + color swatch + PRIMARY badge | Reuses item.color and item.primary already returned by GET /v1/calendar/list | ✓ |
| Toggle switches, no swatch | Simpler; less information density | |
| Multi-select dropdown | Compact, two clicks per change | |

**User's choice:** Checkbox per row + color swatch + primary marker (Recommended)

### Save UX on toggle
| Option | Description | Selected |
|--------|-------------|----------|
| Auto-save per toggle, debounced | ~400ms debounce; optimistic UI; rollback + toast on failure | ✓ |
| Explicit Save button | Local state only until user clicks Save | |
| Auto-save immediately | Every click fires PUT; no debounce | |

**User's choice:** Auto-save per toggle, debounced (Recommended)

### Initial fetch timing
| Option | Description | Selected |
|--------|-------------|----------|
| On Settings page mount | Fetch alongside existing /v1/me + /v1/auth/me calls | ✓ |
| On first interaction with the section | Lazy: only when user expands the calendars section | |
| On Settings mount + cache for session | Fetch once, cache, refresh on explicit reload | |

**User's choice:** On Settings page mount (Recommended)

---

## Empty / re-auth / error states

### Empty selection semantics
| Option | Description | Selected |
|--------|-------------|----------|
| Empty = all calendars | Preserves current calendar-service.ts:262 behavior and ROADMAP SC#3 | ✓ |
| Require ≥1, block save at zero | Cleaner mental model but contradicts ROADMAP | |
| Empty = no calendars (no events) | Strict literal; risk of accidentally empty briefs | |

**User's choice:** Empty = all calendars (Recommended)
**Notes:** UI must clearly communicate this so users don't get surprised.

### needs_reauth render
| Option | Description | Selected |
|--------|-------------|----------|
| Hide picker, defer to ScopeRow | ScopeRow Calendar already shows reconnect prompt; no duplicate UI | ✓ |
| Show picker + inline reconnect banner | Two reconnect affordances; more discoverable | |
| Show last-known list (cached) + warning | Most informative, most code | |

**User's choice:** Hide picker, defer to ScopeRow (Recommended)

### error render
| Option | Description | Selected |
|--------|-------------|----------|
| Inline error + Retry button | Show 'Couldn't load calendars — Retry' inside the section | ✓ |
| Show last-known + error toast only | Display saved IDs as plain text + toast | |
| Hide section entirely on error | Same as needs_reauth; lowest cognitive load but no visibility | |

**User's choice:** Inline error + Retry button (Recommended)

### Save failure handling
| Option | Description | Selected |
|--------|-------------|----------|
| Rollback UI + error toast | Revert to last-known-good; toast says 'Couldn't save calendar selection — try again' | ✓ |
| Keep UI state, inline 'Unsaved' badge + manual retry | Preserves user intent; more UI state to manage | |
| Silent retry once, then rollback + toast | Auto-retry once on transient failures | |

**User's choice:** Rollback UI + error toast (Recommended)

---

## ThoughtRow polish scope

### CSS change at line 399
| Option | Description | Selected |
|--------|-------------|----------|
| Add whitespace-pre-line, keep line-clamp-3 | Minimal blast radius; multi-line shows breaks within 3-line truncation | ✓ |
| Add whitespace-pre-line, raise to line-clamp-4 | Extra row of visible content for newline-heavy captures | |
| Add whitespace-pre-line, drop line-clamp entirely | Most readable; breaks dense scan UX of long lists | |

**User's choice:** Add whitespace-pre-line, keep line-clamp-3 (Recommended)

### Edit-mode parity
| Option | Description | Selected |
|--------|-------------|----------|
| Leave edit-mode alone | textarea preserves \n natively; no change needed | ✓ |
| Audit edit-mode className while we're here | Adds scope; cheap to bundle | |

**User's choice:** Leave edit-mode alone (Recommended)

### Test coverage
| Option | Description | Selected |
|--------|-------------|----------|
| Add one snapshot/render test | Locks in POLISH-01 against future className refactors | ✓ |
| Skip test — one-line CSS fix | Faster ship, no regression guard | |
| Add a visual/UAT step instead | Manual verification documented in phase verification | |

**User's choice:** Add one snapshot/render test (Recommended)

### Sequencing with calendar work
| Option | Description | Selected |
|--------|-------------|----------|
| Separate plan, runs in parallel | Independent files, can ship even if calendar work hits a snag | ✓ |
| Folded into the PWA calendar plan | Single plan; couples unrelated work | |
| Standalone hotfix-style commit before calendar work | Same separation, sequenced first | |

**User's choice:** Separate plan, runs in parallel (Recommended)

---

## Claude's Discretion

- Exact name of PWA helper function in api/client.ts (suggested: `setCalendarSelections`).
- Exact debounce implementation (existing util vs inline `setTimeout` vs hook).
- Toast styling — reuse existing ToastHost API.
- Helper copy wording for the empty-selection note.
- Loading skeleton vs spinner during initial fetch.
- Whether to show a calendar count summary in the section header.

## Deferred Ideas

- Telemetry/PostHog events for picker interactions (calendar_selection_changed, calendar_picker_loaded) — not required by CAL-01 SCs.
- OpenAPI / API-contract doc update for the new PUT endpoint.
- Editing-mode textarea polish for ThoughtRow — no current bug.
- Sports source picker — Phase 116.
- Per-event filtering (e.g., decline declined events).
- Display preferences for calendar events in the brief.
