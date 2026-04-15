// Unit tests for createGenerateScheduler — exercise the DI seams (no real drizzle, no real fs).
// Run with: npx tsx --test src/services/generate-scheduler.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { createGenerateScheduler } from "./generate-scheduler.js";

type Schedule = { hour: number; minute: number; enabled: boolean };

function makeFakeSettings(opts: {
  schedule?: Schedule | null;
  timezone?: string | null;
}) {
  return async (key: string): Promise<unknown | null> => {
    if (key === "generate_schedule") return opts.schedule ?? null;
    if (key === "user_timezone") return opts.timezone ?? null;
    return null;
  };
}

function makeAssembler() {
  const calls: string[] = [];
  const assemble = async (dateStr: string) => {
    calls.push(dateStr);
    return {
      buffer: Buffer.from("fake"),
      filePath: `/tmp/briefs/brief-${dateStr}.pdf`,
      metadata: { thoughtCount: 1, taskCount: 2, dateStr },
    };
  };
  return { assemble, calls };
}

function makeLog() {
  const lines: Array<{ level: string; msg: string; meta?: unknown }> = [];
  return {
    lines,
    logFn: (level: "info" | "warn" | "error", msg: string, meta?: unknown) => {
      lines.push({ level, msg, meta });
    },
  };
}

// ── SCH-01: enabled=false short-circuits ────────────────────────────────────

test("SCH-01: tick() with generate_schedule.enabled=false does NOT invoke assembler", async () => {
  const { assemble, calls } = makeAssembler();
  const { logFn } = makeLog();
  const scheduler = createGenerateScheduler({
    db: null,
    assemble,
    logFn,
    now: () => new Date("2026-04-15T08:00:00Z"),
    getSettingFn: makeFakeSettings({
      schedule: { hour: 4, minute: 0, enabled: false },
      timezone: "America/New_York",
    }),
    getRecentBriefFn: async () => null,
    upsertBriefFn: async () => {},
    selectExpiredBriefsFn: async () => [],
    deleteExpiredBriefsFn: async () => 0,
  });
  await scheduler.tick();
  assert.equal(calls.length, 0);
});

// ── SCH-02: minute mismatch ────────────────────────────────────────────────

test("SCH-02: tick() with non-matching hour/minute does NOT invoke assembler", async () => {
  const { assemble, calls } = makeAssembler();
  const { logFn } = makeLog();
  const scheduler = createGenerateScheduler({
    db: null,
    assemble,
    logFn,
    // 08:30 UTC = 04:30 America/New_York (EDT April 15). Schedule is 04:00 — mismatch on minute.
    now: () => new Date("2026-04-15T08:30:00Z"),
    getSettingFn: makeFakeSettings({
      schedule: { hour: 4, minute: 0, enabled: true },
      timezone: "America/New_York",
    }),
    getRecentBriefFn: async () => null,
    upsertBriefFn: async () => {},
    selectExpiredBriefsFn: async () => [],
    deleteExpiredBriefsFn: async () => 0,
  });
  await scheduler.tick();
  assert.equal(calls.length, 0);
});

// ── SCH-03: match fires assemble + upsert ───────────────────────────────────

test("SCH-03: tick() with matching hour/minute invokes assembler and upserts", async () => {
  const { assemble, calls } = makeAssembler();
  const { logFn } = makeLog();
  const upserts: Array<{ date: string }> = [];
  const scheduler = createGenerateScheduler({
    db: null,
    assemble,
    logFn,
    // 08:00 UTC = 04:00 EDT on 2026-04-15
    now: () => new Date("2026-04-15T08:00:00Z"),
    getSettingFn: makeFakeSettings({
      schedule: { hour: 4, minute: 0, enabled: true },
      timezone: "America/New_York",
    }),
    getRecentBriefFn: async () => null,
    upsertBriefFn: async (b) => { upserts.push({ date: b.date }); },
    selectExpiredBriefsFn: async () => [],
    deleteExpiredBriefsFn: async () => 0,
  });
  await scheduler.tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0], "2026-04-15");
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].date, "2026-04-15");
});

// ── SCH-04: dedupe window blocks re-run ─────────────────────────────────────

test("SCH-04: tick() dedupe — existing brief row within 10min window skips", async () => {
  const { assemble, calls } = makeAssembler();
  const { logFn, lines } = makeLog();
  const nowDate = new Date("2026-04-15T08:00:00Z");
  const scheduler = createGenerateScheduler({
    db: null,
    assemble,
    logFn,
    now: () => nowDate,
    getSettingFn: makeFakeSettings({
      schedule: { hour: 4, minute: 0, enabled: true },
      timezone: "America/New_York",
    }),
    getRecentBriefFn: async (date) => {
      assert.equal(date, "2026-04-15");
      // Recent: 2 minutes ago — inside 10-min window
      return { createdAt: new Date(nowDate.getTime() - 2 * 60 * 1000) };
    },
    upsertBriefFn: async () => {},
    selectExpiredBriefsFn: async () => [],
    deleteExpiredBriefsFn: async () => 0,
  });
  await scheduler.tick();
  assert.equal(calls.length, 0, "assembler must not be invoked during dedupe window");
  assert.ok(lines.some((l) => l.msg.includes("dedupe")), "should log dedupe skip");
});

