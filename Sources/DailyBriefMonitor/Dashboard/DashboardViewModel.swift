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
    var importStatus: String?
    var importError: String?

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

    // MARK: - Import Audio

    func importAudio() {
        guard let captureService, let transcriptionService else { return }

        let audioURL = FilePicker.pickAudioFile()
        guard let audioURL else { return }

        isImporting = true
        importStatus = "Transcribing \(audioURL.lastPathComponent)..."
        importError = nil

        Task {
            do {
                let text = try await transcriptionService.transcribe(audioURL: audioURL)

                importStatus = "Saving..."
                var thought = try await captureService.capture(text, source: .voice)

                if let triageService {
                    importStatus = "Categorizing..."
                    do {
                        let result = try await triageService.triage(text)
                        if var t = try await store.fetch(id: thought.id!) {
                            t.category = result.category
                            t.confidence = result.confidence
                            try await store.update(t)
                            thought = t
                        }
                    } catch {
                        NSLog("Audio triage failed: \(error.localizedDescription)")
                    }
                }

                isImporting = false
                importStatus = nil
                await refresh()
            } catch {
                isImporting = false
                importStatus = nil
                importError = error.localizedDescription
            }
        }
    }

    // MARK: - Import Image

    func importImage() {
        guard let captureService else { return }

        let imageURL = FilePicker.pickImage()
        guard let imageURL else { return }

        isImporting = true
        importError = nil

        Task {
            do {
                let description: String
                if let descService = imageDescriptionService {
                    importStatus = "Analyzing \(imageURL.lastPathComponent)..."
                    description = try await descService.describe(imageURL: imageURL)
                } else {
                    description = "Image: \(imageURL.lastPathComponent)"
                }

                importStatus = "Saving..."
                var thought = try await captureService.capture(description, source: .image)

                if let triageService {
                    importStatus = "Categorizing..."
                    do {
                        let result = try await triageService.triage(description)
                        if var t = try await store.fetch(id: thought.id!) {
                            t.category = result.category
                            t.confidence = result.confidence
                            try await store.update(t)
                            thought = t
                        }
                    } catch {
                        NSLog("Image triage failed: \(error.localizedDescription)")
                    }
                }

                isImporting = false
                importStatus = nil
                await refresh()
            } catch {
                isImporting = false
                importStatus = nil
                importError = error.localizedDescription
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
