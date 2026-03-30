import CoreGraphics
@preconcurrency import CoreText

enum PDFStyles {
    // Page dimensions (US Letter)
    static let pageWidth: CGFloat = 612
    static let pageHeight: CGFloat = 792

    // Content area (3.75" x 7.5" portrait for notebook, trimmed from 4x8)
    static let contentWidth: CGFloat = 270   // 3.75 inches * 72 dpi
    static let contentHeight: CGFloat = 540  // 7.5 inches * 72 dpi

    // Content area origin (centered on page)
    static let contentX: CGFloat = (pageWidth - contentWidth) / 2
    static let contentY: CGFloat = (pageHeight - contentHeight) / 2

    // Margins within content area
    static let margin: CGFloat = 12
    static let innerPadding: CGFloat = 8

    // Dashed border
    static let dashPattern: [CGFloat] = [6, 4]
    static let borderLineWidth: CGFloat = 0.5

    // Colors (grayscale for B&W printing)
    static let black = CGColor(gray: 0, alpha: 1)
    static let darkGray = CGColor(gray: 0.3, alpha: 1)
    static let medGray = CGColor(gray: 0.5, alpha: 1)
    static let lightGray = CGColor(gray: 0.8, alpha: 1)
    static let veryLightGray = CGColor(gray: 0.92, alpha: 1)

    // Font sizes
    static let titleSize: CGFloat = 14
    static let headerSize: CGFloat = 10
    static let bodySize: CGFloat = 8
    static let smallSize: CGFloat = 7
    static let tinySize: CGFloat = 6

    // Fonts
    static func titleFont() -> CTFont {
        CTFontCreateWithName("Helvetica-Bold" as CFString, titleSize, nil)
    }
    static func headerFont() -> CTFont {
        CTFontCreateWithName("Helvetica-Bold" as CFString, headerSize, nil)
    }
    static func bodyFont() -> CTFont {
        CTFontCreateWithName("Helvetica" as CFString, bodySize, nil)
    }
    static func monoFont() -> CTFont {
        CTFontCreateWithName("Menlo" as CFString, smallSize, nil)
    }
    static func affirmationFont() -> CTFont {
        CTFontCreateWithName("Georgia-Italic" as CFString, bodySize, nil)
    }

    // Row heights
    static let tableRowHeight: CGFloat = 14
    static let tableHeaderHeight: CGFloat = 16
    static let checkboxSize: CGFloat = 8
    static let noteLineSpacing: CGFloat = 16
}
