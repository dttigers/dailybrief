// Phase 124 Plan 07 — Companion screen unit tests.
// Table-driven across 5 event types + banner states + offline indicator
// + N/M + empty state + cycling.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCompanionScreen,
  rebuildCompanionScreen,
  hydrateActiveSessions,
  applyAgentEvent,
  cycleSession,
  ackBanner,
  hasActiveBanner,
  getActiveSessions,
  setSseConnected,
  _resetState,
  _setNow,
  _getBannerState,
} from "../companion.ts";
import type { AgentSessionRow, AgentEventType } from "../../types.ts";

function fakeSession(over: Partial<AgentSessionRow> = {}): AgentSessionRow {
  return {
    sessionId: "sid-1",
    label: "session-label",
    host: "test-host",
    lastEvent: {
      event: "heartbeat",
      message: null,
      eventTimestamp: new Date().toISOString(),
    },
    eventCount: 1,
    ...over,
  };
}

function bodyContentFromBuild(): string {
  const c = rebuildCompanionScreen();
  // RebuildPageContainer.textObject[1] is the body container (index 1 of 3).
  const body = (c as any).textObject[1];
  return body.content as string;
}

test("HUD-01: 3-line render with single session, no banner", () => {
  _resetState();
  hydrateActiveSessions([
    fakeSession({
      label: "myproj",
      lastEvent: {
        event: "heartbeat",
        message: "hb #5",
        eventTimestamp: new Date().toISOString(),
      },
    }),
  ]);
  const body = bodyContentFromBuild();
  const lines = body.split("\n");
  assert.equal(lines.length, 3, "exactly 3 lines");
  assert.equal(lines[0], "myproj");
  assert.equal(lines[1], "running"); // heartbeat → 'running' per STATE_LINE
  assert.equal(lines[2], "hb #5");
});

test("HUD-01: label truncation at 30 chars + ellipsis", () => {
  _resetState();
  const longLabel = "a".repeat(40);
  hydrateActiveSessions([fakeSession({ label: longLabel })]);
  const body = bodyContentFromBuild();
  const line1 = body.split("\n")[0];
  assert.equal(line1.length, 31, "30 chars + '…' = 31 visible chars");
  assert.ok(line1.endsWith("…"));
});

test("HUD-01: state-line mapping for all 5 event types (table-driven)", () => {
  const cases: Array<{ event: AgentEventType; expected: string }> = [
    { event: "needs_input", expected: "waiting for input" },
    { event: "task_complete", expected: "done" },
    { event: "task_failed", expected: "failed" },
    { event: "milestone", expected: "running" },
    { event: "heartbeat", expected: "running" },
  ];
  for (const { event, expected } of cases) {
    _resetState();
    // Phase 124 follow-up changed two things relevant here:
    //   1. hydrate filters task_complete out of the cycle list
    //      (isSessionVisibleInCycle) — so injecting task_complete via
    //      hydrate produces empty state. Use applyAgentEvent for that case.
    //   2. hydrate recomputes persistent banner from cache for needs_input
    //      / task_failed — ack the banner so line 2 falls through to the
    //      state-line mapping. (Banner overlay path is covered separately.)
    if (event === "task_complete") {
      // Seed the session via heartbeat hydrate, then dispatch task_complete
      // via applyAgentEvent (bypasses cycle-filter; sets toast banner +
      // updates state line). Ack to drop the toast.
      hydrateActiveSessions([
        fakeSession({
          lastEvent: {
            event: "heartbeat",
            message: null,
            eventTimestamp: new Date().toISOString(),
          },
        }),
      ]);
      applyAgentEvent({
        sessionId: "sid-1",
        event,
        message: null,
        eventTimestamp: new Date().toISOString(),
      });
      ackBanner();
    } else {
      hydrateActiveSessions([
        fakeSession({
          lastEvent: {
            event,
            message: null,
            eventTimestamp: new Date().toISOString(),
          },
        }),
      ]);
      if (event === "needs_input" || event === "task_failed") {
        ackBanner();
      }
    }
    const body = bodyContentFromBuild();
    assert.equal(
      body.split("\n")[1],
      expected,
      `event ${event} → state line ${expected}`,
    );
  }
});

