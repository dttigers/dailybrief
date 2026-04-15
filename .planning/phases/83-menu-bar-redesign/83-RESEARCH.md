# Phase 83: Menu Bar Redesign — Research

**Researched:** 2026-04-14
**Domain:** SwiftUI MenuBarExtra / AppKit, vigil-core Hono/Drizzle API, React PWA settings
**Confidence:** HIGH — all findings sourced directly from the live codebase

---

## Summary

DailyBriefMonitor is already a MenuBarExtra-based SwiftUI app. The app currently promotes itself to `.regular` activation policy when opening the Dashboard or Settings window, which is what causes Dock presence. Removing the Dashboard entirely eliminates the only two call sites for `NSApp.setActivationPolicy(.regular)`, so the Dock icon disappears with zero Info.plist surgery needed — `LSUIElement = true` is already set in install.sh.

The current BriefScheduler hardcodes `hour: 6, minute: 0` at launch and stores no schedule in persistent state. To fulfil the success criteria (schedule editable from PWA), a new `app_settings` table in PostgreSQL (single-row, keyed by name) must be created, with two fields: `print_schedule_hour` and `print_schedule_enabled`. The Mac app calls `GET /v1/settings/print-schedule` on launch, then builds its Timer. The PWA SettingsPage grows a new "Print Schedule" card with a time input and toggle that calls `PUT /v1/settings/print-schedule`.

The removal scope is large on the Swift side but surgical in impact: the entire `Dashboard/` directory (11 files), the heavy AppDelegate services (capture, triage, insight, therapy, folder watcher, projects store), and the Settings window. What stays: BriefScheduler, StatusChecker, MenuBarView, UpdateService, DailyBriefMonitorApp, RepoLocation — plus a new API-read-on-launch flow in the app entry point.

**Primary recommendation:** Delete `Dashboard/` in one task, strip AppDelegate to a thin shell (capture panel + hotkey remain if desired, or drop entirely), add `app_settings` table + route to vigil-core, add schedule card to PWA SettingsPage, teach BriefScheduler to accept remote config on init.

---

## Current Architecture Inventory

### Files to DELETE (SwiftUI dashboard + settings UI)

| Path | Reason |
|------|--------|
| `Sources/DailyBriefMonitor/Dashboard/BriefHistoryView.swift` | Dashboard UI — PWA replaces it |
| `Sources/DailyBriefMonitor/Dashboard/BriefHistoryViewModel.swift` | Dashboard UI |
| `Sources/DailyBriefMonitor/Dashboard/ChatView.swift` | Dashboard UI |
| `Sources/DailyBriefMonitor/Dashboard/ChatViewModel.swift` | Dashboard UI |
| `Sources/DailyBriefMonitor/Dashboard/DashboardView.swift` | Dashboard UI |
| `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` | Dashboard UI |
| `Sources/DailyBriefMonitor/Dashboard/LinkedThoughtsSheet.swift` | Dashboard UI |
| `Sources/DailyBriefMonitor/Dashboard/NewProjectSheet.swift` | Dashboard UI |
| `Sources/DailyBriefMonitor/Dashboard/PhotoPreviewSheet.swift` | Dashboard UI |
| `Sources/DailyBriefMonitor/Dashboard/TherapyPrepView.swift` | Dashboard UI |
| `Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift` | Dashboard UI |
| `Sources/DailyBriefMonitor/Settings/SettingsView.swift` | Settings UI — PWA replaces it |
| `Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift` | Settings UI |
| `Sources/DailyBriefMonitor/ImagePicker.swift` | Used only by Dashboard |
| `Sources/DailyBriefMonitor/GoogleCalendarAuth.swift` | Used only by SettingsViewModel |

### Files to KEEP (unchanged)

| Path | Reason |
|------|--------|
| `Sources/DailyBriefMonitor/BriefScheduler.swift` | Core scheduling logic; needs new `init(hour:minute:enabled:)` |
| `Sources/DailyBriefMonitor/StatusChecker.swift` | Reads log file + runs CLI — still needed |
| `Sources/DailyBriefMonitor/MenuBarView.swift` | Needs pruning but stays |
| `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` | Entry point — needs new API-fetch-on-launch block |
| `Sources/DailyBriefMonitor/UpdateService.swift` | Self-update mechanism — keep |
| `Sources/DailyBriefMonitor/UpdateStatus.swift` | Supporting enum |
| `Sources/DailyBriefMonitor/RepoLocation.swift` | Build-time path constant |
| `Sources/DailyBriefMonitor/GlobalHotKey.swift` | Hotkey registration |
| `Sources/DailyBriefMonitor/CapturePanel.swift` | Quick-capture panel |
| `Sources/DailyBriefMonitor/CaptureView.swift` | Quick-capture view |
| `Sources/DailyBriefMonitor/FolderWatcherService.swift` | Folder watching — decide: keep or remove (see Open Questions) |

