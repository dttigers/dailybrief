# Phase 106: G2 Store Resubmit (Atomic) — Research

**Researched:** 2026-04-19
**Domain:** Even Hub G2 plugin (TypeScript + Vite + @evenrealities/even_hub_sdk) — store resubmit prep
**Confidence:** HIGH (SDK types verified locally; CLI verified locally; Even Hub docs cross-checked; Figma spec URL confirmed public)

## Summary

This phase is not greenfield — it's a targeted amendment to an existing, working G2 plugin whose store submission was rejected for three specific items. All three fixes ship together or nothing ships (atomic gate). The SDK already exposes everything we need: `bridge.shutDownPageContainer(1)` for the host-rendered exit dialog, `OsEventTypeList.DOUBLE_CLICK_EVENT` (value 3) for the trigger, and a well-documented greyscale canvas model where "design in shades of grey; the hardware renders them as shades of green." The Even Realities public Figma design-spec URL exists and is linked from the Design Guidelines docs page — the STATE.md non-blocking flag can be closed once the user (or planner) opens it.

The `evenhub` CLI is installed globally on this machine (`/usr/local/bin/evenhub` v0.1.11) with a `pack <json> <project>` subcommand whose default output is `out.ehpk`. The existing `npm run release` script already wires `build:prod && pack`. Adding a `package:ehpk` gate that fails-closed on a missing/stale `VERIFIED.md` is a thin shell script on top of the existing chain — no rearrangement of the build pipeline.

The critical unknown is the **simulator-versus-hardware** behavior of the exit-confirmation dialog. The docs define `exitMode=1` semantics ("pops up a foreground interaction layer; user decides whether to exit") but do not specify what `Promise<boolean>` resolves to, nor whether simulator v0.6.2+ fully renders the host dialog. The phase sidesteps this by relying on observed simulator behavior documented in `VERIFIED.md` rather than trying to match the roadmap's "3 second" timing literally — D-04 in CONTEXT.md already locked this.

**Primary recommendation:** Fire-and-forget `bridge.shutDownPageContainer(1)` from inside `handleNavEvent` when `currentScreen === Screen.HOME && eventType === DOUBLE_CLICK_EVENT` — do not branch in `main.ts`. Keep all navigation logic in one file per the existing pattern. Do not attempt to render a custom confirmation dialog.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**G2-02 Exit Confirmation**

- **D-01:** Use the SDK's native exit-confirm flow: on double-tap from home, call `bridge.shutDownPageContainer(exitMode=1)`. Even Hub docs (Page Lifecycle) explicitly define: "Pass 0 for immediate exit, 1 for exit confirmation dialog." The host draws the confirmation UI — we do not render a custom greyscale dialog.
- **D-02:** Trigger scope is the home screen ONLY. Preserve today's `handleNavEvent` behavior on work-orders / affirmation / task-detail (double-click returns to home). No regression to existing muscle memory.
- **D-03:** Event is `OsEventTypeList.DOUBLE_CLICK_EVENT` (value 3) — officially documented in Even Hub Input & Events as "Double press (G2 or R1)." **Resolves STATE.md research flag** for Phase 106.
- **D-04:** The "3 seconds" and "waiting resets to home" timing in the roadmap success criterion is fulfilled by the host's native confirmation layer — we do not implement our own timer. If the host dialog auto-dismisses differently, planner documents the observed behavior in `VERIFIED.md` rather than trying to match the roadmap text literally.

**G2-03 Brand-Compliant UI**

- **D-05:** Scope lands on the glasses greyscale canvas. Vigil's teal palette and Inter font **cannot physically render** on the 4-bit greyscale G2 display per Even Hub Design Guidelines ("design in shades of grey; the hardware renders them as shades of green"). Vigil's brand guide still informs voice/tone of copy but not color/typography on glasses.
- **D-06:** Planner must amend the roadmap's "Vigil brand colors and Inter font" wording during planning to reflect the hardware constraint — the intent (no blank/placeholder states, recognizably Vigil) stays; the literal wording updates.
- **D-07:** Glasses must-fix checklist (all four apply):
  1. Consistent `VIGIL ... HH:MM` + divider header across all 4 screens (home already has it — extend to work-orders, affirmation, task-detail).
  2. No empty/placeholder bodies on any screen under API failure — every screen has fallback copy (e.g., "No work orders yet", "Brief unavailable — retry").
  3. Footer nav hint on every screen (swipe up/down, double-tap to exit).
  4. Use greyscale borders (`borderWidth: 1`) for visual structure per design guideline: "No background fill — you can only use borders and text/image content for visual structure."
- **D-08:** Companion iPhone-app WebView (branded `index.html`) is **deferred** — not part of this phase. If a future rejection calls it out specifically, it becomes its own phase.

**G2-01 Screenshots**

