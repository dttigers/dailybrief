# Phase 129: Lifecycle restore + ServiceNow popup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 129-lifecycle-restore-servicenow-popup
**Areas discussed:** Extension popup mode-switching, Post-submit popup UX, G2 30-min TTL semantics, Parameterized screen restore

---

## Pre-discussion clarification — ServiceNow status

User flagged: "we still need to trouble shoot the service now capture" before diving into gray areas.

Investigation across STATE.md, RETROSPECTIVE.md, ROADMAP.md, REQUIREMENTS.md found no in-flight troubleshooting — the spec is locked. Existing `vigil-extension/` and `vigil-safari-extension/` both exist (Phase 84 / Phase 114 EXT-02 era) but the current popup only captures CS#, no details.

User confirmed: "the popup was only grabbing CS#s. no details. also, IT denied my api request..." — meaning both automation paths are dead:

| Path | Status |
|------|--------|
| Scrape details from Polaris DOM | ❌ Polaris Shadow DOM block (2026-05-07 six-approach PDF) |
| Formal `sn_customerservice_case` API token | ❌ IT denied 2026-05-15 |
| Operator types description + priority manually | ✅ **Phase 129 scope** |

Asked whether to bring the 2026-05-07 PDF over for a "do not attempt" guard in CONTEXT.md. User chose: **No, the spec already says don't scrape.** PDF stays on the other machine; the spec's unambiguous "only CS# from document.title" is enough to keep planner/researcher from re-attempting ruled-out paths.

---

## Area 1: Extension popup mode-switching

| Option | Description | Selected |
|--------|-------------|----------|
| Disable button entirely off-SN | `chrome.action.disable()` driven by tab URL listener — greys out on non-SN, no popup at all. Single-purpose extension. | ✓ |
| Show 'Open on a ServiceNow case' message | Click works on any page; popup shows explainer on non-SN. Dead-end UX. | |
| Keep existing capture-page UI as fallback | Two-mode popup preserves Phase 84 capture-the-page; SVCNOW form added on SN pages. | |

**User's choice:** Disable button entirely off-SN.
**Implication captured in CONTEXT.md D-02:** The existing Phase 84 capture-the-page popup is **retired** in this code path. No two-mode popup.

---

## Area 2: Post-submit popup UX

| Option | Description | Selected |
|--------|-------------|----------|
| Close immediately on HTTP 200 | Fastest flow. Trust server (client_capture_id dedupes retries). Inline error on non-200. | ✓ |
| Show 'Sent ✓' then auto-close after 1.5s | Visible confirmation, ~1.5s delay before next capture. | |
| Keep open, clear form, focus description for next entry | Optimized for back-to-back capture. Operator must close manually. | |

**User's choice:** Close immediately on HTTP 200; keep open with inline error on failures (CONTEXT D-04).

---

## Area 3: G2 30-min TTL semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Wall-clock from last screen-change save | `Date.now() - savedAt > 30min` → home. Simple, deterministic. Phone-in-pocket gap falls back to home (acceptable). | ✓ |
| Plugin-foreground time only | Track active foreground time. More complex; marginal benefit. | |
| Any G2 interaction extends TTL | Touch/swipe resets clock. Even more complex; useful only if operators linger. | |

**User's choice:** Wall-clock from last screen-change save (CONTEXT D-05/D-06).

---

## Area 4: Parameterized screen restore

| Option | Description | Selected |
|--------|-------------|----------|
| Re-fetch; fall back to list on 404 | Try exact id; on 404 (deleted/completed) land on parent list (e.g. WORK_ORDERS). Closest to operator intent without stranding on error. | ✓ |
| Always fall back to list screen | Skip exact-id restore; always restore parent list. Simpler; slightly worse UX. | |
| Re-fetch; fall back to home on 404 | Try exact id; on 404 route to home. Loses context. | |
| Don't restore parameterized screens at all | Only restore zero-arg screens. Save parent list instead. Simplest rule, loses intent. | |

**User's choice:** Re-fetch; fall back to list on 404 (CONTEXT D-07).
**Implication captured in CONTEXT.md D-08:** Stored args MUST be small (id-only — never embedded entity snapshots). Re-fetch is the source of truth on restore.

---

## Claude's Discretion

Captured in CONTEXT.md `<decisions>` "Claude's Discretion" subsection:
- TTL constant location (env var, build-time, inline) — planner picks; value is locked at 30 min.
- SVCNOW form input validation defaults (empty description allowed; reasonable upper bound).
- Exact "home" screen identifier — use existing carousel default; don't introduce new "home" concept.
- Safari extension build pipeline (Xcode shim vs. WKWebExtension) — researcher inspects `vigil-safari-extension/` and follows Phase 114 EXT-02 patterns.

## Deferred Ideas

- SVCNOW two-way sync (push Vigil status changes back to ServiceNow) — SVCNOW-FUTURE-01, now permanently blocked given IT API denial.
- G2 "you were last here X min ago" toast on restore — polish, future phase.
- Polaris Shadow-DOM scrape retry — explicitly out of scope unless Polaris drops Shadow DOM.
- Capture-the-page popup (Phase 84 feature) — retired by D-02; revive as separate popup mode behind feature flag only if needed.

## Empirical assumption flagged for researcher

The CS# regex `/^CS\d{7}$/` on `document.title` was locked in REQUIREMENTS.md without an in-planning empirical confirmation that Polaris case-page titles actually match this shape. Researcher should validate against a live Polaris page (10-min probe) before committing the regex to PLAN.md. If the title is `CS1234567 - Description...` rather than bare `CS1234567`, the regex needs `^CS\d{7}\b` or similar adjustment.
