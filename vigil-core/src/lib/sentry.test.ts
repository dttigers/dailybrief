// ── Phase 126 Wave 0 — RED-by-default scaffold (AUTH-126-04 / Plan 126-03) ───
// Pins the public surface of vigil-core/src/lib/sentry.ts BEFORE Wave 1 creates
// the production module. Until then every test below fails at module resolution
// — that is the intended RED state. Wave 1 must land the module to turn GREEN.
//
// Test cases:
//   - AUTH-126-SENTRY-NO-DSN-NOOP: initSentry() with SENTRY_DSN unset → no-op
//   - AUTH-126-SENTRY-NO-DSN-CAPTURE-NOOP: captureToSentry after no-DSN init → no throw
//   - AUTH-126-SENTRY-WITH-DSN-INIT: initSentry() with SENTRY_DSN → returns/no-throw
//   - AUTH-126-SENTRY-CAPTURE-SHAPE: captureToSentry(userId, err, ctx) tolerates Error + non-Error
//   - AUTH-126-SENTRY-PROPNAMES: drift detector — sentry.ts mentions route/method (Phase 103 denylist awareness)
//
// Mirrors the env-gate + null-singleton pattern from vigil-core/src/analytics/posthog.ts
// (closest sibling — both wrap a third-party error sink with init-once + no-op).
//
// Property-name denylist awareness (RESEARCH §R12): Sentry context object keys
// must avoid `content`/`body`/`text`/`message`/`description`/`title`/`note`/`transcript`
// (Phase 103 PostHog blocked-property list). Prefer `route`/`method`/`userId`.
// JSDoc on captureToSentry must mention `route` or `method` so the drift detector
// can pin awareness in source.
//
// Run: cd vigil-core && npx tsx --test src/lib/sentry.test.ts
// -----------------------------------------------------------------------------

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// The `./sentry.js` module does NOT exist yet — Plan 126-03 creates it.
// This import failure IS the Wave 0 RED signal for this file.
const sentryModule = await import("./sentry.js");
const { initSentry, captureToSentry } = sentryModule as {
  initSentry: () => void;
  captureToSentry: (
    userId: number | null,
    err: unknown,
    context?: Record<string, unknown>,
  ) => void;
};

const realDsn = process.env["SENTRY_DSN"];

function restoreDsn(): void {
  if (realDsn === undefined) delete process.env["SENTRY_DSN"];
  else process.env["SENTRY_DSN"] = realDsn;
}

describe("sentry (vigil-core/src/lib/sentry.ts) — AUTH-126-04 / Plan 126-03", () => {
  beforeEach(() => {
    delete process.env["SENTRY_DSN"];
  });

  afterEach(() => {
    restoreDsn();
  });

  // ── AUTH-126-SENTRY-NO-DSN-NOOP ────────────────────────────────────────────
  it("AUTH-126-SENTRY-NO-DSN-NOOP: initSentry() with SENTRY_DSN unset is a no-op and does not throw", () => {
    assert.doesNotThrow(
      () => initSentry(),
      "initSentry() must no-op (not throw) when SENTRY_DSN is unset — local dev shape",
    );
  });

  // ── AUTH-126-SENTRY-NO-DSN-CAPTURE-NOOP ────────────────────────────────────
  it("AUTH-126-SENTRY-NO-DSN-CAPTURE-NOOP: captureToSentry after no-DSN init also no-ops (no throw)", () => {
    initSentry();
    assert.doesNotThrow(
      () =>
        captureToSentry(123, new Error("x"), { route: "/v1/foo", method: "GET" }),
      "captureToSentry must no-op when Sentry was never initialized (DSN unset path)",
    );
  });

  // ── AUTH-126-SENTRY-WITH-DSN-INIT ──────────────────────────────────────────
  it("AUTH-126-SENTRY-WITH-DSN-INIT: initSentry() with SENTRY_DSN set initializes without throwing", () => {
    process.env["SENTRY_DSN"] = "https://fake@example.com/1";
    assert.doesNotThrow(
      () => initSentry(),
      "initSentry() must succeed when SENTRY_DSN is set (fake DSN should not throw at init)",
    );
  });

  // ── AUTH-126-SENTRY-CAPTURE-SHAPE ─────────────────────────────────────────
  it("AUTH-126-SENTRY-CAPTURE-SHAPE: captureToSentry tolerates Error AND non-Error, anonymous AND userId, missing ctx", () => {
    process.env["SENTRY_DSN"] = "https://fake@example.com/1";
    initSentry();
    // All four shape variants must not throw at the wrapper layer.
    assert.doesNotThrow(() =>
      captureToSentry(123, new Error("real-error"), {
        route: "/v1/foo",
        method: "GET",
      }),
    );
    assert.doesNotThrow(() =>
      captureToSentry(null, new Error("anonymous-error"), {
        route: "/v1/bar",
        method: "POST",
      }),
    );
    assert.doesNotThrow(() => captureToSentry(456, "string-instead-of-error"));
    assert.doesNotThrow(() => captureToSentry(null, { weird: "object" }));
  });

  // ── AUTH-126-SENTRY-PROPNAMES: drift detector ──────────────────────────────
  it("AUTH-126-SENTRY-PROPNAMES: sentry.ts source mentions route OR method in JSDoc (Phase 103 denylist awareness)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "sentry.ts"), "utf8");
    assert.match(
      src,
      /\broute\b|\bmethod\b/,
      "sentry.ts must mention 'route' or 'method' (Phase 103 denylist awareness — RESEARCH §R12 lock)",
    );
  });
});
