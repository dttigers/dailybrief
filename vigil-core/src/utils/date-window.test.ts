import { test } from "node:test";
import assert from "node:assert/strict";
import { getCurrentWeekWindow, getRollingDayWindow } from "./date-window.js";

// ── getCurrentWeekWindow tests ────────────────────────────────────────────────

test("DW-01: Thursday returns most recent Wednesday as start (America/New_York EST)", () => {
  // Thursday 2024-01-11 12:00:00 UTC = Thursday 07:00 ET (EST = UTC-5)
  const now = new Date("2024-01-11T12:00:00Z");
  const { start, end } = getCurrentWeekWindow("America/New_York", now);
  // Most recent Wednesday in ET: 2024-01-10 00:00 ET = 2024-01-10T05:00:00.000Z
  assert.equal(start.toISOString(), "2024-01-10T05:00:00.000Z");
  // Next Wednesday in ET: 2024-01-17 00:00 ET = 2024-01-17T05:00:00.000Z
  assert.equal(end.toISOString(), "2024-01-17T05:00:00.000Z");
});

test("DW-02: Wednesday exactly at 00:00 ET — start equals now", () => {
  // 2024-01-10T05:00:00.000Z = Wednesday 00:00 ET (EST = UTC-5)
  const now = new Date("2024-01-10T05:00:00.000Z");
  const { start } = getCurrentWeekWindow("America/New_York", now);
  // daysSinceWed === 0, so start === Wed 00:00 ET = now
  assert.equal(start.toISOString(), "2024-01-10T05:00:00.000Z");
});

test("DW-03: Wednesday 23:59:59 ET — same start as DW-02 (still in current Wed window)", () => {
  // 2024-01-10T23:59:59Z = Wednesday 18:59:59 ET (EST = UTC-5, 23:59:59 - 5 = 18:59:59)
  const now = new Date("2024-01-10T23:59:59Z");
  const { start } = getCurrentWeekWindow("America/New_York", now);
  // Still Wednesday in ET — start is same Wed 00:00 ET
  assert.equal(start.toISOString(), "2024-01-10T05:00:00.000Z");
});

test("DW-04: Tuesday 18:59:59 ET — start is 6-day lookback (same Wed as DW-02)", () => {
  // 2024-01-16T23:59:59Z = Tuesday 18:59:59 ET (EST = UTC-5)
  const now = new Date("2024-01-16T23:59:59Z");
  const { start } = getCurrentWeekWindow("America/New_York", now);
  // 6 days since last Wed → same Wed 2024-01-10 00:00 ET
  assert.equal(start.toISOString(), "2024-01-10T05:00:00.000Z");
});

test("DW-05: Spring-forward week — Wednesday boundary is UTC-4 (EDT) after DST transition", () => {
  // 2024-03-15T12:00:00Z = Friday 08:00 EDT (DST spring-forward was Sunday 2024-03-10)
  // After spring-forward, America/New_York is UTC-4 (EDT)
  const now = new Date("2024-03-15T12:00:00Z");
  const { start } = getCurrentWeekWindow("America/New_York", now);
  // Most recent Wednesday: 2024-03-13 00:00 EDT = 2024-03-13T04:00:00.000Z (UTC-4)
  assert.equal(start.toISOString(), "2024-03-13T04:00:00.000Z");
});

test("DW-06: Fall-back week — Wednesday boundary is UTC-5 (EST) after DST fall-back", () => {
  // 2024-11-08T12:00:00Z = Friday 07:00 EST (DST fall-back was Sunday 2024-11-03)
  // After fall-back, America/New_York is UTC-5 (EST)
  const now = new Date("2024-11-08T12:00:00Z");
  const { start } = getCurrentWeekWindow("America/New_York", now);
  // Most recent Wednesday: 2024-11-06 00:00 EST = 2024-11-06T05:00:00.000Z (UTC-5)
  assert.equal(start.toISOString(), "2024-11-06T05:00:00.000Z");
});

