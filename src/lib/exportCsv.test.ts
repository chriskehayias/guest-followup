import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import {
  FOLLOW_UP_HEADERS,
  escapeCell,
  followUpFileName,
  toFollowUpCsv,
  toFollowUpRows,
} from './exportCsv.ts';
import { groupHouseholds } from './group.ts';
import { mapColumns, toGuestRows } from './normalize.ts';
import { COLUMNS } from './types.ts';
import type { GuestRecord, Household } from './types.ts';

const mapping = mapColumns([...COLUMNS]);

function householdsOf(...records: Partial<GuestRecord>[]): Household[] {
  return groupHouseholds(toGuestRows(records, mapping));
}

/** Parses exported CSV text back into rows (header included). */
function parseBack(csv: string): string[][] {
  return Papa.parse<string[]>(csv.replace(/^\uFEFF/, ''), { skipEmptyLines: true }).data;
}

const daniel = {
  'First Name': 'Daniel',
  'Last Name': 'Wright',
  Address: '6618 Walnut Ave',
  City: 'St. Matthews',
  State: 'KY',
  Zip: '40225',
  Service: '9:00 AM',
  Adults: '2',
  Kids: '2',
  'How Heard': 'Other',
  'Interested In': 'Serving',
};

describe('toFollowUpRows', () => {
  it('merges a household into one row from the earliest visit', () => {
    const households = householdsOf(
      { ...daniel, Email: '', Phone: ' +1.502.555.0185 ', 'Visit Date': '2026-09-27', Service: '6:00 PM' },
      { ...daniel, Email: '', Phone: '', 'Visit Date': '2026-09-13' },
      { ...daniel, Email: ' daniel.wright7@example.net ', Phone: '502-555-0185', 'Visit Date': '2026-09-13' },
      { ...daniel, Email: '', Phone: '502-555-0185', 'Visit Date': '2026-09-31' },
    );
    expect(households).toHaveLength(1);
    expect(toFollowUpRows(households)).toEqual([
      [
        'Daniel',
        'Wright',
        'daniel.wright7@example.net',
        '502-555-0185',
        '6618 Walnut Ave',
        'St. Matthews',
        'KY',
        '40225',
        '2026-09-13; 2026-09-27',
        '9:00 AM',
        '2',
        '2',
        'Other',
        'Serving',
        '4',
        'Duplicate (phone, name + address); Invalid visit date (2026-09-31)',
      ],
    ]);
  });

  it('leaves contact fields blank when nobody in the household has them', () => {
    const [row] = toFollowUpRows(
      householdsOf({ 'First Name': 'Rachel', 'Last Name': 'Mitchell', 'Visit Date': '2026-09-06' }),
    );
    expect(row[2]).toBe('');
    expect(row[3]).toBe('');
    expect(row[14]).toBe('1');
    expect(row[15]).toBe('No contact info');
  });
});

describe('escapeCell', () => {
  it('prefixes values Excel would run as formulas', () => {
    expect(escapeCell('=HYPERLINK("http://example.com","click")')).toBe(`'=HYPERLINK("http://example.com","click")`);
    expect(escapeCell('@SUM(A1:A2)')).toBe(`'@SUM(A1:A2)`);
    expect(escapeCell('+cmd|calc')).toBe(`'+cmd|calc`);
    expect(escapeCell('-2+3+cmd|calc')).toBe(`'-2+3+cmd|calc`);
    expect(escapeCell('\t=1+1')).toBe(`'\t=1+1`);
    expect(escapeCell('\r=1+1')).toBe(`'\r=1+1`);
  });

  it('leaves phone numbers and ordinary text alone', () => {
    expect(escapeCell('+1.502.555.0185')).toBe('+1.502.555.0185');
    expect(escapeCell('+1 (502) 555-0185')).toBe('+1 (502) 555-0185');
    expect(escapeCell('-')).toBe('-');
    expect(escapeCell('502-555-0185')).toBe('502-555-0185');
    expect(escapeCell('Smith-Jones')).toBe('Smith-Jones');
    expect(escapeCell('a=b')).toBe('a=b');
    expect(escapeCell('')).toBe('');
  });
});

describe('toFollowUpCsv', () => {
  const tricky = householdsOf(
    {
      'First Name': 'Mary, Jr.',
      'Last Name': 'O"Neil',
      Email: 'mary@example.com',
      Address: '12 Oak St\nApt 4',
      'Visit Date': '2026-09-20',
      'Interested In': '=HYPERLINK("http://example.com")',
    },
    { 'First Name': 'Zoë', 'Last Name': 'Ng', Phone: '+1.502.555.0185', 'Visit Date': '2026-09-13' },
  );
  const csv = toFollowUpCsv(tricky);

  it('starts with a UTF-8 BOM and uses CRLF line endings', () => {
    expect(csv.startsWith('\uFEFF')).toBe(true);
    // Header + 2 rows = 2 record separators; the only bare \n is inside the quoted address.
    expect(csv.match(/\r\n/g)).toHaveLength(2);
    expect(csv.replace(/\r\n/g, '').match(/\n/g)).toHaveLength(1);
  });

  it('has the follow-up header row', () => {
    expect(parseBack(csv)[0]).toEqual([...FOLLOW_UP_HEADERS]);
  });

  it('round-trips commas, quotes and newlines', () => {
    const [, mary, zoe] = parseBack(csv);
    expect(mary[0]).toBe('Mary, Jr.');
    expect(mary[1]).toBe('O"Neil');
    expect(mary[4]).toBe('12 Oak St\nApt 4');
    expect(mary[13]).toBe(`'=HYPERLINK("http://example.com")`);
    expect(zoe[0]).toBe('Zoë');
    expect(zoe[3]).toBe('+1.502.555.0185');
  });
});

describe('followUpFileName', () => {
  it('uses the local date, zero-padded', () => {
    expect(followUpFileName(new Date(2026, 9, 5))).toBe('follow-up-2026-10-05.csv');
    expect(followUpFileName(new Date(2026, 0, 1, 23, 59))).toBe('follow-up-2026-01-01.csv');
  });
});
