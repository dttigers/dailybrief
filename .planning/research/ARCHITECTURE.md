# Architecture Research: Native macOS AI Life Assistant

**Research Date:** 2026-03-31
**Domain:** Personal AI life assistant (Jarvis) — native macOS app
**Scope:** Capture -> Triage -> Organize -> Surface pipeline architecture

---

## System Overview

```
+=========================================================================+
|                        JARVIS — macOS App                               |
|                                                                         |
|  +------------------+    +------------------+    +------------------+   |
|  |   CAPTURE LAYER  |    |   TRIAGE LAYER   |    |  SURFACE LAYER   |   |
|  |                  |--->|                  |--->|                  |   |
|  | Voice Recorder   |    | Claude API       |    | Dashboard (SwiftUI|   |
|  | Text Input       |    | Categorization   |    | Daily Brief PDF  |   |
|  | Photo/Scan       |    | Routing          |    | Menu Bar Monitor |   |
|  | Global Hotkey    |    | Pattern Detection |    | Search           |   |
|  +------------------+    +------------------+    +------------------+   |
|           |                      |                       ^              |
|           v                      v                       |              |
|  +--------------------------------------------------------------+      |
|  |                     STORAGE LAYER (Local)                     |      |
|  |                                                               |      |
|  |  ~/Library/Application Support/Jarvis/                        |      |
|  |  +----------+  +-----------+  +-----------+  +----------+    |      |
|  |  | thoughts/|  | config/   |  | cache/    |  | exports/ |    |      |
|  |  | audio/   |  | state/    |  | briefs/   |  | logs/    |    |      |
|  |  +----------+  +-----------+  +-----------+  +----------+    |      |
|  +--------------------------------------------------------------+      |
|           ^                                              ^              |
|           |                                              |              |
|  +--------------------------------------------------------------+      |
|  |                  DATA SOURCE LAYER                            |      |
|  |                                                               |      |
|  |  +-------+  +----------+  +-------+  +----------+  +------+  |      |
|  |  | Gmail |  |ServiceNow|  |MLB API|  | Reminders|  | More |  |      |
|  |  | (IMAP)|  | (via GM) |  | (REST)|  | (EventKit|  | ...  |  |      |
|  |  +-------+  +----------+  +-------+  +----------+  +------+  |      |
|  +--------------------------------------------------------------+      |
|                                                                         |
|  +--------------------------------------------------------------+      |
|  |                 BACKGROUND LAYER                              |      |
|  |  LaunchAgent  |  Scheduled Tasks  |  File Watchers            |      |
|  +--------------------------------------------------------------+      |
+=========================================================================+

ENTRY POINTS:
  [CLI]  dailybrief generate    -- existing, runs via LaunchAgent
  [GUI]  Jarvis.app             -- new SwiftUI dashboard
  [BAR]  DailyBriefMonitor      -- existing menu bar app
```

### Pipeline Flow (Capture -> Triage -> Organize -> Surface)

```
CAPTURE                  TRIAGE                   ORGANIZE              SURFACE
+----------------+       +----------------+       +----------------+   +----------------+
|                |       |                |       |                |   |                |
| Voice File     |       | Transcribe     |       | Store with     |   | Dashboard      |
| (pocket rec.)  |------>| (WhisperKit)   |------>| metadata +     |-->| inbox view     |
|                |       |                |       | category       |   |                |
| Text Input     |       | Classify       |       |                |   | Daily Brief    |
| (hotkey/UI)    |------>| (Claude API)   |------>| Route to       |-->| PDF generation |
|                |       |                |       | bucket:        |   |                |
| Photo/Scan     |       | Extract        |       | - task         |   | Pattern alerts |
| (drag-drop)    |------>| (Vision/Claude)|------>| - therapy      |-->| "You mentioned |
|                |       |                |       | - idea         |   |  X 3 times"    |
+----------------+       +----------------+       | - reflection   |   |                |
                                                  | - project note |   | Search results |
                                                  +----------------+   +----------------+
```

---

## Component Responsibilities

| Component | Responsibility | Pattern | Input | Output |
|-----------|---------------|---------|-------|--------|
| **CaptureService** | Accept thoughts via voice, text, photo | Actor, async | Raw audio/text/image | `CapturedThought` model |
| **TranscriptionService** | Convert audio files to text | Actor, pipeline | Audio file URL | Transcribed text string |
| **TriageService** | Classify and route thoughts via Claude | Actor, queue | Raw text + context | `TriagedThought` with category |
| **ThoughtStore** | Persist and query thoughts | Actor, repository | `TriagedThought` | CRUD operations |
| **DataSourceManager** | Coordinate external data fetches | Actor, facade | Config | Aggregated `BriefData` |
| **GmailService** | Fetch work orders via IMAP | Actor (existing) | Config | `[WorkOrder]` |
| **SportsService** | Fetch MLB data | Actor (existing) | Config | Scores, standings |
| **RemindersService** | Read Apple Reminders | Actor (existing) | Config | `[ReminderItem]` |
| **AIService** | All Claude API interactions | Actor, queue | Prompts | AI responses |
| **BriefGenerator** | Produce daily PDF | Stateless (existing) | `BriefData` | PDF file |
| **PatternEngine** | Detect recurring themes | Stateless, batch | Thought history | Pattern insights |
| **DashboardViewModel** | Drive dashboard UI state | @Observable, @MainActor | Store queries | View state |
| **SearchEngine** | Full-text search across all data | Actor | Query string | Search results |
| **BackgroundScheduler** | Coordinate timed operations | LaunchAgent + XPC | Schedule config | Triggered actions |
| **ConfigManager** | Manage app settings | @Observable | User input | Validated config |

