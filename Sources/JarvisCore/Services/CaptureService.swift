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

    /// Captures content from a specific source. Returns the saved Thought with assigned ID.
    ///
    /// - Parameters:
    ///   - content: The text to capture. Must be non-empty after trimming.
    ///   - source: How the content was captured (text, voice, image).
    /// - Throws: `CaptureError.emptyContent` if the trimmed content is empty.
    /// - Returns: The persisted `Thought` with its database-assigned ID.
    @discardableResult
    public func capture(_ content: String, source: CaptureSource) async throws -> Thought {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw CaptureError.emptyContent
        }

        var thought = Thought(content: trimmed, source: source)
        try await store.save(&thought)
        return thought
    }

    /// Captures a text thought. Returns the saved Thought with assigned ID.
    ///
    /// Convenience wrapper around `capture(_:source:)` with `.text` source.
    /// - Parameter content: The text to capture. Must be non-empty after trimming.
    /// - Throws: `CaptureError.emptyContent` if the trimmed content is empty.
    /// - Returns: The persisted `Thought` with its database-assigned ID.
    @discardableResult
    public func captureText(_ content: String) async throws -> Thought {
        try await capture(content, source: .text)
    }
}
