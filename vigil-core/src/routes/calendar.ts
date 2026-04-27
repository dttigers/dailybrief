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

  // PUT /calendar/selections — overwrite the calling user's calendar_selections
  // wholesale (Phase 115 CAL-01).
  // Body: { selectedCalendarIds: string[] } — empty array is valid (= the
  // existing all-calendars fallback inside fetchTodaysEvents kicks in).
  // Bearer-gated via the global bearerAuth dispatcher mounted in index.ts;
  // userId is scoped via c.get("userId") (NEVER taken from the request body —
  // T-115-01-04 cross-tenant write mitigation).
  // Validation (array shape, string elements, cap=1000) is single-sourced in
  // the service layer's validateCalendarIds — the route catches the throw and
  // maps it to 400 (T-115-01-02 / T-115-01-03 mitigation).
  router.put("/calendar/selections", async (c) => {
    const userId = c.get("userId") as number;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body must be an object" }, 400);
    }
    const ids = (body as { selectedCalendarIds?: unknown }).selectedCalendarIds;
    try {
      await service.setCalendarSelections(userId, ids as string[]);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Validation failed" }, 400);
    }
    return c.json({ ok: true });
  });

  return router;
}

// ── Production route (no deps override — uses real DB + fetch) ────────────────

export const calendar = createCalendarRouter();