---

## Recommended Project Structure

```
Package.swift
Sources/
  JarvisCore/                        # Shared library target
    Models/
      Thought.swift                  # CapturedThought, TriagedThought, ThoughtCategory
      BriefData.swift                # DailyBriefData (existing, moved here)
      WorkOrder.swift                # (existing, moved here)
      ReminderItem.swift             # (existing, moved here)
      StandingsEntry.swift           # (existing, moved here)
      SearchResult.swift
    Services/
      AI/
        AIService.swift              # Protocol + Claude implementation
        AIRequestQueue.swift         # Rate-limited queue for API calls
      Capture/
        CaptureService.swift         # Unified capture interface
        TranscriptionService.swift   # WhisperKit integration
        AudioRecordingManager.swift  # AVFoundation microphone capture
      Triage/
        TriageService.swift          # Claude-based classification
        ThoughtRouter.swift          # Routes classified thoughts to buckets
      DataSources/
        DataSourceProtocol.swift     # Protocol all sources conform to
        DataSourceManager.swift      # Aggregates all sources
        GmailService.swift           # (existing, moved here)
        SportsService.swift          # (existing, moved here)
        RemindersService.swift       # (existing, moved here)
      Storage/
        ThoughtStore.swift           # CRUD for thoughts (file-based)
        CompletionStore.swift        # (existing, moved here)
        BriefArchive.swift           # Historical brief storage
      Search/
        SearchEngine.swift           # Full-text search across all data
      Patterns/
        PatternEngine.swift          # Recurring theme detection
    Config/
      AppConfig.swift                # (existing, expanded)
      ConfigLoader.swift             # (existing, moved here)
    PDF/
      PDFGenerator.swift             # (existing, moved here)
      PDFStyles.swift                # (existing, moved here)
      PageOneRenderer.swift          # (existing, moved here)
      PageTwoRenderer.swift          # (existing, moved here)
    Utilities/
      Logger.swift                   # (existing, moved here)
      PrintService.swift             # (existing, moved here)
      FileSystemManager.swift        # Centralized file path management
      DateFormatting.swift

  DailyBrief/                        # CLI executable target
    DailyBrief.swift                 # @main, ArgumentParser commands
    Commands/
      GenerateCommand.swift
      CaptureCommand.swift           # CLI thought capture: dailybrief capture "idea"

  Jarvis/                            # GUI executable target (SwiftUI app)
    JarvisApp.swift                  # @main, App lifecycle
    Views/
      Dashboard/
        DashboardView.swift          # Single pane of glass
        BriefSummaryCard.swift
        ThoughtInboxCard.swift
        UpcomingCard.swift
      Capture/
        CaptureView.swift            # Text input + voice record button
        VoiceRecorderView.swift
        QuickCapturePanel.swift      # Global hotkey floating panel
      Thoughts/
        ThoughtListView.swift        # Inbox-style list
        ThoughtDetailView.swift
        ThoughtFilterBar.swift
      Settings/
        SettingsView.swift           # Replaces hand-edited JSON
        DataSourceSettingsView.swift
        AISettingsView.swift
      Brief/
        BriefPreviewView.swift       # PDF preview
        BriefHistoryView.swift
    ViewModels/
      DashboardViewModel.swift
      CaptureViewModel.swift
      ThoughtListViewModel.swift
      SettingsViewModel.swift
    Navigation/
      AppNavigation.swift            # Sidebar navigation state
      NavigationRoutes.swift

  DailyBriefMonitor/                 # Menu bar executable target (existing)
    DailyBriefMonitorApp.swift
    MenuBarView.swift
    StatusChecker.swift

Tests/
  JarvisCoreTests/
    Services/
      TriageServiceTests.swift
      ThoughtStoreTests.swift
      PatternEngineTests.swift
    Models/
      ThoughtTests.swift
```

### Package.swift Structure

