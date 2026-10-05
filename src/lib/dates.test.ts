import { afterEach, describe, expect, it } from 'vitest';
import { compareVisitDates, formatVisitDate, isValidVisitDate, parseVisitDate } from './dates.ts';

describe('isValidVisitDate', () => {
  it('rejects days that do not exist on the calendar', () => {
    expect(isValidVisitDate('2026-09-31')).toBe(false);
    expect(isValidVisitDate('2026-02-29')).toBe(false);
    expect(isValidVisitDate('1900-02-29')).toBe(false);
    expect(isValidVisitDate('2026-04-00')).toBe(false);
  });

  it('accepts real dates, including leap days', () => {
    expect(isValidVisitDate('2028-02-29')).toBe(true);
    expect(isValidVisitDate('2000-02-29')).toBe(true);
    expect(isValidVisitDate('2026-09-13')).toBe(true);
    expect(isValidVisitDate('2026-12-31')).toBe(true);
    expect(isValidVisitDate('  2026-09-13 ')).toBe(true);
  });

  it('rejects blanks and anything that is not YYYY-MM-DD', () => {
    for (const raw of ['', '   ', '9/13/2026', '2026-13-01', '2026-00-10', '2026-09-13T00:00', '2026-9-13', 'Sept 13']) {
      expect(isValidVisitDate(raw), raw).toBe(false);
    }
  });
});

describe('parseVisitDate', () => {
  it('returns calendar parts', () => {
    expect(parseVisitDate('2026-09-06')).toEqual({ year: 2026, month: 9, day: 6 });
    expect(parseVisitDate('2026-09-31')).toBeNull();
  });
});

describe('formatVisitDate', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('shows "Sun, Sep 13" for 2026-09-13 in every time zone', () => {
    const zones = ['UTC', 'America/New_York', 'America/Los_Angeles', 'Pacific/Honolulu', 'Asia/Tokyo', 'Pacific/Kiritimati'];
    const offsets = new Set<number>();
    for (const zone of zones) {
      process.env.TZ = zone;
      offsets.add(new Date(2026, 8, 13).getTimezoneOffset());
      expect(formatVisitDate('2026-09-13'), zone).toBe('Sun, Sep 13');
      expect(formatVisitDate('2026-09-06'), zone).toBe('Sun, Sep 6');
      expect(formatVisitDate('2028-02-29'), zone).toBe('Tue, Feb 29');
    }
    // Guard: the zone switch really took effect, so this test can catch a UTC shift.
    expect(offsets.size).toBe(zones.length);
  });

  it('returns invalid input trimmed and unchanged', () => {
    expect(formatVisitDate(' 2026-09-31 ')).toBe('2026-09-31');
    expect(formatVisitDate('9/13/2026')).toBe('9/13/2026');
    expect(formatVisitDate('   ')).toBe('');
  });
});

describe('compareVisitDates', () => {
  it('sorts valid dates ascending with invalid and blank dates last', () => {
    const dates = ['2026-09-27', '', '2026-09-31', '2026-09-06', '2025-12-31', '2026-09-13'];
    expect([...dates].sort(compareVisitDates)).toEqual([
      '2025-12-31',
      '2026-09-06',
      '2026-09-13',
      '2026-09-27',
      '',
      '2026-09-31',
    ]);
  });

  it('treats two invalid dates as equal', () => {
    expect(compareVisitDates('', 'nope')).toBe(0);
    expect(compareVisitDates('2026-09-13', '2026-09-13')).toBe(0);
  });
});
