# Phase 77: PWA Brief UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 77-pwa-brief-ui
**Areas discussed:** Page placement, Generate UX flow, PDF preview approach, Download & sharing

---

## Page Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Enhance History tab | Add generate button + PDF preview to existing BriefHistoryPage. No new nav tab. | ✓ |
| New 'Brief' tab | Dedicated tab for generate + preview. History tab stays as-is. | |
| Replace Dashboard | Replace dashboard landing page with brief generate/preview. | |

**User's choice:** Enhance History tab
**Notes:** One-stop brief page — generate today's, view past ones.

### Follow-up: Tab Rename

| Option | Description | Selected |
|--------|-------------|----------|
| Rename to 'Briefs' | Reflects expanded scope — generate + history in one place | ✓ |
| Keep 'History' | Less churn, users already know where it is | |

**User's choice:** Rename to 'Briefs'

---

## Generate UX Flow

### Initial State

| Option | Description | Selected |
|--------|-------------|----------|
| Show generate button | Prominent button when no brief exists. Manual trigger, no surprise API calls. | ✓ |
| Auto-generate on load | Automatically trigger generation on page load. | |
| You decide | Claude picks best approach | |

**User's choice:** Show generate button

### Loading State

| Option | Description | Selected |
|--------|-------------|----------|
| Spinner + status text | Simple spinner with "Generating your brief..." text. | ✓ |
| Skeleton placeholder | Animated skeleton rectangles mimicking PDF shape. | |
| You decide | Claude picks based on existing patterns | |

**User's choice:** Spinner + status text

### Regenerate

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, show Regenerate | Show PDF preview with smaller Regenerate button if today's brief exists. | ✓ |
| No, one-shot only | Once generated, today's brief is final. | |
| You decide | Claude picks based on API behavior | |

**User's choice:** Yes, show Regenerate

---

## PDF Preview Approach

### Render Method

| Option | Description | Selected |
|--------|-------------|----------|
| iframe with blob URL | Fetch PDF binary, create blob URL, embed in iframe. Zero dependencies. | ✓ |
| pdf.js canvas rendering | Mozilla's pdf.js renders onto canvas. Full control, ~500KB dependency. | |
| object/embed tag | HTML object/embed with blob URL. Different browser support. | |
| You decide | Claude picks best approach for target browsers | |

**User's choice:** iframe with blob URL

### Past Brief Preview

| Option | Description | Selected |
|--------|-------------|----------|
| PDF preview for past briefs too | Clicking past brief shows its PDF inline using same iframe approach. | ✓ |
| Keep metadata view | Past briefs stay as-is (summary, counts). Only today's gets PDF. | |
| You decide | Claude picks | |

**User's choice:** PDF preview for past briefs too

---

## Download & Sharing

### Filename Format

| Option | Description | Selected |
|--------|-------------|----------|
| vigil-brief-YYYY-MM-DD.pdf | Clean, sortable, branded. | ✓ |
| daily-brief-YYYY-MM-DD.pdf | Generic, descriptive. | |
| You decide | Claude picks sensible format | |

**User's choice:** vigil-brief-YYYY-MM-DD.pdf

### Sharing Actions

| Option | Description | Selected |
|--------|-------------|----------|
| Download only | Single download button. Print available natively via iframe controls. | ✓ |
| Download + Share button | Add Web Share API button for native share sheet. | |
| You decide | Claude picks based on complexity vs value | |

**User's choice:** Download only

---

## Claude's Discretion

- iframe height/sizing approach
- Brief existence check strategy on page load
- Error retry UX details
- Blob URL memory cleanup
- Mobile fallback for unsupported iframe PDF rendering

## Deferred Ideas

None — discussion stayed within phase scope.
