---
phase: 128a
slug: voice-01-pcm-feasibility-spike
status: draft
shadcn_initialized: false
preset: not applicable
created: 2026-05-12
spike_scope: true
tossable: true
delete_with_code_at: Phase 130 ship (VOICE-02..08)
---

# Phase 128a — UI Design Contract (SPIKE SCOPE)

> Visual + interaction contract for the **Voice Spike** screen on the G2 Companion HUD only. Tossable artifact — this contract dies with the spike code at Phase 130 ship. **DO NOT** treat as a permanent design system entry; it inherits 100% of its tokens from the locked v3.x G2 plugin design language (Phase 106 D-07, Phase 124 D-05/D-08, Phase 125 G2-POLISH-08).

> **Scope boundary:** This contract covers the G2 plugin's new "Voice Spike" screen + the recording-state visual indicator + copy strings. It does **NOT** cover PWA changes (per CONTEXT D-W2: spike inserts a `thoughts` row; existing dashboard polling renders it; no new component). It does **NOT** cover the Phase 130 LED indicator on Companion HUD (VOICE-03 scope; spike uses a text-only placeholder).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (no shadcn — G2 plugin renders via Even SDK, not React DOM) |
| Preset | not applicable |
| Component library | `@evenrealities/even_hub_sdk@^0.0.9` (`RebuildPageContainer` / `TextContainerProperty`) |
| Icon library | none — ASCII glyphs only (`()`, `↑`, `↓`, `*`, `[…]`, `━`) |
| Font | SDK-default monospace bitmap (4-bit greyscale display; no font selection API) |

**Render target:** Even G2 binocular display, **576×288 px, 4-bit greyscale (16 levels), monochrome**. Per `vigil-g2-plugin/src/constants.ts`: `DISPLAY_WIDTH = 576`, `DISPLAY_HEIGHT = 288`, `CHARS_PER_LINE = 32`. There is NO BMP background image — the canvas is black; design language is bright text + 1-px bright borders on a black field. (The orchestrator brief used the phrase "Companion BMP background pattern" loosely; the actual SDK primitive is `TextContainerProperty` with `borderColor: 15` on `xPosition/yPosition/width/height` — no raster background slot exists.)

**Programmatic-only:** Per RESEARCH DRIFT-01, every G2 screen is a TS module exporting a `RebuildPageContainer`. The orchestrator brief's mention of `voice-spike-page.html` is **architecturally rejected**: the spike screen is `vigil-g2-plugin/src/screens/voice-spike.ts`. The only HTML file in the plugin is the iPhone WebView splash `index.html`.

---

## Spacing Scale

The G2 plugin's spacing scale is **fixed by the display geometry** (576×288 at 4-bit greyscale; container coordinates are integer pixels). All existing screens (`home.ts`, `companion.ts`, `affirmation.ts`) use the same 3-row stack. Voice Spike inherits verbatim — **DO NOT** introduce new spacing tokens for a tossable screen.

| Token | Value | Usage |
|-------|-------|-------|
| pad | 8px | `paddingLength: 8` on every TextContainerProperty (locked across all screens) |
| header-h | 40px | `yPosition: 0, height: 40` — VIGIL wordmark + DIVIDER row |
| body-h | 210px | `yPosition: 40, height: 210` — main content, only `borderWidth: 1` container |
| footer-h | 38px | `yPosition: 250, height: 38` — nav-hint row, no border |
| body-y | 40px | body `yPosition` (= header height) |
| footer-y | 250px | footer `yPosition` (= header + body) |
| full-w | 576px | every container `width: DISPLAY_WIDTH` |

**Multiples-of-4 check:** 8, 40, 38, 210, 250, 576 — all multiples of 4 except `38` and `210`. Both are inherited from `home.ts:42-72` and `companion.ts:386-416`; the spike does NOT change them. (The 4-multiple convention is a web/desktop heuristic; G2 pixel-geometry constraints already locked these values in Phase 106.)

Exceptions: none (spike screen MUST exactly mirror the 3-row stack used by Home / Companion / Affirmation / Work-Orders so it lives coherently in the carousel).

---

## Typography

