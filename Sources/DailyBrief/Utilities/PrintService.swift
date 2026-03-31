import Foundation

enum PrintService {
    static func printPDF(at path: String, config: AppConfig.PrintingConfig) throws {
        guard config.enabled else {
            Logger.log("Printing disabled in config")
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/lpr")

        var args = [String]()
        if !config.printerName.isEmpty {
            args += ["-P", config.printerName]
        }
        if config.copies > 1 {
            args += ["-#", String(config.copies)]
        }
        args += ["-o", "sides=one-sided"]
        args.append(path)

        process.arguments = args

        try process.run()
        process.waitUntilExit()

        if process.terminationStatus == 0 {
            Logger.log("PDF sent to printer")
        } else {
            Logger.error("Print failed with exit code \(process.terminationStatus)")
        }
    }
}
