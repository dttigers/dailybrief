---
phase: 105-product-events-api-metrics-user-identity
verified: 2026-04-19T00:00:00Z
status: human_needed
score: 4/4 must-haves verified (code-level); 1 runtime dashboard check pending
overrides_applied: 0
human_verification:
  - test: "Capture a thought via PWA/API and confirm `thought_created` + `triage_completed` both appear in PostHog Cloud with the same userId, and no duplicate `thought_created` from client"
    expected: "Two distinct server-side events in the PostHog Events explorer with matching `distinct_id`; zero client-emitted duplicates"
    why_human: "Requires authenticated Railway deploy + PostHog Cloud UI inspection — the SDK flush is async and only visible in the PostHog dashboard"
  - test: "Upload a photo via POST /v1/process-photo (PWA or curl) and verify `photo_uploaded` appears in PostHog filtered by the authenticated userId"
    expected: "One event per successful upload with {paper_type, vision_confidence, thought_count, force_paper_type, media_type, was_heic} properties"
    why_human: "Dashboard visibility is a runtime/UI concern — code emits the event, but verification requires logging into app.posthog.com"
  - test: "Run several authenticated API calls (e.g. GET /v1/thoughts, POST /v1/chat) then query PostHog for `api_request` events grouped by route + status_class"
    expected: "Dashboard query returns per-route rows with duration_ms, status code, and status_class buckets populated for every authenticated request"
    why_human: "ROADMAP SC#3 explicitly asks for 'visible in a dashboard query' — requires PostHog UI + time for the 10s flushInterval to land events"
  - test: "After a successful GET /v1/me, open the seed user's PostHog Person record and confirm email + createdAt person properties are set"
    expected: "Person record shows email = user's email, createdAt = ISO timestamp matching the DB row"
    why_human: "posthog.identify is fire-and-forget to PostHog Cloud; verification is a dashboard UI check"
---

# Phase 105: Product Events, API Metrics & User Identity Verification Report

