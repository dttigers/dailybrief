import ArgumentParser
import Foundation
import JarvisCore

@main
struct DailyBrief: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        abstract: "Generate a daily briefing PDF with work orders, todos, sports scores, and an ADHD affirmation.",
        subcommands: [Generate.self, History.self, Export.self, Complete.self, Uncomplete.self, ListCompleted.self, EmailAuth.self],
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

            // Initialize API client (used for all AI and data services)
            let apiClient = VigilAPIClient(
                baseURL: URL(string: config.apiBaseUrl)!,
                apiKey: config.apiKey
            )
            Logger.log("Using Vigil Core API backend")

            // Initialize services
            let sportsService = SportsService(config: config.sports.mlb)
            let remindersService = RemindersService(config: config.reminders)
            let emailService = EmailService(config: config.email)
            let calendarService: GoogleCalendarService? = config.googleCalendar.enabled
                ? GoogleCalendarService(config: config.googleCalendar) : nil

            let aiProvider: any AIProvider = APIAIProvider(client: apiClient)
            let prioritizer: any WorkOrderPrioritizing = APIWorkOrderPrioritizer(client: apiClient)
            let thoughtStore = APIThoughtStore(client: apiClient)

            // Fetch captured thoughts via API
            var unprocessedThoughts: [Thought] = []
            var taskThoughts: [Thought] = []
            var recentThoughts: [Thought] = []

            do {
                let allRecent = try await thoughtStore.fetchAll(category: nil, limit: 50, offset: 0)
                unprocessedThoughts = allRecent.filter { $0.category == nil }
                    .prefix(20).map { $0 }
                taskThoughts = try await thoughtStore.fetchAll(category: .task, limit: 10, offset: 0)

                let twentyFourHoursAgo = Date().addingTimeInterval(-86400)
                recentThoughts = allRecent.filter {
                    $0.category != nil && $0.category != .task && $0.createdAt >= twentyFourHoursAgo
                }
            } catch {
                Logger.error("Thought fetch failed, continuing without thoughts: \(error.localizedDescription)")
            }

            // Fetch AI insights when enabled (depends on allThoughts, so runs sequentially)
            var insights: [Insight] = []
            if config.insights.enabled {
                do {
                    let allForInsights = unprocessedThoughts + taskThoughts + recentThoughts
                    let insightService = APIInsightService(client: apiClient)
                    insights = try await insightService.generateInsights(thoughts: allForInsights, lookbackDays: config.insights.lookbackDays)
                    Logger.log("Generated \(insights.count) insights")
                } catch {
                    Logger.error("Insight generation failed, continuing without insights: \(error.localizedDescription)")
                }
            }

            // Fetch therapy patterns and prep
            var therapyPatterns: [TherapyPattern] = []
            var therapyPrep: TherapyPrep?
            do {
                let allTherapyThoughts = try await thoughtStore.fetchRecentTherapyThoughts(days: 30, classification: nil, limit: 200)
                let bringToTherapistThoughts = try await thoughtStore.fetchRecentTherapyThoughts(days: 30, classification: .bringToTherapist, limit: 200)

                let patternService = APITherapyPatternService(client: apiClient)
                let prepService = APITherapyPrepService(client: apiClient)

                therapyPatterns = await tryFetch("Therapy patterns") {
                    try await patternService.detectPatterns(thoughts: allTherapyThoughts, lookbackDays: 30)
                } ?? []

                therapyPrep = await tryFetch("Therapy prep") {
                    try await prepService.generatePrep(thoughts: bringToTherapistThoughts, patterns: therapyPatterns)
                }
                Logger.log("Therapy data: \(therapyPatterns.count) patterns, prep: \(therapyPrep != nil ? "yes" : "no")")
            } catch {
                Logger.error("Therapy data fetch failed, continuing without: \(error.localizedDescription)")
            }

            // Build thought summaries for contextual affirmation (max 10, truncated to 50 chars)
            let allThoughts = unprocessedThoughts + taskThoughts + recentThoughts
            let thoughtSummaries = allThoughts.prefix(10).map { String($0.content.prefix(50)) }

            // Fetch all data concurrently
            Logger.log("Fetching data...")

            async let gameResult = tryFetch("Tigers score") { try await sportsService.fetchYesterdayGame() }
            async let upcomingResult = tryFetch("Upcoming game") { try await sportsService.fetchUpcomingGame() }
            async let standingsResult = tryFetch("Standings") { try await sportsService.fetchStandings() }
            async let todosResult = tryFetch("Reminders") { try await remindersService.fetchTodoItems() }
            async let workOrdersResult = tryFetch("Work orders") { try await emailService.fetchWorkOrders() }
            async let affirmationResult = tryFetch("Affirmation") { try await aiProvider.generateAffirmation(recentThoughts: Array(thoughtSummaries)) }
            async let calendarResult = tryFetch("Calendar") { try await calendarService?.fetchTodayEvents() ?? [] }

            // Fetch additional sports data concurrently
            let enabledOtherSports: [(key: String, displayName: String, sportPath: String, sportConfig: AppConfig.SportsConfig.SportLeagueConfig)] = [
                ("nfl", "NFL", "football/nfl", config.sports.nfl),
                ("nba", "NBA", "basketball/nba", config.sports.nba),
                ("nhl", "NHL", "hockey/nhl", config.sports.nhl),
            ].filter { $0.sportConfig.enabled }

            var additionalSports: [SportData] = []
            if !enabledOtherSports.isEmpty {
                additionalSports = await withTaskGroup(of: SportData.self) { group in
                    for (key, displayName, sportPath, sportConfig) in enabledOtherSports {
                        group.addTask {
                            let service = ESPNSportsService(sport: sportPath, config: sportConfig)
                            let game = await self.tryFetch("\(displayName) score") { try await service.fetchYesterdayGame() }
                            let upcoming = await self.tryFetch("\(displayName) upcoming") { try await service.fetchUpcomingGame() }
                            let standings = await self.tryFetch("\(displayName) standings") { try await service.fetchStandings() }
                            return SportData(
                                sport: key,
                                sportDisplayName: displayName,
                                teamName: sportConfig.teamName,
                                divisionName: sportConfig.divisionName,
                                gameScore: game ?? nil,
                                upcomingGame: upcoming ?? nil,
                                standings: standings ?? []
                            )
                        }
                    }
                    var results: [SportData] = []
                    for await result in group {
                        results.append(result)
                    }
                    return results
                }
                // Sort to maintain consistent order: nfl, nba, nhl
                let sportOrder = ["nfl", "nba", "nhl"]
                additionalSports.sort { sportOrder.firstIndex(of: $0.sport) ?? 0 < sportOrder.firstIndex(of: $1.sport) ?? 0 }
            }

            // Pass all work orders with their statuses for status-aware rendering
            let allWorkOrders = await (workOrdersResult ?? [])
            var woStatuses: [String: String] = [:]
            for wo in allWorkOrders {
                woStatuses[wo.caseNumber] = CompletionStore.status(for: wo.caseNumber).rawValue
            }

            // AI-prioritize open (non-done) work orders
            let openWorkOrders = allWorkOrders.filter {
                CompletionStore.status(for: $0.caseNumber) != .done
            }
            let woPriorityOrder = await tryFetch("WO Priority") {
                try await prioritizer.prioritize(workOrders: openWorkOrders)
            } ?? nil

            let briefData = await DailyBriefData(
                date: Date(),
                workOrders: allWorkOrders,
                todoItems: todosResult ?? [],
                gameScore: gameResult ?? nil,
                upcomingGame: upcomingResult ?? nil,
                standings: standingsResult ?? [],
                affirmation: affirmationResult ?? "You've got this. Your brain works differently, and that's your superpower.",
                calendarEvents: calendarResult ?? [],
                teamName: config.sports.mlb.teamName,
                divisionName: config.sports.mlb.divisionName,
                additionalSports: additionalSports,
                workOrderStatuses: woStatuses,
                unprocessedThoughts: unprocessedThoughts,
                taskThoughts: taskThoughts,
                recentThoughts: recentThoughts,
                insights: insights,
                workOrderPriorityOrder: woPriorityOrder,
                therapyPatterns: therapyPatterns,
                therapyPrep: therapyPrep
            )

            Logger.log("Data fetched: \(briefData.workOrders.count) work orders, \(briefData.todoItems.count) todos, game: \(briefData.gameScore != nil ? "yes" : "no"), standings: \(briefData.standings.count) teams")

            if dryRun {
                printSummary(briefData, isContextualAffirmation: !thoughtSummaries.isEmpty)
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

            // Save brief snapshot to API (non-critical — don't fail generate on error)
            let allThoughtsForSnapshot = unprocessedThoughts + taskThoughts + recentThoughts
            let snapshot = buildBriefSnapshot(
                date: briefData.date,
                briefData: briefData,
                allThoughts: allThoughtsForSnapshot,
                pdfFilename: filename
            )
            if let _ = try? await apiClient.post(path: "/briefs", body: snapshot) as BriefRecord {
                Logger.log("Brief snapshot saved to API")
            } else {
                Logger.error("Brief snapshot save failed (non-critical)")
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

        private func printSummary(_ data: DailyBriefData, isContextualAffirmation: Bool = false) {
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

            print("\nTODAY'S SCHEDULE (\(data.calendarEvents.count)):")
            for event in data.calendarEvents {
                print("  \(event.timeString)  \(event.title)")
                if let loc = event.location { print("    \u{1F4CD} \(loc)") }
            }
            if data.calendarEvents.isEmpty { print("  (no events)") }

            print("\n\(data.teamName.uppercased()):")
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

            print("\n\(data.divisionName.uppercased()):")
            for entry in data.standings {
                print("  \(entry.divisionRank). \(entry.team)\t\(entry.wins)-\(entry.losses)\tGB: \(entry.gamesBack)")
            }
            if data.standings.isEmpty { print("  (unavailable)") }

            let affirmationType = isContextualAffirmation ? "(contextual)" : "(generic)"
            print("\nAFFIRMATION \(affirmationType):")
            print("  \(data.affirmation)")

            print("\nUNPROCESSED (\(data.unprocessedThoughts.count)):")
            for thought in data.unprocessedThoughts.prefix(5) {
                print("  • [\(thought.source.rawValue)] \(thought.content.prefix(60))")
            }
            if data.unprocessedThoughts.isEmpty { print("  All caught up!") }

            print("\nTODAY'S TASKS (\(data.taskThoughts.count)):")
            for thought in data.taskThoughts.prefix(8) {
                print("  [ ] \(thought.content.prefix(60))")
            }
            if data.taskThoughts.isEmpty { print("  (none)") }

            print("\nRECENT CAPTURES (\(data.recentThoughts.count)):")
            for thought in data.recentThoughts.prefix(5) {
                let cat = thought.category?.rawValue ?? "uncategorized"
                print("  [\(cat)] \(thought.content.prefix(60))")
            }
            if data.recentThoughts.isEmpty { print("  (none)") }
            print()
        }

        private func buildBriefSnapshot(
            date: Date,
            briefData: DailyBriefData,
            allThoughts: [Thought],
            pdfFilename: String
        ) -> BriefSnapshot {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            let dateString = formatter.string(from: date)

            // Category counts from all thoughts
            var categoryCounts: [String: Int] = [:]
            for thought in allThoughts {
                let key = thought.category?.rawValue ?? "uncategorized"
                categoryCounts[key, default: 0] += 1
            }

            // Top task summaries (first 5 task titles, truncated)
            let topTasks = briefData.taskThoughts.prefix(5).map {
                String($0.content.prefix(80))
            }

            // Sports summary
            var sportsSummary: String? = nil
            if let game = briefData.gameScore {
                sportsSummary = "\(briefData.teamName): \(game.summaryLine1)"
            }

            let summary = BriefSnapshot.BriefSummary(
                categoryCounts: categoryCounts,
                openTaskCount: briefData.taskThoughts.count,
                topTaskSummaries: Array(topTasks),
                hasTherapyData: briefData.therapyPrep != nil || !briefData.therapyPatterns.isEmpty,
                sportsSummary: sportsSummary,
                affirmation: briefData.affirmation,
                calendarEventCount: briefData.calendarEvents.count,
                workOrderCount: briefData.workOrders.count
            )

            return BriefSnapshot(
                date: dateString,
                summary: summary,
                pdfFilename: pdfFilename,
                thoughtCount: allThoughts.count,
                taskCount: briefData.taskThoughts.count
            )
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
                "email": {
                    "email_address": "your-email@example.com",
                    "app_password": "xxxx xxxx xxxx xxxx",
                    "imap_host": "imap.gmail.com",
                    "imap_port": 993,
                    "use_tls": true,
                    "search_subject_pattern": "has been assigned to you",
                    "lookback_days": 3,
                    "auth_type": "app_password",
                    "oauth2_client_id": "",
                    "oauth2_tenant_id": "",
                    "oauth2_refresh_token": ""
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

// MARK: - History

extension DailyBrief {
    struct History: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            abstract: "List and reprint past daily briefs."
        )

        @Option(help: "Number of briefs to show (default: 14)")
        var limit: Int = 14

        @Option(help: "Reprint a past brief by date (YYYY-MM-DD)")
        var reprint: String?

        @Option(help: "Path to config file")
        var configPath: String?

        func run() async throws {
            let config: AppConfig
            do {
                config = try ConfigLoader.load(from: configPath)
            } catch {
                Logger.error("Config error: \(error.localizedDescription)")
                throw error
            }

            let apiClient = VigilAPIClient(
                baseURL: URL(string: config.apiBaseUrl)!,
                apiKey: config.apiKey
            )

            // Reprint mode: find and print a specific date's PDF
            if let reprintDate = reprint {
                guard reprintDate.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else {
                    print("Error: Date must be in YYYY-MM-DD format")
                    throw ExitCode.failure
                }

                // Check if PDF exists locally
                let outputDir = ConfigLoader.expandPath(config.pdf.outputDirectory)
                let pdfFilename = "daily_sheet_\(reprintDate).pdf"
                let pdfPath = (outputDir as NSString).appendingPathComponent(pdfFilename)

                if FileManager.default.fileExists(atPath: pdfPath) {
                    try PrintService.printPDF(at: pdfPath, config: config.printing)
                    print("Reprinted brief for \(reprintDate)")
                } else {
                    // Try to get info from API
                    if let record: BriefRecord = try? await apiClient.get(path: "/briefs/\(reprintDate)") {
                        print("PDF not found locally. Brief was generated on \(record.date) with \(record.thoughtCount) thoughts.")
                    } else {
                        print("PDF not found locally and no record found in API for \(reprintDate).")
                    }
                }
                return
            }

            // List mode: show recent briefs
            let query = ["limit": String(limit)]
            let response: PaginatedResponse<BriefRecord>
            do {
                response = try await apiClient.get(path: "/briefs", query: query)
            } catch {
                print("Error fetching brief history: \(error.localizedDescription)")
                throw ExitCode.failure
            }

            if response.data.isEmpty {
                print("No briefs found. Generate a brief first with: dailybrief generate")
                return
            }

            // Print formatted table
            print("")
            print(String(format: "%-12s  %-9s  %-6s  %@", "Date", "Thoughts", "Tasks", "PDF"))
            print(String(repeating: "-", count: 60))
            for record in response.data {
                let pdf = record.pdfFilename ?? "-"
                print(String(format: "%-12s  %-9d  %-6d  %@",
                    record.date,
                    record.thoughtCount,
                    record.taskCount,
                    pdf))
            }
            print("")
            print("Showing \(response.data.count) of \(response.total) briefs")
        }
    }
}

// MARK: - Export

extension DailyBrief {
    struct Export: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            abstract: "Export thoughts as JSON, CSV, or Markdown."
        )

        @Option(help: "Output format: json, csv, or markdown (default: json)")
        var format: String = "json"

        @Option(help: "Filter by category (task, therapy, idea, reflection, project)")
        var category: String?

        @Option(help: "Start date filter (YYYY-MM-DD)")
        var from: String?

        @Option(help: "End date filter (YYYY-MM-DD)")
        var to: String?

        @Option(help: "Output file path (default: ~/Documents/DailyBrief/vigil-export-DATE.FORMAT)")
        var output: String?

        @Option(help: "Path to config file")
        var configPath: String?

        func run() async throws {
            let validFormats = ["json", "csv", "markdown"]
            guard validFormats.contains(format) else {
                print("Error: format must be one of: json, csv, markdown")
                throw ExitCode.failure
            }

            let dateRegex = #"^\d{4}-\d{2}-\d{2}$"#
            if let from = from, from.range(of: dateRegex, options: .regularExpression) == nil {
                print("Error: --from must be in YYYY-MM-DD format")
                throw ExitCode.failure
            }
            if let to = to, to.range(of: dateRegex, options: .regularExpression) == nil {
                print("Error: --to must be in YYYY-MM-DD format")
                throw ExitCode.failure
            }

            let config: AppConfig
            do {
                config = try ConfigLoader.load(from: configPath)
            } catch {
                Logger.error("Config error: \(error.localizedDescription)")
                throw error
            }

            let apiClient = VigilAPIClient(
                baseURL: URL(string: config.apiBaseUrl)!,
                apiKey: config.apiKey
            )

            // Build query params
            var params: [String: String] = ["format": format]
            if let category = category { params["category"] = category }
            if let from = from { params["from"] = from }
            if let to = to { params["to"] = to }

            // Determine Accept header
            let acceptHeader: String
            switch format {
            case "csv": acceptHeader = "text/csv"
            case "markdown": acceptHeader = "text/markdown"
            default: acceptHeader = "application/json"
            }

            let data: Data
            do {
                data = try await apiClient.getRawData(path: "/export", query: params, accept: acceptHeader)
            } catch {
                print("Error fetching export: \(error.localizedDescription)")
                throw ExitCode.failure
            }

            // Determine file extension
            let ext: String
            switch format {
            case "csv": ext = "csv"
            case "markdown": ext = "md"
            default: ext = "json"
            }

            // Determine output path
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            let dateStr = formatter.string(from: Date())

            let outputPath: String
            if let output = output {
                outputPath = ConfigLoader.expandPath(output)
            } else {
                let outputDir = ConfigLoader.expandPath("~/Documents/DailyBrief")
                try ConfigLoader.ensureDirectoryExists(outputDir)
                outputPath = (outputDir as NSString).appendingPathComponent("vigil-export-\(dateStr).\(ext)")
            }

            // Write to file
            try data.write(to: URL(fileURLWithPath: outputPath))

            print("Exported to \(outputPath) (\(data.count) bytes)")
        }
    }
}

