import Foundation

@Observable
final class StatusChecker: @unchecked Sendable {
    var lastRunTime: String = "Never"
    var lastRunSuccess: Bool? = nil
    var isRunning: Bool = false
    var lastExitCode: Int32? = nil

    /// True when the most recent CLI run exited with the staleness sentinel (code 2).
    var isStale: Bool { lastExitCode == 2 }

    /// True when the most recent CLI run failed for non-staleness reasons (exit != 0 and != 2).
    var didFailNonStale: Bool {
        guard let code = lastExitCode else { return false }
        return code != 0 && code != 2
    }

    private let logPath: String
    private let pdfDir: String
    private let configPath: String
    private let cliBinary: String

    convenience init() {
        // Search for CLI binary: installed path first, then dev build paths derived from RepoLocation (D-09)
        let releaseDir = RepoLocation.releaseBuildDir
        let debugDir = (RepoLocation.path as NSString).appendingPathComponent(".build/debug")
        let candidates = [
            NSString("~/.local/bin/DailyBrief").expandingTildeInPath,
            (releaseDir as NSString).appendingPathComponent("DailyBrief"),
            (debugDir as NSString).appendingPathComponent("DailyBrief"),
        ]
        let resolvedCLI = candidates.first(where: { FileManager.default.fileExists(atPath: $0) })
            ?? candidates[0] // Default to installed path even if not yet installed
        self.init(
            logPath: NSString("~/Library/Logs/DailyBrief/dailybrief.log").expandingTildeInPath,
            pdfDir: NSString("~/Documents/DailyBrief").expandingTildeInPath,
            configPath: NSString("~/.config/dailybrief/config.json").expandingTildeInPath,
            cliBinary: resolvedCLI
        )
    }

    /// Test / internal initializer with parameterized paths. Production code uses `init()`.
    init(
        logPath: String,
        pdfDir: String = NSString("~/Documents/DailyBrief").expandingTildeInPath,
        configPath: String = NSString("~/.config/dailybrief/config.json").expandingTildeInPath,
        cliBinary: String = NSString("~/.local/bin/DailyBrief").expandingTildeInPath
    ) {
        self.logPath = logPath
        self.pdfDir = pdfDir
        self.configPath = configPath
        self.cliBinary = cliBinary
        refresh()
    }

    func refresh() {
        guard FileManager.default.fileExists(atPath: logPath),
              let content = try? String(contentsOfFile: logPath, encoding: .utf8) else {
            // Preserve prior lastExitCode — don't erase state set by runNow() before log flush
            lastRunTime = "No log file"
            lastRunSuccess = nil
            return
        }

        let lines = content.components(separatedBy: .newlines).reversed()

        // Find the most recent terminal log marker. Most recent wins (reverse walk).
        // Plan 86-06: also infer lastExitCode from log markers so externally-invoked
        // CLI runs (launchd/cron/terminal) drive the menubar staleness/failure UI.
        for line in lines {
            if line.contains("DailyBrief complete") {
                lastRunSuccess = true
                lastExitCode = 0
                lastRunTime = extractTimestamp(from: line)
                return
            }
            if line.contains("No brief for today") {
                lastRunSuccess = false
                lastExitCode = 2
                lastRunTime = extractTimestamp(from: line)
                return
            }
            if line.contains("ERROR") {
                lastRunSuccess = false
                lastExitCode = 1
                lastRunTime = extractTimestamp(from: line)
                return
            }
            if line.contains("DailyBrief starting") {
                // No "complete"/"ERROR"/"No brief for today" after "starting" — likely crashed
                lastRunSuccess = false
                lastExitCode = 1
                lastRunTime = extractTimestamp(from: line) + " (crashed?)"
                return
            }
        }

        // No markers found — preserve prior lastExitCode (don't erase state set by
        // runNow() before log flush; avoids race with runNow()'s MainActor write).
        lastRunTime = "No runs found"
        lastRunSuccess = nil
    }

    private func extractTimestamp(from line: String) -> String {
        // Format: [2026-03-30 13:56:33] [INFO] ...
        if let start = line.range(of: "["),
           let end = line.range(of: "]") {
            let timestamp = String(line[start.upperBound..<end.lowerBound])
            return timestamp.trimmingCharacters(in: .whitespaces)
        }
        return "Unknown"
    }

    func todaysPDFPath() -> String? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let filename = "daily_sheet_\(formatter.string(from: Date())).pdf"
        let path = (pdfDir as NSString).appendingPathComponent(filename)
        return FileManager.default.fileExists(atPath: path) ? path : nil
    }

    func latestPDFPath() -> String? {
        guard let files = try? FileManager.default.contentsOfDirectory(atPath: pdfDir) else { return nil }
        let pdfs = files.filter { $0.hasSuffix(".pdf") }.sorted().reversed()
        guard let latest = pdfs.first else { return nil }
        return (pdfDir as NSString).appendingPathComponent(latest)
    }

    var logFilePath: String { logPath }
    var configFilePath: String { configPath }

    func runNow() {
        guard !isRunning else { return }
        isRunning = true

        Task.detached { [cliBinary] in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: cliBinary)
            process.arguments = []

            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = pipe

            try? process.run()
            process.waitUntilExit()

            let exitCode = process.terminationStatus
            let exitReason = process.terminationReason

            if exitCode != 0 {
                NSLog("DailyBrief CLI exited with code %d (reason: %d)", exitCode, exitReason.rawValue)
            }

            await MainActor.run { [weak self] in
                self?.isRunning = false
                self?.lastExitCode = exitCode
                self?.refresh()
            }
        }
    }
}
