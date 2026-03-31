import Foundation
import GRDB

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

    /// Insert or update a thought. Sets `modifiedAt` to now on update.
    public func save(_ thought: inout Thought) throws {
        thought.modifiedAt = Date()
        let input = thought
        thought = try db.write { db in
            var t = input
            try t.save(db)
            return t
        }
    }

    /// Delete a thought by ID. Returns true if a row was deleted.
    @discardableResult
    public func delete(id: Int64) async throws -> Bool {
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
    public func fetchAll(
        category: ThoughtCategory? = nil,
        limit: Int = 100,
        offset: Int = 0
    ) async throws -> [Thought] {
        try await db.reader.read { db in
            var request = Thought.order(Thought.Columns.createdAt.desc)
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
                .joining(required: Thought.thoughtsFts.matching(pattern))
                .limit(limit)
                .fetchAll(db)
        }
    }

    /// Count thoughts, optionally filtered by category.
    public func count(category: ThoughtCategory? = nil) async throws -> Int {
        try await db.reader.read { db in
            var request = Thought.all()
            if let category {
                request = request.filter(Thought.Columns.category == category.rawValue)
            }
            return try request.fetchCount(db)
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
