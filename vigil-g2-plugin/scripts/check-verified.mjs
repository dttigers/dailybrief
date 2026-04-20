#!/usr/bin/env node
// check-verified.mjs — atomic-gate staleness check for Phase 106 G2 store resubmit.
// Invoked by `npm run package:ehpk`. Exits 1 if VERIFIED.md is missing or stale (>24h).
// ISO-timestamp-based per RESEARCH Pitfall 6 (mtime is unreliable across `git checkout`).

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const VERIFIED_PATH = resolve(
  __dirname,
  '..',
  '..',
  '.planning',
  'phases',
  '106-g2-store-resubmit-atomic',
  'VERIFIED.md',
)
const MAX_AGE_MS = 24 * 60 * 60 * 1000

if (!existsSync(VERIFIED_PATH)) {
  console.error(`[package:ehpk] VERIFIED.md not found at: ${VERIFIED_PATH}`)
  console.error('[package:ehpk] Run a full simulator verification session before packaging.')
  process.exit(1)
}

const content = readFileSync(VERIFIED_PATH, 'utf-8')
const match = content.match(/^Verified:\s*(\S+)/m)
if (!match) {
  console.error('[package:ehpk] VERIFIED.md missing a "Verified: <ISO 8601>" line.')
  console.error('[package:ehpk] Example line: `Verified: 2026-04-19T18:23:00-07:00`')
  process.exit(1)
}

const verifiedAt = Date.parse(match[1])
if (Number.isNaN(verifiedAt)) {
  console.error(`[package:ehpk] Unparseable timestamp in VERIFIED.md: "${match[1]}"`)
  process.exit(1)
}

const ageMs = Date.now() - verifiedAt
if (ageMs > MAX_AGE_MS) {
  const hours = Math.round(ageMs / 36e5)
  console.error(`[package:ehpk] VERIFIED.md is ${hours}h old (max 24h). Re-run simulator verification.`)
  process.exit(1)
}

console.log(`[package:ehpk] VERIFIED.md fresh (${Math.round(ageMs / 6e4)}m old). Proceeding.`)
