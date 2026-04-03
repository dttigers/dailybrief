import CloudKit
import Foundation
import os

// MARK: - SyncError

/// Errors that can occur during CloudKit sync operations.
public enum SyncError: Error, LocalizedError {
    case pushFailed(Error)
    case pullFailed(Error)
    case zoneSetupFailed(Error)

    public var errorDescription: String? {
        switch self {
        case .pushFailed(let error):
            return "Sync push failed: \(error.localizedDescription)"
        case .pullFailed(let error):
            return "Sync pull failed: \(error.localizedDescription)"
        case .zoneSetupFailed(let error):
            return "Sync zone setup failed: \(error.localizedDescription)"
        }
    }
}

// MARK: - SyncService

/// Manages bidirectional sync between local ThoughtStore and CloudKit.
/// Push uploads pending local changes. Pull fetches remote changes with
/// incremental change tokens. Conflict resolution uses last-write-wins.
public actor SyncService {

    // MARK: Properties

    private let cloudKit: CloudKitManager
    private let store: ThoughtStore
    private var serverChangeToken: CKServerChangeToken?
    private let changeTokenKey = "com.jarvis.cloudkit.changeToken"

    private let logger = Logger(subsystem: "com.jarvis", category: "SyncService")

    /// Whether a sync operation is currently in progress.
    public private(set) var isSyncing: Bool = false

    /// When the last successful sync completed.
    public private(set) var lastSyncDate: Date?

    // MARK: Initialization

    public init(cloudKit: CloudKitManager, store: ThoughtStore) {
        self.cloudKit = cloudKit
        self.store = store
        self.serverChangeToken = Self.loadChangeToken(key: changeTokenKey)
    }

    // MARK: Sync Orchestration

    /// Run a full sync cycle: push local changes, then pull remote changes.
    public func sync() async throws {
        guard !isSyncing else {
            logger.info("Sync already in progress, skipping")
            return
        }

        isSyncing = true
        defer { isSyncing = false }

        // Ensure zone exists (idempotent)
        do {
            try await cloudKit.createZoneIfNeeded()
        } catch {
            logger.error("Zone setup failed: \(error.localizedDescription)")
            throw SyncError.zoneSetupFailed(error)
        }

        try await pushChanges()
        try await pullChanges()

        lastSyncDate = Date()
        logger.info("Sync completed successfully")
    }

    // MARK: Push

    /// Upload pending local changes and deletions to CloudKit.
    private func pushChanges() async throws {
        let zoneID = cloudKit.zoneID

        // Push pending saves/updates
        let pendingThoughts = try await store.fetchPendingSync()
        if !pendingThoughts.isEmpty {
            var recordsToSave: [CKRecord] = []
            for thought in pendingThoughts {
                let record = await cloudKit.record(from: thought)
                recordsToSave.append(record)
            }

            do {
                let (saveResults, _) = try await cloudKit.privateDatabase.modifyRecords(
                    saving: recordsToSave,
                    deleting: [],
                    savePolicy: .changedKeys
                )

                // Mark successfully saved records as synced
                for (recordID, result) in saveResults {
                    if case .success = result {
                        if let thought = pendingThoughts.first(where: {
                            $0.cloudKitRecordID == recordID.recordName
                        }), let id = thought.id {
                            try await store.markSynced(id: id)
                        }
                    }
                }
            } catch {
                if Self.isNetworkOrAuthError(error) {
                    logger.warning("Push skipped (network/auth): \(error.localizedDescription)")
                    return
                }
                logger.error("Push failed: \(error.localizedDescription)")
                throw SyncError.pushFailed(error)
            }
        }

        // Push pending deletions
        let pendingDeletions = try await store.fetchPendingDeletions()
        if !pendingDeletions.isEmpty {
            let recordIDsToDelete = pendingDeletions.compactMap { thought -> CKRecord.ID? in
                CKRecord.ID(recordName: thought.cloudKitRecordID, zoneID: zoneID)
            }

            do {
                let (_, deleteResults) = try await cloudKit.privateDatabase.modifyRecords(
                    saving: [],
                    deleting: recordIDsToDelete,
                    savePolicy: .changedKeys
                )

                // Permanently remove successfully deleted records from local DB
                for (recordID, result) in deleteResults {
                    if case .success = result {
                        if let thought = pendingDeletions.first(where: {
                            $0.cloudKitRecordID == recordID.recordName
                        }), let id = thought.id {
                            try await store.deletePermanently(id: id)
                        }
                    }
                }
            } catch {
                if Self.isNetworkOrAuthError(error) {
                    logger.warning("Delete push skipped (network/auth): \(error.localizedDescription)")
                    return
                }
                logger.error("Delete push failed: \(error.localizedDescription)")
                throw SyncError.pushFailed(error)
            }
        }
    }

    // MARK: Pull

    /// Fetch remote changes from CloudKit using incremental change tokens.
    private func pullChanges() async throws {
        let zoneID = cloudKit.zoneID

        do {
            let changes = try await cloudKit.privateDatabase.recordZoneChanges(
                inZoneWith: zoneID,
                since: serverChangeToken
            )

            // Process changed records
            for modification in changes.modificationResultsByID {
                let (_, result) = modification
                switch result {
                case .success(let modResult):
                    let record = modResult.record
                    let remoteData = await cloudKit.thoughtValues(from: record)

                    // Look up existing local thought
                    let localThought = try await store.fetchByCloudKitRecordID(remoteData.cloudKitRecordID)

                    if let local = localThought {
                        // Conflict resolution: last-write-wins
                        if local.syncStatus == .pending && local.modifiedAt > remoteData.modifiedAt {
                            // Local is newer with pending changes — skip, will push next cycle
                            logger.debug("Skipping remote update for \(remoteData.cloudKitRecordID) — local is newer")
                            continue
                        }
                        // Remote is newer OR local is synced — accept remote
                        try await store.upsertFromCloud(remoteData)
                    } else {
                        // New record from another device
                        try await store.upsertFromCloud(remoteData)
                    }
                case .failure(let error):
                    logger.warning("Failed to process record change: \(error.localizedDescription)")
                }
            }

            // Process deletions
            for deletion in changes.deletions {
                let recordID = deletion.recordID
                if let localThought = try await store.fetchByCloudKitRecordID(recordID.recordName),
                   let id = localThought.id {
                    try await store.deletePermanently(id: id)
                }
            }

            // Persist the new change token
            serverChangeToken = changes.changeToken
            Self.saveChangeToken(changes.changeToken, key: changeTokenKey)

        } catch {
            if Self.isNetworkOrAuthError(error) {
                logger.warning("Pull skipped (network/auth): \(error.localizedDescription)")
                return
            }
            logger.error("Pull failed: \(error.localizedDescription)")
            throw SyncError.pullFailed(error)
        }
    }

    // MARK: Change Token Persistence

    private static func loadChangeToken(key: String) -> CKServerChangeToken? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        do {
            let token = try NSKeyedUnarchiver.unarchivedObject(
                ofClass: CKServerChangeToken.self,
                from: data
            )
            return token
        } catch {
            return nil
        }
    }

    private static func saveChangeToken(_ token: CKServerChangeToken?, key: String) {
        guard let token else {
            UserDefaults.standard.removeObject(forKey: key)
            return
        }
        do {
            let data = try NSKeyedArchiver.archivedData(
                withRootObject: token,
                requiringSecureCoding: true
            )
            UserDefaults.standard.set(data, forKey: key)
        } catch {
            // Silently fail — token will be reloaded from scratch next sync
        }
    }

    // MARK: Error Classification

    private static func isNetworkOrAuthError(_ error: Error) -> Bool {
        guard let ckError = error as? CKError else { return false }
        switch ckError.code {
        case .notAuthenticated, .networkUnavailable, .networkFailure:
            return true
        default:
            return false
        }
    }
}
