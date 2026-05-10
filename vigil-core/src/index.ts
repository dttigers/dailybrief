import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import { serve } from "@hono/node-server";
import { bearerAuth } from "./middleware/auth.js";
import { rateLimiter } from "./middleware/rate-limit.js";
import { metricsMiddleware } from "./middleware/metrics.js";
import { health } from "./routes/health.js";
import { summary } from "./routes/summary.js";
import { thoughts } from "./routes/thoughts.js";
import { projects } from "./routes/projects.js";
import { tags } from "./routes/tags.js";
import { links } from "./routes/links.js";
import { brief } from "./routes/brief.js";
import { bulk } from "./routes/bulk.js";
import { triage } from "./routes/triage.js";
import { affirmation } from "./routes/affirmation.js";
import { insights } from "./routes/insights.js";
import { prioritize } from "./routes/prioritize.js";
import { describeImage } from "./routes/describe-image.js";
import { processPhoto } from "./routes/process-photo.js";
import { therapy } from "./routes/therapy.js";
import { briefHistory } from "./routes/brief-history.js";
import { exportRoute } from "./routes/export.js";
import { chat } from "./routes/chat.js";
import { processAudio } from "./routes/process-audio.js";
import { chatSessionsRouter } from "./routes/chat-sessions.js";
import { workOrdersRouter } from "./routes/work-orders.js";
import { workOrderStatus } from "./routes/work-order-status.js";
import { sports } from "./routes/sports.js";
import { calendar } from "./routes/calendar.js";
import { googleAuth } from "./routes/google-auth.js";
import { googleStatus } from "./routes/google-status.js";
import { auth as authRoutes } from "./routes/auth.js";
import { changePassword } from "./routes/change-password.js";
import { forgotPassword } from "./routes/forgot-password.js";
import { resetPassword } from "./routes/reset-password.js";
import { me } from "./routes/me.js";
import { authMe } from "./routes/auth-me.js"; // Phase 113 (AUTH-11 D-27) — distinct from /v1/me
import { verifyEmail } from "./routes/verify-email.js";          // Phase 113 (AUTH-11) — unauthenticated; mount BEFORE bearerAuth dispatcher
import { resendVerification } from "./routes/resend-verification.js"; // Phase 113 (AUTH-11) — bearerAuth required; mount AFTER dispatcher
import { agentEvents } from "./routes/agent-events.js"; // Phase 121 (AGENT-API-01, AGENT-API-02) — bearerAuth required; mount AFTER dispatcher
import { agentStream } from "./routes/agent-stream.js"; // Phase 124 (AGENT-API-03) — bearerAuth required; mount AFTER dispatcher
import { captureException, shutdownPosthog } from "./analytics/posthog.js";
import { settings } from "./routes/settings.js";
import { briefGenerate } from "./routes/brief-generate.js";
import { testConnection, closeConnection, db as mainDb } from "./db/connection.js";
import { createGenerateScheduler } from "./services/generate-scheduler.js";
import { createBriefAssemblyService } from "./services/brief-assembly-service.js";
import { getAIClient, callClaude, parseAIJson } from "./ai/client.js";
import { createSportsService } from "./services/sports-service.js";
import { createCalendarService } from "./services/calendar-service.js";
import { createGmailWorkOrderService } from "./services/gmail-workorder-service.js";

// Verify database connection at startup
testConnection();

// Verify required OAuth env vars at startup (WR-03)
for (const key of ["GOOGLE_OAUTH_STATE_SECRET", "GOOGLE_TOKEN_ENCRYPTION_KEY"]) {
  if (!process.env[key]) {
    console.error(`FATAL: required env var ${key} is not set — server will fail on first OAuth request`);
  }
}

// JWT_SECRET: D-18/D-19. utils/jwt.ts exits on its own at import time if missing — this
// pre-check ensures the FATAL line is visible in startup logs before the first import-time exit.
if (!process.env["JWT_SECRET"] || (process.env["JWT_SECRET"] as string).length < 32) {
  console.error("FATAL: JWT_SECRET must be set and at least 32 characters");
  process.exit(1);
}

