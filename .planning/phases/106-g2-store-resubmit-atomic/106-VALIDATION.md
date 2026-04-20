---
phase: 106
slug: g2-store-resubmit-atomic
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 106 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from RESEARCH §Validation Architecture (2026-04-19).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no unit/integration framework in `vigil-g2-plugin`). Validation = `tsc` type-check + `VERIFIED.md` checklist + `scripts/check-verified.mjs` staleness gate + static `grep` assertions. |
| **Config file** | `vigil-g2-plugin/tsconfig.json` (existing); `vigil-g2-plugin/scripts/check-verified.mjs` (Wave 0 creates). |
| **Quick run command** | `cd vigil-g2-plugin && npx tsc` |
| **Full suite command** | `cd vigil-g2-plugin && npm run package:ehpk` |
| **Estimated runtime** | ~1s (quick tsc), ~5s (full build+pack+gate) |

---

## Sampling Rate

- **After every task commit:** Run `cd vigil-g2-plugin && npx tsc` (fails on type errors)
- **After every plan wave:** Run `cd vigil-g2-plugin && npm run build:prod`
- **Before `/gsd-verify-work`:** `npm run package:ehpk` exits 0 with fresh `VERIFIED.md` AND `store-assets/*.png` at 576×288 AND all static grep assertions below pass
- **Max feedback latency:** ~5 seconds (tsc + vite build)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 106-01-01 | 01 (Wave 0 scaffolding) | 0 | — | — | Gate infra present | static | `test -d vigil-g2-plugin/store-assets && test -f vigil-g2-plugin/scripts/check-verified.mjs` | ❌ W0 | ⬜ pending |
| 106-01-02 | 01 | 0 | — | — | npm script wired | static | `grep -q '"package:ehpk"' vigil-g2-plugin/package.json` | ✅ | ⬜ pending |
| 106-01-03 | 01 | 0 | — | — | VERIFIED.md template present | static | `test -f .planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md` | ❌ W0 | ⬜ pending |
| 106-02-01 | 02 (G2-02) | 1 | G2-02 | T8-leak | `shutDownPageContainer(1)` call exists, home branch only | static grep | `grep -cE 'shutDownPageContainer\(1\)' vigil-g2-plugin/src/navigation.ts` → ≥1 | ✅ | ⬜ pending |
| 106-02-02 | 02 | 1 | G2-02 | — | Type-check passes after nav edit | static | `cd vigil-g2-plugin && npx tsc` exit 0 | ✅ | ⬜ pending |
| 106-02-03 | 02 | 1 | G2-02 | — | Double-tap on home fires host dialog (simulator) | manual | Logged in VERIFIED.md with simulator screenshot | Manual | ⬜ pending |
| 106-03-01 | 03 (G2-03) | 1 | G2-03 | — | All 4 screens reference `VIGIL` wordmark | static grep | `grep -l 'VIGIL' vigil-g2-plugin/src/screens/*.ts \| wc -l` → 4 | ✅ | ⬜ pending |
| 106-03-02 | 03 | 1 | G2-03 | — | Body containers have `borderWidth: 1` | static grep | `grep -c 'borderWidth: 1' vigil-g2-plugin/src/screens/*.ts` → ≥4 | ✅ | ⬜ pending |
| 106-03-03 | 03 | 1 | G2-03 | — | Empty-state fallback copy present per screen | static grep | `grep -E "No (open\|work orders\|tasks)\|Brief unavailable" vigil-g2-plugin/src/screens/*.ts` → ≥3 | ✅ | ⬜ pending |
| 106-03-04 | 03 | 1 | G2-03 | — | Footer nav hint container exists per screen | static grep | `grep -c 'footer' vigil-g2-plugin/src/screens/*.ts` → ≥4 | ✅ | ⬜ pending |
| 106-03-05 | 03 | 1 | G2-03 | — | No new `ContainerId` enum entries beyond 12 (budget cap) | static | `grep -cE '^\s+[A-Z_]+:\s*[0-9]+' vigil-g2-plugin/src/constants.ts` for ContainerId block → ≤12 | ✅ | ⬜ pending |
| 106-04-01 | 04 (G2-01 code) | 1 | G2-01 | T8-leak | `VITE_SCREENSHOT_MODE` guard present in api.ts | static grep | `grep -c 'VITE_SCREENSHOT_MODE' vigil-g2-plugin/src/api.ts` → ≥1 | ✅ | ⬜ pending |
| 106-04-02 | 04 | 1 | G2-01 | T8-leak | `.env.production` does NOT contain `VITE_SCREENSHOT_MODE` | static | `! grep -q 'VITE_SCREENSHOT_MODE' vigil-g2-plugin/.env.production 2>/dev/null` | ✅ | ⬜ pending |
| 106-04-03 | 04 | 2 | G2-01 | — | Screenshots exist at 576×288 | script | `sips -g pixelWidth -g pixelHeight vigil-g2-plugin/store-assets/*.png` → all 576×288 | ❌ W0 dir | ⬜ pending |
| 106-04-04 | 04 | 2 | G2-01 | — | Simulator version ≥ v0.6.2 confirmed in VERIFIED.md | manual | Logged in VERIFIED.md | Manual | ⬜ pending |
| 106-05-01 | 05 (Atomic gate) | 2 | — | — | Fresh VERIFIED.md gates pack | script | `node vigil-g2-plugin/scripts/check-verified.mjs` → exit 0 | ❌ W0 | ⬜ pending |
| 106-05-02 | 05 | 2 | — | — | `.ehpk` produced with `-o vigil.ehpk` | script | `cd vigil-g2-plugin && npm run package:ehpk && test -f vigil.ehpk` | ❌ W0 | ⬜ pending |
| 106-05-03 | 05 | 2 | — | — | Stale VERIFIED.md correctly refuses pack | script (negative) | Backdate `Verified:` line >24h → `check-verified.mjs` → exit 1 | Manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vigil-g2-plugin/store-assets/` — directory exists (screenshots land in Wave 2 from plan 04)
- [ ] `vigil-g2-plugin/scripts/check-verified.mjs` — staleness gate script
- [ ] `.planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md` — checklist template with `Verified: <ISO 8601>` placeholder
- [ ] `vigil-g2-plugin/package.json` — `package:ehpk` script wired; `pack` script amended to `-o vigil.ehpk` (per RESEARCH Pitfall 1)
- [ ] No framework install required

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Double-tap on home screen renders host exit-confirmation dialog on simulator v0.6.2+ | G2-02 | No programmatic way to dispatch `DOUBLE_CLICK_EVENT` to the Even host from a test harness; simulator behavior is the canonical signal (RESEARCH A3 — may be stubbed). | Launch plugin on Even iPhone app simulator → navigate to home → double-tap → expect host confirm dialog → tap confirm → expect plugin exit. Log outcome + simulator screenshot in VERIFIED.md. |
| Double-tap on work-orders / affirmation / task-detail still navigates to home (no regression) | G2-02 (D-02) | Same reason — simulator is the oracle. | For each non-home screen: double-tap → expect nav to home. Log in VERIFIED.md. |
| Screenshots visually represent production data shape with Vigil voice | G2-01 | Taste + Vigil voice review; no visual-diff harness. | Open PNGs, confirm demo data is plausible, copy matches "Calm · Confident · Empathetic · Quiet · Direct · Warm". |
| Figma public spec doesn't contradict our border-weight / header choices | G2-03 (RESEARCH Q1) | Figma requires human eyes; file not scrapable. | Open https://www.figma.com/design/X82y5uJvqMH95jgOfmV34j/Even-Realities---Software-Design-Guidelines--Public-?node-id=2922-80782 → confirm ≥1-px borders + wordmark header pattern compliant; note divergences in VERIFIED.md. |
| Simulator screenshot mechanism discovered + runbook documented | G2-01 (RESEARCH A2, Q2) | First-time discovery of Even iPhone simulator export path. | First plan captures the mechanism and writes it into VERIFIED.md's runbook section. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`store-assets/`, `check-verified.mjs`, `VERIFIED.md`, `package:ehpk`)
- [ ] No watch-mode flags (tsc runs once; package:ehpk runs once)
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter (planner flips after filling in final task IDs)

**Approval:** pending
