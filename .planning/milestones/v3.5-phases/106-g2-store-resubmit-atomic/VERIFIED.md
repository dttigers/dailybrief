# Phase 106 — G2 Store Resubmit Verification Checklist

> Fill this file during a single simulator verification session on the Even Realities
> iPhone app (v0.6.2+). The atomic gate (`npm run package:ehpk`) refuses to produce
> `vigil.ehpk` unless the `Verified:` line below is a real ISO 8601 timestamp within
> the last 24 hours AND all three checkboxes are ticked.

Verified: 2026-05-06T00:23:30Z

## Gate Checkboxes

- [x] **G2-01** — `vigil-g2-plugin/store-assets/01-work-orders.png` and `02-affirmation.png` exist at native 576×288, captured from `evenhub-simulator@0.6.2` with `VITE_SCREENSHOT_MODE=1` build (verified via `sips -g pixelWidth -g pixelHeight`)
- [x] **G2-02** — Double-tap on home fires host exit-confirmation dialog (verified on physical G2 hardware paired with Even Realities iPhone app v2.2.0 via QR sideload + Web Inspector console events `eventType: 3`); double-tap on work-orders / affirmation / task-detail still returns to home (no regression)
- [x] **G2-03** — All 4 screens render unified `VIGIL` header, 1px greyscale body border, footer nav hint; fallback copy under API failure verified via source review (`api.ts:48` `FALLBACK_AFFIRMATION` Vigil-voice, `screens/work-orders.ts:69` empty-state Vigil-voice, errors logged to `console.error` only)

## Simulator Session Details

- Simulator: `@evenrealities/evenhub-simulator@0.6.2` (released since RESEARCH Q2 audit; Phase 106's HARDWARE-BLOCKED.md noted this CLI did not exist on 2026-04-20 — it does now and unblocked screenshot capture)
- Simulator host: macOS 15.7.5, x86_64 (Jamesons-iMac.local, Intel)
- Screenshot mechanism: simulator's built-in 📸 button (camera icon, bottom-right of "Glasses Display" window). Captures save as `glasses_<YYYYMMDDHHMMSS>.png` in CWD at native 576×288 — no cropping or downscaling required (Plan 106-05's T-106-05-04 retina mitigation N/A on this capture path).
- Iphone-side validation: also confirmed plugin renders correctly on physical G2 glasses paired to iPhone (firmware 2.2.0.28, Even app v2.2.0) via `evenhub qr -i 192.168.1.212 -p 5173 --http --path /index.html` sideload — work-orders + home screens visually confirmed via hand-drawn observation sketches.

## Observed Behavior Notes

- **G2-02 host dialog appearance:** Confirmed via Web Inspector console while on physical G2 hardware. Each double-tap on a non-home screen fired `eventType: 3` (DOUBLE_CLICK_EVENT) and routed to home via `navigateTo(Screen.HOME)`; `rebuildPageContainer` returned `true`. Double-tap on home fires `bridge.shutDownPageContainer(1)` per `navigation.ts:127` — host dialog observed (per user report); not screenshotted since the host renders it outside our container space.
- **Container shape constraint discovered:** SDK rejects `containerName` strings >16 characters with `StartUpPageCreateResult.invalid` (=1) on create and `false` on rebuild. Phase 45's simulator validation was lenient; physical hardware enforces strictly. Fixed in Plan 106-05 by shortening `work-orders-*` → `wo-*`, `affirmation-*` → `af-*`, `task-detail-*` → `td-*`. After fix, all 3 carousel screens rebuild successfully on hardware.
- **List-container SCROLL event swallowing:** When user is on `WORK_ORDERS` (ListContainerProperty body), `SCROLL_TOP` / `SCROLL_BOTTOM` events do not bubble to `handleNavEvent` despite `isEventCapture: 1`. User can only escape work-orders via `DOUBLE_CLICK` (which routes to home). This is a Phase 45 hardware divergence (simulator behavior was different) — captured in `HARDWARE-DIVERGENCE.md` as a follow-up, NOT a 106-05 ship blocker per runbook Section 3 escape clause.
- **Unicode glyph fallout:** Original `▲` (U+25B2) and `⌾` (U+233E) glyphs absent from simulator font (`lvgl: glyph dsc. not found for U+233E`). Replaced with ASCII (`*` and `()` respectively) in all screen footer/body content. Hardware glasses LED font likely has same constraint — ASCII is the safe choice.

## Security Reminder (T8-leak-2)

**Do NOT commit `~/.config/evenhub/` or any vendor auth state.** `evenhub login` creates
user-local credentials; they belong on your machine, never in this repo. Check
`git status` before every commit during Plan 05.

## Figma Design Spec Review (RESEARCH Q1)

- [ ] Opened https://www.figma.com/design/X82y5uJvqMH95jgOfmV34j/Even-Realities---Software-Design-Guidelines--Public-?node-id=2922-80782 — _deferred to follow-up; not gating ship per RESEARCH Q1 disposition_
- [ ] Confirmed our border-weight (1px, color 15) and `VIGIL + screen-label` header pattern do not contradict the public spec
- [ ] Noted any token-value divergences:

## Resubmission Readiness

- [ ] `npm run package:ehpk` exits 0
- [ ] `vigil-g2-plugin/vigil.ehpk` exists and is > 10KB
- [ ] No untracked `~/.config/evenhub/` artifacts in `git status`
- [ ] Ready for manual upload to Even Hub (phase does NOT auto-upload per D-14)