- **D-09:** Division of labor: this phase produces **work-orders** + **affirmation** PNGs. User uploads the home + task-detail screenshots himself to the store listing.
- **D-10:** Screenshots captured from Even simulator v0.6.2+ at native 576×288, committed to `vigil-g2-plugin/store-assets/` (Claude's discretion on exact filenames — e.g. `01-work-orders.png`, `02-affirmation.png`).
- **D-11:** Add a `VITE_SCREENSHOT_MODE` env flag that short-circuits `src/api.ts` to return fixed demo data (stable task list, specific affirmation). Defaults off — production code-path untouched. Used only when capturing screenshots.

**Atomic Gate**

- **D-12:** Gate is enforced in the build pipeline. Checklist file: `.planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md` with checkboxes for G2-01/02/03 and a simulator-session timestamp.
- **D-13:** Add an npm script (e.g. `npm run package:ehpk`) that refuses to produce the `.ehpk` unless `VERIFIED.md` exists **and** its simulator-session timestamp is within the last 24 hours. Skipping the checklist or rerunning without re-verifying is a hard failure, not a warning.
- **D-14:** Phase does NOT upload the `.ehpk` to Even Hub — it stops at a packaged `.ehpk` the user can upload manually. Atomic gate is "build refuses to pack without fresh verification," not "resubmit automatically."

### Claude's Discretion

- Exact copy for fallback / empty-state text (subject to Vigil voice: "Calm · Confident · Empathetic · Quiet · Direct · Warm" — short sentences, first-person, no productivity jargon).
- Exact border styling (weight, positions) and spacing tweaks within the greyscale-only guideline.
- `VERIFIED.md` schema (field names, exact timestamp format, how stale-detection reads it).
- Screenshot filename convention inside `store-assets/`.
- Demo data values behind `VITE_SCREENSHOT_MODE` (3 tasks with specific content is fine).
- Whether to add a short-lived listener probe that logs every sys/text/list event name on home, for later physical-hardware confirmation.

### Deferred Ideas (OUT OF SCOPE)

- **Companion iPhone-app WebView branding** — deferred until a future rejection explicitly flags that surface. Would be its own phase.
- **Physical hardware retest** (~2026-04-24) — already tracked in STATE.md blockers, not this phase.
- **Rollback / alternate plan if resubmit rejected again** — handled by a future phase if/when it happens.
- **App.json version bump + CHANGELOG entry** — planner-call, may bundle into this phase's plans.
- **Regression tests for existing nav behavior** (swipe cycle, tap-to-task-detail, double-click-to-home from non-home) — planner decides whether to add; not required by rejection criteria.
- **Listener probe for physical double-press confirmation** — Claude's discretion; not required for simulator verification.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (verbatim from REQUIREMENTS.md) | Research Support |
|----|---------|------------------|
| G2-01 | Plugin screenshots regenerated at correct resolution using the current Even simulator (v0.6.2+) | Native canvas is 576×288 per Even Hub Design Guidelines ([VERIFIED]). `VITE_SCREENSHOT_MODE` env flag guards stable demo data in `src/api.ts` (first Vite env flag in this codebase — D-11) [VERIFIED: codebase grep]. Screenshots capture from the Even iPhone simulator app (built into the Even Realities iPhone app — not a standalone Xcode simulator) [ASSUMED — see Open Questions]. |
| G2-02 | Double-tap gesture on home screen triggers a visible exit confirmation dialogue with a short timeout window, per Even Hub page-lifecycle guidelines | SDK provides `bridge.shutDownPageContainer(exitMode?: number): Promise<boolean>` at `node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts:1201` [VERIFIED: local inspection]. `exitMode=1` documented as "弹出前台交互层，由用户操作决定是否退出" = "pops up a foreground interaction layer; user decides whether to exit" [VERIFIED: SDK d.ts comment + hub.evenrealities.com docs]. Event is `OsEventTypeList.DOUBLE_CLICK_EVENT = 3` at d.ts:711 [VERIFIED]. |
| G2-03 | WebView content renders brand-compliant UI (colors, typography, spacing) following the Even Realities public software design guidelines — never blank | Design guidelines ([VERIFIED: hub.evenrealities.com/docs/guides/design-guidelines]) explicitly constrain the glasses canvas: 4-bit greyscale, no background fill, borders-and-text only, max 4 image containers + 8 other containers, one event-capture container per page. Vigil brand teal/Inter DO NOT render on glasses hardware — brand presence reduces to wordmark + copy voice. Public Figma file linked (URL in Code Examples below). "WebView" in the rejection text most plausibly refers to the glasses display containers (not the iPhone-app WebView, which is deferred per D-08). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

No root `./CLAUDE.md` file exists in this repo [VERIFIED: Read error on `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/CLAUDE.md`]. No project skills directory exists under `.claude/skills/` or `.agents/skills/` [VERIFIED: ls]. No project-level directives to enforce.

The only codebase-level rule the planner must carry forward is the existing TypeScript compiler strictness in `vigil-g2-plugin/tsconfig.json`:

- `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `erasableSyntaxOnly: true`
- `verbatimModuleSyntax: true` → all type-only imports must use `import type { ... }`
- `allowImportingTsExtensions: true` → imports keep `.ts` extensions (existing pattern in `src/**`)
- `useDefineForClassFields: true`, `moduleResolution: "bundler"`

`erasableSyntaxOnly` is the subtle one: it bans TypeScript `enum` syntax in our own code (SDK enums consumed as values are fine since they come from compiled `.js`). The existing codebase uses the `const Screen = { HOME: 'home', ... } as const` pattern in `navigation.ts:16` — follow that for any new screen identifiers.

## Standard Stack

### Core (already installed, no changes)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@evenrealities/even_hub_sdk` | 0.0.9 | G2 bridge: page containers, event bus, lifecycle, `shutDownPageContainer` | The only SDK Even Realities ships; required by platform [VERIFIED: package.json] |
| `typescript` | ~5.9.3 | Compile-time type checking (noEmit; Vite does emit) | Pinned by existing project |
| `vite` | ^8.0.1 | Bundler + dev server + env injection (`import.meta.env.VITE_*`) | Matches Even Hub starter template conventions [VERIFIED: brianmatzelle/even-realities-g2-glasses starter uses Vite] |

### Supporting (install or ensure present)

| Library / Tool | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `evenhub` CLI | 0.1.11 (installed at `/usr/local/bin/evenhub`) | `evenhub pack <app.json> <project>` → produces `.ehpk` | Phase uses existing `npm run pack` which invokes this CLI. No install needed. |

**Version verification performed:**

```bash
$ evenhub -V
0.1.11                                  # [VERIFIED: live CLI on this machine]

$ evenhub pack --help
Usage: evenhub pack [options] <json> <project>
Pack your project into a .ehpk file. <json> is path to app.json,
<project> is your built folder (dist, build, ...)
Options:
  -o, --output <output>  The output file name (default: "out.ehpk")
  --no-ignore            Include hidden files (starting with '.')
  -c, --check            Check if the package id is available
```

The existing `package.json` uses `evenhub pack app.json dist` (no `-o` flag, so output is `out.ehpk` in cwd — **not** `vigil.ehpk`). The existing `vigil.ehpk` in the repo root must have been produced by a previous `-o vigil.ehpk` run or renamed manually. **Planner note:** if they want a stable output filename, they should add `-o vigil.ehpk` to the pack script or document the rename in the gate script [VERIFIED: `package.json` line 10].

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Host-native `shutDownPageContainer(1)` dialog | Custom greyscale confirmation screen rendered via `rebuildPageContainer` | Custom is rejected (D-01). Host dialog is consistent across plugins, doesn't consume our 12-container budget, and matches platform UX. |
| Vite env flag (`VITE_SCREENSHOT_MODE`) | Query-string flag in `index.html` / runtime toggle | Env flag baked at build is cleanest; no runtime branch-path leaks into production bundle when unset (dead-code eliminated by Vite). [VERIFIED: Vite docs — `import.meta.env.*` is statically replaced] |
| `VERIFIED.md` file-based gate | GitHub Actions check / env var | User runs this locally on iMac/MBP; no CI. File check in a prepack npm script is the simplest, most debuggable gate. |

**No new dependencies required.** The phase adds:
- One env flag read in `src/api.ts` (existing Vite config supports `VITE_*` prefix by default, no vite.config.ts changes needed)
- One npm script + one small Node check script (no new npm packages — use Node's built-in `fs` module)
- Five small source edits (navigation.ts + 3 screen files + main.ts or navigation.ts for the DOUBLE_CLICK home branch)

## Architecture Patterns

### Project Structure (existing — extend, don't reshape)

```
vigil-g2-plugin/
├── app.json                 # manifest — version bump candidate (0.1.0 → 0.2.0)
├── package.json             # add package:ehpk script here
├── vite.config.ts           # no changes needed
├── src/
│   ├── main.ts              # event dispatch — DO NOT add home-branch exit here
│   ├── navigation.ts        # ADD home-branch shutDownPageContainer(1) here
│   ├── api.ts               # ADD VITE_SCREENSHOT_MODE guard here
│   ├── constants.ts         # layout constants — extend if adding borders
│   ├── types.ts             # no changes expected
│   └── screens/
│       ├── home.ts          # reference layout (already has header)
│       ├── work-orders.ts   # extend: add VIGIL header + footer hints
│       ├── affirmation.ts   # extend: footer hint wording
│       └── task-detail.ts   # extend: add VIGIL header + footer hint
├── store-assets/            # NEW — PNG screenshots committed here
│   ├── 01-work-orders.png   # 576×288, captured from simulator
│   └── 02-affirmation.png   # 576×288, captured from simulator
└── scripts/ (new)
    └── check-verified.mjs   # reads ../.planning/phases/106-.../VERIFIED.md
                             # exits 1 if missing or stale (>24h)
```

### Pattern 1: Add home-branch exit-confirm inside `handleNavEvent` (D-02 execution)

**What:** Single-point branch addition; no restructuring of SCREEN_ORDER, no new main.ts gate.

**When to use:** This is the ONE way to implement D-02. All other approaches (main.ts gate, new screen state) add ambiguity about where nav logic lives.

**Example (proposed patch to `src/navigation.ts:119-135`):**

```typescript
// Source: extend existing handleNavEvent in src/navigation.ts
export async function handleNavEvent(
  eventType: OsEventTypeList,
  bridge: EvenAppBridge,
): Promise<void> {
  // Task detail sub-screen branch (unchanged from today)
  if (currentScreen === Screen.TASK_DETAIL) {
    if (eventType === OsEventTypeList.SCROLL_TOP_EVENT) {
      await navigateTo(Screen.WORK_ORDERS, bridge)
    } else if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
      await navigateTo(Screen.AFFIRMATION, bridge)
    } else if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      await navigateTo(Screen.HOME, bridge)
    }
    return
  }

  // NEW: home-branch exit confirmation (G2-02)
  // On the home screen, double-tap hands off to the host-rendered
  // confirmation dialog per D-01 (exitMode=1). Fire-and-forget —
  // the host re-invokes lifecycle events (FOREGROUND_EXIT / restart)
  // on confirm/cancel; we do not need to await the Promise<boolean>.
  if (
    currentScreen === Screen.HOME &&
    eventType === OsEventTypeList.DOUBLE_CLICK_EVENT
  ) {
    void bridge.shutDownPageContainer(1)
    return
  }

  // Existing circular nav + DOUBLE_CLICK-to-home on non-home screens (unchanged)
  let target: ScreenName
  switch (eventType) {
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      target = getNextScreen(currentScreen)
      break
    case OsEventTypeList.SCROLL_TOP_EVENT:
      target = getPrevScreen(currentScreen)
      break
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      target = Screen.HOME
      break
    default:
      return
  }
  await navigateTo(target, bridge)
}
```

**Why the home branch comes BEFORE the switch and AFTER the task-detail branch:**

1. Task-detail must still short-circuit (it's not in SCREEN_ORDER).
2. If you put the home check inside the switch's `DOUBLE_CLICK_EVENT` case, you get awkward nesting. Early return keeps each concern on one level.
3. The existing `DOUBLE_CLICK_EVENT → target = Screen.HOME` case is now dead for home (home never routes to itself) but harmless to leave — keeps the switch symmetrical. Alternatively, planner may delete that case.

### Pattern 2: Screen-level header unification (D-07 item 1)

**What:** Use `TextContainerProperty` at `y=0, height=40` with the `VIGIL ... HH:MM\n<DIVIDER>` content already in `home.ts`, on every screen.

**Exact constants from existing code (for planner to prescribe verbatim):**

```typescript
// Source: src/constants.ts
export const DISPLAY_WIDTH = 576
export const DISPLAY_HEIGHT = 288
export const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'  // 32 U+2501 chars
```

```typescript
// Source: src/screens/home.ts (header block, lines 37-52)
const headerContent = `VIGIL              ${formatTime()}\n${DIVIDER}`
// ^ 5 chars "VIGIL" + 14 spaces + 8 chars "HH:MM AM" = 27 visible chars,
//   leaving ~5 char margin inside the 32-char line (CHARS_PER_LINE = 32)
new TextContainerProperty({
  xPosition: 0,
  yPosition: 0,
  width: DISPLAY_WIDTH,      // 576
  height: 40,
  borderWidth: 0,
  borderColor: 0,
  borderRadius: 0,
  paddingLength: 8,
  containerID: <per ContainerId enum>,
  containerName: '<screen>-header',
  content: headerContent,
  isEventCapture: 0,
})
```

**Current header inconsistency (to fix):**

| Screen | Current header | Matches VIGIL pattern? |
|--------|---------------|------------------------|
| home.ts:37 | `VIGIL              HH:MM AM\n<divider>` | YES (reference) |
| affirmation.ts:31 | `VIGIL              HH:MM AM\n<divider>` | YES (already unified) |
| work-orders.ts:33 | `WORK ORDERS          N open\n<divider>` | NO — needs unification |
| task-detail.ts:28 | `TASK DETAIL          <status>\n<divider>` | NO — needs unification |

**D-07 item 1 interpretation:** Planner has two options —

- **(a)** Replace screen-specific text with the literal `VIGIL ... HH:MM` on every screen (strict reading of D-07 item 1). Screen identity then lives in the body content or footer.
- **(b)** Use `VIGIL` wordmark on the left, screen-specific label on the right where HH:MM currently sits. Keeps screen identity. Example: `VIGIL    WORK ORDERS  N open\n<divider>`.

Both are consistent with the greyscale guideline. **Recommendation:** **(b)** — preserves information density and still gives every screen the `VIGIL` brand anchor. If the rejection reviewer specifically wanted the wordmark + time everywhere, (a) is safer. Planner decides; document choice in the plan with a 1-sentence rationale.

### Pattern 3: Greyscale border-for-structure (D-07 item 4)

**What:** Use `borderWidth: 1, borderColor: 15, borderRadius: 0` on the body container (header and footer stay borderless for visual separation).

**Current state:** ALL containers across all 4 screens use `borderWidth: 0` [VERIFIED: grep across src/screens/*.ts].

**Why 15 for `borderColor`:** 4-bit greyscale = values 0-15. 15 = maximum brightness = "rendered as bright green" on hardware. [VERIFIED: Even Hub docs — "4-bit greyscale — design in shades of grey; the hardware renders them as shades of green"]. Value 0 = black/off. Planner may use 8-15 range per design taste.

**Prescribed minimum-viable border pass (follows D-07 item 4 verbatim):**

```typescript
// Body container of every screen gets:
borderWidth: 1,
borderColor: 15,         // max brightness ~= bright green on hardware
borderRadius: 0,          // sharp corners — consistent with divider pattern
```

Header/footer text containers keep `borderWidth: 0` — the `DIVIDER` Unicode line IS their structural element. Adding a border to the header would double-draw the divider.

**For the work-orders ListContainerProperty** (body), `isItemSelectBorderEn: 1` is already set — that controls the per-item selection highlight, not the list outline. Adding the outer `borderWidth: 1` on the list wraps the whole list area, which improves the "no background fill" compliance without touching item selection.

### Anti-Patterns to Avoid

- **Rendering a custom exit-confirm screen.** Explicitly rejected by D-01. Custom dialog burns containers from the 12-container budget, adds a timer you have to manage, and diverges from host UX patterns.
- **Putting the home-branch gate in `main.ts`.** Navigation logic is centralized in `navigation.ts::handleNavEvent` by existing convention (see `main.ts` lines 57-66 which route everything there). Breaking that pattern makes future engineers hunt for where DOUBLE_CLICK is handled.
- **Awaiting the `shutDownPageContainer(1)` Promise and branching on the boolean.** The SDK docs don't define what `true`/`false` means here, and the host handles the full cancel/confirm lifecycle via `FOREGROUND_*` events we already listen for. Fire-and-forget (`void bridge.shutDownPageContainer(1)`) is safest.
- **Using `import.meta.env.VITE_SCREENSHOT_MODE === 'true'` with strict type-narrowing.** Vite replaces the expression at build time. Use `if (import.meta.env.VITE_SCREENSHOT_MODE)` and rely on Vite's string-vs-undefined truthiness — matches how `VITE_API_KEY` is already used in `api.ts:6` (`||` fallback idiom).
- **Committing the `.ehpk` artifact as part of this phase.** `.gitignore` line 27 already excludes `*.ehpk` [VERIFIED]. The existing `vigil.ehpk` at repo root was committed before that rule and is now a stale binary. Planner may include a task to remove it — orthogonal to the phase but reduces drift.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exit confirmation dialog UI | Custom `rebuildPageContainer` with Yes/No buttons and a `setTimeout(3000)` auto-dismiss | `bridge.shutDownPageContainer(1)` | Host owns the UI. Docs say "user decides whether to exit." We can't reach the auto-dismiss timer — it's host-internal. Trying to match a "3 second" wall-clock from JS would desync. |
| `.ehpk` packaging | A custom zip/tar routine reading app.json | `evenhub pack <json> <project>` | The `.ehpk` is a proprietary binary format (not standard zip — `file` shows "data", `unzip` fails). Only the vendor CLI can produce a valid manifest. |
| Stale-file detection for VERIFIED.md | A homegrown date parser | `fs.statSync(path).mtimeMs` + 24h compare | Built-in; simpler; no date-parsing bugs. Planner may alternatively embed the timestamp inside the file as an ISO 8601 line and parse that — both are acceptable. |
| Screenshot capture | A `puppeteer`/`playwright` headless render of `index.html` | Capture from the real Even simulator | The simulator uses the actual WebView + BLE relay + display rendering pipeline. A headless Chromium render will not reproduce the canvas constraints or the greyscale conversion. |
| Env flag injection | Runtime `window.__VIGIL_SCREENSHOT__` globals | `import.meta.env.VITE_*` | Vite statically replaces these at build time — dead-code-eliminates the demo path from production bundles automatically. No runtime overhead, no leak risk. [VERIFIED: Vite docs] |

**Key insight:** This phase is almost entirely about using existing SDK primitives correctly. The temptation is to over-engineer (custom dialog, custom packaging script, headless capture). Every resist-the-urge case above buys nothing and costs debugging time.

## Runtime State Inventory

This phase is additive — no renames, no migrations, no schema changes. Nevertheless, running the 5-category audit explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | None — plugin is stateless on the client; all state is in the G2 host's container tree which is rebuilt every 60s anyway. | None. |
| **Live service config** | None for this phase. (api.vigilhub.io whitelist in `app.json` unchanged.) | None. |
| **OS-registered state** | None. (G2 plugins are installed-via-ehpk, not OS-registered on dev machines.) | None. |
| **Secrets / env vars** | `VITE_API_KEY` in `.env` is unchanged. NEW `VITE_SCREENSHOT_MODE` is a purely local dev flag — default off — never shipped in the `.ehpk` since Vite inlines at build time with the prod `.env.production` values. | Planner must confirm `VITE_SCREENSHOT_MODE` is NOT set in `.env.production` (currently 120 bytes — likely just `VITE_API_URL`, verify during planning). |
| **Build artifacts** | `vigil-g2-plugin/dist/` is gitignored and regenerated on `npm run build:prod`. Stale `vigil-g2-plugin/vigil.ehpk` at repo root (27 KB, 2026-04-07) predates current `.gitignore *.ehpk` rule [VERIFIED: git tracks it but new rule ignores new ones]. | Optional cleanup: `git rm vigil-g2-plugin/vigil.ehpk`. Not required for G2-01/02/03. |

**Canonical question answered:** *"After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?"* — **Nothing.** This phase has no runtime state to migrate. The only "state" is the user's manual act of uploading the new `.ehpk` to Even Hub, which is explicitly out of scope per D-14.

## Common Pitfalls

### Pitfall 1: `evenhub pack` output filename mismatch

**What goes wrong:** The existing `package.json` `pack` script is `evenhub pack app.json dist` with no `-o`, so it writes `out.ehpk` to cwd. Any gate script or screenshot-upload step that looks for `vigil.ehpk` will fail silently.

**Why it happens:** Default output is `out.ehpk` per CLI help [VERIFIED: `evenhub pack --help`]. The existing `vigil.ehpk` in the repo was renamed manually or produced by a prior `-o` flag.

**How to avoid:** Planner either (a) updates the `pack` script to `evenhub pack app.json dist -o vigil.ehpk`, or (b) has the new `package:ehpk` script drive the pack directly with `-o`, bypassing `pack`. Option (b) is cleaner — the gate script owns the full pack invocation.

**Warning signs:** `out.ehpk` and `vigil.ehpk` both appear after a pack run; user wonders which one to upload.

### Pitfall 2: Vite env flag not prefixed `VITE_`

**What goes wrong:** `import.meta.env.SCREENSHOT_MODE` (without prefix) returns `undefined` in browser builds — Vite only exposes `VITE_*` keys to the client by default.

**Why it happens:** Vite deliberately restricts env leak surface. Planner might forget the prefix rule.

**How to avoid:** Always prefix with `VITE_`. D-11 already specifies `VITE_SCREENSHOT_MODE` — keep the name verbatim. [VERIFIED: Vite docs — envPrefix defaults to `['VITE_']`].

**Warning signs:** Flag works in dev server (because `.env` is in cwd) but not after build; screenshot data doesn't appear in the packaged `.ehpk` when the flag is set.

### Pitfall 3: `shutDownPageContainer(1)` on the simulator — unknown return semantics

**What goes wrong:** Simulator v0.6.2 might resolve the Promise immediately (before user confirms) OR might block until confirm/cancel. If the planner writes code that awaits and acts on the boolean, behavior diverges between simulator and hardware.

**Why it happens:** Docs define `exitMode` values but not the Promise resolution semantics [VERIFIED: hub.evenrealities.com/docs/guides/page-lifecycle silent on this]. The SDK comment just says "return `true` 表示成功" (= "true indicates success") — ambiguous on whether "success" means "dialog shown" or "user confirmed."

**How to avoid:** Fire-and-forget with `void`. Rely on existing `FOREGROUND_ENTER_EVENT` / `FOREGROUND_EXIT_EVENT` listeners in `main.ts` to handle lifecycle transitions (they already do, lines 75-82).

**Warning signs:** Code branches on the Promise result; the plugin does something different when user cancels vs confirms.

### Pitfall 4: Container ID collisions when adding borders to multiple screens

**What goes wrong:** `ContainerId` enum in `src/constants.ts` has exactly 12 IDs (1-12), matching the Even Hub 12-container-total budget. Adding any new container (e.g., a decorative border container) exceeds the budget and is rejected by the host.

**Why it happens:** Design guideline: "Max 4 image containers, 8 other containers — plan your layout within this constraint" [VERIFIED]. That's 12 max across the entire plugin tree.

**How to avoid:** Apply `borderWidth: 1` to EXISTING body containers — do not add new containers for borders. The border is a property of the text/list container, not a separate element. [VERIFIED: `TextContainerProperty.borderWidth` at d.ts:366].

**Warning signs:** `ContainerId` enum grows to 13+; screen fails to build on simulator; `createStartUpPageContainer` returns result code 2 (`oversize`) [VERIFIED: d.ts:1161-1166 return-code comment].

### Pitfall 5: Empty-state fallback regresses existing fallback paths

**What goes wrong:** `api.ts` already returns sentinel objects (`EMPTY_SUMMARY`, `EMPTY_BRIEF`, `FALLBACK_AFFIRMATION`) on fetch failure [VERIFIED: src/api.ts:17-44]. If planner adds a NEW fallback string in each screen's rendering logic, they may bypass the API-layer fallback and show "Loading..." or blank for a frame on cold start.

**Why it happens:** Two layers doing the same job. Cold-start race between `init()` in main.ts and the first `rebuildPageContainer` call.

**How to avoid:** Put empty-state copy at the screen-render layer, keyed off the actual data shape (`tasks.length === 0`, `affirmation === ''`). The API-layer fallback objects already guarantee non-null data shapes, so screen-render never sees `undefined`. Existing `work-orders.ts:66-85` already does this correctly — follow that pattern.

**Warning signs:** Flash of old copy after refresh; "undefined" or "null" appearing on screen; same empty-state message appearing twice (once from API, once from render).

### Pitfall 6: 24-hour stale gate clock skew

**What goes wrong:** Planner implements the staleness check as `Date.now() - mtimeMs > 24*60*60*1000`. If the user edits `VERIFIED.md` on one machine, commits, and runs `package:ehpk` on the other machine, clock drift or `git checkout` behavior can reset the mtime.

**Why it happens:** `git checkout` sets mtime to the checkout timestamp, not the commit timestamp. On a fresh clone, every file's mtime is "now" — so staleness always passes, hiding the gate.

**How to avoid:** Embed the simulator-verification timestamp INSIDE `VERIFIED.md` as an ISO 8601 line (e.g., `Verified: 2026-04-19T18:23:00-07:00`), then parse it in the gate script. File mtime is unreliable across machines.

**Warning signs:** Gate passes on a fresh clone with an old `VERIFIED.md`; gate fails immediately after `git pull` on a valid file.

## Code Examples

### Example 1: VITE_SCREENSHOT_MODE guard in `src/api.ts`

```typescript
// Source: proposed extension of existing src/api.ts pattern

const SCREENSHOT_MODE = import.meta.env.VITE_SCREENSHOT_MODE

// Stable demo data for store screenshots — never rendered in production builds
// (VITE_SCREENSHOT_MODE is not set in .env.production, so Vite dead-code-eliminates
//  the whole `if` branch below at build time).
const DEMO_BRIEF: VigilBrief = {
  date: '2026-04-19',
  counts: { total: 12, byCategory: {}, tasksByStatus: { open: 3 }, favorites: 0, unprocessed: 0 },
  openTasks: [
    { id: 1, content: 'Follow up on PR-4827 review', taskStatus: 'open', createdAt: '2026-04-19T09:00:00Z', tags: [] },
    { id: 2, content: 'Draft Q2 OKRs — start with team themes', taskStatus: 'open', createdAt: '2026-04-19T10:00:00Z', tags: [] },
    { id: 3, content: 'Call plumber about kitchen sink', taskStatus: 'open', createdAt: '2026-04-19T11:00:00Z', tags: [] },
  ],
  recentThoughts: [],
  recentTherapy: [],
  todayCaptures: 7,
}

const DEMO_AFFIRMATION: VigilAffirmation = {
  affirmation: 'You are exactly where you need to be today.',
}

export async function fetchBrief(): Promise<VigilBrief> {
  if (SCREENSHOT_MODE) return DEMO_BRIEF
  try {
    const res = await fetch(`${BASE_URL}/brief`, { headers: authHeaders() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as VigilBrief
  } catch (err) {
    console.error('[vigil-g2] fetchBrief failed:', err)
    return EMPTY_BRIEF
  }
}

// Same pattern for fetchAffirmation and fetchSummary.
```

**Also update `src/vite-env.d.ts` (create if missing) or rely on `vite/client` types in tsconfig:**

```typescript
// Optional: add to a new src/vite-env.d.ts for type safety
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_API_KEY?: string
  readonly VITE_SCREENSHOT_MODE?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

The existing `tsconfig.json` already has `"types": ["vite/client"]` so untyped `VITE_*` access is allowed — the type file above is a polish, not a requirement.

### Example 2: `package:ehpk` npm script + gate

```json
// Source: proposed additions to vigil-g2-plugin/package.json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "build:prod": "tsc && vite build --mode production",
    "pack": "evenhub pack app.json dist -o vigil.ehpk",
    "release": "npm run build:prod && npm run pack",
    "preview": "vite preview",
    "package:ehpk": "node scripts/check-verified.mjs && npm run release"
  }
}
```

```javascript
// Source: proposed vigil-g2-plugin/scripts/check-verified.mjs
// Fails-closed if VERIFIED.md missing OR its embedded ISO timestamp is > 24h old.
// Invoked by `npm run package:ehpk` before the build+pack chain runs.

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const VERIFIED_PATH = resolve(
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
// Expect a line like: "Verified: 2026-04-19T18:23:00-07:00"
const match = content.match(/^Verified:\s*(\S+)/m)
if (!match) {
  console.error('[package:ehpk] VERIFIED.md missing a "Verified: <ISO 8601>" line.')
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
```

Planner may simplify further (pure mtime check) or embed a JSON block instead of the ISO line. Both fulfill D-13. The ISO-line approach is robust to `git checkout` mtime resets (Pitfall 6).

### Example 3: Unified header factory (D-07 item 1)

```typescript
// Source: proposed new helper in src/screens/header.ts (or inline in each screen)
import { TextContainerProperty } from '@evenrealities/even_hub_sdk'
import { DISPLAY_WIDTH, DIVIDER } from '../constants.ts'

function formatTime(): string {
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const period = hours >= 12 ? 'PM' : 'AM'
  const h12 = hours % 12 || 12
  return `${h12.toString().padStart(2, '0')}:${minutes} ${period}`
}

/**
 * Build the unified VIGIL header for any screen.
 * Left: VIGIL wordmark. Right: context label OR time (per screen).
 */
export function buildVigilHeader(
  containerID: number,
  containerName: string,
  rightSide?: string, // e.g., "3 open", "inProgress" — falls back to HH:MM
): TextContainerProperty {
  const right = rightSide ?? formatTime()
  // 32-char total width; "VIGIL" = 5 chars; right-align `right` at col 32
  const leftPad = Math.max(0, 32 - 5 - right.length)
  const headerContent = `VIGIL${' '.repeat(leftPad)}${right}\n${DIVIDER}`

  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: DISPLAY_WIDTH,
    height: 40,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID,
    containerName,
    content: headerContent,
    isEventCapture: 0,
  })
}
```

Each screen then calls `buildVigilHeader(ContainerId.WORK_ORDERS_HEADER, 'work-orders-header', `${tasks.length} open`)` etc. De-dupes `formatTime` across the 4 screen files (it's already duplicated in `home.ts` and `affirmation.ts`).

### Example 4: Screenshot capture workflow

```bash
# Source: proposed manual procedure, captured in VERIFIED.md as runbook

