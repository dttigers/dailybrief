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
import { me } from "./routes/me.js";
import { captureException, shutdownPosthog } from "./analytics/posthog.js";
import { settings } from "./routes/settings.js";
import { briefGenerate } from "./routes/brief-generate.js";
import { testConnection, closeConnection, db as mainDb } from "./db/connection.js";
import { createGenerateScheduler } from "./services/generate-scheduler.js";
import { createBriefAssemblyService } from "./services/brief-assembly-service.js";
import { getAIClient, callClaude, parseAIJson } from "./ai/client.js";
import { createSportsService } from "./services/sports-service.js";
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
    allowHeaders: ["Content-Type", "Authorization"],
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
  return bearerAuth(c, next);
});

// Google OAuth routes — initiation behind bearer, callback exempted above.
app.route("/v1", googleAuth);

// ── Phase 105 Plan 02 — ANLY-03 per-route API metrics ─────────────────────
// Registered AFTER bearerAuth dispatcher (line ~104) and AFTER googleAuth
// (above) so it sees only authenticated requests with c.var.userId set.
// D-05: public routes (health, register, login, OAuth callback) short-circuit
// out of bearerAuth via `return next()` and never reach this middleware —
// they are intentionally not measured.
app.use("/v1/*", metricsMiddleware);

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
app.route("/v1", me);  // Phase 103 Plan 03 — AUTH-08, behind bearerAuth catch-all (D-17)

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

serve({ fetch: app.fetch, port }, () => {
  console.log(`Vigil Core API running on port ${port}`);
});

// ── Generate scheduler (Phase 86) ──────────────────────────────────────────
// NOTE: If Railway ever scales to >1 instance, this will double-fire.
// Current config is single instance (Phase 86 Risk 4). The 10-minute dedupe
// window blunts damage even if that happens.
const assembler = createBriefAssemblyService({
  dbClient: mainDb,
  sportsService: createSportsService(),
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
