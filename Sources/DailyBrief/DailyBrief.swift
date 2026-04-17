import ArgumentParser
import Foundation
import JarvisCore

@main
struct DailyBrief: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        abstract: "Generate a daily briefing PDF with work orders, todos, sports scores, and an ADHD affirmation.",
        subcommands: [Generate.self, History.self, Export.self,
                      Capture.self, Triage.self, Doctor.self, Setup.self,
                      Complete.self, Uncomplete.self, ListCompleted.self, EmailAuth.self],
        defaultSubcommand: Generate.self
    )

    /// Build a VigilAPIClient from config, throwing ExitCode.failure on invalid URL.
    static func makeAPIClient(config: AppConfig) throws -> VigilAPIClient {
        guard let baseURL = URL(string: config.apiBaseUrl) else {
            Logger.error("Invalid API base URL: \(config.apiBaseUrl)")
            throw ExitCode.failure
        }
        return VigilAPIClient(baseURL: baseURL, apiKey: config.apiKey)
    }
}

// MARK: - Generate (default)

extension DailyBrief {
    struct Generate: AsyncParsableCommand {
        static let configuration = CommandConfiguration(abstract: "Generate and optionally print the daily brief.")

        @Flag(help: "Skip printing the PDF")
        var noPrint = false

        @Flag(help: "Fetch data and display results without generating PDF")
        var dryRun = false

        @Flag(help: "Create a template config file and exit (deprecated — use: dailybrief setup)")
        var setup = false

        @Option(help: "Path to config file")
        var configPath: String?

        func run() async throws {
            if setup {
                print("Warning: --setup is deprecated. Use: dailybrief setup")
                try Setup.createTemplateConfig()
                return
            }

            let config: AppConfig
            do {
                config = try ConfigLoader.load(from: configPath)
            } catch {
                Logger.error("Config error: \(error.localizedDescription)")
                throw error
            }

            let apiClient = try DailyBrief.makeAPIClient(config: config)

            // Compute today's date in local timezone (D-12 step 1)
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.timeZone = TimeZone.current
            let today = formatter.string(from: Date())

            if dryRun {
                Logger.log("Dry run: would GET /v1/brief/\(today)")
                return
            }

            Logger.log("Fetching brief for \(today) from server...")

            // D-12: GET /v1/brief/:today — pull-only
            let pdfData: Data
            do {
                pdfData = try await apiClient.getRawData(
                    path: "/v1/brief/\(today)",
                    accept: "application/pdf"
                )
            } catch let VigilAPIError.httpError(statusCode, _) where statusCode == 404 {
                // Brief PDF lost (Railway /tmp ephemeral) — regenerate on demand
                Logger.log("Brief not cached — requesting server-side generation...")
                do {
                    pdfData = try await apiClient.postRawData(
                        path: "/v1/brief/generate",
                        accept: "application/pdf"
                    )
                    Logger.log("Brief generated on demand (\(pdfData.count) bytes)")
                } catch {
                    Logger.log("No brief for today (\(today))")
                    throw ExitCode(rawValue: 2)
                }
            } catch {
                // D-12 step 5: any other error => exit 1
                Logger.error("Brief fetch failed: \(error.localizedDescription)")
                throw ExitCode.failure
            }

            Logger.log("PDF received (\(pdfData.count) bytes)")

            // Save to output directory (same path convention as before)
            let outputDir = ConfigLoader.expandPath(config.pdf.outputDirectory)
            try ConfigLoader.ensureDirectoryExists(outputDir)

            let filename = "daily_sheet_\(today).pdf"
            let outputPath = (outputDir as NSString).appendingPathComponent(filename)

            try pdfData.write(to: URL(fileURLWithPath: outputPath))

            // Print (per D-04: pipe to PrintService)
            if !noPrint {
                try PrintService.printPDF(at: outputPath, config: config.printing)
            } else {
                Logger.log("Printing skipped (--no-print)")
            }

            // Cleanup old PDFs (existing behavior preserved)
            cleanupOldPDFs(directory: outputDir, keepDays: config.pdf.keepDays)

            Logger.log("DailyBrief complete")
        }

