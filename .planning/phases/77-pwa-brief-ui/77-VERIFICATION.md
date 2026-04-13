---
phase: 77-pwa-brief-ui
verified: 2026-04-13T18:45:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Tap Generate Today's Brief on an iOS device — confirm the spinner appears and the PDF renders inline after generation"
    expected: "Spinner shows for several seconds, then a PDF iframe appears in-page with a Download PDF button below it"
    why_human: "iOS Safari has restrictions on blob URL iframe rendering and anchor download attributes — cannot verify programmatically"
  - test: "Tap Download PDF on iOS Safari after a brief is generated"
    expected: "PDF file is saved to Files or offered as a share sheet — file named vigil-brief-YYYY-MM-DD.pdf"
    why_human: "iOS ignores the HTML download attribute on anchor tags; download must be verified manually on device"
  - test: "Open the PWA on a date where today's brief already exists — verify the PDF preview loads automatically without pressing Generate"
    expected: "On page load the iframe appears immediately showing the existing PDF, and a Regenerate Brief button is visible"
    why_human: "Auto-load useEffect depends on API response timing; requires a real brief record in the database to test"
---

# Phase 77: PWA Brief UI Verification Report

**Phase Goal:** Users can generate, preview, and download their daily brief from the PWA without touching the Mac
**Verified:** 2026-04-13T18:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can click Generate Today's Brief and see a spinner while the PDF is being created | VERIFIED | BriefHistoryPage.tsx lines 165-181: spinner SVG + "Generating your brief..." shown during `generateState === 'generating'`; button disabled at line 218 |
| 2 | After generation, the PDF renders inline in an iframe on the page | VERIFIED | BriefHistoryPage.tsx lines 190-213: `<iframe src={todayBlobUrl}>` rendered when `generateState === 'done'` and blob URL present |
| 3 | User can download the PDF with filename vigil-brief-YYYY-MM-DD.pdf | VERIFIED | BriefHistoryPage.tsx line 200: `download={\`vigil-brief-${todayStr}.pdf\`}` on anchor tag |
| 4 | If today's brief already exists, the page shows the PDF preview immediately with a Regenerate button | VERIFIED | Lines 34-44: `useEffect` auto-loads via `getBriefPdf(todayStr)` when `todayBriefExists && !todayBlobUrl && generateState === 'idle'`; lines 205-212: Regenerate Brief button shown alongside iframe |
| 5 | User can click a past brief in the history list and see its PDF in an iframe | VERIFIED | `handleSelectBrief()` at lines 74-89 calls `getBriefPdf(date)` and sets `detailBlobUrl`; detail view iframe at lines 126-131 |
| 6 | The Layout tab reads Briefs instead of History | VERIFIED | Layout.tsx line 16: `{ label: 'Briefs', to: '/history' }` — "History" label is gone |

**Score:** 6/6 truths verified

### Roadmap Success Criteria

