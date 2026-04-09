import AppKit
import Foundation
import JarvisCore

/// Sidebar filter: wraps optional ThoughtCategory so "All" is a concrete selectable value.
///
/// Phase 53 added project / unassigned filters. Both new cases return `nil` from
/// `category` because they aren't category filters — `performLoadThoughts` switches
/// directly on the filter for them and bypasses the category-driven branches.
enum CategoryFilter: Hashable {
    case all
    case specific(ThoughtCategory)
    case project(id: Int64)
    case unassigned

    var category: ThoughtCategory? {
        switch self {
        case .all: return nil
        case .specific(let c): return c
        case .project: return nil       // Phase 53 — project filter is not a category filter
        case .unassigned: return nil    // Phase 53 — unassigned filter is not a category filter
        }
    }
}

/// Date range filter for narrowing thought lists by time period.
enum DateRangeFilter: String, CaseIterable {
    case all
    case today
    case thisWeek
    case thisMonth

    var startDate: Date? {
        let cal = Calendar.current
        switch self {
        case .all: return nil
        case .today: return cal.startOfDay(for: Date())
        case .thisWeek: return cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: Date()))
        case .thisMonth: return cal.date(from: cal.dateComponents([.year, .month], from: Date()))
        }
    }

    var displayName: String {
        switch self {
        case .all: return "All Time"
        case .today: return "Today"
        case .thisWeek: return "This Week"
        case .thisMonth: return "This Month"
        }
    }
}

// MARK: - Photo Processing Injection (Phase 60 Plan 02)

/// Abstraction over `APIImageDescriptionService.processPhoto` so
/// DashboardViewModelPhotoPreviewTests can swap a scripted fake in without
/// touching the network or the singleton VigilAPIClient.
protocol PhotoProcessingAPI: Sendable {
    func processPhoto(
        imageData: Data,
        mediaType: ImageMediaType,
        preview: Bool,
        forcePaperType: PaperType?
    ) async throws -> ProcessedPhotoResponse
}

extension APIImageDescriptionService: PhotoProcessingAPI {}

/// Terminal outcomes for the per-photo preview flow. Used to resume the
/// CheckedContinuation that `processPhotoFile` awaits while the sheet is up.
private enum PhotoPreviewDecision {
    case committed   // user clicked Commit and the commit call succeeded
    case cancelled   // user clicked Cancel (or override refetch errored out)
    case errored     // commit call threw (error already recorded on importErrors)
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
    var taskStatusFilter: TaskStatus?
    var taskStatusCounts: [TaskStatus: Int] = [:]
    var calendarEvents: [CalendarEvent] = []
    var isLoadingCalendar = false

    // Insights state
    var insights: [Insight] = []
    var isLoadingInsights = false

    // Re-triage state
    var retriagingThoughtId: Int64?

    // Therapy re-classify state
    var reclassifyingThoughtId: Int64?

    // Therapy prep state
    var therapyPatterns: [TherapyPattern] = []
    var therapyPrep: TherapyPrep? = nil
    var isLoadingTherapyPrep: Bool = false

    // Expand/collapse state
    var expandedThoughtIds: Set<Int64> = []

    // Editing state
    var editingThoughtId: Int64?
    var editedContent: String = ""

    // Source and date range filters
    var sourceFilter: CaptureSource?
    var dateRangeFilter: DateRangeFilter = .all

    /// Therapy sub-filter: all, specific classification, or unclassified only.
    enum TherapySubFilter: Hashable {
        case all
        case classified(TherapyClassification)
        case unclassified
    }

    // Therapy sub-filter state
    var therapyFilter: TherapySubFilter = .all
    var selfLearnableCount: Int = 0
    var bringToTherapistCount: Int = 0
    var unclassifiedTherapyCount: Int = 0

    // Tag and favorites filter state
    var tagFilter: String?
    var showFavoritesOnly: Bool = false
    var allTags: [String] = []
    var favoritesCount: Int = 0

    // Linking state
    var linkingThoughtId: Int64?
    var linkSearchQuery: String = ""
    var linkSearchResults: [Thought] = []
    var linkCounts: [Int64: Int] = [:]

    // Selection / bulk action state
    var isSelectionMode: Bool = false
    var selectedThoughtIds: Set<Int64> = []
    var isBulkProcessing: Bool = false
    var bulkProgress: (current: Int, total: Int)?

    // Brief history state
    var showingBriefHistory = false
    var showingChat = false

    // Projects (Phase 53)
    var projects: [Project] = []
    var projectStatusFilter: ProjectStatusFilter = .all
    var assignmentError: AssignmentError? = nil

    /// Row-level error surface for thought→project assignment failures.
    /// Modeled on the existing `importErrors` banner; Phase 53 invents a typed
    /// version because assignment errors target a specific thought row.
    struct AssignmentError: Identifiable, Equatable {
        let id = UUID()
        let thoughtId: Int64
        let message: String
    }

    /// Sidebar segmented filter for the Projects section.
    enum ProjectStatusFilter: Hashable {
        case all, active, done, archived
    }

    // Import state
    var isImporting = false
    var importProgress: ImportProgress?
    var importErrors: [String] = []

    // Phase 60 Plan 02 — photo preview flow state. `nil` means the sheet is
    // NOT presented; the sheet only appears while `.awaitingUserDecision`.
    var photoPreviewState: PhotoPreviewState? = nil

    /// Continuation that the photo-batch loop awaits while the preview sheet
    /// is up. commitPhotoPreview/cancelPhotoPreview resume it so the loop
    /// advances to the next file. Stored as an IUO-free optional so a late
    /// resume after re-entry is impossible (guard + nil out before resume).
    private var photoPreviewContinuation: CheckedContinuation<PhotoPreviewDecision, Never>? = nil

    struct ImportProgress {
        var current: Int
        var total: Int
        var currentFile: String
        var phase: String  // "Transcribing", "Analyzing", "Categorizing", "Saving"
    }

    // MARK: - Private

