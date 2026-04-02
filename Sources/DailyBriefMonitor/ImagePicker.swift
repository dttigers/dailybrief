import AppKit
import UniformTypeIdentifiers

/// Utility for picking files via NSOpenPanel.
enum FilePicker {

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
}
