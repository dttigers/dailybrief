# Phase 124 Plan 04 Task 3 — D-14 byte-identical PNG verification

**Status:** pending operator action
**Created:** 2026-05-10
**Blocking:** Phase 124 Plan 04 closure (G2-POLISH-07)
**Plan:** `.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-04-PLAN.md`

## Why this is operator-only

Plan 04 is `autonomous: false` because Task 3 is a `checkpoint:human-verify`
gated on operating the `evenhub-simulator` desktop GUI app:

1. The simulator is a Mac desktop GUI launched via `evenhub-simulator` — no
   headless mode is available in the installed binary's `--help` output
   (only `--automation-port` for an HTTP debug surface; no documented
   screenshot capture endpoint).
2. The 📸 capture button is a GUI element clicked by the user; there is no
   CLI flag in `evenhub-simulator --help` that triggers a capture-and-save.
3. Per the milestone memory `feedback_wallclock_checkpoint_exempt`, yolo
   mode (`parallelization.skip_checkpoints: true`) does NOT bypass
   physical-host actions or sim-screenshot pipelines requiring real
   environment setup.

Plan 04 Tasks 1 and 2 (autonomous) landed fine — see commits below. Drift
detector + tsc are clean. Only the byte-identical sim-PNG gate is left.

## Completed prerequisites (auto-landed)

| Task | Commit | What |
|------|--------|------|
| 1 | `cf4984e` | Trim Home body to 4 lines + drop affirmation parameter |
| 2 | `3a67c41` | Drift-detector test locks 4-line invariant + signature |

Verification today:
- `cd vigil-g2-plugin && npx tsc --noEmit` → 0 errors involving home.ts /
  main.ts / navigation.ts (2 pre-existing test-file `node:test` type
  errors are out of scope from Plan 01 baseline)
- `cd vigil-g2-plugin && npm test` → 6/6 pass

## Operator runbook

### Setup (first-time only)

1. `cd vigil-g2-plugin`
2. Confirm `.env.screenshot.example` is present (it is — line 19 sets
   `VITE_SCREENSHOT_MODE=1`).
3. Confirm `evenhub-simulator` launches (`which evenhub-simulator` →
   `/usr/local/bin/evenhub-simulator`).

### Capture #1

```bash
cd "/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-g2-plugin"
cp .env.screenshot.example .env.local                   # plumbs VITE_SCREENSHOT_MODE=1
npm run build                                           # produces dist/
mkdir -p /tmp/vigil-124-04-png
```

Then open `evenhub-simulator`, load the built plugin from `dist/`,
navigate to the **Home** screen, wait 2 seconds, click the 📸 capture
button, save the PNG as `/tmp/vigil-124-04-png/home-capture-1.png`.

### Capture #2 (no source changes)

Reload `evenhub-simulator` (or close and reopen). Re-load the **same**
`dist/` build — do NOT rebuild between captures, bundle hashes must match.
Navigate to Home, wait 2 seconds, click 📸, save as
`/tmp/vigil-124-04-png/home-capture-2.png`.

### Compare

```bash
cd /tmp/vigil-124-04-png
cmp home-capture-1.png home-capture-2.png \
  && echo "PASS: byte-identical" \
  || echo "FAIL: differ"
```

If FAIL — investigate (RESEARCH Pitfall 6 fallbacks):

```bash
# Confirm dimensions match
sips -g pixelWidth -g pixelHeight home-capture-1.png home-capture-2.png

# (Optional) ImageMagick is NOT installed locally; install if you need
# pixel-count diagnostics:
#   brew install imagemagick
#   magick compare -metric AE home-capture-1.png home-capture-2.png /tmp/diff.png

# If dimensions match but headers differ (e.g. clock 22:13 → 22:14), crop
# to body region (yPosition 40 to 250 = 210 px tall, full 576 px wide):
sips --cropToHeightWidth 210 576 --cropOffset 40 0 \
  -o /tmp/vigil-124-04-png/home-body-1.png home-capture-1.png
sips --cropToHeightWidth 210 576 --cropOffset 40 0 \
  -o /tmp/vigil-124-04-png/home-body-2.png home-capture-2.png
cmp /tmp/vigil-124-04-png/home-body-1.png /tmp/vigil-124-04-png/home-body-2.png \
  && echo "PASS: body-region byte-identical" \
  || echo "FAIL: body region differs — full investigation needed"
```

### Recording the result

Paste verbatim into
`.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-04-SUMMARY.md`
under the **Task 3 D-14 verification** section:

- The exact `cmp` command run
- The exact stdout (`PASS: byte-identical`, `PASS: body-region
  byte-identical`, or the failure reason)
- The `cmp` exit code (0 = match, 1 = differ, 2 = error)

Then close out:

```bash
mv .planning/todos/pending/2026-05-10-phase-124-04-png-equality-operator-run.md \
   .planning/todos/completed/
git add -A
git commit -m "docs(124-04): record operator PNG-equality verification — <PASS|FAIL>"
```

If PASS — also update STATE.md to mark Plan 04 as complete and proceed
with Phase 124 Plan 05.

If FAIL — log a blocker via `gsd-sdk query state.add-blocker "G2-POLISH-07
sim non-deterministic — body-region diff details: ..."` and either ride a
fix into the same plan or open Phase 125 follow-up per D-14 deferred-item.

### Hardware retest (DEFERRED — explicit per D-14)

Even if sim equality PASSES, the real-glasses retest is operator procedure
when next on hand. Add a deferred-items row in STATE.md:

```
| seed | G2-POLISH-07 hardware retest on real G2 glasses | active | sim
equality verified <date>; hardware retest blocking only if Phase 125
ride-along reveals divergence (per D-14 + feedback_g2_tap_expand_broken) |
```

## Why structurally safe to defer

The plan's structural fix is already locked by:

1. **Task 1's code change** — `bodyContent` array literally has 4 entries.
   Container is 210px with paddingLength 8. 4 lines at the SDK's default
   line-height fit cleanly inside 210−16=194px usable height. Math says
   no overflow possible.
2. **Task 2's drift detector** — any future ride-along that grows
   `bodyContent` past 4 entries trips at `npm test` time before reaching
   hardware. Future regressions cannot silently reintroduce the
   210px-overflow bug.

D-14's PNG-equality gate is a CONFIRMATION layer over a structurally-
correct fix. Deferring it does not put the codebase in a regressed state;
the partial SUMMARY.md (with this todo cross-referenced) preserves the
chain-of-evidence the same way Phase 123 Plan 05's 24h-soak deferral did.

---

## CLOSEOUT — 2026-05-10 (jamesonmorrill)

Closed via the live-E2E session documented in `124-VERIFICATION.md`.
Captures archived to `/tmp/vigil-124-07-png/`.

Sign-off matrix: see VERIFICATION.md `runs[1]` (date 2026-05-10).
