**VERDICT: PASS**

Authored: 2026-05-14
Phase: 128b — G2-REPLY-01 write-back path spike
Requirement: G2-REPLY-01 (REQUIREMENTS.md line 44)
Driving evidence: Path E PASS (re-confirmed in `pathE-TRANSCRIPT.md` Regression Re-Run row — `REGRESSION_EXIT=0`, `REGRESSION_PASS=1`, 71s wallclock vs spike 001 §Iteration 4 reference 77s); D-V4 max aggregation `MAX(PASS, DEGRADE, FAIL, DEGRADE, INCONCLUSIVE)` yields overall **PASS** regardless of A/B/C/D outcomes.

## Verdict computation (mechanical — D-V4)

| Path | Per-path mini-verdict | Source |
|------|------------------------|--------|
| A — JSONL append + IPC | **FAIL** | `.planning/spikes/128b-write-back/evidence/pathA-TRANSCRIPT.md` |
| B — stream-json (claude -p) | **DEGRADE (fresh-only)** | `.planning/spikes/128b-write-back/evidence/pathB-TRANSCRIPT.md` |
| C — named-pipe / FIFO | INCONCLUSIVE — not empirically tested; covered analytically by Path E (structural refinement) | spike 001 README §"Position vs. the 4 enumerated 128b paths" + RESEARCH §"Open Questions §2" |
| D — MCP server hook | **DEGRADE (inverted model — fresh-session-only via prompted tool-call)** | `.planning/spikes/128b-write-back/evidence/pathD-TRANSCRIPT.md` |
| E ★ — tmux send-keys | **PASS (re-confirmed)** | `.planning/spikes/128b-write-back/evidence/pathE-TRANSCRIPT.md` + spike 001 evidence (originals preserved at `.planning/spikes/001-tmux-write-back-128b/evidence/`) |

**Aggregation:** `MAX(PASS > DEGRADE > FAIL > INCONCLUSIVE)` = **PASS**.

## D-V1 Four-Step Round-Trip — Path E (the PASS driver, ★)

| Step | Description | Verdict | Evidence |
|------|-------------|---------|----------|
| 1 | Reply originates from non-TTY writer | ✓ | spike 001 §Results step 1 — bash script outside the tmux pane |
| 2 | String reaches input channel | ✓ | `pathE-L4-permission-pause-snapshot.txt` — dialog state change captured |
| 3 | Claude processes as next user turn | ✓ | `pathE-L4-tool-output-marker.txt` — Bash tool produced its output file (L4-TOOL-RAN-<id>) only possible after permission grant via injected Enter |
| 4 | Session continues healthy ≥60s | ✓ | `pathE-L4-health-check-snapshot.txt` — health probe `13 * 17` returned `221` after 60s idle |

## G2-REPLY-01 Success Criteria — Artifact Mapping

(Per RESEARCH §"Criteria Mapping" lines 539-547. Each criterion is satisfied by the cited artifact.)

| # | Success criterion | Satisfied by | Notes |
|---|--------------------|---------------|-------|
| 1 | 128b-SPIKE-DECISION.md records empirical results for at least 3 of (a)/(b)/(c)/(d) | Paths A + B + D empirical TRANSCRIPT.md files (3 of 4 — exceeds the bar); C documented analytically; E ★ is a 5th not substituting for (a)/(b)/(c)/(d) | The per-path table above contains 5 rows; A/B/D are empirical; C is analytical; E ★ is the validated 5th path |
| 2 | Decision file resolves to exactly one verdict — PASS / DEGRADE / BLOCK | Mechanically computed at TOP of this document via D-V4 max aggregation | Non-editable once written (Phase 128a D-V1 precedent); re-tests that contradict open Phase 128b.1 |
| 3 | If PASS — working PoC round-trip exists (the 4-step D-V1 round-trip) | Path E (spike 001 L4 + Plan 04 regression re-run); evidence files at `.planning/spikes/128b-write-back/evidence/pathE-L4-*` (originals at `.planning/spikes/001-tmux-write-back-128b/evidence/`) | The 60s portfolio Loom (C-2 operator wallclock — Plan 08) replays this empirically as the success-criterion proxy artifact |
| 4 | Privilege model sketched in markdown pseudo-code | spike 001 README §"Privilege & portability sketch (D-A2 — markdown only)" lines 182-218 — REFERENCED in §"Privilege & portability sketch" below | The sketch is reused by reference (D-A4 self-containment); the full TypeScript pseudo-code is copied verbatim into the next section with a citation marker |

