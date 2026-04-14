# Phase 77: PWA Brief UI - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can generate, preview, and download their daily brief PDF from the PWA without touching the Mac. The existing BriefHistoryPage is enhanced into a unified "Briefs" page with generate/preview at top and past briefs below.

</domain>

<decisions>
## Implementation Decisions

### Page Placement
- **D-01:** Enhance the existing `BriefHistoryPage` — add generate button + PDF preview to the top, past briefs list below. No new page or route needed.
- **D-02:** Rename the Layout tab from "History" to "Briefs" to reflect expanded scope. Update the route label in `Layout.tsx` TABS array.

### Generate UX Flow
- **D-03:** Manual generate button — show a prominent "Generate Today's Brief" button when no brief exists for today. No auto-generation on page load.
- **D-04:** Loading state is a spinner with "Generating your brief..." status text. Consistent with existing PWA loading patterns.
- **D-05:** If today's brief already exists (detected via `GET /v1/brief/:date` or the briefs list), show the PDF preview immediately with a smaller "Regenerate" button. Phase 76 API already overwrites on same-day regeneration.
- **D-06:** On generation error, show an inline error message (red banner) with retry option. Follow existing error patterns in BriefHistoryPage.

### PDF Preview Approach
- **D-07:** Use iframe with blob URL — fetch the PDF binary, create a `URL.createObjectURL(blob)`, embed in an `<iframe>`. Browser's native PDF viewer handles rendering. Zero additional dependencies.
- **D-08:** Past briefs also get PDF preview — clicking a past brief in the history list fetches its PDF via `GET /v1/brief/:date` and shows it in the same iframe approach. Consistent experience across today's and past briefs.
- **D-09:** The `vigilFetch` call for PDF endpoints must override the `Content-Type: application/json` default header and handle binary responses (use `res.blob()` instead of `res.json()`).

### Download & Sharing
- **D-10:** Download button creates an anchor element with the blob URL and `download` attribute. Filename format: `vigil-brief-YYYY-MM-DD.pdf` (e.g., `vigil-brief-2026-04-13.pdf`).
- **D-11:** Download only — no share button, no print button. Print-from-browser is available natively through the iframe's PDF viewer controls.

### Claude's Discretion
- iframe height/sizing approach (fixed height vs responsive)
- Whether to check for today's brief existence on page load via the briefs list or a dedicated HEAD request
- Error retry UX details (auto-retry vs manual button)
- Memory cleanup for blob URLs (revoke on unmount)
- Mobile fallback if iframe PDF rendering is unsupported on a specific browser

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 76 API Contract
- `vigil-core/src/routes/brief.ts` — `POST /v1/brief/generate` (returns PDF binary, `application/pdf`), `GET /v1/brief/:date` (returns stored PDF binary by date). These are the two endpoints this phase consumes.
- `.planning/phases/76-brief-assembly-endpoint/76-CONTEXT.md` — D-08 (no request body), D-09 (PDF binary response), D-10 (GET by date), D-11 (bearer auth)

### Existing PWA Code
- `vigil-pwa/src/pages/BriefHistoryPage.tsx` — Current history page to enhance. Has list/detail view pattern, skeleton loading, error handling.
- `vigil-pwa/src/hooks/useBriefs.ts` — Existing hook fetching brief metadata list. May need extension for PDF fetching.
- `vigil-pwa/src/api/client.ts` — `vigilFetch` helper, `getBriefs()`, `getBriefByDate()`. Needs PDF-specific fetch function (binary response, no JSON content-type).
- `vigil-pwa/src/components/Layout.tsx` — TABS array to rename "History" to "Briefs".
- `vigil-pwa/src/App.tsx` — Route definitions (no changes needed, `/history` route stays).

### Requirements
- `.planning/REQUIREMENTS.md` — PWA-01 (generate button), PWA-02 (inline PDF preview), PWA-03 (download PDF)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BriefHistoryPage` — already has list view with click-to-detail pattern, skeleton loading, error banners, back navigation. Enhance rather than rewrite.
- `useBriefs` hook — fetches brief metadata list on mount. Can check if today's brief exists from this list.
- `vigilFetch` — bearer auth wrapper for all API calls. Needs a variant or option for binary (blob) responses.
- `getBriefByDate(date)` — exists but returns JSON metadata. Need a new `getBriefPdf(date)` that fetches the PDF binary.

### Established Patterns
- Pages use `useState` for local state, custom hooks for data fetching with loading/error states
- Dark Tailwind theme: `bg-slate-950`, `text-slate-100`, `border-slate-800`, `bg-slate-900/50`
- Error display: `bg-red-900/50 text-red-300 px-4 py-3 rounded-lg text-sm`
- Loading: skeleton pulse animations (`animate-pulse`, `bg-slate-700 rounded`)
- No state management library — plain React state throughout

### Integration Points
- `Layout.tsx` TABS array — rename label from "History" to "Briefs"
- `client.ts` — add `generateBrief()` (POST, binary response) and `getBriefPdf(date)` (GET, binary response) functions
- `BriefHistoryPage.tsx` — primary file to enhance with generate/preview/download UI

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The page is a straightforward enhancement of the existing BriefHistoryPage with three new capabilities: generate trigger, iframe PDF preview, and download button.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 77-pwa-brief-ui*
*Context gathered: 2026-04-13*
