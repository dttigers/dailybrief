// In-process generate scheduler for Phase 86.
// Wakes every 60s, reads generate_schedule + user_timezone from app_settings, fires brief
// assembly on exact minute match (in user TZ), dedupes within a 10-minute window.
// PDF bytes are written to brief_pdfs (D-03). No retention sweep (D-09: keep forever).
//
// Design:
//   • Scheduler invokes brief-assembly-service directly — NEVER self-HTTP (T-86-10).
//   • tick() is total-function: catches all errors, never throws (T-86-07).
//   • DI seams (getSettingFn / getRecentBriefFn / upsertBriefFn) keep tests free of drizzle.
//     When absent, real drizzle is used.

import { sql, eq, and } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { briefs, briefPdfs, appSettings, users } from "../db/schema.js";
import type * as schema from "../db/schema.js";

// Phase 109 (SCHED-01): scheduler now iterates all users via `getAllUsersFn`
// (DI seam, defaults to `SELECT id, email FROM users ORDER BY id`). Per-user
// try/catch uses `continue` so one user's failure does not block others in
// the same tick. Seed-user hard-scope from Phase 102 removed. Sibling
// services gmail-workorder-service.ts + calendar-service.ts carry analogous
// AUTH-06+ markers which are addressed in their own changes (calendar in
// Phase 109, gmail deferred to a future phase per CONTEXT §Deferred Ideas).

// ── Types ────────────────────────────────────────────────────────────────────

export interface GenerateSchedule {
  hour: number;
  minute: number;
  enabled: boolean;
}

export interface GenerateSchedulerDeps {
  db: PostgresJsDatabase<typeof schema> | null;
  assemble: (dateStr: string, userId: number) => Promise<{
    buffer: Buffer;
    metadata: { thoughtCount: number; taskCount: number; dateStr: string };
  }>;
  now?: () => Date;
  logFn?: (level: "info" | "warn" | "error", msg: string, meta?: unknown) => void;
  tickIntervalMs?: number;
  dedupeWindowMs?: number;

  // Optional DI seams for testing (override drizzle access completely)
  getSettingFn?: (key: string) => Promise<unknown | null>;
  getRecentBriefFn?: (date: string) => Promise<{ createdAt: Date } | null>;
  upsertBriefFn?: (b: {
    userId: number;
    date: string;
    bytes: Buffer;
    thoughtCount: number;
    taskCount: number;
    summary: object;
  }) => Promise<void>;

  /**
   * Phase 109 (SCHED-01) DI seam: return every registered user for fan-out.
   * When absent, the scheduler reads `users` directly via `deps.db` ordered by id ASC.
   */
  getAllUsersFn?: () => Promise<Array<{ id: number; email: string }>>;
}

