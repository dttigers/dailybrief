// PDF rendering service — produces a 3-page daily brief PDF using PDFKit.
// Security: Caps work orders to 6, task thoughts to 8, calendar events to 8 (T-75-01).
// Text rendering uses doc.text() which handles encoding (T-75-03).

import PDFDocument from "pdfkit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BriefInsight,
  BriefRenderData,
  BriefSportLeague,
  BriefThought,
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
      drawCuttingGuide(doc, layout);
      drawPageOne(doc, data, layout);

      // Page 2: only if there's content for it
      const hasThoughts =
        (data.unprocessedThoughts.length > 0 ||
          data.recentThoughts.length > 0) &&
        layout.enabledSections.has("thoughts");
      const hasInsights =
        data.insights.length > 0 && layout.enabledSections.has("insights");
      const hasTherapy =
        (data.therapyPrep?.items?.length ?? 0) > 0 &&
        layout.enabledSections.has("therapyPrep");
      if (hasThoughts || hasInsights || hasTherapy) {
        doc.addPage({ size: [layout.pageW, layout.pageH], margin: 0 });
        drawCuttingGuide(doc, layout);
        drawPageThree(doc, data, layout);
      }

      doc.end();
    });
  }

  return { renderBrief };
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function drawDivider(
  doc: PDFKit.PDFDocument,
  leftX: number,
  rightEdge: number,
  y: number
): number {
  doc
    .moveTo(leftX, y)
    .lineTo(rightEdge, y)
    .lineWidth(0.5)
    .strokeColor(COLORS.divider)
    .stroke();
  return y + 6;
}

function drawSectionHeader(
  doc: PDFKit.PDFDocument,
  text: string,
  leftX: number,
  y: number,
  layout: PdfLayout
): number {
  doc
    .font("Inter-Medium")
    .fontSize(layout.headerSize)
    .fillColor(COLORS.vigilTeal)
    .text(text, leftX, y, { lineBreak: false });
  return y + layout.headerSize + 4;
}

// ── Cutting guide ─────────────────────────────────────────────────────────────