// Phase 107.2 D-D2 — prod CORS fail-closed guard.
// If a production build ever loses CORS_ORIGINS (env misconfiguration), the existing
// `origin: corsOrigins ?? "*"` fallback at line ~74 would quietly ship wildcard CORS
// to Railway. Refuse to boot instead. Modeled on the JWT_SECRET guard above.
// Dev is unaffected: NODE_ENV is 'development' (or unset) under tsx/npm run dev.
if (process.env.NODE_ENV === "production" && !process.env.CORS_ORIGINS) {
  console.error("FATAL: CORS_ORIGINS must be set in production — refusing to boot with wildcard CORS");
  process.exit(1);
}

export const app = new Hono();

// CORS middleware — must run before auth so preflight OPTIONS requests are not rejected
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : null;

app.use(
  "*",
  cors({
    origin: corsOrigins ?? "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    // Phase 124 D-02: Last-Event-ID is required by the SSE shim on reconnect
    // for missed-event replay. Without it in allowHeaders, the browser CORS
    // preflight rejects the request and the plugin gets stuck offline (`!`).
    allowHeaders: ["Content-Type", "Authorization", "Last-Event-ID"],
  })
);

// Security headers — X-Content-Type-Options, X-Frame-Options, etc.
// Disable CORP and COEP so CORS middleware can allow cross-origin PWA requests
app.use("*", secureHeaders({
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
}));

// Request timeout — 30 seconds max per request
app.use("*", timeout(30_000));

// Rate limiting — 100 requests per 60s per IP (configurable via env)
app.use("*", rateLimiter);

// Health route — no auth required (monitoring)
app.route("/v1", health);

// Auth routes (register/login) — mount BEFORE bearer middleware; public endpoints
// exempted via path check below (Pitfall 8 — CORS preflight would otherwise fail).
app.route("/v1", authRoutes);

// Phase 112 Plan 02 — forgot-password is unauthenticated (must be reachable
// without a JWT). Mount BEFORE bearerAuth and exempt the path below.
app.route("/v1", forgotPassword);

// Phase 112 Plan 03 — reset-password is unauthenticated (the opaque token
// IS the auth credential). Mount BEFORE bearerAuth and exempt the path below.
app.route("/v1", resetPassword);

// Phase 113 (AUTH-11) — verify-email is unauthenticated (the opaque token IS
// the auth credential — D-12). Mount BEFORE bearerAuth and ensure Plan 02
// Task 3 added the path to the dispatcher's exempt list.
app.route("/v1", verifyEmail);

// Auth middleware — all /v1/* routes except /v1/health, register, login, and
// the Google OAuth callback require a valid API key.
// Phase 102 RESEARCH Open Q3 (path a): /v1/auth/google/callback stays public
// (Google redirects to it; no bearer available), but /v1/auth/google initiation
// now requires bearer so the state JWT can carry the authenticated userId.
app.use("/v1/*", async (c, next) => {
  if (c.req.path === "/v1/health") return next();
  if (c.req.path === "/v1/auth/google/callback") return next(); // callback only
  if (c.req.path === "/v1/auth/register") return next(); // Pitfall 8 — CORS preflight
  if (c.req.path === "/v1/auth/login") return next();
  if (c.req.path === "/v1/auth/forgot-password") return next(); // Plan 02 ADDED
  if (c.req.path === "/v1/auth/reset-password") return next();  // Plan 03 ADDED
  if (c.req.path === "/v1/auth/verify-email") return next();    // Phase 113 (AUTH-11 D-12) — token IS the auth
  return bearerAuth(c, next);
});

// ── Phase 105 Plan 02 — ANLY-03 per-route API metrics ─────────────────────
// Registered AFTER the bearerAuth dispatcher (line ~105) and BEFORE every
// protected route (googleAuth + the block below) so EVERY authenticated
// request emits `api_request`. In Hono, `app.use(path, ...)` only applies to
// routes registered AFTER the use() call at the same mount point — mounting
// this before googleAuth is load-bearing (WR-02: previously googleAuth was
// silently unmeasured because it was registered first).
// D-05: public routes (health, register, login, OAuth callback) short-circuit
// out of bearerAuth via `return next()` and never reach this middleware —
// they are intentionally not measured. The `if (userId == null) return;`
// inside metricsMiddleware is a second belt on those suspenders.
app.use("/v1/*", metricsMiddleware);

