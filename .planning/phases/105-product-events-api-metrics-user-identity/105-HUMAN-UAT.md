---
status: partial
phase: 105-product-events-api-metrics-user-identity
source: [105-VERIFICATION.md]
started: 2026-04-19T00:00:00Z
updated: 2026-04-19T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Capture-funnel attribution end-to-end
expected: In PostHog Events explorer, `thought_created` AND `triage_completed` both appear with the same `distinct_id` (= String(userId)); zero duplicate `thought_created` from the client. Capture a thought via PWA/Railway (POST /v1/thoughts), then wait 10–15s for SDK flush.
result: [pending]

### 2. photo_uploaded visibility
expected: After a PWA photo capture (POST /v1/process-photo), a `photo_uploaded` event appears in PostHog with `distinct_id` = userId and properties `{paper_type, vision_confidence, thought_count, force_paper_type, media_type, was_heic}`. Wait 10–15s for flush.
result: [pending]

### 3. api_request dashboard query
expected: After several authenticated calls (GET /v1/thoughts, POST /v1/chat, GET /v1/brief/:date), a PostHog query `event = api_request` grouped by `route` + `status_class` returns rows with populated `duration_ms`; at least one 2xx row per route.
result: [pending]

### 4. Person record has email + createdAt
expected: After PWA mount triggers GET /v1/me, the authenticated user's Person record in PostHog shows `email` = user's email and `createdAt` = ISO timestamp matching the DB row.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
