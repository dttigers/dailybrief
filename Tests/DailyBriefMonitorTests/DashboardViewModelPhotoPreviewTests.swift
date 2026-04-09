import Foundation
import XCTest
@testable import DailyBriefMonitor
@testable import JarvisCore

// MARK: - Fakes

/// Scripted fake for PhotoProcessingAPI. Responses are popped off `responses`
/// in call order; a test that exhausts the queue fails loudly. Every call is
/// recorded so tests can assert the exact sequence of preview/forcePaperType.
actor FakePhotoAPI: PhotoProcessingAPI {
    struct RecordedCall: Equatable {
        let preview: Bool
        let forcePaperType: PaperType?
    }

    private var responses: [Result<ProcessedPhotoResponse, Error>] = []
    private(set) var recordedCalls: [RecordedCall] = []

    func enqueue(_ result: Result<ProcessedPhotoResponse, Error>) {
        responses.append(result)
    }

    func calls() -> [RecordedCall] { recordedCalls }

    func processPhoto(
        imageData: Data,
        mediaType: ImageMediaType,
        preview: Bool,
        forcePaperType: PaperType?
    ) async throws -> ProcessedPhotoResponse {
        recordedCalls.append(RecordedCall(preview: preview, forcePaperType: forcePaperType))
        guard !responses.isEmpty else {
            throw NSError(domain: "FakePhotoAPI", code: 999, userInfo: [NSLocalizedDescriptionKey: "No scripted response"])
        }
        let result = responses.removeFirst()
        switch result {
        case .success(let r): return r
        case .failure(let e): throw e
        }
    }
}

/// Helper: create a ProcessedPhotoResponse for a lined/gridded preview call.
private func previewResponse(
    paperType: String,
    confidence: Double,
    thoughts contents: [String]
) -> ProcessedPhotoResponse {
    ProcessedPhotoResponse(
        paperType: paperType,
        confidence: confidence,
        thoughts: contents.map { content in
            PreviewThought(id: nil, content: content, source: "image", confidence: confidence, projectId: nil)
        }
    )
}

/// Helper: create a ProcessedPhotoResponse for a commit-mode call (id populated).
private func commitResponse(
    paperType: String,
    confidence: Double,
    thoughts contents: [String]
) -> ProcessedPhotoResponse {
    ProcessedPhotoResponse(
        paperType: paperType,
        confidence: confidence,
        thoughts: contents.enumerated().map { (i, content) in
            PreviewThought(id: Int64(100 + i), content: content, source: "image", confidence: confidence, projectId: nil)
        }
    )
}

// MARK: - Stub repositories (no-op — dashboard state machine doesn't touch them during these tests)

actor StubThoughtRepository: ThoughtRepository {
    func saveThought(_ thought: Thought) async throws -> Thought { thought }
    func update(_ thought: Thought) async throws -> Thought { thought }
    func delete(id: Int64) async throws -> Bool { false }
    func fetch(id: Int64) async throws -> Thought? { nil }
    func fetchAll(category: ThoughtCategory?, limit: Int, offset: Int) async throws -> [Thought] { [] }
    func fetchFiltered(category: ThoughtCategory?, source: CaptureSource?, after: Date?, tag: String?, favoritesOnly: Bool, limit: Int, offset: Int) async throws -> [Thought] { [] }
    func fetchByProject(id: Int64, limit: Int) async throws -> [Thought] { [] }
    func fetchUnassigned(limit: Int) async throws -> [Thought] { [] }
    func updateProjectId(id: Int64, projectId: Int64?) async throws { }
    func countFiltered(category: ThoughtCategory?, source: CaptureSource?, after: Date?, tag: String?, favoritesOnly: Bool) async throws -> Int { 0 }
    func count(category: ThoughtCategory?) async throws -> Int { 0 }
    func search(query: String, limit: Int) async throws -> [Thought] { [] }
    func updateTaskStatus(id: Int64, status: TaskStatus) async throws -> Thought {
        throw NSError(domain: "StubThoughtRepository", code: 0)
    }
    func fetchTasks(status: TaskStatus?, limit: Int) async throws -> [Thought] { [] }
    func countTasks(status: TaskStatus?) async throws -> Int { 0 }
    func fetchTherapyThoughts(classification: TherapyClassification?, limit: Int, offset: Int) async throws -> [Thought] { [] }
    func countTherapy(classification: TherapyClassification?) async throws -> Int { 0 }
    func countUnclassifiedTherapy() async throws -> Int { 0 }
    func fetchTherapyThoughtsByDateRange(from startDate: Date, to endDate: Date, classification: TherapyClassification?) async throws -> [Thought] { [] }
    func fetchRecentTherapyThoughts(days: Int, classification: TherapyClassification?, limit: Int) async throws -> [Thought] { [] }
    func bulkUpdateTherapyClassification(ids: Set<Int64>, classification: TherapyClassification) async throws -> Int { 0 }
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
    func unlinkThoughts(sourceId: Int64, targetId: Int64) async throws { }
    func fetchLinkedThoughts(thoughtId: Int64) async throws -> [Thought] { [] }
    func countLinks(thoughtId: Int64) async throws -> Int { 0 }
    func bulkDelete(ids: Set<Int64>) async throws -> Int { 0 }
    func bulkUpdateCategory(ids: Set<Int64>, category: ThoughtCategory) async throws -> Int { 0 }
}

