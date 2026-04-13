import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for AES-GCM

// ── Key helper ────────────────────────────────────────────────────────────────

function getKey(): Buffer {
  const hex = process.env["GOOGLE_TOKEN_ENCRYPTION_KEY"];
  if (!hex || hex.length !== 64) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes)"
    );
  }
  return Buffer.from(hex, "hex");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encrypts a plaintext string using AES-256-GCM with a random 12-byte IV.
 * Output format: `ivHex:tagHex:ciphertextHex`
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

/**
 * Decrypts a token previously encrypted by `encryptToken`.
 * Expects format: `ivHex:tagHex:ciphertextHex`
 * Throws if the key is wrong or the ciphertext is tampered.
 */
export function decryptToken(stored: string): string {
  const key = getKey();
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format — expected ivHex:tagHex:ciphertextHex");
  }

  const [ivHex, tagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