        private func cleanupOldPDFs(directory: String, keepDays: Int) {
            let fm = FileManager.default
            guard let cutoff = Calendar.current.date(byAdding: .day, value: -keepDays, to: Date()) else {
                Logger.error("Invalid keepDays value: \(keepDays)")
                return
            }

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

            let apiClient = try DailyBrief.makeAPIClient(config: config)

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
                    let encodedDate = reprintDate.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? reprintDate
                    if let record: BriefRecord = try? await apiClient.get(path: "/briefs/\(encodedDate)") {
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

            let apiClient = try DailyBrief.makeAPIClient(config: config)

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

// MARK: - Capture (stub)

extension DailyBrief {
    struct Capture: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            abstract: "Post a thought to Vigil and show the AI triage result."
        )

        @Argument(help: "The thought text to capture.")
        var text: String

        @Option(name: .long, help: "Force category (task|therapy|idea|reflection|project). Skips triage.")
        var category: String?

        @Flag(name: .long, help: "Skip AI triage after capture.")
        var noTriage = false

        @Option(name: .long, help: "Source label (default: cli).")
        var source: String = "cli"

        func run() async throws {
            let config: AppConfig
            do {
                config = try ConfigLoader.load(from: nil)
            } catch {
                Logger.error("Config error: \(error.localizedDescription)")
                throw ExitCode.failure
            }

            let apiClient = try DailyBrief.makeAPIClient(config: config)

            // Build request body — only include category if provided
            struct CaptureBody: Encodable {
                let content: String
                let source: String
                let category: String?
            }
            let body = CaptureBody(content: text, source: source, category: category)

            // POST /thoughts
            struct ThoughtResponse: Decodable {
                let id: Int
                let content: String
                let category: String?
            }

            let thought: ThoughtResponse
            do {
                thought = try await apiClient.post(path: "/thoughts", body: body)
            } catch {
                Logger.error("Capture failed: \(error.localizedDescription)")
                throw ExitCode.failure
            }

            print("Captured thought #\(thought.id): \(thought.content)")

            // Triage step — skip if --no-triage or --category was supplied
            if noTriage || category != nil {
                if let cat = thought.category {
                    print("Category: \(cat)")
                } else {
                    print("Triage skipped.")
                }
                return
            }

            // POST /triage
            struct TriageBody: Encodable { let content: String }
            struct TriageResponse: Decodable { let category: String; let confidence: Double }

            let triageResult: TriageResponse
            do {
                triageResult = try await apiClient.post(path: "/triage", body: TriageBody(content: text))
            } catch {
                Logger.error("Triage failed: \(error.localizedDescription)")
                // Capture succeeded; triage failure is non-fatal
                print("Triage unavailable — thought saved without category.")
                return
            }

            // Persist the triage result back onto the thought
            struct UpdateBody: Encodable { let category: String }
            struct UpdateResponse: Decodable { let id: Int; let category: String? }
            let _: UpdateResponse = (try? await apiClient.put(
                path: "/thoughts/\(thought.id)",
                body: UpdateBody(category: triageResult.category)
            )) ?? UpdateResponse(id: thought.id, category: triageResult.category)

            let confidence = Int(triageResult.confidence * 100)
            print("Category: \(triageResult.category) (\(confidence)% confidence)")
        }
    }
}

// MARK: - Triage (stub)

extension DailyBrief {
    struct Triage: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            abstract: "Re-triage uncategorized thoughts in batch."
        )

        @Option(name: .long, help: "Maximum thoughts to triage (default: 20).")
        var limit: Int = 20

        @Flag(name: .long, help: "Re-triage already-categorized thoughts.")
        var force = false

