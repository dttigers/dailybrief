---
phase: 87-vigil-app-icons
plan: 01
subsystem: brand
tags: [icons, pwa, macos, sips, iconutil, brand-assets]

requires:
  - phase: 83-monitor-only-pivot
    provides: DailyBriefMonitor.app bundle (LSUIElement) — install.sh target for AppIcon.icns in plan 87-03

provides:
  - brand/source/ master assets (PNG canonical + PDF reference + SVG legacy)
  - brand/pwa/ 8-file icon set (192/256/384/512/512-maskable/apple-touch/favicon.svg/favicon.ico)
  - brand/mac/ 10-image AppIcon.iconset + compiled AppIcon.icns

affects: [87-02-pwa-manifest-wireup, 87-03-mac-bundle-wireup]

tech-stack:
  added: []
  patterns:
    - "Single-source brand asset tree under brand/{source,pwa,mac}/ — all derived assets regen from source/vigil-mark.png via sips"
    - "Pre-compiled .icns committed as binary artifact (D-06) — install.sh only copies, never regenerates"
    - "favicon.svg as PNG-embedded SVG wrapper (xlink:href data URI) — vector container, raster fidelity"

key-files:
  created:
    - brand/source/vigil-mark.png (1024×1024 master, user-provided)
    - brand/source/vigil-mark.svg (legacy authored SVG, superseded for raster gen)
    - brand/source/vigil-brand-guidelines.pdf
    - brand/pwa/pwa-{192,256,384,512}x{...}.png
    - brand/pwa/pwa-512x512-maskable.png
    - brand/pwa/apple-touch-icon.png (180×180)
    - brand/pwa/favicon.svg (PNG-embedded wrapper)
    - brand/pwa/favicon.ico (true 32×32 ICO via sips -s format ico)
    - brand/mac/AppIcon.iconset/icon_*.png (10 sizes, 16→1024)
    - brand/mac/AppIcon.icns (97990 bytes, ic12 type)
  modified: []

key-decisions:
  - "Master pivoted to user-provided PNG (brand/source/vigil-mark.png) — authored SVG superseded for raster generation per revised D-01"
  - "Brand teal corrected to #0F6E56 (sampled from PNG) — overrides stale #1D9E75 in original CONTEXT (revised D-02)"
  - "Use sips exclusively for raster resize — no rsvg-convert / ImageMagick dependency"
  - "favicon.ico generated as true single-image 32×32 ICO via sips -s format ico (no multi-res — modern browsers + macOS Safari prefer SVG anyway)"
  - "favicon.svg built as PNG-embedded SVG wrapper (data URI) instead of vector trace — preserves baked-in mark fidelity from PNG master"
  - "icon_512x512@2x.png copied directly from 1024 master (no resize) — preserves source fidelity at the largest required scale"

patterns-established:
  - "brand/source/*.png is canonical master — every PWA + Mac asset derived via sips one-shot"
  - "Iconset → .icns via iconutil -c icns; output committed for deterministic install"

requirements-completed: []

duration: ~3min (Tasks 2+3 only; Task 1 previously completed in prior session)
completed: 2026-04-15
---

# Phase 87 Plan 01: Vigil App Icon Asset Generation Summary

**Single-source brand asset tree (PNG master → 8 PWA files + 10-image Mac iconset + AppIcon.icns) generated via sips/iconutil with zero new dependencies.**

## Performance

- **Duration:** ~3 min for Tasks 2+3 (Task 1 completed in prior session)
- **Started:** 2026-04-15T21:21:00Z (Task 2 resume)
- **Completed:** 2026-04-15T21:22:34Z
- **Tasks:** 3 (Task 1 prior, Tasks 2-3 this session)
- **Files created:** 19 (1 PNG master + 1 PDF + 1 legacy SVG already committed; 8 PWA + 10 iconset + 1 .icns this session)

## Accomplishments
- All 8 PWA icon variants generated at correct dimensions (192, 256, 384, 512, 512-maskable, 180 apple-touch)
- True 32×32 ICO favicon produced via sips (no ImageMagick/png2ico install needed)
- Vector-container favicon.svg with embedded PNG (renders crisp at every browser-tab scale)
- 10-image macOS standard iconset rendered + compiled to AppIcon.icns (97KB, recognized as Mac OS X icon ic12)
- Plans 87-02 (PWA wire-up) and 87-03 (Mac install.sh wire-up) unblocked — both can run in parallel against this asset tree

## Task Commits

1. **Task 1: Lock master PNG + brand color correction** — `3bead5e` (feat) + `f17a1a9` (docs revision) — *prior session*
2. **Task 2: Generate PWA icon set** — `94ac10f` (feat)
3. **Task 3: Generate Mac iconset + compile AppIcon.icns** — `85d2c00` (feat)

## Files Created/Modified

