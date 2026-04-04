import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { health } from "./routes/health.js";
import { summary } from "./routes/summary.js";
import { thoughts } from "./routes/thoughts.js";
import { tags } from "./routes/tags.js";
import { links } from "./routes/links.js";
import { brief } from "./routes/brief.js";
import { bulk } from "./routes/bulk.js";
import { getDb } from "./db/index.js";

// Initialize database connection at startup
getDb();

const app = new Hono();

app.route("/v1", health);
app.route("/v1", summary);
app.route("/v1", thoughts);
app.route("/v1", tags);
app.route("/v1", links);
app.route("/v1", brief);
app.route("/v1", bulk);

const port = Number(process.env.PORT) || 3001;

serve({ fetch: app.fetch, port }, () => {
  console.log(`Vigil Core API running on port ${port}`);
});
