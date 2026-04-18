import { Hono } from "hono";
import { db } from "../db/connection.js";
import { appSettings } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PrintSchedule {
  hour: number;
  minute: number;
  enabled: boolean;
}

// ── Storage key constants (snake_case) ────────────────────────────────────────

const PRINT_SCHEDULE_KEY = "print_schedule";
const GENERATE_SCHEDULE_KEY = "generate_schedule";
const TIMEZONE_KEY = "user_timezone";
const TASK_STATUS_FILTER_KEY = "task_status_filter";

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_PRINT: PrintSchedule = { hour: 6, minute: 0, enabled: true };
const DEFAULT_GENERATE: PrintSchedule = { hour: 4, minute: 0, enabled: true };
const DEFAULT_TIMEZONE = "America/New_York";

// ── Shared validators ─────────────────────────────────────────────────────────

function isValidSchedule(body: unknown): body is PrintSchedule {
  return (
    typeof body === "object" && body !== null &&
    typeof (body as PrintSchedule).hour === "number" &&
    typeof (body as PrintSchedule).minute === "number" &&
    typeof (body as PrintSchedule).enabled === "boolean" &&
    (body as PrintSchedule).hour >= 0 && (body as PrintSchedule).hour <= 23 &&
    (body as PrintSchedule).minute >= 0 && (body as PrintSchedule).minute <= 59
  );
}

function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0) return false;
  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
    return typeof resolved === "string" && resolved.length > 0;
  } catch {
    return false;
  }
}

// ── DI interface ──────────────────────────────────────────────────────────────

export interface SettingsDeps {
  // print schedule
  dbGetFn?: () => Promise<PrintSchedule | null>;
  dbUpsertFn?: (s: PrintSchedule) => Promise<void>;
  // generate schedule
  dbGetGenerateFn?: () => Promise<PrintSchedule | null>;
  dbUpsertGenerateFn?: (s: PrintSchedule) => Promise<void>;
  // timezone
  dbGetTimezoneFn?: () => Promise<string | null>;
  dbUpsertTimezoneFn?: (tz: string) => Promise<void>;
}

// ── Router factory ────────────────────────────────────────────────────────────

