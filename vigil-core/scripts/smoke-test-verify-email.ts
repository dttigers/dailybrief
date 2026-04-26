// vigil-core/scripts/smoke-test-verify-email.ts
// Phase 113 Plan 05 — live e2e smoke for AUTH-11 verify-email + single-use semantics.
//
// Strategy (from 113-RESEARCH.md Specific Ideas + 113-05-PLAN.md interfaces note):
//   1. Use the seed user (already allowlisted + already in DB). Do NOT register
//      a new user — would require a fresh allowlist entry for the ephemeral email.
//   2. Directly INSERT an email_verify token row into password_reset_tokens for
//      the seed user. Compute the raw token + sha256 hex hash exactly like the
//      production code path (crypto.randomBytes(32).toString('base64url')).
//   3. POST the raw token to /v1/auth/verify-email against the live API.
//   4. Assert response 200 { ok: true }.
//   5. Query DB: assert users.email_verified_at is now non-null AND within the
//      last 10 seconds AND password_reset_tokens.used_at is non-null for the
//      row we inserted.
//   6. Re-POST the same token; assert 400 "Invalid or expired token"
//      (single-use enforced — T-113-03).
//   7. Cleanup: delete the inserted token row in finally (idempotent — runs even
//      on error so no orphan rows are left behind). ALSO restore the seed user's
//      email_verified_at to its pre-test value if it was non-null before — this
//      keeps the prod backfill audit (SC#4: email_verified_at = created_at)
//      meaningful for the seed user after re-runs.
//
// Note: real-inbox delivery (SC#1) is verified by the HUMAN-UAT checklist, not
// this script. Programmatic email parsing requires a Resend webhook receiver
// (deferred — Phase 111 boundary).
//
// Run (local):
//   cd vigil-core
//   npm run smoke-test:verify-email
//
// Run (prod):
//   VIGIL_API_BASE=https://api.vigilhub.io DATABASE_URL=$RAILWAY_DB_URL \
//     npm run smoke-test:verify-email
//
// Env:
//   VIGIL_API_BASE   API origin (default: https://api.vigilhub.io)
//   DATABASE_URL     Postgres connection string — REQUIRED (no fallback)
//   VIGIL_SEED_EMAIL Seed user email to use for the test (default: jamesonmorrill1@gmail.com)

import * as crypto from "node:crypto";
import postgres from "postgres";

const API_BASE = process.env["VIGIL_API_BASE"] || "https://api.vigilhub.io";
const DB_URL = process.env["DATABASE_URL"];
const SEED_EMAIL =
  process.env["VIGIL_SEED_EMAIL"] || "jamesonmorrill1@gmail.com";

function log(msg: string): void {
  console.log(`[smoke-test:verify-email] ${msg}`);
}