### AppDelegate trimming

AppDelegate currently owns:
- `capturePanel` + `captureService` + `triageService` + `thoughtStore` — keep if capture stays
- `projectsStore`, `insightService`, `therapyClassificationService`, `therapyPatternService`, `therapyPrepService` — DELETE (only used by DashboardView/ViewModel)
- `folderWatcher` — see Open Questions
- `openDashboard()` — DELETE
- `openSettings()` — DELETE
- `dashboardWindow`, `settingsWindow` — DELETE
- `restartFolderWatcher()` — DELETE if folder watcher removed

The two activation-policy promotions live only in `openDashboard()` and `openSettings()`. Deleting those methods is the complete Dock-icon fix. [VERIFIED: codebase grep]

---

## Menu Bar Implementation Analysis

**Current implementation:** SwiftUI `MenuBarExtra` (macOS 13+) — declared in `DailyBriefMonitorApp.swift` as:
```swift
MenuBarExtra { MenuBarView(...) } label: { HStack { Image(...) ... } }
```
[VERIFIED: Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift]

**How Dock-hiding works today:**
- `LSUIElement = true` is written into `Contents/Info.plist` by `Scripts/install.sh` at install time [VERIFIED: Scripts/install.sh line 119]
- The app launches as an accessory (no Dock icon) by default
- `NSApp.setActivationPolicy(.regular)` is called ONLY in `openDashboard()` and `openSettings()` (AppDelegate.swift lines 228, 295) — these are the sole source of temporary Dock presence
- Deleting those two methods restores permanent menubar-only mode with no other changes needed [VERIFIED: AppDelegate.swift]

**MenuBarView changes needed:**
- Remove `onDashboard` callback and Dashboard button
- Remove `onSettings` callback and Settings button  
- Remove `onCapture` and Quick Capture button (or keep if capture panel stays — see Open Questions)
- Remove Update status row and Update Vigil button (or keep — UpdateService is independent)
- Add "Next print: [time]" display (already partially present via scheduler)
- Add "Print Now" action (already present as "Run Now" → `checker.runNow()`)
- Keep View Log, Quit

---

## BriefScheduler — Current Behaviour vs. Target

**Current:** Hardcoded `hour: 6, minute: 0` at init; `isScheduleEnabled: Bool` lives only in memory (resets to `true` on every launch). No persistence, no API read. [VERIFIED: BriefScheduler.swift]

**Target flow:**
1. On launch, `DailyBriefMonitorApp` makes a `GET /v1/settings/print-schedule` call
2. Response: `{ "hour": 6, "minute": 30, "enabled": true }`
3. Passes values to `BriefScheduler(checker:, hour:, minute:, enabled:)`
4. If API unreachable, fall back to `hour: 6, minute: 0, enabled: true`

**BriefScheduler changes:** Add `enabled` parameter to `init`; add `reschedule(hour:minute:enabled:)` override; no Timer changes needed.

**`hasRunToday()` stays:** It reads the log file to prevent double-runs. Keep as-is.

---

## vigil-core API — What Needs to Be Created

### No existing settings/schedule route [VERIFIED: vigil-core/src/routes/ directory listing]

No `settings.ts` file exists. The schema has no `app_settings` table. [VERIFIED: vigil-core/src/db/schema.ts]

### Recommended approach: `app_settings` key-value table

**New Drizzle table (schema.ts):**
```typescript
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

This is a general key-value store pattern — allows future settings without schema migrations. A single row with `key = 'print_schedule'` stores `{ hour: 6, minute: 0, enabled: true }`.

**New route: `vigil-core/src/routes/settings.ts`**
```typescript
// GET  /v1/settings/print-schedule  → { hour, minute, enabled }
// PUT  /v1/settings/print-schedule  → body: { hour, minute, enabled }
```

Route follows the existing Hono factory pattern (DI deps for testing), exactly like `google-status.ts`. [VERIFIED: vigil-core/src/routes/google-status.ts]

**Migration:** One new `drizzle/000N_add_app_settings.sql` file:
```sql
CREATE TABLE "app_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

