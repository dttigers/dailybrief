---
phase: 90-server-side-persistence
verified: 2026-04-16T15:00:00Z
status: human_needed
score: 5/5
overrides_applied: 0
human_verification:
  - test: "Navigate to Insights, generate results, leave and return -- verify cached results display instantly with Regenerate button and timestamp"
    expected: "Results appear without loading spinner, 'Generated Xm ago' timestamp shows, Regenerate button visible"
    why_human: "Visual rendering, perceived latency, and cache-hit instant display cannot be verified via grep"
  - test: "Click Regenerate on Insights -- verify content clears, spinner shows, fresh results appear"
    expected: "Old content clears immediately, loading spinner visible, new results replace spinner, timestamp updates to 'just now'"
    why_human: "Requires observing UI transition sequence in real time"
  - test: "Navigate to Therapy, generate patterns and prep, leave and return -- verify both sections show cached results with Regenerate buttons"
    expected: "Patterns and Prep both display instantly from cache with timestamps and Regenerate buttons"
    why_human: "Visual rendering of two independent cached sections on same page"
  - test: "Close browser tab entirely, reopen PWA, verify Chat auto-resumes most recent session with prior messages"
    expected: "Chat page loads with most recent session selected and prior messages visible without user interaction"
    why_human: "Requires full browser close/reopen cycle and observing session restoration"
---

# Phase 90: Server-Side Persistence Verification Report

