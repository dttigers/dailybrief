---
phase: 87-vigil-app-icons
verified: 2026-04-15T22:00:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 87: Vigil App Icons Verification Report

**Phase Goal:** Replace default icons with the Vigil diamond+V teal mark across installable surfaces.
**Verified:** 2026-04-15T22:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | PWA manifest includes full icon set (192, 256, 384, 512, maskable) using Vigil brand mark | VERIFIED | `vigil-pwa/vite.config.ts` contains 5 icon entries: `pwa-192x192.png` (any), `pwa-256x256.png` (any), `pwa-384x384.png` (any), `pwa-512x512.png` (any), `pwa-512x512-maskable.png` (maskable) with correct `sizes:` values |
| SC-2 | PWA favicon updated | VERIFIED | `vigil-pwa/public/favicon.svg` (15263 bytes, replaced stopgap) and `vigil-pwa/public/favicon.ico` (4414 bytes, new) both present; sourced from `brand/pwa/` per 87-02 SUMMARY |
| SC-3 | PWA installed on iOS/macOS home screen / Dock shows the Vigil mark | VERIFIED (human-approved) | 87-02 Task 3 checkpoint: user typed "approved" after desktop Chrome install + iOS Safari Add-to-Home-Screen tests. Human-verify pre-approved in this session. |
| SC-4 | DailyBriefMonitor .app bundle has Vigil-branded AppIcon.icns (Finder, Applications, Mission Control) | VERIFIED | `~/.local/bin/DailyBriefMonitor.app/Contents/Resources/AppIcon.icns` exists (97990 bytes); `CFBundleIconFile=AppIcon` confirmed via PlistBuddy; install.sh has copy step + plist key. Finder icon human-approved in 87-03 Task 3. |
| SC-5 | Menubar runtime remains Dock-less (no regression of Phase 83) | VERIFIED | `Scripts/install.sh` plist template still declares `<key>LSUIElement</key>` followed by `<true/>`; installed plist PlistBuddy prints `true`. Dock-less regression human-approved in 87-03 Task 3. |
| SC-6 | Icon assets committed under brand-asset convention, sourced from brand guidelines PDF | VERIFIED | `brand/` tree matches D-08: `source/` has `vigil-brand-guidelines.pdf` + `vigil-mark.png` (master) + `vigil-mark.svg` (legacy) + variants; `pwa/` has all 8 icon files; `mac/` has 10-image `AppIcon.iconset/` + compiled `AppIcon.icns` (Mac OS X icon ic12 type) |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-pwa/vite.config.ts` | 5 icon entries + includeAssets | VERIFIED | All 5 srcs + sizes + purposes present |
| `vigil-pwa/public/favicon.svg` | Brand mark SVG | VERIFIED | 15263 bytes (not stopgap) |
| `vigil-pwa/public/favicon.ico` | Legacy browser favicon | VERIFIED | 4414 bytes, new |
| `vigil-pwa/public/pwa-256x256.png` | New 256 variant | VERIFIED | Exists in public/ |
| `vigil-pwa/public/pwa-384x384.png` | New 384 variant | VERIFIED | Exists in public/ |
| `vigil-pwa/public/pwa-512x512-maskable.png` | Maskable 512 | VERIFIED | Exists in public/ |
| `Scripts/install.sh` | CFBundleIconFile + AppIcon.icns copy + LSUIElement preserved | VERIFIED | All three grep patterns match |
| `brand/mac/AppIcon.icns` | Pre-built .icns | VERIFIED | 97990 bytes, Mac OS X icon ic12 |
| `brand/mac/AppIcon.iconset/` | 10 PNGs | VERIFIED | 10 icon_*.png files present |
| `brand/source/vigil-brand-guidelines.pdf` | PDF committed | VERIFIED | Present in brand/source/ |
| `~/.local/bin/DailyBriefMonitor.app/Contents/Resources/AppIcon.icns` | Installed icon | VERIFIED | 97990 bytes, matches brand master |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `vite.config.ts icons[]` | `vigil-pwa/public/pwa-*.png` | VitePWA plugin | WIRED | All 5 srcs reference existing public/ files |
| `brand/mac/AppIcon.icns` | bundle `Resources/AppIcon.icns` | `cp` in install.sh | WIRED | install.sh has explicit cp step + existence hard-fail; installed artifact confirmed on disk |
| plist `CFBundleIconFile=AppIcon` | Finder/Dock display | Launch Services | WIRED | PlistBuddy confirms `AppIcon` on installed plist; human-verified in Finder |
| install.sh plist `LSUIElement=true` | Dock-less runtime | macOS LaunchServices | WIRED | grep + PlistBuddy both confirm `<true/>`; human-verified no Dock tile |

### Requirements Coverage

No requirements IDs declared in any plan (`requirements: []` in all 3 plans). Phase is delivery-driven via ROADMAP Success Criteria — all 6 SCs satisfied above.

### Anti-Patterns Found

None. Spot-checks of `Scripts/install.sh` and `vigil-pwa/vite.config.ts` show no TODO/FIXME/placeholder patterns in the phase's edits. The icon copy step is guarded with an explicit hard-fail if the master .icns is missing (not a silent stub).

### Human Verification Required

None. SC-3 (PWA install) and SC-4/SC-5 (Finder icon + Dock-less regression) were human-approved in the executing sessions (per 87-02 and 87-03 SUMMARY "approved" signals) and re-confirmed as approved in this verification session's preamble.

### Gaps Summary

No gaps. All six roadmap Success Criteria are satisfied with grep-level evidence and session-level human approval. The `brand/` tree is structured per D-08, the PWA manifest is wired to the full 5-entry icon set, the Mac bundle carries the AppIcon.icns with CFBundleIconFile set, and the Phase 83 LSUIElement Dock-less regression guard is intact.

---

*Verified: 2026-04-15T22:00:00Z*
*Verifier: Claude (gsd-verifier)*