// MARK: - Complete

extension DailyBrief {
    struct Complete: ParsableCommand {
        static let configuration = CommandConfiguration(abstract: "Mark a work order as complete (or set a specific status).")

        @Argument(help: "Case number(s) to update (e.g. CS0353598)")
        var caseNumbers: [String]

        @Option(help: "Set status: open, inProgress, or done (default: done)")
        var status: String = "done"

        func run() {
            guard let parsed = CompletionStore.WorkOrderStatus(rawValue: status) else {
                print("Invalid status '\(status)'. Use: open, inProgress, or done")
                return
            }
            for cn in caseNumbers {
                CompletionStore.setStatus(cn, parsed)
                print("Work order \(cn) → \(parsed.rawValue)")
            }
        }
    }
}

// MARK: - Uncomplete

extension DailyBrief {
    struct Uncomplete: ParsableCommand {
        static let configuration = CommandConfiguration(abstract: "Unmark a work order so it appears again (sets status to open).")

        @Argument(help: "Case number(s) to unmark (e.g. CS0353598)")
        var caseNumbers: [String]

        func run() {
            for cn in caseNumbers {
                CompletionStore.markIncomplete(cn)
                print("Work order \(cn) → open")
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

// MARK: - Email Auth (OAuth2 Device Code Flow)

extension DailyBrief {
    struct EmailAuth: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            commandName: "email-auth",
            abstract: "Authenticate with Microsoft 365 for OAuth2 IMAP access using device code flow."
        )

        @Option(help: "Path to config file")
        var configPath: String?

        func run() async throws {
            var config: AppConfig
            do {
                config = try ConfigLoader.load(from: configPath)
            } catch {
                Logger.error("Config error: \(error.localizedDescription)")
                throw error
            }

            let clientId = config.email.oauth2ClientId
            let tenantId = config.email.oauth2TenantId

            guard !clientId.isEmpty, !tenantId.isEmpty else {
                print("Error: Set oauth2_client_id and oauth2_tenant_id in config first (see --setup)")
                throw ExitCode.failure
            }

            // Step 1: Request device code
            let deviceCodeURL = URL(string: "https://login.microsoftonline.com/\(tenantId)/oauth2/v2.0/devicecode")!
            let deviceCodeBody = "client_id=\(clientId)&scope=offline_access%20https%3A%2F%2Foutlook.office365.com%2FIMAP.AccessAsUser.All"

            var deviceCodeRequest = URLRequest(url: deviceCodeURL)
            deviceCodeRequest.httpMethod = "POST"
            deviceCodeRequest.httpBody = deviceCodeBody.data(using: .utf8)
            deviceCodeRequest.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

            let (deviceCodeData, deviceCodeResponse) = try await URLSession.shared.data(for: deviceCodeRequest)

            guard let httpResponse = deviceCodeResponse as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                let body = String(data: deviceCodeData, encoding: .utf8) ?? "(no response)"
                print("Error: Failed to request device code: \(body)")
                throw ExitCode.failure
            }

            guard let deviceCodeJSON = try JSONSerialization.jsonObject(with: deviceCodeData) as? [String: Any],
                  let deviceCode = deviceCodeJSON["device_code"] as? String,
                  let userCode = deviceCodeJSON["user_code"] as? String,
                  let verificationUri = deviceCodeJSON["verification_uri"] as? String,
                  let interval = deviceCodeJSON["interval"] as? Int,
                  let expiresIn = deviceCodeJSON["expires_in"] as? Int else {
                print("Error: Unexpected device code response format")
                throw ExitCode.failure
            }

            // Step 2: Display instructions
            print("")
            print("To authenticate, visit: \(verificationUri)")
            print("Enter code: \(userCode)")
            print("Waiting for authentication...")
            print("")

            // Step 3: Poll for token
            let tokenURL = URL(string: "https://login.microsoftonline.com/\(tenantId)/oauth2/v2.0/token")!
            let tokenBody = "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code&device_code=\(deviceCode)&client_id=\(clientId)"

            let deadline = Date().addingTimeInterval(Double(expiresIn))

            while Date() < deadline {
                try await Task.sleep(nanoseconds: UInt64(interval) * 1_000_000_000)

                var tokenRequest = URLRequest(url: tokenURL)
                tokenRequest.httpMethod = "POST"
                tokenRequest.httpBody = tokenBody.data(using: .utf8)
                tokenRequest.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

                let (tokenData, _) = try await URLSession.shared.data(for: tokenRequest)

                guard let tokenJSON = try JSONSerialization.jsonObject(with: tokenData) as? [String: Any] else {
                    continue
                }

                // Check for success (refresh_token present)
                if let refreshToken = tokenJSON["refresh_token"] as? String {
                    config.email.oauth2RefreshToken = refreshToken
                    config.email.authType = "oauth2"
                    try ConfigLoader.save(config)
                    print("Authentication successful! Refresh token saved.")
                    return
                }

                // Check for pending or error
                if let error = tokenJSON["error"] as? String {
                    if error == "authorization_pending" {
                        continue
                    }
                    let description = tokenJSON["error_description"] as? String ?? error
                    print("Error: \(description)")
                    throw ExitCode.failure
                }
            }

            print("Error: Authentication timed out. Please try again.")
            throw ExitCode.failure
        }
    }
}