| # | Success Criterion | Status | Evidence |
|---|------------------|--------|----------|
| 1 | The PWA has a "Generate Brief" button that calls `/v1/brief/generate` and shows a loading state while it runs | VERIFIED | client.ts line 308: `vigilFetch('/v1/brief/generate', { method: 'POST', ... })`; spinner state in BriefHistoryPage |
| 2 | After generation, the PDF renders inline in the PWA so the user can read it without downloading | VERIFIED | iframe rendered with blob URL after generate completes |
| 3 | A download button saves the PDF to the user's device with a sensible filename | VERIFIED | `<a href={todayBlobUrl} download={\`vigil-brief-${todayStr}.pdf\`}>Download PDF</a>` |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-pwa/src/api/client.ts` | generateBrief() and getBriefPdf() binary fetch functions | VERIFIED | Lines 307-325: both functions present, use `headers: { 'Content-Type': '' }` override and `res.blob()` |
| `vigil-pwa/src/components/Layout.tsx` | Renamed tab label "Briefs" | VERIFIED | Line 16: `{ label: 'Briefs', to: '/history' }` — no "History" label present |
| `vigil-pwa/src/pages/BriefHistoryPage.tsx` | Generate + preview + download UI (min 100 lines) | VERIFIED | 276 lines; full generate state machine, iframe blob URL approach, download anchor, regenerate button |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| BriefHistoryPage.tsx | /v1/brief/generate | generateBrief() from client.ts | WIRED | Line 3: `import { generateBrief, ... } from '../api/client'`; line 63: `await generateBrief()` in handleGenerate |
| BriefHistoryPage.tsx | /v1/brief/:date | getBriefPdf() from client.ts | WIRED | Line 3: imported; line 36: auto-load useEffect; line 80: handleSelectBrief |
| BriefHistoryPage.tsx | iframe | URL.createObjectURL(blob) | WIRED | Lines 37, 65, 82: `URL.createObjectURL(blob)` used to create blob URLs for iframe src |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| BriefHistoryPage.tsx | `todayBlobUrl` | `generateBrief()` → `vigilFetch('/v1/brief/generate')` → `res.blob()` | Yes — API call returns binary PDF from server | FLOWING |
| BriefHistoryPage.tsx | `todayBlobUrl` (auto-load) | `getBriefPdf(todayStr)` → `vigilFetch('/v1/brief/${date}')` → `res.blob()` | Yes — retrieves stored PDF binary | FLOWING |
| BriefHistoryPage.tsx | `detailBlobUrl` | `getBriefPdf(date)` → `res.blob()` | Yes — retrieves stored PDF binary | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — BriefHistoryPage requires a running PWA and API server with brief records. Cannot test generate/preview/download flows programmatically without those services. Build verification (`npm run build`) substitutes as compilation proof.

**Build result:** `npm run build` exits 0 — 56 modules transformed, 299KB JS bundle, PWA service worker generated.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PWA-01 | 77-01-PLAN.md | User can generate a daily brief from the PWA via a generate button | SATISFIED | `handleGenerate()` calls `generateBrief()` which POSTs to `/v1/brief/generate`; generate button present |
| PWA-02 | 77-01-PLAN.md | User can preview the generated PDF inline in the PWA | SATISFIED | iframe with blob URL shown after generation and for past briefs |
| PWA-03 | 77-01-PLAN.md | User can download the generated PDF from the PWA | SATISFIED | `<a download=...>Download PDF</a>` anchor present in both today and detail views |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | — |

No TODOs, FIXMEs, placeholder text, stub returns, or `renderSummary` remnants found. `renderSummary` was correctly removed per plan spec.

### Human Verification Required

#### 1. iOS Inline PDF Rendering

**Test:** On an iPhone or iPad, open the PWA, navigate to Briefs, and tap "Generate Today's Brief". Wait for generation to complete.
**Expected:** A loading spinner appears during generation. After completion, a PDF renders inline in an iframe on the page — readable without downloading.
**Why human:** iOS Safari has known restrictions on rendering blob URLs in iframes. The code is correctly structured (blob URL → iframe src) but the browser behavior on iOS must be confirmed on device.

#### 2. iOS PDF Download

**Test:** After a brief is shown in the PWA on iOS Safari, tap "Download PDF".
**Expected:** The file is saved to the device with filename `vigil-brief-YYYY-MM-DD.pdf` (e.g., `vigil-brief-2026-04-13.pdf`).
**Why human:** iOS ignores the HTML `download` attribute on anchor tags — the file either opens in Safari or triggers a share sheet. The behavior and filename must be verified manually.

#### 3. Auto-load of Existing Today Brief

**Test:** On a day where a brief has already been generated, open the PWA Briefs page fresh (no prior session state). Verify the PDF appears without pressing Generate.
**Expected:** The iframe with today's PDF is visible immediately (after the briefs list loads), with a Regenerate Brief button — no Generate button shown.
**Why human:** The auto-load `useEffect` depends on the API returning today's brief in the list; requires a real database record to test the full path.

### Gaps Summary

No gaps. All 6 must-have truths are verified in the codebase. The three items above require human testing on a real device with a live backend — they cannot be verified by static analysis.

---

_Verified: 2026-04-13T18:45:00Z_
_Verifier: Claude (gsd-verifier)_