test("HUD-01: needs_input event sets persistent banner ([NEEDS INPUT] on line 1)", () => {
  _resetState();
  hydrateActiveSessions([fakeSession({ label: "proj" })]);
  const r = applyAgentEvent({
    sessionId: "sid-1",
    event: "needs_input",
    message: "what next?",
    eventTimestamp: new Date().toISOString(),
  });
  assert.equal(r.toastMs, null, "needs_input is persistent (no toast timer)");
  assert.equal(hasActiveBanner(), true);
  const body = bodyContentFromBuild();
  assert.equal(body.split("\n")[0], "[NEEDS INPUT]");
});

test("HUD-01: task_complete is a 3s toast (toastMs=3000); auto-clears via expiresAt", () => {
  _resetState();
  hydrateActiveSessions([fakeSession({ label: "proj" })]);
  let now = 1_000_000;
  _setNow(() => now);
  const r = applyAgentEvent({
    sessionId: "sid-1",
    event: "task_complete",
    message: "all green",
    eventTimestamp: new Date(now).toISOString(),
  });
  assert.equal(r.toastMs, 3000);
  assert.equal(hasActiveBanner(), true, "toast active immediately");
  const body1 = bodyContentFromBuild();
  assert.equal(body1.split("\n")[0], "[DONE]");

  // Advance time past expiresAt
  now += 3001;
  assert.equal(hasActiveBanner(), false, "toast expires after 3s");
  const body2 = bodyContentFromBuild();
  assert.notEqual(body2.split("\n")[0], "[DONE]", "banner cleared in body");
});

test("HUD-01: heartbeat does NOT set banner; updates state line", () => {
  _resetState();
  // Setup: cache contains a heartbeat-only session (no banner-eligible
  // lastEvent). Phase 124 follow-up changed hydrate to recompute banner
  // from cache, so seeding with heartbeat is the cleanest setup that
  // isolates "applyAgentEvent('heartbeat') does not set banner."
  hydrateActiveSessions([
    fakeSession({
      label: "proj",
      lastEvent: {
        event: "heartbeat",
        message: null,
        eventTimestamp: new Date().toISOString(),
      },
    }),
  ]);
  assert.equal(hasActiveBanner(), false, "no banner from heartbeat hydrate");

  const r = applyAgentEvent({
    sessionId: "sid-1",
    event: "heartbeat",
    message: "hb #1",
    eventTimestamp: new Date().toISOString(),
  });
  assert.equal(r.toastMs, null);
  assert.equal(
    hasActiveBanner(),
    false,
    "applyAgentEvent('heartbeat') still does not set banner",
  );
  const body = bodyContentFromBuild();
  assert.equal(body.split("\n")[1], "running");
});

test("HUD-01: empty state — 'No active sessions' / 'idle' / 'No Claude Code activity yet'", () => {
  _resetState();
  hydrateActiveSessions([]);
  const body = bodyContentFromBuild();
  const lines = body.split("\n");
  assert.equal(lines[0], "No active sessions");
  assert.equal(lines[1], "idle");
  assert.equal(lines[2], "No Claude Code activity yet");
});

test("HUD-01: N/M indicator on header rightSide when ≥2 sessions", () => {
  _resetState();
  hydrateActiveSessions([
    fakeSession({ sessionId: "s1" }),
    fakeSession({ sessionId: "s2" }),
    fakeSession({ sessionId: "s3" }),
  ]);
  const c = rebuildCompanionScreen();
  const header = (c as any).textObject[0];
  const headerContent = header.content as string;
  // currentSessionIndex starts at 0 → '1/3'
  assert.ok(
    /1\/3/.test(headerContent),
    `N/M visible in header content; got: ${headerContent}`,
  );
});

