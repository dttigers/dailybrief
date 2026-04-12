---
phase: 63
name: pwa-foundation
created: 2026-04-12
decisions: 4
deferred: 0
---

# Phase 63: PWA Foundation — Context

## Phase Goal

Users can access the Vigil dashboard at app.vigilhub.io from any browser, authenticate with their API key, and get a responsive shell with offline indicator.

## Requirements

- PWA-01: User can access app.vigilhub.io and authenticate with Vigil API key
- PWA-02: Responsive on phone, tablet, and desktop
- PWA-03: Installable as standalone app via "Add to Home Screen"
- PWA-04: Offline indicator when network unavailable

## Decisions

### D-01: React + Vite + TypeScript

Use React (not Preact, not vanilla) with Vite as the build tool and TypeScript throughout. React was chosen for ecosystem breadth, Claude code generation quality, and component model suitability for a multi-view dashboard (thoughts, work orders, projects).

### D-02: Vercel deployment at app.vigilhub.io

Deploy the PWA as a separate Vercel project pointing to the `vigil-pwa/` subdirectory. Free tier, CDN-distributed, automatic git deploys. API stays on Railway at api.vigilhub.io. CORS is already configured on vigil-core.

**DNS:** app.vigilhub.io CNAME to Vercel. Configured in the same DNS provider as api.vigilhub.io.

### D-03: API key paste + localStorage auth

First visit shows a simple text field: "Enter your Vigil API key". Key stored in localStorage. No session management, no OAuth, no cookies. Single-user model — matches Mac app and G2 plugin patterns.

The PWA validates the key by calling `GET /v1/health` (or any authenticated endpoint) and showing an error if it fails.

### D-04: `vigil-pwa/` directory at repo root

New directory alongside `vigil-core/`, `Sources/`, etc. Contains its own `package.json`, `vite.config.ts`, `tsconfig.json`. Vercel Root Directory set to `vigil-pwa/`.

Structure:
```
vigil-pwa/
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  public/
    manifest.json      # PWA manifest (name, icons, display: standalone)
    sw.js              # Service worker (offline indicator, cache shell)
  src/
    main.tsx
    App.tsx
    api/               # Vigil API client wrapper
    components/        # Shared UI components
    pages/             # Route-level views (placeholder for Phase 64+)
```

## Existing Assets

- `vigil-core/` — API server on Railway at api.vigilhub.io, bearer auth, CORS configured
- G2 plugin (`vigil-g2-plugin/`) — Vite/TypeScript web app, can reference for Vite config patterns
- All API endpoints documented in vigil-core route files

## Key Constraints

- CORS: vigil-core already has CORS middleware. May need to add `app.vigilhub.io` to allowed origins if not using wildcard.
- Vercel free tier: 100GB bandwidth/month, 6000 build minutes/month — more than enough for single-user
- Service worker: keep minimal for v2.5 — just offline detection and shell caching, not full offline data access
