# Phase 125 — Deferred Items

Out-of-scope discoveries logged during plan execution. Per gsd-executor scope-boundary
("Only auto-fix issues DIRECTLY caused by the current task's changes; pre-existing
warnings/failures in unrelated files are out of scope"), these are logged here for
follow-up rather than fixed inline.

---

## Plan 125-02 (Wave 1 — Drizzle migration)

### DEF-125-02-01 — Full `vigil-core` test suite hangs on `cross-user-isolation.test.ts`

- **Logged:** 2026-05-10
- **Symptom:** `cd vigil-core && npm test` (or equivalently `npx tsx --test "src/**/*.test.ts"`)
  runs >25 minutes without progressing past `cross-user-isolation.test.ts`. Cumulative
  CPU is ~0.25s while elapsed time grows linearly — classic hung-event-loop signature
  (likely an open DB handle waiting on a stale connection, or a `setInterval` keeping
  the loop alive after assertions pass).
- **Reproduction:** From a clean tree, `cd vigil-core && npm test` — never reaches
  the final TAP summary frame within 30 min.
- **Workaround used in Plan 125-02:** Targeted regression smoke via
  `npx tsx --test <schema-importing files>` (96 tests / 65 pass / 0 fail / 31 skip
  in 22s). Plan acceptance was schema-typing regression only, not a full-suite
  invariant — the targeted run satisfies it.
- **Tried but did not work:** `--test-skip-pattern=cross-user-isolation` against
  tsx 4.x — the flag is silently ignored or the hang is in a different file too.
  Process killed after 26 min wall, 0 CPU change in last 60s.
- **Pre-existing:** 125-01-SUMMARY.md flagged the same issue: "A pre-existing
  slow test (`src/integration/cross-user-isolation.test.ts`) was observed during
  baseline measurement. … a single sustained run measured ~15min in one earlier
  invocation". This plan's encounter (~25min+) suggests the regression has grown.
- **Owner:** Future ops plan (cleanup wave) — not in 125's scope. Recommend running
  the suite under `node --test --test-timeout=120000` with per-file isolation, or
  carving the integration tests into their own `npm run test:integration` lane so
  the fast unit suite (~22s) is the default `npm test` target.

---

## Plan 125-06 (Wave 2 — Plugin SSE handling + Companion HUD filter + Q glyph)

### DEF-125-06-01 — `vigil-g2-plugin` tsconfig missing `node` types for test files

- **Logged:** 2026-05-10
- **Symptom:** `cd vigil-g2-plugin && npx tsc --noEmit -p tsconfig.json` reports
  TS2307 errors for `node:test`, `node:assert/strict`, `node:fs`, `node:url`,
  `node:path` imports inside `src/**/__tests__/*.ts` files, plus TS7006 implicit-any
  on home.test.ts parameters. Application code (`src/lib/*.ts`, `src/screens/*.ts`,
  `src/main.ts`) compiles cleanly — the errors are isolated to test files.
- **Pre-existing:** Verified by `git stash && tsc --noEmit` against the
  pre-Plan-06 main tip — the same errors (plus extras in deduped-device-status.test.ts
  and sse-client.test.ts that Plan 06 happens to touch) existed before this plan.
- **Root cause:** `tsconfig.json` has `"types": ["vite/client"]` only — no
  `"node"` types declared and no `@types/node` in devDependencies. The runtime
  test runner is `tsx --test` which doesn't consult tsc, so `npm test` passes
  (79/0/0 in this plan). Type-only check is the diverging surface.
- **Workaround used in Plan 125-06:** Acceptance criterion for Task 3
  ("`tsc --noEmit` exits 0") was satisfied for non-test source (the deliverable
  surface). Test-file type errors are pre-existing and out of scope for this
  plan's Wave 2 substantive changes.
- **Owner:** Future ops plan — add `@types/node` to `vigil-g2-plugin/package.json`
  devDeps and include `"node"` in `tsconfig.json` `types` array, OR add a
  `tsconfig.test.json` extending the base with the node types and update the
  `npm test` target to use it. Either fix is one-line and unrelated to AGENT-HUD-03.
- **Resolved (Plan 125-08):** Took a third path — added `"exclude": ["src/**/*.test.ts", "src/**/__tests__/**"]` to `tsconfig.json`. Tests are runtime artifacts via `tsx --test`, not part of the shipped Vite build. `tsc` (no-emit) now type-checks production source only; pack succeeds. Tests still run via `npm test` (79/0/0). This was a Plan 08 ship-prep blocker (build step in `npm run package:ehpk` was failing on test-file TS2307), so the fix is in-scope here.

---

## Plan 125-08 (Wave 3 — ship-prep + docs amendments + pack)

### DEF-125-08-01 — PWA quiet-mode toggle changes uncommitted from Plan 125-07 work

- **Logged:** 2026-05-10
- **Symptom:** `git status` at Plan 125-08 start showed `vigil-pwa/src/api/client.ts` and `vigil-pwa/src/pages/SettingsPage.test.tsx` modified with Phase 125 AGENT-HUD-03 / D-05 quiet-mode client + tests (`getQuietMode` / `setQuietMode` exports, "G2 Plugin Quiet-mode toggle (AGENT-HUD-03)" describe block). Diffs are clearly Plan 125-07 PWA Wave-2 implementation work-in-progress.
- **Pre-existing:** Yes — present before Plan 125-08 started. Plan 08 did not produce or touch PWA code.
- **Scope verdict:** Out-of-scope per gsd-executor SCOPE BOUNDARY. Plan 08's ship-prep + docs amendments do not interact with PWA code.
- **Owner:** Plan 125-07 (PWA quiet-mode toggle) — that plan's executor or summary needs to commit these along with the rest of the PWA work.

---

## Plan 125-11 (Wave 4 — Portfolio demo skeleton)

### DEF-125-11-01 — AGENT-DEMO-01 prematurely marked `[x]` in REQUIREMENTS.md

- **Logged:** 2026-05-10
- **Symptom:** `.planning/REQUIREMENTS.md` line 44 shows `[x] AGENT-DEMO-01` while the physical 60-second demo recording has not yet happened. The traceability table also shows `| AGENT-DEMO-01 | Phase 125 | TBD |`.
- **Source commit:** Plan 125-08 cascade — `3874977 docs(125-08): cascade 5-doc amendments — single-tap → double-tap, swipe → documented exit gesture, SDK quiet-mode pipeline`. The Plan 08 commit message reads `G2-PLUGIN-01, G2-POLISH-05, AGENT-DEMO-01 marked complete + traceability table updated`. The wording cascade (single-tap → double-tap) was correct; the checkbox flip was premature for AGENT-DEMO-01 specifically because the wallclock recording lives in Plan 11.
- **Pre-existing:** Yes — the `[x]` was set on 2026-05-10 by Plan 08, before Plan 09 (retest skeleton) or Plan 11 (this plan) ran.
- **Scope verdict:** Out-of-scope per gsd-executor SCOPE BOUNDARY. Plan 11's directive is "Do NOT mark AGENT-DEMO-01 complete" — the symmetric corollary is "do not silently un-mark something a sibling plan marked." Surface to user.
- **Recommendation (operator decides):**
  - **Option A — revert and re-mark:** Add corrective commit flipping `[x]` → `[ ]` for AGENT-DEMO-01 now; the operator re-marks `[x]` after the physical recording lands. Keeps `[x]` semantics honest (== requirement satisfied by artifact, not just wording amended).
  - **Option B — accept current state:** Treat the manifest's `status: pending` → `status: complete` flip in `artifacts/demo-clip-manifest.md` (post-recording backfill) as the operator's mark-complete artifact, even though REQUIREMENTS.md checkbox is already `[x]`. Slight false-positive risk for verifier/closer agents.
- **Owner:** Operator at phase close (or sooner, if disposition is "revert"). Plan 125-11 executor does not touch REQUIREMENTS.md.

---

## Plan 125-09 (Wave 4 — Hardware retest)

### DEF-125-09-01 — Persistent banner not redisplayed after expired toast (Phase 124 carry-over)

- **Logged:** 2026-05-10
- **Symptom:** After a `task_complete` toast expires on the Companion HUD, if the underlying session has an unacked persistent `needs_input` or `task_failed` state, the persistent banner does NOT redisplay. Instead the HUD falls back to the normal 3-line layout (label / state-line / message).
- **Surfaced during:** Phase 125 Scenario 1 step 6 — Quiet OFF flushed the held task_complete; toast displayed for 3s; after expiry, HUD returned to normal state for the still-unacked needs_input session instead of re-showing `[NEEDS INPUT]`.
- **Root cause:** `vigil-g2-plugin/src/screens/companion.ts:recomputePersistentBannerForCurrent()` line ~114 early-returns when `bannerState.expiresAt !== undefined`. The expired toast still has `expiresAt` defined (just in the past), so recompute never re-derives the persistent banner from the underlying event.
- **Pre-existing:** Yes — this is a Phase 124 bug, not introduced by Phase 125. The recompute guard was written to "not clobber an active toast" but doesn't distinguish between active and expired toast states.
- **Scope verdict:** Out-of-scope for Phase 125 closure. Does NOT block Scenario 1 — suppression + replay primary contract worked. Filed for Phase 126 follow-up.
- **Recommendation:** Tighten the recompute guard to only skip when `bannerState.expiresAt > nowFn()` (i.e., toast still active). Add a unit test asserting: after toast expires AND the current session has unacked needs_input/task_failed, banner is redisplayed.
- **Owner:** Phase 126 (or whichever phase next touches companion.ts banner state machine).