function drawCuttingGuide(doc: PDFKit.PDFDocument, layout: PdfLayout): void {
  const inset = 4; // 4pt inset from page edge
  doc
    .save()
    .dash(4, { space: 3 })
    .lineWidth(0.5)
    .strokeColor("#999999")
    .rect(inset, inset, layout.pageW - 2 * inset, layout.pageH - 2 * inset)
    .stroke()
    .undash()
    .restore();
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

  // ── Affirmation section (moved from Page 2) ───────────────────────────────

  if (layout.enabledSections.has("affirmation") && data.affirmation) {
    doc
      .moveTo(leftX, y)
      .lineTo(rightEdge, y)
      .lineWidth(0.5)
      .strokeColor(COLORS.divider)
      .stroke();
    y += 6;

    doc
      .font("Inter-Regular")
      .fontSize(layout.smallSize)
      .fillColor(COLORS.subtext)
      .text("Today's Affirmation", leftX, y, { lineBreak: false });
    y += layout.bodySize + 4;

    doc
      .font("Inter-Regular")
      .fontSize(layout.bodySize)
      .fillColor(COLORS.bodyText)
      .text(data.affirmation, leftX + 4, y, { width: usableWidth - 8 });

    const textH = doc.heightOfString(data.affirmation, { width: usableWidth - 8 });
    y += textH + 8;
  }

  // ── Sports section ────────────────────────────────────────────────────────

  if (layout.enabledSections.has("sports") && data.sports.length > 0) {
    y = drawDivider(doc, leftX, rightEdge, y);

    const isCompact = data.sports.length > 1;
    const activeSportCount = data.sports.length;

    for (const league of data.sports) {
      y = drawSportSection(doc, league, layout, y, isCompact, activeSportCount);
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

// ── Page 2 renderer ───────────────────────────────────────────────────────────

function drawPageTwo(
  doc: PDFKit.PDFDocument,
  data: BriefRenderData,
  layout: PdfLayout
): void {
  const { leftX, rightEdge, contentBottom } = layout;
  let y = layout.margin + 4;

  // ── Sports section ─────────────────────────────────────────────────────────

  if (layout.enabledSections.has("sports") && data.sports.length > 0) {
    const isCompact = data.sports.length > 1;
    const activeSportCount = data.sports.length;

    for (const league of data.sports) {
      y = drawSportSection(doc, league, layout, y, isCompact, activeSportCount);
    }
  }

  // ── Notes section (always, at bottom of page 2) ──────────────────────────

  // Position at contentBottom - 70 (matching Swift reference)
  const notesY = contentBottom - 70;

  doc
    .font("Inter-Regular")
    .fontSize(layout.smallSize)
    .fillColor(COLORS.subtext)
    .text("Notes", leftX, notesY, { lineBreak: false });

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

// ── Sport section helper ──────────────────────────────────────────────────────

function drawSportSection(
  doc: PDFKit.PDFDocument,
  league: BriefSportLeague,
  layout: PdfLayout,
  startY: number,
  isCompact: boolean,
  activeSportCount: number
): number {
  const { leftX, rightEdge, usableWidth } = layout;
  let y = startY;

  // Section title
  const titleText = isCompact
    ? `${league.displayName} — ${league.teamName}`
    : league.teamName;

  doc
    .font("Inter-Medium")
    .fontSize(isCompact ? layout.headerSize : layout.titleSize)
    .fillColor(COLORS.vigilTeal)
    .text(titleText, leftX, y, { lineBreak: false });

  y += (isCompact ? layout.headerSize : layout.titleSize) + (isCompact ? 4 : 6);

  // Recent game
  if (league.recentGame) {
    const g = league.recentGame;
    const scoreLine = `${g.awayTeam} ${g.awayScore} @ ${g.homeTeam} ${g.homeScore}${g.result ? ` (${g.result})` : ""}`;
    doc
      .font("Inter-Medium")
      .fontSize(layout.headerSize)
      .fillColor(COLORS.bodyText)
      .text(scoreLine, leftX, y, { lineBreak: false });
    y += layout.headerSize + 3;

    doc
      .font("Inter-Regular")
      .fontSize(layout.bodySize)
      .fillColor(COLORS.subtext)
      .text(`Game Date: ${g.gameDate}`, leftX, y, { lineBreak: false });
    y += layout.bodySize + 3;
  } else {
    doc
      .font("Inter-Regular")
      .fontSize(layout.bodySize)
      .fillColor(COLORS.subtext)
      .text("No recent game", leftX, y, { lineBreak: false });
    y += layout.bodySize;
  }

  y += isCompact ? 2 : 4;

  // Upcoming game (skip when 3+ sports)
  if (league.upcomingGame && activeSportCount < 3) {
    const ug = league.upcomingGame;
    doc
      .font("Inter-Regular")
      .fontSize(layout.smallSize)
      .fillColor(COLORS.subtext)
      .text("Next Game", leftX, y, { lineBreak: false });
    y += layout.smallSize + 3;

    const nextLine = `${ug.awayTeam} @ ${ug.homeTeam} — ${ug.gameDate}`;
    doc
      .font("Inter-Regular")
      .fontSize(layout.bodySize)
      .fillColor(COLORS.bodyText)
      .text(nextLine, leftX, y, { lineBreak: false });
    y += layout.bodySize + 2;

    if (!isCompact) {
      doc
        .font("Inter-Regular")
        .fontSize(layout.smallSize)
        .fillColor(COLORS.subtext)
        .text(`${ug.venue}  |  ${ug.gameType}`, leftX, y, { lineBreak: false });
      y += layout.smallSize;
    }
  }

  y += isCompact ? 3 : 6;

  // Divider line
  doc
    .moveTo(leftX, y)
    .lineTo(rightEdge, y)
    .lineWidth(0.5)
    .strokeColor(COLORS.divider)
    .stroke();
  y += isCompact ? 3 : 6;

  // Division standings header
  doc
    .font("Inter-Medium")
    .fontSize(layout.headerSize)
    .fillColor(COLORS.vigilTeal)
    .text(`${league.divisionName} Standings`, leftX, y, { lineBreak: false });
  y += layout.headerSize + 4;

  if (league.standings.length > 0) {
    // Column X positions — proportional to usableWidth
    const teamX = leftX;
    const wX = leftX + usableWidth * 0.48;
    const lX = leftX + usableWidth * 0.58;
    const gbX = leftX + usableWidth * 0.68;
    const strkX = leftX + usableWidth * 0.82;

    // Table header row with rowBg background
    doc
      .rect(leftX, y, usableWidth, layout.tableHeaderHeight)
      .fill(COLORS.rowBg);

    const headerY = y + 2;
    doc
      .font("Inter-Regular")
      .fontSize(layout.smallSize)
      .fillColor(COLORS.subtext);
    doc.text("Team", teamX, headerY, { lineBreak: false });
    doc.text("W", wX, headerY, { lineBreak: false });
    doc.text("L", lX, headerY, { lineBreak: false });
    doc.text("GB", gbX, headerY, { lineBreak: false });
    doc.text("Strk", strkX, headerY, { lineBreak: false });

    y += layout.tableHeaderHeight;

    // Data rows — cap at reasonable number to avoid overflow (T-75-05)
    for (const entry of league.standings) {
      const isMyTeam =
        entry.team.includes(league.teamName) ||
        league.teamName.includes(entry.team);

      const textColor = isMyTeam ? COLORS.bodyText : COLORS.subtext;
      const fontName = isMyTeam ? "Inter-Medium" : "Inter-Regular";

      // Short name: last word of team name for compactness
      const shortName = entry.team.split(" ").slice(-1)[0] ?? entry.team;

      doc
        .font(fontName)
        .fontSize(layout.smallSize)
        .fillColor(textColor);

      const rowY = y + 1;
      doc.text(shortName, teamX, rowY, { lineBreak: false });
      doc.text(String(entry.wins), wX, rowY, { lineBreak: false });
      doc.text(String(entry.losses), lX, rowY, { lineBreak: false });
      doc.text(entry.gamesBack, gbX, rowY, { lineBreak: false });
      doc.text(entry.streak, strkX, rowY, { lineBreak: false });

      y += layout.tableRowHeight;
    }
  } else {
    doc
      .font("Inter-Regular")
      .fontSize(layout.bodySize)
      .fillColor(COLORS.subtext)
      .text("Standings unavailable", leftX, y, { lineBreak: false });
    y += layout.bodySize + 4;
  }

  y += isCompact ? 4 : 8;

  return y;
}

// ── Page 3+ renderer ──────────────────────────────────────────────────────────

function drawPageThree(
  doc: PDFKit.PDFDocument,
  data: BriefRenderData,
  layout: PdfLayout
): void {
  const { leftX, rightEdge, contentBottom } = layout;
  let y = layout.margin + 4;

  // ── Header ────────────────────────────────────────────────────────────────

  doc
    .font("Inter-Medium")
    .fontSize(layout.titleSize)
    .fillColor(COLORS.vigilTeal)
    .text("Captured Thoughts", leftX, y, { lineBreak: false });
  y += layout.titleSize + 2;

  const dateStr = formatDate(data.date);
  doc
    .font("Inter-Regular")
    .fontSize(layout.bodySize)
    .fillColor(COLORS.subtext)
    .text(dateStr, leftX, y, { lineBreak: false });
  y += layout.bodySize + 6;

  // Horizontal divider under header
  y = drawDivider(doc, leftX, rightEdge, y);

  // ── Unprocessed thoughts ──────────────────────────────────────────────────

  if (layout.enabledSections.has("thoughts")) {
    y = drawSectionHeader(doc, "Unprocessed", leftX, y, layout);

    if (data.unprocessedThoughts.length === 0) {
      doc
        .font("Inter-Regular")
        .fontSize(layout.bodySize)
        .fillColor(COLORS.subtext)
        .text("All caught up!", leftX, y, { lineBreak: false });
      y += layout.bodySize + 6;
    } else {
      // Cap to 5 (T-75-05)
      for (const thought of data.unprocessedThoughts.slice(0, 5)) {
        y = drawThoughtItem(doc, thought.content, thought.source, leftX, rightEdge, y, layout);
      }
    }

    // Divider before tasks
    y += 4;
    y = drawDivider(doc, leftX, rightEdge, y);

    // ── Tasks section ─────────────────────────────────────────────────────

    y = drawSectionHeader(doc, "Tasks", leftX, y, layout);

    // Task thoughts: sort inProgress (0), open (1), done (2); newest first within same status
    const taskThoughts = data.unprocessedThoughts
      .filter((t) => t.category === "task")
      .concat(data.recentThoughts.filter((t) => t.category === "task"));

    const sortedTasks = [...taskThoughts].sort((a, b) => {
      const rankA = taskStatusRank(a.taskStatus);
      const rankB = taskStatusRank(b.taskStatus);
      if (rankA !== rankB) return rankA - rankB;
      return b.createdAt.localeCompare(a.createdAt); // newest first within same status
    });

    // Cap to 8 (T-75-05)
    const visibleTasks = sortedTasks.slice(0, 8);

    if (visibleTasks.length === 0) {
      doc
        .font("Inter-Regular")
        .fontSize(layout.bodySize)
        .fillColor(COLORS.subtext)
        .text("No task thoughts captured", leftX, y, { lineBreak: false });
      y += layout.bodySize + 6;
    } else {
      const cbSize = layout.checkboxSize;
      const cbIndent = cbSize + 4;
      const textW = layout.usableWidth - cbIndent;

      for (const thought of visibleTasks) {
        if (y > contentBottom - layout.bodySize * 2) break; // safety

        const isDone = thought.taskStatus === "done";
        const isInProgress = thought.taskStatus === "inProgress";
        const cbY = y + (layout.bodySize - cbSize) / 2;

        drawCheckbox(doc, leftX, cbY, cbSize, isDone, isInProgress, layout.bodySize);

        const textColor = isDone ? COLORS.subtext : COLORS.bodyText;
        doc
          .font("Inter-Regular")
          .fontSize(layout.bodySize)
          .fillColor(textColor);

        const textH = doc.heightOfString(thought.content, { width: textW });
        const rowH = Math.max(layout.tableRowHeight, textH + 2);
        doc.text(thought.content, leftX + cbIndent, y, { width: textW });
        y += rowH;
      }
    }

    // Divider before recent
    y += 4;
    y = drawDivider(doc, leftX, rightEdge, y);

    // ── Recent captures ───────────────────────────────────────────────────

    if (data.recentThoughts.length > 0) {
      y = drawSectionHeader(doc, "Recent", leftX, y, layout);

      const recentContentX = leftX + 50;
      const recentContentMaxWidth = rightEdge - recentContentX;

      // Cap to 5 (T-75-05)
      for (const thought of data.recentThoughts.slice(0, 5)) {
        const contentH = doc.heightOfString(thought.content, { width: recentContentMaxWidth });
        if (y + contentH > contentBottom - layout.bodySize) break;

        const catLabel = thought.category ?? "misc";
        doc
          .font("Inter-Regular")
          .fontSize(layout.smallSize)
          .fillColor(COLORS.subtext)
          .text(catLabel, leftX, y, { lineBreak: false });

        doc
          .font("Inter-Regular")
          .fontSize(layout.bodySize)
          .fillColor(COLORS.bodyText)
          .text(thought.content, recentContentX, y, { width: recentContentMaxWidth });

        y += Math.max(layout.bodySize, contentH) + 4;
      }
    }
  }

  // ── AI Insights section ────────────────────────────────────────────────────

  let overflowIndex: number | null = null;
  let insightsEndY = y;

  if (layout.enabledSections.has("insights") && data.insights.length > 0) {
    // If insufficient space to start insights meaningfully, begin on a fresh page
    if (y > contentBottom - 150) {
      doc.addPage({ size: [layout.pageW, layout.pageH], margin: 0 });
      y = layout.margin + 4;
    }
    y += 4;
    y = drawDivider(doc, leftX, rightEdge, y);
    y = drawSectionHeader(doc, "AI Insights", leftX, y, layout);

    const result = drawInsightsLoop(doc, data.insights, layout, 0, leftX, rightEdge, contentBottom, y);
    overflowIndex = result.overflowIndex;
    insightsEndY = result.endY;
    y = insightsEndY;
  }

  // ── Therapy Prep section ──────────────────────────────────────────────────

  // Only render on first page when insights did NOT overflow
  if (
    overflowIndex === null &&
    layout.enabledSections.has("therapyPrep") &&
    data.therapyPrep &&
    data.therapyPrep.items.length > 0
  ) {
    y += 4;
    y = drawDivider(doc, leftX, rightEdge, y);

    // Check we have enough space for at least header + one item
    const minSpace = layout.headerSize + layout.bodySize * 2 + 16;
    if (y + minSpace <= contentBottom) {
      y = drawSectionHeader(doc, "Therapy Prep", leftX, y, layout);

      // Therapy patterns (max 3)
      if (data.therapyPatterns && data.therapyPatterns.length > 0) {
        for (const pattern of data.therapyPatterns.slice(0, 3)) {
          if (y + layout.bodySize > contentBottom) break;
          const patternText = `\u2022 ${pattern.theme} (${pattern.trend})`;
          doc
            .font("Inter-Regular")
            .fontSize(layout.bodySize)
            .fillColor(COLORS.subtext)
            .text(patternText, leftX, y, { lineBreak: false });
          y += layout.bodySize + 2;
        }
        y += 2;
      }

      // Prep items (max 5) (T-75-05)
      const dotSize = 4;
      const topicIndent = dotSize + 4;
      const contextIndent = 8;
      const topicMaxWidth = layout.usableWidth - topicIndent;
      const contextMaxWidth = layout.usableWidth - contextIndent;

      for (const item of data.therapyPrep.items.slice(0, 5)) {
        // Pre-measure
        const topicH = doc
          .font("Inter-Medium")
          .fontSize(layout.bodySize)
          .heightOfString(item.topic, { width: topicMaxWidth });
        const contextH = doc
          .font("Inter-Regular")
          .fontSize(layout.bodySize)
          .heightOfString(item.context, { width: contextMaxWidth });
        const neededSpace = topicH + 2 + contextH + 4;
        if (y + neededSpace > contentBottom) break;

        // Urgency dot
        const urgencyColor =
          item.urgency === "high"
            ? COLORS.bodyText
            : item.urgency === "medium"
            ? COLORS.subtext
            : COLORS.divider;

        const dotX = leftX;
        const dotY = y + (layout.bodySize - dotSize) / 2;
        doc.circle(dotX + dotSize / 2, dotY + dotSize / 2, dotSize / 2).fill(urgencyColor);

        // Topic
        doc
          .font("Inter-Medium")
          .fontSize(layout.bodySize)
          .fillColor(COLORS.bodyText)
          .text(item.topic, leftX + topicIndent, y, { width: topicMaxWidth });
        y += topicH + 2;

        // Context
        if (y + contextH <= contentBottom) {
          doc
            .font("Inter-Regular")
            .fontSize(layout.bodySize)
            .fillColor(COLORS.subtext)
            .text(item.context, leftX + contextIndent, y, { width: contextMaxWidth });
          y += contextH + 4;
        }
      }

      // Suggested focus
      if (data.therapyPrep.suggestedFocus) {
        const focusText = `Focus: ${data.therapyPrep.suggestedFocus}`;
        const focusH = doc
          .font("Inter-Regular")
          .fontSize(layout.bodySize)
          .heightOfString(focusText, { width: layout.usableWidth });
        if (y + focusH <= contentBottom) {
          doc
            .font("Inter-Regular")
            .fontSize(layout.bodySize)
            .fillColor(COLORS.subtext)
            .text(focusText, leftX, y, { width: layout.usableWidth });
        }
      }
    }
  }

  // ── Insights spillover pages ──────────────────────────────────────────────

  // Handle overflow: emit continuation pages (cap at 10 spillover pages — T-75-04)
  if (overflowIndex !== null) {
    let spilloverIndex: number | null = overflowIndex;
    let spilloverCount = 0;
    const MAX_SPILLOVER = 10;

    while (spilloverIndex !== null && spilloverCount < MAX_SPILLOVER) {
      doc.addPage({ size: [layout.pageW, layout.pageH], margin: 0 });
      let spillY = layout.margin + 4;

      doc
        .font("Inter-Medium")
        .fontSize(layout.headerSize)
        .fillColor(COLORS.vigilTeal)
        .text("AI Insights (continued)", leftX, spillY, { lineBreak: false });
      spillY += layout.headerSize + 4;

      const spillResult = drawInsightsLoop(
        doc,
        data.insights,
        layout,
        spilloverIndex,
        leftX,
        rightEdge,
        contentBottom,
        spillY
      );

      spilloverIndex = spillResult.overflowIndex;
      spilloverCount++;
    }
  }
}

// ── Insights loop helper ──────────────────────────────────────────────────────

function drawInsightsLoop(
  doc: PDFKit.PDFDocument,
  insights: BriefInsight[],
  layout: PdfLayout,
  startIndex: number,
  leftX: number,
  rightEdge: number,
  pageBottom: number,
  initialY: number
): { overflowIndex: number | null; endY: number } {
  const labelWidth = 52;
  const messageIndent = 8;
  let y = initialY;
  let drawnOnThisPage = 0;

  for (let index = startIndex; index < insights.length; index++) {
    const insight = insights[index];

    const typeLabel =
      insight.type === "pattern"
        ? "Pattern:"
        : insight.type === "connection"
        ? "Connection:"
        : insight.type === "actionPrompt"
        ? "Action:"
        : "Trend:";

    const titleMaxWidth = rightEdge - (leftX + labelWidth);
    const messageMaxWidth = rightEdge - (leftX + messageIndent);

    const titleH = doc
      .font("Inter-Regular")
      .fontSize(layout.bodySize)
      .heightOfString(insight.title, { width: titleMaxWidth });
    const messageH = doc
      .font("Inter-Regular")
      .fontSize(layout.bodySize)
      .heightOfString(insight.message, { width: messageMaxWidth });

    const labelLineH = layout.bodySize;
    const firstLineH = Math.max(labelLineH, titleH);
    const neededH = firstLineH + 2 + messageH + 4;

    if (y + neededH > pageBottom) {
      if (drawnOnThisPage > 0) {
        return { overflowIndex: index, endY: y };
      }
      // Edge case: force-draw a mega insight even if it clips at the bottom
    }

    // Type label (Inter-Medium for label, Regular for title)
    doc
      .font("Inter-Medium")
      .fontSize(layout.bodySize)
      .fillColor(COLORS.subtext)
      .text(typeLabel, leftX, y, { lineBreak: false });

    // Title to the right of label
    doc
      .font("Inter-Regular")
      .fontSize(layout.bodySize)
      .fillColor(COLORS.bodyText)
      .text(insight.title, leftX + labelWidth, y, { width: titleMaxWidth });

    y += firstLineH + 2;

    // Message indented
    doc
      .font("Inter-Regular")
      .fontSize(layout.bodySize)
      .fillColor(COLORS.subtext)
      .text(insight.message, leftX + messageIndent, y, { width: messageMaxWidth });

    y += messageH + 4;
    drawnOnThisPage++;

    // If force-draw pushed past bottom, return next index as overflow
    if (y > pageBottom) {
      const nextIndex = index + 1;
      return {
        overflowIndex: nextIndex < insights.length ? nextIndex : null,
        endY: y,
      };
    }
  }

  return { overflowIndex: null, endY: y };
}

// ── Thought item helper ───────────────────────────────────────────────────────

function drawThoughtItem(
  doc: PDFKit.PDFDocument,
  content: string,
  source: string,
  leftX: number,
  rightEdge: number,
  y: number,
  layout: PdfLayout
): number {
  const bulletIndent = 10;
  // Reserve ~70pt on the right for the source label (matches Swift sourceLabelReserve)
  const sourceLabelReserve = 70;
  const contentMaxWidth = rightEdge - (leftX + bulletIndent) - sourceLabelReserve;

  // Bullet
  doc
    .font("Inter-Regular")
    .fontSize(layout.bodySize)
    .fillColor(COLORS.subtext)
    .text("\u2022", leftX, y, { lineBreak: false });

  // Content
  const contentH = doc.heightOfString(content, { width: contentMaxWidth });
  doc
    .font("Inter-Regular")
    .fontSize(layout.bodySize)
    .fillColor(COLORS.bodyText)
    .text(content, leftX + bulletIndent, y, { width: contentMaxWidth });

  // Source label (tiny, right-aligned on first line)
  doc
    .font("Inter-Regular")
    .fontSize(layout.tinySize)
    .fillColor(COLORS.subtext)
    .text(source, rightEdge - sourceLabelReserve, y, {
      width: sourceLabelReserve,
      lineBreak: false,
    });

  return y + Math.max(contentH, layout.bodySize) + 4;
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

function taskStatusRank(status?: string): number {
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
  thoughts: BriefThought[]
): BriefThought[] {
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
