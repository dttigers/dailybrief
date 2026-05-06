# Phase 105: Product Events, API Metrics & User Identity - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire `trackEvent()` (Phase 103 wrapper) into the capture funnel, ship per-route API metrics middleware, and set PostHog person properties on identify so the capture funnel + API error rates + user identity are visible in PostHog. All event call sites are server-side except the existing PWA `identifyUser`. No new analytics infrastructure — uses Phase 103's `vigil-core/src/analytics/posthog.ts` wrappers.

**Closes requirements:** ANLY-02 (product events), ANLY-03 (API metrics), ANLY-04 (user identity on login).

**Out of scope:** PostHog dashboard creation (data lands; dashboards are manual setup), client-side product events, feature flags, event versioning. Per-user scheduler fan-out remains deferred to v3.6.

</domain>

<decisions>
## Implementation Decisions

### Allowlist enforcement (no user-generated strings rule)
- **D-01:** Runtime guard inside `trackEvent()` rejects any property whose name is in `BLOCKED_PROPERTY_NAMES`. Property is dropped silently from the emitted event. Type signature stays `Record<string, string | number | boolean | null | undefined>` — types narrow what's *intended* to land, runtime check enforces what *can* land.
- **D-02:** When a property is dropped, also emit a meta-event `posthog_property_blocked` with `{ event_name, property_name }` so leak attempts surface in PostHog itself. The original event still emits with the rest of its properties intact (drop-the-bad-property, not drop-the-event).
- **D-03:** `trackEvent(userId, event, properties)` signature stays unchanged. The runtime check is a one-liner inside the wrapper. Zero call-site churn for Phase 103's existing `trackEvent` usage; new call sites get the enforcement for free.
- **D-04:** Denylist lives as a module constant in `vigil-core/src/analytics/posthog.ts`: `const BLOCKED_PROPERTY_NAMES = new Set<string>(['content', 'body', 'text', 'message', 'description', 'title', 'note', 'transcript'])`. Exported for tests. Same shape as Phase 103 `SENSITIVE_ROUTES`. Easy to grep, easy to extend.

### API metrics middleware (ANLY-03)
- **D-05:** Single global Hono middleware registered **after** `bearerAuth` in `vigil-core/src/index.ts`. Captures every authenticated request. Skips public routes (`/v1/healthz`, `/v1/auth/*`) by virtue of running after auth. Unauthenticated 401s are intentionally **not** measured — no userId, no person attribution.
- **D-06:** **100%** sampling. Every authenticated request emits one `api_request` event. PostHog SDK already batches via `flushAt: 20 / flushInterval: 10s` (Phase 103 SDK defaults), so throughput is cheap at current traffic. Revisit only when daily request count crosses ~10k.
- **D-07:** Latency measured via `const start = performance.now(); await next(); const duration_ms = performance.now() - start` inside the middleware. No new deps, no `process.hrtime` precision overkill. `await next()` ensures we time the full downstream stack (route handler + lower middleware).
- **D-08:** **Single event name** `api_request` with properties: `{ route, method, status, duration_ms, status_class }` where `status_class` is `'2xx' | '3xx' | '4xx' | '5xx'`. Matches ROADMAP SC#3 verbatim ("per-route API metrics — status code, latency, route name"). Single dashboard query; PostHog property filters split success/error views.

### Person properties (ANLY-04)
- **D-09:** `posthog.identify(userId)` sets person properties: **email + createdAt** (both already on the `users` row from Phase 102). Email enables PostHog person search; createdAt enables cohort analysis. No additional PII beyond the database.
- **D-10:** Server-side identify happens inside the **`/v1/me` route handler** — every successful response calls `posthog.identify(userId, { email, createdAt })`. PWA hits `/v1/me` on mount per Phase 104 D-15, so every app load re-identifies. One source of truth on the server. PWA's `identifyUser(userId, email)` (Phase 104 D-12) stays as-is for fast client-side identification — server is canonical, client is fast.
- **D-11:** vk_ legacy clients (Mac app, CLI) follow Phase 103 D-17 — they map to the seed user on `/v1/me`. Same identify call fires; seed user gets all Mac app + CLI events attributed correctly. No separate code path. Unified user view from Phase 102 is preserved.

### Client vs server event split (ANLY-02)
- **D-12:** **`brief_generated`** emits server-side from the `POST /v1/brief/generate` route handler on every successful response. Properties: `{ source: 'manual' | 'scheduled', date, brief_id, sectionsCount }`. Catches PWA-triggered generation, scheduler-triggered generation, and Mac CLI generation in one place. No client double-counting.
- **D-13:** Scheduler-emitted events (brief cron, generate-scheduler, gmail-workorders) attribute to the **owner user** — currently the seed user, since schedulers are seed-user-scoped (Phase 102 carry-forward). When per-user scheduler fan-out lands in v3.6, each user gets their own attributed events without code changes. No synthetic 'system' distinctId.
- **D-14:** **`chat_sent`** emits server-side from the `POST /v1/chat` handler **after** Claude returns successfully. Properties: `{ conversation_length, model, response_status }`. Failed sends are captured via `captureException` already; the `chat_sent` event name reflects that the message actually completed. PWA stays out of the chat-event business.
- **D-15:** **`thought_created`** always emits when a thought row is inserted; **`triage_completed`** emits only on triage success. Per Phase 103 D-07, triage failure returns 201 with null category and the row stays — `thought_created` fires (the thought was created), `triage_completed` does not. Failed triage already lands in PostHog as an exception. Matches ROADMAP SC#1 wording ("after capturing AND completing triage" — no completion = no completion event).

