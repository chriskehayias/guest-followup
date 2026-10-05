import { describe, expect, it } from 'vitest';
import { MAX_ROWS, parseUploadBody, POST } from './guestsApi.ts';
import { COLUMNS } from '../src/lib/types.ts';
import type { GuestRecord } from '../src/lib/types.ts';

function record(overrides: Partial<GuestRecord> = {}): GuestRecord {
  const out = Object.fromEntries(COLUMNS.map((c) => [c, ''])) as GuestRecord;
  return { ...out, 'First Name': 'Ann', 'Last Name': 'Lee', 'Visit Date': '2026-09-13', ...overrides };
}

describe('parseUploadBody', () => {
  it('keeps values exactly as typed, including spaces and invalid dates', () => {
    const r = record({ Email: '  Ann.Lee@Example.com ', 'Visit Date': '2026-09-31' });
    expect(parseUploadBody({ fileName: 'guests.csv', records: [r] })).toEqual({ fileName: 'guests.csv', records: [r] });
  });

  it('fills missing columns with blanks and drops unknown keys', () => {
    const result = parseUploadBody({ fileName: 'g.csv', records: [{ 'First Name': 'Ann', Nickname: 'Annie' }] });
    expect(result).toEqual({ fileName: 'g.csv', records: [{ ...record(), 'Last Name': '', 'Visit Date': '' }] });
  });

  it.each<[string, unknown]>([
    ['not an object', [record()]],
    ['blank file name', { fileName: '  ', records: [record()] }],
    ['long file name', { fileName: `${'x'.repeat(252)}.csv`, records: [record()] }],
    ['no rows', { fileName: 'g.csv', records: [] }],
    ['records not an array', { fileName: 'g.csv', records: record() }],
    ['a row that is not an object', { fileName: 'g.csv', records: [record(), 'Ann,Lee'] }],
    ['a non-string value', { fileName: 'g.csv', records: [{ ...record(), Adults: 2 }] }],
    ['a NUL character', { fileName: 'g.csv', records: [record({ City: 'Louis\0ville' })] }],
    ['too many rows', { fileName: 'g.csv', records: Array.from({ length: MAX_ROWS + 1 }, () => record()) }],
  ])('rejects %s', (_, body) => {
    expect(typeof parseUploadBody(body)).toBe('string');
  });
});

describe('POST /api/guests', () => {
  it('answers 400 for a bad body before touching the database', async () => {
    const response = await POST(new Request('http://localhost/api/guests', { method: 'POST', body: '{"fileName":"g.csv"}' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'records must be a non-empty array.' });
  });

  it('answers 400 for a body that is not JSON', async () => {
    const response = await POST(new Request('http://localhost/api/guests', { method: 'POST', body: 'First Name,Last Name' }));
    expect(response.status).toBe(400);
  });
});