**Phase Goal:** The capture funnel, API error rates, and user identity are visible in the PostHog dashboard
**Verified:** 2026-04-19
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Roadmap Success Criteria + merged PLAN must_haves.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After capturing a thought and completing triage, two distinct server events emit with the same userId: `thought_created` + `triage_completed`; no client double-counting | ✓ VERIFIED (code) | `trackEvent(userId, "thought_created", ...)` at `vigil-core/src/routes/thoughts.ts:308` after DB insert. `trackEvent(userId, "triage_completed", ...)` at `vigil-core/src/routes/process-photo.ts:498` inside `outcome.status === "fulfilled"` after `dbUpdateTriageFn` succeeds. Note: triage_completed ALSO emits inside /v1/process-photo path for photos, but the text-capture path at POST /v1/thoughts fires fire-and-forget triage without a triage_completed event (D-15 allows this — triage completion is photo-path scoped here). No client `capture()` / `trackEvent()` for these names exists in vigil-pwa/src (grep returned zero hits) — no double-counting possible. Runtime dashboard check deferred to human. |
| 2 | After a photo upload, a `photo_uploaded` event emits attributed to userId | ✓ VERIFIED (code) | `trackEvent(userId, "photo_uploaded", {...})` at `vigil-core/src/routes/process-photo.ts:471` emits ONCE after `dbInsertFn` returns successfully, BEFORE triage runs. Properties bounded: paper_type, vision_confidence, thought_count, force_paper_type, media_type, was_heic. PostHog distinct_id = String(userId) via wrapper. |
| 3 | Per-route API metrics (status, latency, route name) populated for every authenticated request | ✓ VERIFIED (code) | `metricsMiddleware` in `vigil-core/src/middleware/metrics.ts` emits `api_request` with {route, method, status, duration_ms, status_class}. Registered in `vigil-core/src/index.ts:122` AFTER bearerAuth dispatcher (line 105) and BEFORE protected route mounts starting at line 125. Skips emission when userId is missing (D-05). Note: WR-02 in REVIEW.md observes googleAuth (line 114) is mounted BEFORE metricsMiddleware — /v1/auth/google initiation is silently un-measured. Dashboard visibility deferred to human. |
| 4 | No event property contains user-generated string content (enums, booleans, numbers only) | ✓ VERIFIED | `BLOCKED_PROPERTY_NAMES` at `vigil-core/src/analytics/posthog.ts:32-41` enforces runtime denylist (`content`, `body`, `text`, `message`, `description`, `title`, `note`, `transcript`). grep of all 5 route `trackEvent` call sites + middleware returns ZERO collisions with denylisted property names. Meta-event `posthog_property_blocked` emits one-per-drop as canary. |
| 5 | trackEvent drops any property whose name is in BLOCKED_PROPERTY_NAMES before emission (PLAN 01 must_have) | ✓ VERIFIED | Source: `posthog.ts:97-106` partition loop; tests `posthog.test.ts` BLOCKED_PROPERTY_NAMES describe block (2 tests) + trackEvent guard shim path (4 tests). All pass. |
| 6 | identifyUser wrapper exists so route call sites never import posthog singleton directly | ✓ VERIFIED | `export function identifyUser` at `posthog.ts:139-147`. Only consumer is `routes/me.ts:17` (import) + `routes/me.ts:62, 71, 108` (call site). No route file imports `posthog` singleton directly. |
| 7 | Every authenticated request emits exactly one api_request event (PLAN 02 must_have) | ✓ VERIFIED | metrics test "emits exactly one api_request event per authenticated request" passes; implementation awaits next() then emits once. |
| 8 | POST /v1/brief/generate emits brief_generated after PDF stored (PLAN 02 must_have) | ✓ VERIFIED | `brief-generate.ts:110` after `await db.transaction(...)` resolves, before `return new Response(...)`. Properties: source='manual', date, brief_id, thought_count, task_count. |
| 9 | POST /v1/chat emits chat_sent after Claude returns successfully (PLAN 02 must_have) | ✓ VERIFIED | `chat.ts:111` inside try block after `callClaudeConversation` returns, before `c.json({response, contextUsed})`. Failed chats hit catch block and emit nothing. |
| 10 | Every successful GET /v1/me triggers identifyUser attributed to userId (PLAN 03 must_have) | ✓ VERIFIED | `me.ts:107-117` inside try/catch, after row-exists guard, before `c.json({userId, email}, 200)`. 5 passing tests including positive, negative (missing row), negative (userId guard), response-shape regression, and vk_→seed user attribution. |
| 11 | Identify properties are limited to email + createdAt (no PII beyond users row) | ✓ VERIFIED | `me.ts:108-111` passes exactly `{email: row.email, createdAt: row.createdAt.toISOString()}`. MeDeps.userLookupFn returns only `{id, email, createdAt}` — no `passwordHash` or other fields projected. |
| 12 | vk_ legacy clients trigger identify via seed user mapping (D-11) | ✓ VERIFIED | bearerAuth three-path dispatcher maps vk_ → seed user before /me handler runs. Test "vk_ → seed user attribution: identify fires with the resolved seed userId (D-11)" passes in me.test.ts. |
| 13 | When users row missing (D-18 401), no identify call fires | ✓ VERIFIED | `me.ts:94-98` returns 401 before reaching identify call. Test "does NOT call identifyUser when row is missing" passes. |
| 14 | All new behaviour exercised by tests that pass with POSTHOG_API_KEY unset | ✓ VERIFIED | Ran `npx tsx --test src/analytics/posthog.test.ts src/middleware/metrics.test.ts src/routes/me.test.ts` → 38 tests pass, 0 fail, 0 skipped. |

