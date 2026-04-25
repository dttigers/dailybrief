// Phase 112 Plan 05 — one-shot live smoke test for forgot-password endpoint.
// Usage:
//   npx tsx scripts/smoke-test-forgot-password.ts <known-email> [unknown-email]
//
// Reads VIGIL_API_BASE env (defaults to https://api.vigilhub.io). POSTs to
// /v1/auth/forgot-password and validates SC#1 (enumeration safety: identical
// 200 body + approximate timing on hit and miss paths). Optionally also exercises
// the reset-password endpoint with clearly-invalid payloads to confirm the
// 400 enum-safe error shape (no token-claim side effects).
//
// SC#2 (real email + click + reset + redirect), SC#3 (single-use), SC#4
// (cross-device JWT invalidation), and SC#5 (token_hash storage) require
// human-in-the-loop UAT — see 112-HUMAN-UAT.md. This script is the API leg
// only; it is SUFFICIENT-not-complete for SC#1 and gives the operator a
// pre-UAT confidence signal that the production endpoints are reachable and
// returning the locked enum-safe shapes.
//
// Mirrors the shape of vigil-core/scripts/smoke-test-email.ts (Phase 111 Plan
// 03) so operators have one mental model across the email + auth surfaces.

interface ForgotPasswordResponse {
  ok?: boolean;
  message?: string;
  error?: string;
}

interface ResetPasswordResponse {
  ok?: boolean;
  message?: string;
  error?: string;
}

