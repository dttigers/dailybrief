#if canImport(AVFoundation)
@preconcurrency import AVFoundation
import Foundation

// MARK: - Errors

/// Errors that can occur during voice recording.
public enum VoiceCaptureError: Error, LocalizedError {
    /// Microphone access was denied by the user.
    case microphoneAccessDenied
    /// Recording failed with an underlying reason.
    case recordingFailed(String)
    /// Attempted to stop recording when not currently recording.
    case notRecording

    public var errorDescription: String? {
        switch self {
        case .microphoneAccessDenied:
            return "Microphone access was denied."
        case .recordingFailed(let reason):
            return "Recording failed: \(reason)"
        case .notRecording:
            return "Not currently recording."
        }
    }
}

// MARK: - VoiceCaptureService

/// Manages audio recording via AVAudioEngine, producing WAV files suitable for WhisperKit transcription.
public actor VoiceCaptureService {

    private let engine = AVAudioEngine()
    private var audioFile: AVAudioFile?
    private var currentFileURL: URL?
    private var recording = false

    public init() {}

    /// Requests microphone access from the user.
    /// - Returns: `true` if access was granted, `false` otherwise.
    public func requestMicrophoneAccess() async -> Bool {
        await withCheckedContinuation { continuation in
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    /// Whether the service is currently recording audio.
    public var isRecording: Bool {
        recording
    }

    /// Starts recording audio from the default input device.
    ///
    /// Audio is captured at 16 kHz mono Float32 (WhisperKit-compatible) and written to a temporary WAV file.
    /// - Throws: `VoiceCaptureError.microphoneAccessDenied` if mic access is not granted,
    ///           `VoiceCaptureError.recordingFailed` if the engine cannot start.
    public func startRecording() throws {
        let inputNode = engine.inputNode
        let hardwareFormat = inputNode.outputFormat(forBus: 0)

        // Build a 16 kHz mono Float32 format for WhisperKit compatibility.
        guard let recordingFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: 16000,
            channels: 1,
            interleaved: false
        ) else {
            throw VoiceCaptureError.recordingFailed("Could not create 16 kHz mono format.")
        }

        // Create temporary WAV file.
        let tempDir = NSTemporaryDirectory()
        let fileName = "voice_capture_\(UUID().uuidString).wav"
        let fileURL = URL(fileURLWithPath: tempDir).appendingPathComponent(fileName)

        do {
            let file = try AVAudioFile(
                forWriting: fileURL,
                settings: recordingFormat.settings,
                commonFormat: .pcmFormatFloat32,
                interleaved: false
            )
            audioFile = file
            currentFileURL = fileURL
        } catch {
            throw VoiceCaptureError.recordingFailed("Could not create audio file: \(error.localizedDescription)")
        }

        // Use a converter if the hardware format differs from our target.
        guard let converter = AVAudioConverter(from: hardwareFormat, to: recordingFormat) else {
            throw VoiceCaptureError.recordingFailed("Could not create audio format converter.")
        }

        let file = audioFile!
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: hardwareFormat) { buffer, _ in
            let frameCapacity = AVAudioFrameCount(
                Double(buffer.frameLength) * recordingFormat.sampleRate / hardwareFormat.sampleRate
            )
            guard let convertedBuffer = AVAudioPCMBuffer(
                pcmFormat: recordingFormat,
                frameCapacity: frameCapacity
            ) else { return }

            var error: NSError?
            let status = converter.convert(to: convertedBuffer, error: &error) { _, outStatus in
                outStatus.pointee = .haveData
                return buffer
            }

            if status == .haveData {
                do {
                    try file.write(from: convertedBuffer)
                } catch {
                    // Silently skip frames that fail to write.
                }
            }
        }

        do {
            try engine.start()
            recording = true
        } catch {
            inputNode.removeTap(onBus: 0)
            throw VoiceCaptureError.recordingFailed("Could not start audio engine: \(error.localizedDescription)")
        }
    }

    /// Stops the current recording and returns the URL of the recorded WAV file.
    /// - Throws: `VoiceCaptureError.notRecording` if no recording is in progress.
    /// - Returns: The file URL of the recorded audio.
    public func stopRecording() throws -> URL {
        guard recording, let fileURL = currentFileURL else {
            throw VoiceCaptureError.notRecording
        }

        engine.inputNode.removeTap(onBus: 0)
        engine.stop()

        audioFile = nil
        currentFileURL = nil
        recording = false

        return fileURL
    }
}
#endif
