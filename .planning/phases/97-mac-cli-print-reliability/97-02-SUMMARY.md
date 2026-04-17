---
phase: 97-mac-cli-print-reliability
plan: 02
subsystem: cli
tags: [verification, printing, doctor, lpr, cups, pdf]

# Dependency graph
requires:
  - phase: 97-mac-cli-print-reliability
    plan: 01
    provides: "PrintService error handling, 404 fallback, scale flags, Doctor printer check"
provides:
  - "End-to-end verified print chain with actual-size output"
  - "Doctor all checks passing including printer reachability"
  - "Server-side cut lines on all PDF pages including overflow"
  - "Doctor falls back to config.json API key when env var absent"
affects: [mac-cli-print-reliability]

# Tech tracking
tech-stack:
  added: []
  patterns: ["-o media=Letter for CUPS paper size declaration"]

key-files:
  created: []
  modified:
    - Sources/DailyBrief/DailyBrief.swift
    - Sources/DailyBrief/Utilities/PrintService.swift
    - vigil-core/src/services/pdf-service.ts

key-decisions:
  - "Added -o media=Letter to suppress CUPS paper size mismatch prompt"
  - "Fixed double /v1 prefix in API paths (config base URL already includes /v1)"
  - "Doctor now falls back to config.json api_key when VIGIL_API_KEY env var absent"

patterns-established:
  - "drawCuttingGuide called on every addPage in pdf-service.ts"

requirements-completed: [FIX-03]

# Metrics
duration: 15min
completed: 2026-04-16
---

# Phase 97 Plan 02: End-to-End Verification Summary

**Full print chain verified: PDF generation, 404 fallback, actual-size printing, Doctor all-pass, legacy agent removed**

## Performance

- **Duration:** ~15 min (including Railway redeploy wait)
- **Started:** 2026-04-16T19:16:00Z
- **Completed:** 2026-04-16T19:42:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Rebuilt CLI binary in release mode, installed to ~/.local/bin
- Verified full print chain end-to-end with physical printer output
- All 7 Doctor checks PASS including printer reachability

## Deviations from Plan (bugs found during verification)

1. **[Bug] lpstat path wrong** — `/usr/sbin/lpstat` doesn't exist on macOS Sonoma, corrected to `/usr/bin/lpstat` in both PrintService and Doctor (commit 347b70d)
2. **[Bug] Double /v1 API prefix** — config `api_base_url` already includes `/v1`, but Generate.run() paths were `/v1/brief/:date` producing `/v1/v1/brief/:date`. GET always 404'd, POST fallback also failed. Fixed to `/brief/:date` and `/brief/generate` (commit ce4b870)
3. **[Bug] CUPS paper size mismatch** — custom 3.75"x7.75" PDF triggered mismatch prompt on Letter tray. Added `-o media=Letter` to lpr args (commit ce4b870)
4. **[Bug] Missing cut lines on page 3** — `drawCuttingGuide()` not called on AI Insights overflow/spillover pages. Added to all `addPage` calls in pdf-service.ts (commit e450c6a)
5. **[Bug] Doctor API key only checked env var** — Check 1 and Check 6 (settings endpoints) used VIGIL_API_KEY env var only, but key lives in config.json. Added config file fallback (commit 8d868f8)

## Task Commits

1. **Task 1: Rebuild CLI and install** — `347b70d` (fix lpstat path + harden Doctor)
2. **Task 2: Human verification** — Verified by user:
   - Physical print output at actual size confirmed
   - Cut lines on all 3 pages confirmed
   - Doctor all 7 checks PASS confirmed
   - Legacy LaunchAgent "Could not find service" confirmed
   - 404 fallback working ("Brief not cached → generated on demand") confirmed
   - Failure badge test skipped per user

## Additional Fix Commits (during verification)
- `ce4b870` — fix double /v1 prefix + add media=Letter
- `e450c6a` — fix cut lines on overflow pages (server-side)
- `8d868f8` — fix Doctor API key fallback to config.json

## Self-Check: PASSED

All verification items confirmed by user. Print chain working end-to-end.

---
*Phase: 97-mac-cli-print-reliability*
*Completed: 2026-04-16*
