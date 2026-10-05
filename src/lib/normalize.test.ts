import { describe, expect, it } from 'vitest';
import {
  mapColumns,
  normalizeAddress,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  toGuestRows,
} from './normalize.ts';
import { COLUMNS } from './types.ts';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Nancy.Taylor3@Example.com ')).toBe('nancy.taylor3@example.com');
    expect(normalizeEmail('SOFIA.HERNANDEZ49@EXAMPLE.NET')).toBe('sofia.hernandez49@example.net');
    expect(normalizeEmail('   ')).toBe('');
  });
});

describe('normalizePhone', () => {
  it('turns all four sample formats into the same 10 digits', () => {
    for (const raw of ['502-555-0142', '(502) 555-0142', '+1.502.555.0142', '5025550142']) {
      expect(normalizePhone(raw), raw).toBe('5025550142');
    }
  });

  it('returns blank when there are no digits', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(' n/a ')).toBe('');
  });
});

describe('normalizeName', () => {
  it('trims, lowercases and collapses spaces', () => {
    expect(normalizeName('melissa allen')).toBe(normalizeName('Melissa Allen'));
    expect(normalizeName('  Mary   Ann\t ')).toBe('mary ann');
  });
});

describe('normalizeAddress', () => {
  it('abbreviates street words and strips periods', () => {
    expect(normalizeAddress('4796 Willow Street')).toBe(normalizeAddress('4796 willow st'));
    expect(normalizeAddress('7193 Cedar Avenue')).toBe('7193 cedar ave');
    expect(normalizeAddress('12  Oak Dr.')).toBe('12 oak dr');
    expect(normalizeAddress('1 Pine Drive')).toBe('1 pine dr');
    expect(normalizeAddress('2 Elm Lane')).toBe('2 elm ln');
    expect(normalizeAddress('3 Birch Court')).toBe('3 birch ct');
    expect(normalizeAddress('4 Mill Road')).toBe('4 mill rd');
  });

  it('only replaces whole words', () => {
    expect(normalizeAddress('9 Laneview Way')).toBe('9 laneview way');
    expect(normalizeAddress('5 Courtland Streetcar Rd')).toBe('5 courtland streetcar rd');
  });
});

describe('mapColumns', () => {
  it('matches headers regardless of case, spacing and order', () => {
    const headers = ['  EMAIL ', 'last   name', 'first name', 'Phone', 'Favorite Color', 'visit date', ''];
    const mapping = mapColumns(headers);
    expect(mapping.headerFor['Email']).toBe('  EMAIL ');
    expect(mapping.headerFor['Last Name']).toBe('last   name');
    expect(mapping.headerFor['First Name']).toBe('first name');
    expect(mapping.headerFor['Visit Date']).toBe('visit date');
    expect(mapping.missingRequired).toEqual([]);
    expect(mapping.extra).toEqual(['Favorite Color']);
    expect(mapping.missing).toContain('Address');
    expect(mapping.missing).not.toContain('Email');
  });

  it('reports missing required columns', () => {
    const mapping = mapColumns(['Last Name', 'first name', 'Email', 'Phone']);
    expect(mapping.missingRequired).toEqual(['Visit Date']);
    expect(mapping.missing).toContain('Visit Date');
  });

  it('finds every column in the sample header', () => {
    const mapping = mapColumns([...COLUMNS]);
    expect(mapping.missing).toEqual([]);
    expect(mapping.extra).toEqual([]);
  });
});

describe('toGuestRows', () => {
  const mapping = mapColumns(['First Name', 'Last Name', 'Email', 'Phone', 'Address', 'Visit Date']);

  it('keeps originals as-is and builds normalized keys', () => {
    const [row] = toGuestRows(
      [
        {
          'First Name': ' Patricia',
          'Last Name': 'Hill',
          Email: '  Patricia.Hill51@example.net ',
          Phone: '(859) 555-0142',
          Address: '2365 Walnut Avenue',
          'Visit Date': '2026-09-06',
        },
      ],
      mapping,
    );
    expect(row.index).toBe(0);
    expect(row.original['First Name']).toBe(' Patricia');
    expect(row.original.Email).toBe('  Patricia.Hill51@example.net ');
    expect(row.original.City).toBe('');
    expect(Object.keys(row.original).sort()).toEqual([...COLUMNS].sort());
    expect(row.keys).toEqual({
      email: 'patricia.hill51@example.net',
      phone: '8595550142',
      nameAddress: 'patricia|hill|2365 walnut ave',
    });
    expect(row.visitDateValid).toBe(true);
    expect(row.hasContact).toBe(true);
  });

  it('leaves nameAddress blank when any part is blank, and flags missing contact', () => {
    const rows = toGuestRows(
      [
        { 'First Name': 'Rachel', 'Last Name': 'Mitchell', Email: '', Phone: ' ', Address: '', 'Visit Date': '2026-09-31' },
        { 'First Name': '', 'Last Name': 'Mitchell', Address: '183 Pine Ct' },
      ],
      mapping,
    );
    expect(rows.map((r) => r.keys.nameAddress)).toEqual(['', '']);
    expect(rows[0].hasContact).toBe(false);
    expect(rows[0].visitDateValid).toBe(false);
    expect(rows[1].index).toBe(1);
    expect(rows[1].original.Email).toBe('');
  });
});