```swift
// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "Jarvis",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.3.0"),
        .package(url: "https://github.com/argmaxinc/WhisperKit.git", from: "0.9.0"),
    ],
    targets: [
        // Shared library — all business logic lives here
        .target(
            name: "JarvisCore",
            dependencies: [
                .product(name: "WhisperKit", package: "WhisperKit"),
            ],
            linkerSettings: [
                .linkedFramework("EventKit"),
                .linkedFramework("CoreGraphics"),
                .linkedFramework("CoreText"),
                .linkedFramework("AVFoundation"),
            ]
        ),
        // CLI executable — thin wrapper over JarvisCore
        .executableTarget(
            name: "DailyBrief",
            dependencies: [
                "JarvisCore",
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
            ]
        ),
        // GUI executable — SwiftUI dashboard
        .executableTarget(
            name: "Jarvis",
            dependencies: ["JarvisCore"],
            linkerSettings: [
                .linkedFramework("SwiftUI"),
                .linkedFramework("AppKit"),
            ]
        ),
        // Menu bar monitor — existing
        .executableTarget(
            name: "DailyBriefMonitor",
            dependencies: ["JarvisCore"],
            linkerSettings: [
                .linkedFramework("SwiftUI"),
                .linkedFramework("AppKit"),
            ]
        ),
        // Tests
        .testTarget(
            name: "JarvisCoreTests",
            dependencies: ["JarvisCore"]
        ),
    ]
)
```

The critical pattern: **extract all business logic into `JarvisCore` as a library target**, then have CLI, GUI, and Monitor as thin executable targets that depend on it. This is the standard SPM approach for sharing code between multiple entry points.

---

## Architectural Patterns

### 1. Shared Core Library (CLI + GUI from Same Codebase)

The existing codebase has two executable targets (`DailyBrief` CLI and `DailyBriefMonitor`) that currently share no code. The standard solution is a shared library target.

**Confidence:** HIGH — This is the documented SPM pattern for multi-target projects.

```swift
// JarvisCore is a library, not an executable
// Both CLI and GUI import it

// In DailyBrief (CLI):
import JarvisCore
import ArgumentParser

@main
struct DailyBriefCLI: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "dailybrief",
        subcommands: [GenerateCommand.self, CaptureCommand.self]
    )
}

struct GenerateCommand: AsyncParsableCommand {
    func run() async throws {
        let config = try ConfigLoader.load()
        let sourceManager = DataSourceManager(config: config)
        let data = try await sourceManager.fetchAll()
        let path = try PDFGenerator.generate(data: data)
        print("Brief generated: \(path)")
    }
}

// In Jarvis (GUI):
import JarvisCore
import SwiftUI

@main
struct JarvisApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            DashboardView()
                .environment(appState)
        }
        Settings {
            SettingsView()
                .environment(appState)
        }
    }
}
```

### 2. @Observable ViewModel Pattern (Modern MVVM)

Swift 5.9+ introduced the `@Observable` macro, which replaces `ObservableObject`/`@Published` with compiler-generated observation tracking. This is now the recommended pattern for SwiftUI state management.

**Confidence:** HIGH — Apple's recommended approach as of WWDC 2024-2025.

```swift
import SwiftUI
import JarvisCore

@Observable
@MainActor
final class DashboardViewModel {
    // State
    var thoughts: [TriagedThought] = []
    var todaysBrief: BriefSummary?
    var unprocessedCount: Int = 0
    var isLoading: Bool = false
    var error: AppError?

    // Dependencies (injected)
    private let thoughtStore: ThoughtStore
    private let dataSourceManager: DataSourceManager
    private let patternEngine: PatternEngine

    init(
        thoughtStore: ThoughtStore,
        dataSourceManager: DataSourceManager,
        patternEngine: PatternEngine
    ) {
        self.thoughtStore = thoughtStore
        self.dataSourceManager = dataSourceManager
        self.patternEngine = patternEngine
    }

    func loadDashboard() async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let fetchedThoughts = thoughtStore.recentThoughts(limit: 20)
            async let briefData = dataSourceManager.fetchAll()
            async let patterns = patternEngine.detectPatterns()

            thoughts = try await fetchedThoughts
            todaysBrief = try await BriefSummary(from: briefData)
            unprocessedCount = thoughts.filter { !$0.isProcessed }.count
        } catch {
            self.error = .wrapped(error)
        }
    }
}

// View binds directly to @Observable — no property wrappers needed
struct DashboardView: View {
    @State private var viewModel: DashboardViewModel

    init(viewModel: DashboardViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationSplitView {
            SidebarView()
        } detail: {
            if viewModel.isLoading {
                ProgressView()
            } else {
                ScrollView {
                    ThoughtInboxCard(thoughts: viewModel.thoughts)
                    BriefSummaryCard(brief: viewModel.todaysBrief)
                }
            }
        }
        .task { await viewModel.loadDashboard() }
    }
}
```

### 3. Actor-Based Service Layer

The existing codebase already uses Swift actors for services (e.g., `ClaudeAIProvider`). This pattern scales well — each service is an isolated concurrent context with serialized access.

