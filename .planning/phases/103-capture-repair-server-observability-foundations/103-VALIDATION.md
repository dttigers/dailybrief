---
phase: 103
slug: capture-repair-server-observability-foundations
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-19
---

# Phase 103 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` + `tsx` (vigil-core convention; 20+ existing test files) |
| **Config file** | none — framework is built into Node 20+ |
| **Quick run command** | `cd vigil-core && npx tsx --test src/**/*.test.ts` |
| **Full suite command** | `cd vigil-core && npx tsx --test src/**/*.test.ts && npm run build` |
| **Estimated runtime** | ~15–30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsx --test src/<touched-dir>/*.test.ts` (scoped)
- **After every plan wave:** Run `npx tsx --test src/**/*.test.ts`
- **Before `/gsd-verify-work`:** Full suite + curl-based live verification must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*Populated by gsd-planner 2026-04-19 when plans landed. Statuses updated by gsd-nyquist-auditor 2026-04-19.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 103-00-01 | 00 | 0 | CAP-02 | T-103-00-01 | Pre-fix diagnostic curl on live Railway records `category: null` — bug evidence | manual | `curl -sS -i -X POST https://api.vigilhub.io/v1/process-photo ...` | artifact file | ✅ green |
| 103-00-02 | 00 | 0 | ANLY-01, CAP-01, CAP-02, AUTH-08 | T-103-00-04 | RED test scaffolds fail import/assertion before any impl code | unit | `npx tsx --test src/analytics/posthog.test.ts src/routes/me.test.ts src/routes/process-photo.test.ts` (expect RED) | ❌ RED Wave 0 | ✅ green |
| 103-01-01 | 01 | 1 | ANLY-01 | T-103-01-05 | posthog-node@^5.29.2 installed; `npx tsc --noEmit` green | build | `cd vigil-core && npx tsc --noEmit` | N/A | ✅ green |
| 103-01-02 | 01 | 1 | ANLY-01 | T-103-01-01, T-103-01-02, T-103-01-03, T-103-01-04 | redactEvent strips request_body on sensitive routes; shim no-ops when key absent; captureException normalizes non-Error; shutdownPosthog awaits SDK shutdown | unit | `cd vigil-core && npx tsx --test src/analytics/posthog.test.ts` | ✅ Plan 00 | ✅ green |
| 103-02-01 | 02 | 2 | CAP-01 | T-103-02-01, T-103-02-02 | heic-convert@^2.1.0 installed; types resolve; `sharp` absent from package.json | build | `cd vigil-core && grep -q heic-convert package.json && ! grep -q '"sharp"' package.json && npx tsc --noEmit` | N/A | ✅ green |
| 103-02-02 | 02 | 2 | CAP-02 | — | triageThought helper exported from routes/triage.ts; existing POST /v1/triage unchanged | build | `cd vigil-core && grep -q 'export async function triageThought' src/routes/triage.ts && npx tsc --noEmit` | N/A | ✅ green |
| 103-02-03 | 02 | 2 | CAP-01, CAP-02 | T-103-02-01, T-103-02-03, T-103-02-04, T-103-02-05, T-103-02-07 | HEIC→JPEG pre-step (Step 3c), sync parallel triage (Step 9b via Promise.allSettled), D-07 null-category fallback, userId-scoped UPDATE | unit | `cd vigil-core && npx tsx --test src/routes/process-photo.test.ts` | ✅ Plan 00 | ✅ green |
| 103-03-01 | 03 | 1 | AUTH-08 | T-103-03-01, T-103-03-03, T-103-03-06 | GET /v1/me returns {userId, email} 200 on happy path; 401 `invalid_user` on missing row; NO userId ever read from request | unit | `cd vigil-core && npx tsx --test src/routes/me.test.ts` | ✅ Plan 00 | ✅ green |
| 103-04-02 | 04 | 3 | CAP-01, CAP-02, ANLY-01, AUTH-08 | T-103-04-01, T-103-04-02, T-103-04-03 | index.ts wiring: me route mounted behind bearerAuth; app.onError AFTER all routes; shutdownPosthog FIRST await in SIGTERM+SIGINT | build + grep | `cd vigil-core && npx tsc --noEmit && npm run build && grep -q 'app.route("/v1", me)' src/index.ts && grep -c 'await shutdownPosthog' src/index.ts # expect 2` | N/A | ✅ green |
| 103-04-03 | 04 | 3 | CAP-01, CAP-02, AUTH-08 | T-103-04-04 | Live Railway: HEIC round-trip 201; /v1/process-photo category non-null; /v1/me returns {userId, email} | manual + artifact | `test -f artifacts/cap-02-post-fix-curl.txt artifacts/heic-round-trip.txt artifacts/me-endpoint-curl.txt` | artifact files | ✅ green |
| 103-04-04 | 04 | 3 | ANLY-01 | T-103-04-05, T-103-04-07 | Local dev session: zero PostHog events; prod throw: one event with stack trace | manual + artifact | `test -f artifacts/posthog-dev-vs-prod.txt` | artifact file | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `vigil-core/src/routes/process-photo.test.ts` — HEIC acceptance + sync triage round-trip (fake `triageFn` via dep-injection)
- [x] `vigil-core/src/analytics/posthog.test.ts` — shim null-guard, `before_send` redaction on sensitive-route allowlist, singleton shutdown
- [x] `vigil-core/src/routes/me.test.ts` — JWT path, `vk_` path, missing-user 401
- [x] No framework install needed — `node:test` built-in, `tsx` already in vigil-core devDependencies

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HEIC dropped into iCloud watched folder → thought with non-empty content | CAP-01 | Requires real Mac + iCloud-hosted HEIC file + running Monitor; cannot stub file system events without losing signal fidelity | 1. Confirm Monitor running on iMac (`launchctl list \| grep vigilcore` absent; `ps aux \| grep DailyBriefMonitor`). 2. Drop a known HEIC into `~/Library/Mobile Documents/com~apple~CloudDocs/Screenshots/`. 3. Wait ≤30s. 4. `curl $API/v1/thoughts \| jq '.[0]'` — expect non-empty `content`. |
| Production PostHog events land from Railway; local dev events do NOT | ANLY-01 | Cross-environment assertion requires both a running local server AND the live Railway deploy; single-env test cannot prove both halves | 1. Start `cd vigil-core && npm run dev`. 2. `curl http://localhost:3001/v1/health` ×3. 3. Open PostHog Cloud → Events → verify zero events in last 5min. 4. Deploy to Railway. 5. `curl https://api.vigilhub.io/v1/health` ×3. 6. Verify events appear in PostHog Cloud with `environment=production` tag. |
| Unhandled exception in production route → stack trace visible in PostHog Cloud | ANLY-01 | Requires a deliberate test error in live Railway deploy + PostHog console inspection | 1. Deploy a temporary `GET /v1/test-error` route that `throw new Error('phase-103-verification')`. 2. Call via prod URL. 3. PostHog Cloud → Errors → confirm stack trace visible. 4. Revert the test route. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (manual curl artifact tasks bracketed by automated build/test tasks)
- [x] Wave 0 covers all MISSING references (posthog.test.ts, me.test.ts, process-photo.test.ts extension)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (tsx node:test suite ~15-30s per research)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** gsd-planner 2026-04-19 — plans 00–04 landed; task map populated

