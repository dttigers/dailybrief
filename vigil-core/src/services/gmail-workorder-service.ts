// Gmail Work Order Import Service
// Polls Gmail for ServiceNow work order emails, parses structured body, upserts to work_orders table.
// Follows calendar-service token pattern and generate-scheduler periodic pattern.

import { db } from "../db/connection.js";
import { oauthTokens, workOrders as workOrdersTable, users } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { decryptToken } from "../utils/token-crypto.js";

// TODO(AUTH-06+) — DEFERRED: Phase 109 (SCHED-01) fanned out the generate-scheduler
// and calendar-service but intentionally deferred this Gmail importer per CONTEXT
// §Deferred Ideas. Current behavior: still hard-scoped to VIGIL_SEED_USER_EMAIL.
// Future phase (candidate: 109.1 or v3.7): iterate users with an oauthTokens row
// for provider="google" and dispatch a separate 5-min import tick per user. Blast
// radius is larger than Phase 109 (new per-user error modes: no token, revoked
// token, quota exhaustion) — hence the split.

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkOrderFromEmail {
  caseNumber: string;
  shortDescription: string;
  state: string;
  store: string;
  contact: string;
  trade: string;
  location: string;
  equipment: string;
  priority: string;
  notes: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
}

interface GmailMessageDetail {
  id: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string };
    }>;
  };
}

export interface GmailWorkOrderDeps {
  tickIntervalMs?: number;
  logFn?: (level: "info" | "warn" | "error", msg: string, meta?: unknown) => void;
}

// ── Token management (mirrors calendar-service pattern) ──────────────────────

async function getValidAccessToken(userId: number): Promise<string> {
  if (!db) throw new Error("Database not available");

  // Phase 102: oauth_tokens is per-user via composite (userId, provider).
  const rows = await db
    .select()
    .from(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, "google")))
    .limit(1);

  if (rows.length === 0) throw new Error("No Google OAuth token found");
  const row = rows[0];

  // Check if token needs refresh (expired or within 5-min buffer)
  const now = new Date();
  const isExpired =
    row.expiresAt == null ||
    row.expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;

  let accessToken = row.accessToken;

  if (isExpired) {
    let refreshToken: string;
    try {
      refreshToken = decryptToken(row.encryptedRefreshToken);
    } catch {
      throw new Error("Failed to decrypt refresh token — re-auth required");
    }

    const { OAuth2Client } = await import("google-auth-library");
    const clientId = process.env["GOOGLE_CLIENT_ID"] ?? "";
    const clientSecret = process.env["GOOGLE_CLIENT_SECRET"] ?? "";
    const oauth2Client = new OAuth2Client(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await oauth2Client.refreshAccessToken();
    accessToken = credentials.access_token ?? "";
    const newExpiry = credentials.expiry_date ? new Date(credentials.expiry_date) : null;

    await db
      .update(oauthTokens)
      .set({ accessToken, expiresAt: newExpiry ?? undefined, updatedAt: new Date() })
      .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, "google")));
  }

  return accessToken;
}

// ── Gmail API helpers ────────────────────────────────────────────────────────

async function gmailSearch(token: string, query: string, maxResults = 20): Promise<GmailMessage[]> {
  const url = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gmail search failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.messages ?? [];
}

async function gmailGetMessage(token: string, messageId: string): Promise<GmailMessageDetail> {
  const url = `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail get message failed: ${res.status}`);
  return res.json();
}

function extractPlainTextBody(msg: GmailMessageDetail): string {
  // Recursively search for text/plain in nested multipart structures
  function findTextPart(part: any): string {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
    if (part.parts) {
      for (const sub of part.parts) {
        const result = findTextPart(sub);
        if (result) return result;
      }
    }
    return "";
  }
  return findTextPart(msg.payload);
}

// ── Work order parsing ───────────────────────────────────────────────────────