// Google OAuth routes — initiation behind bearer, callback exempted above.
app.route("/v1", googleAuth);

// Protected routes
app.route("/v1", summary);
app.route("/v1", thoughts);
app.route("/v1", projects);
app.route("/v1", tags);
app.route("/v1", links);
app.route("/v1", briefGenerate);
app.route("/v1", brief);
app.route("/v1", bulk);
app.route("/v1", triage);
app.route("/v1", affirmation);
app.route("/v1", insights);
app.route("/v1", prioritize);
// Phase 110 (AUTH-09 D-09): change-password is a NEW protected router.
// Mounted AFTER the bearerAuth dispatcher at line 116 (mirrors prioritize
// pattern). The handler does `c.get("userId") as number` and the dispatcher
// guarantees that's non-null. Do NOT move this above line 116 — would create
// a silent auth bypass (see WR-02 mount-order comment at lines 124-130).
app.route("/v1", changePassword);
app.route("/v1", describeImage);
app.route("/v1", processPhoto);
app.route("/v1", processAudio);
app.route("/v1", therapy);
app.route("/v1", briefHistory);
app.route("/v1", exportRoute);
app.route("/v1", chat);
app.route("/v1", chatSessionsRouter);
app.route("/v1", workOrdersRouter);
app.route("/v1", workOrderStatus);
app.route("/v1", sports);
app.route("/v1", calendar);
app.route("/v1", googleStatus);
app.route("/v1", settings);
app.route("/v1", me);     // Phase 103 Plan 03 — AUTH-08, behind bearerAuth catch-all (D-17)
app.route("/v1", authMe); // Phase 113 (AUTH-11 D-27) — GET /v1/auth/me, bearerAuth-protected
// Phase 113 (AUTH-11 D-15) — resend-verification is bearerAuth-protected
// (user must be logged in; rate limit keyed by JWT-derived userId). Mounted
// AFTER the dispatcher so it inherits the bearerAuth gate automatically.
app.route("/v1", resendVerification);

// Phase 121 (AGENT-API-01 + AGENT-API-02): agent-events is a NEW protected
// router. Mount AFTER the bearerAuth dispatcher at line 135 AND AFTER the
// metricsMiddleware at line 157. The handler does `c.get("userId") as number`
// and the dispatcher guarantees that's non-null. Do NOT move this above
// line 135 — would create a silent auth bypass (cross-user data write
// becomes possible). Plan 04's cross-user-isolation lock pins the structural
// guarantee; if this comment is wrong, the lock test fails.
app.route("/v1", agentEvents);

// Phase 124 (AGENT-API-03): per-userId SSE fan-out for agent_events.
// SAME mount-order constraint as agentEvents above — MUST be after the
// bearerAuth dispatcher at line 135 AND after the metricsMiddleware at
// line 158. Do NOT move above line 135 — would create a silent auth
// bypass (cross-user fan-out becomes possible). Mirror agent-events
// mount comment.
app.route("/v1", agentStream);

// D-13 — single chokepoint for unhandled errors. Must be AFTER all app.route()
// calls so Hono's handler-chain ordering routes thrown errors here (Pitfall 4).
app.onError((err, c) => {
  console.error("[vigil-core] unhandled error:", err);
  const userId = (c.get("userId") as number | undefined) ?? null;
  captureException(userId, err, {
    route: c.req.path,
    method: c.req.method,
  });
  return c.json({ error: "Internal server error" }, 500);
});

