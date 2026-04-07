---
phase: 260407-jem-fix-pdf-insights-cutoff
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - Sources/DailyBrief/PDF/PageThreeRenderer.swift
  - Sources/DailyBrief/PDF/PDFGenerator.swift
autonomous: false
requirements: [QUICK-260407-INSIGHTS-CUTOFF]

must_haves:
  truths:
    - "When a daily brief contains AI insights, the user can read every insight title in full (no 30-char truncation)"
    - "When a daily brief contains AI insights, the user can read every insight message in full (no 60-char truncation, wraps across as many lines as needed)"
    - "When the insights section does not fit on the remaining space of page 3, it spills onto a new page (page 4) instead of being silently dropped"
    - "Up to all available insights are rendered (no arbitrary 5-item cap unless space genuinely runs out across all spillover pages)"
    - "Phase 49 configurability is preserved: layout.enabledSections.contains(\"insights\") still gates the section, and all dimensions still flow from PDFLayout"
    - "Page 1, Page 2, and the Captured Thoughts portion of Page 3 are visually unchanged"
  artifacts:
    - path: "Sources/DailyBrief/PDF/PageThreeRenderer.swift"
      provides: "Insights section rendered with wrapped text and overflow signaling"
      contains: "CTFramesetterSuggestFrameSizeWithConstraints"
    - path: "Sources/DailyBrief/PDF/PDFGenerator.swift"
      provides: "Multi-page page-3 emission when insights overflow"
      contains: "while"
  key_links:
    - from: "PDFGenerator.generate"
      to: "PageThreeRenderer.draw"
      via: "loop that re-invokes PageThreeRenderer with a startIndex until all insights drawn"
      pattern: "PageThreeRenderer\\.draw"
    - from: "PageThreeRenderer.draw"
      to: "drawWrappedInsight helper"
      via: "per-insight call that returns consumed height and a 'didFit' flag"
      pattern: "CTFramesetter"
---

<objective>
Fix the AI Insights section cutoff in the printed daily brief PDF. Today insights are silently dropped because (a) titles are clipped to 30 chars, (b) messages are clipped to 60 chars on a single line with no wrapping, (c) the renderer breaks out of the loop the moment one item won't fit on page 3, and (d) only one page-3 sheet is ever emitted. The user reports insights content is being clipped during their daily print/export workflow.

Fix it so insights wrap fully and spill onto a new page when needed, while preserving every Phase 49 configurability knob (paperSize, fontScale, margins, enabledSections).

Purpose: Restore insights as actually-readable content in the daily print, which is the user's primary surface for reviewing their day.
Output: Updated PageThreeRenderer + PDFGenerator that wrap insight text and emit additional page-3 sheets until all insights are rendered.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/49-configurable-pdf/49-01-SUMMARY.md
@Sources/DailyBrief/PDF/PDFGenerator.swift
@Sources/DailyBrief/PDF/PageThreeRenderer.swift
@Sources/DailyBrief/PDF/PDFStyles.swift

<interfaces>
<!-- Key existing contracts the executor will work against. -->

From Sources/DailyBrief/PDF/PDFGenerator.swift:
```swift
enum PDFGenerator {
    static func generate(data: DailyBriefData, outputPath: String, layout: PDFLayout) throws
    static func cgY(_ topDownY: CGFloat, layout: PDFLayout) -> CGFloat
    static func drawText(_ text: String, at point: CGPoint, font: CTFont, color: CGColor, context: CGContext)
    static func drawTextRight(_ text: String, rightX: CGFloat, y: CGFloat, font: CTFont, color: CGColor, context: CGContext)
}
```

From Sources/DailyBrief/PDF/PageThreeRenderer.swift (current — to be modified):
```swift
enum PageThreeRenderer {
    static func draw(context: CGContext, data: DailyBriefData, layout: PDFLayout)
}
```

From Sources/DailyBrief/PDF/PageTwoRenderer.swift (existing wrap helper to mirror):
```swift
private static func drawWrappedText(_ text: String, in rect: CGRect, font: CTFont, color: CGColor, context: CGContext)
// Uses CTFramesetterCreateWithAttributedString + CTFrameDraw inside a CGPath rect.
// Does NOT return consumed height — Task 1 needs a variant that does.
```

Insight type (from JarvisCore — fields used today in PageThreeRenderer):
```swift
insight.type      // .pattern | .connection | .actionPrompt | .trend
insight.title     // String — currently truncated to .prefix(30)
insight.message   // String — currently truncated to .prefix(60)
```

PDFLayout fields used by the insights section today:
```swift
layout.contentX, layout.contentY, layout.contentWidth, layout.contentHeight
layout.margin, layout.headerSize, layout.bodySize
layout.enabledSections  // Set<String> — must keep gating on "insights"
```
</interfaces>

