// Email service tests (Phase 111 Plan 02 — EMAIL-01).
//
// ── Verified Resend SDK surface ───────────────────────────────────────────────
// Installed: resend@^6.12.2 (see vigil-core/package.json).
// Signature inspected in node_modules/resend/dist/index.d.mts lines 515–596:
//   Emails.send(payload: CreateEmailOptions): Promise<CreateEmailResponse>
//   CreateEmailOptions = CreateEmailBaseOptions & (html|text|react|template)
//   CreateEmailBaseOptions fields: from, to, subject, headers, replyTo,
//     cc, bcc, tags, attachments, scheduledAt, topicId
//
// CRITICAL FINDING: Resend Node SDK v6.12.2 does NOT expose per-send
// `click_tracking` / `open_tracking` options. Those fields exist ONLY on the
// Domain-level API (`domains.create/update` — lines 98-112 of index.d.mts,
// and camelCase variants at lines 1165-1207 / 1203-1207). Per-send tracking
// toggles were removed from the SDK at some point before v6.
//
// Implication for T-111-09 mitigation (Apple Mail pre-fetch burning single-use
// tokens): link-tracking must be disabled at the DOMAIN level during Plan 01's
// Resend domain verification (either via the Resend dashboard or a
// `resend.domains.update(id, { clickTracking: false, openTracking: false })`
// call — note: camelCase on the Domains API per line 1203). This module cannot
// and must not pass tracking flags on `emails.send` — doing so would either
// TypeScript-error or be silently dropped by the Resend API as an unknown
// field.
//
// Accordingly the contract these tests enforce is:
//   1. The payload shape passed to resend.emails.send MATCHES
//      CreateEmailBaseOptions (no click_tracking/open_tracking present).
//   2. The reset/verify URL appears verbatim inside the HTML body — no
//      click-tracking-domain rewriting (which would only happen if the domain
//      has click_tracking ON at the account level; we guard against future
//      config regression by asserting verbatim URL presence).
//
// ── Test conventions ──────────────────────────────────────────────────────────
// Uses node:test + node:assert/strict, same as calendar-service.test.ts.
// Each test constructs a fresh spy/mock resendClient + captureExceptionFn and
// injects them via createEmailService({...}) — no global singleton use here.

import { test } from "node:test";
import assert from "node:assert/strict";

// Env must be set before importing email-service so posthog.ts import chain
// (captureException) doesn't error on a missing POSTHOG key — it's optional,
// but JWT_SECRET is FATAL at vigil-core startup. email-service only imports
// posthog.ts for captureException, which does not trigger the JWT check.
// Still, set a sane JWT_SECRET for import-chain safety.
process.env["JWT_SECRET"] =
  process.env["JWT_SECRET"] ??
  "test-jwt-secret-at-least-thirty-two-chars-long-for-tests";

import { createEmailService } from "./email-service.js";
import type {
  EmailSendResult,
  EmailServiceDeps,
} from "./email-service.js";

// ── Types for the spy's captured args ─────────────────────────────────────────

type SendArgs = {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  [key: string]: unknown;
};

type CaptureArgs = {
  userId: number | string | null;
  err: unknown;
  context: Record<string, string | number | boolean | undefined>;
};

// ── Mock builders ─────────────────────────────────────────────────────────────

interface MockClient {
  emails: {
    send: (args: SendArgs) => Promise<unknown>;
  };
  captured: SendArgs | null;
}

function makeOkClient(id = "msg_abc"): MockClient {
  const client: MockClient = {
    captured: null,
    emails: {
      send: async (args: SendArgs) => {
        client.captured = args;
        return { data: { id }, error: null };
      },
    },
  };
  return client;
}

function makeThrowingClient(msg = "network down"): MockClient {
  const client: MockClient = {
    captured: null,
    emails: {
      send: async (args: SendArgs) => {
        client.captured = args;
        throw new Error(msg);
      },
    },
  };
  return client;
}

function makeErrorReturningClient(
  errorName = "rate_limit_exceeded",
  errorMessage = "rate limited",
): MockClient {
  const client: MockClient = {
    captured: null,
    emails: {
      send: async (args: SendArgs) => {
        client.captured = args;
        return { data: null, error: { message: errorMessage, name: errorName } };
      },
    },
  };
  return client;
}

