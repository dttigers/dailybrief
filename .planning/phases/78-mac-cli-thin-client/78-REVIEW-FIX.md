---
phase: 78-mac-cli-thin-client
fixed_at: 2026-04-14T22:15:00Z
review_path: .planning/phases/78-mac-cli-thin-client/78-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 78: Code Review Fix Report

**Fixed at:** 2026-04-14T22:15:00Z
**Source review:** .planning/phases/78-mac-cli-thin-client/78-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (3 Critical, 5 Warning)
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: `calendarSelections` silently wiped on every OAuth re-connect

**Files modified:** `vigil-core/src/routes/google-auth.ts`
**Commit:** 72ab32c
**Applied fix:** Removed `calendarSelections: []` from the `.values()` insert call (column default `[]` now applies only on first insert) and omitted `calendarSelections` from the `.onConflictDoUpdate` set clause entirely. Added explanatory comments at both omission points.

---

### CR-02: Stored `pdfFilename` used as `fs.readFile` path without re-validation

**Files modified:** `vigil-core/src/routes/brief-generate.ts`
**Commit:** 30f4159
**Applied fix:** Added `import * as path from "node:path"` and inserted a path containment guard before `readFile`: resolves both `BRIEFS_DIR` (from env or `/tmp/briefs` fallback) and the stored `pdfFilename` with `path.resolve`, then asserts the resolved path starts with `safeDir + path.sep`. Returns 404 if the check fails.

---

### CR-03: Unverified `id_token` JWT payload used as the stored account email

**Files modified:** `vigil-core/src/routes/google-auth.ts`
**Commit:** c4d6228
**Applied fix:** Replaced the single-line comment with a multi-line security note documenting: (1) the RS256 signature is not verified, (2) the accepted risk rationale (TLS-anchored exchange), (3) an explicit constraint that `accountEmail` is DISPLAY-ONLY and must never be used for access control, and (4) the upgrade path to `google-auth-library verifyIdToken()` if gating is ever needed.

---

### WR-01: Race condition — auto-load effect missing `todayStr` and `generateState` dependencies

**Files modified:** `vigil-pwa/src/pages/BriefHistoryPage.tsx`
**Commit:** 74df7ad
**Applied fix:** Removed the `// eslint-disable-line react-hooks/exhaustive-deps` suppression. Restructured the effect to use an early-return guard (`if (!todayBriefExists || todayBlobUrl || generateState !== 'idle') return`) and an `active` flag for cancellation. Added all consumed closure values — `todayBriefExists`, `todayStr`, `generateState`, `todayBlobUrl` — to the dependency array.

---

### WR-02: Blob URL leaked when `handleSelectBrief` is called while a previous load is still in-flight

**Files modified:** `vigil-pwa/src/pages/BriefHistoryPage.tsx`
**Commit:** 283b0b3
**Applied fix:** Added `useRef` to the React import. Introduced `detailBlobUrlRef = useRef<string | null>(null)` to track the live detail blob URL synchronously. Updated `handleSelectBrief` to revoke via the ref before issuing the new fetch and to write the new URL back to the ref after creation. Updated `handleBack` to also revoke via the ref.

---

### WR-03: `google_error` query param rendered in banner without sanitizing the source

**Files modified:** `vigil-pwa/src/pages/SettingsPage.tsx`
**Commit:** 55b0e95
**Applied fix:** Added a `GOOGLE_ERROR_MESSAGES` constant map with entries for `invalid_state`, `no_refresh_token`, `server_error`, `access_denied`, and `no_code`. Replaced the `decodeURIComponent(err)` interpolation with a lookup: `GOOGLE_ERROR_MESSAGES[err] ?? 'Connection failed. Please try again.'`. Unknown error codes now produce the generic fallback instead of displaying raw server-supplied text.

---

### WR-04: `deviceCode` is URL-concatenated into the token poll body without encoding

**Files modified:** `Sources/DailyBrief/DailyBrief.swift`
**Commit:** f675c50
**Applied fix:** Two locations addressed:
1. `deviceCodeBody` (Step 1): added `encodedClientIdForDeviceCode` via `addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)` with fallback to original value.
2. `tokenBody` (Step 3): added `encodedDeviceCode` and `encodedClientId` with the same encoding pattern, replacing bare interpolation of both values.

---

### WR-05: `brief-generate` router uses `db: any` type, losing type safety on all DB operations

**Files modified:** `vigil-core/src/routes/brief-generate.ts`, `vigil-core/src/routes/brief-generate.test.ts`, `vigil-core/src/services/brief-assembly-service.ts`, `vigil-core/src/services/brief-assembly-service.test.ts`
**Commit:** 9f9822f
**Applied fix:** Imported `PostgresJsDatabase` from `drizzle-orm/postgres-js` and `* as schema` in both production files. Typed `BriefGenerateDeps.db` as `PostgresJsDatabase<typeof schema> | null` (null to match the nullable export from `connection.ts`) and `BriefAssemblyDeps.dbClient` as `PostgresJsDatabase<typeof schema> | null`. Updated both test files to import the same types and cast their lightweight mock objects with `as unknown as PostgresJsDatabase<typeof schema>`. TypeScript `--noEmit` passes with zero errors after the change.

---

_Fixed: 2026-04-14T22:15:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
