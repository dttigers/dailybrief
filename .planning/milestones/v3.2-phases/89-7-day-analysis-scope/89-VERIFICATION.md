---
phase: 89-7-day-analysis-scope
verified: 2026-04-16T00:00:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Phase 89: 7-Day Analysis Scope Verification Report

**Phase Goal:** Insights, Therapy pattern recognition, and Therapy session prep all analyze only the last 7 days of thoughts, using the Phase 88 window helper.
**Verified:** 2026-04-16
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST /insights queries only the last 7 days of thoughts from DB, not client-sent data | VERIFIED | insights.ts line 28: `getRollingDayWindow(tz, 7)`; lines 36-41: DB query with gte/lt bounds; no body parsing |
| 2 | POST /therapy/patterns queries only therapy-classified thoughts from the last 7 days | VERIFIED | therapy.ts line 113: `getRollingDayWindow(tz, 7)`; line 119: `isNotNull(thoughtsTable.therapyClassification)` |
| 3 | POST /therapy/prep queries only bringToTherapist thoughts from the last 7 days | VERIFIED | therapy.ts line 212: `getRollingDayWindow(tz, 7)`; line 218: `eq(thoughtsTable.therapyClassification, "bringToTherapist")` |
| 4 | All three endpoints use getRollingDayWindow(tz, 7) for window bounds | VERIFIED | insights.ts: 1 call; therapy.ts: 2 calls (patterns + prep); both import from `../utils/date-window.js` |
| 5 | Insufficient data returns 400 with count and friendly message | VERIFIED | insights.ts line 43-48: `rows.length < 3` with count; therapy.ts line 129-134: `rows.length < 5`; therapy.ts line 228-233: `rows.length < 1` |
| 6 | PWA hooks no longer fetch thoughts before calling AI endpoints | VERIFIED | useInsights.ts: no `getThoughts` import; useTherapy.ts: no `getThoughts` import; both call endpoints directly |
| 7 | API client functions send no thoughts in request body | VERIFIED | client.ts lines 261-270: `generateInsights()` — no params, no body; lines 360-369: `getTherapyPatterns()` — no params; lines 371-380: `generateTherapyPrep()` — no params |
| 8 | Insights page shows "Analyzing last 7 days" subheading | VERIFIED | InsightsPage.tsx line 20: `<p className="text-xs text-gray-400 mt-0.5">Analyzing last 7 days</p>` |
| 9 | Therapy page shows "Analyzing last 7 days" subheading under both sections | VERIFIED | TherapyPage.tsx line 45 (Patterns) and line 112 (Session Prep): both have the subheading |

**Score:** 9/9 truths verified

### Roadmap Success Criteria

