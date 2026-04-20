---
status: blocked
phase: 106-g2-store-resubmit-atomic
plan: 106-05
blocked_on: G2 hardware pairing required before Even app simulator canvas activates
discovered: 2026-04-20
---

# Phase 106 partial completion — 106-05 deferred on hardware

## What shipped (4/5 plans, commits on main)

| Plan | Requirement | Status |
|------|-------------|--------|
| 106-01 | Atomic-gate scaffold (check-verified.mjs, VERIFIED.md, package:ehpk, app.json v0.2.0, pack output filename fix) | done |
| 106-02 | G2-02 home-branch exit-confirm via shutDownPageContainer(1) | done |
| 106-03 | G2-03 unified buildVigilHeader + greyscale body borders + Vigil-voice fallbacks across 4 screens | done |
| 106-04 | G2-01 code side: VITE_SCREENSHOT_MODE guard + DEMO_* constants in api.ts | done |
| 106-05 | G2-01 artifact side: simulator screenshots + VERIFIED.md timestamp + vigil.ehpk pack | **blocked on hardware** |

## Why 106-05 is blocked

106-05 requires running the Even app's plugin canvas at 576×288 to capture deterministic screenshots under `VITE_SCREENSHOT_MODE=1`, then filling VERIFIED.md with a real human-observed timestamp before `check-verified.mjs` will let `npm run package:ehpk` produce `vigil.ehpk`.

Escape hatches investigated and ruled out:

- **`evenhub` CLI simulator** — does not exist. v0.1.11 commands: `login / init / pack / qr`. No headless render path.
- **Plain browser via Vite dev** — `src/main.ts` blocks on `waitForEvenAppBridge()`, which only resolves inside the Even iPhone app's WebView host.
- **Xcode iOS Simulator** — the Even app's plugin canvas is gated behind a real G2 pairing handshake, not a mock device.

## Resume instructions (when G2 glasses arrive)

1. Pair the G2 glasses in the Even Realities iPhone app (v0.6.2 or later).
2. Stage the screenshot env on the machine paired with the phone:
   ```bash
   cd vigil-g2-plugin
   cp .env.screenshot.example .env.screenshot
   ```
3. Re-run the phase — it will discover 106-05 as the only incomplete plan and resume:
   ```bash
   /gsd-execute-phase 106
   ```
   Or go straight to the plan:
   ```bash
   /gsd-execute-plan 106-05
   ```
4. Work through 106-05-PLAN.md tasks: capture work-orders + affirmation PNGs at native 576×288, move to `vigil-g2-plugin/store-assets/`, fill `VERIFIED.md`, prove stale-gate fail-closes on backdated timestamp, then `npm run package:ehpk`.

## Intentionally not done while blocked

- **No phase verification** — phase is partial, running `gsd-verifier` now would produce a false-positive gaps report.
- **ROADMAP phase 106 checkbox stays unchecked** — 4/5 is accurate; flipping it to complete would mask the remaining hardware gate.
- **No mock-bridge browser shim** — considered but rejected: store-review acceptance of browser-rendered screenshots is unverified, and the submission risk outweighs the wait.

## Adjacent work that can proceed independently

Phases 107+ in v3.5 milestone are unblocked — 106's code-side requirements (G2-01/02/03) are all implemented and type-clean; only the ship artifact is gated.
