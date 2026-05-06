---
phase: 106-g2-store-resubmit-atomic
plan: 05
subsystem: g2
tags: [g2, hardware-uat, screenshots, atomic-pack, ehpk, even-hub, store-resubmit, simulator]

requires:
  - phase: 106-01
    provides: atomic-gate scaffold (check-verified.mjs + VERIFIED.md template + package:ehpk script)
  - phase: 106-02
    provides: G2-02 home double-tap → shutDownPageContainer(1) source impl
  - phase: 106-03
    provides: G2-03 unified buildVigilHeader + greyscale borders + Vigil-voice fallbacks
  - phase: 106-04
    provides: VITE_SCREENSHOT_MODE flag + DEMO_BRIEF/AFFIRMATION/SUMMARY constants
provides:
  - vigil-g2-plugin/store-assets/01-work-orders.png (576×288, deterministic demo data)
  - vigil-g2-plugin/store-assets/02-affirmation.png (576×288, deterministic demo data)
  - VERIFIED.md filled with 2026-05-06T00:23:30Z verification timestamp + all G2-01/02/03 checkboxes ticked
  - vigil.ehpk packed at 27,256 bytes (gitignored per *.ehpk rule, reproducible from source)
  - Submitted to Even Hub store dashboard (manual upload per D-14)
  - HARDWARE-DIVERGENCE.md documenting 6 simulator/hardware divergences observed during UAT
  - HARDWARE-RESOLVED.md (renamed from HARDWARE-BLOCKED.md) with resolved_at_sha 71973e3
affects:
  - vigil-g2-plugin/src/screens/affirmation.ts (containerName + glyph patches)
  - vigil-g2-plugin/src/screens/home.ts (containerName retained, glyph patches)
  - vigil-g2-plugin/src/screens/task-detail.ts (containerName + glyph patches)
  - vigil-g2-plugin/src/screens/work-orders.ts (containerName + glyph patches)

tech-stack:
  added: ["@evenrealities/evenhub-simulator@0.6.2 (newly available; closed RESEARCH Q2 simulator gap)"]
  patterns:
    - QR sideload via `evenhub qr -i <ip> -p <port> --http --path /index.html` against local static server (runbook gap discovered + filled)
    - Web Inspector USB attach (Settings → Safari → Advanced → Web Inspector ON; Mac Safari Develop → iPhone → index.html) for live event observation
    - Simulator built-in 📸 button saves native 576×288 PNGs to CWD (no cropping/downscaling required)

key-decisions:
  - "containerName values must be ≤16 chars — physical G2 SDK validator strictly enforces; simulator was lenient. Renamed work-orders/affirmation/task-detail prefixes to wo-*/af-*/td-*."
  - "Replaced ▲ (U+25B2) and ⌾ (U+233E) glyphs with ASCII (* and ()) — simulator font lacks U+233E (lvgl: glyph dsc. not found warning), reviewer fonts may also drop them."
  - "Hardware UAT screenshots captured from evenhub-simulator (not iPhone canvas); iPhone canvas turned out to be a launcher-only surface, not a preview. Simulator availability resolves the original 106-RESEARCH Q2 'no headless render path' finding."
  - "Phase 45 list-container SCROLL-out-of-list works on simulator but not hardware — captured in HARDWARE-DIVERGENCE.md as Divergence 2, not blocking ship per runbook Section 3 escape clause."
  - "vigil.ehpk gitignored per existing vigil-g2-plugin/.gitignore *.ehpk rule — reproducible from source via npm run package:ehpk + matching VERIFIED.md timestamp; no need to commit binary."

patterns-established:
  - "Hardware UAT runbook supersedes RESEARCH simulator-only assumptions; on-arrival, re-test container constraints (containerName length, glyph rendering) before assuming code-as-built will pass."
  - "When ehpk pack is paused on hardware: pre-stage runbook before delivery; deliver-day execution > deliver-day design (this runbook authored 2026-05-02, executed 2026-05-05)."

---

# Plan 106-05 Summary — G2 Store Resubmit Hardware UAT and Pack

## What shipped (5/5 plans, ship gate satisfied)

| Plan | Requirement | Status |
|------|-------------|--------|
| 106-01 | Atomic-gate scaffold | done (prior) |
| 106-02 | G2-02 host exit-confirm dialog | done (prior) |
| 106-03 | G2-03 unified header + greyscale borders + Vigil-voice fallbacks | done (prior) |
| 106-04 | G2-01 code side: VITE_SCREENSHOT_MODE + DEMO constants | done (prior) |
| 106-05 | G2-01 artifact side: simulator screenshots + VERIFIED.md timestamp + vigil.ehpk pack | **done 2026-05-05** |