| # | Success Criterion | Status | Evidence |
|---|------------------|--------|----------|
| 1 | Insights returns patterns/connections derived only from last 7 days (verified via query scope) | VERIFIED | `getRollingDayWindow(tz, 7)` + `gte(createdAt, start)` + `lt(createdAt, end)` with `.limit(200)`; no client body path |
| 2 | Therapy pattern recognition no longer surfaces themes from thoughts older than 7 days | VERIFIED | same window bounds + `isNotNull(therapyClassification)` filter; client no longer sends thoughts |
| 3 | Therapy session prep output only references thoughts from the last 7 days | VERIFIED | same window bounds + `eq(therapyClassification, "bringToTherapist")` filter |
| 4 | All three endpoints share the same date-window helper (no duplicated window math) | VERIFIED | Both files import `getRollingDayWindow` from `../utils/date-window.js`; no inline date arithmetic |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-core/src/routes/insights.ts` | Server-side 7-day scoped insights generation | VERIFIED | 116 lines; DB query, window bounds, 400 guard, callClaude wired |
| `vigil-core/src/routes/therapy.ts` | Server-side 7-day scoped therapy patterns and prep | VERIFIED | 283 lines; two handlers with window query, classify handler untouched |
| `vigil-pwa/src/api/client.ts` | Simplified API functions with no thought params | VERIFIED | All three functions zero-arity, extract `body.error` from non-ok responses |
| `vigil-pwa/src/hooks/useInsights.ts` | Simplified hook — no getThoughts, no days param | VERIFIED | 29 lines; calls `apiGenerateInsights()` directly |
| `vigil-pwa/src/hooks/useTherapy.ts` | Simplified hook — no getThoughts, no client filtering | VERIFIED | 61 lines; `analyzePatterns()` and `generatePrep()` call endpoints directly |
| `vigil-pwa/src/pages/InsightsPage.tsx` | 7-day scope indicator subheading | VERIFIED | Line 20 contains `Analyzing last 7 days` |
| `vigil-pwa/src/pages/TherapyPage.tsx` | 7-day scope indicator subheading (both sections) | VERIFIED | Lines 45 and 112 contain `Analyzing last 7 days` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `vigil-core/src/routes/insights.ts` | `vigil-core/src/utils/date-window.ts` | `import getRollingDayWindow` | WIRED | Import line 7; called on line 28 with `(tz, 7)` |
| `vigil-core/src/routes/therapy.ts` | `vigil-core/src/utils/date-window.ts` | `import getRollingDayWindow` | WIRED | Import line 13; called on lines 113 and 212 |
| `vigil-core/src/routes/insights.ts` | `vigil-core/src/db/connection.ts` | `import { db }` | WIRED | Import line 4; guarded at line 17; used in query lines 36-41 |
| `vigil-pwa/src/hooks/useInsights.ts` | `vigil-pwa/src/api/client.ts` | `import generateInsights` | WIRED | Import line 2; called as `apiGenerateInsights()` on line 19 |
| `vigil-pwa/src/hooks/useTherapy.ts` | `vigil-pwa/src/api/client.ts` | `import getTherapyPatterns, generateTherapyPrep` | WIRED | Import lines 3-7; called as `apiGetTherapyPatterns()` line 29, `apiGenerateTherapyPrep()` line 43 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `vigil-core/src/routes/insights.ts` | `rows` | DB query via Drizzle `select().from(thoughtsTable).where(and(...conditions)).limit(200)` | Yes — live DB query with date bounds | FLOWING |
| `vigil-core/src/routes/therapy.ts` (patterns) | `rows` | DB query with `isNotNull(therapyClassification)` filter | Yes — live DB query | FLOWING |
| `vigil-core/src/routes/therapy.ts` (prep) | `rows` | DB query with `eq(therapyClassification, "bringToTherapist")` filter | Yes — live DB query | FLOWING |
| `vigil-pwa/src/pages/InsightsPage.tsx` | `insights` (from `useInsights`) | `apiGenerateInsights()` → server DB query | Yes — server-side data flows to hook state | FLOWING |
| `vigil-pwa/src/pages/TherapyPage.tsx` | `patterns`, `prep` (from `useTherapy`) | `apiGetTherapyPatterns()`, `apiGenerateTherapyPrep()` → server DB queries | Yes — server-side data flows to hook state | FLOWING |

Note: `patternSection = ""` in therapy/prep is intentional — documented in SUMMARY as Phase 90 scope (server-side persistence will restore richer context). This is not a data disconnection; the prompt still works with thoughts alone.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| vigil-core TypeScript compiles clean | `npx tsc --noEmit` in vigil-core | No output (exit 0) | PASS |
| vigil-pwa TypeScript compiles with no new errors | `npx tsc --noEmit -p tsconfig.app.json` in vigil-pwa | 4 pre-existing errors in unrelated files (ImportMeta.env x2, index.css, BriefHistoryPage) — no errors in phase 89 files | PASS |
| insights.ts contains getRollingDayWindow once | `grep -c getRollingDayWindow insights.ts` | 2 (import + call) | PASS |
| therapy.ts contains getRollingDayWindow twice (patterns + prep) | `grep -c getRollingDayWindow therapy.ts` | 3 (import + 2 calls) | PASS |
| No getThoughts in useInsights.ts | `grep -c getThoughts useInsights.ts` | 0 | PASS |
| No getThoughts in useTherapy.ts | `grep -c getThoughts useTherapy.ts` | 0 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SCOPE-01 | 89-01, 89-02 | Insights generation only considers thoughts from the last 7 days | SATISFIED | insights.ts uses getRollingDayWindow(tz, 7); client sends no thoughts |
| SCOPE-02 | 89-01, 89-02 | Therapy pattern recognition only considers thoughts from the last 7 days | SATISFIED | therapy.ts patterns handler uses getRollingDayWindow(tz, 7) + isNotNull filter |
| SCOPE-03 | 89-01, 89-02 | Therapy session prep only considers thoughts from the last 7 days | SATISFIED | therapy.ts prep handler uses getRollingDayWindow(tz, 7) + bringToTherapist filter |

No orphaned requirements for Phase 89 — REQUIREMENTS.md traceability table maps only SCOPE-01/02/03 to Phase 89, all three are satisfied.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `vigil-core/src/routes/therapy.ts` line 239 | `patternSection = ""` | Info | Intentional — documented decision in SUMMARY as placeholder for Phase 90 persistence. Prompt still functions correctly with thoughts alone. Not a stub that blocks goal. |

No TODOs, FIXMEs, banned `c.get('db')` patterns, `body.thoughts` references, or removed interface remnants found in any modified file.

### Human Verification Required

None. All must-haves are fully verifiable from the code structure and TypeScript compilation.

---

_Verified: 2026-04-16T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
