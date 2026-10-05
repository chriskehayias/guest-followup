// Entry points: CSV text (or saved records) in, everything the board needs out.

import Papa from 'papaparse';
import { COLUMNS } from './types.ts';
import type { BoardResult, ColumnMapping, GuestRecord } from './types.ts';
import { mapColumns, toGuestRows } from './normalize.ts';
import { groupHouseholds, summarize } from './group.ts';

/** Parses guest CSV text, maps columns, groups households and summarizes. */
export function processGuestCsv(text: string): BoardResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: true,
  });
  const parseErrors = parsed.errors.map((err) =>
    err.row === undefined ? err.message : `Row ${err.row + 2}: ${err.message}`,
  );
  return buildBoard(mapColumns(parsed.meta.fields ?? []), parsed.data, parseErrors);
}

/** Rebuilds the board from saved records, which are already keyed by our column names. */
export function processGuestRecords(records: GuestRecord[]): BoardResult {
  return buildBoard(mapColumns([...COLUMNS]), records, []);
}

function buildBoard(
  mapping: ColumnMapping,
  records: Record<string, string | undefined>[],
  parseErrors: string[],
): BoardResult {
  const rows = toGuestRows(records, mapping);
  const households = groupHouseholds(rows);
  return { mapping, rows, households, summary: summarize(rows, households), parseErrors };
}
