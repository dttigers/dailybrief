---
phase: 31-vigil-core-ai
plan: 01
subsystem: api
tags: [anthropic-sdk, claude, ai, hono, typescript]

# Dependency graph
requires:
  - phase: 30-vigil-core-endpoints
    provides: Hono app structure, route mounting pattern, db/types.ts
provides:
  - Shared AI client module (ai/client.ts) with callClaude and callClaudeMultimodal helpers
  - AI result type definitions (ai/types.ts) for all AI features
  - POST /v1/triage endpoint for thought categorization
affects: [31-02, 31-03, 31-04, 31-05]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk"]
  patterns: [singleton AI client, JSON-only Claude responses, 503 for missing API key]

key-files:
  created:
    - vigil-core/src/ai/client.ts
    - vigil-core/src/ai/types.ts
    - vigil-core/src/routes/triage.ts
  modified:
    - vigil-core/src/index.ts
    - vigil-core/package.json

key-decisions:
  - "Singleton AI client with lazy initialization via getAIClient()"
  - "Warn at import time if ANTHROPIC_API_KEY missing, return 503 at request time"
  - "Model configurable via CLAUDE_MODEL env var, defaults to claude-sonnet-4-20250514"

patterns-established:
  - "AI endpoint pattern: validate input -> check AI client -> call Claude -> parse JSON -> return"
  - "System prompts request JSON-only responses for reliable parsing"
  - "502 status for AI response parse failures vs 503 for missing client"

# Metrics
duration: 5min
completed: 2026-04-04
---

# Phase 31-01: Vigil Core AI Client & Triage Endpoint

**Anthropic SDK integration with shared client module and POST /v1/triage endpoint matching Swift TriageService prompt**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-04
- **Completed:** 2026-04-04
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Installed @anthropic-ai/sdk and created shared AI client with callClaude and callClaudeMultimodal helpers
- Defined all AI result types (TriageResult, Insight, TherapyClassificationResult, TherapyPattern, TherapyPrep) for use by subsequent plans
- Created POST /v1/triage endpoint with identical system prompt to the Swift TriageService

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Anthropic SDK and create shared AI client** - `bae7340` (feat)
2. **Task 2: Create POST /v1/triage endpoint** - `bc6130c` (feat)

## Files Created/Modified
- `vigil-core/src/ai/client.ts` - Singleton Anthropic client, callClaude and callClaudeMultimodal helpers
- `vigil-core/src/ai/types.ts` - TriageResult, Insight, TherapyClassificationResult, TherapyPattern, TherapyPrep types
- `vigil-core/src/routes/triage.ts` - POST /triage endpoint with validation and error handling
- `vigil-core/src/index.ts` - Mount triage route
- `vigil-core/package.json` - Added @anthropic-ai/sdk dependency

## Decisions Made
- Singleton client pattern with lazy init (avoids crashes at import when API key missing)
- Model default is claude-sonnet-4-20250514, overridable via CLAUDE_MODEL env var
- Triage system prompt ported exactly from Swift TriageService

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

Environment variable needed for AI features to work:
- `ANTHROPIC_API_KEY` - Required for all AI endpoints (triage, insights, therapy, etc.)
- `CLAUDE_MODEL` - Optional, defaults to claude-sonnet-4-20250514

## Next Phase Readiness
- AI client module ready for import by all subsequent plans (insights, therapy classification, therapy prep, describe)
- Triage endpoint pattern established for other AI routes to follow

---
*Phase: 31-vigil-core-ai, Plan: 01*
*Completed: 2026-04-04*
