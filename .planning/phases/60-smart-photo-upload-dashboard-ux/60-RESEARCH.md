# Phase 60 Research — `forcePaperType` Transformation Semantics

**Date:** 2026-04-09
**Scope:** Targeted research on ONE open question from 60-CONTEXT.md D-06 — how the backend should handle `forcePaperType` override when the user overrides the Claude-detected paper type. Broad research skipped per user direction (CONTEXT.md is already detailed and canonical refs point at specific line numbers).

---

## The Question

In 60-CONTEXT.md D-06, the recommended approach was "client-side split, server-side collapse":
- `forcePaperType: "gridded"` (user overrides lined → gridded): trivial, concatenate `thoughts[]` into one string with `\n\n`.
- `forcePaperType: "lined"` (user overrides gridded → lined): **hard** — backend only has one blob because Claude returned `thoughts: ["full page transcription"]`.

Question: how should the backend handle the gridded→lined override case when all it has is a single text blob?

---

## Findings from reading the Phase 59 pipeline

Read `vigil-core/src/routes/process-photo.ts` lines 25–158 — the PHOTO_PROMPT and `processClaudeResponse` helper.

**The Phase 59 prompt (PHOTO_PROMPT):** Tells Claude to split based on `paperType`:
- `lined` → "split into separate thoughts, ONE per distinct topic/bullet/paragraph"
- `gridded` → "return the entire transcription as a SINGLE thought" (exactly one entry)
- `unknown` → "treat as lined and split"

**`processClaudeResponse` (pure helper):** Validates the shape and applies D-04 / D-08 coercions:
- Parses Claude's JSON, validates `paperType`/`confidence`/`thoughts[]`
- Applies D-04 `effectiveLined` rule: `unknown OR confidence<0.5 OR lined` → preserve Claude's split as-is
- Applies defensive P-4 rule: high-confidence gridded with >1 entries → collapse with `\n\n` join

**Key insight:** When Claude confidently detects gridded paper, the `thoughts[]` returned is ALWAYS `[oneBigBlob]`. There is no semantic split in the response — Claude obeyed the prompt and collapsed it itself.

**Verified against the live gridded test (2026-04-09):** the gridded response for Jameson's notebook brainstorm page returned exactly 1 thought containing the full page joined by `\n\n` between distinct topics and `\n` within each topic:
```
"Brick ReBuilder\n\nAI API cost\n\nLet me choose Set Manually/\n\nUI Interface    be able to click on\n                Piece in inventory to\n..."
```

This is the raw text we'd have to work with on a gridded→lined override.

---

## Options evaluated

### Option 1: Re-call Claude with a text-only "split this transcription" prompt
- **Pros:** Best semantic quality — same model that wrote the transcription re-reads and splits it semantically. Matches the quality of lined-first splits.
- **Cons:** +1 API call (~$0.003-0.005, ~2-5s latency) ONLY when user overrides gridded→lined. Requires a new prompt template + a new `callClaudeText` (or reuse `callClaudeMultimodal` without the image). New error path.
- **Verdict:** Highest quality but most complexity. Keep as a fallback.

### Option 2: Heuristic split on `\n\n` paragraph boundaries
- **Pros:** Zero extra cost. Instant. Deterministic. Reuses Claude's natural paragraph-break convention in gridded transcriptions.
- **Cons:** Quality depends on Claude being consistent with `\n\n` as the topic separator. If a gridded transcription uses all single `\n`s, this produces one giant thought.
- **Empirical check against the live gridded test:** Splitting the Brick ReBuilder blob on `/\n\n+/` yields ~17 reasonable chunks matching the visual topic boundaries on the page. Quality is "good enough" for an override path that's already a recovery operation.
- **Verdict:** Surprisingly viable. The live test confirms Claude uses `\n\n` as a topic separator in gridded mode naturally.

### Option 3: Modify the Phase 59 PHOTO_PROMPT to always return a pre-split `thoughts[]` regardless of paperType
- **Pros:** Single Claude call covers both directions; backend just decides whether to insert N or collapse to 1 based on `forcePaperType`.
- **Cons:** **Regression risk on Phase 59 verbatim behavior that was just blessed by live human verification**, including the critical "recieved" typo preservation test. Changes the prompt contract that all existing route tests depend on. Touches the happy path for folder-watcher (Phase 61) which doesn't care about this override case.
- **Verdict:** Architecturally cleanest but too risky for a prompt that just shipped. Don't reopen Phase 59.

