import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Wave 0 RED scaffold — Plan 01 creates ./posthog.js. Import failure IS the RED signal.
// Per 103-CONTEXT.md D-10: tests must run with POSTHOG_API_KEY unset to exercise the shim path.
delete process.env["POSTHOG_API_KEY"];

const { redactEvent, trackEvent, captureException, posthog, identifyUser, BLOCKED_PROPERTY_NAMES } = await import(
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

describe("BLOCKED_PROPERTY_NAMES — D-04 denylist literal", () => {
  it("exports a Set with exactly the 8 documented names", () => {
    const expected = new Set([
      "content",
      "body",
      "text",
      "message",
      "description",
      "title",
      "note",
      "transcript",
    ]);
    assert.equal(BLOCKED_PROPERTY_NAMES.size, expected.size);
    for (const name of expected) {
      assert.ok(
        BLOCKED_PROPERTY_NAMES.has(name),
        `BLOCKED_PROPERTY_NAMES must contain "${name}"`,
      );
    }
  });

  it("matches property names case-sensitively (D-01 documented behaviour)", () => {
    assert.equal(BLOCKED_PROPERTY_NAMES.has("content"), true);
    assert.equal(BLOCKED_PROPERTY_NAMES.has("Content"), false);
    assert.equal(BLOCKED_PROPERTY_NAMES.has("CONTENT"), false);
  });
});

describe("trackEvent — D-01..D-03 property guard (shim path)", () => {
  it("does not throw when called with a blocked property under shim (posthog === null)", () => {
    assert.equal(posthog, null); // sanity: D-10 gate is engaged for tests
    assert.doesNotThrow(() =>
      trackEvent(1, "thought_created", {
        category: "task",
        content: "do laundry — should be dropped before emission",
      }),
    );
  });

  it("does not throw with empty properties (D-03 default arg)", () => {
    assert.doesNotThrow(() => trackEvent(1, "thought_created"));
    assert.doesNotThrow(() => trackEvent(1, "thought_created", {}));
  });

  it("accepts the legal property primitive types (string|number|boolean|null|undefined)", () => {
    assert.doesNotThrow(() =>
      trackEvent(1, "api_request", {
        route: "/v1/thoughts",   // string — allowed
        status: 200,             // number — allowed
        cached: false,           // boolean — allowed
        error_code: null,        // null — allowed
        tag: undefined,          // undefined — allowed
      }),
    );
  });

  it("accepts both number and string userIds (D-03 signature unchanged)", () => {
    assert.doesNotThrow(() => trackEvent(1, "e", {}));
    assert.doesNotThrow(() => trackEvent("1", "e", {}));
  });
});

describe("identifyUser — D-09..D-11 wrapper export", () => {
  it("is exported and is a function", () => {
    assert.equal(typeof identifyUser, "function");
  });

  it("does not throw under shim with email + createdAt", () => {
    assert.doesNotThrow(() =>
      identifyUser(1, {
        email: "a@b.com",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    );
  });

  it("does not throw with no properties argument", () => {
    assert.doesNotThrow(() => identifyUser(1));
  });

  it("accepts both number and string userIds", () => {
    assert.doesNotThrow(() => identifyUser(42, { email: "x@y.com" }));
    assert.doesNotThrow(() => identifyUser("42", { email: "x@y.com" }));
  });
});