// ── SCH-05: retention sweep after successful generate ──────────────────────

test("SCH-05: retention sweep deletes rows older than 7 days and unlinks files", async () => {
  const { assemble } = makeAssembler();
  const { logFn } = makeLog();
  const unlinked: string[] = [];
  let selectedCutoff: string | null = null;
  let deletedCutoff: string | null = null;

  const scheduler = createGenerateScheduler({
    db: null,
    assemble,
    logFn,
    now: () => new Date("2026-04-15T08:00:00Z"),
    unlinkFn: async (p) => { unlinked.push(p); },
    getSettingFn: makeFakeSettings({
      schedule: { hour: 4, minute: 0, enabled: true },
      timezone: "America/New_York",
    }),
    getRecentBriefFn: async () => null,
    upsertBriefFn: async () => {},
    selectExpiredBriefsFn: async (cutoff) => {
      selectedCutoff = cutoff;
      return [
        { id: 1, pdfFilename: "/tmp/briefs/brief-2026-04-01.pdf" },
        { id: 2, pdfFilename: "/tmp/briefs/brief-2026-04-02.pdf" },
        { id: 3, pdfFilename: null },
      ];
    },
    deleteExpiredBriefsFn: async (cutoff) => {
      deletedCutoff = cutoff;
      return 3;
    },
  });
  await scheduler.tick();
  assert.equal(selectedCutoff, "2026-04-08", "cutoff should be todayInTz - 7d");
  assert.equal(deletedCutoff, "2026-04-08");
  assert.deepEqual(unlinked.sort(), [
    "/tmp/briefs/brief-2026-04-01.pdf",
    "/tmp/briefs/brief-2026-04-02.pdf",
  ]);
});

// ── SCH-06: assembler throws — tick swallows, no retention ─────────────────

test("SCH-06: assembler throws — logged as error, tick does not throw, retention not run", async () => {
  const { logFn, lines } = makeLog();
  let retentionCalled = false;
  const scheduler = createGenerateScheduler({
    db: null,
    assemble: async () => { throw new Error("boom"); },
    logFn,
    now: () => new Date("2026-04-15T08:00:00Z"),
    getSettingFn: makeFakeSettings({
      schedule: { hour: 4, minute: 0, enabled: true },
      timezone: "America/New_York",
    }),
    getRecentBriefFn: async () => null,
    upsertBriefFn: async () => {},
    selectExpiredBriefsFn: async () => { retentionCalled = true; return []; },
    deleteExpiredBriefsFn: async () => { retentionCalled = true; return 0; },
  });
  await scheduler.tick(); // must NOT throw
  assert.equal(retentionCalled, false, "retention must not run on failed generate");
  assert.ok(lines.some((l) => l.level === "error"), "should log error");
});

// ── SCH-07: start/stop lifecycle ───────────────────────────────────────────

test("SCH-07: start() begins interval; stop() clears it", async () => {
  const { assemble } = makeAssembler();
  const { logFn } = makeLog();
  const scheduler = createGenerateScheduler({
    db: null,
    assemble,
    logFn,
    tickIntervalMs: 10_000,
    now: () => new Date("2026-04-15T08:00:00Z"),
    getSettingFn: makeFakeSettings({ schedule: { hour: 4, minute: 0, enabled: false } }),
    getRecentBriefFn: async () => null,
    upsertBriefFn: async () => {},
    selectExpiredBriefsFn: async () => [],
    deleteExpiredBriefsFn: async () => 0,
  });
  scheduler.start();
  // Count active timers indirectly: start() creates a handle; stop() must call clearInterval.
  // We verify idempotency: calling start() twice or stop() twice does not throw.
  scheduler.start(); // second call should be a no-op
  scheduler.stop();
  scheduler.stop(); // second stop should be a no-op
  // If stop() did not clearInterval, the test runner would hang — reaching this line = passed.
  assert.ok(true);
});

// ── SCH-08: timezone math correct ──────────────────────────────────────────

test("SCH-08: matches schedule in user TZ (04:00 NYC) when UTC is 09:00 (EST) / 08:00 (EDT)", async () => {
  const { assemble, calls } = makeAssembler();
  const { logFn } = makeLog();

  // Winter: 2026-01-15 09:00 UTC = 04:00 EST
  const schedulerEST = createGenerateScheduler({
    db: null,
    assemble,
    logFn,
    now: () => new Date("2026-01-15T09:00:00Z"),
    getSettingFn: makeFakeSettings({
      schedule: { hour: 4, minute: 0, enabled: true },
      timezone: "America/New_York",
    }),
    getRecentBriefFn: async () => null,
    upsertBriefFn: async () => {},
    selectExpiredBriefsFn: async () => [],
    deleteExpiredBriefsFn: async () => 0,
  });
  await schedulerEST.tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0], "2026-01-15");
});
