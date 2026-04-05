import { Hono } from "hono";
import { testConnection } from "../db/connection.js";

export const health = new Hono();

health.get("/health", async (c) => {
  const dbOk = await testConnection();

  return c.json({
    status: dbOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    database: dbOk ? "connected" : "unavailable",
  });
});
