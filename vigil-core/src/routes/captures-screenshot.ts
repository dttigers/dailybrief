import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "../db/connection.js";
import { workOrders } from "../db/schema.js";
import {
  callClaudeMultimodal,
  getAIClient,
  parseAIJson,
} from "../ai/client.js";

// ── Phase 129.1 Plan 03 (SCAP-01 + SCAP-02) ────────────────────────────────
// POST /v1/captures/screenshot — operator-only screenshot ingest. Accepts a
// base64 PNG/JPG screenshot of a Polaris case page, calls Anthropic vision
// (via callClaudeMultimodal with per-user spend tracking from Phase 127
// GUARD-03), parses JSON output, and writes a `work_orders` row in
// `state: "pending_review"` for operator confirmation in the PWA.
//
// Load-bearing invariants (mirror work-orders.ts and describe-image.ts):
// 1. userId is sourced from c.get("userId") populated by the bearerAuth
//    dispatcher in src/index.ts. NEVER read userId from body (T-129.1-09
//    spoofing mitigation; Phase 121 D-D2 lock).
// 2. SVCNOW-04 dedup short-circuits BEFORE the Anthropic call: a SELECT by
//    (userId, clientCaptureId) hit returns the existing row idempotently
//    (T-129.1-13 replay mitigation).
// 3. case_number PK collision is handled via onConflictDoUpdate — latest
//    screenshot wins; operator's review step (plan 05) is the safety net
//    (T-129.1-14 accepted-risk per RESEARCH Risk 1).
// 4. Image payload guard MAX_IMAGE_BASE64_LENGTH = 7_000_000 (≈5.25MB)
//    enforced BEFORE the Anthropic call (T-129.1-10 DoS mitigation).
// 5. DI factory createCapturesScreenshotRoute(deps) accepts injected db +
//    getAIClientFn + callClaudeMultimodalFn so unit tests can swap in
//    mock-db + mock-Anthropic without touching env or process state. Mirrors
//    the createWorkOrdersRoute pattern at work-orders.ts:58.

// ── Constants ──────────────────────────────────────────────────────────────

export const VALID_MEDIA_TYPES = ["image/png", "image/jpeg"] as const;
export type MediaType = (typeof VALID_MEDIA_TYPES)[number];

// UUID v4 shape — protects against trivial clientCaptureId tampering /
// replay attacks (T-129.1-13). RESEARCH Q6 recommendation.
export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 7_000_000 bytes of base64 ≈ 5.25MB raw — comfortably above a retina
// Polaris screenshot (typical 540KB-1.1MB base64) but well below Anthropic's
// per-image limit. T-129.1-10 DoS mitigation per RESEARCH §479.
export const MAX_IMAGE_BASE64_LENGTH = 7_000_000;

// Operator decision (Phase 129.1 Plan 03 Task 1, refined post-UAT 2026-05-17):
//   Polaris "Location" field          → work_orders.store    (e.g. "LINS (CEDAR)")
//   Polaris "Maintenance Location"    → work_orders.location (e.g. "Bakery")
//   The `department` column added in Plan 01 is left empty by extraction —
//   redundant after this remap; queued for removal in a 129.2 follow-up.
// The prompt uses the human-readable Polaris field labels so the vision model
// targets the correct rows on the case page.
export const EXTRACTION_PROMPT = `You are extracting structured fields from a screenshot of a ServiceNow Polaris case page.

Return a JSON object with EXACTLY this shape (no markdown fences, no preamble):

{
  "required": {
    "case_number": "CS<7-digit number>",
    "short_description": "string",
    "store": "string",
    "location": "string",
    "maintenance_problem": "string"
  },
  "extras": {
    "service": "string?",
    "assignment_group": "string?",
    "assigned_to": "string?",
    "priority": "string?",
    "trade": "string?",
    "equipment": "string?",
    "contact": "string?",
    "opened": "string?",
    "time_worked": "string?",
    "resolution_code": "string?",
    "resolution_notes": "string?",
    "after_hours": "string?",
    "maintenance_vendor": "string?"
  }
}

Field guide:
- case_number: the case number shown at top of the page (e.g. "CS0363817").
- short_description: the "Short description" field.
- store: the Polaris "Location" field — this is the store identifier (e.g. "LINS (CEDAR)", "DOLN (DOWNTOWN)"), NOT a building area.
- location: the Polaris "Maintenance Location" field — this is the building area where the issue physically is (e.g. "Bakery", "Front Counter", "Deli").
- maintenance_problem: the "Maintenance Problem" field (e.g. "Other", "Plumbing", "HVAC").
- extras.service: the "Service" field (e.g. "MT-Trades").
- extras.assignment_group: the "Assignment Group" field (e.g. "MT-Maintenance").
- extras.assigned_to: the assignee's name.
- extras.priority: Low / Medium / High / Critical.
- extras.trade: the "Trade" field.
- extras.equipment: the "Maintenance Equipment" field.
- extras.contact: the "Store Contact" field.
- extras.opened: the "Opened" timestamp (verbatim string).
- extras.time_worked: the "Time Worked" field.
- extras.resolution_code: the "Resolution Code" field.
- extras.resolution_notes: the "Resolution Notes" field.
- extras.after_hours: "Yes" / "No".
- extras.maintenance_vendor: the "Maintenance Vendor" field.

Rules:
1. If a required field is not visible in the screenshot, use an empty string "" — do NOT fabricate.
2. If an optional (extras) field is not visible, omit the key entirely.
3. Strip any trailing whitespace from extracted values.
4. case_number must match /^CS\\d{7}$/ — if you cannot find one matching that pattern, return "" for case_number.
5. Return ONLY the JSON object. No code fences, no explanation, no surrounding text.`;

