// argon2id wrapper. OWASP 2024 params per CONTEXT.md D-16.
// Library: @node-rs/argon2 (chosen over `argon2` for node:20-alpine musl compatibility — RESEARCH Pitfall 1).
import { hash, verify, Algorithm } from "@node-rs/argon2";

// OWASP 2024 recommendation for argon2id at "Moderate" server class:
//   memoryCost: 19 MiB (19456 KiB), timeCost: 2, parallelism: 1
// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id
//
// These params are ALSO pinned in src/db/migrate.test.ts (seed-user placeholder hash regex)
// and src/utils/password.test.ts (output prefix assertion) — any drift here breaks Plan 00's
// Wave-0 contract AND the D-11 seed-user claim-flow detection in Plan 03.
const OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

// Pitfall 9: cap plaintext length to defend against 10KB-password DoS.
// argon2 hashes any length input but compute time grows with length; bounding
// input at the API edge prevents a single request from pegging the server.
const MAX_PASSWORD_BYTES = 128;

export async function hashPassword(plaintext: string): Promise<string> {
  if (plaintext.length > MAX_PASSWORD_BYTES) {
    throw new Error(`Password too long (max ${MAX_PASSWORD_BYTES} characters)`);
  }
  return hash(plaintext, OPTIONS);
}

export async function verifyPassword(plaintext: string, stored: string): Promise<boolean> {
  // Short-circuit on oversized input — do NOT invoke argon2 (Pitfall 9 DoS guard).
  if (plaintext.length > MAX_PASSWORD_BYTES) return false;
  try {
    return await verify(stored, plaintext);
  } catch {
    // Malformed stored hash, unsupported algorithm, etc. — return false, never throw.
    // Callers only branch on the boolean; a thrown error here would leak "this hash is
    // malformed" vs. "wrong password" signal via timing or response shape.
    return false;
  }
}
