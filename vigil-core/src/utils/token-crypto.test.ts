import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptToken, decryptToken } from "./token-crypto.js";

// ── Environment Setup ─────────────────────────────────────────────────────────
// 64-character hex string = 32 bytes (AES-256 key size)
process.env["GOOGLE_TOKEN_ENCRYPTION_KEY"] =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// ── Tests ─────────────────────────────────────────────────────────────────────

test("CAL-02-encrypt: encryptToken returns a string different from plaintext", () => {
  const plaintext = "my-secret-refresh-token";
  const encrypted = encryptToken(plaintext);
  assert.notEqual(encrypted, plaintext, "Encrypted value must differ from plaintext");
});

test("CAL-02-decrypt: decryptToken(encryptToken(plaintext)) roundtrips correctly", () => {
  const plaintext = "my-secret-refresh-token";
  const decrypted = decryptToken(encryptToken(plaintext));
  assert.equal(decrypted, plaintext, "Decrypted value must equal original plaintext");
});

test("CAL-02-format: encrypted output matches ivHex:tagHex:ciphertextHex pattern", () => {
  const encrypted = encryptToken("my-secret-refresh-token");
  const pattern = /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/;
  assert.match(encrypted, pattern, "Encrypted format must be ivHex:tagHex:ciphertextHex");
});

test("CAL-02-unique-iv: two encryptions of same plaintext produce different ciphertexts", () => {
  const plaintext = "my-secret-refresh-token";
  const enc1 = encryptToken(plaintext);
  const enc2 = encryptToken(plaintext);
  assert.notEqual(enc1, enc2, "Random IV must produce different ciphertexts each call");
});

test("CAL-02-bad-key: decryptToken with wrong key throws an error", () => {
  const plaintext = "my-secret-refresh-token";
  const encrypted = encryptToken(plaintext);

  // Temporarily swap to a different key
  const originalKey = process.env["GOOGLE_TOKEN_ENCRYPTION_KEY"];
  process.env["GOOGLE_TOKEN_ENCRYPTION_KEY"] =
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

  try {
    assert.throws(
      () => decryptToken(encrypted),
      Error,
      "decryptToken must throw when key does not match"
    );
  } finally {
    process.env["GOOGLE_TOKEN_ENCRYPTION_KEY"] = originalKey;
  }
});