    private let store: any ThoughtRepository
    private let projectsStore: any ProjectsRepository
    private let captureService: CaptureService?
    private let transcriptionService: TranscriptionService?
    private let imageDescriptionService: (any ImageDescriptionProviding)?
    private let triageService: (any TriageProviding)?
    private let insightService: (any InsightProviding)?
    private let therapyClassificationService: (any TherapyClassifyProviding)?
    private let therapyPatternService: (any TherapyPatternProviding)?
    private let therapyPrepService: (any TherapyPrepProviding)?

    // Phase 60 Plan 02 — photo preview injection points.
    // `photoAPI` is optional: when nil, image imports surface a
    // "Photo processing service unavailable" error. In production
    // (AppDelegate), the same APIImageDescriptionService instance that
    // satisfies ImageDescriptionProviding ALSO conforms to
    // PhotoProcessingAPI (via the extension above), so AppDelegate passes it
    // for both.
    private let photoAPI: (any PhotoProcessingAPI)?
    /// Reads the user's "default paper type when detection is uncertain" at
    /// photo-upload time. Closure rather than a direct SettingsViewModel
    /// reference so tests can inject a stub without building full Settings.
    private let userDefaultPaperTypeProvider: @MainActor () -> PaperType

    private var searchTask: Task<Void, Never>?
    /// In-flight loadThoughts task. Cancelled and replaced on every new invocation
    /// so concurrent mutations don't race and clobber the visible list.
    private var loadThoughtsTask: Task<Void, Never>?

    var canImportAudio: Bool { transcriptionService != nil && captureService != nil }
    var canImportImage: Bool { captureService != nil }

    // MARK: - Initialization

    init(
        store: any ThoughtRepository,
        projectsStore: any ProjectsRepository,
        captureService: CaptureService? = nil,
        transcriptionService: TranscriptionService? = nil,
        imageDescriptionService: (any ImageDescriptionProviding)? = nil,
        triageService: (any TriageProviding)? = nil,
        insightService: (any InsightProviding)? = nil,
        therapyClassificationService: (any TherapyClassifyProviding)? = nil,
        therapyPatternService: (any TherapyPatternProviding)? = nil,
        therapyPrepService: (any TherapyPrepProviding)? = nil,
        photoAPI: (any PhotoProcessingAPI)? = nil,
        userDefaultPaperTypeProvider: @escaping @MainActor () -> PaperType = { .lined }
    ) {
        self.store = store
        self.projectsStore = projectsStore
        self.captureService = captureService
        self.transcriptionService = transcriptionService
        self.imageDescriptionService = imageDescriptionService
        self.triageService = triageService
        self.insightService = insightService
        self.therapyClassificationService = therapyClassificationService
        self.therapyPatternService = therapyPatternService
        self.therapyPrepService = therapyPrepService
        // If no explicit photoAPI was passed but the legacy imageDescriptionService
        // happens to be an APIImageDescriptionService, reuse it — it already
        // conforms to PhotoProcessingAPI via the extension above. This makes
        // AppDelegate a no-op update for Phase 60 Plan 02 (Task 6 can wire an
        // explicit photoAPI: later, but for now auto-promotion keeps the
        // single injection point from AppDelegate working unchanged).
        if let photoAPI {
            self.photoAPI = photoAPI
        } else if let apiService = imageDescriptionService as? APIImageDescriptionService {
            self.photoAPI = apiService
        } else {
            self.photoAPI = nil
        }
        self.userDefaultPaperTypeProvider = userDefaultPaperTypeProvider
    }

    // MARK: - Public Methods

    /// Full refresh: reload thoughts, sidebar counts, calendar events, and projects.
    func refresh() async {
        isLoading = true
        await loadThoughts()
        await loadCounts()
        await loadProjects()
        await loadCalendarEvents()
        await loadInsights()
        isLoading = false
    }

    // MARK: - Projects (Phase 53)

    /// Counts of thoughts grouped by `projectId`. Computed (not stored) per Pitfall P-6 —
    /// keeps the count in lock-step with the visible thought list and avoids dual-source
    /// drift between sidebar badges and the detail pane.
    var projectThoughtCounts: [Int64: Int] {
        var counts: [Int64: Int] = [:]
        for thought in thoughts {
            if let pid = thought.projectId {
                counts[pid, default: 0] += 1
            }
        }
        return counts
    }

    /// Number of currently visible thoughts that have no project assignment.
    var unassignedCount: Int {
        thoughts.filter { $0.projectId == nil }.count
    }

