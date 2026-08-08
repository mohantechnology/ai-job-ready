// Resolves a named progress time range into [start, end) timestamps.
// Ranges are calendar-based (week starts Monday) in the server's local TZ
// via Date — fine for v1 single-user local deploys.

const VALID_RANGES = new Set(["this_week", "last_week", "this_month", "last_month", "all"]);

export function isValidProgressRange(range) {
  return VALID_RANGES.has(range);
}

export function listProgressRanges() {
  return [...VALID_RANGES];
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d) {
  // Monday as week start (ISO-style).
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun … 6=Sat
  const daysFromMonday = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - daysFromMonday);
  return x;
}

function startOfMonth(d) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

/**
 * @param {string} range
 * @param {Date} [now]
 * @returns {{ range: string, start: Date|null, end: Date|null }}
 */
export function resolveProgressRange(range, now = new Date()) {
  if (!isValidProgressRange(range)) {
    throw new Error(`Invalid progress range: ${range}`);
  }

  if (range === "all") {
    return { range, start: null, end: null };
  }

  if (range === "this_week") {
    return { range, start: startOfWeek(now), end: now };
  }

  if (range === "last_week") {
    const thisWeekStart = startOfWeek(now);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    return { range, start: lastWeekStart, end: thisWeekStart };
  }

  if (range === "this_month") {
    return { range, start: startOfMonth(now), end: now };
  }

  // last_month
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = new Date(thisMonthStart);
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
  return { range, start: lastMonthStart, end: thisMonthStart };
}