**Registration in `vigil-core/src/index.ts`:** Add import + `app.route("/v1", settings)` after other protected routes (auth middleware already covers all `/v1/*`). [VERIFIED: vigil-core/src/index.ts]

---

## PWA SettingsPage — What Needs to Be Added

**Current SettingsPage.tsx:** Single section for Google OAuth. [VERIFIED: vigil-pwa/src/pages/SettingsPage.tsx]

**Addition needed:** New "Print Schedule" card below the Google card with:
- Time input (`<input type="time">`) for hour + minute — renders as native time picker on iOS
- Toggle (`<input type="checkbox">` or styled toggle) for enabled
- Save button — calls `PUT /v1/settings/print-schedule`
- Load on mount — calls `GET /v1/settings/print-schedule`, populates fields
- Loading/error states consistent with existing banner pattern

**New PWA API client functions needed in `vigil-pwa/src/api/client.ts`:**
```typescript
export interface PrintSchedule { hour: number; minute: number; enabled: boolean }
export async function getPrintSchedule(): Promise<PrintSchedule | null>
export async function setPrintSchedule(s: PrintSchedule): Promise<void>
```

These follow the same `vigilFetch` pattern used by `getGoogleStatus()` and `disconnectGoogle()`. [VERIFIED: vigil-pwa/src/api/client.ts]

---

## Doctor Command — What Needs to Change

**Current checks (DailyBrief.swift lines 512-598):**
1. `VIGIL_API_KEY` env var present
2. vigil-core `/v1/health` reachable
3. LaunchAgent plist exists
4. LaunchAgent loaded in launchctl
5. Plist binary exists

**Phase 83 additions:**
- Check 6: `GET /v1/settings/print-schedule` returns 200 (confirms schedule API is live)
- The existing checks remain valid; the plist path does not change

[VERIFIED: Sources/DailyBrief/DailyBrief.swift lines 515-598]

---

## LaunchAgent Plist — What Changes

**Current plist (both in `LaunchAgent/` repo copy and `~/Library/LaunchAgents/`):**
- No changes needed to plist structure
- `LSUIElement = true` is already in Info.plist written by install.sh
- PATH already includes `/usr/local/bin:/usr/bin:/bin`

**The plist in `LaunchAgent/com.jamesonmorrill.dailybriefmonitor.plist` is a static reference copy** — the canonical generated version is written by `Scripts/install.sh`. Both should stay in sync.

[VERIFIED: LaunchAgent/com.jamesonmorrill.dailybriefmonitor.plist, Scripts/install.sh]

No plist changes required for this phase.

---

## Architecture Patterns

### Hono Route Factory (vigil-core standard)
```typescript
// Source: vigil-core/src/routes/google-status.ts (verified)
export interface PrintScheduleDeps {
  dbSelectFn?: () => Promise<...>
  dbUpsertFn?: (s: PrintSchedule) => Promise<void>
}
export function createSettingsRouter(deps?: PrintScheduleDeps): Hono { ... }
export const settings = createSettingsRouter()
```

### SwiftUI async on-launch fetch
```swift
// In DailyBriefMonitorApp.body, inside .onAppear or as a Task in init:
.task {
    if let schedule = try? await VigilAPIClient(...).get(path: "/settings/print-schedule") {
        scheduler = BriefScheduler(checker: checker, hour: schedule.hour,
                                   minute: schedule.minute, enabled: schedule.enabled)
    } else {
        scheduler = BriefScheduler(checker: checker) // defaults: 6:00, enabled
    }
}
```

BriefScheduler already has a `reschedule(hour:minute:)` method — extend it to take `enabled:` too.

