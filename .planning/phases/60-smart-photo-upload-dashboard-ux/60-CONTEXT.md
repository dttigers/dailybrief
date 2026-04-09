# Phase 60: Smart Photo Upload Dashboard UX — Context

**Gathered:** 2026-04-09
**Status:** Ready for research + planning
**Source:** /gsd-discuss-phase 60 (interactive)

<domain>
## Phase Boundary

Mac dashboard + minor Vigil Core backend refinement phase. Takes the `/v1/process-photo` endpoint shipped in Phase 59 and wires it into the existing SwiftUI dashboard photo-upload flow so that:

1. When the user imports a photo (toolbar "Import Image" → `processFiles()` loop), they see a **preview** of the detected paper type, confidence, and the split thoughts **before** any DB rows are inserted.
2. They can **override** the paper type (lined ↔ gridded) from that preview, which re-shapes the thoughts accordingly.
3. When Vigil Core reports **low confidence** (< 0.5), the preview surfaces the uncertainty via a yellow banner AND pre-selects a user-configurable default paper type.
4. The user-configurable default paper type lives in a new **"Photo Upload"** subsection of Settings → AI tab, persisted locally via UserDefaults.

Requirements closed by this phase: **PHOTO-05** (override before commit) + **PHOTO-06** (configurable default + visible uncertainty).

**In scope:**
- Small backend patch to `/v1/process-photo`: add `?preview=true` query param and `forcePaperType` body field. Preview mode runs the analysis and returns the same response shape WITHOUT inserting DB rows.
- Dashboard preview sheet/view showing paper type chip, confidence, read-only thoughts list, override picker, commit/cancel.
- Wire the preview step into the existing `processFiles()` loop as a per-photo modal, sequential across the batch.
- Settings AI-tab new "Photo Upload" section with a "Default paper type when detection is uncertain" picker.
- Update route-level tests to cover preview mode + forcePaperType + the commit call.

**Out of scope:**
- **Folder watcher / Phase 61.** The watcher will call `/process-photo` without the preview path (headless). That's Phase 61's problem.
- **Batch review queue UI.** No grid-preview-then-commit-all flow. Per-photo modal is the whole interaction.
- **Inline editing of thoughts in the preview.** Read-only list only. Post-commit editing uses the existing double-click `ThoughtRowView` pattern.
- **Paper-type-aware storage.** No new `paper_type` column on `thoughts` (Phase 59 D-06 still applies).
- **Project assignment in the preview flow.** Gridded single thoughts still get assigned to projects via the existing post-commit flow.
- **Notarization, `.app` bundle, or changes to `/describe-image`.**
- **Multi-user / shared settings.** UserDefaults local only — no CloudKit sync (retired in v2.2), no Vigil Core settings endpoint.
</domain>

<decisions>
## Implementation Decisions

### D-01: Preview semantics via `?preview=true` query param + `forcePaperType` body field
**Locked.** Patch Phase 59's `/v1/process-photo` to accept:
- Query param: `?preview=true` (default: false)
- Body field (optional): `forcePaperType: "lined" | "gridded"`

**Preview mode (`preview=true`):**
- Run the existing Claude analysis pipeline exactly as today.
- Apply `forcePaperType` transformation if present (see D-06).
- Return the same response shape `{paperType, confidence, thoughts: [...]}` but with the thoughts as **unsaved preview objects** — no DB insert, no row IDs. The returned thought objects should carry `source: "image"`, `confidence`, and `content` but `id` should be absent or `null`, and `createdAt`/`cloudKitRecordID` may be absent.
- Does NOT consume the image via any cleanup path (no side effects).

**Commit mode (`preview=false` or param omitted):**
- Current Phase 59 behavior — apply `forcePaperType` transformation, insert, return rows with IDs.
- This path is also what Phase 61's headless folder watcher will use.

