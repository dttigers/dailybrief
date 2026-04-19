# Phase 99: Brief History Fix - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 99-brief-history-fix
**Areas discussed:** Storage backend, Existing broken briefs, Retrieval failure UX, Retention policy

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Storage backend | Where PDF bytes persist (Postgres, volume, S3/R2, no storage) — recommended | ✓ |
| Existing broken briefs | What to do with rows pointing at dead /tmp/ paths | ✓ |
| Retrieval failure UX | What PWA shows when a PDF can't load | ✓ |
| Retention policy | How long briefs stay stored | ✓ |

**User's choice:** All four areas selected.

---

## Storage Backend

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres BYTEA | Zero new infra, same backup story, fits ~180MB/year trivially — recommended | ✓ |
| Railway persistent volume | Cheapest change, keep fs code; Railway-specific, single-region | |
| External object storage (S3 / R2) | Most portable; heaviest ops lift for a solo shipper | |
| Regenerate-on-demand, no storage | Zero storage; regen fidelity drifts as thoughts change | |

**User's choice:** Postgres BYTEA.
**Notes:** Drove the follow-up questions on schema shape and /tmp write.

### Follow-up: Schema shape

| Option | Description | Selected |
|--------|-------------|----------|
| Sibling table `brief_pdfs` | Forces isolation from list queries; one JOIN on retrieval — recommended | ✓ |
| New column on `briefs` | One migration, one table; SELECT * risk | |
| You decide | Defer to planning | |

**User's choice:** Sibling table `brief_pdfs`.

### Follow-up: /tmp write

| Option | Description | Selected |
|--------|-------------|----------|
| Remove it — buffer→DB→response | Eliminates ephemeral-fs dependency; deprecate pdfFilename — recommended | ✓ |
| Keep it as a temp cache | Write to both; marginal warm-path speedup for daily-cadence file | |
| You decide | Defer to planning | |

**User's choice:** Remove the /tmp write entirely.

---

## Existing Broken Briefs

| Option | Description | Selected |
|--------|-------------|----------|
| Leave alone, clear "unavailable" state | List stays populated; detail click shows distinct pre-fix message — recommended | ✓ |
| Best-effort regenerate from historical thoughts | Rebuilds from current thought state; misleading for therapy-style data | |
| Backfill pass at deploy | Check /tmp one last time on current container; unlikely to recover much | |
| Delete pre-fix rows entirely | Clean slate; loses summary + counts metadata | |

**User's choice:** Leave alone, show clear "unavailable" state.
**Notes:** Honest about what's recoverable; metadata (summary JSON, counts) stays accurate.

---

## Retrieval Failure UX

| Option | Description | Selected |
|--------|-------------|----------|
| Clear message + Regenerate button | Explicit; user controls the action; matches current mental model — recommended | ✓ |
| Silent auto-regenerate on click | Hides failure but 5–30s spinner; historical regen uses today's thoughts (wrong) | |
| Show summary JSON as text fallback | Some historical context; still needs regen path | |
| Empty state, disable click | Cleanest visually; removes user agency | |

**User's choice:** Clear message + Regenerate button.
**Notes:** Need API response to distinguish pre-fix vs genuinely-missing so PWA can word the message appropriately.

---

## Retention Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Forever — no pruning | ~360MB/year; simple; defer to future if ever constrained — recommended | ✓ |
| Rolling 1 year of PDFs | Caps growth at ~360MB | |
| Rolling 90 days of PDFs | ~90MB ceiling; aggressive | |
| Manual cleanup only | Defer entirely, add a settings button later | |

**User's choice:** Forever.
**Notes:** Metadata row preserved regardless if future pruning is ever introduced.

---

## Claude's Discretion

- Drizzle migration split (one vs two steps to deprecate `pdfFilename` + add `brief_pdfs`)
- Whether `POST /brief/generate` keeps inline PDF response or splits into reference + fetch
- Test strategy for BYTEA roundtrip (pragmatic integration vs heavy mocking)
- Exact PWA failure-message copy (keep "not stored / regenerate" framing)

## Deferred Ideas

- Retention/pruning policies — not this phase
- External object storage (S3/R2/Blob) — not at current scale
- Backfill pass of /tmp on first deploy — explicitly rejected
- Summary JSON text fallback view — nice-to-have, not this phase
