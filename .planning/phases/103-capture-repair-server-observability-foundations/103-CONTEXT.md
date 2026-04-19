# Phase 103: Capture Repair & Server Observability Foundations - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Server-side foundations only: fix the two `vigil-core` photo capture defects (CAP-01 HEIC rejection, CAP-02 missing triage in commit path), stand up the PostHog Node SDK with error autocapture + graceful shutdown, and ship `GET /v1/me`. All client-side analytics, PWA auth UI, and product events are Phase 104+.

</domain>

<decisions>
## Implementation Decisions

### CAP-01 HEIC fix location
- **D-01:** HEIC → JPEG conversion lives **server-side** via `sharp` on `POST /v1/process-photo`. Add `image/heic` + `image/heif` to `VALID_MEDIA_TYPES`; convert to JPEG before the Claude vision call. One fix covers every client (Mac folder watcher, future browser drops, any other surface).
- **D-02:** Mac-side CoreGraphics conversion is **not re-added** in this phase. Existing `APIImageDescriptionService.swift` behavior stays as-is — server becomes the canonical conversion point.
- **D-03:** iCloud placeholder / non-downloaded HEIC behavior stays **log + skip** (current `FolderWatcherService.swift` iCloud guards). No menu-bar error badge change, no retry loop — the existing guards are working correctly per research.
- **D-04:** HEIC files that exceed the 5 MB base64 cap still **reject with 413** (existing guard). No server-side downscaling — `sharp` converts HEIC to JPEG, which typically shrinks; genuinely oversize photos are a caller problem.

