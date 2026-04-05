import Foundation

/// Protocol abstracting the thought data layer, enabling swappable backends
/// (local GRDB, remote Vigil API, etc.) without changing ViewModel or service code.
///
/// Excludes CloudKit sync methods which are local-only concerns.
public protocol ThoughtRepository: Actor {

    // MARK: CRUD Operations

    /// Save a thought and return the saved version (with ID populated).
    /// Use this instead of `save(_:inout)` across actor boundaries.
    func saveThought(_ thought: Thought) async throws -> Thought

    /// Update a thought and return the saved version.
    @discardableResult
    func update(_ thought: Thought) throws -> Thought

    /// Mark a thought for deletion. Returns true if a row was updated.
    @discardableResult
    func delete(id: Int64) async throws -> Bool

    /// Fetch a single thought by ID.
    func fetch(id: Int64) async throws -> Thought?

    // MARK: List / Filter Operations

    /// Fetch thoughts with optional category filter, ordered by createdAt descending.
    func fetchAll(
        category: ThoughtCategory?,
        limit: Int,
        offset: Int
    ) async throws -> [Thought]

    /// Fetch thoughts with combined filters, ordered by createdAt descending.
    func fetchFiltered(
        category: ThoughtCategory?,
        source: CaptureSource?,
        after: Date?,
        tag: String?,
        favoritesOnly: Bool,
        limit: Int,
        offset: Int
    ) async throws -> [Thought]

    /// Count thoughts with combined filters.
    func countFiltered(
        category: ThoughtCategory?,
        source: CaptureSource?,
        after: Date?,
        tag: String?,
        favoritesOnly: Bool
    ) async throws -> Int

    /// Count thoughts, optionally filtered by category.
    func count(category: ThoughtCategory?) async throws -> Int

    /// Full-text search across thought content.
    func search(query: String, limit: Int) async throws -> [Thought]

    // MARK: Task Operations

    /// Update the task status of a thought.
    @discardableResult
    func updateTaskStatus(id: Int64, status: TaskStatus) throws -> Thought

    /// Fetch task-category thoughts, optionally filtered by status.
    func fetchTasks(status: TaskStatus?, limit: Int) async throws -> [Thought]

    /// Count task-category thoughts, optionally filtered by status.
    func countTasks(status: TaskStatus?) async throws -> Int

    // MARK: Therapy Operations

    /// Fetch therapy-category thoughts, optionally filtered by classification.
    func fetchTherapyThoughts(
        classification: TherapyClassification?,
        limit: Int,
        offset: Int
    ) async throws -> [Thought]

    /// Count therapy-category thoughts, optionally filtered by classification.
    func countTherapy(classification: TherapyClassification?) async throws -> Int

    /// Count therapy thoughts with no classification.
    func countUnclassifiedTherapy() async throws -> Int

    /// Fetch therapy thoughts within a date range.
    func fetchTherapyThoughtsByDateRange(
        from startDate: Date,
        to endDate: Date,
        classification: TherapyClassification?
    ) async throws -> [Thought]

    /// Fetch recent therapy thoughts within a number of days.
    func fetchRecentTherapyThoughts(
        days: Int,
        classification: TherapyClassification?,
        limit: Int
    ) async throws -> [Thought]

    /// Bulk update therapy classification for matching thoughts. Returns count updated.
    @discardableResult
    func bulkUpdateTherapyClassification(ids: Set<Int64>, classification: TherapyClassification) throws -> Int

    // MARK: Tag Operations

    /// Add a tag to a thought.
    @discardableResult
    func addTag(id: Int64, tag: String) throws -> Thought?

    /// Remove a tag from a thought.
    @discardableResult
    func removeTag(id: Int64, tag: String) throws -> Thought?

    /// Fetch thoughts containing a specific tag.
    func fetchByTag(tag: String, limit: Int, offset: Int) async throws -> [Thought]

    /// Return all unique tags across all thoughts, sorted alphabetically.
    func allUniqueTags() async throws -> [String]

    /// Add a tag to multiple thoughts. Returns count modified.
    @discardableResult
    func bulkAddTag(ids: Set<Int64>, tag: String) throws -> Int

    /// Remove a tag from multiple thoughts. Returns count modified.
    @discardableResult
    func bulkRemoveTag(ids: Set<Int64>, tag: String) throws -> Int

    // MARK: Favorite Operations

    /// Toggle the favorite status of a thought.
    @discardableResult
    func toggleFavorite(id: Int64) throws -> Thought?

    /// Fetch favorited thoughts.
    func fetchFavorites(limit: Int, offset: Int) async throws -> [Thought]

    /// Count favorited thoughts.
    func countFavorites() async throws -> Int

    // MARK: Link Operations

    /// Create a bidirectional link between two thoughts.
    @discardableResult
    func linkThoughts(sourceId: Int64, targetId: Int64) throws -> ThoughtLink?

    /// Remove a bidirectional link between two thoughts.
    func unlinkThoughts(sourceId: Int64, targetId: Int64) throws

    /// Fetch all thoughts linked to a given thought.
    func fetchLinkedThoughts(thoughtId: Int64) async throws -> [Thought]

    /// Count thoughts linked to a given thought.
    func countLinks(thoughtId: Int64) async throws -> Int

    // MARK: Bulk Operations

    /// Mark matching thoughts for deletion. Returns count updated.
    @discardableResult
    func bulkDelete(ids: Set<Int64>) throws -> Int

    /// Update category for matching thoughts. Returns count updated.
    @discardableResult
    func bulkUpdateCategory(ids: Set<Int64>, category: ThoughtCategory) throws -> Int
}
