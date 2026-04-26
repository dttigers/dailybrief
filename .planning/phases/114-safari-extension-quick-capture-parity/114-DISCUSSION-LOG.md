# Phase 114: Safari Extension Quick-Capture Parity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 114-safari-extension-quick-capture-parity
**Areas discussed:** Code share, Cmd+Enter empirical gate, URL append format, Triage badge UX details

---

## Code share

| Option | Description | Selected |
|--------|-------------|----------|
| Keep duplicates (Recommended) | Two copies, lockstep by hand. Simplest, zero new infra. Drift risk real but EXT-03 deferred to v3.7. | ✓ |
| Symlink shared files | Pick one canonical dir, symlink files. Single source of truth. Risk: Xcode/macOS code-signing through symlinks unverified. | |
| Shared dir + copy step | New top-level `ext-shared/` holds canonical files. Both extensions copy from it at build time. Real fix, but adds infra. | |

**User's choice:** Keep duplicates
**Notes:** Pragmatic for solo-dev velocity today; revisit at v3.7 likely tied to EXT-03 JWT migration.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Header comment only (Recommended) | One-line `// Keep in lockstep with ../vigil-extension/popup.{ext}` header in all 6 files. | ✓ |
| Verify script in scripts/ | `scripts/verify-extension-parity.sh` that diffs the 6 files. | |
| Nothing, trust myself | Solo dev, infrequent ext changes. Don't add infra. | |

**User's choice:** Header comment only
**Notes:** Cheap drift reminder; no tooling.

---

## Cmd+Enter empirical gate

| Option | Description | Selected |
|--------|-------------|----------|
| Plan 01 = throwaway probe (Recommended) | Plan 01 adds a temporary keydown logger to current Safari popup, rebuilds via Xcode, manually verifies in Safari, then reverts. Plans 02+ blocked until Plan 01 passes. | ✓ |
| Inline probe in Plan 02 | Skip separate probe plan. Plan 02 ports HTML/CSS, Plan 03 adds JS handler with one-time runtime assertion. Less ceremony, but doesn't satisfy SC#3 "before any implementation code." | |
| Fast probe via Web Inspector | Skip code probe. Open current Safari popup, attach Web Inspector, paste keydown listener into console, observe. No code commit needed. | |

**User's choice:** Plan 01 = throwaway probe
**Notes:** Honors the SC#3 "before any implementation code is written" wording load-bearingly.

---

| Option | Description | Selected |
|--------|-------------|----------|
| metaKey fires on ⌘ (Recommended) | Probe must confirm `e.metaKey: true` when ⌘+Enter is pressed. | ✓ |
| Cmd+Enter doesn't insert newline | Probe verifies `preventDefault()` suppresses default newline insertion. | |
| No conflict with Safari popup chrome | Probe confirms Safari doesn't swallow the shortcut at the popup-window level. | |
| Ctrl+Enter (parity for non-Mac keyboards) | Probe captures whether `ctrlKey: true` also fires for fallback support. | |

**User's choice:** metaKey fires on ⌘ (only — others explicitly NOT gating)
**Notes:** Tightly scoped probe — only block on the metaKey behavior. Other concerns are non-blockers.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Stop and replan (Recommended) | Probe failure → Plan 01 SUMMARY.md captures failure mode, phase pauses, user decides path forward. No autopilot fallback. | ✓ |
| Auto-fall-back to e.getModifierState('Meta') | Plan 02 includes a fallback path that uses `getModifierState('Meta')` if `metaKey` is false. Probe-then-implement-with-best-available. | |
| Move on to next area | (skip option) | |

**User's choice:** Stop and replan
**Notes:** No silent fallback. User wants explicit control over what ships if WebKit behaves differently.

---

## URL append format

| Option | Description | Selected |
|--------|-------------|----------|
| Verbatim Chrome (Recommended) | Append `\n\n${tab.title \|\| 'Page'}: ${tab.url}` on submit. Triage classifier has been seeing this format from Chrome since Phase 94. | ✓ |
| URL on its own line, no title | Append `\n\n${tab.url}` only — no page title. Cleaner but loses triage context. | |
| Markdown-style link | Append `\n\n[${title}](${url})`. Renders as link in PWA but triage doesn't parse markdown specially. | |

**User's choice:** Verbatim Chrome
**Notes:** Zero regression risk on category accuracy.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Unchecked (Recommended) | Default unchecked. Chrome parity. Quick-capture is text-first; URL is opt-in. | ✓ |
| Checked | Default on — one fewer click for current-page captures. Diverges from Chrome. | |
| Remember last state via storage | Persist checkbox via chrome.storage.local. Diverges from Chrome (Chrome has no persistence). | |

**User's choice:** Unchecked
**Notes:** Chrome parity; deliberate per-capture choice.

---

## Triage badge UX details

| Option | Description | Selected |
|--------|-------------|----------|
| Verbatim Chrome (Recommended) | 800ms poll, 5s timeout, 1.5s post-badge close. Same `/v1/thoughts/:id` endpoint, same response shape. | ✓ |
| Tune for Safari (slower poll, longer timeout) | Tweak to 600ms / 6s / 2s. Speculative — no data showing Safari needs different. | |
| Single check after fixed delay | Skip polling — wait 2s, GET once. Simpler but loses fast-feedback for sub-800ms triages. | |

**User's choice:** Verbatim Chrome
**Notes:** Known-good numbers from Phase 94 since 2026-04.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Plain '✓ Captured!' (Recommended) | After 5s of polling with no category, render plain checkmark + "Captured!", no badge. Match Chrome. | ✓ |
| '✓ Captured (uncategorized)' badge | Muted gray badge that explicitly says 'uncategorized'. More information but adds visual noise. | |
| Stay open with retry button | After 5s, swap to "Retry triage" button. Higher-friction; breaks auto-close pattern. | |

**User's choice:** Plain '✓ Captured!'
**Notes:** Auto-close at 1.5s post-render. Triage will show in PWA later if it eventually completes server-side.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Verbatim Chrome CSS (Recommended) | Copy `.category-badge`, `.analyzing`, `.shortcut-hint`, `.url-toggle` rules verbatim from Chrome popup.css. Vigil teal #1D9E75. | ✓ |
| Tune for Safari popup chrome | Tune visually after first build. Probably unnecessary since both render via WebKit. | |

**User's choice:** Verbatim Chrome CSS
**Notes:** Brand-locked teal carries over.

---

## Claude's Discretion

- Plan numbering / split (HTML+CSS one plan or two; whether re-sign verification gets its own plan)
- Whether to include `scripts/verify-phase-114.sh` per Phase 107.3 precedent
- Exact wording of the "Keep in lockstep with..." header comment
- Exact log format inside the throwaway probe

## Deferred Ideas

- Single-source `ext-shared/` dir + build-time copy — candidate for v3.7 EXT-03
- `browser.*` namespace migration — only if real incompatibility surfaces
- Persistent checkbox state via chrome.storage.local — only if unchecked-default proves annoying daily
- `scripts/verify-phase-114.sh` — Claude's Discretion this phase or v3.7 cleanup
