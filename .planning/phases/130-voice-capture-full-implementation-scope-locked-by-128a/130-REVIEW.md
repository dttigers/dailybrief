---
phase: 130-voice-capture-full-implementation-scope-locked-by-128a
reviewed: 2026-05-18T22:55:00Z
depth: deep
scope: ~41 commits across Plans 01-07 (Plan 01 = spike removal, 06 = test-only, 07 = docs)
files_reviewed: 19
files_reviewed_list:
  - vigil-core/src/routes/voice-transcribe.ts
  - vigil-core/src/routes/voice-errors.ts
  - vigil-core/src/ai/transcribe.ts
  - vigil-core/src/lib/audio-cap.ts
  - vigil-core/src/lib/ai-budget.ts
  - vigil-core/src/lib/agent-events-bus.ts
  - vigil-core/src/routes/agent-stream.ts
  - vigil-core/src/index.ts
  - vigil-core/src/analytics/posthog.ts
  - vigil-core/src/db/schema.ts
  - vigil-core/drizzle/0023_voice_capture_dedup.sql
  - vigil-pwa/src/hooks/useAgentStream.ts
  - vigil-pwa/src/lib/api-error-codes.ts
  - vigil-g2-plugin/src/screens/voice.ts
  - vigil-g2-plugin/src/screens/companion.ts
  - vigil-g2-plugin/src/lib/voice-queue.ts
  - vigil-g2-plugin/src/lib/voice-telemetry.ts
  - vigil-g2-plugin/src/lib/wav-encoder.ts
  - vigil-g2-plugin/src/lib/audio-session-guard.ts
  - vigil-g2-plugin/src/main.ts
  - vigil-g2-plugin/src/navigation.ts
  - vigil-g2-plugin/src/api.ts
  - vigil-g2-plugin/src/constants.ts
findings:
  blocker: 0
  high: 3
  medium: 5
  low: 6
  info: 4
  total: 18
status: issues_found
notes: |
  Phase has already passed operator hardware UAT; review is advisory. No BLOCKER
  findings (would have prevented UAT pass). The 3 HIGH findings are correctness
  defects that are masked in the operator-attested happy path but will surface
  under concurrency / adversarial inputs / certain edge cases. The known
  follow-up gaps (GAP-130-FU1..FU4) from 130-HARDWARE-UAT.md are NOT duplicated
  here — only net-new findings.
---

# Phase 130: Code Review Report

**Reviewed:** 2026-05-18T22:55:00Z
**Depth:** deep
**Files Reviewed:** ~23 source files (excluding test files / planning artifacts)
**Status:** issues_found (advisory — phase already in production)

## Summary

End-to-end review of Phase 130 voice capture, covering the server-side production
route (`POST /v1/voice/transcribe`), the OpenAI helper, the SSE multiplex into
agent-stream, the PWA SSE subscriber, the G2 plugin voice screen + offline queue
+ telemetry, and the surrounding wiring (navigation, constants, error funneling).

The phase is well-architected: D-D2 (no PCM in logs/telemetry) holds, bearer auth
is properly gated, the dedup partial unique index is correctly scoped per user,
the error class funnel is symmetric across server / PWA / plugin, and the SSE
three-channel cleanup gate is correctly extended on both `off` and `offQuiet`.
The Run 4 `safeAudioControl` Promise<boolean> hardening is surgical and the
four cleanup hooks are preserved unchanged.

That said, several real defects exist:

- **HIGH H-01:** server has no HTTP body-size limit; `assertAudioSessionWithinCap`
  protects only against the base64 string AFTER `c.req.json()` has already
  parsed the full body — meaning a malicious bearer-authenticated client can
  force the server to allocate arbitrarily-large memory via `c.req.json()`
  before the cap check ever fires. The route's own comment claims the cap
  check happens "BEFORE Buffer.from decode" — true, but irrelevant to the
  actual DoS surface.

- **HIGH H-02:** the 60s audio cap math is **off-by-44-bytes** — the cap is
  computed from raw PCM (1,920,000 bytes) but the plugin sends the full WAV
  container (1,920,044 bytes); a properly-recorded full 60s utterance will
  base64 to ~2,560,060 chars and trip the `MAX_AUDIO_B64_CHARS_60S = 2,560,000`
  cap (`> ` comparison). The G2 plugin will surface `[ERR]` + retry +
  eventually evict, with no way for the operator to know the recording was
  just-slightly-over.

