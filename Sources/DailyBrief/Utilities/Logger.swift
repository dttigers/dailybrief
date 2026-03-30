import Foundation

enum Logger {
    static let logDir = NSString("~/Library/Logs/DailyBrief").expandingTildeInPath

    static func log(_ message: String, level: String = "INFO") {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        let timestamp = formatter.string(from: Date())
        let line = "[\(timestamp)] [\(level)] \(message)"
        print(line)

        // Also append to log file
        let logFile = (logDir as NSString).appendingPathComponent("dailybrief.log")
        try? FileManager.default.createDirectory(atPath: logDir, withIntermediateDirectories: true)
        if let data = (line + "\n").data(using: .utf8) {
            if FileManager.default.fileExists(atPath: logFile) {
                if let handle = FileHandle(forWritingAtPath: logFile) {
                    handle.seekToEndOfFile()
                    handle.write(data)
                    handle.closeFile()
                }
            } else {
                FileManager.default.createFile(atPath: logFile, contents: data)
            }
        }
    }

    static func error(_ message: String) {
        log(message, level: "ERROR")
    }
}
