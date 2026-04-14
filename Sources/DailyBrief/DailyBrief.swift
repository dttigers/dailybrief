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

        @Flag(help: "Create a template config file and exit")
        var setup = false

        @Option(help: "Path to config file")
        var configPath: String?

        func run() async throws {
            if setup {
                try createTemplateConfig()
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

            if dryRun {
                Logger.log("Dry run: would call POST /v1/brief/generate")
                return
            }

            Logger.log("Requesting brief from server...")

            let pdfData: Data
            do {
                pdfData = try await apiClient.postRawData(
                    path: "/v1/brief/generate",
                    accept: "application/pdf"
                )
            } catch {
                Logger.error("Brief generation failed: \(error.localizedDescription)")
                throw ExitCode.failure
            }

            Logger.log("PDF received (\(pdfData.count) bytes)")

            // Save to output directory (same path convention as before)
            let outputDir = ConfigLoader.expandPath(config.pdf.outputDirectory)
            try ConfigLoader.ensureDirectoryExists(outputDir)

            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            let filename = "daily_sheet_\(formatter.string(from: Date())).pdf"
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
            let validStatuses = ["open", "inProgress", "done"]
            guard validStatuses.contains(status) else {
                print("Invalid status '\(status)'. Use: open, inProgress, or done")
                return
            }

            let config = try ConfigLoader.load(from: configPath)
            let apiClient = try DailyBrief.makeAPIClient(config: config)

            struct StatusBody: Encodable { let status: String }
            struct StatusResponse: Decodable { let caseNumber: String; let status: String }

            for cn in caseNumbers {
                guard let encoded = cn.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
                    print("Invalid case number: \(cn)")
                    continue
                }
                do {
                    let _: StatusResponse = try await apiClient.put(
                        path: "/work-orders/\(encoded)/status",
                        body: StatusBody(status: status)
                    )
                    print("Work order \(cn) -> \(status)")
                } catch {
                    print("API error for \(cn): \(error.localizedDescription)")
                    // Fallback to local store
                    if let parsed = CompletionStore.WorkOrderStatus(rawValue: status) {
                        CompletionStore.setStatus(cn, parsed)
                        print("  (saved locally as fallback)")
                    }
                }
            }
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
            let config = try ConfigLoader.load(from: configPath)
            let apiClient = try DailyBrief.makeAPIClient(config: config)

            struct StatusBody: Encodable { let status: String }
            struct StatusResponse: Decodable { let caseNumber: String; let status: String }

            for cn in caseNumbers {
                guard let encoded = cn.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
                    print("Invalid case number: \(cn)")
                    continue
                }
                do {
                    let _: StatusResponse = try await apiClient.put(
                        path: "/work-orders/\(encoded)/status",
                        body: StatusBody(status: "open")
                    )
                    print("Work order \(cn) -> open")
                } catch {
                    print("API error for \(cn): \(error.localizedDescription)")
                    CompletionStore.markIncomplete(cn)
                    print("  (saved locally as fallback)")
                }
            }
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
            let config = try ConfigLoader.load(from: configPath)
            let apiClient = try DailyBrief.makeAPIClient(config: config)

            let statuses: [String: String]
            do {
                statuses = try await apiClient.get(path: "/work-orders/statuses")
            } catch {
                Logger.error("API fetch failed, falling back to local store: \(error.localizedDescription)")
                let items = CompletionStore.listCompleted()
                if items.isEmpty {
                    print("No completed work orders")
                } else {
                    print("Completed work orders (local):")
                    for item in items { print("  \(item)") }
                }
                return
            }

            let completed = statuses.filter { $0.value == "done" }.keys.sorted()
            if completed.isEmpty {
                print("No completed work orders")
            } else {
                print("Completed work orders:")
                for item in completed { print("  \(item)") }
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
