# Phase 103: Capture Repair & Server Observability Foundations - Research

**Researched:** 2026-04-19
**Domain:** Node/Hono server instrumentation — HEIC image conversion, synchronous server-side triage, PostHog Node SDK integration (error tracking + future product events), minimal new auth endpoint
**Confidence:** HIGH (root causes verified from live codebase and shipped SDK source; one locked decision — server-side HEIC via `sharp` — contradicted by verified npm source and flagged in Assumptions Log)

## Summary

Phase 103 is a server-only phase inside `vigil-core`. It resolves two shipped defects (CAP-01 HEIC rejection, CAP-02 missing triage on `/v1/process-photo` commit), stands up the PostHog Node SDK singleton with error autocapture + redaction + graceful shutdown, and adds a minimal `GET /v1/me`. All four success criteria are server-observable, so verification commands are straightforward curl + unit-test pairs.

The CONTEXT.md locked decisions are consistent with the v3.5 milestone research and the live codebase — with one exception. **D-01 locks HEIC conversion to `sharp`.** Verified against npm: `sharp`'s prebuilt libvips binaries do **not** include HEIC/HEIF decoders (patent-encumbered), so on Railway Linux `sharp` will throw on HEIC input unless a custom libvips is installed. This contradicts the "one fix covers every client" intent. The safe replacement is `heic-convert@2.1.0` — pure JS, no native deps, no Railway rebuild — used as a pre-step that hands JPEG buffers to the existing Claude path. Planner must decide between (a) adopting `heic-convert` (minimal risk, no Dockerfile changes) or (b) keeping `sharp` and adding a Railway `Dockerfile` with libvips+libheif (higher risk, longer cycle). This single question is the only research-driven deviation from CONTEXT.md.

All other locked decisions are verified and actionable: `before_send` hook exists in posthog-node v5.29.2 (snake_case, `BeforeSendFn = (event: EventMessage | null) => EventMessage | null`), `enableExceptionAutocapture: true` is the correct option, `captureException(error, distinctId, props?, uuid?)` is the signature, `shutdown()` returns `Promise<void>`. Existing `process-photo.ts` already exposes a `ProcessPhotoDeps` dep-injection surface — the planner should extend it with a `triageFn` dep rather than calling `/v1/triage` over HTTP. The JWT utility already embeds `email` in claims, so `/v1/me` can be answered from either the token or a one-row DB lookup (CONTEXT.md picks the DB lookup for consistency with `vk_` fallback).

**Primary recommendation:** Replace `sharp` with `heic-convert` for CAP-01 (pure JS, no Railway rebuild); extract a `triageThought(userId, content)` helper from the existing triage prompt and inject it into `createProcessPhotoRouter`; initialize posthog-node as a module-scope singleton in `index.ts` guarded by `POSTHOG_API_KEY` presence; wire `app.onError` AFTER all `app.route()` calls; add `await posthog?.shutdown()` as the first await in both existing signal handlers.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**CAP-01 HEIC fix location**
- **D-01:** HEIC → JPEG conversion lives **server-side** via `sharp` on `POST /v1/process-photo`. Add `image/heic` + `image/heif` to `VALID_MEDIA_TYPES`; convert to JPEG before the Claude vision call. One fix covers every client (Mac folder watcher, future browser drops, any other surface).
- **D-02:** Mac-side CoreGraphics conversion is **not re-added** in this phase. Existing `APIImageDescriptionService.swift` behavior stays as-is — server becomes the canonical conversion point.
- **D-03:** iCloud placeholder / non-downloaded HEIC behavior stays **log + skip** (current `FolderWatcherService.swift` iCloud guards). No menu-bar error badge change, no retry loop — the existing guards are working correctly per research.
- **D-04:** HEIC files that exceed the 5 MB base64 cap still **reject with 413** (existing guard). No server-side downscaling — `sharp` converts HEIC to JPEG, which typically shrinks; genuinely oversize photos are a caller problem.

