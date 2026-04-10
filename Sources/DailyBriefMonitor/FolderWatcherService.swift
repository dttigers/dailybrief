import Foundation
import JarvisCore

// MARK: - FolderWatcherService

/// Actor-isolated service that monitors directories using DispatchSource
/// (no polling) and processes new image/audio files headlessly through
/// the existing Vigil Core pipeline.
///
/// - Images are routed through `APIImageDescriptionService.processPhoto(preview:false)`.
/// - Audio files are transcribed locally via `TranscriptionService.transcribe(audioURL:)`
///   then captured via `CaptureService.capture(_:source:.voice)`.
/// - Successfully processed files are moved to a `done/` subfolder (or deleted
///   if `autoDeleteAfterProcessing` is true).
/// - Failed files remain in place and are tracked in `failedFiles`.
/// - Files already inside a `done/` subfolder are never re-processed.
public actor FolderWatcherService {

    // MARK: - Internal types

    /// Classifies a URL as audio or image for routing.
    enum FileKind { case audio, image }

    // MARK: - Accepted extensions (D-07)

    static let imageExtensions: Set<String> = ["jpg", "jpeg", "png", "heic", "tiff", "bmp"]
    static let audioExtensions: Set<String> = ["wav", "m4a", "mp3", "caf"]

    // MARK: - Dependencies

    private let imageService: APIImageDescriptionService
    private let transcriptionService: TranscriptionService
    private let captureService: CaptureService
    private let triageService: (any TriageProviding)?
    private let thoughtStore: (any ThoughtRepository)?
    private let config: AppConfig.FolderWatchingConfig

    // MARK: - DispatchSource state

    private let watcherQueue = DispatchQueue(label: "com.vigil.folderwatcher")
    private var watchedSources: [(source: DispatchSourceFileSystemObject, fd: Int32)] = []

    // MARK: - Processing state

    /// Tracks file names (not full paths) already queued/processed to avoid
    /// duplicate processing on repeated VNODE_WRITE events.
    private var knownFiles: Set<String> = []

    /// FIFO queue for sequential processing (D-08 — one file at a time).
    private var pendingQueue: [URL] = []

    /// Reference to the currently-running drain task (nil when idle).
    private var processingTask: Task<Void, Never>?

    // MARK: - Failure tracking (WATCH-06)

    private var _failedFiles: [(url: URL, reason: String)] = []

    // MARK: - Init

    public init(
        imageService: APIImageDescriptionService,
        transcriptionService: TranscriptionService,
        captureService: CaptureService,
        triageService: (any TriageProviding)? = nil,
        thoughtStore: (any ThoughtRepository)? = nil,
        config: AppConfig.FolderWatchingConfig
    ) {
        self.imageService = imageService
        self.transcriptionService = transcriptionService
        self.captureService = captureService
        self.triageService = triageService
        self.thoughtStore = thoughtStore
        self.config = config
    }

    // MARK: - Public interface for menu bar observation (WATCH-06)

    public var failedFiles: [(url: URL, reason: String)] {
        _failedFiles
    }

    public var hasFailures: Bool {
        !_failedFiles.isEmpty
    }

    public var failureCount: Int {
        _failedFiles.count
    }

    // MARK: - Lifecycle

    /// Starts directory watching. If `AppConfig.FolderWatchingConfig.enabled` is false this is a no-op.
    public func start() {
        guard config.enabled else {
            NSLog("FolderWatcherService: folder watching is disabled in config, skipping start")
            return
        }

        let audioPath = (config.audioFolderPath as NSString).expandingTildeInPath
        let imagePath = (config.imageFolderPath as NSString).expandingTildeInPath

        for rawPath in [audioPath, imagePath] {
            let dirURL = URL(fileURLWithPath: rawPath)
            // Ensure directory and done/ subdirectory exist upfront.
            do {
                try FileManager.default.createDirectory(
                    at: dirURL,
                    withIntermediateDirectories: true,
                    attributes: nil
                )
                let doneURL = dirURL.appendingPathComponent("done")
                try FileManager.default.createDirectory(
                    at: doneURL,
                    withIntermediateDirectories: true,
                    attributes: nil
                )
            } catch {
                NSLog("FolderWatcherService: could not create directory %@: %@", rawPath, error.localizedDescription)
            }

            // Open the directory with O_EVTONLY (not O_RDONLY — O_RDONLY prevents
            // volume unmount; Pitfall 3 in the research notes).
            let fd = open(rawPath, O_EVTONLY)
            guard fd >= 0 else {
                NSLog("FolderWatcherService: open(O_EVTONLY) failed for %@", rawPath)
                continue
            }

            let source = DispatchSource.makeFileSystemObjectSource(
                fileDescriptor: fd,
                eventMask: .write,
                queue: watcherQueue
            )

            // Capture self strongly — actors are reference types with their own
            // lifecycle management. The cancel handler clears the source reference
            // which breaks the retain cycle when stop() is called.
            let capturedSelf = self
            let capturedDirURL = dirURL
            source.setEventHandler {
                // Bridge from DispatchQueue callback thread to actor isolation (Pitfall 4).
                Task { await capturedSelf.handleDirectoryChange(capturedDirURL) }
            }

            // Close fd when the source is cancelled to prevent fd leaks (Pitfall 3).
            source.setCancelHandler { close(fd) }

            source.resume()
            watchedSources.append((source: source, fd: fd))
        }

        NSLog("FolderWatcherService: watching %@ and %@", audioPath, imagePath)

        // Initial scan to pick up files dropped while the app was not running.
        handleDirectoryChange(URL(fileURLWithPath: audioPath))
        handleDirectoryChange(URL(fileURLWithPath: imagePath))
    }

    /// Stops all directory watchers and cancels in-progress processing.
    public func stop() {
        for (source, _) in watchedSources {
            source.cancel()
        }
        watchedSources.removeAll()
        processingTask?.cancel()
        processingTask = nil
    }

    // MARK: - File classification (D-07)

    /// Classifies a URL by file extension. Returns nil for unrecognised types
    /// (they are silently ignored per D-07).
    static func classify(_ url: URL) -> FileKind? {
        let ext = url.pathExtension.lowercased()
        if imageExtensions.contains(ext) { return .image }
        if audioExtensions.contains(ext) { return .audio }
        return nil
    }

    // MARK: - Directory scan

    /// Scans a directory for files that haven't been seen yet, excluding `done/`
    /// subfolders. Exposed as a static function so tests can exercise filtering
    /// logic without needing a running service.
    static func scanForNewFiles(in directoryURL: URL, excluding knownFiles: Set<String>) -> [URL] {
        guard let contents = try? FileManager.default.contentsOfDirectory(
            at: directoryURL,
            includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey],
            options: [.skipsHiddenFiles]
        ) else {
            return []
        }

        return contents.filter { url in
            // Exclude anything inside a done/ subfolder (Pitfall 1 — prevents
            // re-processing of moved files).
            guard !url.pathComponents.contains("done") else { return false }

            // T-61-03 threat mitigation: skip symlinks.
            let isSymlink = (try? url.resourceValues(forKeys: [.isSymbolicLinkKey]))?.isSymbolicLink == true
            guard !isSymlink else { return false }

            // Only regular files.
            let isRegular = (try? url.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true
            guard isRegular else { return false }

            // D-07: only accepted extensions.
            guard classify(url) != nil else { return false }

            // Skip already-known files to avoid duplicates on repeated VNODE events.
            return !knownFiles.contains(url.lastPathComponent)
        }
    }

    private func handleDirectoryChange(_ directoryURL: URL) {
        // Auto-clear stale failure entries (D-03): remove any entries whose
        // file no longer exists on disk.
        _failedFiles.removeAll { entry in
            !FileManager.default.fileExists(atPath: entry.url.path)
        }

        let newFiles = Self.scanForNewFiles(in: directoryURL, excluding: knownFiles)
        for url in newFiles {
            knownFiles.insert(url.lastPathComponent)
            pendingQueue.append(url)
        }

        // Start draining the queue if not already running.
        if !newFiles.isEmpty && (processingTask == nil || processingTask!.isCancelled) {
            startProcessingLoop()
        }
    }

    // MARK: - Sequential FIFO processing loop (D-08)

    private func startProcessingLoop() {
        // Task inherits actor isolation — no weak/strong capture needed.
        processingTask = Task {
            while !self.pendingQueue.isEmpty {
                let url = self.pendingQueue.removeFirst()
                await self.processFile(url)
            }
            self.processingTask = nil
        }
    }

    // MARK: - Wait-for-stable debounce (D-06)

    /// Polls the file size at 1-second intervals until it stabilises (two
    /// consecutive reads return the same non-zero size). Returns `true` if the
    /// file is ready to process, `false` if it disappeared during polling.
    /// Times out after 30 seconds to avoid an infinite wait on large files.
    private func waitForStable(_ url: URL) async -> Bool {
        var previousSize: Int = -1
        var stableCount = 0
        for _ in 0..<30 {
            guard FileManager.default.fileExists(atPath: url.path) else {
                // File disappeared — user moved or deleted it.
                return false
            }
            guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
                  let size = attrs[.size] as? Int else {
                return false
            }
            if size > 0 && size == previousSize {
                stableCount += 1
                if stableCount >= 2 { return true }
            } else {
                stableCount = 0
            }
            previousSize = size
            try? await Task.sleep(nanoseconds: 1_000_000_000)
        }
        // After 30 iterations treat as stable (still exists at this point).
        return FileManager.default.fileExists(atPath: url.path)
    }

    // MARK: - Per-file processing

    private func processFile(_ url: URL) async {
        // Wait until the file is fully written before touching it.
        let stable = await waitForStable(url)
        guard stable else {
            // File disappeared during the stability wait — remove from known set.
            knownFiles.remove(url.lastPathComponent)
            return
        }

        // Verify file still exists (may have been moved by the user between queue
        // entry and processing start).
        guard FileManager.default.fileExists(atPath: url.path) else {
            knownFiles.remove(url.lastPathComponent)
            return
        }

        guard let kind = Self.classify(url) else {
            // Extension not in accepted set — silently ignore (D-07).
            return
        }

        do {
            switch kind {
            case .image:
                // Use the URL-based convenience overload — it handles Data reading,
                // mediaType detection, and prepareImage compression internally.
                // preview: false → headless commit (D-09)
                // forcePaperType: nil → backend auto-coerces low-confidence (D-10)
                let response = try await imageService.processPhoto(
                    imageURL: url,
                    preview: false,
                    forcePaperType: nil
                )

                // Auto-triage each created thought so it gets categorized immediately
                await triageThoughts(response.thoughts)

            case .audio:
                let text = try await transcriptionService.transcribe(audioURL: url)
                let thought = try await captureService.capture(text, source: .voice)

                // Auto-triage the captured thought
                await triageThought(id: thought.id!, content: text)
            }

            // Success path: move to done/ or delete per config.
            try postProcess(url)

            // D-03 auto-clear: after success scan and remove stale failure entries.
            _failedFiles.removeAll { entry in
                !FileManager.default.fileExists(atPath: entry.url.path)
            }

        } catch {
            let reason = mapErrorReason(error)
            NSLog(
                "FolderWatcherService: failed to process %@: %@",
                url.lastPathComponent,
                error.localizedDescription
            )
            // Track failure for menu bar surfacing (WATCH-06).
            _failedFiles.append((url: url, reason: reason))
        }
    }

    // MARK: - Post-processing (D-04, D-05)

    /// Moves the processed file to `done/` or deletes it, depending on config.
    /// Also removes the file from `knownFiles` so future drops of the same name
    /// are treated as new files.
    func moveToProcessed(_ url: URL, autoDelete: Bool) throws {
        if autoDelete {
            try FileManager.default.removeItem(at: url)
        } else {
            let doneDir = url.deletingLastPathComponent().appendingPathComponent("done")
            try FileManager.default.createDirectory(
                at: doneDir,
                withIntermediateDirectories: true,
                attributes: nil
            )

            var destination = doneDir.appendingPathComponent(url.lastPathComponent)

            // D-05: handle name collisions by appending a counter.
            if FileManager.default.fileExists(atPath: destination.path) {
                let base = (url.lastPathComponent as NSString).deletingPathExtension
                let ext = url.pathExtension
                var counter = 2
                repeat {
                    let newName = ext.isEmpty ? "\(base)-\(counter)" : "\(base)-\(counter).\(ext)"
                    destination = doneDir.appendingPathComponent(newName)
                    counter += 1
                } while FileManager.default.fileExists(atPath: destination.path)
            }

            try FileManager.default.moveItem(at: url, to: destination)
        }

        // Remove from known set so the same filename can be processed again in future.
        knownFiles.remove(url.lastPathComponent)

        // D-03: also remove from failure list if it was there.
        _failedFiles.removeAll { $0.url == url }
    }

    private func postProcess(_ url: URL) throws {
        try moveToProcessed(url, autoDelete: config.autoDeleteAfterProcessing)
    }

    // MARK: - Auto-triage

    /// Triages a list of photo-created thoughts (from ProcessedPhotoResponse).
    private func triageThoughts(_ thoughts: [PreviewThought]) async {
        guard let triageService, let thoughtStore else { return }
        for thought in thoughts {
            guard let id = thought.id else { continue }
            await triageThought(id: id, content: thought.content)
        }
    }

    /// Triages a single thought by ID and content, updating its category in the store.
    private func triageThought(id: Int64, content: String) async {
        guard let triageService, let thoughtStore else { return }
        do {
            let result = try await triageService.triage(content)
            if var t = try await thoughtStore.fetch(id: id) {
                t.category = result.category
                t.confidence = result.confidence
                if result.category == .task {
                    t.taskStatus = .open
                }
                _ = try await thoughtStore.update(t)
            }
        } catch {
            // Triage failure is non-fatal — thought was already saved uncategorized
            NSLog("FolderWatcherService: triage failed for thought %lld: %@", id, error.localizedDescription)
        }
    }

    // MARK: - Error reason mapping

    private func mapErrorReason(_ error: Error) -> String {
        if let photoError = error as? ProcessPhotoError {
            switch photoError {
            case .httpStatus(let status):
                return "API error (HTTP \(status))"
            case .transport:
                return "Network error"
            case .unsupportedMediaType:
                return "Unsupported media type"
            }
        }
        if let transcriptionError = error as? TranscriptionError {
            switch transcriptionError {
            case .notAvailable:
                return "Speech recognition unavailable"
            case .notAuthorized:
                return "Speech recognition not authorized"
            case .transcriptionFailed(let reason):
                return String(reason.prefix(80))
            case .emptyResult:
                return "Transcription produced no text"
            }
        }
        let description = error.localizedDescription
        return String(description.prefix(80))
    }
}