function parseWorkOrderEmail(body: string, subject: string): WorkOrderFromEmail | null {
  // Extract case number from subject: "Case CS0356295 has been assigned to you" or "Fwd: Case CS0356295..."
  const caseMatch = subject.match(/Case\s+(CS\d+)/i);
  if (!caseMatch) return null;

  const caseNumber = caseMatch[1];

  // Known field names in order — used to detect where one field ends and the next begins
  const knownFields = [
    "Case", "Short Description", "State", "Store", "Store Contact",
    "Trade", "Location", "Equipment", "Problem", "Priority",
    "Assigned Group", "Owner", "Comments and Work notes",
  ];
  const fieldBoundary = new RegExp(`^\\s*(?:${knownFields.join("|")})\\s*:`, "im");

  // Parse key: value pairs from body, handling multi-line values (forwarded emails wrap long text)
  const field = (key: string): string => {
    const regex = new RegExp(`${key}:\\s*(.+)`, "i");
    const match = body.match(regex);
    if (!match) return "";

    // Get everything after "Key: value" on this line
    let value = match[1].trim();
    // Check for continuation lines (indented or not starting with a known field)
    const startIdx = (match.index ?? 0) + match[0].length;
    const rest = body.slice(startIdx);
    const lines = rest.split(/\r?\n/);
    for (const line of lines) {
      // Stop at next known field or empty line
      if (fieldBoundary.test(line) || line.trim() === "") break;
      value += " " + line.trim();
    }
    return value;
  };

  // Extract notes: everything after "Comments and Work notes:" until "Ref:MSG" or end
  let notes = "";
  const notesMatch = body.match(/Comments and Work notes:\s*([\s\S]*?)(?:Ref:MSG|$)/i);
  if (notesMatch) {
    notes = notesMatch[1].trim();
  }

  return {
    caseNumber,
    shortDescription: field("Short Description"),
    state: field("State"),
    store: field("Store"),
    contact: field("Store Contact"),
    trade: field("Trade"),
    location: field("Location"),
    equipment: field("Equipment"),
    priority: field("Priority"),
    notes,
  };
}

// ── Service factory ──────────────────────────────────────────────────────────

