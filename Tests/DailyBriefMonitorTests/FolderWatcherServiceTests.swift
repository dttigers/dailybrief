import XCTest
@testable import DailyBriefMonitor
@testable import JarvisCore

// MARK: - FolderWatcherServiceTests
//
// Unit tests for the pure/static helpers in FolderWatcherService that can be
// exercised without running the real DispatchSource or hitting the network.
//
// Because FolderWatcherService takes concrete actor dependencies
// (APIImageDescriptionService, TranscriptionService, CaptureService) that
// require real network/speech-recognizer infrastructure, we test:
//   1. File classification (static func classify)
//   2. Done-directory exclusion (static func scanForNewFiles)
//   3. Move-to-done with collision counter (func moveToProcessed)

final class FolderWatcherServiceTests: XCTestCase {

    // MARK: - 1. File classification

    func test_classify_jpg_returns_image() {
        let url = URL(fileURLWithPath: "/tmp/photo.jpg")
        XCTAssertEqual(FolderWatcherService.classify(url), .image)
    }

    func test_classify_jpeg_returns_image() {
        let url = URL(fileURLWithPath: "/tmp/photo.jpeg")
        XCTAssertEqual(FolderWatcherService.classify(url), .image)
    }

    func test_classify_heic_returns_image() {
        let url = URL(fileURLWithPath: "/tmp/photo.heic")
        XCTAssertEqual(FolderWatcherService.classify(url), .image)
    }

    func test_classify_png_returns_image() {
        let url = URL(fileURLWithPath: "/tmp/photo.png")
        XCTAssertEqual(FolderWatcherService.classify(url), .image)
    }

    func test_classify_wav_returns_audio() {
        let url = URL(fileURLWithPath: "/tmp/recording.wav")
        XCTAssertEqual(FolderWatcherService.classify(url), .audio)
    }

    func test_classify_m4a_returns_audio() {
        let url = URL(fileURLWithPath: "/tmp/voice.m4a")
        XCTAssertEqual(FolderWatcherService.classify(url), .audio)
    }

    func test_classify_txt_returns_nil() {
        let url = URL(fileURLWithPath: "/tmp/notes.txt")
        XCTAssertNil(FolderWatcherService.classify(url))
    }

    func test_classify_pdf_returns_nil() {
        let url = URL(fileURLWithPath: "/tmp/document.pdf")
        XCTAssertNil(FolderWatcherService.classify(url))
    }

    // MARK: - 2. Done-directory exclusion (uses real temp directory)

    func test_scanExcludesDoneSubfolder() throws {
        let tmpDir = try makeTempDirectory()
        defer { try? FileManager.default.removeItem(at: tmpDir) }

        // Create a file in the root watched dir and one inside done/.
        let newPhoto = tmpDir.appendingPathComponent("new.jpg")
        let doneDir = tmpDir.appendingPathComponent("done")
        try FileManager.default.createDirectory(at: doneDir, withIntermediateDirectories: true)
        let donePhoto = doneDir.appendingPathComponent("old.jpg")

        FileManager.default.createFile(atPath: newPhoto.path, contents: Data([0xFF, 0xD8]))
        FileManager.default.createFile(atPath: donePhoto.path, contents: Data([0xFF, 0xD8]))

        let found = FolderWatcherService.scanForNewFiles(in: tmpDir, excluding: [])

        XCTAssertEqual(found.count, 1)
        XCTAssertEqual(found.first?.lastPathComponent, "new.jpg")
    }

    func test_scanIgnoresUnsupportedExtensions() throws {
        let tmpDir = try makeTempDirectory()
        defer { try? FileManager.default.removeItem(at: tmpDir) }

        let txtFile = tmpDir.appendingPathComponent("notes.txt")
        let jpgFile = tmpDir.appendingPathComponent("photo.jpg")
        FileManager.default.createFile(atPath: txtFile.path, contents: Data())
        FileManager.default.createFile(atPath: jpgFile.path, contents: Data([0xFF, 0xD8]))

        let found = FolderWatcherService.scanForNewFiles(in: tmpDir, excluding: [])

        // Only the jpg should be returned; .txt is not in the accepted extensions.
        XCTAssertEqual(found.count, 1)
        XCTAssertEqual(found.first?.lastPathComponent, "photo.jpg")
    }