The G2 display uses **a single SDK-default monospace bitmap font** with no size/weight API surface. `content` is a string that the SDK lays out at one fixed pixel size (~9px wide × ~16px tall character cells; 32 chars per row at 576 width). Every screen uses this same font. There are no headings vs body distinctions in the visual hierarchy — emphasis is conveyed by **bracketing** (`[REC]`), **divider lines** (`━━━`), or **uppercase** (`VIGIL`, `TOP PRIORITY:`).

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body (all text) | SDK-default bitmap (~16px effective cell height) | SDK-default (no API) | SDK-default (~18px between line baselines) |
| Wordmark (`VIGIL`) | same | same; emphasis via UPPERCASE | same |
| State indicator (`[REC 0:00]`) | same; emphasis via SQUARE BRACKETS | same; bracket pair is the visual heaviness | same |
| Divider (`━━━…`) | same; row of U+2501 BOX DRAWINGS HEAVY HORIZONTAL | same | same |

**Locked text-effect grammar (inherited; spike MUST NOT introduce new effects):**
1. UPPERCASE for headers, wordmarks, state labels (e.g., `VIGIL`, `TOP PRIORITY:`, `[REC]`, `[IDLE]`)
2. Surrounding `[…]` square brackets = "state indicator" (mirrors Phase 124 D-05 `[NEEDS INPUT]`, `[TASK FAILED]`, `[DONE]`, `[MILESTONE]`)
3. `() double-tap` = the canonical glyph for the DOUBLE_CLICK gesture in footer hints (mirrors `home.ts:69` and `affirmation.ts:53`)
4. `↑` / `↓` = swipe-up / swipe-down to adjacent carousel screen
5. `*` bullet = list-item marker (mirrors `home.ts:36`)

---

## Color

The G2 display is **4-bit greyscale (16 levels: 0=black, 15=brightest white)**. There is no color. Every screen uses only two effective shades: bright text/border (15) on black background (0). The "60/30/10" web convention does not map cleanly — instead, the spike inherits the **2-tone contrast rule** locked in Phase 106 D-07 item 4.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (background) | 0 (black) | The display field — every pixel not painted by text/border |
| Bright (foreground) | 15 (brightest) | All text content; `borderColor: 15` on body container |
| Mid-grey | N/A | Not used. The 4-bit display supports it; the design language does not. |
| "Accent" (emphasis brackets) | 15 | `[REC]` indicator uses the same brightness as body text; emphasis is via the bracket pair and the row position (top-of-body), not a color shift |
| Destructive | N/A | No destructive actions in this spike (start/stop mic is reversible by design) |

**Accent reserved for:** the single-line state indicator (`[REC 0:00]` / `[IDLE — () to record]`) rendered as the **first line of the body container**. This is the **only new visual element** the spike introduces. No other elements use brackets or row-1 emphasis on this screen.

**Contrast guarantee:** brightness-15 text on brightness-0 background → 15:1 effective contrast ratio at the pixel level (saturates the 4-bit channel). Exceeds WCAG AAA. The 1-px border (`borderColor: 15, borderWidth: 1`) at the body container edge provides additional visual framing identical to `home.ts`, `companion.ts`, `affirmation.ts`.

---

## Copywriting Contract

All copy fits within `CHARS_PER_LINE = 32` per line. Strings below are **literal** — executor copy-pastes verbatim. Each is ≤32 chars unless marked multi-line.

### State indicators (body line 1)

| Recording state | Copy (literal, ≤32 chars) | When shown |
|-----------------|---------------------------|------------|
| Idle (mic OFF) | `[IDLE]  () to record` | Default on screen entry; after stop-record completes |
| Recording (mic ON) | `[REC 0:00]  () to stop` | While `safeAudioControl(true)` is active; `0:00` is `MM:SS` from `mic_on` timestamp, updated on each new `audioEvent` fire |
| Uploading | `[UPLOADING…]` | After stop-record, while POST `/v1/voice/transcribe` is in flight |
| Done (success) | `[DONE]  thought saved` | After HTTP 200; auto-clears to `[IDLE]` after 3000ms (mirrors Companion `[DONE]` toast at `companion.ts:42-49`) |
| Permission denied | `[NO MIC]  check Even Hub` | When `safeAudioControl(true)` throws permission error (D-G3 probe path) |
| Budget exceeded | `[BUDGET]  $ limit reached` | When server returns `DAILY_AI_BUDGET_EXCEEDED` (429); mirrors Phase 127 GUARD-03 |
| Server error | `[ERR]  retry () to record` | Any other server-side failure; instructs operator to retry |