        func run() async throws {
            let config: AppConfig
            do {
                config = try ConfigLoader.load(from: nil)
            } catch {
                Logger.error("Config error: \(error.localizedDescription)")
                throw ExitCode.failure
            }
            let apiClient = try DailyBrief.makeAPIClient(config: config)

            // Fetch thoughts — get `limit` recent thoughts, filter uncategorized client-side
            // (API does not support ?category=null filter)
            struct ThoughtItem: Decodable, Sendable {
                let id: Int
                let content: String
                let category: String?
            }

            // Fetch up to limit*3 to get enough uncategorized ones, cap at 200 (API max)
            let fetchLimit = force ? limit : min(limit * 3, 200)
            let response: PaginatedResponse<ThoughtItem>
            do {
                response = try await apiClient.get(
                    path: "/thoughts",
                    query: ["limit": String(fetchLimit), "offset": "0", "window": "all"]
                )
            } catch {
                Logger.error("Failed to fetch thoughts: \(error.localizedDescription)")
                throw ExitCode.failure
            }

            let candidates: [ThoughtItem]
            if force {
                candidates = Array(response.data.prefix(limit))
            } else {
                candidates = response.data.filter { $0.category == nil }.prefix(limit).map { $0 }
            }

            if candidates.isEmpty {
                print("No uncategorized thoughts found.")
                return
            }

            print("Triaging \(candidates.count) thought(s)...")

            struct TriageBody: Encodable { let content: String }
            struct TriageResponse: Decodable { let category: String; let confidence: Double }
            struct UpdateBody: Encodable { let category: String }
            struct UpdateResponse: Decodable { let id: Int; let category: String? }

            var successCount = 0
            var failCount = 0

            for thought in candidates {
                let triageResult: TriageResponse
                do {
                    triageResult = try await apiClient.post(
                        path: "/triage",
                        body: TriageBody(content: thought.content)
                    )
                } catch {
                    print("  #\(thought.id): FAIL (\(error.localizedDescription))")
                    failCount += 1
                    continue
                }

                do {
                    let _: UpdateResponse = try await apiClient.put(
                        path: "/thoughts/\(thought.id)",
                        body: UpdateBody(category: triageResult.category)
                    )
                    let confidence = Int(triageResult.confidence * 100)
                    print("  #\(thought.id): \(triageResult.category) (\(confidence)%) — \(thought.content.prefix(60))")
                    successCount += 1
                } catch {
                    print("  #\(thought.id): triage ok but save failed (\(error.localizedDescription))")
                    failCount += 1
                }
            }

            print("\nDone: \(successCount) triaged, \(failCount) failed.")
            if failCount > 0 { throw ExitCode.failure }
        }
    }
}

// MARK: - Doctor (stub)