- **HIGH H-03:** the dedup race window has a duplicate-thought failure mode.
  The SELECT-then-INSERT-thought-then-INSERT-voice_captures sequence is not
  transactional; two concurrent requests with the same `clientCaptureId` both
  pass the SELECT (rows empty), both INSERT a thought (succeeds — no unique
  constraint on thoughts), one of them then INSERTs voice_captures (succeeds),
  the other one's voice_captures INSERT fails on the unique index, the route
  throws → 500 → client retries → next attempt finds the existing voice_captures
  row and dedups, but **the orphan thought row from the second concurrent
  attempt remains**. The SUMMARY's "T-130-02-T-2 mitigation" claim that the
  partial unique index alone closes the race is incorrect.

The remaining MEDIUM / LOW findings are inconsistencies, dead-code parameters,
and small fidelity gaps that don't compromise production but should be cleaned
up.

---

## High Severity

### H-01: HTTP body-size DoS — `c.req.json()` parses full body before audio cap check

**File:** `vigil-core/src/routes/voice-transcribe.ts:140-167`
**Severity:** HIGH (correctness + DoS surface; mitigated in practice by Railway
proxy timeouts + Hono's `timeout(30_000)` middleware but unbounded in memory)

**Issue:** The route comments at lines 9-22 and 165-167 claim the audio cap is
checked "BEFORE Buffer.from decode" as a DoS guard. This is technically true,
but the **`c.req.json()` call at line 142 fully buffers and JSON-parses the
HTTP body in memory** before the cap check runs at line 167. Hono / @hono/node-server
has no default body-size limit; `index.ts` does not install a body-limit
middleware. A bearer-authenticated attacker can POST a 500 MB JSON body
(e.g., `{"audio":"<2GB base64 padding>","clientCaptureId":"..."}`) and the
process will allocate ~500 MB+ before `assertAudioSessionWithinCap` ever runs.

This is not exploitable by unauthenticated attackers (bearerAuth runs first),
but bearer keys CAN be lost / leaked (the Phase 130 UAT itself had 3 attempts
related to bearer key handling), and the route is a documented soft-target
amplification surface (`/v1/voice/transcribe`).

The `assertAudioSessionWithinCap` cap correctly protects the `Buffer.from`
decode (saves a second ~2.5 MB allocation), and the OpenAI call cost guard
(dedup short-circuit + `requireAiBudget`) is unaffected — but the bare memory
allocation during JSON parse is unbounded.

**Fix:** Install `hono/body-limit` middleware on the route OR pull the request
body as a stream and apply the cap check incrementally:

```typescript
import { bodyLimit } from 'hono/body-limit'

router.post(
  '/voice/transcribe',
  bodyLimit({
    // 3 MB cushion above MAX_AUDIO_B64_CHARS_60S (2.56 MB) + clientCaptureId
    // + JSON quoting overhead. Anything bigger is structurally over-cap.
    maxSize: 3 * 1024 * 1024,
    onError: (c) => c.json({ error: 'Payload too large', code: 'AUDIO_SESSION_TOO_LONG' }, 413),
  }),
  async (c) => { /* existing handler */ }
)
```

Alternative: keep the route-level cap check but install `bodyLimit({maxSize: 3*1024*1024})`
globally in `index.ts` for all POST routes (defense-in-depth across the whole API).

---

### H-02: 60-second audio cap is off-by-44-bytes vs the actual transmitted WAV

**File:** `vigil-core/src/lib/audio-cap.ts:26-35` + `vigil-g2-plugin/src/lib/wav-encoder.ts`
**Severity:** HIGH (correctness; will reject a valid 60s recording at the literal
edge of the cap)

**Issue:** The cap is computed from raw PCM bytes only:

```typescript
MAX_PCM_BYTES = 60 * 16_000 * 2;                       // 1,920,000
MAX_AUDIO_B64_CHARS_60S = Math.ceil(MAX_PCM_BYTES * 4 / 3);  // 2,560,000
```

But the G2 plugin transmits the **WAV-wrapped** PCM (`buildWav` adds 44 bytes
of RIFF/WAVE/fmt header before the PCM data — `wav-encoder.ts:47-93`). For a
true 60s recording:

- PCM bytes: 1,920,000
- WAV bytes: 44 + 1,920,000 = 1,920,044
- Base64 chars: `ceil(1,920,044 × 4/3) + padding` ≈ **2,560,060**

The cap check is `if (b64.length > MAX_AUDIO_B64_CHARS_60S)` (strict `>`) at
`audio-cap.ts:74`, so 2,560,060 > 2,560,000 → throws `AudioSessionTooLongError`
→ 413 response → G2 plugin enqueues for retry → eventually evicts as
`retries_exhausted` (since 413 is `res.status !== 429 && !res.ok` → falls into
the transient branch in `voice-queue.ts:298-313` — actually 413 is treated as
transient and retried indefinitely until `retryCount >= 6`).

In practice the G2's audio cadence + the operator's wallclock variance keeps
typical recordings under ~58s, so the bug is masked. But a recording at the
exact 60s wallclock will be **silently rejected and then permanently dropped**
after 6 retries — with no operator-visible reason (`[ERR]` shows the generic
`retry — tap to dismiss` copy, not "you went over the 60s cap").

**Worse:** 413 should be treated as PERMANENT (the same payload will always
trip the cap), but `voice-queue.ts` only special-cases 429
DAILY_AI_BUDGET_EXCEEDED as permanent. A 413 will burn 6 retries (1+2+4+8+16+30
= 61s of backoff + 6× the network/server roundtrip cost) before evicting —
the queue does not distinguish 4xx-permanent from 5xx-transient.

**Fix:** Two changes needed:

1. Adjust the cap to account for the 44-byte WAV header (in `audio-cap.ts`):

```typescript
export const MAX_PCM_BYTES = 60 * 16_000 * 2;
const WAV_HEADER_BYTES = 44;
const MAX_WAV_BYTES = MAX_PCM_BYTES + WAV_HEADER_BYTES;
// Use ceil(MAX_WAV_BYTES * 4/3) rounded up to a multiple of 4 for base64 padding
export const MAX_AUDIO_B64_CHARS_60S = Math.ceil((MAX_WAV_BYTES * 4 / 3) / 4) * 4;
// Pin the new value in audio-cap.test.ts
```

2. In `voice-queue.ts:298`, treat all 4xx as permanent (no retry):

```typescript
// After the 429 branch:
if (response && response.status >= 400 && response.status < 500) {
  emitVoiceQueueEvicted({
    clientCaptureId: entry.clientCaptureId,
    retryCount: entry.retryCount,
    reason: 'retries_exhausted', // or new 'client_error_permanent'
  })
  continue
}
```

---

### H-03: Dedup race produces orphan thought rows under concurrency

**File:** `vigil-core/src/routes/voice-transcribe.ts:169-240`
**Severity:** HIGH (correctness; data integrity)

**Issue:** The dedup sequence is:

1. SELECT voice_captures WHERE (userId, clientCaptureId)
2. If row exists with thoughtId → return existing thought (dedup hit, OK)
3. INSERT thoughts row (no unique constraint on clientCaptureId)
4. INSERT voice_captures row (partial unique index on (userId, clientCaptureId))

Under concurrent retries of the same clientCaptureId (e.g., G2 plugin's offline
queue drain + a hand-typed retry, or two rapid network retries from the queue),
two requests can both pass step 1 (the row doesn't exist yet for either), both
execute step 2 (the OpenAI call — costing money twice), both INSERT a thought
at step 3 (succeeds — no constraint), and only one INSERTs voice_captures at
step 4. The other request's voice_captures INSERT throws on the unique
constraint, the route throws → app.onError logs to Sentry + returns 500.

Result: **2 thought rows for one utterance**, one of them an orphan (no
voice_captures row pointing to it). The PWA dashboard shows both transcripts
as separate thoughts. The operator's dedup hash trail is broken.

The SUMMARY's `T-130-02-T-2` mitigation claim ("composite partial unique index
on (user_id, client_capture_id) WHERE NOT NULL") is misleading — the unique
index only prevents the second voice_captures row; it does NOT prevent the
second thought row + the second OpenAI cost. The "dedup race" was never closed
on the cost path either.

In practice the G2 plugin's offline queue is single-threaded (one drain per
plugin instance) and the operator only has one G2, so the concurrency is
unlikely in normal operation. But:

- A queue drain timer + an explicit "retry" could overlap.
- A PWA-side retry (e.g., via API explorer) could collide with a queue drain.
- A duplicate request on flaky-network retry semantics is plausible.

**Fix:** Wrap steps 3+4 in a transaction so a unique-index violation rolls
back the thought INSERT:

```typescript
const result = await dbRef.transaction(async (tx) => {
  const inserted = await tx.insert(thoughtsTable).values({
    userId,
    content: text,
    source: 'g2_voice',
    cloudKitRecordID: crypto.randomUUID(),
  }).returning();
  const row = inserted[0]!;
  await tx.insert(voiceCaptures).values({
    userId,
    thoughtId: row.id,
    clientCaptureId,
  });
  return row;
});
```

If the voice_captures INSERT throws (unique violation), Drizzle/pg rolls back
the thought INSERT too. The route should then retry the dedup SELECT (the
winning request has already committed) and return the existing thought.

Bonus: the OpenAI cost guard — the dedup SELECT short-circuit AFTER the
losing race re-SELECTs would correctly NOT call OpenAI a 2nd time on the
RETRY. But it WAS called twice on the original concurrent attempt — that
cost can't be recovered without an OpenAI-side dedup, which isn't possible.
The unavoidable conclusion: pure idempotency requires a unique index on
`thoughts(userId, clientCaptureId)` too, OR the voice_captures row inserted
FIRST (pre-OpenAI) with thought_id NULL, then updated. Either approach is
a deeper refactor; the transaction wrapper is the cheaper first step.

---

## Medium Severity

### M-01: `assertAudioSessionWithinCap` rejects 0-length / very-short payloads with cap message

**File:** `vigil-core/src/routes/voice-transcribe.ts:147-152`
**Severity:** MEDIUM (correctness / UX — error code is misleading)

**Issue:** The body validation at line 147 rejects `audio` if it's not a string
OR has length 0. But there's no lower-bound check on the actual decoded audio.
A 1-character base64 (`audio: "A"`) passes the string check, passes the
upper-bound cap check (1 < 2,560,000), reaches `Buffer.from(audio, 'base64')`
which returns a 0-byte (or invalid) buffer. `transcribeWav` then sends 0 bytes
to OpenAI, which probably 400s with a generic error → funneled to
`VoiceTranscribeProviderDownError` → 502.

The operator-facing UX: `voice transcription service unavailable`. The actual
issue: client sent garbage. The cost: one OpenAI roundtrip + the budget
accumulator running on `durationMs = 0` (correctly skipped via the
`usd > 0` guard at `ai-budget.ts:290`).

This is also a soft DoS amplifier — an attacker with a leaked bearer can
generate cheap requests that hit OpenAI before any real validation.

**Fix:** Add a lower-bound + base64-format pre-check before `Buffer.from`:

```typescript
// After existing string/non-empty checks:
if (audio.length < 100) {  // 100 chars base64 = ~75 bytes; below any reasonable WAV
  return c.json({ error: 'audio payload too small', code: 'AUDIO_SESSION_INVALID' }, 400)
}
// Optional: pre-validate base64 shape (no decoded body yet)
if (!/^[A-Za-z0-9+/]+=*$/.test(audio)) {
  return c.json({ error: 'audio is not valid base64', code: 'AUDIO_SESSION_INVALID' }, 400)
}
```

---

### M-02: `voice-queue.ts` retries 4xx errors as if transient — burns ~60s of backoff before eviction

**File:** `vigil-g2-plugin/src/lib/voice-queue.ts:298-313`
**Severity:** MEDIUM (correctness; secondary to H-02 fix)

**Issue:** The drain loop's failure-path branching:

- 2xx → success
- 429 → permanent (D-E3 cascade) — evicts immediately
- Else (5xx / network error / 4xx other) → transient → increment retryCount

A 400 (e.g., bad clientCaptureId / unparseable JSON) or 413 (over-cap audio,
see H-02) or 401 (revoked bearer) is **never resolvable by waiting**, but the
queue retries them for the full 6-attempt backoff (1+2+4+8+16+30 = 61 seconds
plus the per-attempt roundtrip). The cost is real: each retry hits Railway,
flows through bearerAuth (DB lookup for vk_ keys), and burns one slot in the
rate limiter (100 req/60s).

A 401 specifically is dangerous: it means the bearer is no longer valid; every
retry will 401; the queue burns 6 attempts then evicts; the operator's
remaining queued utterances will all 401 + burn 6 attempts each. With 10
queued entries that's 60 attempts vs Railway, plus the rate-limiter pile-up.

**Fix:** Treat all 4xx (except 429 which has its own permanent branch) as
permanent. Code sketch in H-02 above. The 429 branch already exists; just
extend the failure-cascade with `else if (status >= 400 && status < 500) →
evict as permanent`.

---

### M-03: `voice-queue` drain has no caller — `enqueue()` is fire-and-forget with no scheduled drain

**File:** `vigil-g2-plugin/src/lib/voice-queue.ts:212` + `vigil-g2-plugin/src/screens/voice.ts:410`
**Severity:** MEDIUM (functional gap — VOICE-07 partially works only)

**Issue:** The plan summary states (Plan 05 §"Deferred Issues 4"):

> drainQueue cadence is not yet scheduled — Plan 05 provides the drainQueue
> function but does NOT wire a periodic timer or online-event listener that
> calls it. Voice.ts only enqueues — drain happens when a future caller
> invokes it.

So `enqueue()` writes to localStorage, but **nothing in the plugin ever calls
`drainQueue()`** in production. The hardware UAT Line 6 ("airplane-mode queue
drain") passed by operator attestation, but the mechanism by which the queue
drained is unclear — likely the operator re-DOUBLE_CLICKed to record fresh,
the success-path POST happened, and the queue was *cleared during a subsequent
enqueue's LRU eviction* OR via the next time the plugin was reloaded (cold
start may incidentally trigger via some path? — there is no such code).

I cannot find any caller of `drainQueue` in `vigil-g2-plugin/src/` outside
the test file. Source-grep confirms:

```
grep -rn "drainQueue" vigil-g2-plugin/src/ | grep -v test
```

returns nothing (the export is reachable from voice-queue.ts but unused).

The UAT passing this line despite no drain caller suggests either (a) the
operator's queue depth never actually went up (the airplane-mode test queued
items but the test's actual success was the *next* online recording's success,
not a drain of the queued items), or (b) the queued items were lost when the
operator reloaded the plugin, and what showed up on the PWA was the
post-airplane-mode-off fresh recordings.

