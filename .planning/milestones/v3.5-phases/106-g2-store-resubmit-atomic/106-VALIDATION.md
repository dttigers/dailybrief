---
phase: 106
slug: g2-store-resubmit-atomic
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-19
---

# Phase 106 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from RESEARCH §Validation Architecture (2026-04-19).

<!-- ─── -->

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no unit/integration framework in `vigil-g2-plugin`). Validation = `tsc` type-check + `VERIFIED.md` checklist + `scripts/check-verified.mjs` staleness gate + static `grep` assertions. |
| **Config file** | `vigil-g2-plugin/tsconfig.json` (existing); `vigil-g2-plugin/scripts/check-verified.mjs` (Wave 0 creates). |
| **Quick run command** | `cd vigil-g2-plugin && npx tsc` |
| **Full suite command** | `cd vigil-g2-plugin && npm run package:ehpk` |
| **Estimated runtime** | ~1s (quick tsc), ~5s (full build+pack+gate) |

<!-- ─── -->

## Sampling Rate

- **After every task commit:** Run `cd vigil-g2-plugin && npx tsc` (fails on type errors)
- **After every plan wave:** Run `cd vigil-g2-plugin && npm run build:prod`
- **Before `/gsd-verify-work`:** `npm run package:ehpk` exits 0 with fresh `VERIFIED.md` AND `store-assets/*.png` at 576×288 AND all static grep assertions below pass
- **Max feedback latency:** ~5 seconds (tsc + vite build)

<!-- ─── -->

## Per-Task Verification Map