**Confidence:** HIGH — Already in use in the codebase; standard Swift concurrency pattern.

```swift
// Protocol-based data source abstraction
protocol DataSource: Actor {
    associatedtype Output: Sendable
    func fetch() async throws -> Output
}

// Each data source is an actor
actor GmailService: DataSource {
    typealias Output = [WorkOrder]
    private let config: AppConfig.GmailConfig

    init(config: AppConfig.GmailConfig) {
        self.config = config
    }

    func fetch() async throws -> [WorkOrder] {
        // existing IMAP logic
    }
}

// Coordinator aggregates all sources
actor DataSourceManager {
    private let sources: [String: any DataSource]
    private let config: AppConfig

    func fetchAll() async throws -> DailyBriefData {
        // Fetch all sources concurrently
        async let workOrders = gmailService.fetch()
        async let sports = sportsService.fetch()
        async let reminders = remindersService.fetch()
        async let affirmation = aiService.generateAffirmation()

        return try await DailyBriefData(
            workOrders: workOrders,
            sports: sports,
            reminders: reminders,
            affirmation: affirmation
        )
    }
}
```

### 4. AI Request Queue with Rate Limiting

Claude API calls should be funneled through a serialized queue to prevent rate limiting and manage costs. The actor model naturally provides this.

**Confidence:** HIGH — Actor serialization is the Swift-native approach to queue management.

```swift
actor AIRequestQueue {
    private let apiKey: String
    private let model: String
    private var requestCount: Int = 0
    private var windowStart: Date = .now

    // Rate limit: e.g., 50 requests per minute
    private let maxRequestsPerMinute: Int = 50

    enum Priority: Int, Comparable {
        case low = 0      // pattern analysis, background
        case normal = 1   // triage classification
        case high = 2     // user-initiated (affirmation, direct query)

        static func < (lhs: Priority, rhs: Priority) -> Bool {
            lhs.rawValue < rhs.rawValue
        }
    }

    func enqueue(
        prompt: String,
        systemPrompt: String,
        maxTokens: Int = 500,
        priority: Priority = .normal
    ) async throws -> String {
        try await enforceRateLimit()
        return try await callClaude(
            prompt: prompt,
            systemPrompt: systemPrompt,
            maxTokens: maxTokens
        )
    }

    private func enforceRateLimit() async throws {
        let now = Date()
        if now.timeIntervalSince(windowStart) > 60 {
            requestCount = 0
            windowStart = now
        }
        if requestCount >= maxRequestsPerMinute {
            let waitTime = 60 - now.timeIntervalSince(windowStart)
            try await Task.sleep(for: .seconds(waitTime))
            requestCount = 0
            windowStart = .now
        }
        requestCount += 1
    }

    private func callClaude(
        prompt: String,
        systemPrompt: String,
        maxTokens: Int
    ) async throws -> String {
        // HTTP request to Claude API (existing pattern from AIService.swift)
        // ...
    }
}
```

### 5. Audio Transcription Pipeline

WhisperKit provides on-device transcription optimized for Apple Silicon. The pipeline watches for new audio files from the pocket recorder and processes them through transcription, then feeds into triage.

**Confidence:** MEDIUM — WhisperKit is well-established but the file-watching integration is custom.

```swift
actor TranscriptionService {
    private let whisperKit: WhisperKit  // or Apple Speech framework

    init() async throws {
        // WhisperKit loads model on init — do this once at app launch
        self.whisperKit = try await WhisperKit(model: "base")
    }

    func transcribe(audioURL: URL) async throws -> TranscriptionResult {
        let results = try await whisperKit.transcribe(audioPath: audioURL.path)
        guard let result = results.first else {
            throw TranscriptionError.noResult
        }
        return TranscriptionResult(
            text: result.text,
            language: result.language,
            duration: result.timings.fullPipeline,
            sourceFile: audioURL
        )
    }
}

// File watcher for import directory
// User drops audio files from pocket recorder into ~/Jarvis/inbox/audio/
actor AudioImportWatcher {
    private let watchedDirectory: URL
    private let onNewFile: (URL) async -> Void

    func startWatching() {
        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: /* fd for directory */,
            eventMask: .write,
            queue: .global()
        )
        source.setEventHandler { [weak self] in
            Task { await self?.scanForNewFiles() }
        }
        source.resume()
    }

    private func scanForNewFiles() async {
        // Compare directory contents to processed set
        // Call onNewFile for each new audio file
    }
}
```

### 6. Thought Pipeline (Capture -> Triage -> Store)

This is the core pipeline. Each stage transforms data and passes it forward.

**Confidence:** HIGH — Pipeline pattern is well-documented and maps naturally to async/await.

