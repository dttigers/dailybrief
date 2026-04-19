# Phase 105: Product Events, API Metrics & User Identity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 105-product-events-api-metrics-user-identity
**Areas discussed:** Allowlist enforcement, API metrics middleware, Person properties, Client vs server event split

---

## Allowlist enforcement

### Q1: How should the 'no user-generated strings in event properties' rule be enforced?

| Option | Description | Selected |
|--------|-------------|----------|
| Runtime guard + type narrowing | trackEvent stays Record<string, primitive> but a runtime check inside trackEvent rejects any property whose name is in a denylist. Drops the property silently, captures `posthog_property_blocked` meta-event. Can't be bypassed. | ✓ |
| Types-only, no runtime guard | Stricter TypeScript type only. Compile-time, nothing stops `(props as any).content = body`. | |
| Explicit allowlist per event | Each event name has a registered schema. Strictest, most code, self-documenting. | |
| Code review only | No mechanism in trackEvent. Rely on /gsd-code-review grep. Cheapest but post-hoc. | |

**User's choice:** Runtime guard + type narrowing (Recommended)

### Q2: When a property IS dropped/rejected, what happens?

| Option | Description | Selected |
|--------|-------------|----------|
| Silent drop + capture telemetry event | Drop bad property, emit event with the rest, capture meta-event `posthog_property_blocked` for visibility. | ✓ |
| Silent drop only | Drop bad property, emit event with the rest. No telemetry. | |
| Drop entire event | If any property is bad, drop the whole event. | |
| Throw in dev, drop in prod | NODE_ENV check. Loud in dev, silent in prod. | |

**User's choice:** Silent drop + capture telemetry event (Recommended)

### Q3: Should the existing trackEvent() signature change to enforce this?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep current signature, add runtime check | trackEvent(userId, event, properties) unchanged. One-liner check inside wrapper. Zero call-site churn. | ✓ |
| Add a new typed wrapper per event | Generate trackThoughtCreated, trackPhotoUploaded, etc. Compile-time enforcement. More code. | |
| Keep signature, no runtime check | Don't touch trackEvent. Rely on linting. | |

**User's choice:** Keep current signature, add runtime check (Recommended)

### Q4: Where does the property denylist live?

| Option | Description | Selected |
|--------|-------------|----------|
| Module constant in posthog.ts | `const BLOCKED_PROPERTY_NAMES = new Set(...)` exported for tests. Same pattern as Phase 103 SENSITIVE_ROUTES. | ✓ |
| Config file | Live in .planning/config.json or sibling JSON. Non-engineers can extend. | |
| Encoded in event schema | Implicit denylist; only viable if Q1 = explicit allowlist. | |

**User's choice:** Module constant in posthog.ts (Recommended)

---

## API metrics middleware

### Q1: Where does the API metrics middleware mount?

| Option | Description | Selected |
|--------|-------------|----------|
| Global, after auth | Single middleware after bearerAuth. Captures every authenticated request. Skips public routes. | ✓ |
| Global, before auth | Captures every request including unauthenticated. Anonymous distinctId. | |
| Per-route wrapping | Decorator-like wrapper per-route. Surgical but easy to forget on new routes. | |

**User's choice:** Global, after auth (Recommended)

### Q2: Sampling rate for API metrics?

| Option | Description | Selected |
|--------|-------------|----------|
| 100% | Every request emits one event. flushAt: 20 / flushInterval: 10s batches. Fine at current traffic. | ✓ |
| 100% errors, 10% successes | Always emit on >=400; sample 2xx/3xx. Skews dashboards. | |
| Configurable via env var | POSTHOG_METRICS_SAMPLE_RATE. Future-proofing tax. | |

**User's choice:** 100% (Recommended)

### Q3: How is latency measured?

| Option | Description | Selected |
|--------|-------------|----------|
| Hono middleware timing: performance.now() before/after next() | Middleware-local. Includes downstream stack. No new deps. | ✓ |
| process.hrtime.bigint() | Nanosecond precision. Overkill for HTTP. | |
| Use existing logger or telemetry framework | Defer to whatever observability plugin we adopt later. | |

**User's choice:** Hono timing in middleware (Recommended)

### Q4: Event shape — one event type for all requests, or split?

| Option | Description | Selected |
|--------|-------------|----------|
| Single 'api_request' event | { route, method, status, duration_ms, status_class }. Matches ROADMAP SC#3 verbatim. | ✓ |
| Split 'api_request_success' and 'api_request_error' | Two event types. Doubles schema. | |
| Per-status-code event | 'api_2xx', 'api_4xx', 'api_5xx'. Cardinality explosion. | |

**User's choice:** Single 'api_request' event (Recommended)

---

## Person properties

### Q1: What person properties are set on posthog.identify()?

