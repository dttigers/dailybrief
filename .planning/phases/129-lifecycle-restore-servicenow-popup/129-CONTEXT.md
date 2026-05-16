# Phase 129: Lifecycle restore + ServiceNow popup - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<terminology_note>
## Terminology — G2 task vs ServiceNow work order

Phase 129 touches two distinct domain entities that earlier copy conflated:

- **G2 task (TASK_DETAIL screen)** — populated by the G2 plugin's `/v1/brief` openTasks list,
  sourced from the `thoughts` table (taskStatus IN ('open', 'inProgress')). These are user-captured
  thought-tasks. Implementation uses `task.id` (number). The G2 list screen is named `WORK_ORDERS`
  in the Screen enum (a historical naming artifact — see GAP-129-E in 129-UAT-RESULTS.md);
  the file `vigil-g2-plugin/src/screens/work-orders.ts` contains its rendering code.

- **ServiceNow work order (`work_orders` table + `/v1/work-orders/sync`)** — populated by Gmail
  import and the SVCNOW extension popup authored in this phase. These are tickets from ServiceNow
  Polaris, identified by `caseNumber` (e.g., `CS0353598`) and stored in the PostgreSQL `work_orders`
  table. The popup + route + migration in plans 129-01, 129-03, 129-04, 129-05 are ALL correctly
  about this entity.

When the runbook says "operator navigates to TASK_DETAIL" it means a G2 thought-task screen.
When the runbook says "extension popup POSTs to /v1/work-orders/sync" it means a ServiceNow work order.
These are different concepts; future phases should not blend them.
</terminology_note>

<domain>
## Phase Boundary

Two independent parallel-safe wins shipping alongside the 128a/128b spike windows:

1. **G2 last-viewed screen restore** — Plugin remembers its last-viewed screen across plugin re-launch (`setLocalStorage`) AND survives in-session phone-background → foreground migration (`setBackgroundState`/`onBackgroundRestore`). Same module-init code path also persists the existing Companion HUD active-session/banner cache (free win — already a planned fold per PROJECT.md).

2. **ServiceNow assisted-capture popup** — Browser extension popup (Chrome + Safari, lock-step) extracts CS# from `document.title` on `*.service-now.com/*`, operator types short description + priority, popup POSTs to existing `POST /v1/work-orders/sync` with `client_capture_id` for idempotency. **This phase ships AROUND the Polaris Shadow-DOM scrape block and the IT-denied API path** — both automation routes are dead; manual entry is the final answer.

Two distinct sub-features in one phase because both are small, parallel-safe with the spike phases, and ROADMAP.md groups them.

</domain>

<decisions>
## Implementation Decisions

### Extension popup mode-switching
- **D-01:** On non-`*.service-now.com/*` pages, the extension action button is **disabled** via `chrome.action.disable()` (and Safari equivalent) driven by a `tabs.onUpdated` / `tabs.onActivated` URL listener. Click does nothing on non-SN pages; greyed-out button signals "SVCNOW-only tool."
- **D-02:** The existing Phase 84 capture-the-page popup behavior is **retired** in this code path. No two-mode popup; SVCNOW form is the only popup mode.

### Post-submit popup UX
- **D-03:** On HTTP 200 from `POST /v1/work-orders/sync`, popup **closes immediately**. No "Sent ✓" toast, no auto-close delay. Trust the server — `client_capture_id` dedupes any retry from operator confusion.
- **D-04:** On non-200 (network fail / 4xx / 5xx), popup **stays open + inline error** under the Send button. Operator decides whether to retry (Send again — idempotent) or abandon (close manually). No auto-retry.

### G2 30-min TTL clock semantics
- **D-05:** TTL is **wall-clock from last screen-change save**. Stored shape: `{screen, args?, savedAt: Date.now()}` in localStorage at key `vigil:v3:lastScreen`. On launch: `Date.now() - savedAt > 30*60*1000` → fall back to home.
- **D-06:** Edge case acknowledged: phone-in-pocket gap (e.g. 25 min idle, plugin reopens 6 min later = 31 min from save) falls back to home. This is intentional — operator wasn't actively using the plugin during the gap; "natural state" (home) is the right landing.

### Parameterized screen restore (TASK_DETAIL, etc.)
- **D-07:** On restore of a screen that takes an id arg: **re-fetch the entity**. On 404 (deleted / completed / out-of-scope after restore), fall back to the **parent list screen** (e.g. WORK_ORDERS — the G2 list screen that displays thought-tasks from /v1/brief; see <terminology_note>) — not all the way to home. Closest to operator intent without leaving them stranded on an error state.
- **D-08:** Stored args shape MUST be small (id-only — never embedded entity snapshots). The re-fetch on restore is the source of truth.

