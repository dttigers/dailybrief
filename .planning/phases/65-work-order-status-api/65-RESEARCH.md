# Phase 65: work-order-status-api — Research

**Researched:** 2026-04-12
**Domain:** Hono/Drizzle/PostgreSQL backend API + Swift CLI migration from local file store
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WO-02 | User can mark a work order as complete, in-progress, or reopen it from the dashboard, and the change persists so it doesn't reprint | New `work_order_statuses` table + `PUT /v1/work-orders/:caseNumber/status` endpoint; PWA calls it |
| WO-03 | Work order status changes from the PWA are reflected in the next daily brief PDF | CLI replaces `CompletionStore.status()` calls with `GET /v1/work-orders/statuses` API call via existing `VigilAPIClient` |

</phase_requirements>

---

## Summary

Phase 65 bridges the gap between the PWA dashboard (added in Phase 63-64) and the CLI's local-file work order status system. Today the CLI writes to `~/.config/dailybrief/completed_workorders.json` via `CompletionStore.swift` and reads back from it when filtering the brief. The PWA has no way to touch that file — it only reaches the Vigil Core API.

The work for this phase is two-sided. On the backend, a new `work_order_statuses` table stores `{ case_number, status, updated_at }` keyed by case number string. A new Hono route file (`work-order-status.ts`) exposes `PUT /v1/work-orders/:caseNumber/status` (set/upsert status) and `GET /v1/work-orders/statuses` (fetch all, for the CLI). On the CLI side, `DailyBrief.swift` replaces its two `CompletionStore` call sites (status fetch loop at line 177 and open-filter at line 181) with an async API call to `GET /v1/work-orders/statuses`. The `Complete`, `Uncomplete`, and `ListCompleted` subcommands also need updating to call the API rather than the local file — but this can be done as a second task or can fall back to warning the user.

**Primary recommendation:** Add a purpose-built `work_order_statuses` table (not repurposing the thoughts table). The key is the ServiceNow case number string (e.g., `CS0353598`). Use upsert (`INSERT ... ON CONFLICT DO UPDATE`) to keep the route stateless. Migrate the 4 existing local records as a Wave 0 data-seeding task.

---

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `~/.config/dailybrief/completed_workorders.json` — 4 records: `CS0353598`, `CS0355778`, `CS0354176`, `CS0354992`, all status `done` [VERIFIED: cat ~/.config/dailybrief/completed_workorders.json] | Seed these 4 records into the new `work_order_statuses` DB table during Wave 0 |
| Live service config | None — vigil-core has no existing work order table or route | None |
| OS-registered state | None — CompletionStore is a file read/write, not OS-registered | None |
| Secrets/env vars | None — no new secrets needed; existing `DATABASE_URL` and API key cover it | None |
| Build artifacts | None | None |

**Critical:** The 4 existing completed case numbers must be seeded into the DB before the CLI migration lands, otherwise those work orders will reprint on the next brief run.

---

## Standard Stack

### Core (verified from codebase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | existing in vigil-core | HTTP routing for new endpoint | Already the API framework — `[VERIFIED: vigil-core/src/index.ts]` |
| Drizzle ORM | existing in vigil-core | Schema definition + query builder | Project ORM — all existing tables use it `[VERIFIED: vigil-core/src/db/schema.ts]` |
| drizzle-kit | existing in vigil-core | Migration generation (`db:generate`) | Project migration tool `[VERIFIED: vigil-core/package.json scripts]` |
| PostgreSQL | Railway-hosted | Persistent storage for statuses | Existing project DB `[VERIFIED: vigil-core/drizzle.config.ts]` |
| VigilAPIClient (Swift) | existing in JarvisCore | HTTP calls from CLI to API | Already used for thoughts, prioritize, briefs `[VERIFIED: Sources/JarvisCore/Services/VigilAPIClient.swift]` |

### No New Dependencies Required

Both sides of this phase use existing infrastructure. The backend adds a new route file and schema table — no new npm packages. The CLI adds an API call using the already-present `VigilAPIClient` actor.

---

## Architecture Patterns

### Recommended Project Structure (backend additions)

```
vigil-core/src/
├── routes/
│   └── work-order-status.ts   # NEW: PUT /:caseNumber/status, GET /statuses
├── db/
│   └── schema.ts              # ADD: workOrderStatuses table
drizzle/
└── 0004_work_order_statuses.sql  # NEW: generated migration
```