**Fix:** Wire `drainQueue` to either:

- An `online` event listener (browser `window.addEventListener('online', ...)`),
- A periodic timer on plugin startup (e.g., setInterval at 30s when queueDepth
  > 0; clear when queue empties),
- A foreground-restore hook (drain on `FOREGROUND_ENTER_EVENT` in main.ts).

Without this, GAP-130-FU1 (companion HUD empty-state bypass) is somewhat moot
because the queue never drains anyway.

---

### M-04: `bytes` field comment / formula mismatch in `voice-queue.ts approximateWavBytes`

**File:** `vigil-g2-plugin/src/lib/voice-queue.ts:320-328`
**Severity:** MEDIUM (telemetry fidelity; comment lies about behavior)

**Issue:** The JSDoc at lines 320-325 says:

> Estimate the WAV byte count from a base64 string length. Base64 encodes 3
> bytes per 4 characters; the result is the approximate decoded size **minus
> the 44-byte WAV header** (or 0 if smaller).

But the implementation at line 327 does NOT subtract 44:

```typescript
return Math.max(0, Math.floor((base64Audio.length * 3) / 4))
```

The successful online path in `voice.ts:362` emits `bytes: wavBytes` which is
`wav.length` (i.e., 44 + PCM). The queue-drain path emits the approximate
total — also including the header. So the two paths *do* agree (header
included). The JSDoc is wrong.

