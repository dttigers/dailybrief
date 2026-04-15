import XCTest
@testable import DailyBriefMonitor

// MARK: - StatusCheckerTests
//
// Strategy A (per 86-06 plan): StatusChecker gains a parameterized internal
// initializer `init(logPath:pdfDir:configPath:cliBinary:)`. These tests point
// it at a unique temp log file, write fixture content, trigger refresh(),
// and assert on the inferred state. Chosen because the init widening was
// only ~15 lines vs. extracting a pure parser — minimal production-code
// change and exercises the real refresh() control flow including the
// file-exists guard and reversed-lines walk.
//
// Coverage (all six required by the plan):
//   1. Success log       → exit 0
//   2. No-brief-for-today → exit 2 (stale)
//   3. ERROR             → exit 1 (non-stale failure)
//   4. Starting only     → exit 1 with "(crashed?)" suffix
//   5. Most-recent marker wins when multiple markers are present
//   6. Empty log preserves prior lastExitCode (runNow() race guard)

final class StatusCheckerTests: XCTestCase {

    private var tempLogPath: String!

    override func setUp() {
        super.setUp()
        let dir = NSTemporaryDirectory()
        tempLogPath = (dir as NSString)
            .appendingPathComponent("statuschecker-test-\(UUID().uuidString).log")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(atPath: tempLogPath)
        super.tearDown()
    }

    // MARK: Helpers

    private func writeLog(_ content: String) {
        try? content.write(toFile: tempLogPath, atomically: true, encoding: .utf8)
    }

    /// Creates a StatusChecker pointed at the temp log. Init calls refresh() automatically.
    private func makeChecker() -> StatusChecker {
        StatusChecker(logPath: tempLogPath)
    }

    // MARK: 1. Success log → exit 0

    func testSuccessLogInfersExitZero() {
        writeLog("[2026-04-15 04:02:11] [INFO] DailyBrief complete\n")
        let c = makeChecker()
        XCTAssertEqual(c.lastExitCode, 0)
        XCTAssertEqual(c.lastRunSuccess, true)
        XCTAssertFalse(c.isStale)
        XCTAssertFalse(c.didFailNonStale)
        XCTAssertEqual(c.lastRunTime, "2026-04-15 04:02:11")
    }

    // MARK: 2. No brief for today → exit 2 (stale)

    func testNoBriefForTodayLogInfersExitTwo() {
        writeLog("[2026-04-15 04:02:11] [INFO] No brief for today (2026-04-15)\n")
        let c = makeChecker()
        XCTAssertEqual(c.lastExitCode, 2)
        XCTAssertEqual(c.lastRunSuccess, false)
        XCTAssertTrue(c.isStale, "exit 2 must flip isStale true")
        XCTAssertFalse(c.didFailNonStale, "exit 2 is NOT a non-stale failure")
    }

    // MARK: 3. ERROR → exit 1 (non-stale failure)

    func testErrorLogInfersExitOne() {
        writeLog("[2026-04-15 04:02:11] [ERROR] Brief fetch failed: timeout\n")
        let c = makeChecker()
        XCTAssertEqual(c.lastExitCode, 1)
        XCTAssertEqual(c.lastRunSuccess, false)
        XCTAssertFalse(c.isStale)
        XCTAssertTrue(c.didFailNonStale, "exit 1 must flip didFailNonStale true")
    }

    // MARK: 4. Starting without complete → exit 1 with "(crashed?)"

    func testStartingWithoutCompleteInfersExitOne() {
        writeLog("[2026-04-15 04:02:11] [INFO] DailyBrief starting\n")
        let c = makeChecker()
        XCTAssertEqual(c.lastExitCode, 1)
        XCTAssertEqual(c.lastRunSuccess, false)
        XCTAssertTrue(c.lastRunTime.contains("(crashed?)"),
                      "lastRunTime should carry the crashed? suffix, got \(c.lastRunTime)")
        XCTAssertTrue(c.didFailNonStale)
    }

    // MARK: 5. Most-recent marker wins in reverse walk

    func testMostRecentMarkerWinsInReverseWalk() {
        // Earlier success followed by later staleness — reverse walk hits "No brief for today" first.
        let log = """
        [2026-04-14 04:02:11] [INFO] DailyBrief starting
        [2026-04-14 04:02:12] [INFO] DailyBrief complete
        [2026-04-15 04:02:11] [INFO] DailyBrief starting
        [2026-04-15 04:02:11] [INFO] No brief for today (2026-04-15)

        """
        writeLog(log)
        let c = makeChecker()
        XCTAssertEqual(c.lastExitCode, 2, "most recent marker (staleness) must win")
        XCTAssertEqual(c.lastRunSuccess, false)
        XCTAssertTrue(c.isStale)
    }

    // MARK: 6. Empty/whitespace log preserves prior lastExitCode (runNow() race guard)

    func testNoMarkersPreservesPriorExitCode() {
        writeLog("") // create the file so file-exists guard passes
        let c = makeChecker() // init refresh() sees no markers → leaves lastExitCode nil
        XCTAssertNil(c.lastExitCode)

        // Simulate runNow() writing lastExitCode BEFORE the log flushes,
        // then refresh() running against the still-empty log.
        c.lastExitCode = 0
        c.refresh()
        XCTAssertEqual(c.lastExitCode, 0,
                       "'no markers found' branch must NOT reset lastExitCode to nil")
        XCTAssertEqual(c.lastRunTime, "No runs found")
    }
}
