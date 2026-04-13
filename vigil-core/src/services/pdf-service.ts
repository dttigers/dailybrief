// PDF rendering service — produces a 3-page daily brief PDF using PDFKit.
// Security: Caps work orders to 6, task thoughts to 8, calendar events to 8 (T-75-01).
// Text rendering uses doc.text() which handles encoding (T-75-03).

import PDFDocument from "pdfkit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BriefRenderData,
  BriefWorkOrder,
  PdfConfig,
  PdfLayout,
  computeLayout,
  DEFAULT_PDF_CONFIG,
} from "./pdf-types.js";

// ── Brand colors ──────────────────────────────────────────────────────────────

const COLORS = {
  vigilTeal: "#2C7A7B",
  bodyText: "#2C2C2A", // Warm Gray 900
  subtext: "#6B6B68", // Warm Gray 500
  divider: "#D9D9D5", // Warm Gray 200
  rowBg: "#F2F2EE", // Warm Gray 100
  statusOpen: "#3B82F6", // Blue
  statusInProgress: "#F59E0B", // Amber
  statusDone: "#10B981", // Green
};

// ── DI factory ────────────────────────────────────────────────────────────────

export interface PdfRendererDeps {
  fontsDir?: string;
  nowFn?: () => Date;
}

export function createPdfRenderer(deps: PdfRendererDeps = {}) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const fontsDir =
    deps.fontsDir ?? path.resolve(__dirname, "../../assets/fonts");
  const nowFn = deps.nowFn ?? (() => new Date());

  async function renderBrief(
    data: BriefRenderData,
    config: PdfConfig = DEFAULT_PDF_CONFIG
  ): Promise<Buffer> {
    void nowFn(); // consumed if needed for future date-stamping
    const layout = computeLayout(config);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: [layout.pageW, layout.pageH],
        autoFirstPage: false,
        margin: 0,
      });

      doc.registerFont(
        "Inter-Regular",
        path.join(fontsDir, "Inter-Regular.ttf")
      );
      doc.registerFont(
        "Inter-Medium",
        path.join(fontsDir, "Inter-Medium.ttf")
      );

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Page 1
      doc.addPage({ size: [layout.pageW, layout.pageH], margin: 0 });
      drawPageOne(doc, data, layout);

      // Page 2 (stub — filled in Plan 02)
      doc.addPage({ size: [layout.pageW, layout.pageH], margin: 0 });

      // Page 3 (stub — filled in Plan 02)
      doc.addPage({ size: [layout.pageW, layout.pageH], margin: 0 });

      doc.end();
    });
  }

  return { renderBrief };
}

// ── Page 1 renderer ───────────────────────────────────────────────────────────

