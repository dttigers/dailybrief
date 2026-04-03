import AppKit
import UniformTypeIdentifiers

/// Utility for picking files via NSOpenPanel.
enum FilePicker {

    // MARK: - Single-select

    /// Presents an open panel for the user to select an image file.
    ///
    /// - Returns: The URL of the selected image, or `nil` if the user cancelled.
    @MainActor
    static func pickImage() -> URL? {
        pickFile(
            types: [.jpeg, .png, .gif, .webP],
            message: "Select an image to capture"
        )
    }

    /// Presents an open panel for the user to select an audio file.
    ///
    /// - Returns: The URL of the selected audio file, or `nil` if the user cancelled.
    @MainActor
    static func pickAudioFile() -> URL? {
        pickFile(
            types: [.wav, .mp3, .mpeg4Audio, .aiff],
            message: "Select an audio file to transcribe"
        )
    }

    // MARK: - Multi-select

    /// Presents a multi-select open panel for audio files.
    @MainActor
    static func pickAudioFiles() -> [URL] {
        pickFiles(
            types: [.wav, .mp3, .mpeg4Audio, .aiff],
            message: "Select audio files to transcribe"
        )
    }

    /// Presents a multi-select open panel for image files.
    @MainActor
    static func pickImageFiles() -> [URL] {
        pickFiles(
            types: [.jpeg, .png, .gif, .webP],
            message: "Select images to capture"
        )
    }

    /// Presents a multi-select open panel accepting both audio and image files.
    @MainActor
    static func pickFiles() -> [URL] {
        pickFiles(
            types: [
                .wav, .mp3, .mpeg4Audio, .aiff,
                .jpeg, .png, .gif, .webP, .heic, .tiff, .bmp,
            ],
            message: "Select files to import"
        )
    }

    // MARK: - Private

    @MainActor
    private static func pickFile(types: [UTType], message: String) -> URL? {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = types
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.message = message
        panel.prompt = "Choose"

        let response = panel.runModal()
        return response == .OK ? panel.url : nil
    }

    @MainActor
    private static func pickFiles(types: [UTType], message: String) -> [URL] {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = types
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.message = message
        panel.prompt = "Choose"

        let response = panel.runModal()
        return response == .OK ? Array(panel.urls) : []
    }
}
