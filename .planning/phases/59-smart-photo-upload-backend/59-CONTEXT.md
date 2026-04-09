# Phase 59: Smart Photo Upload Backend — Context

**Gathered:** 2026-04-09
**Status:** Ready for research + planning
**Source:** /gsd-discuss-phase 59 (interactive)

<domain>
## Phase Boundary

Backend-only phase. Deliver a new `/process-photo` endpoint in vigil-core (Hono router, same conventions as existing routes) that:

1. Accepts a base64 image + mediaType (same payload shape as `/describe-image`)
2. Calls Claude vision once to detect paper type (lined vs gridded) AND verbatim-transcribe the handwriting in a single structured JSON response
3. Splits into multiple thought records for lined paper (one per distinct topic/bullet/paragraph — Claude's semantic judgment)
4. Returns a single thought record for gridded paper
5. Creates all thought rows in the database and returns them as `{paperType, confidence, thoughts: ThoughtApiResponse[]}`

**Out of scope (Phase 60):** dashboard UI for paper type override, confidence warnings, manual re-split. Phase 60 consumes the `paperType` and `confidence` fields this phase returns.
**Out of scope (Phase 61):** the folder watcher and Swift client wiring. Phase 61 calls this endpoint.
**Out of scope:** notarization, `.app` bundle, any changes to `/describe-image` or the existing Swift client.
</domain>

<decisions>
## Implementation Decisions

### D-01: New /process-photo endpoint — do not touch /describe-image
**Locked:** Add a new `POST /process-photo` route in vigil-core. The existing `/describe-image` endpoint and its response shape (`{description, descriptions[]}`) remain unchanged. The Swift client's `describeSubjects()` / `describe()` callers continue to work without modification.

Rationale: `/describe-image` is used by the current dashboard capture flow. Breaking its response shape would break the existing Swift client before Phase 61 updates it. Clean separation: `/describe-image` = legacy image-to-text, `/process-photo` = smart handwriting pipeline.

### D-02: One Claude vision call — detect paper type AND transcribe in a single prompt
**Locked:** Single `callClaudeMultimodal` call with a structured JSON prompt that asks Claude to:
- Identify paper type (lined/gridded/unknown)
- Assign confidence (0.0–1.0)
- Transcribe each distinct thought verbatim

Response format (from Claude, to be parsed with `parseAIJson`):
```json
{
  "paperType": "lined" | "gridded" | "unknown",
  "confidence": 0.0–1.0,
  "thoughts": ["verbatim text 1", "verbatim text 2", ...]
}
```

For lined: `thoughts[]` contains one entry per distinct topic, bullet, or numbered item — Claude uses semantic judgment.
For gridded: `thoughts[]` contains exactly one entry (the full transcription).
For unknown: treat same as lined (see D-04).

Use `maxTokens: 2000` (wider than `/describe-image`'s 1000 — verbatim transcription of a full page requires headroom).

### D-03: Backend creates thought records and returns them
**Locked:** `/process-photo` inserts all thought rows into the `thoughts` table and returns them as `thoughts: ThoughtApiResponse[]`. Response shape:

```json
{
  "paperType": "lined" | "gridded" | "unknown",
  "confidence": 0.95,
  "thoughts": [
    { "id": 1, "content": "verbatim text...", "source": "image", ... },
    ...
  ]
}
```

- `source` field on each created thought: `"image"` (existing valid value)
- `confidence` field on each created thought: populated with the paper-detection confidence value
- No `projectId` on creation — Phase 60 UX handles optional project assignment
- Use the same `toResponse()` helper from `thoughts.ts` to serialize created rows

### D-04: Low-confidence / ambiguous paper type → default to lined (split) behavior
**Locked:** If Claude returns `paperType: "unknown"` OR `confidence < 0.5`, treat as lined paper and split. Reasoning: a false-gridded collapse would silently merge multiple distinct thoughts into one, which is worse than over-splitting. The `confidence` value in the response lets Phase 60 surface a "we weren't sure about paper type" indicator to the user.

Threshold: `confidence < 0.5` → treat as lined.

### D-05: Verbatim transcription — semantic splitting for lined paper
**Locked:** Prompt instructs Claude to split at each distinct topic, bullet point, or numbered item using semantic judgment. No hard line-count cap. This reflects real usage: a sticky note might have 3 items, a page of notes might have 15.

Prompt must explicitly prohibit:
- Third-person rewriting ("The user notes that...")
- Paraphrasing or summarizing
- Editorial additions ("This seems to be about...")

Verbatim means: the exact words written, first-person if written first-person, preserving the original phrasing.

### D-06: paperType not stored on thoughts table — response only
**Locked:** No new migration for a `paper_type` column. The `paperType` and `confidence` fields exist only in the `/process-photo` response. The `confidence` value IS stored on the thought row (the `confidence` column already exists on the schema — populate it with the paper-detection confidence). `paperType` itself is ephemeral — Phase 60 can display it from the response, no need to query by it later.

### D-07: Route file location and mounting
**Locked:** New file `vigil-core/src/routes/process-photo.ts`, following the exact same Hono router pattern as `describe-image.ts`. Mount in `vigil-core/src/index.ts` alongside the other routes. Auth middleware applies (bearer token required, same as all other routes).

### D-08: Error handling contract
**Locked:** Match `/describe-image` error patterns:
- 400 — missing/invalid `image` or `mediaType`
- 503 — AI client not configured
- 502 — Claude call failed
- 500 — DB insert failed

On Claude parse failure (malformed JSON from AI): fall back to treating the raw text as a single lined thought (don't 502 — a partial result is better than an error for a capture tool).

### D-09: Smoke test suite
**Locked:** Test file at `vigil-core/src/routes/process-photo.test.ts` (or similar). Minimum coverage:
- One lined-paper sample (assert multiple thoughts returned, verbatim content)
- One gridded-paper sample (assert exactly one thought returned)
- One ambiguous/blank sample (assert falls back to lined behavior, confidence < 0.5)

Use test fixtures (small base64 images or mocked Claude responses) — do NOT require a live Claude API call for the test suite.
</decisions>

<canonical_refs>
## Files Downstream Agents Must Read

**Vigil Core backend (primary workspace):**
- `vigil-core/src/routes/describe-image.ts` — existing image endpoint to mirror patterns from
- `vigil-core/src/routes/thoughts.ts` — `toResponse()` helper, POST handler, VALID_SOURCES pattern
- `vigil-core/src/db/schema.ts` — thoughts table schema (confidence column, source column, projectId)
- `vigil-core/src/ai/client.ts` — `callClaudeMultimodal`, `parseAIJson`, `getAIClient` exports
- `vigil-core/src/index.ts` — route mounting pattern
- `vigil-core/src/middleware/auth.ts` — bearer auth middleware

**Requirements:**
- `.planning/REQUIREMENTS.md` — PHOTO-01, PHOTO-02, PHOTO-03, PHOTO-04

**Project context:**
- `.planning/PROJECT.md` — core value and principles
</canonical_refs>

<deferred>
## Deferred Ideas (out of scope for Phase 59)

- Paper type override param on `/process-photo` — caller passes `paperType: "lined" | "gridded"` to skip detection (useful for Phase 61 if the watcher can infer type from filename/folder). Deferred to Phase 61 discussion.
- Re-split endpoint — given an existing thought ID, re-run the split logic differently. Deferred to Phase 60 or later.
- Storing `paperType` on the thoughts table for future filter queries. Deferred; revisit if Phase 60 needs it.
</deferred>
