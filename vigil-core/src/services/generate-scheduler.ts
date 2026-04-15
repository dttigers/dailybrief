// In-process generate scheduler for Phase 86.
// Wakes every 60s, reads generate_schedule + user_timezone from app_settings, fires brief
// assembly on exact minute match (in user TZ), dedupes within a 10-minute window, and runs
// a 7-day retention sweep inline after successful generate.
//
// Design:
//   • Scheduler invokes brief-assembly-service directly — NEVER self-HTTP (T-86-10).
//   • tick() is total-function: catches all errors, never throws (T-86-07).
//   • DI seams (getSettingFn / getRecentBriefFn / upsertBriefFn / selectExpiredBriefsFn /
//     deleteExpiredBriefsFn) keep tests free of drizzle. When absent, real drizzle is used.

import { sql, lt, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as fs from "node:fs";
import { briefs, appSettings } from "../db/schema.js";
import type * as schema from "../db/schema.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GenerateSchedule {
  hour: number;
  minute: number;
  enabled: boolean;
}

export interface GenerateSchedulerDeps {
  db: PostgresJsDatabase<typeof schema> | null;
  assemble: (dateStr: string) => Promise<{
    buffer: Buffer;
    filePath: string;
    metadata: { thoughtCount: number; taskCount: number; dateStr: string };
  }>;
  now?: () => Date;
  unlinkFn?: (p: string) => Promise<void>;
  logFn?: (level: "info" | "warn" | "error", msg: string, meta?: unknown) => void;
  tickIntervalMs?: number;
  dedupeWindowMs?: number;
  retentionDays?: number;

  // Optional DI seams for testing (override drizzle access completely)
  getSettingFn?: (key: string) => Promise<unknown | null>;
  getRecentBriefFn?: (date: string) => Promise<{ createdAt: Date } | null>;
  upsertBriefFn?: (b: {
    date: string;
    pdfFilename: string;
    thoughtCount: number;
    taskCount: number;
    summary: object;
  }) => Promise<void>;
  selectExpiredBriefsFn?: (cutoff: string) => Promise<Array<{ id: number; pdfFilename: string | null }>>;
  deleteExpiredBriefsFn?: (cutoff: string) => Promise<number>;
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
const DEFAULT_RETENTION_DAYS = 7; // D-20

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

// YYYY-MM-DD string arithmetic: subtract N days. Uses UTC math to avoid DST skew (the date-only
// representation has no TZ concept; we just need "N calendar days earlier").
function subtractDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createGenerateScheduler(deps: GenerateSchedulerDeps): GenerateScheduler {
  const now = deps.now ?? (() => new Date());
  const unlinkFn = deps.unlinkFn ?? ((p: string) => fs.promises.unlink(p));
  const log = deps.logFn ?? (() => {});
  const tickIntervalMs = deps.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;
  const dedupeWindowMs = deps.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  const retentionDays = deps.retentionDays ?? DEFAULT_RETENTION_DAYS;

  // ── Real drizzle implementations (used if caller did not inject fn) ────

  async function getSettingViaDb(key: string): Promise<unknown | null> {
    if (deps.getSettingFn) return deps.getSettingFn(key);
    if (!deps.db) return null;
    const rows = await deps.db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);
    return rows.length > 0 ? rows[0].value : null;
  }

  async function getRecentBriefViaDb(date: string): Promise<{ createdAt: Date } | null> {
    if (deps.getRecentBriefFn) return deps.getRecentBriefFn(date);
    if (!deps.db) return null;
    const rows = await deps.db
      .select({ createdAt: briefs.createdAt })
      .from(briefs)
      .where(eq(briefs.date, date))
      .limit(1);
    return rows.length > 0 ? { createdAt: rows[0].createdAt } : null;
  }