extension DailyBrief {
    struct Doctor: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            abstract: "Check Vigil environment health."
        )

        func run() async throws {
            print("=== Vigil Doctor ===\n")

            var allPass = true

            // Check 1: VIGIL_API_KEY env var
            let apiKeyEnv = ProcessInfo.processInfo.environment["VIGIL_API_KEY"]
            printCheck("VIGIL_API_KEY env var present", pass: apiKeyEnv != nil && !apiKeyEnv!.isEmpty)
            if apiKeyEnv == nil || apiKeyEnv!.isEmpty { allPass = false }

            // Check 2: vigil-core reachable (GET /health from config's apiBaseUrl)
            // Load config to get apiBaseUrl (best-effort — if no config, use default)
            let apiBaseUrl: String
            if let config = try? ConfigLoader.load(from: nil) {
                apiBaseUrl = config.apiBaseUrl
            } else {
                apiBaseUrl = "https://api.vigilhub.io/v1"
            }

            let healthUrl = apiBaseUrl.hasSuffix("/v1")
                ? String(apiBaseUrl.dropLast(3)) + "/v1/health"
                : apiBaseUrl + "/health"

            var coreReachable = false
            if let url = URL(string: healthUrl) {
                var req = URLRequest(url: url, timeoutInterval: 5)
                req.httpMethod = "GET"
                if let (_, resp) = try? await URLSession.shared.data(for: req),
                   let http = resp as? HTTPURLResponse,
                   (200...299).contains(http.statusCode) {
                    coreReachable = true
                }
            }
            printCheck("vigil-core reachable (\(healthUrl))", pass: coreReachable)
            if !coreReachable { allPass = false }

            // Check 3: LaunchAgent plist file exists
            let plistPath = (NSHomeDirectory() as NSString)
                .appendingPathComponent("Library/LaunchAgents/com.jamesonmorrill.dailybriefmonitor.plist")
            let plistExists = FileManager.default.fileExists(atPath: plistPath)
            printCheck("LaunchAgent plist exists (\(plistPath))", pass: plistExists)
            if !plistExists { allPass = false }

            // Check 4: LaunchAgent loaded in launchctl
            var launchctlLoaded = false
            do {
                let task = Process()
                task.executableURL = URL(fileURLWithPath: "/bin/launchctl")
                task.arguments = ["list", "com.jamesonmorrill.dailybriefmonitor"]
                let pipe = Pipe()
                task.standardOutput = pipe
                task.standardError = pipe
                try task.run()
                task.waitUntilExit()
                launchctlLoaded = (task.terminationStatus == 0)
            } catch {
                launchctlLoaded = false
            }
            printCheck("LaunchAgent loaded (launchctl list dailybriefmonitor)", pass: launchctlLoaded)
            if !launchctlLoaded { allPass = false }

            // Check 5: plist ProgramArguments binary exists
            if plistExists,
               let plistData = FileManager.default.contents(atPath: plistPath),
               let plistDict = try? PropertyListSerialization.propertyList(from: plistData, format: nil) as? [String: Any],
               let args = plistDict["ProgramArguments"] as? [String],
               let binaryPath = args.first {
                let binaryExists = FileManager.default.fileExists(atPath: binaryPath)
                printCheck("Plist binary exists (\(binaryPath))", pass: binaryExists)
                if !binaryExists { allPass = false }
            } else if plistExists {
                printCheck("Plist binary exists (could not parse plist)", pass: false)
                allPass = false
            }

            // Check 6: Settings endpoints reachable — print-schedule + generate-schedule + timezone (D-23)
            let baseRoot = apiBaseUrl.hasSuffix("/v1") ? String(apiBaseUrl.dropLast(3)) : apiBaseUrl
            let settingsPaths = ["/v1/settings/print-schedule", "/v1/settings/generate-schedule", "/v1/settings/timezone"]
            var failedEndpoints: [String] = []

            if let apiKey = apiKeyEnv, !apiKey.isEmpty {
                for path in settingsPaths {
                    guard let url = URL(string: baseRoot + path) else {
                        failedEndpoints.append(path + " (bad URL)")
                        continue
                    }
                    var req = URLRequest(url: url, timeoutInterval: 5)
                    req.httpMethod = "GET"
                    req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
                    var ok = false
                    if let (_, resp) = try? await URLSession.shared.data(for: req),
                       let http = resp as? HTTPURLResponse,
                       http.statusCode == 200 {
                        ok = true
                    }
                    if !ok { failedEndpoints.append(path) }
                }
            } else {
                // No API key — mark all as failed so user knows to set VIGIL_API_KEY
                failedEndpoints = settingsPaths
            }

            let settingsAllReachable = failedEndpoints.isEmpty
            let check6Label: String
            if settingsAllReachable {
                check6Label = "Settings endpoints reachable (3/3)"
            } else {
                check6Label = "Settings endpoints reachable — FAILED: \(failedEndpoints.joined(separator: ", "))"
            }
            printCheck(check6Label, pass: settingsAllReachable)
            if !settingsAllReachable { allPass = false }

            // Check 7: Printer reachable (D-08)
            let printerConfig = (try? ConfigLoader.load(from: nil))?.printing
            if let name = printerConfig?.printerName, !name.isEmpty, printerConfig?.enabled == true {
                var printerReachable = false
                do {
                    let printerTask = Process()
                    printerTask.executableURL = URL(fileURLWithPath: "/usr/bin/lpstat")
                    printerTask.arguments = ["-p", name]
                    printerTask.standardOutput = Pipe()
                    printerTask.standardError = Pipe()
                    try printerTask.run()
                    printerTask.waitUntilExit()
                    printerReachable = (printerTask.terminationStatus == 0)
                } catch {
                    printerReachable = false
                }
                printCheck("Printer reachable (\(name))", pass: printerReachable)
                if !printerReachable { allPass = false }
            } else {
                printCheck("Printer reachable (printing disabled or no printer_name)", pass: true)
            }

            print(allPass ? "\n=== All checks passed ===" : "\n=== Some checks FAILED ===")
            if !allPass { throw ExitCode.failure }
        }

        private func printCheck(_ label: String, pass: Bool) {
            let status = pass ? "PASS" : "FAIL"
            print("  [\(status)] \(label)")
        }
    }
}

