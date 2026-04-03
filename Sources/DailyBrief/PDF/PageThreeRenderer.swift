import CoreGraphics
import CoreText
import Foundation
import JarvisCore

enum PageThreeRenderer {
    static func draw(context: CGContext, data: DailyBriefData) {
        let S = PDFStyles.self
        let leftX = S.contentX + S.margin
        let rightEdge = S.contentX + S.contentWidth - S.margin

        // Header
        var y: CGFloat = S.margin + 4
        PDFGenerator.drawText(
            "Captured Thoughts",
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.titleSize)),
            font: S.titleFont(), color: S.black, context: context
        )
        y += S.titleSize + 2
        PDFGenerator.drawText(
            data.dateString,
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.bodySize)),
            font: S.bodyFont(), color: S.darkGray, context: context
        )
        y += S.bodySize + 6

        // Horizontal line under header
        context.setStrokeColor(S.lightGray)
        context.setLineWidth(0.5)
        context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y)))
        context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y)))
        context.strokePath()
        y += 6

        // UNPROCESSED SECTION
        PDFGenerator.drawText(
            "Unprocessed",
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.headerSize)),
            font: S.headerFont(), color: S.black, context: context
        )
        y += S.headerSize + 4

        if data.unprocessedThoughts.isEmpty {
            PDFGenerator.drawText(
                "All caught up!",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.bodySize)),
                font: S.bodyFont(), color: S.medGray, context: context
            )
            y += S.bodySize + 6
        } else {
            for thought in data.unprocessedThoughts.prefix(5) {
                y = drawThoughtItem(
                    content: thought.content,
                    sourceLabel: thought.source.rawValue,
                    leftX: leftX,
                    rightEdge: rightEdge,
                    y: y,
                    context: context
                )
            }
        }

        // Divider
        y += 4
        context.setStrokeColor(S.lightGray)
        context.setLineWidth(0.5)
        context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y)))
        context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y)))
        context.strokePath()
        y += 6

        // TASKS SECTION
        PDFGenerator.drawText(
            "Tasks",
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.headerSize)),
            font: S.headerFont(), color: S.black, context: context
        )
        y += S.headerSize + 4

        let cbIndent = S.checkboxSize + 4

        if data.taskThoughts.isEmpty {
            PDFGenerator.drawText(
                "No task thoughts captured",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.bodySize)),
                font: S.bodyFont(), color: S.medGray, context: context
            )
            y += S.bodySize + 6
        } else {
            for thought in data.taskThoughts.prefix(8) {
                // Checkbox
                let cbY = PDFGenerator.cgY(y + S.checkboxSize + 1)
                context.setStrokeColor(S.darkGray)
                context.setLineWidth(0.5)
                context.stroke(CGRect(x: leftX, y: cbY, width: S.checkboxSize, height: S.checkboxSize))

                // Task content
                let taskText = String(thought.content.prefix(45))
                PDFGenerator.drawText(
                    taskText,
                    at: CGPoint(x: leftX + cbIndent, y: cbY + 1),
                    font: S.bodyFont(), color: S.black, context: context
                )
                y += S.tableRowHeight
            }
        }

        // Divider
        y += 4
        context.setStrokeColor(S.lightGray)
        context.setLineWidth(0.5)
        context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y)))
        context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y)))
        context.strokePath()
        y += 6

        // RECENT CAPTURES SECTION (only if non-empty)
        if !data.recentThoughts.isEmpty {
            PDFGenerator.drawText(
                "Recent",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.headerSize)),
                font: S.headerFont(), color: S.black, context: context
            )
            y += S.headerSize + 4

            for thought in data.recentThoughts.prefix(5) {
                let catLabel = thought.category?.rawValue ?? "misc"
                let monoFont = CTFontCreateWithName("Menlo" as CFString, S.smallSize, nil)

                PDFGenerator.drawText(
                    catLabel,
                    at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.smallSize)),
                    font: monoFont, color: S.medGray, context: context
                )

                // Content after category label (offset by ~50pt for label width)
                let contentX = leftX + 50
                let contentText = String(thought.content.prefix(35))
                PDFGenerator.drawText(
                    contentText,
                    at: CGPoint(x: contentX, y: PDFGenerator.cgY(y + S.bodySize)),
                    font: S.bodyFont(), color: S.darkGray, context: context
                )
                y += S.bodySize + 4
            }
        }

        // AI INSIGHTS SECTION (only if non-empty)
        if !data.insights.isEmpty {
            // Divider before insights
            y += 4
            context.setStrokeColor(S.lightGray)
            context.setLineWidth(0.5)
            context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y)))
            context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y)))
            context.strokePath()
            y += 6

            PDFGenerator.drawText(
                "AI Insights",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.headerSize)),
                font: S.headerFont(), color: S.black, context: context
            )
            y += S.headerSize + 4

            let pageBottom = S.contentHeight - S.margin
            let boldFont = CTFontCreateWithName("Helvetica-Bold" as CFString, S.bodySize, nil)

            for insight in data.insights.prefix(5) {
                // Check if we have enough space for at least the title line + message line
                let neededSpace = S.bodySize + S.bodySize + 8
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
                    at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.bodySize)),
                    font: boldFont, color: S.darkGray, context: context
                )

                // Draw title after type label (offset by label width)
                let labelWidth: CGFloat = 52
                let titleText = String(insight.title.prefix(30))
                PDFGenerator.drawText(
                    titleText,
                    at: CGPoint(x: leftX + labelWidth, y: PDFGenerator.cgY(y + S.bodySize)),
                    font: S.bodyFont(), color: S.black, context: context
                )
                y += S.bodySize + 2

                // Draw message indented, truncated to fit
                if y + S.bodySize <= pageBottom {
                    let messageText = String(insight.message.prefix(60))
                    PDFGenerator.drawText(
                        messageText,
                        at: CGPoint(x: leftX + 8, y: PDFGenerator.cgY(y + S.bodySize)),
                        font: S.bodyFont(), color: S.darkGray, context: context
                    )
                    y += S.bodySize + 4
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
        context: CGContext
    ) -> CGFloat {
        let S = PDFStyles.self
        var currentY = y
        let bulletIndent: CGFloat = 10

        // Bullet
        PDFGenerator.drawText(
            "•",
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(currentY + S.bodySize)),
            font: S.bodyFont(), color: S.darkGray, context: context
        )

        // Content (up to 2 lines, ~35 chars per line)
        let maxCharsPerLine = 35
        let text = String(content.prefix(maxCharsPerLine * 2))

        if text.count <= maxCharsPerLine {
            PDFGenerator.drawText(
                text,
                at: CGPoint(x: leftX + bulletIndent, y: PDFGenerator.cgY(currentY + S.bodySize)),
                font: S.bodyFont(), color: S.darkGray, context: context
            )
            currentY += S.bodySize + 1
        } else {
            let line1 = String(text.prefix(maxCharsPerLine))
            let breakIdx = line1.lastIndex(of: " ") ?? line1.endIndex
            let first = String(text[text.startIndex..<breakIdx])
            let rest = String(text[breakIdx...].dropFirst()).prefix(maxCharsPerLine)

            PDFGenerator.drawText(
                first,
                at: CGPoint(x: leftX + bulletIndent, y: PDFGenerator.cgY(currentY + S.bodySize)),
                font: S.bodyFont(), color: S.darkGray, context: context
            )
            currentY += S.bodySize + 1
            PDFGenerator.drawText(
                String(rest),
                at: CGPoint(x: leftX + bulletIndent, y: PDFGenerator.cgY(currentY + S.bodySize)),
                font: S.bodyFont(), color: S.darkGray, context: context
            )
            currentY += S.bodySize + 1
        }

        // Source indicator (tiny mono)
        let tinyMono = CTFontCreateWithName("Menlo" as CFString, S.tinySize, nil)
        PDFGenerator.drawTextRight(
            sourceLabel,
            rightX: rightEdge,
            y: PDFGenerator.cgY(currentY + S.tinySize - 1),
            font: tinyMono, color: S.medGray, context: context
        )
        currentY += S.tinySize + 4

        return currentY
    }
}