### Pattern 1: Hono Route File (mirrors projects.ts)

**What:** Each resource gets its own Hono instance file, imported and mounted in `index.ts`.
**When to use:** Any new REST resource — the established pattern in this codebase.

```typescript
// vigil-core/src/routes/work-order-status.ts
// Source: [VERIFIED: vigil-core/src/routes/projects.ts pattern]

import { Hono } from "hono";
import { db } from "../db/connection.js";
import { workOrderStatuses } from "../db/schema.js";
import { eq } from "drizzle-orm";

const VALID_STATUSES = ["open", "inProgress", "done"] as const;

export const workOrderStatus = new Hono();

// PUT /work-orders/:caseNumber/status — upsert status
workOrderStatus.put("/work-orders/:caseNumber/status", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);
  const caseNumber = c.req.param("caseNumber");
  const body = await c.req.json();
  const { status } = body;

  if (!VALID_STATUSES.includes(status)) {
    return c.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, 400);
  }

  await db
    .insert(workOrderStatuses)
    .values({ caseNumber, status })
    .onConflictDoUpdate({
      target: workOrderStatuses.caseNumber,
      set: { status, updatedAt: new Date() },
    });

  return c.json({ caseNumber, status });
});

// GET /work-orders/statuses — fetch all (used by CLI brief generator)
workOrderStatus.get("/work-orders/statuses", async (c) => {
  if (!db) return c.json({ error: "Database not available" }, 503);
  const rows = await db.select().from(workOrderStatuses);
  // Return as { caseNumber: status } map (matches CompletionStore.load() shape)
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.caseNumber] = row.status;
  }
  return c.json(result);
});
```

### Pattern 2: Drizzle Schema Table + Upsert

**What:** New table with case number as unique key, upsert on conflict.
**When to use:** When the primary key is a natural string key (case number), not a serial ID.

```typescript
// vigil-core/src/db/schema.ts — ADD:
// Source: [VERIFIED: existing schema pattern, schema.ts lines 1-135]

export const workOrderStatuses = pgTable(
  "work_order_statuses",
  {
    caseNumber: text("case_number").primaryKey(),
    status: text("status").notNull().default("open"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);
```

### Pattern 3: CLI API Fetch (replaces CompletionStore reads)

**What:** Swift async call to `GET /v1/work-orders/statuses` replacing local file reads.
**When to use:** In `DailyBrief.Generate.run()` where `CompletionStore.status(for:)` is called.

```swift
// Sources/DailyBrief/DailyBrief.swift — modify Generate.run()
// Source: [VERIFIED: DailyBrief.swift lines 174-185, VigilAPIClient.swift]

// Replace lines 175-185 with:
var woStatuses: [String: String] = [:]
do {
    // GET /v1/work-orders/statuses returns { "CS0353598": "done", ... }
    woStatuses = try await apiClient.get(path: "/work-orders/statuses")
} catch {
    Logger.error("WO status fetch failed, falling back to local store: \(error.localizedDescription)")
    // Fallback: read from CompletionStore so brief still generates if API is down
    for wo in allWorkOrders {
        woStatuses[wo.caseNumber] = CompletionStore.status(for: wo.caseNumber).rawValue
    }
}

let openWorkOrders = allWorkOrders.filter {
    (woStatuses[$0.caseNumber] ?? "open") != "done"
}
```

### Pattern 4: Route Registration in index.ts

```typescript
// vigil-core/src/index.ts — ADD:
// Source: [VERIFIED: vigil-core/src/index.ts pattern, lines 1-88]

import { workOrderStatus } from "./routes/work-order-status.js";
// ...
app.route("/v1", workOrderStatus);
```

### Anti-Patterns to Avoid

