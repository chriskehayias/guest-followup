// Visit-date parsing and display. Dates are plain calendar days (YYYY-MM-DD);
// we never hand a date string to `new Date(...)`, so there is no time-zone shift.

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Parses a `YYYY-MM-DD` string into calendar parts, or null if it isn't a real date. */
export function parseVisitDate(raw: string): CalendarDate | null {
  const match = ISO_DATE.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** True when `raw` is an ISO date that exists on the calendar. */
export function isValidVisitDate(raw: string): boolean {
  return parseVisitDate(raw) !== null;
}

/** Formats a valid date as e.g. "Sun, Sep 13"; returns invalid input trimmed and unchanged. */
export function formatVisitDate(raw: string): string {
  const date = parseVisitDate(raw);
  if (!date) return raw.trim();
  // UTC setters/getters only: no local time zone involved. (setUTCFullYear, unlike
  // Date.UTC, doesn't map years 0-99 to 1900-1999.)
  const utc = new Date(0);
  utc.setUTCFullYear(date.year, date.month - 1, date.day);
  return `${WEEKDAYS[utc.getUTCDay()]}, ${MONTHS[date.month - 1]} ${date.day}`;
}

/** Sort comparator: valid dates ascending, then invalid or blank dates (equal to each other). */
export function compareVisitDates(a: string, b: string): number {
  const da = parseVisitDate(a);
  const db = parseVisitDate(b);
  if (da && db) return da.year - db.year || da.month - db.month || da.day - db.day;
  if (da) return -1;
  if (db) return 1;
  return 0;
}
