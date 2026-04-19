---
phase: 103
slug: capture-repair-server-observability-foundations
status: draft
nyquist_compliant: false
wave_0_complete: false
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

*Populated by gsd-planner when plans land. Placeholder rows below show the expected shape.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 103-00-01 | 00 | 0 | CAP-02 | — | Diagnostic curl records null `category` pre-fix | manual | `curl -sS -X POST $API/v1/process-photo ...` | N/A | ⬜ pending |
| 103-01-01 | 01 | 1 | CAP-01 | — | HEIC upload returns 2xx with non-empty content | unit | `npx tsx --test src/routes/process-photo.test.ts` | ❌ W0 | ⬜ pending |
| 103-02-01 | 02 | 1 | CAP-02 | — | /process-photo response has non-null `category` | unit | `npx tsx --test src/routes/process-photo.test.ts` | ❌ W0 | ⬜ pending |
| 103-03-01 | 03 | 1 | ANLY-01 | — | Unhandled exception in route → posthog capture invoked | unit | `npx tsx --test src/analytics/posthog.test.ts` | ❌ W0 | ⬜ pending |
| 103-03-02 | 03 | 1 | ANLY-01 | — | Shim no-ops when POSTHOG_API_KEY unset | unit | `npx tsx --test src/analytics/posthog.test.ts` | ❌ W0 | ⬜ pending |
| 103-04-01 | 04 | 1 | AUTH-08 | — | GET /v1/me returns `{userId,email}` for valid JWT | unit | `npx tsx --test src/routes/me.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vigil-core/src/routes/process-photo.test.ts` — HEIC acceptance + sync triage round-trip (fake `triageFn` via dep-injection)
- [ ] `vigil-core/src/analytics/posthog.test.ts` — shim null-guard, `before_send` redaction on sensitive-route allowlist, singleton shutdown
- [ ] `vigil-core/src/routes/me.test.ts` — JWT path, `vk_` path, missing-user 401
- [ ] No framework install needed — `node:test` built-in, `tsx` already in vigil-core devDependencies

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HEIC dropped into iCloud watched folder → thought with non-empty content | CAP-01 | Requires real Mac + iCloud-hosted HEIC file + running Monitor; cannot stub file system events without losing signal fidelity | 1. Confirm Monitor running on iMac (`launchctl list \| grep vigilcore` absent; `ps aux \| grep DailyBriefMonitor`). 2. Drop a known HEIC into `~/Library/Mobile Documents/com~apple~CloudDocs/Screenshots/`. 3. Wait ≤30s. 4. `curl $API/v1/thoughts \| jq '.[0]'` — expect non-empty `content`. |
| Production PostHog events land from Railway; local dev events do NOT | ANLY-01 | Cross-environment assertion requires both a running local server AND the live Railway deploy; single-env test cannot prove both halves | 1. Start `cd vigil-core && npm run dev`. 2. `curl http://localhost:3001/v1/health` ×3. 3. Open PostHog Cloud → Events → verify zero events in last 5min. 4. Deploy to Railway. 5. `curl https://api.vigilhub.io/v1/health` ×3. 6. Verify events appear in PostHog Cloud with `environment=production` tag. |
| Unhandled exception in production route → stack trace visible in PostHog Cloud | ANLY-01 | Requires a deliberate test error in live Railway deploy + PostHog console inspection | 1. Deploy a temporary `GET /v1/test-error` route that `throw new Error('phase-103-verification')`. 2. Call via prod URL. 3. PostHog Cloud → Errors → confirm stack trace visible. 4. Revert the test route. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (3 new test files)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