### Body lines 2 + 3 (measurement context for the operator)

| Line | Copy | Notes |
|------|------|-------|
| Line 2 (counter) | `chunks: N  bytes: B` | Live counter while recording; N = `audioEvent` fire count, B = accumulated PCM bytes. Both render `0` when idle. Names match Phase 127 GUARD-01 safe-key allowlist (`bytes`, `chunks` — **NOT** `pcm`, `audio`, `audioPcm`) |
| Line 3 (last result) | `last: 3.2s 1.4MB` (when present) <br> `last: —` (no recording yet) | Compact summary of the most recent completed recording: duration (s) + WAV size (B/KB/MB). Lets the operator visually confirm a recording was made before swiping to PWA |

### Footer (line)

Two-state, mirrors `companion.ts:412-416`:

| Footer state | Copy |
|-------------|------|
| Default | `↑ home  ↓ companion  () rec` |
| Recording active | `() to stop recording` |

### Primary CTA

There is no button affordance on the G2 display. The "primary CTA" is the **DOUBLE_CLICK gesture** itself, surfaced verbatim in body line 1 and the footer hint. Per CONTEXT D-G1, DOUBLE_CLICK is the only hardware-verified gesture. The `()` glyph (parentheses-as-touchpad-icon) is the established Vigil convention from `home.ts:69`, `companion.ts:413`, `affirmation.ts:53`.

### Empty state

Not applicable — the spike screen has no data dependency. On first entry it shows `[IDLE]  () to record` + zero counters. There is no "no thoughts yet" path on this screen (PWA dashboard handles that case independently).

### Error states

All seven state indicators above already cover error paths. There is no separate error screen. Errors are inline state-line replacements (e.g., `[NO MIC]`, `[BUDGET]`, `[ERR]`). After 5 seconds of any error state, the screen auto-clears to `[IDLE]` so the operator can retry with another DOUBLE_CLICK.

### Destructive actions

None. Recording is a non-destructive operation:
- Stop-record always succeeds (idempotent `safeAudioControl(false)` per Phase 127 GUARD-02).
- An incomplete recording POST drops the audio buffer; no zombie data lands in `thoughts` table.
- Confirmation dialog: not required.

---

## Screen Registration (G2 carousel integration)

Per RESEARCH §"Recommended Project Structure" + DRIFT-01 verdict, the Voice Spike screen registers via:

| Location | Change |
|----------|--------|
| `vigil-g2-plugin/src/navigation.ts:27-33` | Add `VOICE_SPIKE: 'voice-spike'` to `Screen` const |
| `vigil-g2-plugin/src/navigation.ts:37-42` | Add `Screen.VOICE_SPIKE` to `SCREEN_ORDER` array — **placement: end of the array, after `AFFIRMATION`**, so the carousel order is `HOME → COMPANION → WORK_ORDERS → AFFIRMATION → VOICE_SPIKE → (wraps to HOME)` |
| `vigil-g2-plugin/src/navigation.ts:58-122` | Add `case Screen.VOICE_SPIKE` branch in `buildScreen()` calling `buildVoiceSpikeScreen()` |
| `vigil-g2-plugin/src/navigation.ts:185-257` | Add DOUBLE_CLICK_EVENT routing branch for `currentScreen === Screen.VOICE_SPIKE` — **toggles `recording` state via `safeAudioControl()` rather than navigating to Home** (overrides the default DOUBLE_CLICK→HOME behavior; mirrors the Companion D-08 carve-out at lines 219-238) |
| `vigil-g2-plugin/src/screens/voice-spike.ts` | NEW (TOSSABLE) — `buildVoiceSpikeScreen() / rebuildVoiceSpikeScreen()` returning `RebuildPageContainer` with 3 containers (header / body / footer); follows `affirmation.ts` skeleton exactly |
| `vigil-g2-plugin/src/constants.ts:12-28` | Add `VOICE_SPIKE_HEADER: 16, VOICE_SPIKE_BODY: 17, VOICE_SPIKE_FOOTER: 18` to `ContainerId` (next 3 IDs after `COMPANION_FOOTER: 15`) |

