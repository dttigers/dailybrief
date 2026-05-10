/**
 * Phase 125 hardware-debug ONLY: ring-buffer log endpoint for diagnosing
 * G2 plugin SSE shim failures from outside the WebView (where Safari
 * Web Inspector isn't available without a USB cable + dev menu).
 *
 * This route is UNAUTHENTICATED and mounted BEFORE the bearerAuth
 * dispatcher because the plugin's failure mode might be auth-related and
 * we want to capture lifecycle events regardless of bearer state.
 *
 * No bearer / no token data should EVER be POSTed to /dev/sse-log
 * (the SSE shim filters Authorization out before sending the lifecycle
 * blob — see vigil-g2-plugin/src/lib/sse-client.ts).
 *
 * REMOVE after Phase 125 SSE bug is resolved.
 */
import { Hono } from "hono";

const MAX_ENTRIES = 200;
const ring: Array<{ ts: string; entry: unknown }> = [];

export const devSseLog = new Hono();

devSseLog.post("/dev/sse-log", async (c) => {
  try {
    const body = await c.req.json();
    ring.push({ ts: new Date().toISOString(), entry: body });
    if (ring.length > MAX_ENTRIES) ring.shift();
    return c.json({ ok: true, count: ring.length });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message }, 400);
  }
});

devSseLog.get("/dev/sse-log", (c) => {
  return c.json({ count: ring.length, entries: ring });
});

devSseLog.delete("/dev/sse-log", (c) => {
  ring.length = 0;
  return c.json({ ok: true });
});
