// Client-side mirror of vigil-core/src/utils/date-window.ts getCurrentWeekWindow.
// Used ONLY for week-header display formatting. The server remains the single
// source of truth for which thoughts are actually returned. If you change the
// algorithm here, also change it in vigil-core/src/utils/date-window.ts (and
// its tests) to keep them in lock-step.

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Extracts wall-clock date/time parts for a UTC instant in the given IANA timezone.
 * Throws RangeError if `tz` is not a valid IANA timezone string.
 */
function getWallClockParts(
  date: Date,
  tz: string,
): { year: number; month: number; day: number; hour: number; min: number; sec: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')

  let hour = get('hour')
  // hour12:false can return 24 for midnight in some locales/engines — normalize to 0
  if (hour === 24) hour = 0

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    min: get('minute'),
    sec: get('second'),
  }
}

/**
 * Converts a wall-clock date/time in the given IANA timezone to a UTC Date.
 *
 * Uses an iterative correction loop (bounded to 4 iterations) that converges in
 * ≤3 iterations for all real IANA zones. For DST fall-back ambiguity, the loop
 * naturally converges to the earlier (pre-transition) occurrence.
 *
 * Tolerates `day` values outside the month range (e.g., day + 7 > month length)
 * because Date.UTC rolls over correctly.
 */
function wallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  min: number,
  sec: number,
  tz: string,
): Date {
  // Initial estimate: treat the wall-clock values as if they were UTC
  let guess = Date.UTC(year, month - 1, day, hour, min, sec)

  for (let i = 0; i < 4; i++) {
    const actual = getWallClockParts(new Date(guess), tz)
    const target = Date.UTC(year, month - 1, day, hour, min, sec)
    const actualUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.min,
      actual.sec,
    )
    const diff = target - actualUtc
    if (diff === 0) break
    guess += diff
  }

  return new Date(guess)
}

/**
 * Returns the day-of-week (0=Sun..6=Sat) for a UTC instant in the given IANA timezone.
 */
function dayOfWeekInTz(date: Date, tz: string): number {
  const dowStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(date)
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return map[dowStr] ?? 0
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Client-side mirror of vigil-core/src/utils/date-window.ts getCurrentWeekWindow.
 * Used ONLY for header display ({Wed MMM D} – {Tue MMM D}).
 * Kept in sync manually — server remains the source of truth for filtering.
 *
 * Returns the most recent Wednesday 00:00 in `tz` as `start`, and the next
 * Wednesday 00:00 in `tz` as `end`.
 *
 * Semantics: start is INCLUSIVE, end is EXCLUSIVE.
 * End is displayed as end-1ms so the visible range reads Wed..Tue, not Wed..Wed.
 *
 * @param tz  IANA timezone string (e.g. "America/New_York"). Throws RangeError if invalid.
 * @param now Optional clock injection for deterministic testing. Defaults to `new Date()`.
 */
export function getCurrentWeekWindow(
  tz: string,
  now: Date = new Date(),
): { start: Date; end: Date } {
  // This call validates `tz` — Intl throws RangeError on invalid strings.
  const dow = dayOfWeekInTz(now, tz)

  // Days elapsed since the most recent Wednesday in tz:
  // Wed=0, Thu=1, Fri=2, Sat=3, Sun=4, Mon=5, Tue=6
  const DOW_TO_DAYS_SINCE_WED: Record<number, number> = {
    3: 0, // Wed
    4: 1, // Thu
    5: 2, // Fri
    6: 3, // Sat
    0: 4, // Sun
    1: 5, // Mon
    2: 6, // Tue
  }
  const daysSinceWed = DOW_TO_DAYS_SINCE_WED[dow]

  // Approximate the Wednesday in UTC (may be off by a day at DST boundaries).
  // We then re-resolve its wall-clock parts in `tz` to get the correct calendar date.
  const approxWedUtc = new Date(now.getTime() - daysSinceWed * 86_400_000)
  const wedParts = getWallClockParts(approxWedUtc, tz)

  // Build start and end by converting wall-clock Wed 00:00 back to UTC.
  // `day + 7` is intentionally out-of-range for the month — Date.UTC rolls over correctly.
  const start = wallClockToUtc(wedParts.year, wedParts.month, wedParts.day, 0, 0, 0, tz)
  const end = wallClockToUtc(wedParts.year, wedParts.month, wedParts.day + 7, 0, 0, 0, tz)

  return { start, end }
}
