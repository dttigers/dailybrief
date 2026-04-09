# Phase 59: Smart Photo Upload Backend — Research

**Researched:** 2026-04-09
**Domain:** Claude vision prompt engineering, Hono route plumbing, Drizzle inserts, test fixture strategy
**Confidence:** HIGH for codebase/integration, MEDIUM for prompt wording (verified only on bench, not real Claude calls), MEDIUM for model choice

---

## Overview

Phase 59 adds a single new Hono route `POST /v1/process-photo` to `vigil-core` that accepts the same `{image, mediaType}` payload as `/describe-image`, makes ONE Claude vision call to simultaneously detect paper type (lined/gridded/unknown) and verbatim-transcribe the handwriting into a `thoughts[]` array, creates one or more rows in the `thoughts` table, and returns `{paperType, confidence, thoughts: ThoughtApiResponse[]}`.

The backend plumbing is trivial — every piece (multimodal Claude call, JSON fence-tolerant parser, `toResponse()` serializer, bearer auth, 400/502/503 error contract) already exists in the codebase and can be reused verbatim. The ONLY real engineering risk is the Claude vision prompt: it must (a) reliably distinguish lined vs gridded paper in one shot, (b) produce a single JSON object that `parseAIJson` can handle, and (c) resist Claude's ingrained tendency to paraphrase, third-person-rewrite, or editorialize handwritten notes.

