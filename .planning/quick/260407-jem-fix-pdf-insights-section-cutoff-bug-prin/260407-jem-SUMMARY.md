---
phase: 260407-jem-fix-pdf-insights-cutoff
plan: 01
subsystem: pdf-generation
tags: [pdf, insights, page-three, layout, bugfix]
requires:
  - PageTwoRenderer.drawWrappedText pattern (existing reference)
  - CoreText CTFramesetterSuggestFrameSizeWithConstraints
provides:
  - Wrapped, non-truncated insights rendering
  - Multi-page page-3 spillover for insights overflow
affects:
  - Sources/DailyBrief/PDF/PageThreeRenderer.swift
  - Sources/DailyBrief/PDF/PDFGenerator.swift
tech-stack:
  added: []
  patterns:
    - "CTFramesetterSuggestFrameSizeWithConstraints for pre-measure + draw"
    - "Overflow-index callback pattern between renderer and generator"
key-files:
  modified:
    - Sources/DailyBrief/PDF/PageThreeRenderer.swift
    - Sources/DailyBrief/PDF/PDFGenerator.swift
decisions:
  - "Renderer returns Int? overflow index (nil = done) so generator can loop"
  - "Therapy Prep renders on first sheet only, and only when insights did not overflow"
  - "needsPageThree guard widened: insights-only or therapy-only briefs now emit page 3"
  - "Safety cap: 10 spillover pages prevents pathological infinite loops"
metrics:
  duration: "~6 min"
  completed: "2026-04-07"
  tasks: "2 of 3 (Task 3 is human-verify checkpoint)"
---

# Quick Task 260407-jem Summary: Fix PDF insights section cutoff

## One-liner

Insights titles and messages now wrap instead of truncating at 30/60 chars, the hard `prefix(5)` cap is gone, and PageThreeRenderer reports an overflow index so PDFGenerator emits additional page-3 sheets until every insight is drawn.

## Root Cause (confirmed)

In `PageThreeRenderer.swift` (pre-fix) the AI Insights loop did all four wrong things simultaneously:

1. **Line 206** — `for insight in data.insights.prefix(5)` capped at 5 items
2. **Line 229** — `String(insight.title.prefix(30))` chopped titles mid-word
3. **Line 239** — `String(insight.message.prefix(60))` chopped messages mid-sentence on a single unwrapped line
4. **Line 209** — `if y + neededSpace > pageBottom { break }` silently dropped the rest

And in `PDFGenerator.swift` (pre-fix) the generator only ever emitted **one** page-3 sheet (lines 34–39), so even if the renderer had reported overflow there was no mechanism to continue. The user-visible symptom ("insights get cut off") was all of these compounding: long insights looked clipped on the first line, and later insights just never appeared at all.

## Files Modified

| File | Change |
|---|---|
| `Sources/DailyBrief/PDF/PageThreeRenderer.swift` | New signature `draw(..., insightsStartIndex: Int = 0) -> Int?`. Added `drawWrapped`, `measureWrapped`, `drawInsightsLoop`, `measureInsightsConsumedY` helpers. Spillover pages skip header/thoughts/therapy and draw only "AI Insights (continued)". Therapy prep still renders on first sheet when insights fit. |
| `Sources/DailyBrief/PDF/PDFGenerator.swift` | Single page-3 emission replaced with a `repeat`/`while` loop bounded by `maxPages = 10`. `needsPageThree` guard widened so insights-only or therapy-only briefs still emit page 3. Log line now includes thoughts page count. |

## Commits

| Task | Description | Commit |
|---|---|---|
| 1 | Wrap insights text and report overflow (PageThreeRenderer) | `39de4e0` |
| 2 | Loop PDFGenerator until all insights drawn | `fce4a69` |

## Deviations from Plan

### [Rule 3 - Blocking] Therapy Prep positioning after variable-height insights

