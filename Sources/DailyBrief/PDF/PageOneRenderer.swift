import CoreGraphics
import CoreText
import Foundation
import JarvisCore

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
            // Sort work orders: inProgress first, then open, then done
            // Within the same status group, use AI priority order if available
            let priorityOrder = data.workOrderPriorityOrder
            let sortedOrders = data.workOrders.sorted { a, b in
                let statusRank: (String) -> Int = { status in
                    switch status {
                    case "inProgress": return 0
                    case "open": return 1
                    case "done": return 2
                    default: return 1
                    }
                }
                let sa = data.workOrderStatuses[a.caseNumber] ?? "open"
                let sb = data.workOrderStatuses[b.caseNumber] ?? "open"
                let rankA = statusRank(sa)
                let rankB = statusRank(sb)

                if rankA != rankB {
                    return rankA < rankB
                }

                // Within same status, sort by AI priority if available
                if let order = priorityOrder {
                    let idxA = order.firstIndex(of: a.caseNumber) ?? Int.max
                    let idxB = order.firstIndex(of: b.caseNumber) ?? Int.max
                    return idxA < idxB
                }

                return false // preserve original order if no AI priority
            }

            for wo in sortedOrders.prefix(6) {
                let woStatus = data.workOrderStatuses[wo.caseNumber] ?? "open"
                let isDone = woStatus == "done"
                let isInProgress = woStatus == "inProgress"

                // Status-aware checkbox
                let cbY = PDFGenerator.cgY(y + S.tableRowHeight - 1)
                context.setStrokeColor(S.darkGray)
                context.setLineWidth(0.5)
                if isDone {
                    // Filled checkbox for done
                    context.setFillColor(S.darkGray)
                    context.fill(CGRect(x: leftX, y: cbY, width: S.checkboxSize, height: S.checkboxSize))
                } else if isInProgress {
                    // Checkbox with centered dot for inProgress
                    context.stroke(CGRect(x: leftX, y: cbY, width: S.checkboxSize, height: S.checkboxSize))
                    let dotSize: CGFloat = 3
                    let dotX = leftX + (S.checkboxSize - dotSize) / 2
                    let dotY = cbY + (S.checkboxSize - dotSize) / 2
                    context.setFillColor(S.darkGray)
                    context.fillEllipse(in: CGRect(x: dotX, y: dotY, width: dotSize, height: dotSize))
                } else {
                    // Empty checkbox for open
                    context.stroke(CGRect(x: leftX, y: cbY, width: S.checkboxSize, height: S.checkboxSize))
                }

                // Colors: done items de-emphasized
                let headerColor = isDone ? S.medGray : S.black
                let textColor = isDone ? S.medGray : S.darkGray
                let bgColor = isDone ? S.lightGray : S.veryLightGray

                // Case number + store header line (with background)
                context.setFillColor(bgColor)
                context.fill(CGRect(x: leftX + cbIndent - 2, y: PDFGenerator.cgY(y + S.tableRowHeight), width: usableWidth - cbIndent + 4, height: S.tableRowHeight))

                // In-progress indicator prefix
                let caseLabel = isInProgress ? "\u{25B8} \(wo.caseNumber)  \(wo.store)" : "\(wo.caseNumber)  \(wo.store)"
                PDFGenerator.drawText(
                    caseLabel,
                    at: CGPoint(x: leftX + cbIndent, y: PDFGenerator.cgY(y + S.smallSize + 2)),
                    font: S.monoFont(), color: headerColor, context: context
                )
                y += S.tableRowHeight + 2

                // Description (two lines if needed)
                let desc = wo.shortDescription
                if desc.count <= 40 {
                    PDFGenerator.drawText(
                        desc,
                        at: CGPoint(x: leftX + cbIndent, y: PDFGenerator.cgY(y + S.bodySize)),
                        font: S.bodyFont(), color: textColor, context: context
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
                        font: S.bodyFont(), color: textColor, context: context
                    )
                    y += S.bodySize + 1
                    PDFGenerator.drawText(
                        String(rest),
                        at: CGPoint(x: leftX + cbIndent, y: PDFGenerator.cgY(y + S.bodySize)),
                        font: S.bodyFont(), color: textColor, context: context
                    )
                    y += S.bodySize + 2
                }

                // Strikethrough line for done items
                if isDone {
                    let strikeY = PDFGenerator.cgY(y - 2)
                    context.setStrokeColor(S.medGray)
                    context.setLineWidth(0.5)
                    context.move(to: CGPoint(x: leftX + cbIndent, y: strikeY))
                    context.addLine(to: CGPoint(x: rightEdge - 20, y: strikeY))
                    context.strokePath()
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

        // TODAY'S SCHEDULE SECTION (only if events exist)
        if !data.calendarEvents.isEmpty {
            // Divider
            y += 4
            context.setStrokeColor(S.lightGray)
            context.setLineWidth(0.5)
            context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y)))
            context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y)))
            context.strokePath()
            y += 6

            PDFGenerator.drawText(
                "Today's Schedule",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.headerSize)),
                font: S.headerFont(), color: S.black, context: context
            )
            y += S.headerSize + 4

            // Sort: all-day events first, then by start time
            let sorted = data.calendarEvents.sorted { a, b in
                if a.isAllDay && !b.isAllDay { return true }
                if !a.isAllDay && b.isAllDay { return false }
                return a.startTime < b.startTime
            }

            let maxEvents = 8
            let displayed = sorted.prefix(maxEvents)

            for event in displayed {
                PDFGenerator.drawText(
                    "\(event.timeString)  \(event.title)",
                    at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.bodySize)),
                    font: S.bodyFont(), color: S.black, context: context
                )
                y += S.bodySize + 2

                if let location = event.location, !location.isEmpty {
                    PDFGenerator.drawText(
                        location,
                        at: CGPoint(x: leftX + 12, y: PDFGenerator.cgY(y + S.tinySize)),
                        font: CTFontCreateWithName("Helvetica" as CFString, S.tinySize, nil),
                        color: S.medGray, context: context
                    )
                    y += S.tinySize + 2
                }
            }

            if sorted.count > maxEvents {
                let remaining = sorted.count - maxEvents
                PDFGenerator.drawText(
                    "... and \(remaining) more",
                    at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.tinySize)),
                    font: CTFontCreateWithName("Helvetica-Oblique" as CFString, S.tinySize, nil),
                    color: S.medGray, context: context
                )
                y += S.tinySize + 2
            }
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