test("HUD-01: offline indicator '!' prefix when sseConnected=false", () => {
  _resetState();
  hydrateActiveSessions([fakeSession()]);
  setSseConnected(false);
  const c = rebuildCompanionScreen();
  const header = (c as any).textObject[0];
  const headerContent = header.content as string;
  assert.ok(
    headerContent.includes("!"),
    `'!' in header rightSide; got: ${headerContent}`,
  );
});

test("HUD-01: offline + N/M combined — '! 1/3' shape", () => {
  _resetState();
  hydrateActiveSessions([
    fakeSession({ sessionId: "s1" }),
    fakeSession({ sessionId: "s2" }),
    fakeSession({ sessionId: "s3" }),
  ]);
  setSseConnected(false);
  const c = rebuildCompanionScreen();
  const header = (c as any).textObject[0];
  const headerContent = header.content as string;
  assert.ok(
    /!\s*1\/3/.test(headerContent),
    `combined indicator; got: ${headerContent}`,
  );
});

test("HUD-02: cycleSession advances index 0→1→2→0 (wraps)", () => {
  _resetState();
  hydrateActiveSessions([
    fakeSession({ sessionId: "a" }),
    fakeSession({ sessionId: "b" }),
    fakeSession({ sessionId: "c" }),
  ]);
  assert.equal(getActiveSessions().length, 3);
  cycleSession();
  cycleSession();
  cycleSession();
  // Back to index 0
  // (currentSessionIndex isn't directly exposed, but bodyContent line 1
  // reflects the active session's label — all 3 fake sessions share label
  // by default. Use the rightSide N/M instead.)
  const c = rebuildCompanionScreen();
  const headerContent = (c as any).textObject[0].content as string;
  // After 3 cycles from index 0: 0→1→2→0, so we're back at 1/3
  assert.ok(
    /1\/3/.test(headerContent),
    `after 3 cycles, back to 1/3; got: ${headerContent}`,
  );
});

test("HUD-02: ackBanner clears persistent banner", () => {
  _resetState();
  hydrateActiveSessions([fakeSession({ sessionId: "s1" })]);
  applyAgentEvent({
    sessionId: "s1",
    event: "needs_input",
    message: "x",
    eventTimestamp: new Date().toISOString(),
  });
  assert.equal(hasActiveBanner(), true);
  ackBanner();
  assert.equal(hasActiveBanner(), false);
  assert.equal(_getBannerState(), null);
});

test("buildCompanionScreen returns CreateStartUpPageContainer with 3 textObject entries", () => {
  _resetState();
  hydrateActiveSessions([fakeSession()]);
  const c = buildCompanionScreen();
  const containers = (c as any).textObject as unknown[];
  assert.equal(containers.length, 3, "header + body + footer");
});

test("Footer copy: '() double-tap' when no banner; '() ack banner' when banner active", () => {
  _resetState();
  hydrateActiveSessions([fakeSession({ sessionId: "s1" })]);

  const noBanner = (rebuildCompanionScreen() as any).textObject[2]
    .content as string;
  assert.ok(
    noBanner.includes("double-tap"),
    `no-banner footer: ${noBanner}`,
  );

  applyAgentEvent({
    sessionId: "s1",
    event: "needs_input",
    message: "x",
    eventTimestamp: new Date().toISOString(),
  });
  const withBanner = (rebuildCompanionScreen() as any).textObject[2]
    .content as string;
  assert.ok(
    withBanner.includes("ack banner"),
    `banner footer: ${withBanner}`,
  );
});

// ── Phase 124 follow-up — Finding 2: D-06 cycle-list filter ─────────
// Surfaced during sim E2E: stale + task_complete sessions appeared in the
// cycle, so user could DOUBLE_CLICK their way to a `dailybrief / done /
// stop_reason=end_turn` session that ended hours ago. hydrate now applies
// `isSessionVisibleInCycle` (5min stale cutoff + drop task_complete; keep
// task_failed so its banner can still show).

