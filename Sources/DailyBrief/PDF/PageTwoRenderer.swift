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

        // Determine how many sports we have
        let hasMLBData = data.gameScore != nil || !data.standings.isEmpty || data.upcomingGame != nil
        let activeSportCount = (hasMLBData ? 1 : 0) + data.additionalSports.count
        let isCompact = activeSportCount > 1

        // Draw MLB section (always first if there's data)
        if hasMLBData {
            y = drawSportSection(
                context: context,
                teamName: data.teamName,
                divisionName: data.divisionName,
                gameScore: data.gameScore,
                upcomingGame: data.upcomingGame,
                standings: data.standings,
                sportDisplayName: "MLB",
                leftX: leftX,
                rightEdge: rightEdge,
                usableWidth: usableWidth,
                startY: y,
                isCompact: isCompact,
                activeSportCount: activeSportCount
            )
        }

        // Draw additional sports sections
        for sport in data.additionalSports {
            y = drawSportSection(
                context: context,
                teamName: sport.teamName,
                divisionName: sport.divisionName,
                gameScore: sport.gameScore,
                upcomingGame: sport.upcomingGame,
                standings: sport.standings,
                sportDisplayName: sport.sportDisplayName,
                leftX: leftX,
                rightEdge: rightEdge,
                usableWidth: usableWidth,
                startY: y,
                isCompact: isCompact,
                activeSportCount: activeSportCount
            )
        }

        // Divider before affirmation
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

        let affirmationHeight: CGFloat = isCompact ? 40 : 60
        drawWrappedText(
            data.affirmation,
            in: CGRect(x: leftX + 4, y: PDFGenerator.cgY(y + affirmationHeight), width: usableWidth - 8, height: affirmationHeight),
            font: S.affirmationFont(),
            color: S.darkGray,
            context: context
        )
        y += affirmationHeight + 4

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

    // MARK: - Sport Section Renderer

    private static func drawSportSection(
        context: CGContext,
        teamName: String,
        divisionName: String,
        gameScore: GameScore?,
        upcomingGame: UpcomingGame?,
        standings: [StandingsEntry],
        sportDisplayName: String,
        leftX: CGFloat,
        rightEdge: CGFloat,
        usableWidth: CGFloat,
        startY: CGFloat,
        isCompact: Bool,
        activeSportCount: Int
    ) -> CGFloat {
        let S = PDFStyles.self
        var y = startY

        // Section title: sport prefix when compact
        let titleText = isCompact ? "\(sportDisplayName) — \(teamName)" : teamName
        let titleFont = isCompact ? S.headerFont() : S.titleFont()
        let titleSize = isCompact ? S.headerSize : S.titleSize

        PDFGenerator.drawText(
            titleText,
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + titleSize)),
            font: titleFont, color: S.black, context: context
        )
        y += titleSize + (isCompact ? 4 : 6)

        // Game score
        if let game = gameScore {
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

            // Skip venue line in compact mode with 3+ sports
            if !game.venue.isEmpty && !(isCompact && activeSportCount >= 3) {
                PDFGenerator.drawText(
                    game.venue,
                    at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.smallSize)),
                    font: S.monoFont(), color: S.medGray, context: context
                )
                y += S.smallSize
            }
        } else {
            PDFGenerator.drawText(
                "No recent game",
                at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.bodySize)),
                font: S.bodyFont(), color: S.medGray, context: context
            )
            y += S.bodySize
        }

        y += (isCompact ? 2 : 4)

        // Upcoming Game — skip when very compact (3+ sports)
        if let next = upcomingGame, activeSportCount < 3 {
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

            if !isCompact {
                PDFGenerator.drawText(
                    "\(next.venue)  |  \(next.gameType)",
                    at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.smallSize)),
                    font: S.monoFont(), color: S.darkGray, context: context
                )
                y += S.smallSize
            }
        }

        y += (isCompact ? 3 : 6)

        // Divider
        context.setStrokeColor(S.lightGray)
        context.setLineWidth(0.5)
        context.move(to: CGPoint(x: leftX, y: PDFGenerator.cgY(y)))
        context.addLine(to: CGPoint(x: rightEdge, y: PDFGenerator.cgY(y)))
        context.strokePath()
        y += (isCompact ? 3 : 6)

        // Division Standings
        PDFGenerator.drawText(
            "\(divisionName) Standings",
            at: CGPoint(x: leftX, y: PDFGenerator.cgY(y + S.headerSize)),
            font: S.headerFont(), color: S.black, context: context
        )
        y += S.headerSize + 4

        if !standings.isEmpty {
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

            for entry in standings {
                let isMyTeam = entry.team.contains(teamName) || teamName.contains(entry.team)
                let textColor = isMyTeam ? S.black : S.darkGray
                let font = isMyTeam ? S.headerFont() : S.monoFont()

                let shortName = shortenTeamName(entry.team, sport: sportDisplayName)
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

        y += (isCompact ? 4 : 8)

        return y
    }

    // MARK: - Helpers

    private static func shortenTeamName(_ name: String, sport: String = "MLB") -> String {
        // Try sport-specific team data first, then fall back to all sports
        let allTeamSources: [(name: String, abbreviation: String)] = {
            switch sport.uppercased() {
            case "MLB":
                return MLBTeamData.allTeams.map { ($0.name, $0.abbreviation) }
            case "NFL":
                return NFLTeamData.allTeams.map { ($0.name, $0.abbreviation) }
            case "NBA":
                return NBATeamData.allTeams.map { ($0.name, $0.abbreviation) }
            case "NHL":
                return NHLTeamData.allTeams.map { ($0.name, $0.abbreviation) }
            default:
                // Search all sports
                let mlb: [(String, String)] = MLBTeamData.allTeams.map { ($0.name, $0.abbreviation) }
                let nfl: [(String, String)] = NFLTeamData.allTeams.map { ($0.name, $0.abbreviation) }
                let nba: [(String, String)] = NBATeamData.allTeams.map { ($0.name, $0.abbreviation) }
                let nhl: [(String, String)] = NHLTeamData.allTeams.map { ($0.name, $0.abbreviation) }
                return mlb + nfl + nba + nhl
            }
        }()

        if let team = allTeamSources.first(where: { name.contains($0.name) || $0.name.contains(name) }) {
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
