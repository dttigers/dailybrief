// Email service — Resend SDK wrapper for transactional email (Phase 111 EMAIL-01).
// Typed wrappers per email type (D-04) + lazy null-init singleton (D-10) following
// the posthog.ts pattern. Click/open tracking disabled at the DOMAIN level per
// Phase 111 Plan 01 — Resend Node SDK v6 removed per-send tracking flags, so the
// T-111-09 mitigation (Apple Mail pre-fetch consuming single-use tokens) is
// enforced at the account/domain boundary rather than per call. See
// email-service.test.ts header for the SDK inspection notes.
//
// Security: PII handling — to-addresses are SHA-256 hashed (truncated to 16 chars)
// before going into PostHog context per D-12. Raw emails never leave this module
// except inside Resend.emails.send() which is the legitimate recipient boundary.
//
// Factory + singleton pattern mirrors calendar-service.ts: createEmailService()
// accepts optional DI deps (resendClient, captureExceptionFn) for tests;
// top-level singleton uses the real Resend client when RESEND_API_KEY is set,
// null otherwise (graceful no-op for local dev / key-missing prod misconfig).

import { Resend } from "resend";
import * as crypto from "node:crypto";
import { captureException as realCaptureException } from "../analytics/posthog.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmailSendResult =
  | { status: "sent"; id: string }
  | { status: "skipped_no_key" }
  | { status: "failed"; error: string };

export interface EmailServiceDeps {
  /**
   * Explicitly null → treat as key-absent, return skipped_no_key.
   * Undefined → fall back to the module-level singleton (`resend`).
   * A Resend instance → use it.
   */
  resendClient?: Resend | null;
  /**
   * DI seam for the PostHog captureException function. Defaults to the real
   * implementation from ../analytics/posthog.js.
   */
  captureExceptionFn?: typeof realCaptureException;
}

type EmailType = "password_reset" | "email_verification" | "generic";

// ── Lazy null-init singleton (mirrors posthog.ts lines 66-80 shape) ───────────
// D-10: If RESEND_API_KEY is unset → singleton is null → every send call
// returns { status: "skipped_no_key" } without touching the network.

const apiKey = process.env["RESEND_API_KEY"];
export const resend: Resend | null = apiKey ? new Resend(apiKey) : null;

// ── PII hash helper (D-12) ────────────────────────────────────────────────────
// SHA-256 of the lowercased+trimmed to-address, truncated to 16 hex chars.
// Lowercase+trim so "User@Example.com" and "user@example.com " hash identically.
// 16 chars of a SHA-256 prefix is plenty for debugging correlation and keeps
// PostHog property sizes bounded.

function hashRecipient(to: string): string {
  return crypto
    .createHash("sha256")
    .update(to.toLowerCase().trim())
    .digest("hex")
    .slice(0, 16);
}

// ── HTML attribute / body escaper (WR-01) ─────────────────────────────────────
// Defensive: although AUTH-10/AUTH-11 callers build URLs from
// crypto.randomBytes() hex tokens + a trusted origin, this module accepts
// `resetUrl: string` / `verifyUrl: string` with no validator. Escape the five
// HTML-significant characters at every interpolation point — both the
// `href="..."` attribute slot AND the visible-text `<p>` slot (where `<` would
// still be parsed). Defeats stored-XSS-via-email if a future caller ever
// derives the URL from user input.
function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Narrowing helpers for the mock and real Resend result shapes ──────────────

interface ResendResult {
  data: { id: string } | null;
  error: { message?: string; name?: string } | null;
}

// ── Factory ────────────────────────────────────────────────────────────────────
//
// CRITICAL — `this`-binding footgun: `doSend` is a local arrow constant closed
// over by lexical scope; the returned wrapper properties are ALSO arrow-valued,
// NOT shorthand method declarations. Re-exporting them at the bottom of this
// file as `export const sendPasswordResetEmail = singleton.sendPasswordResetEmail`
// extracts the function reference — a `this`-bound shorthand method would lose
// its receiver and throw at call time. Closure-bound arrows are binding-safe.

