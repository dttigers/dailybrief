import CoreGraphics
import CoreText
import Foundation
import JarvisCore

enum PageOneRenderer {
    static func draw(context: CGContext, data: DailyBriefData, layout: PDFLayout) {
        let S = PDFStyles.self
        let leftX = layout.contentX + layout.margin
        let rightEdge = layout.contentX + layout.contentWidth - layout.margin
        let usableWidth = rightEdge - leftX

        // Date header
        var y: CGFloat = layout.margin + 4
        PDFGenerator.drawText(
            "Daily Brief",
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

        // WORK ORDERS SECTION
        if layout.enabledSections.contains("workOrders") {
            PDFGenerator.drawText(
                "Work Orders",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.headerSize, layout: layout)),
                font: S.headerFont(size: layout.headerSize), color: S.black, context: context
            )
            y += layout.headerSize + 4

            let cbIndent = layout.checkboxSize + 4
            if data.workOrders.isEmpty {
                PDFGenerator.drawText(
                    "No active work orders",
                    at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                    font: S.bodyFont(size: layout.bodySize), color: S.medGray, context: context
                )
                y += layout.bodySize + 6
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
                    let cbY = PDFGenerator.cgY(y + layout.tableRowHeight - 1, layout: layout)
                    context.setStrokeColor(S.darkGray)
                    context.setLineWidth(0.5)
                    if isDone {
                        // Filled checkbox for done
                        context.setFillColor(S.darkGray)
                        context.fill(CGRect(x: leftX, y: cbY, width: layout.checkboxSize, height: layout.checkboxSize))
                    } else if isInProgress {
                        // Checkbox with centered dot for inProgress
                        context.stroke(CGRect(x: leftX, y: cbY, width: layout.checkboxSize, height: layout.checkboxSize))
                        let dotSize: CGFloat = 3
                        let dotX = leftX + (layout.checkboxSize - dotSize) / 2
                        let dotY = cbY + (layout.checkboxSize - dotSize) / 2
                        context.setFillColor(S.darkGray)
                        context.fillEllipse(in: CGRect(x: dotX, y: dotY, width: dotSize, height: dotSize))
                    } else {
                        // Empty checkbox for open
                        context.stroke(CGRect(x: leftX, y: cbY, width: layout.checkboxSize, height: layout.checkboxSize))
                    }

                    // Colors: done items de-emphasized
                    let headerColor = isDone ? S.medGray : S.black
                    let textColor = isDone ? S.medGray : S.darkGray
                    let bgColor = isDone ? S.lightGray : S.veryLightGray

                    // Case number + store header line (with background)
                    context.setFillColor(bgColor)
                    context.fill(CGRect(x: leftX + cbIndent - 2, y: PDFGenerator.cgY(y + layout.tableRowHeight, layout: layout), width: usableWidth - cbIndent + 4, height: layout.tableRowHeight))

                    // In-progress indicator prefix
                    let caseLabel = isInProgress ? "\u{25B8} \(wo.caseNumber)  \(wo.store)" : "\(wo.caseNumber)  \(wo.store)"
                    PDFGenerator.drawText(
                        caseLabel,
                        at: CGPoint(x: leftX + cbIndent, y: PDFGenerator.cgY(y + layout.smallSize + 2, layout: layout)),
                        font: S.monoFont(size: layout.smallSize), color: headerColor, context: context
                    )
                    y += layout.tableRowHeight + 2

                    // Description (two lines if needed)
                    let desc = wo.shortDescription
                    if desc.count <= 40 {
                        PDFGenerator.drawText(
                            desc,
                            at: CGPoint(x: leftX + cbIndent, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                            font: S.bodyFont(size: layout.bodySize), color: textColor, context: context
                        )
                        y += layout.bodySize + 2
                    } else {
                        let line1 = String(desc.prefix(40))
                        let breakIdx = line1.lastIndex(of: " ") ?? line1.endIndex
                        let first = String(desc[desc.startIndex..<breakIdx])
                        let rest = String(desc[breakIdx...].dropFirst()).prefix(40)
                        PDFGenerator.drawText(
                            first,
                            at: CGPoint(x: leftX + cbIndent, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                            font: S.bodyFont(size: layout.bodySize), color: textColor, context: context
                        )
                        y += layout.bodySize + 1
                        PDFGenerator.drawText(
                            String(rest),
                            at: CGPoint(x: leftX + cbIndent, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                            font: S.bodyFont(size: layout.bodySize), color: textColor, context: context
                        )
                        y += layout.bodySize + 2
                    }

                    // Strikethrough line for done items
                    if isDone {
                        let strikeY = PDFGenerator.cgY(y - 2, layout: layout)
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
                            at: CGPoint(x: leftX + cbIndent, y: PDFGenerator.cgY(y + layout.tinySize, layout: layout)),
                            font: CTFontCreateWithName("Menlo" as CFString, layout.tinySize, nil), color: S.medGray, context: context
                        )
                        y += layout.tinySize + 2
                    }

                    // Contact + Priority
                    let meta = "Pri: \(wo.priority.prefix(1))  |  Contact: \(wo.contact)"
                    PDFGenerator.drawText(
                        meta,
                        at: CGPoint(x: leftX + cbIndent, y: PDFGenerator.cgY(y + layout.tinySize, layout: layout)),
                        font: CTFontCreateWithName("Menlo" as CFString, layout.tinySize, nil), color: S.medGray, context: context
                    )
                    y += layout.tinySize + 6
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
        }

        // TO DO SECTION
        if layout.enabledSections.contains("todo") {
            PDFGenerator.drawText(
                "To Do",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.headerSize, layout: layout)),
                font: S.headerFont(size: layout.headerSize), color: S.black, context: context
            )
            y += layout.headerSize + 6

            let items = data.todoItems.isEmpty
                ? (0..<10).map { _ in ReminderItem(title: "", dueDate: nil, priority: 0, notes: nil) }
                : data.todoItems

            for item in items.prefix(14) {
                let cbY = PDFGenerator.cgY(y + layout.checkboxSize + 1, layout: layout)
                context.setStrokeColor(S.darkGray)
                context.setLineWidth(0.5)
                context.stroke(CGRect(x: leftX, y: cbY, width: layout.checkboxSize, height: layout.checkboxSize))

                if !item.title.isEmpty {
                    PDFGenerator.drawText(
                        String(item.title.prefix(30)),
                        at: CGPoint(x: leftX + layout.checkboxSize + 4, y: cbY + 1),
                        font: S.bodyFont(size: layout.bodySize), color: S.black, context: context
                    )
                }
                y += layout.tableRowHeight
            }
        }

        // TODAY'S SCHEDULE SECTION (only if events exist and calendar enabled)
        if layout.enabledSections.contains("calendar") && !data.calendarEvents.isEmpty {
            // Divider
            y += 4
            context.setStrokeColor(S.lightGray)
            context.setLineWidth(0.5)
            context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y, layout: layout)))
            context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y, layout: layout)))
            context.strokePath()
            y += 6

            PDFGenerator.drawText(
                "Today's Schedule",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.headerSize, layout: layout)),
                font: S.headerFont(size: layout.headerSize), color: S.black, context: context
            )
            y += layout.headerSize + 4

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
                    at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.bodySize, layout: layout)),
                    font: S.bodyFont(size: layout.bodySize), color: S.black, context: context
                )
                y += layout.bodySize + 2

                if let location = event.location, !location.isEmpty {
                    PDFGenerator.drawText(
                        location,
                        at: CGPoint(x: leftX + 12, y: PDFGenerator.cgY(y + layout.tinySize, layout: layout)),
                        font: CTFontCreateWithName("Helvetica" as CFString, layout.tinySize, nil),
                        color: S.medGray, context: context
                    )
                    y += layout.tinySize + 2
                }
            }

            if sorted.count > maxEvents {
                let remaining = sorted.count - maxEvents
                PDFGenerator.drawText(
                    "... and \(remaining) more",
                    at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.tinySize, layout: layout)),
                    font: CTFontCreateWithName("Helvetica-Oblique" as CFString, layout.tinySize, nil),
                    color: S.medGray, context: context
                )
                y += layout.tinySize + 2
            }
        }

        // NOTES at bottom
        y = layout.contentHeight - layout.margin - 70
        PDFGenerator.drawText(
            "Notes",
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + layout.smallSize, layout: layout)),
            font: S.monoFont(size: layout.smallSize), color: S.medGray, context: context
        )
        y += layout.smallSize + 4

        for _ in 0..<4 {
            context.setStrokeColor(S.lightGray)
            context.setLineWidth(0.25)
            context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y, layout: layout)))
            context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y, layout: layout)))
            context.strokePath()
            y += layout.noteLineSpacing
        }
    }
}
