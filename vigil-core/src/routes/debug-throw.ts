// TEMPORARY — Phase 103 Plan 04 ANLY-01 verification route.
// DELETE after PostHog event verified in prod.
// This route exists only to trigger a production-side app.onError call
// so we can confirm PostHog receives the event with stack trace.
import { Hono } from "hono";

export const debugThrow = new Hono();
debugThrow.get("/debug-throw", () => {
  throw new Error("phase-103-verification-throw");
});