### Claude's Discretion
- Exact property names for `api_request` event (e.g., `duration_ms` vs `latency_ms`) — pick one and document in the wrapper.
- Precise `posthog_property_blocked` event property names beyond `{ event_name, property_name }` (e.g., add `caller` from stack trace) — only if cheap.
- Whether `posthog.identify()` uses `$set` vs `$set_once` semantics for `createdAt` — `$set_once` is the PostHog idiom for immutable fields, but `$set` is harmless since the value never actually changes.
- Whether to short-circuit the identify call when properties haven't changed since last call (cache check) — micro-optimization, only if it shows up in profiling.
- Test coverage strategy — unit tests against the trackEvent wrapper (mocked PostHog client) are sufficient; no E2E PostHog integration needed. Reuse Phase 103 test patterns.
- Whether the API metrics middleware should also tag a `$current_url` equivalent (e.g., `c.req.url` query params stripped) — useful for routes with path params like `/v1/brief/:date`, but `route` already covers the pattern. Skip unless trivial.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 103 inputs (server analytics scaffolding)
- `vigil-core/src/analytics/posthog.ts` — existing `trackEvent` / `captureException` / `redactEvent` / `shutdownPosthog` wrappers. Phase 105 extends `trackEvent` with the property-name guard from D-01..D-04.
- `vigil-core/src/analytics/posthog.test.ts` — existing test patterns for wrapper behavior. Reuse the dynamic-import + `delete process.env["POSTHOG_API_KEY"]` pattern for new tests.
- `vigil-core/src/index.ts` §`app.use` ordering — the metrics middleware (D-05) registers AFTER `bearerAuth` and BEFORE route mounting.
- `.planning/phases/103-capture-repair-server-observability-foundations/103-CONTEXT.md` D-10..D-15 — locked PostHog posture (key-absence gate, redaction, exception autocapture, shutdown). Phase 105 must not regress these.

### Phase 104 inputs (browser analytics already wired)
- `vigil-pwa/src/analytics/posthog.ts` — `posthog`, `captureException`, `identifyUser(userId, email)` exports. Phase 105 adds NO new PWA exports — the existing `identifyUser` covers ANLY-04's PWA half.
- `.planning/phases/104-pwa-auth-ui-browser-observability/104-CONTEXT.md` D-12..D-19 — locked PWA posthog posture (`capture_pageview: false`, key-absence gate, identify-on-auth-success and on-mount). Phase 105 server identify (D-10) stacks on top of these, not replaces.
- `vigil-pwa/src/App.tsx` — existing `handleAuthSuccess` and mount `useEffect` already call `identifyUser`. Phase 105 server-side `identify` runs inside `/v1/me` so the PWA's existing call is doubly-covered (last-write-wins, no race because both pass the same userId/email).

### Existing route call sites (Phase 105 wiring targets)
- `vigil-core/src/routes/thoughts.ts` — POST handler is where `thought_created` (D-15) emits.
- `vigil-core/src/routes/process-photo.ts` — synchronous-triage commit path (Phase 103 D-05/D-06) is where `triage_completed` (D-15) emits per successful triage. `photo_uploaded` emits at request entry on every successful POST.
- `vigil-core/src/routes/brief-generate.ts` — `brief_generated` (D-12) emits on successful response.
- `vigil-core/src/routes/chat.ts` — `chat_sent` (D-14) emits after Claude returns successfully.
- `vigil-core/src/routes/me.ts` — `posthog.identify(userId, { email, createdAt })` (D-10) fires on every successful response.

### Phase 102/103 backcompat
- `vigil-core/src/middleware/auth.ts` — `bearerAuth` three-path dispatcher (JWT, vk_, legacy). The metrics middleware sees `c.var.userId` populated for both JWT and vk_ paths (vk_ → seed user per Phase 103 D-17).

### PostHog Node SDK reference
- `posthog-node@^5.29.2` — version pinned in Phase 103. `posthog.identify(distinctId, properties)` and `posthog.capture({ distinctId, event, properties })` are the only SDK surfaces used.
- `enableExceptionAutocapture: true` (already on per Phase 103 D-13) — Phase 105 does NOT add additional exception capture; failed `posthog_property_blocked` writes don't need to land in autocapture.

