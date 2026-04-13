---
phase: 75-pdf-generation-engine
reviewed: 2026-04-12T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - vigil-core/src/services/pdf-service.ts
  - vigil-core/src/services/pdf-types.ts
  - vigil-core/src/services/pdf-service.test.ts
  - vigil-core/package.json
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 75: Code Review Report

**Reviewed:** 2026-04-12T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

The PDF generation engine is well-structured overall. The DI factory pattern (`createPdfRenderer`), explicit section caps (T-75-01/T-75-05), and spillover page logic (T-75-04) are all solid. No security vulnerabilities or crashes were found. Four warnings flag correctness issues that can produce wrong visual output under realistic inputs (affirmation text overwrite, strikethrough wrong width for wrapped text, `nowFn` dead code, and uncapped standings rows). Three info items cover dead code and minor duplication.

---

## Warnings

### WR-01: Affirmation text height uses a fixed constant instead of measured height — content can overlap notes section

**File:** `vigil-core/src/services/pdf-service.ts:417-426`

**Issue:** `affirmationBoxHeight` is set to a hardcoded `40` or `60` points based on compact mode, but `doc.text()` with `width` wrapping will silently flow onto as many lines as the text requires. If an affirmation is long and wraps beyond the fixed budget, `y` is still advanced by only that constant. The notes section is anchored to `contentBottom - 70`, so it won't overwrite content — but the affirmation text itself will visually collide with, or be clipped by, anything drawn after it on the same `y` track. The correct pattern is to measure the rendered height and use that for the `y` advance.

**Fix:**
```typescript
// Replace fixed constant with a measured height
const affW = layout.usableWidth - 8;
const affirmationH = doc
  .font("Inter-Regular")
  .fontSize(layout.bodySize)
  .heightOfString(data.affirmation, { width: affW });

doc
  .font("Inter-Regular")
  .fontSize(layout.bodySize)
  .fillColor(COLORS.bodyText)
  .text(data.affirmation, leftX + 4, y, { width: affW });

y += affirmationH + 4;
// Remove: y += affirmationBoxHeight + 4;
```

---

### WR-02: Strikethrough line on task thoughts uses single-line width — wrong for wrapped text

**File:** `vigil-core/src/services/pdf-service.ts:264-273`

**Issue:** The strikethrough for done task thoughts is drawn using `doc.widthOfString(thought.content)` clamped to `textW`. For text that wraps across multiple lines, `widthOfString` returns the full unsplit string width, which can be wider than `textW`. The clamp to `textW` causes the line to extend edge-to-edge regardless of the actual last-line content width. This is a purely visual bug, but it makes the strikethrough look wrong on short last lines of wrapped tasks.

The same issue exists in `drawWorkOrder` at line 1101 for `wo.shortDescription`.

**Fix:** For a correct multi-line strikethrough, draw a rectangle or use a separate visual treatment. The simplest acceptable fix is to use `textW` directly as the width (which is already the max), accepting that the line will always span the full column — this is the more common PDF convention and removes the confusing `Math.min`:

```typescript
// Task thoughts strikethrough (line 269):
doc
  .moveTo(textX, strikeY)
  .lineTo(textX + textW, strikeY)   // full column width
  .lineWidth(0.5)
  .strokeColor(COLORS.subtext)
  .stroke();

// Work order strikethrough (line 1101):
doc
  .moveTo(leftX + cbIndent, strikeY)
  .lineTo(leftX + cbIndent + textW, strikeY)
  .lineWidth(0.5)
  .strokeColor(COLORS.subtext)
  .stroke();
```

---

### WR-03: `nowFn` is injected as a dependency but immediately discarded — always calls real clock

**File:** `vigil-core/src/services/pdf-service.ts:50`

**Issue:** `void nowFn();` calls the injected clock function and throws away the result. The comment says it's "consumed if needed for future date-stamping" but `formatDate(data.date)` is used everywhere, so `nowFn` never actually affects output. This means a test that injects a fake clock to verify date rendering would not work — the clock dependency is a lie. Either use it or remove it.

