import Foundation

// MARK: - Errors

/// Errors that can occur during thought capture.
public enum CaptureError: Error, LocalizedError {
    /// The content string was empty or contained only whitespace.
    case emptyContent

    public var errorDescription: String? {
        switch self {
        case .emptyContent:
            return "Capture content cannot be empty."
        }
    }
}

// MARK: - CaptureService

/// Service layer for capturing thoughts. Wraps ThoughtStore with capture-specific logic.
public actor CaptureService {

    private let store: ThoughtStore

    /// Creates a CaptureService backed by the given ThoughtStore.
    public init(store: ThoughtStore) {
        self.store = store
    }

    /// Captures a text thought. Returns the saved Thought with assigned ID.
    ///
    /// - Parameter content: The text to capture. Must be non-empty after trimming.
    /// - Throws: `CaptureError.emptyContent` if the trimmed content is empty.
    /// - Returns: The persisted `Thought` with its database-assigned ID.
    @discardableResult
    public func captureText(_ content: String) async throws -> Thought {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw CaptureError.emptyContent
        }

        var thought = Thought(content: trimmed, source: .text)
        try await store.save(&thought)
        return thought
    }
}
