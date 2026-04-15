import { Hono } from "hono";
import { db } from "../db/connection.js";
import { appSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PrintSchedule {
  hour: number;
  minute: number;
  enabled: boolean;
}

// ── Storage key constants (snake_case) ────────────────────────────────────────

const PRINT_SCHEDULE_KEY = "print_schedule";
const GENERATE_SCHEDULE_KEY = "generate_schedule";

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_PRINT: PrintSchedule = { hour: 6, minute: 0, enabled: true };
const DEFAULT_GENERATE: PrintSchedule = { hour: 4, minute: 0, enabled: true };

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

// ── DI interface ──────────────────────────────────────────────────────────────

export interface SettingsDeps {
  // print schedule
  dbGetFn?: () => Promise<PrintSchedule | null>;
  dbUpsertFn?: (s: PrintSchedule) => Promise<void>;
  // generate schedule
  dbGetGenerateFn?: () => Promise<PrintSchedule | null>;
  dbUpsertGenerateFn?: (s: PrintSchedule) => Promise<void>;
}

// ── Router factory ────────────────────────────────────────────────────────────

export function createSettingsRouter(deps?: SettingsDeps): Hono {
  const router = new Hono();

  // ── Print schedule ─────────────────────────────────────────────────────────

  router.get("/settings/print-schedule", async (c) => {
    try {
      let schedule: PrintSchedule;
      if (deps?.dbGetFn) {
        schedule = (await deps.dbGetFn()) ?? DEFAULT_PRINT;
      } else {
        if (!db) return c.json({ error: "database_unavailable" }, 503);
        const rows = await db
          .select({ value: appSettings.value })
          .from(appSettings)
          .where(eq(appSettings.key, PRINT_SCHEDULE_KEY))
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
          .values({ key: PRINT_SCHEDULE_KEY, value: schedule })
          .onConflictDoUpdate({
            target: appSettings.key,
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
      let schedule: PrintSchedule;
      if (deps?.dbGetGenerateFn) {
        schedule = (await deps.dbGetGenerateFn()) ?? DEFAULT_GENERATE;
      } else {
        if (!db) return c.json({ error: "database_unavailable" }, 503);
        const rows = await db
          .select({ value: appSettings.value })
          .from(appSettings)
          .where(eq(appSettings.key, GENERATE_SCHEDULE_KEY))
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
          .values({ key: GENERATE_SCHEDULE_KEY, value: schedule })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: { value: schedule, updatedAt: new Date() },
          });
      }
      return c.json({ ok: true }, 200);
    } catch (err) {
      console.error("[settings] PUT generate-schedule error:", err instanceof Error ? err.message : String(err));
      return c.json({ error: "internal_error" }, 500);
    }
  });

  return router;
}

export const settings = createSettingsRouter();