## Root Cause (verified by reading the code)

In `PageThreeRenderer.swift` lines 186–248 the AI Insights loop:
1. Caps at `data.insights.prefix(5)` (line 206)
2. Calls `String(insight.title.prefix(30))` (line 229) — hard truncation
3. Calls `String(insight.message.prefix(60))` (line 239) — hard truncation, single line, no wrapping
4. `if y + neededSpace > pageBottom { break }` (line 209) — silently drops remaining insights
5. `PDFGenerator.generate` (lines 31–39) only ever emits **one** page-3 sheet — there is no overflow page mechanism

The user-visible symptom ("insights are cut off") comes primarily from #2 + #3 (every multi-line insight is chopped to one short line) and #4 + #5 (when several insights exist, the later ones never render at all because page 3 also carries Unprocessed/Tasks/Recent above them).

The fix must preserve Phase 49 configurability — all dimensions still come from `PDFLayout`, the `enabledSections.contains("insights")` gate stays, and pages 1, 2, and the Captured Thoughts portion of page 3 must render byte-identically.

</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Wrap insights text and report consumed height</name>
  <files>Sources/DailyBrief/PDF/PageThreeRenderer.swift</files>
  <behavior>
    - Insight titles render in full (no .prefix(30)), wrapping across multiple lines if they exceed the content width
    - Insight messages render in full (no .prefix(60)), wrapping across as many lines as needed
    - The renderer can compute, before drawing, how much vertical space a given insight will consume at the current font size and content width
    - The insights loop no longer caps at .prefix(5); it iterates over data.insights in full
    - When an insight does not fit in the remaining space on the current page, the renderer signals "overflow at index N" to its caller instead of silently dropping it
    - The Captured Thoughts / Unprocessed / Tasks / Recent / Therapy Prep sections render exactly as they do today (no visual diff on those sections)
    - layout.enabledSections.contains("insights") still gates whether the section is attempted
  </behavior>
  <action>
    Modify `Sources/DailyBrief/PDF/PageThreeRenderer.swift`:

    1. Change the signature of `PageThreeRenderer.draw` to accept an optional `insightsStartIndex: Int = 0` parameter and to return an `Int?` — the index of the first insight that did NOT fit (nil = all insights drawn or section disabled). This preserves the existing call site contract for callers that pass no startIndex.

       New signature:
       ```swift
       @discardableResult
       static func draw(
           context: CGContext,
           data: DailyBriefData,
           layout: PDFLayout,
           insightsStartIndex: Int = 0
       ) -> Int?
       ```

    2. When `insightsStartIndex > 0`, the function MUST skip rendering the page header ("Captured Thoughts" + date), the horizontal divider, the Unprocessed/Tasks/Recent (`thoughts`) block, and the Therapy Prep block. On a spillover page only the AI Insights section is drawn, starting fresh near the top margin with a small "AI Insights (continued)" header. Use the same `S.headerFont(size: layout.headerSize)` style.

    3. Add a private helper that measures and draws a wrapped string and returns the consumed height. Mirror the existing `PageTwoRenderer.drawWrappedText` pattern but use `CTFramesetterSuggestFrameSizeWithConstraints` to size the frame first:
       ```swift
       private static func drawWrapped(
           _ text: String,
           x: CGFloat,
           topDownY: CGFloat,
           maxWidth: CGFloat,
           font: CTFont,
           color: CGColor,
           layout: PDFLayout,
           context: CGContext
       ) -> CGFloat   // returns height consumed in top-down units
       ```
       Implementation: build the attributed string, create a CTFramesetter, call `CTFramesetterSuggestFrameSizeWithConstraints(framesetter, CFRange(location: 0, length: 0), nil, CGSize(width: maxWidth, height: .greatestFiniteMagnitude), nil)` to get the suggested size, then draw into a CGPath rect of that size positioned at the correct CG (bottom-up) coordinate using `PDFGenerator.cgY`. Return `ceil(suggestedSize.height)`.

       Note: PageTwoRenderer's `drawWrappedText` does NOT return height — do NOT modify that helper. Add a new private helper local to PageThreeRenderer.

    4. Rewrite the insights loop (currently lines ~206–247). The new loop:
       - Iterates `for index in insightsStartIndex..<data.insights.count` (no .prefix(5))
       - For each insight: pre-measures the type label height + wrapped title height + wrapped message height + 4pt spacing
       - If `y + neededHeight > pageBottom` AND at least one insight has already been drawn on this page (or `insightsStartIndex == index` on a spillover page where nothing has been drawn yet — see edge case below), set `overflowIndex = index` and `break`
       - Otherwise draws: bold type label ("Pattern:" / "Connection:" / "Action:" / "Trend:") on the first line, wrapped title to the right of the label (use the new helper with `maxWidth = rightEdge - (leftX + labelWidth)`), then wrapped message indented 8pt with `maxWidth = rightEdge - (leftX + 8)`. Advance `y` by the measured heights.
       - Edge case: if `insightsStartIndex == index` and the single insight is taller than a full page, draw it anyway (it will visually clip at page bottom — acceptable, since looping forever is worse than one truncated mega-insight). Continue with `index + 1` as overflow.

    5. Function returns:
       - `nil` if `!layout.enabledSections.contains("insights")` or `data.insights.isEmpty` or all insights from `insightsStartIndex` were drawn
       - `Int` (the first un-drawn index) if the loop broke due to overflow

    6. On spillover pages (`insightsStartIndex > 0`): start `y` at `layout.margin + 4`, draw the "AI Insights (continued)" header, then run the same insights loop. Skip the Therapy Prep block on spillover pages — therapy prep only renders on the first page-3 sheet.

    7. Do NOT change PageOneRenderer, PageTwoRenderer, or any code outside the insights section + the new return value plumbing. The Captured Thoughts / Unprocessed / Tasks / Recent / Therapy Prep code paths must be byte-identical when `insightsStartIndex == 0`.

    Important constraint per Phase 49: every dimension you use MUST come from `layout` (no hardcoded font sizes, margins, or widths). The 8pt indent and 52pt label width that already exist in the file are fine to keep as local constants.
  </action>
  <verify>
    <automated>swift build 2>&amp;1 | tee /tmp/insights-build.log; grep -E "(error:|warning:)" /tmp/insights-build.log | grep -v "warning: .* is deprecated" | tee /tmp/insights-issues.log; test ! -s /tmp/insights-issues.log</automated>
  </verify>
  <done>
    - `swift build` succeeds with no new errors or non-deprecation warnings
    - `PageThreeRenderer.draw` has the new signature with `insightsStartIndex: Int = 0` default and `Int?` return
    - No `.prefix(30)` or `.prefix(60)` remains in the insights section
    - No `.prefix(5)` cap remains on `data.insights`
    - New `drawWrapped` helper exists and uses `CTFramesetterSuggestFrameSizeWithConstraints`
    - All existing call sites still compile (the default arg + `@discardableResult` ensures this)
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Loop PDFGenerator until all insights are drawn</name>
  <files>Sources/DailyBrief/PDF/PDFGenerator.swift</files>
  <behavior>
    - PDFGenerator emits the first page-3 sheet exactly as today (Captured Thoughts + Unprocessed/Tasks/Recent + Insights + Therapy Prep)
    - If the first sheet returns a non-nil overflow index, PDFGenerator emits additional page-3 sheets, each calling PageThreeRenderer with the previous overflow index, until PageThreeRenderer returns nil
    - There is a hard safety cap of 10 spillover pages to prevent any pathological infinite loop (an insight too tall to ever fit)
    - Pages 1 and 2 are emitted exactly once and are visually unchanged
    - The dashed border is drawn on every page-3 sheet, including spillover sheets
    - The existing `hasThoughts && hasPageThreeSections` guard still applies to the first sheet — if neither thoughts nor insights nor therapyPrep exist, no page 3 is emitted
    - Special case: if there are no thoughts/tasks/recent at all but there ARE insights and `enabledSections` includes "insights", a page-3 sheet IS emitted (today this is missed because the guard requires `hasThoughts`). Fix this regression as part of this task.
  </behavior>
  <action>
    Modify `Sources/DailyBrief/PDF/PDFGenerator.swift` `generate` function (lines ~31–39):

    1. Replace the existing `hasThoughts` guard with a more inclusive check:
       ```swift
       let hasThoughts = !data.unprocessedThoughts.isEmpty || !data.taskThoughts.isEmpty || !data.recentThoughts.isEmpty
       let hasInsights = !data.insights.isEmpty && layout.enabledSections.contains("insights")
       let hasTherapy = (data.therapyPrep?.items.isEmpty == false) && layout.enabledSections.contains("therapyPrep")
       let needsPageThree = (hasThoughts && layout.enabledSections.contains("thoughts")) || hasInsights || hasTherapy
       ```

    2. Replace the single page-3 emission with a loop:
       ```swift
       if needsPageThree {
           var insightsStartIndex = 0
           var pagesEmitted = 0
           let maxPages = 10  // safety cap
           repeat {
               context.beginPage(mediaBox: &mediaBox)
               drawDashedBorder(context: context, layout: layout)
               let nextIndex = PageThreeRenderer.draw(
                   context: context,
                   data: data,
                   layout: layout,
                   insightsStartIndex: insightsStartIndex
               )
               context.endPage()
               pagesEmitted += 1
               if let next = nextIndex, next > insightsStartIndex {
                   insightsStartIndex = next
               } else {
                   break
               }
           } while pagesEmitted < maxPages
       }
       ```

    3. Do NOT change the page 1 or page 2 emission code, the `drawDashedBorder` function, the helper text functions, or `PDFError`.

    4. Add a one-line `Logger.log` entry after the loop reporting how many page-3 sheets were emitted, e.g. `Logger.log("PDF generated at \(outputPath) (\(pagesEmitted) thoughts pages)")` — replacing the existing single log line. If `needsPageThree` is false, log `(0 thoughts pages)`.
  </action>
  <verify>
    <automated>swift build 2>&amp;1 | tee /tmp/insights-gen-build.log; grep -E "(error:|warning:)" /tmp/insights-gen-build.log | grep -v "warning: .* is deprecated" | tee /tmp/insights-gen-issues.log; test ! -s /tmp/insights-gen-issues.log &amp;&amp; swift test --filter PDF 2>&amp;1 | tail -20 || echo "no PDF tests — build-only verification"</automated>
  </verify>
  <done>
    - `swift build` succeeds with no new errors or non-deprecation warnings
    - PDFGenerator.generate contains a `repeat`/`while` loop that re-invokes PageThreeRenderer with the returned overflow index
    - The `maxPages = 10` safety cap is present
    - The `needsPageThree` check correctly emits page 3 even when there are zero thoughts but insights exist
    - Pages 1 and 2 emission code is byte-identical to before
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: User verifies insights render fully in printed PDF</name>
  <what-built>
    - PageThreeRenderer now wraps insight titles and messages in full (no truncation) and reports overflow
    - PDFGenerator now emits additional page-3 sheets when insights don't fit on the first sheet
    - Phase 49 configurability (paper size, font scale, margins, enabledSections) is preserved
  </what-built>
  <how-to-verify>
    1. Run the daily brief generator end-to-end with a real day's data that has at least 3+ insights with long messages. Either:
       - Trigger the normal "generate today's brief" flow from the Mac app, OR
       - Run whatever CLI entry point the project uses (check `Sources/DailyBrief/DailyBrief.swift` if unsure)
    2. Open the generated PDF in Preview.app
    3. Confirm on the AI Insights section:
       - [ ] Every insight title is fully readable (no mid-word cutoff at ~30 chars)
       - [ ] Every insight message is fully readable, wrapping to multiple lines as needed (no mid-sentence cutoff at ~60 chars)
       - [ ] All insights from the day appear (count them against `data.insights.count` in the source data)
       - [ ] If insights overflow, there is a second "Captured Thoughts" sheet (page 4) with header "AI Insights (continued)" containing the remaining insights
    4. Confirm pages 1 and 2 look identical to a brief generated before the fix (compare side-by-side if you have a recent printout)
    5. Confirm the dashed border is drawn on every page including spillover sheets
    6. Try one configurability spot-check: in Settings, change PDF font scale to 1.25x or change paper size to A5, regenerate, and confirm insights still wrap and spill correctly at the new dimensions (Phase 49 didn't regress)
  </how-to-verify>
  <resume-signal>Type "approved" if insights render fully across pages, or describe what's still cut off / wrong.</resume-signal>
</task>

</tasks>

<verification>
- `swift build` succeeds with zero new errors or non-deprecation warnings
- Code review of PageThreeRenderer.swift confirms `.prefix(30)`, `.prefix(60)`, and `.prefix(5)` are all gone from the insights section
- Code review of PDFGenerator.swift confirms the page-3 emission is wrapped in a `repeat`/`while` loop with a `maxPages` safety cap
- Human verification (Task 3) confirms insights render fully in a real generated PDF
</verification>

<success_criteria>
- All `must_haves.truths` are observable in a freshly generated PDF
- No regression on pages 1, 2, or the Captured Thoughts / Unprocessed / Tasks / Recent / Therapy Prep portions of page 3
- Phase 49 configurability knobs (paperSize, fontScale, margins, enabledSections) all still function — verified by the Task 3 spot-check
- The user stops seeing insights cut off in their daily print workflow
</success_criteria>

<output>
After completion, create `.planning/quick/260407-jem-fix-pdf-insights-section-cutoff-bug-prin/260407-jem-SUMMARY.md` documenting:
- Root cause confirmed (which truncations + missing overflow page)
- Files modified
- Whether the user's daily print is now showing insights fully (from Task 3 verification)
</output>
