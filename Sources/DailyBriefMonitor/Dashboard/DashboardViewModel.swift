import AppKit
import Foundation
import JarvisCore

/// Sidebar filter: wraps optional ThoughtCategory so "All" is a concrete selectable value.
enum CategoryFilter: Hashable {
    case all
    case specific(ThoughtCategory)

    var category: ThoughtCategory? {
        switch self {
        case .all: return nil
        case .specific(let c): return c
        }
    }
}

/// View model for the central dashboard — fetches, filters, searches thoughts, and handles file imports.
@MainActor @Observable
final class DashboardViewModel {

    // MARK: - Published State

    var thoughts: [Thought] = []
    var searchQuery: String = "" {
        didSet { debouncedSearch() }
    }
    var selectedFilter: CategoryFilter = .all
    var isLoading = false
    var totalCount = 0
    var categoryCounts: [ThoughtCategory: Int] = [:]
    var calendarEvents: [CalendarEvent] = []
    var isLoadingCalendar = false

    // Insights state
    var insights: [Insight] = []
    var isLoadingInsights = false

    // Import state
    var isImporting = false
    var importProgress: ImportProgress?
    var importErrors: [String] = []

    struct ImportProgress {
        var current: Int
        var total: Int
        var currentFile: String
        var phase: String  // "Transcribing", "Analyzing", "Categorizing", "Saving"
    }

    // MARK: - Private

    private let store: ThoughtStore
    private let captureService: CaptureService?
    private let transcriptionService: TranscriptionService?
    private let imageDescriptionService: ImageDescriptionService?
    private let triageService: TriageService?
    private let insightService: InsightService?
    private var searchTask: Task<Void, Never>?

    var canImportAudio: Bool { transcriptionService != nil && captureService != nil }
    var canImportImage: Bool { captureService != nil }

    // MARK: - Initialization

    init(
        store: ThoughtStore,
        captureService: CaptureService? = nil,
        transcriptionService: TranscriptionService? = nil,
        imageDescriptionService: ImageDescriptionService? = nil,
        triageService: TriageService? = nil,
        insightService: InsightService? = nil
    ) {
        self.store = store
        self.captureService = captureService
        self.transcriptionService = transcriptionService
        self.imageDescriptionService = imageDescriptionService
        self.triageService = triageService
        self.insightService = insightService
    }

    // MARK: - Public Methods

    /// Full refresh: reload thoughts, sidebar counts, and calendar events.
    func refresh() async {
        isLoading = true
        await loadThoughts()
        await loadCounts()
        await loadCalendarEvents()
        await loadInsights()
        isLoading = false
    }

    /// Reload thoughts based on current search query and category filter.
    func loadThoughts() async {
        do {
            let trimmed = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
            let category = selectedFilter.category
            if trimmed.isEmpty {
                thoughts = try await store.fetchAll(category: category)
            } else {
                // FTS5 search — then client-side filter by category if needed
                var results = try await store.search(query: trimmed)
                if let category {
                    results = results.filter { $0.category == category }
                }
                thoughts = results
            }
        } catch {
            NSLog("Dashboard: failed to load thoughts — \(error.localizedDescription)")
            thoughts = []
        }
    }

    /// Reload sidebar badge counts.
    func loadCounts() async {
        do {
            totalCount = try await store.count()
            for category in ThoughtCategory.allCases {
                categoryCounts[category] = try await store.count(category: category)
            }
        } catch {
            NSLog("Dashboard: failed to load counts — \(error.localizedDescription)")
        }
    }

    /// Load today's calendar events (graceful degradation — no error shown).
    func loadCalendarEvents() async {
        isLoadingCalendar = true
        defer { isLoadingCalendar = false }

        do {
            let config = try ConfigLoader.load()
            guard config.googleCalendar.enabled else {
                calendarEvents = []
                return
            }
            let service = GoogleCalendarService(config: config.googleCalendar)
            calendarEvents = try await service.fetchTodayEvents()
        } catch {
            NSLog("Dashboard: calendar fetch failed — \(error.localizedDescription)")
            calendarEvents = []
        }
    }

    /// Load AI-generated insights from recent thoughts.
    func loadInsights() async {
        guard let insightService else { return }

        do {
            let config = try ConfigLoader.load()
            guard config.insights.enabled else {
                insights = []
                return
            }

            isLoadingInsights = true
            defer { isLoadingInsights = false }

            let lookbackDays = config.insights.lookbackDays
            let recentThoughts = try await store.fetchAll(limit: lookbackDays * 20)
            let cutoff = Calendar.current.date(byAdding: .day, value: -lookbackDays, to: Date()) ?? Date()
            let filtered = recentThoughts.filter { $0.createdAt >= cutoff }

            insights = try await insightService.generateInsights(thoughts: filtered, lookbackDays: lookbackDays)
        } catch {
            NSLog("Dashboard: insight generation failed — \(error.localizedDescription)")
            insights = []
            isLoadingInsights = false
        }
    }