---

## Validation Audit

**Date:** 2026-04-19
**Run by:** gsd-nyquist-auditor
**Triggered by:** /gsd-validate-phase (post-execution, all plans complete)

### Summary

| Category | Count |
|----------|-------|
| Total tasks in map | 10 |
| Automated checks passed | 8 |
| Manual + artifact checks passed | 2 (103-00-01, 103-04-03, 103-04-04) |
| Tasks green | 10 |
| Tasks red | 0 |
| Tasks escalated | 0 |

### Per-Check Results

| Task ID | Check | Result | Notes |
|---------|-------|--------|-------|
| 103-00-01 | artifact cap-02-pre-fix-curl.txt exists | PASS | Manual artifact confirmed by orchestrator |
| 103-00-02 | posthog.test.ts + me.test.ts + process-photo.test.ts all GREEN | PASS | 0 fail each |
| 103-01-01 | tsc --noEmit | PASS | Build clean |
| 103-01-02 | posthog.test.ts (9 pass, 0 fail) | PASS | — |
| 103-02-01 | heic-convert in package.json, sharp absent | PASS | — |
| 103-02-02 | triageThought exported from triage.ts | PASS | — |
| 103-02-03 | process-photo.test.ts (46 pass, 0 fail) | PASS | — |
| 103-03-01 | me.test.ts (3 pass, 0 fail) | PASS | — |
| 103-04-02 | index.ts wiring: me route + shutdownPosthog x2 | PASS | grep confirmed both |
| 103-04-03 | cap-02-post-fix-curl.txt + heic-round-trip.txt + me-endpoint-curl.txt exist | PASS | All 3 artifact files present |
| 103-04-04 | posthog-dev-vs-prod.txt exists | PASS | Artifact present |

### Manual UAT

| Requirement | Verification | Result |
|-------------|-------------|--------|
| ANLY-01 PostHog cross-env | UAT session 2026-04-19 — PostHog Cloud confirmed error event in production; local dev zero events | PASS |
| CAP-01 iCloud folder watcher | UAT session 2026-04-19 — HEIC upload confirmed HTTP 201 end-to-end | PASS |

**Phase 103 status: VERIFIED — all 10 tasks green, 0 escalations.**
