import ArgumentParser
import Foundation
import JarvisCore

@main
struct DailyBrief: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        abstract: "Generate a daily briefing PDF with work orders, todos, sports scores, and an ADHD affirmation.",
        subcommands: [Generate.self, Complete.self, Uncomplete.self, ListCompleted.self],
        defaultSubcommand: Generate.self
    )
}

// MARK: - Generate (default)

extension DailyBrief {
    struct Generate: AsyncParsableCommand {
        static let configuration = CommandConfiguration(abstract: "Generate and optionally print the daily brief.")

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

            // Fetch all data concurrently
            Logger.log("Fetching data...")

            async let gameResult = tryFetch("Tigers score") { try await sportsService.fetchYesterdayGame() }
            async let upcomingResult = tryFetch("Upcoming game") { try await sportsService.fetchUpcomingGame() }
            async let standingsResult = tryFetch("Standings") { try await sportsService.fetchStandings() }
            async let todosResult = tryFetch("Reminders") { try await remindersService.fetchTodoItems() }
            async let workOrdersResult = tryFetch("Work orders") { try await gmailService.fetchWorkOrders() }
            async let affirmationResult = tryFetch("Affirmation") { try await aiProvider.generateAffirmation() }

            // Filter out completed work orders
            let completed = CompletionStore.load()
            let activeWorkOrders = await (workOrdersResult ?? []).filter { !completed.contains($0.caseNumber) }

            let briefData = await DailyBriefData(
                date: Date(),
                workOrders: activeWorkOrders,
                todoItems: todosResult ?? [],
                gameScore: gameResult ?? nil,
                upcomingGame: upcomingResult ?? nil,
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
                print("  [ ] \(wo.caseNumber) | \(wo.store) | \(wo.trade) | Pri: \(wo.priority)")
                print("      \(wo.shortDescription)")
                if !wo.location.isEmpty { print("      Location: \(wo.location) | Equipment: \(wo.equipment)") }
                if !wo.contact.isEmpty { print("      Contact: \(wo.contact)") }
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

            print("\nUPCOMING:")
            if let next = data.upcomingGame {
                print("  \(next.summaryLine)")
                print("  \(next.venue)  |  \(next.gameType)")
            } else {
                print("  No upcoming game scheduled")
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
                    "search_subject_pattern": "has been assigned to you",
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
}

// MARK: - Complete

extension DailyBrief {
    struct Complete: ParsableCommand {
        static let configuration = CommandConfiguration(abstract: "Mark a work order as complete so it won't reprint.")

        @Argument(help: "Case number(s) to mark complete (e.g. CS0353598)")
        var caseNumbers: [String]

        func run() {
            for cn in caseNumbers {
                CompletionStore.markComplete(cn)
                print("Marked \(cn) as complete")
            }
        }
    }
}

// MARK: - Uncomplete

extension DailyBrief {
    struct Uncomplete: ParsableCommand {
        static let configuration = CommandConfiguration(abstract: "Unmark a work order so it appears again.")

        @Argument(help: "Case number(s) to unmark (e.g. CS0353598)")
        var caseNumbers: [String]

        func run() {
            for cn in caseNumbers {
                CompletionStore.markIncomplete(cn)
                print("Unmarked \(cn) — it will appear again")
            }
        }
    }
}

// MARK: - List Completed

extension DailyBrief {
    struct ListCompleted: ParsableCommand {
        static let configuration = CommandConfiguration(
            commandName: "list-completed",
            abstract: "Show all completed work order case numbers."
        )

        func run() {
            let items = CompletionStore.listCompleted()
            if items.isEmpty {
                print("No completed work orders")
            } else {
                print("Completed work orders:")
                for item in items {
                    print("  \(item)")
                }
            }
        }
    }
}