## Privilege & portability sketch

> Copied below verbatim from `.planning/spikes/001-tmux-write-back-128b/README.md` §"Privilege & portability sketch (D-A2 — markdown only)" lines 182-218. NOT re-derived (D-A2 + RESEARCH §"Criteria Mapping" criterion 4 reuse-by-reference posture).

```typescript
// PSEUDO-CODE — Phase 133 productionizes (G2-REPLY-04)
const ALLOWED_REPLIES = ['yes', 'no', 'continue', 'abort', 'defer'] as const;
type Reply = typeof ALLOWED_REPLIES[number];

interface TmuxTarget {
  socketPath: string;   // $TMPDIR/tmux-$UID/default on macOS, /tmp/tmux-$UID/default on Linux
  sessionName: string;  // unique per-Claude-Code launch (e.g., "vigil-claude-1715712345")
}

function inject(target: TmuxTarget, reply: Reply): void {
  // 1. Allowlist gate — drift-detector test pins this at the call site (G2-REPLY-04)
  if (!ALLOWED_REPLIES.includes(reply)) {
    throw new Error(`disallowed reply: ${reply}`);
  }

  // 2. Privilege drop — already running as operator's user; tmux socket
  // is 0700 to operator. NO setuid, NO ptrace, NO root.

  // 3. Send the reply text + Enter. Note: tmux send-keys accepts the literal
  // string as a single arg, no shell-injection surface for the 5 allowlisted
  // strings (all alphanumeric, no special chars).
  spawnSync('tmux', [
    '-S', target.socketPath,
    'send-keys',
    '-t', target.sessionName,
    reply,
    'Enter',
  ], { stdio: 'inherit' });
}

// 4. For dialog-only dismissal (banner-ack without a typed reply):
function dismissDialog(target: TmuxTarget, choice: 'accept' | 'deny'): void {
  // Default option is "Yes" (1); navigate to "No" (3) requires Down-Down
  const keys = choice === 'accept' ? ['Enter'] : ['Down', 'Down', 'Enter'];
  spawnSync('tmux', ['-S', target.socketPath, 'send-keys', '-t', target.sessionName, ...keys]);
}
```

Production hardening (Phase 133 G2-REPLY-04 scope, NOT this spike):
- Session-discovery: `tmux list-sessions -S <socket> -F '#{session_name}'` to verify target exists before send-keys.
- Rate-limit: max 1 reply per `needs_input` event (track event-id in vigil-tmux-bridge).
- Clobber-protect: refuse to send-keys to a session that doesn't match a known-managed prefix (e.g., `vigil-claude-*`).
- Audit log: append `{ts, session, reply, event_id}` to a redacted ledger.
- macOS-specific (if Phase 133 ever ships a macOS variant): tmux must be installed (`brew install tmux`); operator-facing onboarding documents this.

## Phase 133 Scope-Lock Implications

Per CONTEXT D-V1: "Active-session test passes AND fresh-session test passes ⇒ PASS. Scope-locks Phase 133 to full G2-REPLY-02..04 (DOUBLE_CLICK enter reply mode → cycle 5 prefabs → DOUBLE_CLICK send → reply lands)."

### 1. Writer-process implementation lives in `vigil-tmux-bridge` (Ubuntu daemon), NOT vigil-watch (Mac)

Per the 2026-05-14 architecture shift documented in `.planning/research/SURFACE-MAP.md` §"Recent architecture shift (2026-05-14)" — copied verbatim:

> ### Before
> - **vigil-watch** (Mac): owned write-back to Claude Code via a local Mac tmux session.
> - **Mac**: hosted both the Claude Code dev environment AND the write-back daemon.
> - **Constraint**: vigil-core ↔ vigil-watch was local-network-bound (D-N1 in 128b CONTEXT).
>
> ### After
> - **Claude Code dev environment** moves to **Ubuntu server** (operator personal infra; not publicly exposed).
> - **vigil-tmux-bridge** (new, Ubuntu daemon): owns write-back. Consumes vigil-core's `agent_stream` SSE outbound (no inbound port exposure on Ubuntu); runs `tmux send-keys` locally.
> - **vigil-watch** (Mac): shrinks to **presentation-only** — Companion HUD on Mac screen, G2 event relay. The "watch" name is now slightly misleading because the write-back-detection role evaporated. Rename to `vigil-mac-companion` is a candidate cleanup (see SEED-018).
> - **Local-network constraint** on the write-back path disappears (replaced by outbound HTTPS from Ubuntu to Railway; the remaining local-network leg is G2 ↔ vigil-core, unchanged).

