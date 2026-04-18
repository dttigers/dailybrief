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

// TODO(AUTH-06+): Per-user scheduler fan-out. For Phase 102 the scheduler is
// hard-scoped to the seed user (VIGIL_SEED_USER_EMAIL). Future phase: iterate
// over all users' appSettings and dispatch a brief-generate per user per
// schedule window. Captured in RESEARCH Open Q4.

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
  // Optional DI seam: resolve seed user id synchronously for tests.
  seedUserId?: number;
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

  // Phase 102 RESEARCH Open Q4: hard-scope to seed user at service start.
  // Resolved lazily on first tick so tests that inject seedUserId can skip the DB lookup.
  let resolvedSeedUserId: number | null = deps.seedUserId ?? null;
  async function getSeedUserId(): Promise<number | null> {
    if (resolvedSeedUserId !== null) return resolvedSeedUserId;
    if (!deps.db) return null;
    const seedEmail = (process.env["VIGIL_SEED_USER_EMAIL"] ?? "jamesonmorrill1@gmail.com").trim().toLowerCase();
    const rows = await deps.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, seedEmail))
      .limit(1);
    if (rows.length === 0) {
      log("error", `seed user not found: ${seedEmail} — run migration first`);
      return null;
    }
    resolvedSeedUserId = rows[0].id;
    return resolvedSeedUserId;
  }

  // ── Real drizzle implementations (used if caller did not inject fn) ────

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

      // Resolve seed user id (Phase 102 hard-scope). Silent-skip if missing.
      const seedUserId = await getSeedUserId();
      if (seedUserId === null) {
        log("warn", "seed user not resolved, skipping tick");
        return;
      }

      // Read settings (scoped to seed user via composite PK)
      const tzRaw = await getSettingViaDb("user_timezone", seedUserId);
      const tz = typeof tzRaw === "string" && tzRaw.length > 0 ? tzRaw : DEFAULT_TIMEZONE;

      const schedRaw = await getSettingViaDb("generate_schedule", seedUserId);
      const schedule: GenerateSchedule =
        schedRaw && typeof schedRaw === "object"
          ? (schedRaw as GenerateSchedule)
          : DEFAULT_SCHEDULE;

      if (!schedule.enabled) return; // D-04-adjacent: disabled = silent skip

      // Timezone-aware matching
      const { date: todayInTz, hour: hourInTz, minute: minuteInTz } = partsInZone(now(), tz);
      if (hourInTz !== schedule.hour || minuteInTz !== schedule.minute) return;

      // Dedupe check (D-03) — scoped by seed userId
      const recent = await getRecentBriefViaDb(todayInTz, seedUserId);
      if (recent && now().getTime() - recent.createdAt.getTime() < dedupeWindowMs) {
        log("info", `dedupe: brief for ${todayInTz} generated recently, skipping`);
        return;
      }

      // Generate (assemble for seed user; brief row carries seed userId)
      try {
        const result = await deps.assemble(todayInTz, seedUserId);
        const summaryJson = { generatedAt: new Date().toISOString(), partial: false };
        await upsertBriefViaDb({
          userId: seedUserId,
          date: todayInTz,
          bytes: result.buffer,
          thoughtCount: result.metadata.thoughtCount,
          taskCount: result.metadata.taskCount,
          summary: summaryJson,
        });
        log("info", `generated brief for ${todayInTz}`);
      } catch (err) {
        log("error", "generate failed", err instanceof Error ? err.message : String(err));
        return;
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
