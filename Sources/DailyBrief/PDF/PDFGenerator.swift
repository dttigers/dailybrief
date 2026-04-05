import CoreGraphics
import CoreText
import Foundation
import JarvisCore

enum PDFGenerator {
    static func generate(data: DailyBriefData, outputPath: String, layout: PDFLayout) throws {
        let dir = (outputPath as NSString).deletingLastPathComponent
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)

        let url = URL(fileURLWithPath: outputPath) as CFURL
        let pageRect = CGRect(x: 0, y: 0, width: layout.pageWidth, height: layout.pageHeight)

        guard let context = CGContext(url, mediaBox: nil, nil) else {
            throw PDFError.cannotCreateContext
        }

        // Page 1: Work Orders + To Do + Notes
        var mediaBox = pageRect
        context.beginPage(mediaBox: &mediaBox)
        drawDashedBorder(context: context, layout: layout)
        PageOneRenderer.draw(context: context, data: data, layout: layout)
        context.endPage()

        // Page 2: Sports + Affirmation + Notes
        context.beginPage(mediaBox: &mediaBox)
        drawDashedBorder(context: context, layout: layout)
        PageTwoRenderer.draw(context: context, data: data, layout: layout)
        context.endPage()

        // Page 3: Captured Thoughts (only if there are any and relevant sections enabled)
        let hasThoughts = !data.unprocessedThoughts.isEmpty || !data.taskThoughts.isEmpty || !data.recentThoughts.isEmpty
        let hasPageThreeSections = !layout.enabledSections.isDisjoint(with: ["thoughts", "insights", "therapyPrep"])
        if hasThoughts && hasPageThreeSections {
            context.beginPage(mediaBox: &mediaBox)
            drawDashedBorder(context: context, layout: layout)
            PageThreeRenderer.draw(context: context, data: data, layout: layout)
            context.endPage()
        }

        context.closePDF()
        Logger.log("PDF generated at \(outputPath)")
    }

    private static func drawDashedBorder(context: CGContext, layout: PDFLayout) {
        let S = PDFStyles.self
        context.setStrokeColor(S.medGray)
        context.setLineWidth(S.borderLineWidth)
        context.setLineDash(phase: 0, lengths: S.dashPattern)

        let rect = CGRect(x: layout.contentX, y: layout.contentY, width: layout.contentWidth, height: layout.contentHeight)
        context.stroke(rect)

        // Reset dash
        context.setLineDash(phase: 0, lengths: [])
    }

    // Convert top-down Y within content area to CG bottom-up Y
    static func cgY(_ topDownY: CGFloat, layout: PDFLayout) -> CGFloat {
        layout.contentY + layout.contentHeight - topDownY
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