This is **not a re-scope** of Phase 128b (CONTEXT D-A3 correctly leaves writer-process location unspecified). It is a **handoff clarification** for Phase 133 planning.

### 2. Trust-posture rationale (Path E architecture is intentional, not incidental)

Per the unknown-user-profile incident (2026-05-14, vigil-core has had unknown signups), `vigil-tmux-bridge` MUST be a **pull-based consumer** of `agent_stream` SSE outbound — never an inbound-exposed daemon:

- Ubuntu is single-tenant, no inbound exposure, only outbound HTTPS to vigil-core.
- The privileged surface (the tmux socket, `0700` to operator) is never publicly reachable.
- If vigil-core (Railway) is compromised, attacker can SSE-emit allowlisted-string replies — **bounded blast radius = 5 strings** (`yes`/`no`/`continue`/`abort`/`defer`).
- The harder install (Ubuntu daemon) becomes the access boundary: only people with Ubuntu hardware + the operator-token-paste step get write-back capability. PWA-tier users (incl. unknown signups) cannot.

The 5-string allowlist drift-detector test (Phase 133 G2-REPLY-04 success criterion) pins this trust model at the source-of-truth call site.

### 3. Operator workflow target — Ubuntu, not Mac

As of 2026-05-14 the operator is moving the dev environment to a remote Ubuntu server. The "live Claude Code session" the spike validates against IS the Ubuntu tmux. Phase 133 productionizes against:

- `claude` running inside a `vigil-claude` launcher wrapper that wraps the session in a uniquely-named tmux pane (`vigil-claude-<timestamp>` prefix).
- `vigil-tmux-bridge` (systemd unit on Ubuntu) consumes `GET /v1/agent-stream` outbound, filters for `needs_reply` events with allowlisted strings, runs `tmux send-keys -t "$VIGIL_TMUX_SESSION" "$ALLOWLISTED_REPLY" Enter`.
- vigil-watch (Mac) sees `agent_reply_sent` echo back through SSE and renders confirmation banner on the Companion HUD.

The Mac is no longer in the write-path. The Mac is presentation-only.

### 4. Launcher wrapper UX surface (Phase 133 onboarding, NOT 128b)

