import CoreGraphics
@preconcurrency import CoreText
import JarvisCore

struct PDFLayout: Sendable {
    let pageWidth: CGFloat
    let pageHeight: CGFloat
    let contentWidth: CGFloat
    let contentHeight: CGFloat
    let contentX: CGFloat
    let contentY: CGFloat
    let margin: CGFloat
    let innerPadding: CGFloat
    let titleSize: CGFloat
    let headerSize: CGFloat
    let bodySize: CGFloat
    let smallSize: CGFloat
    let tinySize: CGFloat
    let tableRowHeight: CGFloat
    let tableHeaderHeight: CGFloat
    let checkboxSize: CGFloat
    let noteLineSpacing: CGFloat
    let enabledSections: Set<String>

    static func layout(from config: AppConfig.PDFConfig) -> PDFLayout {
        let scale = CGFloat(max(0.75, min(1.5, config.fontScale)))
        let margin = CGFloat(config.marginPoints)

        let pageWidth: CGFloat
        let pageHeight: CGFloat
        let contentWidth: CGFloat
        let contentHeight: CGFloat
        let contentX: CGFloat
        let contentY: CGFloat

        switch config.paperSize {
        case "a5":
            pageWidth = 420
            pageHeight = 595
            contentWidth = pageWidth - 2 * margin
            contentHeight = pageHeight - 2 * margin
            contentX = margin
            contentY = margin
        case "half-letter":
            pageWidth = 396
            pageHeight = 612
            contentWidth = pageWidth - 2 * margin
            contentHeight = pageHeight - 2 * margin
            contentX = margin
            contentY = margin
        case "letter":
            pageWidth = 612
            pageHeight = 792
            contentWidth = pageWidth - 2 * margin
            contentHeight = pageHeight - 2 * margin
            contentX = margin
            contentY = margin
        case "custom":
            pageWidth = CGFloat(config.customWidthInches) * 72
            pageHeight = CGFloat(config.customHeightInches) * 72
            contentWidth = pageWidth - 2 * margin
            contentHeight = pageHeight - 2 * margin
            contentX = margin
            contentY = margin
        default: // "notebook"
            pageWidth = 612
            pageHeight = 792
            contentWidth = 270   // 3.75" * 72
            contentHeight = 540  // 7.5" * 72
            contentX = (pageWidth - 270) / 2
            contentY = (pageHeight - 540) / 2
        }

        return PDFLayout(
            pageWidth: pageWidth,
            pageHeight: pageHeight,
            contentWidth: contentWidth,
            contentHeight: contentHeight,
            contentX: contentX,
            contentY: contentY,
            margin: margin,
            innerPadding: 8 * scale,
            titleSize: 14 * scale,
            headerSize: 10 * scale,
            bodySize: 8 * scale,
            smallSize: 7 * scale,
            tinySize: 6 * scale,
            tableRowHeight: 14 * scale,
            tableHeaderHeight: 16 * scale,
            checkboxSize: 8 * scale,
            noteLineSpacing: 16 * scale,
            enabledSections: Set(config.enabledSections)
        )
    }
}

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

    // Fonts (parameterized for layout-driven sizes)
    static func titleFont(size: CGFloat = titleSize) -> CTFont {
        CTFontCreateWithName("Helvetica-Bold" as CFString, size, nil)
    }
    static func headerFont(size: CGFloat = headerSize) -> CTFont {
        CTFontCreateWithName("Helvetica-Bold" as CFString, size, nil)
    }
    static func bodyFont(size: CGFloat = bodySize) -> CTFont {
        CTFontCreateWithName("Helvetica" as CFString, size, nil)
    }
    static func monoFont(size: CGFloat = smallSize) -> CTFont {
        CTFontCreateWithName("Menlo" as CFString, size, nil)
    }
    static func affirmationFont(size: CGFloat = bodySize) -> CTFont {
        CTFontCreateWithName("Georgia-Italic" as CFString, size, nil)
    }

    // Row heights
    static let tableRowHeight: CGFloat = 14
    static let tableHeaderHeight: CGFloat = 16
    static let checkboxSize: CGFloat = 8
    static let noteLineSpacing: CGFloat = 16
}
