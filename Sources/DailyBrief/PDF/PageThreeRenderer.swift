import CoreGraphics
import CoreText
import Foundation
import JarvisCore

enum PageThreeRenderer {
    static func draw(context: CGContext, data: DailyBriefData, layout: PDFLayout) {
        let S = PDFStyles.self
        let leftX = layout.contentX + layout.margin
        let rightEdge = layout.contentX + layout.contentWidth - layout.margin

        // Header
        var y: CGFloat = layout.margin + 4
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

            let pageBottom = layout.contentHeight - layout.margin
            let boldFont = CTFontCreateWithName("Helvetica-Bold" as CFString, layout.bodySize, nil)

            for insight in data.insights.prefix(5) {
                // Check if we have enough space for at least the title line + message line
                let neededSpace = layout.bodySize + layout.bodySize + 8
                if y + neededSpace > pageBottom { break }

                // Type label prefix
                let typeLabel: String
                switch insight.type {
                case .pattern: typeLabel = "Pattern:"
                case .connection: typeLabel = "Connection:"
                case .actionPrompt: typeLabel = "Action:"
                case .trend: typeLabel = "Trend:"
                }

                // Draw type label in bold
                PDFGenerator.drawText(
                    typeLabel,
                    at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                    font: boldFont, color: S.darkGray, context: context
                )

                // Draw title after type label (offset by label width)
                let labelWidth: CGFloat = 52
                let titleText = String(insight.title.prefix(30))
                PDFGenerator.drawText(
                    titleText,
                    at: CGPoint(x: leftX + labelWidth, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                    font: S.bodyFont(size: layout.bodySize), color: S.black, context: context
                )
                y += layout.bodySize + 2

                // Draw message indented, truncated to fit
                if y + layout.bodySize <= pageBottom {
                    let messageText = String(insight.message.prefix(60))
                    PDFGenerator.drawText(
                        messageText,
                        at: CGPoint(x: leftX + 8, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                        font: S.bodyFont(size: layout.bodySize), color: S.darkGray, context: context
                    )
                    y += layout.bodySize + 4
                }
            }
        }

        // THERAPY PREP SECTION (only if prep exists with items and enabled)
        if layout.enabledSections.contains("therapyPrep"), let prep = data.therapyPrep, !prep.items.isEmpty {
            let pageBottom = layout.contentHeight - layout.margin

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
