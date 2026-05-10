---
phase: 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo
status: pending
recorded_date: <fill on recording>
operator: <fill>
clip_path: ~/Library/CloudStorage/iCloud Drive/Vigil/portfolio/2026-05-vigil-v3.8-demo.mp4
duration_seconds: <fill>
prompt_used: <fill — short paraphrase of prompt that triggered needs_input>
takes_count: <fill>
post_production: <fill — trim only? color? cut points?>
clip_size_mb: <fill — filled post-recording via `ls -la` from operator's Mac>
hardware:
  glasses: "Even Realities G2"
  firmware: "2.2.0.28"
  plugin_version: "0.3.0"
  iphone: <fill — model + iOS version>
  mac: <fill — model + macOS version>
attestations:
  - "Single-shot real-hardware recording (no sim, no composite — per memory project_g2_tap_expand_broken)"
  - "Phone screen recording of operator wearing real G2, VS Code visible on laptop"
  - "Double-tap acknowledge matches v3.8 ship reality (per CONTEXT D-08 amendment landed in Plan 08)"
---

# AGENT-DEMO-01 — 60-second portfolio demo clip manifest

> Per CONTEXT D-09: real hardware single-shot recording (no sim, no composite).
> Per CONTEXT D-10: shot list 0:00-0:10 VS Code start, 0:10-0:25 walk away,
> 0:25-0:35 needs_input banner, 0:35-0:45 double-tap ack, 0:45-0:60 task_complete toast.
> Per memory `reference_brand_guidelines` + Claude's Discretion in CONTEXT.md: clip stored in
> iCloud Drive (NOT committed to repo).
> Per memory `feedback_wallclock_checkpoint_exempt`: this is an operator wallclock
> checkpoint; yolo mode does NOT bypass. The executor pre-stages this manifest;
> the operator runs the physical recording + back-fills the fields below.

## Recording metadata

- **Date:** (fill)
- **Operator:** (fill)
- **Hardware:** Even Realities G2, firmware 2.2.0.28
- **Plugin version:** 0.3.0 (sideloaded local OR latest dev portal upload — see Plan 125-08 vigil.ehpk)
- **iPhone:** (fill model + iOS version)
- **Mac:** (fill — running vigil-watch + VS Code with Claude Code)
- **Clip duration:** (fill, seconds — MUST be ≤ 60s per AGENT-DEMO-01 / D-10)
- **Number of takes:** (fill — first-take success rate per RESEARCH Pitfall 7)
- **Post-production:** (fill — trim only? color? cut points?)

## Shot list verification (D-10)

- [ ] 0:00–0:10: VS Code window visible, Claude Code session starts running
- [ ] 0:10–0:25: User stands up, walks away from keyboard. Glasses idle.
- [ ] 0:25–0:35: Temple tap fires. HUD shows banner `[NEEDS INPUT]` + state line `waiting for input` + last event message
- [ ] 0:35–0:45: User double-taps temple to ack. Banner clears. State returns to `running`. User walks back.
- [ ] 0:45–0:60: User answers in VS Code. Claude Code finishes. HUD shows `task_complete` toast. Clip ends.

## Prompt staging (Pitfall 7 — RESEARCH §"Demo single-shot fragility")

The 60s window is tight. The prompt MUST reliably trigger `needs_input` within ~25 seconds.
Per RESEARCH §Pitfall 7: pre-stage a prompt known to reliably fire `needs_input`
(e.g., one that asks Claude to confirm a dangerous git operation). Test 2x BEFORE
recording. If the first 3 takes don't get `needs_input` to fire, pause and
investigate the prompt.

High-yield prompt candidates (Claude Code stops to ask user):
- "Run `rm -rf node_modules` and reinstall — confirm before deleting"
- "Force-push origin/main from a local branch — confirm before push"
- "Drop the production database table users — confirm"

**Prompt actually used (operator fills):** (fill — short paraphrase)

## Clip path

Saved to: `~/Library/CloudStorage/iCloud Drive/Vigil/portfolio/2026-05-vigil-v3.8-demo.mp4`

(NOT committed to git per CONTEXT.md Claude's Discretion — clip is binary, lives in iCloud.)

**Verification command (operator-side, run from Mac):**

```bash
ls -la "$HOME/Library/CloudStorage/iCloud Drive/Vigil/portfolio/2026-05-vigil-v3.8-demo.mp4"
```

Expected: file exists, size > 1MB (60s of 1080p phone video should be tens of MB).
If iCloud sync is in progress the file may show with a `.icloud` extension — that
is acceptable; the file IS in iCloud, just not yet downloaded to local Mac. Wait
for sync OR verify on iPhone Files app.

## Operator wallclock steps (D-09 + D-10)

1. **Pre-flight (per RESEARCH Pitfall 7):**
   - G2 worn, paired, battery > 30%
   - PWA bearer signed in (vigil-watch running on Mac via launchd or local `npm run dev`)
   - VS Code open with prepared prompt (test it 2x without recording first to
     confirm `needs_input` fires reliably)
   - iPhone screen recording armed (long-press control center → screen record button)
   - Plan 09 Scenario 5 dry-run disposition confirmed green BEFORE physical
     recording — see `125-VERIFICATION.md` §"Scenario 5"

2. **Recording (single shot, ≤ 60s wallclock):**
   - Start screen recording on iPhone
   - Press play on the staged prompt in VS Code (timer starts)
   - Stand up, walk away from keyboard (~10s walk away per D-10)
   - Wait for temple tap; banner shows on HUD (~15s)
   - Double-tap to ack (matches D-08 ship reality — NOT single-tap)
   - Walk back, answer Claude Code's prompt
   - Wait for `task_complete` toast (~15s more)
   - Stop screen recording

3. **Post-production:**
   - Trim to ≤ 60s. Minor trim only — no composites, no overlays, no
     sim-overlay tricks (per memory `project_g2_tap_expand_broken`, sim-only
     ships are forbidden in portfolio framing too).
   - Save to `~/Library/CloudStorage/iCloud Drive/Vigil/portfolio/2026-05-vigil-v3.8-demo.mp4`.

4. **Manifest backfill (after clip saved):**
   - Fill in all `(fill)` fields above
   - Tick all 5 shot list boxes in §"Shot list verification (D-10)"
   - Set frontmatter `status: pending` → `status: complete`
   - Commit the manifest update to git as
     `docs(125-11): backfill demo clip manifest with recording metadata`

5. **Then mark AGENT-DEMO-01 complete:**
   ```bash
   gsd-sdk query requirements.mark-complete AGENT-DEMO-01
   ```
   (The executor explicitly does NOT mark this requirement complete — operator
   marks after physical recording exists and manifest fields are backfilled.)

## Acceptance gate

The following must all be true before AGENT-DEMO-01 is closed:

- [ ] Clip file exists at the iCloud Drive path above
- [ ] Clip duration ≤ 60 seconds
- [ ] Clip is single-shot real-hardware (no sim, no composite)
- [ ] All 5 D-10 shot list checkboxes ticked above
- [ ] All `(fill)` metadata fields backfilled above
- [ ] Manifest committed to repo (clip itself remains in iCloud, NOT committed)

## Notes / caveats

(fill — anything that would inform future demo recordings, e.g. lighting
issues, framing problems, prompt-yield observations, hardware behavior
surprises)
