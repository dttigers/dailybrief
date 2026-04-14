# Project Research Summary

**Project:** Vigil v3.0 — Server-Side PDF Brief Generation
**Domain:** Server-side PDF generation, sports API proxy, Google Calendar OAuth, email delivery (Node.js/Hono/Railway)
**Researched:** 2026-04-12
**Confidence:** HIGH

## Executive Summary

Vigil v3.0 moves the daily brief PDF from a Mac-local CoreGraphics process into vigil-core, making it accessible to any client (PWA, Mac CLI, future mobile). The fundamental architecture is a fan-out orchestrator in Hono that concurrently fetches work orders, calendar events, thoughts, sports scores, and an AI affirmation, then renders a PDF and returns the binary. The Mac CLI becomes a thin client: fetch binary, write to disk, call `lpr`.

**The most consequential decision in this milestone is the PDF library. The verdict is PDFKit 0.18 — not Puppeteer.** The Stack researcher cites a documented Railway Help Station thread confirming Chromium launch failures (pthread/D-Bus errors) even on 8GB Railway instances. The Pitfalls researcher independently corroborates this: Puppeteer adds 170MB to the Docker image, risks OOM on Railway's cgroup-enforced memory limits, and adds 1–5s cold-start latency. PDFKit adds ~2MB, streams output directly as a Buffer, and its imperative API maps naturally to the existing `PDFLayout`/CoreGraphics model in the Swift CLI.

## PDF Library Conflict Resolution

**Conflict:** Stack researcher recommends PDFKit. Features and Architecture researchers recommend Puppeteer. Pitfalls researcher flags Puppeteer's OOM and cold-start risks.

**Resolution: PDFKit 0.18. Puppeteer is disqualified.**

| Criterion | PDFKit 0.18 | Puppeteer 24 |
|-----------|-------------|--------------|
| Railway deployment | Works — zero system deps | FAILS — documented pthread/D-Bus launch errors |
| Memory footprint | ~10MB | 200–500MB (Chromium process) |
| Docker image delta | ~2MB | ~170MB |
| Cold start | Instantaneous | 1–5s Chromium init |
| Layout model | Imperative (matches CoreGraphics/PDFLayout) | HTML+CSS (requires template layer) |

## Recommended Stack

- **PDFKit 0.18**: PDF generation — zero system deps, imperative API matches CoreGraphics layout model
- **googleapis 171.4.0**: Google Calendar OAuth2 + event fetch — official client, handles token auto-refresh
- **resend 6.10.0**: Email delivery with PDF attachment — 100/day free tier, single env var
- **node-cron 4.2.1**: Scheduled brief delivery — in-process cron, no Redis needed
- **native fetch (Node 22)**: ESPN API proxy — no additional dep

## Critical Pitfalls

1. **Railway service sleep kills first brief request** — enable "Always On" before deployment
2. **Google OAuth refresh token expiry is silent** — use `access_type: 'offline'` AND `prompt: 'consent'`; publish to Production (Testing tokens expire in 7 days)
3. **ESPN unofficial API breaks between seasons** — try/catch with graceful fallback, 4-hour cache
4. **PDF binary as PostgreSQL bytea** — use `storage_key text` column from day one
5. **Google refresh token stored plaintext** — encrypt before INSERT

## Phase Ordering Rationale

1. **ESPN Proxy** — no dependencies, proves deploy pipeline cheaply
2. **Google Calendar OAuth** — highest complexity, must be isolated and proven
3. **PDF Generation Engine (PDFKit)** — core risk, validate on Railway before full orchestrator
4. **Brief Assembly Endpoint** — wire together proven components with `Promise.allSettled`
5. **Client Integrations** — PWA generate/preview/download + Mac CLI thin client
6. **Email Delivery (P2)** — optional, after core generation is proven

## Gaps to Address

- Railway Buckets availability on current plan tier (fallback: volume mount)
- PDFKit notebook layout measurements — port 270×540pt traveler's notebook from Swift constants
- ESPN off-season behavior — test empty `events` arrays for all 4 sports
- Google OAuth consent screen must be published to "Production" before treating as stable
