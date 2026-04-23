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
  // Phase 109 (SCHED-01 D-11): userId is read from bearerAuth context; the
  // calendar-service scopes its oauth_tokens lookup to this user.
  router.get("/calendar/events", async (c) => {
    const userId = c.get("userId") as number;
    const result = await service.fetchTodaysEvents(userId);
    return c.json(result);
  });

  // GET /calendar/list — available calendars for selection UI (per D-08)
  // Returns 200 for all statuses — PWA calendar settings reads status field.
  // Phase 109 (SCHED-01 D-11): userId scoped as above.
  router.get("/calendar/list", async (c) => {
    const userId = c.get("userId") as number;
    const result = await service.fetchCalendarList(userId);
    return c.json(result);
  });

  return router;
}

// ── Production route (no deps override — uses real DB + fetch) ────────────────

export const calendar = createCalendarRouter();
