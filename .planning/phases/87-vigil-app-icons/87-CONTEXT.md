# Phase 87: Vigil App Icons - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning
**Source:** /gsd-discuss-phase (interactive)

<domain>
## Phase Boundary

Replace default/generic icons with the Vigil diamond+V teal brand mark across two installable surfaces:
1. **PWA** — manifest icons, favicon, apple-touch-icon (renders on iOS/macOS home screen, Dock when installed)
2. **Mac `DailyBriefMonitor.app` bundle** — AppIcon.icns (renders in Finder, Applications, Mission Control)

**Out of scope:**
- Safari / browser extension icons (no SC refers to them)
- Menubar runtime icon (Phase 83 Dock-less behavior is a REGRESSION GUARD, not an edit target)
- Vigil.app (Safari Web App wrapper — OS-generated, not a bundle we own)
- DailyBrief CLI (no icon surface)
</domain>

<decisions>
## Implementation Decisions

### D-01: Master artwork source (LOCKED — REVISED 2026-04-15)
**Master is now a user-provided 1024×1024 PNG at `brand/source/vigil-mark.png`** (option B — full-bleed square, no pre-baked corners; OS/platform masks apply).

User dropped two variants (`vigil-mark-1.png` with wordmark, `vigil-mark-2.png` mark-only); mark-only was chosen as canonical — wordmark loses legibility at 16×16 favicon size. Both variants retained in `brand/source/` for reference.

The authored `brand/source/vigil-mark.svg` from Task 1 is now SUPERSEDED by the user PNG. Downstream tasks resize from the PNG via `sips` only (no SVG/ImageMagick dependency). Original brand PDF at `brand/source/vigil-brand-guidelines.pdf` retained as design reference per D-08.