function die(msg: string): never {
  console.error(`[smoke-test:verify-email] FAIL: ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (!DB_URL) {
    die(
      "DATABASE_URL is required.\n" +
        "  Local: ensure vigil-core/.env has DATABASE_URL set, then run:\n" +
        "    npm run smoke-test:verify-email\n" +
        "  Prod:  VIGIL_API_BASE=https://api.vigilhub.io DATABASE_URL=$RAILWAY_DB_URL npm run smoke-test:verify-email",
    );
  }

  log(`API base: ${API_BASE}`);
  log(`Seed email: ${SEED_EMAIL}`);
  log(`DB: ${DB_URL.replace(/:[^:@]+@/, ":***@")}`);
  log("");

  const sql = postgres(DB_URL, { max: 1 });

  // Tracked outside try so finally can clean up even if the smoke run fails mid-way.
  let insertedTokenId: number | null = null;
  // Snapshot the seed user's email_verified_at BEFORE the test mutates it so
  // the finally block can restore the pre-test value. Keeps the SC#4 backfill
  // audit (email_verified_at = created_at) meaningful for the seed user after
  // each smoke-test run.
  let userIdForRestore: number | null = null;
  let preTestEmailVerifiedAt: Date | null = null;

  try {
    // ── Step 1: Resolve the seed user ──────────────────────────────────────────
    const userRows = await sql<
      { id: number; email: string; email_verified_at: Date | null }[]
    >`SELECT id, email, email_verified_at
      FROM users
      WHERE email = ${SEED_EMAIL.toLowerCase()}
      LIMIT 1`;

    const user = userRows[0];
    if (!user) {
      die(
        `Seed user "${SEED_EMAIL}" not found in DB at:\n  ${DB_URL.replace(/:[^:@]+@/, ":***@")}\n` +
          "  Verify DATABASE_URL points to the correct environment.",
      );
    }
    log(
      `Seed user: id=${user.id} email=${user.email} (emailVerifiedAt before test=${user.email_verified_at?.toISOString() ?? "null"})`,
    );

    // Snapshot for finally-block restoration so SC#4 audit stays valid post-run.
    userIdForRestore = user.id;
    preTestEmailVerifiedAt = user.email_verified_at;

    // ── Step 2: INSERT a fresh email_verify token row directly ────────────────
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // type: 'email_verify' — discriminant for the Phase 113 verify flow
    const insertRows = await sql<{ id: number }[]>`
      INSERT INTO password_reset_tokens
        (user_id, token_hash, type, expires_at)
      VALUES
        (${user.id}, ${tokenHash}, 'email_verify', ${expiresAt})
      RETURNING id
    `;
    insertedTokenId = insertRows[0]?.id ?? null;
    if (!insertedTokenId) {
      die("INSERT into password_reset_tokens returned no id — unexpected.");
    }
    log(
      `Inserted token row: id=${insertedTokenId} hash=${tokenHash.slice(0, 12)}... rawLen=${rawToken.length}`,
    );

    // ── Steps 3 + 4: POST to /v1/auth/verify-email; assert 200 ────────────────
    log("");
    log(`POST ${API_BASE}/v1/auth/verify-email ...`);
    const t0 = Date.now();
    const res = await fetch(`${API_BASE}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken }),
    });
    const elapsed = Date.now() - t0;
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    log(`  status=${res.status} elapsed=${elapsed}ms body=${JSON.stringify(body)}`);

    if (res.status !== 200) {
      die(`Expected 200, got ${res.status}. Body: ${JSON.stringify(body)}`);
    }
    if (body["ok"] !== true) {
      die(`Expected body.ok=true, got ${JSON.stringify(body)}`);
    }
    log("  PASS: 200 { ok: true }");

    // ── Step 5a: Assert users.email_verified_at bumped ────────────────────────
    const userAfterRows = await sql<
      { email_verified_at: Date | null }[]
    >`SELECT email_verified_at FROM users WHERE id = ${user.id} LIMIT 1`;
    const newEmailVerifiedAt = userAfterRows[0]?.email_verified_at ?? null;

    if (!newEmailVerifiedAt) {
      die("users.email_verified_at is still null after verify — DB mutation did not fire.");
    }
    const ageMs = Date.now() - newEmailVerifiedAt.getTime();
    if (ageMs > 10_000) {
      die(
        `users.email_verified_at=${newEmailVerifiedAt.toISOString()} is ${ageMs}ms old — older than 10s, was NOT bumped by this verify call (pre-existing value?).`,
      );
    }
    log(
      `  PASS: users.email_verified_at bumped to ${newEmailVerifiedAt.toISOString()} (${ageMs}ms ago — within 10s window)`,
    );

    // ── Step 5b: Assert token row used_at non-null ────────────────────────────
    const tokenAfterRows = await sql<
      { used_at: Date | null }[]
    >`SELECT used_at FROM password_reset_tokens WHERE id = ${insertedTokenId} LIMIT 1`;
    const usedAt = tokenAfterRows[0]?.used_at ?? null;

    if (!usedAt) {
      die("password_reset_tokens.used_at is still null after verify — atomic claim did not run.");
    }
    log(
      `  PASS: token row used_at=${usedAt.toISOString()} (single-use claim confirmed)`,
    );

    // ── Step 6: Re-POST the same token; assert 400 (single-use) ──────────────
    log("");
    log(`POST ${API_BASE}/v1/auth/verify-email (replay — must return 400) ...`);
    const res2 = await fetch(`${API_BASE}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken }),
    });
    const body2 = (await res2.json().catch(() => ({}))) as Record<string, unknown>;
    log(`  status=${res2.status} body=${JSON.stringify(body2)}`);

    if (res2.status !== 400) {
      die(`Expected 400 on token replay, got ${res2.status} — single-use NOT enforced (T-113-03 violation).`);
    }
    if (body2["error"] !== "Invalid or expired token") {
      die(
        `Expected body.error="Invalid or expired token" on replay, got ${JSON.stringify(body2["error"])} (single-bucket error shape violation).`,
      );
    }
    log("  PASS: replay returned 400 { error: 'Invalid or expired token' }");

    // ── Sign-off ──────────────────────────────────────────────────────────────
    log("");
    log("ALL CHECKS PASSED — AUTH-11 verify-email + single-use semantics live-verified");
    log("");
    log("Checklist for HUMAN UAT (items this script CANNOT cover):");
    log("  ☐ SC#1: Real email arrives in Gmail inbox within 60s of register (HUMAN-UAT.md §SC#1)");
    log("  ☐ D-19: Apple Mail prefetch does NOT burn token (HUMAN-UAT.md §Apple Mail)");
    log("  ☐ SC#3: Banner disappears after verify + Settings reload (HUMAN-UAT.md §SC#3)");
    log("  ☐ SC#4: psql prod confirms seed user email_verified_at = created_at (HUMAN-UAT.md §SC#4)");
    log("  ☐ SC#5: 4th resend click returns 429 inline in PWA (HUMAN-UAT.md §SC#5)");
    log("");
    log("See: .planning/phases/113-verify-email-on-signup/113-HUMAN-UAT.md");
  } finally {
    // Cleanup: delete the inserted token row so the script is idempotent / re-runnable.
    // Runs even if assertions fail mid-smoke so no orphan rows accumulate.
    if (insertedTokenId !== null) {
      try {
        await sql`DELETE FROM password_reset_tokens WHERE id = ${insertedTokenId}`;
        log(`Cleanup: deleted token row id=${insertedTokenId}`);
      } catch (cleanupErr) {
        console.warn(`[smoke-test:verify-email] Cleanup warning (token row id=${insertedTokenId} may need manual DELETE):`, cleanupErr);
      }
    }

    // Restore the seed user's email_verified_at to its pre-test value so the
    // smoke run is invisible to system state. Two cases:
    //   1. Pre-test value was non-null (seed user was already verified, e.g.
    //      grandfathered by 0017 backfill) — restore so SC#4 audit
    //      `email_verified_at = created_at` continues to return `t` after
    //      every smoke run.
    //   2. Pre-test value was null (fresh unverified test user) — restore to
    //      NULL so the smoke doesn't accidentally mark them verified.
    if (userIdForRestore !== null) {
      try {
        await sql`UPDATE users SET email_verified_at = ${preTestEmailVerifiedAt} WHERE id = ${userIdForRestore}`;
        log(
          `Cleanup: restored users.email_verified_at to ${preTestEmailVerifiedAt?.toISOString() ?? "null"} (pre-test value)`,
        );
      } catch (restoreErr) {
        console.warn(
          `[smoke-test:verify-email] Restore warning (users.id=${userIdForRestore} email_verified_at may need manual UPDATE to ${preTestEmailVerifiedAt?.toISOString() ?? "NULL"}):`,
          restoreErr,
        );
      }
    }

    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error("[smoke-test:verify-email] Uncaught error:", err);
  process.exit(1);
});