test("Finding 2: hydrate filters out stale (>5min) sessions from cycle list", () => {
  _resetState();
  let now = 100_000_000_000;
  _setNow(() => now);
  const fresh = fakeSession({
    sessionId: "fresh",
    lastEvent: {
      event: "heartbeat",
      message: null,
      eventTimestamp: new Date(now - 60_000).toISOString(), // 1min ago
    },
  });
  const stale = fakeSession({
    sessionId: "stale",
    lastEvent: {
      event: "heartbeat",
      message: null,
      eventTimestamp: new Date(now - 6 * 60_000).toISOString(), // 6min ago
    },
  });
  hydrateActiveSessions([fresh, stale]);
  const visible = getActiveSessions().map((s) => s.sessionId);
  assert.deepEqual(visible, ["fresh"], "stale session filtered out");
});

test("Finding 2: hydrate filters out task_complete sessions from cycle list", () => {
  _resetState();
  let now = 100_000_000_000;
  _setNow(() => now);
  const recent = new Date(now - 30_000).toISOString(); // 30s ago — fresh
  const heartbeat = fakeSession({
    sessionId: "running",
    lastEvent: { event: "heartbeat", message: null, eventTimestamp: recent },
  });
  const completed = fakeSession({
    sessionId: "done",
    lastEvent: { event: "task_complete", message: null, eventTimestamp: recent },
  });
  hydrateActiveSessions([heartbeat, completed]);
  const visible = getActiveSessions().map((s) => s.sessionId);
  assert.deepEqual(visible, ["running"], "task_complete filtered from cycle");
});

test("Finding 2: hydrate KEEPS task_failed sessions in cycle (banner needs ack)", () => {
  _resetState();
  let now = 100_000_000_000;
  _setNow(() => now);
  const recent = new Date(now - 30_000).toISOString();
  const failed = fakeSession({
    sessionId: "broken",
    lastEvent: { event: "task_failed", message: "boom", eventTimestamp: recent },
  });
  hydrateActiveSessions([failed]);
  const visible = getActiveSessions().map((s) => s.sessionId);
  assert.deepEqual(visible, ["broken"], "task_failed retained for ack visibility");
});

// ── Phase 124 follow-up — Finding 1: banner-on-cycle ────────────────
// Surfaced during sim E2E: cycling onto a needs_input/task_failed session
// (whose banner was set in a prior live SSE delivery, never seen by user)
// did not re-show the banner overlay. State-line said "waiting for input"
// but line 1 still showed the session label, not [NEEDS INPUT]. Now hydrate
// + cycleSession recompute the persistent banner from current session's
// lastEvent unless the user already ack'd that specific (sessionId,
// eventTimestamp) key.

test("Finding 1: hydrate sets persistent banner if current session lastEvent is needs_input (unacked)", () => {
  _resetState();
  hydrateActiveSessions([
    fakeSession({
      sessionId: "s1",
      lastEvent: {
        event: "needs_input",
        message: "decide auth",
        eventTimestamp: new Date().toISOString(),
      },
    }),
  ]);
  assert.equal(hasActiveBanner(), true, "banner reconstructed from cache");
  const body = bodyContentFromBuild();
  assert.equal(body.split("\n")[0], "[NEEDS INPUT]");
});

test("Finding 1: hydrate sets persistent banner for task_failed (unacked)", () => {
  _resetState();
  hydrateActiveSessions([
    fakeSession({
      sessionId: "s1",
      lastEvent: {
        event: "task_failed",
        message: "build failed",
        eventTimestamp: new Date().toISOString(),
      },
    }),
  ]);
  assert.equal(hasActiveBanner(), true);
  const body = bodyContentFromBuild();
  assert.equal(body.split("\n")[0], "[TASK FAILED]");
});

