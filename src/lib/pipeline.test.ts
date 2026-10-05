import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { processGuestCsv } from './pipeline.ts';
import { toFollowUpCsv } from './exportCsv.ts';
import type { Household, MatchRule } from './types.ts';

const sample = readFileSync(new URL('../../guests-september-2026.csv', import.meta.url), 'utf8');

/** The duplicate household whose rows include this person (names compared case-insensitively). */
function duplicateHousehold(households: Household[], first: string, last: string): Household {
  const matches = households.filter(
    (h) =>
      h.rows.length > 1 &&
      h.rows.some(
        (r) =>
          r.original['First Name'].trim().toLowerCase() === first.toLowerCase() &&
          r.original['Last Name'].trim().toLowerCase() === last.toLowerCase(),
      ),
  );
  expect(matches, `${first} ${last}`).toHaveLength(1);
  return matches[0];
}

describe('processGuestCsv with guests-september-2026.csv', () => {
  const result = processGuestCsv(sample);

  it('maps every column with no parse errors', () => {
    expect(result.mapping.missing).toEqual([]);
    expect(result.mapping.extra).toEqual([]);
    expect(result.parseErrors).toEqual([]);
  });

  it('meets the PRD acceptance numbers', () => {
    expect(result.summary).toEqual({
      rowsLoaded: 200,
      households: 192,
      duplicateGroups: 8,
      duplicateRows: 16,
      rowsWithIssues: 2,
      invalidDates: 1,
      noContact: 1,
    });
  });

  it('flags Michael Brown as the one invalid visit date', () => {
    const invalid = result.rows.filter((r) => !r.visitDateValid);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].original['First Name']).toBe('Michael');
    expect(invalid[0].original['Last Name']).toBe('Brown');
    expect(invalid[0].original['Visit Date']).toBe('2026-09-31');
    const flagged = result.households.filter((h) => h.flags.includes('Invalid visit date (2026-09-31)'));
    expect(flagged.map((h) => h.primary.original['Last Name'])).toEqual(['Brown']);
  });

  it('flags Rachel Mitchell as the one household with no contact info', () => {
    const noContact = result.households.filter((h) => h.flags.includes('No contact info'));
    expect(noContact).toHaveLength(1);
    expect(noContact[0].primary.original['First Name']).toBe('Rachel');
    expect(noContact[0].primary.original['Last Name']).toBe('Mitchell');
  });

  it.each<[string, string, MatchRule]>([
    ['Sofia', 'Hernandez', 'email'],
    ['Patricia', 'Hill', 'email'],
    ['William', 'Thompson', 'phone'],
    ['Daniel', 'Wright', 'phone'],
    ['Sarah', 'Wilson', 'name + address'],
    ['Melissa', 'Allen', 'email'],
    ['Hannah', 'Harris', 'email'],
    ['Amanda', 'Clark', 'phone'],
  ])('catches %s %s by %s only', (first, last, rule) => {
    const household = duplicateHousehold(result.households, first, last);
    expect(household.rows).toHaveLength(2);
    expect(household.matchedBy).toEqual([rule]);
    expect(household.flags[0]).toBe(`Duplicate (${rule})`);
  });

  it('exports one CSV row per household', () => {
    const parsed = Papa.parse<string[]>(toFollowUpCsv(result.households).replace(/^\uFEFF/, ''), {
      skipEmptyLines: true,
    });
    expect(parsed.errors).toEqual([]);
    expect(parsed.data).toHaveLength(1 + 192);
  });
});

describe('processGuestCsv input handling', () => {
  it('maps shuffled, odd-case headers and gives the same result', () => {
    const { data } = Papa.parse<string[]>(sample, { skipEmptyLines: true });
    const order = [...data[0].keys()].reverse();
    const shuffled = data.map((row, i) =>
      order.map((c) => (i === 0 ? `  ${row[c].toUpperCase()} ` : row[c])),
    );
    const result = processGuestCsv(Papa.unparse(shuffled));
    expect(result.mapping.missing).toEqual([]);
    expect(result.mapping.headerFor['First Name']).toBe('  FIRST NAME ');
    expect(result.summary.households).toBe(192);
    expect(result.summary.duplicateGroups).toBe(8);
  });

  it('warns when a required column is missing', () => {
    const result = processGuestCsv('last name,FIRST NAME,Email\nHill,Patricia,patricia.hill51@example.net\n');
    expect(result.mapping.missingRequired).toEqual(['Visit Date']);
    expect(result.rows[0].original['First Name']).toBe('Patricia');
    expect(result.summary.invalidDates).toBe(1);
  });

  it('strips a leading BOM and reports row-level parse errors with spreadsheet row numbers', () => {
    const result = processGuestCsv(
      '\uFEFFFirst Name,Last Name,Visit Date\nAnn,Lee,2026-09-13\nBo,Kim\n',
    );
    expect(result.mapping.missingRequired).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.parseErrors).toHaveLength(1);
    expect(result.parseErrors[0]).toMatch(/^Row 3: /);
  });
});

describe('performance', () => {
  it('processes 2,000 rows in under 2 seconds', () => {
    const { data } = Papa.parse<string[]>(sample, { skipEmptyLines: true });
    const [header, ...body] = data;
    const col = (name: string) => header.indexOf(name);
    const copies: string[][] = [];
    for (let k = 0; k < 10; k++) {
      // Vary identity per copy so copies don't merge with each other; planted duplicates still do.
      for (const row of body) {
        const copy = [...row];
        copy[col('First Name')] = `${row[col('First Name')]}${'abcdefghij'[k]}`;
        copy[col('Email')] = row[col('Email')].replace('@', `@c${k}.`);
        copy[col('Phone')] = row[col('Phone')].replace('555', String(560 + k));
        copies.push(copy);
      }
    }
    const text = Papa.unparse([header, ...copies]);

    const start = performance.now();
    const result = processGuestCsv(text);
    toFollowUpCsv(result.households);
    const elapsed = performance.now() - start;

    expect(result.summary.rowsLoaded).toBe(2000);
    expect(result.summary.households).toBe(1920);
    expect(result.summary.duplicateGroups).toBe(80);
    expect(elapsed).toBeLessThan(2000);
  });
});
