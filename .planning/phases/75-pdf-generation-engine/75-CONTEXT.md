# Phase 75: PDF Generation Engine - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Server-side PDF rendering engine that produces a 3-page daily brief using PDFKit in Node.js. The engine accepts a lean data type, renders pages following the Vigil brand guidelines (Inter font, teal palette, warm neutrals), and outputs a PDF binary sized for glue-in notebook use. Deployable on Railway without system dependencies.

</domain>

<decisions>
## Implementation Decisions

### Brand & Visual Style
- **D-01:** Full Vigil brand adoption for PDF output. Use Inter font (400 Regular for body, 500 Medium for headings), Vigil Teal palette for accents/headings/dividers, warm Gray 900 (#2C2C2A) for body text, status accent colors (Blue/Amber/Green) for work order priorities and status indicators.
- **D-02:** The existing Swift PDF renderer uses grayscale with system fonts. The new PDFKit renderer is NOT a pixel-perfect port — it follows the same structural layout but applies Vigil brand colors, Inter font, and the type scale from the brand guidelines.
- **D-03:** Never use font weight 600 Bold or 700 Heavy — brand guidelines prohibit it. Only 400 Regular and 500 Medium.

### Font Loading
- **D-04:** Bundle Inter-Regular.ttf and Inter-Medium.ttf in `vigil-core/assets/fonts/`. Register with PDFKit at startup. No CDN dependency. ~200KB total.

### Paper Size & Dimensions
- **D-05:** Configurable page width and height (in inches) via PDFConfig. Default dimensions: ~3.75" wide x 7.75" tall — sized to glue into user's physical notebook (8" x 4" notebook minus ~1/8" margin on each side for glue).
- **D-06:** The existing Swift PDFConfig paper size presets (letter, half-letter, A5, notebook, custom) are NOT ported. The new engine uses raw width/height values. The default is the user's notebook size.

### Data Contract
- **D-07:** Define a lean `BriefRenderData` TypeScript type that contains only what the PDF actually draws. Phase 76 (Brief Assembly) maps API responses into this shape. The renderer does NOT call APIs or access the database — it's a pure render function.
- **D-08:** The lean type should cover: work orders (title, status, AI priority), Vigil task thoughts, calendar events (title, time, location), sports scores/standings per league, affirmation text, captured thoughts with categories/routing, AI insights, therapy prep, and notes section placeholders.

### Section Layout & Structure
- **D-09:** Keep the same 3-page structure as the Swift renderer:
  - Page 1: Work orders (status checkboxes, AI priority) + Vigil task thoughts + Calendar events + Notes section
  - Page 2: Sports scores/standings (all configured leagues) + AI affirmation + Notes section
  - Page 3+: Captured thoughts (paginated) + AI insights + Therapy prep
- **D-10:** Section ordering within each page matches the existing Swift PageOneRenderer, PageTwoRenderer, PageThreeRenderer layouts.

### PDF Branding
- **D-11:** Vigil icon + date header on page 1 only. Pages 2-3 start directly with section content — no recurring header/footer. Maximizes content space on the compact page format.

### Configuration
- **D-12:** PDFConfig must support: page width, page height, margin (points), font scale (0.75-1.5), enabled sections array. Font scale multiplier applies to the entire type scale proportionally.
- **D-13:** enabledSections array controls which sections render. If a section is disabled, its space is reclaimed by remaining sections (no blank gaps).

### Claude's Discretion
- Exact point sizes for the type scale (H1/H2/H3/Body/Small/Micro) at default font scale — reference the Swift PDFStyles.swift for proportions, then adjust for the smaller page format
- Teal color usage intensity — whether dividers, section headers, or both get teal treatment
- Whether to include the Vigil diamond icon as SVG path data or as a small bundled PNG
- Checkbox rendering style for work order status (square outline vs filled square)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Brand & Design
- `vigil-brand-guidelines.pdf` (uploaded by user) — Vigil brand colors, Inter font, type scale, tag system, voice/tone. **This is the design authority for the PDF output.** Key pages: p3 (colors), p4 (typography), p5 (UI components)

### Existing Swift PDF Engine (reference implementation)
- `Sources/DailyBrief/PDF/PDFGenerator.swift` — Main PDF generation engine using CoreGraphics
- `Sources/DailyBrief/PDF/PDFStyles.swift` — Layout constants, fonts, colors, typography config
- `Sources/DailyBrief/PDF/PageOneRenderer.swift` — Page 1: Work Orders, Tasks, Calendar, Notes
- `Sources/DailyBrief/PDF/PageTwoRenderer.swift` — Page 2: Sports, Affirmation, Notes
- `Sources/DailyBrief/PDF/PageThreeRenderer.swift` — Page 3: Thoughts, Insights, Therapy Prep

### Data Model References
- `Sources/JarvisCore/Models/DailyBriefData.swift` — Swift DailyBriefData struct (~15 fields) — use as reference for the lean BriefRenderData type
- `Sources/JarvisCore/Config/AppConfig.swift` — Swift PDFConfig struct — reference for configurable options

### Server Integration Points
- `vigil-core/src/db/schema.ts` — briefs table has `pdfFilename` column (Phase 76 will use this)
- `vigil-core/src/routes/brief.ts` — Existing brief routes (Phase 76 integration point)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vigil-core/src/services/` — DI factory pattern established (sports-service.ts, calendar-service.ts). PDF renderer should follow the same pattern: `createPdfRenderer(deps?)` returning `{ renderBrief(data: BriefRenderData, config: PdfConfig): Promise<Buffer> }`
- `vigil-core/src/db/schema.ts` — briefs table already has `pdfFilename` column ready for PDF storage

### Established Patterns
- **DI factory pattern** — All services use `create*Service(deps?)` with injectable dependencies for testing
- **Test runner** — `node:test` with `node:assert/strict`, run via `npx tsx --test`
- **Route factory** — `create*Router(deps?)` → `export const name = create*Router()`

### Integration Points
- Phase 76 (Brief Assembly) will call the PDF renderer with assembled data
- The renderer is a pure function: `BriefRenderData + PdfConfig → PDF Buffer`
- No direct database access — the renderer receives pre-assembled data

</code_context>

<specifics>
## Specific Ideas

- User glues the printed PDF into a physical 8" x 4" notebook — the output must be slightly smaller than the notebook page on all sides for clean glue margins
- The brand guidelines PDF was uploaded directly by the user — it represents the definitive visual direction for all Vigil outputs
- Existing Swift code is a structural reference (what goes where) but NOT a visual reference (colors/fonts are being upgraded)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 75-pdf-generation-engine*
*Context gathered: 2026-04-12*