**Primary recommendation:** Write the new endpoint as a near-clone of `describe-image.ts` with a different prompt and a different response-shaping step. Use the existing `callClaudeMultimodal` + `parseAIJson` pipeline (do NOT adopt Anthropic's new `output_config.format` structured-outputs feature in this phase — see P-8). Keep the current pinned model (`claude-sonnet-4-20250514`). Put the prompt in a named constant at the top of the file so it can be iterated on without touching the handler body. Smoke tests use mocked Claude responses via a test-only injection point; no live API calls.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New `POST /process-photo` route — do NOT modify `/describe-image` or its response shape. Clean separation: `/describe-image` = legacy, `/process-photo` = smart handwriting pipeline.
- **D-02:** ONE `callClaudeMultimodal` call combining paper-type detect + verbatim transcribe in a single structured JSON response `{paperType, confidence, thoughts[]}`. Use `maxTokens: 2000`.
- **D-03:** Backend creates thought rows and returns them. Response is `{paperType, confidence, thoughts: ThoughtApiResponse[]}`. Each created thought has `source: "image"`, its `confidence` column populated with the paper-detection confidence, and no `projectId`. Serialize created rows with `toResponse()` from `thoughts.ts`.
- **D-04:** Low confidence or unknown → default to lined (split) behavior. Threshold: `confidence < 0.5` treats as lined. Rationale: false-gridded collapse is worse than over-splitting.
- **D-05:** Semantic splitting for lined paper — Claude's judgment, no hard cap. Prompt must explicitly prohibit third-person rewriting, paraphrasing, and editorial additions.
- **D-06:** `paperType` NOT stored on schema. Only the `confidence` value is persisted (reusing the existing `thoughts.confidence` column). No new migration.
- **D-07:** New file `vigil-core/src/routes/process-photo.ts` mirroring `describe-image.ts` Hono pattern. Mount in `vigil-core/src/index.ts` alongside siblings. Bearer auth applies automatically via the existing `/v1/*` middleware.
- **D-08:** Error contract: 400 (missing/invalid image or mediaType), 503 (AI client not configured), 502 (Claude call failed), 500 (DB insert failed). On Claude JSON parse failure, fall back to treating the raw text as a single lined thought — do NOT 502.
- **D-09:** Smoke test file at `vigil-core/src/routes/process-photo.test.ts` (or similar). Coverage: lined sample → multiple thoughts + verbatim content, gridded sample → exactly one thought, ambiguous sample → falls back to lined with confidence < 0.5. Use fixtures or mocked Claude responses — NO live API call.

### Claude's Discretion

- Exact prompt wording (within the constraints of D-05)
- Internal helper structure (constants, types, parsing helpers)
- Test fixture mechanism (mock injection vs fixture files vs inline stubs)

### Deferred Ideas (OUT OF SCOPE)

- `paperType` override query param on `/process-photo` — deferred to Phase 61 if the watcher needs it
- Re-split endpoint — deferred to Phase 60+
- Storing `paperType` on the thoughts table — deferred; revisit if Phase 60 needs it
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PHOTO-01 | Detect lined vs gridded before extracting content | Prompt includes paper-type detection step with confidence score (see Prompt Design § A) |
| PHOTO-02 | Lined → multiple thoughts (one per line/bullet/paragraph) | Prompt instructs semantic splitting; loop inserts one thought row per array entry (see § Existing Code to Reuse) |
| PHOTO-03 | Gridded → single thought, project-assignable later | Prompt instructs `thoughts[]` length === 1 for gridded; `projectId` left null on creation (D-03) |
| PHOTO-04 | Verbatim transcription — no paraphrase, no third-person, no editorial | Prompt contains explicit prohibitions + positive framing; Anthropic cookbook precedent uses minimal directive (see § Verbatim Transcription Techniques) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` does NOT exist at the repo root. No project-wide coding directives to honor beyond the conventions already encoded in the existing vigil-core route files. (Verified: `Read` returned "File does not exist" for the root-level CLAUDE.md.) `[VERIFIED: Read tool]`

---

## Existing code to reuse (concrete file refs + what to copy)

This phase is 90% plumbing that already exists. Everything below has been read and verified.

### 1. `vigil-core/src/routes/describe-image.ts` — the template to clone

Lines 1–98. The new `process-photo.ts` should be a structural near-clone:

- **Lines 1–4:** Hono import + `callClaudeMultimodal, getAIClient, parseAIJson` import + `export const processPhoto = new Hono();`
- **Lines 6–13:** `VALID_MEDIA_TYPES` constant and `MediaType` type — copy verbatim.
- **Lines 16–46:** Body parsing, `image`/`mediaType` validation, and the 503-gate on `getAIClient()`. All five validation branches return 400 with the exact error shapes already used. Copy verbatim, only change the route path from `/describe-image` to `/process-photo`.
- **Lines 48–69:** The `callClaudeMultimodal` call shape — same `content` array with `{type: "image", source: {type: "base64", media_type, data}}` followed by `{type: "text", text: PROMPT}`. Only two things change: the prompt text, and `maxTokens: 1000 → 2000` (per D-02).
- **Lines 71–90:** The parse-and-recover block. The new file's version must (a) parse into the `{paperType, confidence, thoughts}` object instead of an array, (b) on parse failure fall back to a single lined thought using `rawText.trim()` as the content (per D-08), and (c) NOT 502 on parse failure.
- **Lines 93–97:** Error shape — `{error: message}` at 502 for Claude-call failures. Copy verbatim.

### 2. `vigil-core/src/routes/thoughts.ts` — `toResponse()` and the POST pattern

- **Lines 18–34:** `ThoughtApiResponse` interface. Import it or redeclare the shape (the interface is not currently exported — the planner should decide whether to export it from `thoughts.ts` or duplicate the type in `process-photo.ts`. Exporting is cleaner.)
- **Lines 36–54:** `toResponse(row: DrizzleThought): ThoughtApiResponse` helper. Not currently exported — the planner must export it and import it into `process-photo.ts`. Do NOT reimplement.
- **Lines 8:** `VALID_SOURCES = ["text", "voice", "image"] as const` — confirms `"image"` is already a valid source (D-03).
- **Lines 227–236:** The insert pattern:
  ```ts
  const [created] = await db
    .insert(thoughtsTable)
    .values({
      content: content.trim(),
      source,
      category: category ?? null,
      tags: tags && Array.isArray(tags) ? tags : null,
      cloudKitRecordID: crypto.randomUUID(),
    })
    .returning();
  ```
  The new endpoint needs the same pattern but with `source: "image"` hard-coded and `confidence: paperConfidence` added. It must run this insert in a loop (once per `thoughts[]` entry) OR do a batched `db.insert(...).values([row1, row2, ...]).returning()`. Drizzle supports the batched form — preferred for atomicity and fewer round-trips. `[VERIFIED: drizzle-orm docs + usage patterns in the codebase]`

### 3. `vigil-core/src/ai/client.ts` — the AI pipeline

- **Lines 68–90:** `callClaudeMultimodal({system?, content, maxTokens})` — the exact function to call. Note that `system` is optional. For this phase, putting the verbatim-transcription instructions in the `text` content block (alongside the image) is the pattern `describe-image.ts` already uses. A `system` prompt is OPTIONAL and probably unnecessary — keep parity with `describe-image`.
- **Lines 101–109:** `parseAIJson<T>(raw)` — trims the string, matches the FIRST ```...``` fenced block via regex, and `JSON.parse`s the body. **Known weakness:** the regex only captures the first fenced block and does NOT strip leading explanatory prose that appears OUTSIDE a fenced block. If Claude responds with `"Here is the JSON: {..."}` and no fences, `parseAIJson` will throw. This is why the prompt must end with the explicit "Return ONLY the JSON object, no other text, no markdown" instruction that every other Claude route uses. Even then, the D-08 fallback (parse failure → single lined thought) is the safety net. `[VERIFIED: Read src/ai/client.ts lines 101–109]`
- **Line 28/52/76:** Model is pinned to `claude-sonnet-4-20250514` via env override `CLAUDE_MODEL`. See § Claude Model Selection.

### 4. `vigil-core/src/db/schema.ts` — thoughts table

- **Lines 39–70:** `thoughts` pgTable. Confirms:
  - `confidence: doublePrecision("confidence")` — nullable, will hold the paper-type detection confidence (D-03/D-06)
  - `source: text("source").notNull()` — accepts `"image"`
  - `projectId: integer("project_id")` — nullable, left null at creation (D-03)
  - `cloudKitRecordID: text(...).notNull().unique()` — must set via `crypto.randomUUID()` on insert (copied pattern)
  - `syncStatus` defaults to `"pending"`, `createdAt`/`modifiedAt` default to now — no need to set explicitly
  - **NO `paperType` column** — confirms D-06 requires no migration. `[VERIFIED: Read src/db/schema.ts]`

### 5. `vigil-core/src/index.ts` — route mounting

- **Line 20 / 76:** import and `app.route("/v1", describeImage)`. Add two lines mirroring this exactly: `import { processPhoto } from "./routes/process-photo.js";` and `app.route("/v1", processPhoto);`. Auth middleware (lines 59–62) already covers all `/v1/*` routes except `/v1/health`, so no auth wiring needed.

### 6. `vigil-core/src/middleware/auth.ts` — bearer auth

- Already wired globally via `app.use("/v1/*", ...)` in `index.ts`. The new route gets bearer-token protection for free. No action required. `[VERIFIED: Read src/middleware/auth.ts + src/index.ts]`

### 7. Drizzle dependency versions (`vigil-core/package.json`)

- `drizzle-orm: ^0.45.2`, `hono: ^4.7.0`, `@anthropic-ai/sdk: ^0.82.0`, `postgres: ^3.4.9`, `tsx: ^4.19.0`. No new dependencies needed for this phase. `[VERIFIED: Read package.json]`

---

## Claude vision prompt design (the biggest risk — be thorough)

### Design goals

A single prompt must do four jobs at once:

1. Classify paper type (lined / gridded / unknown) with a confidence score
2. Transcribe handwriting verbatim — no paraphrase, no third-person, no editorial
3. For lined paper, split output semantically by topic/bullet/line
4. Return clean JSON that `parseAIJson` can handle

The biggest failure mode is Claude's trained tendency to be a "helpful assistant" — it will happily rewrite "need to call mom" as "The user needs to contact their mother" unless the prompt fights hard against it.

### Recommended prompt shape (for Claude's discretion to iterate on)

```
You are an OCR engine, not an assistant. Your job is to transcribe handwritten
notes from an image EXACTLY as written, and to identify the paper type.

STEP 1 — PAPER TYPE:
Look at the background of the paper. Classify it as one of:
  - "lined":   horizontal ruled lines (notebook paper, legal pad, steno pad,
               loose-leaf, sticky note with lines, planner pages)
  - "gridded": a grid of squares or dots (engineering pad, graph paper,
               bullet journal, dot-grid notebook, Rhodia dot pad)
  - "unknown": blank paper, whiteboard, unclear, or the photo is too dark /
               blurry to tell

Assign a confidence value from 0.0 to 1.0 reflecting how certain you are of
the paper type. Confidence below 0.5 means you are guessing.

STEP 2 — TRANSCRIBE VERBATIM:
Transcribe the handwritten text EXACTLY as it appears. This is a transcription,
not a summary. Follow these rules without exception:

  - Use the writer's EXACT words. If the note says "call mom", output
    "call mom" — NOT "Call your mother" or "The user should call their mother".
  - Preserve first-person voice. If the writer wrote "I need to", keep "I need to".
  - Do NOT add editorial framing like "This note is about..." or "The writer
    mentions...". You are not describing the notes — you ARE the notes.
  - Do NOT paraphrase, summarize, or "clean up" phrasing.
  - Do NOT correct spelling or grammar unless the letter shapes are clearly
    ambiguous; if the writer wrote "recieve", output "recieve".
  - If a word is unreadable, output [illegible] for that word only.
  - Preserve bullet markers, dashes, numbering, and checkboxes as text
    (e.g., "- " or "1. " or "[ ] ").

STEP 3 — SPLIT OR DON'T SPLIT:

  If paperType is "lined": split the transcription into separate thoughts,
  ONE thought per distinct topic, bullet, numbered item, or paragraph. Use
  semantic judgment — two short lines about the same idea are ONE thought;
  a bullet list of five errands is FIVE thoughts. Do not split mid-sentence.
  Do not split at every newline — split at meaning boundaries.

  If paperType is "gridded": return the entire transcription as a SINGLE
  thought. Gridded paper is for extended writing (design notes, diary,
  meeting notes) and should not be fragmented. The thoughts array must
  have exactly one entry.

  If paperType is "unknown": treat as lined and split.

OUTPUT FORMAT:
Return ONLY a single JSON object. No markdown code fences. No explanatory
text before or after. No "Here is the JSON:" preamble. Just the object:

{
  "paperType": "lined" | "gridded" | "unknown",
  "confidence": 0.0,
  "thoughts": ["verbatim text 1", "verbatim text 2"]
}
```

### Prompt structure rationale

- **"You are an OCR engine, not an assistant"** — explicit role override. Anthropic's cookbook uses the even more minimal `"Transcribe this text. Only output the text and nothing else."` which produces good verbatim results, but it does not cover paper classification, splitting, or JSON structuring, so a longer prompt is unavoidable here. `[CITED: https://platform.claude.com/cookbook/multimodal-how-to-transcribe-text]`
- **Numbered steps (STEP 1/2/3)** — Chain-of-thought nudging in the prompt structure encourages Claude to actually perform paper-type detection before transcribing, rather than hallucinating a paperType at the end. `[CITED: platform.claude.com prompt-engineering docs]`
- **Concrete example inside the verbatim rule** — Showing "call mom" → "call mom" (not "Call your mother") is the single most effective anti-paraphrase technique. Negative instructions alone ("don't paraphrase") are weaker than a positive example + the prohibition.
- **`[illegible]` sentinel** — Gives Claude an explicit escape hatch so it does not hallucinate text when it cannot read a word. Without this, Claude invents plausible-sounding content.
- **Explicit "no markdown code fences. No preamble."** — Every existing vigil-core AI route uses this phrasing (grep `parseAIJson` across `src/routes/`) because it's what actually works in practice. `parseAIJson` tolerates fenced blocks, but it does NOT tolerate leading prose, so the prompt must fight the preamble explicitly.

### What NOT to do in the prompt

- **Do NOT use a `system` prompt in addition to the user prompt.** The describe-image route doesn't, and splitting guidance across `system` and user makes it harder to iterate. Keep everything in one text block.
- **Do NOT specify a model temperature.** The SDK default is fine for this task. Lower temperatures do not meaningfully help transcription accuracy and can reduce paper-type detection quality on edge cases. `[ASSUMED]`
- **Do NOT ask Claude to explain its reasoning in the output.** Any "reasoning" field in the JSON becomes another place where it might paraphrase the notes. The prompt explicitly forbids any non-JSON output.

---

## Paper type detection heuristics

Claude is being asked to classify a visual property of paper that has strong, stable visual signatures. This is an easy task for a vision model — much easier than the transcription step.

### Reliable visual signals

| Signal | Means | Confidence weight |
|--------|-------|-------------------|
| Horizontal ruled lines, no vertical | Lined notebook/legal pad | HIGH |
| Square grid (cross-hatch) | Graph paper / engineering pad | HIGH |
| Dot grid (evenly-spaced dots) | Dot-grid notebook (Rhodia, Leuchtturm) | HIGH — treat as gridded |
| Horizontal lines + faint left margin line | College-ruled paper | HIGH — lined |
| No lines, no dots | Blank paper → unknown | LOW confidence |
| Whiteboard | Unknown → treat as lined | LOW confidence |
| Photo too dark / blurry to see background | Unknown | LOW — must flag |

**Important:** dot-grid paper should be classified as `"gridded"`, not `"unknown"`. Bullet-journalers and engineers use dot-grid for extended writing, which is exactly the "keep whole" use case of gridded paper. The prompt lists "Rhodia dot pad" explicitly to disambiguate.

### Ambiguous cases the prompt should handle

- **Photo taken at an angle** — lines visible but warped. Still identifiable. MEDIUM-HIGH confidence.
- **Close-up of a single bullet point** — background barely visible. Guess lined + low confidence.
- **Sticky notes** — some have lines (yellow lined stickies), some are blank. Classify by visible background; blank sticky → unknown → lined.
- **Photo of a whiteboard** — no paper at all. `unknown` + confidence ~0.2. Falls back to lined/split, which is the right behavior for whiteboard brainstorms.

### Confidence threshold calibration

D-04 locks `confidence < 0.5` → treat as lined. The prompt teaches Claude that 0.5 is the "I'm guessing" line. In practice, Claude tends to over-state confidence on classification tasks; 0.5 is a pragmatic floor. `[ASSUMED — not measured against this specific task]`

---

## Verbatim transcription techniques

This is where phases like this usually fail. Claude is a helpful assistant by default — its instinct is to clean up, summarize, and rewrite.

### What the Anthropic cookbook does

The official Anthropic cookbook recipe for handwriting transcription uses the minimal prompt:

> "Transcribe this text. Only output the text and nothing else."

…with `claude-opus-4-1` and `max_tokens: 2048`. No system prompt. No rules. `[CITED: https://platform.claude.com/cookbook/multimodal-how-to-transcribe-text]`

This works for pure transcription but is insufficient for our phase because we also need paper type, confidence, and splitting. The techniques below layer on top of the cookbook's minimal-prompt approach.

### Techniques that prevent paraphrasing

1. **Redefine Claude's role.** "You are an OCR engine, not an assistant." Explicit anti-helpfulness framing. `[ASSUMED — widely-reported pattern in prompt engineering communities, not formally benchmarked]`

2. **Give a concrete counter-example.** Show the wrong behavior AND the right one:
   > If the note says "call mom", output "call mom" — NOT "Call your mother".

3. **Use the word "exactly".** "EXACTLY as written." Capitalization adds emphasis that Claude reliably picks up on. `[CITED: platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview]`

4. **Forbid specific rewrite patterns by name.** List the exact bad patterns: "third-person rewriting", "editorial framing", "paraphrasing", "summarizing". Naming the failure modes is more effective than a generic "be faithful".

5. **Provide an escape hatch.** `[illegible]` for unreadable words. Without this, Claude will invent rather than admit uncertainty.

6. **Frame transcription as "being the notes" not "describing the notes."** "You are not describing the notes — you ARE the notes." This subtle reframe moves Claude from observer mode to reproduction mode.

### What does NOT work

- **"Be accurate"** — too vague. Claude thinks paraphrase IS accurate.
- **"Preserve original meaning"** — Claude interprets meaning-preservation as license to rephrase.
- **Tool use / function calling for the verbatim field alone** — schema enforcement makes JSON structure valid but does NOT prevent the content inside a string field from being paraphrased.
- **Low temperature** — does not meaningfully affect paraphrase tendency. `[ASSUMED]`

### Copyright refusal edge case

Claude 3 Opus historically declined requests that included "read the text verbatim" when the text appeared to be copyrighted published material. Handwritten personal notes are unambiguously non-copyrighted, so this is unlikely to trigger — but it's a known-unknown worth being aware of if testing ever includes a photo of, say, a quote from a book copied onto lined paper. `[CITED: handwritingocr.com blog]`

---

## JSON output structure and parsing

### Target response shape from Claude

```json
{
  "paperType": "lined",
  "confidence": 0.92,
  "thoughts": [
    "- call mom",
    "- pick up prescription",
    "- email dave about Thursday"
  ]
}
```

### Parsing pipeline inside the route handler

1. `callClaudeMultimodal(...)` returns `rawText: string`
2. `parseAIJson<{paperType: string; confidence: number; thoughts: string[]}>(rawText)` — strips the first fenced block if present, then `JSON.parse`s
3. Validate the parsed object:
   - `paperType` must be `"lined"`, `"gridded"`, or `"unknown"` (default `"unknown"` if missing)
   - `confidence` must be a number in [0,1] (default `0` if missing/invalid)
   - `thoughts` must be a non-empty array of strings (each trimmed)
4. Apply the D-04 coercion: if `paperType === "unknown"` OR `confidence < 0.5`, set effective behavior to lined (split). For gridded with `thoughts.length > 1`, concatenate into one entry (defensive — the prompt should prevent this but belt-and-suspenders).
5. Insert `thoughts` rows into the DB with `source: "image"`, `confidence: confidence` (the paper-detection number), `cloudKitRecordID: crypto.randomUUID()`.
6. Return `{paperType, confidence, thoughts: rows.map(toResponse)}`.

### Failure-mode handling (D-08)

| Failure | Action | HTTP code |
|---------|--------|-----------|
| `body.image` missing/invalid | Reject | 400 |
| `body.mediaType` missing/invalid | Reject | 400 |
| `getAIClient()` returns null | Reject | 503 |
| `callClaudeMultimodal` throws (network, Anthropic API error) | Reject | 502 |
| `parseAIJson` throws (malformed JSON) | **Fallback**: create ONE lined thought with content = `rawText.trim()`, paperType = `"unknown"`, confidence = `0` | 201 with fallback payload |
| DB insert throws | Reject | 500 |

The parse-failure fallback is critical per D-08: "a partial result is better than an error for a capture tool." The raw Claude text — even if not JSON — is still the user's transcribed note. Losing it to a 502 would lose their capture.

### parseAIJson behavior — exact current implementation

From `src/ai/client.ts` lines 101–109:

```ts
export function parseAIJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(
    /```(?:[a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)\n?\s*```/
  );
  const cleaned = fenceMatch ? fenceMatch[1].trim() : trimmed;
  return JSON.parse(cleaned) as T;
}
```

**What it handles:**
- ` ```json\n{...}\n``` ` — yes, the fence is stripped
- ` ```\n{...}\n``` ` — yes, unlabeled fences
- `{...}` — yes, no fences needed
- Extra whitespace — yes, trimmed

**What it does NOT handle:**
- `"Here is the JSON: {...}"` — the leading prose breaks `JSON.parse`. The prompt MUST forbid preambles.
- Multiple fenced blocks — only the FIRST is extracted.
- `{...} and here's why:` — trailing text breaks parsing if unfenced.
- Unterminated JSON (truncated output) — throws. If `maxTokens: 2000` is insufficient for a very dense page, this becomes a real failure case. D-08 fallback catches it.

`[VERIFIED: Read src/ai/client.ts directly]`

### Should we adopt Anthropic's new structured outputs feature?

**No — not in this phase.** Anthropic now offers `output_config.format` with `type: "json_schema"` for constrained decoding that guarantees valid JSON. This is real, GA, and supported in `@anthropic-ai/sdk`. However:

- **It is only supported on Claude Opus 4.6, Sonnet 4.6, Sonnet 4.5, Opus 4.5, Haiku 4.5.** The vigil-core default model is `claude-sonnet-4-20250514` (Sonnet 4) which is NOT in the supported list. `[CITED: https://platform.claude.com/docs/en/build-with-claude/structured-outputs]`
- Adopting structured outputs would require bumping the model version, which affects every other route (`triage`, `therapy`, `insights`, `prioritize`, `describe-image`, `chat`, `summary`, `affirmation`, `brief`). That's a phase-wide change and should be decided separately, not smuggled in as part of PHOTO.
- The D-08 parse-failure fallback already provides a safety net for malformed JSON. Structured outputs would only reduce how often that fallback fires, not change the contract.
- Structured outputs only constrain STRUCTURE, not CONTENT. It does NOT help with the verbatim-transcription problem, which is the actual risk.

**Recommendation:** Note this as a future improvement but do NOT include in Phase 59 scope. `[VERIFIED via Anthropic docs fetch]`

---

## Claude model selection

### Current state

`vigil-core/src/ai/client.ts` lines 28, 52, 76: model is `process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514"`. This is Claude Sonnet 4 (May 2025). `[VERIFIED: Read src/ai/client.ts]`

### Should we switch models for /process-photo?

**No.** Keep the pinned default. Reasons:

- Claude Sonnet 4 handles handwriting transcription well (the Anthropic cookbook demonstrates `claude-opus-4-1` but also notes that Sonnet-class models "accurately transcribe text from imperfect images" — it's a supported use case on Sonnet). `[CITED: anthropic.com/news/claude-3-5-sonnet]`
- Using a different model for just this one route creates inconsistency and makes cost/latency reasoning harder.
- The `CLAUDE_MODEL` env var is the correct escape hatch if production testing ever reveals Sonnet 4 is insufficient. The user can bump via Railway env var without a code change.
- Opus models are ~5x more expensive per token and ~3x slower. For a capture-flow endpoint where latency matters (user is waiting on the capture round-trip), Sonnet is the right tradeoff. `[ASSUMED — based on Anthropic public pricing]`

### Cost/latency envelope (rough)

- A typical handwritten page photo is ~1–2MB base64 → ~1500 vision tokens
- Prompt text: ~500 tokens
- Max output: 2000 tokens (per D-02)
- Sonnet 4 vision call latency: 2–5 seconds for this size payload `[ASSUMED — based on observed describe-image performance]`
- The Hono `timeout(30_000)` middleware (index.ts line 50) gives ample headroom

---

## Test fixture strategy

### The current state of testing in vigil-core

**There is no unit test framework in vigil-core.** Grep confirms:

- No `vitest`, `jest`, `node:test`, or `mocha` in `package.json` devDependencies `[VERIFIED: Read package.json]`
- No `*.test.ts` files in `vigil-core/src/` (glob returned only files inside `node_modules`) `[VERIFIED: Glob]`
- The only existing test mechanism is `scripts/smoke-test.ts` — a handwritten tsx script that hits a LIVE running API (local or production) via `fetch` and checks response shapes. Runs via `npm run smoke-test`. `[VERIFIED: Read scripts/smoke-test.ts]`

This is a significant wave-0 consideration. The phase must either:

**(A)** Add a real unit test framework (node's built-in `node:test` is the zero-dependency option; `vitest` is the typescript-ergonomic option), write `process-photo.test.ts` using it, and add a `test` script to package.json. This is clean but expands phase scope.

**(B)** Follow the existing smoke-test precedent: write a new script `scripts/smoke-test-process-photo.ts` that spins up the Hono app in-process (or hits a running instance) with pre-generated fixture payloads. Less clean but consistent with existing conventions.

**(C)** Hybrid: use `node:test` (zero dependencies, built into Node 22 which is the dev dep version pinned) for pure unit tests of the parse-and-validate logic, and extend the smoke-test script for end-to-end coverage against a running instance.

**Recommendation: (C) hybrid.** Use `node:test` for the pure parsing/validation/fallback logic (no live Claude call, no live DB), and extend the existing `smoke-test.ts` with a `testProcessPhoto()` suite that sends a fixture image to a running instance and checks response shape. `node:test` is already available (Node 22+ has it built in — no dep install), and `tsx` already handles TS execution.

### How to test without a live Claude API call

The Claude call happens inside `callClaudeMultimodal`, which is a module-level function in `src/ai/client.ts`. Options:

1. **Dependency injection** — refactor `process-photo.ts` to accept a Claude-call function via a factory, then pass a stub in tests. Clean but touches the route signature.
2. **Module mocking** — `node:test` has a `mock.module` helper (Node 22.3+). Stub the module import in the test file.
3. **Internal helper extraction** — extract the pure logic (prompt building, parseAIJson wrapping, D-04 coercion, fallback handling) into a helper function like `processClaudeResponse(rawText: string): {paperType, confidence, thoughts: string[]}` and test THAT helper directly with hand-crafted `rawText` strings. The route handler becomes a thin shell that calls Claude, calls the helper, inserts, and returns. This is the cleanest approach and makes testing trivial.

**Recommendation: option 3 (extract pure helper).** It:
- Requires no DI refactor
- Needs no module mocking infrastructure
- Tests the highest-risk logic (parsing, validation, fallback) directly with string inputs
- Lets the "smoke test with live API" suite cover the end-to-end integration separately

### Fixtures needed

Per D-09, minimum three test fixtures:

| Fixture | Shape | Expected route behavior |
|---------|-------|------------------------|
| Lined sample | Hand-crafted `rawText` string representing Claude's JSON response with `paperType: "lined"`, `confidence: 0.92`, `thoughts: ["- call mom", "- pay rent", "- email dave"]` | Helper returns 3 thoughts; route inserts 3 rows |
| Gridded sample | `paperType: "gridded"`, `confidence: 0.88`, `thoughts: ["Long design note about system architecture..."]` | Helper returns 1 thought; route inserts 1 row |
| Ambiguous sample | `paperType: "unknown"`, `confidence: 0.3`, `thoughts: ["- item 1", "- item 2"]` | Helper returns 2 thoughts (lined fallback via D-04) |
| Parse-failure sample | `rawText = "Here's what I see: a shopping list"` (non-JSON prose) | Helper returns 1 thought with content = the raw text (D-08 fallback), paperType = "unknown", confidence = 0 |
| Verbatim regression sample | `thoughts: ["I need to call mom"]` — assert exact string equality, no rewriting | Helper preserves the string exactly |

### Do we need real base64 images?

For the pure-helper unit tests: NO. The helper only sees `rawText` strings. Pure TypeScript, no image bytes needed.

For the live-API smoke test (optional): YES, a small base64 image of a known handwritten sample. Store as `vigil-core/test/fixtures/lined-sample.jpg.base64.txt` (small, ~50KB). But this requires a real Anthropic key in the environment, so it should NOT be part of the default `npm test` run — it belongs in the existing `smoke-test.ts` which already gates on `API_KEY`.

---

## Pitfalls (numbered, each with mitigation)

### P-1: Claude paraphrasing despite explicit instructions

**What goes wrong:** Claude rewrites "call mom" as "Call your mother" or "The user needs to call their mother." The verbatim requirement (PHOTO-04) fails.

**Why it happens:** Claude is RLHF-trained to be helpful. "Helpful" includes cleaning up grammar, expanding abbreviations, and rephrasing for clarity. This instinct competes with explicit instructions.

**Mitigation:** Use the concrete counter-example pattern in the prompt ("If the note says 'call mom', output 'call mom' — NOT 'Call your mother'"). Reframe Claude's role ("You are an OCR engine, not an assistant"). Add a verbatim regression test that asserts exact string equality on a sample with idiomatic phrasing that would be TEMPTING to rewrite.

### P-2: parseAIJson choking on Claude's preamble

**What goes wrong:** Claude responds `Here's the JSON from the image:\n\n{...}` and `parseAIJson` throws because the leading "Here's the JSON" is outside any fence.

**Why it happens:** `parseAIJson` only extracts the FIRST fenced block. If the response has no fences and has prose before the JSON, `JSON.parse` fails.

**Mitigation:** (a) Prompt MUST include "Return ONLY a single JSON object. No markdown code fences. No explanatory text before or after. No 'Here is the JSON:' preamble." (b) D-08 fallback catches any remaining failures. (c) Verify the prompt works in a live sanity check during implementation.

### P-3: Claude returning `{...}` wrapped in TWO fenced blocks (e.g., for "reasoning" + "output")

**What goes wrong:** `parseAIJson` extracts the first block, which is narrative, not JSON, and throws.

**Why it happens:** Claude sometimes "shows its work" with a reasoning block before the answer block.

**Mitigation:** Explicit "no reasoning, no explanations" in the prompt. The D-08 fallback catches it. A stronger fix would be hardening `parseAIJson` to try `JSON.parse` on each fenced block in order — but that's a change to a shared utility used by 7 routes and should be its own phase/plan.

### P-4: Gridded misclassified as lined → user loses a single cohesive note to over-splitting

**What goes wrong:** A page of dense design notes on dot-grid paper gets classified as lined with high confidence, split into 15 fragments. The user's cohesive thought is shattered.

**Why it happens:** Dot-grid paper is visually similar to unlined paper at low resolution; the dots can be missed.

**Mitigation:** The prompt explicitly lists "dot grid (evenly-spaced dots)" and "Rhodia dot pad" as gridded examples. Paper type is asymmetric in error cost: D-04 biases toward lined-when-uncertain because false-gridded (merging distinct items) is worse than false-lined (splitting a cohesive note). The user can review and merge in Phase 60 UX.

### P-5: Lined misclassified as gridded → multiple distinct todos get collapsed into one thought

**What goes wrong:** A to-do list on lined paper gets classified as gridded, returns as ONE thought containing "- call mom - pay rent - email dave", losing the ability to check off individual items.

**Why it happens:** Low-quality photos, unusual paper, extreme confidence from Claude.

**Mitigation:** D-04 is the primary defense: threshold `< 0.5` flips gridded → lined. Phase 60 will surface confidence to the user so they can override. For Phase 59, documenting the risk and trusting the threshold is sufficient.

### P-6: `maxTokens: 2000` truncating a dense-page transcription mid-stream

**What goes wrong:** A full page of small handwriting generates >2000 output tokens. Claude's response is cut off mid-JSON. `parseAIJson` throws. D-08 fallback kicks in. User loses the structured split and gets one giant thought with truncated content.

**Why it happens:** Verbatim transcription is token-expensive; a page of tight handwriting can be 1500–2500 words.

**Mitigation:** (a) D-02 already bumps max_tokens from 1000 (describe-image) to 2000 which covers the typical case. (b) The D-08 fallback means truncation doesn't error the request — the user gets a partial result. (c) If truncation becomes a recurring issue in Phase 60 feedback, bump to 4000. Adding now is premature.

### P-7: Forgetting to populate `cloudKitRecordID` on insert

**What goes wrong:** Insert fails with a NOT NULL constraint violation because `cloudKitRecordID` has no default.

**Why it happens:** Copy-paste from a simpler insert example.

**Mitigation:** The existing `thoughts.ts` line 234 sets `cloudKitRecordID: crypto.randomUUID()` — copy this pattern exactly. The insert must set it for EVERY row, including each row in a batched multi-row insert. Add a validation test: insert + read-back, verify no constraint errors.

### P-8: Adopting `output_config.format` structured outputs and breaking on the pinned Sonnet-4 model

**What goes wrong:** Someone reads the Anthropic docs, adds `output_config: {format: {type: "json_schema", schema: ...}}` to the `callClaudeMultimodal` call, and the API rejects it because Sonnet 4 (`claude-sonnet-4-20250514`) does not support structured outputs — only Sonnet/Opus 4.5/4.6 and Haiku 4.5 do. `[CITED: platform.claude.com/docs/structured-outputs]`

**Mitigation:** Do NOT include structured outputs in this phase. Use the existing `parseAIJson` + D-08 fallback. Document as a future improvement requiring a model bump across all routes.

### P-9: Test fixture strategy that requires a live Anthropic key

**What goes wrong:** The default `npm test` run hits the real Claude API, costs money, fails in CI without a key, and leaks the key into CI logs.

**Why it happens:** Naive e2e testing of the full route.

**Mitigation:** Extract the pure parsing/validation logic into a helper function and unit-test THAT. Keep live-API tests in `scripts/smoke-test.ts` gated behind `API_KEY` env var, per existing convention. See § Test Fixture Strategy.

### P-10: Double-counting `toResponse()` as already-exported

**What goes wrong:** The plan assumes `toResponse` is exported from `thoughts.ts` and imports it — but it's not exported (it's a file-local helper). Build fails.

**Why it happens:** Partial read of `thoughts.ts`.

**Mitigation:** Line 36 of `thoughts.ts` declares `function toResponse(...)` without `export`. The plan MUST include a task to add `export` to this function (small, mechanical change) OR re-declare the helper in `process-photo.ts`. The ThoughtApiResponse interface at line 18 has the same issue — also not exported. Cleanest fix: export both from `thoughts.ts`. `[VERIFIED: Read src/routes/thoughts.ts]`

### P-11: Skipping the fallback path assertion in tests

**What goes wrong:** D-08 parse-failure fallback exists in code but is never tested. A future refactor removes it silently. The first production parse failure 502s.

**Mitigation:** The test suite MUST include a parse-failure fixture (raw text = "Here's what I see: a shopping list") that asserts the helper returns a single lined thought with content = the raw text, confidence = 0, paperType = "unknown". This is explicit coverage for the D-08 contract.

### P-12: Inserting thoughts one-by-one instead of batching

**What goes wrong:** Lined-paper photo with 15 bullets → 15 serial INSERT round-trips to Postgres. Latency balloons, connection pool contention.

**Mitigation:** Drizzle supports `db.insert(thoughtsTable).values([row1, row2, ...]).returning()` — batches into a single INSERT with multiple VALUES. Use this form. One round-trip regardless of thought count. `[CITED: drizzle-orm multi-insert docs]`

---

## Validation Architecture

Include per config — `workflow.nyquist_validation` is not set in `.planning/config.json` (absent), so treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | **Wave 0 gap: no unit test framework installed in vigil-core** — recommend `node:test` (built into Node 22, zero deps) invoked via `tsx` for TypeScript |
| Config file | None needed for `node:test` |
| Quick run command | `cd vigil-core && npx tsx --test src/routes/process-photo.test.ts` |
| Full suite command | `cd vigil-core && npx tsx --test "src/**/*.test.ts"` (currently zero files; this becomes the phase-level quick check) |
| Live-API smoke command | `cd vigil-core && API_KEY=vk_xxx npm run smoke-test` (existing, extend with process-photo suite) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHOTO-01 | Paper type detection populates `paperType` and `confidence` fields in response | unit (helper) | `npx tsx --test src/routes/process-photo.test.ts` | ❌ Wave 0 |
| PHOTO-02 | Lined-paper sample → multiple thoughts | unit (helper) | same | ❌ Wave 0 |
| PHOTO-02 | Lined-paper sample → DB insert loop creates N rows | integration (in-memory Hono + test Postgres) | same | ❌ Wave 0 — requires test DB plumbing |
| PHOTO-03 | Gridded-paper sample → exactly one thought | unit (helper) | same | ❌ Wave 0 |
| PHOTO-04 | Verbatim — exact string equality on a sample with idiomatic phrasing | unit (helper) | same | ❌ Wave 0 |
| D-04 fallback | Low confidence (0.3) → treated as lined, split returned | unit (helper) | same | ❌ Wave 0 |
| D-04 fallback | `paperType: "unknown"` → treated as lined | unit (helper) | same | ❌ Wave 0 |
| D-08 fallback | Malformed Claude JSON → single lined thought, raw text content | unit (helper) | same | ❌ Wave 0 |
| D-08 errors | 400/503/502/500 error shapes match `/describe-image` | manual (inspected against describe-image) or live smoke | `npm run smoke-test` | ✅ (smoke-test exists, needs new suite) |

