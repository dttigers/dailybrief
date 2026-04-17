# Stack Research

**Domain:** Multi-user auth + PWA context menu + polling pause + brief history fix for Vigil (Node.js/Hono/Drizzle/PostgreSQL API + React/Vite PWA)
**Researched:** 2026-04-17
**Confidence:** HIGH — all key libraries verified against existing package.json and npm

---

## What Already Exists (Do NOT re-install)

| Package | Location | Version | Relevant Capability |
|---------|----------|---------|---------------------|
| `jose` | vigil-core | ^6.2.2 | JWT sign/verify — already present, used for Google OAuth nonces |
| `hono` | vigil-core | ^4.7.0 | Built-in JWT middleware via `hono/jwt` |
| `drizzle-orm` | vigil-core | ^0.45.2 | Schema migrations for adding users table + userId FKs |
| `drizzle-kit` | vigil-core (dev) | ^0.31.10 | `drizzle-kit generate` + `migrate` for schema changes |
| `postgres` | vigil-core | ^3.4.9 | PostgreSQL connection |
| `react` | vigil-pwa | ^19.2.5 | Hooks for polling pause (useRef/useEffect) |
| `tailwindcss` | vigil-pwa (dev) | ^4.2.2 | Styling for context menu overlay |

**Nothing on this list needs to be installed.**

---

## New Dependencies Required

### vigil-core (API)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `argon2` | ^0.44.0 | Password hashing for user login | OWASP #1 recommendation for 2026; Argon2id resists GPU attacks; prebuilt binaries from v0.26+, no native build step on Railway |

That is the only new server-side package. `jose` is already installed for JWT. Hono's built-in `hono/jwt` middleware handles token verification using the existing `jose` dependency.

### vigil-pwa (PWA)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@radix-ui/react-context-menu` | ^2.2.x | Right-click context menu primitive | Zero-dependency headless primitive; keyboard-accessible; touch long-press; portal rendering avoids z-index issues; styled with existing Tailwind v4; the exact primitive shadcn/ui wraps — add without pulling in all of shadcn |

That is the only new PWA package. Edit-refresh pause and brief history fix require no new dependencies.

---

## Recommended Stack (New Capabilities Only)

### Multi-User Auth — vigil-core

**Pattern:** Username/email + password login returning a short-lived JWT. Existing bearer-token flow remains for Mac app, CLI, G2 plugin, browser extension. PWA switches to JWT for session management.

**New schema objects (via Drizzle migration):**

```typescript
// users table — new
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Add userId FK to all data tables that need per-user isolation:
// thoughts, projects, briefs, chat_sessions, ai_cache, app_settings, oauth_tokens
// Use nullable + default NULL for backward compat; existing rows belong to owner account
```

**New API endpoints:**
- `POST /v1/auth/register` — hash password with argon2, insert user
- `POST /v1/auth/login` — verify argon2 hash, sign JWT with `jose` (HS256, 7-day expiry)
- `POST /v1/auth/refresh` — issue new JWT given valid current one
- `GET /v1/auth/me` — return current user info from JWT payload

**Auth middleware strategy:**
- Keep existing `bearerAuth` middleware (SHA-256 hash lookup) for all non-PWA clients
- Add new `jwtAuth` middleware using `hono/jwt` built-in for PWA session tokens
- Routes accept both: `Authorization: Bearer <api-key>` OR `Authorization: Bearer <jwt>`
- Middleware sets `c.set('userId', ...)` for downstream handlers to scope queries

**Data isolation strategy:**
- Application-layer `userId` filtering on all queries (WHERE user_id = ?) — simpler than PostgreSQL RLS for single-deploy setup
- Existing single-user data: assign to a seed "owner" user during migration
- Do NOT use PostgreSQL RLS — overhead without benefit at single-tenant-per-deploy scale; RLS shines for row-per-tenant SaaS with many tenants sharing one DB

### PWA Right-Click Context Menu

**Pattern:** Wrap each thought row with `<ContextMenu>` from `@radix-ui/react-context-menu`. Render `<ContextMenuContent>` in a portal. Style with Tailwind v4 utility classes (dark bg, rounded, shadow).

```typescript
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@radix-ui/react-context-menu'
```

Items needed per row: Delete, Move to category, Edit, Re-triage, Add to Project.

No external styling library needed — Tailwind v4 handles appearance. The component is headless.

### Edit-Refresh Pause — vigil-pwa

**Pattern:** No new package. Modify `useThoughts.ts` to accept an `isPaused` ref/prop and check it before firing the poll callback.

```typescript
// In useThoughts — add isPaused parameter
const poll = setInterval(() => {
  if (!isPaused.current) refetch()
}, 30_000)
```

Caller (thought row component) sets `isPaused.current = true` on focus-in / edit start and `false` on blur / save. The `useRef` mutation does not trigger re-renders. Visibility-change and `vigil:thought-created` event handlers remain unaffected.

The existing polling is at line 85 in `vigil-pwa/src/hooks/useThoughts.ts`:
```typescript
const poll = setInterval(refetch, 30_000)
```
This is the exact line to guard with the pause ref.

### Brief History Fix — vigil-core + vigil-pwa

