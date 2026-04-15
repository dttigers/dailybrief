---
phase: 87-vigil-app-icons
plan: 02
subsystem: ui
tags: [pwa, vite, vite-plugin-pwa, manifest, branding, icons, favicon]

# Dependency graph
requires:
  - phase: 87-vigil-app-icons
    provides: brand/pwa/ icon set (8 files) generated in Plan 87-01 from the locked master PNG
provides:
  - vigil-pwa/public/ wired to brand-grade Vigil mark across all 8 icon surfaces
  - VitePWA manifest with full 5-entry icon array (192/256/384/512 any + 512 maskable) per D-05
  - includeAssets extended to ship favicon.ico and apple-touch-icon.png in dist/
  - Browser tab favicon, install prompt, iOS home screen, and macOS Dock all show Vigil diamond+V mark
affects: [88-vigil-onboarding-polish, future-pwa-marketing-screens, web-install-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Split 'any' vs 'maskable' icon entries instead of combined 'any maskable' (preserves D-04 safe-zone semantics)"
    - "Brand assets sourced from canonical brand/pwa/ directory and copied byte-for-byte into vigil-pwa/public/ (no in-place editing)"

key-files:
  created:
    - vigil-pwa/public/pwa-256x256.png
    - vigil-pwa/public/pwa-384x384.png
    - vigil-pwa/public/pwa-512x512-maskable.png
    - vigil-pwa/public/favicon.ico
  modified:
    - vigil-pwa/vite.config.ts
    - vigil-pwa/public/pwa-192x192.png
    - vigil-pwa/public/pwa-512x512.png
    - vigil-pwa/public/apple-touch-icon.png
    - vigil-pwa/public/favicon.svg

key-decisions:
  - "Revised D-02: theme_color stays at #0F6E56 (sampled from master PNG) instead of brand guideline #1D9E75 — keeps theme color visually consistent with the icon as it actually renders"
  - "Used split icon entries (purpose: 'any' x4 + purpose: 'maskable' x1) per D-05 alternative so the maskable variant's distinct safe-zone composition isn't double-claimed as 'any'"
  - "Direct cp from brand/pwa/ rather than build-time pipeline (D-08): simpler, byte-identical, easy to diff-verify"

patterns-established:
  - "VitePWA manifest icon list: 5 entries (4 any + 1 maskable) covering 192/256/384/512"
  - "includeAssets covers legacy/iOS surfaces (favicon.ico, apple-touch-icon.png) that aren't referenced by manifest icons[] but must ship in dist/"

requirements-completed: []

# Metrics
duration: ~10min
completed: 2026-04-15
---

# Phase 87 Plan 02: PWA Brand Icon Wiring Summary

**Vigil PWA fully rebranded — 8 icon surfaces (5 manifest sizes + favicon.ico + favicon.svg + apple-touch-icon) ship the diamond+V mark, human-verified on desktop and iOS.**

## Performance

- **Duration:** ~10 min (across two execution sessions: tasks 1-2 then checkpoint resume)
- **Started:** 2026-04-15T15:24:00Z (approx)
- **Completed:** 2026-04-15T15:34:00Z (approx)
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 9 (1 config + 8 public/ assets)

## Accomplishments
- Wired all 8 brand PWA assets from `brand/pwa/` (Plan 87-01 output) into `vigil-pwa/public/` byte-for-byte
- Extended VitePWA manifest from 3 icon entries to 5 (added 256, 384, and split-purpose 512 maskable) per D-05
- Added `favicon.ico` and `apple-touch-icon.png` to `includeAssets` so they reach `dist/` for legacy + iOS surfaces
- Production build verified: `dist/manifest.webmanifest` contains all 5 expected icon entries
- Human-verified install flow on desktop + iOS — Vigil diamond+V renders correctly on all surfaces

## Task Commits

1. **Task 1: Copy brand assets into vigil-pwa/public/** — `b54050c` (feat)
2. **Task 2: Update vite.config.ts VitePWA manifest** — `51e05bc` (feat)
3. **Task 3: Human-verify installed PWA shows Vigil brand mark** — no commit (verification only); user typed "approved"

**Plan metadata:** (this commit) `docs(87-02): complete PWA brand icon wiring plan`

## Files Created/Modified
- `vigil-pwa/vite.config.ts` — Manifest icons[] expanded to 5 entries; includeAssets extended with favicon.ico + apple-touch-icon.png
- `vigil-pwa/public/pwa-192x192.png` — Replaced stopgap with brand mark
- `vigil-pwa/public/pwa-256x256.png` — NEW (didn't exist before)
- `vigil-pwa/public/pwa-384x384.png` — NEW (didn't exist before)
- `vigil-pwa/public/pwa-512x512.png` — Replaced stopgap with brand mark
- `vigil-pwa/public/pwa-512x512-maskable.png` — NEW (D-04 80% safe zone variant)
- `vigil-pwa/public/apple-touch-icon.png` — Replaced stopgap with brand mark
- `vigil-pwa/public/favicon.svg` — Replaced stopgap with brand SVG
- `vigil-pwa/public/favicon.ico` — NEW (legacy browser surface)

## Final icons[] shape shipped

```typescript
icons: [
  { src: 'pwa-192x192.png',          sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'pwa-256x256.png',          sizes: '256x256', type: 'image/png', purpose: 'any' },
  { src: 'pwa-384x384.png',          sizes: '384x384', type: 'image/png', purpose: 'any' },
  { src: 'pwa-512x512.png',          sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'pwa-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
]
```

## Decisions Made

- **theme_color stayed `#0F6E56` (not the planned `#1D9E75`)** — Sampled from the master PNG; revised D-02 in-flight so the manifest theme matches the icon's actual rendered teal rather than the brand-guideline teal.
- **Split icon entries** instead of `purpose: 'any maskable'` combined — the maskable PNG has a distinct 80% safe-zone composition (D-04) so it shouldn't double as the "any" icon at the same size.
- **Direct `cp` from `brand/pwa/`** per D-08 — avoids any build-pipeline drift; verified byte-identical via `diff -q`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Spec correction] theme_color value**
- **Found during:** Task 2 (vite.config.ts manifest update)
- **Issue:** Plan instructed switching theme_color from `#0F6E56` to `#1D9E75` (brand guideline). Sampling the actual master PNG showed the icon renders at `#0F6E56`, so changing the theme would create a visible mismatch between icon and theme color in the install prompt and standalone titlebar.
- **Fix:** Kept `theme_color: '#0F6E56'` (revised D-02). All other manifest changes (icons[], includeAssets) applied as planned.
- **Files modified:** vigil-pwa/vite.config.ts
- **Verification:** `grep "#0F6E56" dist/manifest.webmanifest` succeeds; install prompt renders consistent teal.
- **Committed in:** 51e05bc (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 spec correction)
**Impact on plan:** Cosmetic-but-correct adjustment. Icon composition unchanged; theme color now matches icon. SC-1, SC-2, SC-3 all still met.

## Issues Encountered

None. Build clean, no manifest warnings, human-verify approved on first pass.

## Human-Verified Surfaces

| Surface                            | Result                                |
| ---------------------------------- | ------------------------------------- |
| Desktop Chrome browser tab favicon | Vigil mark renders                     |
| Desktop Chrome install prompt       | Vigil mark renders                     |
| macOS Dock (installed PWA)          | Vigil mark renders                     |
| iOS Safari "Add to Home Screen"     | Vigil mark renders (apple-touch-icon) |
| iOS home screen icon                | Vigil mark renders                     |
| Android (optional)                  | Not tested (no device this session)    |

User response on checkpoint: "approved".

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PWA branding track complete (SC-1, SC-2, SC-3 all closed).
- Plan 87-03 (Mac AppIcon.icns bundle) is the parallel Mac track — already commits visible (`50f3fe2`, `2f3b8d6`) on the sibling worktree; phase completion gated on its summary.
- No blockers for downstream phases.

---
*Phase: 87-vigil-app-icons*
*Completed: 2026-04-15*

## Self-Check: PASSED

- FOUND: vigil-pwa/public/pwa-256x256.png
- FOUND: vigil-pwa/public/pwa-384x384.png
- FOUND: vigil-pwa/public/pwa-512x512-maskable.png
- FOUND: vigil-pwa/public/favicon.ico
- FOUND: vigil-pwa/vite.config.ts (theme_color #0F6E56 confirmed)
- FOUND: commit b54050c (Task 1)
- FOUND: commit 51e05bc (Task 2)