```swift
// Models for the pipeline stages

enum ThoughtCategory: String, Codable, CaseIterable {
    case task
    case therapy
    case idea
    case reflection
    case projectNote = "project_note"
}

struct CapturedThought: Codable, Sendable, Identifiable {
    let id: UUID
    let rawText: String
    let source: CaptureSource  // .voice, .text, .photo
    let capturedAt: Date
    let sourceFile: URL?       // original audio/image file
}

struct TriagedThought: Codable, Sendable, Identifiable {
    let id: UUID
    let rawText: String
    let category: ThoughtCategory
    let summary: String        // AI-generated one-line summary
    let actionItems: [String]  // extracted if category == .task
    let source: CaptureSource
    let capturedAt: Date
    let triagedAt: Date
    var isProcessed: Bool = false
    let sourceFile: URL?
}

// The pipeline coordinator
actor ThoughtPipeline {
    private let transcriptionService: TranscriptionService
    private let triageService: TriageService
    private let thoughtStore: ThoughtStore

    /// Full pipeline: audio file -> transcribe -> classify -> store
    func processAudioFile(_ url: URL) async throws -> TriagedThought {
        let transcription = try await transcriptionService.transcribe(audioURL: url)
        let captured = CapturedThought(
            id: UUID(),
            rawText: transcription.text,
            source: .voice,
            capturedAt: .now,
            sourceFile: url
        )
        return try await triageAndStore(captured)
    }

    /// Partial pipeline: text -> classify -> store
    func processText(_ text: String) async throws -> TriagedThought {
        let captured = CapturedThought(
            id: UUID(),
            rawText: text,
            source: .text,
            capturedAt: .now,
            sourceFile: nil
        )
        return try await triageAndStore(captured)
    }

    private func triageAndStore(_ captured: CapturedThought) async throws -> TriagedThought {
        let triaged = try await triageService.classify(captured)
        try await thoughtStore.save(triaged)
        return triaged
    }
}
```

### 7. File-Based Local Storage (No Database)

For a single-user local-first app, file-based storage with JSON is simpler than SQLite/SwiftData and fully sufficient. Each thought becomes a JSON file; metadata index enables fast queries.

**Confidence:** HIGH — Matches project constraints (local-first, no cloud, single-user).

```swift
actor ThoughtStore {
    private let baseDir: URL  // ~/Library/Application Support/Jarvis/thoughts/
    private var index: ThoughtIndex  // in-memory index loaded from index.json

    struct ThoughtIndex: Codable {
        var entries: [IndexEntry]

        struct IndexEntry: Codable {
            let id: UUID
            let category: ThoughtCategory
            let summary: String
            let capturedAt: Date
            let isProcessed: Bool
            let filename: String  // "{id}.json"
        }
    }

    func save(_ thought: TriagedThought) async throws {
        // Write individual thought file
        let filename = "\(thought.id).json"
        let fileURL = baseDir.appending(path: filename)
        let data = try JSONEncoder().encode(thought)
        try data.write(to: fileURL)

        // Update in-memory index
        let entry = ThoughtIndex.IndexEntry(
            id: thought.id,
            category: thought.category,
            summary: thought.summary,
            capturedAt: thought.capturedAt,
            isProcessed: thought.isProcessed,
            filename: filename
        )
        index.entries.append(entry)
        try await persistIndex()
    }

    func recentThoughts(limit: Int) async throws -> [TriagedThought] {
        let recent = index.entries
            .sorted { $0.capturedAt > $1.capturedAt }
            .prefix(limit)
        return try recent.map { entry in
            let fileURL = baseDir.appending(path: entry.filename)
            let data = try Data(contentsOf: fileURL)
            return try JSONDecoder().decode(TriagedThought.self, from: data)
        }
    }

    func search(query: String) async -> [ThoughtIndex.IndexEntry] {
        // Fast search against in-memory index summaries
        index.entries.filter { entry in
            entry.summary.localizedCaseInsensitiveContains(query)
        }
    }

    private func persistIndex() async throws {
        let indexURL = baseDir.appending(path: "index.json")
        let data = try JSONEncoder().encode(index)
        try data.write(to: indexURL)
    }
}
```

**When to graduate to SQLite/SwiftData:** If the thought count exceeds ~10,000, or full-text search across raw text (not just summaries) becomes needed, consider adding GRDB or SwiftData. The actor interface stays the same — only the internal storage changes.

### 8. Data Source Protocol (Plugin Architecture)

A protocol-based approach makes it easy to add new data sources without modifying existing code.

**Confidence:** HIGH — Protocol-oriented design is idiomatic Swift.

