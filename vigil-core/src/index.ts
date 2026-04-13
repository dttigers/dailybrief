import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import { serve } from "@hono/node-server";
import { bearerAuth } from "./middleware/auth.js";
import { rateLimiter } from "./middleware/rate-limit.js";
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
import { calendarAuth } from "./routes/calendar-auth.js";
import { testConnection, closeConnection } from "./db/connection.js";

// Verify database connection at startup
testConnection();

const app = new Hono();

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
app.use("*", secureHeaders());

// Request timeout — 30 seconds max per request
app.use("*", timeout(30_000));

// Rate limiting — 100 requests per 60s per IP (configurable via env)
app.use("*", rateLimiter);

// Health route — no auth required (monitoring)
app.route("/v1", health);

// Calendar OAuth routes — no auth required (browser redirect flow)
app.route("/v1", calendarAuth);

// Auth middleware — all /v1/* routes except /v1/health require a valid API key
app.use("/v1/*", async (c, next) => {
  if (c.req.path === "/v1/health") return next();
  if (c.req.path.startsWith("/v1/auth/google")) return next();
  return bearerAuth(c, next);
});

// Protected routes
app.route("/v1", summary);
app.route("/v1", thoughts);
app.route("/v1", projects);
app.route("/v1", tags);
app.route("/v1", links);
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

const port = Number(process.env.PORT) || 3001;

serve({ fetch: app.fetch, port }, () => {
  console.log(`Vigil Core API running on port ${port}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[vigil-core] SIGTERM received, closing connections...");
  await closeConnection();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[vigil-core] SIGINT received, closing connections...");
  await closeConnection();
  process.exit(0);
});
