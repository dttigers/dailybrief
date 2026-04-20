---
status: complete
phase: 105-product-events-api-metrics-user-identity
source: [105-VERIFICATION.md]
started: 2026-04-19T00:00:00Z
updated: 2026-04-20T04:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Capture-funnel attribution end-to-end
expected: In PostHog Events explorer, `thought_created` AND `triage_completed` both appear with the same `distinct_id` (= String(userId)); zero duplicate `thought_created` from the client. Capture a thought via PWA/Railway (POST /v1/thoughts), then wait 10–15s for SDK flush.
result: issue
reported: "i see thought created, but no traige completed"
severity: major

### 2. photo_uploaded visibility
expected: After a PWA photo capture (POST /v1/process-photo), a `photo_uploaded` event appears in PostHog with `distinct_id` = userId and properties `{paper_type, vision_confidence, thought_count, force_paper_type, media_type, was_heic}`. Wait 10–15s for flush.
result: pass

### 3. api_request dashboard query
expected: After several authenticated calls (GET /v1/thoughts, POST /v1/chat, GET /v1/brief/:date), a PostHog query `event = api_request` grouped by `route` + `status_class` returns rows with populated `duration_ms`; at least one 2xx row per route.
result: pass

### 4. Person record has email + createdAt
expected: After PWA mount triggers GET /v1/me, the authenticated user's Person record in PostHog shows `email` = user's email and `createdAt` = ISO timestamp matching the DB row.
result: pass
note: "Initially reported as issue — `identifyUser` was passing flat properties that posthog-node's autowrap should have routed into `$set`, but nothing landed on the person. Fixed by wrapping properties explicitly (`properties: { $set: props }`) in `vigil-core/src/analytics/posthog.ts` (commit c40ad77). After Railway redeploy and a PWA hard-refresh, both `email` (jamesonmorrill1@gmail.com) and `createdAt` (2026-04-18T21:03:00.498Z) now appear on the person record."

## Summary

total: 4
passed: 3
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "After a thought is captured via POST /v1/thoughts, a `triage_completed` event with the same distinct_id as `thought_created` appears in PostHog within 10–15s of the triage DB update"
  status: failed
  reason: "User reported: i see thought created, but no traige completed"
  severity: major
  test: 1
  note: "User agreed to treat as a separate concern — not a code gap per the current design (triage_completed is photo-flow-only per D-15). Track if desired: 'should text-thought captures also emit triage_completed after Claude categorizes?'"
  artifacts: []
  missing: []

- truth: "After GET /v1/me succeeds, the authenticated user's PostHog Person record has person properties `email` and `createdAt` set; distinct_id should be String(userId)"
  status: resolved
  reason: "User reported: Only 1 person in PostHog (PWA-side UUID distinct_id); no person with server distinct_id '1'; Properties tab shows only 'Creator event ID'. No email, no createdAt."
  severity: major
  test: 4
  artifacts:
    - vigil-core/src/routes/me.ts
    - vigil-core/src/analytics/posthog.ts
  resolution:
    commit: c40ad77
    summary: "Wrapped `identifyUser` properties in explicit `$set` to bypass posthog-node's flat-property autowrap. Verified live by user in PostHog after Railway redeploy — email + createdAt both land on person `1`."