    /// Projects filtered by the sidebar status segment, sorted by name (case-insensitive).
    /// Treats nil status as `.active` so legacy rows still surface in the Active segment.
    var filteredProjects: [Project] {
        let sorted = projects.sorted {
            $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
        switch projectStatusFilter {
        case .all: return sorted
        case .active: return sorted.filter { $0.status == .active || $0.status == nil }
        case .done: return sorted.filter { $0.status == .done }
        case .archived: return sorted.filter { $0.status == .archived }
        }
    }

    /// Fetch the project list from the server. Failures are non-blocking — the
    /// list stays as-is and the error is logged. Phase 53 keeps this NSLog-only;
    /// a banner surface for project list failures was deferred per UI-SPEC.
    func loadProjects() async {
        do {
            let list = try await projectsStore.listProjects()
            self.projects = list
        } catch {
            NSLog("Dashboard: loadProjects failed — %@", error.localizedDescription)
        }
    }

    /// Create a project, refresh the project list, and return the created row.
    @discardableResult
    func createProject(name: String, description: String?, status: ProjectStatus?) async throws -> Project {
        let created = try await projectsStore.createProject(
            name: name,
            description: description,
            status: status
        )
        await loadProjects()
        return created
    }

    /// Update a project (rename, change description, change status), then refresh the list.
    func updateProject(id: Int64, name: String?, description: String?, status: ProjectStatus?) async throws {
        _ = try await projectsStore.updateProject(
            id: id,
            name: name,
            description: description,
            status: status
        )
        await loadProjects()
    }

    /// Convenience for the row context menu's `Set status →` submenu. Swallows
    /// errors to NSLog so UI taps don't throw — UI-SPEC treats status flips as
    /// non-critical (worst case the user re-clicks).
    func setProjectStatus(_ project: Project, _ status: ProjectStatus) async {
        do {
            try await updateProject(id: project.id, name: nil, description: nil, status: status)
        } catch {
            NSLog("Dashboard: setProjectStatus failed — %@", error.localizedDescription)
        }
    }

    /// Delete a project. After deletion:
    /// - the project list is refetched (so the row disappears)
    /// - the thought list is force-refetched (D-06 — any thoughts that were assigned
    ///   to this project now have `projectId == nil` server-side via ON DELETE SET NULL)
    /// - if the deleted project was the active sidebar filter, reset to `.all` so the
    ///   detail pane doesn't keep showing a stale empty state for a now-gone filter
    func deleteProject(id: Int64) async throws {
        try await projectsStore.deleteProject(id: id)
        await loadProjects()
        // If the deleted project was the active filter, reset BEFORE reloading thoughts
        // so the next loadThoughts picks the correct branch (.all instead of .project).
        if case .project(let pid) = selectedFilter, pid == id {
            selectedFilter = .all
        }
        await loadThoughts()
    }

    /// Optimistically assign (or unassign via `nil`) a thought to a project.
    ///
    /// - R-5: Does NOT reload the thought list on success — the optimistic
    ///   mutation IS the success state. Avoids a network round-trip + flicker
    ///   on every assign.
    /// - Pitfall P-6: thought counts are derived from `thoughts` (not stored),
    ///   so no separate bookkeeping dict needs to be kept in sync.
    /// - On failure the row's projectId is reverted and `assignmentError` is
    ///   populated with UI-SPEC copy so the banner above the thought list
    ///   surfaces the failure.
    func assignThoughtToProject(thoughtId: Int64, projectId: Int64?) async {
        guard let index = thoughts.firstIndex(where: { $0.id == thoughtId }) else {
            return
        }
        let oldProjectId = thoughts[index].projectId

        // Optimistic update
        thoughts[index].projectId = projectId

        do {
            try await store.updateProjectId(id: thoughtId, projectId: projectId)
            // Success — keep optimistic state. DO NOT reload (R-5).
        } catch {
            // Revert
            thoughts[index].projectId = oldProjectId

            let message: String
            if projectId == nil {
                message = "Couldn't unassign. Try again."
            } else {
                // UI-SPEC copy: "Couldn't assign to \"{project.name}\". Try again."
                let projectName = projects.first(where: { $0.id == projectId })?.name ?? "project"
                message = "Couldn't assign to \"\(projectName)\". Try again."
            }
            self.assignmentError = AssignmentError(thoughtId: thoughtId, message: message)
            NSLog(
                "Dashboard: assignThoughtToProject failed for thought %lld — %@",
                thoughtId,
                error.localizedDescription
            )
        }
    }

    /// Reload thoughts based on current search query, category, source, and date filters.
    ///
    /// Reentrancy-safe: cancels any in-flight loadThoughts before starting a new one.
    /// Rapid mutations (mark done / edit / delete) used to spawn concurrent loadThoughts
    /// calls that interleaved at await points; if any one threw (transient Railway error,
    /// timeout, cancellation), the catch block would wipe `thoughts` and blank the list.
    /// Now: only the latest call survives, and on error the previous list is preserved.
    func loadThoughts() async {
        loadThoughtsTask?.cancel()
        let task = Task { @MainActor in
            await self.performLoadThoughts()
        }
        loadThoughtsTask = task
        await task.value
    }

    private func performLoadThoughts() async {
        // Compute results in a local var. Only commit to `thoughts` at the end,
        // and only if this Task hasn't been superseded by a newer loadThoughts call.
        // URLSession does NOT reliably honor Task cancellation mid-flight — a cancelled
        // task can complete its HTTP request and return data normally. Without an
        // explicit cancellation check before assignment, the cancelled task would stomp
        // the latest task's results with stale data (e.g. user clicks "Recent" but the
        // still-in-flight "Tasks" load resumes after and overwrites with task data).
        do {
            let trimmed = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
            let category = selectedFilter.category
            let afterDate = dateRangeFilter.startDate
            let computed: [Thought]

            // Phase 53 — project / unassigned filters bypass the existing
            // category-driven branches. They ignore search/source/date/tag/favorites
            // filters intentionally (UI-SPEC scope is "show me thoughts in project X");
            // a future plan can layer those filters on top if needed.
            switch selectedFilter {
            case .project(let projectId):
                let list = try await store.fetchByProject(id: projectId, limit: 200)
                guard !Task.isCancelled else { return }
                thoughts = list
                await loadLinkCounts()
                return
            case .unassigned:
                let list = try await store.fetchUnassigned(limit: 200)
                guard !Task.isCancelled else { return }
                thoughts = list
                await loadLinkCounts()
                return
            case .all, .specific:
                break
            }

            if trimmed.isEmpty {
                // When viewing tasks with a status sub-filter, use fetchTasks
                if category == .task, let statusFilter = taskStatusFilter {
                    var results = try await store.fetchTasks(status: statusFilter)
                    // Client-side source and date filtering for task status path
                    if let sourceFilter {
                        results = results.filter { $0.source == sourceFilter }
                    }
                    if let afterDate {
                        results = results.filter { $0.createdAt >= afterDate }
                    }
                    computed = results
                } else if category == .therapy, therapyFilter != .all {
                    // Therapy sub-filter active
                    var results: [Thought]
                    switch therapyFilter {
                    case .all:
                        results = [] // unreachable
                    case .classified(let classification):
                        results = try await store.fetchTherapyThoughts(classification: classification)
                    case .unclassified:
                        // Fetch all therapy, then client-side filter to nil classification
                        results = try await store.fetchTherapyThoughts()
                        results = results.filter { $0.therapyClassification == nil }
                    }
                    if let sourceFilter {
                        results = results.filter { $0.source == sourceFilter }
                    }
                    if let afterDate {
                        results = results.filter { $0.createdAt >= afterDate }
                    }
                    computed = results
                } else {
                    var results = try await store.fetchFiltered(
                        category: category,
                        source: sourceFilter,
                        after: afterDate,
                        tag: tagFilter,
                        favoritesOnly: showFavoritesOnly
                    )
                    // Auto-hide completed tasks unless explicitly viewing Done filter
                    if taskStatusFilter == nil {
                        results = results.filter { $0.taskStatus != .done }
                    }
                    computed = results
                }
            } else {
                // FTS5 search — then client-side filter by category, source, and date
                var results = try await store.search(query: trimmed)
                if let category {
                    results = results.filter { $0.category == category }
                }
                if let sourceFilter {
                    results = results.filter { $0.source == sourceFilter }
                }
                if let afterDate {
                    results = results.filter { $0.createdAt >= afterDate }
                }
                if category == .task, let statusFilter = taskStatusFilter {
                    results = results.filter { $0.taskStatus == statusFilter }
                } else if taskStatusFilter == nil {
                    // Auto-hide completed tasks from search results too
                    results = results.filter { $0.taskStatus != .done }
                }
                // Apply tag and favorites filters to search results
                if let tagFilter {
                    results = results.filter { ($0.tags ?? []).contains(tagFilter) }
                }
                if showFavoritesOnly {
                    results = results.filter { $0.isFavorited }
                }
                // Apply therapy sub-filter to search results
                if category == .therapy, therapyFilter != .all {
                    switch therapyFilter {
                    case .all: break
                    case .classified(let classification):
                        results = results.filter { $0.therapyClassification == classification }
                    case .unclassified:
                        results = results.filter { $0.therapyClassification == nil }
                    }
                }
                computed = results
            }

            // Cancellation gate: if a newer loadThoughts call has cancelled us while
            // URLSession was finishing, drop these results. The newer call's results
            // are the source of truth.
            guard !Task.isCancelled else { return }
            thoughts = computed

            // Compute link counts for the now-committed thoughts. loadLinkCounts also
            // checks Task.isCancelled internally so a superseded call won't stomp.
            await loadLinkCounts()
        } catch is CancellationError {
            // Superseded by a newer loadThoughts call — leave state alone.
        } catch {
            // Transient API failure (timeout, 5xx, decode hiccup). Log and leave the
            // previously-displayed list intact rather than blanking the UI on the user.
            // Pre-v2.1 this catch was unreachable (local GRDB never threw transiently);
            // post-Railway it became the dominant path to a blank dashboard.
            NSLog("Dashboard: failed to load thoughts — \(error.localizedDescription)")
        }
    }

    /// Load link counts for all currently displayed thoughts.
    /// Bails out if the enclosing loadThoughts task has been superseded — otherwise a
    /// long sequential network loop here would stomp linkCounts for the newer load.
    private func loadLinkCounts() async {
        var counts: [Int64: Int] = [:]
        for thought in thoughts {
            if Task.isCancelled { return }
            guard let id = thought.id else { continue }
            do {
                let count = try await store.countLinks(thoughtId: id)
                if count > 0 {
                    counts[id] = count
                }
            } catch {
                // Silently skip — link counts are non-critical
            }
        }
        if Task.isCancelled { return }
        linkCounts = counts
    }

    /// Cycle a task thought's status: open → inProgress → done → open.
    func cycleTaskStatus(for thought: Thought) async {
        guard let id = thought.id, let currentStatus = thought.taskStatus else { return }
        let nextStatus: TaskStatus
        switch currentStatus {
        case .open: nextStatus = .inProgress
        case .inProgress: nextStatus = .done
        case .done: nextStatus = .open
        }
        do {
            try await store.updateTaskStatus(id: id, status: nextStatus)
            await loadThoughts()
            await loadCounts()
        } catch {
            NSLog("Dashboard: failed to cycle task status — \(error.localizedDescription)")
        }
    }

    /// Reload sidebar badge counts and task status counts.
    func loadCounts() async {
        do {
            totalCount = try await store.count()
            for category in ThoughtCategory.allCases {
                categoryCounts[category] = try await store.count(category: category)
            }
            // Task status sub-counts
            for status in [TaskStatus.open, .inProgress, .done] {
                taskStatusCounts[status] = try await store.countTasks(status: status)
            }
            // Therapy classification sub-counts
            selfLearnableCount = try await store.countTherapy(classification: .selfLearnable)
            bringToTherapistCount = try await store.countTherapy(classification: .bringToTherapist)
            unclassifiedTherapyCount = try await store.countUnclassifiedTherapy()
            // Tags and favorites counts
            allTags = try await store.allUniqueTags()
            favoritesCount = try await store.countFavorites()
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

        let autoDelete = (try? ConfigLoader.load().folderWatching.autoDeleteAfterProcessing) ?? false
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
                                if result.category == .task && t.taskStatus == nil {
                                    t.taskStatus = .open
                                }
                                try await store.update(t)
                                // Auto-classify therapy thoughts after import triage
                                if result.category == .therapy {
                                    await classifyTherapyIfNeeded(t)
                                }
                            }
                        } catch {
                            NSLog("Batch triage failed for %@: %@", filename, error.localizedDescription)
                        }
                    }