### Locked by spec (no discussion needed — restated for the planner)
- **D-09:** Both `setBackgroundState`/`onBackgroundRestore` AND `setLocalStorage`/`getLocalStorage` are required (G2-LIFECYCLE-01 + 02). Two mechanisms; non-overlapping coverage.
- **D-10:** `onLaunchSource('glassesMenu')` precedence over restore (G2-LIFECYCLE-03) — already established by Phase 124 G2-POLISH-06; this phase preserves the invariant.
- **D-11:** Companion HUD active-session/banner cache folds into the same `setBackgroundState` module-init code path (PROJECT.md: "free win in same phase").
- **D-12:** SVCNOW idempotency: `client_capture_id` UUID generated client-side; server enforces `(user_id, client_capture_id)` composite partial unique index on `work_orders` (mirror Phase 121 pattern).
- **D-13:** Safari extension lock-step parity with Chrome (mirror Phase 114 EXT-02 pattern). Both manifests updated; both Send buttons render Vigil-brand-compliant styling.

### Claude's Discretion
- TTL constant location (env var, build-time constant, or inline) — researcher/planner can pick. 30-min is locked; storage of the constant is not.
- Popup form input validation (e.g., empty description allowed? max length on description?) — defer to planner; reasonable defaults are fine (e.g., empty allowed since operator may just want CS# captured; sensible upper bound like 2000 chars).
- Exact "home" screen identifier — the existing carousel default. Don't introduce a new "home" concept.
- Safari extension build pipeline (Xcode native shim vs. WKWebExtension) — researcher inspects `vigil-safari-extension/` and follows Phase 114 EXT-02 patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements
- `.planning/PROJECT.md` §"Target features" — v3.9 voice anchor + SVCNOW + G2 lifecycle context; ServiceNow note ("ships around Polaris Web-Component + Shadow-DOM scrape block")
- `.planning/REQUIREMENTS.md` §"SVCNOW" (SVCNOW-01..05) and §"G2-LIFECYCLE" (G2-LIFECYCLE-01..03) — locked acceptance criteria, including endpoint, regex, idempotency pattern, Chrome+Safari parity requirement, TTL value
- `.planning/ROADMAP.md` §"Phase 129" — phase goal, success criteria (5 items), depends-on (Phase 127 guardrails only)

### Prior phase patterns this phase mirrors
- `.planning/phases/121-*/121-CONTEXT.md` (and PLAN.md / SUMMARY.md) — **`client_capture_id` idempotency pattern** (composite partial unique index, server-side dedup). SVCNOW-04 explicitly mirrors this.
- `.planning/phases/114-*/114-CONTEXT.md` (and PLAN.md / SUMMARY.md) — **EXT-02 Chrome+Safari lock-step extension parity pattern**. SVCNOW-05 explicitly mirrors this.
- `.planning/phases/124-*/124-SUMMARY.md` — G2-POLISH-06 establishes `onLaunchSource('glassesMenu')` precedence; this phase preserves the invariant.
- `.planning/phases/124-*/124-CONTEXT.md` — Phase 124 D-07 (`bridge.onLaunchSource` module-scope registration) — already implemented; new restore logic must NOT break this ordering.

### Live code reference (G2 lifecycle primitives already proven in this codebase)
- `vigil-g2-plugin/src/lib/audio-session-guard.ts` — **canonical reference for `setBackgroundState`/`onBackgroundRestore` usage in this codebase** (Phase 128a). New code should follow the same registration shape.
- `vigil-g2-plugin/src/main.ts` (lines 76-90) — module-scope `bridge.onLaunchSource` registration pattern (Phase 124 D-07).
- `vigil-g2-plugin/src/__tests__/main.test.ts` (D-07 drift test) — structural test that the new restore code must not break. Adding restore-logic CANNOT push the onLaunchSource registration below `init()`.

### Endpoint + idempotency live code
- `vigil-core/src/routes/work-orders.ts:11` — `POST /work-orders/sync` route. SVCNOW POSTs to this with single-element array. Spec requires `client_capture_id` to be added if not already supported by this shape.

### Extension live code
- `vigil-extension/manifest.json` — Chrome MV3 manifest. Needs: `*://*.service-now.com/*` host permission, `chrome.action.disable()` URL-listener wiring, popup HTML/CSS/JS replacement.
- `vigil-extension/popup.{html,css,js}` — current Phase 84 capture-the-page popup. SVCNOW popup REPLACES this in scope; do not preserve the existing UI as a fallback (D-02).
- `vigil-safari-extension/` — Xcode project mirror. Lock-step port per Phase 114 EXT-02.

### Off-table (do not attempt — historical context)
- `~/Desktop/servicenow-integration-report.pdf` (2026-05-07, operator's other machine) — six-approach attempt log + Polaris Shadow-DOM block. **Spec already encodes the conclusion**: only CS# from `document.title`, no DOM scrape. Planner/researcher should NOT re-attempt Shadow-DOM piercing or formal API token paths — both are ruled out (IT denied API request 2026-05-15).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`vigil-g2-plugin/src/lib/audio-session-guard.ts`** — already implements `setBackgroundState`/`onBackgroundRestore` for the audio guard. New screen-restore logic should follow the same registration shape (key string + snapshot fn + restore fn). Consider extracting a small `background-state-registry.ts` if the audio-guard + screen-restore registration code starts duplicating.
- **`vigil-g2-plugin/src/main.ts:76-90`** module-scope `onLaunchSource` is already wired (Phase 124 D-07). New restore logic must consume the launch source via the same `bridgeInstance.onLaunchSource(...)` resolver — don't add a second listener.
- **`vigil-core/src/routes/work-orders.ts`** `POST /work-orders/sync` route exists. Verify it accepts the array shape `[{case_number, description, priority, client_capture_id}]` and adds the `(user_id, client_capture_id)` partial unique index if not present.
- **`vigil-extension/popup.{html,css,js}`** + **`vigil-safari-extension/Vigil Capture Extension/`** are the existing extension shells. SVCNOW popup replaces popup body content; manifest + action-state listener is new.

### Established Patterns
- **`client_capture_id` idempotency pattern** (Phase 121): client generates UUID; server enforces `(user_id, client_capture_id)` composite partial unique index on the target table. Dedupes multi-tab races, retry storms, corporate-VPN-latency double-submits.
- **Chrome+Safari extension lock-step parity** (Phase 114 EXT-02): every feature ships in both manifests + both popup UIs in the same commit. Don't ship Chrome-first and back-fill Safari.
- **G2 module-scope listener registration** (Phase 124 D-07): event handlers (`onLaunchSource`, `setBackgroundState`/`onBackgroundRestore`) MUST be registered at module top-level BEFORE `init()` is called. Drift test pins this.

### Integration Points
- G2 plugin `navigation.ts` carries screen state (carousel index, current screen). Restore logic hooks both: write on screen-change (`navigationState` mutation), read on plugin re-launch and onBackgroundRestore.
- Companion HUD `companion.ts` carries active-session + banner cache. Restore logic captures this in the same `setBackgroundState('vigil-companion-state', snapshotFn)` registration as a free-win fold.
- Browser extension popup `tabs.onUpdated` / `tabs.onActivated` listeners gate action button enable/disable. Service worker (MV3) handles the listener; popup HTML/JS only renders the form.

</code_context>

<specifics>
## Specific Ideas

- Operator scenario for SVCNOW: on a Polaris case page (e.g. `https://acme.service-now.com/now/cwf/agent/record/sn_customerservice_case/<sysid>`), `document.title` = `CS1234567 - Some description` or similar. Regex `/^CS\d{7}$/` against the title pulls `CS1234567`. **Empirical confirmation that document.title actually matches this shape is NOT in the planning artifacts** — researcher should verify against a live Polaris page before committing the regex (10-min probe; if title shape is different, regex needs adjustment).
- Operator scenario for G2 lifecycle: operator is on TASK_DETAIL screen for one of their thought-tasks (e.g., task id 1234, sourced from /v1/brief openTasks → thoughts table) → swipes G2 to read affirmation → 15 min later swipes back → expects TASK_DETAIL for task #1234 to be where they left. (D-07: re-fetch task #1234; if 404, drop them on the WORK_ORDERS list — the G2 list screen that renders thought-tasks; see <terminology_note>.)

</specifics>

<deferred>
## Deferred Ideas

- **SVCNOW two-way sync** (push Vigil status changes back to ServiceNow) — already captured as SVCNOW-FUTURE-01 in REQUIREMENTS.md. Blocked on IT API token (which was denied 2026-05-15, so this is now permanently blocked unless IT policy changes).
- **G2 popup "open description with summary of last visit"** (e.g., re-open TASK_DETAIL with a "you were last here X min ago" toast) — not in spec, would be a follow-up polish.
- **Polaris Shadow-DOM scrape retry** — explicitly out of scope. If Polaris ever drops Shadow DOM, revisit in a future phase. Spec assumes this stays blocked.
- **Capture-the-page popup feature** (Phase 84 functionality) — being retired in Phase 129 per D-02. If a generic page-capture flow is needed in the future, ship it as a separate extension or a separate popup mode behind a feature flag.

</deferred>

---

*Phase: 129-lifecycle-restore-servicenow-popup*
*Context gathered: 2026-05-15*
