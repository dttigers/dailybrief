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
            return try request.limit(limit, offset: offset).fetchAll(db)
        }
    }

    /// Count thoughts with combined filters. Excludes deleted.
    public func countFiltered(
        category: ThoughtCategory? = nil,
        source: CaptureSource? = nil,
        after: Date? = nil
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