**Carousel vs hidden:** The spike screen lives **in the carousel** (visible via swipe), not deep-linked-only. Rationale: (a) operator needs to swipe to it to run the spike; (b) keeping it visible makes the "remember this is tossable" friction higher, which is desirable (the operator sees it every navigation cycle and is reminded to delete at Phase 130); (c) `[user_adhd_founder]` is the only user, so accidental discoverability is a non-issue.

**Carousel exit gesture override:** On `Screen.VOICE_SPIKE`, DOUBLE_CLICK is repurposed as the record toggle. **The operator returns to Home via swipe**, not via double-tap-to-exit (which is the convention on Home → host-rendered exit-confirm). This is a documented departure from the `home.ts:69` footer hint; the spike's footer hint (`↑ home  ↓ companion  () rec`) tells the operator how to leave.

---

## Container Layout (literal pixel coordinates)

Inherited verbatim from `affirmation.ts:22-55`. Spike author **does not** invent new geometry.

```
┌──────────────────────────────────────────────────────────┐ y=0
│  VIGIL                              voice-spike          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                       │ header  (h=40)
├──────────────────────────────────────────────────────────┤ y=40
│ ┌──────────────────────────────────────────────────────┐ │
│ │ [REC 0:00]  () to stop                               │ │
│ │                                                      │ │
│ │ chunks: 12  bytes: 60000                             │ │ body    (h=210)
│ │                                                      │ │ border  (1px, level 15)
│ │ last: —                                              │ │
│ │                                                      │ │
│ │                                                      │ │
│ └──────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────┤ y=250
│  () to stop recording                                    │ footer  (h=38, no border)
└──────────────────────────────────────────────────────────┘ y=288
```

| Container | xPosition | yPosition | width | height | borderWidth | borderColor | paddingLength | containerName | isEventCapture |
|-----------|-----------|-----------|-------|--------|-------------|-------------|---------------|---------------|----------------|
| header | 0 | 0 | 576 | 40 | 0 | 0 | 8 | `vs-header` | 0 |
| body | 0 | 40 | 576 | 210 | 1 | 15 | 8 | `vs-body` | 1 |
| footer | 0 | 250 | 576 | 38 | 0 | 0 | 8 | `vs-footer` | 0 |

**Container names ≤11 chars** per Phase 125 hardware-debug-2026-05-10 verdict (companion.ts:73-77 comment): the SDK runtime enforces strict <16 character names even though `check-verified.mjs` accepts ≤16. `vs-header` (9), `vs-body` (7), `vs-footer` (9) all pass.