test("Finding 1: cycleSession sets banner when landing on unacked needs_input session", () => {
  _resetState();
  hydrateActiveSessions([
    fakeSession({
      sessionId: "running",
      lastEvent: {
        event: "heartbeat",
        message: null,
        eventTimestamp: new Date().toISOString(),
      },
    }),
    fakeSession({
      sessionId: "asking",
      lastEvent: {
        event: "needs_input",
        message: "decide",
        eventTimestamp: new Date().toISOString(),
      },
    }),
  ]);
  // currentSessionIndex is 0 (heartbeat session); banner-from-hydrate should
  // be null because current session is not banner-eligible.
  assert.equal(hasActiveBanner(), false, "no banner on heartbeat session");

  cycleSession(); // → index 1 → 'asking' (needs_input)
  assert.equal(hasActiveBanner(), true, "cycling onto needs_input shows banner");
  assert.equal(bodyContentFromBuild().split("\n")[0], "[NEEDS INPUT]");
});

test("Finding 1: ack persists across cycles — same banner does NOT re-show", () => {
  _resetState();
  const ts = new Date().toISOString();
  hydrateActiveSessions([
    fakeSession({
      sessionId: "asking",
      lastEvent: { event: "needs_input", message: "decide", eventTimestamp: ts },
    }),
    fakeSession({
      sessionId: "running",
      lastEvent: {
        event: "heartbeat",
        message: null,
        eventTimestamp: new Date().toISOString(),
      },
    }),
  ]);
  assert.equal(hasActiveBanner(), true, "initial banner from hydrate");
  ackBanner();
  assert.equal(hasActiveBanner(), false, "banner cleared by ack");

  cycleSession(); // → index 1 (heartbeat) — no banner
  assert.equal(hasActiveBanner(), false);
  cycleSession(); // → index 0 (back to acked needs_input) — should NOT re-show
  assert.equal(
    hasActiveBanner(),
    false,
    "acked banner does not re-show after cycle wraparound",
  );
});

test("Finding 1: NEW event (different eventTimestamp) on acked session re-triggers banner", () => {
  _resetState();
  hydrateActiveSessions([
    fakeSession({
      sessionId: "asking",
      lastEvent: {
        event: "needs_input",
        message: "v1",
        eventTimestamp: "2026-05-10T03:00:00.000Z",
      },
    }),
  ]);
  ackBanner();
  assert.equal(hasActiveBanner(), false, "v1 needs_input acked");

  // Claude Code asks again — new event with new timestamp
  applyAgentEvent({
    sessionId: "asking",
    event: "needs_input",
    message: "v2",
    eventTimestamp: "2026-05-10T03:05:00.000Z",
  });
  assert.equal(
    hasActiveBanner(),
    true,
    "new (sessionId, eventTimestamp) key re-triggers banner",
  );
});