### Sampling Rate

- **Per task commit:** `npx tsx --test src/routes/process-photo.test.ts` (fast, no network, no DB)
- **Per wave merge:** `npx tsx --test "src/**/*.test.ts"` (full vigil-core test suite = just this one file for now)
- **Phase gate:** Full suite green + manual live-API sanity check against a lined sample and a gridded sample (one real Claude call each) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `vigil-core/src/routes/process-photo.test.ts` — unit tests for the pure `processClaudeResponse(rawText)` helper covering PHOTO-01..04 and all fallback paths
- [ ] Extract `processClaudeResponse` helper from the route handler (so it is testable without Claude/DB)
- [ ] Export `toResponse` and `ThoughtApiResponse` from `vigil-core/src/routes/thoughts.ts` (currently file-local) — small mechanical change required before `process-photo.ts` can import them (see P-10)
- [ ] Framework install: NONE — use `node:test` built-in. If the user prefers `vitest`, that's a planner decision. `node:test` is zero-dependency and the safer default.
- [ ] Optional: extend `vigil-core/scripts/smoke-test.ts` with a `testProcessPhoto()` suite that sends a fixture base64 image to `POST /v1/process-photo` against a running instance (behind `API_KEY` gate, like the existing suites)
- [ ] Optional: a real handwritten sample base64 stored at `vigil-core/test/fixtures/lined-sample.jpg.base64.txt` for the live smoke test (can be deferred if live smoke is skipped)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js runtime | Test execution, app runtime | ✓ | Node 22 (per @types/node ^22.0.0) | — |
| `tsx` | Running .ts tests and smoke-test.ts | ✓ | ^4.19.0 in devDependencies | — |
| `node:test` module | Unit testing | ✓ | Built into Node 22 | `vitest` (but adds a dep) |
| Postgres | Integration tests with DB insert | ✓ (Railway prod + local) | live | Use helper-only unit tests if no local DB |
| Anthropic API key | Live smoke test (optional) | ✓ (in Railway env, local via SOPS) | — | Skip live smoke; unit tests don't need it |
| `@anthropic-ai/sdk` | The Claude call | ✓ | ^0.82.0 | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None required for the unit-test path. A local Postgres is helpful for integration testing but can be skipped in favor of unit-testing the pure helper.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing bearer auth middleware (`src/middleware/auth.ts`) — covers `/v1/*` automatically |
| V3 Session Management | no | Stateless API, no sessions |
| V4 Access Control | yes | Bearer auth gates the endpoint; any valid key can call it (existing model — no per-user resource scoping in vigil-core yet) |
| V5 Input Validation | yes | `image` must be string, `mediaType` must be in allowlist — existing pattern from describe-image |
| V6 Cryptography | no | No crypto operations in this endpoint |
| V8 Data Protection | yes | Image bytes and transcribed content are PII (handwritten personal notes); existing TLS-in-transit via Railway + Postgres at-rest controls apply |
| V12 File Upload | yes | Base64 image input — size not currently bounded; see threat table below |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Oversized base64 payload → DoS | DoS | Hono's `timeout(30_000)` caps request time; consider adding explicit body-size limit (not currently enforced in vigil-core — same risk as existing describe-image) |
| Malicious image exploiting Claude (prompt injection via image) | Tampering | Claude's vision model has built-in protections; text extracted is stored as-is in DB — downstream consumers must treat as untrusted user input |
| Unbounded thought insertion → DB quota DoS | DoS | Semantic splitting has no hard cap per D-05, but Claude's `maxTokens: 2000` caps practical output; worst realistic case ~20–30 thoughts per call |
| Logging image bytes in error paths | Information Disclosure | Error handlers must log error MESSAGES only, never the base64 image payload — follow existing describe-image error pattern |
| Key leakage via error message | Information Disclosure | Existing 502 shape returns `err.message` — acceptable since Anthropic SDK errors do not echo API keys |

