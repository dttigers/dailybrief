---
created: 2026-05-19T16:58:00.000Z
title: Build `vigil-bridge-probe` CLI for operator API-key validation (closes IN-04 observability gap)
area: tooling
files:
  - vigil-linux-hooks/vigil-agent-bridge.sh (the fire-and-forget consumer)
  - vigil-linux-hooks/README.md (documents the probe workflow)
  - .planning/phases/134-linux-claude-code-vigil-core-agent-events-bridge-new-2026-05/134-REVIEW.md (IN-04 source)
  - .planning/phases/134-linux-claude-code-vigil-core-agent-events-bridge-new-2026-05/134-05-UAT-RESULTS.md (OBS-05)
---

## Problem

Phase 134 review surfaced **IN-04: `--fail` silently swallows HTTP 401** as an observability gap. During the operator's first hardware UAT, this gap manifested in real-world use:

1. Operator copied a 6-char placeholder (`vk_.??`) into `~/.config/vigil/env` instead of a real `vk_` + 64-hex token
2. Hook fired, hit auth gate (passed because env var was non-empty), POSTed to production
3. Vigil-core returned `HTTP 401 {"error":"Unrecognized token format"}` (placeholder had a `.` which disqualified the `vk_` path AND failed JWT shape, falling through)
4. Hook's fire-and-forget design (`--fail --silent --output /dev/null`) swallowed the 401 entirely
5. Operator observed only "HUD never updates" — zero signal about WHY

It took a diagnostic ladder (debug-log inspection → manual curl `-v` probe with explicit body capture) to surface the 401. Without external Claude help, the operator might have spent significant time on the wrong hypothesis (network? plugin? settings.json corruption?). The hook's correct fire-and-forget behavior is incompatible with surfacing 4xx errors directly.

**The right fix is a separate CLI** that lets the operator validate everything before going through the hook path:

## Solution

**Build `vigil-bridge-probe`** — a small CLI shipped alongside `vigil-agent-bridge.sh` and `install.sh`. Likely a single shell script (consistent with existing `vigil-linux-hooks/` install pattern).

**Required validations:**
1. `$VIGIL_API_KEY` is set and shape-valid (`vk_` prefix, exactly 64 hex chars after, no dots, no whitespace)
2. `api.vigilhub.io` resolves (DNS works, no `/etc/hosts` blackhole, no firewall blocking egress)
3. Production endpoint returns HTTP 201 for a synthetic test event (verifies key is valid + active in `api_keys` table)
4. The synthesized event surfaces on `/v1/agent-stream` (proves SSE fan-out is healthy end-to-end)

**Output shape:**
```
$ vigil-bridge-probe
[1/4] VIGIL_API_KEY shape ............................ ok (vk_a1b2c3...)
[2/4] DNS api.vigilhub.io ............................ ok (66.33.22.240)
[3/4] POST /v1/agent-events .......................... ok (HTTP 201, event id=567)
[4/4] SSE round-trip ................................. ok (frame received in 821ms)

All checks passed. The bridge is ready to fire on the next claude session.
```

**On failure** — print the specific failure inline with a one-line remediation hint (no chasing through logs):
```
[3/4] POST /v1/agent-events .......................... FAIL HTTP 401
       Body: {"error":"Unrecognized token format"}
       Fix: VIGIL_API_KEY value is not a valid vk_ token. Generate a new one
            via `npx tsx scripts/generate-key.ts` in vigil-core/ or check
            the value in ~/.config/vigil/env for stray dots/whitespace.
```

**Acceptance:**
- Probe runs in <5s
- Each of the 4 checks has a clear pass/fail + remediation
- No secrets printed (mask key after first 6 chars)
- README updated to recommend running the probe as the first step after `install.sh`

**Out of scope (defer to v2):**
- Validate `~/.claude/settings.json` is well-formed and has the expected 3 vigil entries (install.js already idempotent-checks this)
- Validate the `VIGIL_AGENT_BRIDGE_DEBUG=1` log path is writable
- Stress-test fail-safe behavior (that's what Plan 134-05 Task 3 covered for production)

**Size estimate:** Probably a 60-100 LOC shell script + a small `__tests__/probe.test.ts` that runs probe against a mock vigil-core via env var override. Single-plan phase or fold into the next infrastructure-cleanup phase.

**Related:** This closes IN-04 from Phase 134's code review and OBS-05 from UAT-RESULTS. Same pattern is reusable for the Mac vigil-watch onboarding if it has similar observability gaps.
