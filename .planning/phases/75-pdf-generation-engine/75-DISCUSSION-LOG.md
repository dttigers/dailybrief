# Phase 75: PDF Generation Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 75-pdf-generation-engine
**Areas discussed:** Layout fidelity, Paper size priority, Data contract, Section ordering, Brand guidelines

---

## Brand & Visual Style

| Option | Description | Selected |
|--------|-------------|----------|
| Full Vigil brand | Inter font, teal accents, warm gray text, status colors per brand guidelines | ✓ |
| Grayscale match | Replicate existing CoreGraphics output exactly — system fonts, black/gray only | |
| Hybrid | Same layout, swap in Vigil colors and Inter font only | |

**User's choice:** Full Vigil brand
**Notes:** User uploaded vigil-brand-guidelines.pdf (v1.0, April 2026) as the definitive design reference

## Font Loading

| Option | Description | Selected |
|--------|-------------|----------|
| Bundle Inter in repo | Download .ttf files into vigil-core/assets/fonts/. ~200KB. Works offline. | ✓ |
| Download at startup | Fetch from Google Fonts CDN on server start. Smaller repo, network dependency. | |

**User's choice:** Bundle Inter in repo
**Notes:** None

## Paper Size

| Option | Description | Selected |
|--------|-------------|----------|
| Half-letter only | 5.5x8.5" notebook format | |
| Letter + half-letter | Two sizes | |
| All five sizes | Full PDFConfig sizing logic | |
| Custom (user input) | User's specific notebook dimensions | ✓ |

**User's choice:** Custom — physical notebook is 8" high x 4" wide, PDF needs to be slightly smaller on all dimensions for glue-in margins (~3.75" x 7.75")
**Notes:** User glues printed briefs into a physical notebook. This is the primary and possibly only use case.

## Paper Dimensions Config

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable with notebook default | PDFConfig accepts custom width/height. Default: ~3.75x7.75" | ✓ |
| Hardcoded notebook only | Single fixed size | |

**User's choice:** Configurable with notebook default
**Notes:** None

## Data Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Lean server type | New BriefRenderData with only what the PDF draws. Phase 76 maps into it. | ✓ |
| Mirror Swift shape | Match DailyBriefData 1:1 | |

**User's choice:** Lean server type
**Notes:** None

## Section Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Keep same structure | Same 3-page layout as Swift version | ✓ |
| Adjust ordering | Rearrange sections | |
| Configurable sections | enabledSections controls order | |

**User's choice:** Keep same structure
**Notes:** None

## PDF Branding

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal header + date | Small Vigil mark on every page | |
| No branding | Just content, no logo | |
| Header on page 1 only | Vigil icon + date on page 1, pages 2-3 pure content | ✓ |

**User's choice:** Header on page 1 only
**Notes:** Claude recommended this given the small page size (~3.75x7.75") where every point of space matters. User agreed.

## Claude's Discretion

- Exact point sizes for type scale at default font scale
- Teal color usage intensity (dividers, section headers, or both)
- Vigil icon format (SVG path data vs bundled PNG)
- Checkbox rendering style for work order status

## Deferred Ideas

None
