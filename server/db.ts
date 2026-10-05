// Neon over HTTP: one fetch per query or batch, which suits serverless functions.

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';

let db: NeonHttpDatabase | undefined;

/** Created on first use so the app still starts (and tests still run) without DATABASE_URL. */
export function getDb(): NeonHttpDatabase {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new MissingDatabaseUrlError();
  db = drizzle({ client: neon(url) });
  return db;
}

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super('DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.');
    this.name = 'MissingDatabaseUrlError';
  }
}
