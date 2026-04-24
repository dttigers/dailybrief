import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signToken } from "../utils/jwt.js";

// Phase 110 (AUTH-09): authenticated user changes their password.
//
// Verifies current password, validates new, rejects same-as-current (D-12 —
// pre-empts the "typed current twice by accident" no-op that would bump
// passwordChangedAt and kick the user out of every other tab), updates the
// users row, then signs a NEW JWT (D-14 — signToken AFTER db.update commits
// so the new token's iat > floor(passwordChangedAt/1000) and the gate passes).
//
// Mounted in index.ts AFTER the global bearerAuth dispatcher (line 116) —
// alongside prioritize at line 152. D-09 ('index.ts:151 pattern') mandates
// this placement so c.get("userId") is guaranteed non-null in the handler.
// The existing public `auth` router (routes/auth.ts, mounted at index.ts:109
// BEFORE bearerAuth) is intentionally PUBLIC for register/login; placing
// change-password there would make it structurally PUBLIC and create a
// silent auth bypass — see the documented WR-02 mount-order comment in
// index.ts:124-130.
//
// Response shape mirrors /auth/login routes/auth.ts:154 verbatim per D-13.
//
// MIN/MAX duplicated locally (NOT imported from routes/auth.ts) to keep the
// protected router decoupled from the public router. The literal values 12
// and 128 are pinned by CP-CHG-03 test ("Password must be 12-128 characters").
const MIN_PASSWORD = 12;
const MAX_PASSWORD = 128;

export const changePassword = new Hono();

changePassword.post("/auth/change-password", async (c) => {
  // D-09: userId is non-null because /v1/auth/change-password is registered
  // after the global bearerAuth dispatcher at index.ts:116. Mirrors the
  // Phase 109 prioritize.ts pattern at routes/prioritize.ts:64.
  const userId = c.get("userId") as number;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const { currentPassword, newPassword } = (body ?? {}) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };

  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return c.json(
      { error: "currentPassword and newPassword are required" },
      400,
    );
  }

  if (!db) return c.json({ error: "Database unavailable" }, 503);

  // D-11 step 1: SELECT user by authenticated userId.
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    // Defensive: bearerAuth gate (Plan 02 Task 1) already returned 401 D-07
    // for missing users rows BEFORE this handler runs, so this branch is
    // structurally unreachable. Belt-and-suspenders for the case where the
    // user is deleted between bearerAuth dispatch and the handler SELECT.
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // D-11 step 2: verify current password. Wrong → 401 generic (verbatim same
  // body as /auth/login routes/auth.ts:145 — single string, no enumeration).
  const currentOk = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentOk) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // D-11 step 3: new password length validation. Same exact error string as
  // /auth/register routes/auth.ts:65-67. Literal values 12/128 duplicated
  // locally to keep this protected router decoupled from the public router.
  if (newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
    return c.json(
      { error: `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters` },
      400,
    );
  }

  // D-11 step 4 (D-12): same-as-current pre-check. Costs one extra argon2
  // verify (~50-100ms) on the happy path but pre-empts the no-op that would
  // bump passwordChangedAt and kick the user out of every other tab/device
  // for zero semantic change.
  const sameAsCurrent = await verifyPassword(newPassword, user.passwordHash);
  if (sameAsCurrent) {
    return c.json({ error: "New password must differ from current" }, 400);
  }

  // D-11 step 5: hash the new password.
  const newPasswordHash = await hashPassword(newPassword);

  // D-11 step 6 + D-14 ordering: db.update MUST commit BEFORE signToken so
  // the new JWT's iat > floor(passwordChangedAt/1000) and the gate passes
  // (strict less-than per D-05). Bumps updatedAt too for audit-trail
  // consistency with the claim-flow update at routes/auth.ts:101.
  const now = new Date();
  await db
    .update(users)
    .set({
      passwordHash: newPasswordHash,
      passwordChangedAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  // D-11 step 7 + D-14: signToken AFTER the update commits. If reordered, the
  // race window allows iat == floor(ts/1000) which the strict-less-than gate
  // would reject — pinned by ordering test in Task 3.
  const token = await signToken(user.id, user.email);

  // D-11 step 8 + D-13: response shape mirrors /auth/login routes/auth.ts:154 verbatim.
  return c.json({ token, user: { id: user.id, email: user.email } });
});
