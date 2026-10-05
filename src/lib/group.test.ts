import { describe, expect, it } from 'vitest';
import { groupHouseholds, summarize } from './group.ts';
import { mapColumns, toGuestRows } from './normalize.ts';
import { COLUMNS } from './types.ts';
import type { GuestRecord, GuestRow } from './types.ts';

const mapping = mapColumns([...COLUMNS]);

/** Builds GuestRows from partial records; unspecified columns are blank. */
function rowsOf(...records: Partial<GuestRecord>[]): GuestRow[] {
  return toGuestRows(records, mapping);
}

const DATE = { 'Visit Date': '2026-09-13' };

describe('groupHouseholds', () => {
  it('never matches on blank emails or blank phones', () => {
    const households = groupHouseholds(
      rowsOf(
        { 'First Name': 'Ann', 'Last Name': 'Lee', Email: '', Phone: '502-555-0101', ...DATE },
        { 'First Name': 'Bo', 'Last Name': 'Kim', Email: '  ', Phone: '502-555-0102', ...DATE },
        { 'First Name': 'Cy', 'Last Name': 'Ray', Email: 'cy@example.com', Phone: '', ...DATE },
        { 'First Name': 'Di', 'Last Name': 'Fox', Email: 'di@example.com', Phone: ' ', ...DATE },
      ),
    );
    expect(households).toHaveLength(4);
    expect(households.every((h) => h.matchedBy.length === 0)).toBe(true);
  });

  it('never matches on a blank name or address', () => {
    const households = groupHouseholds(
      rowsOf(
        { 'First Name': '', 'Last Name': 'Lee', Address: '1 Oak St', Email: 'a@example.com', ...DATE },
        { 'First Name': '', 'Last Name': 'Lee', Address: '1 Oak St', Email: 'b@example.com', ...DATE },
        { 'First Name': 'Jo', 'Last Name': 'Ng', Address: '', Email: 'c@example.com', ...DATE },
        { 'First Name': 'Jo', 'Last Name': 'Ng', Address: '', Email: 'd@example.com', ...DATE },
      ),
    );
    expect(households).toHaveLength(4);
  });

  it('chains matches: A~B by email, B~C by phone gives one household', () => {
    const households = groupHouseholds(
      rowsOf(
        { 'First Name': 'A', 'Last Name': 'One', Email: 'shared@example.com', Phone: '', ...DATE },
        { 'First Name': 'B', 'Last Name': 'Two', Email: 'SHARED@example.com', Phone: '502-555-0150', ...DATE },
        { 'First Name': 'C', 'Last Name': 'Three', Email: '', Phone: '(502) 555-0150', ...DATE },
      ),
    );
    expect(households).toHaveLength(1);
    expect(households[0].rows).toHaveLength(3);
    expect(households[0].matchedBy).toEqual(['email', 'phone']);
    expect(households[0].flags).toEqual(['Duplicate (email, phone)']);
  });

  it('chains in either input order and reports rules in priority order', () => {
    const households = groupHouseholds(
      rowsOf(
        { 'First Name': 'C', 'Last Name': 'Three', Phone: '502-555-0150', Address: '1 Elm St', ...DATE },
        { 'First Name': 'C', 'Last Name': 'Three', Address: '1 Elm Street', Email: 'c@example.com', ...DATE },
        { 'First Name': 'B', 'Last Name': 'Two', Email: 'c@example.com', Phone: '502-555-0150', ...DATE },
      ),
    );
    expect(households).toHaveLength(1);
    // email joins rows 2+3, phone joins row 1 to that set; name + address is then redundant.
    expect(households[0].matchedBy).toEqual(['email', 'phone']);
  });

  it('records only the rule that actually merged an exact duplicate', () => {
    const row = {
      'First Name': 'Hannah',
      'Last Name': 'Harris',
      Email: 'hannah.harris19@example.org',
      Phone: '502-555-0148',
      Address: '5853 Maple St',
      ...DATE,
    };
    const [household] = groupHouseholds(rowsOf(row, row));
    expect(household.matchedBy).toEqual(['email']);
    expect(household.flags).toEqual(['Duplicate (email)']);
  });

  it('groups by name + address when email and phone differ', () => {
    const households = groupHouseholds(
      rowsOf(
        { 'First Name': 'Sarah', 'Last Name': 'Wilson', Email: 'sarah690@example.net', Address: '1913 Willow Ct', ...DATE },
        { 'First Name': ' sarah ', 'Last Name': 'WILSON', Email: 'sw@example.com', Address: '1913 Willow Court', ...DATE },
      ),
    );
    expect(households).toHaveLength(1);
    expect(households[0].matchedBy).toEqual(['name + address']);
  });

  it('orders households by first appearance and rows by earliest visit', () => {
    const households = groupHouseholds(
      rowsOf(
        { 'First Name': 'X', Email: 'x@example.com', 'Visit Date': '2026-09-31' },
        { 'First Name': 'Y', Email: 'y@example.com', 'Visit Date': '2026-09-20' },
        { 'First Name': 'X2', Email: 'x@example.com', 'Visit Date': '2026-09-27' },
        { 'First Name': 'X3', Email: 'x@example.com', 'Visit Date': '2026-09-06' },
        { 'First Name': 'X4', Email: 'x@example.com', 'Visit Date': '2026-09-06' },
      ),
    );
    expect(households.map((h) => h.id)).toEqual([0, 1]);
    expect(households[0].rows.map((r) => r.original['First Name'])).toEqual(['X3', 'X4', 'X2', 'X']);
    expect(households[0].primary.original['First Name']).toBe('X3');
    expect(households[1].primary.original['First Name']).toBe('Y');
  });

  it('flags duplicates, invalid dates and missing contact info in order', () => {
    const households = groupHouseholds(
      rowsOf(
        { 'First Name': 'Rachel', 'Last Name': 'Mitchell', Address: '183 Pine Ct', 'Visit Date': '' },
        { 'First Name': 'Rachel', 'Last Name': 'Mitchell', Address: '183 Pine Ct', 'Visit Date': ' 2026-09-31 ' },
        { 'First Name': 'Rachel', 'Last Name': 'Mitchell', Address: '183 Pine Ct', 'Visit Date': '2026-09-06' },
      ),
    );
    expect(households).toHaveLength(1);
    expect(households[0].flags).toEqual([
      'Duplicate (name + address)',
      'Invalid visit date (blank)',
      'Invalid visit date (2026-09-31)',
      'No contact info',
    ]);
  });

  it('keeps single rows unflagged when they are fine', () => {
    const [household] = groupHouseholds(rowsOf({ 'First Name': 'Ok', Phone: '502-555-0199', ...DATE }));
    expect(household.matchedBy).toEqual([]);
    expect(household.flags).toEqual([]);
  });
});

describe('summarize', () => {
  it('counts groups, duplicate rows and issues (each row once)', () => {
    const rows = rowsOf(
      { 'First Name': 'A', Email: 'a@example.com', ...DATE },
      { 'First Name': 'A', Email: 'a@example.com', 'Visit Date': '2026-02-30' },
      { 'First Name': 'B', 'Visit Date': 'bad' },
      { 'First Name': 'C', Phone: '502-555-0100', ...DATE },
    );
    const summary = summarize(rows, groupHouseholds(rows));
    expect(summary).toEqual({
      rowsLoaded: 4,
      households: 3,
      duplicateGroups: 1,
      duplicateRows: 2,
      rowsWithIssues: 2,
      invalidDates: 2,
      noContact: 1,
    });
  });
});