```swift
protocol DataSourceProvider: Actor, Identifiable {
    var id: String { get }
    var displayName: String { get }
    var isEnabled: Bool { get }

    associatedtype Configuration: Codable & Sendable
    associatedtype Output: Sendable

    init(config: Configuration) throws
    func fetch() async throws -> Output

    // For the daily brief — each source contributes a section
    func briefSection() async throws -> BriefSection?
}

struct BriefSection: Sendable {
    let title: String
    let priority: Int  // rendering order
    let content: BriefContent

    enum BriefContent: Sendable {
        case workOrders([WorkOrder])
        case reminders([ReminderItem])
        case sports(SportsData)
        case thoughts([TriagedThought])
        case custom(title: String, lines: [String])
    }
}

// Registration
@Observable
@MainActor
final class DataSourceRegistry {
    private(set) var registeredSources: [String: any DataSourceProvider] = [:]

    func register<T: DataSourceProvider>(_ source: T) {
        registeredSources[source.id] = source
    }

    func fetchAllBriefSections() async -> [BriefSection] {
        await withTaskGroup(of: BriefSection?.self) { group in
            for source in registeredSources.values {
                group.addTask {
                    try? await source.briefSection()
                }
            }
            var sections: [BriefSection] = []
            for await section in group {
                if let section { sections.append(section) }
            }
            return sections.sorted { $0.priority < $1.priority }
        }
    }
}
```

---

## Data Flow Diagrams

### Request Flow: Voice Capture to Stored Thought

```
User presses record    Pocket recorder         File watcher
on pocket recorder     saves .wav file         detects new file
       |                     |                       |
       v                     v                       v
  [Hardware]           [~/Jarvis/inbox/]     [AudioImportWatcher]
                                                     |
                                                     v
                                            [TranscriptionService]
                                            (WhisperKit on-device)
                                                     |
                                              raw text string
                                                     |
                                                     v
                                            [TriageService]
                                            (Claude API call)
                                                     |
                                          TriagedThought {
                                            category: .therapy,
                                            summary: "Want to discuss
                                              anxiety triggers with
                                              therapist",
                                            actionItems: []
                                          }
                                                     |
                                                     v
                                            [ThoughtStore]
                                            saves JSON + updates index
                                                     |
                                                     v
                                            [DashboardViewModel]
                                            @Observable updates UI
```

### State Management Flow

```
+-------------------+
|   AppState        |  @Observable, @MainActor
|   (root)          |  Owned by JarvisApp
+-------------------+
        |
        |--- config: AppConfig              (loaded from JSON at launch)
        |--- thoughtStore: ThoughtStore     (actor, persists to disk)
        |--- aiQueue: AIRequestQueue        (actor, rate-limited)
        |--- pipeline: ThoughtPipeline      (actor, coordinates capture)
        |
        |--- Passed via .environment() to all views
        |
        +---> DashboardViewModel            @Observable, @MainActor
        |       reads from thoughtStore
        |       reads from dataSourceManager
        |
        +---> CaptureViewModel              @Observable, @MainActor
        |       writes via pipeline
        |
        +---> ThoughtListViewModel          @Observable, @MainActor
        |       reads/writes thoughtStore
        |
        +---> SettingsViewModel             @Observable, @MainActor
                reads/writes config
```

### Daily Brief Generation Flow

```
LaunchAgent (6 AM)
       |
       v
  dailybrief generate         (CLI executable)
       |
       v
  ConfigLoader.load()         (~/.config/dailybrief/config.json)
       |
       v
  DataSourceManager.fetchAll()
       |
       +---> async let: GmailService.fetch()        -> [WorkOrder]
       +---> async let: SportsService.fetch()        -> SportsData
       +---> async let: RemindersService.fetch()     -> [ReminderItem]
       +---> async let: AIService.generateAffirmation() -> String
       +---> async let: ThoughtStore.unprocessed()   -> [TriagedThought]  // NEW
       |
       v
  CompletionStore.filter()    (remove completed work orders)
       |
       v
  PatternEngine.analyze()     (detect recurring themes)       // NEW
       |
       v
  DailyBriefData              (aggregated)
       |
       v
  PDFGenerator.generate()     (CoreGraphics + CoreText)
       |
       v
  PrintService.print()        (lpr to physical printer)
       |
       v
  Logger.log()                (~/Library/Logs/)
```

---

## Scaling Considerations

### Data Volume Thresholds

| Scale | Thoughts | Storage Strategy | Search Strategy |
|-------|----------|-----------------|-----------------|
| **Phase 1** (0-1,000) | First 6 months | JSON files + in-memory index | In-memory string matching |
| **Phase 2** (1,000-10,000) | Year 1-2 | JSON files + SQLite index | SQLite FTS5 full-text search |
| **Phase 3** (10,000+) | Year 2+ | SwiftData or GRDB | Dedicated search index |

### API Cost Management

- **Cache aggressively**: Daily affirmation cached for 24h (already implemented)
- **Batch triage**: If multiple thoughts arrive at once, batch them in a single Claude call
- **Use Haiku for classification**: Triage categorization does not need Sonnet; use the cheapest model that works
- **Local-first classification**: For obvious categories (e.g., text starting with "remind me to"), skip the API call entirely
- **Budget tracking**: Log token usage per day; alert if exceeding threshold