If operator launches `claude` directly (no tmux wrapper), `vigil-tmux-bridge` cannot reach the input channel. Phase 133 must:
- Detect non-wrapped sessions (e.g., absence of `VIGIL_TMUX_SESSION` env in the running claude's process tree).
- Surface a user-facing "Launch Claude Code via `vigil-claude` to enable G2 replies" warning.
- Gracefully degrade to G2-REPLY-05 banner-ack-only for that session.

### 5. Companion HUD local-network constraint (D-N1 carry-forward, shape changed)

CONTEXT D-N1 noted the Companion HUD currently requires local network. Per the 2026-05-14 shift, this constraint **changes shape** — the Mac-side Companion HUD still needs local network for G2 ↔ vigil-core, but the write-back path (Ubuntu → tmux) is no longer local-network-bound. Phase 133 surfaces the remaining local-network constraint (G2 ↔ vigil-core leg) in the operator UX.

## Trust-Model Asymmetry — INBOUND vs OUTBOUND Injection

> 128b is OUTBOUND injection (Vigil writing TO Claude Code). PITFALLS.md §"Pitfall 6 — Prompt injection via captured thoughts in chat context" addresses INBOUND injection (adversarial content getting into Vigil's chat context). These are different threat models; do not confuse them.

| Direction | Where adversary controls | Threat | Defense |
|-----------|--------------------------|--------|---------|
| **INBOUND** (Pitfall 6) | Captured thoughts content (voice, popup, scrape) | Claude follows injected instructions inside thought context | `<thought>` delimiters + tag-breakout sanitization + injection-heuristic flag + token-budget cap. Defense pattern is **content wrapping**. |
| **OUTBOUND** (this phase) | Replies from G2 → Vigil → Claude Code session | If Vigil is compromised, attacker can drive arbitrary commands into operator's dev environment | 5-string allowlist at the source-of-truth call site (`yes`/`no`/`continue`/`abort`/`defer`) + writer-process drops privileges + tmux socket is `0700` to operator. Defense pattern is **string-set restriction**. |

CHAT-CTX-02's `<thought>` delimiter pattern does NOT apply here — wrapping a 5-string reply in delimiters adds nothing; the defense is that there are ONLY 5 strings, full stop.

## Three Phase 133 implications (verbatim from spike 001 README §"Three Phase 133 implications")

1. **Path E is the recommended primary path.** It satisfies D-V1 PASS, is user-space, requires no ptrace/elevation, and uses a battle-tested IPC. The 5-string allowlist is the only injection surface that reaches `tmux send-keys`.
2. **Launcher wrapper is required.** Phase 133's onboarding step is "operator launches Claude Code via `vigil-claude` (or equivalent)". If the operator launches Claude Code directly, vigil-tmux-bridge should detect (e.g., by absence of `VIGIL_TMUX_SESSION` env in the running claude's process tree) and degrade to G2-REPLY-05 banner-ack-only for that session.
3. **Path E generalizes beyond Claude Code.** Any TTY-reading interactive program in a tmux pane is now a write-back target — including a future "select from list of open tmux sessions, drop into one live" UX (cf. the operator's framing question 2026-05-14 that motivated this spike). This is upside, not in scope for 128b.

## Cost summary

(Aggregated from Plan 06 MEASUREMENTS.md; per RESEARCH §Cost the spike total is <$0.20 against operator's Claude Max OAuth.)

| Path | Wallclock (actual) | Anthropic API cost | Source |
|------|---------------------|---------------------|--------|
| B | 6s | $0.0965 | `pathB-fresh-out.jsonl` + Plan 01 SUMMARY (one-time first-invocation 76,765-token ephemeral 5m+1h cache; re-runs amortize to ~$0.005) |
| A | 39s | ~$0.00 | `pathA-final-pane.txt` + Plan 02 SUMMARY (`claude --resume` against exited session consumed no tokens) |
| D | 6s | ~$0.005 | `pathD-fresh-out.txt` + Plan 03 SUMMARY (one Haiku turn with one tool invocation) |
| E (regression) | 71s | ~$0.01 | `pathE-regression-run.log` + Plan 04 SUMMARY (matches spike 001 §Cost L4 reference) |
| Spike 001 (historical) | 77s | <$0.02 | spike 001 README §Cost (preserved record) |
| C | 0 | $0 | NOT tested — analytical only per RESEARCH §"Open Questions §2"; structurally superseded by Path E |
| **Total (empirical, Plans 01-04)** | **122s** | **~$0.111** | per RESEARCH §Cost ≤$0.20 expected — UNDER (66% of ceiling) |
| **Total (incl. spike 001 historical)** | **199s** | **~$0.131** | per RESEARCH §Cost ≤$0.20 expected — UNDER |

GUARD-03 budget watermark per CONTEXT D-G3 is N/A (≤$0.20 against operator's personal Claude Max auth, not a multi-user budget). Documented for forensic reference.

## Re-activation conditions

*(N/A — verdict is PASS; re-activation conditions only apply to BLOCK/DEGRADE per CONTEXT D-V3 + SEED-003 DMARC pattern.)*

## Cited sources

- CONTEXT D-V1 / D-V2 / D-V3 / D-V4 (verdict gates + mechanical aggregation)
- CONTEXT D-A1 / D-A2 / D-A3 (spike-dir isolation + sketch-only + scope reduction)
- CONTEXT D-A4 artifact list (this file is one of those artifacts)
- REQUIREMENTS.md lines 42-48 (G2-REPLY-01..05 verbatim)
- ROADMAP.md lines 415-426 (Phase 128b goal + 4 success criteria)
- RESEARCH.md §"Per-Path Predicted-Verdict Summary" + §"Criteria Mapping" + §"Phase 133 Scope-Lock Implications" + §"Trust-Model Asymmetry"
- spike 001 README §Results + §"Privilege & portability sketch" + §"Three Phase 133 implications"
- SURFACE-MAP.md §"Recent architecture shift (2026-05-14)"
- PITFALLS.md §"Pitfall 6" lines 167-194 (INBOUND injection — cross-referenced for asymmetry, not extended)
- Plan 06 MEASUREMENTS.md §Cost summary + §Per-path log (consolidated empirical record)
- Per-path TRANSCRIPTs: `.planning/spikes/128b-write-back/evidence/path{A,B,D,E}-TRANSCRIPT.md`
