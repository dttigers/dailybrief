---
phase: 106-g2-store-resubmit-atomic
plan: 01
subsystem: infra
tags: [g2, scaffolding, atomic-gate, ehpk, vite, evenhub, npm-scripts]

# Dependency graph
requires:
  - phase: 106-g2-store-resubmit-atomic
    provides: "CONTEXT.md locked decisions D-09 through D-14 (screenshots dir, VERIFIED.md schema, 24h staleness gate, no auto-upload)"
  - phase: 106-g2-store-resubmit-atomic
    provides: "RESEARCH.md §Code Examples Example 2 (verbatim check-verified.mjs source) and Pitfall 1 (evenhub pack output filename fix)"
provides:
  - "vigil-g2-plugin/store-assets/ directory (tracked via .gitkeep; screenshots land here in Plan 05)"
  - "vigil-g2-plugin/scripts/check-verified.mjs — fail-closed staleness gate (ISO-line based per Pitfall 6, 24h window)"
  - ".planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md — checklist template with G2-01/G2-02/G2-03 checkboxes, T8-leak-2 evenhub-credential reminder, Figma review section, placeholder Verified: line"
  - "vigil-g2-plugin/package.json — new package:ehpk script; pack script amended with -o vigil.ehpk (Pitfall 1 fix)"
  - "vigil-g2-plugin/app.json — version bump 0.1.0 → 0.2.0 for store resubmit"
