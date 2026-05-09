# Phase 123 — Deferred / Out-of-Scope Items

## Pre-existing test failures (baseline before Plan 01)

### `StateStoreTests.testRecordMilestoneRoundTrip` — FAILING in `main`

**File:** `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/StateStoreTests.swift:92-95`

**Symptom:** 4 XCTAssertEqual failures inside the same test case — round-tripped milestone fields read back as `nil` instead of expected values (firstMatchOffset, label, post_status, emittedAt).

**Discovered:** During Plan 123-01 baseline run on commit `c3de707` (head of vigil-watch main).

**Scope:** Out-of-scope for Plan 123-01 (CLI shell scaffold). The failure is in Phase 122 milestone-record persistence (StateStore.swift), unrelated to swift-argument-parser dependency or main.swift dispatcher work. Plan 123-01 does not touch StateStore or MilestoneRecord; this failure pre-exists and persists.

**Disposition:** Tracked as deferred; Plan 123-01 acceptance criteria asks for "≥107 tests passing" — baseline already has 110 passing of 111, adding PackageTests yields 111 passing of 112. The known-failing milestone roundtrip is documented baseline state that ride-along to a future Phase 122 fix (likely the same plan that addresses Phase 122 P09 deferred items).