**CAP-02 triage contract**
- **D-05:** `POST /v1/process-photo` commit path is **synchronous triage** — the response body contains each thought with its `category` already populated. Matches the success criterion verbatim; 30s request timeout stays in place.
- **D-06:** Triage runs **per-thought in parallel** via `Promise.all` when the photo produces N > 1 thoughts (lined paper). Latency is bounded by the slowest triage call, not the sum. Each thought gets its own category.
- **D-07:** On triage failure (Claude 5xx, timeout, etc.) **return 201 with null `category`**. Rows stay in the DB — never lose the user's capture. Client can manually re-triage via the existing UI. Error captured to PostHog; not user-facing.
- **D-08:** `POST /v1/thoughts` fire-and-forget triage **stays unchanged**. Only `/process-photo` gains sync triage. Scope-tight; protects quick-capture latency from Mac menubar + PWA.
- **D-09:** A **diagnostic curl** against the live Railway endpoint must run and be recorded in a plan artifact BEFORE any fix code is written (locked in STATE.md; echoed here so the planner doesn't forget).

**PostHog safety posture**
- **D-10:** Local-dev gate = **key-absence** (no-op shim when `POSTHOG_API_KEY` is unset). `vigil-core/src/analytics/posthog.ts` exports a shim that returns silently if the key is missing. Dev `.env` does not set the key; Railway production env does. No `NODE_ENV` coupling.
- **D-11:** **One production-only PostHog project + API key** for v3.5. Stored in Railway env. No separate dev project. Dev verification of `capture()` calls happens via unit tests against the shim, not by writing to a real PostHog project.
- **D-12:** **Exception autocapture redaction** via posthog-node `before_send` hook. Strip `request.body` from events on the sensitive-route allowlist: `/v1/chat`, `/v1/process-photo`, `/v1/process-audio`, `/v1/thoughts`, `/v1/therapy`, `/v1/insights`. Keep route, method, status code, user id, and stack trace. Redaction lives inside the singleton — impossible to bypass.
- **D-13:** **Global error handler = `app.onError` in `vigil-core/src/index.ts`** (after all `app.route` calls). Logs locally, calls `captureException(userId, err, { route, method })`, returns `{ error: 'Internal server error' }` 500. Single chokepoint. `enableExceptionAutocapture: true` on the PostHog client covers `uncaughtException` / `unhandledRejection` outside the request cycle — no duplicate `process.on` wiring.
- **D-14:** `trackEvent()` / `captureException()` wrapper (from `analytics/posthog.ts`) is the **only** public API. No direct `posthog.capture()` at call sites. Wrapper enforces null-guard + allowlist (locked in STATE.md).
- **D-15:** `await posthog?.shutdown()` added to the existing SIGTERM and SIGINT handlers at SDK-init time (same PR, never later). Without it, Railway deploys lose the final event buffer.

**/v1/me response shape**
- **D-16:** Response body is **minimal**: `{ userId: string, email: string }`. Matches the success criterion literally. Phase 104 only needs these two fields for `posthog.identify()` + header display. Extending later is non-breaking.
- **D-17:** Endpoint accepts **both JWT and legacy `vk_` keys** via the existing `bearerAuth` three-path dispatcher. JWT → look up user row by `userId` claim. `vk_` → return the seed user (matches Phase 102 seed-user backcompat). Every existing client can call it on day one.
- **D-18:** Missing user (valid JWT but user row deleted) → **401** `{ error: 'invalid_user' }`. Treat as expired auth; PWA triggers re-auth flow. Not 404, not 500.

### Claude's Discretion

- Exact sharp conversion params (quality level, output format specifics) — pick a sensible default that doesn't regress Claude OCR.
- posthog-node `flushAt`, `flushInterval`, and `captureMode` tuning — use reasonable defaults; revisit in Phase 105 with real traffic.
- `/v1/me` route file location (`routes/me.ts` vs folding into `routes/auth.ts`) — planner's call.
- `before_send` hook implementation details (regex allowlist vs Set lookup, header blocklist contents).
- Test coverage strategy for the shim vs real-client paths — unit tests against the shim are fine; no E2E PostHog integration needed.

### Deferred Ideas (OUT OF SCOPE)

- **Extended `/v1/me` fields** (createdAt, role, display name) — defer to Phase 104+ on demand.
- **Dev-dedicated PostHog project** — revisit only if local-capture verification becomes painful.
- **Pre-downscale HEIC above 5 MB** — revisit only if real iPhone captures hit 413 in practice.
- **Menu-bar error badge for skipped non-iCloud HEIC** — backlog; not tied to v3.5 goals.
- **`/process-audio` sync triage parity** — out of scope (CAP-02 is photo-only).
- **`/thoughts` sync triage parity** — explicitly rejected (D-08); quick-capture latency trumps consistency.
- **Mac-side CoreGraphics HEIC restoration** — explicitly rejected (D-02); server is canonical conversion point.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **CAP-01** | HEIC photos dropped into the Mac watched folder (iCloud path) are triaged instead of silently ignored | `VALID_MEDIA_TYPES` in `process-photo.ts` verified to omit `image/heic`/`image/heif` (line 9–14). Mac side `FolderWatcherService.swift` already lists `heic` as valid input extension (line 26). No `APIImageDescriptionService.swift` exists in `Sources/`, confirming the Mac posts raw HEIC bytes — fix MUST be server-side [VERIFIED: file inspection 2026-04-19]. See §Standard Stack for `heic-convert` recommendation (sharp has prebuilt-binary HEIC gap) and §Assumptions A1. |
| **CAP-02** | Photos uploaded through the API are AI-triaged automatically — the category field is populated on the returned thought, not left null | `process-photo.ts` commit path (lines 383–411) inserts thoughts and returns without calling triage. Existing `routes/triage.ts` does only HTTP handling; the triage prompt is inline. Recommended extraction: pull `TRIAGE_SYSTEM_PROMPT` + `callClaude` pattern into a `triageThought(userId, content): Promise<TriageResult>` helper, then inject via extended `ProcessPhotoDeps` [VERIFIED: file inspection]. Success criterion #2's "verified via curl BEFORE any code" locks a Task 0 diagnostic artifact. |
| **ANLY-01 (server half)** | Server-side exceptions are automatically captured in PostHog (stack traces, request context, userId when available) | posthog-node v5.29.2 ships `enableExceptionAutocapture: true` (covers `uncaughtException` + `unhandledRejection`) plus `captureException(error, distinctId, additionalProperties?, uuid?)` for per-route calls [VERIFIED: tarball types.d.ts + client.d.ts]. `before_send: BeforeSendFn \| BeforeSendFn[]` is shipped in v5.29.2 (snake_case — CONTEXT.md D-12 is correctly spelled) [VERIFIED: types.d.ts line 134]. Hono exposes `app.onError((err, c) => ...)` which is the single server chokepoint for D-13. |
| **AUTH-08** | PWA shows authenticated user's email in the header/settings area via a `GET /v1/me` endpoint | `bearerAuth` middleware in `middleware/auth.ts` sets `c.get("userId"): number` for both `vk_` and JWT paths [VERIFIED: middleware/auth.ts line 11–15]. `users` schema has `id` + `email` columns in `db/schema.ts` (lines 27–41). JWT claims include `email` via `signToken(userId, email)` [VERIFIED: utils/jwt.ts line 30–37] — so the handler can answer from claims without a DB hit when the token path is JWT, if planner prefers zero-query. CONTEXT.md D-17 picks the DB-lookup path for `vk_` + JWT symmetry. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `posthog-node` | `^5.29.2` | Server analytics + error autocapture + event redaction | Official PostHog Node SDK; only viable SDK for hono/express servers; exposes `enableExceptionAutocapture`, `before_send`, `captureException`, `shutdown()` |
| `heic-convert` | `^2.1.0` | HEIC→JPEG conversion on the server | Pure-JS, no native deps; works on Railway without Dockerfile changes; recommended replacement for `sharp` given the libvips/libheif gap — see §Assumption A1 |
| (already shipped) `hono` | `^4.7.0` | `app.onError` global error handler; existing route mounting | Already the HTTP framework — no change |
| (already shipped) `jose` | `^6.2.2` | JWT verify for `/v1/me` | Already used by `bearerAuth` + `signToken`; no change |
| (already shipped) `drizzle-orm` | `^0.45.2` | `users` table lookup for `/v1/me` | Already used everywhere; one-row SELECT |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/heic-convert` | `^1.2.3` (community) | TS types for heic-convert | If TypeScript strict mode complains; otherwise declare a minimal `declare module` shim |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `heic-convert` | `sharp@^0.34.5` (CONTEXT.md D-01) | `sharp`'s prebuilt libvips does NOT ship HEIC decoders (patent-encumbered). Requires custom libvips+libheif in a Railway Dockerfile. Blocker risk for a v3.5 phase whose goal is repair, not infra change. [CITED: sharp.pixelplumbing.com/install — "support for patent-encumbered HEIC images… requires the use of a globally-installed libvips compiled with support for libheif, libde265 and x265"] |
| `heic-convert` | `@saschazar/wasm-heif` | WASM decoder; similar pure-JS guarantees but less battle-tested; smaller install base |
| `heic-convert` | Mac-side CoreGraphics conversion restoration | Explicitly rejected by CONTEXT.md D-02 |
| `captureException()` wrapper | Sentry | Explicitly rejected by REQUIREMENTS.md "Out of Scope" table and v3.5 decisions |

**Installation:**
```bash
cd vigil-core
npm install posthog-node@^5.29.2 heic-convert@^2.1.0
# Optional types:
npm install -D @types/heic-convert
```

**Version verification (2026-04-19):**
- `npm view posthog-node version` → **5.29.2** [VERIFIED: npm registry]
- `npm view sharp version` → 0.34.5 [VERIFIED: npm registry — but see A1]
- `npm view heic-convert version` → **2.1.0** (last publish 2023-11-30; stable, low churn) [VERIFIED: npm registry]

## Architecture Patterns

### Recommended Project Structure (additions / changes only)

```
vigil-core/src/
├── analytics/
│   └── posthog.ts              # NEW — singleton + captureEvent/captureException wrappers + before_send redactor
├── routes/
│   ├── me.ts                   # NEW — GET /v1/me
│   ├── process-photo.ts        # MODIFIED — VALID_MEDIA_TYPES + HEIC conversion + sync triage step
│   └── triage.ts               # MODIFIED — export triageThought() helper callable from process-photo
└── index.ts                    # MODIFIED — import posthog + me; add app.onError after routes; add posthog.shutdown() to signal handlers
```

### Pattern 1: Singleton + null-guarded wrapper (PostHog client)

**What:** Initialize one PostHog client at module scope, keyed off env presence, and expose only wrapper functions. Never expose the raw client at call sites.
**When to use:** Any long-running Node service that integrates PostHog. Singleton prevents `setInterval` leaks per request; wrapper enforces the null-guard so no call site can accidentally call `.capture()` on `null`.
**Example:**
```typescript
// vigil-core/src/analytics/posthog.ts
// Source: [VERIFIED: posthog-node v5.29.2 types.d.ts + client.d.ts]
import { PostHog, type EventMessage } from 'posthog-node';

// Sensitive route allowlist (D-12) — request.body stripped from events here
const SENSITIVE_ROUTES = new Set([
  '/v1/chat',
  '/v1/process-photo',
  '/v1/process-audio',
  '/v1/thoughts',
  '/v1/therapy',
  '/v1/insights',
]);

// Pure function, unit-testable without an SDK instance
export function redactEvent(event: EventMessage | null): EventMessage | null {
  if (!event) return event;
  const route = (event.properties as Record<string, unknown> | undefined)?.['route'];
  if (typeof route === 'string' && SENSITIVE_ROUTES.has(route)) {
    const { request_body: _drop, ...rest } = (event.properties ?? {}) as Record<string, unknown>;
    return { ...event, properties: rest };
  }
  return event;
}

// D-10 key-absence gate. No NODE_ENV coupling.
const apiKey = process.env['POSTHOG_API_KEY'];
export const posthog: PostHog | null = apiKey
  ? new PostHog(apiKey, {
      host: 'https://us.i.posthog.com',
      enableExceptionAutocapture: true,      // D-13 covers uncaught/unhandled
      before_send: redactEvent,              // D-12 — snake_case per v5.29.2 types
      // flushAt / flushInterval left at defaults (planner's discretion per CONTEXT.md)
    })
  : null;

// D-14 — only public API
export function trackEvent(
  userId: number | string,
  event: string,
  properties: Record<string, string | number | boolean | null | undefined> = {},
): void {
  posthog?.capture({ distinctId: String(userId), event, properties });
}

export function captureException(
  userId: number | string | null,
  err: unknown,
  context: { route?: string; method?: string } = {},
): void {
  posthog?.captureException(
    err instanceof Error ? err : new Error(String(err)),
    userId == null ? 'anonymous' : String(userId),
    context,
  );
}

export async function shutdownPosthog(): Promise<void> {
  await posthog?.shutdown(); // D-15 — must be awaited before process.exit
}
```

### Pattern 2: `app.onError` global chokepoint (D-13)

**What:** A single Hono error handler mounted after all `app.route()` calls to convert every unhandled throw into `{ error: 'Internal server error' }` 500 and hand the Error object to PostHog.
**When to use:** Any Hono app that wants uniform 500 responses and centralized observability.
**Example:**
```typescript
// vigil-core/src/index.ts — AFTER all app.route() calls, BEFORE serve()
// Source: Hono docs; [VERIFIED: hono v4.7.0 API]
import { captureException } from './analytics/posthog.js';

app.onError((err, c) => {
  console.error('[vigil-core] unhandled error:', err);
  const userId = c.get('userId') ?? null;
  captureException(userId, err, {
    route: c.req.path,
    method: c.req.method,
  });
  return c.json({ error: 'Internal server error' }, 500);
});
```

### Pattern 3: Dep-injected sync triage (CAP-02)

**What:** Extend the existing `ProcessPhotoDeps` with a `triageFn` dep; production wires the default to a new `triageThought()` helper extracted from `routes/triage.ts`. Tests pass a stub that returns a deterministic `TriageResult`.
**When to use:** Whenever a route-internal helper needs to remain testable without hitting the network.
**Example:**
```typescript
// routes/triage.ts — ADD export
// Source: existing TRIAGE_SYSTEM_PROMPT + callClaude pattern [VERIFIED: routes/triage.ts]
import { callClaude, parseAIJson } from '../ai/client.js';
import type { TriageResult } from '../ai/types.js';

export async function triageThought(content: string): Promise<TriageResult> {
  const raw = await callClaude({
    system: TRIAGE_SYSTEM_PROMPT,
    userMessage: content,
    maxTokens: 100,
  });
  return parseAIJson<TriageResult>(raw);
}
```

```typescript
// routes/process-photo.ts — extend deps
export interface ProcessPhotoDeps {
  callClaudeFn: typeof callClaudeMultimodal;
  getAIClientFn: typeof getAIClient;
  dbInsertFn: (rows: Array<typeof thoughtsTable.$inferInsert>) => Promise<DrizzleThought[]>;
  triageFn: (content: string) => Promise<TriageResult>; // NEW (CAP-02)
  heicConvertFn: (buf: Buffer) => Promise<Buffer>;      // NEW (CAP-01)
}

// Step 8.5 (between DB insert and serialize): parallel triage with D-07 graceful-null fallback
const triageResults = await Promise.all(
  insertedRows.map(async (row) => {
    try {
      const t = await deps.triageFn(row.content);
      await db!.update(thoughtsTable)
        .set({
          category: t.category,
          confidence: t.confidence,
          ...(t.category === 'task' ? { taskStatus: 'open' } : {}),
          ...(t.tags ? { tags: t.tags } : {}),
          ...(t.therapyClassification ? { therapyClassification: t.therapyClassification } : {}),
        })
        .where(and(eq(thoughtsTable.id, row.id), eq(thoughtsTable.userId, userId)));
      return { ...row, category: t.category, confidence: t.confidence, tags: t.tags ?? null };
    } catch (err) {
      // D-07: return 201 with null category; event to PostHog; no user-facing error
      captureException(userId, err, { route: '/v1/process-photo', method: 'POST', op: 'triage' });
      return row;
    }
  }),
);
```

### Pattern 4: Key-absence gate (D-10, no NODE_ENV coupling)

**What:** Module-scope `const posthog = apiKey ? new PostHog(...) : null` — call sites use optional chaining (`posthog?.capture`) via the wrapper.
**Why not `NODE_ENV`:** Railway prod sets it, but local dev servers and CI may forget to unset it. Env-key-absence is 1:1 with deployment identity and cannot drift.

### Anti-Patterns to Avoid

- **Direct `posthog.capture()` at call sites.** Bypasses the null guard and the property allowlist. Violates D-14.
- **Initializing `new PostHog()` inside a route handler.** Creates a new `setInterval` per request; documented memory leak vector [CITED: PITFALLS Pitfall 5].
- **Calling `process.exit(0)` before `await posthog.shutdown()`.** Event buffer lost; violates D-15.
- **String content in event properties.** Any user text (thought content, email subject, transcript) in `properties` leaks private data to PostHog Cloud. Property allowlist = enums/booleans/numbers only (STATE.md locked decision).
- **Returning Claude raw error text to the client.** Already pinned in `process-photo.ts` at line 350 (`"AI processing failed"`). Preserve this when adding HEIC step.
- **Using `/v1/triage` over HTTP from `/v1/process-photo`.** Self-call creates a second request through the same timeout middleware + auth stack. Use the extracted `triageThought()` helper.
- **Adding `sharp` to `package.json` without a Railway Dockerfile.** Prebuilt libvips rejects HEIC — see Assumption A1.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HEIC → JPEG conversion | Custom HEVC decoder or spawn `sips`/`magick` | `heic-convert@2.1.0` | HEVC is patent-encumbered; correct handling of EXIF orientation, color profiles, and multi-frame HEIC is non-trivial. `sips` requires macOS and is unavailable on Railway Linux. |
| Event-redaction pipeline | Post-hoc PostHog filters or manual strip-before-capture at every call site | `before_send` hook in the singleton | `before_send` runs inside the SDK before network send; redaction is centralized and unbypassable. [VERIFIED: posthog-node v5.29.2 types.d.ts line 134] |
| Error serialization + stack-trace attachment | `JSON.stringify(err)` or custom `ErrorWithContext` class | `posthog.captureException(err, distinctId, ctx)` | SDK attaches `$exception_stack_trace`, `$exception_source`, `$exception_fingerprint` automatically [VERIFIED: client.d.ts line 854+] |
| Uncaught/unhandled wiring | `process.on('uncaughtException', ...)` + `process.on('unhandledRejection', ...)` | `enableExceptionAutocapture: true` | SDK registers its own handlers + preserves user handlers; avoids duplicate wiring and stack-mutation issues [VERIFIED: error-tracking/index.js line 35] |
| Global HTTP error handler | try/catch in every route | `app.onError(handler)` | Hono pattern; single chokepoint for logging + observability |
| JWT claim parsing for `/v1/me` | Manual header parsing | `c.get('userId')` set by existing `bearerAuth` | Already validated and type-augmented [VERIFIED: middleware/auth.ts line 11–15] |

**Key insight:** Three of the four Phase 103 deliverables are integrations with shipped libraries (`posthog-node`, `heic-convert`, Hono `app.onError`). The only domain logic being written is the 10-line sync triage step in `process-photo.ts` and the 20-line `/v1/me` handler. Keep the surface small.

## Common Pitfalls

### Pitfall 1: `sharp` HEIC silently fails on Railway (contradicts CONTEXT.md D-01)

**What goes wrong:** After `npm install sharp && sharp(heicBuffer).jpeg().toBuffer()`, the code runs on the dev Mac (because libvips on macOS often ships with libheif from Homebrew) and throws `VipsForeignLoad: "heifload" operation not found` on Railway Linux.
**Why it happens:** sharp's npm prebuilt libvips excludes HEIC/HEIF codecs for patent/licensing reasons. [CITED: sharp.pixelplumbing.com/install]
**How to avoid:** Use `heic-convert` (pure JS, no system libs) OR add a Dockerfile that installs libvips-dev + libheif-dev and relinks sharp. The first option is a 3-line change; the second is a new deploy pipeline.
**Warning signs:** Tests pass locally but the first HEIC upload on Railway throws a libvips error that doesn't appear in any non-Railway environment.

### Pitfall 2: `before_send` casing — snake_case not camelCase

**What goes wrong:** `new PostHog(key, { beforeSend: fn })` compiles in TypeScript (no error from structural typing) but the hook never runs because the real option is `before_send`.
**Why it happens:** posthog-js (browser) uses camelCase; posthog-node keeps snake_case for historical reasons. Docs pages are inconsistent.
**How to avoid:** Type-check against `PostHogOptions` from `posthog-node/dist/types.d.ts`. Use `before_send` verbatim. [VERIFIED: types.d.ts line 134]
**Warning signs:** Redaction is silently skipped; sensitive routes leak `request_body` into PostHog events.

### Pitfall 3: `captureException` is NOT `captureError`

**What goes wrong:** CONTEXT.md §Canonical References mentions a `captureError` wrapper, but the SDK method is `captureException`. Spec drift between wrapper name and SDK method.
**Why it happens:** Natural-language inconsistency — "error" in code, "exception" in PostHog product vocabulary.
**How to avoid:** The wrapper in `analytics/posthog.ts` SHOULD be named `captureException` (matches SDK) per this research. CONTEXT.md D-13/D-14 already uses `captureException` — the `captureError` reference in `canonical_refs` is an aside, not a lock.
**Warning signs:** Confusing import paths or two wrappers doing the same thing.

### Pitfall 4: `app.onError` mounted before routes swallows nothing

**What goes wrong:** `app.onError(...)` placed at the top of `index.ts` never fires because Hono's error handler is a fallback for thrown errors during route handling, and route handlers are registered LATER.
**Why it happens:** Copy-paste from middleware-style examples.
**How to avoid:** Mount `app.onError(...)` AFTER every `app.route('/v1', X)` and `app.use('/v1/*', ...)` call. Use the generate-scheduler line (~167) as the "all routes mounted" anchor. [CITED: Hono docs]
**Warning signs:** Thrown errors return 404 or Hono's default 500 text body instead of the structured `{ error: 'Internal server error' }` payload.

### Pitfall 5: Shutdown race on Railway deploy

**What goes wrong:** Railway sends SIGTERM → handler calls `closeConnection()` → `process.exit(0)` runs before PostHog's flush interval fires → the last N events are lost.
**Why it happens:** D-15 must land SAME PR as SDK init. If deferred, "we'll add shutdown hook later" quietly ships a production regression.
**How to avoid:** Make `await posthog?.shutdown()` THE FIRST `await` inside each signal handler (before `closeConnection()`), so even if the DB teardown hangs, PostHog is already flushed.
**Warning signs:** PostHog event count drops right after each Railway deploy; no errors in logs; events simply disappear.

### Pitfall 6: Sync triage blows the 30s request budget

**What goes wrong:** A photo with 8 lined-paper thoughts triggers 8 Claude calls. If per-call P95 is 3s, parallel P95 ≈ 3s (bounded by slowest call per D-06). If per-call P95 creeps to 10s (Claude throttle), the 30s timeout middleware kills the request.
**Why it happens:** Claude latency is tail-heavy. Parallel bounds the best case; the slowest call still dominates worst case.
**How to avoid:** D-07 gracefully falls back to null category on per-thought failure. Ensure the `Promise.all` wrapper catches per-thought rejections individually (pattern: `Promise.allSettled` or inner try/catch) rather than letting one reject short-circuit the whole batch.
**Warning signs:** Occasional 504s on `/v1/process-photo` during Claude throttle windows; thoughts get saved but response times out.

### Pitfall 7: `heic-convert` input type — Buffer not base64 string

**What goes wrong:** `heicConvert({ buffer: body.image, format: 'JPEG', quality: 0.9 })` passes the base64 string as a Buffer; heic-convert rejects with "invalid input" because it expects a raw byte Buffer.
**Why it happens:** Node `Buffer` accepts both strings and bytes; coercion is silent.
**How to avoid:** `const buf = Buffer.from(body.image, 'base64'); const jpegBuf = await heicConvert({ buffer: buf, format: 'JPEG', quality: 1 }); const jpegB64 = jpegBuf.toString('base64');`
**Warning signs:** HEIC test fails with a decode error; JPEG test passes because the existing path never decodes.

### Pitfall 8: `/v1/me` 500 when user row was deleted

**What goes wrong:** A valid JWT whose `sub` userId no longer exists returns 500 (the handler `.throw`s on null user lookup) — clients see "server error" and don't retry auth.
**Why it happens:** CONTEXT.md D-18 specifies 401 `{ error: 'invalid_user' }`. Must be coded defensively.
**How to avoid:** `const [user] = await db.select()...limit(1); if (!user) return c.json({ error: 'invalid_user' }, 401);`
**Warning signs:** PWA post-Phase-104 shows "Server error" instead of redirecting to login.

### Pitfall 9: Test-mode initializing a real PostHog client

**What goes wrong:** `node --test` run imports `analytics/posthog.ts` which reads `POSTHOG_API_KEY` from the host environment. If the dev has the key exported in their shell, the test run writes to production PostHog.
**Why it happens:** Singleton-at-import-time triggers network I/O on any test that imports the module.
**How to avoid:** Tests either (a) unset `POSTHOG_API_KEY` via `process.env['POSTHOG_API_KEY'] = ''; delete process.env['POSTHOG_API_KEY'];` in a test setup before the import, or (b) import only the pure functions (`redactEvent`) and test those in isolation. Pattern matches `auth.test.ts` setup with `JWT_SECRET` [VERIFIED: auth.test.ts line 21].
**Warning signs:** PostHog dashboard shows events timestamped during CI runs.

### Pitfall 10: `/v1/me` route lives behind bearer middleware — exemption not needed

**What goes wrong:** Planner adds `/v1/me` to the path-exemption list in `index.ts` (next to `/v1/auth/register`) because the other auth routes are exempted — wrong.
**Why it happens:** Visual similarity between auth routes.
**How to avoid:** `/v1/me` REQUIRES auth. It's the authenticated-identity endpoint. `bearerAuth` must run. The exemption block (lines 102–108 of `index.ts`) covers only register/login/callback.
**Warning signs:** `/v1/me` returns the seed user for every anonymous request.

## Code Examples

### Complete `analytics/posthog.ts` module (verified against v5.29.2 types)

```typescript
// vigil-core/src/analytics/posthog.ts
// Source: [VERIFIED: posthog-node v5.29.2 types.d.ts + client.d.ts]
import { PostHog, type EventMessage } from 'posthog-node';

const SENSITIVE_ROUTES = new Set<string>([
  '/v1/chat',
  '/v1/process-photo',
  '/v1/process-audio',
  '/v1/thoughts',
  '/v1/therapy',
  '/v1/insights',
]);

export function redactEvent(event: EventMessage | null): EventMessage | null {
  if (!event) return event;
  const props = (event.properties ?? {}) as Record<string, unknown>;
  const route = props['route'];
  if (typeof route === 'string' && SENSITIVE_ROUTES.has(route)) {
    const { request_body: _drop, headers: _drop2, ...rest } = props;
    return { ...event, properties: rest };
  }
  return event;
}

const apiKey = process.env['POSTHOG_API_KEY'];
export const posthog: PostHog | null = apiKey
  ? new PostHog(apiKey, {
      host: 'https://us.i.posthog.com',
      enableExceptionAutocapture: true,
      before_send: redactEvent,
    })
  : null;

export function trackEvent(
  userId: number | string,
  event: string,
  properties: Record<string, string | number | boolean | null | undefined> = {},
): void {
  posthog?.capture({ distinctId: String(userId), event, properties });
}

export function captureException(
  userId: number | string | null,
  err: unknown,
  context: Record<string, string | number | boolean | undefined> = {},
): void {
  posthog?.captureException(
    err instanceof Error ? err : new Error(String(err)),
    userId == null ? 'anonymous' : String(userId),
    context,
  );
}

export async function shutdownPosthog(): Promise<void> {
  await posthog?.shutdown();
}
```

### `GET /v1/me` handler (minimal, D-16/D-17/D-18)

```typescript
// vigil-core/src/routes/me.ts — NEW
// Source: follows bearerAuth + schema patterns already in this repo
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { users } from '../db/schema.js';

export const me = new Hono();

me.get('/me', async (c) => {
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const userId = c.get('userId'); // set by bearerAuth — D-17 covers vk_/JWT symmetry
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    // D-18 — missing user row = expired auth, not 500
    return c.json({ error: 'invalid_user' }, 401);
  }

  return c.json({ userId: String(user.id), email: user.email }, 200);
});
```

### HEIC pre-conversion step in `process-photo.ts` (CAP-01)

```typescript
// vigil-core/src/routes/process-photo.ts — extend VALID_MEDIA_TYPES + pre-step
// Source: [VERIFIED: file inspection 2026-04-19]
import heicConvert from 'heic-convert';

