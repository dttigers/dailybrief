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
const { initSentry, captureToSentry, redactSentryEvent } = sentryModule as {
  initSentry: () => void;
  captureToSentry: (
    userId: number | null,
    err: unknown,
    context?: Record<string, unknown>,
  ) => void;
  redactSentryEvent: (event: unknown, hint?: unknown) => unknown;
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 127 GUARD-01.2 — Sentry beforeSend redactor
// Adds redactSentryEvent + verifies Sentry.init({...}) body contains the
// beforeSend hook as a named function reference (NOT inline arrow) so the
// drift detector at audio-log-redaction.test.ts Rail 2 can grep for it.
// ─────────────────────────────────────────────────────────────────────────────

describe("GUARD-127-SENTRY-BEFORE-SEND — Phase 127 redactSentryEvent + beforeSend wiring", () => {
  it("strips audioPcm from event.extra but preserves unrelated keys", () => {
    const input = {
      extra: {
        audioPcm: "raw-16khz-le-mono-payload-should-never-leak",
        ok: 1,
      },
    };
    const out = redactSentryEvent(input) as { extra: Record<string, unknown> };
    assert.ok(out);
    assert.equal(out.extra.audioPcm, undefined, "audioPcm must be stripped");
    assert.equal(out.extra.ok, 1, "unrelated keys must be preserved");
  });

  it("strips audio keys from breadcrumbs[].data and contexts as well", () => {
    const input = {
      extra: { pcm: "raw-payload" },
      contexts: {
        os: { name: "darwin", audio: "should-be-stripped" },
      },
      breadcrumbs: [
        { data: { audio: "should-be-stripped", ok: 2 } },
        { data: { audio_buffer: "x", note: "also-blocked-by-locked-list" } },
      ],
    };
    const out = redactSentryEvent(input) as {
      extra: Record<string, unknown>;
      contexts: { os: Record<string, unknown> };
      breadcrumbs: Array<{ data: Record<string, unknown> }>;
    };
    assert.equal(out.extra.pcm, undefined, "extra.pcm must be stripped");
    assert.equal(out.contexts.os.audio, undefined, "contexts.os.audio must be stripped");
    assert.equal(out.contexts.os.name, "darwin", "non-blocked contexts keys preserved");
    assert.equal(out.breadcrumbs[0].data.audio, undefined, "breadcrumb audio must be stripped");
    assert.equal(out.breadcrumbs[0].data.ok, 2, "non-blocked breadcrumb keys preserved");
    assert.equal(out.breadcrumbs[1].data.audio_buffer, undefined, "audio_buffer stripped");
    assert.equal(out.breadcrumbs[1].data.note, undefined, "LOCKED key 'note' stripped");
  });

  it("does NOT throw when contexts holds a primitive (Pitfall 3 defensive shape)", () => {
    assert.doesNotThrow(() =>
      redactSentryEvent({
        contexts: { os: "primitive-string-not-an-object" as unknown as Record<string, unknown> },
      }),
    );
    assert.doesNotThrow(() =>
      redactSentryEvent({
        contexts: { weird: null as unknown as Record<string, unknown> },
      }),
    );
  });

  it("returns null when event is null", () => {
    assert.equal(redactSentryEvent(null), null);
  });

  it("returns the original event reference unchanged when an internal getter throws (try/catch defense)", () => {
    const event: Record<string, unknown> = { extra: { ok: 1 } };
    // Replace extra with an object whose own-key enumeration throws.
    const exploding: Record<string, unknown> = {};
    Object.defineProperty(exploding, "audioPcm", {
      get() {
        throw new Error("getter boom");
      },
      enumerable: true,
    });
    event.extra = exploding;
    const out = redactSentryEvent(event);
    // The defense contract: NEVER undefined; return the original event reference.
    assert.notEqual(out, undefined);
    assert.equal(out, event, "must return the original event reference on internal throw");
  });

  it("GUARD-127-SENTRY-BEFORE-SEND-SOURCE-PIN: sentry.ts Sentry.init body contains beforeSend (function-reference form)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "sentry.ts"), "utf8");
    const initIdx = src.indexOf("Sentry.init({");
    const closeIdx = src.indexOf("});", initIdx);
    assert.ok(
      initIdx !== -1 && closeIdx !== -1,
      `Sentry.init({...}) block not found (initIdx=${initIdx}, closeIdx=${closeIdx})`,
    );
    const slice = src.slice(initIdx, closeIdx);
    assert.match(
      slice,
      /\bbeforeSend\b/,
      "Sentry.init must register beforeSend — GUARD-01.2",
    );
    // Locked form: function reference, NOT inline arrow.
    assert.match(
      slice,
      /beforeSend:\s*redactSentryEvent/,
      "beforeSend must be the function reference 'beforeSend: redactSentryEvent' (not inline arrow) so drift detector Rail 2 greps it — GUARD-01.2",
    );
  });
});