### CAP-02 triage contract
- **D-05:** `POST /v1/process-photo` commit path is **synchronous triage** — the response body contains each thought with its `category` already populated. Matches the success criterion verbatim; 30s request timeout stays in place.
- **D-06:** Triage runs **per-thought in parallel** via `Promise.all` when the photo produces N > 1 thoughts (lined paper). Latency is bounded by the slowest triage call, not the sum. Each thought gets its own category.
- **D-07:** On triage failure (Claude 5xx, timeout, etc.) **return 201 with null `category`**. Rows stay in the DB — never lose the user's capture. Client can manually re-triage via the existing UI. Error captured to PostHog; not user-facing.
- **D-08:** `POST /v1/thoughts` fire-and-forget triage **stays unchanged**. Only `/process-photo` gains sync triage. Scope-tight; protects quick-capture latency from Mac menubar + PWA.
- **D-09:** A **diagnostic curl** against the live Railway endpoint must run and be recorded in a plan artifact BEFORE any fix code is written (locked in STATE.md; echoed here so the planner doesn't forget).

### PostHog safety posture
- **D-10:** Local-dev gate = **key-absence** (no-op shim when `POSTHOG_API_KEY` is unset). `vigil-core/src/analytics/posthog.ts` exports a shim that returns silently if the key is missing. Dev `.env` does not set the key; Railway production env does. No `NODE_ENV` coupling.
- **D-11:** **One production-only PostHog project + API key** for v3.5. Stored in Railway env. No separate dev project. Dev verification of `capture()` calls happens via unit tests against the shim, not by writing to a real PostHog project.
- **D-12:** **Exception autocapture redaction** via posthog-node `before_send` hook. Strip `request.body` from events on the sensitive-route allowlist: `/v1/chat`, `/v1/process-photo`, `/v1/process-audio`, `/v1/thoughts`, `/v1/therapy`, `/v1/insights`. Keep route, method, status code, user id, and stack trace. Redaction lives inside the singleton — impossible to bypass.
- **D-13:** **Global error handler = `app.onError` in `vigil-core/src/index.ts`** (after all `app.route` calls). Logs locally, calls `captureException(userId, err, { route, method })`, returns `{ error: 'Internal server error' }` 500. Single chokepoint. `enableExceptionAutocapture: true` on the PostHog client covers `uncaughtException` / `unhandledRejection` outside the request cycle — no duplicate `process.on` wiring.
- **D-14:** `trackEvent()` / `captureException()` wrapper (from `analytics/posthog.ts`) is the **only** public API. No direct `posthog.capture()` at call sites. Wrapper enforces null-guard + allowlist (locked in STATE.md).
- **D-15:** `await posthog?.shutdown()` added to the existing SIGTERM and SIGINT handlers at SDK-init time (same PR, never later). Without it, Railway deploys lose the final event buffer.

### /v1/me response shape
- **D-16:** Response body is **minimal**: `{ userId: string, email: string }`. Matches the success criterion literally. Phase 104 only needs these two fields for `posthog.identify()` + header display. Extending later is non-breaking.
- **D-17:** Endpoint accepts **both JWT and legacy `vk_` keys** via the existing `bearerAuth` three-path dispatcher. JWT → look up user row by `userId` claim. `vk_` → return the seed user (matches Phase 102 seed-user backcompat). Every existing client can call it on day one.
- **D-18:** Missing user (valid JWT but user row deleted) → **401** `{ error: 'invalid_user' }`. Treat as expired auth; PWA triggers re-auth flow. Not 404, not 500.

### Claude's Discretion
- Exact sharp conversion params (quality level, output format specifics) — pick a sensible default that doesn't regress Claude OCR.
- posthog-node `flushAt`, `flushInterval`, and `captureMode` tuning — use reasonable defaults; revisit in Phase 105 with real traffic.
- `/v1/me` route file location (`routes/me.ts` vs folding into `routes/auth.ts`) — planner's call.
- `before_send` hook implementation details (regex allowlist vs Set lookup, header blocklist contents).
- Test coverage strategy for the shim vs real-client paths — unit tests against the shim are fine; no E2E PostHog integration needed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 103 inputs
- `.planning/research/SUMMARY.md` — v3.5 research synthesis; root causes confirmed for CAP-01, CAP-02, PostHog singleton placement, JWT storage. Sections most relevant: "Recommended Stack" (posthog-node version pin), "Critical Pitfalls" #1, #2, #3, #4.
- `.planning/research/ARCHITECTURE.md` — File-by-file fix locations; read before editing `process-photo.ts` or `index.ts`.
- `.planning/research/PITFALLS.md` — Dev-event flooding, singleton leak, shutdown hook — all must be mitigated at init time.
- `.planning/research/STACK.md` — posthog-node@^5.29.2 pin, sharp version.
- `.planning/REQUIREMENTS.md` §Capture Repair + §Analytics & Observability + §Authentication UI (AUTH-08 only) — authoritative requirement text.
- `.planning/ROADMAP.md` §Phase 103 — success criteria 1-5 (every one has a literal verification step).

### Server analytics (new)
- `posthog.com/docs/error-tracking/installation/node` — `enableExceptionAutocapture: true`, `captureException()` shape, `before_send` hook (per research SUMMARY §Primary).
- `posthog.com/tutorials/multiple-environments` — API-key-per-env guidance (research SUMMARY §Secondary).

### CAP-01 / CAP-02 context
- `vigil-core/src/routes/process-photo.ts` — CAP-01 + CAP-02 fix target. Current file already has the 5 MB guard, dep-injection surface, and `processClaudeResponse` helper — extend, don't rewrite.
- `vigil-core/src/routes/thoughts.ts` §318-341 — existing fire-and-forget auto-triage pattern (for reference only; D-08 says DO NOT change this path).
- `vigil-core/src/routes/process-audio.ts` §153-173 — existing fire-and-forget triage pattern (reference for what NOT to copy; D-05 says sync for /process-photo).
- `Sources/DailyBriefMonitor/FolderWatcherService.swift` — iCloud guards (D-03 says these stay unchanged).

### Auth / /v1/me
- `vigil-core/src/middleware/auth.ts` — existing `bearerAuth` three-path dispatcher (D-17 reuses this).
- `vigil-core/src/routes/auth.ts` — Phase 102 register/login; JWT claims shape (needed to resolve userId for /v1/me).
- `vigil-core/src/db/schema.ts` — `users` table columns (userId, email).

### Project / milestone policy
- `.planning/PROJECT.md` §Key Decisions — no PostHog self-hosting, privacy-first posture drives D-12.
- `.planning/STATE.md` §Accumulated Context — v3.5 locked decisions (echoed in this file to keep planner honest).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`processClaudeResponse` + `applyForcePaperType`** (`vigil-core/src/routes/process-photo.ts`) — pure helpers, no I/O. Sync triage call goes AFTER these, BEFORE the DB insert batch.
- **`createProcessPhotoRouter(deps)`** dep-injection surface — add a `triageFn` dep so tests can pass a fake; production default wires to the existing triage service.
- **`bearerAuth` three-path dispatcher** (`vigil-core/src/middleware/auth.ts`) — supports vk_ / JWT / legacy. `/v1/me` reuses this; no new auth code needed.
- **SIGTERM / SIGINT handlers** (`vigil-core/src/index.ts` lines 177-191) — already stop the generate-scheduler + gmail-workorders + close DB. Add `await posthog?.shutdown()` as the first await in each.
- **Existing `/v1/triage` route** (`vigil-core/src/routes/triage.ts`) — callable internally for the sync triage path; alternatively extract a `triageThought(userId, content)` helper if the current route handler is HTTP-coupled.
- **`VALID_MEDIA_TYPES` const** (`vigil-core/src/routes/process-photo.ts` line 9) — extend with `image/heic`, `image/heif`; downstream validation flow unchanged.
- **`trackEvent()` null-guard wrapper pattern** (locked in STATE.md, file doesn't yet exist) — Phase 103 creates this in `vigil-core/src/analytics/posthog.ts` as a new module.

### Established Patterns
- **Hono route mounting via `app.route("/v1", X)`** — `/v1/me` follows the same convention in `index.ts`.
- **Dep-injection via factory + default singleton** — `createProcessPhotoRouter` already does this; the PostHog singleton + triage helper should follow suit for testability.
- **`console.error` + generic 4xx/5xx JSON** — used throughout `process-photo.ts`; D-13 preserves this pattern with PostHog capture layered on.
- **`c.get("userId")` from `ContextVariableMap`** — set by `bearerAuth`, available in every protected route. `/v1/me` uses this directly.
- **Null-guarded optional services** — `getAIClient()` returns null when `ANTHROPIC_API_KEY` is unset; PostHog shim follows the same shape (null-guard in wrapper).

### Integration Points
- `vigil-core/src/index.ts` — new imports (`posthog.ts`, `me.ts`), new `app.route("/v1", me)`, new `app.onError(...)`, `posthog.shutdown()` added to existing signal handlers.
- `vigil-core/src/routes/process-photo.ts` — `VALID_MEDIA_TYPES` extension, sharp conversion step after mediaType validation, sync triage step after DB insert (steps 8.5 / 9.5 in the existing numbered flow).
- `vigil-core/src/analytics/posthog.ts` — NEW file. Exports `posthog` client (or null shim), `captureEvent(userId, event, props)`, `captureException(userId, err, context)`.
- `vigil-core/src/routes/me.ts` — NEW file. Single `GET /me` handler; looks up user by `c.get("userId")`; 401 on missing row.
- `package.json` — new deps: `posthog-node@^5.29.2`, `sharp` (pin via research recommendation).

</code_context>

<specifics>
## Specific Ideas

- Success criterion #5 ("Local `npm run dev` events do NOT appear in PostHog Cloud; Railway production events DO appear") — verify BOTH halves as a single test: run server locally, hit an endpoint, check PostHog Cloud shows nothing from the local session; then cold-start Railway, hit the same endpoint via production URL, confirm the event lands. Single atomic verification.
- Success criterion #2 ("verified via curl before any code is written") — the diagnostic curl lives in the Phase 103 plan as an explicit Task 0 artifact. Output captured, committed, referenced from VERIFICATION.md.
- "The `vk_`-auth path on /v1/me returns the seed user" — reuses the Phase 102 backcompat claim-flow. Planner should NOT invent new seed-user lookup logic; it already exists.
- PostHog redaction allowlist (`/v1/chat`, `/v1/process-photo`, `/v1/process-audio`, `/v1/thoughts`, `/v1/therapy`, `/v1/insights`) is NOT exhaustive — planner is responsible for spot-checking any route that accepts user-generated string content and adding it if missed.

</specifics>

<deferred>
## Deferred Ideas

- **Extended `/v1/me` fields** (createdAt, role, display name) — only add when a consumer needs them. Defer until Phase 104+ reveals the actual demand.
- **Dev-dedicated PostHog project** — if local-capture verification becomes painful, revisit. Not worth the setup overhead at solo-dev scale today.
- **Pre-downscale HEIC above 5 MB** — revisit only if real iPhone captures start hitting the 413 in practice. Paging on real failures beats speculative downscaling.
- **Menu-bar error badge for skipped non-iCloud HEIC** — Phase 61-style UX; small quality-of-life improvement but not tied to v3.5 goals. Add to backlog if the skip path actually fires for the user.
- **`/process-audio` sync triage parity** — current code is fire-and-forget. If audio captures start missing categories in daily use, revisit. Out of scope for Phase 103 (CAP-02 is photo-only).
- **`/thoughts` sync triage parity** — explicitly rejected (D-08). Menubar/PWA quick-capture latency trumps consistency.
- **Mac-side CoreGraphics HEIC restoration** — explicitly rejected (D-02). Server is now the canonical conversion point; Mac stays thin.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 103-capture-repair-server-observability-foundations*
*Context gathered: 2026-04-19*