**New risks unique to this endpoint:** None beyond what `/describe-image` already exposes. Treat as the same risk class.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Lower temperature does not meaningfully help verbatim transcription | Prompt Design | Minor — easy to add `temperature: 0` later if needed |
| A2 | Claude 0.5 confidence threshold is a pragmatic "guessing" line | Paper Type Detection | Medium — if Claude systematically overconfident, D-04 fallback underfires; surface via Phase 60 telemetry |
| A3 | Sonnet 4 handwriting transcription quality is adequate vs Opus | Claude Model Selection | Medium — mitigation is the `CLAUDE_MODEL` env var override; switch at runtime if prod quality is insufficient |
| A4 | Opus is 5x cost and 3x latency of Sonnet | Claude Model Selection | Low — only a decision-framing number, not an execution-blocking fact |
| A5 | "You are an OCR engine, not an assistant" role-override pattern is effective | Verbatim Techniques | Medium — if ineffective, the concrete counter-example pattern (A6-equivalent) is the primary defense |
| A6 | Dense handwriting page fits in 2000 max_tokens | Pitfalls P-6 | Low — D-08 fallback catches truncation; bump to 4000 if it becomes common |
| A7 | `describe-image` observed latency is 2–5s (for cost/latency envelope) | Claude Model Selection | Low — informational only |

