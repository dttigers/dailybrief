import Foundation

@Observable
final class StatusChecker: @unchecked Sendable {
    var lastRunTime: String = "Never"
    var lastRunSuccess: Bool? = nil
    var isRunning: Bool = false

    private let logPath = NSString("~/Library/Logs/DailyBrief/dailybrief.log").expandingTildeInPath
    private let pdfDir = NSString("~/Documents/DailyBrief").expandingTildeInPath
    private let configPath = NSString("~/.config/dailybrief/config.json").expandingTildeInPath
    private let cliBinary: String

    init() {
        // Find the CLI binary relative to this app's location, or use a known path
        let knownPath = NSString("~/Desktop/Local AI/DailyBrief/.build/release/DailyBrief").expandingTildeInPath
        self.cliBinary = FileManager.default.fileExists(atPath: knownPath)
            ? knownPath
            : NSString("~/Desktop/Local AI/DailyBrief/.build/debug/DailyBrief").expandingTildeInPath
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
                lastRunSuccess = nil // Started but no completion found
                lastRunTime = extractTimestamp(from: line) + " (in progress?)"
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
            process.arguments = ["--no-print"]

            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = pipe

            try? process.run()
            process.waitUntilExit()

            await MainActor.run { [weak self] in
                self?.isRunning = false
                self?.refresh()
            }
        }
    }
}
