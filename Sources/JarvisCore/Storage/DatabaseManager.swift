import Foundation
import GRDB

/// Manages the SQLite database lifecycle: creation, migrations, and access.
public actor DatabaseManager {

    // MARK: Properties

    private let dbQueue: DatabaseQueue

    /// Read-only access to the database.
    public var reader: any DatabaseReader {
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

    /// Perform a write transaction on the database.
    public func write<T: Sendable>(
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

        try migrator.migrate(dbQueue)
    }
}
