// ── Phase 126 Wave 0 — RED-by-default scaffold (mount-order lock) ────────────
// Source-content drift detector against vigil-core/src/index.ts. Asserts the
// canonical mount-order convention that Wave 1+2 must satisfy:
//
//   - AUTH-126-MOUNT-SENTRY-BEFORE-HONO: initSentry() precedes `new Hono()`
//   - AUTH-126-MOUNT-VERIFY-AFTER-BEARER: requireVerifiedEmailWithGrace mounts
//     AFTER the bearerAuth dispatcher (so c.get('userId') is populated)
//   - AUTH-126-MOUNT-VERIFY-BEFORE-PROTECTED: requireVerifiedEmailWithGrace
//     mounts BEFORE the first protected route (so every /v1/* inherits gate)
//
// Until Wave 1+2 land, all three assertions return -1 < -1 — the test uses
// assert.ok(idxA < idxB, '...') so the failure message reads naturally:
// "X must precede Y (got idxA=-1, idxB=-1)".
//
// Mirrors the Phase 117 fs.readFileSync drift detector pattern (see
// vigil-core/src/routes/forgot-password.test.ts:421-446).
//
// Run: cd vigil-core && npx tsx --test src/__tests__/mount-order.test.ts
// -----------------------------------------------------------------------------

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let indexSrc: string = "";

before(async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  // src/__tests__/mount-order.test.ts  →  src/index.ts is one level up
  indexSrc = fs.readFileSync(path.join(here, "..", "index.ts"), "utf8");
});

describe("vigil-core/src/index.ts — Phase 126 mount-order lock", () => {
  it("AUTH-126-MOUNT-SENTRY-BEFORE-HONO: initSentry() must precede `new Hono()` so import-time errors are captured", () => {
    const sentryIdx = indexSrc.indexOf("initSentry()");
    const honoIdx = indexSrc.indexOf("new Hono()");
    assert.ok(
      sentryIdx !== -1 && honoIdx !== -1 && sentryIdx < honoIdx,
      `initSentry() must appear BEFORE 'new Hono()' (got sentryIdx=${sentryIdx}, honoIdx=${honoIdx}) — Phase 126 AUTH-126-04 D-LOAD-BEARING`,
    );
  });

  it("AUTH-126-MOUNT-VERIFY-AFTER-BEARER: requireVerifiedEmailWithGrace must mount AFTER the bearerAuth dispatcher so c.get('userId') is set", () => {
    const verifyIdx = indexSrc.indexOf("requireVerifiedEmailWithGrace");
    const bearerIdx = indexSrc.indexOf("return bearerAuth(c, next)");
    assert.ok(
      verifyIdx !== -1 && bearerIdx !== -1 && verifyIdx > bearerIdx,
      `requireVerifiedEmailWithGrace must appear AFTER bearerAuth dispatcher (got verifyIdx=${verifyIdx}, bearerIdx=${bearerIdx}) — Phase 126 D-02 mount-order constraint`,
    );
  });

  it("AUTH-126-MOUNT-VERIFY-BEFORE-PROTECTED: requireVerifiedEmailWithGrace must mount BEFORE the first protected route registration", () => {
    const verifyIdx = indexSrc.indexOf("requireVerifiedEmailWithGrace");
    // First protected /v1/* route mount in current codebase — the summary
    // routes (see vigil-core/src/index.ts post-bearerAuth dispatcher block).
    // Wave 1 will insert requireVerifiedEmailWithGrace BEFORE this anchor.
    const protectedIdx = indexSrc.indexOf('app.route("/v1", summary');
    assert.ok(
      verifyIdx !== -1 && protectedIdx !== -1 && verifyIdx < protectedIdx,
      `requireVerifiedEmailWithGrace must appear BEFORE the first protected /v1/* route (got verifyIdx=${verifyIdx}, protectedIdx=${protectedIdx}) — Phase 126 D-02`,
    );
  });
});
