// HS256 JWT sign/verify. Uses `jose` (already a dep — see src/routes/google-auth.ts for OAuth state JWTs).
// Kept separate from hono/jwt to avoid algorithm-confusion CVE class (RESEARCH §Standard Stack — hono/jwt rejected).
import { SignJWT, jwtVerify } from "jose";

// Boot-time check — D-18, D-19. Fail-fast exit (mirrors token-crypto.ts pattern for GOOGLE_TOKEN_ENCRYPTION_KEY).
// Pre-check also runs in src/index.ts so the FATAL message is visible in startup logs before any
// import-time crash here; the IIFE is defensive belt-and-suspenders for scripts that import
// utils/jwt.ts directly (e.g., test files, set-password.ts).
const SECRET: Uint8Array = (() => {
  const s = process.env["JWT_SECRET"];
  if (!s) {
    console.error("FATAL: JWT_SECRET must be set");
    process.exit(1);
  }
  if (s.length < 32) {
    console.error(`FATAL: JWT_SECRET must be at least 32 characters (got ${s.length})`);
    process.exit(1);
  }
  return new TextEncoder().encode(s);
})();

export interface JwtClaims {
  sub: string;       // userId as string per JWT spec (RFC 7519 §4.1.2)
  email: string;
  iat: number;
  exp: number;
}

// D-12: 30-day lifetime. D-14: sub=userId, email, iat, exp (no roles/scopes).
export async function signToken(userId: number, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<JwtClaims> {
  // `algorithms` is MANDATORY — without it, jose accepts whatever the header says,
  // which opens the RS256/HS256 key-confusion vector (CVE-2026-22817 class).
  // Plan 00's jwt.test.ts "alg: none" case pins this contract.
  const { payload } = await jwtVerify(token, SECRET, {
    algorithms: ["HS256"],
  });
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("Malformed JWT payload");
  }
  if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
    throw new Error("Malformed JWT timestamps");
  }
  return payload as unknown as JwtClaims;
}