// MARK: - Setup

extension DailyBrief {
    struct Setup: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            abstract: "Create a template config file at ~/.config/dailybrief/config.json."
        )

        func run() async throws {
            try Setup.createTemplateConfig()
        }

        static func createTemplateConfig() throws {
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

// MARK: - Complete

extension DailyBrief {
    struct Complete: AsyncParsableCommand {
        static let configuration = CommandConfiguration(abstract: "Mark a work order as complete (or set a specific status).")

        @Argument(help: "Case number(s) to update (e.g. CS0353598)")
        var caseNumbers: [String]

        @Option(help: "Set status: open, inProgress, or done (default: done)")
        var status: String = "done"

        @Option(help: "Path to config file")
        var configPath: String?

        func run() async throws {
            print("Work order management has moved to the Vigil dashboard.")
            print("Visit: https://app.vigilhub.io")
        }
    }
}

// MARK: - Uncomplete

extension DailyBrief {
    struct Uncomplete: AsyncParsableCommand {
        static let configuration = CommandConfiguration(abstract: "Unmark a work order so it appears again (sets status to open).")

        @Argument(help: "Case number(s) to unmark (e.g. CS0353598)")
        var caseNumbers: [String]

        @Option(help: "Path to config file")
        var configPath: String?

        func run() async throws {
            print("Work order management has moved to the Vigil dashboard.")
            print("Visit: https://app.vigilhub.io")
        }
    }
}

// MARK: - List Completed

extension DailyBrief {
    struct ListCompleted: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            commandName: "list-completed",
            abstract: "Show all completed work order case numbers."
        )

        @Option(help: "Path to config file")
        var configPath: String?

        func run() async throws {
            print("Work order management has moved to the Vigil dashboard.")
            print("Visit: https://app.vigilhub.io")
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
                print("Error: Set oauth2_client_id and oauth2_tenant_id in config first (see: dailybrief setup)")
                throw ExitCode.failure
            }

            // Step 1: Request device code
            let deviceCodeURL = URL(string: "https://login.microsoftonline.com/\(tenantId)/oauth2/v2.0/devicecode")!
            // WR-04: percent-encode clientId so the form body stays well-formed if the
            // value ever contains '&', '=', or other reserved characters.
            let encodedClientIdForDeviceCode = clientId.addingPercentEncoding(
                withAllowedCharacters: .urlQueryAllowed) ?? clientId
            let deviceCodeBody = "client_id=\(encodedClientIdForDeviceCode)&scope=offline_access%20https%3A%2F%2Foutlook.office365.com%2FIMAP.AccessAsUser.All"

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
            // WR-04: percent-encode deviceCode and clientId — the device_code value is opaque
            // and its format is not guaranteed to be free of '&' or '=' characters.
            let encodedDeviceCode = deviceCode.addingPercentEncoding(
                withAllowedCharacters: .urlQueryAllowed) ?? deviceCode
            let encodedClientId = clientId.addingPercentEncoding(
                withAllowedCharacters: .urlQueryAllowed) ?? clientId
            let tokenBody = "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code"
                + "&device_code=\(encodedDeviceCode)&client_id=\(encodedClientId)"

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