function makeCaptureSpy(): {
  calls: CaptureArgs[];
  fn: (
    userId: number | string | null,
    err: unknown,
    context: Record<string, string | number | boolean | undefined>,
  ) => void;
} {
  const calls: CaptureArgs[] = [];
  return {
    calls,
    fn: (userId, err, context) => {
      calls.push({ userId, err, context });
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("sendPasswordResetEmail returns skipped_no_key when RESEND_API_KEY is unset (resendClient=null)", async () => {
  const deps: EmailServiceDeps = {
    resendClient: null,
  };
  const service = createEmailService(deps);
  const result: EmailSendResult = await service.sendPasswordResetEmail(
    "user@example.com",
    "https://app.vigilhub.io/auth/reset?token=abc",
  );
  assert.equal(result.status, "skipped_no_key");
});

test("sendPasswordResetEmail returns sent with id when Resend responds ok", async () => {
  const client = makeOkClient("msg_abc");
  // deliberately coerce to any for the test seam — production singleton uses the real Resend type
  const deps: EmailServiceDeps = {
    resendClient: client as unknown as EmailServiceDeps["resendClient"],
  };
  const service = createEmailService(deps);
  const result = await service.sendPasswordResetEmail(
    "user@example.com",
    "https://app.vigilhub.io/auth/reset?token=abc",
  );
  assert.equal(result.status, "sent");
  if (result.status === "sent") {
    assert.equal(result.id, "msg_abc");
  }
});

test("sendPasswordResetEmail returns failed when Resend throws", async () => {
  const client = makeThrowingClient("network down");
  const capture = makeCaptureSpy();
  const deps: EmailServiceDeps = {
    resendClient: client as unknown as EmailServiceDeps["resendClient"],
    captureExceptionFn: capture.fn,
  };
  const service = createEmailService(deps);
  const result = await service.sendPasswordResetEmail(
    "user@example.com",
    "https://app.vigilhub.io/auth/reset?token=abc",
  );
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.ok(
      result.error.includes("network down"),
      `expected error to include "network down", got: ${result.error}`,
    );
  }
});

test("sendPasswordResetEmail returns failed when Resend returns an error object", async () => {
  const client = makeErrorReturningClient("rate_limit_exceeded", "rate limited");
  const capture = makeCaptureSpy();
  const deps: EmailServiceDeps = {
    resendClient: client as unknown as EmailServiceDeps["resendClient"],
    captureExceptionFn: capture.fn,
  };
  const service = createEmailService(deps);
  const result = await service.sendPasswordResetEmail(
    "user@example.com",
    "https://app.vigilhub.io/auth/reset?token=abc",
  );
  assert.equal(result.status, "failed");
});

test("sendPasswordResetEmail does NOT pass click_tracking or open_tracking on the emails.send payload (SDK v6 constraint — domain-level only)", async () => {
  // Resend SDK v6 dropped per-send tracking flags. Passing them would either
  // TypeScript-error or be silently dropped by the Resend API. This test
  // enforces the service does NOT include those keys on the send payload, so
  // future regressions (e.g., someone re-adds `click_tracking: false`) get
  // caught before they hit the wire. T-111-09 mitigation lives at the domain
  // level (Plan 01) — see header comment.
  const client = makeOkClient();
  const deps: EmailServiceDeps = {
    resendClient: client as unknown as EmailServiceDeps["resendClient"],
  };
  const service = createEmailService(deps);
  await service.sendPasswordResetEmail(
    "user@example.com",
    "https://app.vigilhub.io/auth/reset?token=abc",
  );
  assert.ok(client.captured, "send must have been called");
  const args = client.captured!;
  assert.equal(
    Object.prototype.hasOwnProperty.call(args, "click_tracking"),
    false,
    "payload must NOT include click_tracking (SDK v6 doesn't accept it per-send)",
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(args, "open_tracking"),
    false,
    "payload must NOT include open_tracking (SDK v6 doesn't accept it per-send)",
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(args, "clickTracking"),
    false,
    "payload must NOT include clickTracking (camelCase variant either)",
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(args, "openTracking"),
    false,
    "payload must NOT include openTracking (camelCase variant either)",
  );
});

test("sendPasswordResetEmail embeds the reset URL verbatim in the HTML href — no click-tracking domain rewriting", async () => {
  const client = makeOkClient();
  const resetUrl = "https://app.vigilhub.io/auth/reset?token=verbatim-token-xyz";
  const deps: EmailServiceDeps = {
    resendClient: client as unknown as EmailServiceDeps["resendClient"],
  };
  const service = createEmailService(deps);
  await service.sendPasswordResetEmail("user@example.com", resetUrl);
  assert.ok(client.captured, "send must have been called");
  const args = client.captured!;
  assert.ok(typeof args.html === "string", "html must be a string");
  assert.ok(
    args.html!.includes(resetUrl),
    `HTML must contain the verbatim reset URL, got html of length ${args.html!.length}`,
  );
  // Tracking-domain rewriting would inject /r/ path segments or track.* subdomains.
  // Email-service itself never does this; this guard ensures no future helper starts.
  assert.equal(
    /href="https?:\/\/(track|click)\./i.test(args.html!),
    false,
    "HTML href must not point to a tracking subdomain (track.*/click.*)",
  );
  assert.equal(
    /href="[^"]*\/r\/[A-Za-z0-9]/.test(args.html!),
    false,
    "HTML href must not be rewritten through a /r/ tracking redirector",
  );
});

test("sendPasswordResetEmail passes both html and text bodies to Resend (D-08 multipart fallback)", async () => {
  const client = makeOkClient();
  const deps: EmailServiceDeps = {
    resendClient: client as unknown as EmailServiceDeps["resendClient"],
  };
  const service = createEmailService(deps);
  await service.sendPasswordResetEmail(
    "user@example.com",
    "https://app.vigilhub.io/auth/reset?token=abc",
  );
  const args = client.captured!;
  assert.equal(typeof args.html, "string");
  assert.equal(typeof args.text, "string");
  assert.ok((args.text as string).length > 0, "text body must not be empty");
});

test("sendPasswordResetEmail sends from noreply@vigilhub.io", async () => {
  const client = makeOkClient();
  const deps: EmailServiceDeps = {
    resendClient: client as unknown as EmailServiceDeps["resendClient"],
  };
  const service = createEmailService(deps);
  await service.sendPasswordResetEmail(
    "user@example.com",
    "https://app.vigilhub.io/auth/reset?token=abc",
  );
  const args = client.captured!;
  assert.equal(
    args.from,
    "noreply@vigilhub.io",
    `expected from to equal "noreply@vigilhub.io", got ${args.from}`,
  );
});

test("sendPasswordResetEmail on failure calls captureException with a HASHED to-address, not the raw email (D-12)", async () => {
  const rawEmail = "user@example.com";
  const client = makeThrowingClient("boom");
  const capture = makeCaptureSpy();
  const deps: EmailServiceDeps = {
    resendClient: client as unknown as EmailServiceDeps["resendClient"],
    captureExceptionFn: capture.fn,
  };
  const service = createEmailService(deps);
  await service.sendPasswordResetEmail(
    rawEmail,
    "https://app.vigilhub.io/auth/reset?token=abc",
  );
  assert.ok(capture.calls.length > 0, "captureException must have been called");
  const ctx = capture.calls[0]!.context;
  // Hashed to-address must be present as to_hash (sha256 hex prefix)
  const toHash = ctx["to_hash"];
  assert.ok(typeof toHash === "string", "context.to_hash must be a string");
  assert.match(
    toHash as string,
    /^[a-f0-9]{8,}$/,
    `context.to_hash must be lowercase hex, got: ${toHash}`,
  );
  // And the raw email must NOT appear as a value anywhere in the context
  for (const key of Object.keys(ctx)) {
    const val = ctx[key];
    assert.notEqual(
      val,
      rawEmail,
      `context must not contain raw email at key "${key}"`,
    );
  }
  // Also: none of the common "raw email" keys should be present with any value
  for (const forbidden of ["to", "email", "recipient"]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(ctx, forbidden),
      false,
      `context must not have key "${forbidden}" (PII leak)`,
    );
  }
});

