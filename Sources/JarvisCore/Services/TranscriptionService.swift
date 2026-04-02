import Foundation
import Speech

// MARK: - Errors

/// Errors that can occur during audio transcription.
public enum TranscriptionError: Error, LocalizedError {
    /// Speech recognition is not available on this device.
    case notAvailable
    /// The user denied speech recognition authorization.
    case notAuthorized
    /// Transcription of the audio file failed.
    case transcriptionFailed(String)
    /// Transcription produced no text.
    case emptyResult

    public var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "Speech recognition is not available."
        case .notAuthorized:
            return "Speech recognition access was denied."
        case .transcriptionFailed(let reason):
            return "Transcription failed: \(reason)"
        case .emptyResult:
            return "Transcription produced no text."
        }
    }
}

// MARK: - TranscriptionService

/// On-device speech-to-text using Apple's SFSpeechRecognizer.
public actor TranscriptionService {

    public init() {}

    /// Requests speech recognition authorization if not already granted.
    public func requestAuthorization() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }

    /// Transcribes audio from a file URL to text.
    ///
    /// - Parameter audioURL: URL of the audio file (WAV, MP3, M4A, AIFF supported).
    /// - Returns: The transcribed text, trimmed of whitespace.
    /// - Throws: `TranscriptionError` if recognition fails or result is empty.
    public func transcribe(audioURL: URL) async throws -> String {
        guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
            throw TranscriptionError.notAvailable
        }

        let authorized = await requestAuthorization()
        guard authorized else {
            throw TranscriptionError.notAuthorized
        }

        let didAccess = audioURL.startAccessingSecurityScopedResource()
        defer { if didAccess { audioURL.stopAccessingSecurityScopedResource() } }

        let request = SFSpeechURLRecognitionRequest(url: audioURL)
        request.shouldReportPartialResults = false

        let text: String = try await withCheckedThrowingContinuation { continuation in
            recognizer.recognitionTask(with: request) { result, error in
                if let error {
                    continuation.resume(throwing: TranscriptionError.transcriptionFailed(error.localizedDescription))
                } else if let result, result.isFinal {
                    let formatted = result.bestTranscription.formattedString
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    continuation.resume(returning: formatted)
                }
            }
        }

        guard !text.isEmpty else {
            throw TranscriptionError.emptyResult
        }

        return text
    }
}
