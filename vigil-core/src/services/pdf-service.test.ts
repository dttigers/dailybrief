import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPdfRenderer } from "./pdf-service.js";
import { DEFAULT_PDF_CONFIG, PdfConfig } from "./pdf-types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Sample fixture ────────────────────────────────────────────────────────────

export function createSampleBriefData() {
  return {
    date: new Date("2026-04-13T08:00:00Z"),
    workOrders: [
      {
        caseNumber: "WO-2026-001",
        store: "Store #101",
        shortDescription: "HVAC unit not cooling — compressor failure",
        trade: "HVAC",
        location: "Roof",
        equipment: "RTU-3",
        priority: "high",
        contact: "Mike Johnson",
        status: "inProgress" as const,
      },
      {
        caseNumber: "WO-2026-002",
        store: "Store #204",
        shortDescription: "Parking lot lights out in section B",
        trade: "Electrical",
        location: "Exterior",
        equipment: "Light Panel B",
        priority: "medium",
        contact: "Sarah Lee",
        status: "open" as const,
      },
      {
        caseNumber: "WO-2026-003",
        store: "Store #310",
        shortDescription: "Broken door handle on walk-in cooler",
        trade: "General",
        location: "Kitchen",
        equipment: "Walk-in Cooler",
        priority: "low",
        contact: "Tom Reyes",
        status: "done" as const,
      },
    ],
    workOrderPriorityOrder: ["WO-2026-001", "WO-2026-002", "WO-2026-003"],
    taskThoughts: [
      {
        content: "Review RFP for Q3 facilities contract renewal",
        category: "task" as const,
        source: "text" as const,
        taskStatus: "open" as const,
        createdAt: "2026-04-12T10:00:00Z",
      },
      {
        content: "Submit expense report for Detroit trip",
        category: "task" as const,
        source: "voice" as const,
        taskStatus: "done" as const,
        createdAt: "2026-04-11T09:00:00Z",
      },
    ],
    calendarEvents: [
      {
        title: "Team standup",
        startTime: "2026-04-13T09:00:00Z",
        isAllDay: false,
        location: "Conference Room A",
        timeString: "9:00 AM",
      },
      {
        title: "All-hands Q2 review",
        startTime: "2026-04-13T14:00:00Z",
        isAllDay: false,
        location: undefined,
        timeString: "2:00 PM",
      },
      {
        title: "Earth Day",
        startTime: "2026-04-13T00:00:00Z",
        isAllDay: true,
        location: undefined,
        timeString: "All day",
      },
    ],
    sports: [
      {
        sport: "mlb",
        displayName: "MLB",
        teamName: "Detroit Tigers",
        divisionName: "AL Central",
        recentGame: {
          homeTeam: "Detroit Tigers",
          awayTeam: "Cleveland Guardians",
          homeScore: 5,
          awayScore: 3,
          result: "W" as const,
          gameDate: "2026-04-12",
        },
        upcomingGame: {
          homeTeam: "Detroit Tigers",
          awayTeam: "Chicago White Sox",
          isHome: true,
          venue: "Comerica Park",
          gameDate: "2026-04-14",
          gameType: "Regular Season",
        },
        standings: [
          {
            team: "Detroit Tigers",
            wins: 10,
            losses: 5,
            gamesBack: "0.0",
            winPct: ".667",
            streak: "W2",
            rank: 1,
          },
        ],
      },
    ],
    affirmation:
      "You bring calm clarity to complex situations — trust the process today.",
    unprocessedThoughts: [
      {
        content: "Call facilities coordinator re: Chicago store HVAC",
        category: "task" as const,
        source: "voice" as const,
        createdAt: "2026-04-13T07:45:00Z",
      },
      {
        content: "Good meeting with Sarah — she has real momentum on Q2",
        category: "reflection" as const,
        source: "text" as const,
        createdAt: "2026-04-12T17:30:00Z",
      },
    ],
    recentThoughts: [
      {
        content: "Need to book hotel for May conference in Columbus",
        category: "task" as const,
        source: "text" as const,
        taskStatus: "open" as const,
        createdAt: "2026-04-11T08:00:00Z",
      },
      {
        content: "Feeling much better about project timelines after today",
        category: "reflection" as const,
        source: "text" as const,
        createdAt: "2026-04-10T20:00:00Z",
      },
    ],
    insights: [
      {
        type: "pattern" as const,
        title: "Work order volume trending up",
        message:
          "You have 3x more open work orders than last week. Consider delegating the lower-priority ones.",
      },
      {
        type: "actionPrompt" as const,
        title: "Follow up on Store #204",
        message:
          "Parking lot lights have been open for 3 days — worth a quick call to Sarah.",
      },
    ],
    therapyPatterns: [
      {
        theme: "Work-life boundaries",
        trend: "More evening thoughts captured this week — review impact",
      },
    ],
    therapyPrep: {
      items: [
        {
          topic: "Overwhelm at work",
          context:
            "Three urgent work orders opened simultaneously on Monday — triggered shutdown response",
          urgency: "high" as const,
        },
      ],
      suggestedFocus:
        "Explore coping strategies for multi-priority overwhelm in work contexts",
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const fontsDir = path.resolve(__dirname, "../../assets/fonts");
const renderer = createPdfRenderer({ fontsDir });
const sampleData = createSampleBriefData();

test("renderBrief returns a Buffer with length > 0", async () => {
  const buf = await renderer.renderBrief(sampleData);
  assert.ok(buf instanceof Buffer, "result is a Buffer");
  assert.ok(buf.length > 0, "buffer is non-empty");
});

test("returned Buffer starts with PDF magic bytes %PDF", async () => {
  const buf = await renderer.renderBrief(sampleData);
  const magic = buf.subarray(0, 4).toString("ascii");
  assert.equal(magic, "%PDF", `expected %PDF magic, got: ${magic}`);
});

test("renderBrief with custom page size (5x10 inches) produces PDF without crash", async () => {
  const config: PdfConfig = {
    ...DEFAULT_PDF_CONFIG,
    pageWidthInches: 5,
    pageHeightInches: 10,
  };
  const buf = await renderer.renderBrief(sampleData, config);
  assert.ok(buf.length > 0, "buffer is non-empty");
  assert.equal(
    buf.subarray(0, 4).toString("ascii"),
    "%PDF",
    "valid PDF header"
  );
});

test("renderBrief with fontScale 0.75 produces PDF without crash", async () => {
  const config: PdfConfig = { ...DEFAULT_PDF_CONFIG, fontScale: 0.75 };
  const buf = await renderer.renderBrief(sampleData, config);
  assert.ok(buf.length > 0, "buffer is non-empty");
  assert.equal(
    buf.subarray(0, 4).toString("ascii"),
    "%PDF",
    "valid PDF header"
  );
});

test("renderBrief with enabledSections=[] produces valid PDF", async () => {
  const config: PdfConfig = { ...DEFAULT_PDF_CONFIG, enabledSections: [] };
  const buf = await renderer.renderBrief(sampleData, config);
  assert.ok(buf.length > 0, "buffer is non-empty");
  assert.equal(
    buf.subarray(0, 4).toString("ascii"),
    "%PDF",
    "valid PDF header"
  );
});

test("renderBrief with empty workOrders array produces valid PDF", async () => {
  const emptyData = { ...sampleData, workOrders: [] };
  const buf = await renderer.renderBrief(emptyData);
  assert.ok(buf.length > 0, "buffer is non-empty");
  assert.equal(
    buf.subarray(0, 4).toString("ascii"),
    "%PDF",
    "valid PDF header"
  );
});
