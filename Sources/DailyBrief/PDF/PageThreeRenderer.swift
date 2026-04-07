import CoreGraphics
import CoreText
import Foundation
import JarvisCore

enum PageThreeRenderer {
    /// Draws page 3 (Captured Thoughts + insights + therapy prep).
    ///
    /// - Parameter insightsStartIndex: Index to start rendering insights at. When > 0,
    ///   the function skips the page header, thoughts block, and therapy prep — only
    ///   the insights section is drawn (as a spillover continuation page).
    /// - Returns: The index of the first insight that did NOT fit on this page, or nil
    ///   if all insights were drawn (or the section is disabled/empty).
    @discardableResult
    static func draw(
        context: CGContext,
        data: DailyBriefData,
        layout: PDFLayout,
        insightsStartIndex: Int = 0
    ) -> Int? {
        let S = PDFStyles.self
        let leftX = layout.contentX + layout.margin
        let rightEdge = layout.contentX + layout.contentWidth - layout.margin
        let pageBottom = layout.contentHeight - layout.margin

        var y: CGFloat = layout.margin + 4

        // Spillover page: skip header + thoughts + therapy, draw only "AI Insights (continued)".
        if insightsStartIndex > 0 {
            guard layout.enabledSections.contains("insights"),
                  insightsStartIndex < data.insights.count else {
                return nil
            }

            PDFGenerator.drawText(
                "AI Insights (continued)",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.headerSize, layout: layout)),
                font: S.headerFont(size: layout.headerSize), color: S.black, context: context
            )
            y += layout.headerSize + 4