> Task ID format: `106-<plan>-<task>` — maps 1:1 to the Nth `<task>` block in plan 106-<plan>-PLAN.md.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 106-01-01 | 01 (Scaffold) | 0 | G2-01/02/03 | T8-leak-2 | store-assets/ + check-verified.mjs + VERIFIED.md present; fail-closed on placeholder | script (negative) | `test -d vigil-g2-plugin/store-assets && test -f vigil-g2-plugin/scripts/check-verified.mjs && test -f .planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md && (node vigil-g2-plugin/scripts/check-verified.mjs; test $? -eq 1)` | ❌ W0 | ⬜ pending |
| 106-01-02 | 01 | 0 | — | — | `package:ehpk` script wired, `pack` amended to `-o vigil.ehpk`, app.json → 0.2.0 | static | `grep -q '"package:ehpk":' vigil-g2-plugin/package.json && grep -q '"pack": "evenhub pack app.json dist -o vigil.ehpk"' vigil-g2-plugin/package.json && grep -q '"version": "0.2.0"' vigil-g2-plugin/app.json` | ✅ | ⬜ pending |
| 106-02-01 | 02 (G2-02) | 1 | G2-02 | T-106-02-02 | Single `shutDownPageContainer(1)` call at home branch; fire-and-forget (void); existing branches intact | static grep | `test "$(grep -cE 'shutDownPageContainer\(1\)' vigil-g2-plugin/src/navigation.ts)" = "1" && grep -qE 'void bridge\.shutDownPageContainer\(1\)' vigil-g2-plugin/src/navigation.ts && grep -qE 'currentScreen === Screen\.HOME' vigil-g2-plugin/src/navigation.ts && cd vigil-g2-plugin && npx tsc` | ✅ | ⬜ pending |
| — (manual) | 02 | 2 | G2-02 | — | Double-tap on home fires host dialog; non-home still navigates to home | manual | Logged in VERIFIED.md Task 3 of Plan 05 (see VALIDATION.md §Manual-Only Verifications rows 1-2) | Manual | ⬜ pending |
| 106-03-01 | 03 (G2-03) | 1 | G2-03 | — | `buildVigilHeader` factory exported from screens/header.ts | static grep | `grep -q '^export function buildVigilHeader' vigil-g2-plugin/src/screens/header.ts && grep -q 'CHARS_PER_LINE' vigil-g2-plugin/src/screens/header.ts && cd vigil-g2-plugin && npx tsc` | ✅ (new file) | ⬜ pending |
| 106-03-02 | 03 | 1 | G2-03 | — | home.ts + affirmation.ts: unified header + border + exit-gesture footer + Vigil-voice fallback | static grep | `grep -q 'buildVigilHeader(ContainerId.HOME_HEADER' vigil-g2-plugin/src/screens/home.ts && grep -q 'buildVigilHeader(ContainerId.AFFIRMATION_HEADER' vigil-g2-plugin/src/screens/affirmation.ts && grep -q "Brief unavailable. Retry when you're ready." vigil-g2-plugin/src/screens/affirmation.ts && grep -q '⌾ double-tap to exit' vigil-g2-plugin/src/screens/home.ts && grep -q 'borderColor: 15' vigil-g2-plugin/src/screens/home.ts` | ✅ | ⬜ pending |
| 106-03-03 | 03 | 1 | G2-03 | — | work-orders.ts + task-detail.ts: unified header + border on list+empty body + Vigil-voice fallbacks + exit-gesture footers; 12-container budget preserved | static grep | `grep -q "No work orders open. Capture one when it finds you." vigil-g2-plugin/src/screens/work-orders.ts && grep -q "Task not found. Swipe to return." vigil-g2-plugin/src/screens/task-detail.ts && test "$(grep -c 'borderWidth: 1' vigil-g2-plugin/src/screens/work-orders.ts)" -ge "2" && test "$(grep -cE '^\s+[A-Z_]+:\s+[0-9]+,' vigil-g2-plugin/src/constants.ts)" = "12" && cd vigil-g2-plugin && npm run build:prod` | ✅ | ⬜ pending |
| 106-04-01 | 04 (G2-01 code) | 1 | G2-01 | T8-leak-1 | `VITE_SCREENSHOT_MODE` const + 3 DEMO_* constants + 3 guard branches; demo data dead-code-eliminated in prod build; .env.production untouched | static + build | `grep -q 'const SCREENSHOT_MODE = import.meta.env.VITE_SCREENSHOT_MODE' vigil-g2-plugin/src/api.ts && test "$(grep -c 'if (SCREENSHOT_MODE) return DEMO_' vigil-g2-plugin/src/api.ts)" = "3" && grep -q 'Follow up on PR-4827 review' vigil-g2-plugin/src/api.ts && ! grep -q 'VITE_SCREENSHOT_MODE' vigil-g2-plugin/.env.production && cd vigil-g2-plugin && npm run build:prod && ! grep -q 'Follow up on PR-4827 review' dist/assets/*.js` | ✅ | ⬜ pending |
| 106-04-02 | 04 | 1 | G2-01 | T8-leak-1 | `.env.screenshot.example` committed with security warning; actual `.env.screenshot` gitignored | static | `test -f vigil-g2-plugin/.env.screenshot.example && grep -q 'DO NOT set VITE_SCREENSHOT_MODE in' vigil-g2-plugin/.env.screenshot.example && (cd vigil-g2-plugin && touch .env.screenshot && git check-ignore .env.screenshot && rm -f .env.screenshot)` | ✅ | ⬜ pending |
| 106-05-01 | 05 (Verify + Pack) | 2 | G2-01/02/03 | — | Prerequisites checkpoint (simulator ≥ v0.6.2, .env.production untouched) | checkpoint (manual) | user confirmation recorded in session; see VALIDATION.md §Manual-Only Verifications | Manual | ⬜ pending |
| 106-05-02 | 05 | 2 | G2-01 | T-106-05-04 | Both PNGs captured at exact 576×288 | script | `test -f vigil-g2-plugin/store-assets/01-work-orders.png && test -f vigil-g2-plugin/store-assets/02-affirmation.png && test "$(sips -g pixelWidth vigil-g2-plugin/store-assets/01-work-orders.png \| grep pixelWidth \| awk '{print $2}')" = "576" && test "$(sips -g pixelHeight vigil-g2-plugin/store-assets/01-work-orders.png \| grep pixelHeight \| awk '{print $2}')" = "288" && test "$(sips -g pixelWidth vigil-g2-plugin/store-assets/02-affirmation.png \| grep pixelWidth \| awk '{print $2}')" = "576" && test "$(sips -g pixelHeight vigil-g2-plugin/store-assets/02-affirmation.png \| grep pixelHeight \| awk '{print $2}')" = "288"` | ❌ W2 | ⬜ pending |
| 106-05-03 | 05 | 2 | G2-02 | — | G2-02 simulator observations (home dialog + non-home regression) recorded in VERIFIED.md | manual | Logged in VERIFIED.md `## Observed Behavior Notes` section — see VALIDATION.md §Manual-Only Verifications rows 1-2 | Manual | ⬜ pending |
| 106-05-04 | 05 | 2 | G2-01/02/03 | T-106-05-01, T-106-05-02 | All G2 checkboxes ticked, real ISO timestamp, atomic pack produces vigil.ehpk, .env.production still clean | script | `cd vigil-g2-plugin && test $(grep -c '\[x\] \*\*G2-0[123]\*\*' ../.planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md) = "3" && grep -qE '^Verified:\s*20[0-9]{2}-' ../.planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md && node scripts/check-verified.mjs && npm run package:ehpk && test -f vigil.ehpk && test $(wc -c < vigil.ehpk) -gt 10000 && ! grep -q 'VITE_SCREENSHOT_MODE' .env.production && ! grep -q 'Follow up on PR-4827 review' dist/assets/*.js` | ❌ W2 | ⬜ pending |
| 106-05-05 | 05 | 2 | — | — | Stale-gate negative test: backdated VERIFIED.md → `check-verified.mjs` exits 1; restored → exits 0 | script (negative) | Performed inline during Task 5; post-condition: `grep -q 'Stale-gate negative test' .planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md && node vigil-g2-plugin/scripts/check-verified.mjs` | Manual | ⬜ pending |
| 106-05-06 | 05 | 2 | G2-01/02/03 | T-106-05-01, T-106-05-02 | Final review checkpoint: user visually approves PNGs + VERIFIED.md + git status before commit | checkpoint (manual) | User "approved" recorded; `! git status --porcelain \| grep -qE '\.env\.screenshot$\|\.config/evenhub'` | Manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

