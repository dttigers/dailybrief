// ── Phase 126 Wave 0 — RED-by-default scaffold (AUTH-126-02 / D-01) ──────────
// Pins the public surface of vigil-core/src/lib/turnstile.ts BEFORE Wave 1
// (Plan 126-02) creates the production module. Until then every test below
// fails at module resolution — that is the intended RED state. Wave 1 must
// land the production module to turn this file GREEN.
//
// Test cases:
//   - AUTH-126-TURNSTILE-URL: drift detector — turnstile.ts declares siteverify URL verbatim
//   - AUTH-126-TURNSTILE-OK: mocked fetch {success:true} → {ok:true, errorCodes:[]}
//   - AUTH-126-TURNSTILE-FAIL: mocked fetch {success:false, "error-codes":[...]} → {ok:false, errorCodes:[...]}
//   - AUTH-126-TURNSTILE-NETWORK-THROWS: mocked fetch throws → helper throws (caller maps to 503 per D-01)
//   - AUTH-126-TURNSTILE-MISSING-SECRET: TURNSTILE_SECRET_KEY unset → helper throws synchronously
//
// Failure-mode policy (CONTEXT D-01):
//   - success:false       → caller returns 400 CAPTCHA_FAILED
//   - network/timeout     → throws; caller returns 503 (DO NOT fail-open)
//   - missing secret env  → throws synchronously (misconfiguration)
//
// Pitfall (RESEARCH §R4): Cloudflare response uses HYPHENATED "error-codes"
// key. Production must NOT camelCase it. The drift detector locks both the
// siteverify URL and that we read the hyphenated key.
//
// Run: cd vigil-core && npx tsx --test src/lib/turnstile.test.ts
// -----------------------------------------------------------------------------

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// The `./turnstile.js` module does NOT exist yet — Plan 126-02 creates it.
// This import failure IS the Wave 0 RED signal for this file.
const turnstileModule = await import("./turnstile.js");
const {
  verifyTurnstileToken,
  __setVerifyTurnstileTokenForTest,
  __resetVerifyTurnstileTokenForTest,
} = turnstileModule as {
  verifyTurnstileToken: (
    token: string,
    remoteIp: string | null,
  ) => Promise<{ ok: boolean; errorCodes: string[] }>;
  __setVerifyTurnstileTokenForTest: (fn: unknown) => void;
  __resetVerifyTurnstileTokenForTest: () => void;
};

// Hold-and-restore the global fetch so each test can mock independently.
const realFetch = globalThis.fetch;
const realSecret = process.env["TURNSTILE_SECRET_KEY"];

function restoreEnvAndFetch(): void {
  globalThis.fetch = realFetch;
  if (realSecret === undefined) delete process.env["TURNSTILE_SECRET_KEY"];
  else process.env["TURNSTILE_SECRET_KEY"] = realSecret;
}

describe("verifyTurnstileToken (vigil-core/src/lib/turnstile.ts) — AUTH-126-02 / D-01", () => {
  beforeEach(() => {
    process.env["TURNSTILE_SECRET_KEY"] = "test-secret-key";
    // touch DI seam to silence unused-import warning if Plan 02 changes shape
    void __setVerifyTurnstileTokenForTest;
    void __resetVerifyTurnstileTokenForTest;
  });

  afterEach(() => {
    restoreEnvAndFetch();
  });

  // ── AUTH-126-TURNSTILE-URL: drift detector ─────────────────────────────────
  it("AUTH-126-TURNSTILE-URL: turnstile.ts declares siteverify URL verbatim (drift detector)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "turnstile.ts"), "utf8");
    assert.match(
      src,
      /https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/,
      "turnstile.ts must declare the Cloudflare siteverify URL verbatim (Phase 126 AUTH-126-02 D-01 lock)",
    );
    // Pitfall R4: must read the hyphenated "error-codes" key (NOT camelCased)
    assert.match(
      src,
      /"error-codes"|'error-codes'/,
      "turnstile.ts must read the hyphenated 'error-codes' key from Cloudflare response (R4 lock — DO NOT camelCase)",
    );
  });

  // ── AUTH-126-TURNSTILE-OK: success path ────────────────────────────────────
  it("AUTH-126-TURNSTILE-OK: mocked siteverify success → {ok:true, errorCodes:[]}", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    const result = await verifyTurnstileToken("valid-token", "1.2.3.4");
    assert.equal(result.ok, true);
    assert.deepEqual(result.errorCodes, []);
  });

  // ── AUTH-126-TURNSTILE-FAIL: failure path with error-codes ─────────────────
  it("AUTH-126-TURNSTILE-FAIL: mocked siteverify failure → {ok:false, errorCodes:['invalid-input-response']}", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: false,
          "error-codes": ["invalid-input-response"],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      )) as typeof fetch;

    const result = await verifyTurnstileToken("bad-token", "1.2.3.4");
    assert.equal(result.ok, false);
    assert.deepEqual(result.errorCodes, ["invalid-input-response"]);
  });

  // ── AUTH-126-TURNSTILE-NETWORK-THROWS: network failure → throw (NOT fail-open) ──
  it("AUTH-126-TURNSTILE-NETWORK-THROWS: fetch rejects → helper throws (caller returns 503 per D-01)", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNRESET");
    }) as typeof fetch;

    await assert.rejects(
      async () => verifyTurnstileToken("any-token", "1.2.3.4"),
      /ECONNRESET|network|fetch/i,
      "On network failure, verifyTurnstileToken MUST throw — DO NOT fail-open (D-01)",
    );
  });

  // ── AUTH-126-TURNSTILE-MISSING-SECRET: misconfig → throw synchronously ────
  it("AUTH-126-TURNSTILE-MISSING-SECRET: TURNSTILE_SECRET_KEY unset → helper throws", async () => {
    delete process.env["TURNSTILE_SECRET_KEY"];
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
      })) as typeof fetch;

    await assert.rejects(
      async () => verifyTurnstileToken("any-token", "1.2.3.4"),
      /TURNSTILE_SECRET_KEY|secret|configur/i,
      "Without TURNSTILE_SECRET_KEY, helper must throw (misconfiguration is a deploy-time bug, not a runtime fail-open)",
    );
  });
});
