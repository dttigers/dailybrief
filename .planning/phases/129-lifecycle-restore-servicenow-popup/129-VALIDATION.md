---
phase: 129
slug: lifecycle-restore-servicenow-popup
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-15
---

# Phase 129 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution of `lifecycle-restore-servicenow-popup`.
> Source: promoted from `129-RESEARCH.md` § Validation Architecture (lines 592-674), filled per plan frontmatter.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (vigil-core + vigil-extension); structural mocks in vigil-g2-plugin (per audio-session-guard.test.ts pattern) |
| **Config file** | `vigil-core/tsconfig.json` + `vigil-extension/package.json` `test` script; `vigil-g2-plugin/vitest` not present — use `npx tsx --test` pattern from existing tests |
| **Quick run command** | `cd <package> && npx tsx --test src/**/*.test.ts` (per package) |
| **Full suite command** | `cd vigil-core && npm test && cd ../vigil-extension && npm test && cd ../vigil-g2-plugin && npm test` |
| **Estimated runtime** | ~25–40 seconds full suite (no e2e; integration tests use DI stubs / structural mocks) |

---

## Sampling Rate

- **After every task commit:** Run the package-local quick command for the package the task modified.
- **After every plan wave:** Run the full suite across all three packages (vigil-core, vigil-extension, vigil-g2-plugin).
- **Before `/gsd:verify-work`:** Full suite must be green AND the D-07 drift test (21 existing assertions + new `setBackgroundState` ordering assertion) must remain green.
- **Max feedback latency:** ~40 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 129-01-01 | 01 | 1 | SVCNOW-04 | T-129-01 | DB enforces `(user_id, client_capture_id) WHERE client_capture_id IS NOT NULL` uniqueness | structural | `cd vigil-core && npx tsx --test src/db/__tests__/migration-0021.test.ts` | ❌ W0 | ⬜ pending |
| 129-01-02 | 01 | 1 | SVCNOW-04 | T-129-02 | Applied migration creates the partial unique index on live DB | manual / cli | `cd vigil-core && npx drizzle-kit migrate` (BLOCKING gate) | n/a | ⬜ pending |
| 129-02-01 | 02 | 2 | G2-LIFECYCLE-01, G2-LIFECYCLE-02 | T-129-07, T-129-08 | TTL boundary correctly bounds restore (29:59 → restored; 30:01 → home); id-only args; companion HUD payload hydrated | unit | `cd vigil-g2-plugin && npx tsx --test src/__tests__/screen-state-restore.test.ts` | ❌ W0 | ⬜ pending |
| 129-02-02 | 02 | 2 | G2-LIFECYCLE-01, G2-LIFECYCLE-02, G2-LIFECYCLE-03 | T-129-09 | D-07 re-fetch + 404→parent-list fallback; D-10 glassesMenu precedence preserved; module-scope ordering (setBackgroundState index < init index) | integration / drift | `cd vigil-g2-plugin && npx tsx --test src/__tests__/main.test.ts` | ✅ (extend existing 21 assertions) | ⬜ pending |
| 129-03-01 | 03 | 2 | SVCNOW-01 | T-129-09 | `extractCaseNumber("CS1234567 - Printer not working")` returns `"CS1234567"`; bare `"CS123"` returns `null`; `textContent` not `innerHTML` (XSS) | unit | `cd vigil-extension && npm test -- popup-helpers.test.js` | ❌ W0 | ⬜ pending |
| 129-03-02 | 03 | 2 | SVCNOW-02 | T-129-10 | Manifest `content_scripts[0].js[0] === "popup-helpers.js"` AND `[1] === "content-script.js"`; `chrome.action.disable()` fires on non-SN tab; `*://*.service-now.com/*` host-only | structural | `cd vigil-extension && npm test -- manifest.test.js && npm test -- background.test.js` | ❌ W0 | ⬜ pending |
| 129-03-03 | 03 | 2 | SVCNOW-03, SVCNOW-04 | T-129-11 | POST body shape `{ workOrders: [{ caseNumber, shortDescription, priority, clientCaptureId }] }`; HTTP 200 → `window.close()`; non-200 → popup stays open + inline error | unit | `cd vigil-extension && npm test -- popup.test.js` | ❌ W0 | ⬜ pending |
| 129-04-01 | 04 | 2 | SVCNOW-04 | T-129-14, T-129-18 | Two identical `clientCaptureId` POSTs return SAME `work_order_id` (synced:0 on 2nd); legacy callers without `clientCaptureId` create rows normally (backward-compat); auth+CSRF preserved | integration | `cd vigil-core && npx tsx --test src/routes/work-orders.test.ts` | ❌ W0 | ⬜ pending |
| 129-05-01 | 05 | 3 | SVCNOW-05 | T-129-13 | Chrome and Safari extension files (manifest.json, popup.html/css/js, background.js, content-script.js, popup-helpers.js) are byte-identical (or differ only in declared manifest URL fields) | drift / parity | `cd vigil-extension && npm test -- parity.test.ts` | ❌ W0 | ⬜ pending |
| 129-05-02 | 05 | 3 | SVCNOW-05 | T-129-13 | Safari Xcode `Copy Bundle Resources` includes all new files (`background.js`, `content-script.js`, `popup-helpers.js`); operator confirms via macOS build | manual | (operator on macOS — see 129-06 Scenario 5) | n/a | ⬜ pending |
| 129-06-01 | 06 | 3 | G2-LIFECYCLE-01, G2-LIFECYCLE-02, G2-LIFECYCLE-03, SVCNOW-01, SVCNOW-05 | n/a | Operator-driven UAT: force-quit iPhone restore; background→foreground migration; glassesMenu precedence; Polaris title empirical probe; Safari parity smoke; multi-tab POST race | manual | (operator runbook) | n/a | ⬜ pending |
| 129-06-02 | 06 | 3 | (cross-cutting) | n/a | Phase verification checkpoint — operator confirms all 5 ROADMAP success criteria observed | checkpoint:human-verify | (operator) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