    func test_scanExcludesKnownFiles() throws {
        let tmpDir = try makeTempDirectory()
        defer { try? FileManager.default.removeItem(at: tmpDir) }

        let photoA = tmpDir.appendingPathComponent("a.jpg")
        let photoB = tmpDir.appendingPathComponent("b.jpg")
        FileManager.default.createFile(atPath: photoA.path, contents: Data([0xFF, 0xD8]))
        FileManager.default.createFile(atPath: photoB.path, contents: Data([0xFF, 0xD8]))

        // Tell the scanner we already know about a.jpg.
        let found = FolderWatcherService.scanForNewFiles(in: tmpDir, excluding: ["a.jpg"])

        XCTAssertEqual(found.count, 1)
        XCTAssertEqual(found.first?.lastPathComponent, "b.jpg")
    }

    // MARK: - 3. Move-to-done with collision counter (uses real temp directory)

    func test_moveToDone_createsSubfolder() async throws {
        let tmpDir = try makeTempDirectory()
        defer { try? FileManager.default.removeItem(at: tmpDir) }

        let photo = tmpDir.appendingPathComponent("photo.jpg")
        FileManager.default.createFile(atPath: photo.path, contents: Data([0xFF, 0xD8]))

        let service = makeService()
        try await service.moveToProcessed(photo, autoDelete: false)

        let donePhoto = tmpDir.appendingPathComponent("done").appendingPathComponent("photo.jpg")
        XCTAssertTrue(FileManager.default.fileExists(atPath: donePhoto.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: photo.path))
    }

    func test_moveToDone_appendsCounter_onCollision() async throws {
        let tmpDir = try makeTempDirectory()
        defer { try? FileManager.default.removeItem(at: tmpDir) }

        // Pre-create done/photo.jpg to force a collision.
        let doneDir = tmpDir.appendingPathComponent("done")
        try FileManager.default.createDirectory(at: doneDir, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: doneDir.appendingPathComponent("photo.jpg").path, contents: Data())

        // Drop a new photo.jpg to move.
        let photo = tmpDir.appendingPathComponent("photo.jpg")
        FileManager.default.createFile(atPath: photo.path, contents: Data([0xFF, 0xD8]))

        let service = makeService()
        try await service.moveToProcessed(photo, autoDelete: false)

        let collisionDest = doneDir.appendingPathComponent("photo-2.jpg")
        XCTAssertTrue(FileManager.default.fileExists(atPath: collisionDest.path))
    }

    func test_moveToDone_incrementsCounter() async throws {
        let tmpDir = try makeTempDirectory()
        defer { try? FileManager.default.removeItem(at: tmpDir) }

        // Pre-create done/photo.jpg AND done/photo-2.jpg.
        let doneDir = tmpDir.appendingPathComponent("done")
        try FileManager.default.createDirectory(at: doneDir, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: doneDir.appendingPathComponent("photo.jpg").path, contents: Data())
        FileManager.default.createFile(atPath: doneDir.appendingPathComponent("photo-2.jpg").path, contents: Data())

        let photo = tmpDir.appendingPathComponent("photo.jpg")
        FileManager.default.createFile(atPath: photo.path, contents: Data([0xFF, 0xD8]))

        let service = makeService()
        try await service.moveToProcessed(photo, autoDelete: false)

        let collisionDest = doneDir.appendingPathComponent("photo-3.jpg")
        XCTAssertTrue(FileManager.default.fileExists(atPath: collisionDest.path))
    }

    func test_moveAutoDelete_removesFile() async throws {
        let tmpDir = try makeTempDirectory()
        defer { try? FileManager.default.removeItem(at: tmpDir) }

        let photo = tmpDir.appendingPathComponent("photo.jpg")
        FileManager.default.createFile(atPath: photo.path, contents: Data([0xFF, 0xD8]))

        let service = makeService()
        try await service.moveToProcessed(photo, autoDelete: true)

        XCTAssertFalse(FileManager.default.fileExists(atPath: photo.path))
    }

    // MARK: - Helpers

    private func makeTempDirectory() throws -> URL {
        let tmpDir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
        return tmpDir
    }