const VALID_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',   // CAP-01 + D-01
  'image/heif',   // CAP-01 + D-01
] as const;

// New dep
const defaultDeps: ProcessPhotoDeps = {
  // ...existing deps,
  heicConvertFn: async (buf) => {
    // heic-convert signature: { buffer, format, quality }; quality 0..1 for JPEG
    return (await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.92 })) as Buffer;
  },
  triageFn: triageThought,
};

// Inside the router handler, AFTER step 3 (mediaType validation), BEFORE step 5 (Claude call):
// Step 3b: normalize HEIC/HEIF → JPEG
let claudeMediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = mediaType as any;
let claudeImageB64 = body.image;
if (mediaType === 'image/heic' || mediaType === 'image/heif') {
  try {
    const inputBuf = Buffer.from(body.image, 'base64');
    const jpegBuf = await deps.heicConvertFn(inputBuf);
    claudeImageB64 = jpegBuf.toString('base64');
    claudeMediaType = 'image/jpeg';
  } catch (err) {
    console.error('[vigil-core] /process-photo HEIC conversion failed:', err);
    return c.json({ error: 'Image conversion failed' }, 422);
  }
}
// then pass claudeMediaType + claudeImageB64 into the Claude call at step 5
```

### `app.onError` wiring in `index.ts` (D-13, after routes)

```typescript
// vigil-core/src/index.ts — ADD imports at top, ADD handler AFTER last app.route(...)
import { me } from './routes/me.js';
import { captureException, shutdownPosthog } from './analytics/posthog.js';