affects: [106-02, 106-03, 106-04, 106-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic-gate via pre-build npm script chaining (package:ehpk = gate → build:prod → pack)"
    - "Fail-closed Node ESM validator script with zero deps (reads file, regex-parses embedded ISO 8601 line, exits 1 on any failure mode)"
    - "ISO-timestamp-in-file-body gate pattern (rather than mtime) — robust across git checkout and clock drift per RESEARCH Pitfall 6"

key-files:
  created:
    - "vigil-g2-plugin/store-assets/.gitkeep"
    - "vigil-g2-plugin/scripts/check-verified.mjs"
    - ".planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md"
  modified:
    - "vigil-g2-plugin/package.json"
    - "vigil-g2-plugin/app.json"

key-decisions:
  - "Used verbatim RESEARCH.md Example 2 source for check-verified.mjs with a __dirname-relative VERIFIED_PATH (more robust than process.cwd()-relative — the npm script runs from the plugin dir, but the file lives two levels up at repo root)"
  - "Kept placeholder string PLACEHOLDER_REPLACE_WITH_ISO_8601_AT_VERIFY_TIME on the Verified: line so the gate fail-closes out of the box. Plan 05's simulator session is the only thing that flips it to a real ISO 8601 timestamp."
  - "Version bump landed in this Wave 0 plan rather than deferred — keeps the scaffold cohesive and avoids a fragment commit in Plan 05 for a single-line change"

patterns-established:
  - "Atomic gate script pattern: single .mjs file, no deps, reads one file, parses one regex, 4 distinct fail modes each with its own stderr message (missing → missing line → unparseable → stale)"
  - "RESEARCH Pitfall → Plan mutation pattern: Pitfall 1 (output filename mismatch) produced a concrete package.json edit in this plan (pack -o vigil.ehpk), not just documentation"

requirements-completed: [G2-01, G2-02, G2-03]

# Metrics
duration: 2min
completed: 2026-04-20
---

# Phase 106 Plan 01: G2 Store Resubmit Atomic-Gate Scaffold Summary

**Atomic-gate infrastructure — VERIFIED.md checklist template + fail-closed Node ESM staleness script + package:ehpk npm chain (gate → build → pack -o vigil.ehpk) — unblocks Wave 1 plans (02/03/04) and gates Wave 2 (05) pack step.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-20T05:02:15Z
- **Completed:** 2026-04-20T05:04:13Z
- **Tasks:** 2
- **Files modified:** 5 (3 created, 2 edited)

## Accomplishments

- Wave 0 scaffolding complete: `store-assets/` directory tracked, `check-verified.mjs` fail-closes on placeholder timestamp (verified live: exit=1 with "Unparseable timestamp"), `VERIFIED.md` template in place with all three requirement checkboxes plus T8-leak-2 evenhub-credentials reminder.
- `npm run package:ehpk` exists and correctly refuses to run: `> node scripts/check-verified.mjs && npm run release` aborts at the gate. Confirmed end-to-end — the gate blocks pack today, Plan 05 flips it green after simulator verification.
- `pack` script output filename now stable (`-o vigil.ehpk`) — RESEARCH Pitfall 1 closed. No more `out.ehpk`-vs-`vigil.ehpk` ambiguity in the build pipeline.
- `app.json` version now reflects store resubmit (`0.2.0`). `package_id`, `whitelist`, `min_sdk_version` all preserved — no permission creep.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create store-assets/ directory, check-verified.mjs script, and VERIFIED.md template** — `985e6fa` (feat)
2. **Task 2: Amend package.json scripts (pack -o vigil.ehpk, add package:ehpk) and bump app.json version** — `933a14f` (chore)

**Plan metadata:** _pending — final commit after STATE.md + ROADMAP.md updates below_

## Files Created/Modified

- `vigil-g2-plugin/store-assets/.gitkeep` — empty file so git tracks store-assets/ (screenshots land here in Plan 05 per D-10)
- `vigil-g2-plugin/scripts/check-verified.mjs` — ~40 LOC Node ESM gate script; no deps; reads VERIFIED.md via `__dirname` + two `..` hops → repo root → `.planning/phases/106-.../`; parses `/^Verified:\s*(\S+)/m`; exits 1 on missing file / missing line / unparseable timestamp / >24h old; stderr diagnostic before each exit
- `.planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md` — checklist template: (a) `Verified:` placeholder line (currently unparseable → gate closed), (b) G2-01/G2-02/G2-03 checkboxes with acceptance criteria, (c) simulator session details runbook, (d) observed-behavior-notes section (D-04 — document, don't force "3s" wording), (e) T8-leak-2 evenhub credentials warning, (f) Figma design spec review (Q1 from RESEARCH), (g) resubmission-readiness sub-checklist
- `vigil-g2-plugin/package.json` — `pack` amended (`+ -o vigil.ehpk`), `package:ehpk` added (`node scripts/check-verified.mjs && npm run release`). All other scripts preserved; `devDependencies`/`dependencies`/`name`/`version`/`private`/`type` untouched
- `vigil-g2-plugin/app.json` — `version` 0.1.0 → 0.2.0. Every other field unchanged

## Decisions Made

- **Kept the placeholder on the `Verified:` line rather than omitting it.** The gate's "missing line" and "unparseable timestamp" error paths are both useful error states — starting from "unparseable" is more instructive if a future developer runs `package:ehpk` cold: they see a helpful stderr message pointing at the exact string that failed to parse, instead of getting a cryptic "missing line" for a file that clearly has content. Plan 05 will overwrite the placeholder with a real ISO 8601 string — no code change needed.
- **Used `__dirname` + path.resolve` rather than a `process.cwd()`-relative path.** The npm script runs from `vigil-g2-plugin/` but the file lives at `/repo/.planning/phases/...`. Using `__dirname` makes the script robust to being invoked from anywhere (e.g., a future `npm --prefix vigil-g2-plugin run package:ehpk` from repo root).
- **Version bump in this plan, not Plan 05.** Two reasons: (a) the version bump is a one-line change that has no runtime effect until Plan 05 packages the `.ehpk`, so including it here keeps Plan 05 focused on pack-and-verify; (b) if Plan 05 is skipped or iterated, the version bump still belongs with the scaffolding that says "this phase is a store resubmit."

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** None — both tasks matched their acceptance criteria on the first attempt.

## Issues Encountered

- **PreToolUse read-before-edit hook fired on package.json and app.json.** The tool-call guard requires a `Read` in the current session before `Edit` will accept a file. Both files had been read during `files_to_read` at session start, and the edits succeeded, but the hook surfaced a reminder. Re-read both files post-edit to confirm the intended state had landed (it had). No code impact. Noted for future sessions: treat frontmatter-read and in-session read as independent for the hook.
- **Pre-existing dirty tree** (`vigil-pwa/src/index.css`, `vigil-pwa/.env.local.bak`) confirmed untouched per sequential-executor instructions. `git status` after both commits still shows those files modified/untracked, as expected.

## User Setup Required

None - no external service configuration required. Plan 05 will require a human simulator session on the Even Realities iPhone app, but that is documented in VERIFIED.md itself, not a system-level setup step.

## Next Phase Readiness

- **Wave 1 (Plans 02, 03, 04) unblocked.** They can land VITE_SCREENSHOT_MODE, G2-02 `shutDownPageContainer(1)` branch, and G2-03 header/border/fallback work in parallel without touching scaffold files.
- **Wave 2 (Plan 05) gate is live.** `npm run package:ehpk` currently exits 1. Plan 05's simulator session + VERIFIED.md edit + checkbox tick are the ONLY things that unlock the pack step. Manual verification round-trip confirmed.
- **Remaining scaffold debt:** none. This plan delivered every artifact promised in the `must_haves` / `artifacts` / `key_links` manifest.

## Self-Check: PASSED

File existence checks:
- `vigil-g2-plugin/store-assets/.gitkeep` — FOUND
- `vigil-g2-plugin/scripts/check-verified.mjs` — FOUND
- `.planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md` — FOUND
- `vigil-g2-plugin/package.json` — FOUND (contains `package:ehpk` and `-o vigil.ehpk`)
- `vigil-g2-plugin/app.json` — FOUND (contains `"version": "0.2.0"`)

Commit existence checks:
- `985e6fa` (Task 1) — FOUND in git log
- `933a14f` (Task 2) — FOUND in git log

Behavioral checks:
- `node vigil-g2-plugin/scripts/check-verified.mjs` → exit 1 with "Unparseable timestamp" — CONFIRMED fail-closed
- `npm run package:ehpk` (from vigil-g2-plugin/) → exit 1, gate blocks before `release` runs — CONFIRMED
- `npx tsc` in vigil-g2-plugin/ → exit 0 — CONFIRMED

---
*Phase: 106-g2-store-resubmit-atomic*
*Completed: 2026-04-20*