### Performance Considerations

- **WhisperKit model loading**: Load once at app launch, keep in memory (~150MB for base model)
- **Index loading**: Load thought index at launch; keep in memory; persist on changes
- **Lazy loading**: Load full thought JSON only when user opens detail view
- **Background processing**: Audio transcription and triage should not block the UI thread (actors handle this naturally)

---

## Anti-Patterns to Avoid

### 1. Monolithic ViewModel
**Wrong:** Single massive ViewModel that manages all dashboard state, capture, settings, and search.
**Right:** One ViewModel per distinct screen/feature, each with focused responsibilities.

### 2. Direct API Calls from ViewModels
**Wrong:** ViewModel calls Claude API directly with URLSession.
**Right:** ViewModel calls through AIRequestQueue actor, which handles rate limiting, retries, and caching.

### 3. Synchronous File I/O on Main Thread
**Wrong:** Reading thought JSON files synchronously in a SwiftUI view body or ViewModel init.
**Right:** All file I/O happens in actor-isolated async methods; ViewModel uses `.task { }` modifier.

### 4. Tightly Coupled Data Sources
**Wrong:** `GenerateCommand` directly instantiates `GmailService`, `SportsService`, etc.
**Right:** `DataSourceManager` aggregates registered sources via protocol; adding a new source does not require modifying existing code.

### 5. Storing Secrets in Config Files
**Wrong:** API keys in plain text JSON (current approach with `config.json`).
**Right:** Store API keys in macOS Keychain; `ConfigLoader` reads non-sensitive config from JSON, sensitive values from Keychain.

### 6. Over-Engineering with SwiftData Too Early
**Wrong:** Introducing SwiftData/CoreData for < 1,000 records in a single-user local app.
**Right:** Start with JSON files. The actor interface means you can swap storage backends later without changing any ViewModel or View code.

### 7. Skipping the Shared Library
**Wrong:** Duplicating business logic between CLI and GUI targets.
**Right:** Extract `JarvisCore` library; CLI and GUI are thin wrappers.

---

## Integration Points

### Existing -> New (Migration Path)

| Existing Component | Migration | Notes |
|-------------------|-----------|-------|
| `Sources/DailyBrief/` | Move business logic to `JarvisCore/`; keep CLI entry point thin | CLI continues to work exactly as before |
| `Sources/DailyBriefMonitor/` | Add `JarvisCore` dependency; share StatusChecker logic | Monitor gains access to thought count, etc. |
| `~/.config/dailybrief/config.json` | `ConfigLoader` reads from same path; GUI writes to same path | No config migration needed |
| `~/.cache/dailybrief/` | Move to `~/Library/Application Support/Jarvis/cache/` | Standard macOS location |
| LaunchAgent plist | Keep as-is; still triggers CLI binary | No change to scheduling |

### New Integration Points

| Integration | Technology | Notes |
|-------------|-----------|-------|
| **Voice transcription** | WhisperKit (on-device) | SPM package; base model ~150MB; runs on Apple Neural Engine |
| **Claude triage** | Anthropic Messages API | Reuse existing `callClaude()` pattern; add classification prompt |
| **File watching** | DispatchSource / FSEvents | Watch inbox directory for new audio files from pocket recorder |
| **Global hotkey** | CGEvent / MASShortcut | System-wide keyboard shortcut to open capture panel |
| **macOS Keychain** | Security.framework | Store API keys securely instead of plaintext JSON |
| **Spotlight integration** | CoreSpotlight | Optional: index thoughts for system-wide search |
| **Notification Center** | UserNotifications | Alert when new thoughts are triaged or patterns detected |

### External System Boundaries

```
+---------------------+          +---------------------+
|  Pocket Recorder    |          |  Claude API         |
|  (hardware device)  |          |  (api.anthropic.com)|
|                     |          |                     |
|  Output: .wav files |          |  Input: JSON prompt |
|  Transfer: USB/SD   |          |  Output: JSON resp  |
|  or AirDrop         |          |  Rate: 50 req/min   |
+---------------------+          +---------------------+

+---------------------+          +---------------------+
|  Gmail (IMAP)       |          |  MLB Stats API      |
|  (imap.gmail.com)   |          |  (statsapi.mlb.com) |
|                     |          |                     |
|  Auth: App password |          |  Auth: None (public)|
|  Protocol: IMAP/SSL |          |  Protocol: REST/JSON|
+---------------------+          +---------------------+

+---------------------+          +---------------------+
|  Apple Reminders    |          |  macOS Printer      |
|  (EventKit)         |          |  (lpr / CUPS)       |
|                     |          |                     |
|  Auth: TCC prompt   |          |  Auth: System       |
|  API: EventKit fwk  |          |  Protocol: lpr CLI  |
+---------------------+          +---------------------+
```

