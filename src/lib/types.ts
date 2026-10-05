// Shared types for the Guest Follow-Up Board. Pure data, no DOM.

/** Input columns from the guest export, in output order. */
export const COLUMNS = [
  'First Name',
  'Last Name',
  'Email',
  'Phone',
  'Address',
  'City',
  'State',
  'Zip',
  'Visit Date',
  'Service',
  'Adults',
  'Kids',
  'How Heard',
  'Interested In',
] as const;

export type ColumnName = (typeof COLUMNS)[number];

/** A warning is shown when any of these is missing from the file. */
export const REQUIRED_COLUMNS: readonly ColumnName[] = ['First Name', 'Last Name', 'Visit Date'];

/** One input row, keyed by our column names; '' when the column is missing or blank. */
export type GuestRecord = Record<ColumnName, string>;

/** Result of matching the file's headers to our columns (case- and order-insensitive). */
export interface ColumnMapping {
  /** Our column name -> the header exactly as it appears in the file. */
  headerFor: Partial<Record<ColumnName, string>>;
  /** Required columns not found in the file. */
  missingRequired: ColumnName[];
  /** Any of our columns not found in the file (includes missingRequired). */
  missing: ColumnName[];
  /** File headers that matched none of our columns (kept, but ignored). */
  extra: string[];
}

/** Normalized matching keys; '' means blank and never matches anything. */
export interface MatchKeys {
  email: string;
  phone: string;
  /** first + '|' + last + '|' + address, or '' if any of the three is blank. */
  nameAddress: string;
}

export interface GuestRow {
  /** 0-based position in the input file (spreadsheet row = index + 2). */
  index: number;
  /** Original values, used for display and export. */
  original: GuestRecord;
  keys: MatchKeys;
  visitDateValid: boolean;
  hasContact: boolean;
}

/** Duplicate rules, in priority order. */
export type MatchRule = 'email' | 'phone' | 'name + address';
export const MATCH_RULES: readonly MatchRule[] = ['email', 'phone', 'name + address'];

export interface Household {
  /** 0-based, in order of each household's first appearance in the file. */
  id: number;
  /** Earliest valid visit first; rows with invalid dates last; ties keep input order. */
  rows: GuestRow[];
  /** rows[0] — the earliest visit. */
  primary: GuestRow;
  /** Rules that actually merged rows into this household, in priority order. Empty for one row. */
  matchedBy: MatchRule[];
  /** Human-readable flags, e.g. "Duplicate (email)", "Invalid visit date (2026-09-31)", "No contact info". */
  flags: string[];
}

export interface Summary {
  rowsLoaded: number;
  households: number;
  /** Households with more than one row. */
  duplicateGroups: number;
  /** Total rows that belong to duplicate groups. */
  duplicateRows: number;
  /** Rows with an invalid visit date or in a household with no email and no phone. */
  rowsWithIssues: number;
  invalidDates: number;
  noContact: number;
}

/** Body of POST /api/guests: one upload's rows, original values in input order. */
export interface UploadBody {
  fileName: string;
  records: GuestRecord[];
}

/** An upload as GET /api/guests returns it. */
export interface SavedUpload extends UploadBody {
  /** ISO 8601 UTC timestamp, e.g. "2026-10-05T18:31:00.000Z". */
  uploadedAt: string;
}

/** Everything the page needs after processing one CSV file. */
export interface BoardResult {
  mapping: ColumnMapping;
  rows: GuestRow[];
  households: Household[];
  summary: Summary;
  /** Papa Parse row-level errors, as readable messages (e.g. "Row 12: Too few fields"). */
  parseErrors: string[];
}