### Option 4: Only allow lined→gridded overrides in the UI; disable gridded→lined entirely
- **Pros:** No backend work needed.
- **Cons:** Hampers user agency. Violates PHOTO-05 spirit ("can override the detected paper type" — bidirectional implied).
- **Verdict:** Reject. PHOTO-05 is explicit.

---

## Recommendation (for the planner)

**Primary: Option 2 — heuristic `\n\n` split, with Option 1 as a documented fallback if real usage produces bad splits.**

### Implementation guidance

Add a small helper in `process-photo.ts` (not a separate file — it's ~10 lines):

```typescript
/**
 * Split a gridded-mode transcription into lined-mode thoughts.
 * Uses Claude's natural \n\n paragraph convention observed in gridded output.
 * Falls back to the original blob as a single thought if the split is degenerate.
 */
export function splitGriddedBlobToLined(blob: string): string[] {
  const parts = blob
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // Degenerate cases: 0 parts (empty), 1 part (no \n\n found) → return original as single entry
  if (parts.length < 2) return [blob.trim()];
  return parts;
}
```

**Integration points in the `forcePaperType` handler:**

```typescript
// Inside the route handler, AFTER processClaudeResponse returns:
if (forcePaperType === "lined" && result.paperType === "gridded") {
  // User overrode gridded → lined. Only have one blob. Heuristic-split on paragraphs.
  result.thoughts = splitGriddedBlobToLined(result.thoughts[0] ?? "");
  result.paperType = "lined";
} else if (forcePaperType === "gridded" && result.paperType !== "gridded") {
  // User overrode lined → gridded. Trivial: concatenate.
  result.thoughts = [result.thoughts.join("\n\n")];
  result.paperType = "gridded";
}
// Otherwise: force matches detection OR not provided → use result as-is
```

### Plan to cover the edge cases

The plan should include unit tests for this transform:
- **T-60-a:** `splitGriddedBlobToLined` — normal multi-paragraph input → N thoughts
- **T-60-b:** `splitGriddedBlobToLined` — single paragraph (no `\n\n`) → 1 thought unchanged
- **T-60-c:** `splitGriddedBlobToLined` — empty string → `[""]` (or preferably `[]` — planner decide)
- **T-60-d:** route handler — `forcePaperType: "lined"` on gridded response → returns N thoughts
- **T-60-e:** route handler — `forcePaperType: "gridded"` on lined response → returns 1 concatenated thought
- **T-60-f:** route handler — `forcePaperType` matches detection → passthrough
- **T-60-g:** route handler — `forcePaperType` absent → passthrough (D-04 behavior preserved)

### Escape hatch — when to upgrade to Option 1

If during Phase 60 verification (real gridded photos with override) the `\n\n` heuristic produces bad splits (1 thought when should be 5, or 30 thoughts when should be 5), escalate to Option 1 (text-only Claude re-call). Track this as a polish candidate — don't build it speculatively.

**Trigger for escalation:** if 2+ real-photo tests during human-verify show the heuristic fragmenting or under-splitting a gridded override, implement Option 1 in the same plan. Otherwise ship Option 2.

---

## What was NOT researched

Per user direction:
- SwiftUI sheet presentation patterns in the dashboard → planner can grep the existing codebase (CONTEXT.md points at `DashboardView.swift` lines 629–693 for the banner pattern and lines 665–779 for `processFiles`)
- UserDefaults round-trip pattern → CONTEXT.md already references `project_settings_wipes_apikey.md` memory and the existing `vigilApiKey`/`vigilApiBaseUrl` pattern
- Phase 59 REVIEW gaps WR-01/WR-02 → documented in 59-REVIEW.md; planner decides whether to fold into Plan 60-01 or require `/gsd-code-review-fix 59` first

All other Phase 60 design decisions were locked in 60-CONTEXT.md.

---

*Phase: 60-smart-photo-upload-dashboard-ux*
*Research gathered: 2026-04-09 (targeted, single open question)*