This is also inconsistent with the server-side budget math at
`voice-transcribe.ts:215`:

```typescript
const durationMs = Math.max(0, wav.length - 44) / 32;
```

— which subtracts 44 because the PCM-byte → ms conversion needs the data
length, not the WAV length. PostHog's `bytes` field is documented (PATTERNS /
SUMMARY) but the convention isn't pinned — analyst querying `voice_capture_completed.bytes`
will see "WAV bytes" not "PCM bytes" or "audio duration in bytes".

**Fix:** Either:
- Update the JSDoc to match the code: "the result is the approximate decoded
  size including the WAV header".
- OR subtract 44 to match the server-side interpretation, AND fix `voice.ts:362`
  to emit `wav.length - 44`.

Pick one convention and document.

---

### M-05: `useAgentStream` silently drops 401 — operator may sit on a dead stream until next poll

**File:** `vigil-pwa/src/hooks/useAgentStream.ts:80-85`
**Severity:** MEDIUM (UX / observability)

**Issue:** The fetch-stream connection bails silently on `!res.ok || !res.body`:

```typescript
if (!res.ok || !res.body) {
  // Don't escalate — a 401 here means the JWT expired, which the
  // app's existing /v1/summary poll will catch and route through
  // the `vigil:signout` cross-cutting handler. Bail silently.
  return
}
```

