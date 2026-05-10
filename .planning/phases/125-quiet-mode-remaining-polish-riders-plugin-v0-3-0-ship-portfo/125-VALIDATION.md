---
phase: 125
slug: quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-10
---

# Phase 125 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 125-RESEARCH.md §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (vigil-core)** | `tsx --test` (Node 20 built-in test runner via tsx loader) |
| **Framework (vigil-g2-plugin)** | `tsx --test` (Node 20 built-in via tsx loader) |
| **Framework (vigil-pwa)** | TBD — verify in Wave 0 |
| **Config file** | None (no jest.config / vitest.config); pattern `src/**/*.test.ts` per package.json scripts |
| **Quick run command (vigil-core)** | `cd vigil-core && npm test` |
| **Quick run command (plugin)** | `cd vigil-g2-plugin && npm test` |
| **Full suite command** | `(cd vigil-core && npm test) && (cd vigil-pwa && npm test) && (cd vigil-g2-plugin && npm test)` |
| **Estimated runtime** | ~20s full suite (vigil-core <10s, plugin <5s, pwa TBD) |

---

## Sampling Rate

- **After every task commit:** Run `cd <repo> && npm test` for the repo touched.
- **After every plan wave:** Run full suite (all three repos).
- **Before `/gsd-verify-work`:** Full suite must be green AND hardware retest VERIFICATION.md filed.
- **Max feedback latency:** 20 seconds (full suite).

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Status |
|--------|----------|-----------|-------------------|-------------|
| AGENT-HUD-03 | `users.quiet_mode` column persists; `GET /v1/quiet-mode` returns `{enabled, since}` | unit | `cd vigil-core && tsx --test src/routes/quiet-mode.test.ts` | ❌ W0 (NEW) |
| AGENT-HUD-03 | `PUT /v1/quiet-mode` writes column + emits SSE + flushes suppression on disable | integration | `cd vigil-core && tsx --test src/routes/quiet-mode.test.ts` | ❌ W0 |
| AGENT-HUD-03 | Suppression Map keyed `(userId, sessionId, eventType)`, last-of-each-kind, sorted on flush, allowlist passes through | unit | `cd vigil-core && tsx --test src/lib/quiet-mode-suppression.test.ts` | ❌ W0 (NEW) |
| AGENT-HUD-03 | `bus.emitQuiet` / `bus.onQuiet` per-userId fan-out; cross-user isolation invariant holds | unit | `cd vigil-core && tsx --test src/lib/agent-events-bus.test.ts` | ❌ W0 (EXTEND) |
| AGENT-HUD-03 | SSE handler emits Phase 0 `quiet_mode_changed` synthetic frame BEFORE Phase 1 Last-Event-ID replay; replay loop passes through suppression filter | integration | `cd vigil-core && tsx --test src/routes/agent-stream.test.ts` | ❌ W0 (EXTEND) |
| AGENT-HUD-03 | SSE shim dispatches `quiet_mode_changed` event-type to `onQuietMode` callback | unit | `cd vigil-g2-plugin && tsx --test src/lib/sse-client.test.ts` | ❌ W0 (EXTEND) |
| AGENT-HUD-03 | `companion.ts` `setQuietMode` toggles ref; `buildContainers` filters non-allowlist banners during DND | unit | `cd vigil-g2-plugin && tsx --test src/screens/companion.test.ts` | ❌ W0 (EXTEND/NEW) |
| AGENT-HUD-03 | E2E hardware: PWA toggle → HUD suppresses → toggle off → replay arrives in chronological order | manual-only (wallclock) | operator on real G2 | Wave 4 |
| G2-POLISH-05 | work-orders.ts footer renders `() double-tap to exit` (already shipped) | unit (string-render) | `grep "double-tap to exit" vigil-g2-plugin/src/screens/work-orders.ts` | ✅ existing |
| G2-POLISH-05 | REQUIREMENTS.md wording amended from "swipe" → "documented exit gesture" | docs grep | `grep "documented exit gesture" .planning/REQUIREMENTS.md` | Wave 3 amendment |
| G2-POLISH-05 | SEED-005 follow-up note added to seed file (SDK-bubble-flag absence confirmed) | docs grep | `grep "spike confirmed: no bubble flag" .planning/seeds/SEED-005-*.md` | Wave 3 amendment |
| G2-POLISH-08 | `createDedupedDeviceStatusListener` helper dedupes consecutive same-`connectType` calls | unit | `cd vigil-g2-plugin && tsx --test src/lib/deduped-device-status.test.ts` | ❌ W0 (NEW) |
| G2-PLUGIN-01 | `app.json` version field === `"0.3.0"` | unit (file content) | `grep '"version": "0.3.0"' vigil-g2-plugin/app.json` | Wave 3 modify |
| G2-PLUGIN-01 | `app.json` `min_sdk_version` bump if Phase 124 used `onLaunchSource` (added in 0.0.8) | unit (file content) | `grep '"min_sdk_version": "0.0.8"' vigil-g2-plugin/app.json` | Wave 3 modify (verify Phase 124 API surface first) |
| G2-PLUGIN-01 | VERIFIED.md timestamp refreshed (< 24h) before pack | shell smoke | `cd vigil-g2-plugin && node scripts/check-verified.mjs` exits 0 | Wave 3 |
| G2-PLUGIN-01 | `npm run package:ehpk` produces `vigil.ehpk` artifact | shell smoke | `cd vigil-g2-plugin && npm run package:ehpk && test -f vigil.ehpk` | Wave 3 |
| G2-PLUGIN-01 | Even Hub developer portal upload acknowledged (dashboard screenshot saved) | manual-only (wallclock) | screenshot to `phase_dir/artifacts/` | Wave 4 |
| AGENT-DEMO-01 | Wording amendment single-tap → double-tap cascaded across REQUIREMENTS.md, PROJECT.md, ROADMAP.md, v3.8 spec | docs grep | `grep -rE "double-tap to acknowledge" .planning/REQUIREMENTS.md .planning/PROJECT.md .planning/ROADMAP.md .planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` returns 4+ matches | Wave 3 amendment |
| AGENT-DEMO-01 | 60-second demo clip captured on real G2 hardware, saved to portfolio path | manual-only (wallclock) | clip at iCloud Drive/Vigil/portfolio/ + path noted in phase artifacts | Wave 4 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vigil-core/src/routes/quiet-mode.test.ts` — AGENT-HUD-03 endpoint contract (NEW)
- [ ] `vigil-core/src/lib/quiet-mode-suppression.test.ts` — suppression Map shape + allowlist + flush ordering (NEW)
- [ ] `vigil-core/src/lib/agent-events-bus.test.ts` — EXTEND for `emitQuiet/onQuiet/offQuiet` + isolation invariant
- [ ] `vigil-core/src/routes/agent-stream.test.ts` — EXTEND for synthetic-frame ordering (Phase 0 → Phase 1 replay) + suppression filter on replay
- [ ] `vigil-g2-plugin/src/lib/deduped-device-status.test.ts` — G2-POLISH-08 helper (NEW)
- [ ] `vigil-g2-plugin/src/lib/sse-client.test.ts` — EXTEND for `quiet_mode_changed` event-type dispatch
- [ ] `vigil-g2-plugin/src/screens/companion.test.ts` — verify exists; if not, CREATE; covers `setQuietMode` mutator + buildContainers filter
- [ ] Refresh `vigil-g2-plugin/.planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md` Verified line — must be < 24h old before Wave 3 ship-prep, else `scripts/check-verified.mjs` blocks `npm run package:ehpk`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hardware E2E retest of Quiet mode flow | AGENT-HUD-03 | Requires G2 worn + iPhone PWA + real `agent_events` traffic | (1) Wear glasses, ensure SSE connected; (2) toggle Quiet mode ON in PWA Settings → G2 Plugin row; (3) trigger non-allowlist event (e.g. `task_complete`) via vigil-watch → confirm HUD silent; (4) trigger `needs_input` → confirm banner shows; (5) toggle Quiet mode OFF → confirm queued events replay in chronological order; (6) save photos / screen recording to `phase_dir/artifacts/agent-hud-03-hardware-2026-MM-DD/` |
| Hardware retest of Companion HUD + double-tap ack + work-orders exit + home overflow | G2-PLUGIN-01 | Requires real G2 firmware 2.2.0.28 | (1) Run through carousel: Home → Companion → Work Orders → Affirmation; (2) trigger `needs_input`, double-tap to ack; (3) on Work Orders, follow footer hint "() double-tap to exit" → home; (4) capture two screenshots of Home body and confirm byte-identical (Phase 124 D-14 invariant); (5) save evidence to artifacts/ |
| `vigil.ehpk` v0.3.0 submitted to Even Hub developer portal | G2-PLUGIN-01 | Manual upload to Even Hub web dashboard (no API) | (1) Log into Even Hub developer portal; (2) upload `vigil-g2-plugin/vigil.ehpk`; (3) confirm dashboard acknowledges submission; (4) screenshot dashboard state, save to `phase_dir/artifacts/even-hub-submission-2026-MM-DD.png`; (5) NB: Preview field — live captures only per memory `project_even_hub_preview_field`, no composites |
| 60-second portfolio demo recording | AGENT-DEMO-01 | Real-world artifact requires G2 + iPhone + VS Code on physical setup | (1) Wear G2; (2) start Claude Code session in VS Code that will require user input within ~25s; (3) walk away from keyboard with iPhone screen recording; (4) wait for `needs_input` temple tap; (5) double-tap to ack; (6) return to keyboard, answer Claude Code prompt; (7) wait for `task_complete` toast; (8) trim to ≤60s; (9) save to `~/Library/CloudStorage/iCloud Drive/Vigil/portfolio/2026-05-vigil-v3.8-demo.mp4`; (10) note path in phase artifacts manifest |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (manual-only items quarantined to Wave 4)
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
