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

/// View model for the central dashboard — fetches, filters, and searches thoughts.
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

    // MARK: - Private

    private let store: ThoughtStore
    private var searchTask: Task<Void, Never>?

    // MARK: - Initialization

    init(store: ThoughtStore) {
        self.store = store
    }

    // MARK: - Public Methods

    /// Full refresh: reload thoughts and sidebar counts.
    func refresh() async {
        isLoading = true
        await loadThoughts()
        await loadCounts()
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