**Phase Goal:** Insights, Therapy patterns, and Therapy session prep persist server-side so revisits are instant; Chat auto-resumes the most recent session when the PWA reopens.
**Verified:** 2026-04-16T15:00:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Opening Insights a second time displays the last generation instantly with a Regenerate button | VERIFIED | useInsights checks GET /insights/cache on mount; InsightsPage renders Regenerate when isCached=true; server GET returns cached JSONB |
| 2 | Opening Therapy patterns a second time displays cached output instantly with a Regenerate button | VERIFIED | useTherapy checks GET /therapy/cache?type=patterns on mount; TherapyPage renders Regenerate when isCachedPatterns=true |
| 3 | Opening Therapy session prep a second time displays cached output instantly with a Regenerate button | VERIFIED | useTherapy checks GET /therapy/cache?type=prep on mount; TherapyPage renders Regenerate when isCachedPrep=true |
| 4 | Clicking Regenerate triggers a fresh AI run and updates the cached result | VERIFIED | regenerate/regeneratePatterns/regeneratePrep clear state (D-05), call POST which upserts to ai_cache via onConflictDoUpdate |
| 5 | Closing and reopening the PWA lands the user in their most recently active Chat session | VERIFIED | useChat useEffect calls getChatSessions then loadSession(res.data[0].id) when sessions exist (D-09) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-core/src/db/schema.ts` | aiCache table definition | VERIFIED | Lines 201-213: pgTable with type, result (jsonb), generatedAt, updatedAt, uniqueIndex on type |
| `vigil-core/drizzle/0010_add_ai_cache.sql` | Migration SQL | VERIFIED | CREATE TABLE + CREATE UNIQUE INDEX present |
| `vigil-core/drizzle/meta/_journal.json` | Journal entry for 0010 | VERIFIED | tag "0010_add_ai_cache" found at line 79 |
| `vigil-core/src/routes/insights.ts` | GET /insights/cache + cache write in POST | VERIFIED | GET endpoint at line 11, upsert with onConflictDoUpdate at line 133, aiCache imported from schema |
| `vigil-core/src/routes/therapy.ts` | GET /therapy/cache + cache write in POST | VERIFIED | GET endpoint at line 18, type validation at line 22, two onConflictDoUpdate calls (patterns line 205, prep line 315) |
| `vigil-pwa/src/api/client.ts` | Cache fetch functions | VERIFIED | getInsightsCache (line 275), getTherapyPatternsCache (line 392), getTherapyPrepCache (line 399) |
| `vigil-pwa/src/hooks/useInsights.ts` | Cache-first hook with regenerate | VERIFIED | isCached, generatedAt, regenerate all present; getInsightsCache called on mount; setInsights([]) in regenerate (D-05) |
| `vigil-pwa/src/hooks/useTherapy.ts` | Cache-first hook with regenerate for patterns/prep | VERIFIED | isCachedPatterns, isCachedPrep, regeneratePatterns, regeneratePrep all present; both cache checks on mount |
| `vigil-pwa/src/hooks/useChat.ts` | Auto-resume most recent session | VERIFIED | loadSession(res.data[0].id) after getChatSessions with length > 0 guard (D-09) |
| `vigil-pwa/src/utils/formatRelativeTime.ts` | Relative timestamp utility | VERIFIED | Returns "just now", "Nm ago", "Nh ago", "Nd ago" |
| `vigil-pwa/src/pages/InsightsPage.tsx` | Regenerate button + timestamp | VERIFIED | Imports formatRelativeTime, destructures isCached/generatedAt/regenerate, conditional render |
| `vigil-pwa/src/pages/TherapyPage.tsx` | Regenerate for patterns + prep | VERIFIED | Imports formatRelativeTime, destructures all cache/regenerate fields, conditional headers for both sections |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| insights.ts (route) | schema.ts | import aiCache | WIRED | Line 5: `import { ..., aiCache } from "../db/schema.js"` |
| therapy.ts (route) | schema.ts | import aiCache | WIRED | Line 10: `import { ..., aiCache } from "../db/schema.js"` |
| useInsights.ts | client.ts | import getInsightsCache | WIRED | Line 2: `import { ..., getInsightsCache, ... } from '../api/client'` |
| useTherapy.ts | client.ts | import getTherapyPatternsCache/PrepCache | WIRED | Lines 5-6: both cache functions imported |
| InsightsPage.tsx | useInsights.ts | destructure isCached, generatedAt, regenerate | WIRED | Line 13: full destructure confirmed |
| TherapyPage.tsx | useTherapy.ts | destructure regeneratePatterns, etc | WIRED | Lines 23-31: all cache/regenerate fields destructured |
| InsightsPage.tsx | formatRelativeTime.ts | import | WIRED | Line 2 |
| TherapyPage.tsx | formatRelativeTime.ts | import | WIRED | Line 2 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| useInsights.ts | insights | getInsightsCache() -> GET /insights/cache -> db.select().from(aiCache) | DB query with JSONB result | FLOWING |
| useTherapy.ts | patterns | getTherapyPatternsCache() -> GET /therapy/cache?type=patterns -> db.select().from(aiCache) | DB query with JSONB result | FLOWING |
| useTherapy.ts | prep | getTherapyPrepCache() -> GET /therapy/cache?type=prep -> db.select().from(aiCache) | DB query with JSONB result | FLOWING |
| useChat.ts | messages | loadSession(id) -> getChatSession(id) -> existing DB query | DB query (pre-existing) | FLOWING |
| InsightsPage.tsx | insights | useInsights() hook | Rendered in JSX card list | FLOWING |
| TherapyPage.tsx | patterns, prep | useTherapy() hook | Rendered in JSX sections | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED (requires running server with database connection to test API endpoints; no runnable entry points without external services)

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PERSIST-01 | 90-01, 90-02, 90-03 | Insights results persist server-side; revisits show last generation instantly with Regenerate button | SATISFIED | ai_cache table + GET /insights/cache + useInsights cache-first + InsightsPage Regenerate UI |
| PERSIST-02 | 90-01, 90-02, 90-03 | Therapy patterns persist server-side with explicit regenerate | SATISFIED | ai_cache upsert in POST /therapy/patterns + GET /therapy/cache?type=patterns + useTherapy + TherapyPage Regenerate |
| PERSIST-03 | 90-01, 90-02, 90-03 | Therapy session prep persists server-side with explicit regenerate | SATISFIED | ai_cache upsert in POST /therapy/prep + GET /therapy/cache?type=prep + useTherapy + TherapyPage Regenerate |
| PERSIST-04 | 90-02, 90-03 | Chat auto-resumes most recently active session when PWA reopened | SATISFIED | useChat auto-loads sessions[0] on mount via loadSession(res.data[0].id) |

No orphaned requirements. All 4 PERSIST requirements are claimed by plans and have implementation evidence.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | - | - | - | - |

No TODO, FIXME, placeholder, or stub patterns found in any phase-modified files.

### Human Verification Required

### 1. Insights Cache Display + Regenerate

**Test:** Navigate to Insights, generate results, leave the page and return. Verify cached results display instantly with "Generated Xm ago" timestamp and a gray Regenerate button. Click Regenerate and confirm content clears, spinner shows, then fresh results appear with updated timestamp.
**Expected:** Instant cached display on revisit; Regenerate clears and refreshes; timestamp updates to "just now".
**Why human:** Visual rendering speed, transition animation, and perceived latency require real browser observation.

### 2. Therapy Patterns + Prep Cache Display + Regenerate

**Test:** Navigate to Therapy, generate patterns and prep, leave and return. Verify both sections show cached results with timestamps and Regenerate buttons. Click Regenerate on each section independently.
**Expected:** Both sections independently cache and regenerate. Each has its own timestamp.
**Why human:** Two independent cache sections on one page require visual verification of correct state isolation.

### 3. Chat Auto-Resume

**Test:** Go to Chat, send a message, close the browser tab entirely, reopen the PWA. Verify Chat loads the most recent session with prior messages visible without user interaction.
**Expected:** Most recent Chat session auto-loads with all prior messages visible. "New Chat" button still available.
**Why human:** Requires full browser close/reopen cycle; session restoration behavior depends on browser state.

### 4. First Visit (No Cache) Behavior

**Test:** Clear ai_cache table or use a fresh browser. Navigate to Insights -- should auto-generate. Navigate to Therapy -- should show Generate buttons (not Regenerate).
**Expected:** Insights auto-generates on first visit; Therapy waits for user click.
**Why human:** Requires clean state setup and observing first-visit vs revisit behavior difference.

### Gaps Summary

No code-level gaps found. All artifacts exist, are substantive, are wired end-to-end, and data flows from database through API to UI components. The full persistence pipeline (DB schema -> API endpoints -> PWA client functions -> React hooks -> page components) is connected at every level.

Human verification is required to confirm the visual/behavioral experience matches expectations (instant cache display, Regenerate UX, Chat auto-resume on browser reopen).

---

_Verified: 2026-04-16T15:00:00Z_
_Verifier: Claude (gsd-verifier)_