- **Don't use serial `id` as primary key for this table:** Case numbers are the natural unique key. A serial id adds no value and complicates upsert logic.
- **Don't add work order content to this table:** This table is status-only. Work order content (store, trade, description, etc.) continues to be fetched from IMAP. The API is a status overlay, not a work order store.
- **Don't filter `done` work orders before returning from GET /statuses:** Return all statuses. The CLI decides which to filter. This gives the PWA (Phase 66) access to in-progress and done orders too.
- **Don't make the CLI hard-fail if the API is unreachable:** Add a `CompletionStore` fallback in the CLI so a network error doesn't break the morning brief.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Upsert logic | Manual SELECT + INSERT/UPDATE | Drizzle `.onConflictDoUpdate()` | Race condition safe, single round-trip `[VERIFIED: Drizzle docs pattern]` |
| HTTP client in CLI | New URLSession code | Existing `VigilAPIClient.get()` | It handles auth, decoding, error wrapping already `[VERIFIED: VigilAPIClient.swift]` |
| Migration generation | Hand-write SQL | `npm run db:generate` in vigil-core | Drizzle-kit generates correct `ALTER TABLE` / `CREATE TABLE` SQL `[VERIFIED: package.json scripts]` |

---

## Common Pitfalls

### Pitfall 1: CompletionStore fallback missing
**What goes wrong:** CLI brief generation fails entirely when vigil-core is unreachable (launchd restart, network blip).
**Why it happens:** `apiClient.get()` throws on network error — without a catch, the whole `Generate.run()` throws and no PDF is produced.
**How to avoid:** Wrap the status fetch in a `do/catch` that falls back to `CompletionStore.load()`.
**Warning signs:** Brief fails during API downtime.

### Pitfall 2: Forgetting to seed existing local records
**What goes wrong:** The 4 case numbers currently in `completed_workorders.json` (`CS0353598`, `CS0355778`, `CS0354176`, `CS0354992`) don't exist in the DB after migration. On the next brief run, they appear as `open` and reprint.
**Why it happens:** The DB migration creates an empty table.
**How to avoid:** Wave 0 task: insert these 4 records into `work_order_statuses` with status `done` as a one-time seed.

### Pitfall 3: Route ordering conflict with PUT /work-orders/:caseNumber/status and GET /work-orders/statuses
**What goes wrong:** Hono might try to match `GET /work-orders/statuses` as a `:caseNumber` param route if PUT and GET share the same path prefix incorrectly.
**Why it happens:** Path parameter routes are greedy if the literal route is registered after.
**How to avoid:** Register `GET /work-orders/statuses` before `PUT /work-orders/:caseNumber/status` in the route file (literal before param), or use distinct sub-paths. The recommended shape above (`/statuses` vs `/:caseNumber/status`) avoids this entirely.

### Pitfall 4: CLI `Complete` / `Uncomplete` subcommands still writing to local file
**What goes wrong:** User runs `dailybrief complete CS0353599` from terminal, it writes locally, but the PWA can't see it.
**Why it happens:** These subcommands directly call `CompletionStore.setStatus()`.
**How to avoid:** Update `Complete` and `Uncomplete` to call `PUT /v1/work-orders/:caseNumber/status` via `VigilAPIClient`. They need to become `AsyncParsableCommand`. `ListCompleted` should call `GET /v1/work-orders/statuses` and filter for `done`.

---

## Code Examples

### Migration SQL (expected output of `db:generate`)

```sql
-- drizzle/0004_work_order_statuses.sql (generated)
CREATE TABLE "work_order_statuses" (
  "case_number" text PRIMARY KEY NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

### Seed Existing Local Records (one-time, Wave 0)

```sql
-- Run via psql or drizzle seed script
INSERT INTO work_order_statuses (case_number, status) VALUES
  ('CS0353598', 'done'),
  ('CS0355778', 'done'),
  ('CS0354176', 'done'),
  ('CS0354992', 'done')
