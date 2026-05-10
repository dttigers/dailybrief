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
    // For needs_input/task_failed/task_complete/milestone, the banner
    // overlay shows '[BANNER]' on line 1 instead of label. To test the
    // STATE_LINE mapping we need NO banner — easiest is to inject the
    // session via hydrate (no event) and bypass applyAgentEvent.
    hydrateActiveSessions([
      fakeSession({
        lastEvent: {
          event,
          message: null,
          eventTimestamp: new Date().toISOString(),
        },
      }),
    ]);
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
  hydrateActiveSessions([
    fakeSession({
      label: "proj",
      lastEvent: {
        event: "needs_input",
        message: "x",
        eventTimestamp: new Date().toISOString(),
      },
    }),
  ]);
  // Pre-condition: needs_input would set a banner. But hydrateActiveSessions
  // does not set bannerState — it only sets the cache. So we explicitly do:
  const r = applyAgentEvent({
    sessionId: "sid-1",
    event: "heartbeat",
    message: "hb #1",
    eventTimestamp: new Date().toISOString(),
  });
  assert.equal(r.toastMs, null);
  assert.equal(hasActiveBanner(), false);
  // State line should now be 'running' (heartbeat)
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
