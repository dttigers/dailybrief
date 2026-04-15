import Foundation

@Observable
final class BriefScheduler: @unchecked Sendable {
    var isScheduleEnabled: Bool = true {
        didSet {
            if isScheduleEnabled {
                scheduleNextRun()
            } else {
                cancelTimer()
            }
        }
    }

    var nextRunTime: Date? {
        return scheduledFireDate
    }

    private var timer: Timer?
    private var scheduledFireDate: Date?
    private var scheduledHour: Int
    private var scheduledMinute: Int
    private weak var checker: StatusChecker?

    init(checker: StatusChecker, hour: Int = 6, minute: Int = 0) {
        self.checker = checker
        self.scheduledHour = hour
        self.scheduledMinute = minute
        scheduleNextRun()
    }

    func reschedule(hour: Int, minute: Int) {
        scheduledHour = hour
        scheduledMinute = minute
        if isScheduleEnabled {
            scheduleNextRun()
        }
    }

    /// Reschedules with new time AND enabled state in one call.
    /// Used by the on-launch API fetch to apply the server-stored schedule atomically.
    func reschedule(hour: Int, minute: Int, enabled: Bool) {
        scheduledHour = hour
        scheduledMinute = minute
        // Setting isScheduleEnabled triggers the didSet — either scheduleNextRun() or cancelTimer()
        isScheduleEnabled = enabled
    }

    // MARK: - Private

    private func scheduleNextRun() {
        cancelTimer()

        // If today's brief was already generated, skip to tomorrow
        let alreadyRanToday = hasRunToday()

        let calendar = Calendar.current
        let now = Date()

        guard let nextDate = calendar.nextDate(
            after: now,
            matching: DateComponents(hour: scheduledHour, minute: scheduledMinute),
            matchingPolicy: .nextTime
        ) else { return }

        // If the computed next date is today but we already ran today, push to tomorrow
        var fireDate = nextDate
        if alreadyRanToday && calendar.isDateInToday(nextDate) {
            if let tomorrow = calendar.date(byAdding: .day, value: 1, to: nextDate) {
                fireDate = tomorrow
            }
        }

        scheduledFireDate = fireDate
        let interval = fireDate.timeIntervalSince(now)

        let newTimer = Timer(timeInterval: max(interval, 1), repeats: false) { [weak self] _ in
            self?.timerFired()
        }
        RunLoop.main.add(newTimer, forMode: .common)
        timer = newTimer
    }

    private func timerFired() {
        checker?.runNow()
        // Reschedule for the next day
        scheduleNextRun()
    }

    private func cancelTimer() {
        timer?.invalidate()
        timer = nil
        scheduledFireDate = nil
    }

    private func hasRunToday() -> Bool {
        guard let checker = checker else { return false }
        let lastRun = checker.lastRunTime
        // Check if lastRunTime contains today's date string
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let todayString = formatter.string(from: Date())
        return lastRun.contains(todayString)
    }
}