export interface GenerateScheduler {
  start(): void;
  stop(): void;
  tick(): Promise<void>;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_TIMEZONE = "America/New_York";
const DEFAULT_SCHEDULE: GenerateSchedule = { hour: 4, minute: 0, enabled: true };
const DEFAULT_TICK_INTERVAL_MS = 60_000;
const DEFAULT_DEDUPE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes (D-03)

// ── Timezone-aware "now" parts ───────────────────────────────────────────────

function partsInZone(now: Date, tz: string): { date: string; hour: number; minute: number } {
  // en-CA produces "YYYY-MM-DD" ordering for the date, 24h clock for the time.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  // Intl produces "24" for midnight on some engines (Node/ICU versions) — normalize to "00".
  const hourStr = map.hour === "24" ? "00" : map.hour;

  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hour: Number(hourStr),
    minute: Number(map.minute),
  };
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createGenerateScheduler(deps: GenerateSchedulerDeps): GenerateScheduler {
  const now = deps.now ?? (() => new Date());
  const log = deps.logFn ?? (() => {});
  const tickIntervalMs = deps.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;
  const dedupeWindowMs = deps.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;

  // ── Real drizzle implementations (used if caller did not inject fn) ────

  // Phase 109 (SCHED-01): default getAllUsersFn closes over deps.db.
  // Test DI path overrides via deps.getAllUsersFn.
  async function getAllUsersViaDb(): Promise<Array<{ id: number; email: string }>> {
    if (deps.getAllUsersFn) return deps.getAllUsersFn();
    if (!deps.db) return [];
    return deps.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .orderBy(users.id);
  }

  async function getSettingViaDb(key: string, userId: number): Promise<unknown | null> {
    if (deps.getSettingFn) return deps.getSettingFn(key);
    if (!deps.db) return null;
    const rows = await deps.db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(and(eq(appSettings.userId, userId), eq(appSettings.key, key)))
      .limit(1);
    return rows.length > 0 ? rows[0].value : null;
  }

  async function getRecentBriefViaDb(date: string, userId: number): Promise<{ createdAt: Date } | null> {
    if (deps.getRecentBriefFn) return deps.getRecentBriefFn(date);
    if (!deps.db) return null;
    const rows = await deps.db
      .select({ createdAt: briefs.createdAt })
      .from(briefs)
      .where(and(eq(briefs.userId, userId), eq(briefs.date, date)))
      .limit(1);
    return rows.length > 0 ? { createdAt: rows[0].createdAt } : null;
  }

  async function upsertBriefViaDb(b: {
    userId: number;
    date: string;
    bytes: Buffer;
    thoughtCount: number;
    taskCount: number;
    summary: object;
  }): Promise<void> {
    if (deps.upsertBriefFn) return deps.upsertBriefFn(b);
    if (!deps.db) return;

    // WR-01: Wrap both upserts in a single transaction so either both rows land or
    // neither does. Prevents leaking a `brief_pdf_not_stored` state if the bytes
    // insert fails after the metadata insert succeeds.
    // Phase 102: composite conflict target (userId, date); briefPdfs.userId denormalized.
    await deps.db.transaction(async (tx) => {
      const [briefRow] = await tx.insert(briefs).values({
        userId: b.userId,
        date: b.date,
        summary: b.summary,
        pdfFilename: null,
        thoughtCount: b.thoughtCount,
        taskCount: b.taskCount,
      }).onConflictDoUpdate({
        target: [briefs.userId, briefs.date],
        set: {
          summary: b.summary,
          pdfFilename: null,
          thoughtCount: b.thoughtCount,
          taskCount: b.taskCount,
          createdAt: sql`now()`,
        },
      }).returning({ id: briefs.id });

      await tx.insert(briefPdfs).values({
        userId: b.userId,
        briefId: briefRow.id,
        bytes: b.bytes,
        contentType: "application/pdf",
        byteLength: b.bytes.length,
      }).onConflictDoUpdate({
        target: briefPdfs.briefId,
        set: {
          bytes: b.bytes,
          contentType: "application/pdf",
          byteLength: b.bytes.length,
          createdAt: sql`now()`,
        },
      });
    });
  }

  // ── tick() — one cycle of the cron loop ────────────────────────────────

  async function tick(): Promise<void> {
    try {
      // If neither real db nor injected fns, there is nothing to read.
      const canRead = deps.getSettingFn || deps.db;
      if (!canRead) {
        log("warn", "db unavailable and no getSettingFn, skipping tick");
        return;
      }

      // Phase 109 (SCHED-01): fan out across every registered user.
      const allUsers = await getAllUsersViaDb();
      if (allUsers.length === 0) {
        log("info", "no users found, skipping tick");
        return;
      }

      // Sequential by design: N is 1..few for the foreseeable future.
      // Revisit at N > 10 users (CONTEXT Deferred §Timezone-matching perf).
      for (const user of allUsers) {
        const { id: userId, email } = user;
        try {
          // Read settings scoped to this user (appSettings PK = (userId, key))
          const tzRaw = await getSettingViaDb("user_timezone", userId);
          const tz = typeof tzRaw === "string" && tzRaw.length > 0 ? tzRaw : DEFAULT_TIMEZONE;

          const schedRaw = await getSettingViaDb("generate_schedule", userId);
          const schedule: GenerateSchedule =
            schedRaw && typeof schedRaw === "object"
              ? (schedRaw as GenerateSchedule)
              : DEFAULT_SCHEDULE;

          if (!schedule.enabled) continue; // disabled = silent skip for this user

          // Timezone-aware matching in this user's TZ
          const { date: todayInTz, hour: hourInTz, minute: minuteInTz } = partsInZone(now(), tz);
          if (hourInTz !== schedule.hour || minuteInTz !== schedule.minute) continue;

          // Dedupe check (D-03) — scoped by this userId
          const recent = await getRecentBriefViaDb(todayInTz, userId);
          if (recent && now().getTime() - recent.createdAt.getTime() < dedupeWindowMs) {
            log("info", `dedupe: brief for ${todayInTz} user ${userId} (${email}) generated recently, skipping`);
            continue;
          }

          // Generate per user
          const result = await deps.assemble(todayInTz, userId);
          const summaryJson = { generatedAt: new Date().toISOString(), partial: false };
          await upsertBriefViaDb({
            userId,
            date: todayInTz,
            bytes: result.buffer,
            thoughtCount: result.metadata.thoughtCount,
            taskCount: result.metadata.taskCount,
            summary: summaryJson,
          });
          log("info", `generated brief for ${todayInTz} user ${userId} (${email})`);
        } catch (err) {
          // D-04 + D-05: per-user error isolation — log and continue (NEVER return).
          // One user's failure must not block subsequent users this tick (SCHED-01 SC#2).
          log(
            "error",
            `generate failed for user ${userId} (${email})`,
            err instanceof Error ? err.message : String(err),
          );
          continue;
        }
      }
    } catch (err) {
      // Absolute fail-safe: tick must never throw (T-86-07)
      log("error", "tick threw unexpectedly", err instanceof Error ? err.message : String(err));
    }
  }

  // ── start/stop lifecycle ───────────────────────────────────────────────

  let handle: NodeJS.Timeout | null = null;

  return {
    start() {
      if (handle) return; // idempotent
      handle = setInterval(() => {
        tick().catch((e) => log("error", "tick rejected", e instanceof Error ? e.message : String(e)));
      }, tickIntervalMs);
    },
    stop() {
      if (handle) {
        clearInterval(handle);
        handle = null;
      }
    },
    tick,
  };
}
