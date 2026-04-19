import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Wave 0 RED scaffold — Plan 01 creates ./posthog.js. Import failure IS the RED signal.
// Per 103-CONTEXT.md D-10: tests must run with POSTHOG_API_KEY unset to exercise the shim path.
delete process.env["POSTHOG_API_KEY"];

const { redactEvent, trackEvent, captureException, posthog } = await import(
  "./posthog.js"
);

describe("redactEvent — D-12 sensitive-route allowlist", () => {
  it("strips request_body when route is in SENSITIVE_ROUTES (/v1/thoughts)", () => {
    const input = {
      event: "$exception",
      distinctId: "1",
      properties: {
        route: "/v1/thoughts",
        method: "POST",
        request_body: "user secret thought content",
      },
    } as any;
    const out = redactEvent(input);
    assert.ok(out);
    assert.equal((out as any).properties.request_body, undefined);
    assert.equal((out as any).properties.route, "/v1/thoughts");
    assert.equal((out as any).properties.method, "POST");
  });

  it("preserves request_body when route is NOT sensitive (/v1/health)", () => {
    const input = {
      event: "$exception",
      distinctId: "1",
      properties: { route: "/v1/health", request_body: "harmless" },
    } as any;
    const out = redactEvent(input);
    assert.ok(out);
    assert.equal((out as any).properties.request_body, "harmless");
  });

  it("returns null when input is null", () => {
    assert.equal(redactEvent(null), null);
  });

  it("covers all six sensitive routes from D-12", () => {
    const sensitive = [
      "/v1/chat",
      "/v1/process-photo",
      "/v1/process-audio",
      "/v1/thoughts",
      "/v1/therapy",
      "/v1/insights",
    ];
    for (const route of sensitive) {
      const out = redactEvent({
        event: "$exception",
        distinctId: "1",
        properties: { route, request_body: "leak" },
      } as any);
      assert.equal(
        (out as any).properties.request_body,
        undefined,
        `${route} must strip request_body`,
      );
    }
  });
});

describe("trackEvent / captureException — D-10 null-guard", () => {
  it("posthog singleton is null when POSTHOG_API_KEY unset (D-10 key-absence gate)", () => {
    assert.equal(posthog, null);
  });

  it("trackEvent is a no-op when posthog === null (no throw)", () => {
    assert.doesNotThrow(() => trackEvent(1, "test_event", { k: "v" }));
  });

  it("captureException is a no-op when posthog === null (no throw)", () => {
    assert.doesNotThrow(() => captureException(1, new Error("boom"), { route: "/v1/x" }));
  });

  it("captureException accepts null userId without throwing (anonymous path)", () => {
    assert.doesNotThrow(() => captureException(null, new Error("boom"), {}));
  });

  it("captureException normalizes non-Error throws (string) without throwing", () => {
    assert.doesNotThrow(() => captureException(1, "string-error" as unknown, {}));
  });
});