**This session:**
- `brand/pwa/pwa-192x192.png` — PWA manifest "any" 192
- `brand/pwa/pwa-256x256.png` — PWA manifest "any" 256
- `brand/pwa/pwa-384x384.png` — PWA manifest "any" 384
- `brand/pwa/pwa-512x512.png` — PWA manifest "any" 512
- `brand/pwa/pwa-512x512-maskable.png` — PWA manifest "maskable" 512 (D-04)
- `brand/pwa/apple-touch-icon.png` — iOS home-screen 180×180
- `brand/pwa/favicon.svg` — vector wrapper around master PNG (data URI)
- `brand/pwa/favicon.ico` — 32×32 single-image ICO for legacy + tab favicon
- `brand/mac/AppIcon.iconset/icon_16x16.png` through `icon_512x512@2x.png` — 10 sizes
- `brand/mac/AppIcon.icns` — pre-compiled .icns (D-06)

**Prior session (Task 1):**
- `brand/source/vigil-mark.png` (1024×1024 user-provided master)
- `brand/source/vigil-mark-1.png`, `vigil-mark-2.png` (variants kept for reference)
- `brand/source/vigil-mark.svg` (legacy authored SVG — superseded for raster gen)
- `brand/source/vigil-brand-guidelines.pdf`

## Decisions Made

- **PNG master over SVG (D-01 revised):** User dropped a final 1024×1024 PNG composition; sips can resize it deterministically with macOS-default tooling. Authored SVG retained for documentation but not used in raster pipeline.
- **Brand teal correction (D-02 revised):** Sampled `#0F6E56` from the user PNG — overrides stale `#1D9E75` in original CONTEXT. `vite.config.ts` theme_color already matches #0F6E56 (no change needed).
- **favicon.ico via sips:** macOS sips supports `-s format ico` natively as of recent macOS releases — produced a valid `MS Windows icon resource` 32×32 32bpp file. No ImageMagick/png2ico install required.
- **favicon.svg as PNG-embedded wrapper:** Inlines the master PNG via `<image xlink:href="data:image/png;base64,...">` — gives a vector container with raster fidelity, no separate vector-trace pass needed (which would lose the apex dot detail).
- **icon_512x512@2x.png from master copy:** The 1024 master IS the @2x asset — `cp` instead of `sips -z 1024 1024` avoids any resampling round-trip.

## Deviations from Plan

The plan was authored against the original D-01/D-02 (SVG master, #1D9E75 teal). The pre-execution objective revision swapped both:
- **Tooling deviation (driven by revised D-01):** Used `sips` exclusively instead of the plan's `rsvg-convert` / `ImageMagick` recipe. This is a context-driven substitution per the resume objective ("Use `sips -z <size> <size> brand/source/vigil-mark.png --out <target>` for all PNG resizing"), not a Rule-1/2/3 auto-fix. No new dependencies installed.
- **Maskable variant (D-04):** Plan's recipe wrapped the SVG mark in an 80% transform. With the user PNG, the mark is already composed within the safe zone (full-bleed teal extends edge-to-edge, white mark inset). Direct 512×512 resize satisfies D-04 without a separate maskable composition step.
- **favicon.svg:** Plan said `cp brand/source/vigil-mark.svg brand/pwa/favicon.svg`. With the PNG master canonical, used the PNG-embedded SVG wrapper approach from the resume objective instead. Output is still a valid SVG file at `brand/pwa/favicon.svg`.

**Total deviations:** 0 auto-fixes (Rules 1-3) — all variations were directed by the pre-execution objective revision (D-01/D-02 update).
**Impact on plan:** Asset tree matches D-08 layout exactly; plans 87-02 and 87-03 consume identical paths.

## Issues Encountered

None. Master PNG was clean 1024×1024, sips chain ran without errors, iconutil compiled on first attempt.

## User Setup Required

None — all assets are version-controlled binaries.

## Next Phase Readiness

- **Plan 87-02 (PWA wire-up):** Ready. Copy `brand/pwa/*` into `vigil-pwa/public/` and update `vite.config.ts` `VitePWA` `manifest.icons[]` per D-05.
- **Plan 87-03 (Mac bundle wire-up):** Ready. `Scripts/install.sh` needs to `cp brand/mac/AppIcon.icns DailyBriefMonitor.app/Contents/Resources/AppIcon.icns` and add `CFBundleIconFile = AppIcon` to plist (D-07). Verify `LSUIElement = true` retained (D-09 regression guard).

## Self-Check: PASSED

**Files verified:**
- FOUND: brand/source/vigil-mark.png
- FOUND: brand/pwa/pwa-192x192.png, pwa-256x256.png, pwa-384x384.png, pwa-512x512.png, pwa-512x512-maskable.png, apple-touch-icon.png, favicon.svg, favicon.ico
- FOUND: brand/mac/AppIcon.iconset/ (10 PNGs)
- FOUND: brand/mac/AppIcon.icns (97990 bytes, Mac OS X icon ic12)

**Commits verified:**
- FOUND: 3bead5e (Task 1 — prior)
- FOUND: f17a1a9 (Task 1 D-01/D-02 revision — prior)
- FOUND: 94ac10f (Task 2 — PWA assets)
- FOUND: 85d2c00 (Task 3 — Mac iconset + .icns)

---
*Phase: 87-vigil-app-icons*
*Completed: 2026-04-15*
