import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Phase 102 Wave 0 — RED-by-default scaffold ────────────────────────────────
// This import MUST fail until Plan 02 creates ./password.ts with hashPassword +
// verifyPassword wrappers around argon2id (D-16). The module-resolution error
// IS the Wave 0 RED signal.
//
// Pins:
//   - D-16: argon2id, OWASP 2024 params (memoryCost 19456, timeCost 2, parallelism 1)
//   - Pitfall 9: password length cap at 128 chars (DoS guard against 10KB passwords)
//   - RESEARCH "Don't Hand-Roll" — argon2 encodes params inline in the hash string
//     so the prefix `$argon2id$v=19$m=19456,t=2,p=1$...` is a stable contract.
// -----------------------------------------------------------------------------

import { hashPassword, verifyPassword } from "./password.js";

describe("password — argon2id wrapper (D-16, Pitfall 9)", () => {
  it("hashPassword returns a string starting with $argon2id$v=19$m=19456,t=2,p=1$", async () => {
    const h = await hashPassword("correct horse battery staple");
    assert.ok(
      h.startsWith("$argon2id$v=19$m=19456,t=2,p=1$"),
      `hash prefix wrong (OWASP 2024 params not pinned): ${h.slice(0, 50)}`,
    );
  });

  it("hashPassword produces different salts for identical inputs (randomized salt)", async () => {
    const a = await hashPassword("pw1234567890");
    const b = await hashPassword("pw1234567890");
    assert.notEqual(a, b);
  });

  it("verifyPassword returns true for matching plaintext", async () => {
    const stored = await hashPassword("correct horse battery staple");
    assert.equal(await verifyPassword("correct horse battery staple", stored), true);
  });

  it("verifyPassword returns false for wrong plaintext (does NOT throw)", async () => {
    const stored = await hashPassword("real-password-123");
    assert.equal(await verifyPassword("wrong-password", stored), false);
  });

  it("verifyPassword returns false for malformed stored hash (does NOT throw — Pitfall 9 timing-safe)", async () => {
    assert.equal(await verifyPassword("anything", "not-a-real-argon2-hash"), false);
  });

  it("hashPassword throws for passwords > 128 chars (Pitfall 9 DoS guard)", async () => {
    const long = "a".repeat(129);
    await assert.rejects(hashPassword(long), /too long/i);
  });

  it("verifyPassword returns false for plaintext > 128 chars (no argon2 invocation)", async () => {
    const stored = await hashPassword("whatever12345");
    assert.equal(await verifyPassword("a".repeat(129), stored), false);
  });
});