function drawPageOne(
  doc: PDFKit.PDFDocument,
  data: BriefRenderData,
  layout: PdfLayout
): void {
  const { leftX, rightEdge, usableWidth, contentBottom } = layout;
  let y = layout.margin + 4;

  // ── Date header (D-11) ────────────────────────────────────────────────────

  doc
    .font("Inter-Medium")
    .fontSize(layout.titleSize)
    .fillColor(COLORS.vigilTeal)
    .text("Vigil Daily Brief", leftX, y, { lineBreak: false });

  y += layout.titleSize + 2;

  const dateStr = formatDate(data.date);
  doc
    .font("Inter-Regular")
    .fontSize(layout.bodySize)
    .fillColor(COLORS.subtext)
    .text(dateStr, leftX, y, { lineBreak: false });

  y += layout.bodySize + 6;

  // Horizontal divider
  doc
    .moveTo(leftX, y)
    .lineTo(rightEdge, y)
    .lineWidth(0.5)
    .strokeColor(COLORS.divider)
    .stroke();

  y += 6;

  // ── Work Orders section ────────────────────────────────────────────────────

  if (layout.enabledSections.has("workOrders")) {
    doc
      .font("Inter-Medium")
      .fontSize(layout.headerSize)
      .fillColor(COLORS.vigilTeal)
      .text("Work Orders", leftX, y, { lineBreak: false });

    y += layout.headerSize + 4;

    if (data.workOrders.length === 0) {
      doc
        .font("Inter-Regular")
        .fontSize(layout.bodySize)
        .fillColor(COLORS.subtext)
        .text("No active work orders", leftX, y, { lineBreak: false });
      y += layout.bodySize + 6;
    } else {
      const sortedOrders = sortWorkOrders(
        data.workOrders,
        data.workOrderPriorityOrder
      );
      // Cap to 6 items (T-75-01)
      const visibleOrders = sortedOrders.slice(0, 6);

      for (const wo of visibleOrders) {
        y = drawWorkOrder(doc, wo, layout, leftX, usableWidth, y);
        if (y > contentBottom - layout.bodySize * 4) break; // safety: stop if near page bottom
      }
    }

    y += 4;
  }

  // ── Task Thoughts section ─────────────────────────────────────────────────

  if (layout.enabledSections.has("taskThoughts")) {
    doc
      .font("Inter-Medium")
      .fontSize(layout.headerSize)
      .fillColor(COLORS.vigilTeal)
      .text("Tasks", leftX, y, { lineBreak: false });

    y += layout.headerSize + 4;

    const sortedTasks = sortThoughts(data.taskThoughts);
    // Cap to 8 items (T-75-01)
    const visibleTasks = sortedTasks.slice(0, 8);

    if (visibleTasks.length === 0) {
      doc
        .font("Inter-Regular")
        .fontSize(layout.bodySize)
        .fillColor(COLORS.subtext)
        .text("No open tasks", leftX, y, { lineBreak: false });
      y += layout.bodySize + 4;
    } else {
      for (const thought of visibleTasks) {
        if (y > contentBottom - layout.bodySize * 3) break; // safety

        const isDone = thought.taskStatus === "done";
        const isInProgress = thought.taskStatus === "inProgress";
        const cbSize = layout.checkboxSize;
        const cbY = y + (layout.bodySize - cbSize) / 2;

        // Draw checkbox
        drawCheckbox(
          doc,
          leftX,
          cbY,
          cbSize,
          isDone,
          isInProgress,
          layout.bodySize
        );

        const textX = leftX + cbSize + 4;
        const textW = usableWidth - cbSize - 4;
        const textColor = isDone ? COLORS.subtext : COLORS.bodyText;

        doc
          .font("Inter-Regular")
          .fontSize(layout.bodySize)
          .fillColor(textColor);

        const textH = doc.heightOfString(thought.content, { width: textW });
        doc.text(thought.content, textX, y, { width: textW });

        if (isDone) {
          // Strikethrough line
          const strikeY = y + textH / 2;
          doc
            .moveTo(textX, strikeY)
            .lineTo(textX + Math.min(doc.widthOfString(thought.content), textW), strikeY)
            .lineWidth(0.5)
            .strokeColor(COLORS.subtext)
            .stroke();
        }

        y += textH + 3;
      }
    }

    y += 4;
  }

  // ── Calendar section ──────────────────────────────────────────────────────

  if (
    layout.enabledSections.has("calendar") &&
    data.calendarEvents.length > 0
  ) {
    // Divider
    doc
      .moveTo(leftX, y)
      .lineTo(rightEdge, y)
      .lineWidth(0.5)
      .strokeColor(COLORS.divider)
      .stroke();

    y += 4;

    doc
      .font("Inter-Medium")
      .fontSize(layout.headerSize)
      .fillColor(COLORS.vigilTeal)
      .text("Today's Schedule", leftX, y, { lineBreak: false });

    y += layout.headerSize + 4;

    // Sort: all-day first, then by startTime string
    const sortedEvents = [...data.calendarEvents].sort((a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      return a.startTime.localeCompare(b.startTime);
    });

    // Cap to 8 items (T-75-01)
    const visibleEvents = sortedEvents.slice(0, 8);

    for (const event of visibleEvents) {
      if (y > contentBottom - layout.bodySize * 3) break; // safety

      const timeStr = event.timeString;

      doc
        .font("Inter-Medium")
        .fontSize(layout.smallSize)
        .fillColor(COLORS.subtext)
        .text(timeStr, leftX, y, { lineBreak: false });

      const timeW = doc.widthOfString(timeStr) + 4;
      const titleX = leftX + timeW;
      const titleW = usableWidth - timeW;

      doc
        .font("Inter-Regular")
        .fontSize(layout.bodySize)
        .fillColor(COLORS.bodyText)
        .text(event.title, titleX, y, { width: titleW, lineBreak: false });

      y += layout.bodySize + 2;

      if (event.location) {
        doc
          .font("Inter-Regular")
          .fontSize(layout.tinySize)
          .fillColor(COLORS.subtext)
          .text(event.location, leftX + timeW, y, {
            width: titleW,
            lineBreak: false,
          });
        y += layout.tinySize + 2;
      }
    }

    y += 4;
  }

  // ── Notes section (always at bottom) ──────────────────────────────────────

  // Place notes near the bottom of the page
  const notesY = Math.max(y + 8, contentBottom - layout.noteLineSpacing * 5);

  doc
    .font("Inter-Regular")
    .fontSize(layout.smallSize)
    .fillColor(COLORS.subtext)
    .text("Notes", leftX, notesY, { lineBreak: false });

  // 4 horizontal ruled lines for handwriting
  let lineY = notesY + layout.smallSize + 4;
  for (let i = 0; i < 4; i++) {
    doc
      .moveTo(leftX, lineY)
      .lineTo(rightEdge, lineY)
      .lineWidth(0.5)
      .strokeColor(COLORS.divider)
      .stroke();
    lineY += layout.noteLineSpacing;
  }
}

// ── Helper functions ──────────────────────────────────────────────────────────

