---
phase: 106
slug: g2-store-resubmit-atomic
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-06
---

# Phase 106 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> State B retroactive audit run on 2026-05-06 against 5 PLAN.md threat models + tonight's hardware UAT evidence.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| dev machine → git repo | Local dev commits travel to `origin`; any secret in a committed file leaks publicly | source code, planning docs, test assets — no production secrets |
| dev machine → Even Hub | `evenhub` CLI reads local credentials to upload `.ehpk`; credentials live in `~/.config/evenhub/` and must never enter the repo | vendor auth tokens (local only) |
| Even Hub host → plugin | Host dispatches `OsEventTypeList` events via `onEvenHubEvent`; plugin trusts event payloads (int enums, no validation needed) | gesture events (CLICK, DOUBLE_CLICK, SCROLL_*) |
| Plugin → Even Hub bridge | `shutDownPageContainer(1)` returns host control; plugin trusts host to render exit-confirm dialog correctly | exit-flow control transfer |
| API server → plugin | Plugin consumes `VigilBrief`/`VigilSummary`/`VigilAffirmation`; API-layer (`api.ts EMPTY_*`) and screen-layer fallbacks both sanitize empty shapes | task content, summaries, affirmations |
| Plugin → glasses host | Host enforces 12-container budget; exceeding returns oversize result code | container metadata (no payload) |
| Build-time env → client bundle | `import.meta.env.VITE_*` statically inlined by Vite; only path for demo data to reach prod is `VITE_SCREENSHOT_MODE` set in `.env.production` at build time | feature-flag env vars (build-time only) |
| Local `.env.screenshot` → git repo | File MUST be gitignored to prevent committing flag-on state | feature-flag env file |
| Even simulator → local `.png` files | Screenshots are trusted local artifacts; user uploads manually per D-09/D-14 | store-listing assets (deterministic demo content only) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-106-01-01 | Information Disclosure | `~/.config/evenhub/` credentials potentially committed | mitigate | VERIFIED.md `## Security Reminder (T8-leak-2)` line; `git log --diff-filter=A --name-only` shows no `evenhub/` paths in commit history | closed |
| T-106-01-02 | Tampering (self-inflicted) | VERIFIED.md timestamp backdated to bypass 24h gate | accept | Discipline gate, not security boundary. Stale-gate negative test verified live (40h backdate → exit 1) but the gate is self-discipline, not crypto. | closed |
| T-106-01-03 | Information Disclosure | `.ehpk` artifact accidentally committed | mitigate | `vigil-g2-plugin/.gitignore:27` contains `*.ehpk`. Verified by `git check-ignore` on `vigil.ehpk` (returned the rule). | closed |
| T-106-02-01 | Denial of Service | Stacked `shutDownPageContainer(1)` calls from rapid double-taps | accept | Host owns dialog dedup. Plugin fires-and-forgets via `void`. User-on-own-device. | closed |
| T-106-02-02 | Tampering (sim divergence) | `shutDownPageContainer(1)` Promise resolves differently sim vs hw | mitigate | `navigation.ts:127` uses `void bridge.shutDownPageContainer(1)` (fire-and-forget). Hardware UAT confirmed dialog fires per user observation. | closed |
| T-106-02-03 | Information Disclosure | Custom dialog could leak task content | mitigate | D-01 enforced — plugin renders no custom confirmation UI; host-native dialog only. Source review: no `rebuildPageContainer` call in DOUBLE_CLICK path on home. | closed |
| T-106-03-01 | Denial of Service | Adding border containers exceeds 12-container budget | mitigate | `borderWidth: 1` applied to EXISTING body containers; `ContainerId` enum still has 12 entries (grep `src/constants.ts` confirms). | closed |
| T-106-03-02 | Information Disclosure | Fallback strings could leak data shape | mitigate | All 3 fallback strings static — `"No work orders open. Capture one when it finds you."`, `"Brief unavailable. Retry when you're ready."`, `"Task not found. Swipe to return."`. No user ID / email / tenant interpolation. | closed |
| T-106-03-03 | Tampering | Screenshots show user-identifying data | mitigate | Demo data scope confined to api.ts via `VITE_SCREENSHOT_MODE`. Plan 03 renders whatever shape API returns — no user data enters Plan 03's scope. | closed |
| T-106-04-01 (= RESEARCH T8-leak-1) | Information Disclosure | Demo data leaks to production `.ehpk` via `VITE_SCREENSHOT_MODE` in `.env.production` | mitigate | `.env.production` audit (UAT Test 5): no `VITE_SCREENSHOT_MODE`. Production bundle dead-code-elimination verified (UAT Test 5): zero demo strings (PR-4827, Q2 OKRs, plumber, "exactly where you need" all absent from prod bundle). | closed |
| T-106-04-02 | Information Disclosure | `.env.screenshot` accidentally committed | mitigate | `vigil-g2-plugin/.gitignore` contains `.env.screenshot`. Git history shows only `.env.screenshot.example` ever added. | closed |
| T-106-04-03 | Tampering | Future dev toggles `VITE_SCREENSHOT_MODE` in `.env.production` | accept | Documented in `.env.screenshot.example` header: `SECURITY — DO NOT set VITE_SCREENSHOT_MODE in .env.production`. Pre-pack acceptance criterion in Plan 05 re-verifies before every pack. | closed |
| T-106-05-01 (= RESEARCH T8-leak-1) | Information Disclosure | Final `.ehpk` ships demo data | mitigate | Same evidence as T-106-04-01. Pre-pack `.env.production` grep + post-build dead-code grep both clean before tonight's pack. | closed |
| T-106-05-02 (= RESEARCH T8-leak-2) | Information Disclosure | `evenhub login` credentials or personal API keys committed | mitigate | `git log --all --diff-filter=A --name-only` for `evenhub/` paths returns empty. Tonight's commits inspected pre-stage; only intended files added. | closed |
| T-106-05-03 | Tampering | User ticks VERIFIED.md checkboxes without running tests | accept | Discipline gate per RESEARCH §Security. Tonight's UAT WAS the actual run (hardware paired, simulator screenshots captured, atomic gate fired) — discipline upheld. | closed |
| T-106-05-04 | Information Disclosure | Retina-scaled 1152×576 screenshot ships instead of native 576×288 | mitigate | UAT Test 6: `sips -g pixelWidth -g pixelHeight` confirmed both `01-work-orders.png` (576×288, 9286B) and `02-affirmation.png` (576×288, 6462B) at native resolution. Simulator `📸` button captures at native size — no retina path involved. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-106-01 | T-106-01-02 | Self-discipline gate, not security boundary. ISO timestamp parsing has no cryptographic attestation. Worst case: own shipping cadence affected. | jameson | 2026-05-06 |
| AR-106-02 | T-106-02-01 | Host-owned dialog dedup eliminates concrete impact. User-on-own-device threat surface = benign log noise only. | jameson | 2026-05-06 |
| AR-106-03 | T-106-04-03 | Pre-pack acceptance criteria + `.env.screenshot.example` header warning provide layered defense. Future-dev mitigation is review process, not code change. | jameson | 2026-05-06 |
| AR-106-04 | T-106-05-03 | UAT WAS actually run tonight — discipline upheld. Future runs: `check-verified.mjs` 24h freshness gate is the practical enforcement. | jameson | 2026-05-06 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-06 | 16 | 16 | 0 | Claude (orchestrator) — State B retroactive audit, deterministic verification only (no auditor agent spawned since threats_open = 0 after register classification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-06

---

## Cross-references

- VERIFIED.md: `.planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md` — atomic gate proof
- 106-UAT.md: `.planning/phases/106-g2-store-resubmit-atomic/106-UAT.md` — 6/6 tests passed (sha 7157896)
- HARDWARE-DIVERGENCE.md: same directory — 6 simulator/hardware divergences (none security-relevant)
- HARDWARE-RESOLVED.md: same directory — original blocker resolved (sha 71973e3)
- Threat sources: 106-01-PLAN.md, 106-02-PLAN.md, 106-03-PLAN.md, 106-04-PLAN.md, 106-05-PLAN.md `<threat_model>` blocks