// ... existing app.route(...) calls ...
app.route('/v1', me);  // D-17 — behind bearerAuth via the existing catch-all middleware

// D-13 — single chokepoint (AFTER all routes are mounted)
app.onError((err, c) => {
  console.error('[vigil-core] unhandled error:', err);
  const userId = c.get('userId') ?? null;
  captureException(userId, err, { route: c.req.path, method: c.req.method });
  return c.json({ error: 'Internal server error' }, 500);
});

// ... existing serve() ...

// D-15 — MUST be first await in both handlers (before closeConnection)
process.on('SIGTERM', async () => {
  console.log('[vigil-core] SIGTERM received...');
  await shutdownPosthog();   // NEW — first await
  generateScheduler.stop();
  gmailWorkOrders.stop();
  await closeConnection();
  process.exit(0);
});
process.on('SIGINT', async () => {
  console.log('[vigil-core] SIGINT received...');
  await shutdownPosthog();   // NEW — first await
  generateScheduler.stop();
  gmailWorkOrders.stop();
  await closeConnection();
  process.exit(0);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-route `process.on('uncaughtException', ...)` wiring | `enableExceptionAutocapture: true` at SDK init | posthog-node v3.x+ | One option flag replaces 20+ lines of error plumbing [VERIFIED: error-tracking/index.js] |
| Client-side PostHog filters to scrub PII after collection | `before_send` hook rejects or edits events before network send | posthog-node v5.x (issue #2198 closed) | Redaction is centralized + unbypassable [VERIFIED: types.d.ts line 134] |
| Self-call `fetch('/v1/triage', ...)` internal routing | Extracted pure-function helpers + dep injection | Phase 59/60 `ProcessPhotoDeps` precedent | Avoids double timeout/auth; unit-testable without HTTP [VERIFIED: process-photo.ts line 225–241] |
| `sharp` for all image ops | `sharp` for JPEG/PNG/WebP ops; `heic-convert` for HEIC because of licensing | Railway / prebuilt-binary awareness | Avoids Dockerfile rebuild; pure-JS drop-in [CITED: sharp.pixelplumbing.com/install] |

**Deprecated/outdated:**
- Direct `posthog.capture('$exception', { ... })` — SDK emits a warning telling you to use `captureException(err)` instead. [VERIFIED: client.js line 168]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| **A1** | `sharp`'s prebuilt npm binary does NOT include HEIC support; `heic-convert` is the safer path. CONTEXT.md D-01 explicitly locks `sharp` — this research recommends substituting `heic-convert`. | Standard Stack, Pitfall 1 | If planner follows D-01 verbatim, first HEIC upload on Railway will throw libvips error in production. Unverified decision will cost at minimum a hotfix phase or Dockerfile rebuild. **MUST be confirmed with user before Task 0.** |
| **A2** | `posthog-node@5.29.2` was verified live at the time of research (2026-04-19). Pre-release alpha `5.0.0-alpha.1` is also tagged, but `latest` resolves to `5.29.2` (npm dist-tags confirmed). | Standard Stack | If an unexpected upgrade drops `before_send` (unlikely given the closed feature request), D-12 is blocked. Pin to `^5.29.2` to avoid. |
| **A3** | The `triageThought(content)` extraction from `routes/triage.ts` preserves current prompt behavior. Claim is based on reading triage.ts — not on a regression test. | Architecture Pattern 3 | If the extraction changes behavior, existing triage-consumer tests may need updates. Mitigation: extract method-only (no prompt edit) and assert that `routes/triage.ts` still returns the same JSON shape. |
| **A4** | Hono's `app.onError` fires for both async throws and sync throws inside route handlers. [CITED: hono docs — verified conceptually] Not verified with a failing-route integration test in this repo. | Pattern 2, Pitfall 4 | If there's a code path where errors are swallowed before `app.onError` (e.g., background async fire-and-forget), those won't appear in PostHog — but `enableExceptionAutocapture` should catch `unhandledRejection` as a fallback. Acceptable residual risk. |
| **A5** | Railway's signal handling is SIGTERM (standard). Not explicitly re-verified in this research, but the existing handlers in `index.ts` already assume this. | Pattern 1, Pitfall 5 | If Railway ever switches to SIGKILL, neither PostHog nor DB close will run — but this is a platform-wide concern beyond Phase 103's control. |

## Open Questions

1. **`sharp` vs `heic-convert` — D-01 substitution**
   - What we know: `sharp`'s npm prebuilt cannot decode HEIC; `heic-convert` is pure JS and works on Railway out of the box.
   - What's unclear: Whether the user intends to eventually add `sharp` for other image ops (quality resize, WebP conversion, etc.), in which case both packages coexist fine — but the HEIC path still needs `heic-convert`.
   - Recommendation: Planner surfaces A1 to the user before Task 0; default to `heic-convert` unless the user wants to invest in a Railway Dockerfile rebuild in this phase.

2. **Verify success criterion #5 mechanism for the local-vs-prod gate**
   - What we know: D-10 locks key-absence. Railway sets `POSTHOG_API_KEY`; local `.env` does not.
   - What's unclear: Whether `.env.local` in vigil-core has a `POSTHOG_API_KEY` left over from some other experiment. A one-line grep at Task 0 confirms.
   - Recommendation: Plan adds "verify `POSTHOG_API_KEY` NOT set in any local dotenv file" to the Task 0 curl artifact.

3. **`vk_` path on `/v1/me` behavior**
   - What we know: `bearerAuth` vk_ path looks up `api_keys` row → extracts `userId` → sets `c.set('userId', ...)`. D-17 says the `/v1/me` response uses that userId and returns the seed user's row from `users` table.
   - What's unclear: Are there any multi-user vk_ keys as of Phase 102, or is every vk_ row still pointing at user_id=1 (seed user)?
   - Recommendation: Plan verifies via a one-line SELECT; either way the handler behaves correctly.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js runtime | posthog-node (>=18), heic-convert (>=14) | ✓ | Railway Node 20 | — |
| `npm` / `npm view` | package install + registry checks | ✓ | 10.x on dev | — |
| Railway PostgreSQL (existing) | Drizzle + users table lookup | ✓ | — | — |
| Railway env var `POSTHOG_API_KEY` | SDK init | Must add | — | Unset during Task 0 pre-curl; set before verification of SC #3 and #5 |
| Railway env var `ANTHROPIC_API_KEY` | Existing Claude calls | ✓ | — | — |
| `libvips` with `libheif` on Railway | Only if planner keeps `sharp` for HEIC | ✗ | — | Use `heic-convert` instead (zero-install on Railway) |
| `curl` | Task 0 diagnostic | ✓ | — | — |
| PostHog Cloud account + project | Ingest target + verification of SC #3, #5 | User-confirm | — | — |

**Missing dependencies with no fallback:**
- PostHog project/API key needs user action (create project at posthog.com, paste key into Railway env). Planner should include this as a pre-Task-0 user-confirmation step. Without it, SC #3 + SC #5 cannot be verified.

**Missing dependencies with fallback:**
- `libvips` + `libheif` — fallback is `heic-convert` (strongly preferred per A1).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` + `tsx` (native Node test runner, no Vitest) |
| Config file | None — convention only; `package.json` `"test": "tsx --test \"src/**/*.test.ts\""` |
| Quick run command | `cd vigil-core && npx tsx --test src/routes/process-photo.test.ts src/routes/me.test.ts src/analytics/posthog.test.ts` |
| Full suite command | `cd vigil-core && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAP-01 | `image/heic` mediaType accepts HEIC bytes, converts to JPEG, passes to Claude | unit (with stubbed `heicConvertFn` + `callClaudeFn`) | `npx tsx --test src/routes/process-photo.test.ts` | ✅ add test case |
| CAP-01 | `image/heif` accepted with same conversion path | unit | `npx tsx --test src/routes/process-photo.test.ts` | ✅ add test case |
| CAP-01 | HEIC conversion failure → 422 (not 500) | unit | `npx tsx --test src/routes/process-photo.test.ts` | ✅ add test case |
| CAP-01 | HEIC round-trip on live server | manual / smoke | `curl -X POST api.vigilhub.io/v1/process-photo -H "Authorization: Bearer $VK" -d @heic.json` | manual — logged in VERIFICATION.md |
| CAP-02 | Commit mode returns thoughts with `category` populated | unit (with stubbed `triageFn`) | `npx tsx --test src/routes/process-photo.test.ts` | ✅ add test case |
| CAP-02 | Per-thought parallel triage (N=3 triage calls for lined paper with 3 thoughts) | unit (counts calls to stub) | `npx tsx --test src/routes/process-photo.test.ts` | ✅ add test case |
| CAP-02 | Triage failure → 201 with `category: null` for that thought only (D-07) | unit (stub rejects for thought 2 only) | `npx tsx --test src/routes/process-photo.test.ts` | ✅ add test case |
| CAP-02 | Preview mode (`?preview=true`) does NOT triage | unit | `npx tsx --test src/routes/process-photo.test.ts` | ✅ existing test extended |
| CAP-02 | Diagnostic curl (Task 0 — pre-code) | manual | `curl -X POST api.vigilhub.io/v1/process-photo …` | Wave 0 artifact |
| ANLY-01 | `redactEvent()` strips `request_body` on sensitive routes | unit (pure function, no SDK) | `npx tsx --test src/analytics/posthog.test.ts` | ❌ Wave 0 |
| ANLY-01 | `redactEvent()` preserves props on non-sensitive routes | unit | `npx tsx --test src/analytics/posthog.test.ts` | ❌ Wave 0 |
| ANLY-01 | `trackEvent()` is a no-op when `posthog === null` | unit (spy, no network) | `npx tsx --test src/analytics/posthog.test.ts` | ❌ Wave 0 |
| ANLY-01 | `captureException()` normalizes non-Error throws | unit | `npx tsx --test src/analytics/posthog.test.ts` | ❌ Wave 0 |
| ANLY-01 | `app.onError` converts thrown route errors to 500 + calls wrapper | integration (stub wrapper) | `npx tsx --test src/index.test.ts` OR dedicated `src/integration/error-handler.test.ts` | ❌ Wave 0 |
| ANLY-01 | Intentional test throw appears in PostHog Cloud (SC #3) | manual / smoke | Triggered via `curl api.vigilhub.io/v1/debug-throw` (add a prod-gated debug route OR use a known-throw path) | manual — logged in VERIFICATION.md |
| ANLY-01 | Local `npm run dev` events do NOT hit PostHog (SC #5) | manual | Start dev server, hit endpoint, check PostHog Cloud — confirm zero events | manual — logged in VERIFICATION.md |
| AUTH-08 | Valid JWT → `{ userId, email }` 200 | unit (mock db, stub JWT) | `npx tsx --test src/routes/me.test.ts` | ❌ Wave 0 |
| AUTH-08 | Valid `vk_` → seed user `{ userId, email }` 200 | unit | `npx tsx --test src/routes/me.test.ts` | ❌ Wave 0 |
| AUTH-08 | JWT for deleted user → 401 `invalid_user` (D-18) | unit | `npx tsx --test src/routes/me.test.ts` | ❌ Wave 0 |
| AUTH-08 | No bearer → 401 (covered by existing auth middleware) | unit | `npx tsx --test src/routes/me.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Run the targeted test files modified by the task (e.g., `npx tsx --test src/routes/process-photo.test.ts` for CAP-01/CAP-02 tasks)
- **Per wave merge:** Full `cd vigil-core && npm test` (covers the existing 20+ test files plus new ones)
- **Phase gate:** Full suite green + manual SC #1 (HEIC round-trip), SC #2 (curl artifact matches post-fix), SC #3 (intentional throw in PostHog), SC #4 (`/v1/me` live), SC #5 (no dev events in PostHog) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/analytics/posthog.test.ts` — covers ANLY-01 pure-function paths (redactor, null-guard wrappers)
- [ ] `src/routes/me.test.ts` — covers AUTH-08 (JWT path, vk_ path, missing-user 401)
- [ ] `src/integration/error-handler.test.ts` (or inline in `src/index.test.ts`) — covers `app.onError` chokepoint behavior (stub `captureException` via dep injection or env flag)
- [ ] Extend `src/routes/process-photo.test.ts` with HEIC mediaType + sync triage + per-thought failure cases (follow existing `ProcessPhotoDeps` fake pattern)
- [ ] Confirm `POSTHOG_API_KEY` unset in `.env` / `.env.local` of `vigil-core` before any test import of `analytics/posthog.ts` (matches existing `auth.test.ts` pattern at line 21)
- [ ] Framework install: none — `tsx` and `node:test` already configured

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Reuse `bearerAuth` middleware (JWT via `jose` HS256, vk_ via SHA256 lookup); no new auth code in this phase |
| V3 Session Management | yes (inherited) | JWT lifetime 30d per Phase 102 D-12; sessionStorage client-side per v3.5 Pitfall 9 (Phase 104 concern) |
| V4 Access Control | yes | `/v1/me` is behind `bearerAuth`; returns only the caller's own row; no IDOR surface (handler never accepts a userId param) |
| V5 Input Validation | yes | Extend `VALID_MEDIA_TYPES` validation for HEIC; `heic-convert` rejects malformed input → 422 branch |
| V6 Cryptography | yes (inherited) | No new crypto; argon2 for passwords, jose for JWT, SHA256 for vk_ — all shipped |
| V7 Error Handling | yes | `app.onError` returns generic `{ error: 'Internal server error' }` — no stack traces to client; full detail goes to PostHog only |
| V8 Data Protection | yes | `before_send` redactor strips `request_body` on sensitive routes (D-12); property allowlist is enums/booleans/numbers only |
| V12 API Security | yes | `/v1/me` follows existing protected-route pattern; rate limiter already applies (100 req / 60s per IP) |

### Known Threat Patterns for Hono/Node + PostHog

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Exfiltration of user thoughts via error stack traces posted to third party | Information Disclosure | `before_send` hook redacts `request_body` before network send (D-12) [VERIFIED: types.d.ts line 134] |
| Event buffer loss on deploy | Denial of Service (observability) | `shutdown()` awaited in SIGTERM/SIGINT handlers (D-15) |
| HEIC parser vulnerabilities (CVEs in libheif historically) | Tampering / DoS | `heic-convert` runs in Node userland, sandboxed from native code paths; 5 MB base64 cap before conversion (D-04) |
| Image-based XSS via Content-Type spoofing | Tampering | `VALID_MEDIA_TYPES` allowlist is string equality, not header-sniffing; 400 on unrecognized |
| JWT claim tampering with `sub` to impersonate | Spoofing | Existing `verifyToken()` mandates HS256 (rejects `alg: none` / RS256 confusion) [VERIFIED: utils/jwt.ts line 39–45] |
| `/v1/me` IDOR via userId in body/query | Elevation of Privilege | Handler reads userId ONLY from `c.get('userId')` (middleware-set) — never from request |
| Direct `posthog.capture()` bypassing allowlist | Information Disclosure | D-14 — wrapper is the only public API; code review enforces no `import { posthog }` at call sites |

## Sources

### Primary (HIGH confidence — live codebase inspection 2026-04-19)

- `vigil-core/src/routes/process-photo.ts` lines 9–14 — VALID_MEDIA_TYPES verified to omit HEIC/HEIF
- `vigil-core/src/routes/process-photo.ts` lines 225–241 — `ProcessPhotoDeps` dep-injection surface for CAP-02 triage injection
- `vigil-core/src/routes/process-photo.ts` lines 383–411 — commit path confirmed to insert and return without triage
- `vigil-core/src/routes/triage.ts` — TRIAGE_SYSTEM_PROMPT + triage flow for extraction into `triageThought()` helper
- `vigil-core/src/routes/thoughts.ts` lines 318–344 — existing fire-and-forget triage pattern (D-08 keeps this unchanged; reference only)
- `vigil-core/src/middleware/auth.ts` lines 11–15, 38–106 — `bearerAuth` three-path dispatcher, `ContextVariableMap.userId: number`
- `vigil-core/src/index.ts` lines 61–191 — middleware stack, route mounting, SIGTERM/SIGINT handlers (PostHog shutdown targets)
- `vigil-core/src/utils/jwt.ts` lines 22–53 — JwtClaims shape (`{ sub, email, iat, exp }`), HS256 enforcement
- `vigil-core/src/db/schema.ts` lines 27–41 — users table (id, email, passwordHash, createdAt, updatedAt)
- `vigil-core/src/routes/auth.ts` — register/login handlers (context for claim-flow), `signToken(userId, email)` confirms email is embedded in JWT
- `vigil-core/package.json` — no existing PostHog or image-processing deps; Node 20+ runtime
- `Sources/DailyBriefMonitor/FolderWatcherService.swift` line 26 — `imageExtensions: ["jpg", "jpeg", "png", "heic", "tiff", "bmp"]`; Mac accepts HEIC as input
- `Sources` directory — `APIImageDescriptionService.swift` NOT present; Mac posts raw bytes with no conversion (confirms CAP-01 root cause is 100% server-side)
- `vigil-core/src/routes/auth.test.ts` line 21 — test-env setup pattern (`process.env['JWT_SECRET'] = '...'`)
- `vigil-core/src/routes/process-photo.test.ts` lines 1–120 — existing `node:test` patterns for dep-injected route tests

### Primary (HIGH confidence — npm registry + tarball inspection 2026-04-19)

- `npm view posthog-node version` → 5.29.2 [VERIFIED: npm registry]
- `npm view sharp version` → 0.34.5 [VERIFIED: npm registry]
- `npm view heic-convert version` → 2.1.0 [VERIFIED: npm registry]
- `posthog-node@5.29.2` tarball `dist/types.d.ts` line 93 — `BeforeSendFn = (event: EventMessage | null) => EventMessage | null` [VERIFIED: source]
- `posthog-node@5.29.2` tarball `dist/types.d.ts` line 94–134 — PostHogOptions with `enableExceptionAutocapture: boolean`, `before_send: BeforeSendFn | BeforeSendFn[]` [VERIFIED: source]
- `posthog-node@5.29.2` tarball `dist/client.d.ts` line 878 — `captureException(error: unknown, distinctId?: string, additionalProperties?: Record<string | number, any>, uuid?: EventMessage['uuid']): void` [VERIFIED: source]
- `posthog-node@5.29.2` tarball `dist/client.d.ts` line 175 — `disable(): Promise<void>` (runtime, not constructor) [VERIFIED: source]

### Secondary (MEDIUM confidence — official docs via WebFetch 2026-04-19)

- [PostHog Node.js Error Tracking docs](https://posthog.com/docs/error-tracking/installation/node) — `enableExceptionAutocapture: true`, `captureException(e, 'user_distinct_id', additionalProperties)`, `setupExpressErrorHandler(posthog, app)` helper
- [PostHog Node.js library docs](https://posthog.com/docs/libraries/node) — `flushAt` default 20, `flushInterval` default 10000 ms
- [PostHog/posthog-js issue #2198](https://github.com/PostHog/posthog-js/issues/2198) — `before_send` feature request for posthog-node, status CLOSED (corroborates v5 tarball inspection)
- [sharp.pixelplumbing.com/install](https://sharp.pixelplumbing.com/install) — "support for patent-encumbered HEIC images using hevc compression requires the use of a globally-installed libvips compiled with support for libheif, libde265 and x265"
- [DEV.to: Converting HEIC in Node.js with sharp](https://dev.to/yassentials/converting-heic-image-extension-in-nodejs-with-the-sharp-library-39mg) — confirms prebuilt sharp lacks HEIC; practical workarounds

### Tertiary (LOW confidence — flagged for validation)

- No open Claude API behavior questions for this phase — Claude vision + Claude triage are both existing shipped paths.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all three package versions verified live; `heic-convert` substitution recommendation flagged as A1 pending user confirmation
- Architecture: HIGH — all file paths, line numbers, dep-injection surfaces confirmed via direct file inspection
- Pitfalls: HIGH — 9/10 pitfalls have tarball-source or file-inspection verification; one (A4 `app.onError` swallowing async) is cited conceptually, acceptable residual risk
- Validation architecture: HIGH — test framework and existing patterns inspected; Wave 0 gaps listed explicitly
- Security domain: HIGH — all controls are either shipped or simple extensions of shipped patterns; no new crypto

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (fast-moving: posthog-node ships frequently; npm registry may bump minor versions. Stack pin at `^5.29.2` minimizes drift.)

---

*Research for: Phase 103 — Capture Repair & Server Observability Foundations*
*Researcher: gsd-researcher*
