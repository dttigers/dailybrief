import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { health } from "./routes/health.js";
import { summary } from "./routes/summary.js";
import { thoughts } from "./routes/thoughts.js";
import { tags } from "./routes/tags.js";
import { links } from "./routes/links.js";
import { brief } from "./routes/brief.js";
import { bulk } from "./routes/bulk.js";
import { triage } from "./routes/triage.js";
import { affirmation } from "./routes/affirmation.js";
import { insights } from "./routes/insights.js";
import { prioritize } from "./routes/prioritize.js";
import { describeImage } from "./routes/describe-image.js";
import { therapy } from "./routes/therapy.js";
import { testConnection, closeConnection } from "./db/connection.js";

// Verify database connection at startup
testConnection();

const app = new Hono();

app.route("/v1", health);
app.route("/v1", summary);
app.route("/v1", thoughts);
app.route("/v1", tags);
app.route("/v1", links);
app.route("/v1", brief);
app.route("/v1", bulk);
app.route("/v1", triage);
app.route("/v1", affirmation);
app.route("/v1", insights);
app.route("/v1", prioritize);
app.route("/v1", describeImage);
app.route("/v1", therapy);

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
