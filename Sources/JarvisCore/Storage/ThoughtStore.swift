import Foundation
import GRDB

/// Errors thrown by ThoughtStore operations.
public enum ThoughtStoreError: Error, LocalizedError {
    case notFound(id: Int64)

    public var errorDescription: String? {
        switch self {
        case .notFound(let id):
            return "Thought with id \(id) not found"
        }
    }
}

/// Data access layer for thoughts — provides CRUD operations and FTS5 search.
public actor ThoughtStore {

    // MARK: Properties

    private let db: DatabaseManager

    // MARK: Initialization

    /// Creates a ThoughtStore backed by the given DatabaseManager.
    public init(database: DatabaseManager) {
        self.db = database
    }

    // MARK: CRUD Operations

    /// Insert or update a thought. Sets `modifiedAt` to now and marks as pending sync.
    public func save(_ thought: inout Thought) throws {
        thought.modifiedAt = Date()
        thought.syncStatus = .pending
        let input = thought
        thought = try db.write { db in
            var t = input
            try t.save(db)
            return t
        }
    }

    /// Update a thought and return the saved version. Sets `modifiedAt` to now and marks as pending sync.
    /// Use this variant when calling across actor boundaries (no `inout` parameter).
    @discardableResult
    public func update(_ thought: Thought) throws -> Thought {
        try db.write { db in
            var t = thought
            t.modifiedAt = Date()
            t.syncStatus = .pending
            try t.save(db)
            return t
        }
    }

    /// Mark a thought for deletion sync. The row stays in the database until CloudKit confirms deletion.
    /// Returns true if a row was updated.
    @discardableResult
    public func delete(id: Int64) async throws -> Bool {
        try db.write { db in
            if var thought = try Thought.fetchOne(db, key: id) {
                thought.syncStatus = .pendingDeletion
                try thought.update(db)
                return true
            }
            return false
        }
    }

    /// Permanently remove a thought row from the database.
    /// Called after CloudKit confirms the deletion has been synced.
    @discardableResult
    public func deletePermanently(id: Int64) throws -> Bool {
        try db.write { db in
            try Thought.deleteOne(db, key: id)
        }
    }

    /// Fetch a single thought by ID.
    public func fetch(id: Int64) async throws -> Thought? {
        try await db.reader.read { db in
            try Thought.fetchOne(db, key: id)
        }
    }

    /// Fetch thoughts with optional category filter, ordered by createdAt descending.
    /// Excludes thoughts marked for deletion.
    public func fetchAll(
        category: ThoughtCategory? = nil,
        limit: Int = 100,
        offset: Int = 0
    ) async throws -> [Thought] {
        try await db.reader.read { db in
            var request = Thought
                .filter(Thought.Columns.syncStatus != SyncStatus.pendingDeletion.rawValue)
                .order(Thought.Columns.createdAt.desc)
            if let category {
                request = request.filter(Thought.Columns.category == category.rawValue)
            }
            return try request.limit(limit, offset: offset).fetchAll(db)
        }
    }

    /// Full-text search across thought content using FTS5.
    ///
    /// Uses `FTS5Pattern(matchingAllTokensIn:)` for safe user input handling.
    /// Returns results ranked by FTS5 relevance. Empty query returns empty array.
    public func search(query: String, limit: Int = 50) async throws -> [Thought] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        return try await db.reader.read { db in
            guard let pattern = FTS5Pattern(matchingAllTokensIn: trimmed) else {
                return []
            }
            return try Thought
                .all()
                .distinct()
                .filter(Thought.Columns.syncStatus != SyncStatus.pendingDeletion.rawValue)
                .joining(required: Thought.thoughtsFts.matching(pattern))
                .order(Thought.Columns.createdAt.desc)
                .limit(limit)
                .fetchAll(db)
        }
    }

    /// Fetch thoughts with combined filters, ordered by createdAt descending.
    /// Excludes thoughts marked for deletion.
    public func fetchFiltered(
        category: ThoughtCategory? = nil,
        source: CaptureSource? = nil,
        after: Date? = nil,
        tag: String? = nil,
        favoritesOnly: Bool = false,
        limit: Int = 100,
        offset: Int = 0
    ) async throws -> [Thought] {
        try await db.reader.read { db in
            var request = Thought
                .filter(Thought.Columns.syncStatus != SyncStatus.pendingDeletion.rawValue)
                .order(Thought.Columns.createdAt.desc)
            if let category {
                request = request.filter(Thought.Columns.category == category.rawValue)
            }
            if let source {
                request = request.filter(Thought.Columns.source == source.rawValue)
            }
            if let after {
                request = request.filter(Thought.Columns.createdAt >= after)
            }
            if let tag {
                request = request.filter(Thought.Columns.tags.like("%\"\(tag)\"%"))
            }
            if favoritesOnly {
                request = request.filter(Thought.Columns.isFavorited == true)
            }
            return try request.limit(limit, offset: offset).fetchAll(db)
        }
    }

    /// Count thoughts with combined filters. Excludes deleted.
    public func countFiltered(
        category: ThoughtCategory? = nil,
        source: CaptureSource? = nil,
        after: Date? = nil,
        tag: String? = nil,
        favoritesOnly: Bool = false
    ) async throws -> Int {
        try await db.reader.read { db in
            var request = Thought
                .filter(Thought.Columns.syncStatus != SyncStatus.pendingDeletion.rawValue)
            if let category {
                request = request.filter(Thought.Columns.category == category.rawValue)
            }
            if let source {
                request = request.filter(Thought.Columns.source == source.rawValue)
            }
            if let after {
                request = request.filter(Thought.Columns.createdAt >= after)
            }
            if let tag {
                request = request.filter(Thought.Columns.tags.like("%\"\(tag)\"%"))
            }
            if favoritesOnly {
                request = request.filter(Thought.Columns.isFavorited == true)
            }
            return try request.fetchCount(db)
        }
    }

    /// Count thoughts, optionally filtered by category. Excludes deleted.
    public func count(category: ThoughtCategory? = nil) async throws -> Int {
        try await db.reader.read { db in
            var request = Thought
                .filter(Thought.Columns.syncStatus != SyncStatus.pendingDeletion.rawValue)
            if let category {
                request = request.filter(Thought.Columns.category == category.rawValue)
            }
            return try request.fetchCount(db)
        }
    }

    // MARK: Task Status Operations

    /// Update the task status of a thought and return the saved version.
    /// Sets modifiedAt to now and marks as pending sync.
    @discardableResult
    public func updateTaskStatus(id: Int64, status: TaskStatus) throws -> Thought {
        try db.write { db in
            guard var thought = try Thought.fetchOne(db, key: id) else {
                throw ThoughtStoreError.notFound(id: id)
            }
            thought.taskStatus = status
            thought.modifiedAt = Date()
            thought.syncStatus = .pending
            try thought.update(db)
            return thought
        }
    }

    /// Fetch thoughts with category == .task, optionally filtered by task status. Excludes deleted.
    public func fetchTasks(status: TaskStatus? = nil, limit: Int = 100) async throws -> [Thought] {
        try await db.reader.read { db in
            var request = Thought
                .filter(Thought.Columns.category == ThoughtCategory.task.rawValue)
                .filter(Thought.Columns.syncStatus != SyncStatus.pendingDeletion.rawValue)
                .order(Thought.Columns.createdAt.desc)
            if let status {
                request = request.filter(Thought.Columns.taskStatus == status.rawValue)
            }
            return try request.limit(limit).fetchAll(db)
        }
    }

    /// Count thoughts with category == .task, optionally filtered by task status. Excludes deleted.
    public func countTasks(status: TaskStatus? = nil) async throws -> Int {
        try await db.reader.read { db in
            var request = Thought
                .filter(Thought.Columns.category == ThoughtCategory.task.rawValue)
                .filter(Thought.Columns.syncStatus != SyncStatus.pendingDeletion.rawValue)
            if let status {
                request = request.filter(Thought.Columns.taskStatus == status.rawValue)
            }
            return try request.fetchCount(db)
        }
    }

    // MARK: Therapy Classification Operations

    /// Fetch therapy-category thoughts, optionally filtered by classification.
    /// Excludes thoughts marked for deletion.
    public func fetchTherapyThoughts(
        classification: TherapyClassification? = nil,
        limit: Int = 100,
        offset: Int = 0
    ) async throws -> [Thought] {
        try await db.reader.read { db in
            var request = Thought
                .filter(Thought.Columns.category == ThoughtCategory.therapy.rawValue)
                .filter(Thought.Columns.syncStatus != SyncStatus.pendingDeletion.rawValue)
                .order(Thought.Columns.createdAt.desc)
            if let classification {
                request = request.filter(Thought.Columns.therapyClassification == classification.rawValue)
            }
            return try request.limit(limit, offset: offset).fetchAll(db)
        }
    }

    /// Update therapy classification for all matching thoughts in a single write transaction.
    /// Returns the count of rows updated.
    @discardableResult
    public func bulkUpdateTherapyClassification(ids: Set<Int64>, classification: TherapyClassification) throws -> Int {
        guard !ids.isEmpty else { return 0 }
        return try db.write { db in
            let now = Date()
            let idArray = Array(ids)
            var count = 0
            for id in idArray {
                guard var thought = try Thought.fetchOne(db, key: id) else { continue }
                thought.therapyClassification = classification
                thought.modifiedAt = now
                thought.syncStatus = .pending
                try thought.update(db)
                count += 1
            }
            return count
        }
    }

    /// Count therapy-category thoughts, optionally filtered by classification. Excludes deleted.
    /// Pass `nil` for classification to count all therapy thoughts.
    /// Pass a specific classification to count only that sub-type.
    /// Pass `.some(nil)` is not supported — use `countUnclassifiedTherapy()` for nil-classification count.
    public func countTherapy(classification: TherapyClassification? = nil) async throws -> Int {
        try await db.reader.read { db in
            var request = Thought
                .filter(Thought.Columns.category == ThoughtCategory.therapy.rawValue)
                .filter(Thought.Columns.syncStatus != SyncStatus.pendingDeletion.rawValue)
            if let classification {
                request = request.filter(Thought.Columns.therapyClassification == classification.rawValue)
            }
            return try request.fetchCount(db)
        }
    }

    /// Fetch therapy-category thoughts within a date range, optionally filtered by classification.
    /// Excludes thoughts marked for deletion.
    public func fetchTherapyThoughtsByDateRange(
        from startDate: Date,
        to endDate: Date,
        classification: TherapyClassification? = nil
    ) async throws -> [Thought] {
        try await db.reader.read { db in
            var request = Thought
                .filter(Thought.Columns.category == ThoughtCategory.therapy.rawValue)
                .filter(Thought.Columns.syncStatus != SyncStatus.pendingDeletion.rawValue)
                .filter(Thought.Columns.createdAt >= startDate)
                .filter(Thought.Columns.createdAt <= endDate)
                .order(Thought.Columns.createdAt.desc)
            if let classification {
                request = request.filter(Thought.Columns.therapyClassification == classification.rawValue)
            }
            return try request.fetchAll(db)
        }
    }

    /// Convenience method to fetch recent therapy thoughts within a number of days.
    /// Excludes thoughts marked for deletion.
    public func fetchRecentTherapyThoughts(
        days: Int,
        classification: TherapyClassification? = nil,
        limit: Int = 100
    ) async throws -> [Thought] {
        let startDate = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
        let endDate = Date()
        let thoughts = try await fetchTherapyThoughtsByDateRange(
            from: startDate,
            to: endDate,
            classification: classification
        )
        return Array(thoughts.prefix(limit))
    }

    /// Count therapy-category thoughts with no classification (nil therapyClassification). Excludes deleted.
    public func countUnclassifiedTherapy() async throws -> Int {
        try await db.reader.read { db in
            try Thought
                .filter(Thought.Columns.category == ThoughtCategory.therapy.rawValue)
                .filter(Thought.Columns.syncStatus != SyncStatus.pendingDeletion.rawValue)
                .filter(Thought.Columns.therapyClassification == nil)
                .fetchCount(db)
        }
    }

    // MARK: Tag Operations

    /// Add a tag to a thought. Creates the tags array if nil. Deduplicates.
    @discardableResult
    public func addTag(id: Int64, tag: String) throws -> Thought? {
        try db.write { db in
            guard var thought = try Thought.fetchOne(db, key: id) else { return nil }
            var currentTags = thought.tags ?? []
            guard !currentTags.contains(tag) else { return thought }
            currentTags.append(tag)
            thought.tags = currentTags
            thought.modifiedAt = Date()
            thought.syncStatus = .pending
            try thought.update(db)
            return thought
        }
    }

    /// Remove a tag from a thought.
    @discardableResult
    public func removeTag(id: Int64, tag: String) throws -> Thought? {
        try db.write { db in
            guard var thought = try Thought.fetchOne(db, key: id) else { return nil }
            guard var currentTags = thought.tags else { return thought }
            currentTags.removeAll { $0 == tag }
            thought.tags = currentTags.isEmpty ? nil : currentTags
            thought.modifiedAt = Date()
            thought.syncStatus = .pending
            try thought.update(db)
            return thought
        }
    }

    /// Fetch thoughts that contain a specific tag.
    public func fetchByTag(tag: String, limit: Int = 100, offset: Int = 0) async throws -> [Thought] {
        try await db.reader.read { db in
            try Thought
                .filter(Thought.Columns.syncStatus != SyncStatus.pendingDeletion.rawValue)
                .filter(Thought.Columns.tags.like("%\"\(tag)\"%"))
                .order(Thought.Columns.createdAt.desc)
                .limit(limit, offset: offset)
                .fetchAll(db)
        }
    }

    /// Return all unique tags across all thoughts, sorted alphabetically.
    public func allUniqueTags() async throws -> [String] {
        try await db.reader.read { db in
            let rows = try Row.fetchAll(
                db,
                sql: "SELECT tags FROM thoughts WHERE tags IS NOT NULL AND syncStatus != ?",
                arguments: [SyncStatus.pendingDeletion.rawValue]
            )
            var tagSet = Set<String>()
            let decoder = JSONDecoder()
            for row in rows {
                guard let jsonString: String = row["tags"],
                      let data = jsonString.data(using: .utf8),
                      let tags = try? decoder.decode([String].self, from: data) else { continue }
                for tag in tags {
                    tagSet.insert(tag)
                }
            }
            return tagSet.sorted()
        }
    }

    /// Add a tag to multiple thoughts in a single transaction. Returns count modified.
    @discardableResult
    public func bulkAddTag(ids: Set<Int64>, tag: String) throws -> Int {
        guard !ids.isEmpty else { return 0 }
        return try db.write { db in
            let now = Date()
            var count = 0
            for id in ids {
                guard var thought = try Thought.fetchOne(db, key: id) else { continue }
                var currentTags = thought.tags ?? []
                guard !currentTags.contains(tag) else { continue }
                currentTags.append(tag)
                thought.tags = currentTags
                thought.modifiedAt = now
                thought.syncStatus = .pending
                try thought.update(db)
                count += 1
            }
            return count
        }
    }

    /// Remove a tag from multiple thoughts in a single transaction. Returns count modified.
    @discardableResult
    public func bulkRemoveTag(ids: Set<Int64>, tag: String) throws -> Int {
        guard !ids.isEmpty else { return 0 }
        return try db.write { db in
            let now = Date()
            var count = 0
            for id in ids {
                guard var thought = try Thought.fetchOne(db, key: id) else { continue }
                guard var currentTags = thought.tags, currentTags.contains(tag) else { continue }
                currentTags.removeAll { $0 == tag }
                thought.tags = currentTags.isEmpty ? nil : currentTags
                thought.modifiedAt = now
                thought.syncStatus = .pending
                try thought.update(db)
                count += 1
            }
            return count
        }
    }

    // MARK: Favorite Operations

    /// Toggle the favorite status of a thought.
    @discardableResult
    public func toggleFavorite(id: Int64) throws -> Thought? {
        try db.write { db in
            guard var thought = try Thought.fetchOne(db, key: id) else { return nil }
            thought.isFavorited = !thought.isFavorited
            thought.modifiedAt = Date()
            thought.syncStatus = .pending
            try thought.update(db)
            return thought
        }
    }

    /// Fetch favorited thoughts, ordered by modifiedAt descending.
    public func fetchFavorites(limit: Int = 100, offset: Int = 0) async throws -> [Thought] {
        try await db.reader.read { db in
            try Thought
                .filter(Thought.Columns.syncStatus != SyncStatus.pendingDeletion.rawValue)
                .filter(Thought.Columns.isFavorited == true)
                .order(Thought.Columns.modifiedAt.desc)
                .limit(limit, offset: offset)
                .fetchAll(db)
        }
    }

    /// Count favorited thoughts.
    public func countFavorites() async throws -> Int {
        try await db.reader.read { db in
            try Thought
                .filter(Thought.Columns.syncStatus != SyncStatus.pendingDeletion.rawValue)
                .filter(Thought.Columns.isFavorited == true)
                .fetchCount(db)
        }
    }

    // MARK: Link Operations

    /// Create a bidirectional link between two thoughts. Returns the link (source→target direction).
    @discardableResult
    public func linkThoughts(sourceId: Int64, targetId: Int64) throws -> ThoughtLink? {
        try db.write { db in
            // Insert source→target
            var link = ThoughtLink(sourceThoughtId: sourceId, targetThoughtId: targetId)
            try link.insert(db, onConflict: .ignore)

            // Insert reverse target→source
            var reverse = ThoughtLink(sourceThoughtId: targetId, targetThoughtId: sourceId)
            try reverse.insert(db, onConflict: .ignore)

            return link
        }
    }

    /// Remove a bidirectional link between two thoughts.
    public func unlinkThoughts(sourceId: Int64, targetId: Int64) throws {
        try db.write { db in
            try db.execute(
                sql: "DELETE FROM thought_links WHERE (sourceThoughtId = ? AND targetThoughtId = ?) OR (sourceThoughtId = ? AND targetThoughtId = ?)",
                arguments: [sourceId, targetId, targetId, sourceId]
            )
        }
    }

    /// Fetch all thoughts linked to a given thought (bidirectional).
    public func fetchLinkedThoughts(thoughtId: Int64) async throws -> [Thought] {
        try await db.reader.read { db in
            try Thought.fetchAll(db, sql: """
                SELECT DISTINCT t.* FROM thoughts t
                INNER JOIN thought_links tl ON (
                    (tl.sourceThoughtId = ? AND tl.targetThoughtId = t.id)
                    OR (tl.targetThoughtId = ? AND tl.sourceThoughtId = t.id)
                )
                WHERE t.syncStatus != ?
                ORDER BY t.createdAt DESC
                """,
                arguments: [thoughtId, thoughtId, SyncStatus.pendingDeletion.rawValue]
            )
        }
    }

    /// Count thoughts linked to a given thought.
    public func countLinks(thoughtId: Int64) async throws -> Int {
        try await db.reader.read { db in
            let count = try Int.fetchOne(db, sql: """
                SELECT COUNT(DISTINCT CASE
                    WHEN tl.sourceThoughtId = ? THEN tl.targetThoughtId
                    ELSE tl.sourceThoughtId
                END) FROM thought_links tl
                WHERE tl.sourceThoughtId = ? OR tl.targetThoughtId = ?
                """,
                arguments: [thoughtId, thoughtId, thoughtId]
            )
            return count ?? 0
        }
    }

    // MARK: Bulk Operations

    /// Mark all matching thoughts as pendingDeletion in a single write transaction.
    /// Returns the count of rows updated.
    @discardableResult
    public func bulkDelete(ids: Set<Int64>) throws -> Int {
        guard !ids.isEmpty else { return 0 }
        return try db.write { db in
            let placeholders = ids.map { _ in "?" }.joined(separator: ", ")
            let sql = "UPDATE thoughts SET syncStatus = ? WHERE id IN (\(placeholders))"
            let arguments: [DatabaseValueConvertible] = [SyncStatus.pendingDeletion.rawValue] + Array(ids).map { $0 as DatabaseValueConvertible }
            try db.execute(sql: sql, arguments: StatementArguments(arguments))
            return db.changesCount
        }
    }

    /// Update category (and taskStatus) for all matching thoughts in a single write transaction.
    /// Returns the count of rows updated.
    @discardableResult
    public func bulkUpdateCategory(ids: Set<Int64>, category: ThoughtCategory) throws -> Int {
        guard !ids.isEmpty else { return 0 }
        return try db.write { db in
            let now = Date()
            let idArray = Array(ids)
            var count = 0
            for id in idArray {
                guard var thought = try Thought.fetchOne(db, key: id) else { continue }
                thought.category = category
                thought.modifiedAt = now
                thought.syncStatus = .pending
                if category == .task {
                    if thought.taskStatus == nil {
                        thought.taskStatus = .open
                    }
                } else {
                    thought.taskStatus = nil
                }
                try thought.update(db)
                count += 1
            }
            return count
        }
    }

    // MARK: Sync Operations

    /// Fetch all thoughts that need to be uploaded to CloudKit.
    public func fetchPendingSync() async throws -> [Thought] {
        try await db.reader.read { db in
            try Thought
                .filter(Thought.Columns.syncStatus == SyncStatus.pending.rawValue)
                .fetchAll(db)
        }
    }

    /// Fetch all thoughts that are marked for deletion sync.
    public func fetchPendingDeletions() async throws -> [Thought] {
        try await db.reader.read { db in
            try Thought
                .filter(Thought.Columns.syncStatus == SyncStatus.pendingDeletion.rawValue)
                .fetchAll(db)
        }
    }

    /// Mark a thought as successfully synced to CloudKit.
    public func markSynced(id: Int64) throws {
        try db.write { db in
            try db.execute(
                sql: "UPDATE thoughts SET syncStatus = ?, lastSyncedAt = ? WHERE id = ?",
                arguments: [SyncStatus.synced.rawValue, Date(), id]
            )
        }
    }

    /// Mark a thought for deletion sync (without removing the row).
    public func markPendingDeletion(id: Int64) throws {
        try db.write { db in
            try db.execute(
                sql: "UPDATE thoughts SET syncStatus = ? WHERE id = ?",
                arguments: [SyncStatus.pendingDeletion.rawValue, id]
            )
        }
    }

    /// Create or update a local thought from CloudKit remote data.
    /// Looks up by cloudKitRecordID — inserts if not found, updates if exists.
    public func upsertFromCloud(_ data: ThoughtCloudData) throws {
        try db.write { db in
            if var existing = try Thought
                .filter(Thought.Columns.cloudKitRecordID == data.cloudKitRecordID)
                .fetchOne(db) {
                // Update existing thought with remote values
                existing.content = data.content
                existing.category = data.category
                existing.confidence = data.confidence
                existing.source = data.source
                existing.taskStatus = data.taskStatus
                existing.therapyClassification = data.therapyClassification
                existing.tags = data.tags
                existing.isFavorited = data.isFavorited
                existing.modifiedAt = data.modifiedAt
                existing.syncStatus = .synced
                existing.lastSyncedAt = Date()
                try existing.update(db)
            } else {
                // Insert new thought from cloud
                var thought = Thought(
                    content: data.content,
                    category: data.category,
                    confidence: data.confidence,
                    source: data.source,
                    createdAt: data.createdAt,
                    modifiedAt: data.modifiedAt,
                    taskStatus: data.taskStatus,
                    therapyClassification: data.therapyClassification,
                    tags: data.tags,
                    isFavorited: data.isFavorited,
                    cloudKitRecordID: data.cloudKitRecordID,
                    syncStatus: .synced,
                    lastSyncedAt: Date()
                )
                try thought.insert(db)
            }
        }
    }

    /// Fetch a thought by its CloudKit record ID.
    public func fetchByCloudKitRecordID(_ recordID: String) async throws -> Thought? {
        try await db.reader.read { db in
            try Thought
                .filter(Thought.Columns.cloudKitRecordID == recordID)
                .fetchOne(db)
        }
    }
}

// MARK: - FTS5 Association

extension Thought {
    static let thoughtsFts = hasOne(
        ThoughtFTS.self,
        using: ForeignKey(["rowid"], to: ["id"])
    )
}

/// Shadow type for the FTS5 virtual table, used for join-based search.
struct ThoughtFTS: TableRecord {
    static let databaseTableName = "thoughts_fts"
}