### D-02: Brand colors (LOCKED — REVISED 2026-04-15)
- **Primary teal:** `#0F6E56` (sampled from user-provided master PNG at brand/source/vigil-mark.png — overrides prior #1D9E75 which was stale memory)
- **Mark color:** white (`#FFFFFF`) diamond outline + white V + light-teal apex dot (composition baked into master PNG)
- PWA manifest `theme_color`: keep current `#0F6E56` (NO CHANGE — matches master)
- PWA manifest `background_color`: keep `#0f172a` (splash bg, unrelated to icon)

### D-03: Icon composition (LOCKED)
Solid teal (#1D9E75) rounded-square background with white diamond+V centered. Standard macOS/iOS app-icon convention. Mark occupies ~60% of icon width — leaves room for Apple's auto-corner-radius on macOS.

### D-04: Maskable variant (LOCKED)
Same composition as D-03, but mark scaled to 80% safe zone (i.e. mark fits inside the inner 80% × 80% square). Ensures the mark survives aggressive Android circular/squircle crops without producing a separate simplified asset.

### D-05: PWA icon set (LOCKED)
Ship these files in `vigil-pwa/public/`:
- `pwa-192x192.png` (exists — regenerate from master)
- `pwa-256x256.png` (NEW)
- `pwa-384x384.png` (NEW)
- `pwa-512x512.png` (exists — regenerate)
- `pwa-512x512-maskable.png` (NEW — per D-04)
- `apple-touch-icon.png` @ 180×180 (exists — regenerate)
- `favicon.svg` (exists — replace with brand mark SVG)
- `favicon.ico` (NEW — 32×32 multi-res for legacy browsers)

Update `vite.config.ts` manifest block to include all 5 PWA sizes (192 any, 256 any, 384 any, 512 any, 512 maskable). Keep the "any maskable" 512 entry or split into two entries — whichever the Vite-PWA schema accepts without warnings.

### D-06: Mac `.icns` generation (LOCKED)
**Pre-generate and commit** `.icns` as a binary artifact. Rationale: deterministic, small (~100KB), no build-time dependency on `iconutil`. `Scripts/install.sh` only needs to `cp` the pre-built file.

Iconset content (standard macOS 10-image set):
- `icon_16x16.png`, `icon_16x16@2x.png`
- `icon_32x32.png`, `icon_32x32@2x.png`
- `icon_128x128.png`, `icon_128x128@2x.png`
- `icon_256x256.png`, `icon_256x256@2x.png`
- `icon_512x512.png`, `icon_512x512@2x.png` (= 1024×1024)

Generate once via `iconutil -c icns brand/mac/AppIcon.iconset` → commit `brand/mac/AppIcon.icns`. Iconset source dir also committed for future regeneration.

### D-07: Info.plist update (LOCKED)
Update the plist template in `Scripts/install.sh` (currently generates `DailyBriefMonitor.app/Contents/Info.plist`) to include:
```xml
<key>CFBundleIconFile</key>
<string>AppIcon</string>
```
And ensure `install.sh` copies `brand/mac/AppIcon.icns` into `DailyBriefMonitor.app/Contents/Resources/AppIcon.icns`.

### D-08: Asset storage convention (LOCKED)
New top-level `brand/` directory. Layout:
```
brand/
├── source/
│   ├── vigil-mark.svg         # Master mark (extracted from PDF)
│   └── vigil-brand-guidelines.pdf  # Committed local copy for reference
├── pwa/
│   ├── pwa-192x192.png
│   ├── pwa-256x256.png
│   ├── pwa-384x384.png
│   ├── pwa-512x512.png
│   ├── pwa-512x512-maskable.png
│   ├── apple-touch-icon.png
│   ├── favicon.svg
│   └── favicon.ico
└── mac/
    ├── AppIcon.iconset/       # 10-image source iconset
    │   └── icon_*.png
    └── AppIcon.icns           # Pre-generated, committed
```

`vigil-pwa/public/` files can be symlinks OR direct copies from `brand/pwa/`. Direct copies are simpler — use those.

### D-09: Regression guard — menubar runtime (LOCKED)
Phase 83 made DailyBriefMonitor Dock-less via `LSUIElement = true` in Info.plist. This phase MUST NOT remove or alter that key. Verification step: `grep -A1 LSUIElement .../Info.plist` after install still shows `<true/>`.

### D-10: Icon set validation tooling (Claude's Discretion)
Add a small doctor check (extend `Scripts/dailybrief-doctor.sh` Check 7, or inline) that verifies `DailyBriefMonitor.app/Contents/Resources/AppIcon.icns` exists after install. PWA icon presence can be verified via `vite build` output manifest or a one-off grep in the Verification step.

### Claude's Discretion
- Extraction method from PDF (Preview export vs. pdftoppm vs. Inkscape trace) — picker's choice based on mark quality. Save the SVG to `brand/source/vigil-mark.svg` as the canonical source.
- PNG generation tool — rsvg-convert / ImageMagick / sips. Pick whichever is on macOS by default (sips) when possible to avoid new dependencies.
- Rounded-corner radius — use the macOS Big Sur+ convention (~22.37% of icon width, the "squircle" radius). For PWA the OS applies its own mask so internal corners don't matter.
- Whether to use vite-plugin-pwa's `pwaAssetsGenerator` helper vs. pre-generate externally — prefer pre-generate externally so assets are version-controlled PNGs, not build artifacts.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Brand guidelines (off-tree — copy into repo during execution)
- `~/Library/Mobile Documents/com~apple~CloudDocs/vigil-brand-guidelines.pdf` — master brand document (logo mark, teal #1D9E75, typography, voice). To be copied to `brand/source/` as part of Plan 01.

### Existing PWA config
- `vigil-pwa/vite.config.ts` — VitePWA plugin config; icons[] array must be extended to match D-05
- `vigil-pwa/public/` — current icon files (to be regenerated from master)

### Existing Mac install flow
- `Scripts/install.sh` — plist generation + .app bundle assembly; needs AppIcon.icns copy step + CFBundleIconFile key (see D-07)

### Regression references
- Phase 83 work on `LSUIElement` (Dock-less menubar) — search for in install.sh plist template; must remain `true` (D-09)

</canonical_refs>

<specifics>
## Specific Ideas

- Icon corner convention: let the OS apply corners on macOS (use squared-PNG source, macOS overlays its own mask). For PWA, ship squared PNGs with internal rounded background drawn in the asset.
- Favicon.svg should inline the teal background + white mark so it shows correctly in browser tabs without CSS dependencies.
- Apple touch icon spec: 180×180 PNG, no transparency (iOS ignores alpha).
- For maskable, the PWA spec requires the safe zone to be the inner ~80% diameter circle — composing the mark to fit inside an 80% square satisfies this with margin.

</specifics>

<deferred>
## Deferred Ideas

- **Animated/splash variant** — No SC calls for one; skip.
- **Dark-mode icon variant** — macOS doesn't support per-appearance app icons at the bundle level; defer.
- **Safari extension icon refresh** — browser extension (`vigil-extension/icons`) currently has icon16/48/128. Not in SC-1..SC-6. Capture as backlog idea — new phase later.
- **Menubar runtime icon** — SC-5 is a regression guard; the runtime template-image icon is intentionally unchanged.
- **Vigil.app (Safari Web App wrapper)** — OS-generated, not a bundle we control. Once PWA icons land, the Web App wrapper should reflect them automatically.

</deferred>

---

*Phase: 87-vigil-app-icons*
*Context gathered: 2026-04-15 via /gsd-discuss-phase*
