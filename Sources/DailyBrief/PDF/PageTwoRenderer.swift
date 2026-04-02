import CoreGraphics
import CoreText
import Foundation
import JarvisCore

enum PageTwoRenderer {
    static func draw(context: CGContext, data: DailyBriefData) {
        let S = PDFStyles.self
        let leftX = S.contentX + S.margin
        let rightEdge = S.contentX + S.contentWidth - S.margin
        let usableWidth = rightEdge - leftX
        var y: CGFloat = S.margin + 4

        // Team Score Section
        PDFGenerator.drawText(
            data.teamName,
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.titleSize)),
            font: S.titleFont(), color: S.black, context: context
        )
        y += S.titleSize + 6

        if let game = data.gameScore {
            PDFGenerator.drawText(
                game.summaryLine1,
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.headerSize)),
                font: S.headerFont(), color: S.black, context: context
            )
            y += S.headerSize + 3

            PDFGenerator.drawText(
                game.summaryLine2,
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.bodySize)),
                font: S.bodyFont(), color: S.darkGray, context: context
            )
            y += S.bodySize + 3

            if !game.venue.isEmpty {
                PDFGenerator.drawText(
                    game.venue,
                    at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.smallSize)),
                    font: S.monoFont(), color: S.medGray, context: context
                )
                y += S.smallSize
            }
        } else {
            PDFGenerator.drawText(
                "No game yesterday",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.bodySize)),
                font: S.bodyFont(), color: S.medGray, context: context
            )
            y += S.bodySize
        }

        y += 4

        // Upcoming Game
        if let next = data.upcomingGame {
            PDFGenerator.drawText(
                "Next Game",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.smallSize)),
                font: S.monoFont(), color: S.medGray, context: context
            )
            y += S.smallSize + 3

            PDFGenerator.drawText(
                next.summaryLine,
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.bodySize)),
                font: S.bodyFont(), color: S.black, context: context
            )
            y += S.bodySize + 2

            PDFGenerator.drawText(
                "\(next.venue)  |  \(next.gameType)",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.smallSize)),
                font: S.monoFont(), color: S.darkGray, context: context
            )
            y += S.smallSize
        }

        y += 6

        // Divider
        context.setStrokeColor(S.lightGray)
        context.setLineWidth(0.5)
        context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y)))
        context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y)))
        context.strokePath()
        y += 6

        // Division Standings
        PDFGenerator.drawText(
            "\(data.divisionName) Standings",
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.headerSize)),
            font: S.headerFont(), color: S.black, context: context
        )
        y += S.headerSize + 4

        if !data.standings.isEmpty {
            let teamX = leftX
            let wX = leftX + 120
            let lX = leftX + 145
            let gbX = leftX + 170
            let strkX = leftX + 205

            // Header row
            context.setFillColor(S.veryLightGray)
            context.fill(CGRect(x: leftX - 2, y: PDFGenerator.cgY(y + S.tableHeaderHeight), width: usableWidth + 4, height: S.tableHeaderHeight))

            PDFGenerator.drawText("Team", at: CGPoint(x: teamX, y: PDFGenerator.cgY(y + S.smallSize + 2)), font: S.monoFont(), color: S.darkGray, context: context)
            PDFGenerator.drawText("W", at: CGPoint(x: wX, y: PDFGenerator.cgY(y + S.smallSize + 2)), font: S.monoFont(), color: S.darkGray, context: context)
            PDFGenerator.drawText("L", at: CGPoint(x: lX, y: PDFGenerator.cgY(y + S.smallSize + 2)), font: S.monoFont(), color: S.darkGray, context: context)
            PDFGenerator.drawText("GB", at: CGPoint(x: gbX, y: PDFGenerator.cgY(y + S.smallSize + 2)), font: S.monoFont(), color: S.darkGray, context: context)
            PDFGenerator.drawText("Strk", at: CGPoint(x: strkX, y: PDFGenerator.cgY(y + S.smallSize + 2)), font: S.monoFont(), color: S.darkGray, context: context)
            y += S.tableHeaderHeight

            for entry in data.standings {
                let isMyTeam = entry.team.contains(data.teamName) || data.teamName.contains(entry.team)
                let textColor = isMyTeam ? S.black : S.darkGray
                let font = isMyTeam ? S.headerFont() : S.monoFont()

                let shortName = shortenTeamName(entry.team)
                PDFGenerator.drawText(shortName, at: CGPoint(x: teamX, y: PDFGenerator.cgY(y + S.smallSize + 1)), font: font, color: textColor, context: context)
                PDFGenerator.drawText("\(entry.wins)", at: CGPoint(x: wX, y: PDFGenerator.cgY(y + S.smallSize + 1)), font: S.monoFont(), color: textColor, context: context)
                PDFGenerator.drawText("\(entry.losses)", at: CGPoint(x: lX, y: PDFGenerator.cgY(y + S.smallSize + 1)), font: S.monoFont(), color: textColor, context: context)
                PDFGenerator.drawText(entry.gamesBack, at: CGPoint(x: gbX, y: PDFGenerator.cgY(y + S.smallSize + 1)), font: S.monoFont(), color: textColor, context: context)
                PDFGenerator.drawText(entry.streak, at: CGPoint(x: strkX, y: PDFGenerator.cgY(y + S.smallSize + 1)), font: S.monoFont(), color: textColor, context: context)
                y += S.tableRowHeight
            }
        } else {
            PDFGenerator.drawText(
                "Standings unavailable",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.bodySize)),
                font: S.bodyFont(), color: S.medGray, context: context
            )
            y += S.bodySize + 4
        }

        y += 8

        // Divider
        context.setStrokeColor(S.lightGray)
        context.setLineWidth(0.5)
        context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y)))
        context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y)))
        context.strokePath()
        y += 6

        // ADHD Affirmation
        PDFGenerator.drawText(
            "Today's Affirmation",
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.bodySize)),
            font: S.monoFont(), color: S.medGray, context: context
        )
        y += S.bodySize + 4

        drawWrappedText(
            data.affirmation,
            in: CGRect(x: leftX + 4, y: PDFGenerator.cgY(y + 60), width: usableWidth - 8, height: 60),
            font: S.affirmationFont(),
            color: S.darkGray,
            context: context
        )
        y += 64

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

    private static func shortenTeamName(_ name: String) -> String {
        if let team = MLBTeamData.allTeams.first(where: { name.contains($0.name) || $0.name.contains(name) }) {
            let lastName = name.split(separator: " ").last.map(String.init) ?? name
            return "\(team.abbreviation) \(lastName)"
        }
        return String(name.prefix(12))
    }

    private static func drawWrappedText(_ text: String, in rect: CGRect, font: CTFont, color: CGColor, context: CGContext) {
        let attributes = [
            kCTFontAttributeName: font,
            kCTForegroundColorAttributeName: color
        ] as CFDictionary
        let attrString = CFAttributedStringCreate(nil, text as CFString, attributes)!
        let framesetter = CTFramesetterCreateWithAttributedString(attrString)
        let path = CGPath(rect: rect, transform: nil)
        let frame = CTFramesetterCreateFrame(framesetter, CFRange(location: 0, length: 0), path, nil)
        CTFrameDraw(frame, context)
    }
}
