import Foundation

/// Lightweight snapshot of a daily brief for history tracking.
/// Captures counts and summaries — not full thought content.
public struct BriefSnapshot: Codable, Sendable {
    public var date: String  // YYYY-MM-DD
    public var summary: BriefSummary
    public var pdfFilename: String?
    public var thoughtCount: Int
    public var taskCount: Int

    public init(
        date: String,
        summary: BriefSummary,
        pdfFilename: String? = nil,
        thoughtCount: Int,
        taskCount: Int
    ) {
        self.date = date
        self.summary = summary
        self.pdfFilename = pdfFilename
        self.thoughtCount = thoughtCount
        self.taskCount = taskCount
    }

    /// Summary metadata for a daily brief — counts, categories, and highlights.
    public struct BriefSummary: Codable, Sendable {
        public var categoryCounts: [String: Int]
        public var openTaskCount: Int
        public var topTaskSummaries: [String]
        public var hasTherapyData: Bool
        public var sportsSummary: String?
        public var affirmation: String
        public var calendarEventCount: Int
        public var workOrderCount: Int

        public init(
            categoryCounts: [String: Int],
            openTaskCount: Int,
            topTaskSummaries: [String],
            hasTherapyData: Bool,
            sportsSummary: String? = nil,
            affirmation: String,
            calendarEventCount: Int,
            workOrderCount: Int
        ) {
            self.categoryCounts = categoryCounts
            self.openTaskCount = openTaskCount
            self.topTaskSummaries = topTaskSummaries
            self.hasTherapyData = hasTherapyData
            self.sportsSummary = sportsSummary
            self.affirmation = affirmation
            self.calendarEventCount = calendarEventCount
            self.workOrderCount = workOrderCount
        }
    }
}

/// API response for a saved brief record.
public struct BriefRecord: Codable, Sendable {
    public var id: Int
    public var date: String
    public var summary: BriefSnapshot.BriefSummary?
    public var pdfFilename: String?
    public var thoughtCount: Int
    public var taskCount: Int
    public var createdAt: String

    public init(
        id: Int,
        date: String,
        summary: BriefSnapshot.BriefSummary? = nil,
        pdfFilename: String? = nil,
        thoughtCount: Int,
        taskCount: Int,
        createdAt: String
    ) {
        self.id = id
        self.date = date
        self.summary = summary
        self.pdfFilename = pdfFilename
        self.thoughtCount = thoughtCount
        self.taskCount = taskCount
        self.createdAt = createdAt
    }
}
