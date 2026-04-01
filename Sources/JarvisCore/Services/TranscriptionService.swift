import Foundation
import WhisperKit

// MARK: - Errors

/// Errors that can occur during audio transcription.
public enum TranscriptionError: Error, LocalizedError {
    /// The WhisperKit model failed to load.
    case modelLoadFailed(String)
    /// Transcription of the audio file failed.
    case transcriptionFailed(String)
    /// Transcription produced no text.
    case emptyResult

    public var errorDescription: String? {
        switch self {
        case .modelLoadFailed(let reason):
            return "Model load failed: \(reason)"
        case .transcriptionFailed(let reason):
            return "Transcription failed: \(reason)"
        case .emptyResult:
            return "Transcription produced no text."
        }
    }
}

// MARK: - TranscriptionService

/// On-device speech-to-text using WhisperKit. Lazy-loads the model on first use.
public actor TranscriptionService {

    // WhisperKit manages its own thread safety internally.
    nonisolated(unsafe) private var whisperKit: WhisperKit?

    public init() {}

    /// Loads the WhisperKit model if not already loaded.
    ///
    /// Uses the default (smallest) model which auto-downloads on first run.
    /// Subsequent calls are no-ops.
    public func loadModel() async throws {
        guard whisperKit == nil else { return }

        do {
            whisperKit = try await WhisperKit()
        } catch {
            throw TranscriptionError.modelLoadFailed(error.localizedDescription)
        }
    }

    /// Transcribes audio from a file URL to text.
    ///
    /// Loads the model on first call if needed.
    /// - Parameter audioURL: URL of the audio file (WAV, 16 kHz mono recommended).
    /// - Returns: The transcribed text, trimmed of whitespace.
    /// - Throws: `TranscriptionError` if the model fails to load, transcription fails, or result is empty.
    public func transcribe(audioURL: URL) async throws -> String {
        try await loadModel()

        guard let kit = whisperKit else {
            throw TranscriptionError.modelLoadFailed("WhisperKit instance is nil after loading.")
        }

        let results: [TranscriptionResult]
        do {
            results = try await kit.transcribe(audioPath: audioURL.path())
        } catch {
            throw TranscriptionError.transcriptionFailed(error.localizedDescription)
        }

        let text = results
            .compactMap { $0.text }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !text.isEmpty else {
            throw TranscriptionError.emptyResult
        }

        return text
    }
}
