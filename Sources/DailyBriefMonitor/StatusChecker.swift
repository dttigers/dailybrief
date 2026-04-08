import Foundation

@Observable
final class StatusChecker: @unchecked Sendable {
    var lastRunTime: String = "Never"
    var lastRunSuccess: Bool? = nil
    var isRunning: Bool = false
    var lastExitCode: Int32? = nil

    private let logPath = NSString("~/Library/Logs/DailyBrief/dailybrief.log").expandingTildeInPath
    private let pdfDir = NSString("~/Documents/DailyBrief").expandingTildeInPath
    private let configPath = NSString("~/.config/dailybrief/config.json").expandingTildeInPath
    private let cliBinary: String

    init() {
        // Search for CLI binary: installed path first, then dev build paths derived from RepoLocation (D-09)
        let releaseDir = RepoLocation.releaseBuildDir
        let debugDir = (RepoLocation.path as NSString).appendingPathComponent(".build/debug")
        let candidates = [
            NSString("~/.local/bin/DailyBrief").expandingTildeInPath,
            (releaseDir as NSString).appendingPathComponent("DailyBrief"),
            (debugDir as NSString).appendingPathComponent("DailyBrief"),
        ]
        self.cliBinary = candidates.first(where: { FileManager.default.fileExists(atPath: $0) })
            ?? candidates[0] // Default to installed path even if not yet installed
        refresh()
    }

    func refresh() {
        guard FileManager.default.fileExists(atPath: logPath),
              let content = try? String(contentsOfFile: logPath, encoding: .utf8) else {
            lastRunTime = "No log file"
            lastRunSuccess = nil
            return
        }

        let lines = content.components(separatedBy: .newlines).reversed()

        // Find the most recent "DailyBrief complete" or "DailyBrief starting"
        for line in lines {
            if line.contains("DailyBrief complete") {
                lastRunSuccess = true
                lastRunTime = extractTimestamp(from: line)
                return
            }
            if line.contains("ERROR") {
                lastRunSuccess = false
                lastRunTime = extractTimestamp(from: line)
                return
            }
            if line.contains("DailyBrief starting") {
                // No "complete" or "ERROR" after "starting" — likely crashed
                lastRunSuccess = false
                lastRunTime = extractTimestamp(from: line) + " (crashed?)"
                return
            }
        }

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
