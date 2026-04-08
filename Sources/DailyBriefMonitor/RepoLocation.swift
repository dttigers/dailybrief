import Foundation

/// Compile-time repo root, baked into the binary via `#filePath`.
/// `#filePath` expands at parse time to the absolute path of THIS source file.
/// Walking up THREE directories from this file lands on the repo root:
///   .../dailybrief/Sources/DailyBriefMonitor/RepoLocation.swift  (#filePath)
///   → .../dailybrief/Sources/DailyBriefMonitor                   (1×)
///   → .../dailybrief/Sources                                     (2×)
///   → .../dailybrief                                             (3×) ← REPO ROOT
///
/// If the repo is moved, the next `./Scripts/install.sh` rebuilds with the
/// new path automatically. Zero config, zero drift surface.
enum RepoLocation {
    /// Absolute path to the dailybrief repo root.
    static let path: String = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<3 { url.deleteLastPathComponent() }
        return url.path
    }()

    /// Absolute path to Scripts/install.sh.
    static var installScript: String {
        (path as NSString).appendingPathComponent("Scripts/install.sh")
    }

    /// Absolute path to .build/release directory.
    static var releaseBuildDir: String {
        (path as NSString).appendingPathComponent(".build/release")
    }
}