ON CONFLICT (case_number) DO NOTHING;
```

### PWA status update call (pattern for Phase 66)

```typescript
// vigil-pwa/src/api/client.ts — ADD (preview for Phase 66, not in scope here)
export async function setWorkOrderStatus(caseNumber: string, status: 'open' | 'inProgress' | 'done') {
  const res = await vigilFetch(`/v1/work-orders/${caseNumber}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
  if (!res.ok) throw new Error(`Status update failed: ${res.status}`)
  return res.json()
}
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node built-in test runner (tsx --test) |
| Config file | none — scripts pattern in package.json |
| Quick run command | `cd vigil-core && npm test -- src/routes/work-order-status.test.ts` |
| Full suite command | `cd vigil-core && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WO-02 | PUT /work-orders/:caseNumber/status upserts correctly | unit (route) | `npm test -- src/routes/work-order-status.test.ts` | No — Wave 0 gap |
| WO-02 | PUT rejects invalid status values | unit (route) | same | No — Wave 0 gap |
| WO-03 | GET /work-orders/statuses returns all records as { caseNumber: status } map | unit (route) | same | No — Wave 0 gap |

### Sampling Rate

- **Per task commit:** `cd vigil-core && npm test -- src/routes/work-order-status.test.ts`
- **Per wave merge:** `cd vigil-core && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `vigil-core/src/routes/work-order-status.test.ts` — covers WO-02, WO-03 route behavior

*(No new test infra needed — `process-photo.test.ts` confirms the framework is already wired.)*

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL (Railway) | work_order_statuses table | Already live | v15 (Railway-managed) | None needed |
| vigil-core local dev | Backend development | `[ASSUMED]` — daemon present per MEMORY.md | Node | npm run dev after `launchctl bootout` |
| Swift toolchain | CLI changes | `[ASSUMED]` — existing build works | Swift 5.9+ | None needed |

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Bearer auth middleware already on all /v1/* routes `[VERIFIED: vigil-core/src/index.ts line 60]` |
| V4 Access Control | yes | Single-user system — bearer auth is sufficient |
| V5 Input Validation | yes | Validate `status` against allowlist `["open","inProgress","done"]` before DB write |
| V6 Cryptography | no | No new crypto surface |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Status injection (arbitrary string) | Tampering | Allowlist validation before INSERT |
| Mass-assignment (extra body fields) | Tampering | Destructure only `{ status }` from request body |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | vigil-core launchd daemon is currently unloaded on iMac (per MEMORY.md), so local dev requires `launchctl bootout` before `npm run dev` | Environment Availability | If daemon is loaded, dev server port conflict |
| A2 | Swift CLI can reach the production API (`api.vigilhub.io`) or local dev server for the brief run | Environment Availability | Brief falls back to CompletionStore (low risk with fallback pattern) |

---

## Open Questions

1. **Should `Complete` / `Uncomplete` subcommands be migrated to API calls in this phase or Phase 66?**
   - What we know: They currently write to `completed_workorders.json` only. The brief generator is the higher-priority migration (WO-03).
   - What's unclear: Whether the user uses these CLI subcommands regularly or only via the upcoming PWA.
   - Recommendation: Include CLI subcommand migration in this phase — it's 3 trivial command updates and keeps CompletionStore fully deprecated in one phase.

2. **Does `GET /work-orders/statuses` need pagination?**
   - What we know: Work orders are IMAP-fetched with a 20-email max per run. Accumulated status records could grow over time.
   - Recommendation: No pagination for now. The map is consumed in full by the CLI. Add `?limit` later if needed.

---

## Sources

### Primary (HIGH confidence)
- `[VERIFIED: Sources/DailyBrief/Services/CompletionStore.swift]` — full store implementation, JSON format, status enum
- `[VERIFIED: Sources/DailyBrief/DailyBrief.swift lines 174-185]` — exact call sites being replaced
- `[VERIFIED: vigil-core/src/db/schema.ts]` — no existing work_order table; confirms new table needed
- `[VERIFIED: vigil-core/src/routes/projects.ts]` — reference pattern for Hono route files
- `[VERIFIED: vigil-core/src/index.ts]` — route registration pattern and auth middleware
- `[VERIFIED: vigil-core/src/db/types.ts]` — existing type patterns
- `[VERIFIED: Sources/JarvisCore/Services/VigilAPIClient.swift]` — available methods: get, post, put, patch, delete
- `[VERIFIED: vigil-pwa/src/api/client.ts]` — PWA API client pattern for Phase 66 consumers
- `[VERIFIED: ~/.config/dailybrief/completed_workorders.json]` — 4 existing records to seed

### Secondary (MEDIUM confidence)
- Drizzle `onConflictDoUpdate` upsert pattern — `[ASSUMED]` standard Drizzle-ORM PostgreSQL feature, consistent with codebase's Drizzle version

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all verified from existing codebase files
- Architecture: HIGH — pattern directly mirrors projects.ts / thoughts.ts
- Pitfalls: HIGH — derived from reading actual call sites in DailyBrief.swift
- Runtime state: HIGH — verified live file content

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable domain — Hono/Drizzle/Swift patterns don't change rapidly)