### Drizzle upsert pattern (key-value row)
```typescript
await db.insert(appSettings)
  .values({ key: 'print_schedule', value: body })
  .onConflictDoUpdate({ target: appSettings.key, set: { value: body, updatedAt: new Date() } })
```
[ASSUMED: Drizzle `onConflictDoUpdate` syntax — consistent with Drizzle v0.30+ docs, but not verified against Context7 in this session]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time picker UI | Custom time wheel | `<input type="time">` | Native, works on iOS, formats to HH:MM automatically |
| Settings persistence | Local JSON file on Mac | PostgreSQL via vigil-core | Single source of truth; works from any device |
| Upsert logic | SELECT then INSERT/UPDATE | Drizzle `onConflictDoUpdate` | Atomic, race-condition safe |
| Dock-icon suppression | LSUIElement plist surgery | Delete `openDashboard`/`openSettings` | `LSUIElement=true` already set; just remove the promotion calls |

---

## Common Pitfalls

### Pitfall 1: Scheduler init races app launch
**What goes wrong:** If the async API fetch completes after the menu opens, `scheduler == nil` and no schedule row shows.
**Why it happens:** `DailyBriefMonitorApp.onAppear` runs on menu-open, not on app-launch.
**How to avoid:** Initialize `BriefScheduler` with defaults immediately, then update via `scheduler?.reschedule(...)` once the API call completes. Never defer scheduler creation to the network call.

### Pitfall 2: Deleting files breaks JarvisCore imports
**What goes wrong:** Removing files that are referenced via `@testable import DailyBriefMonitor` in test targets causes build failure.
**Why it happens:** `Tests/DailyBriefMonitorTests` imports the whole module.
**How to avoid:** Check all test files for references to deleted types before deleting source files. [VERIFIED: Package.swift — DailyBriefMonitorTests target exists]

### Pitfall 3: `NSApp.setActivationPolicy(.regular)` in capture path
**What goes wrong:** If `capturePanel`/Quick Capture is kept and also calls `setActivationPolicy(.regular)`, the Dock icon returns.
**Why it happens:** The capture panel flow may also need to promote to regular mode for key events.
**How to avoid:** Audit `CapturePanel.swift` for any activation policy changes before deciding to keep capture.

### Pitfall 4: App builds but crashes at runtime due to missing `thoughtStore`
**What goes wrong:** AppDelegate passes `thoughtStore` (now removed) to `CaptureService` — nil crash.
**Why it happens:** AppDelegate was written as one monolith.
**How to avoid:** Either keep the minimal `VigilAPIClient → APIThoughtStore → CaptureService` chain (for capture panel) OR remove capture panel entirely. Don't leave half the chain.

### Pitfall 5: `PUT /v1/settings/print-schedule` input validation
**What goes wrong:** Hour outside 0-23 or minute outside 0-59 accepted and stored; Mac app converts to invalid DateComponents.
**Why it happens:** No validation added to route.
**How to avoid:** Add explicit bounds check in the route before upsert.

---

## Runtime State Inventory

> This is a configuration-read redesign, not a rename/string-replacement phase.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | No `app_settings` table exists yet | Create via migration |
| Live service config | LaunchAgent plist structure unchanged | None |
| OS-registered state | `com.jamesonmorrill.dailybriefmonitor` LaunchAgent loaded | No re-registration needed; binary path unchanged |
| Secrets/env vars | No new secrets required | None |
| Build artifacts | `~/.local/bin/DailyBriefMonitor.app` — rebuilt by install.sh after changes | Re-run `./Scripts/install.sh` after phase |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Swift 6.2 (SPM) | Monitor rebuild | ✓ | Package.swift specifies swift-tools-version: 6.2 | — |
| PostgreSQL (Railway) | `app_settings` migration | ✓ | Live at api.vigilhub.io | — |
| Drizzle Kit | Migration generation | ✓ | drizzle.config.ts present | — |
| launchd/launchctl | LaunchAgent reload | ✓ | macOS built-in | — |

---

## Standard Stack

### Core (no new dependencies)
| Component | Current | Change |
|-----------|---------|--------|
| SwiftUI MenuBarExtra | macOS 14 (Package.swift) | No change — already in use |
| Hono (vigil-core) | ^4.x (inferred from existing routes) | No change |
| Drizzle ORM | ^0.30 (inferred from existing migrations) | Add new table only |
| React + Vite (PWA) | Existing | Add one new page section |