**Rationale:** Phase 59 locked D-03 "backend creates thought records and returns them" for atomic commit semantics. Phase 60 success criterion #1 requires the user to see the paper type BEFORE those rows are committed. A preview query param is the smallest-possible contract extension: ~30 lines in `process-photo.ts`, no new routes, no double-writes. The folder-watcher path (Phase 61) is unaffected because it omits the param.

**Backend signature after patch:**
```
POST /v1/process-photo?preview=true
Body: { image: base64, mediaType: "image/jpeg", forcePaperType?: "lined"|"gridded" }
Response: { paperType, confidence, thoughts: [{content, confidence, source: "image"}, ...] }

POST /v1/process-photo
Body: { image: base64, mediaType: "image/jpeg", forcePaperType?: "lined"|"gridded" }
Response: { paperType, confidence, thoughts: [ThoughtApiResponse, ...] }  // with IDs
```

### D-02: Preview UI content — paper type chip + confidence + read-only thoughts list (Q1 = **B**)
**Locked.** The preview sheet shows:

1. **Paper type chip** — SwiftUI `Picker` with `.segmented` style, options "Lined" and "Gridded", initially set to the backend-returned `paperType` (unless uncertainty path — see D-05).
2. **Confidence badge** — small label like `"confidence: 0.90"` next to the chip. Format: 2 decimal places.
3. **Read-only thoughts list** — one row per entry in `thoughts[]`. Each row shows the content text, trimmed to fit, multi-line if needed. NO inline editing in this phase. Rows are not individually removable/selectable — they either all commit or all cancel.
4. **Action buttons** — `Commit` (primary) and `Cancel` (secondary).

**Override behavior:** When the user changes the segmented picker, the dashboard issues a new preview request with `forcePaperType` set to the new value. The backend returns the re-shaped `thoughts[]`, and the preview list refreshes. This is one additional API round-trip on override, which is acceptable because the user explicitly asked for it.

**Rationale:** "Before commit" is only meaningful if the user has something to inspect. Showing just a paper type chip gives them nothing to catch — they can't tell if Claude fumbled the OCR until AFTER thoughts are in the list. The read-only thoughts list is the sweet spot: visibility to catch problems (via override or cancel) without building a second editing surface (the existing double-click edit on `ThoughtRowView` already handles per-thought typo fixes post-commit).

**Not editable inline because:** doubles the UI complexity of this phase, duplicates an existing pattern, and PHOTO-05 is about paper-type override specifically, not about content correction.

### D-03: Multi-photo batch flow — per-photo modal, sequential (Q2 = **A**)
**Locked.** The existing `DashboardViewModel.processFiles()` loop iterates files sequentially with the progress banner pattern (`"Analyzing photo.jpg (1/3)"`). Phase 60 adds the preview step between analyze and commit for each photo:

```
for each photo in batch:
    progress: "Analyzing photo.jpg (N/total)"
    call /v1/process-photo?preview=true
    show preview sheet (modal over main dashboard)
    user: commit | override+commit | cancel
        commit → call /v1/process-photo (with forcePaperType if overridden) → append to list
        cancel → skip this photo, continue to next
    next photo
```

- **No sticky override** — each photo gets a fresh preview; the user's choice on photo 1 does NOT auto-apply to photo 2. If they drop 5 photos of the same notebook page, they'll see 5 previews. Acceptable because realistic batch sizes are 1–5.
- **Cancel skips one photo**, not the whole batch. No "cancel all" button in this phase.
- **Errors on one photo** (Claude failure, DB failure, etc.) surface in the existing error banner pattern at the end of the batch. The failing photo does not block subsequent photos.
- **Modal is per-photo:** dismissing the sheet triggers the commit/cancel decision. No "review later" state.

**Rationale:** matches the existing file-by-file sequential loop 1:1, requires zero new batch-review UI (no queue view, no navigation between photos), keeps Phase 60 scope tight. If real usage shows users drowning in modals on large batches, sticky-override (Q2 Option C) can be a later polish phase.