---

## Open Questions

1. **Should `toResponse` and `ThoughtApiResponse` be exported from `thoughts.ts`, or duplicated in `process-photo.ts`?**
   - What we know: both are currently file-local in `thoughts.ts`. Exporting is cleaner but touches a file outside the phase scope.
   - Recommendation: export them. It's a ~2-line change with no behavior impact. The planner should include this as a small task in Wave 0.

2. **Should Wave 0 install a test framework at all, or defer and hand-write a validation script?**
   - What we know: no test framework exists in vigil-core; `node:test` is free (Node 22 built-in).
   - Recommendation: use `node:test` — it's zero-dependency and standard. The planner can alternatively choose `vitest` if they prefer TS-native ergonomics, but that adds a dependency.

3. **Do we need a real handwritten image fixture, or can all tests be string-level?**
   - What we know: pure-helper unit tests only need strings. Live-API smoke would need a real base64 image.
   - Recommendation: ship string-level unit tests for the verification gate; treat the real-image live smoke as optional (nice-to-have, not blocking).

4. **Does Railway's production vigil-core have sufficient memory headroom to process large image payloads without OOM?**
   - What we know: current `/describe-image` processes images on the same instance with no reported issues, but PHOTO requests may be larger and more frequent once the folder watcher lands in Phase 61.
   - Recommendation: not a Phase 59 concern — flag for Phase 61 load testing.