New test files to author as part of Wave 1/2 (no separate Wave 0 needed — infra exists):

- [ ] `vigil-core/src/db/__tests__/migration-0021.test.ts` — drift test on migration SQL (column + partial unique index)
- [ ] `vigil-core/src/routes/work-orders.test.ts` — integration tests for dedup + backward-compat; mirrors `agent-events.test.ts` DI pattern via new `createWorkOrdersRoute(deps)` factory
- [ ] `vigil-g2-plugin/src/__tests__/screen-state-restore.test.ts` — unit tests for `pickRestoredScreen`, TTL boundaries (29:59/30:01), companion HUD payload hydration
- [ ] `vigil-g2-plugin/src/__tests__/main.test.ts` — extend existing 21 D-07 assertions with new `setBackgroundState` module-scope ordering assertion
- [ ] `vigil-extension/__tests__/popup-helpers.test.js` — `extractCaseNumber` regex extraction + edge cases
- [ ] `vigil-extension/__tests__/popup.test.js` — POST body shape + close-on-200 + inline error on non-200
- [ ] `vigil-extension/__tests__/manifest.test.js` — host permission scope + content_scripts load order
- [ ] `vigil-extension/__tests__/background.test.js` — `chrome.action.disable()` on non-SN tabs
- [ ] `vigil-extension/__tests__/parity.test.ts` — Chrome↔Safari byte-identical drift-detector

No new framework install required — `node:test` (via `npx tsx --test`) is already in use across vigil-core and vigil-extension.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Force-quit iPhone app → re-open → G2 plugin restores last screen | G2-LIFECYCLE-01 | Requires physical Even G2 + iPhone hardware; structural unit tests verify logic but not iOS lifecycle | 129-06 Scenario 1 |
| Phone-background → foreground → Companion HUD active-session/banner persists | G2-LIFECYCLE-02 | Requires iOS app lifecycle hook firing on real hardware | 129-06 Scenario 2 |
| Glasses-menu launches land on operator-picked screen | G2-LIFECYCLE-03 | Requires G2 glasses gesture + Even Hub menu | 129-06 Scenario 3 |
| Polaris page `document.title` matches `/\bCS\d{7}\b/` | SVCNOW-01 | Requires operator's actual ServiceNow Polaris instance — title format is per-instance configurable | 129-06 Scenario 4 |
| Safari extension popup ships and posts work-orders | SVCNOW-05 | Safari extension build requires Xcode on macOS — Linux CI cannot run | 129-06 Scenario 5 |
| Multi-tab race: open 2 SN tabs, send work-orders simultaneously → only one row in DB | SVCNOW-04 | Best validated end-to-end through live extension + live DB; route-level test covers dedup logic in isolation | 129-06 Scenario 6 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or operator/manual designation
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (manual UAT tasks are deliberate operator-gated checkpoints in 129-06)
- [x] Wave 0 covers all MISSING references (all test files listed above are scheduled within their plan's tasks)
- [x] No watch-mode flags (`--watch`, `--watchAll`) appear in any verify command
- [x] Feedback latency < 40s for the full suite
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — promoted from RESEARCH.md § Validation Architecture; awaiting first execution pass to confirm runtime estimates and Wave-0 file completion.
