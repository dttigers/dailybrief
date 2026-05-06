---
status: documented
phase: 106-g2-store-resubmit-atomic
plan: 106-05
discovered: 2026-05-05
captured_during: v3.5 G2 Hardware UAT (Section 3 retest)
ship_decision: not blocking 106-05 — captured per runbook Section 3 escape clause
---

# Phase 45 / Phase 106 hardware divergences observed during v3.5 UAT

This file captures behavioral differences between the Even Hub iPhone simulator (used for Phase 45 + early 106 development) and the physical G2 hardware paired with the Even Realities iPhone app v2.2.0. **None of these block 106-05 ship.** They become follow-up phase candidates for v3.8+.

## Environment

- **Hardware:** Even G2 glasses, firmware 2.2.0.28 (received 2026-05-05, 8 days ahead of DHL ETA)
- **iPhone Even app:** v2.2.0 (well above `min_app_version: 2.0.0`)
- **Pairing:** working — glasses connected via Bluetooth, plugin canvas activates
- **Sideload mechanism:** `evenhub qr -i 192.168.1.212 -p 5173 --http --path /index.html` against a local `python3 -m http.server` serving `dist/` from screenshot-mode build
- **Dev surface:** Safari Web Inspector on iMac connected to iPhone-side WebView via USB (Develop menu → Jameson's iPhone → index.html)

## Divergence 1 — `containerName` 16-char limit enforced strictly

**What broke:**
- Phase 35/45 codebase used `containerName` strings up to 18 characters (`work-orders-header`, `affirmation-footer`, `task-detail-header`)
- Simulator (during Phase 45 development) accepted these silently
- Physical hardware via SDK validator returned `StartUpPageCreateResult.invalid` (=1) on `createStartUpPageContainer` and `false` on subsequent `rebuildPageContainer` calls — silently no-op'd, no visible error

**How we found it:** Console logging the boolean return of `bridge.rebuildPageContainer(container)` revealed `false` for work-orders/affirmation/task-detail rebuilds while `true` for home (whose containerName values were already ≤16 chars).

**Fix:** Renamed all 18-char containers to ≤9-char prefixes (`wo-*`, `af-*`, `td-*`). Home untouched. After fix, all rebuilds return `true`.

**SDK reference:** `node_modules/@evenrealities/even_hub_sdk/README.md` line 873 explicitly states "containerName?: string — Container name (max 16 characters)" — this constraint is documented but the simulator doesn't enforce it.

**Status:** Fixed in 106-05 source (commit pending). No follow-up needed.

## Divergence 2 — List-container SCROLL events do not bubble for navigation

**What's happening:**
- `WORK_ORDERS` screen body uses `ListContainerProperty` with `isEventCapture: 1`
- On Even iPhone simulator (during Phase 45), `SCROLL_TOP` / `SCROLL_BOTTOM` events from temple swipes bubbled up via `event.listEvent.eventType` to `handleNavEvent` and advanced the carousel
- On physical hardware, single-swipe gestures while on `WORK_ORDERS` do **not** bubble SCROLL events to JS. The user can only escape via `DOUBLE_CLICK` (which routes to home per `navigation.ts:127`).

**Confirmed in evenhub-simulator@0.6.2 too:** Clicking the simulator's `Down` button while on work-orders also doesn't advance the carousel. Same SDK behavior on both platforms — this isn't iPhone-specific, it's a list-container-level event-consumption pattern. The 2026-04-05 simulator was older and lenient; current SDK is stricter.

**User-visible impact:** The Phase 45 fix ("swipe out of list") doesn't work on hardware via the originally documented gesture. Workaround: `DOUBLE_CLICK` → home, then `SCROLL_TOP` from home → wraps backward to AFFIRMATION.

**Why this isn't a 106-05 blocker:**
- Per runbook Section 3 escape clause: "If anything diverges: capture exact gesture + observed behavior in HARDWARE-DIVERGENCE.md (new file). Do NOT block 106-05 ship — divergence is a follow-up bug, not a Phase 45 regression."
- All required store screenshots (work-orders + affirmation) were captured successfully via the simulator's Up/Down/DoubleClick buttons (using the workaround flow).
- G2-02 (double-tap exit dialog) and G2-03 (unified header/border/fallback) are independent of this issue.

**Follow-up candidate (v3.8 or later):**
1. Read SDK source to find the actual gesture that escapes a list container (may be a long-press, a different swipe direction, or a side-button)
2. OR add a UI affordance — e.g., dedicate the first or last list item to a "← back" entry the user taps
3. OR widen `handleNavEvent` to also accept some sysEvent variant that fires from list-container swipes

## Divergence 3 — iPhone Even app shows no plugin canvas preview

**What we expected:** Per runbook Section 2b, "Open plugin canvas in iPhone app" implies the iPhone shows a preview of what the glasses display.

**What's actually true:** The iPhone Even app's "Vigil" plugin page is a launcher only — title bar with "Vigil" + back arrow + a developer-mode toggle (yellow icon). The body is **blank**. The plugin runs on the GLASSES LED display directly. The iPhone is metadata + control surface, not a preview.

**Why this matters:**
- Runbook 2b's screenshot-capture instructions ("PNG written to vigil-g2-plugin/store-assets/01-work-orders.png") assumed iPhone-side capture. That path doesn't exist on this iPhone app version.
- Real screenshot path: `evenhub-simulator` package (released since HARDWARE-BLOCKED.md was authored 2026-04-20) provides a desktop simulator window with built-in 📸 button that saves native 576×288 PNGs. **This unblocked 106-05 entirely.**

**Follow-up:** Update the v3.5 runbook (and Phase 106 RESEARCH.md Q2) to document `evenhub-simulator` as the canonical screenshot path, replacing the iPhone-canvas assumption.

## Divergence 4 — Home body content overflows the 210px container

**What we observed:** Home screen body has 7 logical lines of content (task count, blank, "TOP PRIORITY:", task content, blank, divider, affirmation). With paddingLength: 8 and the SDK's font metrics, this overflows the 210px height. The simulator auto-scrolls between renders, producing inconsistent screenshots when capturing home.

**User-visible impact:** Two consecutive 📸 captures of home produced different scrolled positions — top half of content vs bottom half visible. Not a 106-05 blocker since home isn't a required store asset, but cosmetic on hardware.

**Follow-up candidate:**
- Increase home body height to 220+ (compact footer to 28px), OR
- Trim home body content (drop blank lines, OR drop the divider, OR drop the inline affirmation since AFFIRMATION is already a dedicated screen), OR
- Use a smaller font / explicit line-height in the body container

## Divergence 5 — Unicode glyphs `▲` (U+25B2) and `⌾` (U+233E) absent from simulator font

**Symptom:** `lvgl: glyph dsc. not found for U+233E` warnings emitted on simulator startup. In rendered output, `⌾` rendered as zero-width (no visible artifact, just preserved whitespace), and `▲` similar.

**Risk on hardware:** Unknown — but if Even Hub store reviewers use the same simulator (likely), missing-glyph artifacts could fail review on a different reviewer machine font.

**Fix in 106-05:** Replaced `▲` → `*` (home body task-count prefix) and `⌾` → `()` (4 footer strings: home, work-orders, affirmation, task-detail). All ASCII now.

**Status:** Fixed. No follow-up needed.

## Divergence 6 — `Device status changed` events fire repeatedly with `connectType: "none"`

**What we observed:** Web Inspector console showed periodic `[EvenAppBridge] Device status changed: t {sn: "", connectType: "none", isWearing: false}` events even while glasses were paired and rendering correctly.

**Why this isn't blocking:** The plugin renders successfully on glasses despite these events (work-orders sketch confirmed visual rendering on physical G2 LED). Likely the `DeviceStatus` payload reflects something orthogonal to plugin rendering — perhaps a default singleton emitted before BLE telemetry catches up. The plugin's own `bridge.onEvenHubEvent` listener doesn't act on these events except for FOREGROUND lifecycle.

**Follow-up candidate:** Investigate whether `isWearing` detection failing has impact on power management or display sleep behavior. Defer to v3.8+ once we have more hardware UAT data.

## Why none of the above blocks 106-05 ship

The runbook's Section 3 escape clause for Phase 45 retest divergence is exactly the right disposition for these findings:

> "If anything diverges: capture exact gesture + observed behavior in HARDWARE-DIVERGENCE.md (new file). Do NOT block 106-05 ship — divergence is a follow-up bug, not a Phase 45 regression."

The atomic ship gate (G2-01 screenshots + G2-02 exit-confirm + G2-03 header/border/fallback) is satisfied. `vigil.ehpk` packed at 27,256 bytes ready for manual upload to Even Hub per D-14.

## Cross-references

- v3.5 G2 Hardware UAT runbook: `.planning/v3.5-G2-HARDWARE-UAT-RUNBOOK.md`
- HARDWARE-BLOCKED.md (now superseded): `.planning/phases/106-g2-store-resubmit-atomic/HARDWARE-BLOCKED.md`
- VERIFIED.md (atomic gate proof): `.planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md`
- Phase 45 fix commits (simulator-only validated): `b8d5aa2`, `942ee4e` (2026-04-05)
- 106-05 plan: `.planning/phases/106-g2-store-resubmit-atomic/106-05-PLAN.md`
