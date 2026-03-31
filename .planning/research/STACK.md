# STACK.md — Technology Stack Research
## Native macOS Personal Productivity App (Jarvis)

**Research Date:** 2026-03-31
**Scope:** 2025–2026 best practices for Swift 6.2 / SwiftUI macOS apps
**Constraints:** macOS 14+ (Sonoma), Swift 6.2, SPM-only, local file storage, single-user, no cloud DB

---

## 1. Core Technologies

| Layer | Technology | Version | Rationale | Confidence |
|---|---|---|---|---|
| Language | Swift | 6.2 | Already in use. Swift 6.2 introduces "Approachable Concurrency" — `@MainActor` isolation by default in new Xcode 26 projects, progressive disclosure model. Strict concurrency without overwhelming data-race errors. | HIGH |
| UI Framework | SwiftUI | macOS 14+ | Already in use (DailyBriefMonitor). `@Observable` macro replaces `ObservableObject`/`@Published`. Native macOS support is mature. No UIKit/AppKit interop needed for new windows. | HIGH |
| Build System | Swift Package Manager | 6.2 toolchain | Already in use. No CocoaPods, no Carthage. SPM handles all dependencies. | HIGH |
| App Lifecycle | SwiftUI App protocol | macOS 14+ | `@main` + `App` struct. `MenuBarExtra` scene (macOS 13+) for menu bar. `WindowGroup` for dashboard. | HIGH |
| Concurrency | Swift Concurrency (async/await, actors) | Swift 6.2 | Strict concurrency already in use. Use `@MainActor` for all UI code. Domain services as actors. Approachable Concurrency in 6.2 reduces false-positive data race errors. | HIGH |
| State Management | `@Observable` + `@State` / `@Bindable` | macOS 14+ | Replaces `ObservableObject`/`@Published`/`@StateObject`. Pull-based, access-tracked, better performance. Part of Observation framework (macOS 14+ = iOS 17 equivalent). No additional library. | HIGH |
| Persistence | GRDB.swift | 7.10.0+ | SQLite-backed, FTS5 full-text search, async/await support, Swift 6.1+ required, macOS 10.15+. Better than SwiftData for complex queries, offline-first, no schema migration pain. See Alternatives below. | HIGH |
| Local Config / Prefs | UserDefaults + `@AppStorage` | macOS 14+ | `@AppStorage` for settings/preferences (< 512 KB). Already used for config file (`~/.config/dailybrief/config.json`). Keep JSON config for structured data. | HIGH |
| Secure Secrets | Keychain (native Security framework) | macOS 14+ | Store Claude API key, credentials in Keychain rather than plaintext config. Use `SecItemAdd`/`SecItemCopyMatching` directly, or KeychainAccess wrapper. | HIGH |
| HTTP / Networking | Foundation URLSession | macOS 14+ | Already in use (Claude API, MLB). For macOS-native apps, URLSession with async/await is the right choice. No NIO/AsyncHTTPClient needed (that's for server-side Linux). | HIGH |
| Claude API | SwiftAnthropic | 2.1.8+ | Most active community Swift SDK (192 stars, Swift 6.0/6.1/6.2 compatible, zero data race errors). Streaming support. Pure Swift, SPM. See Alternatives below. | HIGH |
| PDF Generation | PDFKit (Apple framework) | macOS 14+ | Already in use (CoreGraphics/CoreText). PDFKit provides `PDFDocument`/`PDFPage`. For complex layout: render SwiftUI views to `NSImage` then embed in PDF. Native, zero dependencies. | HIGH |
| Audio Capture | AVFoundation (AVAudioEngine) | macOS 14+ | `AVAudioEngine` + input node tap for real-time PCM buffer capture. Required before passing to transcription. No third-party library needed for capture itself. | HIGH |
| Transcription (primary) | SFSpeechRecognizer (Speech framework) | macOS 14+ (on-device) | Already available on macOS 14 (Sonoma). Set `requiresOnDeviceRecognition = true` for privacy. Lower accuracy than Whisper but zero latency, no model download, no dependency. | HIGH |
| Transcription (enhanced) | WhisperKit | 0.17.0+ | On-device Whisper via Core ML. Apple Silicon optimized. 5,876 stars, MIT. Significantly better accuracy than SFSpeechRecognizer for long-form/noisy audio. ~100–500 MB model download. macOS 13+, Xcode 16+. | HIGH |
| Logging | OSLog / Logger | macOS 14+ | Apple's native unified logging. `Logger(subsystem:category:)` replaces `print()`. Integrates with Console.app. No library needed. | HIGH |
| Background Scheduling | LaunchAgent (launchd) | macOS 14+ | Already in use. BGTaskScheduler is NOT supported for native macOS apps (AppKit/SwiftUI). LaunchAgents via plist remain the correct pattern for macOS background jobs. | HIGH |

---

## 2. Supporting Libraries (SPM)

| Library | Source | Version | Purpose | Confidence |
|---|---|---|---|---|
| swift-argument-parser | apple/swift-argument-parser | 1.7.0+ | CLI subcommands for DailyBrief tool. Already in use at 1.3.0. Upgrade to 1.7.x for Swift 6 warning fixes. | HIGH |
| GRDB.swift | groue/GRDB.swift | 7.10.0+ | SQLite ORM + FTS5 full-text search. Swift 6.1+ required. Async/await native. Replaces current file-based storage for captures. | HIGH |
| SwiftAnthropic | jamesrochabrun/SwiftAnthropic | 2.1.8+ | Claude API client. Streaming messages, tool use, prompt caching. Swift 6 compatible. Pure URLSession underneath. | HIGH |
| WhisperKit | argmaxinc/WhisperKit | 0.17.0+ | On-device Whisper transcription via Core ML. Must be added as optional — model files are large (~100–500 MB per model). Use "tiny" or "base" for fast capture, "small" for accuracy. | HIGH |
| KeychainAccess | kishikawakatsumi/KeychainAccess | 4.2.2+ | Simple Swift wrapper for macOS/iOS Keychain. Used for storing Claude API key securely instead of plaintext in config. Alternative: use Security framework directly. | MEDIUM |
| swift-collections | apple/swift-collections | 1.1.0+ | `OrderedDictionary`, `Deque` for UI data structures if needed. Lightweight, official Apple SPM package. | MEDIUM |

### Libraries NOT Needed (Explicit Exclusions)

| Library | Why Excluded |
|---|---|
| Combine | Replaced by `@Observable` + Swift Concurrency in Swift 6.2. Do not introduce Combine into new code. |
| RxSwift | Same as Combine — obsolete for new Swift 6 code. |
| Alamofire | URLSession + async/await is sufficient for macOS-native HTTP. Alamofire adds nothing for 2–3 API endpoints. |
| AsyncHTTPClient (SwiftNIO) | Server-side Linux only. Not appropriate for macOS app networking. |
| Realm | Use GRDB instead. Realm has heavier runtime, proprietary syncing complexity. |
| SwiftUI-Introspect | Avoid reaching into AppKit internals unless absolutely necessary. |

---

## 3. Dev Tools

| Tool | Version | Purpose | Confidence |
|---|---|---|---|
| Xcode | 16.3+ | Build, debug, Instruments. Required for WhisperKit (needs Xcode 16.0+). Swift 6.2 toolchain. | HIGH |
| Instruments | Xcode 16.3+ | Time Profiler, Allocations, Hangs profiler for UI responsiveness. | HIGH |
| Swift-DocC | Xcode 16.3+ | In-source documentation for modules. | MEDIUM |
| xcbeautify | latest | Cleaner `xcodebuild` output in terminal. `brew install xcbeautify`. | LOW |
| Periphery | 3.x | Dead code detection. `brew install periphery`. | LOW |

---

## 4. Architecture Pattern

### Recommended: MVVM + Domain Actors (Swift 6)

```
View (SwiftUI, @MainActor)
  └── ViewModel (@Observable, @MainActor)
        └── Domain Services (actors or @MainActor)
              └── Repository layer
                    └── GRDB DatabaseQueue
```

**Key rules for Swift 6.2:**
- All SwiftUI `View` structs and `@Observable` view models run on `@MainActor` by default (new Xcode 26 default).
- Long-running work (transcription, Claude API calls, PDF generation) must be dispatched with `Task { await ... }` or `withTaskGroup`.
- Domain services that touch shared state (DB, audio) should be `actor` types.
- Avoid `nonisolated(unsafe)` except at import boundaries with legacy Apple frameworks.
- No `DispatchQueue.main.async` — use `@MainActor` and `await MainActor.run { }` instead.

**Folder structure (new SwiftUI app target):**
```
Sources/Jarvis/
  App/                  # App entry point, scene setup
  Features/
    Capture/            # Menu bar popover, text + voice capture
    Dashboard/          # Main window, list, search
    Settings/           # Preferences window
    DailyBrief/         # PDF generation orchestration
  Domain/
    Models/             # Capture, Category, TriageResult (plain structs/Codable)
    Services/           # CaptureStore (actor), AIService (actor), TranscriptionService (actor)
  Data/
    Database/           # GRDBStack, migrations, DAO types
    Keychain/           # SecureStorage wrapper
  Integrations/         # Gmail, ServiceNow, MLB, Reminders (existing, migrated)
  Utilities/            # Extensions, Logger
```

---

## 5. Local Data Persistence Decision

**Decision: GRDB.swift over SwiftData**

| Criteria | GRDB.swift | SwiftData | File-based JSON |
|---|---|---|---|
| FTS5 full-text search | Native, first-class | Not supported | Manual implementation |
| Query flexibility | Full SQL + Swift DSL | Limited predicates | None |
| Migration control | Full custom migrations | Lightweight auto only | Manual |
| Swift 6 concurrency | Native async/await, DatabaseActor | Growing pains in 2025 | N/A |
| Performance | Battle-tested, very fast | Slower than Core Data | Fast for small sets |
| Future vector search | sqlite-vec extension possible | Not possible | Not possible |
| Maturity | 9+ years, 7.10.0 | 2023, still evolving | N/A |
| macOS 14 support | Yes (10.15+ minimum) | Yes (macOS 14 minimum) | Yes |

**Recommendation:** Use GRDB for all `Capture` model storage. Keep existing JSON config file for app configuration (it works well). Keep LaunchAgent plists as-is.

**Key GRDB patterns:**
```swift
// Migration setup
var migrator = DatabaseMigrator()
migrator.registerMigration("v1") { db in
    try db.create(table: "capture") { t in
        t.autoIncrementedPrimaryKey("id")
        t.column("body", .text).notNull()
        t.column("category", .text).notNull()
        t.column("createdAt", .datetime).notNull()
        t.column("triageJSON", .text)
    }
    try db.create(virtualTable: "capture_fts", using: FTS5()) { t in
        t.synchronize(withTable: "capture")
        t.column("body")
    }
}

// Async query
let captures = try await dbQueue.read { db in
    try Capture.fetchAll(db)
}
```

---

## 6. Audio Transcription Strategy

### Tiered approach (build order):

**Tier 1 — Ship in v1.0 (SFSpeechRecognizer):**
- `import Speech` + `import AVFoundation`
- `AVAudioEngine` for mic capture → PCM buffers
- `SFSpeechAudioBufferRecognitionRequest` + `SFSpeechRecognizer`
- Set `requiresOnDeviceRecognition = true` for privacy
- No model download, works immediately on macOS 14+
- Adequate for short voice captures (< 60 seconds)
- Limitations: less accurate on accented speech, long-form audio

**Tier 2 — v1.x upgrade (WhisperKit):**
- Add `argmaxinc/WhisperKit` (v0.17.0+) via SPM
- Download model on first use: `WhisperKit(model: "openai_whisper-base")` (~74 MB)
- Use `base` model for speed, `small` for accuracy tradeoff
- Same `AVAudioEngine` pipeline feeds WhisperKit instead
- Apple Silicon optimized via Core ML — runs entirely on-device
- Far better accuracy for ADHD brain dumps (filler words, rambling, accented)

**Note on Apple SpeechAnalyzer (WWDC25):**
Apple's new `SpeechAnalyzer` API was announced at WWDC 2025 and is available in macOS 26 (Tahoe) / iOS 26 only. Since Jarvis targets macOS 14+ (Sonoma), SpeechAnalyzer is NOT available. It becomes relevant only if the deployment target is raised to macOS 26+ in a future version. It offers better accuracy than SFSpeechRecognizer for long-form audio and is already powering Notes and Voice Memos in macOS 26.

---

## 7. PDF Generation Strategy

**Keep current approach (CoreGraphics + CoreText) for the existing DailyBrief CLI.**

For the Jarvis SwiftUI app's PDF export:
- Use `PDFKit` (`PDFDocument`, `PDFPage`) as the primary interface
- For complex layouts: render SwiftUI views into `NSImage` using `ImageRenderer` (macOS 14+), then embed in PDF pages
- `ImageRenderer` approach: `let renderer = ImageRenderer(content: MyView()); renderer.render { size, ctx in ctx.cgContext ... }`
- For the traveler's notebook format, CoreText/CoreGraphics manual layout gives pixel-perfect control — keep it in DailyBrief CLI
- For any new PDF reports from the Jarvis app, `ImageRenderer` + PDFKit is the modern path

---

## 8. Claude API Integration

**Primary recommendation: SwiftAnthropic (jamesrochabrun/SwiftAnthropic)**

Rationale:
- Version 2.1.8+, actively maintained (last PR merged recently as of research date)
- Verified Swift 6.2 beta, 6.1, 6.0, 5.10 compatible
- Zero data race safety errors
- Pure URLSession (no extra networking dependencies)
- Supports: Messages API, streaming (SSE), tool use, prompt caching, vision (multimodal)
- 192 GitHub stars, MIT license

```swift
// Package.swift addition
.package(url: "https://github.com/jamesrochabrun/SwiftAnthropic", from: "2.1.8"),

// Usage
let anthropic = SwiftAnthropic.Anthropic(apiKey: apiKey)
let response = try await anthropic.createMessage(
    model: .claude3Haiku,
    messages: [.init(role: .user, content: .text(prompt))],
    maxTokens: 256
)
```

**Alternative: fumito-ito/AnthropicSwiftSDK (v0.11.0)**
- 218 commits, 22 releases
- Bedrock extension available (AnthropicSwiftSDK-Bedrock)
- Slightly less popular but actively maintained

**Alternative: Direct URLSession (no library)**
- The Anthropic API is a simple REST+JSON API
- If SwiftAnthropic adds overhead or breaks, a 100-line wrapper using URLSession is trivial
- The existing `AIService.swift` already does this — it can remain as-is for the CLI

**Do NOT use:** The existing `AIService.swift` approach of base64-encoding the API key in headers is incorrect — use `x-api-key: {key}` header directly.

---

## 9. Menu Bar App Architecture

**Use `MenuBarExtra` scene (macOS 13+, already in use):**

```swift
@main
struct JarvisApp: App {
    var body: some Scene {
        // Dashboard window
        WindowGroup("Jarvis", id: "dashboard") {
            DashboardView()
        }
        .defaultSize(width: 900, height: 600)

        // Menu bar
        MenuBarExtra("Jarvis", systemImage: "brain.head.profile") {
            MenuBarView()
        }
        .menuBarExtraStyle(.window) // For rich popover UI
    }
}
```

**Key decisions:**
- `.menuBarExtraStyle(.window)` — rich SwiftUI popover (capture UI). `.menu` style for simple dropdowns only.
- Set `LSUIElement = YES` in Info.plist so the app doesn't appear in the Dock (agent app).
- The capture popover must open in < 1 second — use a globally registered keyboard shortcut via `NSEvent.addGlobalMonitorForEvents`.
- For global hotkey (capture from anywhere): use `CGEventTap` or `NSEvent.addGlobalMonitorForEvents(matching: .keyDown)` with a key combination check. Requires Accessibility permission.

**Known limitation:** `MenuBarExtra` lacks native API to programmatically show/hide the popover. Use `MenuBarExtraAccess` package (orchetect/MenuBarExtraAccess) if programmatic control is needed.

---

## 10. Background Processing

**macOS native apps: LaunchAgent + launchd (already in use)**

`BGTaskScheduler` is NOT available for native macOS apps — it is iOS/Catalyst only. The correct macOS pattern:

```xml
<!-- ~/Library/LaunchAgents/com.jarvis.daily-brief.plist -->
<key>ProgramArguments</key>
<array>
    <string>/path/to/DailyBrief</string>
    <string>generate</string>
</array>
<key>StartCalendarInterval</key>
<dict>
    <key>Hour</key><integer>6</integer>
    <key>Minute</key><integer>0</integer>
</dict>
```

For in-process background work (not scheduled), use Swift Concurrency:
```swift
// Long-running task that shouldn't block UI
Task.detached(priority: .background) {
    await captureStore.runNightlyAnalysis()
}
```

**WWDC 2025 note:** Apple announced "Finish tasks in the background" improvements for iOS/iPadOS apps. Still not applicable to macOS native.

---

## 11. Installation Commands

```swift
// Package.swift — full dependency block for Jarvis v1.0
dependencies: [
    // Already present
    .package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.7.0"),

    // Add for Jarvis app
    .package(url: "https://github.com/groue/GRDB.swift.git", from: "7.10.0"),
    .package(url: "https://github.com/jamesrochabrun/SwiftAnthropic.git", from: "2.1.8"),
    .package(url: "https://github.com/argmaxinc/WhisperKit.git", from: "0.17.0"),
    .package(url: "https://github.com/kishikawakatsumi/KeychainAccess.git", from: "4.2.2"),
],

// Jarvis app target
.target(
    name: "Jarvis",
    dependencies: [
        .product(name: "GRDB", package: "GRDB.swift"),
        .product(name: "SwiftAnthropic", package: "SwiftAnthropic"),
        .product(name: "WhisperKit", package: "WhisperKit"),
        .product(name: "KeychainAccess", package: "KeychainAccess"),
    ]
),
```

**Required entitlements for Jarvis.entitlements:**
```xml
<!-- Microphone access (voice capture) -->
<key>com.apple.security.device.audio-input</key><true/>
<!-- Speech recognition -->
<key>com.apple.security.speech-recognition</key><true/>
<!-- Network (Claude API, MLB API) -->
<key>com.apple.security.network.client</key><true/>
<!-- File access for config, GRDB database -->
<key>com.apple.security.files.user-selected.read-write</key><true/>
<!-- Keychain -->
<key>keychain-access-groups</key>
<array><string>$(AppIdentifierPrefix)com.jarvis.app</string></array>
```

---

## 12. Alternatives Considered

### Persistence

| Option | Verdict |
|---|---|
| SwiftData | REJECTED for v1.0. No FTS5, limited query expressiveness, still maturing (slower than Core Data in 2025 benchmarks). Re-evaluate for v2+ if schema is simple. |
| Core Data | REJECTED. More boilerplate than GRDB, no FTS5 native, NSManagedObject is verbose in Swift 6. |
| Raw SQLite (sqlite3) | VIABLE but more work than GRDB. GRDB is essentially a high-quality Swift wrapper with zero overhead. |
| Flat JSON files | ACCEPTABLE for small data sets (config, < 1000 entries). Not acceptable for FTS5 search or pattern analysis. |

### Transcription

| Option | Verdict |
|---|---|
| Whisper API (OpenAI) | REJECTED. Network dependency, cost, privacy violation (voice data to OpenAI). |
| SFSpeechRecognizer only | ACCEPTABLE for v1.0. Ship it, upgrade to WhisperKit in v1.x. |
| WhisperKit only | VIABLE. Adds ~74–500 MB model download on first launch. Use as upgrade path. |
| SpeechAnalyzer | FUTURE. macOS 26+ only. Not available on macOS 14 (Sonoma). |

### Claude API

| Option | Verdict |
|---|---|
| SwiftAnthropic | RECOMMENDED. Best maintained Swift 6 compatible library. |
| AnthropicSwiftSDK (fumito-ito) | ALTERNATIVE. More commits, Bedrock support. |
| AnthropicKit (guitaripod) | VIABLE. Cross-platform, comprehensive. Less popular. |
| Direct URLSession | VIABLE. Keep existing AIService.swift for CLI; use SwiftAnthropic for app. |

### Architecture

| Option | Verdict |
|---|---|
| MVVM + `@Observable` | RECOMMENDED. Clean, idiomatic Swift 6, no library dependencies. |
| TCA (The Composable Architecture) | OVERKILL for single-user app. Significant learning curve. Excellent for teams/testing but adds ~1 MB overhead and complexity. |
| MV Pattern (no ViewModel) | VIABLE for simple screens. Use selectively; `@Observable` makes it practical. |

---

## 13. What NOT to Use

| Technology | Reason |
|---|---|
| Combine | Superseded by `@Observable` + Swift Concurrency. Creates dual-paradigm codebase. |
| `@Published` / `ObservableObject` | Superseded by `@Observable` on macOS 14+. |
| `DispatchQueue.main.async` | Use `@MainActor` / `await MainActor.run {}` instead. |
| `DispatchQueue.global()` | Use `Task.detached` or `withTaskGroup` instead. |
| CocoaPods / Carthage | SPM only. No exceptions. |
| BGTaskScheduler | iOS/Catalyst only. LaunchAgent for macOS. |
| SpeechAnalyzer | macOS 26+ only. Not available on target (macOS 14). |
| AsyncHTTPClient / NIO | Server-side Swift (Linux). Not appropriate for macOS app. |
| NSUserNotificationCenter | Deprecated. Use `UserNotifications` framework. |
| `NSAlert` / AppKit dialogs directly | Use SwiftUI `.alert()` modifier. AppKit interop only when SwiftUI has no equivalent. |
| Firebase / Supabase | Cloud dependency, violates local-first constraint. |

---

## 14. Version Compatibility Matrix

| Technology | Minimum macOS | Swift | Xcode | Notes |
|---|---|---|---|---|
| SwiftUI (@Observable, @Bindable) | 14.0 (Sonoma) | 5.9+ | 15+ | `@Observable` requires macOS 14 |
| SwiftData | 14.0 (Sonoma) | 5.9+ | 15+ | Not recommended; see Alternatives |
| GRDB 7.10.0 | 10.15 | 6.1+ | 16.3+ | Requires Swift 6.1 or newer |
| SwiftAnthropic 2.1.8 | 13.0+ | 5.10+ | 15+ | Swift 6.0/6.1/6.2 verified |
| WhisperKit 0.17.0 | 13.0 | 5.9+ | 16.0+ | Core ML, Apple Silicon |
| SFSpeechRecognizer (on-device) | 10.15 | any | any | On-device model: macOS 13+ |
| SpeechAnalyzer | **26.0 (Tahoe)** | 6.2+ | 26+ | NOT available on macOS 14 target |
| AVAudioEngine | 10.10 | any | any | Stable, no version concerns |
| KeychainAccess 4.2.2 | 10.12 | 5.x+ | any | macOS full support |
| swift-argument-parser 1.7.0 | 10.15 | 5.5+ | any | Swift 6 warning fixes in 1.5+ |
| MenuBarExtra | 13.0 (Ventura) | 5.7+ | 14+ | Already in use |
| LaunchAgent (launchd) | any macOS | N/A | N/A | System-level, no Swift version |
| OSLog / Logger | 11.0 | any | any | Logger class: macOS 11+ |
| PDFKit | 10.13 | any | any | Stable, no version concerns |
| ImageRenderer | 13.0 | 5.7+ | 14+ | SwiftUI → image/PDF |

**Target: macOS 14.0 (Sonoma) as minimum. All recommended libraries are compatible.**

---

## 15. Sources

| Source | Topic | Confidence |
|---|---|---|
| [Swift 6.2 Approachable Concurrency — SwiftLee](https://www.avanderlee.com/concurrency/approachable-concurrency-in-swift-6-2-a-clear-guide/) | Swift 6.2 concurrency | HIGH |
| [Adopting Strict Concurrency — Apple Developer Docs](https://developer.apple.com/documentation/swift/adoptingswift6) | Swift 6 migration | HIGH |
| [Swift 6.2 Approachable Concurrency — InfoQ](https://www.infoq.com/news/2025/08/swift62-approachable-concurrency/) | Swift 6.2 defaults | HIGH |
| [GRDB — Swift Package Index](https://swiftpackageindex.com/groue/GRDB.swift) | GRDB version / compatibility | HIGH |
| [GRDB Introduction — Mintlify](https://www.mintlify.com/groue/GRDB.swift/introduction) | GRDB features, FTS5, async | HIGH |
| [SwiftData vs Core Data 2025 — DistantJob](https://distantjob.com/blog/core-data-vs-swiftdata/) | Persistence comparison | MEDIUM |
| [Should You SwiftData? — BrightDigit](https://brightdigit.com/articles/swiftdata-considerations/) | SwiftData risks | HIGH |
| [WhisperKit — GitHub (argmaxinc)](https://github.com/argmaxinc/WhisperKit) | WhisperKit 0.17.0, stars, docs | HIGH |
| [WhisperKit on macOS — Hel Rabelo](https://www.helrabelo.dev/blog/whisperkit-on-macos-integrating-on-device-ml) | WhisperKit integration guide | HIGH |
| [Apple SpeechAnalyzer — WWDC25 Video](https://developer.apple.com/videos/play/wwdc2025/277/) | SpeechAnalyzer API design | HIGH |
| [SpeechAnalyzer Apple Developer Docs](https://developer.apple.com/documentation/speech/speechanalyzer) | SpeechAnalyzer availability (macOS 26+) | HIGH |
| [Apple SpeechAnalyzer vs Whisper Speed Test — Gigazine](https://gigazine.net/gsc_news/en/20250619-apple-speech-analyzer/) | SpeechAnalyzer performance | MEDIUM |
| [SFSpeechRecognizer — Apple Developer Docs](https://developer.apple.com/documentation/speech/sfspeechrecognizer) | SFSpeechRecognizer API | HIGH |
| [SwiftAnthropic — GitHub (jamesrochabrun)](https://github.com/jamesrochabrun/SwiftAnthropic) | SwiftAnthropic version, compatibility | HIGH |
| [SwiftAnthropic — Swift Package Index](https://swiftpackageindex.com/jamesrochabrun/SwiftAnthropic) | Swift 6.x verified support | HIGH |
| [AnthropicSwiftSDK — Swift Package Index](https://swiftpackageindex.com/fumito-ito/AnthropicSwiftSDK) | Alternative Claude SDK | MEDIUM |
| [AnthropicKit — guitaripod/marcusziade](https://github.com/marcusziade/AnthropicKit) | Alternative Claude SDK | MEDIUM |
| [PDFKit — Apple Developer Docs](https://developer.apple.com/documentation/pdfkit) | PDFKit API | HIGH |
| [Generate PDF from SwiftUI — Medium](https://medium.com/@jakir/generate-pdf-from-swiftui-view-using-pdfkit-6da076600348) | SwiftUI → PDFKit pattern | MEDIUM |
| [MenuBarExtra SwiftUI — Sarunw](https://sarunw.com/posts/swiftui-menu-bar-app/) | MenuBarExtra API | HIGH |
| [macOS Menu Bar Utility — nilcoalescing](https://nilcoalescing.com/blog/BuildAMacOSMenuBarUtilityInSwiftUI/) | Menu bar best practices | HIGH |
| [MenuBarExtraAccess — GitHub (orchetect)](https://github.com/orchetect/MenuBarExtraAccess) | Programmatic menu bar control | MEDIUM |
| [BGTaskScheduler — Apple Developer Docs](https://developer.apple.com/documentation/backgroundtasks/bgtaskscheduler) | BGTaskScheduler NOT on macOS | HIGH |
| [Background Tasks WWDC25 — Apple Developer](https://developer.apple.com/videos/play/wwdc2025/227/) | 2025 background task updates (iOS only) | HIGH |
| [Observation Framework macOS 14 — Sarunw](https://sarunw.com/posts/observation-framework-in-ios17/) | @Observable on macOS 14 | HIGH |
| [Modern MVVM 2025 — Medium](https://medium.com/@minalkewat/modern-mvvm-in-swiftui-2025-the-clean-architecture-youve-been-waiting-for-72a7d576648e) | @Observable MVVM patterns | MEDIUM |
| [OSLog Unified Logging — SwiftLee](https://www.avanderlee.com/debugging/oslog-unified-logging/) | OSLog/Logger best practices | HIGH |
| [swift-argument-parser 1.7.0 — GitHub](https://github.com/apple/swift-argument-parser/releases) | Latest release | HIGH |
| [KeychainAccess — GitHub (kishikawakatsumi)](https://github.com/kishikawakatsumi/KeychainAccess) | Keychain wrapper for macOS | HIGH |
| [AVAudioEngine — Apple Developer Forums](https://developer.apple.com/forums/thread/744990) | Real-time audio capture | HIGH |
| [Implementing Speech-to-Text SwiftUI — Create with Swift](https://www.createwithswift.com/implementing-advanced-speech-to-text-in-your-swiftui-app/) | Full integration example | MEDIUM |

---

*Research date: 2026-03-31*
*Update when: Swift 7 announced, macOS 26 becomes deployment target, or major library version bumps*
