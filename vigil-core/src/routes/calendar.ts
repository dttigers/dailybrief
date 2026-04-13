import { Hono } from "hono";
import { createCalendarService } from "../services/calendar-service.js";
import type { CalendarServiceDeps } from "../services/calendar-service.js";

// ── Factory (injected deps — used by tests) ───────────────────────────────────

export function createCalendarRouter(deps?: CalendarServiceDeps): Hono {
  const service = createCalendarService(deps);
  const router = new Hono();

  // GET /calendar/events — today's events for brief generation (per D-11)
  // Returns 200 for all statuses (ok, needs_reauth, error) — brief assembly
  // layer checks status field and degrades gracefully.
  router.get("/calendar/events", async (c) => {
    const result = await service.fetchTodaysEvents();
    return c.json(result);
  });

  // GET /calendar/list — available calendars for selection UI (per D-08)
  // Returns 200 for all statuses — PWA calendar settings reads status field.
  router.get("/calendar/list", async (c) => {
    const result = await service.fetchCalendarList();
    return c.json(result);
  });

  return router;
}

// ── Production route (no deps override — uses real DB + fetch) ────────────────

export const calendar = createCalendarRouter();
