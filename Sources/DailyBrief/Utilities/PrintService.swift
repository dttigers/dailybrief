import Foundation
import JarvisCore

enum PrintError: Error, LocalizedError {
    case lprFailed(Int32)
    case printerNotReachable(String)

    var errorDescription: String? {
        switch self {
        case .lprFailed(let code):
            return "lpr exited with code \(code)"
        case .printerNotReachable(let name):
            return "Printer not reachable: \(name)"
        }
    }
}

enum PrintService {
    static func printPDF(at path: String, config: AppConfig.PrintingConfig) throws {
        guard config.enabled else {
            Logger.log("Printing disabled in config")
            return
        }

        // D-06: reachability check before invoking lpr
        if !config.printerName.isEmpty {
            try checkPrinterReachable(config.printerName)
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
        // D-07: 100% actual-size printing on Letter paper
        args += ["-o", "media=Letter"]
        args += ["-o", "fit-to-page=false"]
        args += ["-o", "scaling=100"]
        args.append(path)

        process.arguments = args

        try process.run()
        process.waitUntilExit()

        if process.terminationStatus == 0 {
            Logger.log("PDF sent to printer")
        } else {
            Logger.error("Print failed with exit code \(process.terminationStatus)")
            throw PrintError.lprFailed(process.terminationStatus)
        }
    }

    private static func checkPrinterReachable(_ printerName: String) throws {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/lpstat")
        task.arguments = ["-p", printerName]
        task.standardOutput = Pipe()
        task.standardError = Pipe()
        try task.run()
        task.waitUntilExit()
        if task.terminationStatus != 0 {
            Logger.error("Printer not reachable: \(printerName)")
            throw PrintError.printerNotReachable(printerName)
        }
    }
}