## Hardware UAT execution (2026-05-05)

G2 glasses arrived 8 days ahead of DHL ETA (firmware 2.2.0.28, paired to Even iPhone app v2.2.0). Pre-staged runbook at `.planning/v3.5-G2-HARDWARE-UAT-RUNBOOK.md` executed in single sitting on iMac (Jamesons-iMac.local, x86_64, macOS 15.7.5).

**Pre-flight ✓:** machine confirmed (iMac), VERIFIED.md placeholder intact, .env.production audit clean (T8-leak-1), npm run build clean (138ms), evenhub CLI v0.1.11 + simulator v0.6.2 installed, app + firmware ≥ minimums.

**Section 2 (atomic gate):**
- 2a: screenshot-mode build clean; demo strings (PR-4827, Q2 OKRs, plumber, "exactly where you need") confirmed in bundle
- 2b: native 576×288 PNGs captured via simulator's built-in 📸 button (saves to CWD as `glasses_<YYYYMMDDHHMMSS>.png`); moved to `store-assets/01-work-orders.png` + `02-affirmation.png`
- 2c: G2-02 host exit dialog verified on physical G2 hardware via Web Inspector console (eventType:3 from home-body fires shutDownPageContainer(1))
- 2d: G2-03 verified across all 4 screens (HOME via sketch, WORK_ORDERS + AFFIRMATION via simulator screenshots, TASK_DETAIL via source review)
- 2e: stale-gate D-13 negative test passed (40h-backdated VERIFIED.md → exit 1 with clear message)

**Section 3 (Phase 45 retest):** Tap-to-expand and double-tap-home verified on hardware. Swipe-out-of-list-container is a real divergence (Divergence 2 in HARDWARE-DIVERGENCE.md) — workaround via DOUBLE_CLICK → home → SCROLL_TOP wraps to AFFIRMATION. Not blocking ship per runbook Section 3 escape clause.

**Section 4 (sign-off):**
- VERIFIED.md filled with 2026-05-06T00:23:30Z timestamp + all G2-01/02/03 boxes ticked
- vigil.ehpk packed at 27,256 bytes (production build, no VITE_SCREENSHOT_MODE)
- Submitted manually to Even Hub store dashboard (D-14 — phase explicitly stops at packaged file, no auto-upload)
- HARDWARE-BLOCKED.md renamed to HARDWARE-RESOLVED.md with resolved_at_sha 71973e3
- STATE.md flipped v3.5 from `paused` → `ready-to-close`

## Source patches required by hardware UAT (vs. simulator-only Phase 45)

Two SDK-validator constraints that simulator did not enforce:

1. **containerName ≤16 chars.** Physical G2 SDK returns `StartUpPageCreateResult.invalid` (=1) on create and `false` on rebuild for any container with name >16 chars. Renamed work-orders-* / affirmation-* / task-detail-* (all 18 chars) to wo-* / af-* / td-* prefixes. Home was already compliant.

2. **Unicode glyph fallout.** `▲` (U+25B2) and `⌾` (U+233E) absent from simulator font (warning: `lvgl: glyph dsc. not found for U+233E`). Replaced with ASCII (`*` and `()` respectively) in 5 locations (home body task-count prefix + 4 footer strings).

Both fixes verified on hardware: after patching, all 3 carousel screens (home/work-orders/affirmation) rebuild successfully with `rebuildPageContainer returned: true` in console.

## Hardware divergences captured (NOT blocking ship)

See `HARDWARE-DIVERGENCE.md` for full details. 6 divergences: containerName limit, list-container SCROLL swallowing, iPhone canvas absence, home body overflow, glyph fallout, device-status flutter. All documented for v3.8+ follow-up.

## Verification

- VERIFIED.md (this directory) with 2026-05-06T00:23:30Z timestamp + ticked checkboxes
- 106-UAT.md (this directory): 6/6 tests passed, committed at sha 7157896
- HARDWARE-DIVERGENCE.md (this directory)
- HARDWARE-RESOLVED.md (this directory): resolved_at_sha 71973e3

## Task Commits

- `71973e3` feat(106-05): G2 store resubmit — vigil.ehpk packed and submitted to Even Hub
- `47cf9c7` docs(106-05): close hardware-blocked loop and flip STATE.md to ready-to-close
- `7157896` test(106): complete UAT — 6/6 passed, atomic gate + G2-01/02/03 verified