test("Finding 1: hydrate preserves currentSession identity across server reorder", () => {
  // Live SSE delivered s1 → s2 → s3, leaving currentSessionIndex pointing
  // at s3 in cache [s1, s2, s3]. Then user navigates to Companion, which
  // calls fetchAgentSessions() — server returns by eventTimestamp DESC
  // with insertion-order tiebreaker, giving cache [s2, s3, s1] (or any
  // order where s3 is NOT at index 2). Without identity preservation,
  // currentSessionIndex=2 would now point at s1 (heartbeat) and recompute
  // would clear the s3 task_failed banner. Bug surfaced via sim E2E.
  _resetState();
  // Simulate the live-SSE end state via direct hydrate + applyAgentEvent.
  // _setNow → fix the wall clock so the test sessions don't fall outside
  // the 5min cycle-visibility window during the test run.
  _setNow(() => new Date("2026-05-10T03:00:30.000Z").getTime());
  hydrateActiveSessions([
    fakeSession({
      sessionId: "s1",
      label: "s1-label",
      lastEvent: {
        event: "heartbeat",
        message: null,
        eventTimestamp: "2026-05-10T03:00:00.000Z",
      },
    }),
    fakeSession({
      sessionId: "s2",
      label: "s2-label",
      lastEvent: {
        event: "needs_input",
        message: "decide",
        eventTimestamp: "2026-05-10T03:00:01.000Z",
      },
    }),
    fakeSession({
      sessionId: "s3",
      label: "s3-label",
      lastEvent: {
        event: "task_failed",
        message: "boom",
        eventTimestamp: "2026-05-10T03:00:02.000Z",
      },
    }),
  ]);
  // applyAgentEvent for s3 task_failed sets currentSessionIndex to s3's index.
  applyAgentEvent({
    sessionId: "s3",
    event: "task_failed",
    message: "boom",
    eventTimestamp: "2026-05-10T03:00:02.000Z",
  });
  assert.equal(getActiveSessions()[2].sessionId, "s3");
  assert.equal(hasActiveBanner(), true, "live event sets banner");

  // Simulate the server reordering on next hydrate: [s2, s3, s1].
  hydrateActiveSessions([
    fakeSession({
      sessionId: "s2",
      label: "s2-label",
      lastEvent: {
        event: "needs_input",
        message: "decide",
        eventTimestamp: "2026-05-10T03:00:01.000Z",
      },
    }),
    fakeSession({
      sessionId: "s3",
      label: "s3-label",
      lastEvent: {
        event: "task_failed",
        message: "boom",
        eventTimestamp: "2026-05-10T03:00:02.000Z",
      },
    }),
    fakeSession({
      sessionId: "s1",
      label: "s1-label",
      lastEvent: {
        event: "heartbeat",
        message: null,
        eventTimestamp: "2026-05-10T03:00:00.000Z",
      },
    }),
  ]);
  // Identity preservation: should still be on s3 (now at index 1).
  assert.equal(getActiveSessions()[1].sessionId, "s3", "s3 at new index 1");
  assert.equal(
    hasActiveBanner(),
    true,
    "banner survives hydrate-reorder (identity preserved)",
  );
  const body = bodyContentFromBuild();
  assert.equal(
    body.split("\n")[0],
    "[TASK FAILED]",
    "banner overlay still rendered after server reorder",
  );
});

test("Finding 1: hydrate falls back to index 0 if previous session filtered out", () => {
  _resetState();
  let now = 100_000_000_000;
  _setNow(() => now);
  // Setup: cache contains 2 sessions; user is viewing the second.
  hydrateActiveSessions([
    fakeSession({
      sessionId: "fresh",
      label: "fresh-label",
      lastEvent: {
        event: "heartbeat",
        message: null,
        eventTimestamp: new Date(now - 30_000).toISOString(),
      },
    }),
    fakeSession({
      sessionId: "going-stale",
      label: "going-stale-label",
      lastEvent: {
        event: "heartbeat",
        message: null,
        eventTimestamp: new Date(now - 60_000).toISOString(),
      },
    }),
  ]);
  // Cycle to second session.
  cycleSession();
  assert.equal(getActiveSessions()[1].sessionId, "going-stale");

  // Advance time so 'going-stale' becomes stale (>5min).
  now += 6 * 60_000;
  // Hydrate again with same data — 'going-stale' now filtered out.
  hydrateActiveSessions([
    fakeSession({
      sessionId: "fresh",
      label: "fresh-label",
      lastEvent: {
        event: "heartbeat",
        message: null,
        eventTimestamp: new Date(now - 30_000).toISOString(),
      },
    }),
    fakeSession({
      sessionId: "going-stale",
      label: "going-stale-label",
      lastEvent: {
        event: "heartbeat",
        message: null,
        eventTimestamp: new Date(now - 6 * 60_000).toISOString(),
      },
    }),
  ]);
  assert.equal(
    getActiveSessions().length,
    1,
    "stale session filtered, only fresh remains",
  );
  // Previous session 'going-stale' is gone — fall back to index 0 = 'fresh'.
  const body = bodyContentFromBuild();
  assert.equal(
    body.split("\n")[0],
    "fresh-label",
    "fall back to index 0 when previous session filtered out",
  );
});