test("sendEmailVerificationEmail parallels sendPasswordResetEmail — skipped_no_key, sent, failed, verbatim URL, from-address, PII hash", async () => {
  const verifyUrl =
    "https://app.vigilhub.io/auth/verify?token=verification-verbatim-xyz";
  const rawEmail = "newuser@example.com";

  // Case A — skipped_no_key
  {
    const service = createEmailService({ resendClient: null });
    const r = await service.sendEmailVerificationEmail(rawEmail, verifyUrl);
    assert.equal(r.status, "skipped_no_key");
  }

  // Case B — sent
  {
    const client = makeOkClient("msg_verify_123");
    const service = createEmailService({
      resendClient: client as unknown as EmailServiceDeps["resendClient"],
    });
    const r = await service.sendEmailVerificationEmail(rawEmail, verifyUrl);
    assert.equal(r.status, "sent");
    if (r.status === "sent") assert.equal(r.id, "msg_verify_123");
    // verbatim URL inside HTML
    const args = client.captured!;
    assert.ok(typeof args.html === "string");
    assert.ok(args.html!.includes(verifyUrl));
    // from
    assert.equal(args.from, "noreply@vigilhub.io");
    // multipart bodies
    assert.equal(typeof args.text, "string");
    // no per-send tracking fields
    assert.equal(
      Object.prototype.hasOwnProperty.call(args, "click_tracking"),
      false,
    );
  }

  // Case C — failed with hashed PII
  {
    const client = makeThrowingClient("verify-boom");
    const capture = makeCaptureSpy();
    const service = createEmailService({
      resendClient: client as unknown as EmailServiceDeps["resendClient"],
      captureExceptionFn: capture.fn,
    });
    const r = await service.sendEmailVerificationEmail(rawEmail, verifyUrl);
    assert.equal(r.status, "failed");
    assert.ok(capture.calls.length > 0);
    const ctx = capture.calls[0]!.context;
    assert.match(ctx["to_hash"] as string, /^[a-f0-9]{8,}$/);
    for (const key of Object.keys(ctx)) {
      assert.notEqual(ctx[key], rawEmail);
    }
  }
});
