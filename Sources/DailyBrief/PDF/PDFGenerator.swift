import CoreGraphics
import CoreText
import Foundation
import JarvisCore

enum PDFGenerator {
    static func generate(data: DailyBriefData, outputPath: String) throws {
        let dir = (outputPath as NSString).deletingLastPathComponent
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)

        let url = URL(fileURLWithPath: outputPath) as CFURL
        let pageRect = CGRect(x: 0, y: 0, width: PDFStyles.pageWidth, height: PDFStyles.pageHeight)

        guard let context = CGContext(url, mediaBox: nil, nil) else {
            throw PDFError.cannotCreateContext
        }

        // Page 1: Work Orders + To Do + Notes
        var mediaBox = pageRect
        context.beginPage(mediaBox: &mediaBox)
        drawDashedBorder(context: context)
        PageOneRenderer.draw(context: context, data: data)
        context.endPage()

        // Page 2: Tigers + Standings + Affirmation + Notes
        context.beginPage(mediaBox: &mediaBox)
        drawDashedBorder(context: context)
        PageTwoRenderer.draw(context: context, data: data)
        context.endPage()

        context.closePDF()
        Logger.log("PDF generated at \(outputPath)")
    }

    private static func drawDashedBorder(context: CGContext) {
        let S = PDFStyles.self
        context.setStrokeColor(S.medGray)
        context.setLineWidth(S.borderLineWidth)
        context.setLineDash(phase: 0, lengths: S.dashPattern)

        let rect = CGRect(x: S.contentX, y: S.contentY, width: S.contentWidth, height: S.contentHeight)
        context.stroke(rect)

        // Reset dash
        context.setLineDash(phase: 0, lengths: [])
    }

    // Convert top-down Y within content area to CG bottom-up Y
    static func cgY(_ topDownY: CGFloat) -> CGFloat {
        PDFStyles.contentY + PDFStyles.contentHeight - topDownY
    }

    static func drawText(_ text: String, at point: CGPoint, font: CTFont, color: CGColor, context: CGContext) {
        let attributes = [
            kCTFontAttributeName: font,
            kCTForegroundColorAttributeName: color
        ] as CFDictionary
        let attrString = CFAttributedStringCreate(nil, text as CFString, attributes)!
        let line = CTLineCreateWithAttributedString(attrString)
        context.textPosition = point
        CTLineDraw(line, context)
    }

    static func drawTextRight(_ text: String, rightX: CGFloat, y: CGFloat, font: CTFont, color: CGColor, context: CGContext) {
        let attributes = [
            kCTFontAttributeName: font,
            kCTForegroundColorAttributeName: color
        ] as CFDictionary
        let attrString = CFAttributedStringCreate(nil, text as CFString, attributes)!
        let line = CTLineCreateWithAttributedString(attrString)
        let width = CTLineGetTypographicBounds(line, nil, nil, nil)
        context.textPosition = CGPoint(x: rightX - width, y: y)
        CTLineDraw(line, context)
    }
}

enum PDFError: LocalizedError {
    case cannotCreateContext
    var errorDescription: String? { "Cannot create PDF context" }
}
