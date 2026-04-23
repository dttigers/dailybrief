import { Hono } from "hono";
import { callClaude, getAIClient, parseAIJson } from "../ai/client.js";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const prioritize = new Hono();

export interface WorkOrder {
  caseNumber: string;
  store: string;
  shortDescription: string;
  trade: string;
  location: string;
  equipment: string;
  priority: string;
  contact: string;
  state: string;
}

const PRIORITIZE_SYSTEM_PROMPT = `You are a facilities management assistant. Analyze these work orders and rank them by urgency. Consider: safety hazards (electrical, water, gas), customer/business impact (HVAC in extreme weather, security issues, food safety), time-sensitivity (perishable equipment, active leaks), and trade complexity.
Respond with ONLY a JSON array of case numbers in priority order (highest urgency first), e.g. ["CS0353601", "CS0353598"]. No other text.`;

const CACHE_DIR = path.join(os.homedir(), ".cache", "dailybrief");

/**
 * Phase 109 (SCHED-01 D-08): cache filename is scoped by authenticated userId
 * to prevent cross-user cache line sharing. userId is FIRST positional to
 * mirror the assembleAndRender(date, userId) ordering convention elsewhere
 * in the codebase. Pre-migration unscoped files age out at server-TZ
 * midnight naturally (D-10 — no startup sweep).
 */
export function getCacheKey(userId: number, workOrders: WorkOrder[]): string {
  const caseNumbers = workOrders.map((wo) => wo.caseNumber).sort();
  const hash = crypto.createHash("md5").update(JSON.stringify(caseNumbers)).digest("hex");
  const today = new Date().toISOString().slice(0, 10);
  return `wo-priority-${userId}-${today}-${hash}.json`;
}

function formatWorkOrders(workOrders: WorkOrder[]): string {
  return workOrders
    .map(
      (wo, i) =>
        `${i + 1}. Case: ${wo.caseNumber}
   Store: ${wo.store}
   Description: ${wo.shortDescription}
   Trade: ${wo.trade}
   Location: ${wo.location}
   Equipment: ${wo.equipment}
   Priority: ${wo.priority}
   Contact: ${wo.contact}
   State: ${wo.state}`
    )
    .join("\n\n");
}

// POST /prioritize — Rank work orders by urgency via Claude
prioritize.post("/prioritize", async (c) => {
  // Phase 109 (SCHED-01 D-09): userId is non-null because /v1/prioritize is
  // registered after the global bearerAuth dispatcher at index.ts:151. See
  // CONTEXT §Deferred Ideas for rationale of not adding a redundant explicit
  // null-check here.
  const userId = c.get("userId") as number;

  let body: { workOrders?: WorkOrder[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.workOrders || !Array.isArray(body.workOrders) || body.workOrders.length === 0) {
    return c.json({ error: "workOrders is required and must be a non-empty array" }, 400);
  }

  if (!getAIClient()) {
    return c.json(
      { error: "AI service unavailable. ANTHROPIC_API_KEY not configured." },
      503
    );
  }

  // Check cache
  const cacheFile = path.join(CACHE_DIR, getCacheKey(userId, body.workOrders));
  try {
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, "utf-8")) as string[];
      return c.json({ prioritizedCaseNumbers: cached, cached: true }, 200);
    }
  } catch {
    // Cache read failed, proceed without cache
  }

  try {
    const raw = await callClaude({
      system: PRIORITIZE_SYSTEM_PROMPT,
      userMessage: formatWorkOrders(body.workOrders),
      maxTokens: 500,
    });

    let prioritized: string[];
    try {
      prioritized = parseAIJson<string[]>(raw);
    } catch {
      return c.json({ error: "AI response parse error", raw }, 502);
    }

    // Write to cache
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(prioritized));
    } catch {
      // Cache write failed, non-fatal
    }

    return c.json({ prioritizedCaseNumbers: prioritized, cached: false }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI error";
    return c.json({ error: message }, 500);
  }
});
