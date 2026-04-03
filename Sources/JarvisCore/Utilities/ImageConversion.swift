import AppKit
import Foundation

// MARK: - ImageConversion

/// Shared utility for converting non-native image formats (HEIC, TIFF, BMP) to JPEG.
///
/// Used by FolderWatcherService and DashboardViewModel to normalize images
/// before sending to the AI description service.
public enum ImageConversion {

    /// Image formats that require conversion to JPEG before API submission.
    private static let convertibleExtensions: Set<String> = ["heic", "heif", "tiff", "tif", "bmp"]

    /// Checks whether the file at the given URL needs JPEG conversion.
    ///
    /// - Parameter url: The file URL to check.
    /// - Returns: `true` if the file extension indicates a format that needs conversion.
    public static func needsConversion(_ url: URL) -> Bool {
        convertibleExtensions.contains(url.pathExtension.lowercased())
    }

    /// Converts a non-native image format (HEIC, TIFF, BMP, etc.) to JPEG data.
    ///
    /// Uses CoreGraphics via NSImage/NSBitmapImageRep for the conversion.
    ///
    /// - Parameter url: The file URL of the image to convert.
    /// - Returns: JPEG-encoded `Data` at 85% compression quality.
    /// - Throws: `ImageConversionError.conversionFailed` if the image cannot be loaded or converted.
    public static func convertToJPEG(from url: URL) throws -> Data {
        guard let image = NSImage(contentsOf: url),
              let tiffData = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData),
              let jpegData = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.85]) else {
            throw ImageConversionError.conversionFailed(url.lastPathComponent)
        }
        return jpegData
    }

    // MARK: - Errors

    public enum ImageConversionError: Error, LocalizedError {
        case conversionFailed(String)

        public var errorDescription: String? {
            switch self {
            case .conversionFailed(let filename):
                return "Failed to convert \(filename) to JPEG"
            }
        }
    }
}
