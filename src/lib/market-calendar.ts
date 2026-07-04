const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// weekday: 0 = Sunday ... 6 = Saturday
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = toUtcDate(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return toUtcDate(year, month, 1 + offset + (n - 1) * 7);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const last = toUtcDate(year, month, lastDayOfMonth);
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return toUtcDate(year, month, lastDayOfMonth - offset);
}

// NYSE observes a fixed-date holiday that falls on a weekend on the nearest weekday:
// Saturday -> preceding Friday, Sunday -> following Monday.
function observedDate(date: Date): Date {
  const day = date.getUTCDay();
  if (day === 6) return new Date(date.getTime() - DAY_MS);
  if (day === 0) return new Date(date.getTime() + DAY_MS);
  return date;
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher) for Easter Sunday.
function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toUtcDate(year, month, day);
}

function getMarketHolidaysForYear(year: number): Date[] {
  const goodFriday = new Date(computeEaster(year).getTime() - 2 * DAY_MS);
  return [
    observedDate(toUtcDate(year, 0, 1)), // New Year's Day
    nthWeekdayOfMonth(year, 0, 1, 3), // MLK Day
    nthWeekdayOfMonth(year, 1, 1, 3), // Presidents Day
    goodFriday,
    lastWeekdayOfMonth(year, 4, 1), // Memorial Day
    observedDate(toUtcDate(year, 5, 19)), // Juneteenth
    observedDate(toUtcDate(year, 6, 4)), // Independence Day
    nthWeekdayOfMonth(year, 8, 1, 1), // Labor Day
    nthWeekdayOfMonth(year, 10, 4, 4), // Thanksgiving
    observedDate(toUtcDate(year, 11, 25)), // Christmas
  ];
}

const holidayCache = new Map<number, Set<string>>();

function getHolidaySetForYear(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (!set) {
    set = new Set(getMarketHolidaysForYear(year).map(dateKey));
    holidayCache.set(year, set);
  }
  return set;
}

export function isUsMarketHoliday(date: Date): boolean {
  const year = date.getUTCFullYear();
  const key = dateKey(date);
  // New Year's Day observed can land on Dec 31 of the prior calendar year.
  return getHolidaySetForYear(year).has(key) || getHolidaySetForYear(year + 1).has(key);
}

export function isTradingDay(date: Date): boolean {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !isUsMarketHoliday(date);
}

export function nextTradingDay(date: Date): Date {
  let next = new Date(date.getTime() + DAY_MS);
  while (!isTradingDay(next)) {
    next = new Date(next.getTime() + DAY_MS);
  }
  return next;
}