<!-- ─── -->

## Wave 0 Requirements

- [ ] `vigil-g2-plugin/store-assets/` — directory exists (screenshots land in Wave 2 from plan 04)
- [ ] `vigil-g2-plugin/scripts/check-verified.mjs` — staleness gate script
- [ ] `.planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md` — checklist template with `Verified: <ISO 8601>` placeholder
- [ ] `vigil-g2-plugin/package.json` — `package:ehpk` script wired; `pack` script amended to `-o vigil.ehpk` (per RESEARCH Pitfall 1)
- [ ] No framework install required

<!-- ─── -->

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Double-tap on home screen renders host exit-confirmation dialog on simulator v0.6.2+ | G2-02 | No programmatic way to dispatch `DOUBLE_CLICK_EVENT` to the Even host from a test harness; simulator behavior is the canonical signal (RESEARCH A3 — may be stubbed). | Launch plugin on Even iPhone app simulator → navigate to home → double-tap → expect host confirm dialog → tap confirm → expect plugin exit. Log outcome + simulator screenshot in VERIFIED.md. |
| Double-tap on work-orders / affirmation / task-detail still navigates to home (no regression) | G2-02 (D-02) | Same reason — simulator is the oracle. | For each non-home screen: double-tap → expect nav to home. Log in VERIFIED.md. |
| Screenshots visually represent production data shape with Vigil voice | G2-01 | Taste + Vigil voice review; no visual-diff harness. | Open PNGs, confirm demo data is plausible, copy matches "Calm · Confident · Empathetic · Quiet · Direct · Warm". |
| Figma public spec doesn't contradict our border-weight / header choices | G2-03 (RESEARCH Q1) | Figma requires human eyes; file not scrapable. | Open https://www.figma.com/design/X82y5uJvqMH95jgOfmV34j/Even-Realities---Software-Design-Guidelines--Public-?node-id=2922-80782 → confirm ≥1-px borders + wordmark header pattern compliant; note divergences in VERIFIED.md. |
| Simulator screenshot mechanism discovered + runbook documented | G2-01 (RESEARCH A2, Q2) | First-time discovery of Even iPhone simulator export path. | First plan captures the mechanism and writes it into VERIFIED.md's runbook section. |

<!-- ─── -->

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`store-assets/`, `check-verified.mjs`, `VERIFIED.md`, `package:ehpk`)
- [ ] No watch-mode flags (tsc runs once; package:ehpk runs once)
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter (planner flips after filling in final task IDs)

**Approval:** pending