    // MARK: - File Classification

    private static let audioExtensions: Set<String> = ["wav", "mp3", "m4a", "aiff"]
    private static let imageExtensions: Set<String> = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "tiff", "tif", "bmp"]
    /// Formats that ImageDescriptionService handles natively (no conversion needed).
    private static let nativeImageExtensions: Set<String> = ["jpg", "jpeg", "png", "gif", "webp"]

    private enum FileKind { case audio, image }

    private static func classify(_ url: URL) -> FileKind? {
        let ext = url.pathExtension.lowercased()
        if audioExtensions.contains(ext) { return .audio }
        if imageExtensions.contains(ext) { return .image }
        return nil
    }

    // MARK: - Import: Batch (combined picker)

    func importFiles() {
        let urls = FilePicker.pickFiles()
        guard !urls.isEmpty else { return }
        Task { await processFiles(urls: urls) }
    }

    // MARK: - Import Audio

    func importAudio() {
        let urls = FilePicker.pickAudioFiles()
        guard !urls.isEmpty else { return }
        Task { await processFiles(urls: urls) }
    }

    // MARK: - Import Image

    func importImage() {
        let urls = FilePicker.pickImageFiles()
        guard !urls.isEmpty else { return }
        Task { await processFiles(urls: urls) }
    }

    // MARK: - Shared Batch Processing

    /// Processes an array of file URLs sequentially, updating progress for each file.
    func processFiles(urls: [URL]) async {
        guard let captureService else { return }

        isImporting = true
        importErrors = []

        let total = urls.count

        for (index, url) in urls.enumerated() {
            let filename = url.lastPathComponent
            let fileNumber = index + 1

            do {
                guard let kind = Self.classify(url) else {
                    importErrors.append("\(filename): Unsupported file type")
                    continue
                }

                switch kind {
                case .audio:
                    guard let transcriptionService else {
                        importErrors.append("\(filename): Transcription service unavailable")
                        continue
                    }

                    importProgress = ImportProgress(current: fileNumber, total: total, currentFile: filename, phase: "Transcribing")
                    let text = try await transcriptionService.transcribe(audioURL: url)

                    importProgress = ImportProgress(current: fileNumber, total: total, currentFile: filename, phase: "Saving")
                    let thought = try await captureService.capture(text, source: .voice)

                    if let triageService {
                        importProgress = ImportProgress(current: fileNumber, total: total, currentFile: filename, phase: "Categorizing")
                        do {
                            let result = try await triageService.triage(text)
                            if var t = try await store.fetch(id: thought.id!) {
                                t.category = result.category
                                t.confidence = result.confidence
                                try await store.update(t)
                            }
                        } catch {
                            NSLog("Batch triage failed for %@: %@", filename, error.localizedDescription)
                        }
                    }

                case .image:
                    let description: String
                    let ext = url.pathExtension.lowercased()

                    if let descService = imageDescriptionService {
                        importProgress = ImportProgress(current: fileNumber, total: total, currentFile: filename, phase: "Analyzing")

                        if Self.nativeImageExtensions.contains(ext) {
                            description = try await descService.describe(imageURL: url)
                        } else {
                            let jpegData = try Self.convertToJPEG(url: url)
                            description = try await descService.describe(imageData: jpegData, mediaType: .jpeg)
                        }
                    } else {
                        description = "Image: \(filename)"
                    }

                    importProgress = ImportProgress(current: fileNumber, total: total, currentFile: filename, phase: "Saving")
                    let thought = try await captureService.capture(description, source: .image)

                    if let triageService {
                        importProgress = ImportProgress(current: fileNumber, total: total, currentFile: filename, phase: "Categorizing")
                        do {
                            let result = try await triageService.triage(description)
                            if var t = try await store.fetch(id: thought.id!) {
                                t.category = result.category
                                t.confidence = result.confidence
                                try await store.update(t)
                            }
                        } catch {
                            NSLog("Batch triage failed for %@: %@", filename, error.localizedDescription)
                        }
                    }
                }
            } catch {
                importErrors.append("\(filename): \(error.localizedDescription)")
            }
        }

        isImporting = false
        importProgress = nil
        await refresh()
    }

    // MARK: - Image Conversion

    /// Converts a non-native image format (HEIC, TIFF, BMP, etc.) to JPEG data.
    private static func convertToJPEG(url: URL) throws -> Data {
        guard let image = NSImage(contentsOf: url),
              let tiffData = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData),
              let jpegData = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.85]) else {
            throw ImageConversionError.conversionFailed(url.lastPathComponent)
        }
        return jpegData
    }

    enum ImageConversionError: Error, LocalizedError {
        case conversionFailed(String)

        var errorDescription: String? {
            switch self {
            case .conversionFailed(let filename):
                return "Failed to convert \(filename) to JPEG"
            }
        }
    }

    // MARK: - Private

    /// Debounced search: cancel previous task, wait 300ms, then fetch.
    private func debouncedSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await loadThoughts()
        }
    }
}