### D-04: Default paper type setting — new Settings AI-tab subsection, UserDefaults (Q3 = **A**)
**Locked.** Add a new "Photo Upload" section inside the existing **AI tab** of Settings, below the "Vigil API" section. Contains exactly one control:

- **Picker:** "Default paper type when detection is uncertain"
  - Options: "Lined" | "Gridded"
  - Default: "Lined" (matches Phase 59's D-04 safety-net behavior)

**Persistence:** local UserDefaults, key suggestion `vigil.photoUpload.defaultPaperType` (planner may refine). Property on `SettingsViewModel` following the existing `vigilApiKey` / `vigilApiBaseUrl` round-trip pattern (see memory `project_settings_wipes_apikey.md` — SettingsViewModel round-trips preserve values, pattern to replicate).

**Read path:** `DashboardViewModel` reads this on every photo upload to decide the pre-selected paper type when confidence is low.

**Not persisted via Vigil Core because:** no device sync story (CloudKit retired in v2.2, no multi-device user flow exists yet). Creating a `/v1/settings` endpoint is its own phase of work. UserDefaults ships today.

**Not in PDF tab because:** PDF tab's paper-size picker is about OUTPUT rendering (brief PDF format). This setting is about INPUT interpretation. Wrong thematic match.

### D-05: Low-confidence surface — yellow banner in preview + pre-select user's default
**Locked.** When the preview response has `confidence < 0.5`:

1. **Show a yellow banner** at the top of the preview sheet:
   - Text: `"Paper type uncertain — using your default: {Lined|Gridded}"`
   - Style: reuse the existing yellow `.controlBackgroundColor` banner pattern from `DashboardView.swift` (same treatment as "N file(s) failed to import" and "Analyzing photo.jpg" banners — pattern consistency)
2. **Pre-select the segmented picker to the user's configured default** (from D-04), NOT to whatever paperType the backend returned. The user can still override the picker to the third value if they want.
3. **Fetch a re-shaped preview** matching the user's default BEFORE showing the sheet — i.e., when dashboard detects `confidence < 0.5` in the first preview response, it immediately issues a second preview call with `forcePaperType = userDefault` and displays THAT shape to the user. This means the user's default is applied automatically, and the uncertainty banner tells them why.

**Interaction with Phase 59 D-04 (backend auto-coercion):** Phase 59's backend currently coerces `paperType: "unknown"` or `confidence < 0.5` to `"lined"` inside `processClaudeResponse`. This backend safety net STAYS as-is for direct API consumers (folder watcher, Phase 61). The dashboard's preview flow treats `confidence` as the SIGNAL for uncertainty regardless of which paperType the backend returned, and applies the user's own default via `forcePaperType`. In effect the dashboard overrides the backend coercion with a user-configurable one.

**Rationale:** PHOTO-06 explicitly says the user-configured default drives the fallback and the uncertainty must be visible. The yellow-banner pattern is the established error/progress surface — using it for uncertainty maintains consistency without new UI primitives.

### D-06: `forcePaperType` transformation semantics — Claude's discretion, with recommended approach
**Claude's discretion (planner to finalize in Plan 60-01).** The planner must pick one of two approaches and document the choice in PLAN 60-01:

**Recommended: client-side split, server-side collapse.**
- Preview response ALWAYS returns thoughts semantically split per Claude's raw output (Phase 59's `processClaudeResponse` already produces this shape — the helper's existing behavior is preserved).
- `forcePaperType: "lined"` on the commit call → insert N rows.
- `forcePaperType: "gridded"` on the commit call → concatenate the N entries into one string (joined with `\n\n`) and insert as a single row with `source: "image"` and the concatenation as `content`.
- `forcePaperType` absent → use whatever `paperType` the model reported (with Phase 59 D-04 fallback).
- This means forcing gridded→lined works IF Claude's original split survived the first preview pass. For a page Claude originally detected as gridded (one blob), forcing to lined falls back to splitting on `\n\n` in the blob (simple heuristic) OR triggers a second Claude call with an explicit "split into discrete items" prompt. Planner to choose which.

**Alternative: always re-call Claude on override.**
- Every `forcePaperType` override triggers a fresh Claude call with an adjusted prompt. Cleanest semantically, most expensive (extra API cost + latency on every override).

**Guidance for planner:** prefer the recommended approach. Only fall back to the alternative if the recommended approach produces visibly wrong splits on real photos during development. Test against both a lined-paper photo forced to gridded (expected: single concatenated thought) and a gridded-paper photo forced to lined (expected: split at paragraph boundaries or best-effort Claude resplit).

### D-07: Replace the existing `/describe-image` call in the photo flow
**Locked.** The current dashboard flow calls `APIImageDescriptionService.describeSubjects(imageURL:)` → POST `/v1/describe-image` → returns `descriptions: [String]` → one per subject → loops through `captureService.capture(_, source: .image)` → POST `/v1/thoughts` per description.

Replace this with a single `/v1/process-photo` call (preview first, then commit). The existing `/describe-image` endpoint stays available for callers that still want the legacy "describe subjects in a photo" behavior (if any), but the dashboard's "Import Image" toolbar action switches to `/process-photo`.

**Open question for planner:** do any other dashboard callers use `describeSubjects`? If yes, leave them alone. If no, consider deprecating the legacy flow in a future phase (NOT this one).

### D-08: Error handling — reuse existing banner + surface per-photo failures
**Locked.** No new error UI. All failure modes (Claude 502, DB 500, validation 400, AI client 503, network failure) surface via the existing yellow error banner at the bottom of the batch. Each failed photo is listed by filename with a short reason, consistent with the current `"N file(s) failed to import"` pattern (lines 670–693 in `DashboardView.swift`).

**Specific error mappings for the dashboard:**
- `503 no AI client configured` → banner text: `"Vigil Core AI not configured — check Settings → AI tab"`
- `502 Claude error` → banner text: `"Claude couldn't read that photo — try a sharper shot"` (ignore raw Claude error text; do NOT leak `err.message` to the user — this is also flagged in Phase 59 REVIEW WR-01)
- `500 DB error` → banner text: `"Couldn't save thoughts — try again in a moment"`
- `400 validation` → banner text: `"Image format not supported"` (shouldn't happen if file picker filters work)
- `413 payload too large` (new — planner to implement in backend patch per Phase 59 REVIEW WR-02) → `"Photo too large — try a smaller file"` with a guidance footnote about the 5MB Claude limit
- Network timeout → `"Request timed out"`

**Rationale:** consistency. The dashboard already has a well-tested error banner for file-level failures; Phase 60 doesn't need a new one.

### D-09: Backend test coverage
**Locked.** Extend `vigil-core/src/routes/process-photo.test.ts` to cover:
- **Preview happy path (lined):** `?preview=true` returns paperType + thoughts array + NO rows inserted (verify via fake dbInsert assertion that it was NOT called).
- **Preview happy path (gridded):** same, exactly 1 thought.
- **Preview with forcePaperType:** override lined→gridded and gridded→lined, assert returned shape matches the forced type.
- **Commit with forcePaperType:** forcePaperType body field applied on non-preview call, assert inserted rows match the forced shape.
- **Preview + forcePaperType combined:** refresh a preview after user overrides — assert no DB insert happens.

Plus extend the existing `scripts/smoke-test.ts` `testProcessPhoto()` section with a preview-mode test that asserts NO row is persisted.

### D-10: Dashboard test coverage
**Locked.** Add SwiftUI snapshot-style or ViewInspector-style tests for the new preview view (if the project has a test harness for that), plus a ViewModel-level unit test for the preview-flow state machine in `DashboardViewModel`. Planner to check what test infra exists in the Mac app and match it — if no existing SwiftUI test infra, ViewModel-level unit tests are sufficient for this phase.

Specific state transitions to cover:
- Analyze → preview shown → commit → committed
- Analyze → preview shown → override (lined↔gridded) → re-preview → commit
- Analyze → preview shown → cancel → no commit, next photo
- Analyze fails → error banner → next photo
- Confidence < 0.5 → user's default pre-selected → uncertainty banner shown
- Multi-photo: photo 1 committed → photo 2 preview shown → etc.
</decisions>

<canonical_refs>
## Files Downstream Agents Must Read

**Phase 59 context (what we're building on):**
- `.planning/phases/59-smart-photo-upload-backend/59-CONTEXT.md` — locked decisions D-01..D-09 from backend phase
- `.planning/phases/59-smart-photo-upload-backend/59-02-SUMMARY.md` — what actually shipped + known polish items (WR-01, WR-02)
- `.planning/phases/59-smart-photo-upload-backend/59-REVIEW.md` — code review findings (WR-01 raw error leak, WR-02 no payload-size guard — both relevant to D-08 here)

**Requirements & roadmap:**
- `.planning/REQUIREMENTS.md` — PHOTO-05, PHOTO-06
- `.planning/ROADMAP.md` — Phase 60 success criteria (4 items)
- `.planning/PROJECT.md` — core value, v2.4 "Capture Without Friction" milestone framing

**Backend files to patch (Plan 60-01):**
- `vigil-core/src/routes/process-photo.ts` — add `?preview=true` query param handling, `forcePaperType` body field, conditional DB insert
- `vigil-core/src/routes/process-photo.test.ts` — extend with preview mode + forcePaperType tests (see D-09)
- `vigil-core/scripts/smoke-test.ts` — extend `testProcessPhoto()` with preview-mode assertion

**Dashboard files to modify (Plan 60-02):**
- `Sources/DailyBriefMonitor/Dashboard/DashboardView.swift` — wire preview sheet presentation into the toolbar Import Image action, reuse yellow error banner pattern (lines 629–693) for uncertainty
- `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` — rewrite `processFiles()` photo loop (lines 665–779) to call `/v1/process-photo?preview=true` → show preview → commit (lines 719–759 are the current describeSubjects → capture path to replace)
- `Sources/DailyBriefMonitor/Settings/SettingsView.swift` — add "Photo Upload" subsection to AI tab (lines 83–102 are the current AI tab section)
- `Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift` — add `photoUploadDefaultPaperType` property with UserDefaults round-trip (follow existing `vigilApiKey`/`vigilApiBaseUrl` pattern — see memory `project_settings_wipes_apikey.md`)
- `Sources/JarvisCore/Services/APIAIServices.swift` — add a new `processPhoto(imageData:preview:forcePaperType:)` method on the API client, mirror the existing `describeSubjects` pattern but hit `/v1/process-photo` with the preview param. Keep `describeSubjects` alive for any non-dashboard callers.

**Dashboard files to create (Plan 60-02):**
- New SwiftUI view for the preview sheet (path: likely `Sources/DailyBriefMonitor/Dashboard/PhotoPreviewSheet.swift` — planner to confirm directory convention)

**Reference files for pattern reuse:**
- `Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift` (lines 142–157) — existing inline edit pattern for reference (NOT reused in preview, but confirms post-commit edit flow)
- `Sources/DailyBriefMonitor/ImagePicker.swift` — existing file picker, no changes needed
- `Sources/JarvisCore/Networking/VigilAPIClient.swift` (lines 95–100 per scout) — bearer token auto-apply, no changes needed
</canonical_refs>

<folded_todos>
None — no pending todos in the backlog matched this phase's scope.
</folded_todos>

<deferred>
## Deferred Ideas (out of scope for Phase 60)

- **Batch review queue UI** — grid/queue view showing all photos' previews at once with "commit all" / "reject all" buttons. Future phase if sticky-override doesn't scale.
- **Sticky override** — first photo's override auto-applies to photos 2..N in the same batch. Candidate polish if real usage shows users drowning in per-photo modals.
- **Inline editable thoughts in preview** — TextEditor per entry before commit. Post-commit edit via existing double-click already works; revisit only if users routinely need to fix OCR typos before commit (unlikely given the verbatim pipeline).
- **Project assignment in preview flow** — gridded thoughts land as single thoughts that get assigned to projects. Today that happens post-commit via the existing assign UI. Could be folded into the preview step later.
- **Vigil Core settings endpoint** — cloud-persisted user preferences synced across devices. Not buildable without a multi-device user story; v2.2 retired CloudKit.
- **Sync default paper type to v2.4 Settings JSON export** — if the Settings export/import feature eventually ships, include this field. Not a blocker.
- **Smart batch detection** — auto-detect when a batch is all the same paper type (e.g., N photos of the same notebook) and offer one-click accept-all. Heuristic candidate.
- **Phase 61 folder watcher integration** — the watcher will call `/v1/process-photo` WITHOUT the preview param (headless path), persisted as-is with D-04 backend fallback. Confirms the preview param is opt-in and doesn't break the non-interactive path.
- **Drag-to-reorder thoughts in the preview** — irrelevant for lined paper (order matches the page reading order) unless a user cares. Not yet.
- **Fix WR-01 (raw Anthropic error leak) and WR-02 (payload-size pre-flight 413)** from Phase 59 REVIEW — these are small polish items the user can knock out with `/gsd-code-review-fix 59` at any time. Phase 60's D-08 error mapping PRE-ASSUMES these are fixed (413 handling for oversized photos, generic error messages). Planner should either (a) handle both in Plan 60-01 as a prerequisite, or (b) note them as a hard dependency and require `/gsd-code-review-fix 59` before execution.
</deferred>

<specifics>
## Specific References from Discussion

- **User explicitly chose Option A for the preview contract** (query param over separate endpoints, commit-then-undo, or client-side-only toggle) — minimum backend surface that preserves "before commit" literally.
- **User explicitly chose Option B for preview content** — read-only thoughts list included, not just paper type chip. Visibility over minimalism.
- **User explicitly chose Option A for batch flow** — per-photo modal sequential, matching the existing `processFiles()` loop.
- **User explicitly chose Option A for settings location** — AI tab "Photo Upload" subsection, UserDefaults persistence.
- **Plan 60-01 = backend preview patch** (tiny: ~30 lines + tests), **Plan 60-02 = dashboard UX** (bigger, SwiftUI work). This ordering was affirmed during discussion.
- **No sticky override in this phase** — confirmed during Q2 discussion. Fresh preview per photo.
- **Read-only preview thoughts** — confirmed during Q1 discussion. Post-commit edit via double-click handles typo fixes; no inline editor in preview.
- **Yellow banner = uncertainty surface** — reuse existing `.controlBackgroundColor` pattern from `DashboardView.swift` for consistency with error/progress banners.
</specifics>

<scope_audit>
## Scope Discipline Check

**What this phase DOES:**
- Patches `/v1/process-photo` with preview mode + forcePaperType (minor backend)
- Builds dashboard preview sheet with paper-type chip, confidence badge, read-only thoughts list, override picker, commit/cancel
- Wires preview step into existing per-photo batch loop
- Adds one Settings picker for default paper type
- Surfaces uncertainty via yellow banner when confidence < 0.5

**What this phase does NOT do:**
- No folder watcher integration (Phase 61)
- No batch queue / grid review UI
- No inline edit in preview
- No project assignment in preview flow
- No new storage columns (paper_type stays ephemeral per Phase 59 D-06)
- No Vigil Core settings endpoint
- No retry-failed-photo-individually button
- No sticky-override batch optimization

**v2.4 milestone discipline:** PHOTO-05 + PHOTO-06 are closed by this phase. After Phase 60 + Phase 61, the entire PHOTO-01..06 requirement set is done and v2.4 moves to its next feature. No scope creep into v2.5 territory.
</scope_audit>

---

**Next step:** `/gsd-plan-phase 60` — create PLAN 60-01 (backend preview patch + updated tests) and PLAN 60-02 (dashboard preview UX + Settings addition + batch-loop rewrite).