No new npm or Swift packages required for this phase.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| vigil-core | Vitest (inferred from `.test.ts` files in routes/) |
| Swift | DailyBriefMonitorTests SPM test target |
| Quick run (vigil-core) | `cd vigil-core && npm test` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | File |
|-----|----------|-----------|------|
| SC-1 | No Dock icon | Manual smoke | Launch app post-install, observe |
| SC-2 | Menu shows next print time | Manual smoke | Open menu bar icon |
| SC-3 | Schedule persists via API | Unit + integration | `vigil-core/src/routes/settings.test.ts` (Wave 0 gap) |
| SC-4 | Mac app reads schedule on launch | Manual smoke | Confirm time matches API value |
| SC-5 | Dashboard views deleted | Build check | `swift build` must pass |
| SC-6 | Doctor passes | Integration | `dailybrief doctor` exit 0 |

### Wave 0 Gaps
- [ ] `vigil-core/src/routes/settings.test.ts` — covers GET + PUT print-schedule
- [ ] `vigil-core/src/routes/settings.ts` — the route itself

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | Yes | `print-schedule` route is behind `bearerAuth` middleware — same as all other protected routes |
| V5 Input Validation | Yes | Validate `hour` (0-23), `minute` (0-59), `enabled` (boolean) in route handler |
| V6 Cryptography | No | No new secrets |

The `app_settings` table stores non-sensitive data (hour, minute, boolean). No encryption needed.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Drizzle `onConflictDoUpdate` syntax is `{ target, set: { ... } }` | Architecture Patterns | Migration task fails compile; fix by checking drizzle docs at plan time |
| A2 | `FolderWatcherService` is not required by the menu-bar-only design | Files to KEEP | If it's kept, AppDelegate cleanup must preserve the watcher chain |
| A3 | Quick Capture panel (CapturePanel/CaptureView) is kept | AppDelegate trimming | If removed, `GlobalHotKey` also drops and AppDelegate shrinks further |

---

## Open Questions

1. **Keep or remove Quick Capture panel + global hotkey (Cmd+Shift+J)?**
   - What we know: Capture panel is a separate floating window, not a dashboard. It does NOT call `setActivationPolicy(.regular)`.
   - What's unclear: Is the user still using quick capture, or does the PWA/G2 path replace it?
   - Recommendation: Default to KEEP (it's self-contained, low risk). Flag for user decision during discuss.

2. **Keep or remove FolderWatcherService?**
   - What we know: It's wired through AppDelegate and requires `imageDescriptionService`, `transcriptionService`, `captureService`, `triageService`, `thoughtStore`.
   - What's unclear: Is folder-drop-to-capture still an active use case?
   - Recommendation: Default to KEEP (deferred to future phase). If removed, the entire AI-services chain in AppDelegate can be deleted.

3. **Should `dailybrief doctor` Check 6 (schedule API) be added in this phase?**
   - Recommendation: Yes — it's a 10-line addition that validates the new infra is live.

---

## Sources

### Primary (HIGH confidence — verified from codebase)
- `Sources/DailyBriefMonitor/AppDelegate.swift` — activation policy calls, service wiring
- `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` — MenuBarExtra structure
- `Sources/DailyBriefMonitor/BriefScheduler.swift` — scheduling logic
- `Sources/DailyBriefMonitor/StatusChecker.swift` — CLI runner
- `Sources/DailyBriefMonitor/MenuBarView.swift` — current menu UI
- `Sources/DailyBrief/DailyBrief.swift` — Doctor command implementation
- `vigil-core/src/db/schema.ts` — no app_settings table confirmed
- `vigil-core/src/routes/` listing — no settings.ts confirmed
- `vigil-core/src/index.ts` — route registration pattern
- `vigil-core/src/routes/google-status.ts` — factory pattern to follow
- `vigil-pwa/src/pages/SettingsPage.tsx` — current settings UI
- `vigil-pwa/src/api/client.ts` — `vigilFetch` pattern
- `Scripts/install.sh` — LSUIElement=true in generated Info.plist
- `LaunchAgent/com.jamesonmorrill.dailybriefmonitor.plist` — plist structure

### Tertiary (ASSUMED — not verified via docs)
- Drizzle `onConflictDoUpdate` exact API syntax (A1)

---

## Metadata

**Confidence breakdown:**
- Current file inventory: HIGH — read directly
- Dock-icon mechanism: HIGH — traced through AppDelegate and install.sh
- API route pattern: HIGH — modeled on existing routes
- Drizzle upsert syntax: LOW — assumed, needs verification at implementation
- PWA time input pattern: HIGH — `<input type="time">` is HTML standard

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable codebase; only invalidated by other phases touching these files)
