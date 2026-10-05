// /api/guests: GET returns the latest upload, POST saves a new one.
// Web-standard Request -> Response handlers: Vercel runs them from api/guests.ts,
// and vite.config.ts mounts them on the dev and preview servers.

import { asc, desc, eq } from 'drizzle-orm';
import { COLUMNS } from '../src/lib/types.ts';
import type { GuestRecord, SavedUpload, UploadBody } from '../src/lib/types.ts';
import { getDb, MissingDatabaseUrlError } from './db.ts';
import { FIELD_FOR_COLUMN, guests, uploads } from './schema.ts';

/** Well above the PRD's 2,000-row target; stops one request from flooding the database. */
export const MAX_ROWS = 10_000;
const MAX_FILE_NAME = 255;
/** Rows per INSERT: 16 parameters each stays far below Postgres's 65,535 limit. */
const INSERT_CHUNK = 1_000;

export async function GET(): Promise<Response> {
  try {
    const db = getDb();
    const [upload] = await db.select().from(uploads).orderBy(desc(uploads.uploadedAt)).limit(1);
    if (!upload) return json({ upload: null });
    const rows = await db
      .select()
      .from(guests)
      .where(eq(guests.uploadId, upload.id))
      .orderBy(asc(guests.rowIndex));
    const saved: SavedUpload = {
      fileName: upload.fileName,
      uploadedAt: upload.uploadedAt.toISOString(),
      records: rows.map(toRecord),
    };
    return json({ upload: saved });
  } catch (err) {
    return serverError('GET', err);
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'The request body must be JSON.' }, 400);
  }
  const upload = parseUploadBody(body);
  if (typeof upload === 'string') return json({ error: upload }, 400);

  try {
    const db = getDb();
    const uploadId = crypto.randomUUID();
    const values = upload.records.map((record, rowIndex) => ({ uploadId, rowIndex, ...toFields(record) }));
    // A Neon HTTP batch runs as one transaction: the upload and its rows are saved together or not at all.
    await db.batch([
      db.insert(uploads).values({ id: uploadId, fileName: upload.fileName, rowCount: values.length }),
      ...chunks(values, INSERT_CHUNK).map((part) => db.insert(guests).values(part)),
    ]);
    return json({ id: uploadId, rowCount: values.length }, 201);
  } catch (err) {
    return serverError('POST', err);
  }
}

/** Checks a POST body. Returns the cleaned upload, or a message for a 400 response. */
export function parseUploadBody(body: unknown): UploadBody | string {
  if (!isObject(body)) return 'Expected a JSON object with fileName and records.';
  const { fileName, records } = body;
  if (typeof fileName !== 'string' || fileName.trim() === '') return 'fileName must be a non-empty string.';
  if (fileName.length > MAX_FILE_NAME) return `fileName must be at most ${MAX_FILE_NAME} characters.`;
  if (!Array.isArray(records) || records.length === 0) return 'records must be a non-empty array.';
  if (records.length > MAX_ROWS) {
    return `Too many rows (${records.length.toLocaleString('en-US')}); the limit is ${MAX_ROWS.toLocaleString('en-US')}.`;
  }

  const clean: GuestRecord[] = [];
  for (const [i, record] of records.entries()) {
    if (!isObject(record)) return `records[${i}] must be an object.`;
    const out = {} as GuestRecord;
    for (const column of COLUMNS) {
      // A missing column is blank, as in the CSV; anything else must already be a string.
      const value = record[column] ?? '';
      if (typeof value !== 'string') return `records[${i}]["${column}"] must be a string.`;
      if (value.includes('\0')) return `records[${i}]["${column}"] contains a NUL character.`;
      out[column] = value;
    }
    clean.push(out);
  }
  return { fileName, records: clean };
}

function toFields(record: GuestRecord) {
  return Object.fromEntries(COLUMNS.map((c) => [FIELD_FOR_COLUMN[c], record[c]])) as Record<
    (typeof FIELD_FOR_COLUMN)[keyof typeof FIELD_FOR_COLUMN],
    string
  >;
}

function toRecord(row: typeof guests.$inferSelect): GuestRecord {
  return Object.fromEntries(COLUMNS.map((c) => [c, row[FIELD_FOR_COLUMN[c]]])) as GuestRecord;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function json(data: unknown, status = 200): Response {
  // Guest data: never cache it in a browser or CDN.
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function serverError(method: string, err: unknown): Response {
  if (err instanceof MissingDatabaseUrlError) return json({ error: err.message }, 503);
  // Drizzle's own message lists the query parameters, which are guest data,
  // so only the driver's underlying reason goes to the log.
  const reason = err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err);
  console.error(`${method} /api/guests failed: ${reason}`);
  return json({ error: 'The database request failed. Check the server log for details.' }, 500);
}