export function createSettingsRouter(deps?: SettingsDeps): Hono {
  const router = new Hono();

  // ── Print schedule ─────────────────────────────────────────────────────────

  router.get("/settings/print-schedule", async (c) => {
    try {
      const userId = c.get("userId");
      let schedule: PrintSchedule;
      if (deps?.dbGetFn) {
        schedule = (await deps.dbGetFn()) ?? DEFAULT_PRINT;
      } else {
        if (!db) return c.json({ error: "database_unavailable" }, 503);
        // Phase 102: appSettings PK is composite (userId, key).
        const rows = await db
          .select({ value: appSettings.value })
          .from(appSettings)
          .where(and(eq(appSettings.userId, userId), eq(appSettings.key, PRINT_SCHEDULE_KEY)))
          .limit(1);
        schedule = rows.length > 0
          ? (rows[0].value as PrintSchedule)
          : DEFAULT_PRINT;
      }
      return c.json(schedule, 200);
    } catch (err) {
      console.error("[settings] GET print-schedule error:", err instanceof Error ? err.message : String(err));
      return c.json({ error: "internal_error" }, 500);
    }
  });

  router.put("/settings/print-schedule", async (c) => {
    try {
      const userId = c.get("userId");
      const body = await c.req.json<unknown>();
      if (!isValidSchedule(body)) {
        return c.json({ error: "invalid_input" }, 400);
      }
      const schedule = body;

      if (deps?.dbUpsertFn) {
        await deps.dbUpsertFn(schedule);
      } else {
        if (!db) return c.json({ error: "database_unavailable" }, 503);
        await db.insert(appSettings)
          .values({ userId, key: PRINT_SCHEDULE_KEY, value: schedule })
          .onConflictDoUpdate({
            target: [appSettings.userId, appSettings.key],
            set: { value: schedule, updatedAt: new Date() },
          });
      }
      return c.json({ ok: true }, 200);
    } catch (err) {
      console.error("[settings] PUT print-schedule error:", err instanceof Error ? err.message : String(err));
      return c.json({ error: "internal_error" }, 500);
    }
  });

  // ── Generate schedule ──────────────────────────────────────────────────────

  router.get("/settings/generate-schedule", async (c) => {
    try {
      const userId = c.get("userId");
      let schedule: PrintSchedule;
      if (deps?.dbGetGenerateFn) {
        schedule = (await deps.dbGetGenerateFn()) ?? DEFAULT_GENERATE;
      } else {
        if (!db) return c.json({ error: "database_unavailable" }, 503);
        const rows = await db
          .select({ value: appSettings.value })
          .from(appSettings)
          .where(and(eq(appSettings.userId, userId), eq(appSettings.key, GENERATE_SCHEDULE_KEY)))
          .limit(1);
        schedule = rows.length > 0
          ? (rows[0].value as PrintSchedule)
          : DEFAULT_GENERATE;
      }
      return c.json(schedule, 200);
    } catch (err) {
      console.error("[settings] GET generate-schedule error:", err instanceof Error ? err.message : String(err));
      return c.json({ error: "internal_error" }, 500);
    }
  });

  router.put("/settings/generate-schedule", async (c) => {
    try {
      const userId = c.get("userId");
      const body = await c.req.json<unknown>();
      if (!isValidSchedule(body)) {
        return c.json({ error: "invalid_input" }, 400);
      }
      const schedule = body;

      if (deps?.dbUpsertGenerateFn) {
        await deps.dbUpsertGenerateFn(schedule);
      } else {
        if (!db) return c.json({ error: "database_unavailable" }, 503);
        await db.insert(appSettings)
          .values({ userId, key: GENERATE_SCHEDULE_KEY, value: schedule })
          .onConflictDoUpdate({
            target: [appSettings.userId, appSettings.key],
            set: { value: schedule, updatedAt: new Date() },
          });
      }
      return c.json({ ok: true }, 200);
    } catch (err) {
      console.error("[settings] PUT generate-schedule error:", err instanceof Error ? err.message : String(err));
      return c.json({ error: "internal_error" }, 500);
    }
  });

  // ── Timezone ───────────────────────────────────────────────────────────────

  router.get("/settings/timezone", async (c) => {
    try {
      const userId = c.get("userId");
      let tz: string;
      if (deps?.dbGetTimezoneFn) {
        tz = (await deps.dbGetTimezoneFn()) ?? DEFAULT_TIMEZONE;
      } else {
        if (!db) return c.json({ error: "database_unavailable" }, 503);
        const rows = await db
          .select({ value: appSettings.value })
          .from(appSettings)
          .where(and(eq(appSettings.userId, userId), eq(appSettings.key, TIMEZONE_KEY)))
          .limit(1);
        tz = rows.length > 0 ? (rows[0].value as string) : DEFAULT_TIMEZONE;
      }
      return c.json({ timezone: tz }, 200);
    } catch (err) {
      console.error("[settings] GET timezone error:", err instanceof Error ? err.message : String(err));
      return c.json({ error: "internal_error" }, 500);
    }
  });

  router.put("/settings/timezone", async (c) => {
    try {
      const userId = c.get("userId");
      const body = await c.req.json<unknown>();
      const tz = (body as { timezone?: unknown } | null)?.timezone;
      if (!isValidTimezone(tz)) {
        return c.json({ error: "invalid_timezone" }, 400);
      }

      if (deps?.dbUpsertTimezoneFn) {
        await deps.dbUpsertTimezoneFn(tz);
      } else {
        if (!db) return c.json({ error: "database_unavailable" }, 503);
        await db.insert(appSettings)
          .values({ userId, key: TIMEZONE_KEY, value: tz })
          .onConflictDoUpdate({
            target: [appSettings.userId, appSettings.key],
            set: { value: tz, updatedAt: new Date() },
          });
      }
      return c.json({ ok: true }, 200);
    } catch (err) {
      console.error("[settings] PUT timezone error:", err instanceof Error ? err.message : String(err));
      return c.json({ error: "internal_error" }, 500);
    }
  });

  // ── Task status filter ─────────────────────────────────────────────────────

  const VALID_TASK_FILTERS = ["open", "done", "all"] as const;

  router.get("/settings/task-status-filter", async (c) => {
    try {
      const userId = c.get("userId");
      if (!db) return c.json({ error: "database_unavailable" }, 503);
      const rows = await db
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(and(eq(appSettings.userId, userId), eq(appSettings.key, TASK_STATUS_FILTER_KEY)))
        .limit(1);
      const filter = rows.length > 0 ? (rows[0].value as string) : "open";
      return c.json({ filter }, 200);
    } catch (err) {
      console.error("[settings] GET task-status-filter error:", err instanceof Error ? err.message : String(err));
      return c.json({ error: "internal_error" }, 500);
    }
  });

  router.put("/settings/task-status-filter", async (c) => {
    try {
      const userId = c.get("userId");
      const body = await c.req.json<unknown>();
      const filter = (body as { filter?: unknown } | null)?.filter;
      if (typeof filter !== "string" || !VALID_TASK_FILTERS.includes(filter as typeof VALID_TASK_FILTERS[number])) {
        return c.json({ error: "invalid_filter", valid: VALID_TASK_FILTERS }, 400);
      }

      if (!db) return c.json({ error: "database_unavailable" }, 503);
      await db.insert(appSettings)
        .values({ userId, key: TASK_STATUS_FILTER_KEY, value: filter })
        .onConflictDoUpdate({
          target: [appSettings.userId, appSettings.key],
          set: { value: filter, updatedAt: new Date() },
        });
      return c.json({ ok: true }, 200);
    } catch (err) {
      console.error("[settings] PUT task-status-filter error:", err instanceof Error ? err.message : String(err));
      return c.json({ error: "internal_error" }, 500);
    }
  });

  return router;
}

export const settings = createSettingsRouter();
