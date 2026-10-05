// Normalization for matching (originals are kept for display) and column mapping.

import { COLUMNS, REQUIRED_COLUMNS } from './types.ts';
import type { ColumnMapping, ColumnName, GuestRecord, GuestRow } from './types.ts';
import { isValidVisitDate } from './dates.ts';

const ADDRESS_WORDS: Record<string, string> = {
  street: 'st',
  avenue: 'ave',
  drive: 'dr',
  lane: 'ln',
  court: 'ct',
  road: 'rd',
};
const ADDRESS_WORD_PATTERN = new RegExp(`\\b(${Object.keys(ADDRESS_WORDS).join('|')})\\b`, 'g');

function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Trim + lowercase. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Digits only, keeping the last 10 (drops a leading country code); '' if there are none. */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(-10);
}

/** Trim, lowercase, collapse internal whitespace. */
export function normalizeName(raw: string): string {
  return collapseSpaces(raw.toLowerCase());
}

/** Lowercase, strip periods, collapse whitespace, abbreviate common street words. */
export function normalizeAddress(raw: string): string {
  const cleaned = collapseSpaces(raw.toLowerCase().replace(/\./g, ''));
  return cleaned.replace(ADDRESS_WORD_PATTERN, (word) => ADDRESS_WORDS[word]);
}

function headerKey(header: string): string {
  return collapseSpaces(header.toLowerCase());
}

/** Matches the file's headers to our columns, ignoring case, spacing and order. */
export function mapColumns(headers: string[]): ColumnMapping {
  const columnByKey = new Map<string, ColumnName>(COLUMNS.map((c) => [headerKey(c), c]));
  const headerFor: Partial<Record<ColumnName, string>> = {};
  const extra: string[] = [];

  for (const header of headers) {
    if (header.trim() === '') continue;
    const column = columnByKey.get(headerKey(header));
    // First header wins if the file repeats a column; later copies are ignored as extras.
    if (column && headerFor[column] === undefined) headerFor[column] = header;
    else extra.push(header);
  }

  const missing = COLUMNS.filter((c) => headerFor[c] === undefined);
  const missingRequired = REQUIRED_COLUMNS.filter((c) => headerFor[c] === undefined);
  return { headerFor, missingRequired, missing, extra };
}

/** Builds GuestRows (originals + normalized match keys) from parsed CSV records. */
export function toGuestRows(
  records: Record<string, string | undefined>[],
  mapping: ColumnMapping,
): GuestRow[] {
  return records.map((record, index) => {
    const original = {} as GuestRecord;
    for (const column of COLUMNS) {
      const header = mapping.headerFor[column];
      const value = header === undefined ? undefined : record[header];
      original[column] = typeof value === 'string' ? value : '';
    }

    const first = normalizeName(original['First Name']);
    const last = normalizeName(original['Last Name']);
    const address = normalizeAddress(original.Address);
    const keys = {
      email: normalizeEmail(original.Email),
      phone: normalizePhone(original.Phone),
      nameAddress: first && last && address ? `${first}|${last}|${address}` : '',
    };

    return {
      index,
      original,
      keys,
      visitDateValid: isValidVisitDate(original['Visit Date']),
      hasContact: keys.email !== '' || keys.phone !== '',
    };
  });
}
