import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// Phase 105 Plan 02 — test the metricsMiddleware via dep-injection.
// Reuses the env-clear pattern from posthog.test.ts so the wrapper SDK is the shim.
delete process.env["POSTHOG_API_KEY"];

const { createMetricsMiddleware, statusClass } = await import("./metrics.js");

type TrackCall = {
  userId: number | string;
  event: string;
  properties: Record<string, unknown>;
};

function buildAppWith(trackCalls: TrackCall[], userId: number | null) {
  const app = new Hono();
  // Fake bearerAuth — sets userId BEFORE metricsMiddleware sees it.
  app.use("/v1/*", async (c, next) => {
    if (userId != null) c.set("userId" as never, userId as never);
    return next();
  });
  app.use(
    "/v1/*",
    createMetricsMiddleware((u, e, p) => {
      trackCalls.push({ userId: u, event: e, properties: p ?? {} });
    }),
  );
  // A few representative routes returning known status codes.
  app.get("/v1/ok", (c) => c.json({ ok: true }, 200));
  app.get("/v1/redirect", (c) => c.json({ go: true }, 301));
  app.get("/v1/missing", (c) => c.json({ error: "x" }, 404));
  app.get("/v1/boom", (c) => c.json({ error: "x" }, 500));
  return app;
}

describe("statusClass — D-08 enum derivation", () => {
  it("maps 200 → '2xx'", () => assert.equal(statusClass(200), "2xx"));
  it("maps 201 → '2xx'", () => assert.equal(statusClass(201), "2xx"));
  it("maps 301 → '3xx'", () => assert.equal(statusClass(301), "3xx"));
  it("maps 404 → '4xx'", () => assert.equal(statusClass(404), "4xx"));
  it("maps 500 → '5xx'", () => assert.equal(statusClass(500), "5xx"));
  it("maps 0 / negatives to '5xx' (defensive)", () => {
    assert.equal(statusClass(0), "5xx");
  });
});

describe("metricsMiddleware — D-05..D-08 emission contract", () => {
  it("emits exactly one api_request event per authenticated request", async () => {
    const calls: TrackCall[] = [];
    const app = buildAppWith(calls, 42);
    await app.fetch(new Request("http://x/v1/ok", { method: "GET" }));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].event, "api_request");
    assert.equal(calls[0].userId, 42);
  });

  it("populates route, method, status, status_class, duration_ms (D-08)", async () => {
    const calls: TrackCall[] = [];
    const app = buildAppWith(calls, 1);
    await app.fetch(new Request("http://x/v1/ok", { method: "GET" }));
    const props = calls[0].properties;
    assert.equal(props.route, "/v1/ok");
    assert.equal(props.method, "GET");
    assert.equal(props.status, 200);
    assert.equal(props.status_class, "2xx");
    assert.equal(typeof props.duration_ms, "number");
    assert.ok((props.duration_ms as number) >= 0);
  });

  it("derives status_class for 4xx and 5xx", async () => {
    const calls: TrackCall[] = [];
    const app = buildAppWith(calls, 1);
    await app.fetch(new Request("http://x/v1/missing", { method: "GET" }));
    await app.fetch(new Request("http://x/v1/boom", { method: "GET" }));
    assert.equal(calls[0].properties.status, 404);
    assert.equal(calls[0].properties.status_class, "4xx");
    assert.equal(calls[1].properties.status, 500);
    assert.equal(calls[1].properties.status_class, "5xx");
  });

  it("does NOT emit when userId is missing (D-05 — no anonymous metrics)", async () => {
    const calls: TrackCall[] = [];
    const app = buildAppWith(calls, null);
    await app.fetch(new Request("http://x/v1/ok", { method: "GET" }));
    assert.equal(calls.length, 0);
  });

  it("uses primitive property values only (no user content possible)", async () => {
    const calls: TrackCall[] = [];
    const app = buildAppWith(calls, 1);
    await app.fetch(new Request("http://x/v1/ok", { method: "GET" }));
    for (const [, v] of Object.entries(calls[0].properties)) {
      const t = typeof v;
      assert.ok(
        t === "string" || t === "number" || t === "boolean" || v === null,
        `metrics property must be primitive, got ${t}`,
      );
    }
  });
});
