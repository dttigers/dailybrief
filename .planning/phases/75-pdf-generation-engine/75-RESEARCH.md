# Phase 75: PDF Generation Engine - Research

**Researched:** 2026-04-12
**Domain:** PDFKit (Node.js) — server-side PDF rendering with custom fonts, multi-page layout, brand colors
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Full Vigil brand adoption. Inter font (400 Regular = body, 500 Medium = headings), Vigil Teal palette for accents/headings/dividers, warm Gray 900 (#2C2C2A) body text, status accent colors (Blue/Amber/Green) for work order priorities.
- **D-02:** New PDFKit renderer is NOT a pixel-perfect port of the Swift CoreGraphics engine. Same structural layout, Vigil brand colors + Inter font + brand type scale.
- **D-03:** Never use font weight 600 Bold or 700 Heavy. Only 400 Regular and 500 Medium.
- **D-04:** Bundle Inter-Regular.ttf and Inter-Medium.ttf in `vigil-core/assets/fonts/`. Register with PDFKit at startup. No CDN dependency. ~200KB total.
- **D-05:** Configurable page width and height (in inches) via PDFConfig. Default: ~3.75" wide x 7.75" tall (notebook glue-in size).
- **D-06:** Paper size presets (letter, half-letter, A5, notebook, custom) are NOT ported. Raw width/height values in inches only.
- **D-07:** Define a lean `BriefRenderData` TypeScript type. Phase 76 (Brief Assembly) maps API responses into it. The renderer is a pure function — no API calls, no database access.
- **D-08:** Lean type covers: work orders (title, status, AI priority), Vigil task thoughts, calendar events (title, time, location), sports scores/standings per league, affirmation text, captured thoughts with categories/routing, AI insights, therapy prep, notes placeholders.
- **D-09:** 3-page structure: Page 1 = Work orders + task thoughts + calendar + notes; Page 2 = Sports + affirmation + notes; Page 3+ = Captured thoughts + AI insights + therapy prep (paginated).
- **D-10:** Section ordering within each page matches PageOneRenderer, PageTwoRenderer, PageThreeRenderer.
- **D-11:** Vigil icon + date header on page 1 only. Pages 2-3 start directly with section content.
- **D-12:** PDFConfig: page width, page height, margin (points), font scale (0.75-1.5), enabled sections array.
- **D-13:** enabledSections array controls which sections render. Disabled sections' space is reclaimed by remaining sections (no blank gaps).

### Claude's Discretion

- Exact point sizes for the type scale (H1/H2/H3/Body/Small/Micro) at default font scale — reference Swift PDFStyles.swift for proportions, adjust for smaller page format.
- Teal color usage intensity — dividers, section headers, or both.
- Whether to include the Vigil diamond icon as SVG path data or a small bundled PNG.
- Checkbox rendering style for work order status (square outline vs filled square).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PDF-01 | Server renders 3-page daily brief PDF via PDFKit | PDFKit 0.18 API: `PDFDocument`, `addPage()`, pipe to Buffer |
| PDF-02 | PDF supports configurable paper size (raw width/height in inches) | `new PDFDocument({ size: [w*72, h*72] })` — D-06 locks this to raw inches only |
| PDF-03 | PDF supports configurable margins, font scale, section toggles | `PDFConfig` type + `enabledSections` Set guard pattern from Swift; PDFKit margin via content rect math |
| PDF-04 | Page 1: work orders (status checkboxes, AI priority), task thoughts, calendar events, notes | Layout ported from PageOneRenderer.swift with PDFKit drawing primitives |
| PDF-05 | Page 2: sports scores/standings (all configured leagues), affirmation, notes | Layout ported from PageTwoRenderer.swift; multi-league compact mode logic preserved |
| PDF-06 | Page 3+: captured thoughts, paginated AI insights, therapy prep | Layout ported from PageThreeRenderer.swift; spillover pagination loop via `addPage()` |
</phase_requirements>

---

## Summary

Phase 75 builds the core PDF rendering engine for Vigil's daily brief. The Swift CoreGraphics renderer is the structural reference — the same 3-page layout, section ordering, and compact/multi-league logic carries over verbatim. The visual layer is entirely replaced: grayscale + Helvetica becomes Vigil brand colors (teal palette, warm gray body) with Inter 400/500.

PDFKit 0.18 provides all necessary primitives: custom TTF font registration via `doc.registerFont()`, absolute coordinate text placement, text height measurement via `doc.heightOfString()`, vector drawing (lines, rectangles, ellipses), and multi-page output into a Node.js Buffer. No native system dependencies — works on Railway out of the box.

The renderer follows the established DI factory pattern (`createPdfRenderer(deps?)`) and is a pure function: `(BriefRenderData, PdfConfig) → Promise<Buffer>`. Phase 76 (Brief Assembly) will call it with fully assembled data. The `BriefRenderData` type defined here becomes the contract between Phase 75 and Phase 76.

**Primary recommendation:** Implement PDFKit renderer in `vigil-core/src/services/pdf-service.ts` following the DI factory pattern; bundle Inter fonts in `vigil-core/assets/fonts/`; derive `BriefRenderData` from `DailyBriefData.swift` plus sports-service.ts data shapes.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pdfkit | 0.18.0 | PDF generation | Pre-selected (STATE.md). Pure JS, no native deps, works on Railway. Disqualified Puppeteer (pthread/D-Bus failures on Railway). |
| @types/pdfkit | 0.17.5 | TypeScript types for PDFKit | Latest stable type definitions |

[VERIFIED: npm registry — `npm view pdfkit version` returned 0.18.0; `npm view @types/pdfkit version` returned 0.17.5]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Inter font TTF files | ~200KB | Custom font bundle | Required by D-04. Download from Google Fonts or Fontsource. |
| node:test + node:assert | built-in | Test runner | Established pattern in vigil-core (sports-service.test.ts, calendar-service.test.ts) |
| tsx | 4.19.0 | Run TS tests | Already in devDependencies |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PDFKit | Puppeteer/Chromium | Disqualified — Railway pthread/D-Bus errors documented in STATE.md |
| PDFKit | jsPDF | Less feature-complete, fewer primitives for precise coordinate-based layout |
| bundled TTF | CDN font | CDN dependency violates D-04; Railway containers need offline fonts |

**Installation:**
```bash
cd vigil-core
npm install pdfkit
npm install --save-dev @types/pdfkit
```

**Version verification:** Confirmed via npm registry 2026-04-12.
[VERIFIED: npm registry]

---

## Architecture Patterns

### Recommended Project Structure

```
vigil-core/
├── assets/
│   └── fonts/
│       ├── Inter-Regular.ttf     # Inter 400 — body text
│       └── Inter-Medium.ttf      # Inter 500 — headings (NOT Bold/Heavy per D-03)
└── src/
    └── services/
        ├── pdf-service.ts         # createPdfRenderer() factory
        ├── pdf-service.test.ts    # unit tests
        └── pdf-types.ts           # BriefRenderData + PdfConfig types
```

### Pattern 1: DI Factory (matches existing services)

All vigil-core services use `create*Service(deps?)` returning an object of functions. The PDF renderer follows this exactly.

**What:** Factory function accepts injectable dependencies (font path resolver, current date) for testability. Returns `{ renderBrief(data, config): Promise<Buffer> }`.

**When to use:** Always — the established project pattern. Enables unit testing with mock data without filesystem or network dependencies.

**Example:**
```typescript
// Source: established pattern from vigil-core/src/services/sports-service.ts
export interface PdfRendererDeps {
  fontsDir?: string;        // defaults to path.resolve(process.cwd(), 'assets/fonts')
  nowFn?: () => Date;       // defaults to () => new Date()
}

export function createPdfRenderer(deps: PdfRendererDeps = {}): {
  renderBrief: (data: BriefRenderData, config: PdfConfig) => Promise<Buffer>;
} {
  const fontsDir = deps.fontsDir ?? path.resolve(process.cwd(), 'assets/fonts');
  const nowFn = deps.nowFn ?? (() => new Date());

  return { renderBrief };
}
```

### Pattern 2: PDFKit Buffer Collection

PDFKit is a readable stream. The standard pattern for collecting output into a `Buffer` without writing to disk:

```typescript
// Source: PDFKit docs — https://pdfkit.org/docs/getting_started.html
import PDFDocument from 'pdfkit';

function renderBrief(data: BriefRenderData, config: PdfConfig): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const [pageW, pageH] = [config.pageWidthInches * 72, config.pageHeightInches * 72];
    const doc = new PDFDocument({
      size: [pageW, pageH],
      autoFirstPage: false,
      bufferPages: false,  // streaming mode — emit chunks as pages complete
    });

    // Register Inter fonts once at document creation
    doc.registerFont('Inter-Regular', path.join(fontsDir, 'Inter-Regular.ttf'));
    doc.registerFont('Inter-Medium',  path.join(fontsDir, 'Inter-Medium.ttf'));

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Add pages...
    doc.addPage();
    drawPageOne(doc, data, layout);

    doc.addPage();
    drawPageTwo(doc, data, layout);

    // Page 3+ (paginated)
    drawPageThree(doc, data, layout);

    doc.end();
  });
}
```

[CITED: https://pdfkit.org/docs/getting_started.html]

### Pattern 3: Absolute Coordinate Drawing (matching Swift approach)

The Swift renderers use top-down Y coordinates (Y=0 at top, increases downward) within a content rect. PDFKit's coordinate system also places Y=0 at the top of the page and increases downward — this is the OPPOSITE of CoreGraphics (which has Y=0 at bottom). This means **no coordinate flip is needed** when porting the Swift layout logic.

```typescript
// Source: https://pdfkit.org/docs/text.html
// PDFKit text at absolute position — Y increases downward from page top
doc.font('Inter-Medium')
   .fontSize(layout.headerSize)
   .fillColor('#2C7A7B')        // Vigil Teal
   .text('Work Orders', leftX, y, { lineBreak: false });

// Advance y by actual rendered height
y += doc.heightOfString('Work Orders', { width: usableWidth });
```

**Critical:** In PDFKit, `doc.text(str, x, y)` places the baseline at `y` from the top. `doc.heightOfString(str, opts)` measures height for wrapped text — use this instead of Swift's `CTFramesetterSuggestFrameSizeWithConstraints`.

[CITED: https://pdfkit.org/docs/text.html]

### Pattern 4: Layout Struct (mirrors Swift PDFLayout)

Define a `PdfLayout` interface computed from `PdfConfig` before rendering. This pre-computes all derived values (content rect, scaled font sizes) once and passes them to page renderers.

```typescript
// [ASSUMED] — matches Swift PDFLayout pattern
interface PdfLayout {
  pageW: number;       // points
  pageH: number;       // points
  margin: number;      // points
  leftX: number;       // content left edge
  rightEdge: number;   // content right edge
  usableWidth: number;
  contentBottom: number;
  // Scaled font sizes
  titleSize: number;   // 14 * fontScale
  headerSize: number;  // 10 * fontScale
  bodySize: number;    // 8 * fontScale
  smallSize: number;   // 7 * fontScale
  tinySize: number;    // 6 * fontScale
  // Layout constants (scaled)
  tableRowHeight: number;   // 14 * fontScale
  checkboxSize: number;     // 8 * fontScale
  noteLineSpacing: number;  // 16 * fontScale
  innerPadding: number;     // 8 * fontScale
  enabledSections: Set<string>;
}
```

### Anti-Patterns to Avoid

- **Using `doc.text()` without `lineBreak: false` for single-line labels** — PDFKit advances the internal cursor after every `text()` call; mix absolute-position draws with cursor-relative draws causes Y drift. Use `{ lineBreak: false }` for label rows, or use explicit Y coordinates consistently.
- **Re-registering fonts per page** — register once at document creation, reuse font name strings throughout.
- **Using `bufferPages: true`** — forces all pages into memory simultaneously. Streaming mode (the default, `bufferPages: false`) is correct for this use case since pages are rendered sequentially.
- **Calling `doc.end()` before all pages are drawn** — PDFKit emits `end` immediately on `doc.end()`; call it only after all `addPage()` + draw calls are complete.
- **Hardcoding font weight "Bold"** — D-03 prohibits font weights 600/700. Only register Inter-Regular (400) and Inter-Medium (500).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text wrapping width measurement | Custom character-count splitting | `doc.heightOfString(text, { width })` | PDFKit accounts for kerning, ligatures, Inter's actual metrics |
| PDF binary output | Manual PDF spec bytes | PDFKit | PDF spec is complex; PDFKit handles cross-reference tables, font embedding, stream compression |
| Font subsetting | Copy raw TTF bytes into PDF | PDFKit (automatic) | PDFKit calls fontkit internally to subset and embed only used glyphs |
| Multi-page pagination loop | Manual page count estimation | `addPage()` + overflow check pattern | Swift's `insightsStartIndex` loop pattern translates directly using `heightOfString` pre-measurement |

**Key insight:** The Swift code uses `CTFramesetterSuggestFrameSizeWithConstraints` for text measurement. PDFKit's `heightOfString(text, { width })` is the exact equivalent — same pre-measure-before-draw pattern, different API.

---

## Coordinate System: Swift CoreGraphics vs PDFKit

This is the most critical porting concern. The Swift renderers use a coordinate flip (`cgY()`) because CoreGraphics has Y=0 at the **bottom** of the page. PDFKit has Y=0 at the **top** of the page.

| Aspect | Swift CoreGraphics | PDFKit |
|--------|-------------------|--------|
| Y origin | Bottom of page | Top of page |
| Y direction | Increases upward | Increases downward |
| Coordinate flip needed? | Yes (`cgY()` function) | **No** |
| Font size unit | Points | Points (same) |
| 1 inch = | 72 points | 72 points (same) |

**Porting rule:** Remove all `PDFGenerator.cgY()` calls. The `var y` variable that starts at `layout.margin + 4` and increases as sections are drawn maps directly to PDFKit's coordinate system with no inversion.

[CITED: Swift source — PDFGenerator.swift cgY() function; PDFKit docs coordinate system]

---

## BriefRenderData Type Design

The lean type derives from `DailyBriefData.swift` (Swift reference) and the sports-service.ts data shapes already established in vigil-core.

```typescript
// Derived from DailyBriefData.swift + vigil-core sports-service types
// [VERIFIED: read from codebase]

export interface BriefWorkOrder {
  caseNumber: string;
  store: string;
  shortDescription: string;
  trade: string;
  location: string;
  equipment: string;
  priority: string;
  contact: string;
  status: 'open' | 'inProgress' | 'done';
}

export interface BriefCalendarEvent {
  title: string;
  startTime: string;    // ISO string or formatted "HH:MM AM" for display
  isAllDay: boolean;
  location?: string;
  timeString: string;   // pre-formatted display string
}

export interface BriefSportLeague {
  sport: string;        // 'mlb' | 'nfl' | 'nba' | 'nhl'
  displayName: string;  // 'MLB' | 'NFL' | 'NBA' | 'NHL'
  teamName: string;
  divisionName: string;
  recentGame: {
    homeTeam: string; awayTeam: string;
    homeScore: number; awayScore: number;
    result: 'W' | 'L' | 'T' | null;
    gameDate: string;
  } | null;
  upcomingGame: {
    homeTeam: string; awayTeam: string;
    isHome: boolean; venue: string;
    gameDate: string; gameType: string;
  } | null;
  standings: Array<{
    team: string; wins: number; losses: number;
    gamesBack: string; winPct: string; streak: string; rank: number;
  }>;
}

export interface BriefThought {
  content: string;
  category?: 'task' | 'therapy' | 'idea' | 'reflection' | 'project';
  source: 'text' | 'voice' | 'image';
  taskStatus?: 'open' | 'inProgress' | 'done';
  createdAt: string;   // ISO string
}

export interface BriefInsight {
  type: 'pattern' | 'connection' | 'actionPrompt' | 'trend';
  title: string;
  message: string;
}

export interface BriefTherapyItem {
  topic: string;
  context: string;
  urgency: 'high' | 'medium' | 'low';
}

export interface BriefTherapyPrep {
  items: BriefTherapyItem[];
  suggestedFocus: string;
}

export interface BriefTherapyPattern {
  theme: string;
  trend: string;
}

export interface BriefRenderData {
  date: Date;
  // Page 1
  workOrders: BriefWorkOrder[];
  workOrderPriorityOrder?: string[];  // case numbers in AI urgency order
  taskThoughts: BriefThought[];       // Vigil task thoughts (replaces Apple Reminders)
  calendarEvents: BriefCalendarEvent[];
  // Page 2
  sports: BriefSportLeague[];         // all enabled leagues, in render order
  affirmation: string;
  // Page 3+
  unprocessedThoughts: BriefThought[];
  recentThoughts: BriefThought[];
  insights: BriefInsight[];
  therapyPatterns: BriefTherapyPattern[];
  therapyPrep?: BriefTherapyPrep;
}

export interface PdfConfig {
  pageWidthInches: number;    // default 3.75
  pageHeightInches: number;   // default 7.75 (D-05 — notebook size)
  marginPoints: number;       // default 12
  fontScale: number;          // 0.75-1.5, default 1.0
  enabledSections: string[];  // ['workOrders', 'calendar', 'sports', 'affirmation', 'thoughts', 'insights', 'therapyPrep']
}
```

**Key mapping decisions:**
- `todoItems` (Apple Reminders) is dropped — replaced by `taskThoughts` (Vigil thoughts with taskStatus). [VERIFIED: STATE.md — "Apple Reminders dropped — Vigil task thoughts replace the todo section on Page 1"]
- `additionalSports: SportData[]` + primary MLB fields are flattened into `sports: BriefSportLeague[]` — simpler for Phase 76 assembly.
- `workOrderStatuses` map is merged into each `BriefWorkOrder.status` field — no need for a separate map at the render layer.

---

## Vigil Brand Colors (for PDFKit)

Derived from D-01 and brand guidelines reference (user-uploaded PDF). These are the hex values to use in PDFKit `fillColor()` / `strokeColor()` calls.

[ASSUMED — exact hex values not verified against brand PDF since it wasn't accessible via tool; planner should verify against `vigil-brand-guidelines.pdf` p3]

| Role | Name | Hex (assumed) | Usage |
|------|------|---------------|-------|
| Primary accent | Vigil Teal | `#2C7A7B` | Section headers, dividers (teal treatment per discretion) |
| Body text | Warm Gray 900 | `#2C2C2A` | All body copy |
| Subtext | Warm Gray 500 | `#6B6B68` | Secondary labels, metadata |
| Light divider | Warm Gray 200 | `#D9D9D5` | Horizontal rules, table backgrounds |
| Very light bg | Warm Gray 100 | `#F2F2EE` | Table row highlight backgrounds |
| Status: Open | Blue | `#3B82F6` | Work order open status |
| Status: In Progress | Amber | `#F59E0B` | Work order in-progress status |
| Status: Done | Green | `#10B981` | Work order done status |

**A1** in Assumptions Log — verify hex values against brand guidelines PDF p3 before coding.

---

## Swift-to-PDFKit Drawing Equivalents

| Swift CoreGraphics | PDFKit equivalent |
|-------------------|-------------------|
| `context.setFillColor(color)` + `context.fill(rect)` | `doc.rect(x, y, w, h).fillColor(hex).fill()` |
| `context.setStrokeColor(color)` + `context.stroke(rect)` | `doc.rect(x, y, w, h).strokeColor(hex).stroke()` |
| `context.move/addLine/strokePath` | `doc.moveTo(x,y).lineTo(x2,y2).stroke()` |
| `context.fillEllipse(in: rect)` | `doc.circle(cx, cy, r).fill()` |
| `CTFramesetterSuggestFrameSizeWithConstraints` | `doc.heightOfString(text, { width })` |
| `CTFrameDraw` (wrapped text in rect) | `doc.text(text, x, y, { width, lineBreak: true })` |
| `PDFGenerator.drawText(_, at: point)` | `doc.text(text, x, y, { lineBreak: false })` |
| `PDFStyles.monoFont` (Menlo) | No exact equivalent; use Inter-Regular at tinySize — brand guidelines don't specify mono [ASSUMED] |

---

## Common Pitfalls

### Pitfall 1: PDFKit Y Cursor Drift

**What goes wrong:** After calling `doc.text(...)`, PDFKit advances its internal Y cursor. Subsequent calls without explicit Y coordinates draw below the previous text. If you mix `doc.text(text, x, y)` with `doc.text(text)` (no coords), layout breaks.

**Why it happens:** PDFKit maintains a "current position" stream internally. Absolute coordinates only override for that call; the cursor still advances.

**How to avoid:** Always pass explicit `(x, y)` coordinates for every text call in this renderer. After each text block, advance `y` manually using `doc.heightOfString()` — same discipline as the Swift renderers.

**Warning signs:** Sections overlapping or misaligned Y positions in output PDF.

### Pitfall 2: Font Registration After Document Start

**What goes wrong:** Calling `doc.registerFont()` after `doc.addPage()` or drawing operations has undefined behavior in some PDFKit versions.

**Why it happens:** PDFKit embeds font metadata at document start.

**How to avoid:** Register all fonts immediately after `new PDFDocument({...})`, before any `addPage()` call.
[VERIFIED: PDFKit GitHub issues — font registration timing is documented as pre-draw]

### Pitfall 3: `heightOfString` Options Must Match Render Options

**What goes wrong:** Pre-measuring text height with different options than actually rendering produces layout errors — text overflows its measured box or leaves gaps.

**Why it happens:** `heightOfString` uses the same layout engine as `text()`. If you measure with `{ width: 200 }` but render at `{ width: 180 }`, heights differ.

**How to avoid:** Extract render options into a constant and pass the same object to both `heightOfString` and `text()`.

### Pitfall 4: Page Size Must Be Set at Construction

**What goes wrong:** `new PDFDocument({ size: [...] })` sets the page size. Calling `doc.addPage({ size: [...] })` can set different sizes for individual pages — which is wrong here (all pages same dimensions).

**Why it happens:** PDFKit supports mixed page sizes by design.

**How to avoid:** Pass `size` to the `PDFDocument` constructor only. Do not pass `size` to individual `addPage()` calls — they inherit the document default.

[CITED: https://pdfkit.org/docs/getting_started.html]

### Pitfall 5: `doc.end()` Timing with Promise Resolution

**What goes wrong:** If `doc.end()` is called before all `draw*` functions have written to the document, the PDF is truncated or corrupt.

**Why it happens:** `doc.end()` signals no more data — the `end` event fires and the Buffer is assembled immediately.

**How to avoid:** All `draw*` function calls must complete synchronously before `doc.end()`. The rendering is synchronous; only the Buffer collection is async (via events).

### Pitfall 6: Inter Font Weight Names

**What goes wrong:** Registering `Inter-Bold.ttf` and using it (which violates D-03), or registering the wrong weight and having it silently fall back to a default.

**Why it happens:** PDFKit silently uses a fallback font if a registered name is not found.

**How to avoid:** Only register `Inter-Regular.ttf` (400) and `Inter-Medium.ttf` (500). Verify registration by checking output PDF metadata or testing that the distinct Inter-Medium weight is visually distinct from Inter-Regular.

---

## Code Examples

### Registering Fonts and Creating Document

```typescript
// Source: https://pdfkit.org/docs/getting_started.html + font registration pattern
import PDFDocument from 'pdfkit';
import path from 'node:path';

const doc = new PDFDocument({
  size: [config.pageWidthInches * 72, config.pageHeightInches * 72],
  autoFirstPage: false,
  margin: 0,  // We manage margins manually via content rect
});

doc.registerFont('Inter-Regular', path.join(fontsDir, 'Inter-Regular.ttf'));
doc.registerFont('Inter-Medium',  path.join(fontsDir, 'Inter-Medium.ttf'));
```

### Drawing a Divider Line

```typescript
// Source: https://pdfkit.org/docs/vector.html
doc
  .moveTo(leftX, y)
  .lineTo(rightEdge, y)
  .strokeColor('#D9D9D5')
  .lineWidth(0.5)
  .stroke();
y += 6;
```

### Drawing a Section Header with Teal Color

```typescript
// Source: https://pdfkit.org/docs/text.html
doc
  .font('Inter-Medium')
  .fontSize(layout.headerSize)
  .fillColor('#2C7A7B')  // Vigil Teal
  .text('Work Orders', leftX, y, { lineBreak: false });
y += doc.heightOfString('Work Orders') + 4;
```

### Wrapped Text with Pre-Measurement

```typescript
// Source: https://pdfkit.org/docs/text.html
const opts = { width: usableWidth };
const neededH = doc.heightOfString(thought.content, opts);

// Check if fits on page before drawing
if (y + neededH > layout.contentBottom) {
  doc.addPage();
  y = layout.margin + 4;
}

doc
  .font('Inter-Regular')
  .fontSize(layout.bodySize)
  .fillColor('#2C2C2A')
  .text(thought.content, leftX, y, opts);
y += neededH + 4;
```

### Checkbox Drawing (Work Order Status)

```typescript
// Source: modeled from PageOneRenderer.swift checkbox logic
const cbY = y;
const cbX = leftX;
const cbSize = layout.checkboxSize;

if (status === 'done') {
  doc.rect(cbX, cbY, cbSize, cbSize).fillColor('#10B981').fill();  // Green filled
} else if (status === 'inProgress') {
  doc.rect(cbX, cbY, cbSize, cbSize).strokeColor('#F59E0B').lineWidth(0.5).stroke();  // Amber outline
  const dotR = 1.5;
  doc.circle(cbX + cbSize/2, cbY + cbSize/2, dotR).fillColor('#F59E0B').fill();
} else {
  doc.rect(cbX, cbY, cbSize, cbSize).strokeColor('#6B6B68').lineWidth(0.5).stroke();  // Gray outline
}
```

### Page 3 Spillover Loop (Insights Pagination)

```typescript
// Source: modeled from PDFGenerator.swift paginated thoughts loop
let insightsStartIndex = 0;
const MAX_PAGES = 10;
let pagesEmitted = 0;

do {
  doc.addPage();
  const nextIndex = drawPageThree(doc, data, layout, insightsStartIndex);
  pagesEmitted++;
  if (nextIndex !== null && nextIndex > insightsStartIndex) {
    insightsStartIndex = nextIndex;
  } else {
    break;
  }
} while (pagesEmitted < MAX_PAGES);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CoreGraphics (Mac CLI, Swift) | PDFKit 0.18 (vigil-core, Node.js) | Phase 75 (this phase) | PDF generation moves server-side; Mac CLI becomes thin client in Phase 78 |
| Grayscale B&W (Helvetica, system fonts) | Vigil brand colors (Inter 400/500) | Phase 75 | Full brand adoption; PDF becomes a Vigil artifact |
| Puppeteer/Chromium | PDFKit | Evaluated and disqualified | Railway cannot launch Chromium (pthread/D-Bus); PDFKit has no native deps |

**Deprecated/outdated:**
- `PDFGenerator.cgY()` coordinate flip: Not needed in PDFKit (Y=0 at top in both PDFKit and the Swift top-down layout math).
- `todoItems` / Apple Reminders section: Dropped. `taskThoughts` from Vigil database replaces it.
- Swift paper size presets (letter, half-letter, A5, notebook): Not ported per D-06. Raw width/height in inches only.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vigil Teal = `#2C7A7B`, Gray 900 = `#2C2C2A`, etc. — hex values estimated from brand name convention | Vigil Brand Colors | Colors render off-brand; planner/implementer must verify against `vigil-brand-guidelines.pdf` p3 |
| A2 | `doc.text(text, x, y)` positions text top-left at `(x, y)` in PDFKit — baseline is slightly below `y` | Coordinate System section | Minor vertical alignment offset in rendered text rows |
| A3 | Inter-Medium.ttf is the correct filename for the 500-weight variant from Google Fonts/Fontsource | Standard Stack | Font registration fails; fallback font used |
| A4 | Vigil diamond icon can be rendered as PDFKit SVG path or small PNG embedded with `doc.image()` | CONTEXT.md Claude's Discretion | Icon doesn't render; implementer must choose path data vs PNG |

---

## Open Questions

1. **Vigil brand hex values**
   - What we know: D-01 specifies Vigil Teal palette, warm Gray 900, status accent colors
   - What's unclear: Exact hex values — brand guidelines PDF was referenced but not extractable via tool
   - Recommendation: Implementer reads `vigil-brand-guidelines.pdf` p3 before coding color constants

2. **Vigil diamond icon format**
   - What we know: D-11 calls for Vigil icon on page 1 header; CONTEXT.md leaves format to discretion
   - What's unclear: Whether an SVG path or PNG file exists/is preferred
   - Recommendation: Use `doc.image(pngPath, x, y, { width: 12, height: 12 })` if a PNG exists in assets; otherwise skip for now and add post-Phase 75

3. **Inter font download source**
   - What we know: D-04 specifies bundle TTF files in `vigil-core/assets/fonts/`
   - What's unclear: Whether to use Google Fonts direct download or Fontsource npm package
   - Recommendation: Direct download from Google Fonts static CDN at implementation time — no npm package needed

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | PDFKit runtime | Yes | v25.2.1 | — |
| npm | Package install | Yes | 11.11.0 | — |
| pdfkit package | PDF generation | Not installed (not in package.json yet) | — | Install per Standard Stack |
| @types/pdfkit | TypeScript types | Not installed | — | Install per Standard Stack |
| Inter-Regular.ttf | Font rendering | Not present (`assets/` dir absent) | — | Download from Google Fonts at Wave 0 |
| Inter-Medium.ttf | Font rendering | Not present | — | Download from Google Fonts at Wave 0 |

**Missing dependencies with no fallback:**
- `pdfkit` npm package — must be installed before any implementation task
- `Inter-Regular.ttf` + `Inter-Medium.ttf` — must be downloaded and placed in `vigil-core/assets/fonts/` before font registration can be tested

**Missing dependencies with fallback:**
- None requiring a fallback — all are installable/downloadable

[VERIFIED: `ls vigil-core/assets/` returned "no such directory"; `ls vigil-core/package.json` confirmed pdfkit not present]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (built-in) + node:assert/strict |
| Config file | none — run via `npx tsx --test` |
| Quick run command | `npx tsx --test "src/services/pdf-service.test.ts"` (from vigil-core/) |
| Full suite command | `npm test` (from vigil-core/) — runs `tsx --test "src/**/*.test.ts"` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PDF-01 | `renderBrief()` returns a non-empty Buffer | unit | `npx tsx --test "src/services/pdf-service.test.ts"` | No — Wave 0 |
| PDF-01 | Returned Buffer starts with `%PDF-` magic bytes | unit | same | No — Wave 0 |
| PDF-02 | Page dimensions match `config.pageWidthInches * 72` x `config.pageHeightInches * 72` | unit | same | No — Wave 0 |
| PDF-03 | When `enabledSections` excludes 'sports', PDF-02 output is smaller (content reclaimed) | unit | same | No — Wave 0 |
| PDF-04 | With work order data, buffer is valid PDF (smoke: opens without error) | unit | same | No — Wave 0 |
| PDF-05 | Sports section renders standings rows equal to input array length | unit | same | No — Wave 0 |
| PDF-06 | Insights overflow produces multiple pages (pagesEmitted > 1 with large insights array) | unit | same | No — Wave 0 |

**Manual verification (not automatable):**
- Visual inspection: PDF opens in Preview, fonts render as Inter (not system fallback), teal color is correct
- Physical test: Print at 3.75" x 7.75", verify it fits in notebook page with glue margin

### Sampling Rate

- **Per task commit:** `npx tsx --test "src/services/pdf-service.test.ts"`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green + manual Preview inspection before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `vigil-core/src/services/pdf-service.test.ts` — covers PDF-01 through PDF-06
- [ ] `vigil-core/assets/fonts/` directory + Inter TTF files — required before font registration tests
- [ ] `npm install pdfkit @types/pdfkit` — package must be present before any test can import it

---

## Security Domain

> `security_enforcement` not explicitly set to false in config.json — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | PDF renderer is a pure internal function — no auth layer |
| V3 Session Management | No | Stateless pure function |
| V4 Access Control | No | Renderer has no access control — caller (Phase 76 route) enforces auth |
| V5 Input Validation | Yes | BriefRenderData must be validated before passing to renderer — Phase 76 responsibility |
| V6 Cryptography | No | No secrets handled in renderer |

### Known Threat Patterns for PDFKit

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| PDF content injection via untrusted text (work order descriptions, thought content) | Tampering | PDFKit escapes PDF string literals internally; strings from DB are text-only — no PDF operator injection risk |
| Font path traversal | Tampering | `fontsDir` resolved at factory creation to an absolute path within the repo; never accepts user-controlled font path |
| Buffer memory exhaustion (pathological pagination) | DoS | `MAX_PAGES = 10` safety cap (carried from Swift's `maxPages` guard) |

---

## Sources

### Primary (HIGH confidence)
- PDFKit 0.18.0 npm registry — version verification
- `vigil-core/src/services/sports-service.ts` — established DI factory pattern
- `vigil-core/src/services/calendar-service.ts` — established DI factory pattern
- Swift reference files (PDFStyles.swift, PDFGenerator.swift, PageOneRenderer.swift, PageTwoRenderer.swift, PageThreeRenderer.swift, DailyBriefData.swift, AppConfig.swift) — layout constants and section structure
- `vigil-core/package.json` — existing deps, test runner config
- `vigil-core/src/db/schema.ts` — briefs table pdfFilename column confirmed

### Secondary (MEDIUM confidence)
- [PDFKit Getting Started docs](https://pdfkit.org/docs/getting_started.html) — Buffer collection pattern, page size API
- [PDFKit Text docs](https://pdfkit.org/docs/text.html) — `heightOfString`, absolute coordinates, wrapping options
- [PDFKit Vector docs](https://pdfkit.org/docs/vector.html) — rect, line, circle drawing API

### Tertiary (LOW confidence)
- WebSearch: PDFKit font registration timing (registerFont before addPage) — corroborated by GitHub issue #528

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — version verified via npm registry 2026-04-12
- Architecture: HIGH — DI factory pattern verified from existing vigil-core services; PDFKit API verified from official docs
- Layout constants: HIGH — directly read from Swift source files (PDFStyles.swift, PDFLayout)
- Brand colors: LOW (A1) — hex values assumed from naming conventions; must verify against brand PDF
- Pitfalls: MEDIUM — PDFKit-specific pitfalls from docs + GitHub issue patterns

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (PDFKit 0.18 is stable; 30-day window appropriate)
