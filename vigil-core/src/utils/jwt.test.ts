import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Phase 102 Wave 0 — RED-by-default scaffold ────────────────────────────────
// This import MUST fail until Plan 02 creates ./jwt.ts with signToken +
// verifyToken wrappers around jose (already installed — RESEARCH §Standard Stack).
//
// Pins:
//   - D-12: 30-day JWT exp (iat + 2592000)
//   - D-14: claims = { sub (userId as string per JWT spec), email, iat, exp }
//   - D-15: HS256 only (reject alg: 'none' and other algs — algorithm-confusion guard)
//   - D-18/D-19: JWT_SECRET required at boot, min 32 bytes. Test sets it before import.
// -----------------------------------------------------------------------------

// Ensure JWT_SECRET is set before importing the module (boot-check runs at import time).
// The test secret must be >= 32 chars (D-19).
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

const { signToken, verifyToken } = await import("./jwt.js");

describe("jwt — jose HS256 wrapper (D-12, D-14, D-15)", () => {
  it("signToken returns a 3-segment JWT (header.payload.signature)", async () => {
    const tok = await signToken(42, "user@test.local");
    assert.equal(tok.split(".").length, 3);
  });

  it("verifyToken round-trips claims: sub=string '42', email=string, iat+exp numbers (D-14)", async () => {
    const tok = await signToken(42, "user@test.local");
    const claims = await verifyToken(tok);
    assert.equal(claims.sub, "42", "sub must be string-encoded (JWT spec)");
    assert.equal(claims.email, "user@test.local");
    assert.equal(typeof claims.iat, "number");
    assert.equal(typeof claims.exp, "number");
  });

  it("JWT exp is ~30 days in the future (D-12)", async () => {
    const tok = await signToken(42, "u@t.local");
    const claims = await verifyToken(tok);
    const expectedExp = claims.iat + 30 * 24 * 60 * 60;
    // Allow 60s of clock drift around the jose "30d" parsing
    assert.ok(
      Math.abs(claims.exp - expectedExp) < 60,
      `exp=${claims.exp} expected~${expectedExp}`,
    );
  });

  it("verifyToken rejects an expired token", async () => {
    // Craft an expired token by signing manually with past exp.
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(process.env["JWT_SECRET"]!);
    const expired = await new SignJWT({ email: "e@t.local" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("42")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secret);
    await assert.rejects(verifyToken(expired), /expired|exp/i);
  });

  it("verifyToken rejects a token with alg: none (algorithm confusion CVE class, D-15 HS256-only)", async () => {
    // Header + payload base64url-encoded with alg: "none", empty signature
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
      "base64url",
    );
    const payload = Buffer.from(
      JSON.stringify({ sub: "42", email: "e@t.local", iat: 0, exp: 9999999999 }),
    ).toString("base64url");
    const none = `${header}.${payload}.`;
    await assert.rejects(verifyToken(none));
  });

  it("verifyToken rejects a garbage string (not a JWT at all)", async () => {
    await assert.rejects(verifyToken("not.a.jwt"));
  });

  it("verifyToken rejects a tampered signature", async () => {
    const tok = await signToken(42, "e@t.local");
    const parts = tok.split(".");
    const tampered = `${parts[0]}.${parts[1]}.AAAAA`;
    await assert.rejects(verifyToken(tampered));
  });
});
