import CloudKit

// MARK: - ThoughtCloudData

/// Intermediary struct for converting CKRecord data into local Thought values.
/// Used when processing remote records during sync — provides all fields needed
/// to create or update a local Thought without coupling to CKRecord directly.
public struct ThoughtCloudData: Sendable {
    public let cloudKitRecordID: String
    public let content: String
    public let category: ThoughtCategory?
    public let confidence: Double?
    public let source: CaptureSource
    public let taskStatus: TaskStatus?
    public let therapyClassification: TherapyClassification?
    public let createdAt: Date
    public let modifiedAt: Date
}

// MARK: - CloudKitManager

/// Manages CloudKit container access, custom zone setup, and bidirectional
/// record mapping between Thought structs and CKRecords.
public actor CloudKitManager {

    // MARK: Constants

    public static let containerID = "iCloud.com.jamesonmorrill.jarvis"
    public static let zoneName = "ThoughtsZone"
    public static let thoughtRecordType = "Thought"

    // MARK: Properties

    private let container: CKContainer
    private let database: CKDatabase
    public let zoneID: CKRecordZone.ID

    /// Exposes the private database for SyncService operations.
    public var privateDatabase: CKDatabase { database }

    // MARK: Initialization

    /// Check whether CloudKit entitlements are available before creating a CKContainer.
    /// CKContainer(identifier:) triggers SIGILL when the binary lacks entitlements
    /// (e.g., when built with `swift build` instead of Xcode code-signing).
    public static var isAvailable: Bool {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
        task.arguments = ["-d", "--entitlements", ":-", Bundle.main.executablePath ?? ""]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = FileHandle.nullDevice
        do {
            try task.run()
            task.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            return output.contains("com.apple.developer.icloud-container-identifiers")
        } catch {
            return false
        }
    }

    public init() {
        let container = CKContainer(identifier: CloudKitManager.containerID)
        self.container = container
        self.database = container.privateCloudDatabase
        self.zoneID = CKRecordZone.ID(
            zoneName: CloudKitManager.zoneName,
            ownerName: CKCurrentUserDefaultName
        )
    }

    // MARK: Zone Setup

    /// Creates the custom record zone if it doesn't already exist.
    /// Call once on first sync to enable incremental change tracking.
    public func createZoneIfNeeded() async throws {
        let zone = CKRecordZone(zoneID: zoneID)
        do {
            _ = try await database.save(zone)
        } catch let error as CKError where error.code == .serverRecordChanged {
            // Zone already exists — that's fine
        } catch let error as CKError where error.code == .zoneNotFound {
            // Unexpected for save, but swallow and retry is not needed
            throw error
        } catch {
            // Check if the error indicates the zone already exists
            if let ckError = error as? CKError,
               ckError.code == .serverRecordChanged {
                return
            }
            throw error
        }
    }

    // MARK: Record Mapping — Thought → CKRecord

    /// Converts a Thought into a CKRecord for uploading to CloudKit.
    /// Local-only fields (id, syncStatus, lastSyncedAt) are NOT stored remotely.
    public func record(from thought: Thought) -> CKRecord {
        let recordID = CKRecord.ID(
            recordName: thought.cloudKitRecordID,
            zoneID: zoneID
        )
        let record = CKRecord(recordType: CloudKitManager.thoughtRecordType, recordID: recordID)
        record["content"] = thought.content as NSString
        record["category"] = thought.category?.rawValue as NSString?
        record["confidence"] = thought.confidence.map { NSNumber(value: $0) }
        record["source"] = thought.source.rawValue as NSString
        record["createdAt"] = thought.createdAt as NSDate
        record["taskStatus"] = thought.taskStatus?.rawValue as NSString?
        record["therapyClassification"] = thought.therapyClassification?.rawValue as NSString?
        record["modifiedAt"] = thought.modifiedAt as NSDate
        return record
    }

    // MARK: Record Mapping — CKRecord → ThoughtCloudData

    /// Extracts Thought field values from a CKRecord received from CloudKit.
    /// Returns a ThoughtCloudData struct for creating/updating local Thoughts.
    public func thoughtValues(from record: CKRecord) -> ThoughtCloudData {
        let cloudKitRecordID = record.recordID.recordName
        let content = record["content"] as? String ?? ""
        let categoryRaw = record["category"] as? String
        let category = categoryRaw.flatMap { ThoughtCategory(rawValue: $0) }
        let confidenceNumber = record["confidence"] as? NSNumber
        let confidence = confidenceNumber?.doubleValue
        let sourceRaw = record["source"] as? String ?? CaptureSource.text.rawValue
        let source = CaptureSource(rawValue: sourceRaw) ?? .text
        let taskStatusRaw = record["taskStatus"] as? String
        let taskStatus = taskStatusRaw.flatMap { TaskStatus(rawValue: $0) }
        let therapyClassificationRaw = record["therapyClassification"] as? String
        let therapyClassification = therapyClassificationRaw.flatMap { TherapyClassification(rawValue: $0) }
        let createdAt = record["createdAt"] as? Date ?? record.creationDate ?? Date()
        let modifiedAt = record["modifiedAt"] as? Date ?? record.modificationDate ?? Date()

        return ThoughtCloudData(
            cloudKitRecordID: cloudKitRecordID,
            content: content,
            category: category,
            confidence: confidence,
            source: source,
            taskStatus: taskStatus,
            therapyClassification: therapyClassification,
            createdAt: createdAt,
            modifiedAt: modifiedAt
        )
    }
}
