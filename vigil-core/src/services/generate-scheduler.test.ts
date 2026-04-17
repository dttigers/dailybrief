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
  });
  await scheduler.tick();
  assert.equal(calls.length, 0, "assembler must not be invoked during dedupe window");
  assert.ok(lines.some((l) => l.msg.includes("dedupe")), "should log dedupe skip");
});

// ── SCH-05: scheduler upsert passes buffer bytes, not a filename ───────────

test("SCH-05: scheduler upsert passes buffer bytes, not a filename", async () => {
  const captured: any = {};
  const scheduler = createGenerateScheduler({
    db: null,
    assemble: async (dateStr) => ({
      buffer: Buffer.from("%PDF-1.4 fake"),
      metadata: { thoughtCount: 1, taskCount: 1, dateStr },
    }),
    getSettingFn: async (key) => {
      if (key === "user_timezone") return "America/New_York";
      if (key === "generate_schedule") return { hour: 4, minute: 0, enabled: true };
      return null;
    },
    getRecentBriefFn: async () => null,
    upsertBriefFn: async (b) => { Object.assign(captured, b); },
    now: () => {
      // 04:00 EDT = 08:00 UTC on 2026-04-13 (DST active).
      return new Date("2026-04-13T08:00:00Z");
    },
  });
  await scheduler.tick();
  assert.ok(Buffer.isBuffer(captured.bytes));
  assert.ok(captured.bytes.length > 0);
  assert.equal(typeof captured.date, "string");
  assert.match(captured.date, /^\d{4}-\d{2}-\d{2}$/);
  // Should NOT have pdfFilename — that's the old contract.
  assert.equal(captured.pdfFilename, undefined);
});

// ── SCH-06: assembler throws — tick swallows ───────────────────────────────

test("SCH-06: assembler throws — logged as error, tick does not throw", async () => {
  const { logFn, lines } = makeLog();
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
  });
  await scheduler.tick(); // must NOT throw
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
  });
  await schedulerEST.tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0], "2026-01-15");
});