---

## Sources

### Primary (HIGH confidence)
- `vigil-core/src/routes/describe-image.ts` — read in full
- `vigil-core/src/routes/thoughts.ts` — read in full
- `vigil-core/src/ai/client.ts` — read in full
- `vigil-core/src/db/schema.ts` — read in full
- `vigil-core/src/index.ts` — read in full
- `vigil-core/src/middleware/auth.ts` — read in full
- `vigil-core/scripts/smoke-test.ts` — read in full
- `vigil-core/package.json` — read in full
- `.planning/phases/59-smart-photo-upload-backend/59-CONTEXT.md` — all decisions loaded
- `.planning/REQUIREMENTS.md` — PHOTO-01..04 loaded
- [Anthropic cookbook: How to transcribe documents with Claude](https://platform.claude.com/cookbook/multimodal-how-to-transcribe-text) — minimal transcription prompt pattern verified via WebFetch
- [Anthropic structured outputs docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — supported models list verified via WebFetch (Sonnet 4 NOT in list)

### Secondary (MEDIUM confidence)
- [Anthropic prompt engineering overview](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview) — chain-of-thought and capitalization emphasis patterns (WebSearch result)
- [Claude 3.5 Sonnet announcement](https://www.anthropic.com/news/claude-3-5-sonnet) — vision transcription capability claim (WebSearch result)
- [HandwritingOCR comparison blog](https://www.handwritingocr.com/blog/chatgpt-claude-and-ai-for-ocr) — copyright refusal edge case (WebSearch result)

### Tertiary (LOW confidence — flagged in Assumptions Log)
- Community pattern: "You are an OCR engine, not an assistant" role-override (A5) — widely reported, not formally benchmarked
- Cost/latency Sonnet-vs-Opus multipliers (A4) — rough public-pricing estimates

---

## Metadata

**Confidence breakdown:**

- Existing code to reuse: **HIGH** — every referenced file and line number was read directly in this session
- Hono/Drizzle/Anthropic SDK mechanics: **HIGH** — verified against codebase and SDK docs
- Prompt design specifics: **MEDIUM** — based on Anthropic cookbook precedent + widely-used patterns, but not benchmarked against this specific task
- Test framework choice: **HIGH** — `node:test` is standard in Node 22; Wave 0 gap explicitly called out
- Model selection: **MEDIUM** — Sonnet 4 is the pinned default and likely adequate, but actual quality against real handwriting samples is unmeasured

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (30 days — Anthropic SDK moves fast; structured-outputs support matrix especially volatile)
