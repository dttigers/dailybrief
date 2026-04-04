import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { health } from "./routes/health.js";
import { getDb } from "./db/index.js";

// Initialize database connection at startup
getDb();

const app = new Hono();

app.route("/v1", health);

const port = Number(process.env.PORT) || 3001;

serve({ fetch: app.fetch, port }, () => {
  console.log(`Vigil Core API running on port ${port}`);
});