export function createEmailService(deps?: EmailServiceDeps): {
  sendEmail: (args: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }) => Promise<EmailSendResult>;
  sendPasswordResetEmail: (
    to: string,
    resetUrl: string,
  ) => Promise<EmailSendResult>;
  sendEmailVerificationEmail: (
    to: string,
    verifyUrl: string,
  ) => Promise<EmailSendResult>;
} {
  // Allow explicit null for tests; fall back to module-level singleton otherwise.
  const client: Resend | null =
    deps && Object.prototype.hasOwnProperty.call(deps, "resendClient")
      ? deps.resendClient ?? null
      : resend;

  const captureFn: typeof realCaptureException =
    deps?.captureExceptionFn ?? realCaptureException;

  // Internal primitive — every wrapper funnels through this single code path so
  // failure handling / PII hashing / observability is identical across types.
  const doSend = async (
    type: EmailType,
    to: string,
    subject: string,
    html: string,
    text: string,
  ): Promise<EmailSendResult> => {
    if (client === null) {
      return { status: "skipped_no_key" };
    }

    try {
      // NOTE: no `click_tracking` / `open_tracking` fields — not accepted by the
      // SDK v6 send signature (CreateEmailBaseOptions). Tracking is disabled at
      // the Domain level in Plan 01 (Resend dashboard or domains.update with
      // clickTracking/openTracking = false).
      const result = (await (client as unknown as {
        emails: { send: (args: unknown) => Promise<ResendResult> };
      }).emails.send({
        from: "noreply@vigilhub.io",
        to: [to],
        subject,
        html,
        text,
      })) as ResendResult;

      if (result.error) {
        const errMsg = result.error.message ?? "Resend error";
        console.error("[email-service] send failed:", type, result.error);
        captureFn(null, new Error(errMsg), {
          email_type: type,
          to_hash: hashRecipient(to),
          resend_error_name: result.error.name ?? "unknown",
        });
        return { status: "failed", error: errMsg };
      }

      // WR-02: `{ data: null, error: null }` is undocumented but type-allowed
      // by ResendResult (both fields are nullable). Without a real id, "sent"
      // is a lie — downstream consumers (smoke-test log, future stored
      // message-ids) treat it as success-with-real-id. Surface as failed and
      // route through the same captureException + PII-hash observability path
      // as other failures so we catch SDK contract drift on first occurrence.
      const id = result.data?.id;
      if (!id) {
        const errMsg = "Resend returned no message id";
        console.error("[email-service] send succeeded with no id:", type, result);
        captureFn(null, new Error(errMsg), {
          email_type: type,
          to_hash: hashRecipient(to),
        });
        return { status: "failed", error: errMsg };
      }

      return { status: "sent", id };
    } catch (err) {
      console.error("[email-service] send threw:", type, err);
      const errMsg = err instanceof Error ? err.message : String(err);
      captureFn(null, err, {
        email_type: type,
        to_hash: hashRecipient(to),
      });
      return { status: "failed", error: errMsg };
    }
  };

  // ── Wrapper: sendPasswordResetEmail ────────────────────────────────────────
  // AUTH-10 wrapper. Hardcoded subject + brand teal #1D9E75 CTA (D-09).
  // Inline template literal per D-07 — no hosted logo images yet (D-09).

  const sendPasswordResetEmail = async (
    to: string,
    resetUrl: string,
  ): Promise<EmailSendResult> => {
    const subject = "Reset your Vigil password";
    // WR-01: escape URL at both href AND visible-text interpolation slots.
    // Plaintext body uses the raw URL — text/plain is not HTML-parsed.
    const safeUrl = escapeHtmlAttr(resetUrl);
    const html = `<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f6f6f6; padding: 24px;">
<div style="max-width: 560px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 8px;">
<h1 style="margin: 0 0 16px 0; font-size: 20px; color: #111;">Reset your Vigil password</h1>
<p style="margin: 0 0 16px 0; color: #333; line-height: 1.5;">Click the button below to set a new password. This link expires in 1 hour and can only be used once.</p>
<p style="margin: 24px 0;"><a href="${safeUrl}" style="display: inline-block; background: #1D9E75; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: 600;">Set new password</a></p>
<p style="margin: 16px 0 0 0; color: #666; font-size: 14px;">Or paste this link into your browser:</p>
<p style="margin: 4px 0 0 0; color: #1D9E75; font-size: 13px; word-break: break-all;">${safeUrl}</p>
<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
<p style="margin: 0; color: #999; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
</div></body></html>`;
    const text = `Reset your Vigil password

Click this link to set a new password (expires in 1 hour, single-use):
${resetUrl}

If you didn't request this, ignore this email.`;
    return doSend("password_reset", to, subject, html, text);
  };

  // ── Wrapper: sendEmailVerificationEmail ────────────────────────────────────
  // AUTH-11 wrapper. Mirrors password reset styling with verification copy.

  const sendEmailVerificationEmail = async (
    to: string,
    verifyUrl: string,
  ): Promise<EmailSendResult> => {
    const subject = "Verify your Vigil email";
    // WR-01: escape URL at both href AND visible-text interpolation slots.
    // Plaintext body uses the raw URL — text/plain is not HTML-parsed.
    const safeUrl = escapeHtmlAttr(verifyUrl);
    const html = `<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f6f6f6; padding: 24px;">
<div style="max-width: 560px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 8px;">
<h1 style="margin: 0 0 16px 0; font-size: 20px; color: #111;">Verify your Vigil email</h1>
<p style="margin: 0 0 16px 0; color: #333; line-height: 1.5;">Confirm this is your email so we can send you important account notifications. This link expires in 24 hours.</p>
<p style="margin: 24px 0;"><a href="${safeUrl}" style="display: inline-block; background: #1D9E75; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: 600;">Verify email</a></p>
<p style="margin: 16px 0 0 0; color: #666; font-size: 14px;">Or paste this link into your browser:</p>
<p style="margin: 4px 0 0 0; color: #1D9E75; font-size: 13px; word-break: break-all;">${safeUrl}</p>
<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
<p style="margin: 0; color: #999; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
</div></body></html>`;
    const text = `Verify your Vigil email

Click this link to confirm your email (expires in 24 hours):
${verifyUrl}

If you didn't request this, ignore this email.`;
    return doSend("email_verification", to, subject, html, text);
  };

  // ── Primitive: sendEmail ───────────────────────────────────────────────────
  // D-04 escape hatch for future one-offs (e.g. deferred AUTH-09 password-
  // changed notice email). Caller provides subject + full html + text.

  const sendEmail = async (args: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<EmailSendResult> => {
    return doSend("generic", args.to, args.subject, args.html, args.text);
  };

  return {
    sendEmail,
    sendPasswordResetEmail,
    sendEmailVerificationEmail,
  };
}

// ── Default singleton + top-level exports ─────────────────────────────────────
// Because createEmailService returns arrow-valued properties that close over
// `doSend` lexically (no `this`-binding), these extracted references are safe
// to call standalone from downstream routes. A shorthand-method implementation
// would have silently broken here at first call.

const singleton = createEmailService();
export const sendEmail = singleton.sendEmail;
export const sendPasswordResetEmail = singleton.sendPasswordResetEmail;
export const sendEmailVerificationEmail = singleton.sendEmailVerificationEmail;
