// Single entry point: CSV text in, everything the board needs out.

import Papa from 'papaparse';
import type { BoardResult } from './types.ts';
import { mapColumns, toGuestRows } from './normalize.ts';
import { groupHouseholds, summarize } from './group.ts';

/** Parses guest CSV text, maps columns, groups households and summarizes. */
export function processGuestCsv(text: string): BoardResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: true,
  });
  const mapping = mapColumns(parsed.meta.fields ?? []);
  const rows = toGuestRows(parsed.data, mapping);
  const households = groupHouseholds(rows);
  const parseErrors = parsed.errors.map((err) =>
    err.row === undefined ? err.message : `Row ${err.row + 2}: ${err.message}`,
  );
  return { mapping, rows, households, summary: summarize(rows, households), parseErrors };
}