**Found during:** Task 1
**Issue:** The plan spec defined the insights loop to return only an `Int?` overflow index, not an updated `y` cursor. But the Therapy Prep block on the first sheet needs to know where `y` landed after insights to position its divider. Without the updated `y`, therapy prep would overlap the insights text.
**Fix:** Added a private `measureInsightsConsumedY` layout-only helper that mirrors the draw loop's math without drawing. It's only invoked on the first sheet when insights did not overflow (i.e. all insights drew successfully, so the math is deterministic and matches what was drawn). Kept the public return contract as `Int?` per spec.
**Files modified:** `Sources/DailyBrief/PDF/PageThreeRenderer.swift`
**Commit:** `39de4e0` (bundled with Task 1)

### [Rule 2 - Critical] Therapy Prep suppressed on insights-overflow pages

**Found during:** Task 1
**Issue:** If insights overflowed on the first page, there was no remaining space for therapy prep on that page, and drawing it would either clip or collide with the bottom of the insights region.
**Fix:** Gated therapy prep behind `overflowIndex == nil` so it only renders on the first sheet when all insights fit. On spillover pages therapy prep is not drawn (per plan spec). If the plan calls for therapy prep to eventually get its own spillover mechanism, that's a separate change.
**Files modified:** `Sources/DailyBrief/PDF/PageThreeRenderer.swift`
**Commit:** `39de4e0`

## Verification (automated)

- `swift build` clean after Task 1 (170s full build, no errors or non-deprecation warnings)
- `swift build` clean after Task 2 (4.5s incremental, no errors or non-deprecation warnings)
- Code review confirmed:
  - No `.prefix(30)` or `.prefix(60)` in the insights section
  - No `.prefix(5)` cap on `data.insights`
  - New `drawWrapped` helper uses `CTFramesetterSuggestFrameSizeWithConstraints`
  - `PageThreeRenderer.draw` signature has `insightsStartIndex: Int = 0` default and `Int?` return (`@discardableResult`)
  - `PDFGenerator.generate` has a `repeat`/`while` loop with `maxPages = 10`
  - Page 1 and Page 2 emission paths are byte-identical to before

## Task 3: Human Verification — PENDING

Task 3 is a `checkpoint:human-verify` gate. The executor did **not** attempt visual verification. The user must:

1. Regenerate today's daily brief (or any day with 3+ long insights)
2. Open the PDF in Preview and confirm:
   - Every insight title is fully readable (no mid-word cutoff at ~30 chars)
   - Every insight message is fully readable, wrapping to multiple lines as needed
   - All insights from the day appear (count vs. `data.insights.count`)
   - If insights overflow, a second page-3 sheet is emitted with "AI Insights (continued)" header
   - Pages 1 and 2 look identical to a pre-fix brief
   - Dashed border is drawn on every page including spillover sheets
3. Configurability spot-check: change PDF font scale to 1.25x or paper size to A5, regenerate, confirm insights still wrap/spill correctly

**Status:** Awaiting user verification — the user's daily print should now show insights fully, but that claim is unconfirmed until they generate and inspect a real PDF.

## Self-Check: PASSED

Verified:
- `Sources/DailyBrief/PDF/PageThreeRenderer.swift` exists (modified)
- `Sources/DailyBrief/PDF/PDFGenerator.swift` exists (modified)
- Commit `39de4e0` present in `git log`
- Commit `fce4a69` present in `git log`
- `swift build` succeeds cleanly

---

# Post-Scope Expansion — 2026-04-07

Tasks 1 and 2 above addressed **only the insights section**, based on my initial
misdiagnosis of the user's "PDF insights cutoff" report. When the user sent an
actual screenshot of the printed brief, the real symptom was different: Tasks
and Recent items were being clipped mid-word on the right margin, and the
**Insights section was not appearing on the page at all** — which is the
opposite of an "insights layout" problem.

Root-cause investigation extended the scope across two codebases:

## Bug A — PDF rendering: universal `.prefix(N)` truncation

Every section on the Captured Thoughts page used `.prefix(N)` hard-truncation
instead of CTFramesetter wrapping. The insights fix I already shipped had
introduced `drawWrapped`/`measureWrapped` helpers for its own use; those
helpers were extended to the remaining sections:

