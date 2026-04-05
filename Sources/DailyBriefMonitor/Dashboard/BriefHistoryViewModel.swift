import AppKit
import Foundation
import JarvisCore

// MARK: - Brief Record

/// A single brief history entry decoded from the Vigil Core API.
public struct BriefRecord: Codable, Identifiable, Sendable {
    public let id: Int
    public let date: String
    public let summary: BriefSummary?
    public let pdfFilename: String?
    public let thoughtCount: Int
    public let taskCount: Int
    public let createdAt: Date

    /// Parsed date from the YYYY-MM-DD string.
    var parsedDate: Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter.date(from: date)
    }

    /// Nicely formatted date string (e.g., "Saturday, April 5").
    var displayDate: String {
        guard let parsed = parsedDate else { return date }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMMM d"
        return formatter.string(from: parsed)
    }

    /// Month/year grouping key (e.g., "April 2026").
    var monthYearKey: String {
        guard let parsed = parsedDate else { return "Unknown" }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: parsed)
    }
}

/// Summary data embedded in a brief (JSON blob from the API).
public struct BriefSummary: Codable, Sendable {
    public let categoryCounts: [String: Int]?
    public let topTasks: [String]?
    public let affirmation: String?
    public let sportsSummary: String?
}

// MARK: - Brief History ViewModel

/// View model for browsing past daily briefs.
@MainActor @Observable
final class BriefHistoryViewModel {

    // MARK: - State

    var briefs: [BriefRecord] = []
    var isLoading = false
    var selectedBrief: BriefRecord?
    var errorMessage: String?

    // MARK: - Private

    private let apiClient: VigilAPIClient

    // MARK: - Initialization

    init(apiClient: VigilAPIClient) {
        self.apiClient = apiClient
    }

    // MARK: - Grouped Briefs

    /// Briefs grouped by month/year for section display.
    var groupedBriefs: [(key: String, briefs: [BriefRecord])] {
        let grouped = Dictionary(grouping: briefs) { $0.monthYearKey }
        return grouped
            .sorted { lhs, rhs in
                // Sort by first brief's date descending
                let lhsDate = lhs.value.first?.parsedDate ?? .distantPast
                let rhsDate = rhs.value.first?.parsedDate ?? .distantPast
                return lhsDate > rhsDate
            }
            .map { (key: $0.key, briefs: $0.value) }
    }

    // MARK: - Load History

    /// Fetch brief history from the API.
    func loadHistory() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response: PaginatedResponse<BriefRecord> = try await apiClient.get(
                path: "/briefs",
                query: ["limit": "60"]
            )
            briefs = response.data
        } catch {
            NSLog("BriefHistory: failed to load — %@", error.localizedDescription)
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - PDF Actions

    /// Open the PDF for a brief in Preview.
    func openPDF(for brief: BriefRecord) {
        guard let filename = brief.pdfFilename else { return }

        do {
            let config = try ConfigLoader.load()
            let outputDir = ConfigLoader.expandPath(config.pdf.outputDirectory)
            let pdfPath = (outputDir as NSString).appendingPathComponent(filename)
            let url = URL(fileURLWithPath: pdfPath)

            guard FileManager.default.fileExists(atPath: pdfPath) else {
                errorMessage = "PDF not found: \(filename)"
                return
            }

            NSWorkspace.shared.open(url)
        } catch {
            errorMessage = "Failed to locate PDF: \(error.localizedDescription)"
        }
    }

    /// Reprint the PDF for a brief by sending it to the configured printer via `lpr`.
    func reprintPDF(for brief: BriefRecord) {
        guard let filename = brief.pdfFilename else { return }

        do {
            let config = try ConfigLoader.load()
            let outputDir = ConfigLoader.expandPath(config.pdf.outputDirectory)
            let pdfPath = (outputDir as NSString).appendingPathComponent(filename)

            guard FileManager.default.fileExists(atPath: pdfPath) else {
                errorMessage = "PDF not found: \(filename)"
                return
            }

            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/lpr")

            var args = [String]()
            if !config.printing.printerName.isEmpty {
                args += ["-P", config.printing.printerName]
            }
            if config.printing.copies > 1 {
                args += ["-#", String(config.printing.copies)]
            }
            args += ["-o", "sides=one-sided"]
            args.append(pdfPath)

            process.arguments = args
            try process.run()
            process.waitUntilExit()

            if process.terminationStatus != 0 {
                errorMessage = "Print failed with exit code \(process.terminationStatus)"
            }
        } catch {
            errorMessage = "Reprint failed: \(error.localizedDescription)"
        }
    }
}