            return drawInsightsLoop(
                context: context,
                data: data,
                layout: layout,
                startIndex: insightsStartIndex,
                leftX: leftX,
                rightEdge: rightEdge,
                pageBottom: pageBottom,
                initialY: y
            )
        }

        // ========== FIRST PAGE PATH (unchanged except for insights section) ==========

        // Header
        PDFGenerator.drawText(
            "Captured Thoughts",
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.titleSize, layout: layout)),
            font: S.titleFont(size: layout.titleSize), color: S.black, context: context
        )
        y += layout.titleSize + 2
        PDFGenerator.drawText(
            data.dateString,
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
            font: S.bodyFont(size: layout.bodySize), color: S.darkGray, context: context
        )
        y += layout.bodySize + 6

        // Horizontal line under header
        context.setStrokeColor(S.lightGray)
        context.setLineWidth(0.5)
        context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y, layout: layout)))
        context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y, layout: layout)))
        context.strokePath()
        y += 6

        if layout.enabledSections.contains("thoughts") {
            // UNPROCESSED SECTION
            PDFGenerator.drawText(
                "Unprocessed",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.headerSize, layout: layout)),
                font: S.headerFont(size: layout.headerSize), color: S.black, context: context
            )
            y += layout.headerSize + 4

            if data.unprocessedThoughts.isEmpty {
                PDFGenerator.drawText(
                    "All caught up!",
                    at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                    font: S.bodyFont(size: layout.bodySize), color: S.medGray, context: context
                )
                y += layout.bodySize + 6
            } else {
                for thought in data.unprocessedThoughts.prefix(5) {
                    y = drawThoughtItem(
                        content: thought.content,
                        sourceLabel: thought.source.rawValue,
                        leftX: leftX,
                        rightEdge: rightEdge,
                        y: y,
                        context: context,
                        layout: layout
                    )
                }
            }

            // Divider
            y += 4
            context.setStrokeColor(S.lightGray)
            context.setLineWidth(0.5)
            context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y, layout: layout)))
            context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y, layout: layout)))
            context.strokePath()
            y += 6

            // TASKS SECTION
            PDFGenerator.drawText(
                "Tasks",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.headerSize, layout: layout)),
                font: S.headerFont(size: layout.headerSize), color: S.black, context: context
            )
            y += layout.headerSize + 4

            let cbIndent = layout.checkboxSize + 4

            if data.taskThoughts.isEmpty {
                PDFGenerator.drawText(
                    "No task thoughts captured",
                    at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                    font: S.bodyFont(size: layout.bodySize), color: S.medGray, context: context
                )
                y += layout.bodySize + 6
            } else {
                // Sort tasks: inProgress first, then open, then done
                let sortedTasks = data.taskThoughts.sorted { a, b in
                    let order: (TaskStatus?) -> Int = { status in
                        switch status {
                        case .inProgress: return 0
                        case .open, nil: return 1
                        case .done: return 2
                        }
                    }
                    let oa = order(a.taskStatus)
                    let ob = order(b.taskStatus)
                    if oa != ob { return oa < ob }
                    return a.createdAt > b.createdAt
                }

                for thought in sortedTasks.prefix(8) {
                    let cbY = PDFGenerator.cgY(y + layout.checkboxSize + 1, layout: layout)
                    let status = thought.taskStatus

                    // Draw status-aware checkbox
                    context.setStrokeColor(S.darkGray)
                    context.setLineWidth(0.5)
                    switch status {
                    case .done:
                        // Filled checkbox
                        context.setFillColor(S.darkGray)
                        context.fill(CGRect(x: leftX, y: cbY, width: layout.checkboxSize, height: layout.checkboxSize))
                    case .inProgress:
                        // Stroked checkbox with centered dot
                        context.stroke(CGRect(x: leftX, y: cbY, width: layout.checkboxSize, height: layout.checkboxSize))
                        let dotSize: CGFloat = 3
                        let dotX = leftX + (layout.checkboxSize - dotSize) / 2
                        let dotY = cbY + (layout.checkboxSize - dotSize) / 2
                        context.setFillColor(S.darkGray)
                        context.fillEllipse(in: CGRect(x: dotX, y: dotY, width: dotSize, height: dotSize))
                    case .open, nil:
                        // Empty checkbox (current behavior)
                        context.stroke(CGRect(x: leftX, y: cbY, width: layout.checkboxSize, height: layout.checkboxSize))
                    }

                    // Task content — done tasks in lighter gray
                    let textColor = status == .done ? S.medGray : S.black
                    let taskText = String(thought.content.prefix(45))
                    PDFGenerator.drawText(
                        taskText,
                        at: CGPoint(x: leftX + cbIndent, y: cbY + 1),
                        font: S.bodyFont(size: layout.bodySize), color: textColor, context: context
                    )
                    y += layout.tableRowHeight
                }
            }

            // Divider
            y += 4
            context.setStrokeColor(S.lightGray)
            context.setLineWidth(0.5)
            context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y, layout: layout)))
            context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y, layout: layout)))
            context.strokePath()
            y += 6

            // RECENT CAPTURES SECTION (only if non-empty)
            if !data.recentThoughts.isEmpty {
                PDFGenerator.drawText(
                    "Recent",
                    at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.headerSize, layout: layout)),
                    font: S.headerFont(size: layout.headerSize), color: S.black, context: context
                )
                y += layout.headerSize + 4

                for thought in data.recentThoughts.prefix(5) {
                    let catLabel = thought.category?.rawValue ?? "misc"
                    let monoFont = CTFontCreateWithName("Menlo" as CFString, layout.smallSize, nil)

                    PDFGenerator.drawText(
                        catLabel,
                        at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.smallSize, layout: layout)),
                        font: monoFont, color: S.medGray, context: context
                    )

                    // Content after category label (offset by ~50pt for label width)
                    let contentX = leftX + 50
                    let contentText = String(thought.content.prefix(35))
                    PDFGenerator.drawText(
                        contentText,
                        at: CGPoint(x: contentX, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                        font: S.bodyFont(size: layout.bodySize), color: S.darkGray, context: context
                    )
                    y += layout.bodySize + 4
                }
            }
        }

        // AI INSIGHTS SECTION (only if non-empty and enabled)
        var overflowIndex: Int? = nil
        if layout.enabledSections.contains("insights") && !data.insights.isEmpty {
            // Divider before insights
            y += 4
            context.setStrokeColor(S.lightGray)
            context.setLineWidth(0.5)
            context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y, layout: layout)))
            context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y, layout: layout)))
            context.strokePath()
            y += 6

            PDFGenerator.drawText(
                "AI Insights",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.headerSize, layout: layout)),
                font: S.headerFont(size: layout.headerSize), color: S.black, context: context
            )
            y += layout.headerSize + 4

            overflowIndex = drawInsightsLoop(
                context: context,
                data: data,
                layout: layout,
                startIndex: 0,
                leftX: leftX,
                rightEdge: rightEdge,
                pageBottom: pageBottom,
                initialY: y
            )
            // Note: overflowIndex drives the caller to emit a spillover page. We don't
            // need the updated `y` here because Therapy Prep only renders on the first
            // sheet and the insights section is the last thing drawn when there is
            // no therapy prep, OR therapy prep renders below whatever insights fit.
            // For simplicity, we also skip therapy prep if insights overflowed — it
            // will not fit anyway. See check below.
        }

        // THERAPY PREP SECTION (only if prep exists with items and enabled)
        // Only draw therapy prep on the first sheet when insights did NOT overflow.
        // If insights overflowed, the remaining space on this page is already full.
        if overflowIndex == nil,
           layout.enabledSections.contains("therapyPrep"),
           let prep = data.therapyPrep,
           !prep.items.isEmpty {
            // We need to recompute `y` after the insights section drew. Since the
            // insights loop doesn't return `y` (only overflow index), we track it
            // inside the loop and return it via a side channel. Simpler: recompute
            // by asking the loop for the post-draw y. We refactor below — for now,
            // since overflow is nil, all insights were drawn and we can recompute
            // the consumed height locally.
            //
            // To avoid duplicating work, we simply re-advance `y` by measuring the
            // drawn insights (same math as the loop).
            if layout.enabledSections.contains("insights") && !data.insights.isEmpty {
                y = measureInsightsConsumedY(
                    data: data,
                    layout: layout,
                    startIndex: 0,
                    leftX: leftX,
                    rightEdge: rightEdge,
                    initialY: y
                )
            }

            // Divider before therapy prep
            y += 4
            context.setStrokeColor(S.lightGray)
            context.setLineWidth(0.5)
            context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y, layout: layout)))
            context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y, layout: layout)))
            context.strokePath()
            y += 6

            // Check if we have space for at least the header + one item
            let minSpace = layout.headerSize + layout.bodySize + layout.bodySize + 16
            if y + minSpace <= pageBottom {
                PDFGenerator.drawText(
                    "Therapy Prep",
                    at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.headerSize, layout: layout)),
                    font: S.headerFont(size: layout.headerSize), color: S.black, context: context
                )
                y += layout.headerSize + 4

                // Patterns sub-section (compact, up to 3)
                if !data.therapyPatterns.isEmpty {
                    for pattern in data.therapyPatterns.prefix(3) {
                        if y + layout.bodySize > pageBottom { break }
                        let patternText = "\u{2022} \(pattern.theme) (\(pattern.trend))"
                        PDFGenerator.drawText(
                            patternText,
                            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                            font: S.bodyFont(size: layout.bodySize), color: S.darkGray, context: context
                        )
                        y += layout.bodySize + 2
                    }
                    y += 2
                }

                // Prep items (up to 5)
                let boldFont = CTFontCreateWithName("Helvetica-Bold" as CFString, layout.bodySize, nil)
                for item in prep.items.prefix(5) {
                    // Need space for topic line + context line
                    let neededSpace = layout.bodySize + layout.bodySize + 8
                    if y + neededSpace > pageBottom { break }

                    // Urgency indicator (filled circle)
                    let urgencyColor: CGColor
                    switch item.urgency.lowercased() {
                    case "high": urgencyColor = S.black
                    case "medium": urgencyColor = S.darkGray
                    default: urgencyColor = S.medGray
                    }
                    let dotSize: CGFloat = 4
                    let dotY = PDFGenerator.cgY(y + layout.bodySize, layout: layout) + (layout.bodySize - dotSize) / 2
                    context.setFillColor(urgencyColor)
                    context.fillEllipse(in: CGRect(x: leftX, y: dotY, width: dotSize, height: dotSize))

                    // Topic in bold
                    let topicText = String(item.topic.prefix(40))
                    PDFGenerator.drawText(
                        topicText,
                        at: CGPoint(x: leftX + dotSize + 4, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                        font: boldFont, color: S.black, context: context
                    )
                    y += layout.bodySize + 2

                    // Context indented, truncated
                    if y + layout.bodySize <= pageBottom {
                        let contextText = String(item.context.prefix(60))
                        PDFGenerator.drawText(
                            contextText,
                            at: CGPoint(x: leftX + 8, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                            font: S.bodyFont(size: layout.bodySize), color: S.darkGray, context: context
                        )
                        y += layout.bodySize + 4
                    }
                }

                // Suggested focus (if exists and space allows)
                if !prep.suggestedFocus.isEmpty, y + layout.bodySize <= pageBottom {
                    let italicFont = CTFontCreateWithName("Helvetica-Oblique" as CFString, layout.bodySize, nil)
                    let focusText = "Focus: \(prep.suggestedFocus)"
                    PDFGenerator.drawText(
                        String(focusText.prefix(70)),
                        at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                        font: italicFont, color: S.darkGray, context: context
                    )
                    y += layout.bodySize + 4
                }
            }
        }

        return overflowIndex
    }

    // MARK: - Insights Loop (shared by first page + spillover)

    /// Draws insights starting at `startIndex`. Returns the index of the first
    /// insight that did not fit (nil = all drawn).
    private static func drawInsightsLoop(
        context: CGContext,
        data: DailyBriefData,
        layout: PDFLayout,
        startIndex: Int,
        leftX: CGFloat,
        rightEdge: CGFloat,
        pageBottom: CGFloat,
        initialY: CGFloat
    ) -> Int? {
        let S = PDFStyles.self
        let boldFont = CTFontCreateWithName("Helvetica-Bold" as CFString, layout.bodySize, nil)
        let bodyFont = S.bodyFont(size: layout.bodySize)

        let labelWidth: CGFloat = 52
        let messageIndent: CGFloat = 8

        var y = initialY
        var drawnOnThisPage = 0

        for index in startIndex..<data.insights.count {
            let insight = data.insights[index]

            // Type label prefix
            let typeLabel: String
            switch insight.type {
            case .pattern: typeLabel = "Pattern:"
            case .connection: typeLabel = "Connection:"
            case .actionPrompt: typeLabel = "Action:"
            case .trend: typeLabel = "Trend:"
            }

            // Pre-measure wrapped title and message heights
            let titleMaxWidth = (rightEdge - (leftX + labelWidth))
            let messageMaxWidth = (rightEdge - (leftX + messageIndent))

            let titleHeight = measureWrapped(
                insight.title, maxWidth: titleMaxWidth, font: bodyFont
            )
            let messageHeight = measureWrapped(
                insight.message, maxWidth: messageMaxWidth, font: bodyFont
            )

            // The first line of the insight is "label + title" — so the vertical
            // space consumed is max(labelLineHeight, titleHeight), then a 2pt gap,
            // then the message, then a 4pt gap.
            let labelLineHeight = layout.bodySize
            let firstLineHeight = max(labelLineHeight, titleHeight)
            let neededHeight = firstLineHeight + 2 + messageHeight + 4

            // If this insight won't fit AND we've already drawn at least one on this
            // page, break and report overflow.
            if y + neededHeight > pageBottom {
                if drawnOnThisPage > 0 {
                    return index
                }
                // Edge case: we haven't drawn anything yet (either first page with
                // no insights fit, or spillover page with a mega-insight). Draw it
                // anyway — visual clip at the bottom is better than looping forever.
            }

            // Draw type label
            PDFGenerator.drawText(
                typeLabel,
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                font: boldFont, color: S.darkGray, context: context
            )

            // Draw wrapped title to the right of the label
            _ = drawWrapped(
                insight.title,
                x: leftX + labelWidth,
                topDownY: y,
                maxWidth: titleMaxWidth,
                font: bodyFont,
                color: S.black,
                layout: layout,
                context: context
            )

            y += firstLineHeight + 2

            // Draw wrapped message indented
            _ = drawWrapped(
                insight.message,
                x: leftX + messageIndent,
                topDownY: y,
                maxWidth: messageMaxWidth,
                font: bodyFont,
                color: S.darkGray,
                layout: layout,
                context: context
            )

            y += messageHeight + 4
            drawnOnThisPage += 1

            // If we had to force-draw a too-tall insight (edge case above), signal
            // the next index as overflow so the caller emits a new page.
            if y > pageBottom {
                let nextIndex = index + 1
                return nextIndex < data.insights.count ? nextIndex : nil
            }
        }

        return nil
    }

    /// Measures where `y` would land after the insights loop consumed `startIndex..<end`,
    /// without drawing. Used to position therapy prep after insights on the first sheet
    /// when all insights fit. This is a layout-only calculation mirroring drawInsightsLoop.
    private static func measureInsightsConsumedY(
        data: DailyBriefData,
        layout: PDFLayout,
        startIndex: Int,
        leftX: CGFloat,
        rightEdge: CGFloat,
        initialY: CGFloat
    ) -> CGFloat {
        let S = PDFStyles.self
        let bodyFont = S.bodyFont(size: layout.bodySize)
        let labelWidth: CGFloat = 52
        let messageIndent: CGFloat = 8
        var y = initialY
        for index in startIndex..<data.insights.count {
            let insight = data.insights[index]
            let titleMaxWidth = (rightEdge - (leftX + labelWidth))
            let messageMaxWidth = (rightEdge - (leftX + messageIndent))
            let titleHeight = measureWrapped(insight.title, maxWidth: titleMaxWidth, font: bodyFont)
            let messageHeight = measureWrapped(insight.message, maxWidth: messageMaxWidth, font: bodyFont)
            let firstLineHeight = max(layout.bodySize, titleHeight)
            y += firstLineHeight + 2 + messageHeight + 4
        }
        return y
    }

    // MARK: - Wrapped text helpers

    /// Measure the height a wrapped string would consume at the given max width.
    private static func measureWrapped(_ text: String, maxWidth: CGFloat, font: CTFont) -> CGFloat {
        guard !text.isEmpty else { return 0 }
        let attributes = [
            kCTFontAttributeName: font
        ] as CFDictionary
        let attrString = CFAttributedStringCreate(nil, text as CFString, attributes)!
        let framesetter = CTFramesetterCreateWithAttributedString(attrString)
        let suggested = CTFramesetterSuggestFrameSizeWithConstraints(
            framesetter,
            CFRange(location: 0, length: 0),
            nil,
            CGSize(width: maxWidth, height: .greatestFiniteMagnitude),
            nil
        )
        return ceil(suggested.height)
    }

    /// Draw a wrapped string and return the consumed height (top-down units).
    @discardableResult
    private static func drawWrapped(
        _ text: String,
        x: CGFloat,
        topDownY: CGFloat,
        maxWidth: CGFloat,
        font: CTFont,
        color: CGColor,
        layout: PDFLayout,
        context: CGContext
    ) -> CGFloat {
        guard !text.isEmpty else { return 0 }
        let attributes = [
            kCTFontAttributeName: font,
            kCTForegroundColorAttributeName: color
        ] as CFDictionary
        let attrString = CFAttributedStringCreate(nil, text as CFString, attributes)!
        let framesetter = CTFramesetterCreateWithAttributedString(attrString)
        let suggested = CTFramesetterSuggestFrameSizeWithConstraints(
            framesetter,
            CFRange(location: 0, length: 0),
            nil,
            CGSize(width: maxWidth, height: .greatestFiniteMagnitude),
            nil
        )
        let height = ceil(suggested.height)

        // Position rect: topDownY is the top of the rect in top-down coords.
        // CG rect origin is bottom-left, so cgY at (topDownY + height) gives us
        // the bottom edge of the rect.
        let rect = CGRect(
            x: x,
            y: PDFGenerator.cgY(topDownY + height, layout: layout),
            width: maxWidth,
            height: height
        )
        let path = CGPath(rect: rect, transform: nil)
        let frame = CTFramesetterCreateFrame(framesetter, CFRange(location: 0, length: 0), path, nil)
        CTFrameDraw(frame, context)
        return height
    }

    /// Draw a thought item with bullet, truncated content, and source indicator.
    private static func drawThoughtItem(
        content: String,
        sourceLabel: String,
        leftX: CGFloat,
        rightEdge: CGFloat,
        y: CGFloat,
        context: CGContext,
        layout: PDFLayout
    ) -> CGFloat {
        let S = PDFStyles.self
        var currentY = y
        let bulletIndent: CGFloat = 10

        // Bullet
        PDFGenerator.drawText(
            "\u{2022}",
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(currentY + layout.bodySize, layout: layout)),
            font: S.bodyFont(size: layout.bodySize), color: S.darkGray, context: context
        )

        // Content (up to 2 lines, ~35 chars per line)
        let maxCharsPerLine = 35
        let text = String(content.prefix(maxCharsPerLine * 2))

        if text.count <= maxCharsPerLine {
            PDFGenerator.drawText(
                text,
                at: CGPoint(x: leftX + bulletIndent, y: PDFGenerator.cgY(currentY + layout.bodySize, layout: layout)),
                font: S.bodyFont(size: layout.bodySize), color: S.darkGray, context: context
            )
            currentY += layout.bodySize + 1
        } else {
            let line1 = String(text.prefix(maxCharsPerLine))
            let breakIdx = line1.lastIndex(of: " ") ?? line1.endIndex
            let first = String(text[text.startIndex..<breakIdx])
            let rest = String(text[breakIdx...].dropFirst()).prefix(maxCharsPerLine)

            PDFGenerator.drawText(
                first,
                at: CGPoint(x: leftX + bulletIndent, y: PDFGenerator.cgY(currentY + layout.bodySize, layout: layout)),
                font: S.bodyFont(size: layout.bodySize), color: S.darkGray, context: context
            )
            currentY += layout.bodySize + 1
            PDFGenerator.drawText(
                String(rest),
                at: CGPoint(x: leftX + bulletIndent, y: PDFGenerator.cgY(currentY + layout.bodySize, layout: layout)),
                font: S.bodyFont(size: layout.bodySize), color: S.darkGray, context: context
            )
            currentY += layout.bodySize + 1
        }

        // Source indicator (tiny mono)
        let tinyMono = CTFontCreateWithName("Menlo" as CFString, layout.tinySize, nil)
        PDFGenerator.drawTextRight(
            sourceLabel,
            rightX: rightEdge,
            y: PDFGenerator.cgY(currentY + layout.tinySize - 1, layout: layout),
            font: tinyMono, color: S.medGray, context: context
        )
        currentY += layout.tinySize + 4

        return currentY
    }
}