| Section | Previous cap | Now |
|---|---|---|
| Tasks | `prefix(45)` (mid-word clip) | wrapped via `drawWrapped` |
| Recent | `prefix(35)` | wrapped |
| Therapy Prep topic | `prefix(40)` | wrapped (bold) |
| Therapy Prep context | `prefix(60)` | wrapped (indented) |
| Therapy Prep focus | `prefix(70)` | wrapped (italic) |
| Unprocessed (`drawThoughtItem`) | manual 35×2 char word-break | wrapped; source label reserve ~70pt |

Tasks rows floor at `tableRowHeight` to preserve density when content fits one
line; expand vertically when wrapping occurs.

**Commit:** `8cac42d` — `fix(260407-jem-03): wrap Tasks, Recent, Therapy Prep, and Unprocessed sections`

## Bug B — vigil-core AI JSON parser: markdown fence intolerance

The Insights section was empty because three vigil-core endpoints were returning
HTTP 502 on every request. Log inspection at
`~/Library/Logs/dailybrief/dailybrief.log` showed the AI was wrapping responses
in ```json ... ``` markdown fences, and `JSON.parse(raw)` was calling parse on
the fenced string literally. All three therapy + insights endpoints failed the
same way, so three entire sections were silently disappearing from every daily
brief: **AI Insights, Therapy Patterns, Therapy Prep**.

Added `parseAIJson<T>()` helper in `vigil-core/src/ai/client.ts` that strips an
optional `` ```lang? ... ``` `` block before parsing (no-op for clean JSON).
Replaced **7 call sites** across the codebase:

- `routes/insights.ts` — `/insights` generation
- `routes/therapy.ts` — `/therapy/classify`, `/therapy/patterns`, `/therapy/prep` (3 sites)
- `routes/triage.ts` — `/triage` thought categorization
- `routes/prioritize.ts` — `/prioritize` work order ranking
- `routes/describe-image.ts` — `/describe-image` multimodal notes

**Commit:** `a638196` — `fix(260407-jem-02): tolerate markdown code fences in AI JSON responses`

## Deployment journey (lessons learned)

1. `git push origin main` did **not** auto-deploy vigil-core to Railway despite
   the GitHub repo being connected at the service level. Root cause: the
   service did not have a **Root Directory** set, so Railway tried to Railpack
   the repo root (which is a Swift monorepo) and silently failed.
2. Manual `railway up --detach` from inside `vigil-core/` *also* failed for
   the same reason — Railway's CLI walks up to `.git` when present and uploads
   the repo root, not the current working directory.
3. `railway up --detach --path-as-root .` from inside `vigil-core/` is the
   correct manual-fallback command — it uses the current path as the archive
   root and skips `.git` walk-up.
4. Long-term fix: set Root Directory to `vigil-core` in Railway dashboard
   (Service Settings → Source → "Add Root Directory" link below the repo
   display). This enables true git-push auto-deploy. Completed 2026-04-07.

## Mac app deployment trap

After writing the PageThreeRenderer fix and running `swift build --product
DailyBriefMonitor`, I declared the Mac-app side done. **Wrong.** `PageThreeRenderer.swift`
lives in the `DailyBrief` executable target (the CLI that actually generates
the PDF), not the `DailyBriefMonitor` target (the ambient LaunchAgent watcher).
Building Monitor didn't type-check or link my changes at all.

Correct sequence:
1. `swift build -c release --product DailyBrief`
2. `cp .build/release/DailyBrief ~/.local/bin/DailyBrief`
3. LaunchAgent picks up the new binary on next brief trigger (no restart of
   `DailyBriefMonitor` needed — it shells out to `DailyBrief` CLI)

## Final commit set

| Commit | What | Codebase |
|---|---|---|
| `39de4e0` | Wrap insights + overflow-index plumbing | Mac (DailyBrief) |
| `fce4a69` | Spillover page-3 sheets | Mac (DailyBrief) |
| `a638196` | `parseAIJson` helper + 7 vigil-core call sites | Server (vigil-core) |
| `8cac42d` | Wrap Tasks/Recent/TherapyPrep/Unprocessed | Mac (DailyBrief) |

## Outcome

User verified 2026-04-07:
- **PDF looks good** (Tasks and Recent no longer clipped; insights appearing)
- **Railway auto-deploy configured** (Root Directory set to `vigil-core` via dashboard)

Task 3 (human-verify) satisfied. Quick task 260407-jem closed.