const port = Number(process.env.PORT) || 3001;
// Phase 107.3 Fix 1: Bind host strategy.
// Railway injects RAILWAY_SERVICE_ID (UUID) into every container; it is never
// set locally. When running on Railway, force 0.0.0.0 so the proxy (external
// to the container) can reach us. Default 127.0.0.1 for all non-Railway envs
// (safe: localhost-only). Explicit VIGIL_BIND_HOST always wins so local dev
// can override to 0.0.0.0 for Tailscale exposure.
// Literal IPv4 (not 'localhost') avoids the macOS/Linux IPv6 resolution quirk
// documented in Phase 107.2-01 Pitfall 1.
// Prior claim ("Railway prod leaves VIGIL_BIND_HOST unset → defaults to
// 127.0.0.1 behind Railway's proxy") was wrong and caused the 2026-04-22
// 502 outage on api.vigilhub.io — the proxy cannot reach a loopback-bound
// container. Verified via Railway docs
// (https://docs.railway.com/reference/variables) that RAILWAY_SERVICE_ID
// is always present in container runtime and never set locally.
const isRailway = !!process.env.RAILWAY_SERVICE_ID;
const hostname = process.env.VIGIL_BIND_HOST ?? (isRailway ? "0.0.0.0" : "127.0.0.1");

serve({ fetch: app.fetch, port, hostname }, () => {
  console.log(`Vigil Core API running on ${hostname}:${port}`);
});

// ── Generate scheduler (Phase 86) ──────────────────────────────────────────
// NOTE: If Railway ever scales to >1 instance, this will double-fire.
// Current config is single instance (Phase 86 Risk 4). The 10-minute dedupe
// window blunts damage even if that happens.
// Phase 116 SPORTS-01 D-12: SPORTS_MLB_TEAM_ID, SPORTS_NFL_TEAM_ID, SPORTS_NBA_TEAM_ID,
// SPORTS_NHL_TEAM_ID env vars are NO LONGER read by production code at brief-assembly time.
// The assembler reads per-user `sports_selections` from app_settings (Plan 04) and threads
// it into createSportsService().fetchAllLeagues(selections). The env-var fallback path
// inside sports-service.ts (D-13) is retained ONLY for the existing test fixtures
// (sports-service.test.ts:7-10 sets these to Detroit team IDs).
//
// Production env-var deletion from Railway is documented in the Phase 116 SUMMARY
// runbook — manual ops step, not gated on this code change.
const assembler = createBriefAssemblyService({
  dbClient: mainDb,
  sportsService: createSportsService(),
  calendarService: createCalendarService(), // Phase 109 (SCHED-01 D-12): scheduler path now wires calendar (first time ever)
  getAIClientFn: getAIClient,
  callClaudeFn: callClaude,
  parseAIJsonFn: parseAIJson,
});
const generateScheduler = createGenerateScheduler({
  db: mainDb,
  assemble: (dateStr, userId) => assembler.assembleAndRender(dateStr, userId),
  logFn: (level, msg, meta) => {
    const line = `[generate-scheduler] ${msg}`;
    if (level === "error") console.error(line, meta ?? "");
    else if (level === "warn") console.warn(line, meta ?? "");
    else console.log(line, meta ?? "");
  },
});
generateScheduler.start();
console.log("[generate-scheduler] started (60s tick interval)");

// ── Gmail work order import (Phase 90 polish) ────────────────────────────────
const gmailWorkOrders = createGmailWorkOrderService();
gmailWorkOrders.start();
console.log("[gmail-workorders] started (5m tick interval)");

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[vigil-core] SIGTERM received, stopping services + closing connections...");
  // D-15 — FIRST await: flush PostHog event buffer BEFORE anything else can hang.
  // Railway drops the buffer otherwise (Pitfall 5).
  await shutdownPosthog();
  generateScheduler.stop();
  gmailWorkOrders.stop();
  await closeConnection();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[vigil-core] SIGINT received, stopping services + closing connections...");
  // D-15 — FIRST await: flush PostHog event buffer BEFORE anything else can hang.
  // Railway drops the buffer otherwise (Pitfall 5).
  await shutdownPosthog();
  generateScheduler.stop();
  gmailWorkOrders.stop();
  await closeConnection();
  process.exit(0);
});
