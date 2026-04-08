import Foundation

@Observable
final class UpdateService: @unchecked Sendable {
    // MARK: Observable state
    var status: UpdateStatus = .idle
    var isRunning: Bool = false
    var lastOutcomeAt: Date? = nil
    var lastSHA: String? = nil  // for "Installed: abc1234 • 2s ago" display

    // MARK: Paths
    private let logPath = NSString("~/Library/Logs/DailyBrief/update.log").expandingTildeInPath
    private let handoffDir = NSString("~/Library/Application Support/DailyBrief").expandingTildeInPath
    private let handoffPath = NSString("~/Library/Application Support/DailyBrief/last-update.json").expandingTildeInPath
    private let helperPath = "/tmp/vigil-reload.sh"
    private let launchAgentLabel = "com.jamesonmorrill.dailybriefmonitor"

    // MARK: Public entry point (called by MenuBarView "Update Vigil" button)
    func updateNow() {
        guard !isRunning else { return }
        isRunning = true
        status = .running

        Task.detached { [self] in
            let outcome = await runUpdateLifecycle()
            await MainActor.run { [weak self] in
                guard let self = self else { return }
                self.isRunning = false
                self.lastOutcomeAt = Date()
                self.status = outcome
            }
        }
    }

    // MARK: Handoff consumption (called once by AppDelegate on launch — Plan 03)
    func consumeHandoff() {
        guard FileManager.default.fileExists(atPath: handoffPath),
              let data = try? Data(contentsOf: URL(fileURLWithPath: handoffPath)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }
        // Always delete the file before any error handling (Pitfall 4)
        try? FileManager.default.removeItem(atPath: handoffPath)

        let outcomeStr = json["outcome"] as? String ?? "unknown"
        let sha = json["sha"] as? String ?? ""
        if outcomeStr == "updated" && !sha.isEmpty {
            self.status = .updated(sha: sha)
            self.lastSHA = sha
            self.lastOutcomeAt = Date()
        } else if outcomeStr == "upToDate" {
            self.status = .upToDate
            self.lastOutcomeAt = Date()
        } else if outcomeStr == "failed" {
            let tail = json["tail"] as? String ?? "Update failed"
            self.status = .failed(tail: tail)
            self.lastOutcomeAt = Date()
        }
    }

    // MARK: Update lifecycle (private)
    private func runUpdateLifecycle() async -> UpdateStatus {
        // STEP 1: swift build -c release (D-05)
        let buildResult = runProcess(
            executable: "/usr/bin/env",
            args: ["swift", "build", "-c", "release"],
            cwd: RepoLocation.path
        )
        appendToUpdateLog("=== swift build -c release ===\n\(buildResult.output)\n")
        if buildResult.exitCode != 0 {
            return .failed(tail: lastNLines(buildResult.output, 20))
        }

        // STEP 2: mtime gate (D-06) — installed >= build → no-op
        if installedBinariesAreFresh() {
            appendToUpdateLog("=== mtime gate: installed binaries are fresh — skipping inline install ===\n")
            return .upToDate
        }

        // STEP 3: inline binary install (supersedes Scripts/install_sh subprocess — see 51-04-PLAN.md DR-01)
        // We MUST NOT call Scripts/install_sh from inside the managed launchd process — its
        // `launchctl bootout` on line 95 SIGTERMs this very process. The trampoline
        // (spawnDetachedReloadHelper) is the ONLY thing allowed to touch launchctl.
        let copyResult = installBuiltBinaries()
        appendToUpdateLog("=== inline install (cp .build/release → ~/.local/bin) ===\n\(copyResult.output)\n")
        if !copyResult.success {
            return .failed(tail: copyResult.output)
        }

        // STEP 4: capture git SHA (D-07) — display only, never used for no-op
        let sha = currentGitSHA() ?? "unknown"
        self.lastSHA = sha

        // STEP 5: write handoff JSON (D-04)
        appendToUpdateLog("=== writeHandoff ===\nsha=\(sha) outcome=updated\n")
        writeHandoff(sha: sha, outcome: "updated")

        // STEP 6: spawn detached reload helper + exit (D-02/D-03)
        spawnDetachedReloadHelper()
        // exit(0) lets launchd KeepAlive (SuccessfulExit=false) respawn the new binary.
        // Must be on main thread; the Task.detached caller hops to MainActor before this.
        await MainActor.run {
            exit(0)
        }
        // Unreachable, but the compiler needs a return.
        return .updated(sha: sha)
    }

    // MARK: Helpers

    private func runProcess(executable: String, args: [String], cwd: String) -> (exitCode: Int32, output: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = args
        process.currentDirectoryURL = URL(fileURLWithPath: cwd)
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe  // merge into single stream for log file
        do {
            try process.run()
        } catch {
            return (-1, "Failed to spawn \(executable): \(error.localizedDescription)")
        }
        process.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let output = String(data: data, encoding: .utf8) ?? ""
        return (process.terminationStatus, output)
    }