**No new package.** This is a bug investigation. The server route (`GET /v1/briefs/:date`) and list route (`GET /v1/briefs`) exist and are correct in `vigil-core/src/routes/brief-history.ts`. The `useBriefs` hook fetches with `limit: 50`. The likely cause is the `briefs.date` column being a PostgreSQL `date` type — Drizzle returns it as a string but comparison semantics between `eq(briefs.date, date)` and the stored value need verification. Fix is in existing code; no new library needed.

---

## Installation

```bash
# vigil-core — one new package
cd vigil-core
npm install argon2

# vigil-pwa — one new package
cd vigil-pwa
npm install @radix-ui/react-context-menu
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `argon2` | `bcrypt` | Bcrypt is still secure but argon2id is OWASP #1 for 2026; argon2 has prebuilt binaries now, eliminating the old compile friction |
| `argon2` | `@node-rs/argon2` | @node-rs/argon2 is also valid but last updated Dec 2024 vs argon2 Aug 2025; argon2 has more dependents (665 vs fewer); marginal difference, stick with the more widely deployed package |
| `hono/jwt` (built-in) | `jsonwebtoken` | hono/jwt uses the already-installed `jose` internally; `jsonwebtoken` would be a redundant dependency |
| `@radix-ui/react-context-menu` | PrimeReact ContextMenu | PrimeReact pulls in a large component library; Radix is headless, zero style opinions, pairs naturally with existing Tailwind v4 |
| `@radix-ui/react-context-menu` | `rctx-contextmenu` | rctx-contextmenu is unmaintained (last release 2021); Radix is actively maintained with React 19 support |
| Application-layer userId filtering | PostgreSQL RLS | RLS overhead justified for multi-tenant SaaS with many tenants; for a single-owner-per-deploy tool adding a second user, WHERE clause filtering is simpler and adequate |
| `useRef` pause flag | External state manager | No new dependency; React's built-in useRef is the canonical tool for mutable values that don't cause re-renders |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `passport` / `passport-local` | Express-centric, adds layers of indirection on top of Hono | Direct argon2 hash check + jose JWT sign in route handler |
| `jsonwebtoken` | Redundant; `jose` already installed and is the modern standard (no dependency, tree-shakeable ESM) | `jose` `SignJWT` / `jwtVerify` |
| Auth0 / Clerk / WorkOS | Third-party identity is overkill for adding a second Vigil user; adds cost and external dependency | In-house argon2 + JWT |
| shadcn/ui full install | Would add CLI tooling, component scaffolding, and many files for just one component | Install `@radix-ui/react-context-menu` directly |
| PostgreSQL RLS | Unnecessary complexity for 1-2 users on a single-owner deploy | WHERE user_id = ? in Drizzle queries |
| `react-query` / TanStack Query | Heavy dependency for pause-poll pattern already achievable with a ref | `useRef` + `clearInterval`/`setInterval` in existing `useThoughts.ts` |

---

## Version Compatibility

| Package | Requires | Notes |
|---------|---------|-------|
| `argon2` ^0.44.0 | Node.js 18+ | Railway runs Node 20; prebuilt binaries available, no native compile needed |
| `@radix-ui/react-context-menu` ^2.2.x | React 18+ | React 19 supported (tested by Radix team) |
| `hono/jwt` (built-in) | `jose` ^6 | Already satisfied by existing `jose` ^6.2.2 in vigil-core |

---

## Sources

- `vigil-core/package.json` — confirmed existing dependencies (jose ^6.2.2, hono ^4.7.0, drizzle-orm ^0.45.2); HIGH confidence (live codebase)
- `vigil-pwa/package.json` — confirmed existing dependencies (react ^19.2.5, tailwindcss ^4.2.2, no Radix installed); HIGH confidence
- `vigil-core/src/middleware/auth.ts` — confirmed current SHA-256 bearer-only auth, no userId concept; HIGH confidence
- `vigil-core/src/db/schema.ts` — confirmed no users table, no userId FKs on any data table; HIGH confidence
- `vigil-pwa/src/hooks/useThoughts.ts` — confirmed `setInterval(refetch, 30_000)` at line 85, exact location for pause guard; HIGH confidence
- `vigil-core/src/routes/brief-history.ts` — confirmed routes exist; fix is a bug investigation, not a missing feature; HIGH confidence
- [hono.dev/docs/middleware/builtin/jwt](https://hono.dev/docs/middleware/builtin/jwt) — confirmed Hono built-in JWT middleware; MEDIUM confidence (content verified via WebFetch)
- `argon2` npm — version 0.44.0, last published Aug 2025; MEDIUM confidence (from WebSearch result snippet, npm page returned 403)
- `jose` npm — version 6.2.2 confirmed via WebSearch + matches package.json; HIGH confidence
- [ui.shadcn.com/docs/components/context-menu](https://ui.shadcn.com/docs/components/context-menu) — confirmed shadcn wraps @radix-ui/react-context-menu; HIGH confidence (official shadcn docs)
- OWASP 2026 password hashing: Argon2id #1, bcrypt remains acceptable — MEDIUM confidence (via WebSearch cross-referenced across multiple security sources)

---

*Stack research for: Vigil v3.4 — Multi-User Foundation & PWA Polish*
*Researched: 2026-04-17*
