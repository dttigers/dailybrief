# Phase 88: Date Window Helper & Weekly Rollover - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 88-date-window-helper-rollover
**Areas discussed:** Helper API shape, Rollover enforcement, Search + window interaction, Thoughts tab UX

---

## Helper API shape

### Q1 — What shape should the date-window helper expose?
| Option | Description | Selected |
|--------|-------------|----------|
| Two named helpers (Recommended) | `getCurrentWeekWindow` + `getRollingDayWindow`, each returns `{start, end}`. Clear intent; Phase 89 reuses the rolling one. Injectable `now` for tests. | ✓ |
| One generic helper | `getDateWindow({kind, tz, days?, now?})` — one import, loses clarity, needs runtime validation. | |
| Class/module with methods | `DateWindow.currentWeek(tz)` — namespaced but adds ceremony in a plain-function codebase. | |

### Q2 — Return type?
| Option | Description | Selected |
|--------|-------------|----------|
| Date objects (Recommended) | `{start: Date, end: Date}` — feeds Drizzle `gte`/`lte` directly (thoughts.ts:137). | ✓ |
| ISO strings | Easier to log, but every caller would re-parse. | |
| Unix ms numbers | Cheapest comparisons, forces conversion at DB boundary. | |

### Q3 — How is timezone resolved?
| Option | Description | Selected |
|--------|-------------|----------|
| Caller passes tz string (Recommended) | Helper stays pure; route handlers read tz from settings and pass it in. | ✓ |
| Helper reads settings itself | Fewer lines at call sites, but couples utility to DB and complicates tests. | |

**Notes:** All three recommendations taken — signals preference for pure, explicit utility modules.

---

## Rollover enforcement

### Q1 — Where is the 'only this week' filter enforced?
| Option | Description | Selected |
|--------|-------------|----------|
| Server default + opt-out param (Recommended) | `GET /thoughts` defaults to current-week window; clients can override. Single source of truth. | ✓ |
| New dedicated endpoint | `GET /thoughts/current-week` — fragments API and multiplies with each scoping phase. | |
| Client-side filter in PWA | Violates server-authority pattern. | |

### Q2 — Opt-out flag?
| Option | Description | Selected |
|--------|-------------|----------|
| `?window=all` bypasses (Recommended) | Explicit flag; `after`/`before` also bypass (they're explicit scoping). | ✓ |
| Only `after`/`before` bypass | No new param; slightly more verbose for callers that want everything. | |

### Q3 — Audit existing callers?
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, audit + update (Recommended) | Grep PWA/CLI/extension callers; add `window=all` where needed. Prevents silent regressions. | ✓ |
| Default stays 'all', new `?window=week` opts in | Safer but footgun-prone — opposite of SSOT intent. | |

---

## Search + window interaction

### Q1 — How does search bypass the window?
| Option | Description | Selected |
|--------|-------------|----------|
| Any `q=` auto-bypasses (Recommended) | Server-side; PWA SearchBar unchanged. Guarantees ROLLOVER-02. | ✓ |
| PWA passes `window=all` when searching | Splits rollover contract between server + client. | |

### Q2 — Visual distinction for broader search results?
| Option | Description | Selected |
|--------|-------------|----------|
| Subtle header swap when searching (Recommended) | Week label becomes "Search: all time" during search. | ✓ |
| Inline date chips per row | More info per result but noisier. | |
| No visual distinction | Lightest, but scope switch not obvious. | |

---

## Thoughts tab UX

### Q1 — Week label on the Thoughts tab?
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, compact header (Recommended) | "This week · {start} – {end}" above list. Swapped for "Search: all time" while searching. | ✓ |
| No label | Cleaner but may confuse users expecting prior thoughts. | |

### Q2 — View prior weeks without searching?
| Option | Description | Selected |
|--------|-------------|----------|
| No — search only (Recommended) | Search is the escape hatch. Keeps default view fresh. | ✓ |
| "View all thoughts" link | Works against the whole rollover point. | |
| Week picker / prev-week arrow | Scope creep. | |

### Q3 — Empty state on Wed morning?
| Option | Description | Selected |
|--------|-------------|----------|
| Friendly empty message (Recommended) | "No thoughts this week yet — capture one above." + search hint. | ✓ |
| Reuse generic empty state | Less work; misses a teaching moment. | |

### Q4 — TZ change recompute timing?
| Option | Description | Selected |
|--------|-------------|----------|
| Next page load is fine (Recommended) | Matches ROLLOVER-04 wording exactly; avoids cache invalidation complexity. | ✓ |
| Live recompute on tz change | Nicer UX; pulls cross-tab coordination into this phase. | |

---

## Claude's Discretion

- Exact module filename + file layout under `vigil-core/src/utils/`.
- Final copy for the week header, search header swap, and empty state (UI-phase).
- Unit test structure (Wed boundary at tz transitions, DST edges, non-Wed `now` values).
- Whether `GET /thoughts` should emit the computed window in the response envelope for debugging.

## Deferred Ideas

- Week picker / previous-week navigation — future phase if users request.
- Live tz-change cache invalidation — not needed for "next page load" semantics.