Issues:
1. The comment is right about the JWT-expiry path, but assumes `/v1/summary`
   polls regularly (30s default). Between the SSE 401 and the next /v1/summary
   poll, the operator's dashboard is dead-quiet on cross-device voice captures
   (G2-origin voice → server emit → SSE → nothing). The 30s polling backstop
   does close the gap, but there's no DEV-mode log for a 401.
2. Other 4xx (e.g., 403 EMAIL_NOT_VERIFIED, 503 DB unavailable) are also
   silently dropped. A user mid-grace-period who exceeds the 24h verification
   window would see no UI signal that the stream died.
3. The hook never auto-reconnects on transient 5xx — if Railway has a 30s
   blip and the stream errors, the hook bails and never retries. The `30s
   poll` backstop catches up but the realtime path is dead until the next
   page reload.

**Fix:** In dev mode, log the status; in production, surface to a debug
sink (Sentry breadcrumb or PostHog event) so operator-side debug has a
trail:

```typescript
if (!res.ok || !res.body) {
  if (import.meta.env.DEV) {
    console.warn('[useAgentStream] SSE open failed:', res.status)
  }
  // optional: schedule a retry with backoff on 5xx
  return
}
```

Also consider: add a setInterval reconnect (e.g., every 60s if not currently
connected) for the entire authenticated session lifetime.