export function createGmailWorkOrderService(deps: GmailWorkOrderDeps = {}) {
  const tickIntervalMs = deps.tickIntervalMs ?? 5 * 60 * 1000; // 5 minutes
  const log = deps.logFn ?? ((level: string, msg: string, meta?: unknown) => {
    const line = `[gmail-workorders] ${msg}`;
    if (level === "error") console.error(line, meta ?? "");
    else if (level === "warn") console.warn(line, meta ?? "");
    else console.log(line);
  });

  // Track processed message IDs in memory (survives across ticks, reset on restart)
  const processedIds = new Set<string>();

  // Phase 102 RESEARCH Open Q4: hard-scope to seed user at first import.
  let resolvedSeedUserId: number | null = null;
  async function getSeedUserId(): Promise<number | null> {
    if (resolvedSeedUserId !== null) return resolvedSeedUserId;
    if (!db) return null;
    const seedEmail = (process.env["VIGIL_SEED_USER_EMAIL"] ?? "jamesonmorrill1@gmail.com").trim().toLowerCase();
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, seedEmail))
      .limit(1);
    if (rows.length === 0) return null;
    resolvedSeedUserId = rows[0].id;
    return resolvedSeedUserId;
  }

  async function importWorkOrders(): Promise<number> {
    if (!db) {
      log("warn", "Database not available — skipping import");
      return 0;
    }

    const seedUserId = await getSeedUserId();
    if (seedUserId === null) {
      log("warn", "Seed user not found — skipping import");
      return 0;
    }

    const token = await getValidAccessToken(seedUserId);

    // Search for work order emails — matches both direct and forwarded copies
    // "Case CS" in subject catches originals and "Fwd: Case CS..." forwards
    // newer_than:30d gives a wide window; processedIds deduplication prevents re-imports
    const messages = await gmailSearch(
      token,
      "subject:(has been assigned) newer_than:30d",
      20,
    );

    if (messages.length === 0) {
      log("info", "No new work order emails found");
      return 0;
    }

    const workOrders: WorkOrderFromEmail[] = [];

    for (const msg of messages) {
      if (processedIds.has(msg.id)) continue;

      const detail = await gmailGetMessage(token, msg.id);
      const subject = detail.payload.headers.find((h) => h.name === "Subject")?.value ?? "";
      const body = extractPlainTextBody(detail);

      const parsed = parseWorkOrderEmail(body, subject);
      if (parsed) {
        workOrders.push(parsed);
      } else {
        log("warn", `Could not parse work order from message ${msg.id}: ${subject}`);
      }

      processedIds.add(msg.id);
    }

    if (workOrders.length === 0) {
      log("info", "No new work orders to import");
      return 0;
    }

    // Upsert to database with change detection (scoped by seedUserId)
    let synced = 0;
    for (const wo of workOrders) {
      try {
        // Check for existing row to detect changes (scoped)
        const existing = await db
          .select()
          .from(workOrdersTable)
          .where(and(eq(workOrdersTable.userId, seedUserId), eq(workOrdersTable.caseNumber, wo.caseNumber)))
          .limit(1);

        let lastChangeSummary: string | null = null;
        let lastChangeAt: Date | null = null;

        if (existing.length > 0) {
          const old = existing[0];
          const changes: string[] = [];
          if (old.shortDescription !== wo.shortDescription) changes.push(`Description: "${old.shortDescription}" → "${wo.shortDescription}"`);
          if (old.state !== wo.state) changes.push(`State: ${old.state} → ${wo.state}`);
          if (old.priority !== wo.priority) changes.push(`Priority: ${old.priority} → ${wo.priority}`);
          if (old.contact !== wo.contact) changes.push(`Contact: ${old.contact} → ${wo.contact}`);
          if (wo.notes && wo.notes !== old.notes) changes.push("Notes updated");

          if (changes.length > 0) {
            lastChangeSummary = changes.join("; ");
            lastChangeAt = new Date();
            log("info", `Work order ${wo.caseNumber} updated: ${lastChangeSummary}`);
          }
        }

        await db
          .insert(workOrdersTable)
          .values({
            userId: seedUserId,
            caseNumber: wo.caseNumber,
            store: wo.store,
            shortDescription: wo.shortDescription,
            trade: wo.trade,
            location: wo.location,
            equipment: wo.equipment,
            priority: wo.priority,
            contact: wo.contact,
            state: wo.state,
            notes: wo.notes,
            syncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: workOrdersTable.caseNumber,
            set: {
              store: wo.store,
              shortDescription: wo.shortDescription,
              trade: wo.trade,
              location: wo.location,
              equipment: wo.equipment,
              priority: wo.priority,
              contact: wo.contact,
              state: wo.state,
              notes: wo.notes,
              ...(lastChangeAt ? { lastChangeAt, lastChangeSummary } : {}),
              syncedAt: new Date(),
            },
          });
        synced++;
      } catch (err) {
        log("error", `Failed to upsert work order ${wo.caseNumber}`, err);
      }
    }

    log("info", `Imported ${synced} work order(s)`);
    return synced;
  }

  // ── Periodic tick ──────────────────────────────────────────────────────────

  async function tick(): Promise<void> {
    try {
      await importWorkOrders();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Don't spam logs for expected failures
      if (msg.includes("No Google OAuth token")) {
        // OAuth not connected yet — silent skip
      } else if (msg.includes("re-auth required")) {
        log("warn", "Google token expired — user needs to re-authenticate");
      } else {
        log("error", "import tick failed", err);
      }
    }
  }

  let handle: NodeJS.Timeout | null = null;

  return {
    start() {
      if (handle) return;
      // Run immediately on start, then on interval
      tick().catch(() => {});
      handle = setInterval(() => {
        tick().catch(() => {});
      }, tickIntervalMs);
    },
    stop() {
      if (handle) {
        clearInterval(handle);
        handle = null;
      }
    },
    tick,
    importWorkOrders,
  };
}
