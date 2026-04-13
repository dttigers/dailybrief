# Phase 79: Gmail OAuth Server Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 79-gmail-oauth-server-foundation
**Areas discussed:** JWT nonce strategy, Scope-gap detection, OAuth redirect UX, Scope request approach

---

## JWT Nonce Strategy

### JWT Library

| Option | Description | Selected |
|--------|-------------|----------|
| jose (Recommended) | ESM-native, zero dependencies, works with Edge runtimes. Already aligned with Hono's modern stack. | ✓ |
| jsonwebtoken | Most popular Node.js JWT library. CJS-first, requires 2 transitive deps. Heavier but battle-tested. | |
| You decide | Let Claude pick the best fit for the vigil-core stack. | |

**User's choice:** jose (Recommended)
**Notes:** None

### JWT Payload

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: nonce + exp | Random nonce + 5-min expiry. Simple, mirrors current Map behavior but survives restarts. | |
| Nonce + exp + redirect (Recommended) | Add the intended redirect_uri so callback can validate it came from the right flow. Extra CSRF protection. | ✓ |
| You decide | Let Claude decide what's appropriate for the threat model. | |

**User's choice:** Nonce + exp + redirect (Recommended)
**Notes:** None

### JWT Secret Management

| Option | Description | Selected |
|--------|-------------|----------|
| Single env var (Recommended) | GOOGLE_OAUTH_STATE_SECRET in Railway. Simple, matches existing pattern. | ✓ |
| Derived from existing secret | Derive from an existing env var (e.g., HMAC of GOOGLE_CLIENT_SECRET + salt). No new env var needed. | |
| You decide | Let Claude pick the simplest secure approach. | |

**User's choice:** Single env var (Recommended)
**Notes:** None

---

## Scope-Gap Detection

### Detection Method

| Option | Description | Selected |
|--------|-------------|----------|
| Store scopes in DB (Recommended) | Add a 'scopes' jsonb column to oauth_tokens. Record granted scopes at auth time. Fast, no API call. | ✓ |
| Token introspection API call | Call Google's tokeninfo endpoint to check actual scopes. Always accurate but adds latency. | |
| Test-call approach | Try a lightweight Gmail API call; if 403, report needs_auth. Simple but conflates errors. | |
| You decide | Let Claude pick based on existing patterns. | |

**User's choice:** Store scopes in DB — confirmed after clarifying account topology
**Notes:** User initially mentioned Calendar and Gmail are different accounts. After discussion, confirmed work orders are forwarded from Exchange to a separate Gmail, but will forward to personal Gmail. Single-account model confirmed.

### Account Model

| Option | Description | Selected |
|--------|-------------|----------|
| Same account (Recommended) | One Google account for both Calendar and Gmail. Single provider='google' row. | ✓ |
| Different accounts possible | Separate token rows per service for different Google accounts. | |

**User's choice:** Same account — forward work order emails to personal Gmail
**Notes:** Work orders originate from Exchange email (IT blocks IMAP/OAuth). Currently forwarded to a separate work-order Gmail. User will forward to personal Gmail instead, keeping single-account architecture.

### Status Response Shape

**User's choice:** Per-scope status: `{ calendar: 'connected'|'needs_auth', gmail: 'connected'|'needs_auth' }`
**Notes:** Confirmed after account model was locked in.

---

## OAuth Redirect UX

### Callback Redirect Target

| Option | Description | Selected |
|--------|-------------|----------|
| PWA root with query param (Recommended) | Redirect to PWA_URL?google_connected=true. Same as current behavior. Phase 81 updates target. | ✓ |
| Encode redirect_uri in JWT state | Callback redirects to whatever was encoded in JWT. Flexible but no settings page yet. | |
| You decide | Let Claude handle based on current vs Phase 81 state. | |

**User's choice:** PWA root with query param (Recommended)
**Notes:** None

### Route Unification

| Option | Description | Selected |
|--------|-------------|----------|
| Unify into /auth/google (Recommended) | Rename calendar-auth.ts to google-auth.ts. Single auth entry point for both scopes. | ✓ |
| Keep calendar-auth separate | Leave calendar-auth.ts untouched, add gmail-auth.ts. Two separate OAuth flows. | |
| You decide | Let Claude pick the cleanest approach. | |

**User's choice:** Unify into /auth/google (Recommended)
**Notes:** None

---

## Scope Request Approach

### Scope Model

| Option | Description | Selected |
|--------|-------------|----------|
| Always request both (Recommended) | Single consent screen with both scopes. prompt=consent forces re-grant. | ✓ |
| Incremental authorization | Request only needed scopes, Google keeps existing grants. More complex. | |
| You decide | Let Claude pick for single-user context. | |

**User's choice:** Always request both (Recommended)
**Notes:** None

### Re-auth Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt re-connect (Recommended) | Status shows needs_auth, PWA shows re-connect button. User-initiated. | ✓ |
| Auto-redirect to re-auth | Server auto-starts re-auth on Gmail API attempt. More seamless but less transparent. | |

**User's choice:** Prompt re-connect (Recommended)
**Notes:** None

---

## Claude's Discretion

- Error handling patterns and HTTP status codes for the status endpoint
- Test structure (unit/integration)
- Migration approach for scopes column
- Whether to store account email in token row

## Deferred Ideas

None — discussion stayed within phase scope
