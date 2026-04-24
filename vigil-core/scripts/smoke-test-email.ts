// Phase 111 Plan 03 — one-shot smoke test for email-service.
// Usage:
//   RESEND_API_KEY=re_xxx npx tsx scripts/smoke-test-email.ts <to-address>
// Reads VIGIL_APP_BASE_URL from env (D-05/D-06) — falls back to https://app.vigilhub.io.
// This is the first phase that exercises the VIGIL_APP_BASE_URL wiring end-to-end;
// Phase 112 will consume it in real route handlers.
// Prints the EmailSendResult JSON + Resend message id (if sent) and exits 0/1.
// Intended for manual verification — NOT wired into CI.

import { sendPasswordResetEmail } from "../src/services/email-service.js";

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: npx tsx scripts/smoke-test-email.ts <to-address>");
    process.exit(2);
  }

  // D-05/D-06: read origin from env, fall back to prod value. Do NOT hardcode.
  // `||` (not `??`) so empty-string treatment matches "unset" — both engage fallback.
  const origin = process.env["VIGIL_APP_BASE_URL"] || "https://app.vigilhub.io";
  const testUrl = `${origin}/auth/reset?token=smoke-test-${Date.now()}`;
  console.log(`[smoke] Origin (from VIGIL_APP_BASE_URL env, fallback https://app.vigilhub.io): ${origin}`);
  console.log(`[smoke] Sending password-reset email to ${to}`);
  console.log(`[smoke] Reset URL (will appear verbatim in email body): ${testUrl}`);

  const result = await sendPasswordResetEmail(to, testUrl);
  console.log("[smoke] Result:", JSON.stringify(result));

  if (result.status === "sent") {
    console.log(`[smoke] SUCCESS — Resend message id: ${result.id}`);
    console.log(`[smoke] Cross-reference at https://resend.com/emails/${result.id}`);
    process.exit(0);
  }
  if (result.status === "skipped_no_key") {
    console.log("[smoke] SKIPPED — RESEND_API_KEY not set. Export the key and retry.");
    process.exit(0);
  }
  console.error("[smoke] FAILED —", result.error);
  process.exit(1);
}

main().catch((err) => {
  console.error("[smoke] Unexpected throw:", err);
  process.exit(1);
});
