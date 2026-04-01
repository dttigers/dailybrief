import AppKit
import UniformTypeIdentifiers

/// Utility for picking image files via NSOpenPanel.
enum ImagePicker {

    /// Presents an open panel for the user to select an image file.
    ///
    /// - Returns: The URL of the selected image, or `nil` if the user cancelled.
    @MainActor
    static func pickImage() async -> URL? {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.jpeg, .png, .gif, .webP]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.message = "Select an image to capture"
        panel.prompt = "Choose"

        let response = panel.runModal()
        return response == .OK ? panel.url : nil
    }
}
