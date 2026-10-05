// The app's only network calls: our own /api/guests endpoint (server/guestsApi.ts).

import type { GuestRecord, SavedUpload, UploadBody } from './lib/types.ts';

/** The most recent upload, or null if nothing has been saved yet. */
export async function fetchLatestUpload(): Promise<SavedUpload | null> {
  const data = await request('GET');
  if (!isObject(data) || !('upload' in data)) throw new Error('Unexpected response from the server.');
  return data.upload as SavedUpload | null;
}

/** Saves one upload's rows (original values, input order). */
export async function saveUpload(fileName: string, records: GuestRecord[]): Promise<void> {
  const body: UploadBody = { fileName, records };
  await request('POST', body);
}

async function request(method: 'GET' | 'POST', body?: UploadBody): Promise<unknown> {
  const response = await fetch('/api/guests', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      isObject(data) && typeof data.error === 'string'
        ? data.error
        : `The server answered ${response.status} ${response.statusText}.`,
    );
  }
  return data;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