# 1. Set env flag and build
cd vigil-g2-plugin
echo "VITE_SCREENSHOT_MODE=1" > .env.screenshot
npm run dev  # OR build+pack+sideload, depending on simulator flow

# 2. Open Even Realities iPhone app → developer/simulator mode
#    (exact path lives in Even Hub docs; v0.6.2+ required per G2-01)

# 3. Navigate to each target screen in the G2 simulator pane

# 4. Capture. For iOS Simulator (if using xcrun):
#    xcrun simctl io booted screenshot ~/Desktop/01-work-orders.png
#    OR use the Even app's built-in screenshot button (check v0.6.2 release notes)

# 5. Verify 576×288 native resolution:
#    sips -g pixelWidth -g pixelHeight ~/Desktop/01-work-orders.png
#    # Should report 576 x 288. If retina-scaled to 1152×576, downscale:
#    sips -z 288 576 input.png --out output.png

# 6. Move to store-assets/, commit:
mv ~/Desktop/01-work-orders.png vigil-g2-plugin/store-assets/
mv ~/Desktop/02-affirmation.png vigil-g2-plugin/store-assets/
git add vigil-g2-plugin/store-assets/

# 7. Unset env flag for production:
rm .env.screenshot
```

**Planner note:** The exact screenshot hotkey/menu path in the Even iPhone app is **[ASSUMED]** — this is one of the Open Questions. The first plan that runs the verification session should discover and document the actual mechanism, then retrofit the runbook in `VERIFIED.md`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom dialog via `rebuildPageContainer` with Yes/No text | Host-native `shutDownPageContainer(exitMode)` | SDK 0.0.7+ exposes the method (our plugin pins `min_sdk_version: "0.0.7"` in `app.json`) | Removes need to manage timer, container budget, event capture for dialog |
| Hand-zipped plugin bundles | `evenhub pack` CLI with proprietary binary format | evenhub-cli `pack` subcommand is the canonical flow | Manifest validation, version/edition pinning enforced by vendor |
| Headless browser screenshots | Capture from Even Realities iPhone simulator | Simulator became testing requirement for store submission | Uses actual WebView + display pipeline — matches reviewer experience |

**Deprecated / outdated:**
- Any mention of rendering Vigil teal/Inter on the glasses — impossible on 4-bit greyscale hardware. Applies only to companion iPhone-app WebView (deferred per D-08).

## Assumptions Log

Claims in this research tagged `[ASSUMED]` that the planner should treat as hypotheses to confirm during execution:

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Even simulator referenced in G2-01 is the "Even Realities" iPhone app with a built-in G2 simulator view (not a standalone macOS simulator or a separate Xcode project). | Phase Requirements G2-01, Code Examples §Example 4 | If it's actually a standalone Mac app, the screenshot workflow changes (use Cmd+Shift+4 or `xcrun simctl`, not the iPhone app's share/screenshot). Not a design-blocker — just shifts the runbook. |
| A2 | The screenshot capture mechanism inside the Even iPhone simulator (hotkey, menu item, or export) is built-in and produces a native 576×288 PNG (not a retina-scaled 1152×576 that we must downscale). | Pitfall 3 (implied), Code Examples §Example 4 | If only retina output is available, the runbook must add a `sips -z` downscale step. Minor. |
| A3 | `exitMode=1` is actually implemented in simulator v0.6.2+ (not stubbed out). The docs describe the behavior, but "docs describe" ≠ "simulator renders." | Pitfall 3 | If stubbed, G2-02 can't be verified on simulator alone — user would need physical hardware (2026-04-24), breaking the atomic-today premise. Probability low (this is the documented, canonical exit path), but it is the single largest schedule risk for the phase. |
| A4 | The rejection's "WebView content renders brand-compliant UI" language refers to the glasses canvas containers (what D-07 addresses), not the companion iPhone-app WebView. | Phase Requirements G2-03, D-08 | If the rejection was about the iPhone app, D-07 doesn't address the rejection and the resubmit fails again. Probability low given the rejection bundles it with G2-01 (glasses screenshots) and G2-02 (glasses exit), all glasses-side concerns. |
| A5 | No design tokens page exists separately from the Figma file; the Figma file itself is the canonical source for border weights, spacing, typography (but can't be scraped programmatically without auth). | State of the Art, Open Questions Q1 | If a tokens URL exists and has stricter rules than what we derived from the docs text, we may still be non-compliant. User-review check closes this. |

**If this table is empty:** not applicable — five assumptions flagged above.

## Open Questions

1. **Does the Figma public design spec contain border-weight / spacing tokens that contradict our derived choices?**
   - What we know: URL is public: https://www.figma.com/design/X82y5uJvqMH95jgOfmV34j/Even-Realities---Software-Design-Guidelines--Public-?node-id=2922-80782 [VERIFIED via docs link]
   - What's unclear: The file can't be scraped from this session (Figma page served behind JS, WebFetch returns "Figma" only). Need the user to open it and eyeball tokens.
   - Recommendation: Planner includes a 5-minute user-review checklist item in the first plan: "Open Figma spec, confirm our border-weight and header-pattern choices are compliant, note any token values to match."
   - **Resolves STATE.md flag:** "review Even Realities public Figma design spec before G2-03 CSS changes" — non-blocking per CONTEXT §specifics; this phase addresses it with a user-facing review step rather than a blocking prerequisite.

2. **What is the exact simulator screenshot capture mechanism in the Even Realities iPhone app?**
   - What we know: Apple has `xcrun simctl io booted screenshot` for macOS Xcode simulators, and the iPhone app can use the iOS hardware screenshot (Power + Volume Up). Whether the Even app has a dedicated "export glasses canvas" button is unknown.
   - What's unclear: Whether the output is native 576×288 or some upscaled viewport.
   - Recommendation: First simulator session (part of the plan) discovers the mechanism. Document it in `VERIFIED.md` runbook for reproducibility.

3. **Does `bridge.shutDownPageContainer(1)` render a fully-functional confirmation dialog on simulator v0.6.2+?**
   - What we know: Docs describe the behavior; the method signature is present in SDK 0.0.9 [VERIFIED: d.ts:1201].
   - What's unclear: Whether the simulator renders the same host dialog as physical hardware, or stubs it.
   - Recommendation: First verification attempt is the answer. If stubbed, phase escalates — user physical retest ~2026-04-24 becomes the critical path, phase pauses.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `evenhub` CLI | `npm run pack`, `npm run package:ehpk` | ✓ | 0.1.11 (global, `/usr/local/bin/evenhub`) | — |
| Node.js | `tsc`, Vite, `check-verified.mjs` | ✓ | v25.2.1 | — |
| `@evenrealities/even_hub_sdk` | Compile-time + runtime | ✓ | 0.0.9 (installed) | — |
| TypeScript | `tsc` pre-build check | ✓ | 5.9.3 (devDep) | — |
| Vite | Build + env injection | ✓ | 8.x (devDep) | — |
| Even Realities iPhone app (≥ v0.6.2) | Screenshot capture + simulator verification | ✗ (not verifiable from this environment — user-owned mobile device) | — | None — if < 0.6.2, user must update before G2-01/02 verification |
| Figma (public file view) | Design-token eyeball review | ✓ (public URL, browser-accessible) | — | — |

**Missing dependencies with no fallback:** None on the dev machine. The Even iPhone simulator version is user-side and outside our reach — planner must treat it as a manual prerequisite in the first plan's Wave 0.

**Missing dependencies with fallback:** None.

## Validation Architecture

This phase has **no automated test harness for glasses UI** — there is no Jest/Vitest, Puppeteer setup, or visual-diff tooling in `vigil-g2-plugin/` (verified: no `vitest`/`jest`/`playwright` in `package.json`; no `__tests__` or `*.test.ts` in `src/`). The existing `tsconfig.json noEmit: true` + `tsc` build-time check is the closest thing to a safety net. Validation is therefore **manual simulator session + script checks** — which is exactly what the atomic gate (D-12/D-13) enforces.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None (no unit/integration test framework in vigil-g2-plugin). Validation is (a) `tsc` type-check, (b) `VERIFIED.md` checklist produced during a manual simulator session, (c) `scripts/check-verified.mjs` staleness gate. |
| Config file | None — add `scripts/check-verified.mjs` in this phase. |
| Quick run command | `cd vigil-g2-plugin && npm run build` (tsc + vite build; fails on type errors) |
| Full suite command | `cd vigil-g2-plugin && npm run package:ehpk` (type-check → build → staleness gate → pack; full atomic gate) |
| Phase gate | `VERIFIED.md` present with `Verified:` timestamp ≤ 24h old AND all three checkboxes (G2-01/02/03) ticked, AND `npm run package:ehpk` exits 0. |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| G2-01 | `store-assets/01-work-orders.png` and `store-assets/02-affirmation.png` exist at native 576×288 | manual (simulator capture) + script (dimension check) | `sips -g pixelWidth -g pixelHeight vigil-g2-plugin/store-assets/*.png` — assert 576×288 for each | ❌ Wave 0 must create `store-assets/` |
| G2-01 | `VITE_SCREENSHOT_MODE` demo path produces deterministic data | manual (eye) + static check | `grep -n 'SCREENSHOT_MODE' vigil-g2-plugin/src/api.ts` — asserts guard present | ✅ (api.ts exists, guard is new) |
| G2-02 | Double-tap on home fires `shutDownPageContainer(1)` once; does NOT fire on other screens | manual-only (simulator session required — no programmatic way to dispatch DOUBLE_CLICK events to the SDK from a test harness without the Even host app) | n/a — must be logged in VERIFIED.md with simulator screenshot of the dialog | Manual |
| G2-02 | Code path exists: `handleNavEvent` branches on `currentScreen === Screen.HOME && DOUBLE_CLICK_EVENT` | static grep | `grep -n 'shutDownPageContainer' vigil-g2-plugin/src/navigation.ts` — asserts exactly 1 call site | ✅ (navigation.ts exists) |
| G2-03 | All 4 screens have `VIGIL` wordmark header | static grep | `grep -c 'VIGIL' vigil-g2-plugin/src/screens/*.ts` — asserts presence in all 4 files | ✅ |
| G2-03 | Body containers have `borderWidth: 1` | static grep | `grep -n 'borderWidth: 1' vigil-g2-plugin/src/screens/*.ts` — asserts ≥ 4 matches (one per body) | ✅ |
| G2-03 | Empty-state fallback copy exists for work-orders, affirmation, task-detail | static grep | `grep -E "'No (open|work orders|tasks)" vigil-g2-plugin/src/screens/*.ts` — asserts present | ✅ |
| All | `VERIFIED.md` exists, has `Verified:` ISO timestamp ≤ 24h old | script check | `node vigil-g2-plugin/scripts/check-verified.mjs` — exit 0 ⇔ passes | ❌ Wave 0 creates the script |
| All | Type check passes | static | `cd vigil-g2-plugin && npx tsc` | ✅ (tsconfig exists) |
| All | Build produces `vigil.ehpk` | script | `cd vigil-g2-plugin && npm run package:ehpk && test -f vigil.ehpk` | ❌ Wave 0 adds `package:ehpk` script |

### Sampling Rate

- **Per task commit:** `cd vigil-g2-plugin && npx tsc` (~1s) — catches type errors immediately.
- **Per wave merge:** `cd vigil-g2-plugin && npm run build:prod` (tsc + vite build, ~3-5s) — catches vite-bundling issues.
- **Phase gate:** Manual simulator session → edit `VERIFIED.md` → `npm run package:ehpk` exits 0 → commit `store-assets/*.png` + `VERIFIED.md` together.

### Wave 0 Gaps

- [ ] `vigil-g2-plugin/store-assets/` directory — create, add to git (even if empty during Wave 0; PNGs land in a later plan).
- [ ] `vigil-g2-plugin/scripts/check-verified.mjs` — the staleness gate script (new file).
- [ ] `.planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md` — checklist template (schema per Claude's discretion; planner drafts it).
- [ ] `vigil-g2-plugin/package.json` — add `package:ehpk` script, optionally add `-o vigil.ehpk` to `pack` (Pitfall 1).
- [ ] Framework install: none required.

## Security Domain

Per `.planning/config.json`, no `security_enforcement` key is set — defaulting to enabled. Applying the ASVS lens anyway:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Bearer token on API requests is existing; not changed by this phase |
| V3 Session Management | no | No session semantics in plugin |
| V4 Access Control | no | No new permissions introduced; `app.json` whitelist unchanged |
| V5 Input Validation | no | No new user input surface |
| V6 Cryptography | no | No crypto operations |
| V8 Data Protection | partial | `VITE_SCREENSHOT_MODE` must NOT leak into production builds (default off, build-time static replacement ensures this) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Demo data leaks into production `.ehpk` | Information Disclosure | `VITE_SCREENSHOT_MODE` unset in `.env.production` → Vite dead-code-eliminates the demo branch. Planner must verify `.env.production` does NOT contain the flag before running `npm run release`. |
| `evenhub login` credentials committed | Information Disclosure | Never commit `~/.config/evenhub/*` or similar. `evenhub login` is user-local. Not in scope this phase, but worth a one-line reminder in VERIFIED.md. |
| `VERIFIED.md` backdated by a sloppy edit | Tampering (self-inflicted) | The 24h staleness gate is the single source of truth. User can't backdate without also re-checking the boxes; the runbook in VERIFIED.md frames this as a discipline gate not a security boundary. |

## Sources

### Primary (HIGH confidence)

- **Local SDK TypeScript definitions:** `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts`
  - L707-717: `OsEventTypeList` enum including `DOUBLE_CLICK_EVENT = 3`
  - L1201: `shutDownPageContainer(exitMode?: number): Promise<boolean>` method signature + comment ("0 立即退出；1 弹出前台交互层")
  - L361-383: `TextContainerProperty` with `borderWidth`/`borderColor`/`borderRadius` optional fields
  - L1161-1166: `createStartUpPageContainer` return-code enum (0=success, 1=invalid, 2=oversize, 3=outOfMemory)
- **Even Hub Design Guidelines:** https://hub.evenrealities.com/docs/guides/design-guidelines — confirmed 576×288, 4-bit greyscale, "no background fill", "max 4 image containers + 8 others", Figma URL
- **Even Hub Page Lifecycle:** https://hub.evenrealities.com/docs/guides/page-lifecycle — `exitMode` 0 vs 1 semantics
- **Even Hub Input & Events:** https://hub.evenrealities.com/docs/guides/input-events — DOUBLE_CLICK_EVENT = 3 "Double press (G2 or R1)", "Only one container per page can capture events"
- **Public Figma design spec URL:** https://www.figma.com/design/X82y5uJvqMH95jgOfmV34j/Even-Realities---Software-Design-Guidelines--Public-?node-id=2922-80782 (content not scraped in this session — confirmed public via docs-page link text "View the Design Guidelines in Figma →")
- **Local `evenhub` CLI (v0.1.11):** `evenhub pack --help` output verified on this machine; output flag defaults to `out.ehpk`
- **Codebase verification:** `vigil-g2-plugin/src/**` — all existing screen files, api.ts, navigation.ts, main.ts read in full

### Secondary (MEDIUM confidence)

- **npm package registry hit for `@evenrealities/evenhub-cli`** (WebSearch result) — confirms the CLI exists on npm and is maintained; version in search results is 0.1.7 (ours is 0.1.11 globally — we may have installed a newer one from a different source, or the npm package and the global binary diverge; CLI behavior confirmed via `--help` regardless).
- **Apple Developer forum / documentation on iOS Simulator screenshots** (WebSearch) — `xcrun simctl io booted screenshot` and Cmd+S in Xcode simulator; applicable only IF Even simulator runs inside iOS Simulator (A1 open question).

### Tertiary (LOW confidence — flagged for validation during first plan)

- The exact iPhone-app screenshot capture mechanism for the Even Realities simulator pane (A2).
- Whether `shutDownPageContainer(1)` fully renders in simulator v0.6.2+ (A3) — canonical docs describe it; only live simulator session confirms it.
- Figma file's authoritative design-token values beyond what the HTML docs page quotes (Q1) — requires human review.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — SDK/CLI versions pinned and verified locally; zero new dependencies.
- Architecture (where the code changes go): HIGH — derived directly from existing code structure + one clean branch point in `handleNavEvent`.
- Pitfalls: HIGH for items 1-5 (each traces to a verified doc or codebase grep); MEDIUM for item 6 (clock-skew reasoning extrapolated from git mtime behavior, not a reported Even Hub issue).
- Simulator behavior (A3): MEDIUM — docs describe the path but live confirmation is deferred to the first plan.
- Figma token values (Q1): LOW — acknowledged gap, delegated to user review.

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (30 days — SDK/CLI pinned; Even Hub docs stable; Vite 8.x stable). If physical hardware retest on 2026-04-24 surfaces simulator/hardware divergence, regenerate Pitfall 3 and A3 sections.