---

## Low Severity

### L-01: `Math.random` UUID fallback in `voice.ts:486-491` is structurally unreachable but not pinned

**File:** `vigil-g2-plugin/src/screens/voice.ts:470-491`
**Severity:** LOW (defensive code with a sharp edge)

**Issue:** The UUID fallback chain is:
1. `crypto.randomUUID()` (modern browsers + Node 19+)
2. `crypto.getRandomValues()` + manual RFC 4122 formatting
3. `Math.random()` for hex digits — NOT cryptographically secure

The G2 plugin runs in iOS WebView (Safari 14+); both modern Safari and
Node 19+ have `crypto.randomUUID`. The Math.random fallback is structurally
unreachable in any supported runtime — but if reached, it produces predictable
UUIDs that could collide AND that an attacker could forecast. The console.warn
at line 485 makes the fallback observable, but there's no test pinning that
this path is impossible.

Worse: a dev-preview bridge running in a non-Vite test context could
hypothetically hit the fallback (e.g., a stripped-down JSDOM without crypto
polyfill).

**Fix:** Make the fallback a hard error instead — if neither `crypto.randomUUID`
nor `crypto.getRandomValues` is available, throw and force the operator to
report a runtime they can't actually reach in production:

```typescript
console.error('[voice] no secure crypto API available — refusing to generate UUID')
throw new Error('SECURE_RANDOM_UNAVAILABLE')
```