test("DW-07: Pacific/Kiritimati (+14) — start is Tuesday UTC, hour is 10", () => {
  // Thursday 2024-01-11T12:00:00Z in Kiritimati (+14) is Friday 2024-01-12 02:00 local
  const now = new Date("2024-01-11T12:00:00Z");
  const { start } = getCurrentWeekWindow("Pacific/Kiritimati", now);
  // Wed 00:00 Kiritimati (+14) = Tue 10:00 UTC → getUTCDay() === 2 (Tuesday), getUTCHours() === 10
  assert.equal(start.getUTCDay(), 2, "start should be Tuesday UTC for Kiritimati +14");
  assert.equal(start.getUTCHours(), 10, "start should be at hour 10 UTC for Kiritimati +14 (Wed 00:00 +14 = Tue 10:00 UTC)");
});

test("DW-08: Pacific/Pago_Pago (-11) — start is Wednesday UTC, hour is 11", () => {
  // Thursday 2024-01-11T12:00:00Z in Pago Pago (-11) is Thursday 2024-01-11 01:00 local
  const now = new Date("2024-01-11T12:00:00Z");
  const { start } = getCurrentWeekWindow("Pacific/Pago_Pago", now);
  // Wed 00:00 Pago Pago (-11) = Wed 11:00 UTC → getUTCDay() === 3 (Wednesday), getUTCHours() === 11
  assert.equal(start.getUTCDay(), 3, "start should be Wednesday UTC for Pago Pago -11");
  assert.equal(start.getUTCHours(), 11, "start should be at hour 11 UTC for Pago Pago -11 (Wed 00:00 -11 = Wed 11:00 UTC)");
});

test("DW-09: now is injectable — two different now values yield two different windows", () => {
  const now1 = new Date("2024-01-11T12:00:00Z"); // Thursday in ET
  const now2 = new Date("2024-01-18T12:00:00Z"); // Thursday one week later in ET
  const window1 = getCurrentWeekWindow("America/New_York", now1);
  const window2 = getCurrentWeekWindow("America/New_York", now2);
  assert.notEqual(
    window1.start.getTime(),
    window2.start.getTime(),
    "Different now values must produce different week windows"
  );
});

test("DW-10: same now, America/New_York vs America/Los_Angeles — starts differ by 3 hours", () => {
  const now = new Date("2024-01-11T12:00:00Z"); // Thursday
  const nyWindow = getCurrentWeekWindow("America/New_York", now);
  const laWindow = getCurrentWeekWindow("America/Los_Angeles", now);
  // ET = UTC-5 → Wed 00:00 ET = Wed 05:00 UTC
  // PT = UTC-8 → Wed 00:00 PT = Wed 08:00 UTC
  // Difference = 3 hours = 3 * 3600 * 1000 ms
  const diffMs = laWindow.start.getTime() - nyWindow.start.getTime();
  assert.equal(diffMs, 3 * 3600 * 1000, "LA window start should be 3 hours later (UTC) than NY window start");
});

test("DW-11: invalid tz string throws RangeError", () => {
  const now = new Date("2024-01-11T12:00:00Z");
  assert.throws(
    () => getCurrentWeekWindow("Not/A_Zone", now),
    RangeError,
    "Invalid tz string must throw RangeError"
  );
});

// ── getRollingDayWindow tests ─────────────────────────────────────────────────

test("DW-12: getRollingDayWindow — America/New_York, 7 days, end=now, start=7 days before aligned to 00:00 ET", () => {
  // now = Thursday 2024-01-11T12:00:00Z = Thursday 07:00 ET
  const now = new Date("2024-01-11T12:00:00Z");
  const { start, end } = getRollingDayWindow("America/New_York", 7, now);
  // end === now
  assert.equal(end.toISOString(), "2024-01-11T12:00:00.000Z");
  // start: 7 days before Jan 11 ET → Jan 4 ET, aligned to 00:00 ET = Jan 4 05:00 UTC
  assert.equal(start.toISOString(), "2024-01-04T05:00:00.000Z");
});

test("DW-13: getRollingDayWindow — UTC, 7 days, end=now, start=7 days before aligned to 00:00 UTC", () => {
  // now = Thursday 2024-01-11T12:00:00Z
  const now = new Date("2024-01-11T12:00:00Z");
  const { start, end } = getRollingDayWindow("UTC", 7, now);
  // end === now
  assert.equal(end.toISOString(), "2024-01-11T12:00:00.000Z");
  // start: 7 days before Jan 11 00:00 UTC → Jan 4 00:00 UTC
  assert.equal(start.toISOString(), "2024-01-04T00:00:00.000Z");
});