    /// Creates a FolderWatcherService using a throwaway VigilAPIClient that
    /// points nowhere (tests never call start() so no real I/O occurs).
    private func makeService() -> FolderWatcherService {
        let client = VigilAPIClient(
            baseURL: URL(string: "http://localhost:0")!,
            apiKey: "test-key"
        )
        return FolderWatcherService(
            imageService: APIImageDescriptionService(client: client),
            transcriptionService: TranscriptionService(),
            captureService: CaptureService(store: NullThoughtRepository()),
            config: AppConfig.FolderWatchingConfig(
                enabled: true,
                audioFolderPath: "/tmp",
                imageFolderPath: "/tmp",
                autoDeleteAfterProcessing: false
            )
        )
    }
}

// MARK: - NullThoughtRepository

/// Minimal ThoughtRepository that satisfies the full protocol contract without
/// touching any real storage. Used so the test can construct a CaptureService.
///
/// ThoughtRepository inherits from Actor, so this must be declared as `actor`.
private actor NullThoughtRepository: ThoughtRepository {

    func saveThought(_ thought: Thought) async throws -> Thought { thought }

    func update(_ thought: Thought) async throws -> Thought { thought }

    func delete(id: Int64) async throws -> Bool { false }

    func fetch(id: Int64) async throws -> Thought? { nil }

    func fetchAll(category: ThoughtCategory?, limit: Int, offset: Int) async throws -> [Thought] { [] }

    func fetchFiltered(
        category: ThoughtCategory?, source: CaptureSource?, after: Date?,
        tag: String?, favoritesOnly: Bool, limit: Int, offset: Int
    ) async throws -> [Thought] { [] }

    func fetchByProject(id: Int64, limit: Int) async throws -> [Thought] { [] }

    func fetchUnassigned(limit: Int) async throws -> [Thought] { [] }

    func updateProjectId(id: Int64, projectId: Int64?) async throws {}

    func countFiltered(
        category: ThoughtCategory?, source: CaptureSource?, after: Date?,
        tag: String?, favoritesOnly: Bool
    ) async throws -> Int { 0 }

    func count(category: ThoughtCategory?) async throws -> Int { 0 }

    func search(query: String, limit: Int) async throws -> [Thought] { [] }

    func updateTaskStatus(id: Int64, status: TaskStatus) async throws -> Thought {
        Thought(content: "", source: .text)
    }

    func fetchTasks(status: TaskStatus?, limit: Int) async throws -> [Thought] { [] }

    func countTasks(status: TaskStatus?) async throws -> Int { 0 }

    func fetchTherapyThoughts(
        classification: TherapyClassification?, limit: Int, offset: Int
    ) async throws -> [Thought] { [] }

    func countTherapy(classification: TherapyClassification?) async throws -> Int { 0 }

    func countUnclassifiedTherapy() async throws -> Int { 0 }

    func fetchTherapyThoughtsByDateRange(
        from startDate: Date, to endDate: Date, classification: TherapyClassification?
    ) async throws -> [Thought] { [] }

    func fetchRecentTherapyThoughts(
        days: Int, classification: TherapyClassification?, limit: Int
    ) async throws -> [Thought] { [] }

    func bulkUpdateTherapyClassification(
        ids: Set<Int64>, classification: TherapyClassification
    ) async throws -> Int { 0 }

    func addTag(id: Int64, tag: String) async throws -> Thought? { nil }

    func removeTag(id: Int64, tag: String) async throws -> Thought? { nil }

    func fetchByTag(tag: String, limit: Int, offset: Int) async throws -> [Thought] { [] }

    func allUniqueTags() async throws -> [String] { [] }

    func bulkAddTag(ids: Set<Int64>, tag: String) async throws -> Int { 0 }

    func bulkRemoveTag(ids: Set<Int64>, tag: String) async throws -> Int { 0 }

    func toggleFavorite(id: Int64) async throws -> Thought? { nil }

    func fetchFavorites(limit: Int, offset: Int) async throws -> [Thought] { [] }

    func countFavorites() async throws -> Int { 0 }

    func linkThoughts(sourceId: Int64, targetId: Int64) async throws -> ThoughtLink? { nil }

    func unlinkThoughts(sourceId: Int64, targetId: Int64) async throws {}

    func fetchLinkedThoughts(thoughtId: Int64) async throws -> [Thought] { [] }

    func countLinks(thoughtId: Int64) async throws -> Int { 0 }

    func bulkDelete(ids: Set<Int64>) async throws -> Int { 0 }

    func bulkUpdateCategory(ids: Set<Int64>, category: ThoughtCategory) async throws -> Int { 0 }
}
