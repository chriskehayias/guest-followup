// Follow-up CSV export: one row per household, safe to open in Excel.

import Papa from 'papaparse';
import type { Household } from './types.ts';

export const FOLLOW_UP_HEADERS: readonly string[] = [
  'First Name',
  'Last Name',
  'Email',
  'Phone',
  'Address',
  'City',
  'State',
  'Zip',
  'Visit Dates',
  'Service',
  'Adults',
  'Kids',
  'How Heard',
  'Interested In',
  'Rows Merged',
  'Notes',
];

const BOM = '\uFEFF';
const PHONE_LIKE = /^[\d\s()+.-]+$/;

/** One string[] per household, in FOLLOW_UP_HEADERS order (no header row). */
export function toFollowUpRows(households: Household[]): string[][] {
  return households.map(({ rows, primary, flags }) => {
    const p = primary.original;
    const firstNonBlank = (pick: (o: typeof p) => string): string =>
      rows.map((row) => pick(row.original).trim()).find((v) => v !== '') ?? '';
    // Rows are already sorted oldest-first with invalid dates last.
    const visitDates = [
      ...new Set(rows.filter((row) => row.visitDateValid).map((row) => row.original['Visit Date'].trim())),
    ];

    return [
      p['First Name'],
      p['Last Name'],
      firstNonBlank((o) => o.Email),
      firstNonBlank((o) => o.Phone),
      p.Address,
      p.City,
      p.State,
      p.Zip,
      visitDates.join('; '),
      p.Service,
      p.Adults,
      p.Kids,
      p['How Heard'],
      p['Interested In'],
      String(rows.length),
      flags.join('; '),
    ].map((value) => value.trim());
  });
}

/**
 * Guards against CSV formula injection: values Excel would treat as a formula get a
 * leading apostrophe. Phone-like values starting with + or - (e.g. "+1.502.555.0185")
 * are left alone, since digits and punctuation alone can't call a function.
 */
export function escapeCell(value: string): string {
  const first = value.charAt(0);
  if (first === '=' || first === '@' || first === '\t' || first === '\r') return `'${value}`;
  if ((first === '+' || first === '-') && !PHONE_LIKE.test(value)) return `'${value}`;
  return value;
}

/** The full follow-up CSV: UTF-8 BOM, header row, CRLF line endings, every cell escaped. */
export function toFollowUpCsv(households: Household[]): string {
  const fields = FOLLOW_UP_HEADERS.map(escapeCell);
  const data = toFollowUpRows(households).map((row) => row.map(escapeCell));
  return BOM + Papa.unparse({ fields, data }, { newline: '\r\n' });
}

/** `follow-up-YYYY-MM-DD.csv` for the given day, using the local calendar date. */
export function followUpFileName(today: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return `follow-up-${date}.csv`;
}