                case .image:
                    // Phase 60 Plan 02 — preview-first photo flow via
                    // /v1/process-photo. The legacy /describe-image path is
                    // no longer called from the dashboard (D-07); the helper
                    // method still exists on APIImageDescriptionService for
                    // any future non-dashboard caller (e.g. folder watcher).
                    if photoAPI == nil {
                        importErrors.append("\(filename): Photo processing service unavailable")
                    } else {
                        await processPhotoFile(url: url, index: index, total: total)
                    }
                }

                // Auto-delete source file after successful processing
                if autoDelete {
                    do {
                        try FileManager.default.removeItem(at: url)
                        NSLog("Dashboard: auto-deleted %@", filename)
                    } catch {
                        NSLog("Dashboard: failed to auto-delete %@: %@", filename, error.localizedDescription)
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

    // MARK: - Re-Triage

    /// Re-run AI categorization on a single thought.
    func reTriageThought(_ thought: Thought) async {
        guard let id = thought.id, let triageService else { return }

        retriagingThoughtId = id
        defer { retriagingThoughtId = nil }

        do {
            let result = try await triageService.triage(thought.content)
            if var t = try await store.fetch(id: id) {
                t.category = result.category
                t.confidence = result.confidence
                if result.category == .task && t.taskStatus == nil {
                    t.taskStatus = .open
                }
                try await store.update(t)
                // Auto-classify therapy thoughts after triage
                if result.category == .therapy {
                    await classifyTherapyIfNeeded(t)
                }
            }
            await loadThoughts()
            await loadCounts()
        } catch {
            NSLog("Dashboard: re-triage failed for thought %lld — %@", id, error.localizedDescription)
        }
    }

    // MARK: - Therapy Classification

    /// Auto-classify a therapy thought if it hasn't been classified yet.
    private func classifyTherapyIfNeeded(_ thought: Thought) async {
        guard thought.category == .therapy,
              thought.therapyClassification == nil,
              let therapyClassificationService,
              let id = thought.id else { return }

        do {
            let result = try await therapyClassificationService.classify(thought.content)
            if var t = try await store.fetch(id: id) {
                t.therapyClassification = result.classification
                try await store.update(t)
            }
            NSLog("Dashboard: therapy classification for thought %lld — %@ (%.0f%% confidence): %@",
                  id, result.classification.rawValue, result.confidence * 100, result.reasoning)
        } catch {
            NSLog("Dashboard: therapy classification failed for thought %lld — %@", id, error.localizedDescription)
        }
    }

    /// Re-run therapy classification on a single therapy thought.
    func reClassifyTherapy(_ thought: Thought) async {
        guard let id = thought.id, let therapyClassificationService else { return }

        reclassifyingThoughtId = id
        defer { reclassifyingThoughtId = nil }

        do {
            let result = try await therapyClassificationService.classify(thought.content)
            if var t = try await store.fetch(id: id) {
                t.therapyClassification = result.classification
                try await store.update(t)
            }
            await loadThoughts()
            await loadCounts()
        } catch {
            NSLog("Dashboard: re-classify failed for thought %lld — %@", id, error.localizedDescription)
        }
    }

    // MARK: - Expand/Collapse

    /// Toggle a thought's expanded state.
    func toggleExpanded(_ thought: Thought) {
        guard let id = thought.id else { return }
        if expandedThoughtIds.contains(id) {
            expandedThoughtIds.remove(id)
        } else {
            expandedThoughtIds.insert(id)
        }
    }

    // MARK: - Inline Editing

    /// Begin editing a thought — populates editor state and expands the row.
    func startEditing(_ thought: Thought) {
        guard let id = thought.id else { return }
        editingThoughtId = id
        editedContent = thought.content
        expandedThoughtIds.insert(id)
    }

    /// Save the current edit, register undo/redo, and refresh.
    func saveEdit(undoManager: UndoManager?) async {
        guard let thoughtId = editingThoughtId else { return }
        let newContent = editedContent.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !newContent.isEmpty else { return }

        await applyEdit(id: thoughtId, content: newContent, undoManager: undoManager)
    }

    /// Cancel editing without saving.
    func cancelEdit() {
        editingThoughtId = nil
        editedContent = ""
    }

    /// Apply an edit to a thought, register undo, and refresh.
    private func applyEdit(id: Int64, content: String, undoManager: UndoManager?) async {
        do {
            guard var thought = try await store.fetch(id: id) else { return }
            let oldContent = thought.content

            thought.content = content
            try await store.update(thought)

            // Register undo
            undoManager?.registerUndo(withTarget: self) { [weak undoManager] vm in
                Task { @MainActor in
                    await vm.applyEdit(id: id, content: oldContent, undoManager: undoManager)
                }
            }
            undoManager?.setActionName("Edit Thought")

            // Clear editing state and refresh
            editingThoughtId = nil
            editedContent = ""
            await loadThoughts()
        } catch {
            NSLog("Dashboard: failed to save thought edit — \(error.localizedDescription)")
        }
    }

    // MARK: - Selection Mode

    /// Toggle selection mode on/off. Clears selection when turning off.
    func toggleSelectionMode() {
        isSelectionMode.toggle()
        if !isSelectionMode {
            selectedThoughtIds.removeAll()
        }
    }

    /// Add or remove a thought from the current selection.
    func toggleSelection(_ thought: Thought) {
        guard let id = thought.id else { return }
        if selectedThoughtIds.contains(id) {
            selectedThoughtIds.remove(id)
        } else {
            selectedThoughtIds.insert(id)
        }
    }

    /// Select all currently visible thoughts.
    func selectAll() {
        for thought in thoughts {
            if let id = thought.id {
                selectedThoughtIds.insert(id)
            }
        }
    }

    /// Clear all selections.
    func deselectAll() {
        selectedThoughtIds.removeAll()
    }

    // MARK: - Bulk Actions

    /// Delete all selected thoughts in a single transaction.
    func bulkDelete() async {
        do {
            try await store.bulkDelete(ids: selectedThoughtIds)
            selectedThoughtIds.removeAll()
            await loadThoughts()
            await loadCounts()
        } catch {
            NSLog("Dashboard: bulk delete failed — \(error.localizedDescription)")
        }
    }

    /// Re-triage all selected thoughts sequentially with progress tracking.
    func bulkRetriage() async {
        guard let triageService else { return }

        let ids = Array(selectedThoughtIds)
        isBulkProcessing = true
        bulkProgress = (current: 0, total: ids.count)

        for (index, id) in ids.enumerated() {
            bulkProgress = (current: index + 1, total: ids.count)
            do {
                guard let thought = try await store.fetch(id: id) else { continue }
                let result = try await triageService.triage(thought.content)
                if var t = try await store.fetch(id: id) {
                    t.category = result.category
                    t.confidence = result.confidence
                    if result.category == .task && t.taskStatus == nil {
                        t.taskStatus = .open
                    }
                    try await store.update(t)
                    // Auto-classify therapy thoughts after bulk triage
                    if result.category == .therapy {
                        await classifyTherapyIfNeeded(t)
                    }
                }
            } catch {
                NSLog("Dashboard: bulk retriage failed for thought %lld — %@", id, error.localizedDescription)
            }
        }

        isBulkProcessing = false
        bulkProgress = nil
        selectedThoughtIds.removeAll()
        await loadThoughts()
        await loadCounts()
    }

    /// Recategorize all selected thoughts to a new category.
    func bulkRecategorize(category: ThoughtCategory) async {
        do {
            try await store.bulkUpdateCategory(ids: selectedThoughtIds, category: category)
            selectedThoughtIds.removeAll()
            await loadThoughts()
            await loadCounts()
        } catch {
            NSLog("Dashboard: bulk recategorize failed — \(error.localizedDescription)")
        }
    }

    // MARK: - Therapy Prep

    /// Generate therapy session prep from recent therapy thoughts via AI analysis.
    func generateTherapyPrep() async {
        guard let therapyPatternService, let therapyPrepService else { return }

        isLoadingTherapyPrep = true
        defer { isLoadingTherapyPrep = false }

        do {
            // Fetch therapy thoughts from last 30 days
            let allTherapyThoughts = try await store.fetchRecentTherapyThoughts(days: 30, limit: 200)
            // Fetch bringToTherapist thoughts from last 30 days
            let bringToTherapistThoughts = try await store.fetchRecentTherapyThoughts(
                days: 30, classification: .bringToTherapist, limit: 200
            )

            // Detect patterns across all therapy thoughts
            let patterns = try await therapyPatternService.detectPatterns(
                thoughts: allTherapyThoughts, lookbackDays: 30
            )
            therapyPatterns = patterns

            // Generate prep from bringToTherapist thoughts with pattern context
            let prep = try await therapyPrepService.generatePrep(
                thoughts: bringToTherapistThoughts, patterns: patterns
            )
            therapyPrep = prep
        } catch {
            NSLog("Dashboard: therapy prep generation failed — %@", error.localizedDescription)
        }
    }

    /// Format therapy prep as readable text for clipboard export.
    func therapyPrepAsText() -> String {
        let dateFormatter = DateFormatter()
        dateFormatter.dateStyle = .medium
        let dateString = dateFormatter.string(from: Date())

        var text = "Therapy Session Prep — \(dateString)\n"

        if let prep = therapyPrep {
            text += "\nSuggested Focus: \(prep.suggestedFocus)\n"
        }

        if !therapyPatterns.isEmpty {
            text += "\nPatterns:\n"
            for pattern in therapyPatterns {
                text += "• \(pattern.theme) (\(pattern.trend)) — \(pattern.description)\n"
            }
        }

        if let prep = therapyPrep, !prep.items.isEmpty {
            text += "\nDiscussion Topics:\n"
            for (index, item) in prep.items.enumerated() {
                text += "\(index + 1). [\(item.urgency)] \(item.topic)\n"
                text += "   \(item.context)\n"
            }
        }

        return text
    }

    // MARK: - Tags & Favorites

    /// Toggle the favorite status of a thought.
    func toggleFavorite(thoughtId: Int64) async {
        do {
            try await store.toggleFavorite(id: thoughtId)
            await loadThoughts()
            await loadCounts()
        } catch {
            NSLog("Dashboard: failed to toggle favorite — \(error.localizedDescription)")
        }
    }

    /// Add a tag to a thought.
    func addTag(thoughtId: Int64, tag: String) async {
        let trimmed = tag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            try await store.addTag(id: thoughtId, tag: trimmed)
            await loadThoughts()
            await loadCounts()
        } catch {
            NSLog("Dashboard: failed to add tag — \(error.localizedDescription)")
        }
    }

    /// Remove a tag from a thought.
    func removeTag(thoughtId: Int64, tag: String) async {
        do {
            try await store.removeTag(id: thoughtId, tag: tag)
            await loadThoughts()
            await loadCounts()
        } catch {
            NSLog("Dashboard: failed to remove tag — \(error.localizedDescription)")
        }
    }

    /// Add a tag to all selected thoughts in bulk.
    func bulkAddTag(tag: String) async {
        let trimmed = tag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            try await store.bulkAddTag(ids: selectedThoughtIds, tag: trimmed)
            selectedThoughtIds.removeAll()
            await loadThoughts()
            await loadCounts()
        } catch {
            NSLog("Dashboard: bulk add tag failed — \(error.localizedDescription)")
        }
    }

    // MARK: - Thought Linking

    /// Begin linking mode for a thought — sets linkingThoughtId and clears search.
    func startLinking(thoughtId: Int64) {
        linkingThoughtId = thoughtId
        linkSearchQuery = ""
        linkSearchResults = []
    }

    /// Search for link target thoughts, excluding self and already-linked thoughts.
    func searchForLinkTarget(query: String) async {
        linkSearchQuery = query
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let sourceId = linkingThoughtId else {
            linkSearchResults = []
            return
        }
        do {
            var results = try await store.search(query: trimmed)
            // Exclude self
            results = results.filter { $0.id != sourceId }
            // Exclude already linked
            let linked = try await store.fetchLinkedThoughts(thoughtId: sourceId)
            let linkedIds = Set(linked.compactMap(\.id))
            results = results.filter { !linkedIds.contains($0.id ?? -1) }
            linkSearchResults = results
        } catch {
            NSLog("Dashboard: link target search failed — \(error.localizedDescription)")
            linkSearchResults = []
        }
    }

    /// Create a bidirectional link between the linking source and target thought.
    func createLink(targetId: Int64) async {
        guard let sourceId = linkingThoughtId else { return }
        do {
            try await store.linkThoughts(sourceId: sourceId, targetId: targetId)
            linkingThoughtId = nil
            linkSearchQuery = ""
            linkSearchResults = []
            await loadThoughts()
        } catch {
            NSLog("Dashboard: failed to create link — \(error.localizedDescription)")
        }
    }

    /// Remove a bidirectional link between two thoughts.
    func removeLink(thoughtId: Int64, linkedId: Int64) async {
        do {
            try await store.unlinkThoughts(sourceId: thoughtId, targetId: linkedId)
            await loadThoughts()
        } catch {
            NSLog("Dashboard: failed to remove link — \(error.localizedDescription)")
        }
    }

    /// Fetch all thoughts linked to a given thought.
    func fetchLinkedThoughts(thoughtId: Int64) async -> [Thought] {
        do {
            return try await store.fetchLinkedThoughts(thoughtId: thoughtId)
        } catch {
            NSLog("Dashboard: failed to fetch linked thoughts — \(error.localizedDescription)")
            return []
        }
    }

    // MARK: - Delete

    /// Delete a thought (marks for deletion sync, then refreshes).
    func deleteThought(_ thought: Thought) async {
        guard let id = thought.id else { return }
        do {
            try await store.delete(id: id)
            await loadThoughts()
            await loadCounts()
        } catch {
            NSLog("Dashboard: failed to delete thought %lld — %@", id, error.localizedDescription)
        }
    }

    // MARK: - Photo Preview Flow (Phase 60 Plan 02)

    /// Process one photo through the preview-then-commit pipeline. Sequential
    /// per-photo loop — the caller (`processFiles`) awaits us for each URL.
    ///
    /// Flow:
    ///   1. Read bytes + detect mediaType
    ///   2. Call /process-photo?preview=true — get initial paperType/confidence/thoughts
    ///   3. If confidence < 0.5, issue a SECOND preview call with forcePaperType = userDefault
    ///      and build the payload with the uncertainty banner flag set
    ///   4. Present the sheet by setting photoPreviewState and awaiting a continuation
    ///   5. On commit: call /process-photo (no preview), append results, refresh
    ///      On cancel: skip
    ///      On override: refetch preview with the new forcePaperType, re-present
    private func processPhotoFile(url: URL, index: Int, total: Int) async {
        guard let photoAPI else { return }
        let filename = url.lastPathComponent
        let fileNumber = index + 1

        // Read bytes (and do any PNG/HEIC → JPEG conversion already needed by
        // the legacy path so 1MB compression in processPhoto starts from JPEG).
        let (imageData, mediaType): (Data, ImageMediaType)
        do {
            if ImageConversion.needsConversion(url) {
                imageData = try ImageConversion.convertToJPEG(from: url)
                mediaType = .jpeg
            } else {
                imageData = try Data(contentsOf: url)
                mediaType = Self.inferMediaType(for: url)
            }
        } catch {
            importErrors.append("\(filename): Couldn't read file")
            return
        }

        importProgress = ImportProgress(current: fileNumber, total: total, currentFile: filename, phase: "Analyzing")

        // 1. Initial preview call.
        let initial: ProcessedPhotoResponse
        do {
            initial = try await photoAPI.processPhoto(
                imageData: imageData,
                mediaType: mediaType,
                preview: true,
                forcePaperType: nil
            )
        } catch {
            importErrors.append("\(filename): \(Self.mapPhotoError(error))")
            return
        }

        // 2. Build payload (possibly with low-confidence refetch).
        let detectedType = Self.parsePaperType(initial.paperType) ?? .lined
        let payload: PhotoPreviewPayload
        if initial.confidence < 0.5 {
            // D-05 — low confidence: refetch with the user's Settings default,
            // pre-select that value, show uncertainty banner.
            let userDefault = userDefaultPaperTypeProvider()
            let refetched: ProcessedPhotoResponse
            do {
                refetched = try await photoAPI.processPhoto(
                    imageData: imageData,
                    mediaType: mediaType,
                    preview: true,
                    forcePaperType: userDefault
                )
            } catch {
                importErrors.append("\(filename): \(Self.mapPhotoError(error))")
                return
            }
            payload = PhotoPreviewPayload(
                fileURL: url,
                indexInBatch: index,
                totalInBatch: total,
                detectedPaperType: detectedType,
                confidence: initial.confidence,
                thoughts: refetched.thoughts.map(\.content),
                currentForcePaperType: userDefault,
                showUncertaintyBanner: true,
                userDefaultPaperType: userDefault,
                isBusy: false
            )
        } else {
            payload = PhotoPreviewPayload(
                fileURL: url,
                indexInBatch: index,
                totalInBatch: total,
                detectedPaperType: detectedType,
                confidence: initial.confidence,
                thoughts: initial.thoughts.map(\.content),
                currentForcePaperType: detectedType,
                showUncertaintyBanner: false,
                userDefaultPaperType: userDefaultPaperTypeProvider(),
                isBusy: false
            )
        }

        // 3. Present sheet and await the user's decision.
        _ = await presentPreviewAndWait(payload: payload)
        // 4. Regardless of outcome, the per-photo error/commit paths have
        //    already updated importErrors / main thoughts list as needed.
    }

    /// Present the preview sheet and suspend until commit/cancel/override-error
    /// resumes the continuation. Returns the terminal decision.
    private func presentPreviewAndWait(payload: PhotoPreviewPayload) async -> PhotoPreviewDecision {
        photoPreviewState = .awaitingUserDecision(payload)
        return await withCheckedContinuation { (cont: CheckedContinuation<PhotoPreviewDecision, Never>) in
            self.photoPreviewContinuation = cont
        }
    }

    // MARK: Preview Decision Handlers

    /// User clicked Commit on the preview sheet. Issues the non-preview
    /// /process-photo call with the current forcePaperType (omitted when it
    /// matches the detected type, to keep the log byte-identical to a
    /// no-override call). On success, refreshes the thought list; on failure,
    /// records an importErrors entry. Either way, advances the batch.
    func commitPhotoPreview() async {
        guard case .awaitingUserDecision(var payload) = photoPreviewState,
              let photoAPI else { return }

        payload.isBusy = true
        photoPreviewState = .awaitingUserDecision(payload)

        let filename = payload.fileURL.lastPathComponent
        let forced: PaperType? = payload.currentForcePaperType == payload.detectedPaperType
            ? nil
            : payload.currentForcePaperType

        do {
            let imageData: Data
            let mediaType: ImageMediaType
            if ImageConversion.needsConversion(payload.fileURL) {
                imageData = try ImageConversion.convertToJPEG(from: payload.fileURL)
                mediaType = .jpeg
            } else {
                imageData = try Data(contentsOf: payload.fileURL)
                mediaType = Self.inferMediaType(for: payload.fileURL)
            }

            _ = try await photoAPI.processPhoto(
                imageData: imageData,
                mediaType: mediaType,
                preview: false,
                forcePaperType: forced
            )

            // Commit success — backend persisted the rows. Refresh the list
            // so the new thoughts appear. (Refresh is cheap + matches the
            // existing end-of-batch refresh in processFiles.)
            await refresh()
            photoPreviewState = nil
            resumePreviewWaiter(with: .committed)
        } catch {
            importErrors.append("\(filename): \(Self.mapPhotoError(error))")
            photoPreviewState = nil
            resumePreviewWaiter(with: .errored)
        }
    }

    /// User clicked Cancel. Skip this photo; advance the batch.
    func cancelPhotoPreview() {
        guard case .awaitingUserDecision = photoPreviewState else { return }
        photoPreviewState = nil
        resumePreviewWaiter(with: .cancelled)
    }

    /// User flipped the segmented picker to a new paper type. Refetch the
    /// preview with `forcePaperType = newType` and update the payload in
    /// place (state stays `.awaitingUserDecision`). On refetch error, record
    /// the error and advance the batch (cancels the waiter).
    func overridePhotoPreview(to newType: PaperType) async {
        guard case .awaitingUserDecision(var payload) = photoPreviewState,
              payload.currentForcePaperType != newType,
              let photoAPI else { return }

        // Mark busy — disables the picker + buttons in the sheet.
        payload.isBusy = true
        photoPreviewState = .awaitingUserDecision(payload)

        let filename = payload.fileURL.lastPathComponent
        do {
            let imageData: Data
            let mediaType: ImageMediaType
            if ImageConversion.needsConversion(payload.fileURL) {
                imageData = try ImageConversion.convertToJPEG(from: payload.fileURL)
                mediaType = .jpeg
            } else {
                imageData = try Data(contentsOf: payload.fileURL)
                mediaType = Self.inferMediaType(for: payload.fileURL)
            }

            let refetched = try await photoAPI.processPhoto(
                imageData: imageData,
                mediaType: mediaType,
                preview: true,
                forcePaperType: newType
            )

            payload.thoughts = refetched.thoughts.map(\.content)
            payload.currentForcePaperType = newType
            payload.isBusy = false
            photoPreviewState = .awaitingUserDecision(payload)
            // Do NOT resume the continuation — we stay in awaitingUserDecision.
        } catch {
            importErrors.append("\(filename): \(Self.mapPhotoError(error))")
            photoPreviewState = nil
            resumePreviewWaiter(with: .cancelled)
        }
    }

    /// Resume and nil-out the waiter in one atomic step so re-entry is safe.
    private func resumePreviewWaiter(with decision: PhotoPreviewDecision) {
        let cont = photoPreviewContinuation
        photoPreviewContinuation = nil
        cont?.resume(returning: decision)
    }

    // MARK: Photo Preview Helpers

    /// Map an arbitrary error thrown by the photo API (or file I/O) to the
    /// D-08 friendly banner string. NEVER surfaces raw error text to the UI —
    /// Plan 60-01 already strips raw Anthropic/SDK text from the backend 502
    /// body, but we do our own fixed mapping as defense-in-depth (T-60-12).
    static func mapPhotoError(_ error: Error) -> String {
        if let photoError = error as? ProcessPhotoError {
            switch photoError {
            case .unsupportedMediaType:
                return "Image format not supported"
            case .httpStatus(let code):
                switch code {
                case 400: return "Image format not supported"
                case 413: return "Photo too large — try a smaller file (5 MB max)"
                case 500: return "Couldn't save thoughts — try again in a moment"
                case 502: return "Claude couldn't read that photo — try a sharper shot"
                case 503: return "Vigil Core AI not configured — check Settings → AI tab"
                default:  return "Couldn't process photo — see logs"
                }
            case .transport(let underlying):
                if let urlErr = underlying as? URLError {
                    if urlErr.code == .timedOut { return "Request timed out" }
                    if urlErr.code == .cannotConnectToHost || urlErr.code == .notConnectedToInternet {
                        return "Request timed out"
                    }
                }
                return "Couldn't process photo — see logs"
            }
        }
        if let urlErr = error as? URLError, urlErr.code == .timedOut {
            return "Request timed out"
        }
        // ImageDescriptionError is thrown by prepareImage/compress before the HTTP
        // call — surfacing it properly avoids the generic catchall so users know
        // the failure is client-side image prep, not a network/server issue.
        if let imageErr = error as? ImageDescriptionError {
            switch imageErr {
            case .imageTooLarge:
                return "Photo couldn't be prepared — try a smaller image or a different format"
            case .apiError(let detail):
                return "Image API error: \(detail)"
            case .parseError:
                return "Couldn't read image data — try a different file"
            }
        }
        return "Couldn't process photo — see logs"
    }

    /// String → PaperType (nil if the backend returned "unknown" or anything else).
    static func parsePaperType(_ raw: String) -> PaperType? {
        PaperType(rawValue: raw)
    }

    /// File URL → ImageMediaType using the extension.
    static func inferMediaType(for url: URL) -> ImageMediaType {
        switch url.pathExtension.lowercased() {
        case "jpg", "jpeg": return .jpeg
        case "png": return .png
        case "gif": return .gif
        case "webp": return .webp
        default: return .jpeg
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
