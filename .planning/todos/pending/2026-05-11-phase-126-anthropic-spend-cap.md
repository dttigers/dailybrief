---
created: 2026-05-11
phase: 126
requirement: AUTH-126-07
type: operator-wallclock
blocks: phase-complete
---

# Phase 126 — Anthropic monthly spend cap (operator action)

**What:** Log into the Anthropic Console → Plans & Billing → Spend Limits → set a monthly cap.

**Why:** Before flipping `VIGIL_ALLOWED_EMAILS="*"` (AUTH-126-08), the system has no per-user AI usage quota. A single bad-actor or buggy client loop can drain the Anthropic budget overnight. The console cap is a hard backstop while a proper per-user quota system is built (deferred to a later phase).

**Recommended cap:** 3× expected baseline monthly spend. Tight enough that abuse burns visibly without taking the service down for legit users. If unsure of baseline, start at $100/mo and adjust after week 1 of public traffic.

**Verification:**
- Anthropic Console shows the cap set with the chosen value
- (Optional) Test the cap by setting a deliberately low value, hitting a `/v1/therapy` or `/v1/insights` endpoint until rejected, then restoring the real cap

**Blocks:** This todo MUST be checked off before Phase 126 can be marked complete (AUTH-126-08 sentinel flip is gated on AUTH-126-07).

**Once done:** Move this file to `.planning/todos/done/` with a brief note recording the cap value chosen and the date set.
