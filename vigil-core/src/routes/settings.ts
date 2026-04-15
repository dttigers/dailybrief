import { Hono } from "hono";
import { db } from "../db/connection.js";
import { appSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";

export interface PrintSchedule {
  hour: number;
  minute: number;
  enabled: boolean;
}

const DEFAULT_SCHEDULE: PrintSchedule = { hour: 6, minute: 0, enabled: true };
const SETTINGS_KEY = "print_schedule";

// DI interface for testing
export interface SettingsDeps {
  dbGetFn?: () => Promise<PrintSchedule | null>;
  dbUpsertFn?: (s: PrintSchedule) => Promise<void>;
}

export function createSettingsRouter(deps?: SettingsDeps): Hono {
  const router = new Hono();

  router.get("/settings/print-schedule", async (c) => {
    try {
      let schedule: PrintSchedule;
      if (deps?.dbGetFn) {
        schedule = (await deps.dbGetFn()) ?? DEFAULT_SCHEDULE;
      } else {
        if (!db) return c.json({ error: "database_unavailable" }, 503);
        const rows = await db
          .select({ value: appSettings.value })
          .from(appSettings)
          .where(eq(appSettings.key, SETTINGS_KEY))
          .limit(1);
        schedule = rows.length > 0
          ? (rows[0].value as PrintSchedule)
          : DEFAULT_SCHEDULE;
      }
      return c.json(schedule, 200);
    } catch (err) {
      console.error("[settings] GET error:", err instanceof Error ? err.message : String(err));
      return c.json({ error: "internal_error" }, 500);
    }
  });

  router.put("/settings/print-schedule", async (c) => {
    try {
      const body = await c.req.json<unknown>();
      if (
        typeof body !== "object" || body === null ||
        typeof (body as PrintSchedule).hour !== "number" ||
        typeof (body as PrintSchedule).minute !== "number" ||
        typeof (body as PrintSchedule).enabled !== "boolean" ||
        (body as PrintSchedule).hour < 0 || (body as PrintSchedule).hour > 23 ||
        (body as PrintSchedule).minute < 0 || (body as PrintSchedule).minute > 59
      ) {
        return c.json({ error: "invalid_input" }, 400);
      }
      const schedule = body as PrintSchedule;

      if (deps?.dbUpsertFn) {
        await deps.dbUpsertFn(schedule);
      } else {
        if (!db) return c.json({ error: "database_unavailable" }, 503);
        await db.insert(appSettings)
          .values({ key: SETTINGS_KEY, value: schedule })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: { value: schedule, updatedAt: new Date() },
          });
      }
      return c.json({ ok: true }, 200);
    } catch (err) {
      console.error("[settings] PUT error:", err instanceof Error ? err.message : String(err));
      return c.json({ error: "internal_error" }, 500);
    }
  });

  return router;
}

export const settings = createSettingsRouter();