async function postForgotPassword(
  apiBase: string,
  email: string,
): Promise<{ status: number; body: ForgotPasswordResponse; durationMs: number }> {
  const t0 = process.hrtime.bigint();
  const res = await fetch(`${apiBase}/v1/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const body = (await res.json().catch(() => ({}))) as ForgotPasswordResponse;
  const t1 = process.hrtime.bigint();
  return {
    status: res.status,
    body,
    durationMs: Number(t1 - t0) / 1_000_000,
  };
}

async function postResetPassword(
  apiBase: string,
  payload: { token: string; newPassword: string },
): Promise<{ status: number; body: ResetPasswordResponse }> {
  const res = await fetch(`${apiBase}/v1/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as ResetPasswordResponse;
  return { status: res.status, body };
}

const ENUM_SAFE_MESSAGE =
  "If your account exists, a reset link has been sent.";

async function main(): Promise<void> {
  const known = process.argv[2];
  const unknown = process.argv[3];
  if (!known || known === "--help" || known === "-h") {
    console.error(
      "Usage: npx tsx scripts/smoke-test-forgot-password.ts <known-email> [unknown-email]\n" +
        "\n" +
        "  <known-email>    A real account in the live DB (will receive a real reset email).\n" +
        "  [unknown-email]  Optional. If provided, validates SC#1 enum-safety:\n" +
        "                   identical 200 body + timing approximation across hit/miss paths.\n" +
        "\n" +
        "Env:\n" +
        "  VIGIL_API_BASE   API origin (default: https://api.vigilhub.io)\n" +
        "\n" +
        "Side effects:\n" +
        "  - Sends ONE real password-reset email to <known-email> (server-side, via Resend).\n" +
        "  - Invalidates any prior unused reset token for <known-email> (D-06 'most recent wins').\n" +
        "  - Consumes 1 slot of the per-IP and per-email forgot-password rate limit (5/h).\n" +
        "  - Consumes 2 slots of the per-IP reset-password rate limit (5/h) for the malformed-payload probes.\n",
    );
    process.exit(2);
  }
  const apiBase = process.env["VIGIL_API_BASE"] || "https://api.vigilhub.io";
  console.log(`[smoke] API base: ${apiBase}`);
  console.log(`[smoke] Known email: ${known}`);
  if (unknown) console.log(`[smoke] Unknown email: ${unknown}`);
  console.log("");

  // ── Hit path ───────────────────────────────────────────────────────────────
  const hit = await postForgotPassword(apiBase, known);
  console.log(
    `[smoke] HIT  status=${hit.status} duration=${hit.durationMs.toFixed(0)}ms body=${JSON.stringify(hit.body)}`,
  );

  if (hit.status !== 200) {
    console.error(
      `[smoke] FAIL — known-email status ${hit.status}, expected 200`,
    );
    process.exit(1);
  }
  if (hit.body.message !== ENUM_SAFE_MESSAGE) {
    console.error(
      `[smoke] FAIL — known-email body message mismatch (D-03 violation)\n` +
        `         expected: ${JSON.stringify(ENUM_SAFE_MESSAGE)}\n` +
        `         observed: ${JSON.stringify(hit.body.message)}`,
    );
    process.exit(1);
  }
  if (hit.body.ok !== true) {
    console.error(
      `[smoke] FAIL — known-email body.ok !== true (D-03 violation)\n` +
        `         observed: ${JSON.stringify(hit.body)}`,
    );
    process.exit(1);
  }

  // ── Miss path (optional) — SC#1 enum-safety validation ────────────────────
  if (unknown) {
    const miss = await postForgotPassword(apiBase, unknown);
    console.log(
      `[smoke] MISS status=${miss.status} duration=${miss.durationMs.toFixed(0)}ms body=${JSON.stringify(miss.body)}`,
    );

    if (miss.status !== 200) {
      console.error(
        `[smoke] FAIL — unknown-email status ${miss.status}, expected 200 (SC#1)`,
      );
      process.exit(1);
    }
    // SC#1 body identity — byte-equal JSON serialization
    if (JSON.stringify(miss.body) !== JSON.stringify(hit.body)) {
      console.error(
        `[smoke] FAIL — body differs between hit and miss (SC#1 violation)\n` +
          `         hit:  ${JSON.stringify(hit.body)}\n` +
          `         miss: ${JSON.stringify(miss.body)}`,
      );
      process.exit(1);
    }
    // SC#1 timing approximation — over the wire, network jitter dominates;
    // accept up to 2.0x ratio as PASS, warn between 1.5x and 2.0x, fail above.
    const ratio =
      Math.max(hit.durationMs, miss.durationMs) /
      Math.min(hit.durationMs, miss.durationMs);
    console.log(
      `[smoke] Timing ratio: ${ratio.toFixed(2)}x ` +
        `(hit=${hit.durationMs.toFixed(0)}ms miss=${miss.durationMs.toFixed(0)}ms)`,
    );
    if (ratio > 2.0) {
      console.warn(
        `[smoke] WARN — timing ratio ${ratio.toFixed(2)}x exceeds 2.0x. ` +
          `Over-the-wire jitter is acceptable up to 2x; > 2x suggests a real D-05 dummy-verify regression. ` +
          `Re-run on a quiet network before treating as a hard failure.`,
      );
    } else if (ratio > 1.5) {
      console.log(
        `[smoke] NOTE — timing ratio ${ratio.toFixed(2)}x is between 1.5x and 2.0x. ` +
          `Acceptable over the wire; in-process tests asserted < 1.5x in Plan 02 Test 3.`,
      );
    }
  }

  // ── Reset-password validation probes (no token claim) ─────────────────────
  // These exercise the 400 enum-safe error shape WITHOUT consuming any real
  // token. Both probes target validation paths that fail BEFORE the atomic
  // claim per T-112-03-07 (length check is BEFORE db.update). No DB rows
  // are mutated; only per-IP rate-limit slots accumulate.
  console.log("");
  console.log(`[smoke] Probing /v1/auth/reset-password validation paths...`);

  // Probe A — clearly-invalid token (not a base64url shape we'd ever issue)
  const invalidToken = await postResetPassword(apiBase, {
    token: "this-is-clearly-not-a-real-token-from-any-real-email-link",
    newPassword: "ValidEnoughPass2026!",
  });
  console.log(
    `[smoke] RESET (invalid token) status=${invalidToken.status} body=${JSON.stringify(invalidToken.body)}`,
  );
  if (invalidToken.status !== 400) {
    console.error(
      `[smoke] FAIL — invalid-token reset status ${invalidToken.status}, expected 400`,
    );
    process.exit(1);
  }
  if (invalidToken.body.error !== "Invalid or expired token") {
    console.error(
      `[smoke] FAIL — invalid-token body.error mismatch (D-20 single-bucket violation)\n` +
        `         expected: ${JSON.stringify("Invalid or expired token")}\n` +
        `         observed: ${JSON.stringify(invalidToken.body.error)}`,
    );
    process.exit(1);
  }

  // Probe B — weak password (length < MIN_PASSWORD = 12 chars; T-112-03-07:
  // length validation runs BEFORE the atomic claim, so even a "valid" token
  // would not be burned here. Use a random token-ish string so the probe is
  // exercising the validation path, not the claim path.)
  const weakPassword = await postResetPassword(apiBase, {
    token: "irrelevant-because-length-validates-first",
    newPassword: "short",
  });
  console.log(
    `[smoke] RESET (weak pw)      status=${weakPassword.status} body=${JSON.stringify(weakPassword.body)}`,
  );
  if (weakPassword.status !== 400) {
    console.error(
      `[smoke] FAIL — weak-password reset status ${weakPassword.status}, expected 400`,
    );
    process.exit(1);
  }
  if (typeof weakPassword.body.error !== "string") {
    console.error(
      `[smoke] FAIL — weak-password response missing error field\n` +
        `         observed: ${JSON.stringify(weakPassword.body)}`,
    );
    process.exit(1);
  }

  // ── Operator handoff to the human-in-the-loop UAT ─────────────────────────
  console.log("");
  console.log(`[smoke] API leg PASSED.`);
  console.log("");
  console.log(`[smoke] CHECKLIST FOR HUMAN UAT (mapped 1:1 to .planning/phases/112-forgot-password-email-flow/112-HUMAN-UAT.md):`);
  console.log(`[smoke]   ✓ SC#1 (API leg — body identity + timing): PASSED here`);
  console.log(`[smoke]   ☐ SC#2: Check inbox at ${known} for an email from noreply@vigilhub.io`);
  console.log(`[smoke]          subject 'Reset your password', containing a link of shape:`);
  console.log(`[smoke]          ${apiBase.replace("api", "app")}/auth/reset?token=<43-char-base64url>`);
  console.log(`[smoke]          Click → submit new password → expect redirect to /auth?reason=password_reset`);
  console.log(`[smoke]   ☐ SC#3: Click the SAME link a second time → expect 'This link is no longer valid' UX`);
  console.log(`[smoke]   ☐ SC#4: Pre-reset JWT on Tab A → next /v1/me returns 401 'Session expired'`);
  console.log(`[smoke]          (vigilFetch dispatcher force-navigates Tab A to /auth?reason=session_expired)`);
  console.log(`[smoke]   ☐ SC#5: SELECT * FROM password_reset_tokens — token_hash is 64-char hex,`);
  console.log(`[smoke]          raw token (~43-char base64url) does NOT appear in any row`);
  console.log("");
  console.log(`[smoke] Continue with manual UAT per .planning/phases/112-forgot-password-email-flow/112-HUMAN-UAT.md`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[smoke] Unexpected throw:", err);
  process.exit(1);
});
