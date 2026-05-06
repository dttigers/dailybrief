---
phase: 105-product-events-api-metrics-user-identity
slug: 105-product-events-api-metrics-user-identity
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-19
---

# Phase 105 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Audits ONLY the threats declared in PLAN.md `<threat_model>` blocks. 24 threats across 3 plans (15 mitigate + 9 accept). No new threat discovery — verification-only.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| route handler → trackEvent | Developer-authored property maps cross; wrapper is last line of defense before egress | property names + values (Record<string,string\|number\|boolean\|null\|undefined>) |
| trackEvent → posthog-node SDK → PostHog Cloud | Network egress to third party (https://us.i.posthog.com) | event name, distinctId, property map |
| client → bearerAuth → metricsMiddleware | Untrusted request crosses bearerAuth; metricsMiddleware sees only authenticated context | c.var.userId (resolved integer) |
| /v1/me handler → identifyUser → PostHog Cloud | Network egress carrying person properties for authenticated user | email, createdAt (ISO string) |
| JWT / vk_ → bearerAuth → c.var.userId | Signed tokens resolve to userId (JWT via JOSE verify; vk_ via api_keys FK lookup) | JWT sub claim / vk_ hash → numeric user id |

---

## Threat Register

### Plan 01 — PostHog wrapper guard + identifyUser

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-105-01 | Information disclosure | trackEvent properties (user-generated thought / chat / transcript text) | mitigate | `BLOCKED_PROPERTY_NAMES` Set at `vigil-core/src/analytics/posthog.ts:32-41` drops 8 leak-prone names before `posthog.capture()`. Partition loop at `posthog.ts:100-106`. Test at `posthog.test.ts:91-117` asserts literal Set membership + case-sensitivity. | closed |
| T-105-02 | Information disclosure | Developer accidentally adds NEW string field with non-blocked name (e.g. `summary`) | accept | Type signature `string\|number\|boolean\|null\|undefined` is first signal; `posthog_property_blocked` meta-event at `posthog.ts:111-120` surfaces actual leaks. Denylist easy to extend (D-04). See Accepted Risks Log. | closed |
| T-105-03 | Information disclosure | identifyUser properties (route handler passes user-generated text) | mitigate | Same narrow type signature on `identifyUser` at `posthog.ts:146-154`. Plan 03 call site at `me.ts:107-111` passes ONLY `{email, createdAt}` — explicit allowlist. `MeDeps.userLookupFn` projection at `me.ts:51-59` selects only `id, email, createdAt` — no hidden PII surface. | closed |
| T-105-04 | Repudiation | `posthog_property_blocked` meta-event IS the audit log (no separate record) | accept | By design — meta-event at `posthog.ts:111-120` is the auditable trace of every drop. See Accepted Risks Log. | closed |
| T-105-05 | Tampering | `BLOCKED_PROPERTY_NAMES` Set mutated at runtime | mitigate | TS `const` + module-scope Set at `posthog.ts:32-41`. No runtime injection path (imports are read-only). Hardening via commit c40ad77: `identifyUser` at `posthog.ts:150-153` wraps properties in explicit `$set` so a caller passing a `$set`/`$set_once`/`$anon_distinct_id` key at the wrapper boundary can no longer hijack the posthog-node auto-wrap destructure. | closed |
| T-105-06 | Denial of service | Massive properties object causes O(n) Set lookups | accept | Set.has is O(1); properties count bounded by route-handler intent (3-6 per call). See Accepted Risks Log. | closed |
| T-105-07 | Elevation of privilege | Route files bypass wrapper with direct `posthog.capture` | mitigate | Module-top comment at `posthog.ts:6-8` forbids direct singleton imports (D-14). Verified via grep: `import.*\{.*posthog.*\}.*from.*analytics/posthog` returns ZERO hits across `vigil-core/src`. Only `trackEvent` / `identifyUser` / `captureException` / `redactEvent` / `shutdownPosthog` exports are consumed externally. | closed |

### Plan 02 — metricsMiddleware + capture-funnel events

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-105-08 | Authorization bypass | metricsMiddleware emits `api_request` with `userId=undefined` | mitigate | Mount ordering in `index.ts:105-122`: bearerAuth dispatcher registers at line 105, `metricsMiddleware` at line 122 (AFTER public-path short-circuits). Middleware guard at `metrics.ts:61-62` (`if (userId == null) return;`) short-circuits before `trackFn`. Test at `metrics.test.ts:83-88` asserts no emission when userId is absent. | closed |
| T-105-09 | Information disclosure | `thought_created` leaks `content: thought.content` | mitigate | Call site at `thoughts.ts:308-312` uses only `{source, has_category, fire_and_forget_triage}` — bounded primitives. `BLOCKED_PROPERTY_NAMES` catches `content` as backstop. Grep of all route + middleware files for `trackEvent\(.*\b(content\|body\|text\|...)\b` returns ZERO matches. | closed |
| T-105-10 | Information disclosure | `photo_uploaded` leaks `body` (base64 image) or `rawText` (Claude OCR) | mitigate | Call site at `process-photo.ts:471-478` uses only `{paper_type, vision_confidence, thought_count, force_paper_type, media_type, was_heic}` — enums + numbers + booleans. `BLOCKED_PROPERTY_NAMES` catches `body` / `text` as backstop. Zero-match grep confirms no leak at call site. | closed |
| T-105-11 | Information disclosure | `chat_sent` leaks `messages` or `response` | mitigate | Call site at `chat.ts:111-116` uses only `{conversation_length, context_used, include_context_requested, model}` — bounded primitives. Note: `messages` / `response` are NOT in `BLOCKED_PROPERTY_NAMES` — code review is primary defense; denylist extension deferred (see Accepted Risks Log note, and 105-02-SUMMARY.md "Denylist Candidates for v3.6"). | closed |
| T-105-12 | Information disclosure | `brief_generated` leaks summary text | mitigate | Call site at `brief-generate.ts:110-116` uses only `{source, date, brief_id, thought_count, task_count}` — bounded primitives. Note: `summary` is NOT in `BLOCKED_PROPERTY_NAMES` — code review is primary defense; denylist extension deferred. | closed |
| T-105-13 | Availability | `trackEvent` throw breaks handler success path | mitigate | Wrapper at `posthog.ts:92-130` is null-guarded (Phase 103 D-10 gate) — `posthog?.capture` no-ops if singleton is null. `metricsMiddleware` adds defense-in-depth try/catch at `metrics.ts:65-81`. Route call sites do NOT wrap (REVIEW.md WR-01 notes this latent risk — deferred per review; null-guard + fire-and-forget SDK makes throw effectively impossible today). | closed |
| T-105-14 | Availability | `metricsMiddleware` latency overhead | accept | `performance.now()` + `Math.round` + queue insertion are sub-ms. See Accepted Risks Log. | closed |
| T-105-15 | Repudiation | userId spoofing for mis-attribution | accept | `c.get("userId")` set by bearerAuth from verified JWT (JOSE) or api_keys FK lookup. Non-spoofable from outside. See Accepted Risks Log. | closed |
| T-105-16 | Information disclosure | `api_request.route` leaks sensitive endpoint path | accept | `c.req.path` is route-only (no query string); paths are already public surface. See Accepted Risks Log. | closed |

### Plan 03 — /v1/me identifyUser

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-105-17 | Information disclosure | identify leaks PII beyond `email + createdAt` | mitigate | Explicit property allowlist at `me.ts:107-111`: `{email: row.email, createdAt: row.createdAt.toISOString()}` — exactly two keys. `MeDeps.userLookupFn` projection at `me.ts:51-59` selects only `id, email, createdAt` — no `.select('*')` hidden surface. Test at `me.test.ts:108-122` asserts exact property shape. | closed |
| T-105-18 | Information disclosure | identify fires for missing user | mitigate | Identify call at `me.ts:107-117` is INSIDE the `if (!row) return 401` else branch (guard at `me.ts:94-98`). Test at `me.test.ts:124-134` asserts zero identify calls when `lookupResult === null`. Defensive userId-guard test at `me.test.ts:136-146` asserts no identify when `c.get("userId")` is missing. | closed |
| T-105-19 | Information disclosure | vk_ identifies wrong user (cross-user attribution) | mitigate | Phase 103 D-17 bearerAuth maps vk_ → seed user via `api_keys → users` FK lookup (see `middleware/auth.ts:6,92`). `/me` handler reads `c.get("userId")` only — no header/body input. Test at `me.test.ts:165-181` asserts identify fires with the resolved seed userId, no branching needed. | closed |
| T-105-20 | Availability | identifyUser SDK throw breaks 200 response | mitigate | Wrapper at `posthog.ts:146-154` is null-guarded. Defensive try/catch at `me.ts:107-117` wraps the identify call; failures log to `console.error` and control falls through to the 200 c.json at `me.ts:120`. | closed |
| T-105-21 | Availability | identify queue blows up under high /me traffic | accept | posthog-node batches via `flushAt:20` / `flushInterval:10s` (Phase 103 defaults); identify is fire-and-forget queue insertion. See Accepted Risks Log. | closed |
| T-105-22 | Information disclosure | `createdAt` leaked to PostHog | accept | Required for cohort analysis (D-09 explicit). PostHog is trusted third party under contract. See Accepted Risks Log. | closed |
| T-105-23 | Repudiation | PostHog identify used as security audit log | accept | Out of scope — JWT issuance in `auth.ts` + DB writes are canonical audit trail; PostHog is product analytics only. See Accepted Risks Log. | closed |
| T-105-24 | Tampering | Forged JWT forges identify userId | mitigate | `bearerAuth` verifies JWT signature via JOSE before setting `c.var.userId` — `middleware/auth.ts:6` imports `verifyToken` from `utils/jwt.js`; called at `auth.ts:92`. Forged JWT fails verification, never reaches `/me` handler. Inherited from Phase 102/103; no new attack surface this phase. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-105-02 | T-105-02 | New leak-name fields are a known gap. First-line defense is the narrow type signature (`string\|number\|boolean\|null\|undefined`). Runtime `posthog_property_blocked` meta-event surfaces actual leaks for retroactive cleanup; denylist is easy to extend when a leak name is spotted. Candidate additions logged in 105-02-SUMMARY.md "Denylist Candidates for v3.6": `messages`, `response`, `summary`, `prompt`, `system`. | Solo dev (ADHD founder) — L1 ASVS pragmatic | 2026-04-19 |
| AR-105-04 | T-105-04 | `posthog_property_blocked` meta-event IS the audit log — without it, drops would be silent. Every drop is auditable in PostHog as a canary event. Accepting that the audit log lives in a third-party analytics platform is consistent with Phase 103 D-12 data-sharing posture. | Solo dev — L1 ASVS pragmatic | 2026-04-19 |
| AR-105-06 | T-105-06 | Set.has is O(1). `Object.keys(properties)` is bounded by route-handler intent (3-6 props per Phase 105 call site). No real DoS surface. Revisit only if batch emitters land in a future phase. | Solo dev — L1 ASVS pragmatic | 2026-04-19 |
| AR-105-14 | T-105-14 | `metricsMiddleware` adds one `Math.round` + one posthog.capture queue insertion — sub-ms. SDK batches via flushAt:20 / flushInterval:10s. No measurable latency impact at current traffic. | Solo dev — L1 ASVS pragmatic | 2026-04-19 |
| AR-105-15 | T-105-15 | `c.get("userId")` is set by bearerAuth from verified JWT (JOSE) or api_keys FK lookup. Non-spoofable from outside. metricsMiddleware reads userId from c.var only — never from header/body. No new attack surface. | Solo dev — L1 ASVS pragmatic | 2026-04-19 |
| AR-105-16 | T-105-16 | Route paths (`/v1/chat`, `/v1/thoughts`) are already public via HTTP observers; Hono's `c.req.path` is route-only (no query string). PostHog visibility of paths adds no leak surface beyond what Anthropic and any network observer already see. | Solo dev — L1 ASVS pragmatic | 2026-04-19 |
| AR-105-21 | T-105-21 | posthog-node batches via flushAt:20 / flushInterval:10s — identify is fire-and-forget queue insertion, sub-ms. CONTEXT.md "Claude's Discretion" authorized skipping a cache/short-circuit optimization until profiling justifies. | Solo dev — L1 ASVS pragmatic | 2026-04-19 |
| AR-105-22 | T-105-22 | `createdAt` is required for cohort analysis (D-09 locked decision). PostHog is a trusted third party; privacy posture inherits from Phase 103 D-12 (route + status + userId already shared). No PII beyond what's on the `users` row by design. | Solo dev — L1 ASVS pragmatic | 2026-04-19 |
| AR-105-23 | T-105-23 | Out of scope for Phase 105. Security audit trail is owned by `auth.ts` JWT issuance + DB writes (canonical). PostHog identify is product analytics only; the platform makes no repudiation-resistance guarantees, nor is it asked to. | Solo dev — L1 ASVS pragmatic | 2026-04-19 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

SUMMARY.md `## Threat Flags` sections for all three plans report **None** — no new surface discovered during execution. All threat IDs referenced in SUMMARY files map to threats declared in the PLAN threat registers. No unregistered flags to log.

---

## Review Cross-References (informational — not blocking)

105-REVIEW.md identifies 2 warnings + 4 info items that are architectural observations, not unmitigated threats:

- **WR-01** (route call sites lack try/catch around `trackEvent`) — maps to T-105-13 posture; REVIEW acknowledges the risk is latent today because the wrapper is null-guarded and `posthog-node.capture()` is non-throwing. Recommendation to centralize the catch inside `trackEvent` is a defense-in-depth improvement; not a currently-unmitigated threat.
- **WR-02** (`metricsMiddleware` registered after `googleAuth`, so `/v1/auth/google` initiation is unmeasured) — availability/observability gap, NOT a security threat. Doesn't affect T-105-08 (that threat is about emitting with undef userId; the guard at `metrics.ts:61-62` handles it regardless of mount order). No disposition-level impact.
- **IN-01** (`identifyUser` not protected by `BLOCKED_PROPERTY_NAMES`) — intentional asymmetry; person properties legitimately include fields like `title` in future. Phase 105 call site passes only `{email, createdAt}` — within T-105-17 mitigation.
- **IN-02** (thrown-error responses bypass `api_request` emission) — observability gap, not a security issue. `captureException` still reports.
- **IN-03/IN-04** — test-spy type drift and env-mutation ordering; cosmetic.

All review findings remain open for future iteration but do NOT re-open any Phase 105 threat.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-19 | 24 | 24 | 0 | gsd-security-auditor (/gsd-secure-phase) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer) — 15 mitigate + 9 accept = 24
- [x] Accepted risks documented in Accepted Risks Log (9 entries)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-19