**Fix (remove the dead dep):**
```typescript
// In PdfRendererDeps — remove:
//   nowFn?: () => Date;

// In createPdfRenderer — remove:
//   const nowFn = deps.nowFn ?? (() => new Date());

// In renderBrief — remove:
//   void nowFn();
```

If you intend to use it for stamping the PDF creation time in metadata, wire it up:
```typescript
// Example: stamp PDF metadata
doc.info['CreationDate'] = nowFn();
```

---

### WR-04: Standings table rows are not capped — a large standings array can overflow page bottom

**File:** `vigil-core/src/services/pdf-service.ts:580-604`

**Issue:** The standings loop `for (const entry of league.standings)` has no item cap and no `y > pageBottom` guard. The comment at line 579 references T-75-05 but applies no limit. An MLB division with 5 teams renders fine, but a caller could pass a full 30-team list (or a stale/malformed payload with duplicates), pushing `y` well past `contentBottom`. Content drawn below the page bottom is clipped in PDF but the `y` cursor keeps advancing, offsetting everything drawn after the standings block on the same page.

**Fix:**
```typescript
// Cap standings at the division size (5 is the MLB standard; 8 is a safe upper bound)
const MAX_STANDINGS_ROWS = 8;
for (const entry of league.standings.slice(0, MAX_STANDINGS_ROWS)) {
  // also add a y-guard inside the loop
  if (y + layout.tableRowHeight > contentBottom) break;
  // ... existing row drawing ...
}
```

---

## Info

### IN-01: `taskStatusRank` is duplicated — identical logic exists in two places

**File:** `vigil-core/src/services/pdf-service.ts:1169-1180` and `1186-1197`

**Issue:** `taskStatusRank` (standalone function, line 1169) and the inner `statusRank` closure in `sortWorkOrders` (line 1186) have identical switch logic. This is harmless now but means future status changes (e.g. adding a "blocked" state) need updating in two places.

**Fix:** Have `sortWorkOrders` call `taskStatusRank` instead of defining its own closure:
```typescript
function sortWorkOrders(orders: BriefWorkOrder[], priorityOrder?: string[]): BriefWorkOrder[] {
  return [...orders].sort((a, b) => {
    const rankA = taskStatusRank(a.status);
    const rankB = taskStatusRank(b.status);
    // ...
  });
}
```

---

### IN-02: `sortThoughts` sorts oldest-first within same status (ascending `createdAt`) — opposite of `drawPageThree` sort

**File:** `vigil-core/src/services/pdf-service.ts:1238`

**Issue:** `sortThoughts` (used for page-1 task display) sorts by `a.createdAt.localeCompare(b.createdAt)` — oldest first within the same status rank. The inline sort in `drawPageThree` (line 685) explicitly sorts `b.createdAt.localeCompare(a.createdAt)` — newest first within the same rank. This inconsistency may be intentional (page 1 is priority-ordered, page 3 is recency-ordered), but the asymmetry is non-obvious and the function name `sortThoughts` gives no indication.

**Fix:** If the difference is intentional, rename to `sortThoughtsByStatusThenOldest` and add a brief comment. If it's a bug, flip the comparator to match page 3's newest-first ordering.

---

### IN-03: `drawSectionHeader` and `drawDivider` are defined but `drawPageOne` never calls them — it inlines equivalent code instead

**File:** `vigil-core/src/services/pdf-service.ts:105-133` vs `163-173`, `178-184`

**Issue:** The shared helpers `drawDivider` and `drawSectionHeader` are used extensively on pages 2 and 3, but `drawPageOne` duplicates their logic inline (the divider at lines 163-173, and the "Work Orders" header at 178-184). This is a minor consistency issue that could cause divergence if the helpers are updated (e.g., changing divider color or spacing).

**Fix:** Replace the inline duplicates in `drawPageOne` with calls to the shared helpers:
```typescript
// Replace inline divider:
y = drawDivider(doc, leftX, rightEdge, y);

// Replace inline section headers:
y = drawSectionHeader(doc, "Work Orders", leftX, y, layout);
y = drawSectionHeader(doc, "Tasks", leftX, y, layout);
```

---

_Reviewed: 2026-04-12T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
