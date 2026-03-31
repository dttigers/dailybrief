import CoreGraphics
import CoreText
import Foundation

enum PageOneRenderer {
    static func draw(context: CGContext, data: DailyBriefData) {
        let S = PDFStyles.self
        let leftX = S.contentX + S.margin
        let rightEdge = S.contentX + S.contentWidth - S.margin
        let usableWidth = rightEdge - leftX

        // Date header
        var y: CGFloat = S.margin + 4
        PDFGenerator.drawText(
            "Daily Brief",
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

        // WORK ORDERS SECTION
        PDFGenerator.drawText(
            "Work Orders",
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.headerSize)),
            font: S.headerFont(), color: S.black, context: context
        )
        y += S.headerSize + 4

        let cbIndent = S.checkboxSize + 4
        if data.workOrders.isEmpty {
            PDFGenerator.drawText(
                "No active work orders",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.bodySize)),
                font: S.bodyFont(), color: S.medGray, context: context
            )
            y += S.bodySize + 6
        } else {
            for wo in data.workOrders.prefix(6) {
                // Checkbox
                let cbY = PDFGenerator.cgY(y + S.tableRowHeight - 1)
                context.setStrokeColor(S.darkGray)
                context.setLineWidth(0.5)
                context.stroke(CGRect(x: leftX, y: cbY, width: S.checkboxSize, height: S.checkboxSize))

                // Case number + store header line (with background)
                context.setFillColor(S.veryLightGray)
                context.fill(CGRect(x: leftX + cbIndent - 2, y: PDFGenerator.cgY(y + S.tableRowHeight), width: usableWidth - cbIndent + 4, height: S.tableRowHeight))

                PDFGenerator.drawText(
                    "\(wo.caseNumber)  \(wo.store)",
                    at: CGPoint(x: leftX + cbIndent, y: PDFGenerator.cgY(y + S.smallSize + 2)),
                    font: S.monoFont(), color: S.black, context: context
                )
                y += S.tableRowHeight + 2

                // Description (two lines if needed)
                let desc = wo.shortDescription
                if desc.count <= 40 {
                    PDFGenerator.drawText(
                        desc,
                        at: CGPoint(x: leftX + cbIndent, y: PDFGenerator.cgY(y + S.bodySize)),
                        font: S.bodyFont(), color: S.darkGray, context: context
                    )
                    y += S.bodySize + 2
                } else {
                    let line1 = String(desc.prefix(40))
                    let breakIdx = line1.lastIndex(of: " ") ?? line1.endIndex
                    let first = String(desc[desc.startIndex..<breakIdx])
                    let rest = String(desc[breakIdx...].dropFirst()).prefix(40)
                    PDFGenerator.drawText(
                        first,
                        at: CGPoint(x: leftX + cbIndent, y: PDFGenerator.cgY(y + S.bodySize)),
                        font: S.bodyFont(), color: S.darkGray, context: context
                    )
                    y += S.bodySize + 1
                    PDFGenerator.drawText(
                        String(rest),
                        at: CGPoint(x: leftX + cbIndent, y: PDFGenerator.cgY(y + S.bodySize)),
                        font: S.bodyFont(), color: S.darkGray, context: context
                    )
                    y += S.bodySize + 2
                }

                // Trade, Location, Equipment on one line
                let details = [wo.trade, wo.location, wo.equipment].filter { !$0.isEmpty }.joined(separator: " | ")
                if !details.isEmpty {
                    PDFGenerator.drawText(
                        details,
                        at: CGPoint(x: leftX + cbIndent, y: PDFGenerator.cgY(y + S.tinySize)),
                        font: CTFontCreateWithName("Menlo" as CFString, S.tinySize, nil), color: S.medGray, context: context
                    )
                    y += S.tinySize + 2
                }

                // Contact + Priority
                let meta = "Pri: \(wo.priority.prefix(1))  |  Contact: \(wo.contact)"
                PDFGenerator.drawText(
                    meta,
                    at: CGPoint(x: leftX + cbIndent, y: PDFGenerator.cgY(y + S.tinySize)),
                    font: CTFontCreateWithName("Menlo" as CFString, S.tinySize, nil), color: S.medGray, context: context
                )
                y += S.tinySize + 6
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

        // TO DO SECTION
        PDFGenerator.drawText(
            "To Do",
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.headerSize)),
            font: S.headerFont(), color: S.black, context: context
        )
        y += S.headerSize + 6

        let items = data.todoItems.isEmpty
            ? (0..<10).map { _ in ReminderItem(title: "", dueDate: nil, priority: 0, notes: nil) }
            : data.todoItems

        for item in items.prefix(14) {
            let cbY = PDFGenerator.cgY(y + S.checkboxSize + 1)
            context.setStrokeColor(S.darkGray)
            context.setLineWidth(0.5)
            context.stroke(CGRect(x: leftX, y: cbY, width: S.checkboxSize, height: S.checkboxSize))

            if !item.title.isEmpty {
                PDFGenerator.drawText(
                    String(item.title.prefix(30)),
                    at: CGPoint(x: leftX + S.checkboxSize + 4, y: cbY + 1),
                    font: S.bodyFont(), color: S.black, context: context
                )
            }
            y += S.tableRowHeight
        }

        // NOTES at bottom
        y = S.contentHeight - S.margin - 70
        PDFGenerator.drawText(
            "Notes",
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.smallSize)),
            font: S.monoFont(), color: S.medGray, context: context
        )
        y += S.smallSize + 4

        for _ in 0..<4 {
            context.setStrokeColor(S.lightGray)
            context.setLineWidth(0.25)
            context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y)))
            context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y)))
            context.strokePath()
            y += S.noteLineSpacing
        }
    }
}