    /// Inline replacement for the cp steps formerly delegated to a shell installer.
    /// Safe to call from inside the managed launchd process because it does NOT touch launchctl.
    /// The trampoline (spawnDetachedReloadHelper) handles respawn via `launchctl kickstart -k`.
    private func installBuiltBinaries() -> (success: Bool, output: String) {
        let releaseDir = RepoLocation.releaseBuildDir
        let installDir = NSString("~/.local/bin").expandingTildeInPath
        var log = ""

        // Ensure ~/.local/bin exists (parity with `mkdir -p`)
        do {
            try FileManager.default.createDirectory(
                atPath: installDir,
                withIntermediateDirectories: true,
                attributes: nil
            )
        } catch {
            return (false, "Failed to create \(installDir): \(error.localizedDescription)")
        }

        for binary in ["DailyBrief", "DailyBriefMonitor"] {
            let src = (releaseDir as NSString).appendingPathComponent(binary)
            let dst = (installDir as NSString).appendingPathComponent(binary)

            guard FileManager.default.fileExists(atPath: src) else {
                return (false, log + "\nMissing source binary: \(src)")
            }

            // FileManager.copyItem fails if dst exists — remove first (parity with `cp -f`)
            if FileManager.default.fileExists(atPath: dst) {
                do {
                    try FileManager.default.removeItem(atPath: dst)
                } catch {
                    return (false, log + "\nFailed to remove existing \(dst): \(error.localizedDescription)")
                }
            }

            do {
                try FileManager.default.copyItem(atPath: src, toPath: dst)
                log += "Installed \(binary): \(src) → \(dst)\n"
            } catch {
                return (false, log + "\nFailed to copy \(binary): \(error.localizedDescription)")
            }
        }

        return (true, log)
    }

    private func installedBinariesAreFresh() -> Bool {
        let releaseDir = RepoLocation.releaseBuildDir
        let buildBins = ["DailyBrief", "DailyBriefMonitor"].map { (releaseDir as NSString).appendingPathComponent($0) }
        let installBins = ["DailyBrief", "DailyBriefMonitor"].map { NSString(string: "~/.local/bin/\($0)").expandingTildeInPath }
        return zip(buildBins, installBins).allSatisfy { build, installed in
            guard let bm = mtime(build), let im = mtime(installed) else { return false }
            return im >= bm  // installed is newer-or-equal → already fresh (Pitfall 2: equality bias)
        }
    }

    private func mtime(_ path: String) -> Date? {
        (try? FileManager.default.attributesOfItem(atPath: path)[.modificationDate]) as? Date
    }

    private func currentGitSHA() -> String? {
        let result = runProcess(
            executable: "/usr/bin/git",
            args: ["rev-parse", "--short", "HEAD"],
            cwd: RepoLocation.path
        )
        guard result.exitCode == 0 else { return nil }
        return result.output.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func writeHandoff(sha: String, outcome: String) {
        // Application Support/DailyBrief does NOT pre-exist (Pitfall 5)
        try? FileManager.default.createDirectory(
            atPath: handoffDir,
            withIntermediateDirectories: true,
            attributes: nil
        )
        let payload: [String: Any] = [
            "sha": sha,
            "timestamp": ISO8601DateFormatter().string(from: Date()),
            "outcome": outcome
        ]
        if let data = try? JSONSerialization.data(withJSONObject: payload, options: .prettyPrinted) {
            try? data.write(to: URL(fileURLWithPath: handoffPath))
        }
    }

    private func spawnDetachedReloadHelper() {
        // Pattern 3: detached child that survives parent exit(0)
        let helperBody = """
        #!/bin/bash
        sleep 1
        launchctl kickstart -k gui/$(id -u)/\(launchAgentLabel)
        """
        try? helperBody.write(toFile: helperPath, atomically: true, encoding: .utf8)
        _ = chmod(helperPath, 0o755)

        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/bash")
        p.arguments = [helperPath]
        // CRITICAL: disconnect stdio so parent's exit(0) doesn't propagate via SIGPIPE
        p.standardInput = FileHandle.nullDevice
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        try? p.run()
        // DO NOT call p.waitUntilExit() — return immediately.
        // DO NOT retain `p` past this scope.
    }

    private func appendToUpdateLog(_ text: String) {
        // ~/Library/Logs/DailyBrief/ already exists (verified in RESEARCH)
        let url = URL(fileURLWithPath: logPath)
        let stamped = "[\(ISO8601DateFormatter().string(from: Date()))]\n\(text)\n"
        if let handle = try? FileHandle(forWritingTo: url) {
            try? handle.seekToEnd()
            try? handle.write(contentsOf: Data(stamped.utf8))
            try? handle.close()
        } else {
            try? stamped.write(to: url, atomically: true, encoding: .utf8)
        }
    }

    private func lastNLines(_ output: String, _ n: Int) -> String {
        let lines = output.split(separator: "\n", omittingEmptySubsequences: false)
        return lines.suffix(n).joined(separator: "\n")
    }

    var logFilePath: String { logPath }
}