---

## Sources

### SwiftUI Architecture & MVVM
- [Clean Architecture for SwiftUI — Alexey Naumov](https://nalexn.github.io/clean-architecture-swiftui/) — HIGH confidence
- [Modern MVVM in SwiftUI 2025 — Medium](https://medium.com/@minalkewat/modern-mvvm-in-swiftui-2025-the-clean-architecture-youve-been-waiting-for-72a7d576648e) — MEDIUM confidence
- [Modern iOS App Architecture in 2026 — 7Span](https://7span.com/blog/mvvm-vs-clean-architecture-vs-tca) — MEDIUM confidence
- [SwiftUI architecture — Choosing the Right Design Pattern](https://curatedios.substack.com/p/20-swiftui-architecture) — MEDIUM confidence
- [Building a Clean SwiftUI App with TCA — Medium](https://kevinabram1000.medium.com/building-a-clean-swiftui-app-with-tca-the-composable-architecture-5164cf2a94cf) — MEDIUM confidence

### Local-First Data Architecture
- [Designing Efficient Local-First Architectures with SwiftData — Medium](https://medium.com/@gauravharkhani01/designing-efficient-local-first-architectures-with-swiftdata-cc74048526f2) — MEDIUM confidence
- [SwiftData Architecture Patterns and Practices — AzamSharp](https://azamsharp.com/2025/03/28/swiftdata-architecture-patterns-and-practices.html) — HIGH confidence
- [Core Data vs SwiftData 2025 — DistantJob](https://distantjob.com/blog/core-data-vs-swiftdata/) — MEDIUM confidence
- [SQLiteData — Point-Free (GRDB-based)](https://github.com/pointfreeco/sqlite-data) — HIGH confidence

### Audio Transcription
- [WhisperKit — argmaxinc](https://github.com/argmaxinc/WhisperKit) — HIGH confidence
- [Transcribe audio on iOS & macOS: WhisperKit — Transloadit](https://transloadit.com/devtips/transcribe-audio-on-ios-macos-whisperkit/) — MEDIUM confidence
- [Apple Speech APIs vs Whisper — MacStories](https://www.macstories.net/stories/hands-on-how-apples-new-speech-apis-outpace-whisper-for-lightning-fast-transcription/) — MEDIUM confidence
- [FluidAudio — on-device audio AI](https://github.com/FluidInference/FluidAudio) — MEDIUM confidence

### AI Integration & Concurrency
- [Claude Code Swift SDK](https://github.com/AruneshSingh/ClaudeCodeSwiftSDK) — MEDIUM confidence
- [API Queue Using Await/Async — Swift Forums](https://forums.swift.org/t/api-queue-using-await-async/74930) — HIGH confidence
- [Claude API Integration Guide 2025 — Collabnix](https://collabnix.com/claude-api-integration-guide-2025-complete-developer-tutorial-with-code-examples/) — MEDIUM confidence

### SPM Multi-Target & CLI-to-GUI
- [Sharing code in multi-target SPM — Digital Flapjack](https://digitalflapjack.com/blog/spm-share-code-between-targets/) — HIGH confidence
- [How to Build macOS apps using only SPM — The.Swift.Dev](https://theswiftdev.com/how-to-build-macos-apps-using-only-the-swift-package-manager/) — HIGH confidence
- [Build a CLI Tool — Swift.org](https://www.swift.org/getting-started/cli-swiftpm/) — HIGH confidence

### Background Processing & XPC
- [Creating a Launch Agent with XPC — RDerik](https://rderik.com/blog/creating-a-launch-agent-that-provides-an-xpc-service-on-macos/) — HIGH confidence
- [Building a Modern Launch Agent on macOS — GitHub Gist](https://gist.github.com/Matejkob/f8b1f6a7606f30777552372bab36c338) — MEDIUM confidence
- [macOS agents and daemons — Medium](https://medium.com/@alkenso/macos-daemonology-d471fd21edd2) — HIGH confidence
- [Integrating XPC services in macOS — Reverse Society](https://tonygo.tech/blog/2024/integrating-xpc-service-in-macos-app) — MEDIUM confidence

### Plugin Architecture
- [Making Swift code extensible through plugins — Swift by Sundell](https://www.swiftbysundell.com/articles/making-swift-code-extensible-through-plugins/) — HIGH confidence

### Pipeline Pattern
- [The Pipeline Pattern — DEV Community](https://dev.to/wallacefreitas/the-pipeline-pattern-streamlining-data-processing-in-software-architecture-44hn) — MEDIUM confidence
- [Pipeline Design Pattern — From Zero to Hero — Medium](https://medium.com/@bonnotguillaume/software-architecture-the-pipeline-design-pattern-from-zero-to-hero-b5c43d8a3e60) — MEDIUM confidence

---

*Research completed: 2026-03-31*
*Update when architectural decisions are finalized*