  async function upsertBriefViaDb(b: {
    date: string;
    pdfFilename: string;
    thoughtCount: number;
    taskCount: number;
    summary: object;
  }): Promise<void> {
    if (deps.upsertBriefFn) return deps.upsertBriefFn(b);
    if (!deps.db) return;
    await deps.db.insert(briefs).values({
      date: b.date,
      summary: b.summary,
      pdfFilename: b.pdfFilename,
      thoughtCount: b.thoughtCount,
      taskCount: b.taskCount,
    }).onConflictDoUpdate({
      target: briefs.date,
      set: {
        summary: b.summary,
        pdfFilename: b.pdfFilename,
        thoughtCount: b.thoughtCount,
        taskCount: b.taskCount,
        createdAt: sql`now()`,
      },
    });
  }

  async function selectExpiredBriefsViaDb(cutoff: string): Promise<Array<{ id: number; pdfFilename: string | null }>> {
    if (deps.selectExpiredBriefsFn) return deps.selectExpiredBriefsFn(cutoff);
    if (!deps.db) return [];
    return deps.db
      .select({ id: briefs.id, pdfFilename: briefs.pdfFilename })
      .from(briefs)
      .where(lt(briefs.date, cutoff));
  }

  async function deleteExpiredBriefsViaDb(cutoff: string): Promise<number> {
    if (deps.deleteExpiredBriefsFn) return deps.deleteExpiredBriefsFn(cutoff);
    if (!deps.db) return 0;
    const result = await deps.db.delete(briefs).where(lt(briefs.date, cutoff));
    // postgres-js returns { count } or similar; best-effort return
    return (result as unknown as { count?: number }).count ?? 0;
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

      // Read settings
      const tzRaw = await getSettingViaDb("user_timezone");
      const tz = typeof tzRaw === "string" && tzRaw.length > 0 ? tzRaw : DEFAULT_TIMEZONE;

      const schedRaw = await getSettingViaDb("generate_schedule");
      const schedule: GenerateSchedule =
        schedRaw && typeof schedRaw === "object"
          ? (schedRaw as GenerateSchedule)
          : DEFAULT_SCHEDULE;

      if (!schedule.enabled) return; // D-04-adjacent: disabled = silent skip

      // Timezone-aware matching
      const { date: todayInTz, hour: hourInTz, minute: minuteInTz } = partsInZone(now(), tz);
      if (hourInTz !== schedule.hour || minuteInTz !== schedule.minute) return;

      // Dedupe check (D-03)
      const recent = await getRecentBriefViaDb(todayInTz);
      if (recent && now().getTime() - recent.createdAt.getTime() < dedupeWindowMs) {
        log("info", `dedupe: brief for ${todayInTz} generated recently, skipping`);
        return;
      }

      // Generate
      let generatedOk = false;
      try {
        const result = await deps.assemble(todayInTz);
        const summaryJson = { generatedAt: new Date().toISOString(), partial: false };
        await upsertBriefViaDb({
          date: todayInTz,
          pdfFilename: result.filePath,
          thoughtCount: result.metadata.thoughtCount,
          taskCount: result.metadata.taskCount,
          summary: summaryJson,
        });
        log("info", `generated brief for ${todayInTz}`);
        generatedOk = true;
      } catch (err) {
        log("error", "generate failed", err instanceof Error ? err.message : String(err));
        return; // do NOT run retention on failure
      }

      if (!generatedOk) return;

      // Retention sweep (D-20..D-22, best-effort)
      try {
        const cutoff = subtractDays(todayInTz, retentionDays);
        const expired = await selectExpiredBriefsViaDb(cutoff);
        for (const row of expired) {
          if (!row.pdfFilename) continue;
          try {
            await unlinkFn(row.pdfFilename);
          } catch (err) {
            log("warn", `unlink failed for ${row.pdfFilename}`, err instanceof Error ? err.message : String(err));
          }
        }
        await deleteExpiredBriefsViaDb(cutoff);
        log("info", `retention sweep: ${expired.length} rows deleted (< ${cutoff})`);
      } catch (err) {
        log("warn", "retention sweep failed", err instanceof Error ? err.message : String(err));
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
