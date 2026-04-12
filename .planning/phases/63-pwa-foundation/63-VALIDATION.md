---
phase: 63-pwa-foundation
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 63: PWA Foundation — Validation Strategy

## Test Framework

| Property | Value |
|----------|-------|
| Framework | None (new directory — vigil-pwa/) |
| Config file | None — Wave 0 gap |
| Quick run command | `npm test` (to be configured) |
| Full suite command | `npm test` |

## Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PWA-01 | API key stored and auth succeeds | unit | `npm test -- --testPathPattern=auth` | Wave 0 |
| PWA-02 | Responsive layout renders | smoke (visual) | Manual — DevTools responsive mode | manual-only |
| PWA-03 | Manifest valid + icons present | smoke | Chrome DevTools Application tab + Lighthouse PWA audit | manual-only |
| PWA-04 | Offline banner appears when offline | smoke | Chrome DevTools Network → Offline toggle | manual-only |

## Sampling Rate

- **Per task commit:** No automated test suite exists yet for vigil-pwa/
- **Per wave merge:** Manual smoke test in Chrome with DevTools open
- **Phase gate:** Manual Lighthouse PWA audit score + Chrome "Add to Home Screen" prompt

## Wave 0 Gaps

1. No test runner configured — consider adding Vitest during scaffold
2. PWA-01 auth logic is unit-testable but no test file planned
