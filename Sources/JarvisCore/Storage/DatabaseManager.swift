import Foundation
import GRDB

/// Manages the SQLite database lifecycle: creation, migrations, and access.
public actor DatabaseManager {

    // MARK: Properties

    private let dbQueue: DatabaseQueue

    /// Read-only access to the database (nonisolated — DatabaseQueue is thread-safe).
    public nonisolated var reader: any DatabaseReader {
        dbQueue
    }

    // MARK: Initialization

    /// Creates a DatabaseManager with a SQLite database at the given path.
    ///
    /// - Parameter path: File path for the database. Defaults to
    ///   `~/Library/Application Support/Jarvis/jarvis.sqlite`.
    ///   Parent directories are created if they don't exist.
    public init(path: String? = nil) throws {
        let dbPath = path ?? {
            let appSupport = FileManager.default.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            ).first!.appendingPathComponent("Jarvis")
            return appSupport.appendingPathComponent("jarvis.sqlite").path
        }()

        // Create parent directory if needed
        let directory = (dbPath as NSString).deletingLastPathComponent
        try FileManager.default.createDirectory(
            atPath: directory,
            withIntermediateDirectories: true
        )

        dbQueue = try DatabaseQueue(path: dbPath)
        try Self.runMigrations(on: dbQueue)
    }

    // MARK: Database Access

    /// Perform a write transaction on the database (nonisolated — DatabaseQueue is thread-safe).
    public nonisolated func write<T: Sendable>(
        _ block: @Sendable (Database) throws -> T
    ) throws -> T {
        try dbQueue.write(block)
    }

    // MARK: Migrations

    private static func runMigrations(on dbQueue: DatabaseQueue) throws {
        var migrator = DatabaseMigrator()

        // v1: Core thoughts table
        migrator.registerMigration("v1-thoughts") { db in
            try db.create(table: "thoughts") { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("content", .text).notNull()
                t.column("category", .text)
                t.column("confidence", .double)
                t.column("source", .text).notNull()
                t.column("createdAt", .datetime).notNull()
                    .defaults(sql: "CURRENT_TIMESTAMP")
                t.column("modifiedAt", .datetime).notNull()
                    .defaults(sql: "CURRENT_TIMESTAMP")
            }
        }

        // v1: FTS5 full-text search index on thought content
        migrator.registerMigration("v1-thoughts-fts") { db in
            try db.create(virtualTable: "thoughts_fts", using: FTS5()) { t in
                t.synchronize(withTable: "thoughts")
                t.tokenizer = .unicode61()
                t.column("content")
            }
        }

        // v2: Sync metadata columns for CloudKit
        migrator.registerMigration("v2-sync-fields") { db in
            // Add sync columns to thoughts table
            try db.alter(table: "thoughts") { t in
                t.add(column: "cloudKitRecordID", .text).notNull().defaults(to: "")
                t.add(column: "syncStatus", .text).notNull().defaults(to: "pending")
                t.add(column: "lastSyncedAt", .datetime)
            }

            // Backfill UUIDs for existing rows (empty string default isn't valid)
            let rows = try Row.fetchAll(db, sql: "SELECT id FROM thoughts")
            for row in rows {
                let id: Int64 = row["id"]
                let uuid = UUID().uuidString
                try db.execute(
                    sql: "UPDATE thoughts SET cloudKitRecordID = ? WHERE id = ?",
                    arguments: [uuid, id]
                )
            }

            // Add unique index on cloudKitRecordID for efficient lookups during sync
            try db.create(index: "idx_thoughts_cloudKitRecordID",
                          on: "thoughts",
                          columns: ["cloudKitRecordID"],
                          unique: true)
        }

        // v3: Task status column for task workflow
        migrator.registerMigration("v3-task-status") { db in
            try db.alter(table: "thoughts") { t in
                t.add(column: "taskStatus", .text)
            }

            // Backfill existing task-category rows as "open"
            try db.execute(
                sql: "UPDATE thoughts SET taskStatus = 'open' WHERE category = 'task'"
            )
        }

        try migrator.migrate(dbQueue)
    }
}