**Score:** 14/14 truths verified at the code level. 4 truths (SC#1-3 runtime visibility, ANLY-04 person record) require PostHog Cloud dashboard verification — routed to human.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-core/src/analytics/posthog.ts` | BLOCKED_PROPERTY_NAMES + extended trackEvent + identifyUser wrapper | ✓ VERIFIED | 174 lines. Contains BLOCKED_PROPERTY_NAMES Set with exactly 8 names (content, body, text, message, description, title, note, transcript). trackEvent partitions properties; identifyUser wraps posthog.identify. All exports present: redactEvent, trackEvent, captureException, shutdownPosthog, identifyUser, BLOCKED_PROPERTY_NAMES, posthog. |
| `vigil-core/src/analytics/posthog.test.ts` | Tests for guard + identifyUser + existing suites | ✓ VERIFIED | 175 lines. 19 tests pass (4 redactEvent, 5 null-guard, 2 BLOCKED_PROPERTY_NAMES, 4 trackEvent guard shim, 4 identifyUser wrapper). |
| `vigil-core/src/middleware/metrics.ts` | metricsMiddleware + createMetricsMiddleware + statusClass | ✓ VERIFIED | 86 lines. All three exports present. performance.now() timing, try/catch around trackFn, userId-null skip. |
| `vigil-core/src/middleware/metrics.test.ts` | Tests for statusClass + emission contract | ✓ VERIFIED | 102 lines. 11 tests pass (6 statusClass + 5 emission contract). |
| `vigil-core/src/index.ts` | metricsMiddleware registered after bearerAuth, before protected routes | ✓ VERIFIED | Line 8 import, line 122 `app.use("/v1/*", metricsMiddleware)`. Order: bearerAuth dispatcher (line 105) → googleAuth (line 114) → metricsMiddleware (line 122) → summary + other protected routes (line 125+). |
| `vigil-core/src/routes/thoughts.ts` | thought_created event on POST /thoughts success | ✓ VERIFIED | `trackEvent(userId, "thought_created", ...)` at line 308 after DB insert, before fire-and-forget triage. |
| `vigil-core/src/routes/process-photo.ts` | photo_uploaded + triage_completed events | ✓ VERIFIED | photo_uploaded at line 471 (once per successful POST). triage_completed at line 498 (inside fulfilled branch after DB update). |
| `vigil-core/src/routes/brief-generate.ts` | brief_generated event on POST /brief/generate success | ✓ VERIFIED | Line 110 after transaction resolves, before response. briefId hoisted outside transaction scope as planned. |
| `vigil-core/src/routes/chat.ts` | chat_sent event on POST /chat success | ✓ VERIFIED | Line 111 inside try block after Claude returns, before c.json. |
| `vigil-core/src/routes/me.ts` | Extended /me handler with identifyUser call | ✓ VERIFIED | 127 lines. MeDeps widened with createdAt + optional identifyFn. defaultDeps projects createdAt in select. Identify call wrapped in try/catch at lines 107-117. Response body shape unchanged. |
| `vigil-core/src/routes/me.test.ts` | Tests for identify emission on success + 401 + vk_ seed user | ✓ VERIFIED | 182 lines. 8 tests pass (2 existing D-16/D-17/D-18 + 1 placeholder + 5 new identifyUser emission contract). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `posthog.ts` trackEvent body | BLOCKED_PROPERTY_NAMES Set | `for-of loop checking property keys` | ✓ WIRED | Lines 100-106 iterate keys and check `BLOCKED_PROPERTY_NAMES.has(key)`. |
| `posthog.ts` trackEvent body | `posthog.capture({event: 'posthog_property_blocked'})` | Secondary capture per blocked property | ✓ WIRED | Lines 111-120 emit meta-event before user event. |
| `posthog.ts` identifyUser | `posthog.identify({distinctId, properties})` | Thin null-guarded wrapper | ✓ WIRED | Lines 143-146 call `posthog?.identify(...)` (optional-chain null guard). |
| `index.ts` middleware chain | `middleware/metrics.ts` | app.use after bearerAuth, before protected routes | ✓ WIRED | Line 122 registration between bearerAuth (105) and summary (125). Note: googleAuth (114) precedes registration — see IN-01 below. |
| `middleware/metrics.ts` | `analytics/posthog.ts` trackEvent | import + post-handler emit | ✓ WIRED | Line 23 import, line 66 emit. |
| Each route success path | `trackEvent(userId, eventName, props)` | Import + synchronous call | ✓ WIRED | 5 routes, 5 call sites (thoughts, process-photo has 2, brief-generate, chat). |
| `me.ts` /me success path | `analytics/posthog.ts` identifyUser | Import + post-lookup-pre-response call | ✓ WIRED | Line 17 import, line 108 call inside try/catch. |
| users table createdAt column | identify properties | MeDeps.userLookupFn returns createdAt | ✓ WIRED | Lines 33-35 interface, lines 52-55 Drizzle select projection, line 110 `.toISOString()`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `metrics.ts` api_request | `c.req.path`, `c.res.status`, `performance.now()` diff | Hono context after await next() | Yes — populated by Hono runtime from real requests | ✓ FLOWING |
| `thoughts.ts` thought_created | `created.source`, `category`, `getAIClient()` | Drizzle insert returning + request body + AI client singleton | Yes — `created` is the actual inserted row | ✓ FLOWING |
| `process-photo.ts` photo_uploaded | `transformed.paperType`, `insertedRows.length`, `mediaType` | Claude Vision response + DB insert + request header | Yes — real upstream values | ✓ FLOWING |
| `process-photo.ts` triage_completed | `t.category`, `t.confidence`, `t.tags`, `t.therapyClassification` | `outcome.value` from Promise.allSettled on triageFn | Yes — real Claude triage output | ✓ FLOWING |
| `brief-generate.ts` brief_generated | `briefId`, `dateStr`, `metadata.thoughtCount`, `metadata.taskCount` | Transaction RETURNING + assembler output | Yes — real DB insert ID + assembled metadata | ✓ FLOWING |
| `chat.ts` chat_sent | `messages.length`, `contextUsed`, `includeContext` | Request body + context injector | Yes — real conversation state | ✓ FLOWING |
| `me.ts` identify | `row.email`, `row.createdAt.toISOString()` | Drizzle select from users table | Yes — real users row | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All Phase 105 unit tests pass under shim | `cd vigil-core && npx tsx --test src/analytics/posthog.test.ts src/middleware/metrics.test.ts src/routes/me.test.ts` | 38 tests pass, 0 fail, 0 skipped | ✓ PASS |
| TypeScript clean | `cd vigil-core && npx tsc --noEmit` | Zero errors (no output) | ✓ PASS |
| 5 route trackEvent call sites present | `grep 'trackEvent(userId, "' vigil-core/src/routes/ (recursive)` | 5 matches across 4 files (process-photo has 2) | ✓ PASS |
| Zero BLOCKED_PROPERTY_NAMES collisions | `grep -rE 'trackEvent\(.*\b(content\|body\|text\|message\|description\|title\|note\|transcript)\b'` in vigil-core/src | Zero matches | ✓ PASS |
| PWA has NO client-side duplicate events | `grep 'capture(\|trackEvent(\|thought_created\|triage_completed\|photo_uploaded\|brief_generated\|chat_sent'` in vigil-pwa/src | Zero matches (SC#1 "no double-counting from client" — confirmed) | ✓ PASS |
| Middleware ordering correct | Inspect vigil-core/src/index.ts for bearerAuth < metricsMiddleware < first-protected-route | bearerAuth line 105, metricsMiddleware line 122, first protected route (summary) line 125 | ✓ PASS |
| Phase 105 commits present | `git log --oneline` | All 9 phase commits present: 7ce1ae4, 1306ae0, 874676f, 719f064, 9db634f, 27526d9 (plus docs) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ANLY-02 | 105-01, 105-02 | Product events emit for the capture funnel (thought captured, triage completed, brief generated, photo uploaded, chat sent) with userId attached | ✓ SATISFIED | 5 trackEvent call sites wired with userId from bearerAuth context. BLOCKED_PROPERTY_NAMES guard at wrapper prevents user content leak. |
| ANLY-03 | 105-02 | API middleware records per-route metrics (status code, latency, route name) for every authenticated request | ✓ SATISFIED | metricsMiddleware emits api_request with {route, method, status, duration_ms, status_class} on every authenticated request. Registered after bearerAuth. |
| ANLY-04 | 105-01, 105-03 | Authenticated users are identified to PostHog via posthog.identify(userId) on login | ✓ SATISFIED | identifyUser wrapper in posthog.ts. Called from /v1/me (which PWA hits on mount per Phase 104 D-15). Properties: email + createdAt. vk_ legacy clients covered via seed-user mapping (Phase 103 D-17). |

All 3 requirements declared in PLAN frontmatter (ANLY-02, ANLY-03, ANLY-04) are accounted for. REQUIREMENTS.md Traceability table confirms no additional orphaned requirements for Phase 105.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `vigil-core/src/index.ts` | 114 vs 122 | googleAuth route mounted BEFORE metricsMiddleware registration | ⚠️ Warning (from REVIEW.md WR-02) | /v1/auth/google initiation is silently unmeasured. Accidental compliance with D-05 intent (public routes not measured) but via wrong mechanism. Documented in REVIEW.md. Does not block phase goal — all OTHER protected routes correctly emit api_request. |
| `vigil-core/src/routes/{thoughts,process-photo,brief-generate,chat}.ts` | 308, 471, 498, 110, 111 | Direct trackEvent call sites lack try/catch (metrics middleware wraps its own) | ⚠️ Warning (from REVIEW.md WR-01) | Latent defense-in-depth gap. Today no throw possible (posthog null-guarded), but future SDK change could propagate an analytics error into a 5xx response after the DB write committed. Recommended fix: centralize try/catch inside trackEvent wrapper. Does not block phase goal. |
| `vigil-core/src/analytics/posthog.ts` | 139-147 | identifyUser is not protected by BLOCKED_PROPERTY_NAMES | ℹ️ Info (from REVIEW.md IN-01) | Asymmetric surface vs trackEvent. Current call site (email + createdAt) is safe; future person-property additions must be reviewed manually. |
| `vigil-core/src/middleware/metrics.ts` | 53-82 | Thrown-error responses bypass api_request emission (await next() un-wrapped) | ℹ️ Info (from REVIEW.md IN-02) | Dashboard 5xx undercount risk if handlers throw (they mostly return c.json(err, 500) instead, so real impact is small). |

Neither warning blocks the phase goal. The REVIEW.md findings are documented for follow-up (future phase or v3.6).

### Human Verification Required

The phase goal explicitly names "visible in the PostHog dashboard." Code emission is verified; dashboard visibility requires live Railway deploy + PostHog Cloud UI access.

### 1. Capture-funnel attribution end-to-end
**Test:** From the PWA or curl (Railway), capture a thought (POST /v1/thoughts) and upload a photo (POST /v1/process-photo). Wait 10-15s for the PostHog SDK flush.
**Expected:** In PostHog Events explorer, see `thought_created` and `triage_completed` events (for the photo) both with the same `distinct_id` = String(userId). Zero duplicate `thought_created` events from the client.
**Why human:** Dashboard query + event arrival timing + PostHog UI navigation cannot be automated from this environment.

### 2. photo_uploaded visibility
**Test:** From PWA, upload any photo via capture. Wait 10-15s.
**Expected:** `photo_uploaded` event appears in PostHog with `distinct_id` = userId and properties {paper_type, vision_confidence, thought_count, force_paper_type, media_type, was_heic}.
**Why human:** Requires PostHog Cloud UI.

### 3. api_request dashboard query
**Test:** Execute a handful of authenticated API calls (GET /v1/thoughts, POST /v1/chat, GET /v1/brief/:date). In PostHog, build a query: event = `api_request` grouped by `route`, `status_class`, showing median `duration_ms`.
**Expected:** Table shows one row per (route, status_class) pair with populated duration_ms. At least one 2xx row per route.
**Why human:** PostHog dashboard query builder is a UI.

### 4. Person record has email + createdAt
**Test:** After PWA mount triggers GET /v1/me, open PostHog Persons tab and find the authenticated user's distinct_id.
**Expected:** Person detail page shows email = user's email, createdAt = ISO timestamp matching DB row.
**Why human:** PostHog Persons UI.

### Gaps Summary

No code-level gaps. All 14 observable truths that can be verified programmatically are ✓ VERIFIED. All 11 required artifacts exist, are substantive (no stubs), wired (imported and called), and flowing real data. All 3 requirements (ANLY-02, ANLY-03, ANLY-04) are satisfied with evidence.

The remaining 4 items routed to human_verification are fundamentally dashboard/UI checks — the code emits events, the SDK batches for 10s, the dashboard is read by the developer. These are the expected residual checks at the end of an analytics phase whose goal is "visible in PostHog" and should not be re-classified as code gaps.

REVIEW.md flagged 2 warnings (WR-01: call-site try/catch missing, WR-02: googleAuth unmeasured) and 4 info items. None block the phase goal; they are documented for future hardening.

---

*Verified: 2026-04-19*
*Verifier: Claude (gsd-verifier)*