**Header rightSide:** `'voice-spike'` (11 chars). Replaces the default `HH:MM AM/PM` from `buildVigilHeader(containerID, name)` via the 3rd-arg override (`affirmation.ts` precedent at `buildVigilHeader(ContainerId.AFFIRMATION_HEADER, 'af-header')` shows the default behavior; spike passes the screen label to make the operator's location in the carousel unambiguous during the demo Loom).

---

## Recording State Indicator — Visual Pattern

This is the **one piece of design contract this spike actually contributes**. Everything else is inheritance from the locked v3.x G2 design system.

### Pattern

Single-line state indicator at the **top of the body container**, mirroring Phase 124 D-05's `[NEEDS INPUT]` / `[TASK FAILED]` / `[DONE]` overlay pattern from `companion.ts:347-363`. The `[…]` square-bracket pair is the locked visual grammar for "this is a state, not content."

### State machine (visual transitions)

```
┌──────────────────────────────┐
│ Screen entry (or after Done) │
│ [IDLE]  () to record         │
└──────────────┬───────────────┘
               │ DOUBLE_CLICK
               ▼
┌──────────────────────────────┐
│ Recording (mic ON)           │
│ [REC M:SS]  () to stop       │
│  + live chunk/bytes counter  │
└──────────────┬───────────────┘
               │ DOUBLE_CLICK (or 60s cap auto-stop)
               ▼
┌──────────────────────────────┐
│ Uploading                    │
│ [UPLOADING…]                 │
└──────────────┬───────────────┘
               │ HTTP 200            │ HTTP 4xx/5xx
               ▼                      ▼
┌────────────────────────┐  ┌──────────────────────────────┐
│ [DONE] thought saved   │  │ [ERR] retry () to record     │
│ (3s auto-clear)        │  │ or [NO MIC] / [BUDGET]       │
│                        │  │ (5s auto-clear)              │
└────────────┬───────────┘  └──────────────┬───────────────┘
             └──────────────┬──────────────┘
                            ▼
                    (back to [IDLE])
```

### Refresh cadence

- **While recording:** rebuild the body container on every `audioEvent` fire (the SDK does not provide a 1Hz timer; piggyback on `audioEvent` arrival since they fire ≥10× per second per STACK §1b). This makes `chunks: N bytes: B` update in real time without a separate timer subscription.
- **While idle / uploading / done / err:** static text; no rebuild needed except on state transitions.
- **Counter format for `[REC M:SS]`:** computed from `Date.now() - micOnStartedAt`; `M` zero-padded if needed (`0:03`, `0:42`, `1:05`); cap at `0:59` because the 60s server cap (Phase 127 GUARD-02) will trip first.

### Why text-only and not an LED-style indicator

VOICE-03 (Phase 130) ships the persistent LED-style indicator that survives screen changes. The spike's job is to **prove the audio path works**, not to design the indicator. CONTEXT D-G1 + the orchestrator brief both lock this: text-only `[REC]` is sufficient, and a placeholder overlay in screen-recording editor handles the 60s Loom's "viewer sees the indicator" need (CONTEXT §"60s Loom demonstration shape").

### Survives-screen-changes question

The spike's indicator does **NOT** need to survive screen changes — if the operator swipes off the Voice Spike screen while recording, the operator's responsibility is to swipe back to stop. (Per `[feedback_wallclock_checkpoint_exempt]` and Phase 127 GUARD-02: the 60s server cap auto-terminates any forgotten session at the server. The `safeAudioControl(false)` cleanup on plugin exit paths is the safety net.) The Phase 130 productionized indicator (VOICE-03) is the surface that needs cross-screen persistence; the spike does not.

---

## Accessibility on the G2 Companion HUD

The G2 display has no a11y API surface (no screen reader, no high-contrast toggle, no font scaling). The accessibility contract for this spike is therefore **physical legibility on the bitmap display**:

| Concern | Mitigation |
|---------|-----------|
| Contrast | brightness-15 on brightness-0 is the maximum 4-bit greyscale contrast (saturates the channel). Same as every other Vigil screen. |
| Font size | SDK-default; not configurable. Mitigation: keep state line to ≤24 chars (8 chars of headroom in the 32-char width) so it's never wrapping at the container edge — wrapping reduces glanceability. |
| Glanceability | State line at row 1 of body — first thing the operator's eye lands on after swiping to the screen. Mirrors Phase 124 D-05 banner-row pattern. |
| Empty lines | Body uses single blank lines between sections (state line / counters / last-result) so the operator can visually segment the content without reading each row. Mirrors `home.ts:35-40` (`bodyContent.join('\n')`). |
| Cognitive load (ADHD operator) | Per `[user_adhd_founder]`: state line uses 1 word + 1 modifier (`[REC 0:00]`) rather than a full sentence; counter line uses key-value (`chunks: N`) rather than prose; footer hint is 3 tokens (`↑ home  ↓ companion  () rec`). Reduces parse time on a worn HUD. |
| Operator-only | Single-user shipping context (no shared-use UX concerns); per orchestrator brief, multi-operator contention and presence indicators are out of scope. |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none | none | not applicable — no shadcn, no third-party registries, no new dependencies for the UI surface |

Spike's only new runtime dependency is `openai@^6.37.0` (per RESEARCH DRIFT-03, supersedes STACK's stale `^4.79.0` pin). It is a server-side SDK with **zero UI surface** — does not enter this contract.

