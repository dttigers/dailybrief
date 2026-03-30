import ArgumentParser
import Foundation

@main
struct DailyBrief: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        abstract: "Generate a daily briefing PDF with work orders, todos, sports scores, and an ADHD affirmation."
    )

    @Flag(help: "Skip printing the PDF")
    var noPrint = false

    @Flag(help: "Fetch data and display results without generating PDF")
    var dryRun = false

    @Flag(help: "Create a template config file and exit")
    var setup = false

    @Option(help: "Path to config file")
    var configPath: String?

    func run() async throws {
        if setup {
            try createTemplateConfig()
            return
        }

        Logger.log("DailyBrief starting")

        let config: AppConfig
        do {
            config = try ConfigLoader.load(from: configPath)
        } catch {
            Logger.error("Config error: \(error.localizedDescription)")
            throw error
        }

        // Initialize services
        let sportsService = SportsService(config: config.sports)
        let remindersService = RemindersService(config: config.reminders)
        let gmailService = GmailService(config: config.gmail)
        let aiProvider = ClaudeAIProvider(config: config.ai)

        // Fetch all data concurrently — each wrapped in try? so failures don't block the brief
        Logger.log("Fetching data...")

        async let gameResult = tryFetch("Tigers score") { try await sportsService.fetchYesterdayGame() }
        async let standingsResult = tryFetch("Standings") { try await sportsService.fetchStandings() }
        async let todosResult = tryFetch("Reminders") { try await remindersService.fetchTodoItems() }
        async let workOrdersResult = tryFetch("Work orders") { try await gmailService.fetchWorkOrders() }
        async let affirmationResult = tryFetch("Affirmation") { try await aiProvider.generateAffirmation() }

        let briefData = await DailyBriefData(
            date: Date(),
            workOrders: workOrdersResult ?? [],
            todoItems: todosResult ?? [],
            gameScore: gameResult ?? nil,
            standings: standingsResult ?? [],
            affirmation: affirmationResult ?? "You've got this. Your brain works differently, and that's your superpower."
        )

        Logger.log("Data fetched: \(briefData.workOrders.count) work orders, \(briefData.todoItems.count) todos, game: \(briefData.gameScore != nil ? "yes" : "no"), standings: \(briefData.standings.count) teams")

        if dryRun {
            printSummary(briefData)
            Logger.log("Dry run complete")
            return
        }

        // Generate PDF
        let outputDir = ConfigLoader.expandPath(config.pdf.outputDirectory)
        try ConfigLoader.ensureDirectoryExists(outputDir)

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let filename = "daily_sheet_\(formatter.string(from: Date())).pdf"
        let outputPath = (outputDir as NSString).appendingPathComponent(filename)

        try PDFGenerator.generate(data: briefData, outputPath: outputPath)

        // Print
        if !noPrint {
            try PrintService.printPDF(at: outputPath, config: config.printing)
        } else {
            Logger.log("Printing skipped (--no-print)")
        }

        // Cleanup old PDFs
        cleanupOldPDFs(directory: outputDir, keepDays: config.pdf.keepDays)

        Logger.log("DailyBrief complete")
    }

    private func tryFetch<T>(_ label: String, _ block: () async throws -> T) async -> T? {
        do {
            return try await block()
        } catch {
            Logger.error("\(label) fetch failed: \(error.localizedDescription)")
            return nil
        }
    }

    private func printSummary(_ data: DailyBriefData) {
        print("\n=== Daily Brief — \(data.dateString) ===\n")

        print("WORK ORDERS (\(data.workOrders.count)):")
        for wo in data.workOrders {
            print("  \(wo.caseNumber) | \(wo.store) | \(wo.trade) | Pri: \(wo.priority)")
            print("    \(wo.shortDescription)")
            if !wo.location.isEmpty { print("    Location: \(wo.location) | Equipment: \(wo.equipment)") }
            if !wo.contact.isEmpty { print("    Contact: \(wo.contact)") }
        }
        if data.workOrders.isEmpty { print("  (none)") }

        print("\nTO DO (\(data.todoItems.count)):")
        for item in data.todoItems {
            print("  [ ] \(item.title)")
        }
        if data.todoItems.isEmpty { print("  (none)") }

        print("\nTIGERS:")
        if let game = data.gameScore {
            print("  \(game.summaryLine1)")
            print("  \(game.summaryLine2)")
        } else {
            print("  No game yesterday")
        }

        print("\nAL CENTRAL:")
        for entry in data.standings {
            print("  \(entry.divisionRank). \(entry.team)\t\(entry.wins)-\(entry.losses)\tGB: \(entry.gamesBack)")
        }
        if data.standings.isEmpty { print("  (unavailable)") }

        print("\nAFFIRMATION:")
        print("  \(data.affirmation)")
        print()
    }

    private func cleanupOldPDFs(directory: String, keepDays: Int) {
        let fm = FileManager.default
        let cutoff = Calendar.current.date(byAdding: .day, value: -keepDays, to: Date())!

        guard let files = try? fm.contentsOfDirectory(atPath: directory) else { return }
        for file in files where file.hasSuffix(".pdf") {
            let path = (directory as NSString).appendingPathComponent(file)
            if let attrs = try? fm.attributesOfItem(atPath: path),
               let created = attrs[.creationDate] as? Date,
               created < cutoff {
                try? fm.removeItem(atPath: path)
                Logger.log("Cleaned up old PDF: \(file)")
            }
        }
    }

    private func createTemplateConfig() throws {
        let configDir = ConfigLoader.configDirectory
        try FileManager.default.createDirectory(atPath: configDir, withIntermediateDirectories: true)

        let template = """
        {
            "gmail": {
                "email": "your-email@gmail.com",
                "app_password": "xxxx xxxx xxxx xxxx",
                "search_subject_pattern": "Case CS",
                "lookback_days": 3
            },
            "reminders": {
                "list_name": "To Do"
            },
            "sports": {
                "team_id": 116,
                "division_id": 202,
                "league_id": 103
            },
            "ai": {
                "claude_api_key": "sk-ant-...",
                "claude_model": "claude-sonnet-4-20250514"
            },
            "pdf": {
                "output_directory": "~/Documents/DailyBrief",
                "keep_days": 30
            },
            "printing": {
                "enabled": true,
                "printer_name": "",
                "copies": 1
            }
        }
        """

        let path = ConfigLoader.configPath
        if FileManager.default.fileExists(atPath: path) {
            print("Config already exists at \(path)")
        } else {
            try template.write(toFile: path, atomically: true, encoding: .utf8)
            print("Template config created at \(path)")
            print("Edit it with your API keys and preferences before running.")
        }
    }
}
