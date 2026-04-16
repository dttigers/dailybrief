// Gmail Work Order Import Service
// Polls Gmail for ServiceNow work order emails, parses structured body, upserts to work_orders table.
// Follows calendar-service token pattern and generate-scheduler periodic pattern.

import { db } from "../db/connection.js";
import { oauthTokens, workOrders as workOrdersTable } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { decryptToken } from "../utils/token-crypto.js";

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

async function getValidAccessToken(): Promise<string> {
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, "google"))
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
      .where(eq(oauthTokens.provider, "google"));
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
  console.log(`[gmail-workorders] search query="${query}" results=${data.resultSizeEstimate ?? 0} messages=${(data.messages ?? []).length}`);
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
  // Try body.data first (simple messages)
  if (msg.payload.body?.data) {
    return Buffer.from(msg.payload.body.data, "base64url").toString("utf-8");
  }
  // Try parts (multipart messages)
  if (msg.payload.parts) {
    const textPart = msg.payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    }
  }
  return "";
}

// ── Work order parsing ───────────────────────────────────────────────────────

function parseWorkOrderEmail(body: string, subject: string): WorkOrderFromEmail | null {
  // Extract case number from subject: "Case CS0356295 has been assigned to you" or "Fwd: Case CS0356295..."
  const caseMatch = subject.match(/Case\s+(CS\d+)/i);
  if (!caseMatch) return null;

  const caseNumber = caseMatch[1];

  // Parse key: value pairs from body
  const field = (key: string): string => {
    const regex = new RegExp(`${key}:\\s*(.+?)(?:\\r?\\n|$)`, "i");
    const match = body.match(regex);
    return match ? match[1].trim() : "";
  };

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

  async function importWorkOrders(): Promise<number> {
    if (!db) {
      log("warn", "Database not available — skipping import");
      return 0;
    }

    const token = await getValidAccessToken();

    // Log which Gmail account we're searching (debug: identify wrong-account issues)
    try {
      const profileRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        log("info", `Searching Gmail account: ${profile.emailAddress}`);
      }
    } catch { /* non-fatal */ }

    // Search for work order emails — matches both direct and forwarded copies
    // "Case CS" in subject catches originals and "Fwd: Case CS..." forwards
    // newer_than:30d gives a wide window; processedIds deduplication prevents re-imports
    const messages = await gmailSearch(
      token,
      "has been assigned newer_than:30d",
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

    // Upsert to database
    let synced = 0;
    for (const wo of workOrders) {
      try {
        await db
          .insert(workOrdersTable)
          .values({
            caseNumber: wo.caseNumber,
            store: wo.store,
            shortDescription: wo.shortDescription,
            trade: wo.trade,
            location: wo.location,
            equipment: wo.equipment,
            priority: wo.priority,
            contact: wo.contact,
            state: wo.state,
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