### ROADMAP source of truth
- `.planning/ROADMAP.md` §"Phase 105" lines 304-313 — phase goal + 4 success criteria. SC#4 (no user-generated strings) is enforced by D-01..D-04. SC#1 (no double-counting) is enforced by D-12..D-15.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`vigil-core/src/analytics/posthog.ts`** — `trackEvent`, `captureException`, `redactEvent`, `shutdownPosthog` already shipped (Phase 103). Phase 105 only EXTENDS `trackEvent` with the property-name guard; does not introduce a new module.
- **`vigil-core/src/middleware/`** — `auth.ts` and `rate-limit.ts` already exist with the same Hono middleware shape. New `metrics.ts` follows the same export-default-handler pattern.
- **`vigil-pwa/src/analytics/posthog.ts`** — `identifyUser` already implemented (Phase 104 D-15). PWA half of ANLY-04 is already done; Phase 105 adds the server-side counterpart inside `/v1/me`.
- **`bearerAuth` middleware** — sets `c.var.userId` for both JWT and vk_ paths. The metrics middleware reads `c.var.userId` directly; no auth-method branching needed.

### Established Patterns
- **Wrapper-only call sites** (Phase 103 D-14): no route file imports `posthog` directly. Phase 105 maintains this — every new emission goes through `trackEvent`.
- **Module-constant safety lists** (Phase 103 `SENSITIVE_ROUTES`): D-04 follows this pattern with `BLOCKED_PROPERTY_NAMES`. Easy to grep, easy to extend.
- **Key-absence gates** (Phase 103 D-10, Phase 104 D-13): null-guard in wrapper means missing `POSTHOG_API_KEY` makes everything silently no-op. The new metrics middleware respects this — `trackEvent` already guards.
- **Hono middleware ordering** (`vigil-core/src/index.ts`): `cors → secureHeaders → timeout → bearerAuth → routes`. Metrics inserts between `bearerAuth` and route mounting.
- **Test patterns** (Phase 103 `posthog.test.ts`): dynamic-import + env manipulation, no real network. Phase 105 reuses for D-01 guard tests and D-05 middleware tests.

### Integration Points
- `vigil-core/src/index.ts` — register `metricsMiddleware` after `bearerAuth`, before `app.route(...)` calls.
- `vigil-core/src/routes/me.ts` — add `posthog.identify(userId, { email, createdAt })` call before returning the response.
- `vigil-core/src/routes/{thoughts,process-photo,brief-generate,chat}.ts` — add `trackEvent(userId, eventName, props)` calls at the success points called out in D-12..D-15.
- `vigil-core/src/analytics/posthog.ts` — extend `trackEvent` body with the property-name guard (D-01..D-04). Add `BLOCKED_PROPERTY_NAMES` constant.

</code_context>

<specifics>
## Specific Ideas

- "Drop the bad property, keep emitting the event" (D-02) is the safer default than "drop the whole event" — losing analytics signal for a non-content property leak would be self-defeating.
- `posthog_property_blocked` meta-event (D-02) doubles as a "did we leak content?" canary in PostHog itself. If it ever fires, that's a code review failure to grep on.
- Single `api_request` event (D-08) keeps PostHog dashboard queries simple — `WHERE event = 'api_request' AND status_class = '5xx'` is one filter, not three event names.
- Server-side identify on `/v1/me` (D-10) is the lowest-friction way to keep PostHog person properties fresh without per-route code.
- vk_ → seed user mapping (D-11) leans on existing Phase 103 wiring — no new code path for the Mac app or CLI to attribute events.

</specifics>

<deferred>
## Deferred Ideas

- **PostHog dashboard creation / saved queries** — the success criteria say data must be "visible in a dashboard query," not that we must build the dashboards. Build dashboards manually after Phase 105 lands and real data exists. Not a code phase.
- **Client-side product events** — `chat_attempted`, `brief_viewed`, `auth_form_submitted`, etc. Out of v3.5 scope. Could be Phase 107+ if engagement funnels become a priority.
- **Feature flags via PostHog** — PostHog supports remote-config flags; we could gate experimental features. Defer until there's a concrete experiment to run.
- **Event versioning** — schema migrations for events as they evolve (`thought_created_v2`). Premature for an analytics layer that's never shipped events. Revisit when an event property has to change incompatibly.
- **Session recording / heatmaps** — PostHog product, but PII-heavy and out of scope for v3.5.
- **Per-user scheduler fan-out** — already deferred to v3.6 (PROJECT.md). When it lands, scheduler events from D-13 will attribute to each user automatically.
- **Sampling controls via env var** — `POSTHOG_METRICS_SAMPLE_RATE` (D-06 alternative). Defer until traffic justifies it.

### Reviewed Todos (not folded)
None — no pending todos matched Phase 105 in `gsd-tools todo match-phase 105`.

</deferred>

---

*Phase: 105-product-events-api-metrics-user-identity*
*Context gathered: 2026-04-19*