actor StubProjectsRepository: ProjectsRepository {
    func listProjects() async throws -> [Project] { [] }
    func createProject(name: String, description: String?, status: ProjectStatus?) async throws -> Project {
        throw NSError(domain: "StubProjectsRepository", code: 0)
    }
    func updateProject(id: Int64, name: String?, description: String?, status: ProjectStatus?) async throws -> Project {
        throw NSError(domain: "StubProjectsRepository", code: 0)
    }
    func deleteProject(id: Int64) async throws { }
}

// MARK: - Tests

@MainActor
final class DashboardViewModelPhotoPreviewTests: XCTestCase {

    // Per-test scratch image file — a tiny blob that's a valid "file" for
    // Data(contentsOf:) to succeed. Content is irrelevant — the fake API
    // never inspects it.
    var tempImageURL: URL!

    override func setUp() async throws {
        try await super.setUp()
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("dbm-photo-preview-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        tempImageURL = dir.appendingPathComponent("test.jpg")
        try Data([0xFF, 0xD8, 0xFF, 0xD9]).write(to: tempImageURL)
    }

    override func tearDown() async throws {
        if let url = tempImageURL {
            try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
        }
        try await super.tearDown()
    }

    /// Build a DashboardViewModel wired to the stub repos + given photoAPI.
    /// CaptureService is non-optional in processFiles (line 667 guard) so we
    /// pass a real one backed by the stub store — it's never actually invoked
    /// by the photo branch in Phase 60 Plan 02 (the backend persists, then
    /// refresh() reads the list).
    private func makeViewModel(
        photoAPI: FakePhotoAPI,
        userDefault: PaperType = .lined
    ) -> DashboardViewModel {
        let store = StubThoughtRepository()
        return DashboardViewModel(
            store: store,
            projectsStore: StubProjectsRepository(),
            captureService: CaptureService(store: store),
            transcriptionService: nil,
            imageDescriptionService: nil,
            triageService: nil,
            insightService: nil,
            therapyClassificationService: nil,
            therapyPatternService: nil,
            therapyPrepService: nil,
            photoAPI: photoAPI,
            userDefaultPaperTypeProvider: { userDefault }
        )
    }

    // ── T1 — Analyze → Preview shown (lined, high confidence) ──────────────
    func test_T1_analyzeToPreviewShown_linedHighConfidence() async throws {
        let api = FakePhotoAPI()
        await api.enqueue(.success(previewResponse(
            paperType: "lined", confidence: 0.9,
            thoughts: ["a", "b", "c"]
        )))
        let vm = makeViewModel(photoAPI: api)

        // Fire processFiles in a background task so we can observe state mid-flight
        let processing = Task { await vm.processFiles(urls: [tempImageURL]) }
        try await waitForPreview(vm: vm)

        guard case .awaitingUserDecision(let payload) = vm.photoPreviewState else {
            return XCTFail("Expected awaitingUserDecision, got \(String(describing: vm.photoPreviewState))")
        }
        XCTAssertEqual(payload.currentForcePaperType, .lined)
        XCTAssertEqual(payload.detectedPaperType, .lined)
        XCTAssertFalse(payload.showUncertaintyBanner)
        XCTAssertEqual(payload.thoughts.count, 3)
        XCTAssertEqual(payload.thoughts, ["a", "b", "c"])

        let calls = await api.calls()
        XCTAssertEqual(calls, [.init(preview: true, forcePaperType: nil)])

        // Clean up the suspended processing task
        vm.cancelPhotoPreview()
        _ = await processing.value
    }

    // ── T2 — Preview → Commit (no override) ────────────────────────────────
    func test_T2_previewToCommit_noOverride() async throws {
        let api = FakePhotoAPI()
        await api.enqueue(.success(previewResponse(paperType: "lined", confidence: 0.9, thoughts: ["x", "y", "z"])))
        await api.enqueue(.success(commitResponse(paperType: "lined", confidence: 0.9, thoughts: ["x", "y", "z"])))
        let vm = makeViewModel(photoAPI: api)

        let processing = Task { await vm.processFiles(urls: [tempImageURL]) }
        try await waitForPreview(vm: vm)

        await vm.commitPhotoPreview()
        _ = await processing.value

        XCTAssertNil(vm.photoPreviewState)
        XCTAssertTrue(vm.importErrors.isEmpty)
        let calls = await api.calls()
        XCTAssertEqual(calls.count, 2)
        XCTAssertEqual(calls[0], .init(preview: true, forcePaperType: nil))
        XCTAssertEqual(calls[1], .init(preview: false, forcePaperType: nil))
    }

    // ── T3 — Preview → Override lined → gridded ────────────────────────────
    func test_T3_previewToOverride_linedToGridded() async throws {
        let api = FakePhotoAPI()
        await api.enqueue(.success(previewResponse(paperType: "lined", confidence: 0.9, thoughts: ["a", "b", "c"])))
        await api.enqueue(.success(previewResponse(paperType: "gridded", confidence: 0.9, thoughts: ["a\n\nb\n\nc"])))
        let vm = makeViewModel(photoAPI: api)

        let processing = Task { await vm.processFiles(urls: [tempImageURL]) }
        try await waitForPreview(vm: vm)

        await vm.overridePhotoPreview(to: .gridded)

        guard case .awaitingUserDecision(let payload) = vm.photoPreviewState else {
            return XCTFail("Expected awaitingUserDecision after override")
        }
        XCTAssertEqual(payload.currentForcePaperType, .gridded)
        XCTAssertEqual(payload.thoughts.count, 1)

        let calls = await api.calls()
        XCTAssertEqual(calls.count, 2)
        XCTAssertEqual(calls[1], .init(preview: true, forcePaperType: .gridded))

        vm.cancelPhotoPreview()
        _ = await processing.value
    }

    // ── T4 — Preview → Cancel ──────────────────────────────────────────────
    func test_T4_previewToCancel() async throws {
        let api = FakePhotoAPI()
        await api.enqueue(.success(previewResponse(paperType: "lined", confidence: 0.9, thoughts: ["a"])))
        let vm = makeViewModel(photoAPI: api)

        let processing = Task { await vm.processFiles(urls: [tempImageURL]) }
        try await waitForPreview(vm: vm)

        vm.cancelPhotoPreview()
        _ = await processing.value

        XCTAssertNil(vm.photoPreviewState)
        let calls = await api.calls()
        // Only the one preview call — no commit
        XCTAssertEqual(calls.count, 1)
        XCTAssertTrue(vm.importErrors.isEmpty)
    }

    // ── T5 — Analyze fails (502) ───────────────────────────────────────────
    func test_T5_analyzeFails_502_bannerMapping() async throws {
        let api = FakePhotoAPI()
        await api.enqueue(.failure(ProcessPhotoError.httpStatus(502)))
        let vm = makeViewModel(photoAPI: api)

        await vm.processFiles(urls: [tempImageURL])

        XCTAssertNil(vm.photoPreviewState)
        XCTAssertEqual(vm.importErrors.count, 1)
        XCTAssertTrue(vm.importErrors[0].contains("Claude couldn't read that photo — try a sharper shot"),
                      "Unexpected banner text: \(vm.importErrors[0])")
    }

    // ── T6 — Low confidence (<0.5) triggers banner + refetch with user default ──
    func test_T6_lowConfidence_usesUserDefaultAndShowsBanner() async throws {
        let api = FakePhotoAPI()
        // First preview — low confidence lined
        await api.enqueue(.success(previewResponse(paperType: "lined", confidence: 0.3, thoughts: ["a", "b", "c", "d", "e"])))
        // Refetch with forcePaperType=.gridded (user default)
        await api.enqueue(.success(previewResponse(paperType: "gridded", confidence: 0.3, thoughts: ["a\n\nb\n\nc\n\nd\n\ne"])))
        let vm = makeViewModel(photoAPI: api, userDefault: .gridded)

        let processing = Task { await vm.processFiles(urls: [tempImageURL]) }
        try await waitForPreview(vm: vm)

        guard case .awaitingUserDecision(let payload) = vm.photoPreviewState else {
            return XCTFail("Expected awaitingUserDecision after low-confidence refetch")
        }
        XCTAssertTrue(payload.showUncertaintyBanner)
        XCTAssertEqual(payload.currentForcePaperType, .gridded)
        XCTAssertEqual(payload.userDefaultPaperType, .gridded)
        XCTAssertEqual(payload.thoughts.count, 1)
        XCTAssertEqual(payload.detectedPaperType, .lined, "Detected type should preserve what Claude said, not the forced value")

        let calls = await api.calls()
        XCTAssertEqual(calls.count, 2)
        XCTAssertEqual(calls[0], .init(preview: true, forcePaperType: nil))
        XCTAssertEqual(calls[1], .init(preview: true, forcePaperType: .gridded))

        vm.cancelPhotoPreview()
        _ = await processing.value
    }

    // ── T7 — Multi-photo sequential, no sticky override ────────────────────
    func test_T7_multiPhotoSequential_noStickyOverride() async throws {
        // Create a second temp image in the same dir
        let secondURL = tempImageURL.deletingLastPathComponent().appendingPathComponent("second.jpg")
        try Data([0xFF, 0xD8, 0xFF, 0xD9]).write(to: secondURL)

        let api = FakePhotoAPI()
        // Photo 1: preview lined/0.9, override→gridded (refetch), commit
        await api.enqueue(.success(previewResponse(paperType: "lined", confidence: 0.9, thoughts: ["a", "b"])))
        await api.enqueue(.success(previewResponse(paperType: "gridded", confidence: 0.9, thoughts: ["a\n\nb"])))
        await api.enqueue(.success(commitResponse(paperType: "gridded", confidence: 0.9, thoughts: ["a\n\nb"])))
        // Photo 2: preview lined/0.9 (fresh — no sticky override carried)
        await api.enqueue(.success(previewResponse(paperType: "lined", confidence: 0.9, thoughts: ["p", "q"])))
        let vm = makeViewModel(photoAPI: api)

        let processing = Task { await vm.processFiles(urls: [tempImageURL, secondURL]) }
        try await waitForPreview(vm: vm)

        // Override photo 1 to gridded
        await vm.overridePhotoPreview(to: .gridded)
        // Commit photo 1 with gridded
        await vm.commitPhotoPreview()

        // Wait for photo 2's preview to land
        try await waitForPreview(vm: vm)
        guard case .awaitingUserDecision(let photo2Payload) = vm.photoPreviewState else {
            return XCTFail("Expected photo 2 preview")
        }
        // KEY ASSERTION — photo 2's picker is the DETECTED value (.lined), not
        // a sticky .gridded carried over from photo 1's override.
        XCTAssertEqual(photo2Payload.currentForcePaperType, .lined)
        XCTAssertEqual(photo2Payload.detectedPaperType, .lined)

        // Clean up
        vm.cancelPhotoPreview()
        _ = await processing.value

        let calls = await api.calls()
        XCTAssertEqual(calls.count, 4)
        XCTAssertEqual(calls[0], .init(preview: true, forcePaperType: nil))
        XCTAssertEqual(calls[1], .init(preview: true, forcePaperType: .gridded))
        XCTAssertEqual(calls[2], .init(preview: false, forcePaperType: .gridded))
        XCTAssertEqual(calls[3], .init(preview: true, forcePaperType: nil))
    }

    // ── T8 — Commit API error (500) ────────────────────────────────────────
    func test_T8_commitApiError_500_bannerMapping() async throws {
        let api = FakePhotoAPI()
        await api.enqueue(.success(previewResponse(paperType: "lined", confidence: 0.9, thoughts: ["a", "b"])))
        await api.enqueue(.failure(ProcessPhotoError.httpStatus(500)))
        let vm = makeViewModel(photoAPI: api)

        let processing = Task { await vm.processFiles(urls: [tempImageURL]) }
        try await waitForPreview(vm: vm)

        await vm.commitPhotoPreview()
        _ = await processing.value

        XCTAssertNil(vm.photoPreviewState)
        XCTAssertEqual(vm.importErrors.count, 1)
        XCTAssertTrue(vm.importErrors[0].contains("Couldn't save thoughts — try again in a moment"),
                      "Unexpected banner: \(vm.importErrors[0])")
    }

    // MARK: - Helpers

    /// Spin until the view-model's photoPreviewState transitions to
    /// `.awaitingUserDecision`. Fails the test after a few seconds so a stuck
    /// state doesn't hang CI.
    private func waitForPreview(vm: DashboardViewModel, timeoutSeconds: Double = 5.0) async throws {
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        while Date() < deadline {
            if case .awaitingUserDecision = vm.photoPreviewState { return }
            try await Task.sleep(nanoseconds: 10_000_000) // 10ms
        }
        XCTFail("Timed out waiting for photoPreviewState == .awaitingUserDecision")
    }
}