// ── Types ──────────────────────────────────────────────────────────────────

export interface RequiredExtracted {
  case_number: string;
  short_description: string;
  store: string;
  location: string;
  maintenance_problem: string;
}

export interface ExtraExtracted {
  service?: string;
  assignment_group?: string;
  assigned_to?: string;
  priority?: string;
  trade?: string;
  equipment?: string;
  contact?: string;
  opened?: string;
  time_worked?: string;
  resolution_code?: string;
  resolution_notes?: string;
  after_hours?: string;
  maintenance_vendor?: string;
}

interface ExtractionResult {
  required: RequiredExtracted;
  extras: ExtraExtracted;
}

// DI factory deps. All optional so unit tests can override surgically and
// the production singleton (bottom of file) gets sensible defaults.
export interface CapturesScreenshotDeps {
  dbAvailable: boolean;
  db: typeof db;
  getAIClientFn: () => Anthropic | null;
  callClaudeMultimodalFn: typeof callClaudeMultimodal;
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createCapturesScreenshotRoute(
  deps: Partial<CapturesScreenshotDeps> = {},
): Hono {
  const router = new Hono();

  const dbRef = deps.db ?? db;
  const dbAvailable = deps.dbAvailable ?? !!dbRef;
  const getAIClientFn = deps.getAIClientFn ?? getAIClient;
  const callClaudeMultimodalFn =
    deps.callClaudeMultimodalFn ?? callClaudeMultimodal;

  router.post("/captures/screenshot", async (c) => {
    // T-129.1-09 mitigation: userId from middleware context, NEVER body.
    const userId = c.get("userId");

    if (!dbAvailable || !dbRef) {
      return c.json({ error: "Database not available" }, 503);
    }

    // ── Body parse ────────────────────────────────────────────────────────
    let body: {
      imageBase64?: unknown;
      mediaType?: unknown;
      clientCaptureId?: unknown;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    // ── Validation: imageBase64 ──────────────────────────────────────────
    if (typeof body.imageBase64 !== "string" || body.imageBase64.length === 0) {
      return c.json(
        { error: "imageBase64 is required and must be a base64 string" },
        400,
      );
    }
    // T-129.1-10 mitigation: payload cap BEFORE the Anthropic call.
    if (body.imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      return c.json({ error: "Image too large" }, 413);
    }

    // ── Validation: mediaType ─────────────────────────────────────────────
    if (typeof body.mediaType !== "string") {
      return c.json({ error: "mediaType is required" }, 400);
    }
    if (!VALID_MEDIA_TYPES.includes(body.mediaType as MediaType)) {
      return c.json(
        {
          error: `Invalid mediaType. Must be one of: ${VALID_MEDIA_TYPES.join(", ")}`,
        },
        400,
      );
    }
    const mediaType = body.mediaType as MediaType;

    // ── Validation: clientCaptureId (UUID v4 shape) ──────────────────────
    if (
      typeof body.clientCaptureId !== "string" ||
      body.clientCaptureId.length === 0
    ) {
      return c.json(
        {
          error:
            "clientCaptureId is required (server-side preserved for SVCNOW-04 dedup)",
        },
        400,
      );
    }
    if (!UUID_V4_REGEX.test(body.clientCaptureId)) {
      return c.json(
        { error: "clientCaptureId must be a UUID v4" },
        400,
      );
    }
    const clientCaptureId = body.clientCaptureId;

    // ── AI client gate ────────────────────────────────────────────────────
    if (!getAIClientFn()) {
      return c.json(
        {
          error: "AI service unavailable. ANTHROPIC_API_KEY not configured.",
        },
        503,
      );
    }

    // ── SVCNOW-04 dedup: short-circuit before Anthropic call ─────────────
    // Application-layer SELECT-by-(userId, clientCaptureId) guard — mirrors
    // work-orders.ts dbInsertOrGet (lines 321-336) and the partial unique
    // index from migration 0021. T-129.1-13 replay mitigation.
    const existing = await dbRef
      .select()
      .from(workOrders)
      .where(
        and(
          eq(workOrders.userId, userId),
          eq(workOrders.clientCaptureId, clientCaptureId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0]!;
      // Best-effort parse of the JSON-encoded extras stored in `notes`.
      let extras: ExtraExtracted = {};
      if (row.notes) {
        try {
          extras = JSON.parse(row.notes) as ExtraExtracted;
        } catch {
          extras = {};
        }
      }
      const echoed: RequiredExtracted = {
        case_number: row.caseNumber,
        short_description: row.shortDescription,
        store: row.store ?? "",
        location: row.location,
        maintenance_problem: row.maintenanceProblem ?? "",
      };
      return c.json(
        {
          workOrderId: row.caseNumber,
          duplicate: true,
          extractedFields: echoed,
          extraExtractedFields: extras,
        },
        200,
      );
    }

    // ── Vision extraction ─────────────────────────────────────────────────
    let extracted: ExtractionResult;
    try {
      const rawText = await callClaudeMultimodalFn({
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: body.imageBase64,
            },
          },
          {
            type: "text",
            text: EXTRACTION_PROMPT,
          },
        ],
        maxTokens: 1500,
        userId,
      });
      extracted = parseAIJson<ExtractionResult>(rawText);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown AI error";
      return c.json({ error: message }, 502);
    }

    // Validate extracted shape — case_number must be non-empty for any
    // pending_review row to make operator sense.
    if (
      !extracted?.required?.case_number ||
      typeof extracted.required.case_number !== "string" ||
      extracted.required.case_number.trim() === ""
    ) {
      return c.json(
        {
          error: "Vision extraction returned no case_number",
          extras: extracted?.extras ?? {},
        },
        422,
      );
    }

    const required: RequiredExtracted = {
      case_number: String(extracted.required.case_number),
      short_description: String(extracted.required.short_description ?? ""),
      store: String(extracted.required.store ?? ""),
      location: String(extracted.required.location ?? ""),
      maintenance_problem: String(
        extracted.required.maintenance_problem ?? "",
      ),
    };
    const extras: ExtraExtracted = extracted.extras ?? {};

    // ── Insert work_order row in pending_review ──────────────────────────
    // case_number PK collision → onConflictDoUpdate (latest screenshot wins
    // per RESEARCH Risk 1 / T-129.1-14 accepted risk; operator's review
    // step is the safety net).
    // `department` column left empty post-UAT remap (2026-05-17) — queued
    // for removal in 129.2 follow-up.
    const inserted = await dbRef
      .insert(workOrders)
      .values({
        caseNumber: required.case_number,
        userId,
        store: required.store,
        shortDescription: required.short_description,
        trade: extras.trade ?? "",
        location: required.location,
        equipment: extras.equipment ?? "",
        priority: extras.priority ?? "",
        contact: extras.contact ?? "",
        state: "pending_review",
        notes: JSON.stringify(extras),
        syncedAt: new Date(),
        clientCaptureId,
        maintenanceProblem: required.maintenance_problem,
        department: "",
      })
      .onConflictDoUpdate({
        target: workOrders.caseNumber,
        set: {
          store: required.store,
          shortDescription: required.short_description,
          trade: extras.trade ?? "",
          location: required.location,
          equipment: extras.equipment ?? "",
          priority: extras.priority ?? "",
          contact: extras.contact ?? "",
          state: "pending_review",
          notes: JSON.stringify(extras),
          syncedAt: new Date(),
          clientCaptureId,
          maintenanceProblem: required.maintenance_problem,
          department: "",
        },
      })
      .returning();

    return c.json(
      {
        workOrderId: inserted[0]!.caseNumber,
        duplicate: false,
        extractedFields: required,
        extraExtractedFields: extras,
      },
      200,
    );
  });

  return router;
}

// ── Production singleton (real db + real Anthropic) ───────────────────────
// Pre-wired binding for vigil-core/src/index.ts mount. Mirrors the
// workOrdersRouter pattern at work-orders.ts:310.
export const capturesScreenshot = createCapturesScreenshotRoute();