The caller (`toggleVoiceRecording` START path) already runs inside a try/catch
at main.ts:402 via the `void (async () => {...})()` block; an unhandled rejection
is acceptable here (it's a fatal misconfiguration, not a recoverable error).

---

### L-02: `runTriageFn` in voice-transcribe is fire-and-forget — failure is invisible

**File:** `vigil-core/src/routes/voice-transcribe.ts:74-107` + `250`
**Severity:** LOW (mirrors process-audio.ts pattern; acceptable but observability gap)

**Issue:** The triage IIFE catches errors and console.error's them:

```typescript
} catch (err) {
  console.error(
    "[vigil-core] /v1/voice/transcribe triage failed (non-fatal):",
    err,
  );
}
```

A console.error in a fire-and-forget IIFE doesn't surface to:
- Sentry (no `captureToSentry` call)
- PostHog (no `captureException` call)
- The user (already returned 201)

The thought row is created without a category / taxonomy / triage decision
set. The next /v1/summary fetch will surface it as an "uncategorized" thought.
If triage fails for ALL voice captures (e.g., Anthropic outage), the operator's
dashboard fills with uncategorized rows — but Sentry / PostHog show nothing
because the route returned 201.

The same pattern exists in process-audio.ts:171-194 (per the route's comment),
so this is project convention. But the convention has a real observability
gap.

**Fix:** Add a Sentry/PostHog hook in the catch:

```typescript
} catch (err) {
  console.error(/* ... */);
  captureException(userId, err, {
    route: '/v1/voice/transcribe',
    method: 'triage',
  });
}
```

---

### L-03: `useAgentStream` parses `event:` line but never reads `data:` — payload optimization opportunity skipped

**File:** `vigil-pwa/src/hooks/useAgentStream.ts:99-118`
**Severity:** LOW (correctness + perf)

**Issue:** The SSE parser walks each line of a frame but only extracts the
`event:` field:

```typescript
for (const line of lines) {
  if (line.startsWith('event:')) event = line.slice(6).trim()
}
if (event === 'thought-created') {
  window.dispatchEvent(new CustomEvent('vigil:thought-created'))
}
```

The comment at lines 104-108 explicitly says the `data` field is JSON
`{ thoughtId, content }` but is not forwarded — the listener does a fresh
`refetch()` instead. This is correct for current behavior but:

- The refetch costs a roundtrip + DB read for data that arrived in the SSE
  frame already.
- An optimization opportunity is documented but never taken.
- If a future SSE event-type needs the data (e.g., partial-transcript stream
  for "live show typing"), the parser doesn't have it.

Not a defect today, but the comment-as-todo lives in code with no JIRA / Roadmap
entry.

**Fix:** Track as a Phase 131+ candidate (or delete the comment if it'll
never happen).

---

### L-04: `agent-stream.ts` `dbAvailable` field is dead

**File:** `vigil-core/src/routes/agent-stream.ts:55-93`
**Severity:** LOW (dead code)

**Issue:** `AgentStreamDeps.dbAvailable: boolean` is declared in the interface
(line 55) but never read in the route body. The production singleton wires
it (`get dbAvailable() { return !!db; }` at line 233), but the value is
never checked. SSE handlers run unconditionally; the only DB access is via
`dbReplayMissed` (which already handles `!db` internally) and `dbGetQuietMode`
(which also handles `!db`).

**Fix:** Remove `dbAvailable` from `AgentStreamDeps` and the singleton.

---

### L-05: `safeAudioControl` cleanup hooks register on FIRST `true` call only — never re-arm on subsequent recordings

**File:** `vigil-g2-plugin/src/lib/audio-session-guard.ts:84-155`
**Severity:** LOW (intentional design per Phase 127 — but no test pins the "never unregister" claim)

**Issue:** The idempotency guard at line 84 (`if (!cleanupRegistered && on)`)
ensures the four cleanup hooks register exactly once. The design relies on
the hooks staying alive for the plugin's entire JS lifetime. There's no
unregister path — the hooks always fire on ABNORMAL_EXIT / SYSTEM_EXIT /
beforeunload / onBackgroundRestore regardless of whether voice recording is
currently active.

This is fine, but: the hooks check `if (audioActive)` before calling
`bridge.audioControl(false)`. If `audioActive` is incorrectly out of sync
(e.g., the plugin reloads but the underlying mic state is still open from
a previous session), the cleanup is a no-op. Phase 127 closed this via the
background-restore handler, but the chain depends on every cleanup-trigger
state correctly tracking `audioActive`.

The Run 4 hardening adds `safeAudioControl(false)` to the STOP path in
voice.ts:285. The STOP path sets `audioActive = false` (via the `audioActive = on`
line at 157). But if `bridge.audioControl(false)` throws after that line
(line 162: `return bridge.audioControl(on)`), the catch in voice.ts:286-288
swallows the error AND `audioActive` is already `false` — so the cleanup
hooks won't re-fire even though the mic might still be open.

In practice the SDK rarely throws on `audioControl(false)`, but the failure
mode is "mic stays open silently". The fix would require setting `audioActive`
AFTER awaiting the SDK ack:

```typescript
const result = await bridge.audioControl(on)
audioActive = on
return result
```

But that subtly changes the cleanup-hook semantics during a concurrent
abnormal-exit — out of scope for this review.

**Fix:** Track as Phase 131 hardening candidate. Document the audioActive
ordering as part of D-D3 drift detector.

---

### L-06: Voice screen elapsed counter is sampled on rebuild only — m:ss only updates on screen swipe

**File:** `vigil-g2-plugin/src/screens/voice.ts:510-518`
**Severity:** LOW (UX; reported as PASS in UAT Line 4 but the mechanism is unclear)

**Issue:** The `[REC m:ss]` counter is computed on every `buildVoiceScreen`
call from `Date.now() - recordingStartedAt`. There is no internal interval
timer to re-render — the screen only updates when:

- The carousel rebuilds (operator swipes).
- The `onStateChange` callback (after START / STOP transitions).
- The 60s refreshTimer in main.ts:176-179 fires.

So if the operator stays on the VOICE screen mid-recording without swiping,
the `m:ss` value displays whatever was rendered on the last START gesture
(typically `0:00`). It will NOT tick visibly. The operator perceives a frozen
counter.

UAT Line 4 reports the timer "ticked on Companion HUD during recording" (a
DIFFERENT screen) — that path works because main.ts:444's
`refreshCurrentScreen` fires every 60s and the Companion uses `computeBodyLine3`.

A user staring at the VOICE screen for a 30s utterance will see `[REC 0:00]`
for the entire duration. That contradicts the UI-SPEC implication of a
"live elapsed counter" (CONTEXT D-S1).

**Fix:** Add a `setInterval(() => onStateChange?.(), 1000)` while recording,
cleared on STOP. Defensive cleanup on unmount / process exit via the same
cleanup-hook chain.

---

## Info

### I-01: Inconsistent `audio_pcm` denylist key in BLOCKED_PROPERTY_NAMES

**File:** `vigil-core/src/analytics/posthog.ts:48-54`
**Severity:** INFO (defense-in-depth)

The denylist contains `audioPcm` (camelCase), `audio_pcm` (snake_case), `pcm`,
`audio`, `audioBuffer`, `audio_buffer`. Missing variants worth considering:
`pcm_data`, `audioData`, `audio_data`, `wav`, `wavData`, `wav_data`,
`rawAudio`, `raw_audio`, `base64Audio`, `base64_audio`. The voice-telemetry
shim names suggest `base64Audio` is a real property name used elsewhere in
the plugin (QueueEntry.base64Audio); even though the typed Props contract
prevents it from being passed, defense-in-depth on the server side is cheap.

### I-02: Vite test-portability cast in `api.ts` should be a project-wide pattern

**File:** `vigil-g2-plugin/src/api.ts:22-25`
**Severity:** INFO (refactor candidate)

The `import.meta.env` optional-chain through `unknown` is a one-line workaround
that should probably live in a `lib/env.ts` shim and be reused across the
plugin. Currently it's only in api.ts.

### I-03: `agent-stream.ts` `thoughtCreatedListener` does NOT pass `id:` field — SSE last-event-ID replay won't work for thought-created frames

**File:** `vigil-core/src/routes/agent-stream.ts:183-191`
**Severity:** INFO (intentional limitation; PWA refetch is source-of-truth)

The `agent-event` SSE frames carry `id: String(row.id)` so a reconnecting
client can resume with Last-Event-ID. The `thought-created` frames at line
187 have no `id:` field, so a missed thought-created during disconnect cannot
be replayed; the PWA's `useThoughts` 30s poll + the refetch-on-event pattern
backstops this. Documented as additive wiring.

### I-04: Phase 130 has 41 commits unpushed at UAT start — process gap, not code defect

**File:** N/A (process)
**Severity:** INFO (already captured in 130-HARDWARE-UAT.md as attempt-1 root cause)

The "Phase 130 Plans 02-06 sitting unpushed" UAT attempt 1 failure is captured
verbatim in the UAT runbook. Documenting here for completeness: the process
gap is that `/gsd:execute-phase` does not auto-push at plan-end. The same
class of error could happen on Phase 131. A pre-UAT checklist or a
push-on-plan-complete hook would close it.

---

## Out of Scope

Per the task brief:
- Performance (O(n²), memory leaks, inefficient queries) is out of v1 scope.
- The 4 follow-up gaps in 130-HARDWARE-UAT.md (GAP-130-FU1 through FU4)
  are NOT duplicated here.

---

_Reviewed: 2026-05-18T22:55:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
_Phase status post-review: production (UAT-attested PASS); review findings advisory_
