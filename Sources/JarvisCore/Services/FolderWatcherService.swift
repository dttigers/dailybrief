import AppKit
import Foundation

// MARK: - FolderWatcherService

/// Monitors configured folders for new audio/image files and processes them into captured thoughts.
///
/// Uses DispatchSource file system monitoring to watch directories for changes.
/// When new files appear, they are transcribed (audio) or described (images) and
/// captured as thoughts. A JSON manifest tracks processed files to prevent duplicates.
public actor FolderWatcherService {

    // MARK: - Types

    private enum FolderType {
        case audio
        case image
    }

    private struct WatchedFolder {
        let path: String
        let type: FolderType
        let fileDescriptor: Int32
        let source: DispatchSourceFileSystemObject
    }

    // MARK: - Properties

    private let transcriptionService: TranscriptionService
    private let imageDescriptionService: ImageDescriptionService?
    private let captureService: CaptureService
    private let triageService: TriageService?
    private let therapyClassificationService: TherapyClassificationService?
    private let thoughtStore: ThoughtStore
    private let config: AppConfig.FolderWatchingConfig

    private var processedFiles: Set<String> = []
    private var watchedFolders: [WatchedFolder] = []
    private var debounceWorkItems: [String: DispatchWorkItem] = [:]
    private var isRunning = false

    private static let audioExtensions: Set<String> = ["wav", "mp3", "m4a", "aiff"]
    private static let imageExtensions: Set<String> = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "tiff", "tif", "bmp"]
    private static var manifestURL: URL {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let jarvisDir = appSupport.appendingPathComponent("Jarvis")
        return jarvisDir.appendingPathComponent("processed-files.json")
    }

    // MARK: - Initialization

    /// Creates a FolderWatcherService with the required dependencies.
    ///
    /// - Parameters:
    ///   - transcriptionService: Service for transcribing audio files.
    ///   - imageDescriptionService: Optional service for describing images (nil if AI key unavailable).
    ///   - captureService: Service for persisting captured thoughts.
    ///   - triageService: Optional service for categorizing captured thoughts.
    ///   - config: Folder watching configuration (paths and enabled flag).
    public init(
        transcriptionService: TranscriptionService,
        imageDescriptionService: ImageDescriptionService?,
        captureService: CaptureService,
        triageService: TriageService?,
        therapyClassificationService: TherapyClassificationService? = nil,
        thoughtStore: ThoughtStore,
        config: AppConfig.FolderWatchingConfig
    ) {
        self.transcriptionService = transcriptionService
        self.imageDescriptionService = imageDescriptionService
        self.captureService = captureService
        self.triageService = triageService
        self.therapyClassificationService = therapyClassificationService
        self.thoughtStore = thoughtStore
        self.config = config
        self.processedFiles = Self.loadManifest()
    }

    // MARK: - Public Methods

    /// Starts watching configured folders for new files.
    ///
    /// Creates directories if they don't exist, sets up DispatchSource monitors,
    /// and performs an initial scan of each folder.
    public func start() {
        guard config.enabled, !isRunning else { return }
        isRunning = true

        let folders: [(String, FolderType)] = [
            (config.audioFolderPath, .audio),
            (config.imageFolderPath, .image)
        ]

        for (rawPath, type) in folders {
            let path = (rawPath as NSString).expandingTildeInPath
            let fm = FileManager.default

            // Create directory if missing
            if !fm.fileExists(atPath: path) {
                do {
                    try fm.createDirectory(atPath: path, withIntermediateDirectories: true)
                    NSLog("FolderWatcherService: Created directory %@", path)
                } catch {
                    NSLog("FolderWatcherService: Failed to create directory %@: %@", path, error.localizedDescription)
                    continue
                }
            }

            // Open file descriptor for monitoring
            let fd = open(path, O_EVTONLY)
            guard fd >= 0 else {
                NSLog("FolderWatcherService: Failed to open directory for monitoring: %@", path)
                continue
            }

            let source = DispatchSource.makeFileSystemObjectSource(
                fileDescriptor: fd,
                eventMask: .write,
                queue: DispatchQueue.global(qos: .utility)
            )

            let watchedPath = path
            let watchedType = type
            source.setEventHandler { [weak self = self] in
                guard let self else { return }
                Task {
                    await self.handleFolderEvent(path: watchedPath, type: watchedType)
                }
            }

            source.setCancelHandler {
                close(fd)
            }

            source.resume()

            let watched = WatchedFolder(path: path, type: type, fileDescriptor: fd, source: source)
            watchedFolders.append(watched)

            NSLog("FolderWatcherService: Watching %@ for %@ files", path, type == .audio ? "audio" : "image")

            // Initial scan
            Task {
                await self.scanFolder(path: watchedPath, type: watchedType)
            }
        }
    }

    /// Stops watching all folders and cleans up resources.
    public func stop() {
        guard isRunning else { return }
        isRunning = false

        for item in debounceWorkItems.values {
            item.cancel()
        }
        debounceWorkItems.removeAll()

        for folder in watchedFolders {
            folder.source.cancel()
        }
        watchedFolders.removeAll()

        NSLog("FolderWatcherService: Stopped watching all folders")
    }

    // MARK: - Private Methods

    /// Handles a folder change event with debouncing.
    private func handleFolderEvent(path: String, type: FolderType) {
        // Cancel any existing debounce for this path
        debounceWorkItems[path]?.cancel()

        let workItem = DispatchWorkItem { [weak self = self] in
            guard let self else { return }
            Task {
                await self.scanFolder(path: path, type: type)
            }
        }

        debounceWorkItems[path] = workItem
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 0.5, execute: workItem)
    }

    /// Scans a folder for new files and processes them.
    private func scanFolder(path: String, type: FolderType) async {
        let fm = FileManager.default

        let contents: [String]
        do {
            contents = try fm.contentsOfDirectory(atPath: path)
        } catch {
            NSLog("FolderWatcherService: Failed to list directory %@: %@", path, error.localizedDescription)
            return
        }

        let validExtensions: Set<String> = type == .audio ? Self.audioExtensions : Self.imageExtensions

        let newFiles = contents.filter { filename in
            let ext = (filename as NSString).pathExtension.lowercased()
            guard validExtensions.contains(ext) else { return false }
            if processedFiles.contains(filename) {
                NSLog("[FolderWatcher] Skipping already-processed: %@", filename)
                return false
            }
            return true
        }

        for filename in newFiles {
            NSLog("[FolderWatcher] New file detected: %@", filename)
            let fullPath = (path as NSString).appendingPathComponent(filename)
            let fileURL = URL(fileURLWithPath: fullPath)

            do {
                switch type {
                case .audio:
                    try await processAudioFile(url: fileURL, filename: filename)
                    NSLog("[FolderWatcher] Audio processed: %@ → thought created", filename)
                case .image:
                    try await processImageFile(url: fileURL, filename: filename)
                    NSLog("[FolderWatcher] Image processed: %@ → thought created", filename)
                }

                processedFiles.insert(filename)
                Self.saveManifest(processedFiles)

                if config.autoDeleteAfterProcessing {
                    do {
                        try FileManager.default.removeItem(atPath: fullPath)
                        NSLog("[FolderWatcher] Auto-deleted: %@", filename)
                    } catch {
                        NSLog("[FolderWatcher] Failed to auto-delete %@: %@", filename, error.localizedDescription)
                    }
                } else {
                    NSLog("[FolderWatcher] Auto-delete disabled, keeping: %@", filename)
                }
            } catch {
                NSLog("[FolderWatcher] Failed to process %@: %@", filename, error.localizedDescription)
                // Skip file — will retry on next scan
            }
        }
    }

    /// Transcribes an audio file and captures it as a voice thought.
    private func processAudioFile(url: URL, filename: String) async throws {
        let text = try await transcriptionService.transcribe(audioURL: url)
        let thought = try await captureService.capture(text, source: .voice)

        if let triageService, thought.id != nil {
            do {
                let result = try await triageService.triage(text)
                if var t = try await thoughtStore.fetch(id: thought.id!) {
                    t.category = result.category
                    t.confidence = result.confidence
                    _ = try await thoughtStore.update(t)

                    // Auto-classify therapy thoughts after triage
                    if result.category == .therapy, let therapyClassificationService {
                        do {
                            let classResult = try await therapyClassificationService.classify(text)
                            if var updated = try await thoughtStore.fetch(id: thought.id!) {
                                updated.therapyClassification = classResult.classification
                                _ = try await thoughtStore.update(updated)
                            }
                            NSLog("[FolderWatcher] Therapy classification: %@ (%.0f%%)", classResult.classification.rawValue, classResult.confidence * 100)
                        } catch {
                            NSLog("[FolderWatcher] Therapy classification failed for %@: %@", filename, error.localizedDescription)
                            // Non-fatal — thought is still captured and triaged
                        }
                    }
                }
                NSLog("[FolderWatcher] Triage result: %@ (%.0f%% confidence)", result.category.rawValue, result.confidence * 100)
            } catch {
                NSLog("[FolderWatcher] Triage failed for %@: %@", filename, error.localizedDescription)
                // Non-fatal — thought is still captured
            }
        }
    }

    /// Describes an image file and captures it as an image thought.
    /// Converts non-native formats (HEIC, TIFF, BMP) to JPEG before sending to the API.
    private func processImageFile(url: URL, filename: String) async throws {
        guard let imageDescriptionService else {
            NSLog("FolderWatcherService: No image description service available, skipping %@", filename)
            return
        }

        let description: String
        if ImageConversion.needsConversion(url) {
            let jpegData = try ImageConversion.convertToJPEG(from: url)
            let ext = url.pathExtension.lowercased()
            NSLog("FolderWatcherService: Converted %@ from %@ to JPEG (%d bytes)", filename, ext, jpegData.count)
            description = try await imageDescriptionService.describe(imageData: jpegData, mediaType: .jpeg)
        } else {
            description = try await imageDescriptionService.describe(imageURL: url)
        }
        let thought = try await captureService.capture(description, source: .image)

        if let triageService, thought.id != nil {
            do {
                let result = try await triageService.triage(description)
                if var t = try await thoughtStore.fetch(id: thought.id!) {
                    t.category = result.category
                    t.confidence = result.confidence
                    _ = try await thoughtStore.update(t)

                    // Auto-classify therapy thoughts after triage
                    if result.category == .therapy, let therapyClassificationService {
                        do {
                            let classResult = try await therapyClassificationService.classify(description)
                            if var updated = try await thoughtStore.fetch(id: thought.id!) {
                                updated.therapyClassification = classResult.classification
                                _ = try await thoughtStore.update(updated)
                            }
                            NSLog("[FolderWatcher] Therapy classification: %@ (%.0f%%)", classResult.classification.rawValue, classResult.confidence * 100)
                        } catch {
                            NSLog("[FolderWatcher] Therapy classification failed for %@: %@", filename, error.localizedDescription)
                            // Non-fatal — thought is still captured and triaged
                        }
                    }
                }
                NSLog("[FolderWatcher] Triage result: %@ (%.0f%% confidence)", result.category.rawValue, result.confidence * 100)
            } catch {
                NSLog("[FolderWatcher] Triage failed for %@: %@", filename, error.localizedDescription)
                // Non-fatal — thought is still captured
            }
        }
    }

    // MARK: - Manifest Persistence

    /// Loads the processed files manifest from disk.
    private static func loadManifest() -> Set<String> {
        let url = manifestURL
        guard FileManager.default.fileExists(atPath: url.path) else {
            return []
        }

        do {
            let data = try Data(contentsOf: url)
            let filenames = try JSONDecoder().decode([String].self, from: data)
            return Set(filenames)
        } catch {
            NSLog("FolderWatcherService: Failed to load manifest: %@", error.localizedDescription)
            return []
        }
    }

    /// Saves the processed files manifest to disk.
    private static func saveManifest(_ files: Set<String>) {
        let url = manifestURL
        let directory = url.deletingLastPathComponent()

        do {
            let fm = FileManager.default
            if !fm.fileExists(atPath: directory.path) {
                try fm.createDirectory(at: directory, withIntermediateDirectories: true)
            }

            let data = try JSONEncoder().encode(Array(files).sorted())
            try data.write(to: url, options: .atomic)
        } catch {
            NSLog("FolderWatcherService: Failed to save manifest: %@", error.localizedDescription)
        }
    }
}
