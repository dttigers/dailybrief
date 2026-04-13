# Phase 78: Mac CLI Thin Client - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 78-mac-cli-thin-client
**Areas discussed:** Scope of code removal, Failure behavior, CLI output & logging

---

## Scope of Code Removal

| Option | Description | Selected |
|--------|-------------|----------|
| PDF layer only (Recommended) | Delete Sources/DailyBrief/PDF/ (5 files). Keep local data fetching. Smallest change, lowest risk. | |
| PDF + data fetching | Delete PDF layer AND remove local data-fetching calls. Generate becomes: call API → save PDF → print. Bigger change. | |
| Full thin client rewrite | Gut the generate command entirely. One API call, save, print. Remove all services only used by generate. Maximum cleanup but highest risk. | ✓ |

**User's choice:** Full thin client rewrite
**Notes:** User chose the most aggressive cleanup option — the generate command becomes a pure thin client.

### Follow-up: Shared Code

| Option | Description | Selected |
|--------|-------------|----------|
| Remove generate-only code (Recommended) | Delete services/code that only exist to serve the generate flow. Keep anything also used by other CLI commands. | ✓ |
| Aggressive — remove everything | Remove all data-fetching from CLI. May break other commands. | |

**User's choice:** Remove generate-only code
**Notes:** Preserve shared services (VigilAPIClient, etc.) used by other commands.

---

## Failure Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Fail fast with clear error (Recommended) | Log error, exit non-zero. Monitor already watches CLI exit status. Simple, honest. | ✓ |
| Retry with backoff | Retry 2-3 times with increasing delay before giving up. Handles transient blips. | |
| Retry + notify | Retry then trigger macOS notification on failure. More moving parts. | |

**User's choice:** Fail fast with clear error
**Notes:** No retry, no fallback. Let the Monitor surface failures.

---

## CLI Output & Logging

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal (Recommended) | 3-4 lines: requesting, received, printed, done. Clean, scannable. | ✓ |
| Match current verbosity | Fake existing log style — parse server metadata to show per-source status. Cosmetic. | |
| You decide | Claude picks appropriate logging level. | |

**User's choice:** Minimal
**Notes:** Honest logging that reflects what the thin client actually does.

---

## Claude's Discretion

- Detection of generate-only vs shared services
- PDF config type cleanup
- HTTP response handling details
- `--dry-run` flag behavior adaptation
- Brief snapshot metadata handling

## Deferred Ideas

None — discussion stayed within phase scope