test("Finding 1: cycling away from banner clears it (not stuck on prior session's banner)", () => {
  _resetState();
  hydrateActiveSessions([
    fakeSession({
      sessionId: "asking",
      lastEvent: {
        event: "needs_input",
        message: "decide",
        eventTimestamp: new Date().toISOString(),
      },
    }),
    fakeSession({
      sessionId: "running",
      lastEvent: {
        event: "heartbeat",
        message: null,
        eventTimestamp: new Date().toISOString(),
      },
    }),
  ]);
  assert.equal(hasActiveBanner(), true, "banner from hydrate (idx=0 needs_input)");
  cycleSession(); // → idx 1 (heartbeat)
  assert.equal(
    hasActiveBanner(),
    false,
    "cycling onto non-banner session clears banner",
  );
});

// ── Phase 125 Wave 0 (AGENT-HUD-03 / D-02 / UI-SPEC) ────────────────
// setQuietMode mutator + Q glyph in header rightSide + buildContainers
// allowlist filter (defense-in-depth — server suppression is primary).
// Plan 06 turns these green by replacing { skip: PLAN_06_COMP } with
// the asserted bodies, after adding setQuietMode/isQuietMode exports
// + computeRightSide Q-glyph branch + buildContainers allowlist guard.
// (`test` and `assert` already imported above — no re-import needed.)

const PLAN_06_COMP = "TODO(125-06): pending implementation — companion.ts setQuietMode + Q glyph + ALLOWLIST filter"

test("setQuietMode(true) toggles module-level quietMode ref to true", { skip: PLAN_06_COMP }, () => {
  // TODO(125-06): import { setQuietMode, isQuietMode } from '../companion.ts';
  // _resetState(); setQuietMode(true); assert isQuietMode() === true.
  assert.fail('placeholder')
})

test("isQuietMode() reflects setQuietMode value", { skip: PLAN_06_COMP }, () => {
  // TODO(125-06): _resetState(); assert isQuietMode() === false (default);
  // setQuietMode(true); assert isQuietMode() === true; setQuietMode(false); assert false.
  assert.fail('placeholder')
})

test("computeRightSide() prepends 'Q' when isQuietMode()=true (UI-SPEC priority order)", { skip: PLAN_06_COMP }, () => {
  // TODO(125-06): _resetState(); setQuietMode(true);
  // hydrate single online session; rebuild; assert header rightSide
  // contains 'Q' as the leftmost glyph (Q before any !/N/M).
  assert.fail('placeholder')
})

test("computeRightSide() with quiet=true + offline + 2/3 sessions returns 'Q ! 2/3' (UI-SPEC table row 1)", { skip: PLAN_06_COMP }, () => {
  // TODO(125-06): _resetState(); setQuietMode(true); setSseConnected(false);
  // hydrate 3 sessions; cycle to idx 1; rebuild; assert header rightSide matches /Q\s*!\s*2\/3/.
  assert.fail('placeholder')
})

test("computeRightSide() with quiet=false matches Phase 124 baseline (Q glyph absent)", { skip: PLAN_06_COMP }, () => {
  // TODO(125-06): _resetState(); setQuietMode(false); hydrate 1 online session;
  // rebuild; assert header rightSide does NOT contain 'Q' (Phase 124 byte-equality
  // path preserved — D-14 invariant carryover).
  assert.fail('placeholder')
})

test("buildContainers() with quietMode=true and non-allowlist banner suppresses banner overlay (defense-in-depth)", { skip: PLAN_06_COMP }, () => {
  // TODO(125-06): _resetState(); setQuietMode(true);
  // dispatch task_complete (not in allowlist); assert hasActiveBanner() may be true
  // in cache but rebuildCompanionScreen body line 1 does NOT show '[DONE]' overlay
  // (HUD-write filter blocks it).
  assert.fail('placeholder')
})

test("buildContainers() with quietMode=true and needs_input banner STILL renders (allowlist passes through)", { skip: PLAN_06_COMP }, () => {
  // TODO(125-06): _resetState(); setQuietMode(true);
  // dispatch needs_input; assert rebuildCompanionScreen body line 1 === '[NEEDS INPUT]'
  // (allowlist exempts banner-write filter — HUD glanceability for actionable events).
  assert.fail('placeholder')
})