| Option | Description | Selected |
|--------|-------------|----------|
| Email + createdAt only | Email enables PostHog person search; createdAt enables cohort analysis. Both already on users row. | ✓ |
| Email only | Bare minimum. Matches Phase 104 PWA. Can't slice cohorts later. | |
| Email + createdAt + lastLoginAt + isClaimedSeed | Richer cohorts but more writes; bleeds Phase 102 detail. | |
| Email + $set_once createdAt, $set lastLoginAt | PostHog idiom: $set_once writes only on first identify. More nuance. | |

**User's choice:** Email + createdAt only (Recommended)

### Q2: Where does identify get called?

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side from /v1/me | Every successful /v1/me triggers identify. PWA hits /v1/me on mount; one source of truth. | ✓ |
| Server-side from /v1/auth/login + /v1/auth/register only | Identify on auth events only. Returning sessions don't re-identify. | |
| Client-side only (PWA's identifyUser) | Mac app and CLI never identify. | |
| Both client AND server | Belt + suspenders. Possible double-write race. | |

**User's choice:** Server-side from /v1/me (Recommended)

### Q3: How to handle vk_ legacy clients (Mac app)?

| Option | Description | Selected |
|--------|-------------|----------|
| Identify as the seed user on /v1/me | Phase 103 D-17 already maps vk_ → seed user. No separate path. Unified-user view preserved. | ✓ |
| Skip identify for vk_ requests | Only identify when JWT present. Seed user has no email in PostHog. | |
| Identify with synthetic 'mac_app_legacy' identifier | Treat vk_ as distinct person. Loses Phase 102 unified-user view. | |

**User's choice:** Identify as the seed user on /v1/me (Recommended)

---

## Client vs server event split

### Q1: Where does brief_generated emit?

| Option | Description | Selected |
|--------|-------------|----------|
| Server (brief-generate route) | Fires on every successful POST /v1/brief/generate. Catches PWA, scheduler, Mac CLI. | ✓ |
| Client (PWA brief view onMount) | Catches engagement only. Misses scheduler-generated briefs. | |
| Both: server 'brief_generated', client 'brief_viewed' | Two semantically distinct events. Client out of scope. | |

**User's choice:** Server (brief-generate route handler) (Recommended)

### Q2: Scheduler-attributed events — which userId?

| Option | Description | Selected |
|--------|-------------|----------|
| The owner user (current schedulers seed-user-scoped) | Distinct id = seed user. When per-user fan-out lands in v3.6, each user gets their own events. | ✓ |
| Synthetic 'system' distinctId | Separates user-driven from automated. Loses 'how many briefs auto-generated' query. | |
| Skip scheduler events entirely for v3.5 | Only user-initiated. Loses scheduler signal. | |

**User's choice:** The owner user (Recommended)

### Q3: chat_sent — server, client, or both?

| Option | Description | Selected |
|--------|-------------|----------|
| Server (POST /v1/chat handler) | Emits after Claude returns successfully. No client double-counting. | ✓ |
| Client (PWA chat submit) | Captures intent. Counts failed sends too. | |
| Both with different names | Funnel analysis: chat_attempted client, chat_completed server. Overkill for v3.5. | |

**User's choice:** Server (Recommended)

### Q4: Are events emitted from inside captured-but-failed paths?

| Option | Description | Selected |
|--------|-------------|----------|
| Emit thought_created always; triage_completed only on success | Per Phase 103 D-07. Failed triage is captured via captureException. Matches ROADMAP SC#1 wording. | ✓ |
| Emit both with triage_completed.success = false | Event name lies. Adds boolean to every dashboard query. | |
| Add a third event 'triage_failed' | Cleaner semantics but redundant — already captured as exception. | |

**User's choice:** Emit thought_created always; triage_completed only on success (Recommended)

---

## Claude's Discretion

- Exact property names for `api_request` event (e.g., `duration_ms` vs `latency_ms`)
- Precise `posthog_property_blocked` event property names beyond `{ event_name, property_name }`
- `$set` vs `$set_once` semantics for `createdAt` on identify
- Whether to short-circuit identify when properties haven't changed (cache check)
- Test coverage strategy — unit tests against trackEvent wrapper sufficient
- Whether API metrics middleware tags `$current_url` equivalent

## Deferred Ideas

- PostHog dashboard creation / saved queries — manual setup after Phase 105 lands
- Client-side product events (chat_attempted, brief_viewed, auth_form_submitted) — Phase 107+
- Feature flags via PostHog — defer until concrete experiment exists
- Event versioning (`thought_created_v2`) — premature
- Session recording / heatmaps — PII-heavy, out of v3.5 scope
- Per-user scheduler fan-out — already deferred to v3.6
- Sampling controls via env var — defer until traffic justifies it
