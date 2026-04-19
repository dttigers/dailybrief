---
phase: 103-capture-repair-server-observability-foundations
auditor: gsd-secure-phase
asvs_level: 1
threats_open: 0
audit_date: 2026-04-19
---

# Phase 103 Security Audit

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-103-00-01 | Info Disclosure | mitigate | CLOSED | `artifacts/cap-02-pre-fix-curl.txt`: no match for `vk_`, `phc_`, `Authorization`, or `Bearer` — curl -i captures only response headers |
| T-103-00-02 | Spoofing | accept | CLOSED | Accepted risk — see Accepted Risks log |
| T-103-00-03 | Tampering | accept | CLOSED | Accepted risk — see Accepted Risks log |
| T-103-00-04 | Info Disclosure | mitigate | CLOSED | `posthog.test.ts:6` — `delete process.env["POSTHOG_API_KEY"]` at top of file before dynamic import |
| T-103-01-01 | Info Disclosure | mitigate | CLOSED | `posthog.ts:14-21` — `SENSITIVE_ROUTES` Set with all 6 routes; `posthog.ts:38-43` — `redactEvent` strips `request_body` + `headers` when route matches; `posthog.ts:57` — `before_send: redactEvent` wired at SDK construction |
| T-103-01-02 | Info Disclosure | mitigate | CLOSED | `posthog.ts:49,51` — `apiKey = process.env["POSTHOG_API_KEY"]`; `posthog: PostHog | null = apiKey ? new PostHog(...) : null` — key-absence gate, no NODE_ENV coupling; local `.env*` files confirmed clean |
| T-103-01-03 | DoS (observability) | mitigate | CLOSED | `posthog.ts:104-106` — `export async function shutdownPosthog(): Promise<void> { await posthog?.shutdown(); }` |
| T-103-01-04 | Tampering | mitigate | CLOSED | `posthog.ts:57` — `before_send: redactEvent` fires on every SDK emission regardless of call site; direct `posthog.capture(...)` calls also pass through the hook |
| T-103-01-05 | Elevation of Privilege | accept | CLOSED | Accepted risk — see Accepted Risks log |
| T-103-01-06 | Spoofing | accept | CLOSED | Accepted risk — see Accepted Risks log |
| T-103-02-01 | DoS | mitigate | CLOSED | `process-photo.ts:324-328` — 5 MB base64 cap (line 325) returns 413 BEFORE `heicConvertFn` call at line 372 |
| T-103-02-02 | Tampering | accept | CLOSED | Accepted risk — see Accepted Risks log |
| T-103-02-03 | Info Disclosure | mitigate | CLOSED | `process-photo.ts:498-502,513-517` — both `captureException` calls pass only `{route: "/v1/process-photo", method: "POST", op: "triage"/"triage_update"}` — no thought content included |
| T-103-02-04 | Tampering | mitigate | CLOSED | `triage.ts:40` — `parseAIJson<TriageResult>(raw)` validates shape; `triage.ts:34` — `triageThought` throws on parse failure; D-07 allSettled wrapper in `process-photo.ts:473` catches rejections → null category (line 517) |
| T-103-02-05 | Elevation (IDOR) | mitigate | CLOSED | `process-photo.ts:280` — `.where(and(eq(thoughtsTable.id, thoughtId), eq(thoughtsTable.userId, userId)))` — UPDATE requires both id AND userId match |
| T-103-02-06 | Spoofing | accept | CLOSED | Accepted risk — see Accepted Risks log |
| T-103-02-07 | DoS | mitigate | CLOSED | `process-photo.ts:473` — `Promise.allSettled(insertedRows.map(...))` — one slow/failing thought never blocks others |
| T-103-03-01 | Elevation (IDOR) | mitigate | CLOSED | `me.ts:59` — `c.get("userId")` only; no `c.req.param`, `c.req.query`, or `c.req.json` calls in handler |
| T-103-03-02 | Spoofing | accept | CLOSED | Accepted risk — see Accepted Risks log |
| T-103-03-03 | Info Disclosure | mitigate | CLOSED | `me.ts:43` — `.select({ id: users.id, email: users.email })` — `passwordHash` column never selected |
| T-103-03-04 | Info Disclosure | accept | CLOSED | Accepted risk — see Accepted Risks log |
| T-103-03-05 | DoS | mitigate | CLOSED | `me.ts:46` — `.limit(1)` on SELECT; `index.ts:90` — `app.use("*", rateLimiter)` (100 req/60s) applies to all /v1/* routes |
| T-103-03-06 | Tampering | mitigate | CLOSED | `me.ts:62` — defensive `!Number.isInteger(userId) || userId <= 0` guard returns 401; `index.ts:104-109` — exemption block only lists /v1/health, /v1/auth/google/callback, /v1/auth/register, /v1/auth/login — `/v1/me` absent |
| T-103-03-07 | Repudiation | accept | CLOSED | Accepted risk — see Accepted Risks log |
| T-103-04-01 | Info Disclosure | mitigate | CLOSED | `index.ts:153` — `return c.json({ error: "Internal server error" }, 500)` — stack trace logged to console and sent to PostHog only; generic message to client |
| T-103-04-02 | Info Disclosure | mitigate | CLOSED | `index.ts:104-109` — exemption block confirmed; grep for `/v1/me` in index.ts returns zero matches in exemption block |
| T-103-04-03 | DoS (observability) | mitigate | CLOSED | `index.ts:196` (SIGTERM) and `index.ts:207` (SIGINT) — `await shutdownPosthog()` is first await in both handlers, before `generateScheduler.stop()` |
| T-103-04-04 | Spoofing | mitigate | CLOSED | `artifacts/cap-02-pre-fix-curl.txt` — no `vk_`, `phc_`, `Authorization`, or `Bearer` strings present; curl -i does not echo request headers |
| T-103-04-05 | Info Disclosure | mitigate | CLOSED | `vigil-core/src/routes/debug-throw.ts` does not exist; `index.ts` has no `debug-throw` import |
| T-103-04-06 | Elevation of Privilege | accept | CLOSED | Accepted risk — see Accepted Risks log |
| T-103-04-07 | Tampering | mitigate | CLOSED | `posthog.ts:51` — D-10 null shim: `apiKey ? new PostHog(...) : null`; local vigil-core `.env*` files confirmed free of `POSTHOG_API_KEY` |
| T-103-04-08 | Tampering | accept | CLOSED | Accepted risk — see Accepted Risks log |

## Accepted Risks Log

| Threat ID | Category | Rationale |
|-----------|----------|-----------|
| T-103-00-02 | Spoofing | Diagnostic curl response is a real captured HTTP response committed to a private repo. No cryptographic signing required for an internal artifact. |
| T-103-00-03 | Tampering | Wave 0 RED test files are tracked in git. Unauthorized modification triggers CI failures. Red → green without implementation landing would be a visible regression. |
| T-103-01-05 | Elevation of Privilege | Singleton-at-module-scope is required for correct autocapture handler registration. posthog-node@^5.29.2 is from the official PostHog npm org; version pinned to catch only patch updates. |
| T-103-01-06 | Spoofing | Operational concern — one prod key is created by the user, pasted into Railway env. Key rotation is a separate process; no cryptographic mitigation in scope for this phase. |
| T-103-02-02 | Tampering | heic-convert is pure-JS with no native HEVC decoder; exploit surface is bounded to the JS parser. No CVEs in heic-convert@2.1.0 as of research date. Decode failure returns 422, not a crash. |
| T-103-02-06 | Spoofing | Content-Type spoofing (claim image/heic, send JPEG) causes heic-convert decode error → 422. No security impact; client receives correct error. |
| T-103-03-02 | Spoofing | Existing `verifyToken()` mandates HS256 algorithm via jose `algorithms: ["HS256"]` argument (utils/jwt.ts). No new crypto in this phase. |
| T-103-03-04 | Info Disclosure | D-18 uses literal "invalid_user" message — same treatment as bearerAuth's other 401s. Missing user and expired JWT both produce 401; no distinct user-enumeration channel. |
| T-103-03-07 | Repudiation | Per-call audit of /v1/me is out of scope for v3.5. Error cases still flow through app.onError → PostHog via Plan 04. |
| T-103-04-06 | Elevation of Privilege | `c.get("userId") ?? null` passes anonymous distinctId for unauthenticated error paths. Authenticated requests always have userId; pre-auth failures (401s) do not reach onError. Acceptable risk. |
| T-103-04-08 | Tampering | Code review is the control for preventing app.onError exfiltration. Same exposure applies to any analytics wrapper in any project. No runtime mitigation possible. |

## Unregistered Flags

None. No threat flags appear in SUMMARY.md that lack a mapping to the threat register.

## Audit Trail

| File | Role in Audit |
|------|---------------|
| `vigil-core/src/analytics/posthog.ts` | T-103-01-01 through T-103-01-04, T-103-04-07 — SENSITIVE_ROUTES, before_send, key-absence gate, shutdownPosthog |
| `vigil-core/src/analytics/posthog.test.ts` | T-103-00-04 — delete process.env["POSTHOG_API_KEY"] at line 6 |
| `vigil-core/src/routes/process-photo.ts` | T-103-02-01, T-103-02-03 through T-103-02-07 — 5 MB cap, captureException context, dbUpdateTriageFn WHERE clause, Promise.allSettled |
| `vigil-core/src/routes/triage.ts` | T-103-02-04 — parseAIJson<TriageResult> validation, triageThought throws on failure |
| `vigil-core/src/routes/me.ts` | T-103-03-01, T-103-03-03, T-103-03-05, T-103-03-06 — c.get("userId") only, select list, .limit(1), integer guard |
| `vigil-core/src/index.ts` | T-103-03-05, T-103-03-06, T-103-04-01 through T-103-04-05, T-103-04-07 — rateLimiter, exemption list, app.onError, shutdownPosthog ordering |
| `artifacts/cap-02-pre-fix-curl.txt` | T-103-00-01, T-103-04-04 — no bearer token strings present in committed artifact |