function drawWorkOrder(
  doc: PDFKit.PDFDocument,
  wo: BriefWorkOrder,
  layout: PdfLayout,
  leftX: number,
  usableWidth: number,
  y: number
): number {
  const cbSize = layout.checkboxSize;
  const cbIndent = cbSize + 4;
  const textW = usableWidth - cbIndent;
  const isDone = wo.status === "done";
  const isInProgress = wo.status === "inProgress";
  const cbY = y + (layout.tableRowHeight - cbSize) / 2;

  // Row background
  doc
    .rect(leftX, y, usableWidth, layout.tableRowHeight)
    .fill(COLORS.rowBg);

  // Checkbox
  drawCheckbox(doc, leftX, cbY, cbSize, isDone, isInProgress, layout.bodySize);

  // Case number + store on header line
  const headerText = `${wo.caseNumber} — ${wo.store}`;
  doc
    .font("Inter-Medium")
    .fontSize(layout.smallSize)
    .fillColor(isDone ? COLORS.subtext : COLORS.bodyText)
    .text(headerText, leftX + cbIndent, y + 2, {
      width: textW,
      lineBreak: false,
    });

  y += layout.tableRowHeight;

  // Short description
  const descColor = isDone ? COLORS.subtext : COLORS.bodyText;
  doc
    .font("Inter-Regular")
    .fontSize(layout.bodySize)
    .fillColor(descColor);

  const descH = doc.heightOfString(wo.shortDescription, { width: textW });
  doc.text(wo.shortDescription, leftX + cbIndent, y, { width: textW });

  if (isDone) {
    // Strikethrough
    const strikeY = y + descH / 2;
    doc
      .moveTo(leftX + cbIndent, strikeY)
      .lineTo(leftX + cbIndent + Math.min(doc.widthOfString(wo.shortDescription), textW), strikeY)
      .lineWidth(0.5)
      .strokeColor(COLORS.subtext)
      .stroke();
  }

  y += descH + 1;

  // Trade | Location | Equipment
  const detailsLine = [wo.trade, wo.location, wo.equipment]
    .filter(Boolean)
    .join(" | ");
  doc
    .font("Inter-Regular")
    .fontSize(layout.tinySize)
    .fillColor(COLORS.subtext)
    .text(detailsLine, leftX + cbIndent, y, { width: textW, lineBreak: false });

  y += layout.tinySize + 1;

  // Priority + Contact
  const contactLine = `${wo.priority} priority · ${wo.contact}`;
  doc
    .font("Inter-Regular")
    .fontSize(layout.tinySize)
    .fillColor(COLORS.subtext)
    .text(contactLine, leftX + cbIndent, y, {
      width: textW,
      lineBreak: false,
    });

  y += layout.tinySize + 4;

  return y;
}

function drawCheckbox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  size: number,
  isDone: boolean,
  isInProgress: boolean,
  _bodySize: number
): void {
  if (isDone) {
    // Filled square
    doc.rect(x, y, size, size).fill(COLORS.statusDone);
  } else if (isInProgress) {
    // Square outline with centered dot
    doc
      .rect(x, y, size, size)
      .lineWidth(0.5)
      .strokeColor(COLORS.statusInProgress)
      .stroke();
    const cx = x + size / 2;
    const cy = y + size / 2;
    doc.circle(cx, cy, size / 5).fill(COLORS.statusInProgress);
  } else {
    // Empty square outline (open)
    doc
      .rect(x, y, size, size)
      .lineWidth(0.5)
      .strokeColor(COLORS.bodyText)
      .stroke();
  }
}

function sortWorkOrders(
  orders: BriefWorkOrder[],
  priorityOrder?: string[]
): BriefWorkOrder[] {
  const statusRank = (status: string): number => {
    switch (status) {
      case "inProgress":
        return 0;
      case "open":
        return 1;
      case "done":
        return 2;
      default:
        return 1;
    }
  };

  return [...orders].sort((a, b) => {
    const rankA = statusRank(a.status);
    const rankB = statusRank(b.status);

    if (rankA !== rankB) return rankA - rankB;

    // Within same status, use AI priority order if available
    if (priorityOrder) {
      const idxA = priorityOrder.indexOf(a.caseNumber);
      const idxB = priorityOrder.indexOf(b.caseNumber);
      const posA = idxA === -1 ? Number.MAX_SAFE_INTEGER : idxA;
      const posB = idxB === -1 ? Number.MAX_SAFE_INTEGER : idxB;
      return posA - posB;
    }

    return 0;
  });
}

function sortThoughts(
  thoughts: Array<{ taskStatus?: string; createdAt: string }>
): typeof thoughts {
  const statusRank = (status?: string): number => {
    switch (status) {
      case "inProgress":
        return 0;
      case "open":
        return 1;
      case "done":
        return 2;
      default:
        return 1;
    }
  };

  return [...thoughts].sort((a, b) => {
    const rankA = statusRank(a.taskStatus);
    const rankB = statusRank(b.taskStatus);
    if (rankA !== rankB) return rankA - rankB;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