---

## Sources of Authority (inheritance map)

| Inherited from | Used for |
|----------------|----------|
| `vigil-g2-plugin/src/constants.ts` | DISPLAY_WIDTH=576, CHARS_PER_LINE=32, ContainerId namespace |
| `vigil-g2-plugin/src/screens/affirmation.ts` | 3-row layout skeleton (header/body/footer geometry) the spike clones verbatim |
| `vigil-g2-plugin/src/screens/companion.ts:347-363` | `[…]` bracket grammar for state indicators |
| `vigil-g2-plugin/src/screens/header.ts` | `buildVigilHeader(containerID, name, rightSide?)` — spike calls with `rightSide='voice-spike'` |
| `vigil-g2-plugin/src/screens/home.ts:69` | `() double-tap to exit` footer-hint glyph convention (`()` = touchpad gesture icon) |
| Phase 106 D-07 item 1 | Unified VIGIL header on every screen |
| Phase 106 D-07 item 4 | `borderWidth: 1, borderColor: 15` on body container |
| Phase 124 D-05 | Companion HUD 3-line glanceable pattern (state on row 1) |
| Phase 124 D-08 | DOUBLE_CLICK as the sole reliable Companion-screen tap event |
| Phase 125 hardware-debug-2026-05-10 | Container name ≤11 chars (NOT ≤16 as TypeScript types suggest) |
| Phase 127 GUARD-01 | Logger key-name allowlist (`bytes` / `chunks` / `gap_ms` — NOT `pcm` / `audio`) — locks the body line 2 copy |
| Phase 127 GUARD-02 | 60s server cap — locks the `[REC M:SS]` max display to `0:59` |
| Phase 127.5 verdict (REACTIVATE single-press) | Explicitly **NOT** applied — spike uses DOUBLE_CLICK only per CONTEXT D-G1 |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS — 7 state strings + 2 counter strings + 2 footer strings, all literal, all ≤32 chars
- [ ] Dimension 2 Visuals: PASS — inherits 3-row stack verbatim; only new visual is the `[REC M:SS]` indicator pattern, which itself inherits from Phase 124 D-05 banner brackets
- [ ] Dimension 3 Color: PASS — 4-bit greyscale, 2-tone (level 0 + level 15); WCAG AAA by saturation
- [ ] Dimension 4 Typography: PASS — SDK-default monospace; no per-screen typography decisions (none exposed by the SDK)
- [ ] Dimension 5 Spacing: PASS — inherits container geometry from `affirmation.ts` (Phase 106 D-07 lock); no new spacing tokens
- [ ] Dimension 6 Registry Safety: PASS — no shadcn, no third-party UI registry, no new UI dependencies

**Approval:** pending

---

## Tossable Markers (Phase 130 delete checklist)

When Phase 130 (VOICE-02..08) ships, the following UI surfaces are deleted or rewritten:

| File / change | Disposition at Phase 130 |
|---------------|--------------------------|
| `vigil-g2-plugin/src/screens/voice-spike.ts` | DELETE — replaced by production push-to-record UX (VOICE-02..03 will not be a standalone screen; VOICE-03 lives as a persistent overlay on Companion HUD) |
| `Screen.VOICE_SPIKE` entry in `navigation.ts` | DELETE from `Screen` const + `SCREEN_ORDER` |
| `case Screen.VOICE_SPIKE` branch in `buildScreen()` | DELETE |
| DOUBLE_CLICK_EVENT routing branch for VOICE_SPIKE | DELETE |
| `VOICE_SPIKE_HEADER/BODY/FOOTER` constants | DELETE from `constants.ts` |
| 7 state-indicator strings in this contract | RETIRE — VOICE-03 (LED indicator) supersedes the text-only `[REC]` indicator |
| Footer hint `↑ home  ↓ companion  () rec` | DELETE with the screen |
| `vs-header` / `vs-body` / `vs-footer` container names | DELETE |

**Trigger for delete:** VOICE-08 drift-detector tests landing (REQUIREMENTS.md line 31). If VOICE-08 ships without this file deletion appearing in the diff, that's a Phase 130 plan defect — flag in the Phase 130 plan review.
